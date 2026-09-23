import './kit/kit.css';
import './styles/app.css';
import { recordActivity } from './kit/activity';
import './kit/appbar';
import { onDialogChange, setSettingsSection } from './kit/dialog';
import { appbarAction } from './kit/appbar';
import { settingsSection } from './ui/settings-section';
import { sfx } from './kit/sfx';
import { toast } from './kit/toast';
import { App } from './app/app';
import { PRESETS } from './state/presets';
import { markVisited, visitedPresets } from './state/storage';
import { SPEEDS } from './state/settings';
import { h, isTypingTarget } from './ui/dom';
import { GalleryTab } from './ui/gallery';
import { onboarding, openExplainer } from './ui/help';
import { Hud } from './ui/hud';
import { ICONS, icon } from './ui/icons';
import { CanvasInput } from './ui/input';
import { LookTab } from './ui/look-tab';
import { MatrixTab } from './ui/matrix';
import { Panel } from './ui/panel';
import { ThumbService } from './ui/thumbs-service';
import { TOOLS, Toolbar } from './ui/toolbar';
import { WorldTab } from './ui/world-tab';
import { saveScreenshot, shareWorld } from './ui/share';
import { Recorder } from './ui/record';

const stage = document.getElementById('stage')!;
const canvas = document.getElementById('field') as HTMLCanvasElement;
const appbar = document.querySelector('g92-appbar')!;

const app = new App(canvas, stage);
app.toast = (msg, o) => {
  toast(msg, { duration: o?.ms, action: o?.action && o.onAction ? { label: o.action, onClick: o.onAction } : undefined });
};

// ------------------------------------------------------------------ UI
const thumbs = new ThumbService();
const recorder = new Recorder(app);
const gallery = new GalleryTab(app, thumbs, {
  share: () => void share(),
  shot: () => void screenshot(),
  video: Recorder.supported() ? () => recorder.toggle() : null,
});
const matrix = new MatrixTab(app);
const world = new WorldTab(app);
const look = new LookTab(app);
const panel = new Panel(app, [
  { id: 'galerie', label: 'Galerie', icon: 'gallery', page: gallery.el, onShow: () => gallery.activate() },
  { id: 'matice', label: 'Matice', icon: 'grid', page: matrix.el },
  { id: 'svet', label: 'Svět', icon: 'atom', page: world.el },
  { id: 'vzhled', label: 'Vzhled', icon: 'palette', page: look.el },
]);
const hud = new Hud(app);
const toolbar = new Toolbar(app);
const input = new CanvasInput(app, app.canvasEl);
const zenBtn = h('button', { type: 'button', class: 'zen-exit', 'aria-label': 'Zobrazit rozhraní', title: 'Zobrazit rozhraní (H)' }, icon('eye'));
zenBtn.addEventListener('click', () => setZen(false));
stage.append(input.ring, hud.el, recorder.pill, hud.paused, toolbar.el, panel.el, zenBtn);
// gallery previews are simulated and painted in a worker; start them once the page is idle
// (the gallery tab starts them right away when it is opened earlier)
setTimeout(() => {
  const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 50));
  idle(() => gallery.activate(), { timeout: 6000 });
}, 4000);

// appbar actions – kit look (appbarAction), shown in the appbar on wider screens, in the gallery on phones
for (const a of [
  { icon: ICONS.share, label: 'Sdílet odkaz na tento svět (U)', onClick: () => void share() },
  { icon: ICONS.camera, label: 'Uložit obrázek (C)', onClick: () => void screenshot() },
  ...(Recorder.supported() ? [{ icon: ICONS.video, label: 'Nahrát 8s video (Shift+C)', onClick: () => recorder.toggle() }] : []),
]) {
  appbarAction({ ...a, appbar }).classList.add('dots-appbar-action');
}

// "?" → the rich explainer (charts); the kit's own help dialog is not registered, so nothing else opens
appbar.addEventListener('g92-help', (e) => {
  e.preventDefault();
  openExplainer(app);
});

// ⚙ → kit settings dialog with the Dots section (canvas theme + reset)
setSettingsSection({
  nameMode: 'hidden',
  showVoice: false,
  extra: () => settingsSection(app),
});
appbar.addEventListener('g92-fullscreen', () => setTimeout(() => app.onResize(), 50));

