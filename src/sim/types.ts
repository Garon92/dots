// Shared simulation types and limits (used by the worker, the main thread and tests).

export const MIN_SPECIES = 2;
export const MAX_SPECIES = 8;

/** Global physics of the world. Units: world units (≈ CSS px at zoom 1), one step = 1/60 s. */
export interface Physics {
  /** Interaction radius. */
  rMax: number;
  /** Velocity retention per step (0.5 = heavy drag, 0.98 = almost frictionless). */
  friction: number;
  /** Time-step scale. */
  dt: number;
  /** Global force multiplier. */
  force: number;
  /** Size of the universal short-range repulsion zone as a fraction of rMax. */
  beta: number;
}

export interface Limit {
  min: number;
  max: number;
  step: number;
}

export const PHYSICS_LIMITS: Record<keyof Physics, Limit> = {
  rMax: { min: 30, max: 180, step: 1 },
  friction: { min: 0.5, max: 0.98, step: 0.01 },
  dt: { min: 0.1, max: 1, step: 0.01 },
  force: { min: 4, max: 50, step: 1 },
  beta: { min: 0.1, max: 0.6, step: 0.01 },
};

export const DEFAULT_PHYSICS: Physics = {
  rMax: 92,
  friction: 0.86,
  dt: 0.55,
  force: 22,
  beta: 0.3,
};

export type BrushMode = 'repel' | 'attract' | 'swirl' | 'spawn' | 'erase';

/** A pointer-driven force field / tool applied during a step. Coordinates in world units. */
export interface Brush {
  x: number;
  y: number;
  r: number;
  mode: BrushMode;
  /** Force strength multiplier (1 = default). */
  strength: number;
  /** Species to spawn (spawn mode), -1 = random. */
  species: number;
}

export type Layout = 'random' | 'disc' | 'rings' | 'stripes' | 'clusters' | 'spiral';

export const LAYOUTS: Layout[] = ['random', 'disc', 'rings', 'stripes', 'clusters', 'spiral'];

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function clampPhysics(p: Partial<Physics> | undefined, base: Physics = DEFAULT_PHYSICS): Physics {
  const out = { ...base };
  if (!p) return out;
  for (const k of Object.keys(PHYSICS_LIMITS) as (keyof Physics)[]) {
    const v = p[k];
    if (typeof v === 'number' && Number.isFinite(v)) {
      const l = PHYSICS_LIMITS[k];
      out[k] = clamp(v, l.min, l.max);
    }
  }
  return out;
}
