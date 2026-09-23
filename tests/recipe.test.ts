import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/sim/rng';
import { DEFAULT_PHYSICS } from '../src/sim/types';
import {
  equalCounts,
  invertMatrix,
  isSymmetric,
  mutateMatrix,
  randomMatrix,
  type Recipe,
  resizeMatrix,
  sanitizeRecipe,
  scaleCounts,
  symmetricMatrix,
  total,
  transposeMatrix,
} from '../src/state/recipe';
import { convertLegacySetups } from '../src/state/storage';
import { sanitizeSettings, DEFAULT_SETTINGS } from '../src/state/settings';

const fallback: Recipe = {
  species: 3,
  matrix: new Array(9).fill(0),
  counts: [100, 100, 100],
  physics: { ...DEFAULT_PHYSICS },
  layout: 'random',
  seed: 7,
};

describe('matrix operations', () => {
  const rng = mulberry32(1);
  it('random matrices stay in [−1, 1] with two decimals', () => {
    const m = randomMatrix(5, rng);
    expect(m).toHaveLength(25);
    for (const v of m) {
      expect(Math.abs(v)).toBeLessThanOrEqual(1);
      expect(Math.round(v * 100) / 100).toBe(v);
    }
  });
  it('mutation changes something but not everything', () => {
    const m = randomMatrix(6, rng);
    const mm = mutateMatrix(m, 6, rng);
    const changed = mm.filter((v, i) => v !== m[i]).length;
    expect(changed).toBeGreaterThan(0);
    expect(changed).toBeLessThan(36);
    for (const v of mm) expect(Math.abs(v)).toBeLessThanOrEqual(1);
  });
  it('symmetric = mean of a→b and b→a', () => {
    const m = [0.2, 0.8, -0.4, 0.5];
    const s = symmetricMatrix(m, 2);
    expect(s).toEqual([0.2, 0.2, 0.2, 0.5]);
    expect(isSymmetric(s, 2)).toBe(true);
    expect(isSymmetric(m, 2)).toBe(false);
  });
  it('invert and transpose', () => {
    expect(invertMatrix([0.5, -0.25, 0, 1])).toEqual([-0.5, 0.25, 0, -1]);
    expect(transposeMatrix([1, 2, 3, 4], 2)).toEqual([1, 3, 2, 4]);
  });
  it('resizing keeps the existing top-left block', () => {
    const m = [0.1, 0.2, 0.3, 0.4];
    const big = resizeMatrix(m, 2, 3, rng);
    expect(big).toHaveLength(9);
    expect([big[0], big[1], big[3], big[4]]).toEqual(m);
    expect(resizeMatrix(big, 3, 2, rng)).toEqual(m);
  });
});

describe('population helpers', () => {
  it('equal and scaled counts keep the exact total', () => {
    expect(equalCounts(3, 10)).toEqual([4, 3, 3]);
    const c = scaleCounts([100, 200, 300], 1001);
    expect(total(c)).toBe(1001);
    expect(c[2]).toBeGreaterThan(c[0]);
    expect(total(scaleCounts([0, 0], 10))).toBe(10);
  });
});

describe('sanitizing', () => {
  it('repairs hostile recipes', () => {
    const r = sanitizeRecipe({ species: 99, matrix: ['x', 5], counts: [-5, 1e9], physics: { rMax: -1, friction: 'a' } }, fallback);
    expect(r.species).toBe(8);
    expect(r.matrix).toHaveLength(64);
    expect(r.matrix[1]).toBe(1);
    expect(r.counts.every((c) => c >= 0)).toBe(true);
    expect(r.physics.rMax).toBe(30);
    expect(r.physics.friction).toBe(DEFAULT_PHYSICS.friction);
    expect(sanitizeRecipe(null, fallback)).toBe(fallback);
  });
  it('settings fall back to defaults field by field', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    const s = sanitizeSettings({ trails: 5, palette: 'nope', tool: 'swirl', speed: 7, zoom: 0 });
    expect(s.trails).toBe(1);
    expect(s.palette).toBe(DEFAULT_SETTINGS.palette);
    expect(s.tool).toBe('swirl');
    expect(s.speed).toBe(1);
    expect(s.zoom).toBe(0);
  });
});

describe('legacy "My Setups" migration', () => {
  it('converts the original dots.setups.v1 format', () => {
    const legacy = [
      {
        name: 'Moje hvězdy',
        matrix: Array.from({ length: 36 }, (_, i) => (i % 3) - 1),
        pop: [520, 520, 100, 0, 800, 300],
        phys: { rMax: 110, friction: 0.9, dt: 0.5, forceScale: 18 },
        bonds: false,
      },
      null,
      { name: '', matrix: 'broken' },
    ];
    const favs = convertLegacySetups(legacy);
    expect(favs).toHaveLength(2);
    expect(favs[0].name).toBe('Moje hvězdy');
    expect(favs[0].recipe.species).toBe(6);
    expect(favs[0].recipe.counts).toEqual([520, 520, 100, 0, 800, 300]);
    expect(favs[0].recipe.physics).toMatchObject({ rMax: 110, friction: 0.9, dt: 0.5, force: 18 });
    expect(favs[0].bonds).toBe(false);
    expect(favs[1].name).toBe('Nastavení');
    expect(convertLegacySetups('nope')).toEqual([]);
  });
});

describe('favourites backup', () => {
  it('round-trips through the backup file and rejects junk', async () => {
    const { favoritesBackup, sanitizeFavorites } = await import('../src/state/storage');
    const fav = {
      id: 'abc',
      name: 'Můj svět',
      created: 1700000000000,
      recipe: { ...fallback, matrix: [0.5, -0.5, 0, 0, 1, -1, 0.25, 0.75, 0] },
      bonds: true,
      thumb: 'data:image/webp;base64,AAAA',
    };
    const back = sanitizeFavorites(JSON.parse(favoritesBackup([fav])));
    expect(back).toEqual([fav]);
    expect(sanitizeFavorites({ v: 1, items: [{ name: 'x', thumb: 'javascript:alert(1)' }] })[0]!.thumb).toBeUndefined();
    expect(sanitizeFavorites({ v: 2, items: [fav] })).toEqual([]);
    expect(sanitizeFavorites('nope')).toEqual([]);
  });
});
