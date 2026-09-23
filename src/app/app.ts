import { GLRenderer } from '../render/gl';
import { Canvas2DRenderer } from '../render/canvas2d';
import type { FrameData, LookParams, Renderer } from '../render/types';
import { SimClient } from '../sim/client';
import type { FrameResult } from '../sim/protocol';
import { mulberry32, randomSeed, type Rng } from '../sim/rng';
import { type Brush, clamp, clampPhysics, type Layout, type Physics } from '../sim/types';
import { getPalette, speciesColors } from '../state/palette';
import { DEFAULT_PRESET_ID, getPreset, type Preset, PRESETS, presetPhysics } from '../state/presets';
import {
  clampSpecies,
  cloneRecipe,
  equalCounts,
  invertMatrix,
  MAX_TOTAL,
  mutateMatrix,
  randomCounts,
  randomMatrix,
  type Recipe,
  resizeCounts,
  resizeMatrix,
  round2,
  sanitizeRecipe,
  scaleCounts,
  symmetricMatrix,
  total,
  transposeMatrix,
  weightedCounts,
  zeroMatrix,
} from '../state/recipe';
import { type CanvasTheme, hasStoredSettings, loadSettings, saveSettings, type Settings } from '../state/settings';
import {
  type Favorite,
  legacyMigrated,
  loadFavorites,
  loadSession,
  newId,
  saveFavorites,
  saveSession,
} from '../state/storage';
import { resolvedTheme, subscribeSettings } from '../kit/settings';
import { buildHash, parseHash } from '../state/url';
import { Store } from './store';

/** Particles per million square world units at density 1 (matches the original Dots). */
export const BASE_DENSITY = 2400;
const STEP_MS = 1000 / 60;
const MORPH_MS = 700;

export type TabId = 'matice' | 'galerie' | 'svet' | 'vzhled';
/** Hands-free modes: walk through the gallery, or let the matrix slowly evolve. */
export type Autoplay = 'off' | 'gallery' | 'evolve';
export const AUTO_MS: Record<Exclude<Autoplay, 'off'>, number> = { gallery: 24000, evolve: 9000 };

export interface AppState {
  recipe: Recipe;
  presetId: string | null;
  favId: string | null;
  title: string;
  modified: boolean;
  running: boolean;
  settings: Settings;
  /** Resolved canvas theme. */
  theme: 'dark' | 'light';
  panelOpen: boolean;
  tab: TabId;
  zen: boolean;
  favorites: Favorite[];
  canUndo: boolean;
  canRedo: boolean;
  /** Selected matrix cell (row*species+col) or −1. */
  selCell: number;
  autoplay: Autoplay;
}

export interface Stats {
  fps: number;
  n: number;
  kinetic: number;
  stepMs: number;
  /** Achieved simulation speed relative to the requested one (1 = keeping up). */
  simRatio: number;
  renderer: 'webgl2' | 'canvas2d';
  sim: 'worker' | 'inline';
  /** Helper threads used by the force pass right now (0 = single thread). */
  threads: number;
}

type Toast = (msg: string, opts?: { action?: string; onAction?: () => void; ms?: number }) => void;

interface Snapshot {
  species: number;
  matrix: number[];
  counts: number[];
}

export class App {
  readonly store: Store<AppState>;
  readonly stats: Stats;
  /** Matrix actually used this frame (interpolated during a morph). */
  effective = new Float32Array(64);
  private morphFrom: number[] = [];
  private morphTo: number[] = [];
  private morphStart = 0;
  private morphDur = 0;

