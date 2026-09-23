/// <reference lib="webworker" />
import { simulateThumb, type ThumbJob } from './thumbs';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
ctx.onmessage = (e: MessageEvent<{ key: string; job: ThumbJob }>) => {
  const { key, job } = e.data;
  try {
    const data = simulateThumb(job);
    const transfer: Transferable[] = [];
    for (const f of data.frames) transfer.push(f.pos.buffer as ArrayBuffer, f.spc.buffer as ArrayBuffer);
    ctx.postMessage({ key, data }, transfer);
  } catch (err) {
    ctx.postMessage({ key, error: err instanceof Error ? err.message : String(err) });
  }
};
