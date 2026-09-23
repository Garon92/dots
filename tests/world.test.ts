import { describe, expect, it } from 'vitest';
import { force } from '../src/sim/force';
import { mulberry32 } from '../src/sim/rng';
import { DEFAULT_PHYSICS } from '../src/sim/types';
import { World } from '../src/sim/world';

/** Reference O(n²) force computation with torus minimum-image distances. */
function bruteForces(w: World, rMax: number, beta: number) {
  const fx = new Float64Array(w.n);
  const fy = new Float64Array(w.n);
  for (let i = 0; i < w.n; i++) {
    for (let j = 0; j < w.n; j++) {
      if (i === j) continue;
      let dx = w.x[j]! - w.x[i]!;
      let dy = w.y[j]! - w.y[i]!;
      if (dx > w.w / 2) dx -= w.w;
      else if (dx < -w.w / 2) dx += w.w;
      if (dy > w.h / 2) dy -= w.h;
      else if (dy < -w.h / 2) dy += w.h;
      const d = Math.hypot(dx, dy);
      if (d >= rMax || d === 0) continue;
      const f = force(d / rMax, w.matrix[w.sp[i]! * w.species + w.sp[j]!]!, beta);
      fx[i]! += (dx / d) * f;
      fy[i]! += (dy / d) * f;
    }
  }
  return { fx, fy };
}

function makeWorld(seed: number, n = 600, species = 4, w = 700, h = 450) {
  const rng = mulberry32(seed);
  const world = new World(w, h);
  const m: number[] = [];
  for (let i = 0; i < species * species; i++) m.push(rng() * 2 - 1);
  world.setMatrix(species, m);
  const counts = Array.from({ length: species }, () => Math.floor(n / species));
  world.reseed(counts, 'random', rng);
  return { world, rng };
}

describe('World.step', () => {
  it('computes the same velocities as a brute-force O(n²) reference (torus aware)', () => {
    const { world, rng } = makeWorld(3);
    const p = { ...DEFAULT_PHYSICS, rMax: 80, friction: 0.8 };
    // zero velocities so the new velocity is exactly force * scale * friction
    world.vx.fill(0);
    world.vy.fill(0);
    world.sortByCell(p.rMax);
    const ref = bruteForces(world, p.rMax, p.beta);
    world.step({ physics: p }, rng);
    // step() re-sorts – sorting is deterministic for unchanged positions, so indices still match
    const k = p.force * p.dt * p.friction;
    let checked = 0;
    for (let i = 0; i < world.n; i++) {
      const ex = ref.fx[i]! * k;
      const ey = ref.fy[i]! * k;
      expect(world.vx[i]!).toBeCloseTo(ex, 3);
      expect(world.vy[i]!).toBeCloseTo(ey, 3);
      checked++;
    }
    expect(checked).toBe(world.n);
  });

  it('matches the reference in tiny worlds (generic wrap path, < 3 cells per axis)', () => {
    for (const [w, h] of [
      [200, 150],
      [170, 330],
    ] as const) {
      const { world, rng } = makeWorld(8, 160, 3, w, h);
      const p = { ...DEFAULT_PHYSICS, rMax: 80, friction: 0.8 };
      const rMax = Math.min(p.rMax, w / 2, h / 2);
      world.vx.fill(0);
      world.vy.fill(0);
      world.sortByCell(rMax);
      expect(world.grid.simpleWrap).toBe(false);
      const ref = bruteForces(world, rMax, p.beta);
      world.step({ physics: p }, rng);
      const k = p.force * p.dt * p.friction;
      for (let i = 0; i < world.n; i++) {
        expect(world.vx[i]!).toBeCloseTo(ref.fx[i]! * k, 3);
        expect(world.vy[i]!).toBeCloseTo(ref.fy[i]! * k, 3);
      }
    }
  });

  it('keeps every particle inside the torus and conserves the count', () => {
    const { world, rng } = makeWorld(11, 800, 6);
    for (let s = 0; s < 60; s++) world.step({ physics: DEFAULT_PHYSICS }, rng);
    expect(world.n).toBe(798);
    for (let i = 0; i < world.n; i++) {
      expect(world.x[i]).toBeGreaterThanOrEqual(0);
      expect(world.x[i]).toBeLessThan(world.w);
      expect(world.y[i]).toBeGreaterThanOrEqual(0);
      expect(world.y[i]).toBeLessThan(world.h);
      expect(Number.isFinite(world.vx[i]!)).toBe(true);
    }
  });

  it('attracting pairs across the seam move towards each other', () => {
    const world = new World(500, 500);
    world.setMatrix(2, [1, 1, 1, 1]);
    world.reseed([1, 1], 'random', mulberry32(1));
    world.x[0] = 5;
    world.y[0] = 250;
    world.x[1] = 455; // 50 units away through the left/right seam
    world.y[1] = 250;
    world.vx.fill(0);
    world.vy.fill(0);
    world.step({ physics: { ...DEFAULT_PHYSICS, rMax: 92 } }, mulberry32(2));
    const a = world.sp[0] === 0 ? 0 : 1;
    const b = 1 - a;
    // particle at x≈5 is pulled towards −x (through the seam), the other towards +x
    expect(world.vx[a]!).toBeLessThan(0);
    expect(world.vx[b]!).toBeGreaterThan(0);
  });

  it('collects bonds between mutually attracted neighbours', () => {
    const { world, rng } = makeWorld(5, 500, 2, 300, 300);
    world.setMatrix(2, [1, 1, 1, 1]);
    world.step({ physics: DEFAULT_PHYSICS, bonds: true }, rng);
    expect(world.bondN).toBeGreaterThan(0);
    for (let k = 0; k < world.bondN; k++) expect(world.bondBuf[k * 6 + 4]).toBeGreaterThan(0);
  });
});

