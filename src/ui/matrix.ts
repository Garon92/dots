import type { App } from '../app/app';
import { force } from '../sim/force';
import { MAX_SPECIES, MIN_SPECIES } from '../sim/types';
import { css, type Rgb, SPECIES_NAMES } from '../state/palette';
import { actionButton, section, slider, type SliderHandle } from './controls';
import { fmtSigned, h } from './dom';
import { icon } from './icons';

const SVGNS = 'http://www.w3.org/2000/svg';

/** Visual language of the original Dots: warm fill = attraction, hollow teal ring = repulsion. */
export function cellBackground(v: number, theme: 'dark' | 'light'): string {
  if (v > 0.004) {
    const t = Math.min(1, v);
    const g = Math.round(150 - t * 40);
    const b = Math.round(90 - t * 40);
    return `rgb(255 ${g} ${b} / ${(theme === 'dark' ? 0.14 : 0.2) + t * 0.66})`;
  }
  if (v < -0.004) {
    const t = Math.min(1, -v);
    const a = (theme === 'dark' ? 0.1 : 0.16) + t * (theme === 'dark' ? 0.3 : 0.45);
    return `radial-gradient(circle at 50% 50%, rgb(20 184 166 / 0) ${38 - t * 22}%, rgb(20 184 166 / ${a}) 100%)`;
  }
  return 'transparent';
}

/** Plain-language description of one matrix entry (names stay in the nominative – no declension needed). */
export function describePair(a: number, b: number, vab: number, vba: number): string {
  const A = SPECIES_NAMES[a];
  const B = SPECIES_NAMES[b];
  const strength = (v: number) => (Math.abs(v) < 0.35 ? 'slabě' : Math.abs(v) < 0.7 ? 'středně' : 'silně');
  if (a === b) {
    if (Math.abs(vab) < 0.05) return `Částice druhu ${A} si jedna druhé nevšímají.`;
    return vab > 0
      ? `Částice druhu ${A} drží ${strength(vab)} pohromadě${vab > 0.6 ? ' a tvoří husté shluky' : ''}.`
      : `Částice druhu ${A} se navzájem ${strength(vab)} odstrkují${vab < -0.6 ? ' a rozlézají se do prostoru' : ''}.`;
  }
  if (Math.abs(vab) < 0.05) return `${A} si druhu ${B} nevšímá.`;
  if (vab > 0 && vba < -0.05) return `Pronásledování: ${A} honí, ${B} utíká. Tak vzniká pohyb a „život“.`;
  if (vab < 0 && vba > 0.05) return `Pronásledování: ${B} honí, ${A} utíká.`;
  if (vab > 0 && vba > 0.05) return `Vzájemná přitažlivost: ${A} i ${B} se k sobě táhnou (${A} ${strength(vab)}).`;
  if (vab > 0) return `${A} se ${strength(vab)} táhne za druhem ${B}.`;
  return `${A} se druhu ${B} ${strength(vab)} vyhýbá.`;
}

export class MatrixTab {
  readonly el: HTMLElement;
  private grid: HTMLElement;
  private cells: HTMLElement[] = [];
  private heads: HTMLElement[] = [];
  private species = 0;
  private badge: HTMLElement;
  private inspector: HTMLElement;
  private insTitle: HTMLElement;
  private insText: HTMLElement;
  private insSlider: SliderHandle;
  private chart: SVGSVGElement;
  private countEl: HTMLElement;
  private minusBtn: HTMLButtonElement;
  private plusBtn: HTMLButtonElement;
  private undoBtn: HTMLButtonElement;
  private redoBtn: HTMLButtonElement;
  private wheelTimer = 0;

