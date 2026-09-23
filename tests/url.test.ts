import { describe, expect, it } from 'vitest';
import { DEFAULT_PHYSICS } from '../src/sim/types';
import { type Recipe } from '../src/state/recipe';
import { buildHash, decodeRecipe, encodeRecipe, parseHash } from '../src/state/url';

const fallback: Recipe = {
  species: 6,
  matrix: new Array(36).fill(0),
  counts: new Array(6).fill(500),
  physics: { ...DEFAULT_PHYSICS },
  layout: 'random',
  seed: 1,
};

const sample: Recipe = {
  species: 4,
  matrix: [0.9, -0.35, 0, 1, -1, 0.5, 0.01, -0.01, 0.25, 0.75, -0.6, 0.33, 0, 0, 0.12, -0.99],
  counts: [100, 2500, 0, 777],
  physics: { rMax: 120, friction: 0.91, dt: 0.4, force: 30, beta: 0.25 },
  layout: 'spiral',
  seed: 4294967295,
};

describe('URL state', () => {
  it('round-trips a recipe exactly (2-decimal matrix)', () => {
    const s = encodeRecipe(sample);
    expect(s).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeRecipe(s, fallback)).toEqual(sample);
  });

  it('is compact – a 6-species world fits in ~80 characters', () => {
    const r: Recipe = { ...fallback, matrix: fallback.matrix.map((_, i) => ((i % 7) - 3) / 3) };
    expect(encodeRecipe(r).length).toBeLessThanOrEqual(80);
  });

  it('round-trips every species count 2…8', () => {
    for (let S = 2; S <= 8; S++) {
      const r: Recipe = {
        ...fallback,
        species: S,
        matrix: Array.from({ length: S * S }, (_, i) => Math.round(Math.sin(i) * 100) / 100),
        counts: Array.from({ length: S }, (_, i) => 100 * (i + 1)),
      };
      expect(decodeRecipe(encodeRecipe(r), fallback)).toEqual(r);
    }
  });

  it('rejects garbage and truncated input', () => {
    expect(decodeRecipe('', fallback)).toBeNull();
    expect(decodeRecipe('!!!', fallback)).toBeNull();
    expect(decodeRecipe('AAAA', fallback)).toBeNull();
    const s = encodeRecipe(sample);
    expect(decodeRecipe(s.slice(0, 10), fallback)).toBeNull();
    // wrong version byte
    expect(decodeRecipe('Ag' + s.slice(2), fallback)).toBeNull();
  });

  it('clamps out-of-range physics from a hand-edited link', () => {
    const enc = encodeRecipe(sample).replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(enc + '==='.slice((enc.length + 3) % 4)), (c) => c.charCodeAt(0));
    const o = 2 + 16 + 8;
    bytes[o] = 255; // rMax
    bytes[o + 3] = 250; // force
    let bin = '';
    for (const b of bytes) bin += String.fromCharCode(b);
    const edited = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const r = decodeRecipe(edited, fallback)!;
    expect(r.physics.rMax).toBe(180);
    expect(r.physics.force).toBe(50);
  });

  it('parses and builds hashes', () => {
    expect(parseHash('', fallback)).toEqual({});
    expect(parseHash('#p=bunky', fallback)).toEqual({ presetId: 'bunky' });
    expect(parseHash('#p=../../evil', fallback)).toEqual({ broken: true });
    const h = buildHash({ recipe: sample, name: 'Moje buňky ✨' });
    const back = parseHash(h, fallback);
    expect(back.recipe).toEqual(sample);
    expect(back.name).toBe('Moje buňky ✨');
    expect(buildHash({ presetId: 'hadi' })).toBe('#p=hadi');
  });

  it('carries the relative density so a link looks the same on any screen', () => {
    const h = buildHash({ recipe: sample, density: 1.2345 });
    expect(h).toContain('d=1.23');
    expect(parseHash(h, fallback).density).toBe(1.23);
    expect(parseHash(buildHash({ recipe: sample }), fallback).density).toBeUndefined();
    expect(parseHash(`${buildHash({ recipe: sample })}&d=999`, fallback).density).toBe(8);
    expect(parseHash(`${buildHash({ recipe: sample })}&d=abc`, fallback).density).toBeUndefined();
  });

  it('flags links that asked for a world but cannot be read', () => {
    expect(parseHash('#w=%%%garbage', fallback).broken).toBe(true);
    expect(parseHash('#w=AQMAAAA', fallback).broken).toBe(true);
    expect(parseHash(`#w=${'A'.repeat(600)}`, fallback).broken).toBe(true);
    expect(parseHash('#w=', fallback).broken).toBe(true);
    expect(parseHash('#nic=1', fallback).broken).toBeUndefined();
  });
});