describe('World population', () => {
  it('setCounts removes evenly from each species and adds near members', () => {
    const { world, rng } = makeWorld(9, 1200, 4);
    world.setCounts([100, 300, 500, 0], rng);
    expect(Array.from(world.counts.subarray(0, 4))).toEqual([100, 300, 500, 0]);
    expect(world.n).toBe(900);
  });
  it('removal is spatially uniform (not biased to array order)', () => {
    const { world, rng } = makeWorld(21, 4000, 1, 1000, 1000);
    world.sortByCell(100); // arrays now ordered top-to-bottom
    world.setCounts([2000], rng);
    let top = 0;
    for (let i = 0; i < world.n; i++) if (world.y[i]! < 500) top++;
    expect(top / world.n).toBeGreaterThan(0.44);
    expect(top / world.n).toBeLessThan(0.56);
  });
  it('truncateSpecies drops the removed species', () => {
    const { world } = makeWorld(4, 600, 6);
    world.truncateSpecies(3);
    expect(world.n).toBe(300);
    for (let i = 0; i < world.n; i++) expect(world.sp[i]).toBeLessThan(3);
  });
  it('every layout places particles inside the world', () => {
    for (const layout of ['random', 'disc', 'rings', 'stripes', 'clusters', 'spiral'] as const) {
      const world = new World(640, 360);
      world.reseed([200, 200, 200], layout, mulberry32(1));
      expect(world.n).toBe(600);
      for (let i = 0; i < world.n; i++) {
        expect(world.x[i]).toBeGreaterThanOrEqual(0);
        expect(world.x[i]).toBeLessThan(640);
        expect(world.y[i]).toBeGreaterThanOrEqual(0);
        expect(world.y[i]).toBeLessThan(360);
      }
    }
  });
  it('resize keeps relative positions', () => {
    const { world } = makeWorld(2, 100, 2, 400, 400);
    const x0 = world.x[0]!;
    world.resize(800, 200);
    expect(world.x[0]).toBeCloseTo(x0 * 2, 3);
  });
});
