import type { App } from '../app/app';
import { confirmDialog } from '../kit/dialog';
import { resetApp } from '../kit/reset';
import { clearImages } from '../state/images';
import type { CanvasTheme } from '../state/settings';
import { segmented } from './controls';
import { h } from './dom';

/** Dots' part of the kit settings dialog (⚙): canvas theme and "delete everything". */
export function settingsSection(app: App): HTMLElement {
  const theme = segmented<CanvasTheme>(
    'Plátno simulace',
    [
      { value: 'auto', label: 'Podle vzhledu' },
      { value: 'dark', label: 'Noc' },
      { value: 'light', label: 'Papír' },
    ],
    app.store.state.settings.canvasTheme,
    (v) => app.updateSettings({ canvasTheme: v }),
  );
  const reset = h('button', { type: 'button', class: 'g92-btn g92-btn--secondary g92-btn--sm' }, 'Smazat oblíbené a nastavení Dots');
  reset.addEventListener('click', async () => {
    const n = app.store.state.favorites.length;
    const ok = await confirmDialog({
      title: 'Smazat všechna data Dots?',
      message: `Zmizí oblíbené světy${n ? ` (${n})` : ''}, prozkoumané světy i nastavení vzhledu. Ostatních aplikací se to netýká.`,
      confirmLabel: 'Smazat',
      danger: true,
    });
    if (!ok) return;
    resetApp('dots');
    try {
      localStorage.removeItem('dots.setups.v1'); // the original app's setups would be migrated again
    } catch {
      /* ignore */
    }
    await clearImages();
    // reload after the confirm dialog has finished closing (a navigation during its exit animation
    // aborts the cross-document view transition), and without the old world's link in the address
    history.replaceState(null, '', location.pathname);
    setTimeout(() => location.reload(), 320);
  });
  return h(
    'div',
    { class: 'g92-stack', style: '--g92-gap: var(--g92-space-4)' },
    h('div', { class: 'g92-field' }, h('span', { class: 'g92-label' }, 'Plátno simulace'), theme.el),
    h('div', { class: 'g92-field' }, h('span', { class: 'g92-label' }, 'Data'), reset, h('p', { class: 'g92-hint' }, 'Vše je uložené jen v tomto prohlížeči.')),
  );
}
