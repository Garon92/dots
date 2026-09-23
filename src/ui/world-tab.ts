import type { App } from '../app/app';
import { DEFAULT_PHYSICS, type Layout, type Physics, PHYSICS_LIMITS } from '../sim/types';
import { css, SPECIES_NAMES } from '../state/palette';
import { getPreset, presetPhysics } from '../state/presets';
import { MAX_PER_SPECIES, MAX_TOTAL, total } from '../state/recipe';
import { SPEEDS } from '../state/settings';
import { actionButton, section, segmented, slider, type SliderHandle, toggle } from './controls';
import { fmtInt, fmtNum, h } from './dom';

const LAYOUT_OPTS: { value: Layout; label: string }[] = [
  { value: 'random', label: 'Náhodně' },
  { value: 'disc', label: 'Kruh' },
  { value: 'rings', label: 'Prstence' },
  { value: 'stripes', label: 'Pruhy' },
  { value: 'clusters', label: 'Hnízda' },
  { value: 'spiral', label: 'Spirála' },
];

const PHYS: { key: keyof Physics; label: string; hint: string; fmt: (v: number) => string }[] = [
  { key: 'rMax', label: 'Dosah', hint: 'Jak daleko na sebe částice „vidí“. Větší dosah = větší útvary.', fmt: (v) => String(Math.round(v)) },
  { key: 'force', label: 'Síla', hint: 'Jak prudce reagují. Moc velká síla = chaos.', fmt: (v) => String(Math.round(v)) },
  { key: 'friction', label: 'Tření', hint: 'Kolik rychlosti si částice podrží. Víc = klouzavější pohyb.', fmt: (v) => fmtNum(v) },
  { key: 'dt', label: 'Časový krok', hint: 'Velikost kroku simulace. Menší = přesnější, pomalejší.', fmt: (v) => fmtNum(v) },
  { key: 'beta', label: 'Osobní prostor', hint: 'Do jaké vzdálenosti se všechny částice odpuzují, aby se nepřekrývaly.', fmt: (v) => fmtNum(v) },
];

export class WorldTab {
  readonly el: HTMLElement;
  private totalSl: SliderHandle;
  private speciesBox: HTMLElement;
  private speciesSl: SliderHandle[] = [];
  private physSl = new Map<keyof Physics, SliderHandle>();
  private species = 0;

  constructor(private app: App) {
    const s = app.store.state;
    this.totalSl = slider({
      label: 'Celkem částic',
      min: 100,
      max: this.totalMax(),
      step: 50,
      value: total(s.recipe.counts),
      format: fmtInt,
      onInput: (v) => app.setTotal(v),
    });
    this.speciesBox = h('div', { class: 'pops' });
    const popActions = h(
      'div',
      { class: 'act-row' },
      actionButton('grid', 'Rovnoměrně', () => app.equalizeCounts(), { title: 'Všechny druhy stejně početné' }),
      actionButton('dice', 'Náhodně', () => app.randomizeCounts(), { title: 'Náhodné zastoupení druhů' }),
      actionButton('reset', 'Podle displeje', () => app.resetDensity(), { title: 'Počet částic podle velikosti obrazovky' }),
    );
    const auto = toggle(
      'Hlídat plynulost',
      s.settings.autoTune,
      (v) => app.updateSettings({ autoTune: v }),
      'Když zařízení nestíhá, ubere částice.',
    );

    const layoutBtns = h('div', { class: 'chips' });
    for (const o of LAYOUT_OPTS) {
      const b = h('button', { type: 'button', class: 'g92-chip chip-btn', 'aria-pressed': String(s.recipe.layout === o.value) }, o.label);
      b.addEventListener('click', () => app.reseed(o.value));
      layoutBtns.append(b);
    }
    const layoutActions = h(
      'div',
      { class: 'act-row' },
      actionButton('shuffle', 'Rozmístit znovu', () => app.reseed(), { kbd: 'N' }),
      actionButton('wind', 'Rozfoukat', () => app.shake(), { kbd: 'V', title: 'Dát všem částicím náhodný šťouchanec (V)' }),
    );

    const physBox = h('div', { class: 'phys' });
    for (const p of PHYS) {
      const lim = PHYSICS_LIMITS[p.key];
      const sl = slider({
        label: p.label,
        min: lim.min,
        max: lim.max,
        step: lim.step,
        value: s.recipe.physics[p.key],
        format: p.fmt,
        hint: p.hint,
        onInput: (v) => app.setPhysics({ [p.key]: v }),
      });
      this.physSl.set(p.key, sl);
      physBox.append(sl.el);
    }
    const speed = segmented(
      'Rychlost simulace',
      SPEEDS.map((v) => ({ value: v, label: v === 0.25 ? '¼×' : v === 0.5 ? '½×' : `${v}×`, title: `Rychlost ${fmtNum(v)}×` })),
      s.settings.speed,
      (v) => app.updateSettings({ speed: v }),
    );
    const resetPhys = actionButton('reset', 'Výchozí fyzika', () => {
      const p = getPreset(app.store.state.presetId);
      app.setPhysics(p ? presetPhysics(p) : DEFAULT_PHYSICS);
    });

    this.el = h(
      'div',
      { class: 'tab-page', id: 'tab-svet' },
      section('Částice', this.totalSl.el, this.speciesBox, popActions, auto.el),
      section('Rozmístění', layoutBtns, layoutActions),
      section('Rychlost', speed.el),
      section('Fyzika', physBox, h('div', { class: 'act-row' }, resetPhys)),
    );

    this.buildSpecies();
    app.store.on(['recipe'], (st) => {
      if (st.recipe.species !== this.species) this.buildSpecies();
      this.sync();
      layoutBtns.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(LAYOUT_OPTS[i].value === st.recipe.layout)));
    });
    let palette = s.settings.palette;
    app.store.on(['settings'], (st) => {
      auto.set(st.settings.autoTune);
      speed.set(st.settings.speed);
      if (st.settings.palette !== palette) {
        palette = st.settings.palette;
        this.buildSpecies();
      }
    });
    app.store.on(['theme'], () => this.buildSpecies());
  }

  private totalMax(): number {
    return Math.min(MAX_TOTAL, Math.max(6000, Math.round(this.app.defaultTotal(1) * 3 / 500) * 500));
  }

  private buildSpecies(): void {
    const r = this.app.store.state.recipe;
    this.species = r.species;
    const colors = this.app.colors();
    this.speciesBox.replaceChildren();
    this.speciesSl = [];
    for (let i = 0; i < r.species; i++) {
      const sl = slider({
        label: SPECIES_NAMES[i],
        min: 0,
        max: this.speciesMax(),
        step: 10,
        value: r.counts[i] ?? 0,
        format: fmtInt,
        swatch: css(colors[i]),
        color: css(colors[i]),
        onInput: (v) => {
          const counts = this.app.store.state.recipe.counts.slice();
          counts[i] = v;
          this.app.setCounts(counts);
        },
      });
      this.speciesSl.push(sl);
      this.speciesBox.append(sl.el);
    }
  }

  private speciesMax(): number {
    return Math.min(MAX_PER_SPECIES, Math.max(1500, Math.round((this.app.defaultTotal(1) * 1.5) / 100) * 100));
  }

  private sync(): void {
    const r = this.app.store.state.recipe;
    const t = total(r.counts);
    this.totalSl.set(t, Math.max(this.totalMax(), t));
    this.speciesSl.forEach((sl, i) => sl.set(r.counts[i] ?? 0, Math.max(this.speciesMax(), r.counts[i] ?? 0)));
    for (const [k, sl] of this.physSl) sl.set(r.physics[k]);
  }
}

