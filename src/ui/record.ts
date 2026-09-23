import type { App } from '../app/app';
import { sfx } from '../kit/sfx';
import { toast } from '../kit/toast';
import { h } from './dom';
import { icon } from './icons';

const MIME = ['video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];

/** Records the canvas into a short video clip (MediaRecorder) and offers it as a download. */
export class Recorder {
  readonly pill: HTMLElement;
  private rec: MediaRecorder | null = null;
  private timer = 0;
  private left = 0;
  private label: HTMLElement;

  constructor(
    private app: App,
    private seconds = 8,
  ) {
    this.label = h('span', null, '');
    const stop = h('button', { type: 'button', class: 'rec-pill__stop', 'aria-label': 'Zastavit nahrávání' }, icon('close'));
    stop.addEventListener('click', () => this.stop());
    this.pill = h('div', { class: 'rec-pill', hidden: true, role: 'status' }, h('i', { class: 'rec-pill__dot' }), this.label, stop);
  }

  static supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function';
  }

  get recording(): boolean {
    return this.rec !== null;
  }

  toggle(): void {
    if (this.rec) this.stop();
    else this.start();
  }

  start(): void {
    if (this.rec) return;
    if (!Recorder.supported()) {
      toast('Tenhle prohlížeč neumí nahrávat video z plátna.', { variant: 'danger' });
      return;
    }
    const mime = MIME.find((m) => MediaRecorder.isTypeSupported(m));
    // record a copy capped at ~1080p: full-resolution capture of a 4–5 MP canvas costs frames
    const src = this.app.canvasEl;
    const scale = Math.min(1, 1920 / src.width, 1080 / src.height);
    const copy = document.createElement('canvas');
    copy.width = Math.round((src.width * scale) / 2) * 2;
    copy.height = Math.round((src.height * scale) / 2) * 2;
    const cctx = copy.getContext('2d', { alpha: false })!;
    cctx.imageSmoothingQuality = 'high';
    this.app.onAfterDraw = (c) => cctx.drawImage(c, 0, 0, copy.width, copy.height);
    const stream = copy.captureStream(60);
    let rec: MediaRecorder;
    try {
      rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 10_000_000 });
    } catch {
      this.app.onAfterDraw = null;
      toast('Nahrávání se nepodařilo spustit.', { variant: 'danger' });
      return;
    }
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      this.app.onAfterDraw = null;
      stream.getTracks().forEach((t) => t.stop());
      const type = rec.mimeType || mime || 'video/webm';
      const blob = new Blob(chunks, { type });
      void this.save(blob, type.includes('mp4') ? 'mp4' : 'webm');
    };
    this.rec = rec;
    rec.start(250);
    sfx.click();
    this.left = this.seconds;
    this.render();
    this.pill.hidden = false;
    this.timer = window.setInterval(() => {
      this.left--;
      if (this.left <= 0) this.stop();
      else this.render();
    }, 1000);
  }

  stop(): void {
    if (!this.rec) return;
    clearInterval(this.timer);
    const rec = this.rec;
    this.rec = null;
    this.pill.hidden = true;
    if (rec.state !== 'inactive') rec.stop();
  }

  private render(): void {
    this.label.textContent = `Nahrávám… ${this.left} s`;
  }

  private async save(blob: Blob, ext: string): Promise<void> {
    if (blob.size < 1000) {
      toast('Video je prázdné – zkus to prosím znovu.', { variant: 'danger' });
      return;
    }
    const title = (this.app.store.state.title || 'dots')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const name = `dots-${title || 'svet'}.${ext}`;
    const file = new File([blob], name, { type: blob.type });
    if (matchMedia('(pointer: coarse)').matches && navigator.canShare?.({ files: [file] })) {
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
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    sfx.success();
    toast(`Video uloženo: ${name}`, { variant: 'success' });
  }
}
