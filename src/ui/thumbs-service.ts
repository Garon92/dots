import { drawThumb, simulateThumb, type ThumbFrames, type ThumbJob } from '../render/thumbs';
import { hashString } from '../sim/rng';
import type { Rgb } from '../state/palette';
import type { Recipe } from '../state/recipe';
import { dotsStore } from '../state/storage';

const W = 720;
const H = 450;
const CACHE_VERSION = 3;
const MAX_CACHED = 48;

interface Pending {
  key: string;
  job: ThumbJob;
  colors: readonly Rgb[];
  theme: 'dark' | 'light';
  resolve: (url: string) => void;
}

/**
 * Generates gallery previews by actually running each world for a few hundred steps in a
 * background worker, then paints the last frames (motion trail) into a small image.
 * Results are cached in memory and in localStorage.
 */
export class ThumbService {
  private worker: Worker | null = null;
  private queue: Pending[] = [];
  private busy: Pending | null = null;
  private memory = new Map<string, string>();
  private inflight = new Map<string, Promise<string>>();

  constructor() {
    try {
      this.worker = new Worker(new URL('../render/thumbs.worker.ts', import.meta.url), { type: 'module', name: 'dots-thumbs' });
      this.worker.onmessage = (e: MessageEvent<{ key: string; data?: ThumbFrames; error?: string }>) => this.done(e.data);
      this.worker.onerror = (e) => {
        e.preventDefault();
        this.worker = null;
        const b = this.busy;
        this.busy = null;
        if (b) this.queue.unshift(b);
        this.pump();
      };
    } catch {
      this.worker = null;
    }
    const cache = dotsStore().get('thumbs');
    if (cache && cache.v === CACHE_VERSION && cache.entries) {
      for (const [k, v] of Object.entries(cache.entries)) if (typeof v === 'string') this.memory.set(k, v);
    }
  }

  /** Cache key: depends on everything that changes the picture. */
  keyFor(recipe: Recipe, colors: readonly Rgb[], theme: string, density: number): string {
    return `${theme}:${hashString(JSON.stringify([recipe.species, recipe.matrix, recipe.physics, recipe.layout, colors, density])).toString(36)}`;
  }

  get(key: string): string | undefined {
    return this.memory.get(key);
  }

  request(recipe: Recipe, colors: readonly Rgb[], theme: 'dark' | 'light', density = 1, seedKey = ''): Promise<string> {
    const key = this.keyFor(recipe, colors, theme, density);
    const hit = this.memory.get(key);
    if (hit) return Promise.resolve(hit);
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const total = Math.round(((W * H) / 1e6) * 2400 * density);
    const sum = recipe.counts.reduce((a, b) => a + b, 0) || 1;
    const counts = recipe.counts.map((c) => Math.round((c / sum) * total));
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
    const p = new Promise<string>((resolve) => {
      this.queue.push({ key, job, colors, theme, resolve });
    });
    this.inflight.set(key, p);
    this.pump();
    return p;
  }

  private pump(): void {
    if (this.busy || this.queue.length === 0) return;
    const next = this.queue.shift()!;
    this.busy = next;
    if (this.worker) {
      this.worker.postMessage({ key: next.key, job: next.job });
    } else {
      // no worker: compute in idle slices on the main thread
      setTimeout(() => this.done({ key: next.key, data: simulateThumb(next.job) }), 30);
    }
  }

  private done(msg: { key: string; data?: ThumbFrames; error?: string }): void {
    const p = this.busy;
    this.busy = null;
    if (p && p.key === msg.key && msg.data) {
      const url = this.paint(msg.data, p.colors, p.theme);
      this.memory.set(p.key, url);
      this.inflight.delete(p.key);
      p.resolve(url);
      this.persistSoon();
    } else if (p) {
      this.inflight.delete(p.key);
      p.resolve('');
    }
    this.pump();
  }

  private paint(data: ThumbFrames, colors: readonly Rgb[], theme: 'dark' | 'light'): string {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 200;
    drawThumb(c.getContext('2d')!, data, colors, theme, 7);
    const webp = c.toDataURL('image/webp', 0.8);
    return webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/jpeg', 0.82);
  }

  private persistTimer = 0;
  private persistSoon(): void {
    clearTimeout(this.persistTimer);
    this.persistTimer = window.setTimeout(() => {
      const entries: Record<string, string> = {};
      const all = [...this.memory.entries()].slice(-MAX_CACHED);
      for (const [k, v] of all) entries[k] = v;
      dotsStore().set('thumbs', { v: CACHE_VERSION, entries });
    }, 1500);
  }
}
