import { bindRange } from '../kit/dom';
import { h } from './dom';
import { type IconName, icon } from './icons';

let uid = 0;
const nextId = (p: string) => `${p}-${++uid}`;

export interface SliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Text in the editable number box. */
  format?: (v: number) => string;
  /** Called continuously while dragging. */
  onInput: (v: number) => void;
  /** Called when the user releases the slider or commits a typed value. */
  onCommit?: (v: number) => void;
  /** Colour of the track fill (defaults to the accent). */
  color?: string;
  hint?: string;
  /** Small coloured dot before the label. */
  swatch?: string;
  /** Extra keywords for aria. */
  unit?: string;
}

export interface SliderHandle {
  el: HTMLElement;
  input: HTMLInputElement;
  set(v: number, max?: number): void;
}

/**
 * Range slider + editable number (click the number and type an exact value – Enter applies,
 * Escape reverts, a decimal comma works too). Keeps the feature of the original Dots.
 */
export function slider(o: SliderOptions): SliderHandle {
  const id = nextId('sl');
  const fmt = o.format ?? ((v: number) => String(Math.round(v * 100) / 100).replace('.', ','));
  const range = h('input', {
    type: 'range',
    class: 'g92-range ctl__range',
    id,
    min: o.min,
    max: o.max,
    step: o.step,
    'aria-valuetext': '',
  });
  range.value = String(o.value);
  if (o.color) range.style.setProperty('--accent', o.color);
  const updateFill = () => {
    const min = Number(range.min);
    const max = Number(range.max);
    range.style.setProperty('--_pct', `${((Number(range.value) - min) / (max - min || 1)) * 100}%`);
    range.setAttribute('aria-valuetext', `${fmt(Number(range.value))}${o.unit ? ` ${o.unit}` : ''}`);
  };
  bindRange(range);
  const num = h('input', {
    type: 'text',
    class: 'ctl__num',
    inputmode: 'decimal',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': `${o.label} – přesná hodnota`,
    title: 'Klikni a napiš přesnou hodnotu',
  });
  num.value = fmt(o.value);
  const label = h('label', { class: 'ctl__label', for: id }, o.swatch ? h('span', { class: 'swatch', style: `--c:${o.swatch}` }) : null, o.label);
  const el = h(
    'div',
    { class: 'ctl' },
    h('div', { class: 'ctl__head' }, label, num),
    range,
    o.hint ? h('div', { class: 'ctl__hint' }, o.hint) : null,
  );

  range.addEventListener('input', () => {
    const v = Number(range.value);
    if (document.activeElement !== num) num.value = fmt(v);
    updateFill();
    o.onInput(v);
  });
  range.addEventListener('change', () => o.onCommit?.(Number(range.value)));

  const commitTyped = () => {
    const v = parseFloat(num.value.replace(/\s/g, '').replace(',', '.'));
    if (Number.isFinite(v)) {
      const max = Number(range.max);
      const c = Math.min(max, Math.max(Number(range.min), v));
      range.value = String(c);
      updateFill();
      o.onInput(c);
      o.onCommit?.(c);
    }
    num.value = fmt(Number(range.value));
  };
  num.addEventListener('focus', () => num.select());
  num.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      num.blur();
    } else if (e.key === 'Escape') {
      num.value = fmt(Number(range.value));
      num.blur();
      e.stopPropagation();
    }
  });
  num.addEventListener('blur', commitTyped);

  updateFill();
  return {
    el,
    input: range,
    set(v: number, max?: number) {
      if (max !== undefined && Number(range.max) !== max) range.max = String(max);
      if (Number(range.value) !== v) range.value = String(v);
      if (document.activeElement !== num) num.value = fmt(v);
      updateFill();
    },
  };
}

export interface ToggleHandle {
  el: HTMLElement;
  input: HTMLInputElement;
  set(v: boolean): void;
}

export function toggle(label: string, value: boolean, onChange: (v: boolean) => void, hint?: string): ToggleHandle {
  const id = nextId('tg');
  const input = h('input', { type: 'checkbox', class: 'g92-toggle', role: 'switch', id });
  input.checked = value;
  input.addEventListener('change', () => onChange(input.checked));
  const el = h(
    'div',
    { class: 'ctl ctl--switch' },
    h('label', { class: 'g92-switch-row', for: id }, h('span', { class: 'ctl__label' }, label), input),
    hint ? h('div', { class: 'ctl__hint' }, hint) : null,
  );
  return {
    el,
    input,
    set(v) {
      input.checked = v;
    },
  };
}

export interface SegOption<T extends string | number> {
  value: T;
  label: string;
  icon?: IconName;
  title?: string;
}

export interface SegHandle<T> {
  el: HTMLElement;
  set(v: T): void;
}

/** Segmented control (buttons with aria-pressed, kit styling). */
export function segmented<T extends string | number>(label: string, options: SegOption<T>[], value: T, onChange: (v: T) => void): SegHandle<T> {
  const group = h('div', { class: 'g92-segmented g92-segmented--block seg', role: 'group', 'aria-label': label });
  const buttons = options.map((o) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(o.value === value), title: o.title ?? null });
    if (o.icon) b.append(icon(o.icon));
    b.append(h('span', null, o.label));
    b.addEventListener('click', () => {
      set(o.value);
      onChange(o.value);
    });
    group.append(b);
    return b;
  });
  const set = (v: T) => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i].value === v)));
  return { el: group, set };
}

/** Icon + text action button in the panel's action grids. */
export function actionButton(ic: IconName, label: string, onClick: () => void, opts: { title?: string; kbd?: string; variant?: string } = {}): HTMLButtonElement {
  const b = h(
    'button',
    {
      type: 'button',
      class: `act ${opts.variant ?? ''}`.trim(),
      title: opts.title ?? (opts.kbd ? `${label} (${opts.kbd})` : label),
    },
    icon(ic),
    h('span', { class: 'act__label' }, label),
    opts.kbd ? h('kbd', { class: 'act__kbd' }, opts.kbd) : null,
  );
  b.addEventListener('click', onClick);
  return b;
}

export function section(title: string, ...children: (Node | null)[]): HTMLElement {
  return h('section', { class: 'sec' }, h('h3', { class: 'sec__title' }, title), ...children);
}