  constructor(private app: App) {
    const s = app.store.state;
    this.countEl = h('output', { class: 'stepper__value', 'aria-live': 'polite' });
    this.minusBtn = h('button', { type: 'button', class: 'stepper__btn', 'aria-label': 'Ubrat druh', title: 'Ubrat druh' }, icon('minus'));
    this.plusBtn = h('button', { type: 'button', class: 'stepper__btn', 'aria-label': 'Přidat druh', title: 'Přidat druh' }, icon('plus'));
    this.minusBtn.addEventListener('click', () => app.setSpecies(app.store.state.recipe.species - 1));
    this.plusBtn.addEventListener('click', () => app.setSpecies(app.store.state.recipe.species + 1));
    const stepper = h('div', { class: 'stepper' }, h('span', { class: 'stepper__label' }, 'Počet druhů'), this.minusBtn, this.countEl, this.plusBtn);

    this.grid = h('div', {
      class: 'matrix',
      role: 'grid',
      tabindex: 0,
      'aria-label': 'Matice sil. Šipkami vyber buňku, plus a minus mění sílu, nula ji vynuluje.',
    });
    this.badge = h('div', { class: 'cell-badge', 'aria-hidden': 'true' });

    this.insTitle = h('div', { class: 'ins__title' });
    this.insText = h('p', { class: 'ins__text' });
    this.insSlider = slider({
      label: 'Síla',
      min: -1,
      max: 1,
      step: 0.01,
      value: 0,
      format: (v) => fmtSigned(v),
      onInput: (v) => {
        const sel = this.app.store.state.selCell;
        if (sel >= 0) this.app.setCell(sel, v);
      },
    });
    this.insSlider.input.addEventListener('pointerdown', () => this.app.beginCellEdit());
    this.insSlider.input.addEventListener('keydown', (e) => {
      if (e.key.startsWith('Arrow') || e.key.startsWith('Page') || e.key === 'Home' || e.key === 'End') this.app.beginCellEdit();
    });
    this.chart = document.createElementNS(SVGNS, 'svg');
    this.chart.setAttribute('viewBox', '0 0 300 130');
    this.chart.setAttribute('class', 'force-chart');
    this.chart.setAttribute('role', 'img');
    const closeIns = h('button', { type: 'button', class: 'g92-btn g92-btn--ghost g92-btn--icon g92-btn--sm ins__close', 'aria-label': 'Zavřít detail buňky' }, icon('close'));
    closeIns.addEventListener('click', () => this.app.store.set({ selCell: -1 }));
    this.inspector = h(
      'div',
      { class: 'ins', hidden: true },
      h('div', { class: 'ins__head' }, this.insTitle, closeIns),
      this.insText,
      this.insSlider.el,
      this.chart,
      h('div', { class: 'chart-legend' }, h('span', { class: 'lg lg--solid' }, 'jak řádek cítí sloupec'), h('span', { class: 'lg lg--dash' }, 'a naopak')),
    );

    const legend = h(
      'div',
      { class: 'matrix-legend' },
      h('span', null, h('i', { class: 'lg-swatch lg-swatch--warm' }), 'přitahuje'),
      h('span', null, h('i', { class: 'lg-swatch lg-swatch--cool' }), 'odpuzuje'),
      h('span', { class: 'matrix-legend__hint' }, 'řádek → sloupec · táhni nahoru/dolů'),
    );

    this.undoBtn = actionButton('undo', 'Zpět', () => app.undo(), { kbd: 'Ctrl+Z' });
    this.redoBtn = actionButton('redo', 'Znovu', () => app.redo(), { kbd: 'Ctrl+Y' });
    const actions = h(
      'div',
      { class: 'act-grid' },
      actionButton('dice', 'Náhodná', () => app.randomize(), { kbd: 'R', variant: 'act--accent' }),
      actionButton('mutate', 'Zmutovat', () => app.mutate(), { kbd: 'M' }),
      actionButton('symmetric', 'Souměrná', () => app.symmetrize(), { kbd: 'Y', title: 'Souměrná matice – nikdo nikoho nehoní (Y)' }),
      actionButton('invert', 'Obrátit', () => app.invert(), { kbd: 'I', title: 'Obrátit znaménka – přitahování ↔ odpuzování (I)' }),
      actionButton('transpose', 'Prohodit', () => app.transpose(), { kbd: 'X', title: 'Prohodit role – kdo honil, bude honěn (X)' }),
      actionButton('zero', 'Vynulovat', () => app.zero(), { kbd: '0', title: 'Všechny síly na nulu (0)' }),
      this.undoBtn,
      this.redoBtn,
    );

    this.el = h(
      'div',
      { class: 'tab-page', id: 'tab-matice' },
      section('Kdo koho přitahuje', stepper, h('div', { class: 'matrix-wrap' }, this.grid), legend, this.inspector),
      section('Úpravy matice', actions),
    );
    document.body.append(this.badge);

    this.bindGrid();
    this.rebuild();
    app.store.on(['recipe'], (st) => {
      if (st.recipe.species !== this.species) this.rebuild();
      else this.repaint();
    });
    let palette = s.settings.palette;
    app.store.on(['theme'], () => this.rebuild());
    app.store.on(['settings'], (st) => {
      if (st.settings.palette !== palette) {
        palette = st.settings.palette;
        this.rebuild();
      }
    });
    app.store.on(['selCell'], () => this.updateSelection());
    app.store.on(['canUndo', 'canRedo'], (st) => {
      this.undoBtn.disabled = !st.canUndo;
      this.redoBtn.disabled = !st.canRedo;
    });
    this.undoBtn.disabled = !s.canUndo;
    this.redoBtn.disabled = !s.canRedo;
    const prev = app.onMatrixFrame;
    app.onMatrixFrame = () => {
      prev();
      this.repaint();
    };
  }

