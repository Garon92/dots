import type { Rgb } from '../state/palette';
import { BG, type FrameData, type LookParams, type Renderer } from './types';

/** Fallback renderer for browsers without WebGL2: pre-baked glow sprites, like the original Dots. */
export class Canvas2DRenderer implements Renderer {
  readonly kind = 'canvas2d' as const;
  private ctx: CanvasRenderingContext2D;
  private sprites = new Map<string, HTMLCanvasElement>();
  private width = 1;
  private height = 1;
  private needsClear = true;
  private last: FrameData | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D není k dispozici');
    this.ctx = ctx;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.needsClear = true;
  }

  clear(): void {
    this.needsClear = true;
  }

  private sprite(c: Rgb, theme: 'dark' | 'light', glow: number): HTMLCanvasElement {
    const key = `${theme}|${c.join(',')}|${glow.toFixed(1)}`;
    let s = this.sprites.get(key);
    if (s) return s;
    const R = 32;
    s = document.createElement('canvas');
    s.width = s.height = R * 2;
    const g = s.getContext('2d')!;
    const grad = g.createRadialGradient(R, R, 0, R, R, R);
    const [r, gg, b] = c;
    const k = Math.min(1, 0.4 + glow * 0.5);
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.9)`);
    grad.addColorStop(0.22, `rgba(${r},${gg},${b},${0.55 * k + 0.2})`);
    grad.addColorStop(0.3, `rgba(${r},${gg},${b},${0.25 * k})`);
    grad.addColorStop(0.6, `rgba(${r},${gg},${b},${0.06 * k})`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, R * 2, R * 2);
    this.sprites.set(key, s);
    return s;
  }

  draw(frame: FrameData | null, look: LookParams, dtMs: number): void {
    if (frame) this.last = frame;
    const f = this.last;
    const ctx = this.ctx;
    const bg = BG[look.theme];
    const persist = look.trails <= 0.001 ? 0 : Math.pow(Math.min(0.97, look.trails * 0.95), Math.min(4, dtMs / (1000 / 60)));
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = this.needsClear || persist === 0 ? `rgb(${bg.join(',')})` : `rgba(${bg.join(',')},${1 - persist})`;
    ctx.fillRect(0, 0, this.width, this.height);
    this.needsClear = false;
    if (!f || f.n === 0) return;
    const sx = this.width / f.w;
    const sy = this.height / f.h;
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    ctx.globalCompositeOperation = look.theme === 'dark' ? 'lighter' : 'multiply';

    if (look.bonds && f.bondN > 0) {
      ctx.lineWidth = 1 / sx;
      const byColor = new Map<number, number[]>();
      for (let k = 0; k < f.bondN; k++) {
        const o = k * 6;
        const key = f.bnd[o + 5] | 0;
        let list = byColor.get(key);
        if (!list) byColor.set(key, (list = []));
        list.push(o);
      }
      for (const [key, list] of byColor) {
        const a = look.colors[(key >> 3) & 7] ?? look.colors[0];
        const b = look.colors[key & 7] ?? look.colors[0];
        ctx.strokeStyle = `rgba(${(a[0] + b[0]) >> 1},${(a[1] + b[1]) >> 1},${(a[2] + b[2]) >> 1},${0.25 * look.bloom})`;
        ctx.beginPath();
        for (const o of list) {
          ctx.moveTo(f.bnd[o], f.bnd[o + 1]);
          ctx.lineTo(f.bnd[o + 2], f.bnd[o + 3]);
        }
        ctx.stroke();
      }
    }

    const half = 9 * look.size * (0.55 + 0.45 * look.bloom);
    const size = half * 2;
    ctx.globalAlpha = 0.35 + 0.65 * look.bloom;
    const sprites = look.colors.map((c) => this.sprite(c, look.theme, look.glow));
    for (let i = 0; i < f.n; i++) {
      const s = sprites[f.spc[i]] ?? sprites[0];
      ctx.drawImage(s, f.pos[i * 2] - half, f.pos[i * 2 + 1] - half, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  capture(maxWidth = Infinity): HTMLCanvasElement {
    const scale = Math.min(1, maxWidth / this.width);
    const out = document.createElement('canvas');
    out.width = Math.round(this.width * scale);
    out.height = Math.round(this.height * scale);
    out.getContext('2d')!.drawImage(this.canvas, 0, 0, out.width, out.height);
    return out;
  }

  dispose(): void {}
}

export function createRenderer(canvas: HTMLCanvasElement, GL: new (c: HTMLCanvasElement) => Renderer): Renderer {
  try {
    return new GL(canvas);
  } catch (err) {
    console.warn('Dots: WebGL2 nedostupné, kreslím přes Canvas 2D –', err);
    return new Canvas2DRenderer(canvas);
  }
}
