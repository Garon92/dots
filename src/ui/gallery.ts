import type { App } from '../app/app';
import { confirmDialog, openDialog } from '../kit/dialog';
import { sfx } from '../kit/sfx';
import { toast } from '../kit/toast';
import { PRESETS, type Preset } from '../state/presets';
import type { Favorite } from '../state/storage';
import { buildHash } from '../state/url';
import { h } from './dom';
import { icon } from './icons';
import type { ThumbService } from './thumbs-service';

export class GalleryTab {
  readonly el: HTMLElement;
  private presetGrid: HTMLElement;
  private favGrid: HTMLElement;
  private favSection: HTMLElement;
  private presetCards = new Map<string, HTMLElement>();
  private started = false;

  constructor(
    private app: App,
    private thumbs: ThumbService,
  ) {
    const surprise = h(
      'button',
      { type: 'button', class: 'g92-btn g92-btn--soft gal-cta', title: 'Náhodný svět – matice, druhy i fyzika (Shift+R)' },
      icon('sparkles'),
      'Překvapení',
    );
    surprise.addEventListener('click', () => {
      sfx.whoosh();
      app.surprise();
    });
    const save = h('button', { type: 'button', class: 'g92-btn gal-cta', title: 'Uložit tento svět do oblíbených (S)' }, icon('star'), 'Uložit svět');
    save.addEventListener('click', () => this.saveDialog());

    this.favGrid = h('div', { class: 'cards' });
    this.favSection = h(
      'section',
      { class: 'sec' },
      h('h3', { class: 'sec__title' }, 'Moje oblíbené'),
      this.favGrid,
    );
    this.presetGrid = h('div', { class: 'cards' });
    for (const p of PRESETS) this.presetGrid.append(this.presetCard(p));

    this.el = h(
      'div',
      { class: 'tab-page', id: 'tab-galerie' },
      h('div', { class: 'gal-top' }, surprise, save),
      this.favSection,
      h('section', { class: 'sec' }, h('h3', { class: 'sec__title' }, 'Světy k objevování'), this.presetGrid),
    );

    this.renderFavorites();
    this.markActive();
    app.store.on(['favorites'], () => this.renderFavorites());
    app.store.on(['presetId', 'favId', 'modified'], () => this.markActive());
    app.store.on(['theme'], () => {
      if (this.started) this.loadThumbs();
    });
    let palette = app.store.state.settings.palette;
    app.store.on(['settings'], (s) => {
      if (s.settings.palette !== palette) {
        palette = s.settings.palette;
        if (this.started) this.loadThumbs();
      }
    });
  }

  /** Called when the tab becomes visible for the first time (thumbnails are generated lazily). */
  activate(): void {
    if (this.started) return;
    this.started = true;
    this.loadThumbs();
  }

  private presetCard(p: Preset): HTMLElement {
    const img = h('img', { class: 'card__img', alt: '', width: 320, height: 200, loading: 'lazy', decoding: 'async' });
    const media = h('div', { class: 'card__media is-loading' }, img, h('span', { class: 'card__badge' }, `${p.species} druhů`));
    const card = h(
      'button',
      { type: 'button', class: 'wcard', 'data-id': p.id, 'aria-pressed': 'false' },
      media,
      h('span', { class: 'wcard__name' }, p.name),
      h('span', { class: 'wcard__desc' }, p.desc),
    );
    card.addEventListener('click', () => {
      sfx.pop();
      this.app.applyPreset(p.id);
      if (window.matchMedia('(max-width: 759px)').matches) this.app.store.set({ panelOpen: false });
    });
    this.presetCards.set(p.id, card);
    return card;
  }

  private loadThumbs(): void {
    const theme = this.app.store.state.theme;
    for (const p of PRESETS) {
      const card = this.presetCards.get(p.id)!;
      const media = card.querySelector('.card__media') as HTMLElement;
      const img = card.querySelector('img') as HTMLImageElement;
      const recipe = this.app.presetRecipe(p, 1000);
      const colors = this.app.colorsFor(p.species, theme);
      const key = this.thumbs.keyFor(recipe, colors, theme, p.density ?? 1);
      const cached = this.thumbs.get(key);
      if (cached) {
        img.src = cached;
        media.classList.remove('is-loading');
        continue;
      }
      media.classList.add('is-loading');
      void this.thumbs.request(recipe, colors, theme, p.density ?? 1, p.id).then((url) => {
        if (url) img.src = url;
        media.classList.remove('is-loading');
      });
    }
    // favourites without a picture (e.g. migrated from the old app)
    for (const f of this.app.store.state.favorites) {
      if (f.thumb) continue;
      const colors = this.app.colorsFor(f.recipe.species, 'dark');
      void this.thumbs.request(f.recipe, colors, 'dark', 1, f.id).then((url) => {
        if (url) this.app.setFavoriteThumb(f.id, url);
      });
    }
  }

  private markActive(): void {
    const s = this.app.store.state;
    for (const [id, card] of this.presetCards) {
      const on = s.presetId === id;
      card.setAttribute('aria-pressed', String(on));
      card.classList.toggle('is-modified', on && s.modified);
    }
    this.favGrid.querySelectorAll<HTMLElement>('.wcard').forEach((c) => {
      const on = c.dataset.id === s.favId;
      c.setAttribute('aria-pressed', String(on));
      c.classList.toggle('is-modified', on && s.modified);
    });
  }

