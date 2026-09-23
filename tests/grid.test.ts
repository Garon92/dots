import { describe, expect, it } from 'vitest';
import { TorusGrid } from '../src/sim/grid';
import { mulberry32 } from '../src/sim/rng';

function sorted(g: TorusGrid, xs: number[], ys: number[]) {
  const n = xs.length;
  const x = Float32Array.from(xs);
  const y = Float32Array.from(ys);
  const cellOf = new Int32Array(n);
  g.count(x, y, n, cellOf);
  const cur = g.cellStart.slice(0, g.cellCount);
  const x2 = new Float32Array(n);
  const y2 = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = cur[cellOf[i]!]!++;
    x2[k] = x[i]!;
    y2[k] = y[i]!;
  }
  return { x: x2, y: y2, n };
}

function brute(x: Float32Array, y: Float32Array, n: number, w: number, h: number, qx: number, qy: number, r: number) {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    let dx = Math.abs(x[i]! - qx);
    let dy = Math.abs(y[i]! - qy);
    dx = Math.min(dx, w - dx);
    dy = Math.min(dy, h - dy);
    if (dx * dx + dy * dy <= r * r) out.push(i);
  }
  return out;
}

describe('TorusGrid', () => {
  it('uses cells at least as large as the interaction radius', () => {
    const g = new TorusGrid();
    g.configure(1000, 600, 92);
    expect(g.cols).toBe(10);
    expect(g.rows).toBe(6);
    expect(g.cellW).toBeGreaterThanOrEqual(92);
    expect(g.cellH).toBeGreaterThanOrEqual(92);
  });

  it('visits every adjacent cell pair exactly once via forward neighbours', () => {
    for (const [w, h] of [
      [1000, 600],
      [300, 300],
      [200, 950],
      [90, 90],
      [185, 400],
    ] as const) {
      const g = new TorusGrid();
      g.configure(w, h, 92);
      const pairs = new Map<string, number>();
      for (let c = 0; c < g.cellCount; c++) {
        for (let k = g.fwdStart[c]!; k < g.fwdStart[c + 1]!; k++) {
          const d = g.fwdCells[k]!;
          expect(d).toBeGreaterThan(c);
          const key = `${c}-${d}`;
          pairs.set(key, (pairs.get(key) ?? 0) + 1);
        }
      }
      for (const v of pairs.values()) expect(v).toBe(1);
      // every distinct neighbour relation is covered from one side
      for (let c = 0; c < g.cellCount; c++) {
        for (let k = g.nbStart[c]!; k < g.nbStart[c + 1]!; k++) {
          const d = g.nbCells[k]!;
          if (d === c) continue;
          const key = c < d ? `${c}-${d}` : `${d}-${c}`;
          expect(pairs.has(key)).toBe(true);
        }
      }
    }
  });

  it('finds the same neighbours as a brute-force torus search, including across the seam', () => {
    const rng = mulberry32(7);
    const w = 800;
    const h = 500;
    const n = 1500;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < n; i++) {
      xs.push(rng() * w);
      ys.push(rng() * h);
    }
    const g = new TorusGrid();
    g.configure(w, h, 90);
    const s = sorted(g, xs, ys);
    const queries: [number, number][] = [
      [400, 250],
      [2, 3],
      [799, 499],
      [0, 250],
      [400, 0.5],
    ];
    for (let q = 0; q < 40; q++) queries.push([rng() * w, rng() * h]);
    for (const [qx, qy] of queries) {
      const got = g.query(s.x, s.y, s.n, qx, qy, 90).sort((a, b) => a - b);
      const exp = brute(s.x, s.y, s.n, w, h, qx, qy, 90);
      expect(got).toEqual(exp);
    }
  });

  it('counting sort groups particles by cell', () => {
    const g = new TorusGrid();
    g.configure(400, 400, 100);
    const s = sorted(g, [10, 390, 150, 20, 399.9], [10, 390, 150, 30, 0]);
    for (let c = 0; c < g.cellCount; c++) {
      for (let i = g.cellStart[c]!; i < g.cellStart[c + 1]!; i++) expect(g.cellOf(s.x[i]!, s.y[i]!)).toBe(c);
    }
    expect(g.cellStart[g.cellCount]).toBe(5);
  });
});