  private colors(): Rgb[] {
    return this.app.colors();
  }

  rebuild(): void {
    const S = this.app.store.state.recipe.species;
    this.species = S;
    this.grid.style.setProperty('--S', String(S));
    this.grid.replaceChildren();
    this.cells = [];
    this.heads = [];
    const colors = this.colors();
    this.grid.append(h('div', { class: 'mcorner', 'aria-hidden': 'true' }));
    for (let b = 0; b < S; b++) {
      const d = h('div', { class: 'mhead', role: 'columnheader', title: SPECIES_NAMES[b], style: `--c:${css(colors[b])}` });
      d.append(h('span', { class: 'g92-sr-only' }, SPECIES_NAMES[b]));
      this.grid.append(d);
      this.heads.push(d);
    }
    for (let a = 0; a < S; a++) {
      const rh = h('div', { class: 'mhead mhead--row', role: 'rowheader', title: SPECIES_NAMES[a], style: `--c:${css(colors[a])}` });
      rh.append(h('span', { class: 'g92-sr-only' }, SPECIES_NAMES[a]));
      this.grid.append(rh);
      for (let b = 0; b < S; b++) {
        const cell = h('div', {
          class: `mcell${a === b ? ' mcell--diag' : ''}`,
          role: 'gridcell',
          'data-i': a * S + b,
        });
        cell.append(h('div', { class: 'mcell__fill' }));
        this.grid.append(cell);
        this.cells.push(cell);
      }
    }
    this.countEl.textContent = String(S);
    this.minusBtn.disabled = S <= MIN_SPECIES;
    this.plusBtn.disabled = S >= MAX_SPECIES;
    this.repaint();
    this.updateSelection();
  }

  repaint(): void {
    const S = this.species;
    const theme = this.app.store.state.theme;
    const eff = this.app.effective;
    for (let i = 0; i < S * S; i++) {
      const cell = this.cells[i];
      if (!cell) continue;
      const v = eff[i];
      (cell.firstChild as HTMLElement).style.background = cellBackground(v, theme);
      cell.setAttribute('aria-label', `${SPECIES_NAMES[Math.floor(i / S)]} → ${SPECIES_NAMES[i % S]}: ${fmtSigned(v)}`);
    }
    if (this.app.store.state.selCell >= 0) this.updateInspector();
  }

  private updateSelection(): void {
    const sel = this.app.store.state.selCell;
    this.cells.forEach((c, i) => c.classList.toggle('is-selected', i === sel));
    const S = this.species;
    this.heads.forEach((hd, i) => hd.classList.toggle('is-hl', sel >= 0 && (i === sel % S)));
    this.grid.querySelectorAll('.mhead--row').forEach((hd, i) => hd.classList.toggle('is-hl', sel >= 0 && i === Math.floor(sel / S)));
    this.inspector.hidden = sel < 0;
    if (sel >= 0) {
      this.grid.setAttribute('aria-activedescendant', '');
      this.updateInspector();
    }
  }

