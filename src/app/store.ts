/** Tiny observable store: `set()` merges a patch and notifies listeners about the changed keys. */
export type Listener<T> = (state: T, changed: ReadonlySet<keyof T>) => void;

export class Store<T extends object> {
  private listeners = new Set<Listener<T>>();
  constructor(public state: T) {}

  set(patch: Partial<T>): void {
    const changed = new Set<keyof T>();
    for (const k of Object.keys(patch) as (keyof T)[]) {
      if (this.state[k] !== patch[k]) changed.add(k);
    }
    if (changed.size === 0) return;
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l(this.state, changed);
  }

  /** Subscribe; when `keys` is given the listener only fires if one of them changed. */
  on(keys: (keyof T)[] | null, fn: Listener<T>): () => void {
    const l: Listener<T> = (s, changed) => {
      if (!keys || keys.some((k) => changed.has(k))) fn(s, changed);
    };
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}
