import type { Rgb } from '../state/palette';

/** One simulation snapshot, as delivered by the worker. */
export interface FrameData {
  n: number;
  pos: Float32Array;
  spc: Uint8Array;
  bondN: number;
  bnd: Float32Array;
  w: number;
  h: number;
}

export interface LookParams {
  theme: 'dark' | 'light';
  colors: readonly Rgb[];
  /** 0 = no trails … 1 = very long trails. */
  trails: number;
  /** Halo strength 0 … 2. */
  glow: number;
  /** Particle size multiplier 0.5 … 2. */
  size: number;
  bonds: boolean;
  /** 0 … 1 appear animation after a reseed. */
  bloom: number;
  vignette: boolean;
}

export interface Renderer {
  readonly kind: 'webgl2' | 'canvas2d';
  /** Canvas size in device pixels. */
  resize(width: number, height: number): void;
  /** Draw a frame. `dtMs` drives trail fading so it is refresh-rate independent. */
  draw(frame: FrameData | null, look: LookParams, dtMs: number): void;
  /** Copy of the current picture (for screenshots and favourite thumbnails). */
  capture(maxWidth?: number): HTMLCanvasElement;
  /** Forget trails (e.g. after a reseed or theme change). */
  clear(): void;
  dispose(): void;
}

export const BG = {
  dark: [10, 14, 18] as Rgb,
  light: [246, 243, 236] as Rgb,
};
