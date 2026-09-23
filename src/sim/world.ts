import { TorusGrid } from './grid';
import { type Rng, gauss } from './rng';
import { type Brush, type Layout, type Physics, MAX_SPECIES } from './types';

/** Floats per bond in the bond output buffer: x1, y1, x2, y2, weight, packed species (si * 8 + sj). */
export const BOND_STRIDE = 6;

export interface StepOptions {
  physics: Physics;
  brushes?: readonly Brush[];
  /** Collect "living web" bonds during the last step. */
  bonds?: boolean;
}

/**
 * The particle world: structure-of-arrays storage, a toroidal spatial grid and the step function.
 *
 * Every step the particles are physically re-ordered by grid cell (counting sort). Neighbouring
 * particles are then neighbours in memory, which keeps the pair loop cache friendly, and each
 * unordered pair is visited only once (forces for both sides from one distance computation).
 */
export class World {
  w: number;
  h: number;
  n = 0;
  cap = 0;
  species = 6;
  /** Row a, column b: how strongly a is pulled towards b. Length species². */
  matrix = new Float32Array(36);

  x = new Float32Array(0);
  y = new Float32Array(0);
  vx = new Float32Array(0);
  vy = new Float32Array(0);
  sp = new Uint8Array(0);
  /** Accumulated forces of the current step (filled by the pair pass or parallel helpers). */
  fx = new Float32Array(0);
  fy = new Float32Array(0);
  // scratch for the counting sort
  private x2 = new Float32Array(0);
  private y2 = new Float32Array(0);
  private vx2 = new Float32Array(0);
  private vy2 = new Float32Array(0);
  private sp2 = new Uint8Array(0);
  private cellOf = new Int32Array(0);

  readonly grid = new TorusGrid();

  // bonds ("living web")
  bondCap = 0;
  bondN = 0;
  bondI = new Int32Array(0);
  bondJ = new Int32Array(0);
  bondW = new Float32Array(0);
  bondBuf = new Float32Array(0);

  /** Mean squared speed after the last step. */
  kinetic = 0;
  /** Particles per species (kept up to date by all mutating operations). */
  counts = new Int32Array(MAX_SPECIES);

  constructor(w: number, h: number, capacity = 1024) {
    this.w = w;
    this.h = h;
    this.ensureCapacity(capacity);
  }

  ensureCapacity(cap: number): void {
    if (cap <= this.cap) return;
    const c = Math.max(cap, Math.ceil(this.cap * 1.5), 256);
    const growF = (a: Float32Array) => {
      const b = new Float32Array(c);
      b.set(a.subarray(0, this.n));
      return b;
    };
    this.x = growF(this.x);
    this.y = growF(this.y);
    this.vx = growF(this.vx);
    this.vy = growF(this.vy);
    const s = new Uint8Array(c);
    s.set(this.sp.subarray(0, this.n));
    this.sp = s;
    this.fx = new Float32Array(c);
    this.fy = new Float32Array(c);
    this.x2 = new Float32Array(c);
    this.y2 = new Float32Array(c);
    this.vx2 = new Float32Array(c);
    this.vy2 = new Float32Array(c);
    this.sp2 = new Uint8Array(c);
    this.cellOf = new Int32Array(c);
    this.cap = c;
  }

  setMatrix(species: number, m: ArrayLike<number>): void {
    if (species !== this.species) this.species = species;
    if (this.matrix.length !== species * species) this.matrix = new Float32Array(species * species);
    for (let i = 0; i < species * species; i++) this.matrix[i] = m[i] ?? 0;
  }

