/// <reference lib="webworker" />
import type { FromWorker, ToWorker } from './protocol';
import { SimHost } from './host';

const host = new SimHost();
const ctx = self as unknown as DedicatedWorkerGlobalScope;

ctx.onmessage = (e: MessageEvent<ToWorker>) => {
  try {
    const out = host.handle(e.data);
    if (out) ctx.postMessage(out.result satisfies FromWorker, out.transfer);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.postMessage({ t: 'error', message } satisfies FromWorker);
  }
};
