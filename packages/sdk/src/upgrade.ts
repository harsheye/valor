import { ValorPlayerElement } from './element';

export interface UpgradeVideoOptions {
  proxyUrl?: string;
  domain?: string;
  themeColor?: string;
}

function attachLiveProxy(original: HTMLVideoElement, valorEl: ValorPlayerElement) {
  let cachedPaused = original.paused;
  let cachedTime = original.currentTime || 0;
  let cachedDuration = original.duration || 0;
  let cachedVolume = original.volume ?? 1;
  let cachedMuted = original.muted ?? false;
  let cachedRate = original.playbackRate ?? 1;

  valorEl.addEventListener('timeupdate', (e: any) => {
    if (e?.detail) {
      if (typeof e.detail.currentTime === 'number') cachedTime = e.detail.currentTime;
      if (typeof e.detail.duration === 'number') cachedDuration = e.detail.duration;
    }
    original.dispatchEvent(new Event('timeupdate'));
  });

  valorEl.addEventListener('ended', () => {
    cachedPaused = true;
    original.dispatchEvent(new Event('ended'));
  });

  valorEl.addEventListener('error', (e: any) => {
    original.dispatchEvent(new CustomEvent('error', { detail: e?.detail }));
  });

  Object.defineProperties(original, {
    play: {
      configurable: true,
      value: () => {
        cachedPaused = false;
        valorEl.play();
        original.dispatchEvent(new Event('play'));
        original.dispatchEvent(new Event('playing'));
        return Promise.resolve();
      },
    },
    pause: {
      configurable: true,
      value: () => {
        cachedPaused = true;
        valorEl.pause();
        original.dispatchEvent(new Event('pause'));
      },
    },
    paused: {
      configurable: true,
      get: () => cachedPaused,
    },
    currentTime: {
      configurable: true,
      get: () => cachedTime,
      set: (t: number) => {
        cachedTime = Number(t) || 0;
        valorEl.currentTime = cachedTime;
        original.dispatchEvent(new Event('seeking'));
        original.dispatchEvent(new Event('seeked'));
      },
    },
    duration: {
      configurable: true,
      get: () => cachedDuration,
    },
    volume: {
      configurable: true,
      get: () => cachedVolume,
      set: (v: number) => {
        cachedVolume = Math.max(0, Math.min(1, Number(v) || 0));
        valorEl.player?.volume(cachedVolume);
        original.dispatchEvent(new Event('volumechange'));
      },
    },
    muted: {
      configurable: true,
      get: () => cachedMuted,
      set: (m: boolean) => {
        cachedMuted = Boolean(m);
        if (cachedMuted) valorEl.player?.mute();
        else valorEl.player?.unmute();
        original.dispatchEvent(new Event('volumechange'));
      },
    },
    playbackRate: {
      configurable: true,
      get: () => cachedRate,
      set: (r: number) => {
        cachedRate = Number(r) || 1;
        valorEl.player?.setSpeed(cachedRate);
        original.dispatchEvent(new Event('ratechange'));
      },
    },
  });
}

export function upgradeVideoElements(
  root: Document | HTMLElement = document,
  options: UpgradeVideoOptions = {}
): ValorPlayerElement[] {
  const upgraded: ValorPlayerElement[] = [];
  const videos = Array.from(root.querySelectorAll('video'));

  for (const video of videos) {
    if (video.hasAttribute('data-valor-upgraded') || video.closest('valor-player')) {
      continue;
    }

    const src =
      video.currentSrc ||
      video.getAttribute('src') ||
      video.querySelector('source')?.getAttribute('src') ||
      '';
    if (!src) continue;

    video.setAttribute('data-valor-upgraded', 'true');

    // Handle video.js wrapper if present
    const vjsWrapper = video.closest('.video-js') as HTMLElement | null;
    const mountTarget = vjsWrapper || video;

    const valorEl = document.createElement('valor-player') as ValorPlayerElement;
    valorEl.setAttribute('src', src);
    if (video.hasAttribute('controls') || vjsWrapper) valorEl.setAttribute('controls', '');
    if (video.hasAttribute('autoplay')) valorEl.setAttribute('autoplay', '');
    if (video.poster) valorEl.setAttribute('poster', video.poster);
    if (options.proxyUrl) valorEl.setAttribute('proxy', options.proxyUrl);
    if (options.domain) valorEl.setAttribute('domain', options.domain);
    if (options.themeColor) valorEl.setAttribute('themecolor', options.themeColor);

    const rect = mountTarget.getBoundingClientRect();
    valorEl.style.width = mountTarget.style.width || (rect.width ? `${rect.width}px` : '100%');
    valorEl.style.height = mountTarget.style.height || (rect.height ? `${rect.height}px` : '360px');

    // Clone <source> and <track> children
    for (const child of Array.from(video.querySelectorAll('source, track'))) {
      valorEl.appendChild(child.cloneNode(true));
    }

    mountTarget.parentNode?.insertBefore(valorEl, mountTarget);
    mountTarget.style.display = 'none';

    attachLiveProxy(video, valorEl);
    upgraded.push(valorEl);
  }

  return upgraded;
}

// Auto-run if a <script data-upgrade> tag is present on the page
if (typeof document !== 'undefined') {
  const hasAutoUpgrade = Boolean(document.querySelector('script[data-upgrade]'));
  if (hasAutoUpgrade) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => upgradeVideoElements());
    } else {
      upgradeVideoElements();
    }
  }
}