  private client: SimClient;
  renderer: Renderer;
  private frame: FrameData | null = null;
  private recycle: FrameResult | null = null;
  private frameDirty = false;
  private frameId = 0;
  private acc = 0;
  private last = 0;
  private raf = 0;
  private needSnapshot = true;
  private pendingSteps = 0;
  private bloom = 0;
  brushes = new Map<number, Brush>();
  private rng: Rng = mulberry32(randomSeed());
  private worldW = 1;
  private worldH = 1;
  private cssW = 1;
  private cssH = 1;
  private undoStack: Snapshot[] = [];
  private redoStack: Snapshot[] = [];
  private hiddenPaused = false;
  private lastCountSync = 0;
  private countsPendingUntil = 0;
  // adaptive tuning
  private tuneStart = 0;
  private tuneDesired = 0;
  private tuneDone = 0;
  private tuneCooldownUntil = 0;
  private tunedOnce = false;
  // fps
  private fpsFrames = 0;
  private fpsTime = 0;
  keHistory = new Float32Array(120);
  keHead = 0;
  toast: Toast = () => {};
  onFrameStats: (s: Stats) => void = () => {};
  /** Called right after every draw while the drawing buffer is still valid (video capture). */
  onAfterDraw: ((canvas: HTMLCanvasElement) => void) | null = null;
  /** Fired every animation frame while the matrix is morphing (for the editor). */
  onMatrixFrame: () => void = () => {};
  private urlTimer = 0;
  private sessionTimer = 0;
  private darkQuery = matchMedia('(prefers-color-scheme: dark)');
  private reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  constructor(
    private canvas: HTMLCanvasElement,
    private host: HTMLElement,
  ) {
    const settings = loadSettings();
    if (!hasStoredSettings()) {
      if (this.reducedMotion) settings.trails = 0;
      // phones: keep the small screen for the simulation, statistics can be switched on in Vzhled
      if (matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600) settings.hud = false;
    }
    const fallback = this.presetRecipe(getPreset(DEFAULT_PRESET_ID)!, 3000);
    const favorites = loadFavorites();
    this.store = new Store<AppState>({
      recipe: fallback,
      presetId: null,
      favId: null,
      title: '',
      modified: false,
      running: true,
      settings,
      theme: 'dark',
      panelOpen: window.innerWidth >= 900,
      tab: 'galerie',
      zen: false,
      favorites,
      canUndo: false,
      canRedo: false,
      selCell: -1,
      autoplay: 'off',
    });
    this.store.set({ theme: this.resolveTheme(settings.canvasTheme) });
    // canvas theme "auto" follows the global g92 theme (which itself may follow the OS)
    subscribeSettings(() => this.refreshTheme());
    this.darkQuery.addEventListener('change', () => this.refreshTheme());

    this.renderer = this.createRenderer();
    // GPU reset / driver hiccup: rebuild the renderer when the browser gives the context back
    this.canvas.addEventListener('webglcontextrestored', () => {
      if (this.renderer.kind !== 'webgl2') return;
      try {
        this.renderer = new GLRenderer(this.canvas);
        this.measure();
        this.renderer.resize(this.canvas.width, this.canvas.height);
        this.frameDirty = true;
      } catch (err) {
        console.warn('Dots: obnova WebGL selhala', err);
      }
    });
    this.client = new SimClient();
    this.client.onFrame = (r) => this.onFrame(r);
    this.client.onError = (m) => console.error('Dots: chyba simulace –', m);
    this.stats = {
      fps: 60,
      n: 0,
      kinetic: 0,
      stepMs: 0,
      simRatio: 1,
      renderer: this.renderer.kind,
      sim: this.client.mode,
      threads: 0,
    };

    this.store.on(['settings'], (s) => {
      saveSettings(s.settings);
      const theme = this.resolveTheme(s.settings.canvasTheme);
      if (theme !== s.theme) this.store.set({ theme });
    });
    this.store.on(['theme'], () => this.renderer.clear());
    this.store.on(null, () => this.wake());
    this.store.on(['recipe', 'title', 'presetId', 'modified'], () => this.scheduleUrl());
  }

  // ------------------------------------------------------------------ setup

  private createRenderer(): Renderer {
    try {
      return new GLRenderer(this.canvas);
    } catch (err) {
      console.warn('Dots: WebGL2 nedostupné, kreslím přes Canvas 2D –', err);
      // a canvas that already has a (failed) webgl context cannot give a 2d one → replace it
      const fresh = this.canvas.cloneNode(false) as HTMLCanvasElement;
      this.canvas.replaceWith(fresh);
      this.canvas = fresh;
      return new Canvas2DRenderer(fresh);
    }
  }

  get canvasEl(): HTMLCanvasElement {
    return this.canvas;
  }

  private resolveTheme(t: CanvasTheme): 'dark' | 'light' {
    if (t === 'dark' || t === 'light') return t;
    return resolvedTheme();
  }

  /** Re-evaluate the page theme (called when the global theme setting changes). */
  refreshTheme(): void {
    this.store.set({ theme: this.resolveTheme(this.store.state.settings.canvasTheme) });
  }

