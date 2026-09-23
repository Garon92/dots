import { MAX_SPECIES } from '../sim/types';

export type Rgb = readonly [number, number, number];

export interface Palette {
  id: PaletteId;
  name: string;
  /** Glow colours on the dark canvas. */
  dark: readonly Rgb[];
  /** Ink colours on the light canvas (deeper, more saturated). */
  light: readonly Rgb[];
}

export type PaletteId = 'puvodni' | 'neon' | 'pastel' | 'duha';

const hex = (h: string): Rgb => {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};

/** Czech short names of the species (used in labels and aria). Index = species. */
export const SPECIES_NAMES = ['Korál', 'Jantar', 'Limetka', 'Tyrkys', 'Kosatec', 'Purpur', 'Azur', 'Perla'] as const;

function hsl(h: number, s: number, l: number): Rgb {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

export const PALETTES: readonly Palette[] = [
  {
    id: 'puvodni',
    name: 'Původní',
    dark: ['#FF6B6B', '#FFC145', '#B8E062', '#4FD1C5', '#7C8CFF', '#E56BF0', '#5CB8FF', '#E8EEF2'].map(hex),
    light: ['#E0413F', '#E09A00', '#6FA51C', '#0F9E92', '#4A55E0', '#B63CC4', '#1B82D1', '#3A4552'].map(hex),
  },
  {
    id: 'neon',
    name: 'Neon',
    dark: ['#FF2E63', '#FFE400', '#39FF14', '#00F0FF', '#4D4DFF', '#FF00E6', '#FF8A00', '#FFFFFF'].map(hex),
    light: ['#E0003C', '#C9A800', '#1FB800', '#00A8C0', '#2A2AE0', '#D000BD', '#E06A00', '#1A1A2A'].map(hex),
  },
  {
    id: 'pastel',
    name: 'Pastel',
    dark: ['#FFADAD', '#FFD6A5', '#FDFFB6', '#CAFFBF', '#9BF6FF', '#A0C4FF', '#BDB2FF', '#FFC6FF'].map(hex),
    light: ['#E07A7A', '#D9A060', '#B5B830', '#6CBF5E', '#3FB5C4', '#5D8FDE', '#8373E0', '#D07AD0'].map(hex),
  },
  {
    id: 'duha',
    name: 'Duha',
    dark: Array.from({ length: MAX_SPECIES }, (_, i) => hsl((i * 360) / MAX_SPECIES, 0.9, 0.64)),
    light: Array.from({ length: MAX_SPECIES }, (_, i) => hsl((i * 360) / MAX_SPECIES, 0.85, 0.42)),
  },
];

export function getPalette(id: string | undefined): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}

/**
 * Colours for the current species count. The "duha" palette spreads the hues evenly over the
 * species actually in use; the others use their fixed order.
 */
export function speciesColors(p: Palette, theme: 'dark' | 'light', species: number): Rgb[] {
  if (p.id === 'duha') {
    return Array.from({ length: species }, (_, i) =>
      theme === 'dark' ? hsl((i * 360) / species, 0.9, 0.64) : hsl((i * 360) / species, 0.85, 0.42),
    );
  }
  return (theme === 'dark' ? p.dark : p.light).slice(0, species) as Rgb[];
}

export const css = (c: Rgb, a = 1): string => (a >= 1 ? `rgb(${c[0]} ${c[1]} ${c[2]})` : `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`);
