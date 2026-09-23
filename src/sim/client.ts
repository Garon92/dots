import type { FrameResult, FromWorker, ToWorker } from './protocol';
import { SimHost } from './host';

/**
 * Talks to the simulation: a dedicated Web Worker when available, otherwise an in-thread SimHost
 * with the same message protocol. Only one frame request is in flight at a time (back-pressure).
 */
export class SimClient {
  private worker: Worker | null = null;
  private inline: SimHost | null = null;
  inFlight = false;
  readonly mode: 'worker' | 'inline';
  onFrame: (r: FrameResult) => void = () => {};
  onError: (message: string) => void = () => {};

  constructor(forceInline = false) {
    if (!forceInline && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module', name: 'dots-sim' });
        this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
        this.worker.onerror = (e) => {
          e.preventDefault();
          this.fallback(e.message || 'Worker selhal');
        };
      } catch {
        this.worker = null;
      }
    }
    if (!this.worker) this.inline = new SimHost();
    this.mode = this.worker ? 'worker' : 'inline';
  }

  private pending: ToWorker[] = [];

  /** Switch to in-thread simulation (e.g. when the worker script fails to load). */
  private fallback(reason: string): void {
    if (this.inline) return;
    console.warn('Dots: simulace poběží v hlavním vlákně –', reason);
    this.worker?.terminate();
    this.worker = null;
    this.inline = new SimHost();
    (this as { mode: 'worker' | 'inline' }).mode = 'inline';
    this.inFlight = false;
    // replay the non-frame history so the inline host reaches the same state
    for (const m of this.pending) if (m.t !== 'frame') this.inline.handle(m);
  }

  private receive(msg: FromWorker): void {
    if (msg.t === 'frame') {
      this.inFlight = false;
      this.onFrame(msg);
    } else {
      this.inFlight = false;
      this.onError(msg.message);
    }
  }

  post(msg: ToWorker, transfer: Transferable[] = []): void {
    if (msg.t === 'init') this.pending = [msg];
    else if (msg.t !== 'frame') this.pending.push(msg);
    if (this.pending.length > 64) this.pending.splice(1, this.pending.length - 32);
    if (msg.t === 'frame') this.inFlight = true;
    if (this.worker) {
      this.worker.postMessage(msg, transfer);
      return;
    }
    const host = this.inline!;
    try {
      const out = host.handle(msg);
      if (out) {
        const r = out.result;
        queueMicrotask(() => this.receive(r));
      }
    } catch (err) {
      this.inFlight = false;
      this.onError(err instanceof Error ? err.message : String(err));
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
