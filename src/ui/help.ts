import type { App } from '../app/app';
import { openDialog, type DialogHandle } from '../kit/dialog';
import { UI_ICONS } from '../kit/dom';
import { force } from '../sim/force';
import { css } from '../state/palette';
import { h } from './dom';
import { ICONS } from './icons';

/** Key notation: "Ctrl+Z" = combination, "←/→" = alternatives, "~text" = plain words. */
export const SHORTCUTS: { group: string; items: [string, string][] }[] = [
  {
    group: 'Simulace',
    items: [
      ['Mezerník', 'pauza / pokračovat'],
      ['.', 'jeden krok (při pauze)'],
      ['N', 'rozmístit částice znovu'],
      ['V', 'rozfoukat (náhodný šťouchanec)'],
      ['+/−', 'rychlejší / pomalejší simulace'],
      ['←/→', 'předchozí / další svět z galerie'],
    ],
  },
  {
    group: 'Matice',
    items: [
      ['R', 'náhodná matice'],
      ['Shift+R', 'překvapení – náhodný celý svět'],
      ['Z', 'zmutovat (malá změna)'],
      ['Y', 'souměrná matice'],
      ['I', 'obrátit znaménka'],
      ['X', 'prohodit role (transponovat)'],
      ['0', 'vynulovat'],
      ['Ctrl+Z', 'zpět'],
      ['Ctrl+Y', 'znovu'],
    ],
  },
  {
    group: 'Nástroje na plátně',
    items: [
      ['1', 'odpuzovat'],
      ['2', 'přitahovat'],
      ['3', 'vířit'],
      ['4', 'přidávat částice'],
      ['5', 'gumovat'],
      ['Shift+~tah', 'přitahovat s jakýmkoli nástrojem'],
      ['~pravé tlačítko', 'opačná síla'],
      ['[/]', 'menší / větší štětec (i kolečkem)'],
    ],
  },
  {
    group: 'Zobrazení a ukládání',
    items: [
      ['L', 'laboratoř ukázat / schovat'],
      ['G', 'galerie světů'],
      ['B', 'živá síť'],
      ['T', 'stopy zapnout / vypnout'],
      ['H', 'skrýt celé rozhraní'],
      ['F', 'celá obrazovka'],
      ['M', 'zvuk zapnout / vypnout'],
      ['S', 'uložit do oblíbených'],
      ['C', 'uložit obrázek (JPEG)'],
      ['Shift+C', 'nahrát 8s video'],
      ['U', 'zkopírovat odkaz'],
      ['A', 'promítání: galerie → evoluce → vypnout'],
      ['?', 'tahle nápověda'],
    ],
  },
];

function keysEl(spec: string): HTMLElement {
  const wrap = h('span', { class: 'keys' });
  spec.split('/').forEach((alt, ai) => {
    if (ai > 0) wrap.append(h('span', { class: 'keys__sep' }, '/'));
    (alt === '+' ? ['+'] : alt.split('+')).forEach((k, i) => {
      if (i > 0) wrap.append(h('span', { class: 'keys__sep' }, '+'));
      wrap.append(k.startsWith('~') ? h('span', { class: 'keys__word' }, k.slice(1)) : h('kbd', { class: 'g92-kbd' }, k));
    });
  });
  return wrap;
}

export function shortcutsContent(): HTMLElement {
  const grid = h('div', { class: 'shortcuts' });
  for (const g of SHORTCUTS) {
    const list = h('dl', { class: 'shortcuts__list' });
    for (const [keys, text] of g.items) list.append(h('dt', null, keysEl(keys)), h('dd', null, text));
    grid.append(h('section', { class: 'shortcuts__group' }, h('h3', null, g.group), list));
  }
  return grid;
}

let open: DialogHandle | null = null;

export function openShortcuts(): void {
  if (open) return;
  open = openDialog({
    title: 'Klávesové zkratky',
    icon: ICONS.keyboard,
    content: shortcutsContent(),
    wide: true,
    actions: [{ label: 'Rozumím', autofocus: true }],
    onClose: () => (open = null),
  });
}

