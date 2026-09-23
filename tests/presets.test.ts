import { describe, expect, it } from 'vitest';
import { MAX_SPECIES, MIN_SPECIES, PHYSICS_LIMITS } from '../src/sim/types';
import { DEFAULT_PRESET_ID, getPreset, PRESETS, presetPhysics } from '../src/state/presets';
import { equalCounts, sanitizeRecipe, weightedCounts } from '../src/state/recipe';
import { decodeRecipe, encodeRecipe } from '../src/state/url';

describe('presets', () => {
  it('have unique, URL-safe ids and Czech names', () => {
    const ids = new Set<string>();
    for (const p of PRESETS) {
      expect(p.id).toMatch(/^[a-z0-9-]+$/);
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
      expect(p.name.length).toBeGreaterThan(2);
      expect(p.desc.length).toBeGreaterThan(20);
    }
    expect(PRESETS.length).toBeGreaterThanOrEqual(12);
  });

  it('include the worlds promised in the menu (buňky, hadi, oběžnice, lovci a kořist)', () => {
    for (const id of ['bunky', 'hadi', 'obeznice', 'lovci-a-korist']) expect(getPreset(id)).toBeDefined();
    expect(getPreset(DEFAULT_PRESET_ID)).toBeDefined();
  });

  it('have valid matrices, weights and physics', () => {
    for (const p of PRESETS) {
      expect(p.species).toBeGreaterThanOrEqual(MIN_SPECIES);
      expect(p.species).toBeLessThanOrEqual(MAX_SPECIES);
      expect(p.matrix).toHaveLength(p.species * p.species);
      for (const v of p.matrix) {
        expect(Number.isFinite(v)).toBe(true);
        expect(Math.abs(v)).toBeLessThanOrEqual(1);
        expect(Math.round(v * 100) / 100).toBeCloseTo(v, 10);
      }
      if (p.weights) {
        expect(p.weights).toHaveLength(p.species);
        for (const w of p.weights) expect(w).toBeGreaterThan(0);
      }
      const phys = presetPhysics(p);
      for (const k of Object.keys(PHYSICS_LIMITS) as (keyof typeof PHYSICS_LIMITS)[]) {
        expect(phys[k]).toBeGreaterThanOrEqual(PHYSICS_LIMITS[k].min);
        expect(phys[k]).toBeLessThanOrEqual(PHYSICS_LIMITS[k].max);
      }
    }
  });

  it('survive sanitising and the URL round-trip unchanged', () => {
    for (const p of PRESETS) {
      const recipe = {
        species: p.species,
        matrix: p.matrix,
        counts: p.weights ? weightedCounts(p.weights, 3000) : equalCounts(p.species, 3000),
        physics: presetPhysics(p),
        layout: p.layout ?? 'random',
        seed: 42,
      };
      expect(sanitizeRecipe(recipe, recipe)).toEqual(recipe);
      expect(decodeRecipe(encodeRecipe(recipe), recipe)).toEqual(recipe);
    }
  });
});