  /** Decide the initial world: URL hash → last session → default preset. */
  start(): void {
    this.measure();
    const migrated = legacyMigrated();
    if (migrated > 0) {
      setTimeout(() => this.toast(`Tvoje uložená nastavení (${migrated}) najdeš v Galerii mezi oblíbenými.`, { ms: 7000 }), 1500);
    }
    const fromHash = parseHash(location.hash, this.store.state.recipe);
    const session = loadSession();
    let initial: { recipe: Recipe; presetId: string | null; title: string; favId: string | null; modified: boolean };
    if (fromHash.recipe) {
      initial = { recipe: fromHash.recipe, presetId: null, favId: null, title: fromHash.name ?? 'Sdílený svět', modified: false };
    } else if (fromHash.presetId && getPreset(fromHash.presetId)) {
      const p = getPreset(fromHash.presetId)!;
      initial = { recipe: this.presetRecipe(p), presetId: p.id, title: p.name, favId: null, modified: false };
    } else if (session && session.recipe) {
      const recipe = sanitizeRecipe(session.recipe, this.store.state.recipe);
      initial = {
        recipe,
        presetId: session.presetId ?? null,
        favId: session.favId ?? null,
        title: typeof session.title === 'string' ? session.title : 'Vlastní svět',
        modified: false,
      };
      // the particle count of a stored session belongs to a possibly different screen
      const want = this.defaultTotal(1);
      if (Math.abs(total(recipe.counts) - want) / want > 0.6) recipe.counts = scaleCounts(recipe.counts, want);
    } else {
      const p = getPreset(DEFAULT_PRESET_ID)!;
      initial = { recipe: this.presetRecipe(p), presetId: p.id, title: p.name, favId: null, modified: false };
    }
    // effective matrix first: store listeners (matrix editor) repaint from it synchronously
    this.setMatrixInstant(initial.recipe.matrix);
    this.store.set({ ...initial });
    this.onMatrixFrame();
    this.client.post({
      t: 'init',
      w: this.worldW,
      h: this.worldH,
      species: initial.recipe.species,
      matrix: initial.recipe.matrix,
      counts: initial.recipe.counts,
      layout: initial.recipe.layout,
      seed: initial.recipe.seed,
    });
    this.needSnapshot = true;
    this.bloom = 0;
    this.store.on(['recipe', 'presetId', 'title', 'favId'], () => this.scheduleSession());
    document.addEventListener('visibilitychange', this.onVisibility);
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Measure the canvas host and derive the world size. Returns true when it changed. */
  measure(): boolean {
    const r = this.host.getBoundingClientRect();
    const cssW = Math.max(1, Math.round(r.width));
    const cssH = Math.max(1, Math.round(r.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // cap the pixel count (huge 4K screens) – the glow does not need more
    const scale = Math.min(dpr, Math.sqrt(5_000_000 / (cssW * cssH)));
    this.renderer.resize(cssW * scale, cssH * scale);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    const zoom = this.zoom(cssW, cssH);
    const w = Math.round(cssW / zoom);
    const h = Math.round(cssH / zoom);
    this.cssW = cssW;
    this.cssH = cssH;
    if (w === this.worldW && h === this.worldH) return false;
    this.worldW = w;
    this.worldH = h;
    return true;
  }

  private zoom(cssW = this.cssW, cssH = this.cssH): number {
    const z = this.store.state.settings.zoom;
    if (z > 0) return z;
    const m = Math.min(cssW, cssH);
    return m < 520 ? 0.8 : m < 800 ? 0.9 : 1;
  }

  /** CSS px per world unit. */
  get viewScale(): number {
    return this.cssW / this.worldW;
  }

  get world(): { w: number; h: number } {
    return { w: this.worldW, h: this.worldH };
  }

  onResize(): void {
    if (this.measure()) {
      this.client.post({ t: 'resize', w: this.worldW, h: this.worldH });
      this.needSnapshot = true;
    }
    this.renderer.clear();
    this.wake();
  }

  /** Default particle count for the current world at a density multiplier. */
  defaultTotal(density = 1): number {
    const area = (this.worldW * this.worldH) / 1e6;
    return clamp(Math.round(area * BASE_DENSITY * density), 200, MAX_TOTAL);
  }

  presetRecipe(p: Preset, sum = this.defaultTotal(p.density ?? 1)): Recipe {
    return {
      species: p.species,
      matrix: p.matrix.slice(),
      counts: p.weights ? weightedCounts(p.weights, sum) : equalCounts(p.species, sum),
      physics: presetPhysics(p),
      layout: p.layout ?? 'random',
      seed: p.seed ?? randomSeed(),
    };
  }

  // ------------------------------------------------------------------ main loop

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    let dt = now - this.last;
    this.last = now;
    if (dt > 250) dt = STEP_MS; // returning from a stall
    const s = this.store.state;

    // fps
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 500) {
      this.stats.fps = (this.fpsFrames * 1000) / this.fpsTime;
      this.fpsFrames = 0;
      this.fpsTime = 0;
      this.onFrameStats(this.stats);
    }

    this.updateMorph(now);
    if (s.autoplay !== 'off' && s.running) {
      this.autoMs += dt;
      if (this.autoMs >= AUTO_MS[s.autoplay]) {
        this.autoMs = 0;
        this.autoStep(s.autoplay);
      }
    }

    const speed = s.settings.speed;
    if (s.running) this.acc += dt * speed;
    const maxBatch = Math.min(8, Math.ceil(3 * speed));
    if (!this.client.inFlight) {
      let steps = Math.floor(this.acc / STEP_MS);
      if (!s.running) steps = this.pendingSteps;
      if (steps > 0 || this.needSnapshot) {
        const k = Math.min(steps, maxBatch);
        if (s.running) {
          this.acc -= k * STEP_MS;
          if (this.acc > STEP_MS * maxBatch) this.acc = STEP_MS * maxBatch; // drop unpayable debt
        } else {
          this.pendingSteps = 0;
        }
        this.requestFrame(k);
      }
    } else if (this.acc > STEP_MS * maxBatch * 2) {
      this.acc = STEP_MS * maxBatch * 2;
    }
    if (s.running) this.trackDesired(now, dt * speed);

    // draw – while paused and nothing changes, stop redrawing once the trails have settled
    // (the last picture stays on screen; saves battery)
    if (this.bloom < 1 && this.frame) this.bloom = Math.min(1, this.bloom + dt / 900);
    const busy = s.running || this.frameDirty || this.brushes.size > 0 || this.morphDur > 0 || this.bloom < 1 || this.onAfterDraw !== null;
    if (busy) this.idleUntil = now + 2500;
    if (now < this.idleUntil) {
      this.renderer.draw(this.frameDirty ? this.frame : null, this.look(), dt);
      this.onAfterDraw?.(this.canvas);
      this.frameDirty = false;
    }
  };

  private idleUntil = 0;

  /** Force a few seconds of redraws (settings changed while paused, resize, …). */
  wake(): void {
    this.idleUntil = performance.now() + 2500;
  }

  private look(): LookParams {
    const s = this.store.state;
    const st = s.settings;
    return {
      theme: s.theme,
      colors: speciesColors(getPalette(st.palette), s.theme, s.recipe.species),
      trails: st.trails,
      glow: st.glow,
      size: st.size,
      bonds: st.bonds,
      bloom: this.reducedMotion ? 1 : easeOut(this.bloom),
      vignette: st.vignette,
    };
  }

  /** Colours currently used for the species (theme + palette aware). */
  colors(theme = this.store.state.theme) {
    return this.colorsFor(this.store.state.recipe.species, theme);
  }

  colorsFor(species: number, theme = this.store.state.theme) {
    return speciesColors(getPalette(this.store.state.settings.palette), theme, species);
  }

  private requestFrame(steps: number): void {
    const s = this.store.state;
    const S = s.recipe.species;
    const matrix = new Float32Array(S * S);
    for (let i = 0; i < S * S; i++) matrix[i] = this.effective[i];
    const brushes = s.running || steps > 0 ? [...this.brushes.values()] : [];
    const rec = this.recycle;
    this.recycle = null;
    this.client.post(
      {
        t: 'frame',
        id: ++this.frameId,
        steps,
        species: S,
        matrix,
        physics: s.recipe.physics,
        brushes,
        bonds: s.settings.bonds,
        recycle: rec ? { pos: rec.pos.buffer as ArrayBuffer, spc: rec.spc.buffer as ArrayBuffer, bnd: rec.bnd.buffer as ArrayBuffer } : undefined,
      },
      rec ? [rec.pos.buffer as ArrayBuffer, rec.spc.buffer as ArrayBuffer, rec.bnd.buffer as ArrayBuffer] : [],
    );
    this.needSnapshot = false;
  }

  private onFrame(r: FrameResult): void {
    // the previous frame's buffers go back to the worker with the next request
    if (this.frame && this.frame !== (r as FrameData)) this.recycle = this.frame as FrameResult;
    this.frame = r;
    this.frameDirty = true;
    this.stats.n = r.n;
    if (r.steps > 0) this.stats.threads = r.threads;
    if (r.steps > 0) {
      this.stats.stepMs = this.stats.stepMs * 0.85 + r.stepMs * 0.15;
      this.stats.kinetic = r.kinetic;
      this.keHistory[this.keHead] = r.kinetic;
      this.keHead = (this.keHead + 1) % this.keHistory.length;
      this.tuneDone += r.steps;
    }
    // keep recipe counts in sync with brush spawning / erasing
    const now = performance.now();
    if (now > this.countsPendingUntil && now - this.lastCountSync > 250) {
      const rc = this.store.state.recipe.counts;
      if (r.counts.length === rc.length && r.counts.some((c, i) => c !== rc[i])) {
        this.lastCountSync = now;
        this.store.set({ recipe: { ...this.store.state.recipe, counts: r.counts.slice() }, modified: true });
      }
    }
  }

  // ------------------------------------------------------------------ adaptive particle count

  private trackDesired(now: number, simMs: number): void {
    if (this.tuneStart === 0) this.tuneStart = now;
    this.tuneDesired += simMs / STEP_MS;
    const elapsed = now - this.tuneStart;
    if (elapsed < 2000) return;
    const ratio = this.tuneDesired > 0 ? this.tuneDone / this.tuneDesired : 1;
    this.stats.simRatio = Math.min(1, ratio);
    const s = this.store.state;
    const n = total(s.recipe.counts);
    if (
      s.settings.autoTune &&
      now > this.tuneCooldownUntil &&
      ratio < 0.8 &&
      this.brushes.size === 0 &&
      n > 500 &&
      document.visibilityState === 'visible'
    ) {
      const factor = clamp(ratio * 0.95, 0.55, 0.88);
      const target = Math.max(500, Math.round(n * factor));
      const counts = scaleCounts(s.recipe.counts, target);
      this.setCounts(counts, false);
      this.tuneCooldownUntil = now + 3000;
      if (!this.tunedOnce) {
        this.tunedOnce = true;
        this.toast(`Aby simulace běžela plynule, ubral jsem částice na ${target.toLocaleString('cs-CZ')}.`, {
          action: 'Vypnout',
          onAction: () => this.updateSettings({ autoTune: false }),
          ms: 6000,
        });
      }
    }
    this.tuneStart = now;
    this.tuneDesired = 0;
    this.tuneDone = 0;
  }

  private resetTune(delayMs = 1500): void {
    this.tuneStart = 0;
    this.tuneDesired = 0;
    this.tuneDone = 0;
    this.tuneCooldownUntil = performance.now() + delayMs;
  }

  // ------------------------------------------------------------------ visibility

  private onVisibility = () => {
    const s = this.store.state;
    if (document.hidden) {
      this.hiddenPaused = s.running;
      if (s.running) this.store.set({ running: false });
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    } else {
      if (this.hiddenPaused) this.store.set({ running: true });
      this.hiddenPaused = false;
      this.last = performance.now();
      this.acc = 0;
      this.resetTune();
      if (!this.raf) this.raf = requestAnimationFrame(this.loop);
    }
  };

  // ------------------------------------------------------------------ matrix morph

  private setMatrixInstant(m: readonly number[]): void {
    this.morphDur = 0;
    this.effective.fill(0);
    for (let i = 0; i < m.length; i++) this.effective[i] = m[i];
    this.morphTo = m.slice();
  }

  private morphTo_(m: readonly number[], ms = MORPH_MS): void {
    const S = this.store.state.recipe.species;
    if (this.reducedMotion || ms <= 0 || this.morphTo.length !== m.length) {
      this.setMatrixInstant(m);
      this.onMatrixFrame();
      return;
    }
    this.morphFrom = Array.from(this.effective.subarray(0, S * S));
    this.morphTo = m.slice();
    this.morphStart = performance.now();
    this.morphDur = ms;
  }

  private updateMorph(now: number): void {
    if (this.morphDur <= 0) return;
    let t = (now - this.morphStart) / this.morphDur;
    if (t >= 1) {
      t = 1;
      this.morphDur = 0;
    }
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    for (let i = 0; i < this.morphTo.length; i++) {
      const a = this.morphFrom[i] ?? 0;
      this.effective[i] = a + (this.morphTo[i] - a) * e;
    }
    this.onMatrixFrame();
  }

  get morphing(): boolean {
    return this.morphDur > 0;
  }

  // ------------------------------------------------------------------ history

  private snapshot(): Snapshot {
    const r = this.store.state.recipe;
    return { species: r.species, matrix: r.matrix.slice(), counts: r.counts.slice() };
  }

  private pushHistory(): void {
    // any edit by the user ends the hands-free mode
    if (!this.autoAction && this.store.state.autoplay !== 'off') this.setAutoplay('off');
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
    this.store.set({ canUndo: true, canRedo: false });
  }

  undo(): void {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.snapshot());
    this.restore(prev);
    this.store.set({ canUndo: this.undoStack.length > 0, canRedo: true });
  }

