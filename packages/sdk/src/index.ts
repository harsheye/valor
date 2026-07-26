export interface MediaPlayerOptions {
  container: string | HTMLElement;
  media?: string;
  autoplay?: boolean;
  controls?: {
    play?: boolean;
    pause?: boolean;
    volume?: boolean;
    subtitles?: boolean;
    fullscreen?: boolean;
    speed?: boolean;
    settings?: boolean;
    nextEpisode?: boolean;
    previousEpisode?: boolean;
    pip?: boolean;
    download?: boolean;
    screenshot?: boolean;
    chapters?: boolean;
  };
  theme?: {
    accent?: string;
    background?: string;
    text?: string;
    radius?: number;
    font?: string;
    logoUrl?: string;
    watermarkUrl?: string;
    hideLogo?: boolean;
  };
  domain?: string;
}

export class MediaPlayer {
  private iframe: HTMLIFrameElement;
  private container: HTMLElement;
  private listeners: Map<string, Function[]> = new Map();
  private domain: string;

  constructor(options: MediaPlayerOptions) {
    this.domain = options.domain || 'http://localhost:5173'; // Fallback to local dev server for now

    if (typeof options.container === 'string') {
      const el = document.querySelector(options.container);
      if (!el) throw new Error(`Container ${options.container} not found.`);
      this.container = el as HTMLElement;
    } else {
      this.container = options.container;
    }

    this.iframe = document.createElement('iframe');
    this.iframe.style.width = '100%';
    this.iframe.style.height = '100%';
    this.iframe.style.border = 'none';
    this.iframe.allowFullscreen = true;
    this.iframe.allow = "autoplay; fullscreen; encrypted-media";

    const url = new URL(`${this.domain}/embed`);
    if (options.media) url.searchParams.set('url', options.media);
    if (options.controls) url.searchParams.set('controls', JSON.stringify(options.controls));
    if (options.theme) url.searchParams.set('theme', JSON.stringify(options.theme));

    this.iframe.src = url.toString();
    this.container.appendChild(this.iframe);

    window.addEventListener('message', this.handleMessage.bind(this));
  }

  private handleMessage(event: MessageEvent) {
    if (!event.data || event.data.source !== 'valor-embed-iframe') return;
    const payload = event.data.payload;
    if (payload && payload.type) {
      this.emit(payload.type.toLowerCase(), payload.payload);
    }
  }

  private sendCommand(command: any) {
    if (this.iframe.contentWindow) {
      this.iframe.contentWindow.postMessage({
        source: 'valor-embed-host',
        version: '1.0.0',
        payload: command
      }, '*');
    }
  }

  public play() {
    this.sendCommand({ type: 'PLAY' });
  }

  public pause() {
    this.sendCommand({ type: 'PAUSE' });
  }

  public stop() {
    this.sendCommand({ type: 'STOP' });
  }

  public seek(time: number) {
    this.sendCommand({ type: 'SEEK', payload: { time } });
  }

  public load(url: string) {
    this.sendCommand({ type: 'LOAD', payload: { url } });
  }

  public volume(vol: number) {
    this.sendCommand({ type: 'SET_VOLUME', payload: { volume: vol } });
  }

  public mute() {
    this.sendCommand({ type: 'SET_MUTE', payload: { muted: true } });
  }

  public unmute() {
    this.sendCommand({ type: 'SET_MUTE', payload: { muted: false } });
  }

  public fullscreen() {
    this.sendCommand({ type: 'SET_FULLSCREEN', payload: { fullscreen: true } });
  }

  public exitFullscreen() {
    this.sendCommand({ type: 'SET_FULLSCREEN', payload: { fullscreen: false } });
  }

  public setSpeed(speed: number) {
    this.sendCommand({ type: 'SET_SPEED', payload: { speed } });
  }

  public on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  public off(event: string, callback: Function) {
    if (this.listeners.has(event)) {
      const filtered = this.listeners.get(event)!.filter(cb => cb !== callback);
      this.listeners.set(event, filtered);
    }
  }

  private emit(event: string, data?: any) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(cb => cb(data));
    }
  }

  public destroy() {
    window.removeEventListener('message', this.handleMessage.bind(this));
    if (this.container && this.iframe.parentNode === this.container) {
      this.container.removeChild(this.iframe);
    }
  }
}
