/// <reference lib="webworker" />
// Helper worker: computes forces for ranges of grid cells on behalf of the simulation worker.
import { forcesForRange } from './forces';
import { TorusGrid } from './grid';
import type { PoolData, PoolDone, PoolMsg } from './pool';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const grid = new TorusGrid();
let data: PoolData | null = null;

ctx.onmessage = (e: MessageEvent<{ port: MessagePort }>) => {
  const port = e.data.port;
  port.onmessage = (ev: MessageEvent<PoolMsg>) => {
    const m = ev.data;
    if (m.t === 'data') {
      data = m;
      grid.configure(m.w, m.h, m.rMax);
      grid.cellStart = m.cellStart;
      return;
    }
    if (!data || data.id !== m.id) return;
    const out = forcesForRange(
      { x: data.x, y: data.y, sp: data.sp, grid, species: data.species, matrix: data.matrix, rMax: data.rMax, beta: data.beta, bonds: data.bonds },
      m.i0,
      m.i1,
      data.bonds ? data.bondCap : 0,
    );
    const done: PoolDone = { t: 'done', id: m.id, ...out };
    port.postMessage(done, [out.fx.buffer, out.fy.buffer, out.bondI.buffer, out.bondJ.buffer, out.bondW.buffer]);
  };
};
