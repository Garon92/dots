import type { TorusGrid } from './grid';

export interface RangeInput {
  x: Float32Array;
  y: Float32Array;
  sp: Uint8Array;
  /** Configured grid whose cellStart matches the (cell-sorted) arrays. Must be `simpleWrap`. */
  grid: TorusGrid;
  species: number;
  matrix: Float32Array;
  rMax: number;
  beta: number;
  bonds: boolean;
}

export interface RangeOutput {
  /** Index of the first particle of the range. */
  i0: number;
  fx: Float32Array;
  fy: Float32Array;
  bondN: number;
  bondI: Int32Array;
  bondJ: Int32Array;
  bondW: Float32Array;
}

/**
 * Forces on the particles [i0, i1) (the arrays are sorted by grid cell), summed over the full
 * 3 × 3 neighbourhood of each particle's cell. Unlike the symmetric single-thread pass this never
 * writes to other particles, so disjoint ranges can be computed in parallel (helper workers) –
 * even inside one huge cluster. Every pair is evaluated twice overall; bonds are recorded only
 * from the lower index so they are not duplicated.
 */
export function forcesForRange(inp: RangeInput, i0: number, i1: number, bondCap = 0): RangeOutput {
  const { x, y, sp, grid, matrix: M, species: S, rMax, beta } = inp;
  const start = grid.cellStart;
  const nbStart = grid.nbStart;
  const nbCells = grid.nbCells;
  const nbShift = grid.nbShift;
  const fx = new Float32Array(Math.max(0, i1 - i0));
  const fy = new Float32Array(Math.max(0, i1 - i0));
  const collect = inp.bonds && bondCap > 0;
  const bondI = new Int32Array(collect ? bondCap : 0);
  const bondJ = new Int32Array(collect ? bondCap : 0);
  const bondW = new Float32Array(collect ? bondCap : 0);
  let bondN = 0;
  const rMax2 = rMax * rMax;
  const invR = 1 / rMax;
  const invBeta = 1 / beta;
  const invBand = 1 / (1 - beta);
  const bondR2 = rMax * 0.62 * (rMax * 0.62);
  const invBondR2 = 1 / bondR2;

  // walk the cells overlapping the range
  let c = grid.cellOf(x[i0] ?? 0, y[i0] ?? 0);
  while (c > 0 && start[c] > i0) c--;
  while (start[c + 1] <= i0) c++;
  for (let i = i0; i < i1; i++) {
    while (start[c + 1] <= i) c++;
    const xi = x[i];
    const yi = y[i];
    const si = sp[i];
    const rowI = si * S;
    let fxi = 0;
    let fyi = 0;
    const k1 = nbStart[c + 1];
    for (let k = nbStart[c]; k < k1; k++) {
      const d = nbCells[k];
      const ox = nbShift[k * 2] - xi;
      const oy = nbShift[k * 2 + 1] - yi;
      const t1 = start[d + 1];
      for (let j = start[d]; j < t1; j++) {
        if (j === i) continue;
        const dx = x[j] + ox;
        const dy = y[j] + oy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= rMax2 || d2 === 0) continue;
        const dist = Math.sqrt(d2);
        const r = dist * invR;
        const sj = sp[j];
        let f: number;
        if (r < beta) f = r * invBeta - 1;
        else f = M[rowI + sj] * (1 - Math.abs(2 * r - 1 - beta) * invBand);
        const inv = f / dist;
        fxi += dx * inv;
        fyi += dy * inv;
        if (collect && j > i && d2 < bondR2 && bondN < bondCap) {
          const mutual = M[rowI + sj] + M[sj * S + si];
          if (mutual > 0.35) {
            bondI[bondN] = i;
            bondJ[bondN] = j;
            bondW[bondN] = (1 - d2 * invBondR2) * (mutual > 2 ? 1 : mutual * 0.5);
            bondN++;
          }
        }
      }
    }
    fx[i - i0] = fxi;
    fy[i - i0] = fyi;
  }
  return { i0, fx, fy, bondN, bondI, bondJ, bondW };
}

/**
 * Split the particles into `parts` contiguous index ranges of roughly equal work. The work of a
 * particle is the number of particles in its cell's neighbourhood, so dense clusters are split
 * finely (even inside a single cell). Returns the boundaries [0, …, n].
 */
export function partitionParticles(grid: TorusGrid, n: number, parts: number): number[] {
  const nc = grid.cellCount;
  const start = grid.cellStart;
  const around = new Float64Array(nc);
  let totalWork = 0;
  for (let c = 0; c < nc; c++) {
    const own = start[c + 1] - start[c];
    if (own === 0) continue;
    let a = 1;
    for (let k = grid.nbStart[c]; k < grid.nbStart[c + 1]; k++) {
      const d = grid.nbCells[k];
      a += start[d + 1] - start[d];
    }
    around[c] = a;
    totalWork += own * a;
  }
  const bounds = [0];
  if (n === 0) return [0, 0];
  const per = totalWork / parts;
  let acc = 0;
  for (let c = 0; c < nc && bounds.length < parts; c++) {
    const own = start[c + 1] - start[c];
    if (own === 0) continue;
    const a = around[c];
    let i = start[c];
    while (bounds.length < parts) {
      const target = per * bounds.length;
      const left = start[c + 1] - i;
      if (acc + left * a < target) {
        acc += left * a;
        break;
      }
      const take = Math.max(1, Math.ceil((target - acc) / a));
      i += take;
      acc += take * a;
      if (i >= start[c + 1]) break;
      bounds.push(i);
    }
  }
  bounds.push(n);
  return bounds.filter((b, k) => k === 0 || b > bounds[k - 1]);
}