/** Tiny static force-curve illustration for the explainer. */
function curveSvg(colors: string[]): string {
  const beta = 0.3;
  const W = 320;
  const H = 150;
  const x = (r: number) => 14 + (r / 1.1) * (W - 28);
  const y = (f: number) => 18 + (1 - (f + 1) / 2) * (H - 44);
  const path = (a: number) => {
    let d = '';
    for (let i = 0; i <= 80; i++) {
      const r = (i / 80) * 1.1;
      d += `${i ? 'L' : 'M'}${x(r).toFixed(1)},${y(force(r, a, beta)).toFixed(1)}`;
    }
    return d;
  };
  return `<svg viewBox="0 0 ${W} ${H}" class="explain-curve" role="img" aria-label="Graf: zblízka se všechny částice odpuzují, ve střední vzdálenosti rozhoduje matice, dál už na sebe nepůsobí.">
    <rect x="${x(0)}" y="18" width="${x(beta) - x(0)}" height="${H - 44}" class="fc-zone"/>
    <line x1="${x(0)}" x2="${x(1.1)}" y1="${y(0)}" y2="${y(0)}" class="fc-axis"/>
    <line x1="${x(1)}" x2="${x(1)}" y1="18" y2="${H - 26}" class="fc-grid"/>
    <path d="${path(0.8)}" class="fc-line" style="stroke:${colors[0]}"/>
    <path d="${path(-0.6)}" class="fc-line" style="stroke:${colors[1]}"/>
    <text x="${x(beta / 2)}" y="${H - 8}" text-anchor="middle" class="fc-label">osobní prostor</text>
    <text x="${x((1 + beta) / 2)}" y="${H - 8}" text-anchor="middle" class="fc-label">tady rozhoduje matice</text>
    <text x="${x(1.05)}" y="${H - 8}" text-anchor="middle" class="fc-label">dosah</text>
    <text x="${x(0.66)}" y="${y(0.8) - 6}" text-anchor="middle" class="fc-label" style="fill:${colors[0]}">+0,8 přitahuje</text>
    <text x="${x(0.66)}" y="${y(-0.6) + 16}" text-anchor="middle" class="fc-label" style="fill:${colors[1]}">−0,6 odpuzuje</text>
  </svg>`;
}

function miniMatrix(colors: string[]): string {
  const v = [
    [0.6, 0.9, -0.3],
    [-0.8, 0.2, 0.5],
    [0.1, -0.4, 0.7],
  ];
  const cell = (x: number) => {
    const bg =
      x > 0
        ? `rgb(255 ${Math.round(150 - x * 40)} ${Math.round(90 - x * 40)} / ${0.2 + x * 0.66})`
        : `radial-gradient(circle, transparent ${38 + x * 22}%, rgb(20 184 166 / ${0.16 - x * 0.45}) 100%)`;
    return `<span class="mini-m__cell" style="background:${bg}">${x > 0 ? '+' : '−'}${Math.abs(x).toFixed(1).replace('.', ',')}</span>`;
  };
  let out = `<div class="mini-m" aria-hidden="true"><span></span>`;
  for (let b = 0; b < 3; b++) out += `<span class="mini-m__dot" style="--c:${colors[b]}"></span>`;
  for (let a = 0; a < 3; a++) {
    out += `<span class="mini-m__dot" style="--c:${colors[a]}"></span>`;
    for (let b = 0; b < 3; b++) out += cell(v[a][b]);
  }
  return `${out}</div>`;
}