  /** Rescale the world, keeping the relative positions of all particles. */
  resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    const sx = w / this.w;
    const sy = h / this.h;
    for (let i = 0; i < this.n; i++) {
      this.x[i] = Math.min(this.x[i] * sx, w - 1e-3);
      this.y[i] = Math.min(this.y[i] * sy, h - 1e-3);
    }
    this.w = w;
    this.h = h;
  }

  recount(): void {
    this.counts.fill(0);
    for (let i = 0; i < this.n; i++) this.counts[this.sp[i]]++;
  }

  // ------------------------------------------------------------------ population

  /** Remove every particle and scatter new ones according to a layout. */
  reseed(counts: readonly number[], layout: Layout, rng: Rng): void {
    const species = Math.min(counts.length, MAX_SPECIES);
    let total = 0;
    for (let s = 0; s < species; s++) total += Math.max(0, Math.floor(counts[s]));
    this.ensureCapacity(total);
    this.n = 0;
    const { w, h } = this;
    const cx = w / 2;
    const cy = h / 2;
    const minSide = Math.min(w, h);
    // cluster centres for the "clusters" layout
    const centres: [number, number][] = [];
    for (let s = 0; s < species; s++) centres.push([rng() * w, rng() * h]);
    let k = 0;
    for (let s = 0; s < species; s++) {
      const c = Math.max(0, Math.floor(counts[s]));
      for (let j = 0; j < c; j++) {
        let x: number;
        let y: number;
        switch (layout) {
          case 'disc': {
            const a = rng() * Math.PI * 2;
            const r = Math.sqrt(rng()) * minSide * 0.36;
            x = cx + Math.cos(a) * r;
            y = cy + Math.sin(a) * r;
            break;
          }
          case 'rings': {
            const a = rng() * Math.PI * 2;
            const r = minSide * (0.08 + (0.36 * (s + 0.5)) / species) + gauss(rng) * minSide * 0.012;
            x = cx + Math.cos(a) * r;
            y = cy + Math.sin(a) * r;
            break;
          }
          case 'stripes': {
            x = ((s + rng()) / species) * w;
            y = rng() * h;
            break;
          }
          case 'clusters': {
            const [ox, oy] = centres[s];
            const r = minSide * 0.09;
            x = ox + gauss(rng) * r;
            y = oy + gauss(rng) * r;
            break;
          }
          case 'spiral': {
            const t = rng();
            const arm = s / species;
            const a = (arm + t * 1.6) * Math.PI * 2;
            const r = t * minSide * 0.44;
            x = cx + Math.cos(a) * r + gauss(rng) * minSide * 0.015;
            y = cy + Math.sin(a) * r + gauss(rng) * minSide * 0.015;
            break;
          }
          default:
            x = rng() * w;
            y = rng() * h;
        }
        this.x[k] = wrap(x, w);
        this.y[k] = wrap(y, h);
        this.vx[k] = (rng() - 0.5) * 2;
        this.vy[k] = (rng() - 0.5) * 2;
        this.sp[k] = s;
        k++;
      }
    }
    this.n = k;
    this.recount();
  }

  /** Add or remove particles so each species matches `counts`. Removal picks random members. */
  setCounts(counts: readonly number[], rng: Rng): void {
    this.recount();
    // 1) removals
    const remove = new Int32Array(MAX_SPECIES);
    let anyRemove = false;
    for (let s = 0; s < MAX_SPECIES; s++) {
      const want = s < counts.length ? Math.max(0, Math.floor(counts[s])) : 0;
      if (this.counts[s] > want) {
        remove[s] = this.counts[s] - want;
        anyRemove = true;
      }
    }
    if (anyRemove) {
      // probability-based selection gives a spatially uniform thinning in one pass
      const left = Int32Array.from(this.counts);
      let w = 0;
      for (let i = 0; i < this.n; i++) {
        const s = this.sp[i];
        if (remove[s] > 0 && rng() * left[s] < remove[s]) {
          remove[s]--;
          left[s]--;
          continue;
        }
        left[s]--;
        if (w !== i) this.copy(i, w);
        w++;
      }
      this.n = w;
    }
    this.recount();
    // 2) additions: spawn near random existing members (keeps structures), else anywhere
    let add = 0;
    for (let s = 0; s < counts.length && s < MAX_SPECIES; s++) add += Math.max(0, Math.floor(counts[s]) - this.counts[s]);
    if (add > 0) {
      this.ensureCapacity(this.n + add);
      const members: number[][] = [];
      for (let s = 0; s < MAX_SPECIES; s++) members.push([]);
      for (let i = 0; i < this.n; i++) {
        const m = members[this.sp[i]];
        if (m.length < 256) m.push(i);
      }
      for (let s = 0; s < counts.length && s < MAX_SPECIES; s++) {
        let need = Math.max(0, Math.floor(counts[s]) - this.counts[s]);
        const m = members[s];
        while (need-- > 0) {
          if (m.length > 0) {
            const src = m[(rng() * m.length) | 0];
            this.push(this.x[src] + gauss(rng) * 18, this.y[src] + gauss(rng) * 18, s, rng);
          } else {
            this.push(rng() * this.w, rng() * this.h, s, rng);
          }
        }
      }
    }
    this.recount();
  }

  /** Drop all particles whose species ≥ `species`. */
  truncateSpecies(species: number): void {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.sp[i] >= species) continue;
      if (w !== i) this.copy(i, w);
      w++;
    }
    this.n = w;
    this.recount();
  }

  push(x: number, y: number, s: number, rng: Rng): void {
    this.ensureCapacity(this.n + 1);
    const k = this.n++;
    this.x[k] = wrap(x, this.w);
    this.y[k] = wrap(y, this.h);
    this.vx[k] = (rng() - 0.5) * 0.5;
    this.vy[k] = (rng() - 0.5) * 0.5;
    this.sp[k] = s;
    this.counts[s]++;
  }

  private copy(from: number, to: number): void {
    this.x[to] = this.x[from];
    this.y[to] = this.y[from];
    this.vx[to] = this.vx[from];
    this.vy[to] = this.vy[from];
    this.sp[to] = this.sp[from];
  }

  /** Give every particle a random kick. */
  shake(amount: number, rng: Rng): void {
    for (let i = 0; i < this.n; i++) {
      this.vx[i] += gauss(rng) * amount;
      this.vy[i] += gauss(rng) * amount;
    }
  }

  // ------------------------------------------------------------------ step

  /** Re-order particles by grid cell (counting sort). Leaves grid.cellStart valid. */
  sortByCell(rMax: number): void {
    const g = this.grid;
    g.configure(this.w, this.h, rMax);
    const n = this.n;
    g.count(this.x, this.y, n, this.cellOf);
    const start = g.cellStart;
    const nc = g.cellCount;
    // cursors: reuse fx as an int scratch would be confusing – allocate lazily sized Int32Array
    const cursor = this.cursor.length >= nc ? this.cursor : (this.cursor = new Int32Array(nc));
    cursor.set(start.subarray(0, nc));
    const { x, y, vx, vy, sp, x2, y2, vx2, vy2, sp2, cellOf } = this;
    for (let i = 0; i < n; i++) {
      const k = cursor[cellOf[i]]++;
      x2[k] = x[i];
      y2[k] = y[i];
      vx2[k] = vx[i];
      vy2[k] = vy[i];
      sp2[k] = sp[i];
    }
    this.x = x2;
    this.x2 = x;
    this.y = y2;
    this.y2 = y;
    this.vx = vx2;
    this.vx2 = vx;
    this.vy = vy2;
    this.vy2 = vy;
    this.sp = sp2;
    this.sp2 = sp;
  }
  private cursor = new Int32Array(0);

  step(opt: StepOptions, rng: Rng): void {
    const rMax = this.prepareStep(opt, rng);
    const bondR2 = rMax * 0.62 * (rMax * 0.62);
    const collect = !!opt.bonds;
    const beta = opt.physics.beta;
    const bondN = this.grid.simpleWrap
      ? this.pairsShifted(rMax, beta, collect, this.bondCap, bondR2)
      : this.pairsWrapped(rMax, beta, collect, this.bondCap, bondR2);
    this.finishStep(opt, rMax, bondN);
  }

  /** Phase 2 on this thread (symmetric pair pass). Returns the number of bonds collected. */
  computePairs(rMax: number, beta: number, bonds: boolean): number {
    const bondR2 = rMax * 0.62 * (rMax * 0.62);
    return this.grid.simpleWrap
      ? this.pairsShifted(rMax, beta, bonds, this.bondCap, bondR2)
      : this.pairsWrapped(rMax, beta, bonds, this.bondCap, bondR2);
  }

  /**
   * Phase 1 of a step: spawn/erase brushes, sort by cell, clear forces, size the bond buffers.
   * Returns the effective interaction radius. After this, forces can be computed by the local
   * pair pass or externally (parallel helpers) into `fx`, `fy` and the bond arrays.
   */
  prepareStep(opt: StepOptions, rng: Rng): number {
    const p = opt.physics;
    const rMax = Math.min(p.rMax, this.w / 2, this.h / 2);
    for (const b of opt.brushes ?? []) {
      if (b.mode === 'spawn') this.applySpawn(b, rng);
      else if (b.mode === 'erase') this.applyErase(b);
    }
    this.sortByCell(rMax);
    const n = this.n;
    this.fx.fill(0, 0, n);
    this.fy.fill(0, 0, n);
    if (opt.bonds) {
      const want = Math.min(Math.max(1024, n * 3), 60000);
      if (this.bondCap < want) {
        this.bondCap = want;
        this.bondI = new Int32Array(want);
        this.bondJ = new Int32Array(want);
        this.bondW = new Float32Array(want);
        this.bondBuf = new Float32Array(want * BOND_STRIDE);
      }
    }
    return rMax;
  }

  /** Phase 3: pointer fields, integration, wrap-around and bond geometry. */
  finishStep(opt: StepOptions, rMax: number, bondN: number): void {
    const p = opt.physics;
    const n = this.n;
    const { x, y, sp, fx, fy, w, h } = this;
    const hw = w * 0.5;
    const hh = h * 0.5;
    for (const b of opt.brushes ?? []) {
      if (b.mode === 'repel' || b.mode === 'attract' || b.mode === 'swirl') this.applyField(b);
    }

    // integrate + wrap
    const fs = p.force * p.dt;
    const fric = p.friction;
    const dt = p.dt;
    const { vx, vy } = this;
    const vmax = rMax;
    const vmax2 = vmax * vmax;
    let ke = 0;
    for (let i = 0; i < n; i++) {
      let vxi = (vx[i] + fx[i] * fs) * fric;
      let vyi = (vy[i] + fy[i] * fs) * fric;
      let v2 = vxi * vxi + vyi * vyi;
      if (v2 > vmax2) {
        const k = vmax / Math.sqrt(v2);
        vxi *= k;
        vyi *= k;
        v2 = vmax2;
      } else if (v2 !== v2) {
        // NaN guard
        vxi = vyi = v2 = 0;
      }
      vx[i] = vxi;
      vy[i] = vyi;
      ke += v2;
      let xi = x[i] + vxi * dt;
      let yi = y[i] + vyi * dt;
      if (xi < 0) xi += w;
      else if (xi >= w) xi -= w;
      if (yi < 0) yi += h;
      else if (yi >= h) yi -= h;
      if (!(xi >= 0 && xi < w)) xi = wrap(xi, w);
      if (!(yi >= 0 && yi < h)) yi = wrap(yi, h);
      x[i] = xi;
      y[i] = yi;
    }
    this.kinetic = n > 0 ? ke / n : 0;

    // bond geometry from the *integrated* positions
    this.bondN = opt.bonds ? bondN : 0;
    if (opt.bonds) {
      const out = this.bondBuf;
      const { bondI, bondJ, bondW } = this;
      for (let k = 0; k < bondN; k++) {
        const i = bondI[k];
        const j = bondJ[k];
        let dx = x[j] - x[i];
        if (dx > hw) dx -= w;
        else if (dx < -hw) dx += w;
        let dy = y[j] - y[i];
        if (dy > hh) dy -= h;
        else if (dy < -hh) dy += h;
        const o = k * BOND_STRIDE;
        out[o] = x[i];
        out[o + 1] = y[i];
        out[o + 2] = x[i] + dx;
        out[o + 3] = y[i] + dy;
        out[o + 4] = bondW[k];
        out[o + 5] = sp[i] * 8 + sp[j];
      }
    }
  }

  /**
   * Symmetric pair pass for grids with ≥ 3 × 3 cells: neighbours across the seam get a fixed
   * position offset per cell pair, so the inner loop has no wrap-around branches.
   */
  private pairsShifted(rMax: number, beta: number, collect: boolean, bondCap: number, bondR2: number): number {
    const { x, y, sp, fx, fy, grid } = this;
    const M = this.matrix;
    const S = this.species;
    const rMax2 = rMax * rMax;
    const invR = 1 / rMax;
    const invBeta = 1 / beta;
    const invBand = 1 / (1 - beta);
    const start = grid.cellStart;
    const fwdStart = grid.fwdStart;
    const fwdCells = grid.fwdCells;
    const fwdShift = grid.fwdShift;
    const nc = grid.cellCount;
    const invBondR2 = 1 / bondR2;
    const bondI = this.bondI;
    const bondJ = this.bondJ;
    const bondW = this.bondW;
    let bondN = 0;
    for (let c = 0; c < nc; c++) {
      const s0 = start[c];
      const s1 = start[c + 1];
      if (s0 === s1) continue;
      const f0 = fwdStart[c];
      const f1 = fwdStart[c + 1];
      for (let i = s0; i < s1; i++) {
        const xi = x[i];
        const yi = y[i];
        const si = sp[i];
        const rowI = si * S;
        let fxi = fx[i];
        let fyi = fy[i];
        for (let k = f0 - 1; k < f1; k++) {
          let t0: number;
          let t1: number;
          let ox: number;
          let oy: number;
          if (k < f0) {
            t0 = i + 1;
            t1 = s1;
            ox = -xi;
            oy = -yi;
          } else {
            const d = fwdCells[k];
            t0 = start[d];
            t1 = start[d + 1];
            ox = fwdShift[k * 2] - xi;
            oy = fwdShift[k * 2 + 1] - yi;
          }
          for (let j = t0; j < t1; j++) {
            const dx = x[j] + ox;
            const dy = y[j] + oy;
            const d2 = dx * dx + dy * dy;
            if (d2 >= rMax2 || d2 === 0) continue;
            const d = Math.sqrt(d2);
            const r = d * invR;
            const sj = sp[j];
            let fij: number;
            let fji: number;
            if (r < beta) {
              fij = fji = r * invBeta - 1;
            } else {
              const t = 1 - Math.abs(2 * r - 1 - beta) * invBand;
              fij = M[rowI + sj] * t;
              fji = M[sj * S + si] * t;
            }
            const inv = 1 / d;
            const ux = dx * inv;
            const uy = dy * inv;
            fxi += ux * fij;
            fyi += uy * fij;
            fx[j] -= ux * fji;
            fy[j] -= uy * fji;
            if (collect && d2 < bondR2 && bondN < bondCap) {
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
        fx[i] = fxi;
        fy[i] = fyi;
      }
    }
    return bondN;
  }

  /** Generic pair pass with minimum-image wrapping (tiny worlds with < 3 cells per axis). */
  private pairsWrapped(rMax: number, beta: number, collect: boolean, bondCap: number, bondR2: number): number {
    const { x, y, sp, fx, fy, grid, w, h } = this;
    const M = this.matrix;
    const S = this.species;
    const rMax2 = rMax * rMax;
    const invR = 1 / rMax;
    const invBeta = 1 / beta;
    const invBand = 1 / (1 - beta);
    const hw = w * 0.5;
    const hh = h * 0.5;
    const start = grid.cellStart;
    const fwdStart = grid.fwdStart;
    const fwdCells = grid.fwdCells;
    const nc = grid.cellCount;
    const invBondR2 = 1 / bondR2;
    const bondI = this.bondI;
    const bondJ = this.bondJ;
    const bondW = this.bondW;
    let bondN = 0;
    for (let c = 0; c < nc; c++) {
      const s0 = start[c];
      const s1 = start[c + 1];
      if (s0 === s1) continue;
      const f0 = fwdStart[c];
      const f1 = fwdStart[c + 1];
      for (let i = s0; i < s1; i++) {
        const xi = x[i];
        const yi = y[i];
        const si = sp[i];
        const rowI = si * S;
        let fxi = fx[i];
        let fyi = fy[i];
        for (let k = f0 - 1; k < f1; k++) {
          let t0: number;
          let t1: number;
          if (k < f0) {
            t0 = i + 1;
            t1 = s1;
          } else {
            const d = fwdCells[k];
            t0 = start[d];
            t1 = start[d + 1];
          }
          for (let j = t0; j < t1; j++) {
            let dx = x[j] - xi;
            if (dx > hw) dx -= w;
            else if (dx < -hw) dx += w;
            let dy = y[j] - yi;
            if (dy > hh) dy -= h;
            else if (dy < -hh) dy += h;
            const d2 = dx * dx + dy * dy;
            if (d2 >= rMax2 || d2 === 0) continue;
            const d = Math.sqrt(d2);
            const r = d * invR;
            const sj = sp[j];
            let fij: number;
            let fji: number;
            if (r < beta) {
              fij = fji = r * invBeta - 1;
            } else {
              const t = 1 - Math.abs(2 * r - 1 - beta) * invBand;
              fij = M[rowI + sj] * t;
              fji = M[sj * S + si] * t;
            }
            const inv = 1 / d;
            const ux = dx * inv;
            const uy = dy * inv;
            fxi += ux * fij;
            fyi += uy * fij;
            fx[j] -= ux * fji;
            fy[j] -= uy * fji;
            if (collect && d2 < bondR2 && bondN < bondCap) {
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
        fx[i] = fxi;
        fy[i] = fyi;
      }
    }
    return bondN;
  }

  private applyField(b: Brush): void {
    const { x, y, fx, fy, n, w, h } = this;
    const R = b.r;
    const R2 = R * R;
    const hw = w / 2;
    const hh = h / 2;
    const k = 6 * b.strength;
    for (let i = 0; i < n; i++) {
      let dx = b.x - x[i];
      if (dx > hw) dx -= w;
      else if (dx < -hw) dx += w;
      let dy = b.y - y[i];
      if (dy > hh) dy -= h;
      else if (dy < -hh) dy += h;
      const d2 = dx * dx + dy * dy;
      if (d2 >= R2 || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const s = (1 - d / R) * k;
      const ux = dx / d;
      const uy = dy / d;
      if (b.mode === 'attract') {
        fx[i] += ux * s;
        fy[i] += uy * s;
      } else if (b.mode === 'repel') {
        fx[i] -= ux * s;
        fy[i] -= uy * s;
      } else {
        // swirl: tangential push plus a gentle pull so the vortex holds together
        fx[i] += (-uy * 0.9 + ux * 0.25) * s;
        fy[i] += (ux * 0.9 + uy * 0.25) * s;
      }
    }
  }

  private applySpawn(b: Brush, rng: Rng): void {
    const per = Math.max(1, Math.round(3 * b.strength));
    for (let k = 0; k < per; k++) {
      const s = b.species >= 0 && b.species < this.species ? b.species : (rng() * this.species) | 0;
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * b.r * 0.6;
      this.push(b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, s, rng);
    }
  }

  private applyErase(b: Brush): void {
    const R2 = b.r * b.r * 0.36;
    const { w, h } = this;
    const hw = w / 2;
    const hh = h / 2;
    let out = 0;
    for (let i = 0; i < this.n; i++) {
      let dx = this.x[i] - b.x;
      if (dx > hw) dx -= w;
      else if (dx < -hw) dx += w;
      let dy = this.y[i] - b.y;
      if (dy > hh) dy -= h;
      else if (dy < -hh) dy += h;
      if (dx * dx + dy * dy < R2) continue;
      if (out !== i) this.copy(i, out);
      out++;
    }
    if (out !== this.n) {
      this.n = out;
      this.recount();
    }
  }
}

export function wrap(v: number, size: number): number {
  const r = v % size;
  const o = r < 0 ? r + size : r;
  return o >= size ? 0 : o;
}
