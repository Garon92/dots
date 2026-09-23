import type { App } from '../app/app';
import { sfx } from '../kit/sfx';
import { css, SPECIES_NAMES } from '../state/palette';
import type { Tool } from '../state/settings';
import { h } from './dom';
import { type IconName, icon } from './icons';

export const TOOLS: { id: Tool; label: string; icon: IconName; key: string; hint: string }[] = [
  { id: 'repel', label: 'Odpuzovat', icon: 'repel', key: '1', hint: 'Drž na plátně – částice se rozprchnou' },
  { id: 'attract', label: 'Přitahovat', icon: 'attract', key: '2', hint: 'Drž na plátně – částice se seběhnou' },
  { id: 'swirl', label: 'Vířit', icon: 'swirl', key: '3', hint: 'Drž na plátně – roztočíš vír' },
  { id: 'spawn', label: 'Přidávat', icon: 'spawn', key: '4', hint: 'Kresli nové částice' },
  { id: 'erase', label: 'Gumovat', icon: 'erase', key: '5', hint: 'Mazání částic' },
];

export class Toolbar {
  readonly el: HTMLElement;
  private play: HTMLButtonElement;
  private step: HTMLButtonElement;
  private toolBtns: HTMLButtonElement[] = [];
  private popBtns: HTMLButtonElement[] = [];
  private current: HTMLButtonElement;
  private pop: HTMLElement;
  private speciesPop: HTMLElement;
  private panelBtn: HTMLButtonElement;

