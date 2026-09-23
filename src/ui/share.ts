import type { App } from '../app/app';
import { sfx } from '../kit/sfx';
import { toast } from '../kit/toast';
import { h } from './dom';

/** Share the current world: native share sheet on phones, clipboard elsewhere. */
export async function shareWorld(app: App): Promise<void> {
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

/** Save the canvas as a JPEG (share sheet on phones so it can go to the photo library). */
export async function saveScreenshot(app: App, stage: HTMLElement): Promise<void> {
  // JPEG capped at 2560 px: a full-resolution PNG of the glow was ~10 MB – too big for messengers
  const c = app.captureCanvas(2560);
  const title = (app.store.state.title || 'dots').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const d = new Date();
  const p2 = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  const name = `dots-${title || 'svet'}-${stamp}.jpg`;
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', 0.9));
  if (!blob) {
    toast('Obrázek se nepodařilo vytvořit.', { variant: 'danger' });
    return;
  }
  sfx.click();
  stage.classList.remove('flash');
  void stage.offsetWidth;
  stage.classList.add('flash');
  const file = new File([blob], name, { type: 'image/jpeg' });
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

