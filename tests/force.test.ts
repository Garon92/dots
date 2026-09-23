import { describe, expect, it } from 'vitest';
import { force, sampleForce, tent } from '../src/sim/force';

describe('force law', () => {
  const beta = 0.3;
  it('repels universally at short range regardless of the matrix', () => {
    expect(force(0, 1, beta)).toBe(-1);
    expect(force(0, -1, beta)).toBe(-1);
    expect(force(beta / 2, 0.8, beta)).toBeCloseTo(-0.5);
  });
  it('is continuous at beta and zero at and beyond rMax', () => {
    expect(force(beta, 1, beta)).toBeCloseTo(0);
    expect(force(1, 1, beta)).toBe(0);
    expect(force(1.5, -1, beta)).toBe(0);
  });
  it('peaks with the matrix value in the middle of the band', () => {
    const mid = (1 + beta) / 2;
    expect(force(mid, 0.7, beta)).toBeCloseTo(0.7);
    expect(force(mid, -0.4, beta)).toBeCloseTo(-0.4);
    expect(tent(mid, beta)).toBeCloseTo(1);
  });
  it('matches the original implementation', () => {
    const orig = (r: number, a: number) =>
      r < beta ? r / beta - 1 : r < 1 ? a * (1 - Math.abs(2 * r - 1 - beta) / (1 - beta)) : 0;
    for (let i = 0; i <= 50; i++) {
      const r = i / 45;
      for (const a of [-1, -0.3, 0, 0.5, 1]) expect(force(r, a, beta)).toBeCloseTo(orig(r, a), 10);
    }
  });
  it('samples a curve for plotting', () => {
    const s = sampleForce(0.5, beta, 12);
    expect(s).toHaveLength(12);
    expect(s[0]).toEqual({ r: 0, f: -1 });
    expect(s[11]!.f).toBe(0);
  });
});