export function openExplainer(app: App): void {
  const colors = app.colorsFor(3, 'dark').map((c) => css(c));
  // touch-only devices get tips phrased with the on-screen buttons instead of keys
  const fine = matchMedia('(any-pointer: fine)').matches;
  const tips = (
    fine
      ? [
          'Projdi <b>Galerii</b> a podívej se, jak různé světy vypadají.',
          'Stiskni <b>R</b> pro náhodnou matici – každá je nový vesmír. Když se ti něco líbí, <b>Z</b> ho trochu zmutuje.',
          'Drž myš na plátně a rozfoukej částice. <b>Shift</b> nebo pravé tlačítko je naopak přitáhne.',
          'Zapni <b>živou síť</b> (B) – uvidíš neviditelná pouta, která drží buňky pohromadě.',
          'Povedený svět si ulož (S) nebo pošli odkaz kamarádovi – odkaz obsahuje celou matici.',
        ]
      : [
          'Otevři <b>Galerii</b> (tlačítko s posuvníky dole) a podívej se, jak různé světy vypadají.',
          'Kostka dole vymyslí <b>náhodnou matici</b> – každá je nový vesmír. V záložce Matice ji tlačítkem <b>Zmutovat</b> trochu pozměníš.',
          'Drž prst na plátně a rozfoukej částice. <b>Dvěma prsty</b> je naopak přitáhneš, třemi roztočíš vír.',
          'V záložce Vzhled zapni <b>živou síť</b> – uvidíš neviditelná pouta, která drží buňky pohromadě.',
          'Povedený svět si ulož tlačítkem <b>Uložit svět</b> nebo pošli odkaz kamarádovi – odkaz obsahuje celou matici.',
        ]
  )
    .map((t) => `<li>${t}</li>`)
    .join('');
  const content = h('div', {
    class: 'explain',
    html: `
    <p class="explain__lead">Dots je hřiště s <b>umělým životem</b>. Každá tečka je úplně hloupá – nemá mozek ani plán. Umí jen jedno: podívat se na sousedy kolem sebe a podle jednoduchého pravidla se k nim přiblížit, nebo od nich odstoupit. A přesto z toho samo od sebe vznikají buňky, hadi, roje i honičky.</p>

    <h3>Pravidla hry</h3>
    <ol class="explain__rules">
      <li><b>Každá tečka vidí jen kousek kolem sebe</b> – do vzdálenosti, které říkáme <i>dosah</i>.</li>
      <li><b>Zblízka se všechny odstrkují.</b> Každá má svůj „osobní prostor“, aby se nepřekrývaly.</li>
      <li><b>Ve střední vzdálenosti rozhoduje matice:</b> tečka se k sousedovi přitáhne, nebo od něj odskočí – podle toho, jakého je který z nich druhu.</li>
      <li>To je všechno. Žádný scénář. Všechno, co vidíš, vzniká z těchhle tří vět.</li>
    </ol>
    ${curveSvg(colors)}

    <h3>Jak číst matici</h3>
    <div class="explain__row">
      ${miniMatrix(colors)}
      <p><b>Řádek</b> je ten, kdo se hýbe, <b>sloupec</b> je ten, na koho reaguje. Teplá oranžová buňka znamená „přitahuje mě“, dutý tyrkysový kroužek „odpuzuje mě“. Čím sytější, tím silněji. Buňku změníš tažením nahoru a dolů – nebo na ni ${fine ? 'klikni' : 'klepni'} a nastav ji přesně.</p>
    </div>

    <h3>Proč to vypadá živě?</h3>
    <p>Matice <b>nemusí být souměrná</b>. Když první druh honí druhý, ale druhý před prvním utíká, žádná rovnováha nenastane – vznikne nekonečná honička. Právě tahle nerovnováha dává světu pohyb, rotace a „lov“. Zkus tlačítko <b>Souměrná</b> – honičky zmizí a svět se usadí do klidných krystalů.</p>

    <h3>Co zkusit</h3>
    <ul class="explain__tips">${tips}</ul>
    <p class="explain__credit">Myšlenka „particle life“ pochází od Jeffreyho Ventrelly (Clusters) a Toma Mohra. Stejný princip – jednoduchá pravidla, složité chování – se v biologii a fyzice nazývá <i>emergence</i>.</p>`,
  });
  const keysBtn = h('button', { type: 'button', class: 'g92-btn g92-btn--ghost explain__keys', html: `${ICONS.keyboard}<span>Klávesové zkratky</span>` });
  if (fine) content.append(keysBtn);
  const d = openDialog({
    title: 'Jak to funguje?',
    icon: UI_ICONS.help,
    content,
    wide: true,
    actions: [{ label: 'Jdu si hrát', autofocus: true }],
  });
  keysBtn.addEventListener('click', () => {
    d.close();
    setTimeout(openShortcuts, 280);
  });
}

/** First-visit coach mark. */
export function onboarding(app: App, host: HTMLElement): HTMLElement | null {
  if (app.store.state.settings.onboarded) return null;
  const coarse = matchMedia('(pointer: coarse)').matches;
  const card = h(
    'div',
    { class: 'coach', role: 'note' },
    h('p', { class: 'coach__title' }, 'Vítej v Dots! 👋'),
    h(
      'ul',
      { class: 'coach__list' },
      h('li', { html: `${ICONS.repel}<span>${coarse ? '<b>Drž prst</b> na plátně' : '<b>Drž myš</b> na plátně'} – částice se rozprchnou.</span>` }),
      h('li', { html: `${ICONS.attract}<span>${coarse ? '<b>Dva prsty</b>' : '<b>Shift</b> nebo pravé tlačítko'} – částice se seběhnou.</span>` }),
      h('li', { html: `${ICONS.gallery}<span>V <b>Galerii</b> najdeš buňky, hady, oběžnice i lov.</span>` }),
    ),
  );
  const ok = h('button', { type: 'button', class: 'g92-btn g92-btn--sm' }, 'Jdu na to');
  const more = h('button', { type: 'button', class: 'g92-btn g92-btn--sm g92-btn--ghost' }, 'Jak to funguje?');
  const dismiss = () => {
    card.classList.add('is-leaving');
    app.updateSettings({ onboarded: true });
    setTimeout(() => card.remove(), 300);
  };
  ok.addEventListener('click', dismiss);
  more.addEventListener('click', () => {
    dismiss();
    openExplainer(app);
  });
  card.append(h('div', { class: 'coach__actions' }, more, ok));
  host.append(card);
  return card;
}
