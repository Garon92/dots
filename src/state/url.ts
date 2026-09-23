import { LAYOUTS, MAX_SPECIES, MIN_SPECIES } from '../sim/types';
import { type Recipe, sanitizeRecipe } from './recipe';

/**
 * Compact, versioned binary encoding of a Recipe for the URL hash.
 *
 * v1 layout (bytes): version, species S, S² × int8 matrix (×100), S × uint16 counts,
 * rMax, friction×100, dt×100, force, beta×100, layout index, uint32 seed.  → base64url.
 * A 6-species world fits in ~80 characters.
 */
const VERSION = 1;

function toB64Url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64Url(str: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(str)) return null;
  try {
    const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

export function encodeRecipe(r: Recipe): string {
  const S = r.species;
  const bytes = new Uint8Array(2 + S * S + S * 2 + 5 + 1 + 4);
  const dv = new DataView(bytes.buffer);
  let o = 0;
  bytes[o++] = VERSION;
  bytes[o++] = S;
  for (let i = 0; i < S * S; i++) dv.setInt8(o++, Math.max(-100, Math.min(100, Math.round((r.matrix[i] ?? 0) * 100))));
  for (let s = 0; s < S; s++) {
    dv.setUint16(o, Math.max(0, Math.min(65535, Math.round(r.counts[s] ?? 0))), true);
    o += 2;
  }
  const p = r.physics;
  bytes[o++] = clampByte(p.rMax);
  bytes[o++] = clampByte(p.friction * 100);
  bytes[o++] = clampByte(p.dt * 100);
  bytes[o++] = clampByte(p.force);
  bytes[o++] = clampByte(p.beta * 100);
  bytes[o++] = Math.max(0, LAYOUTS.indexOf(r.layout));
  dv.setUint32(o, r.seed >>> 0, true);
  return toB64Url(bytes);
}

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export function decodeRecipe(str: string, fallback: Recipe): Recipe | null {
  const bytes = fromB64Url(str.trim());
  if (!bytes || bytes.length < 2 || bytes[0] !== VERSION) return null;
  const S = bytes[1];
  if (S < MIN_SPECIES || S > MAX_SPECIES) return null;
  const need = 2 + S * S + S * 2 + 5 + 1 + 4;
  if (bytes.length < need) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = 2;
  const matrix: number[] = [];
  for (let i = 0; i < S * S; i++) matrix.push(dv.getInt8(o++) / 100);
  const counts: number[] = [];
  for (let s = 0; s < S; s++) {
    counts.push(dv.getUint16(o, true));
    o += 2;
  }
  const physics = {
    rMax: bytes[o++],
    friction: bytes[o++] / 100,
    dt: bytes[o++] / 100,
    force: bytes[o++],
    beta: bytes[o++] / 100,
  };
  const layout = LAYOUTS[bytes[o++]] ?? 'random';
  const seed = dv.getUint32(o, true);
  return sanitizeRecipe({ species: S, matrix, counts, physics, layout, seed }, fallback);
}

export interface HashState {
  recipe?: Recipe;
  presetId?: string;
  name?: string;
}

/** Parse `#w=…&n=…` (custom world) or `#p=presetId`. */
export function parseHash(hash: string, fallback: Recipe): HashState {
  const h = hash.replace(/^#/, '');
  if (!h) return {};
  const params = new URLSearchParams(h);
  const out: HashState = {};
  const w = params.get('w');
  if (w) {
    const r = decodeRecipe(w, fallback);
    if (r) out.recipe = r;
  }
  const p = params.get('p');
  if (p && /^[a-z0-9-]{1,40}$/.test(p)) out.presetId = p;
  const n = params.get('n');
  if (n) out.name = n.slice(0, 40);
  return out;
}

export function buildHash(state: HashState): string {
  const params = new URLSearchParams();
  if (state.recipe) params.set('w', encodeRecipe(state.recipe));
  else if (state.presetId) params.set('p', state.presetId);
  if (state.name) params.set('n', state.name.slice(0, 40));
  const s = params.toString();
  return s ? `#${s}` : '';
}