// canvas theme drives the stage background (before the first frame is drawn)
const syncCanvasTheme = () => (stage.dataset.canvas = app.store.state.theme);
app.store.on(['theme'], syncCanvasTheme);
syncCanvasTheme();

// ------------------------------------------------------------------ start
app.start();
input.onFirstUse = () => coach?.classList.add('is-leaving');
const coach = onboarding(app, stage);

// kit dialogs (help, settings, save, confirm…) pause the simulation while they are open
let pausedByDialog = false;
onDialogChange((open) => {
  if (open && app.store.state.running) {
    pausedByDialog = true;
    app.togglePause(false);
  } else if (!open && pausedByDialog) {
    pausedByDialog = false;
    app.togglePause(true);
  }
});
app.store.on(['running'], (s) => {
  // the user resumed (e.g. from a toast) – don't resume again on close
  if (s.running) pausedByDialog = false;
});

// a different link pasted into the address bar / back-forward within the tab → switch worlds
window.addEventListener('hashchange', () => app.openHash(location.hash));

// the stage must never scroll (older Safari has no overflow: clip)
stage.addEventListener('scroll', () => {
  if (stage.scrollLeft || stage.scrollTop) stage.scrollTo(0, 0);
});

// resize → world resize
let resizeRaf = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => app.onResize());
}).observe(stage);

// ------------------------------------------------------------------ zen mode
function setZen(on: boolean): void {
  app.store.set({ zen: on });
}
// zen can be switched from the keyboard (H), the Vzhled / Galerie tabs and the autoplay toast
app.store.on(['zen'], (s) => {
  document.body.classList.toggle('zen', s.zen);
  if (s.zen) {
    app.store.set({ panelOpen: false });
    const how = matchMedia('(any-pointer: fine)').matches ? 'klávesou H nebo tlačítkem v rohu' : 'tlačítkem s okem v pravém horním rohu';
    toast(`Rozhraní je skryté – vrátíš ho ${how}.`, { duration: 3200 });
  }
});

// ------------------------------------------------------------------ share & screenshot
const share = () => shareWorld(app);
const screenshot = () => saveScreenshot(app, stage);

// ------------------------------------------------------------------ keyboard
/** Short status toast that replaces the previous one (no stacking when keys are pressed quickly). */
let lastFlash: (() => void) | null = null;
function flash(msg: string, duration = 1300): void {
  lastFlash?.();
  lastFlash = toast(msg, { duration });
}

function stepPreset(dir: number): void {
  const s = app.store.state;
  const i = PRESETS.findIndex((p) => p.id === s.presetId);
  const next = PRESETS[(i + dir + PRESETS.length) % PRESETS.length];
  app.applyPreset(next.id);
  flash(next.name, 1400);
}

