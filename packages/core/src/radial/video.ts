// A picture that moves: a live stream (HLS, the `.m3u8` a traffic camera or a
// broadcaster serves) or a video file, muted, in the disc or the detail, over
// its still as the poster. It is an element of its own, <pulse-video>, so it
// survives being written as markup again and again: it connects to the
// stream when it enters the page and lets go when it leaves, plays only while
// it is seen (a view behind, a tab hidden: paused, nothing downloaded), and
// falls back to the still when the stream does not answer. Safari plays HLS
// itself on a phone; elsewhere hls.js does, loaded the first time one is needed.

import { esc } from './markup.ts';

type HlsLike = { loadSource(src: string): void; attachMedia(v: HTMLVideoElement): void; destroy(): void; on(e: string, fn: (e: unknown, d: { fatal?: boolean }) => void): void };
let hlsModule: Promise<{ default: { isSupported(): boolean; Events: { ERROR: string }; new (config?: object): HlsLike } }> | null = null;
const isHls = (src: string) => /\.m3u8(\?|$)/i.test(src);

export function videoMarkup(v: { src: string; poster: string; alt: string; cls: string }) {
  return `<pulse-video class="${esc(v.cls)}" src="${esc(v.src)}" poster="${esc(v.poster)}" aria-label="${esc(v.alt)}" role="img"></pulse-video>`;
}

class PulseVideo extends HTMLElement {
  static observedAttributes = ['src', 'poster'];
  private video: HTMLVideoElement | null = null;
  private hls: HlsLike | null = null;
  private seen = new IntersectionObserver((entries) => { for (const e of entries) this.toggle(e.isIntersecting); });
  private visible = false;
  private onHidden = () => this.toggle(this.visible);

  connectedCallback() {
    const video = document.createElement('video');
    Object.assign(video, { muted: true, defaultMuted: true, playsInline: true, autoplay: false, loop: true, preload: 'none' });
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.poster = this.getAttribute('poster') ?? '';
    video.addEventListener('playing', () => { this.dataset.state = 'playing'; });
    video.addEventListener('error', () => this.fail());
    this.replaceChildren(video);
    this.video = video;
    this.dataset.state = 'still';
    this.seen.observe(this);
    document.addEventListener('visibilitychange', this.onHidden);
  }
  disconnectedCallback() {
    this.seen.disconnect();
    document.removeEventListener('visibilitychange', this.onHidden);
    this.release();
    this.video = null;
  }
  attributeChangedCallback(name: string, was: string | null, now: string | null) {
    if (!this.video || was === now) return;
    if (name === 'poster') { this.video.poster = now ?? ''; return; }
    this.release();
    this.toggle(this.visible);
  }

  // Seen and the page shown: play; else pause and stop downloading.
  private toggle(visible: boolean) {
    this.visible = visible;
    const on = visible && !document.hidden && this.dataset.state !== 'failed';
    if (on) void this.play();
    else this.release();
  }
  private async play() {
    const video = this.video, src = this.getAttribute('src') ?? '';
    if (!video || !src || this.hls || video.getAttribute('src')) return;
    this.dataset.state = 'loading';
    if (!isHls(src)) video.src = src;
    else {
      // hls.js wherever the browser has Media Source (a Chromium may say "maybe" to HLS and not play it); the browser's own only where it has none (Safari on a phone).
      hlsModule ??= import('hls.js') as unknown as NonNullable<typeof hlsModule>;
      const { default: Hls } = await hlsModule;
      if (this.video !== video || this.hls || !this.visible) return;
      if (!Hls.isSupported()) {
        if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = src; void video.play().catch(() => {}); } else this.fail();
        return;
      }
      const hls = new Hls({ lowLatencyMode: true, backBufferLength: 10 });
      hls.on(Hls.Events.ERROR, (_e, d) => { if (d.fatal) this.fail(); });
      hls.loadSource(src);
      hls.attachMedia(video);
      this.hls = hls;
    }
    video.play().catch(() => { /* autoplay refused: the still stays */ });
  }
  private release() {
    this.hls?.destroy();
    this.hls = null;
    const video = this.video;
    if (video?.getAttribute('src')) { video.pause(); video.removeAttribute('src'); video.load(); }
    if (this.dataset.state !== 'failed') this.dataset.state = 'still';
  }
  // The stream does not answer: the still stays, and the element says so (`data-state="failed"`).
  private fail() {
    this.release();
    this.dataset.state = 'failed';
  }
}

if (typeof customElements !== 'undefined' && !customElements.get('pulse-video')) customElements.define('pulse-video', PulseVideo);
