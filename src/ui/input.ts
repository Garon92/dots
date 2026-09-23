import type { App } from '../app/app';
import type { Brush, BrushMode } from '../sim/types';
import { h } from './dom';

const GESTURE_ID = -1;

/**
 * Pointer input on the canvas.
 *  mouse/pen: left = selected tool, right = the opposite force, Shift = attract, Alt/Ctrl = swirl,
 *             wheel = brush size
 *  touch:     one finger = selected tool, two fingers = attract between them (spread = bigger),
 *             three+ fingers = vortex
 */
export class CanvasInput {
  readonly ring: HTMLElement;
  private pointers = new Map<number, { x: number; y: number; type: string; mode: BrushMode }>();
  private hover: { x: number; y: number } | null = null;
  private shift = false;
  onFirstUse: () => void = () => {};
  private used = false;

  constructor(
    private app: App,
    private canvas: HTMLCanvasElement,
  ) {
    this.ring = h('div', { class: 'brush-ring', 'aria-hidden': 'true' });
    canvas.addEventListener('pointerdown', this.down);
    canvas.addEventListener('pointermove', this.move);
    canvas.addEventListener('pointerup', this.up);
    canvas.addEventListener('pointercancel', this.up);
    canvas.addEventListener('lostpointercapture', this.up);
    canvas.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.pointers.has(e.pointerId)) {
        this.hover = null;
        this.renderRing();
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', this.wheel, { passive: false });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Shift' && !this.shift) {
        this.shift = true;
        this.refreshModes();
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') {
        this.shift = false;
        this.refreshModes();
      }
    });
    window.addEventListener('blur', () => this.clearAll());
    app.store.on(['settings'], () => this.renderRing());
  }

  /** The canvas element may be replaced (renderer fallback). */
  setCanvas(c: HTMLCanvasElement): void {
    this.canvas = c;
  }

  private modeFor(e: PointerEvent): BrushMode {
    const tool = this.app.store.state.settings.tool;
    if (e.pointerType !== 'touch') {
      if (e.button === 2 || (e.buttons & 2) === 2) return tool === 'attract' ? 'repel' : 'attract';
      if (e.shiftKey || this.shift) return 'attract';
      if (e.altKey || e.ctrlKey) return 'swirl';
    }
    return tool;
  }

  private down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType, mode: this.modeFor(e) });
    if (!this.used) {
      this.used = true;
      this.onFirstUse();
    }
    this.update();
  };

  private move = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (p) {
      p.x = e.clientX;
      p.y = e.clientY;
      this.update();
    } else if (e.pointerType === 'mouse') {
      this.hover = { x: e.clientX, y: e.clientY };
      this.renderRing();
    }
  };

  private up = (e: PointerEvent) => {
    if (!this.pointers.has(e.pointerId)) return;
    this.pointers.delete(e.pointerId);
    this.app.setBrush(e.pointerId, null);
    if (e.pointerType === 'mouse') this.hover = { x: e.clientX, y: e.clientY };
    this.update();
  };

  private wheel = (e: WheelEvent) => {
    if (e.ctrlKey) return; // browser zoom / pinch on trackpads
    e.preventDefault();
    const s = this.app.store.state.settings.brushSize;
    const next = Math.max(0.4, Math.min(2.5, s * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    this.app.updateSettings({ brushSize: Math.round(next * 100) / 100 });
    this.hover = { x: e.clientX, y: e.clientY };
    this.renderRing();
  };

  private refreshModes(): void {
    for (const p of this.pointers.values()) {
      if (p.type === 'touch') continue;
      p.mode = this.shift ? 'attract' : this.app.store.state.settings.tool;
    }
    this.update();
  }

  clearAll(): void {
    for (const id of this.pointers.keys()) this.app.setBrush(id, null);
    this.app.setBrush(GESTURE_ID, null);
    this.pointers.clear();
    this.update();
  }

  /** Recompute the brushes sent to the simulation from the active pointers. */
  private update(): void {
    const touches = [...this.pointers.entries()].filter(([, p]) => p.type === 'touch');
    const others = [...this.pointers.entries()].filter(([, p]) => p.type !== 'touch');
    const s = this.app.store.state.settings;
    const baseR = this.app.brushRadius();
    // non-touch pointers: one brush each
    for (const [id, p] of others) this.app.setBrush(id, this.brush(p.x, p.y, baseR, p.mode, s.brushSpecies));

    if (touches.length >= 2) {
      for (const [id] of touches) this.app.setBrush(id, null);
      const cx = touches.reduce((a, [, p]) => a + p.x, 0) / touches.length;
      const cy = touches.reduce((a, [, p]) => a + p.y, 0) / touches.length;
      const spread = Math.max(...touches.map(([, p]) => Math.hypot(p.x - cx, p.y - cy)));
      const r = Math.max(baseR, Math.min(baseR * 2.5, (spread * 1.25) / this.app.viewScale));
      this.app.setBrush(GESTURE_ID, this.brush(cx, cy, r, touches.length >= 3 ? 'swirl' : 'attract', s.brushSpecies));
    } else {
      this.app.setBrush(GESTURE_ID, null);
      for (const [id, p] of touches) this.app.setBrush(id, this.brush(p.x, p.y, baseR, p.mode, s.brushSpecies));
    }
    this.renderRing();
  }

  private brush(clientX: number, clientY: number, r: number, mode: BrushMode, species: number): Brush {
    const w = this.app.toWorld(clientX, clientY);
    return { x: w.x, y: w.y, r, mode, strength: mode === 'swirl' ? 1.1 : 1, species };
  }

  private renderRing(): void {
    const brushes = [...this.app.brushes.values()];
    const stage = this.canvas.getBoundingClientRect();
    const ring = this.ring;
    let x: number;
    let y: number;
    let r: number;
    let mode: BrushMode;
    let active = false;
    if (brushes.length > 0) {
      const b = brushes[brushes.length - 1];
      const scale = this.app.viewScale;
      x = b.x * scale;
      y = b.y * scale;
      r = b.r * scale;
      mode = b.mode;
      active = true;
    } else if (this.hover) {
      x = this.hover.x - stage.left;
      y = this.hover.y - stage.top;
      r = this.app.brushRadius() * this.app.viewScale;
      mode = this.app.store.state.settings.tool;
    } else {
      ring.classList.remove('is-on', 'is-active');
      return;
    }
    if (mode === 'spawn' || mode === 'erase') r *= 0.6;
    ring.style.transform = `translate(${x - r}px, ${y - r}px)`;
    ring.style.width = ring.style.height = `${r * 2}px`;
    ring.dataset.mode = mode;
    ring.classList.add('is-on');
    ring.classList.toggle('is-active', active);
  }
}
