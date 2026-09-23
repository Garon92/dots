/**
 * The particle-life force law.
 *
 *  - r < beta:      universal repulsion ramping from −1 (touching) to 0 (at beta) – keeps particles apart
 *  - beta ≤ r < 1:  a "tent" peaking at the middle of the band; its height and sign come from the matrix
 *  - r ≥ 1:         nothing
 *
 * `r` is the distance normalised by rMax, `a` the matrix entry in [−1, 1].
 * Positive result = pull towards the other particle, negative = push away.
 */
export function force(r: number, a: number, beta: number): number {
  if (r < beta) return r / beta - 1;
  if (r < 1) return a * tent(r, beta);
  return 0;
}

/** Shape of the attraction band (0 at r = beta and r = 1, 1 at the middle). */
export function tent(r: number, beta: number): number {
  return 1 - Math.abs(2 * r - 1 - beta) / (1 - beta);
}

/** Sample the force curve for plotting (n points from r = 0 to r = 1.1). */
export function sampleForce(a: number, beta: number, n = 64): { r: number; f: number }[] {
  const out: { r: number; f: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = (i / (n - 1)) * 1.1;
    out.push({ r, f: force(r, a, beta) });
  }
  return out;
}
