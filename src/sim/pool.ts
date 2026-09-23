import { partitionParticles } from './forces';
import type { World } from './world';

export interface PoolData {
  t: 'data';
  id: number;
  x: Float32Array;
  y: Float32Array;
  sp: Uint8Array;
  cellStart: Int32Array;
  w: number;
  h: number;
  rMax: number;
  beta: number;
  species: number;
  matrix: Float32Array;
  bonds: boolean;
  bondCap: number;
}

export type PoolMsg = PoolData | { t: 'chunk'; id: number; i0: number; i1: number };

export interface PoolDone {
  t: 'done';
  id: number;
  i0: number;
  fx: Float32Array;
  fy: Float32Array;
  bondN: number;
  bondI: Int32Array;
  bondJ: Int32Array;
  bondW: Float32Array;
}

/**
 * Parallel force pass over helper workers (connected by MessagePorts). Each step the sorted
 * particle arrays are copied to every helper, the particles are cut into ~3 chunks per helper of
 * similar estimated work (split by particle, so even one huge cluster is shared), and chunks are
 * handed out dynamically (fast cores take more).
 */
export class ForcePool {
  private seq = 0;
  private job: {
    id: number;
    world: World;
    queue: [number, number][];
    left: number;
    bondN: number;
    resolve: (bondN: number) => void;
  } | null = null;

  constructor(private ports: MessagePort[]) {
    for (const port of ports) {
      port.onmessage = (e: MessageEvent<PoolDone>) => this.onDone(port, e.data);
    }
  }

  get size(): number {
    return this.ports.length;
  }

  compute(world: World, rMax: number, beta: number, bonds: boolean): Promise<number> {
    const id = ++this.seq;
    const n = world.n;
    const grid = world.grid;
    const bounds = partitionParticles(grid, n, this.ports.length * 3);
    const queue: [number, number][] = [];
    for (let k = 0; k + 1 < bounds.length; k++) queue.push([bounds[k], bounds[k + 1]]);
    const chunkBondCap = bonds ? Math.ceil((world.bondCap / Math.max(1, queue.length)) * 2) : 0;
    const matrix = world.matrix.slice();
    for (const port of this.ports) {
      const x = world.x.slice(0, n);
      const y = world.y.slice(0, n);
      const sp = world.sp.slice(0, n);
      const cellStart = grid.cellStart.slice();
      const data: PoolData = {
        t: 'data',
        id,
        x,
        y,
        sp,
        cellStart,
        w: world.w,
        h: world.h,
        rMax,
        beta,
        species: world.species,
        matrix,
        bonds,
        bondCap: chunkBondCap,
      };
      port.postMessage(data, [x.buffer, y.buffer, sp.buffer, cellStart.buffer]);
    }
    return new Promise<number>((resolve) => {
      this.job = { id, world, queue, left: queue.length, bondN: 0, resolve };
      if (queue.length === 0) {
        this.job = null;
        resolve(0);
        return;
      }
      for (const port of this.ports) this.next(port);
    });
  }

  private next(port: MessagePort): void {
    const job = this.job;
    if (!job) return;
    const c = job.queue.shift();
    if (c) port.postMessage({ t: 'chunk', id: job.id, i0: c[0], i1: c[1] } satisfies PoolMsg);
  }

  private onDone(port: MessagePort, d: PoolDone): void {
    const job = this.job;
    if (!job || d.id !== job.id) return;
    const w = job.world;
    w.fx.set(d.fx, d.i0);
    w.fy.set(d.fy, d.i0);
    if (d.bondN > 0) {
      const room = Math.min(d.bondN, w.bondCap - job.bondN);
      if (room > 0) {
        w.bondI.set(d.bondI.subarray(0, room), job.bondN);
        w.bondJ.set(d.bondJ.subarray(0, room), job.bondN);
        w.bondW.set(d.bondW.subarray(0, room), job.bondN);
        job.bondN += room;
      }
    }
    job.left--;
    if (job.left === 0) {
      this.job = null;
      job.resolve(job.bondN);
    } else {
      this.next(port);
    }
  }

  dispose(): void {
    for (const p of this.ports) p.close();
    this.ports = [];
  }
}
