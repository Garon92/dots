import type { FrameMsg, FrameResult, ToWorker } from './protocol';
import { ForcePool } from './pool';
import { mulberry32, type Rng } from './rng';
import { BOND_STRIDE, World } from './world';

/** Below this many particles the helper round-trips cost more than they save. */
const POOL_MIN = 1500;

/**
 * Owns a World and answers protocol messages. Runs inside the Web Worker, or on the main thread
 * as a fallback when workers are unavailable.
 */
export class SimHost {
  world: World | null = null;
  private rng: Rng = mulberry32(1);
  private pool: ForcePool | null = null;
  // adaptive choice between the local pass and the pool (EMA of ms per step for each)
  private emaLocal = 0;
  private emaPool = 0;
  private stepsSinceProbe = 0;
  private usePool = true;
  private lastThreads = 0;

  handle(msg: ToWorker): { result: FrameResult; transfer: Transferable[] } | null | Promise<{ result: FrameResult; transfer: Transferable[] }> {
    switch (msg.t) {
      case 'pool':
        this.pool?.dispose();
        this.pool = msg.ports.length > 0 ? new ForcePool(msg.ports) : null;
        return null;
      case 'init': {
        const w = new World(msg.w, msg.h, 2048);
        w.setMatrix(msg.species, msg.matrix);
        this.rng = mulberry32(msg.seed);
        w.reseed(msg.counts, msg.layout, this.rng);
        this.world = w;
        return null;
      }
      case 'reseed':
        if (this.world) {
          this.rng = mulberry32(msg.seed);
          this.world.reseed(msg.counts, msg.layout, this.rng);
        }
        return null;
      case 'counts':
        this.world?.setCounts(msg.counts, this.rng);
        return null;
      case 'species':
        if (this.world) {
          this.world.truncateSpecies(msg.species);
          this.world.species = msg.species;
          this.world.setCounts(msg.counts, this.rng);
        }
        return null;
      case 'resize':
        this.world?.resize(msg.w, msg.h);
        return null;
      case 'shake':
        this.world?.shake(msg.amount, this.rng);
        return null;
      case 'frame':
        return this.pool ? this.frameAsync(msg) : this.pack(msg, this.runLocal(msg));
    }
  }

  private runLocal(msg: FrameMsg): number {
    const world = this.world;
    if (!world) throw new Error('Simulace ještě není připravená');
    world.setMatrix(msg.species, msg.matrix);
    const steps = Math.max(0, Math.min(8, msg.steps | 0));
    if (steps === 0) return 0;
    const t0 = performance.now();
    for (let s = 0; s < steps; s++) {
      world.step({ physics: msg.physics, brushes: msg.brushes, bonds: msg.bonds && s === steps - 1 }, this.rng);
    }
    this.lastThreads = 0;
    return (performance.now() - t0) / steps;
  }

  /** Steps using the helper pool when it is faster (measured continuously), else locally. */
  private async frameAsync(msg: FrameMsg): Promise<{ result: FrameResult; transfer: Transferable[] }> {
    const world = this.world;
    const pool = this.pool;
    if (!world || !pool) return this.pack(msg, this.runLocal(msg));
    world.setMatrix(msg.species, msg.matrix);
    const steps = Math.max(0, Math.min(8, msg.steps | 0));
    if (steps === 0) return this.pack(msg, 0);
    // Occasionally measure the other mode (one step) so the choice follows the scene; when one
    // mode is clearly faster the other is probed only rarely (a slow probe is a visible hiccup).
    this.stepsSinceProbe += steps;
    const ratio = this.emaPool && this.emaLocal ? Math.max(this.emaPool, this.emaLocal) / Math.min(this.emaPool, this.emaLocal) : 1;
    const interval = ratio > 2 ? 3600 : 300;
    const probe = this.stepsSinceProbe > interval;
    if (probe) this.stepsSinceProbe = 0;
    const small = world.n < POOL_MIN;
    const t0 = performance.now();
    let tPool = 0;
    let nPool = 0;
    let tLocal = 0;
    let nLocal = 0;
    for (let s = 0; s < steps; s++) {
      const opt = { physics: msg.physics, brushes: msg.brushes, bonds: msg.bonds && s === steps - 1 };
      let mode = small ? false : this.usePool;
      if (probe && s === 0 && !small) mode = !mode;
      const ts = performance.now();
      if (mode && world.grid.simpleWrap !== false) {
        const rMax = world.prepareStep(opt, this.rng);
        const bondN = world.grid.simpleWrap ? await pool.compute(world, rMax, opt.physics.beta, !!opt.bonds) : world.computePairs(rMax, opt.physics.beta, !!opt.bonds);
        world.finishStep(opt, rMax, bondN);
        tPool += performance.now() - ts;
        nPool++;
      } else {
        world.step(opt, this.rng);
        tLocal += performance.now() - ts;
        nLocal++;
      }
    }
    const ms = (performance.now() - t0) / steps;
    if (nPool) this.emaPool = this.emaPool ? this.emaPool * 0.7 + (tPool / nPool) * 0.3 : tPool / nPool;
    if (nLocal && !small) this.emaLocal = this.emaLocal ? this.emaLocal * 0.7 + (tLocal / nLocal) * 0.3 : tLocal / nLocal;
    if (!small && this.emaPool && this.emaLocal) this.usePool = this.emaPool < this.emaLocal * 0.95;
    this.lastThreads = nPool > 0 && nPool >= nLocal ? pool.size : 0;
    return this.pack(msg, ms);
  }

  private pack(msg: FrameMsg, stepMs: number): { result: FrameResult; transfer: Transferable[] } {
    const world = this.world;
    if (!world) throw new Error('Simulace ještě není připravená');
    const steps = Math.max(0, Math.min(8, msg.steps | 0));
    const n = world.n;
    const bondN = msg.bonds && steps > 0 ? world.bondN : 0;
    let pos = msg.recycle && msg.recycle.pos.byteLength >= n * 8 ? new Float32Array(msg.recycle.pos) : new Float32Array(Math.max(1024, n * 2 + 512));
    let spc = msg.recycle && msg.recycle.spc.byteLength >= n ? new Uint8Array(msg.recycle.spc) : new Uint8Array(Math.max(512, n + 256));
    let bnd =
      msg.recycle && msg.recycle.bnd.byteLength >= bondN * BOND_STRIDE * 4
        ? new Float32Array(msg.recycle.bnd)
        : new Float32Array(Math.max(64, bondN * BOND_STRIDE + 1024));
    if (pos.length < n * 2) pos = new Float32Array(n * 2 + 512);
    if (spc.length < n) spc = new Uint8Array(n + 256);
    if (bnd.length < bondN * BOND_STRIDE) bnd = new Float32Array(bondN * BOND_STRIDE + 1024);
    const { x, y, sp } = world;
    for (let i = 0, k = 0; i < n; i++, k += 2) {
      pos[k] = x[i];
      pos[k + 1] = y[i];
    }
    spc.set(sp.subarray(0, n));
    if (bondN > 0) bnd.set(world.bondBuf.subarray(0, bondN * BOND_STRIDE));
    const counts: number[] = [];
    for (let s = 0; s < world.species; s++) counts.push(world.counts[s]);
    const result: FrameResult = {
      t: 'frame',
      id: msg.id,
      n,
      pos,
      spc,
      bondN,
      bnd,
      kinetic: world.kinetic,
      stepMs,
      steps,
      counts,
      w: world.w,
      h: world.h,
      threads: this.lastThreads,
    };
    return { result, transfer: [pos.buffer, spc.buffer, bnd.buffer] };
  }
}