  private updateInspector(): void {
    const sel = this.app.store.state.selCell;
    const S = this.species;
    if (sel < 0 || sel >= S * S) return;
    const a = Math.floor(sel / S);
    const b = sel % S;
    const colors = this.colors();
    const vab = this.app.effective[a * S + b];
    const vba = this.app.effective[b * S + a];
    this.insTitle.replaceChildren(
      h('span', { class: 'dot', style: `--c:${css(colors[a])}` }),
      SPECIES_NAMES[a],
      h('span', { class: 'ins__arrow' }, '→'),
      h('span', { class: 'dot', style: `--c:${css(colors[b])}` }),
      SPECIES_NAMES[b],
    );
    this.insText.textContent = describePair(a, b, vab, vba);
    this.insSlider.set(Math.round(vab * 100) / 100);
    this.drawChart(vab, a === b ? null : vba, colors[a], colors[b]);
  }

  private drawChart(vab: number, vba: number | null, ca: Rgb, cb: Rgb): void {
    const beta = this.app.store.state.recipe.physics.beta;
    const W = 300;
    const H = 130;
    const pad = { l: 8, r: 8, t: 14, b: 22 };
    const x = (r: number) => pad.l + (r / 1.1) * (W - pad.l - pad.r);
    const y = (f: number) => pad.t + (1 - (f + 1) / 2) * (H - pad.t - pad.b);
    const path = (a: number) => {
      let d = '';
      for (let i = 0; i <= 88; i++) {
        const r = (i / 88) * 1.1;
        d += `${i ? 'L' : 'M'}${x(r).toFixed(1)},${y(force(r, a, beta)).toFixed(1)}`;
      }
      return d;
    };
    const rMax = this.app.store.state.recipe.physics.rMax;
    this.chart.innerHTML = `
      <rect x="${x(0)}" y="${pad.t}" width="${x(beta) - x(0)}" height="${H - pad.t - pad.b}" class="fc-zone"/>
      <line x1="${x(0)}" x2="${x(1.1)}" y1="${y(0)}" y2="${y(0)}" class="fc-axis"/>
      <line x1="${x(1)}" x2="${x(1)}" y1="${pad.t}" y2="${H - pad.b}" class="fc-grid"/>
      <text x="${x(beta / 2)}" y="${H - 8}" class="fc-label" text-anchor="middle">zblízka</text>
      <text x="${x((1 + beta) / 2)}" y="${H - 8}" class="fc-label" text-anchor="middle">střední vzdálenost</text>
      <text x="${x(1)}" y="${H - 8}" class="fc-label" text-anchor="middle">${Math.round(rMax)} j.</text>
      <text x="${x(1.1) - 2}" y="${pad.t + 8}" class="fc-label" text-anchor="end">přitahuje ↑</text>
      <text x="${x(1.1) - 2}" y="${H - pad.b - 4}" class="fc-label" text-anchor="end">odpuzuje ↓</text>
      ${vba !== null ? `<path d="${path(vba)}" class="fc-line fc-line--dash" style="stroke:${css(cb)}"/>` : ''}
      <path d="${path(vab)}" class="fc-line" style="stroke:${css(ca)}"/>`;
    this.chart.setAttribute('aria-label', `Graf síly v závislosti na vzdálenosti. Maximum ve střední vzdálenosti: ${fmtSigned(vab)}.`);
  }

  // ---------------------------------------------------------------- interaction

