import type { Brush, Layout, Physics } from './types';

export interface InitMsg {
  t: 'init';
  w: number;
  h: number;
  species: number;
  matrix: number[];
  counts: number[];
  layout: Layout;
  seed: number;
}

export interface FrameMsg {
  t: 'frame';
  id: number;
  steps: number;
  species: number;
  matrix: Float32Array;
  physics: Physics;
  brushes: Brush[];
  bonds: boolean;
  /** Buffers returned from a previous frame, to be refilled (avoids allocations). */
  recycle?: { pos: ArrayBuffer; spc: ArrayBuffer; bnd: ArrayBuffer };
}

export type ToWorker =
  | InitMsg
  | FrameMsg
  | { t: 'counts'; counts: number[] }
  | { t: 'reseed'; counts: number[]; layout: Layout; seed: number }
  | { t: 'resize'; w: number; h: number }
  | { t: 'species'; species: number; counts: number[] }
  | { t: 'shake'; amount: number };

export interface FrameResult {
  t: 'frame';
  id: number;
  n: number;
  /** Interleaved x, y (world units). */
  pos: Float32Array;
  spc: Uint8Array;
  bondN: number;
  bnd: Float32Array;
  kinetic: number;
  /** Average milliseconds per simulation step in this batch (0 when no step ran). */
  stepMs: number;
  steps: number;
  counts: number[];
  w: number;
  h: number;
}

export type FromWorker = FrameResult | { t: 'error'; message: string };
