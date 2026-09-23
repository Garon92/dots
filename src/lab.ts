// Dev-only preset laboratory: renders presets (or random candidates) at several checkpoints.
import { simulateThumb, drawThumb } from './render/thumbs';
import { PRESETS, presetPhysics } from './state/presets';
import { getPalette, speciesColors } from './state/palette';
import { equalCounts, randomMatrix, weightedCounts } from './state/recipe';
import { mulberry32 } from './sim/rng';
import { DEFAULT_PHYSICS, type Layout, type Physics } from './sim/types';

const q = new URLSearchParams(location.search);
const checkpoints = (q.get('cp') ?? '700').split(',').map(Number);
const W = Number(q.get('w') ?? 960);
const H = Number(q.get('h') ?? 600);
const density = Number(q.get('density') ?? 2400);
const theme = (q.get('theme') ?? 'dark') as 'dark' | 'light';
const ids = q.get('ids')?.split(',');
const g = document.getElementById('g')!;
g.style.setProperty('--cols', q.get('cols') ?? String(checkpoints.length > 1 ? checkpoints.length : 4));
const total = Math.round((W * H * density) / 1e6);

type Item = { name: string; species: number; matrix: number[]; counts: number[]; physics: Physics; layout: Layout };
const items: Item[] = [];
const seeds = q.get('seeds');
if (q.get('cand')) {
  const list = await (await fetch('/dots/lab-candidates.json?' + Date.now())).json();
  for (const c of list) {
    const t = Math.round(total * (c.density ?? 1));
    items.push({ name: c.name, species: c.species, matrix: c.matrix, counts: c.weights ? weightedCounts(c.weights, t) : equalCounts(c.species, t), physics: { ...DEFAULT_PHYSICS, ...(c.physics ?? {}) }, layout: c.layout ?? 'random' });
  }
} else if (seeds) {
  for (const part of seeds.split(',')) {
    const [S, seed] = part.split(':').map(Number);
    const m = randomMatrix(S, mulberry32(seed));
    console.log(`seed ${S}:${seed}`, JSON.stringify(m));
    items.push({ name: `seed ${S}:${seed}`, species: S, matrix: m, counts: equalCounts(S, total), physics: { ...DEFAULT_PHYSICS }, layout: 'random' });
  }
} else if (q.get('random')) {
  const S = Number(q.get('species') ?? 6);
  const seed0 = Number(q.get('seed') ?? 1);
  for (let k = 0; k < Number(q.get('random')); k++) {
    const seed = seed0 + k;
    items.push({ name: `seed ${S}:${seed}`, species: S, matrix: randomMatrix(S, mulberry32(seed)), counts: equalCounts(S, total), physics: { ...DEFAULT_PHYSICS }, layout: 'random' });
  }
} else {
  for (const p of PRESETS) {
    if (ids && !ids.includes(p.id)) continue;
    const t = Math.round(total * (p.density ?? 1));
    items.push({ name: `${p.name} (${p.id})`, species: p.species, matrix: p.matrix, counts: p.weights ? weightedCounts(p.weights, t) : equalCounts(p.species, t), physics: presetPhysics(p), layout: p.layout ?? 'random' });
  }
}
const phys = q.get('phys');
if (phys) for (const it of items) Object.assign(it.physics, JSON.parse(phys));
const pal = getPalette(q.get('palette') ?? 'puvodni');
for (const it of items) {
  for (const steps of checkpoints) {
    await new Promise((r) => setTimeout(r, 0));
    const fig = document.createElement('figure');
    const c = document.createElement('canvas');
    c.width = W / 2;
    c.height = H / 2;
    const cap = document.createElement('figcaption');
    fig.append(c, cap);
    g.append(fig);
    const t0 = performance.now();
    const frames = simulateThumb({ ...it, seed: Number(q.get('s') ?? 5), w: W, h: H, steps, trail: 10 });
    drawThumb(c.getContext('2d')!, frames, speciesColors(pal, theme, it.species), theme, 7);
    cap.textContent = `${it.name} @${steps} — ${((performance.now() - t0) / steps).toFixed(2)} ms/krok`;
  }
}
document.body.dataset.done = '1';
