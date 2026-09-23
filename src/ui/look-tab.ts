import type { App } from '../app/app';
import { css, PALETTES, speciesColors } from '../state/palette';
import type { CanvasTheme } from '../state/settings';
import { section, segmented, slider, toggle } from './controls';
import { fmtNum, h } from './dom';

export class LookTab {
  readonly el: HTMLElement;

  constructor(app: App) {
    const st = app.store.state.settings;
    const theme = segmented<CanvasTheme>(
      'Plátno',
      [
        { value: 'auto', label: 'Podle motivu', icon: 'eye' },
        { value: 'dark', label: 'Noc', icon: 'atom' },
        { value: 'light', label: 'Papír', icon: 'palette' },
      ],
      st.canvasTheme,
      (v) => app.updateSettings({ canvasTheme: v }),
    );
    const palettes = h('div', { class: 'palettes', role: 'group', 'aria-label': 'Barevná paleta' });
    const palBtns = PALETTES.map((p) => {
      const dots = h('span', { class: 'pal__dots' });
      for (const c of speciesColors(p, 'dark', 6)) dots.append(h('i', { style: `--c:${css(c)}` }));
      const b = h('button', { type: 'button', class: 'pal', 'aria-pressed': String(p.id === st.palette) }, dots, h('span', { class: 'pal__name' }, p.name));
      b.addEventListener('click', () => app.updateSettings({ palette: p.id }));
      palettes.append(b);
      return b;
    });

    const pct = (v: number) => `${Math.round(v * 100)} %`;
    const trails = slider({ label: 'Stopy', min: 0, max: 1, step: 0.01, value: st.trails, format: pct, hint: 'Jak dlouho za částicemi zůstává světelná stopa (T).', onInput: (v) => app.updateSettings({ trails: v }) });
    const glow = slider({ label: 'Záře', min: 0, max: 2, step: 0.01, value: st.glow, format: pct, onInput: (v) => app.updateSettings({ glow: v }) });
    const size = slider({ label: 'Velikost teček', min: 0.4, max: 2.5, step: 0.01, value: st.size, format: pct, onInput: (v) => app.updateSettings({ size: v }) });
    const bonds = toggle('Živá síť', st.bonds, (v) => app.updateSettings({ bonds: v }), 'Svítící vlákna mezi částicemi, které se navzájem přitahují (B).');
    const vignette = toggle('Ztmavené okraje', st.vignette, (v) => app.updateSettings({ vignette: v }));
    const hud = toggle('Statistiky', st.hud, (v) => app.updateSettings({ hud: v }), 'FPS, počet částic a graf pohybové energie.');

    const autoZoom = toggle('Měřítko automaticky', st.zoom === 0, (v) => app.updateSettings({ zoom: v ? 0 : 1 }));
    const zoom = slider({
      label: 'Měřítko světa',
      min: 0.5,
      max: 1.6,
      step: 0.05,
      value: st.zoom || 1,
      format: (v) => `${fmtNum(v)}×`,
      hint: 'Menší měřítko = větší svět a víc částic.',
      onInput: () => {},
      onCommit: (v) => app.updateSettings({ zoom: v }),
    });
    zoom.el.hidden = st.zoom === 0;

    const tech = h('p', { class: 'tech' });
    const renderTech = () => {
      const s = app.stats;
      const sim = s.sim === 'worker' ? (s.threads > 0 ? `Web Worker + ${s.threads} pomocná vlákna` : 'Web Worker') : 'hlavní vlákno';
      tech.textContent = `Vykreslování: ${s.renderer === 'webgl2' ? 'WebGL 2' : 'Canvas 2D'} · simulace: ${sim}`;
    };
    renderTech();
    setInterval(renderTech, 3000);

    this.el = h(
      'div',
      { class: 'tab-page', id: 'tab-vzhled' },
      section('Plátno', theme.el),
      section('Barvy', palettes),
      section('Světlo', trails.el, glow.el, size.el, bonds.el, vignette.el),
      section('Rozhraní', hud.el, autoZoom.el, zoom.el, tech),
    );

    app.store.on(['settings'], (s) => {
      const v = s.settings;
      theme.set(v.canvasTheme);
      palBtns.forEach((b, i) => b.setAttribute('aria-pressed', String(PALETTES[i].id === v.palette)));
      trails.set(v.trails);
      glow.set(v.glow);
      size.set(v.size);
      bonds.set(v.bonds);
      vignette.set(v.vignette);
      hud.set(v.hud);
      autoZoom.set(v.zoom === 0);
      zoom.el.hidden = v.zoom === 0;
      if (v.zoom) zoom.set(v.zoom);
      renderTech();
    });
  }
}
