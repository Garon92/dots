import type { App, TabId } from '../app/app';
import { h } from './dom';
import { type IconName, icon } from './icons';

export interface TabDef {
  id: TabId;
  label: string;
  icon: IconName;
  page: HTMLElement;
  onShow?: () => void;
}

const SHEET = '(max-width: 759px)';

/**
 * The "Laboratoř" panel: a floating side panel on wide screens, a draggable bottom sheet on
 * phones. Collapsible so the simulation can use the whole screen.
 */
export class Panel {
  readonly el: HTMLElement;
  private tabBtns = new Map<TabId, HTMLButtonElement>();
  private pages = new Map<TabId, TabDef>();
  private body: HTMLElement;
  private sheetMq = matchMedia(SHEET);
  private sheetH = 0.58;

  constructor(
    private app: App,
    tabs: TabDef[],
  ) {
    const tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Sekce laboratoře' });
    for (const t of tabs) {
      const b = h(
        'button',
        { type: 'button', class: 'tab', role: 'tab', id: `tabbtn-${t.id}`, 'aria-controls': `tab-${t.id}`, 'aria-selected': 'false', tabindex: -1 },
        icon(t.icon),
        h('span', null, t.label),
      );
      b.addEventListener('click', () => this.app.store.set({ tab: t.id }));
      tablist.append(b);
      this.tabBtns.set(t.id, b);
      this.pages.set(t.id, t);
      t.page.setAttribute('role', 'tabpanel');
      t.page.setAttribute('aria-labelledby', `tabbtn-${t.id}`);
      t.page.hidden = true;
    }
    tablist.addEventListener('keydown', (e) => {
      const ids = tabs.map((t) => t.id);
      const cur = ids.indexOf(this.app.store.state.tab);
      let next = -1;
      if (e.key === 'ArrowRight') next = (cur + 1) % ids.length;
      else if (e.key === 'ArrowLeft') next = (cur + ids.length - 1) % ids.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = ids.length - 1;
      if (next >= 0) {
        e.preventDefault();
        this.app.store.set({ tab: ids[next] });
        this.tabBtns.get(ids[next])?.focus();
      }
    });

    const close = h('button', { type: 'button', class: 'panel__close', 'aria-label': 'Schovat laboratoř', title: 'Schovat laboratoř (L)' }, icon('close'));
    close.addEventListener('click', () => this.app.store.set({ panelOpen: false }));
    const handle = h('div', { class: 'sheet-handle', 'aria-hidden': 'true' }, h('span'));
    this.body = h('div', { class: 'panel__body' }, ...tabs.map((t) => t.page));
    this.el = h(
      'aside',
      { class: 'panel', id: 'panel', 'aria-label': 'Laboratoř – nastavení simulace' },
      handle,
      h('div', { class: 'panel__head' }, tablist, close),
      this.body,
    );
    this.bindSheetDrag(handle);

    app.store.on(['tab'], () => this.showTab());
    app.store.on(['panelOpen'], () => this.syncOpen());
    this.sheetMq.addEventListener('change', () => this.syncOpen());
    this.showTab();
    this.syncOpen();
  }

  private showTab(): void {
    const id = this.app.store.state.tab;
    for (const [tid, b] of this.tabBtns) {
      const on = tid === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      this.pages.get(tid)!.page.hidden = !on;
    }
    this.body.scrollTop = 0;
    if (this.app.store.state.panelOpen) this.pages.get(id)?.onShow?.();
  }

  private syncOpen(): void {
    const open = this.app.store.state.panelOpen;
    this.el.dataset.open = String(open);
    this.el.toggleAttribute('inert', !open);
    document.body.classList.toggle('panel-open', open);
    document.body.classList.toggle('sheet-mode', this.sheetMq.matches);
    this.el.style.setProperty('--sheet-h', `${Math.round(this.sheetH * 100)}%`);
    if (open) this.pages.get(this.app.store.state.tab)?.onShow?.();
  }

  /** Drag the handle to resize the sheet; drag down far enough to close it. */
  private bindSheetDrag(handle: HTMLElement): void {
    let start: { y: number; h: number; id: number } | null = null;
    const stage = () => this.el.parentElement!.getBoundingClientRect().height;
    handle.addEventListener('pointerdown', (e) => {
      if (!this.sheetMq.matches) return;
      start = { y: e.clientY, h: this.sheetH, id: e.pointerId };
      handle.setPointerCapture(e.pointerId);
      this.el.classList.add('is-dragging');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const frac = start.h + (start.y - e.clientY) / stage();
      this.sheetH = Math.max(0.2, Math.min(0.92, frac));
      this.el.style.setProperty('--sheet-h', `${Math.round(this.sheetH * 100)}%`);
    });
    const end = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const moved = Math.abs(e.clientY - start.y);
      this.el.classList.remove('is-dragging');
      if (moved < 6) {
        // tap on the handle toggles between half and almost full height
        this.sheetH = this.sheetH > 0.7 ? 0.58 : 0.9;
      } else if (this.sheetH < 0.3) {
        this.sheetH = 0.58;
        this.app.store.set({ panelOpen: false });
      } else {
        this.sheetH = this.sheetH > 0.75 ? 0.9 : this.sheetH < 0.45 ? 0.42 : 0.58;
      }
      this.el.style.setProperty('--sheet-h', `${Math.round(this.sheetH * 100)}%`);
      start = null;
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}