let lastTrails = app.store.state.settings.trails || 0.6;
window.addEventListener('keydown', (e) => {
  if (e.defaultPrevented || isTypingTarget(e.target)) return;
  if (document.querySelector('dialog[open]')) return;
  const k = e.key;
  const mod = e.ctrlKey || e.metaKey;
  if (mod) {
    if (k.toLowerCase() === 'z' && !e.shiftKey) app.undo();
    else if ((k.toLowerCase() === 'z' && e.shiftKey) || k.toLowerCase() === 'y') app.redo();
    else if (k.toLowerCase() === 's') gallery.saveDialog();
    else return;
    e.preventDefault();
    return;
  }
  if (e.altKey) return;
  // let focused buttons handle Space/Enter themselves
  const onButton = e.target instanceof HTMLElement && (e.target.tagName === 'BUTTON' || e.target.getAttribute('role') === 'button');
  if (onButton && (k === ' ' || k === 'Enter')) return;
  const st = app.store.state.settings;
  switch (k) {
    case ' ':
    case 'p':
    case 'P':
      app.togglePause();
      break;
    case '.':
      app.stepOnce();
      break;
    case 'r':
      sfx.whoosh();
      app.randomize();
      break;
    case 'R':
      sfx.whoosh();
      app.surprise();
      break;
    case 'z':
    case 'Z':
      sfx.flip();
      app.mutate();
      break;
    case 'y':
    case 'Y':
      app.symmetrize();
      break;
    case 'i':
    case 'I':
      app.invert();
      break;
    case 'x':
    case 'X':
      app.transpose();
      break;
    case '0':
      app.zero();
      break;
    case 'n':
    case 'N':
      app.reseed();
      break;
    case 'v':
    case 'V':
      app.shake();
      break;
    case 'b':
    case 'B':
      app.updateSettings({ bonds: !st.bonds });
      flash(st.bonds ? 'Živá síť vypnutá' : 'Živá síť zapnutá');
      break;
    case 't':
    case 'T':
      if (st.trails > 0) {
        lastTrails = st.trails;
        app.updateSettings({ trails: 0 });
      } else app.updateSettings({ trails: lastTrails || 0.6 });
      break;
    case '1':
    case '2':
    case '3':
    case '4':
    case '5': {
      const t = TOOLS[Number(k) - 1];
      app.updateSettings({ tool: t.id });
      flash(`Nástroj: ${t.label}`);
      break;
    }
    case '[':
      app.updateSettings({ brushSize: Math.max(0.4, Math.round((st.brushSize / 1.15) * 100) / 100) });
      break;
    case ']':
      app.updateSettings({ brushSize: Math.min(2.5, Math.round(st.brushSize * 1.15 * 100) / 100) });
      break;
    case '+':
    case '-': {
      const i = SPEEDS.indexOf(st.speed as (typeof SPEEDS)[number]);
      const next = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + (k === '+' ? 1 : -1)))];
      app.updateSettings({ speed: next });
      flash(`Rychlost ${String(next).replace('.', ',')}×`);
      break;
    }
    case 'l':
    case 'L':
      app.store.set({ panelOpen: !app.store.state.panelOpen });
      break;
    case 'g':
    case 'G':
      app.store.set({ panelOpen: true, tab: 'galerie' });
      break;
    case 'h':
    case 'H':
      setZen(!app.store.state.zen);
      break;
    case 's':
    case 'S':
      gallery.saveDialog();
      break;
    case 'c':
      void screenshot();
      break;
    case 'C':
      recorder.toggle();
      break;
    case 'a':
    case 'A': {
      const order = ['off', 'gallery', 'evolve'] as const;
      const next = order[(order.indexOf(app.store.state.autoplay) + 1) % order.length];
      app.setAutoplay(next);
      flash(next === 'off' ? 'Promítání vypnuto' : next === 'gallery' ? 'Promítání galerie' : 'Evoluce – matice se pomalu proměňuje', 1600);
      break;
    }
    case 'u':
    case 'U':
      void share();
      break;
    case 'ArrowLeft':
    case 'ArrowRight':
      // arrows belong to sliders, tabs, segmented controls and the matrix when those have focus
      if (e.target instanceof HTMLElement && e.target.closest('input, select, textarea, [role="tablist"], .g92-segmented, .matrix')) return;
      stepPreset(k === 'ArrowRight' ? 1 : -1);
      break;
    case 'Escape':
      if (app.store.state.zen) setZen(false);
      else if (app.store.state.selCell >= 0) app.store.set({ selCell: -1 });
      else if (app.store.state.panelOpen && matchMedia('(max-width: 759px)').matches) app.store.set({ panelOpen: false });
      else return;
      break;
    default:
      return;
  }
  e.preventDefault();
});

// ------------------------------------------------------------------ activity for the menu
let activityTimer = 0;
const reportActivity = () => {
  clearTimeout(activityTimer);
  activityTimer = window.setTimeout(() => {
    const s = app.store.state;
    if (s.presetId) markVisited(s.presetId);
    const known = new Set(PRESETS.map((p) => p.id));
    const seen = visitedPresets().filter((id) => known.has(id)).length;
    recordActivity('dots', {
      progress: seen / PRESETS.length,
      metric: { label: 'Prozkoumáno', value: seen, of: PRESETS.length, unit: ['svět', 'světy', 'světů'] },
      note: s.title || null,
      href: app.deepLink(),
    });
  }, 1500);
};
app.store.on(['presetId', 'title', 'recipe'], reportActivity);
reportActivity();

// debugging / measurements from the console
(window as unknown as { dots: App }).dots = app;
void toolbar;
