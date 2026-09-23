import type { App } from '../app/app';
import { openDialog } from '../kit/dialog';
import { sfx } from '../kit/sfx';
import { toast } from '../kit/toast';
import { PRESETS, type Preset } from '../state/presets';
import { type Favorite, favoritesBackup, markVisited, sanitizeFavorites, visitedPresets } from '../state/storage';
import { blobToDataUrl, dataUrlToBlob, deleteImage, favThumbKey, imageBlob, imageUrl, putImage } from '../state/images';
import { plural } from '../kit/cz';
import { h } from './dom';
import { segmented } from './controls';
import type { Autoplay } from '../app/app';
import { icon } from './icons';
import type { ThumbService } from './thumbs-service';

const czDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`;
};
const druhu = (n: number) => `${n} ${plural(n, 'druh', 'druhy', 'druhů')}`;

export class GalleryTab {
  readonly el: HTMLElement;
  private presetGrid: HTMLElement;
  private favGrid: HTMLElement;
  private favSection: HTMLElement;
  private favTools: HTMLElement;
  private presetCards = new Map<string, HTMLElement>();
  private progress = h('span', { class: 'explored', title: 'Kolik světů z galerie už jsi navštívil' });
  private started = false;

  constructor(
    private app: App,
    private thumbs: ThumbService,
    actions: { share: () => void; shot: () => void; video: (() => void) | null },
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
    const shareBtn = h('button', { type: 'button', class: 'g92-btn g92-btn--secondary g92-btn--sm gal-cta', title: 'Zkopírovat odkaz na tento svět (U)' }, icon('share'), 'Sdílet');
    shareBtn.addEventListener('click', () => actions.share());
    const shotBtn = h('button', { type: 'button', class: 'g92-btn g92-btn--secondary g92-btn--sm gal-cta', title: 'Uložit obrázek plátna (C)' }, icon('camera'), 'Obrázek');
    shotBtn.addEventListener('click', () => actions.shot());
    const videoBtn = actions.video
      ? h('button', { type: 'button', class: 'g92-btn g92-btn--secondary g92-btn--sm gal-cta', title: 'Nahrát krátké video (Shift+C)' }, icon('video'), 'Video')
      : null;
    videoBtn?.addEventListener('click', () => actions.video?.());
    const auto = segmented<Autoplay>(
      'Promítání',
      [
        { value: 'off', label: 'Vypnuto' },
        { value: 'gallery', label: 'Galerie', icon: 'autoplay', title: 'Každých 24 s další svět (A)' },
        { value: 'evolve', label: 'Evoluce', icon: 'mutate', title: 'Matice se pomalu sama proměňuje (A)' },
      ],
      app.store.state.autoplay,
      (v) => {
        app.setAutoplay(v);
        if (v !== 'off' && !app.store.state.zen) {
          toast(v === 'gallery' ? 'Promítání galerie: každých 24 s nový svět.' : 'Evoluce: matice se pomalu sama proměňuje.', {
            action: { label: 'Skrýt rozhraní', onClick: () => app.store.set({ zen: true }) },
          });
        }
      },
    );
    app.store.on(['autoplay'], (st) => auto.set(st.autoplay));

    this.favGrid = h('div', { class: 'cards' });
    const backup = h('button', { type: 'button', class: 'link-btn', title: 'Stáhnout oblíbené světy jako soubor (záloha / přenos do jiného zařízení)' }, 'Zálohovat');
    backup.addEventListener('click', () => void this.exportFavorites());
    const restore = h('button', { type: 'button', class: 'link-btn', title: 'Nahrát oblíbené ze souboru zálohy' }, 'Nahrát zálohu');
    restore.addEventListener('click', () => this.importFavorites());
    this.favTools = h('span', { class: 'sec__tools' }, backup, restore);
    this.favSection = h(
      'section',
      { class: 'sec' },
      h('h3', { class: 'sec__title sec__title--row' }, h('span', null, 'Moje oblíbené'), this.favTools),
      this.favGrid,
    );
    this.presetGrid = h('div', { class: 'cards' });
    for (const p of PRESETS) this.presetGrid.append(this.presetCard(p));

    this.el = h(
      'div',
      { class: 'tab-page', id: 'tab-galerie' },
      h('div', { class: 'gal-top' }, surprise, save),
      h('div', { class: 'gal-share' }, shareBtn, shotBtn, videoBtn),
      h('div', { class: 'gal-auto' }, h('span', { class: 'gal-auto__label' }, 'Promítání'), auto.el),
      this.favSection,
      h('section', { class: 'sec' }, h('h3', { class: 'sec__title sec__title--row' }, h('span', null, 'Světy k objevování'), this.progress), this.presetGrid),
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
    const media = h(
      'div',
      { class: 'card__media is-loading' },
      img,
      h('span', { class: 'card__badge' }, druhu(p.species)),
      h('span', { class: 'card__seen', title: 'Už jsi tu byl', 'aria-hidden': 'true' }, icon('check')),
    );
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
  }

  private markActive(): void {
    const s = this.app.store.state;
    const visited = new Set(s.presetId ? markVisited(s.presetId) : visitedPresets());
    let seen = 0;
    for (const [id, card] of this.presetCards) {
      const on = s.presetId === id;
      card.setAttribute('aria-pressed', String(on));
      card.classList.toggle('is-modified', on && s.modified);
      card.classList.toggle('is-visited', visited.has(id));
      if (visited.has(id)) seen++;
    }
    this.progress.textContent = seen >= PRESETS.length ? `všech ${seen} prozkoumáno ✨` : `prozkoumáno ${seen}/${PRESETS.length}`;
    this.favGrid.querySelectorAll<HTMLElement>('.wcard').forEach((c) => {
      const on = c.dataset.id === s.favId;
      c.classList.toggle('is-current', on);
      c.querySelector('.wcard__open')?.setAttribute('aria-pressed', String(on));
      c.classList.toggle('is-modified', on && s.modified);
    });
  }

  private async exportFavorites(): Promise<void> {
    const favs = this.app.store.state.favorites;
    if (favs.length === 0) {
      toast('Zatím nemáš žádné oblíbené světy.');
      return;
    }
    // thumbnails travel inside the backup file
    const withThumbs = await Promise.all(
      favs.map(async (f) => {
        const b = await imageBlob(favThumbKey(f.id));
        return b ? { ...f, thumb: await blobToDataUrl(b) } : f;
      }),
    );
    const blob = new Blob([favoritesBackup(withThumbs)], { type: 'application/json' });
    const a = h('a', { href: URL.createObjectURL(blob), download: `dots-oblibene-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast(`Záloha stažena (${favs.length})`, { variant: 'success' });
  }

  private importFavorites(): void {
    const input = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      if (file.size > 20_000_000) {
        toast('Soubor je příliš velký.', { variant: 'danger' });
        return;
      }
      void file.text().then((text) => {
        let items: Favorite[] = [];
        try {
          items = sanitizeFavorites(JSON.parse(text));
        } catch {
          items = [];
        }
        if (items.length === 0) {
          toast('V souboru nejsou žádné světy z Dots.', { variant: 'danger' });
          return;
        }
        void this.addImported(items);
      });
    });
    document.body.append(input);
    input.click();
  }

  private async addImported(items: Favorite[]): Promise<void> {
    const added = this.app.importFavorites(items);
    // store the pictures first so the new cards show them right away
    await Promise.all(
      added.map(async (f) => {
        const b = f.thumb ? dataUrlToBlob(f.thumb) : null;
        if (b) await putImage(favThumbKey(f.id), b);
      }),
    );
    this.renderFavorites();
    toast(added.length ? `Přidáno světů: ${added.length}` : 'Všechny světy už v oblíbených máš.', { variant: added.length ? 'success' : 'default' });
  }

  private renderFavorites(): void {
    const favs = this.app.store.state.favorites;
    (this.favTools.firstElementChild as HTMLElement).hidden = favs.length === 0;
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
    const img = h('img', { class: 'card__img', alt: '', width: 320, height: 200, decoding: 'async' });
    const media = h('div', { class: 'card__media is-loading' }, img);
    const open = h(
      'button',
      { type: 'button', class: 'wcard__open', 'aria-pressed': 'false', 'aria-label': `Otevřít oblíbený svět ${f.name}` },
      media,
      h('span', { class: 'wcard__name' }, f.name),
      h('span', { class: 'wcard__desc' }, `${druhu(f.recipe.species)} · ${czDate(f.created)}`),
    );
    open.addEventListener('click', () => {
      sfx.pop();
      this.app.applyFavorite(f.id);
      if (window.matchMedia('(max-width: 759px)').matches) this.app.store.set({ panelOpen: false });
    });
    const tools = h('div', { class: 'wcard__tools' });
    const mk = (ic: 'share' | 'edit' | 'trash', label: string, fn: () => void) => {
      const b = h('button', { type: 'button', class: 'wcard__tool', 'aria-label': `${label}: ${f.name}`, title: label }, icon(ic));
      b.addEventListener('click', fn);
      tools.append(b);
    };
    mk('share', 'Zkopírovat odkaz', () => void this.shareFavorite(f));
    mk('edit', 'Přejmenovat', () => this.renameDialog(f));
    mk('trash', 'Smazat', () => this.deleteFavorite(f));
    const card = h('div', { class: 'wcard wcard--fav', 'data-id': f.id }, open, tools);
    void this.favThumb(f).then((url) => {
      if (url) img.src = url;
      media.classList.remove('is-loading');
    });
    return card;
  }

  /** Stored picture of a favourite, or a freshly simulated one (e.g. worlds migrated from the old app). */
  private async favThumb(f: Favorite): Promise<string> {
    const key = favThumbKey(f.id);
    const url = await imageUrl(key);
    if (url) return url;
    if (f.thumb) {
      const b = dataUrlToBlob(f.thumb);
      if (b) return putImage(key, b);
    }
    return this.thumbs.request(f.recipe, this.app.colorsFor(f.recipe.species, 'dark'), 'dark', 1, f.id, key);
  }

  saveDialog(): void {
    const thumb = this.app.thumbnailBlob();
    const img = h('img', { class: 'save-dlg__img', alt: 'Náhled světa' });
    void thumb.then((b) => {
      if (b) img.src = URL.createObjectURL(b);
      else img.remove();
    });
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
      img,
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
      onClose: () => {
        if (img.src) setTimeout(() => URL.revokeObjectURL(img.src), 1000);
      },
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        d.close('ok');
      }
    });
    void d.closed.then(async (v) => {
      if (v !== 'ok') return;
      const fav = this.app.newFavorite(input.value);
      const b = await thumb;
      if (b) await putImage(favThumbKey(fav.id), b);
      this.app.addFavorite(fav);
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

  private deleteFavorite(f: Favorite): void {
    const index = this.app.store.state.favorites.findIndex((x) => x.id === f.id);
    const removed = this.app.deleteFavorite(f.id);
    if (!removed) return;
    let restored = false;
    toast(`Smazáno: ${removed.name}`, {
      duration: 7000,
      action: {
        label: 'Vrátit',
        onClick: () => {
          restored = true;
          this.app.restoreFavorite(removed, index);
        },
      },
    });
    setTimeout(() => {
      if (!restored && !this.app.store.state.favorites.some((x) => x.id === f.id)) void deleteImage(favThumbKey(f.id));
    }, 9000);
  }

  private async shareFavorite(f: Favorite): Promise<void> {
    const url = this.app.favoriteUrl(f);
    try {
      await navigator.clipboard.writeText(url);
      toast('Odkaz zkopírován – pošli ho komukoli.', { variant: 'success' });
    } catch {
      window.prompt('Zkopíruj si odkaz:', url);
    }
  }
}
