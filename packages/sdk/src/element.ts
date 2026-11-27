import { MediaPlayer, type MediaPlayerOptions } from './index';

export type SourceAdapterFactory = (ctx: {
  url: string;
  headers?: Record<string, string>;
}) => unknown;

const sourceAdapters = new Map<string, SourceAdapterFactory>();

export function registerSourceAdapter(
  schemes: string | string[],
  factory: SourceAdapterFactory
) {
  const list = Array.isArray(schemes) ? schemes : [schemes];
  for (const s of list) {
    sourceAdapters.set(s.replace(/:$/, '').toLowerCase(), factory);
  }
}

export function getSourceAdapter(url: string, headers?: Record<string, string>) {
  const match = url.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
  if (!match) return null;
  const scheme = match[1].toLowerCase();
  const factory = sourceAdapters.get(scheme);
  return factory ? factory({ url, headers }) : null;
}

export interface SubtitleRenderer {
  mount(overlay: HTMLElement): void;
  configure(track: unknown, extradata: unknown): void;
  pushPacket(pkt: unknown): void;
  render(time: number, w: number, h: number): void;
  setDelay?(s: number): void;
  clear?(): void;
  destroy?(): void;
}

export class ValorPlayerElement extends HTMLElement {
  public player: MediaPlayer | null = null;
  private subtitleRenderer: SubtitleRenderer | null = null;
  private queueSources: string[] = [];
  private queueIndex = 0;

  static get observedAttributes() {
    return [
      'src', 'controls', 'thumb', 'showtitle', 'title', 'vr', 'vrpad',
      'stablevolume', 'proxy', 'headers', 'fallback', 'resume', 'startat',
      'fastseek', 'ambientmode', 'poster', 'postertime', 'theme', 'themecolor',
      'objectfit', 'rotate', 'subtitlesize', 'subtitlecolor', 'subtitlebg',
      'subtitleedge', 'subtitledelay', 'buffersize', 'nohotkeys', 'domain',
      'autoadvance', 'shuffle',
    ];
  }

  connectedCallback() {
    this.style.display = this.style.display || 'block';
    this.mountPlayer();
  }

  disconnectedCallback() {
    this.player?.destroy();
    this.player = null;
    this.subtitleRenderer?.destroy?.();
  }

  attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null) {
    if (oldVal === newVal || !this.player) return;
    if (name === 'proxy' || name === 'headers') {
      const proxy = this.getAttribute('proxy') || '';
      const headers = this.parseHeaders();
      this.player.setProxy(proxy, headers);
    } else if (name === 'src') {
      if (newVal) this.player.load(newVal);
    }
  }

  private parseHeaders(): Record<string, string> | undefined {
    const raw = this.getAttribute('headers');
    if (!raw) return undefined;
    try {
      return JSON.parse(raw);
    } catch {
      return undefined;
    }
  }

  private mountPlayer() {
    if (this.player) return;
    const sources = Array.from(this.querySelectorAll('source'));
    this.queueSources = sources
      .filter((s) => s.getAttribute('kind') !== 'audio')
      .map((s) => s.getAttribute('src') || '')
      .filter(Boolean);
    if (this.hasAttribute('shuffle') && this.queueSources.length > 1) {
      for (let i = this.queueSources.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [this.queueSources[i], this.queueSources[j]] = [this.queueSources[j], this.queueSources[i]];
      }
    }
    this.queueIndex = 0;

    const defaultSrc =
      this.getAttribute('src') ||
      sources.find((s) => s.hasAttribute('data-default'))?.getAttribute('src') ||
      this.queueSources[0] ||
      '';

    const opts: MediaPlayerOptions = {
      container: this,
      media: defaultSrc || undefined,
      title: this.getAttribute('title') || undefined,
      proxyUrl: this.getAttribute('proxy') || undefined,
      headers: this.parseHeaders(),
      startAt: this.hasAttribute('startat') ? Number(this.getAttribute('startat')) : undefined,
      domain: this.getAttribute('domain') || undefined,
      theme: {
        accent: this.getAttribute('themecolor') || undefined,
      },
    };

    this.player = new MediaPlayer(opts);
    this.player.on('qualitychange', (detail: unknown) => {
      this.dispatchEvent(new CustomEvent('qualitychange', { detail }));
    });
    this.player.on('time_update', (detail: unknown) => {
      this.dispatchEvent(new CustomEvent('timeupdate', { detail }));
    });
    this.player.on('ended', (detail: unknown) => {
      if (this.hasAttribute('autoadvance') && this.queueSources.length > 1) {
        if (this.hasAttribute('shuffle')) {
          const candidates = this.queueSources
            .map((_, idx) => idx)
            .filter((idx) => idx !== this.queueIndex);
          this.queueIndex = candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
        } else if (this.queueIndex + 1 < this.queueSources.length) {
          this.queueIndex += 1;
        } else if (this.hasAttribute('loop')) {
          this.queueIndex = 0;
        } else {
          this.dispatchEvent(new CustomEvent('ended', { detail }));
          return;
        }
        const nextSrc = this.queueSources[this.queueIndex];
        if (nextSrc) {
          this.player?.load(nextSrc);
          this.player?.play();
          return;
        }
      }
      this.dispatchEvent(new CustomEvent('ended', { detail }));
    });
    this.player.on('error', (detail: unknown) => {
      this.dispatchEvent(new CustomEvent('error', { detail }));
    });
  }

  public setSubtitleRenderer(renderer: SubtitleRenderer) {
    this.subtitleRenderer = renderer;
    renderer.mount(this);
  }

  public play() {
    this.player?.play();
  }

  public pause() {
    this.player?.pause();
  }

  public set currentTime(t: number) {
    this.player?.seek(t);
  }

  public setQuality(level: number) {
    this.player?.setQuality(level);
  }

  public setProxy(proxyUrl: string, headers?: Record<string, string>) {
    this.player?.setProxy(proxyUrl, headers);
  }
}

if (typeof window !== 'undefined' && typeof customElements !== 'undefined') {
  if (!customElements.get('valor-player')) {
    customElements.define('valor-player', ValorPlayerElement);
  }
}
