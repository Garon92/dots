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
    id: 'bunky',
    name: 'Buňky',
    desc: 'Jádra se obalí membránou z jiného druhu – kulaté buňky a mezi nimi drobné krystalky.',
    species: 3,
    matrix: fromRows([
      [0.7, 0.3, -0.3],
      [0.6, -0.2, 0.35],
      [-0.3, 0.55, 0.05],
    ]),
    weights: [0.7, 1.2, 1],
  },
  {
    id: 'hadi',
    name: 'Hadi',
    desc: 'Dlouhá svítící těla se plazí mezi poli drobných kvítků.',
    species: 6,
    matrix: [0.23, 0.34, 0.1, -0.36, -0.7, 0.43, -0.23, 0.87, 0.35, 0.92, -0.78, -0.4, 0, -0.51, -0.54, -0.24, -0.65, 0.9, -0.64, -0.18, -0.6, -0.42, 0.48, -0.49, 0.51, -0.78, -0.45, 0.65, 0.52, -0.09, -0.38, -0.04, 0.55, 0.31, 0.2, -0.78],
  },
  {
    id: 'obeznice',
    name: 'Oběžnice',
    desc: 'Dvojice honiček zachycené přitažlivostí jader krouží kolem nich jako měsíce.',
    species: 3,
    matrix: fromRows([
      [0.9, -0.15, -0.15],
      [0.3, 0.2, 0.7],
      [0.3, -0.6, 0.2],
    ]),
    weights: [0.7, 0.4, 0.4],
    physics: { friction: 0.88 },
  },
  {
    id: 'lovci-a-korist',
    name: 'Lovci a kořist',
    desc: 'Korálová smečka honí hejna kořisti – ta se před ní rozprchává a zase slévá.',
    species: 4,
    matrix: fromRows([
      [0.25, 0.7, 0.7, 0.1],
      [-0.9, 0.55, 0.25, -0.1],
      [-0.9, 0.25, 0.55, -0.1],
      [0.1, -0.2, -0.2, 0.3],
    ]),
    weights: [0.3, 1, 1, 0.6],
    physics: { friction: 0.88 },
  },
  {
    id: 'obezne-retezy',
    name: 'Oběžné řetězy',
    desc: 'Každý druh honí další v pořadí a před předchozím utíká – kroužící řetězy a vlny.',
    species: 6,
    matrix: build(6, (a, b, S) => (b === (a + 1) % S ? 0.9 : a === (b + 1) % S ? -0.6 : a === b ? 0.15 : -0.05)),
  },
  {
    id: 'sroubovice',
    name: 'Šroubovice',
    desc: 'Čtyři druhy se splétají do dlouhých točených pásů jako DNA.',
    species: 4,
    matrix: [-0.92, 0.93, -0.54, 0.66, 0.06, -0.12, 0.56, 0.07, -0.42, -0.66, 0.34, 0.15, -0.11, 0.53, 0.95, -0.17],
  },
  {
    id: 'stonozky',
    name: 'Stonožky',
    desc: 'Tenká článkovaná těla s nožičkami pochodují napříč světem.',
    species: 4,
    matrix: [0.88, -0.22, 0.5, -0.19, -0.38, -0.69, 0.22, 0.18, -0.78, 0.72, 0.95, -0.43, 0.5, -0.9, 0.12, 0.36],
  },
  {
    id: 'rakety',
    name: 'Rakety',
    desc: 'Honič a utíkající se spojí v jedno tělo, které se řítí vpřed.',
    species: 6,
    matrix: [-0.88, -0.31, -1, 0.76, -0.69, -0.71, 0.43, -0.55, -0.41, -0.88, -0.39, -0.85, 0.44, -0.49, -0.8, 0.9, 0.1, 0.65, -0.88, -0.36, 0.08, -0.67, -0.67, -0.25, 0.12, -0.08, 0.35, 0.08, 0.77, -0.26, 0.22, 0.15, 0.93, 0.85, 0.9, 0.2],
  },
  {
    id: 'duhovy-cerv',
    name: 'Duhový červ',
    desc: 'Pestrobarevný červ se stáčí a klikatí, občas se roztrhne na dva.',
    species: 6,
    matrix: [-0.46, 0.95, 0.85, -0.47, 0.17, 0.37, -0.91, -0.05, 0.6, 0.52, 0.11, 0.33, 0.21, 0.48, 0.3, 0.02, -0.12, 0.66, 0.89, 0.07, -0.87, 0.69, 0.58, -0.57, 0.68, -0.58, 0.12, 0.19, -0.08, -0.71, -0.43, 0.8, -0.21, -0.59, 0.57, -0.13],
  },
  {
    id: 'hvezdokupa',
    name: 'Hvězdokupa',
    desc: 'Pravidelná mřížka drobných hvězdiček a mezi nimi velká zářící slunce.',
    species: 4,
    matrix: [-0.15, 0.97, -0.69, -0.19, 0.35, -0.16, -0.6, -0.58, -0.02, -0.08, -0.91, -0.28, -0.05, -0.99, -0.96, 0.3],
  },
  {
    id: 'kviti',
    name: 'Kvítí',
    desc: 'Louka drobných dvoubarevných kvítků, mezi kterými putují prstence.',
    species: 6,
    matrix: [-0.58, 0.31, -0.76, 0.59, -0.51, 0.14, 0.59, 0.6, -0.95, -0.77, 0.19, 0.97, -0.68, -0.09, -0.66, 0.29, -0.09, 0.41, 0.94, 0.21, -0.76, 0.15, -0.44, -0.6, -0.71, -0.34, -0.48, 0.82, 0.15, -0.54, -0.31, -0.11, 0.78, 0.05, -0.2, -0.48],
  },
  {
    id: 'deleni-bunek',
    name: 'Dělení buněk',
    desc: 'Každý druh drží při sobě a ostatní odstrkuje – kapky se slévají a zase dělí.',
    species: 6,
    matrix: build(6, (a, b) => (a === b ? 0.9 : -0.2)),
  },
  {
    id: 'krystaly',
    name: 'Krystaly',
    desc: 'Sousední druhy se k sobě lepí – vznikají pravidelné dvojice a mozaiky.',
    species: 6,
    matrix: build(6, (a, b) => {
      const d = Math.abs(a - b);
      return d === 0 ? -0.4 : d === 1 ? 0.95 : -0.15;
    }),
  },
  {
    id: 'dravy-roj',
    name: 'Dravý roj',
    desc: 'Jeden druh honí všechny ostatní, kořist se před ním stahuje do hejn.',
    species: 6,
    matrix: build(6, (a, b) => (a === 0 ? (b === 0 ? 0.5 : 0.9) : b === 0 ? -1 : a === b ? 0.6 : 0.1)),
  },
  {
    id: 'honicka',
    name: 'Honička',
    desc: 'Každý honí dalšího a sám sebe nesnáší – po chvíli se zvednou vlny jako na moři.',
    species: 6,
    matrix: build(6, (a, b, S) => (b === (a + 1) % S ? 1 : a === b ? -0.35 : -0.1)),
    density: 1.6,
  },
  {
    id: 'membrany',
    name: 'Membrány',
    desc: 'Světlé částice se rozprostřou v tenkých blanách kolem kapek, mezi nimi se kroutí červíci.',
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
    desc: 'Velký dosah a slabé tření – z točící se spirály se rodí zářivá ramena.',
    species: 5,
    matrix: build(5, (a, b, S) => (a === b ? 0.5 : b === (a + 1) % S ? 0.4 : b === (a + S - 1) % S ? -0.2 : 0.05)),
    physics: { rMax: 130, friction: 0.93, force: 14 },
    layout: 'spiral',
  },
  {
    id: 'prapolevka',
    name: 'Prapolévka',
    desc: 'Náhodná matice z pevného semínka – co se v ní zrodí, když ji necháš chvíli vařit?',
    species: 6,
    matrix: randomMatrix(6, mulberry32(20260923)),
  },
];

export const DEFAULT_PRESET_ID = 'bunky';

export function getPreset(id: string | null | undefined): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function presetPhysics(p: Preset): Physics {
  return { ...DEFAULT_PHYSICS, ...p.physics };
}
