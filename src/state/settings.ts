import type { BrushMode } from '../sim/types';
import { clamp } from '../sim/types';
import { type PaletteId, PALETTES } from './palette';
import { dotsStore } from './storage';

export type CanvasTheme = 'auto' | 'dark' | 'light';
export type Tool = Exclude<BrushMode, never>;

export interface Settings {
  trails: number;
  glow: number;
  size: number;
  bonds: boolean;
  palette: PaletteId;
  hud: boolean;
  canvasTheme: CanvasTheme;
  vignette: boolean;
  /** Automatically lower the particle count when the device cannot keep up. */
  autoTune: boolean;
  /** World zoom (screen px per world unit); 0 = automatic by screen size. */
  zoom: number;
  tool: Tool;
  brushSize: number;
  /** Species for the spawn tool, −1 = random. */
  brushSpecies: number;
  /** Simulation speed multiplier (steps per frame at 60 fps). */
  speed: number;
  /** Onboarding hint dismissed. */
  onboarded: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  trails: 0.6,
  glow: 1,
  size: 1,
  bonds: true,
  palette: 'puvodni',
  hud: true,
  canvasTheme: 'auto',
  vignette: true,
  autoTune: true,
  zoom: 0,
  tool: 'repel',
  brushSize: 1,
  brushSpecies: -1,
  speed: 1,
  onboarded: false,
};

const TOOLS: Tool[] = ['repel', 'attract', 'swirl', 'spawn', 'erase'];
export const SPEEDS = [0.25, 0.5, 1, 2, 3] as const;

export function sanitizeSettings(o: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS };
  if (!o || typeof o !== 'object') return s;
  const i = o as Partial<Record<keyof Settings, unknown>>;
  const num = (v: unknown, min: number, max: number, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, min, max) : d;
  s.trails = num(i.trails, 0, 1, s.trails);
  s.glow = num(i.glow, 0, 2, s.glow);
  s.size = num(i.size, 0.4, 2.5, s.size);
  s.bonds = typeof i.bonds === 'boolean' ? i.bonds : s.bonds;
  s.palette = PALETTES.some((p) => p.id === i.palette) ? (i.palette as PaletteId) : s.palette;
  s.hud = typeof i.hud === 'boolean' ? i.hud : s.hud;
  s.canvasTheme = i.canvasTheme === 'dark' || i.canvasTheme === 'light' || i.canvasTheme === 'auto' ? i.canvasTheme : s.canvasTheme;
  s.vignette = typeof i.vignette === 'boolean' ? i.vignette : s.vignette;
  s.autoTune = typeof i.autoTune === 'boolean' ? i.autoTune : s.autoTune;
  s.zoom = i.zoom === 0 ? 0 : num(i.zoom, 0.5, 1.6, s.zoom);
  s.tool = TOOLS.includes(i.tool as Tool) ? (i.tool as Tool) : s.tool;
  s.brushSize = num(i.brushSize, 0.4, 2.5, s.brushSize);
  s.brushSpecies = Math.round(num(i.brushSpecies, -1, 7, s.brushSpecies));
  s.speed = (SPEEDS as readonly number[]).includes(i.speed as number) ? (i.speed as number) : s.speed;
  s.onboarded = typeof i.onboarded === 'boolean' ? i.onboarded : s.onboarded;
  return s;
}

export function loadSettings(): Settings {
  return sanitizeSettings(dotsStore().get('settings'));
}

export function hasStoredSettings(): boolean {
  return dotsStore().get('settings') != null;
}

export function saveSettings(s: Settings): void {
  dotsStore().set('settings', s);
}
