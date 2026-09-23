/// <reference lib="webworker" />
import type { FromWorker, ToWorker } from './protocol';
import { SimHost } from './host';

const host = new SimHost();
const ctx = self as unknown as DedicatedWorkerGlobalScope;

// Messages are processed strictly in order: a frame may await the helper pool, and nothing
// (counts, reseed, …) may touch the world in the middle of a step.
let queue: Promise<void> = Promise.resolve();

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  queue = queue.then(async () => {
    try {
      const out = await host.handle(e.data);
      if (out) ctx.postMessage(out.result satisfies FromWorker, out.transfer);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.postMessage({ t: 'error', message } satisfies FromWorker);
    }
  });
};
