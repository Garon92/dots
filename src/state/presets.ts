import { mulberry32 } from '../sim/rng';
import { DEFAULT_PHYSICS, type Layout, type Physics } from '../sim/types';
import { randomMatrix, round2 } from './recipe';

export interface Preset {
  id: string;
  name: string;
  /** One friendly sentence about what to watch for. */
  desc: string;
  species: number;
  matrix: number[];
  physics?: Partial<Physics>;
  /** Relative species weights (defaults to equal). */
  weights?: number[];
  /** Density multiplier relative to the default particle count. */
  density?: number;
  layout?: Layout;
  seed?: number;
}

type Gen = (a: number, b: number, S: number) => number;
const build = (S: number, f: Gen): number[] => {
  const m: number[] = [];
  for (let a = 0; a < S; a++) for (let b = 0; b < S; b++) m.push(round2(f(a, b, S)));
  return m;
};
const fromRows = (rows: number[][]): number[] => rows.flat().map(round2);

export const PRESETS: readonly Preset[] = [
  {
    id: 'obezne-retezy',
    name: 'Oběžné řetězy',
    desc: 'Každý druh honí další v pořadí a před předchozím utíká – vznikají kroužící řetězy.',
    species: 6,
    matrix: build(6, (a, b, S) => (b === (a + 1) % S ? 0.9 : a === (b + 1) % S ? -0.6 : a === b ? 0.15 : -0.05)),
  },
  {
    id: 'bunky',
    name: 'Buňky',
    desc: 'Jádra se obalí membránou z jiného druhu a putují jako živé buňky.',
    species: 4,
    matrix: fromRows([
      [0.9, 0.35, -0.2, -0.3],
      [0.55, -0.1, 0.4, -0.2],
      [-0.4, 0.5, 0.2, 0.1],
      [-0.3, -0.2, 0.3, 0.6],
    ]),
    weights: [1, 1.3, 1.1, 0.7],
  },
  {
    id: 'hadi',
    name: 'Hadi',
    desc: 'Druhy se řadí za sebe do dlouhých plazivých těl.',
    species: 6,
    matrix: build(6, (a, b, S) => (b === (a + 1) % S ? 1 : a === b ? -0.35 : -0.1)),
  },
  {
    id: 'obeznice',
    name: 'Oběžnice',
    desc: 'Hustá jádra a kolem nich krouží lehčí částice jako měsíce.',
    species: 3,
    matrix: fromRows([
      [0.8, -0.3, 0.05],
      [0.7, -0.4, 0.3],
      [0.25, -0.2, -0.1],
    ]),
    weights: [1, 1.2, 0.8],
    physics: { friction: 0.9 },
  },
  {
    id: 'lovci-a-korist',
    name: 'Lovci a kořist',
    desc: 'Korálová smečka loví – ostatní se drží v hejnech a prchají.',
    species: 5,
    matrix: build(5, (a, b) => (a === 0 ? (b === 0 ? 0.4 : 0.85) : b === 0 ? -1 : a === b ? 0.6 : 0.12)),
    weights: [0.35, 1, 1, 1, 1],
  },
  {
    id: 'deleni-bunek',
    name: 'Dělení buněk',
    desc: 'Každý druh drží při sobě a ostatní odstrkuje – kapky se slévají a dělí.',
    species: 6,
    matrix: build(6, (a, b) => (a === b ? 0.9 : -0.2)),
  },
  {
    id: 'krystaly',
    name: 'Krystaly',
    desc: 'Sousední druhy se k sobě lepí a vzniká pravidelná mozaika.',
    species: 6,
    matrix: build(6, (a, b) => {
      const d = Math.abs(a - b);
      return d === 0 ? -0.4 : d === 1 ? 0.95 : -0.15;
    }),
  },
  {
    id: 'dravy-roj',
    name: 'Dravý roj',
    desc: 'Jeden druh honí všechny ostatní, kořist se shlukuje do hejn.',
    species: 6,
    matrix: build(6, (a, b) => (a === 0 ? (b === 0 ? 0.5 : 0.9) : b === 0 ? -1 : a === b ? 0.6 : 0.1)),
  },
  {
    id: 'komety',
    name: 'Komety',
    desc: 'Dvojice honič a utíkající tvoří rychlé komety s ohonem.',
    species: 4,
    matrix: fromRows([
      [0.5, 0.9, -0.1, -0.1],
      [-0.6, 0.6, -0.1, 0.2],
      [-0.1, -0.1, 0.5, 0.9],
      [-0.1, 0.2, -0.6, 0.6],
    ]),
    physics: { friction: 0.88 },
  },
  {
    id: 'membrany',
    name: 'Membrány',
    desc: 'Světlé částice se rozprostřou v tenkých blanách kolem kapek.',
    species: 3,
    matrix: fromRows([
      [0.8, 0.1, -0.3],
      [0.6, -0.35, 0.2],
      [-0.2, 0.4, 0.3],
    ]),
    weights: [1, 1.6, 0.8],
  },
  {
    id: 'galaxie',
    name: 'Galaxie',
    desc: 'Velký dosah a slabé tření – pomalu rotující spirály.',
    species: 5,
    matrix: build(5, (a, b, S) => (a === b ? 0.5 : b === (a + 1) % S ? 0.4 : b === (a + S - 1) % S ? -0.2 : 0.05)),
    physics: { rMax: 130, friction: 0.93, force: 14 },
    layout: 'spiral',
  },
  {
    id: 'medusy',
    name: 'Medúzy',
    desc: 'Pulzující zvony s vlajícími chapadly.',
    species: 4,
    matrix: fromRows([
      [0.6, 0.6, -0.5, 0.1],
      [-0.4, 0.2, 0.8, -0.2],
      [0.3, -0.6, 0.4, 0.5],
      [-0.1, 0.2, -0.3, -0.1],
    ]),
  },
  {
    id: 'mozaika',
    name: 'Mozaika',
    desc: 'Souměrná matice – nikdo nikoho nehoní, svět se usadí do klidných dlaždic.',
    species: 5,
    matrix: build(5, (a, b) => (a === b ? 0.7 : (a + b) % 2 === 0 ? 0.3 : -0.35)),
  },
  {
    id: 'roj',
    name: 'Roj',
    desc: 'Všichni se mají rádi, ale ne stejně – obří hejno se valí světem.',
    species: 6,
    matrix: build(6, (a, b, S) => (a === b ? 0.4 : b === (a + 1) % S ? 0.55 : 0.12)),
    physics: { friction: 0.9 },
  },
  {
    id: 'tanec',
    name: 'Tanec',
    desc: 'Osm druhů v párech – krouží kolem sebe jako tanečníci.',
    species: 8,
    matrix: build(8, (a, b) => {
      const pa = a >> 1;
      const pb = b >> 1;
      if (a === b) return 0.3;
      if (pa === pb) return a < b ? 0.8 : -0.5;
      return -0.12;
    }),
  },
  {
    id: 'chaos',
    name: 'Prapolévka',
    desc: 'Náhodná matice z pevného semínka – zkus, co se v ní zrodí.',
    species: 6,
    matrix: randomMatrix(6, mulberry32(20260923)),
  },
];

export const DEFAULT_PRESET_ID = 'obezne-retezy';

export function getPreset(id: string | null | undefined): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function presetPhysics(p: Preset): Physics {
  return { ...DEFAULT_PHYSICS, ...p.physics };
}
