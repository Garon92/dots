import './kit/kit.css';
import './styles/app.css';
import { recordActivity } from './kit/activity';
import './kit/appbar';
import { openSettingsDialog } from './kit/dialog';
import { sfx } from './kit/sfx';
import { toast } from './kit/toast';
import { App } from './app/app';
import { PRESETS } from './state/presets';
import { SPEEDS } from './state/settings';
import { segmented } from './ui/controls';
import { h, isTypingTarget } from './ui/dom';
import { GalleryTab } from './ui/gallery';
import { onboarding, openExplainer, openShortcuts } from './ui/help';
import { Hud } from './ui/hud';
import { icon } from './ui/icons';
import { CanvasInput } from './ui/input';
import { LookTab } from './ui/look-tab';
import { MatrixTab } from './ui/matrix';
import { Panel } from './ui/panel';
import { ThumbService } from './ui/thumbs-service';
import { TOOLS, Toolbar } from './ui/toolbar';
import { WorldTab } from './ui/world-tab';

const stage = document.getElementById('stage')!;
const canvas = document.getElementById('field') as HTMLCanvasElement;
const appbar = document.querySelector('g92-appbar')!;

const app = new App(canvas, stage);
app.toast = (msg, o) => {
  toast(msg, { duration: o?.ms, action: o?.action && o.onAction ? { label: o.action, onClick: o.onAction } : undefined });
};

// ------------------------------------------------------------------ UI
const thumbs = new ThumbService();
const gallery = new GalleryTab(app, thumbs);
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
stage.append(input.ring, hud.el, hud.paused, toolbar.el, panel.el, zenBtn);
// generate gallery previews in the background once the page settled
setTimeout(() => gallery.activate(), 2500);

// appbar actions
const shareBtn = document.getElementById('btnShare')!;
const shotBtn = document.getElementById('btnShot')!;
shareBtn.append(icon('share'));
shotBtn.append(icon('camera'));
shareBtn.addEventListener('click', () => void share());
shotBtn.addEventListener('click', () => void screenshot());
appbar.addEventListener('g92-help', () => openExplainer(app));
appbar.addEventListener('g92-settings', (e) => {
  e.preventDefault();
  const st = app.store.state.settings;
  const extra = h(
    'div',
    { class: 'g92-field' },
    h('span', { class: 'g92-label' }, 'Plátno simulace'),
    segmented(
      'Plátno simulace',
      [
        { value: 'auto', label: 'Podle vzhledu' },
        { value: 'dark', label: 'Noc' },
        { value: 'light', label: 'Papír' },
      ],
      st.canvasTheme,
      (v) => app.updateSettings({ canvasTheme: v }),
    ).el,
  );
  openSettingsDialog({ extra, hideName: true });
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

// resize → world resize
let resizeRaf = 0;
new ResizeObserver(() => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => app.onResize());
}).observe(stage);

// ------------------------------------------------------------------ zen mode
function setZen(on: boolean): void {
  app.store.set({ zen: on });
  document.body.classList.toggle('zen', on);
  if (on) toast('Rozhraní je skryté – vrátíš ho klávesou H nebo tlačítkem v rohu.', { duration: 3200 });
}

// ------------------------------------------------------------------ share & screenshot
async function share(): Promise<void> {
  const url = app.shareUrl();
  const title = app.store.state.title || 'Dots';
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.share) {
    try {
      await navigator.share({ title: `${title} · Dots`, text: 'Podívej se na tenhle svět živých teček:', url });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    sfx.pop();
    toast('Odkaz zkopírován – kdo ho otevře, uvidí přesně tenhle svět.', { variant: 'success' });
  } catch {
    window.prompt('Zkopíruj si odkaz:', url);
  }
}

async function screenshot(): Promise<void> {
  const c = app.captureCanvas();
  const title = (app.store.state.title || 'dots').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
  const name = `dots-${title || 'svet'}-${stamp}.png`;
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/png'));
  if (!blob) {
    toast('Obrázek se nepodařilo vytvořit.', { variant: 'danger' });
    return;
  }
  sfx.click();
  stage.classList.remove('flash');
  void stage.offsetWidth;
  stage.classList.add('flash');
  const file = new File([blob], name, { type: 'image/png' });
  const coarse = matchMedia('(pointer: coarse)').matches;
  if (coarse && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Dots' });
      return;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
    }
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(`Obrázek uložen: ${name}`, { variant: 'success' });
}

// ------------------------------------------------------------------ keyboard
function stepPreset(dir: number): void {
  const s = app.store.state;
  const i = PRESETS.findIndex((p) => p.id === s.presetId);
  const next = PRESETS[(i + dir + PRESETS.length) % PRESETS.length];
  app.applyPreset(next.id);
  toast(next.name, { duration: 1400 });
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
    case 'm':
    case 'M':
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
      toast(st.bonds ? 'Živá síť vypnutá' : 'Živá síť zapnutá', { duration: 1200 });
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
      toast(`Nástroj: ${t.label}`, { duration: 1100 });
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
      toast(`Rychlost ${String(next).replace('.', ',')}×`, { duration: 1100 });
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
    case 'f':
    case 'F':
      void appbar.toggleFullscreen();
      break;
    case 's':
    case 'S':
      gallery.saveDialog();
      break;
    case 'c':
    case 'C':
      void screenshot();
      break;
    case 'u':
    case 'U':
      void share();
      break;
    case '?':
      openShortcuts();
      break;
    case 'ArrowLeft':
    case 'ArrowRight':
      if (e.target instanceof HTMLElement && e.target.closest('.panel')) return;
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
    recordActivity('dots', {
      metric: { label: 'Oblíbených světů', value: s.favorites.length },
      note: s.title || undefined,
    });
  }, 1500);
};
app.store.on(['favorites', 'title'], reportActivity);
reportActivity();

// debugging / measurements from the console
(window as unknown as { dots: App }).dots = app;
void toolbar;