  private renderFavorites(): void {
    const favs = this.app.store.state.favorites;
    this.favGrid.replaceChildren();
    if (favs.length === 0) {
      this.favGrid.append(
        h(
          'div',
          { class: 'empty-note' },
          icon('star'),
          h('p', null, 'Zatím tu nic není. Až objevíš svět, který se ti líbí, ulož si ho tlačítkem ', h('b', null, 'Uložit svět'), ' (nebo klávesou S).'),
        ),
      );
    }
    for (const f of favs) this.favGrid.append(this.favCard(f));
    this.markActive();
  }

  private favCard(f: Favorite): HTMLElement {
    const media = h('div', { class: `card__media${f.thumb ? '' : ' is-loading'}` });
    if (f.thumb) media.append(h('img', { class: 'card__img', src: f.thumb, alt: '', width: 320, height: 200 }));
    const card = h(
      'div',
      { class: 'wcard wcard--fav', 'data-id': f.id, role: 'button', tabindex: 0, 'aria-pressed': 'false', 'aria-label': `Oblíbený svět ${f.name}` },
      media,
      h('span', { class: 'wcard__name' }, f.name),
      h('span', { class: 'wcard__desc' }, `${f.recipe.species} druhů · ${new Date(f.created).toLocaleDateString('cs-CZ')}`),
    );
    const tools = h('div', { class: 'wcard__tools' });
    const mk = (ic: 'share' | 'edit' | 'trash', label: string, fn: () => void) => {
      const b = h('button', { type: 'button', class: 'wcard__tool', 'aria-label': `${label}: ${f.name}`, title: label }, icon(ic));
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      tools.append(b);
    };
    mk('share', 'Zkopírovat odkaz', () => void this.shareFavorite(f));
    mk('edit', 'Přejmenovat', () => this.renameDialog(f));
    mk('trash', 'Smazat', () => void this.deleteFavorite(f));
    card.append(tools);
    const apply = () => {
      sfx.pop();
      this.app.applyFavorite(f.id);
      if (window.matchMedia('(max-width: 759px)').matches) this.app.store.set({ panelOpen: false });
    };
    card.addEventListener('click', apply);
    card.addEventListener('keydown', (e) => {
      if (e.target === card && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        apply();
      }
    });
    return card;
  }

  saveDialog(): void {
    const thumb = this.app.thumbnail();
    const input = h('input', {
      type: 'text',
      class: 'g92-input',
      maxlength: 40,
      value: this.app.suggestName(),
      'aria-label': 'Název světa',
      autocomplete: 'off',
    });
    const content = h(
      'div',
      { class: 'save-dlg' },
      thumb ? h('img', { class: 'save-dlg__img', src: thumb, alt: 'Náhled světa' }) : null,
      h('label', { class: 'g92-field' }, h('span', { class: 'g92-label' }, 'Jak se tvůj svět jmenuje?'), input),
      h('p', { class: 'g92-hint' }, 'Uloží se matice, počty částic i fyzika. Najdeš ho v Galerii.'),
    );
    const d = openDialog({
      title: 'Uložit do oblíbených',
      content,
      actions: [
        { label: 'Zrušit', value: 'cancel', variant: 'secondary' },
        { label: 'Uložit', value: 'ok', variant: 'primary' },
      ],
      onOpen: () => {
        input.focus();
        input.select();
      },
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        d.close('ok');
      }
    });
    void d.closed.then((v) => {
      if (v !== 'ok') return;
      const fav = this.app.saveFavorite(input.value);
      sfx.success();
      toast(`Uloženo: ${fav.name}`, { variant: 'success', duration: 2600 });
    });
  }

  private renameDialog(f: Favorite): void {
    const input = h('input', { type: 'text', class: 'g92-input', maxlength: 40, value: f.name, 'aria-label': 'Nový název' });
    const d = openDialog({
      title: 'Přejmenovat',
      content: h('label', { class: 'g92-field' }, h('span', { class: 'g92-label' }, 'Nový název'), input),
      actions: [
        { label: 'Zrušit', value: 'cancel', variant: 'secondary' },
        { label: 'Uložit', value: 'ok' },
      ],
      onOpen: () => {
        input.focus();
        input.select();
      },
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        d.close('ok');
      }
    });
    void d.closed.then((v) => {
      if (v === 'ok') this.app.renameFavorite(f.id, input.value);
    });
  }

  private async deleteFavorite(f: Favorite): Promise<void> {
    const ok = await confirmDialog({ title: `Smazat „${f.name}“?`, message: 'Svět zmizí z oblíbených.', confirmLabel: 'Smazat', danger: true });
    if (!ok) return;
    const index = this.app.store.state.favorites.findIndex((x) => x.id === f.id);
    const removed = this.app.deleteFavorite(f.id);
    if (removed) {
      toast(`Smazáno: ${removed.name}`, { action: { label: 'Vrátit', onClick: () => this.app.restoreFavorite(removed, index) } });
    }
  }

  private async shareFavorite(f: Favorite): Promise<void> {
    const url = `${location.origin}${location.pathname}${buildHash({ recipe: f.recipe, name: f.name })}`;
    try {
      await navigator.clipboard.writeText(url);
      toast('Odkaz zkopírován – pošli ho komukoli.', { variant: 'success' });
    } catch {
      window.prompt('Zkopíruj si odkaz:', url);
    }
  }
}
