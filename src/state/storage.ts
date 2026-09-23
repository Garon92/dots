import { createStore, type Store } from '../kit/store';
import { randomSeed } from '../sim/rng';
import { DEFAULT_PHYSICS } from '../sim/types';
import { type Recipe, sanitizeRecipe } from './recipe';

/**
 * Persistent app data on top of the g92 kit store (`g92:dots:<key>`, versioned, private-mode safe).
 *
 *  settings   – look & tool preferences (see settings.ts)
 *  favorites  – saved worlds with thumbnails
 *  session    – the last world, restored when the app is opened without a link
 *  thumbs     – cached preset preview images
 */
export interface Favorite {
  id: string;
  name: string;
  created: number;
  recipe: Recipe;
  bonds?: boolean;
  /** Particle density relative to the screen default when saved (1 = default). */
  density?: number;
  /** Small WebP/JPEG data URL (only in backups; stored separately, see images.ts). */
  thumb?: string;
}

interface FavoritesFile {
  v: 1;
  items: Favorite[];
}

export interface SessionData {
  recipe: unknown;
  presetId: string | null;
  favId: string | null;
  title: string;
}

export interface ThumbCache {
  v: number;
  entries: Record<string, string>;
}

type DotsData = {
  settings: unknown;
  favorites: FavoritesFile;
  session: SessionData | null;
  /** @deprecated preview images moved to Cache Storage (images.ts); removed on start. */
  thumbs: ThumbCache | null;
  /** Ids of gallery worlds the user has opened (menu progress). */
  visited: string[];
};

/** Neutral recipe used to repair broken stored data. */
const REPAIR: Recipe = {
  species: 6,
  matrix: new Array<number>(36).fill(0),
  counts: new Array<number>(6).fill(500),
  physics: { ...DEFAULT_PHYSICS },
  layout: 'random',
  seed: 1,
};

let store: Store<DotsData> | null = null;
let migratedCount = 0;

export function dotsStore(): Store<DotsData> {
  store ??= createStore<DotsData>('dots', {
    version: 1,
    defaults: { settings: null, favorites: { v: 1, items: [] }, session: null, thumbs: null, visited: [] },
    migrate(from, m) {
      if (from < 1) {
        // "My Setups" of the original single-file Dots → favourites (the old key is kept untouched)
        const legacy = m.legacyJSON<unknown>('dots.setups.v1');
        const converted = convertLegacySetups(legacy);
        if (converted.length) {
          const cur = m.get('favorites');
          const items = cur && Array.isArray(cur.items) ? cur.items : [];
          m.set('favorites', { v: 1, items: [...items, ...converted] });
          migratedCount = converted.length;
        }
      }
    },
  });
  return store;
}

/** How many legacy setups were migrated during this page load (0 = none). */
export function legacyMigrated(): number {
  dotsStore();
  return migratedCount;
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** Pure: the original app's `dots.setups.v1` array → favourites. */
export function convertLegacySetups(legacy: unknown): Favorite[] {
  if (!Array.isArray(legacy)) return [];
  const out: Favorite[] = [];
  for (const su of legacy as Record<string, unknown>[]) {
    if (!su || typeof su !== 'object') continue;
    const phys = (su.phys && typeof su.phys === 'object' ? su.phys : {}) as Record<string, number>;
    const recipe = sanitizeRecipe(
      {
        species: 6,
        matrix: su.matrix,
        counts: su.pop,
        physics: { ...DEFAULT_PHYSICS, rMax: phys.rMax, friction: phys.friction, dt: phys.dt, force: phys.forceScale },
        layout: 'random',
        seed: randomSeed(),
      },
      REPAIR,
    );
    out.push({
      id: newId(),
      name: typeof su.name === 'string' && su.name.trim() ? su.name.trim().slice(0, 40) : 'Nastavení',
      created: Date.now(),
      recipe,
      bonds: typeof su.bonds === 'boolean' ? su.bonds : undefined,
    });
  }
  return out;
}

export function loadFavorites(): Favorite[] {
  return sanitizeFavorites(dotsStore().get('favorites'));
}

/** Validate a favourites file (from storage or an imported backup). */
export function sanitizeFavorites(file: unknown): Favorite[] {
  const f = file as Partial<FavoritesFile> | null;
  if (!f || f.v !== 1 || !Array.isArray(f.items)) return [];
  return f.items
    .filter((x): x is Favorite => !!x && typeof x === 'object' && typeof (x as Favorite).name === 'string')
    .slice(0, 500)
    .map((x) => ({
      id: typeof x.id === 'string' ? x.id.slice(0, 40) : newId(),
      name: x.name.slice(0, 40),
      created: typeof x.created === 'number' ? x.created : Date.now(),
      recipe: sanitizeRecipe(x.recipe, REPAIR),
      bonds: typeof x.bonds === 'boolean' ? x.bonds : undefined,
      density: typeof x.density === 'number' && Number.isFinite(x.density) && x.density > 0 ? Math.min(8, x.density) : undefined,
      thumb: typeof x.thumb === 'string' && /^data:image\/(webp|jpeg|png);base64,/.test(x.thumb) && x.thumb.length < 200_000 ? x.thumb : undefined,
    }));
}

/** Backup file content for download. */
export function favoritesBackup(items: Favorite[]): string {
  return JSON.stringify({ app: 'dots', v: 1, exported: new Date().toISOString(), items } satisfies FavoritesFile & { app: string; exported: string });
}

/**
 * Persist favourites (without thumbnails – those live in the image store). Returns false when
 * the browser refused to store them (quota).
 */
export function saveFavorites(items: Favorite[]): boolean {
  const s = dotsStore();
  const file: FavoritesFile = { v: 1, items: items.map(({ thumb: _thumb, ...rest }) => rest) };
  s.set('favorites', file);
  try {
    return localStorage.getItem(s.keyOf('favorites')) === JSON.stringify(file);
  } catch {
    return false;
  }
}

/** Drop the old localStorage preview cache (≤ v2 stored ~1 MB of data URLs there). */
export function dropLegacyThumbCache(): void {
  const s = dotsStore();
  if (s.get('thumbs') !== null) s.reset('thumbs');
}

export function loadSession(): SessionData | null {
  const s = dotsStore().get('session');
  return s && typeof s === 'object' ? s : null;
}

export function saveSession(data: SessionData): void {
  dotsStore().set('session', data);
}

export function markVisited(presetId: string): string[] {
  const s = dotsStore();
  const cur = Array.isArray(s.get('visited')) ? s.get('visited') : [];
  if (cur.includes(presetId)) return cur;
  const next = [...cur, presetId].slice(-200);
  s.set('visited', next);
  return next;
}

export function visitedPresets(): string[] {
  const v = dotsStore().get('visited');
  return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
}