  redo(): void {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.snapshot());
    this.restore(next);
    this.store.set({ canUndo: true, canRedo: this.redoStack.length > 0 });
  }

  private restore(s: Snapshot): void {
    const r = this.store.state.recipe;
    if (s.species !== r.species) {
      this.applySpecies(s.species, s.matrix, s.counts);
    } else {
      this.store.set({ recipe: { ...r, matrix: s.matrix.slice() }, modified: true });
      this.morphTo_(s.matrix, 300);
    }
  }

  // ------------------------------------------------------------------ autoplay

  private autoMs = 0;
  private autoAction = false;

  setAutoplay(mode: Autoplay): void {
    this.autoMs = 0;
    this.store.set({ autoplay: mode });
    if (mode !== 'off' && !this.store.state.running) this.togglePause(true);
  }

  /** 0…1 progress to the next automatic change. */
  get autoProgress(): number {
    const a = this.store.state.autoplay;
    return a === 'off' ? 0 : Math.min(1, this.autoMs / AUTO_MS[a]);
  }

  private autoStep(mode: Exclude<Autoplay, 'off'>): void {
    this.autoAction = true;
    try {
      if (mode === 'gallery') {
        const i = PRESETS.findIndex((p) => p.id === this.store.state.presetId);
        this.applyPreset(PRESETS[(i + 1) % PRESETS.length].id);
      } else {
        const r = this.store.state.recipe;
        this.pushHistory();
        this.touch({ ...r, matrix: mutateMatrix(r.matrix, r.species, this.rng, 0.22, 0.22) });
        this.morphTo_(this.store.state.recipe.matrix, 3500);
        if (this.store.state.title !== 'Evoluce') this.store.set({ title: 'Evoluce', presetId: null, favId: null, modified: false });
      }
    } finally {
      this.autoAction = false;
    }
  }

  // ------------------------------------------------------------------ actions: worlds

  /** Load a complete recipe (preset, favourite, shared link). */
  applyRecipe(
    recipe: Recipe,
    meta: { presetId?: string | null; favId?: string | null; title: string },
    opts: { reseed?: boolean; morph?: boolean } = {},
  ): void {
    const prev = this.store.state.recipe;
    this.pushHistory();
    const r = cloneRecipe(recipe);
    r.physics = clampPhysics(r.physics);
    this.store.set({
      recipe: r,
      presetId: meta.presetId ?? null,
      favId: meta.favId ?? null,
      title: meta.title,
      modified: false,
    });
    const reseed = opts.reseed ?? true;
    if (r.species !== prev.species) {
      this.setMatrixInstant(r.matrix);
      this.client.post({ t: 'species', species: r.species, counts: r.counts });
    } else if (opts.morph === false) {
      this.setMatrixInstant(r.matrix);
    } else {
      this.morphTo_(r.matrix);
    }
    this.onMatrixFrame();
    if (reseed) {
      this.client.post({ t: 'reseed', counts: r.counts, layout: r.layout, seed: r.seed });
      this.bloom = 0;
      this.renderer.clear();
    } else {
      this.client.post({ t: 'counts', counts: r.counts });
    }
    this.countsPendingUntil = performance.now() + 400;
    this.needSnapshot = true;
    this.resetTune(2500);
  }

  applyPreset(id: string): void {
    const p = getPreset(id);
    if (!p) return;
    this.applyRecipe(this.presetRecipe(p, this.defaultTotal(p.density ?? 1)), { presetId: p.id, title: p.name });
  }

  applyFavorite(id: string): void {
    const f = this.store.state.favorites.find((x) => x.id === id);
    if (!f) return;
    this.applyRecipe({ ...f.recipe, seed: randomSeed() }, { favId: f.id, title: f.name });
    if (typeof f.bonds === 'boolean') this.updateSettings({ bonds: f.bonds });
  }

  /** Mark the world as edited (keeps the title, adds the "upraveno" badge). */
  private touch(recipe: Recipe): void {
    this.store.set({ recipe, modified: true });
  }

  setMatrix(m: number[], opts: { history?: boolean; morph?: boolean } = {}): void {
    if (opts.history !== false) this.pushHistory();
    const r = this.store.state.recipe;
    this.touch({ ...r, matrix: m.slice() });
    if (opts.morph === false) {
      this.setMatrixInstant(m);
      this.onMatrixFrame();
    } else this.morphTo_(m);
  }

  /** Live edit of one cell (dragging) – no morph, history handled by the caller. */
  setCell(index: number, value: number): void {
    const r = this.store.state.recipe;
    const m = r.matrix.slice();
    m[index] = round2(clamp(value, -1, 1));
    this.morphDur = 0;
    this.effective[index] = m[index];
    for (let i = 0; i < m.length; i++) this.effective[i] = m[i];
    this.morphTo = m.slice();
    this.touch({ ...r, matrix: m });
  }

  beginCellEdit(): void {
    this.pushHistory();
  }

  randomize(): void {
    const S = this.store.state.recipe.species;
    this.setMatrix(randomMatrix(S, this.rng));
    this.store.set({ title: 'Náhodný svět', presetId: null, favId: null, modified: false });
  }

  mutate(): void {
    const r = this.store.state.recipe;
    this.setMatrix(mutateMatrix(r.matrix, r.species, this.rng));
  }

  symmetrize(): void {
    const r = this.store.state.recipe;
    this.setMatrix(symmetricMatrix(r.matrix, r.species));
  }

  invert(): void {
    this.setMatrix(invertMatrix(this.store.state.recipe.matrix));
  }

  transpose(): void {
    const r = this.store.state.recipe;
    this.setMatrix(transposeMatrix(r.matrix, r.species));
  }

  zero(): void {
    this.setMatrix(zeroMatrix(this.store.state.recipe.species), { morph: true });
  }

  setSpecies(n: number): void {
    const r = this.store.state.recipe;
    const S = clampSpecies(n);
    if (S === r.species) return;
    this.pushHistory();
    const matrix = resizeMatrix(r.matrix, r.species, S, this.rng);
    const avg = r.counts.length ? Math.round(total(r.counts) / r.counts.length) : 500;
    // keep the overall density: redistribute the same total over the new species count
    const counts = scaleCounts(resizeCounts(r.counts, S).map((c, i) => (i < r.species ? c : avg)), total(r.counts));
    this.applySpecies(S, matrix, counts);
  }

  private applySpecies(S: number, matrix: number[], counts: number[]): void {
    const r = this.store.state.recipe;
    const sel = this.store.state.selCell;
    this.touch({ ...r, species: S, matrix, counts });
    this.setMatrixInstant(matrix);
    this.onMatrixFrame();
    this.client.post({ t: 'species', species: S, counts });
    this.countsPendingUntil = performance.now() + 400;
    this.needSnapshot = true;
    if (sel >= S * S) this.store.set({ selCell: -1 });
    this.resetTune();
  }

  setCounts(counts: number[], markModified = true): void {
    const r = this.store.state.recipe;
    const c = counts.map((v) => Math.max(0, Math.round(v)));
    if (total(c) > MAX_TOTAL) c.splice(0, c.length, ...scaleCounts(c, MAX_TOTAL));
    this.store.set({ recipe: { ...r, counts: c }, modified: markModified ? true : this.store.state.modified });
    this.client.post({ t: 'counts', counts: c });
    this.countsPendingUntil = performance.now() + 400;
    this.needSnapshot = true;
    this.resetTune();
  }

  setTotal(n: number): void {
    this.setCounts(scaleCounts(this.store.state.recipe.counts, clamp(Math.round(n), 0, MAX_TOTAL)));
  }

  equalizeCounts(): void {
    const r = this.store.state.recipe;
    this.setCounts(equalCounts(r.species, total(r.counts)));
  }

  randomizeCounts(): void {
    const r = this.store.state.recipe;
    this.setCounts(randomCounts(r.species, total(r.counts), this.rng));
  }

  /** Reset the particle count to what fits this screen. */
  resetDensity(): void {
    this.setTotal(this.defaultTotal(getPreset(this.store.state.presetId)?.density ?? 1));
  }

  setPhysics(patch: Partial<Physics>): void {
    const r = this.store.state.recipe;
    this.touch({ ...r, physics: clampPhysics({ ...r.physics, ...patch }) });
  }

  reseed(layout?: Layout): void {
    const r = this.store.state.recipe;
    const recipe = { ...r, layout: layout ?? r.layout, seed: randomSeed() };
    this.store.set({ recipe });
    this.client.post({ t: 'reseed', counts: r.counts, layout: recipe.layout, seed: recipe.seed });
    this.bloom = 0;
    this.renderer.clear();
    this.needSnapshot = true;
    this.resetTune();
  }

  shake(): void {
    this.client.post({ t: 'shake', amount: 3 });
    this.needSnapshot = true;
  }

  /** Random everything: matrix, species count, proportions. */
  surprise(): void {
    const S = 3 + Math.floor(this.rng() * 5);
    const recipe: Recipe = {
      species: S,
      matrix: randomMatrix(S, this.rng),
      counts: randomCounts(S, this.defaultTotal(0.9 + this.rng() * 0.4), this.rng),
      physics: clampPhysics({
        ...this.store.state.recipe.physics,
        friction: 0.8 + this.rng() * 0.12,
        rMax: 70 + Math.round(this.rng() * 50),
      }),
      layout: 'random',
      seed: randomSeed(),
    };
    this.applyRecipe(recipe, { title: 'Překvapení' });
  }

  // ------------------------------------------------------------------ actions: playback

  togglePause(force?: boolean): void {
    const running = force ?? !this.store.state.running;
    this.store.set({ running });
    if (running) {
      this.acc = 0;
      this.resetTune();
    }
  }

  stepOnce(): void {
    if (this.store.state.running) this.store.set({ running: false });
    this.pendingSteps = Math.min(8, this.pendingSteps + 1);
  }

  updateSettings(patch: Partial<Settings>): void {
    const prev = this.store.state.settings;
    const next = { ...prev, ...patch };
    this.store.set({ settings: next });
    if (patch.zoom !== undefined && patch.zoom !== prev.zoom) {
      const before = this.worldW * this.worldH;
      if (this.measure()) {
        this.client.post({ t: 'resize', w: this.worldW, h: this.worldH });
        // keep the density: more space → more particles
        const ratio = (this.worldW * this.worldH) / before;
        this.setCounts(scaleCounts(this.store.state.recipe.counts, Math.round(total(this.store.state.recipe.counts) * ratio)), false);
      }
    }
  }

  // ------------------------------------------------------------------ favourites

  saveFavorite(name: string): Favorite {
    const s = this.store.state;
    const fav: Favorite = {
      id: newId(),
      name: name.trim().slice(0, 40) || this.suggestName(),
      created: Date.now(),
      recipe: cloneRecipe(s.recipe),
      bonds: s.settings.bonds,
      thumb: this.thumbnail(),
    };
    const favorites = [fav, ...s.favorites];
    if (!saveFavorites(favorites)) this.toast('Úložiště prohlížeče je plné – oblíbené se nemusí zachovat.');
    this.store.set({ favorites, favId: fav.id, title: fav.name, modified: false, presetId: null });
    return fav;
  }

  suggestName(): string {
    const s = this.store.state;
    const base = s.title && s.title !== 'Náhodný svět' ? s.title : 'Můj svět';
    let n = 1;
    let name = base;
    while (s.favorites.some((f) => f.name === name)) name = `${base} ${++n}`;
    return name;
  }

  deleteFavorite(id: string): Favorite | undefined {
    const s = this.store.state;
    const f = s.favorites.find((x) => x.id === id);
    const favorites = s.favorites.filter((x) => x.id !== id);
    saveFavorites(favorites);
    this.store.set({ favorites, favId: s.favId === id ? null : s.favId });
    return f;
  }

  restoreFavorite(f: Favorite, index = 0): void {
    const favorites = this.store.state.favorites.slice();
    favorites.splice(index, 0, f);
    saveFavorites(favorites);
    this.store.set({ favorites });
  }

  /** Merge imported favourites (skips exact duplicates). Returns how many were added. */
  importFavorites(items: Favorite[]): number {
    const cur = this.store.state.favorites;
    const sig = (f: Favorite) => `${f.name}|${f.recipe.species}|${f.recipe.matrix.join(',')}`;
    const seen = new Set(cur.map(sig));
    const add = items.filter((f) => !seen.has(sig(f))).map((f) => ({ ...f, id: newId() }));
    if (add.length === 0) return 0;
    const favorites = [...add, ...cur];
    if (!saveFavorites(favorites)) this.toast('Úložiště prohlížeče je plné – některé náhledy se neuložily.');
    this.store.set({ favorites });
    return add.length;
  }

  renameFavorite(id: string, name: string): void {
    const favorites = this.store.state.favorites.map((f) => (f.id === id ? { ...f, name: name.trim().slice(0, 40) || f.name } : f));
    saveFavorites(favorites);
    const s = this.store.state;
    this.store.set({ favorites, title: s.favId === id ? favorites.find((f) => f.id === id)!.name : s.title });
  }

  setFavoriteThumb(id: string, thumb: string): void {
    const favorites = this.store.state.favorites.map((f) => (f.id === id ? { ...f, thumb } : f));
    saveFavorites(favorites);
    this.store.set({ favorites });
  }

  // ------------------------------------------------------------------ capture / share

  /** Render now and grab the picture. */
  captureCanvas(maxWidth?: number): HTMLCanvasElement {
    this.renderer.draw(this.frame, this.look(), 0);
    return this.renderer.capture(maxWidth);
  }

  thumbnail(): string | undefined {
    try {
      const c = this.captureCanvas(320);
      // crop to 16:10 around the centre
      const out = document.createElement('canvas');
      out.width = 240;
      out.height = 150;
      const ctx = out.getContext('2d')!;
      const ar = 240 / 150;
      let sw = c.width;
      let sh = c.width / ar;
      if (sh > c.height) {
        sh = c.height;
        sw = sh * ar;
      }
      ctx.drawImage(c, (c.width - sw) / 2, (c.height - sh) / 2, sw, sh, 0, 0, 240, 150);
      const webp = out.toDataURL('image/webp', 0.82);
      return webp.startsWith('data:image/webp') ? webp : out.toDataURL('image/jpeg', 0.82);
    } catch {
      return undefined;
    }
  }

  shareUrl(): string {
    const s = this.store.state;
    const hash =
      s.presetId && !s.modified
        ? buildHash({ presetId: s.presetId })
        : buildHash({ recipe: s.recipe, name: s.title || undefined });
    return `${location.origin}${location.pathname}${hash}`;
  }

  private scheduleUrl(): void {
    clearTimeout(this.urlTimer);
    this.urlTimer = window.setTimeout(() => {
      const url = this.shareUrl();
      if (url !== location.href) history.replaceState(null, '', url);
    }, 400);
  }

  private scheduleSession(): void {
    clearTimeout(this.sessionTimer);
    this.sessionTimer = window.setTimeout(() => {
      const s = this.store.state;
      saveSession({ recipe: s.recipe, presetId: s.presetId, favId: s.favId, title: s.title });
    }, 800);
  }

  // ------------------------------------------------------------------ pointer brushes

  /** Convert client (CSS px) coordinates to world units. */
  toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - r.left) / r.width) * this.worldW,
      y: ((clientY - r.top) / r.height) * this.worldH,
    };
  }

  /** Brush radius in world units for a given size multiplier. */
  brushRadius(mult = this.store.state.settings.brushSize): number {
    const m = Math.min(this.cssW, this.cssH);
    const px = clamp(m * 0.16, 80, 150) * mult;
    return px / this.viewScale;
  }

  setBrush(id: number, b: Brush | null): void {
    if (b) this.brushes.set(id, b);
    else this.brushes.delete(id);
    if (b && !this.store.state.running) this.needSnapshot = true;
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.client.dispose();
    this.renderer.dispose();
  }
}

function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