  constructor(private app: App) {
    this.play = h('button', { type: 'button', class: 'tb tb--play' });
    this.play.addEventListener('click', () => {
      sfx.tap();
      app.togglePause();
    });
    this.step = h('button', { type: 'button', class: 'tb', 'aria-label': 'Jeden krok', title: 'Jeden krok (.)' }, icon('step'));
    this.step.addEventListener('click', () => app.stepOnce());

    const tools = h('div', { class: 'tb-group tb-tools', role: 'group', 'aria-label': 'Nástroj pro plátno' });
    for (const t of TOOLS) {
      const b = this.toolButton(t);
      tools.append(b);
      this.toolBtns.push(b);
    }
    // compact mode (phones): one button showing the current tool, opening a popover
    this.current = h('button', { type: 'button', class: 'tb tb-current', 'aria-haspopup': 'true', 'aria-expanded': 'false' });
    this.current.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePop();
    });
    this.pop = h('div', { class: 'tb-pop', role: 'menu', hidden: true });
    for (const t of TOOLS) {
      const b = h('button', { type: 'button', class: 'tb-pop__item', role: 'menuitemradio', 'aria-checked': 'false' }, icon(t.icon), h('span', null, t.label), h('small', null, t.hint));
      b.addEventListener('click', () => {
        app.updateSettings({ tool: t.id });
        if (t.id !== 'spawn') this.togglePop(false);
      });
      this.pop.append(b);
      this.popBtns.push(b);
    }
    this.speciesPop = h('div', { class: 'species-pick', role: 'group', 'aria-label': 'Jaký druh přidávat' });
    document.addEventListener('pointerdown', (e) => {
      if (!this.pop.hidden && !this.pop.contains(e.target as Node) && e.target !== this.current) this.togglePop(false);
    });

    const dice = this.iconBtn('dice', 'Náhodná matice', 'R', () => {
      sfx.whoosh();
      app.randomize();
    });
    const mutate = this.iconBtn('mutate', 'Zmutovat matici', 'M', () => {
      sfx.flip();
      app.mutate();
    });
    const reseed = this.iconBtn('shuffle', 'Rozmístit znovu', 'N', () => {
      sfx.whoosh();
      app.reseed();
    });
    reseed.classList.add('tb--reseed');
    mutate.classList.add('tb--mutate');
    this.panelBtn = this.iconBtn('sliders', 'Laboratoř', 'L', () => app.store.set({ panelOpen: !app.store.state.panelOpen }));
    this.panelBtn.classList.add('tb--panel');
    this.panelBtn.setAttribute('aria-controls', 'panel');

    this.el = h(
      'div',
      { class: 'toolbar', role: 'toolbar', 'aria-label': 'Ovládání simulace' },
      this.play,
      this.step,
      h('span', { class: 'tb-sep' }),
      tools,
      this.current,
      h('span', { class: 'tb-sep' }),
      dice,
      mutate,
      reseed,
      h('span', { class: 'tb-sep' }),
      this.panelBtn,
      this.pop,
      this.speciesPop,
    );

    app.store.on(['running'], () => this.sync());
    app.store.on(['settings', 'recipe', 'theme'], () => this.sync());
    app.store.on(['panelOpen'], () => this.sync());
    this.sync();
  }

  private toolButton(t: (typeof TOOLS)[number]): HTMLButtonElement {
    const b = h('button', { type: 'button', class: 'tb', 'aria-pressed': 'false', 'aria-label': t.label, title: `${t.label} (${t.key}) – ${t.hint}` }, icon(t.icon));
    b.addEventListener('click', () => {
      sfx.tap();
      this.app.updateSettings({ tool: t.id });
    });
    return b;
  }

  private iconBtn(ic: IconName, label: string, key: string, fn: () => void): HTMLButtonElement {
    const b = h('button', { type: 'button', class: 'tb', 'aria-label': label, title: `${label} (${key})` }, icon(ic));
    b.addEventListener('click', fn);
    return b;
  }

  private togglePop(force?: boolean): void {
    const open = force ?? this.pop.hidden;
    this.pop.hidden = !open;
    this.current.setAttribute('aria-expanded', String(open));
  }

  private memo = '';

  private sync(): void {
    const s = this.app.store.state;
    const tool = s.settings.tool;
    const pick = s.settings.brushSpecies;
    const key = [s.running, s.panelOpen, tool, pick, s.recipe.species, s.settings.palette, s.theme].join('|');
    if (key === this.memo) return;
    this.memo = key;
    const running = s.running;
    this.play.replaceChildren(icon(running ? 'pause' : 'play'));
    this.play.setAttribute('aria-label', running ? 'Pozastavit' : 'Spustit');
    this.play.title = running ? 'Pozastavit (mezerník)' : 'Spustit (mezerník)';
    this.step.hidden = running;
    TOOLS.forEach((t, i) => {
      this.toolBtns[i].setAttribute('aria-pressed', String(t.id === tool));
      this.popBtns[i].setAttribute('aria-checked', String(t.id === tool));
    });
    const cur = TOOLS.find((t) => t.id === tool)!;
    this.current.replaceChildren(icon(cur.icon), icon('chevronDown'));
    this.current.setAttribute('aria-label', `Nástroj: ${cur.label}`);
    this.current.title = `Nástroj: ${cur.label}`;
    this.panelBtn.setAttribute('aria-expanded', String(s.panelOpen));
    this.panelBtn.setAttribute('aria-pressed', String(s.panelOpen));

    // species picker for the spawn tool
    this.speciesPop.hidden = tool !== 'spawn';
    if (tool === 'spawn') {
      if (pick >= s.recipe.species) {
        this.app.updateSettings({ brushSpecies: -1 });
        return;
      }
      const colors = this.app.colors();
      const mk = (idx: number, label: string, style: string) => {
        const b = h('button', { type: 'button', class: 'sp', 'aria-pressed': String(pick === idx), 'aria-label': label, title: label, style });
        b.addEventListener('click', () => this.app.updateSettings({ brushSpecies: idx }));
        return b;
      };
      const btns = [mk(-1, 'Náhodný druh', `--c: conic-gradient(${colors.map((c) => css(c)).join(',')})`)];
      colors.forEach((c, i) => btns.push(mk(i, SPECIES_NAMES[i], `--c:${css(c)}`)));
      this.speciesPop.replaceChildren(h('span', { class: 'species-pick__label' }, 'Přidávat:'), ...btns);
    }
  }
}