  private bindGrid(): void {
    let drag: { i: number; y0: number; v0: number; moved: boolean; id: number } | null = null;
    const cellAt = (t: EventTarget | null) => (t instanceof Element ? (t.closest('.mcell') as HTMLElement | null) : null);

    this.grid.addEventListener('pointerdown', (e) => {
      const cell = cellAt(e.target);
      if (!cell) return;
      const i = Number(cell.dataset.i);
      drag = { i, y0: e.clientY, v0: this.app.store.state.recipe.matrix[i] ?? 0, moved: false, id: e.pointerId };
      try {
        this.grid.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      cell.classList.add('is-active');
      this.app.store.set({ selCell: i });
      this.showBadge(i);
      e.preventDefault();
    });
    this.grid.addEventListener('pointermove', (e) => {
      if (drag && e.pointerId === drag.id) {
        const dy = drag.y0 - e.clientY;
        if (!drag.moved && Math.abs(dy) < 3) return;
        if (!drag.moved) {
          drag.moved = true;
          this.app.beginCellEdit();
        }
        const v = drag.v0 + dy / 120;
        this.app.setCell(drag.i, v);
        this.showBadge(drag.i);
        return;
      }
      if (e.pointerType === 'mouse') {
        const cell = cellAt(e.target);
        if (cell) this.showBadge(Number(cell.dataset.i));
        else this.hideBadge();
      }
    });
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return;
      this.cells[drag.i]?.classList.remove('is-active');
      drag = null;
      this.hideBadge();
    };
    this.grid.addEventListener('pointerup', end);
    this.grid.addEventListener('pointercancel', end);
    this.grid.addEventListener('pointerleave', () => {
      if (!drag) this.hideBadge();
    });
    this.grid.addEventListener(
      'wheel',
      (e) => {
        const cell = cellAt(e.target);
        if (!cell) return;
        e.preventDefault();
        const i = Number(cell.dataset.i);
        if (!this.wheelTimer) this.app.beginCellEdit();
        clearTimeout(this.wheelTimer);
        this.wheelTimer = window.setTimeout(() => (this.wheelTimer = 0), 600);
        const v = (this.app.store.state.recipe.matrix[i] ?? 0) + (e.deltaY < 0 ? 0.05 : -0.05);
        this.app.setCell(i, v);
        this.app.store.set({ selCell: i });
        this.showBadge(i);
      },
      { passive: false },
    );
    this.grid.addEventListener('keydown', (e) => this.onKey(e));
    this.grid.addEventListener('focus', () => {
      if (this.app.store.state.selCell < 0) this.app.store.set({ selCell: 0 });
    });
  }

  private onKey(e: KeyboardEvent): void {
    const S = this.species;
    let sel = this.app.store.state.selCell;
    if (sel < 0) sel = 0;
    let a = Math.floor(sel / S);
    let b = sel % S;
    const m = this.app.store.state.recipe.matrix;
    const adjust = (d: number) => {
      this.app.beginCellEdit();
      this.app.setCell(sel, (m[sel] ?? 0) + d);
    };
    switch (e.key) {
      case 'ArrowUp':
        if (e.shiftKey) adjust(0.05);
        else a = (a + S - 1) % S;
        break;
      case 'ArrowDown':
        if (e.shiftKey) adjust(-0.05);
        else a = (a + 1) % S;
        break;
      case 'ArrowLeft':
        b = (b + S - 1) % S;
        break;
      case 'ArrowRight':
        b = (b + 1) % S;
        break;
      case '+':
      case '=':
      case 'PageUp':
        adjust(0.1);
        break;
      case '-':
      case 'PageDown':
        adjust(-0.1);
        break;
      case '0':
      case 'Delete':
      case 'Backspace':
        this.app.beginCellEdit();
        this.app.setCell(sel, 0);
        break;
      case 'Escape':
        this.app.store.set({ selCell: -1 });
        e.stopPropagation();
        return;
      default:
        return;
    }
    e.preventDefault();
    e.stopPropagation();
    this.app.store.set({ selCell: a * S + b });
  }

  private showBadge(i: number): void {
    const cell = this.cells[i];
    if (!cell) return;
    const S = this.species;
    const a = Math.floor(i / S);
    const b = i % S;
    const colors = this.colors();
    const v = this.app.effective[i];
    this.badge.replaceChildren(
      h('span', { class: 'dot', style: `--c:${css(colors[a])}` }),
      h('span', { class: 'cell-badge__arrow' }, '→'),
      h('span', { class: 'dot', style: `--c:${css(colors[b])}` }),
      h('b', { class: v >= 0 ? 'pos' : 'neg' }, fmtSigned(v)),
    );
    const r = cell.getBoundingClientRect();
    this.badge.style.left = `${r.left + r.width / 2}px`;
    this.badge.style.top = `${r.top}px`;
    this.badge.classList.add('show');
  }

  private hideBadge(): void {
    this.badge.classList.remove('show');
  }
}
