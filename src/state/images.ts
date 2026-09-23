/**
 * Small image store for gallery previews and favourite thumbnails.
 *
 * Images live in Cache Storage (as Blobs), not in localStorage: every garon92 app shares one
 * origin and its ~5 MB localStorage quota, which is meant for progress data. When Cache Storage
 * is unavailable (insecure context, some private modes) images are kept in memory only.
 */
const CACHE = 'dots-images-v1';
const MAX_PREVIEWS = 64;

const memory = new Map<string, Blob>();
const urls = new Map<string, string>();

function hasCaches(): boolean {
  try {
    return typeof caches !== 'undefined' && typeof caches.open === 'function';
  } catch {
    return false;
  }
}

function req(key: string): Request {
  return new Request(new URL(`${import.meta.env.BASE_URL}__img/${encodeURIComponent(key)}`, location.origin).href);
}

async function open(): Promise<Cache | null> {
  if (!hasCaches()) return null;
  try {
    return await caches.open(CACHE);
  } catch {
    return null;
  }
}

export async function putImage(key: string, blob: Blob): Promise<string> {
  memory.set(key, blob);
  const old = urls.get(key);
  if (old) URL.revokeObjectURL(old);
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  const c = await open();
  if (c) {
    try {
      await c.put(req(key), new Response(blob, { headers: { 'Content-Type': blob.type || 'image/webp' } }));
      if (key.startsWith('thumb/')) void prune(c);
    } catch {
      /* quota – memory copy still works for this session */
    }
  }
  return url;
}

/** Object URL for a stored image, or null. */
export async function imageUrl(key: string): Promise<string | null> {
  const cached = urls.get(key);
  if (cached) return cached;
  let blob = memory.get(key) ?? null;
  if (!blob) {
    const c = await open();
    if (c) {
      try {
        const res = await c.match(req(key));
        if (res) blob = await res.blob();
      } catch {
        blob = null;
      }
    }
  }
  if (!blob || blob.size === 0) return null;
  memory.set(key, blob);
  const url = URL.createObjectURL(blob);
  urls.set(key, url);
  return url;
}

export async function imageBlob(key: string): Promise<Blob | null> {
  if (memory.has(key)) return memory.get(key)!;
  const url = await imageUrl(key);
  return url ? (memory.get(key) ?? null) : null;
}

export async function deleteImage(key: string): Promise<void> {
  memory.delete(key);
  const u = urls.get(key);
  if (u) URL.revokeObjectURL(u);
  urls.delete(key);
  const c = await open();
  try {
    await c?.delete(req(key));
  } catch {
    /* ignore */
  }
}

/** Keep only the newest previews (favourite thumbnails are never pruned). */
async function prune(c: Cache): Promise<void> {
  try {
    const keys = (await c.keys()).filter((r) => r.url.includes('/__img/thumb%2F'));
    for (const r of keys.slice(0, Math.max(0, keys.length - MAX_PREVIEWS))) await c.delete(r);
  } catch {
    /* ignore */
  }
}

export function dataUrlToBlob(dataUrl: string): Blob | null {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  try {
    if (!m[2]) return new Blob([decodeURIComponent(m[3])], { type: m[1] });
    const bin = atob(m[3]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return null;
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export const favThumbKey = (id: string): string => `fav/${id}`;
