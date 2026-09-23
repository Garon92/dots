import type { FrameMsg, FrameResult, ToWorker } from './protocol';
import { mulberry32, type Rng } from './rng';
import { BOND_STRIDE, World } from './world';

/**
 * Owns a World and answers protocol messages. Runs inside the Web Worker, or on the main thread
 * as a fallback when workers are unavailable.
 */
export class SimHost {
  world: World | null = null;
  private rng: Rng = mulberry32(1);

  handle(msg: ToWorker): { result: FrameResult; transfer: Transferable[] } | null {
    switch (msg.t) {
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
        return this.frame(msg);
    }
  }

  private frame(msg: FrameMsg): { result: FrameResult; transfer: Transferable[] } {
    const world = this.world;
    if (!world) throw new Error('Simulace ještě není připravená');
    world.setMatrix(msg.species, msg.matrix);
    let stepMs = 0;
    const steps = Math.max(0, Math.min(8, msg.steps | 0));
    if (steps > 0) {
      const t0 = performance.now();
      for (let s = 0; s < steps; s++) {
        world.step({ physics: msg.physics, brushes: msg.brushes, bonds: msg.bonds && s === steps - 1 }, this.rng);
      }
      stepMs = (performance.now() - t0) / steps;
    }
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
    };
    return { result, transfer: [pos.buffer, spc.buffer, bnd.buffer] };
  }
}
