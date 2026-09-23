import type { FrameResult, FromWorker, ToWorker } from './protocol';
import { SimHost } from './host';

/**
 * Talks to the simulation: a dedicated Web Worker when available, otherwise an in-thread SimHost
 * with the same message protocol. Only one frame request is in flight at a time (back-pressure).
 *
 * On multi-core devices it also starts helper workers for the parallel force pass and connects
 * them to the simulation worker with MessageChannels.
 */
export class SimClient {
  private worker: Worker | null = null;
  private helpers: Worker[] = [];
  private inline: SimHost | null = null;
  inFlight = false;
  readonly mode: 'worker' | 'inline';
  onFrame: (r: FrameResult) => void = () => {};
  onError: (message: string) => void = () => {};
  private pending: ToWorker[] = [];

  constructor(forceInline = false) {
    if (!forceInline && typeof Worker !== 'undefined') {
      try {
        this.worker = new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module', name: 'dots-sim' });
        this.worker.onmessage = (e: MessageEvent<FromWorker>) => this.receive(e.data);
        this.worker.onerror = (e) => {
          e.preventDefault();
          this.fallback(e.message || 'Worker selhal');
        };
        this.startHelpers();
      } catch {
        this.worker = null;
      }
    }
    if (!this.worker) this.inline = new SimHost();
    this.mode = this.worker ? 'worker' : 'inline';
  }

  /** Number of helper threads available for the force pass. */
  get helperCount(): number {
    return this.helpers.length;
  }

  private startHelpers(): void {
    const cores = navigator.hardwareConcurrency || 2;
    // main thread + simulation worker keep a core each; helpers use the rest (max 6)
    const k = Math.min(6, cores - 2);
    if (k < 2 || typeof MessageChannel === 'undefined') return;
    const ports: MessagePort[] = [];
    try {
      for (let i = 0; i < k; i++) {
        const w = new Worker(new URL('./force.worker.ts', import.meta.url), { type: 'module', name: `dots-force-${i + 1}` });
        const ch = new MessageChannel();
        w.postMessage({ port: ch.port2 }, [ch.port2]);
        w.onerror = (e) => {
          e.preventDefault();
          // a broken helper disables the pool (the simulation keeps running single-threaded)
          this.worker?.postMessage({ t: 'pool', ports: [] } satisfies ToWorker);
        };
        this.helpers.push(w);
        ports.push(ch.port1);
      }
      this.worker!.postMessage({ t: 'pool', ports } satisfies ToWorker, ports);
    } catch {
      for (const w of this.helpers) w.terminate();
      this.helpers = [];
    }
  }

  /** Switch to in-thread simulation (e.g. when the worker script fails to load). */
  private fallback(reason: string): void {
    if (this.inline) return;
    console.warn('Dots: simulace poběží v hlavním vlákně –', reason);
    this.worker?.terminate();
    this.worker = null;
    for (const w of this.helpers) w.terminate();
    this.helpers = [];
    this.inline = new SimHost();
    (this as { mode: 'worker' | 'inline' }).mode = 'inline';
    this.inFlight = false;
    // replay the non-frame history so the inline host reaches the same state
    for (const m of this.pending) if (m.t !== 'frame' && m.t !== 'pool') void this.inline.handle(m);
  }

  private receive(msg: FromWorker): void {
    this.inFlight = false;
    if (msg.t === 'frame') this.onFrame(msg);
    else this.onError(msg.message);
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
    try {
      const out = this.inline!.handle(msg);
      if (out) void Promise.resolve(out).then((o) => queueMicrotask(() => this.receive(o.result)));
    } catch (err) {
      this.inFlight = false;
      this.onError(err instanceof Error ? err.message : String(err));
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    for (const w of this.helpers) w.terminate();
    this.helpers = [];
  }
}
