import { describe, expect, it } from 'vitest';
import { forcesForRange, partitionParticles } from '../src/sim/forces';
import { mulberry32 } from '../src/sim/rng';
import { DEFAULT_PHYSICS } from '../src/sim/types';
import { World } from '../src/sim/world';

function world(seed: number, n: number, species: number, w: number, h: number, clustered = false) {
  const rng = mulberry32(seed);
  const wd = new World(w, h);
  const m: number[] = [];
  for (let i = 0; i < species * species; i++) m.push(Math.round((rng() * 2 - 1) * 100) / 100);
  wd.setMatrix(species, m);
  wd.reseed(Array.from({ length: species }, () => Math.floor(n / species)), clustered ? 'clusters' : 'random', rng);
  return { wd, rng };
}

describe('parallel force pass', () => {
  it('forcesForCells over all cells equals the symmetric single-thread pass', () => {
    for (const clustered of [false, true]) {
      const { wd, rng } = world(12, 1200, 5, 900, 600, clustered);
      const opt = { physics: { ...DEFAULT_PHYSICS, rMax: 85 }, bonds: true };
      const rMax = wd.prepareStep(opt, rng);
      expect(wd.grid.simpleWrap).toBe(true);
      const bondN = wd.computePairs(rMax, opt.physics.beta, true);
      const out = forcesForRange(
        { x: wd.x, y: wd.y, sp: wd.sp, grid: wd.grid, species: wd.species, matrix: wd.matrix, rMax, beta: opt.physics.beta, bonds: true },
        0,
        wd.n,
        wd.bondCap,
      );
      expect(out.i0).toBe(0);
      for (let i = 0; i < wd.n; i++) {
        expect(out.fx[i]).toBeCloseTo(wd.fx[i]!, 3);
        expect(out.fy[i]).toBeCloseTo(wd.fy[i]!, 3);
      }
      // same bonds (as unordered pairs)
      expect(out.bondN).toBe(bondN);
      const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
      const ref = new Set<string>();
      for (let k = 0; k < bondN; k++) ref.add(key(wd.bondI[k]!, wd.bondJ[k]!));
      for (let k = 0; k < out.bondN; k++) expect(ref.has(key(out.bondI[k]!, out.bondJ[k]!))).toBe(true);
    }
  });

  it('splits even a single dense cluster into balanced chunks', () => {
    const wd = new World(600, 600);
    wd.setMatrix(1, [1]);
    wd.reseed([2000], 'random', mulberry32(4));
    for (let i = 0; i < wd.n; i++) {
      wd.x[i] = 300 + (i % 40);
      wd.y[i] = 300 + Math.floor(i / 40) * 0.5;
    }
    wd.sortByCell(90);
    const b = partitionParticles(wd.grid, wd.n, 6);
    expect(b).toHaveLength(7);
    for (let k = 1; k < b.length; k++) expect(b[k]! - b[k - 1]!).toBeGreaterThan(200);
  });

  it('chunks computed separately add up to the whole', () => {
    const { wd, rng } = world(3, 900, 3, 700, 500, true);
    const opt = { physics: DEFAULT_PHYSICS };
    const rMax = wd.prepareStep(opt, rng);
    const bounds = partitionParticles(wd.grid, wd.n, 7);
    expect(bounds[0]).toBe(0);
    expect(bounds[bounds.length - 1]).toBe(wd.n);
    expect(bounds.length).toBeGreaterThan(4);
    for (let k = 1; k < bounds.length; k++) expect(bounds[k]!).toBeGreaterThan(bounds[k - 1]!);
    const fx = new Float32Array(wd.n);
    for (let k = 0; k + 1 < bounds.length; k++) {
      const out = forcesForRange(
        { x: wd.x, y: wd.y, sp: wd.sp, grid: wd.grid, species: wd.species, matrix: wd.matrix, rMax, beta: opt.physics.beta, bonds: false },
        bounds[k]!,
        bounds[k + 1]!,
      );
      fx.set(out.fx, out.i0);
    }
    wd.computePairs(rMax, opt.physics.beta, false);
    for (let i = 0; i < wd.n; i++) expect(fx[i]).toBeCloseTo(wd.fx[i]!, 3);
  });
});
