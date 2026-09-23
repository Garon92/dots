import { gauss, type Rng } from '../sim/rng';
import {
  clamp,
  clampPhysics,
  DEFAULT_PHYSICS,
  LAYOUTS,
  type Layout,
  MAX_SPECIES,
  MIN_SPECIES,
  type Physics,
} from '../sim/types';

/** Everything that defines a world: can be shared by URL, saved as a favourite, or come from a preset. */
export interface Recipe {
  species: number;
  /** Row-major species × species matrix, values in [−1, 1] with 2 decimals. */
  matrix: number[];
  /** Particles per species. */
  counts: number[];
  physics: Physics;
  layout: Layout;
  /** Seed for the initial scatter (so a shared link starts from the same picture). */
  seed: number;
}

export const MAX_TOTAL = 20000;
export const MAX_PER_SPECIES = 6000;

export const round2 = (v: number): number => Math.round(v * 100) / 100 || 0;

export function clampSpecies(s: number): number {
  return clamp(Math.round(s), MIN_SPECIES, MAX_SPECIES);
}

// ---------------------------------------------------------------- matrix operations (pure)

export function zeroMatrix(species: number): number[] {
  return new Array<number>(species * species).fill(0);
}

export function randomMatrix(species: number, rng: Rng): number[] {
  const m: number[] = [];
  for (let i = 0; i < species * species; i++) m.push(round2(rng() * 2 - 1));
  return m;
}

/** Nudge a random subset of cells – small evolutionary steps. */
export function mutateMatrix(m: readonly number[], species: number, rng: Rng, amount = 0.3, fraction = 0.3): number[] {
  const out = m.slice(0, species * species);
  let changed = 0;
  for (let i = 0; i < out.length; i++) {
    if (rng() < fraction) {
      out[i] = round2(clamp(out[i] + gauss(rng) * amount, -1, 1));
      changed++;
    }
  }
  if (changed === 0 && out.length > 0) {
    const i = Math.floor(rng() * out.length);
    out[i] = round2(clamp(out[i] + (rng() < 0.5 ? -1 : 1) * amount, -1, 1));
  }
  return out;
}

/** a→b and b→a become equal (their mean): calm, crystal-like worlds without chasing. */
export function symmetricMatrix(m: readonly number[], species: number): number[] {
  const out = m.slice(0, species * species);
  for (let a = 0; a < species; a++) {
    for (let b = a + 1; b < species; b++) {
      const v = round2((m[a * species + b] + m[b * species + a]) / 2);
      out[a * species + b] = v;
      out[b * species + a] = v;
    }
  }
  return out;
}

export function invertMatrix(m: readonly number[]): number[] {
  return m.map((v) => round2(-v));
}

/** Transpose: who chases whom swaps. */
export function transposeMatrix(m: readonly number[], species: number): number[] {
  const out = m.slice(0, species * species);
  for (let a = 0; a < species; a++) for (let b = 0; b < species; b++) out[a * species + b] = m[b * species + a];
  return out;
}

/** Change the number of species, keeping the existing top-left block. New cells are random but gentle. */
export function resizeMatrix(m: readonly number[], from: number, to: number, rng: Rng): number[] {
  const out: number[] = [];
  for (let a = 0; a < to; a++) {
    for (let b = 0; b < to; b++) {
      if (a < from && b < from) out.push(m[a * from + b] ?? 0);
      else out.push(round2((rng() * 2 - 1) * 0.8));
    }
  }
  return out;
}

export function isSymmetric(m: readonly number[], species: number): boolean {
  for (let a = 0; a < species; a++)
    for (let b = a + 1; b < species; b++) if (Math.abs(m[a * species + b] - m[b * species + a]) > 0.005) return false;
  return true;
}

// ---------------------------------------------------------------- population helpers

export function total(counts: readonly number[]): number {
  let t = 0;
  for (const c of counts) t += c;
  return t;
}

export function equalCounts(species: number, sum: number): number[] {
  const base = Math.floor(sum / species);
  const out = new Array<number>(species).fill(base);
  for (let i = 0; i < sum - base * species; i++) out[i]++;
  return out;
}

/** Scale counts proportionally to a new total (largest remainder rounding). */
export function scaleCounts(counts: readonly number[], newTotal: number): number[] {
  const t = total(counts);
  if (t <= 0) return equalCounts(counts.length, newTotal);
  const raw = counts.map((c) => (c / t) * newTotal);
  const out = raw.map(Math.floor);
  let rest = newTotal - total(out);
  const order = raw.map((v, i) => [v - Math.floor(v), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0 && k < order.length; k++, rest--) out[order[k][1]]++;
  return out;
}

export function weightedCounts(weights: readonly number[], sum: number): number[] {
  return scaleCounts(
    weights.map((w) => Math.max(0, w)),
    sum,
  );
}

export function randomCounts(species: number, sum: number, rng: Rng): number[] {
  return weightedCounts(
    Array.from({ length: species }, () => 0.25 + rng()),
    sum,
  );
}

/** Resize a count vector to a new species count; new species get the average. */
export function resizeCounts(counts: readonly number[], species: number): number[] {
  const avg = counts.length ? Math.round(total(counts) / counts.length) : 500;
  return Array.from({ length: species }, (_, i) => counts[i] ?? avg);
}

// ---------------------------------------------------------------- validation

/** Coerce any (possibly hostile / outdated) object into a valid Recipe. */
export function sanitizeRecipe(input: unknown, fallback: Recipe): Recipe {
  if (!input || typeof input !== 'object') return fallback;
  const o = input as Partial<Record<keyof Recipe, unknown>>;
  const species = typeof o.species === 'number' && Number.isFinite(o.species) ? clampSpecies(o.species) : fallback.species;
  const mIn = Array.isArray(o.matrix) ? o.matrix : [];
  const matrix: number[] = [];
  for (let i = 0; i < species * species; i++) {
    const v = mIn[i];
    matrix.push(typeof v === 'number' && Number.isFinite(v) ? round2(clamp(v, -1, 1)) : 0);
  }
  const cIn = Array.isArray(o.counts) ? o.counts : [];
  let counts: number[] = [];
  for (let s = 0; s < species; s++) {
    const v = cIn[s];
    counts.push(typeof v === 'number' && Number.isFinite(v) ? clamp(Math.round(v), 0, MAX_PER_SPECIES) : 0);
  }
  if (total(counts) === 0) counts = equalCounts(species, Math.max(total(fallback.counts), 600));
  if (total(counts) > MAX_TOTAL) counts = scaleCounts(counts, MAX_TOTAL);
  const physics = clampPhysics(o.physics as Partial<Physics> | undefined, DEFAULT_PHYSICS);
  const layout = LAYOUTS.includes(o.layout as Layout) ? (o.layout as Layout) : 'random';
  const seed = typeof o.seed === 'number' && Number.isFinite(o.seed) ? o.seed >>> 0 : fallback.seed;
  return { species, matrix, counts, physics, layout, seed };
}

export function cloneRecipe(r: Recipe): Recipe {
  return { ...r, matrix: r.matrix.slice(), counts: r.counts.slice(), physics: { ...r.physics } };
}

export function sameMatrix(a: readonly number[], b: readonly number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 0.004) return false;
  return true;
}
