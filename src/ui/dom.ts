type Attrs = Record<string, string | number | boolean | null | undefined | ((e: never) => void)>;
type Child = Node | string | number | null | undefined | false;

/** Minimal hyperscript: h('button.btn.primary', { onclick, 'aria-label': '…' }, 'Text', icon) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K | `${K}.${string}` | `${K}#${string}`, attrs?: Attrs | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const m = /^([a-z0-9-]+)(?:#([\w-]+))?((?:\.[\w-]+)*)$/i.exec(tag);
  const name = (m ? m[1] : tag) as K;
  const el = document.createElement(name);
  if (m?.[2]) el.id = m[2];
  if (m?.[3]) el.className = m[3].slice(1).replace(/\./g, ' ');
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') {
        el.addEventListener(k.slice(2), v as EventListener);
      } else if (k === 'class') {
        el.className = `${el.className} ${String(v)}`.trim();
      } else if (k === 'html') {
        el.innerHTML = String(v);
      } else if (v === true) {
        el.setAttribute(k, '');
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  for (const c of children) append(el, c);
  return el;
}

function append(el: Element, c: Child) {
  if (c == null || c === false) return;
  el.append(typeof c === 'number' ? String(c) : c);
}

/** Parse an SVG string into an element. */
export function svg(markup: string): SVGSVGElement {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild as SVGSVGElement;
}

/** 12 345 with a narrow no-break space (like cs-CZ; avoids the costly first Intl call at boot). */
export const fmtInt = (n: number): string => {
  const v = Math.round(n);
  const s = String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
  return v < 0 ? `−${s}` : s;
};
export const fmtNum = (n: number, digits = 2): string => n.toFixed(digits).replace('.', ',');
export const fmtSigned = (n: number): string => (n > 0.004 ? '+' : n < -0.004 ? '−' : '') + Math.abs(n).toFixed(2).replace('.', ',');

export function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (t as HTMLInputElement).type;
    return !['checkbox', 'radio', 'range', 'button'].includes(type);
  }
  return false;
}
