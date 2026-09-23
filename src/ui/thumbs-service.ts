import { renderThumbBlob, type ThumbFrames, type ThumbJob, simulateThumb } from '../render/thumbs';
import { hashString } from '../sim/rng';
import { imageUrl, putImage } from '../state/images';
import type { Rgb } from '../state/palette';
import type { Recipe } from '../state/recipe';

const W = 720;
const H = 450;
const VERSION = 5;

interface Pending {
  key: string;
  job: ThumbJob;
  colors: readonly Rgb[];
  theme: 'dark' | 'light';
  resolve: (url: string) => void;
}

type WorkerReply = { key: string; blob?: Blob; data?: ThumbFrames; error?: string };

/**
 * Gallery previews: each world is simulated for a few hundred steps in a background worker, which
 * also paints and encodes the picture (OffscreenCanvas) – the main thread only receives a Blob.
 * Pictures are kept in Cache Storage (images.ts), so later visits show them instantly.
 */
export class ThumbService {
  private worker: Worker | null = null;
  private queue: Pending[] = [];
  private busy: Pending | null = null;
  private memory = new Map<string, string>();
  private inflight = new Map<string, Promise<string>>();

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    try {
      this.worker = new Worker(new URL('../render/thumbs.worker.ts', import.meta.url), { type: 'module', name: 'dots-thumbs' });
      this.worker.onmessage = (e: MessageEvent<WorkerReply>) => void this.done(e.data);
      this.worker.onerror = (e) => {
        e.preventDefault();
        this.worker?.terminate();
        this.worker = null;
        this.broken = true;
        const b = this.busy;
        this.busy = null;
        if (b) this.queue.unshift(b);
        this.pump();
      };
    } catch {
      this.worker = null;
      this.broken = true;
    }
    return this.worker;
  }
  private broken = false;

  /** Cache key: depends on everything that changes the picture. */
  keyFor(recipe: Recipe, colors: readonly Rgb[], theme: string, density: number): string {
    return `thumb/${VERSION}-${theme}-${hashString(JSON.stringify([recipe.species, recipe.matrix, recipe.physics, recipe.layout, colors, density])).toString(36)}`;
  }

  /** Synchronous hit from this page's memory (no flash of the placeholder). */
  get(key: string): string | undefined {
    return this.memory.get(key);
  }

  /** Picture for a world: from memory, from Cache Storage, or freshly generated. */
  request(recipe: Recipe, colors: readonly Rgb[], theme: 'dark' | 'light', density = 1, seedKey = '', key = this.keyFor(recipe, colors, theme, density)): Promise<string> {
    const hit = this.memory.get(key);
    if (hit) return Promise.resolve(hit);
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const p = (async () => {
      const stored = await imageUrl(key);
      if (stored) {
        this.memory.set(key, stored);
        return stored;
      }
      const totalN = Math.round(((W * H) / 1e6) * 2400 * density);
      const sum = recipe.counts.reduce((a, b) => a + b, 0) || 1;
      const counts = recipe.counts.map((c) => Math.round((c / sum) * totalN));
      const job: ThumbJob = {
        species: recipe.species,
        matrix: recipe.matrix,
        counts,
        physics: recipe.physics,
        layout: recipe.layout,
        seed: hashString(seedKey || key),
        w: W,
        h: H,
        steps: 420,
        trail: 9,
      };
      return new Promise<string>((resolve) => {
        this.queue.push({ key, job, colors, theme, resolve });
        this.pump();
      });
    })();
    this.inflight.set(key, p);
    void p.finally(() => this.inflight.delete(key));
    return p;
  }

  private pump(): void {
    if (this.busy || this.queue.length === 0) return;
    const next = this.queue.shift()!;
    this.busy = next;
    const w = this.broken ? null : this.ensureWorker();
    if (w) {
      w.postMessage({ key: next.key, job: next.job, colors: next.colors, theme: next.theme });
    } else {
      // no worker: compute in a later task on the main thread
      setTimeout(() => void this.done({ key: next.key, data: simulateThumb(next.job) }), 30);
    }
  }

  private async done(msg: WorkerReply): Promise<void> {
    const p = this.busy;
    this.busy = null;
    let url = '';
    if (p && p.key === msg.key) {
      try {
        const blob = msg.blob ?? (msg.data ? await renderThumbBlob(msg.data, p.colors, p.theme) : null);
        if (blob) {
          url = await putImage(p.key, blob);
          this.memory.set(p.key, url);
        }
      } catch {
        url = '';
      }
      p.resolve(url);
    } else if (p) {
      p.resolve('');
    }
    this.pump();
  }
}
