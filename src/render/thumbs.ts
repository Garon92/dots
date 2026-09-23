import { mulberry32 } from '../sim/rng';
import { clampPhysics, type Layout, type Physics } from '../sim/types';
import { World } from '../sim/world';
import type { Rgb } from '../state/palette';

export interface ThumbJob {
  species: number;
  matrix: number[];
  counts: number[];
  physics: Physics;
  layout: Layout;
  seed: number;
  /** World size used for the preview simulation. */
  w: number;
  h: number;
  steps: number;
  /** How many of the last steps to overlay as a motion trail. */
  trail: number;
  /** Keep every n-th step for the trail (default 2). */
  trailEvery?: number;
}

export interface ThumbFrames {
  w: number;
  h: number;
  frames: { n: number; pos: Float32Array; spc: Uint8Array }[];
}

/** Run a small simulation and keep the last `trail` frames. Pure – runs in a worker or in tests. */
export function simulateThumb(job: ThumbJob): ThumbFrames {
  const rng = mulberry32(job.seed);
  const world = new World(job.w, job.h, 2048);
  world.setMatrix(job.species, job.matrix);
  world.reseed(job.counts, job.layout, rng);
  const physics = clampPhysics(job.physics);
  const frames: ThumbFrames['frames'] = [];
  const trailEvery = job.trailEvery ?? 2;
  for (let s = 0; s < job.steps; s++) {
    world.step({ physics }, rng);
    const left = job.steps - 1 - s;
    if (left % trailEvery === 0 && left < job.trail * trailEvery) {
      const n = world.n;
      const pos = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        pos[i * 2] = world.x[i];
        pos[i * 2 + 1] = world.y[i];
      }
      frames.push({ n, pos, spc: world.sp.slice(0, n) });
    }
  }
  return { w: job.w, h: job.h, frames };
}

const spriteCache = new Map<string, HTMLCanvasElement>();

function sprite(c: Rgb, theme: 'dark' | 'light'): HTMLCanvasElement {
  const key = `${theme}:${c.join(',')}`;
  let s = spriteCache.get(key);
  if (s) return s;
  const R = 24;
  s = document.createElement('canvas');
  s.width = s.height = R * 2;
  const g = s.getContext('2d')!;
  const grad = g.createRadialGradient(R, R, 0, R, R, R);
  const [r, gg, b] = c;
  if (theme === 'dark') {
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.95)`);
    grad.addColorStop(0.16, `rgba(${r},${gg},${b},0.55)`);
    grad.addColorStop(0.4, `rgba(${r},${gg},${b},0.12)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  } else {
    grad.addColorStop(0, `rgba(${r},${gg},${b},0.95)`);
    grad.addColorStop(0.22, `rgba(${r},${gg},${b},0.7)`);
    grad.addColorStop(0.45, `rgba(${r},${gg},${b},0.12)`);
    grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, R * 2, R * 2);
  spriteCache.set(key, s);
  return s;
}

export const THUMB_BG = { dark: '#0a0e12', light: '#f6f3ec' } as const;

/** Paint preview frames into a 2D canvas (oldest frames faint, the last one bright). */
export function drawThumb(
  ctx: CanvasRenderingContext2D,
  data: ThumbFrames,
  colors: readonly Rgb[],
  theme: 'dark' | 'light',
  dotRadius = 7,
): void {
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = THUMB_BG[theme];
  ctx.fillRect(0, 0, cw, ch);
  const sx = cw / data.w;
  const sy = ch / data.h;
  const size = dotRadius * 2 * Math.max(sx, sy);
  const half = size / 2;
  const sprites = colors.map((c) => sprite(c, theme));
  // light: normal layering like paint (multiply would turn dense clusters black)
  ctx.globalCompositeOperation = theme === 'dark' ? 'lighter' : 'source-over';
  const nf = data.frames.length;
  data.frames.forEach((f, k) => {
    ctx.globalAlpha = (nf === 1 ? 1 : (theme === 'dark' ? 0.15 : 0.1) + (theme === 'dark' ? 0.85 : 0.9) * ((k + 1) / nf) ** 3) * (theme === 'dark' ? 1 : 0.55);
    for (let i = 0; i < f.n; i++) {
      const spr = sprites[f.spc[i]] ?? sprites[0];
      ctx.drawImage(spr, f.pos[i * 2] * sx - half, f.pos[i * 2 + 1] * sy - half, size, size);
    }
  });
  ctx.restore();
}
