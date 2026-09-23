/// <reference lib="webworker" />
import type { Rgb } from '../state/palette';
import { renderThumbBlob, simulateThumb, type ThumbJob } from './thumbs';

/** Simulates a preview and, where OffscreenCanvas exists, also paints and encodes it here. */
const ctx = self as unknown as DedicatedWorkerGlobalScope;
const canPaint = typeof OffscreenCanvas !== 'undefined';

ctx.onmessage = async (e: MessageEvent<{ key: string; job: ThumbJob; colors: Rgb[]; theme: 'dark' | 'light' }>) => {
  const { key, job, colors, theme } = e.data;
  try {
    const data = simulateThumb(job);
    if (canPaint) {
      try {
        const blob = await renderThumbBlob(data, colors, theme);
        ctx.postMessage({ key, blob });
        return;
      } catch {
        /* fall back to painting on the main thread */
      }
    }
    const transfer: Transferable[] = [];
    for (const f of data.frames) transfer.push(f.pos.buffer as ArrayBuffer, f.spc.buffer as ArrayBuffer);
    ctx.postMessage({ key, data }, transfer);
  } catch (err) {
    ctx.postMessage({ key, error: err instanceof Error ? err.message : String(err) });
  }
};
