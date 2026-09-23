/**
 * Uniform spatial hash grid on a torus.
 *
 * The world [0, w) × [0, h) is split into cols × rows cells whose size is at least `minCell`
 * (= the interaction radius), so every interacting pair lives in the same or in adjacent cells –
 * including across the wrap-around seam.
 *
 * For the symmetric pair pass we precompute, for every cell c, the list of *forward* neighbours:
 * the distinct adjacent cells d with d > c. Visiting (c, own cell) + (c, forward cells) for all c
 * visits every unordered pair of adjacent cells exactly once, even for tiny grids (1×1, 2×2 …)
 * where the wrapped neighbours coincide.
 */
export class TorusGrid {
  w = 1;
  h = 1;
  cols = 1;
  rows = 1;
  cellW = 1;
  cellH = 1;
  /** CSR: fwdCells[fwdStart[c] .. fwdStart[c+1]) = forward neighbours of cell c. */
  fwdStart: Int32Array = new Int32Array(2);
  fwdCells: Int32Array = new Int32Array(0);
  /**
   * Per forward neighbour: offset to add to that cell's particle positions so they land next to
   * cell c across the seam (only meaningful when `simpleWrap` – every neighbour cell is distinct).
   */
  fwdShift: Float32Array = new Float32Array(0);
  /** cols ≥ 3 and rows ≥ 3: each adjacent cell is unique, wrapping can use fixed offsets. */
  simpleWrap = false;
  /** CSR of *all* distinct neighbours (including the cell itself) – used by radius queries. */
  nbStart: Int32Array = new Int32Array(2);
  nbCells: Int32Array = new Int32Array(0);
  /** Position offsets per neighbour entry (see fwdShift). */
  nbShift: Float32Array = new Float32Array(0);
  /** Filled by `count()`: particles of cell c are [cellStart[c], cellStart[c+1]) after sorting. */
  cellStart: Int32Array = new Int32Array(2);

  get cellCount(): number {
    return this.cols * this.rows;
  }

  /** Returns true when the layout changed. */
  configure(w: number, h: number, minCell: number): boolean {
    const cols = Math.max(1, Math.floor(w / minCell));
    const rows = Math.max(1, Math.floor(h / minCell));
    const changed = cols !== this.cols || rows !== this.rows || w !== this.w || h !== this.h || this.fwdCells.length === 0;
    this.w = w;
    this.h = h;
    this.cellW = w / cols;
    this.cellH = h / rows;
    if (!changed && this.cellStart.length === cols * rows + 1) return false;
    this.cols = cols;
    this.rows = rows;
    this.buildNeighbours();
    this.cellStart = new Int32Array(cols * rows + 1);
    return true;
  }

  cellOf(x: number, y: number): number {
    let cx = (x / this.cellW) | 0;
    let cy = (y / this.cellH) | 0;
    if (cx < 0) cx = 0;
    else if (cx >= this.cols) cx = this.cols - 1;
    if (cy < 0) cy = 0;
    else if (cy >= this.rows) cy = this.rows - 1;
    return cy * this.cols + cx;
  }

  private buildNeighbours(): void {
    const { cols, rows } = this;
    const nc = cols * rows;
    const fwd: number[] = [];
    const shift: number[] = [];
    const fwdStart = new Int32Array(nc + 1);
    const nb: number[] = [];
    const nbShift: number[] = [];
    const nbStart = new Int32Array(nc + 1);
    const seen = new Set<number>();
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        const c = cy * cols + cx;
        fwdStart[c] = fwd.length;
        nbStart[c] = nb.length;
        seen.clear();
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const rx = cx + dx;
            const ry = cy + dy;
            const nx = (rx + cols) % cols;
            const ny = (ry + rows) % rows;
            const d = ny * cols + nx;
            if (seen.has(d)) continue;
            seen.add(d);
            nb.push(d);
            nbShift.push(rx < 0 ? -this.w : rx >= cols ? this.w : 0, ry < 0 ? -this.h : ry >= rows ? this.h : 0);
            if (d > c) {
              fwd.push(d);
              shift.push(rx < 0 ? -this.w : rx >= cols ? this.w : 0, ry < 0 ? -this.h : ry >= rows ? this.h : 0);
            }
          }
        }
      }
    }
    fwdStart[nc] = fwd.length;
    nbStart[nc] = nb.length;
    this.fwdStart = fwdStart;
    this.fwdCells = Int32Array.from(fwd);
    this.fwdShift = Float32Array.from(shift);
    this.simpleWrap = cols >= 3 && rows >= 3;
    this.nbStart = nbStart;
    this.nbCells = Int32Array.from(nb);
    this.nbShift = Float32Array.from(nbShift);
  }

  /**
   * Counting sort: computes the cell of each particle into `cellOf` and fills `cellStart`
   * (prefix sums). Returns nothing – callers scatter using `cellStart` as cursors.
   */
  count(x: Float32Array, y: Float32Array, n: number, cellOf: Int32Array): void {
    const nc = this.cols * this.rows;
    const start = this.cellStart;
    start.fill(0);
    const { cellW, cellH, cols, rows } = this;
    for (let i = 0; i < n; i++) {
      let cx = (x[i] / cellW) | 0;
      let cy = (y[i] / cellH) | 0;
      if (cx < 0) cx = 0;
      else if (cx >= cols) cx = cols - 1;
      if (cy < 0) cy = 0;
      else if (cy >= rows) cy = rows - 1;
      const c = cy * cols + cx;
      cellOf[i] = c;
      start[c + 1]++;
    }
    for (let c = 0; c < nc; c++) start[c + 1] += start[c];
  }

  /**
   * Indices of particles within radius r of (qx, qy) (torus distance). Requires the particle arrays
   * to be sorted by cell with `cellStart` up to date. r must be ≤ min(cellW, cellH) for completeness;
   * larger radii fall back to a full scan.
   */
  query(x: Float32Array, y: Float32Array, n: number, qx: number, qy: number, r: number, out: number[] = []): number[] {
    out.length = 0;
    const r2 = r * r;
    const hw = this.w / 2;
    const hh = this.h / 2;
    const test = (i: number) => {
      let dx = x[i] - qx;
      if (dx > hw) dx -= this.w;
      else if (dx < -hw) dx += this.w;
      let dy = y[i] - qy;
      if (dy > hh) dy -= this.h;
      else if (dy < -hh) dy += this.h;
      if (dx * dx + dy * dy <= r2) out.push(i);
    };
    if (r > this.cellW || r > this.cellH) {
      for (let i = 0; i < n; i++) test(i);
      return out;
    }
    const c = this.cellOf(((qx % this.w) + this.w) % this.w, ((qy % this.h) + this.h) % this.h);
    for (let k = this.nbStart[c]; k < this.nbStart[c + 1]; k++) {
      const d = this.nbCells[k];
      for (let i = this.cellStart[d]; i < this.cellStart[d + 1]; i++) test(i);
    }
    return out;
  }
}
