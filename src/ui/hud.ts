import type { App, Stats } from '../app/app';
import { fmtInt, h } from './dom';
import { icon } from './icons';

/** Top-left: world name (opens the gallery) + vitals (FPS, particles, kinetic energy sparkline). */
export class Hud {
  readonly el: HTMLElement;
  private title: HTMLButtonElement;
  private titleText: HTMLElement;
  private badge: HTMLElement;
  private stats: HTMLElement;
  private fps: HTMLElement;
  private count: HTMLElement;
  private lag: HTMLElement;
  private spark: HTMLCanvasElement;
  private sctx: CanvasRenderingContext2D;
  readonly paused: HTMLButtonElement;

  constructor(private app: App) {
    this.titleText = h('span', { class: 'hud__name' });
    this.badge = h('span', { class: 'hud__mod', title: 'Svět jsi upravil – ulož si ho do oblíbených' }, 'upraveno');
    this.title = h('button', { type: 'button', class: 'hud__title', title: 'Galerie světů (G)' }, h('span', { class: 'hud__dots', 'aria-hidden': 'true' }), this.titleText, this.badge, icon('chevronDown'));
    this.title.addEventListener('click', () => app.store.set({ panelOpen: true, tab: 'galerie' }));

    this.fps = h('b', { class: 'g92-tabular' }, '—');
    this.count = h('b', { class: 'g92-tabular' }, '—');
    this.lag = h('span', { class: 'hud__lag', hidden: true, title: 'Simulace nestíhá – zkus ubrat částice' });
    this.spark = h('canvas', { class: 'hud__spark', width: 180, height: 44, 'aria-hidden': 'true' });
    this.sctx = this.spark.getContext('2d')!;
    this.stats = h(
      'div',
      { class: 'hud__stats', 'aria-label': 'Statistiky' },
      h('span', { class: 'hud__stat' }, h('small', null, 'FPS'), this.fps),
      h('span', { class: 'hud__stat' }, h('small', null, 'Částic'), this.count),
      h('span', { class: 'hud__stat hud__stat--spark' }, h('small', null, 'Pohyb'), this.spark),
      this.lag,
    );
    this.el = h('div', { class: 'hud' }, this.title, this.stats);

    this.paused = h('button', { type: 'button', class: 'paused-pill', hidden: true }, icon('play'), h('span', null, 'Pozastaveno'), h('kbd', null, 'mezerník'));
    this.paused.addEventListener('click', () => app.togglePause(true));

    app.store.on(['title', 'modified'], () => this.renderTitle());
    app.store.on(['settings', 'recipe', 'theme'], () => this.renderMeta());
    app.store.on(['running'], (s) => (this.paused.hidden = s.running));
    const prev = app.onFrameStats;
    app.onFrameStats = (st) => {
      prev(st);
      this.renderStats(st);
    };
    this.renderTitle();
    this.renderMeta();
  }

  private renderTitle(): void {
    const s = this.app.store.state;
    this.titleText.textContent = s.title || 'Vlastní svět';
    this.badge.hidden = !s.modified;
    document.title = `${s.title ? `${s.title} · ` : ''}Dots — částicový život`;
  }

  private renderMeta(): void {
    const s = this.app.store.state;
    this.stats.hidden = !s.settings.hud;
    const dots = this.title.querySelector('.hud__dots') as HTMLElement;
    const colors = this.app.colors();
    dots.style.setProperty('--g', `conic-gradient(${colors.map((c, i) => `rgb(${c.join(' ')}) ${(i / colors.length) * 100}% ${((i + 1) / colors.length) * 100}%`).join(',')})`);
  }

  private renderStats(st: Stats): void {
    if (this.stats.hidden) return;
    this.fps.textContent = String(Math.round(st.fps));
    this.count.textContent = fmtInt(st.n);
    const lagging = st.simRatio < 0.85 && this.app.store.state.running;
    this.lag.hidden = !lagging;
    this.lag.textContent = lagging ? `sim ${Math.round(st.simRatio * 100)} %` : '';
    this.drawSpark();
  }

  private drawSpark(): void {
    const { keHistory, keHead } = this.app;
    const c = this.sctx;
    const w = this.spark.width;
    const hgt = this.spark.height;
    c.clearRect(0, 0, w, hgt);
    let mx = 1e-6;
    for (const v of keHistory) if (v > mx) mx = v;
    const n = keHistory.length;
    const accent = getComputedStyle(this.el).getPropertyValue('--accent').trim() || '#14b8a6';
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const v = keHistory[(keHead + i) % n] / mx;
      const x = (i / (n - 1)) * (w - 4) + 2;
      const y = hgt - 3 - v * (hgt - 8);
      if (i === 0) c.moveTo(x, y);
      else c.lineTo(x, y);
    }
    c.strokeStyle = accent;
    c.lineWidth = 3;
    c.lineJoin = 'round';
    c.stroke();
    c.lineTo(w - 2, hgt);
    c.lineTo(2, hgt);
    c.closePath();
    c.globalAlpha = 0.18;
    c.fillStyle = accent;
    c.fill();
    c.globalAlpha = 1;
  }
}
