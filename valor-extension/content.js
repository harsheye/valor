// Valor Auto-Embed & Stream Sniffer Content Script v2.4

(function() {
  let valorEmbedUrl = 'builtin';
  let valorServerReachable = false;
  let embedMode = 'badge'; // 'auto' (Auto Replace) | 'badge' (Show Icon) | 'off' (Don't)
  let upgradeVideos = false;
  let activeTheme = 'valor-purple';
  let activeAccent = '';
  let replacedElements = new WeakSet();
  let currentUrl = window.location.href;

  const THEME_ACCENTS = {
    'valor-purple': '#a855f7',
    'cnx': '#eb8c34',
    'cloudflare-docs': '#2f81f7',
    'oled-black': '#f6821f',
    'github-midnight': '#1f6feb',
    'cyber-crimson': '#f43f5e',
    'emerald-studio': '#10b981',
    'midnight-slate': '#9db3f6',
  };

  function getEffectiveAccent() {
    if (activeAccent && /^#[0-9a-f]{3,8}$/i.test(activeAccent)) return activeAccent;
    return THEME_ACCENTS[activeTheme] || '#a855f7';
  }

  function normalizeEmbedUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return 'builtin';
    let str = rawUrl.trim();
    if (!str || str.toLowerCase() === 'builtin' || str === 'http://localhost:5173/embed') return 'builtin';
    if (str.startsWith('chrome-extension://')) return str;

    if (/^:?\d+$/.test(str)) {
      const port = str.replace(':', '');
      if (port === '443') return 'https://localhost/embed';
      if (port === '80') return 'http://localhost/embed';
      return `http://localhost:${port}/embed`;
    }

    if (!/^https?:\/\//i.test(str)) {
      const isLocal = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0)(:\d+)?/i.test(str);
      str = (isLocal ? 'http://' : 'https://') + str;
    }

    try {
      const parsed = new URL(str);
      if (!parsed.pathname || parsed.pathname === '/') {
        parsed.pathname = '/embed';
      }
      // Upgrade remote HTTP to HTTPS when on HTTPS host to prevent Mixed Content
      if (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:') {
        const isLocalHost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '0.0.0.0';
        if (!isLocalHost && parsed.protocol === 'http:') {
          parsed.protocol = 'https:';
        }
      }
      return parsed.toString();
    } catch (e) {
      return 'http://localhost:5173/embed';
    }
  }

  function isValorHostPage() {
    const curHost = window.location.hostname.toLowerCase();
    if (curHost === 'localhost' || curHost === '127.0.0.1' || window.location.protocol === 'chrome-extension:') {
      return true;
    }
    try {
      const currentConfigUrl = normalizeEmbedUrl(valorEmbedUrl);
      const parsed = new URL(currentConfigUrl);
      if (parsed.hostname && parsed.hostname.toLowerCase() === curHost) {
        return true;
      }
    } catch (e) {}
    return false;
  }

  if (isValorHostPage()) {
    return;
  }

  // Detect active external Valor server or use bundled extension app
  async function detectValorPortIfLocal() {
    if (!valorEmbedUrl || valorEmbedUrl === 'builtin' || valorEmbedUrl.startsWith('chrome-extension://')) {
      valorServerReachable = false;
      return;
    }
    try {
      const res = await fetch(normalizeEmbedUrl(valorEmbedUrl), { method: 'HEAD' }).catch(() => null);
      valorServerReachable = Boolean(res && res.ok);
    } catch {
      valorServerReachable = false;
    }
  }

  function buildTargetEmbedUrl(params) {
    try {
      const useBundled = !valorServerReachable && typeof chrome !== 'undefined' && chrome.runtime?.getURL;
      const base = useBundled
        ? chrome.runtime.getURL('app/index.html')
        : normalizeEmbedUrl(valorEmbedUrl);
      const url = new URL(base);
      if (useBundled) {
        url.searchParams.set('embed', '1');
      }
      if (activeTheme) {
        url.searchParams.set('theme', activeTheme);
      }
      const effAccent = getEffectiveAccent();
      if (effAccent) {
        url.searchParams.set('accent', effAccent);
      }
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
      return url.toString();
    } catch (e) {
      console.error('[Valor Extension] Failed to construct embed URL:', e);
      return null;
    }
  }

  function formatDuration(secs) {
    const s = Math.floor(secs);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) {
      return `${h}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  // Heuristic Media Filter: Only target legitimate, visible, playable <video> tags
  function isLegitimateMediaTarget(videoEl) {
    if (!videoEl || !(videoEl instanceof HTMLVideoElement)) return false;
    if (!document.contains(videoEl)) return false;
    if (replacedElements.has(videoEl) || videoEl.dataset.valorReplaced === 'true') return false;
    if (videoEl.closest('[data-valor-container], [data-valor-replaced]')) return false;

    // 1. Filter out advertisements
    const adSelectors = [
      '.ad-container', '.video-ads', '.ytp-ad-module', '.preroll',
      '[id*="google_ads"]', '[class*="advert"]', '[class*="sponsor"]',
      '[data-ad]', '[class*="ad-box"]', '.ima-ad-container'
    ];
    for (const sel of adSelectors) {
      if (videoEl.closest(sel)) return false;
    }

    // 2. Must have a direct, playable, non-blob source so Valor can actually take over playback
    const src = extractVideoSource(videoEl);
    if (!src || src.startsWith('blob:') || src.startsWith('mediasource:')) {
      return false;
    }

    // 3. Standalone media document (direct video in browser tab)
    const isStandalone = document.body && 
      document.body.children.length <= 3 && 
      document.querySelector('video') === videoEl;
    if (isStandalone) return true;

    // 4. Visibility & Size check: must be visibly rendered as a real video player
    const style = window.getComputedStyle(videoEl);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) {
      return false;
    }
    const rect = videoEl.getBoundingClientRect();
    if (rect.width < 160 || rect.height < 90) {
      return false;
    }

    // 5. Filter out background decorative / ambient looping videos without audio
    const isLoopingSilentHero = videoEl.loop && videoEl.muted && videoEl.autoplay && !videoEl.controls;
    const isHeroBackground = videoEl.closest('.hero, .banner, .background, [class*="bg-video"], [class*="ambient"], [class*="decorative"]');
    if (isLoopingSilentHero && (isHeroBackground || (videoEl.duration > 0 && videoEl.duration < 20))) {
      return false;
    }

    // 6. Filter out tiny audio-only sound effects
    if (videoEl.duration > 0 && videoEl.duration < 4) {
      return false;
    }

    return true;
  }

  function extractVideoSource(videoElement) {
    let src = videoElement.currentSrc || videoElement.getAttribute('src') || videoElement.src;
    
    // Check child <source> elements
    if (!src || src.startsWith('blob:')) {
      const sourceElem = videoElement.querySelector('source[src]');
      if (sourceElem) {
        src = sourceElem.getAttribute('src') || sourceElem.src;
      }
    }

    // Check data attributes on video element
    if (!src || src.startsWith('blob:')) {
      const dataKeys = ['src', 'url', 'video', 'videoUrl', 'stream', 'hls', 'mp4', 'file', 'manifest'];
      for (const k of dataKeys) {
        if (videoElement.dataset && videoElement.dataset[k]) {
          src = videoElement.dataset[k];
          break;
        }
        const attr = videoElement.getAttribute(`data-${k}`);
        if (attr) {
          src = attr;
          break;
        }
      }
    }

    // Check player container wrapper for stream data attributes
    if (!src || src.startsWith('blob:')) {
      const container = videoElement.closest('[data-url], [data-video], [data-src], [data-file], [data-stream], [data-hls]');
      if (container) {
        src = container.getAttribute('data-url') ||
              container.getAttribute('data-video') ||
              container.getAttribute('data-src') ||
              container.getAttribute('data-file') ||
              container.getAttribute('data-stream') ||
              container.getAttribute('data-hls');
      }
    }

    // Check performance resource timing entries for recent stream playlists / media chunks
    if (!src || src.startsWith('blob:')) {
      try {
        const entries = performance.getEntriesByType('resource');
        for (let i = entries.length - 1; i >= 0; i--) {
          const entryUrl = entries[i].name;
          if (entryUrl && (
            /\.(m3u8|mpd|mp4|webm|m4v)(\?.*)?$/i.test(entryUrl) ||
            /(\/hls\/|\/manifest|\/playlist\.m3u8|\/master\.m3u8)/i.test(entryUrl)
          )) {
            if (!entryUrl.includes('google-analytics') && !entryUrl.includes('doubleclick') && !entryUrl.includes('beacon')) {
              src = entryUrl;
              break;
            }
          }
        }
      } catch (e) {}
    }

    // Direct standalone video link
    if (!src || src.startsWith('blob:')) {
      if (window.location.href.match(/\.(mkv|mp4|webm|avi|mov|m3u8|mpd|flv|ts|m4v)(\?.*)?$/i)) {
        src = window.location.href;
      }
    }

    return src;
  }

  function getPlayerRootContainer(videoElement) {
    const playerSelectors = [
      '.plyr',
      '.video-js',
      '.jwplayer',
      '.vjs-tech',
      '[class*="player-wrapper"]',
      '[class*="player-container"]',
      '[class*="video-player"]',
      '[class*="video-container"]',
      '[class*="player-box"]',
      '[id*="player"]'
    ];

    for (const sel of playerSelectors) {
      const container = videoElement.closest(sel);
      if (container && container !== document.body && container !== document.documentElement) {
        return container;
      }
    }

    return videoElement.parentElement || videoElement;
  }

  function getCleanMediaTitle() {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content');
    if (ogTitle && ogTitle.trim()) return ogTitle.trim();

    const h1 = document.querySelector('h1')?.innerText;
    if (h1 && h1.trim() && h1.length > 2 && h1.length < 90) return h1.trim();

    if (document.title && document.title.trim()) {
      return document.title.replace(/ - (YouTube|Netflix|Vimeo|Twitch|Twitter|X|Reddit).*$/i, '').trim();
    }

    return 'Online Video Stream';
  }

  function attachVideoProxy(videoElement, iframe) {
    const state = {
      currentTime: Number(videoElement.currentTime) || 0,
      duration: Number(videoElement.duration) || 0,
      paused: videoElement.paused,
      volume: typeof videoElement.volume === 'number' ? videoElement.volume : 1,
      muted: Boolean(videoElement.muted),
      playbackRate: Number(videoElement.playbackRate) || 1
    };

    const sendCommand = (type, payload) => {
      try {
        iframe.contentWindow?.postMessage({
          source: 'valor-embed-host',
          version: '1.0.0',
          payload: payload ? { type, payload } : { type }
        }, '*');
      } catch {}
    };

    const props = ['currentTime', 'duration', 'paused', 'volume', 'muted', 'playbackRate'];
    const savedDescriptors = {};
    for (const prop of props) {
      savedDescriptors[prop] = Object.getOwnPropertyDescriptor(videoElement, prop);
    }
    const savedPlay = Object.getOwnPropertyDescriptor(videoElement, 'play');
    const savedPause = Object.getOwnPropertyDescriptor(videoElement, 'pause');

    Object.defineProperties(videoElement, {
      play: {
        configurable: true,
        value: () => {
          state.paused = false;
          sendCommand('PLAY');
          return Promise.resolve();
        }
      },
      pause: {
        configurable: true,
        value: () => {
          state.paused = true;
          sendCommand('PAUSE');
        }
      },
      currentTime: {
        configurable: true,
        get: () => state.currentTime,
        set: (val) => {
          const n = Number(val);
          if (Number.isFinite(n)) {
            state.currentTime = n;
            sendCommand('SEEK', { time: n });
          }
        }
      },
      duration: {
        configurable: true,
        get: () => state.duration
      },
      paused: {
        configurable: true,
        get: () => state.paused
      },
      volume: {
        configurable: true,
        get: () => state.volume,
        set: (val) => {
          const n = Math.max(0, Math.min(1, Number(val)));
          if (Number.isFinite(n)) {
            state.volume = n;
            sendCommand('SET_VOLUME', { volume: n });
          }
        }
      },
      muted: {
        configurable: true,
        get: () => state.muted,
        set: (val) => {
          state.muted = Boolean(val);
          sendCommand('SET_MUTED', { muted: state.muted });
        }
      },
      playbackRate: {
        configurable: true,
        get: () => state.playbackRate,
        set: (val) => {
          const n = Number(val);
          if (Number.isFinite(n) && n > 0) {
            state.playbackRate = n;
            sendCommand('SET_PLAYBACK_RATE', { rate: n });
          }
        }
      }
    });

    const syncFromIframe = (msgPayload) => {
      if (!msgPayload || !msgPayload.type) return;
      const p = msgPayload.payload || {};
      if (typeof p.currentTime === 'number') state.currentTime = p.currentTime;
      if (typeof p.duration === 'number') state.duration = p.duration;
      if (typeof p.paused === 'boolean') state.paused = p.paused;
      if (typeof p.volume === 'number') state.volume = p.volume;
      if (typeof p.muted === 'boolean') state.muted = p.muted;
      if (typeof p.playbackRate === 'number') state.playbackRate = p.playbackRate;

      const eventMap = {
        TIME_UPDATE: ['timeupdate'],
        PLAY: ['play', 'playing'],
        PAUSE: ['pause'],
        ENDED: ['ended'],
        SEEKED: ['seeked'],
        VOLUME_CHANGE: ['volumechange'],
        RATE_CHANGE: ['ratechange']
      };
      const events = eventMap[msgPayload.type];
      if (events) {
        for (const evName of events) {
          videoElement.dispatchEvent(new Event(evName, { bubbles: false }));
        }
      }
    };

    const detach = () => {
      for (const prop of props) {
        if (savedDescriptors[prop]) Object.defineProperty(videoElement, prop, savedDescriptors[prop]);
        else delete videoElement[prop];
      }
      if (savedPlay) Object.defineProperty(videoElement, 'play', savedPlay);
      else delete videoElement.play;
      if (savedPause) Object.defineProperty(videoElement, 'pause', savedPause);
      else delete videoElement.pause;
    };

    return { syncFromIframe, detach };
  }

  // Replace legitimate video with Valor player iframe (with Restore option & live proxy)
  function replaceVideoWithValor(videoElement) {
    if (!isLegitimateMediaTarget(videoElement)) return;

    const src = extractVideoSource(videoElement);
    if (!src || src.startsWith('blob:')) return;

    replacedElements.add(videoElement);
    videoElement.dataset.valorReplaced = 'true';

    // Capture playback state so resume is seamless
    const currentPosition = Math.max(0, Math.floor(videoElement.currentTime || 0));

    try {
      videoElement.pause();
      videoElement.muted = true;
    } catch (e) {}

    const targetContainer = getPlayerRootContainer(videoElement);
    replacedElements.add(targetContainer);
    targetContainer.dataset.valorReplaced = 'true';
    targetContainer.dataset.valorContainer = 'true';

    const title = getCleanMediaTitle();
    const targetUrl = buildTargetEmbedUrl({
      url: src,
      title: title,
      time: currentPosition > 0 ? currentPosition : undefined
    });
    if (!targetUrl) return;

    // Stash original child elements in a hidden container so videoElement remains a live DOM proxy
    const originalChildren = Array.from(targetContainer.childNodes);
    const originalStash = document.createElement('div');
    originalStash.className = 'valor-original-stash';
    originalStash.style.cssText = 'display: none !important; position: absolute !important; width: 0 !important; height: 0 !important; overflow: hidden !important; pointer-events: none !important;';
    originalStash.setAttribute('aria-hidden', 'true');
    originalChildren.forEach(child => originalStash.appendChild(child));

    const activeWrapper = document.createElement('div');
    activeWrapper.className = 'valor-active-wrapper';
    activeWrapper.style.position = 'relative';
    activeWrapper.style.width = '100%';
    activeWrapper.style.height = '100%';
    activeWrapper.style.minHeight = Math.max(targetContainer.clientHeight || videoElement.clientHeight || 0, 360) + 'px';

    const iframe = document.createElement('iframe');
    const extensionEmbedUrl = chrome.runtime.getURL('embed.html') + '?target=' + encodeURIComponent(targetUrl);
    iframe.src = extensionEmbedUrl;
    iframe.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    iframe.style.display = 'block';
    iframe.style.position = 'absolute';
    iframe.style.inset = '0';
    iframe.style.zIndex = '999';

    const proxy = attachVideoProxy(videoElement, iframe);

    // Restore Original Player Functionality
    const restoreOriginal = () => {
      window.removeEventListener('message', handleWindowMessage);
      proxy.detach();
      activeWrapper.remove();
      originalStash.remove();
      delete targetContainer.dataset.valorReplaced;
      delete targetContainer.dataset.valorContainer;
      delete videoElement.dataset.valorReplaced;
      delete videoElement.dataset.valorPillAttached;
      replacedElements.delete(videoElement);
      replacedElements.delete(targetContainer);

      originalChildren.forEach(child => targetContainer.appendChild(child));

      // Re-attach hover toggle
      setTimeout(() => attachHoverPill(videoElement), 300);
    };

    // Listen for back button / close / playback events from the embedded player iframe
    const handleWindowMessage = (event) => {
      if (!event.data) return;
      if (
        (event.data.source === 'valor-embed-iframe' && (event.data.payload?.type === 'CLOSE' || event.data.type === 'RESTORE_ORIGINAL')) ||
        (event.data.type === 'CLOSE' || event.data.type === 'RESTORE_ORIGINAL')
      ) {
        restoreOriginal();
        return;
      }
      if (event.data.source === 'valor-embed-iframe' && event.data.payload) {
        proxy.syncFromIframe(event.data.payload);
      }
    };
    window.addEventListener('message', handleWindowMessage);

    activeWrapper.appendChild(iframe);

    // Standalone direct media tab
    if (document.body && document.body.children.length <= 3 && document.querySelector('video') === videoElement) {
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.overflow = 'hidden';
      document.body.style.background = '#000';
      activeWrapper.style.position = 'fixed';
      activeWrapper.style.inset = '0';
      activeWrapper.style.width = '100vw';
      activeWrapper.style.height = '100vh';
      activeWrapper.style.zIndex = '999999';
      document.body.appendChild(originalStash);
      document.body.appendChild(activeWrapper);
    } else {
      targetContainer.appendChild(originalStash);
      targetContainer.appendChild(activeWrapper);
    }
  }

  // Floating "Play in Valor" In-Page Button (Show Icon Mode)
  function attachHoverPill(videoElement) {
    if (!isLegitimateMediaTarget(videoElement)) return;
    if (videoElement.dataset.valorPillAttached === 'true') return;
    videoElement.dataset.valorPillAttached = 'true';

    const container = getPlayerRootContainer(videoElement);
    if (!container || container.querySelector('.valor-pill-host')) return;

    // Ensure relative positioning on the container
    const compPos = window.getComputedStyle(container).position;
    if (compPos === 'static') {
      container.style.position = 'relative';
    }

    // Host element with Shadow DOM for complete CSS isolation from host page
    const host = document.createElement('div');
    host.className = 'valor-pill-host';
    host.style.cssText = 'all: initial !important; position: absolute !important; top: 12px !important; left: 12px !important; z-index: 2147483647 !important; display: block !important;';

    const accentColor = getEffectiveAccent();
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        :host {
          all: initial;
          display: block;
        }
        .valor-btn {
          all: initial;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 10px;
          background: rgba(15, 16, 19, 0.85);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 8px;
          color: #f2f2f5;
          font-family: Inter, -apple-system, "Segoe UI", sans-serif;
          font-size: 12px;
          font-weight: 500;
          line-height: 1;
          cursor: pointer;
          opacity: 0;
          pointer-events: none;
          transition: opacity 150ms ease, background-color 150ms ease, border-color 150ms ease;
          user-select: none;
        }
        .valor-btn:hover {
          background: rgba(23, 24, 28, 0.95);
          border-color: ${accentColor};
        }
        .valor-btn:focus-visible {
          outline: 2px solid ${accentColor};
          outline-offset: 2px;
        }
        .valor-btn.visible,
        .valor-btn:focus-visible {
          opacity: 1;
          pointer-events: auto;
        }
        .play-icon {
          width: 11px;
          height: 11px;
          fill: ${accentColor};
          flex-shrink: 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .valor-btn {
            transition: none !important;
          }
        }
      </style>
      <button type="button" class="valor-btn" aria-label="Play in Valor">
        <svg class="play-icon" viewBox="0 0 24 24" aria-hidden="true">
          <polygon points="6 4 20 12 6 20 6 4" />
        </svg>
        <span>Play in Valor</span>
      </button>
    `;

    const btn = shadow.querySelector('.valor-btn');

    let hideTimer = null;
    const showPill = () => {
      if (hideTimer) clearTimeout(hideTimer);
      btn.classList.add('visible');
    };

    const scheduleHide = () => {
      hideTimer = setTimeout(() => {
        if (shadow.activeElement !== btn) {
          btn.classList.remove('visible');
        }
      }, 250);
    };

    container.addEventListener('mouseenter', showPill);
    container.addEventListener('mousemove', showPill);
    container.addEventListener('mouseleave', scheduleHide);
    videoElement.addEventListener('mouseenter', showPill);
    videoElement.addEventListener('mousemove', showPill);
    btn.addEventListener('focus', showPill);
    btn.addEventListener('blur', scheduleHide);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      host.remove();
      replaceVideoWithValor(videoElement);
    });

    container.appendChild(host);
  }

  function clearAllInjected() {
    document.querySelectorAll('.valor-pill-host, .valor-hover-pill-btn').forEach(el => el.remove());
    document.querySelectorAll('video[data-valor-pill-attached]').forEach(v => {
      delete v.dataset.valorPillAttached;
    });
  }

  // Inject styles for wrapper
  function injectPillStyles() {
    if (document.getElementById('valor-extension-styles')) return;
    const style = document.createElement('style');
    style.id = 'valor-extension-styles';
    style.textContent = `
      .valor-active-wrapper {
        box-sizing: border-box;
        overflow: hidden;
        background: #000;
        border-radius: inherit;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function scanMedia() {
    if (embedMode === 'off' || isValorHostPage()) {
      clearAllInjected();
      return;
    }
    injectPillStyles();

    const videos = Array.from(document.querySelectorAll('video'));
    for (const v of videos) {
      if (embedMode === 'auto') {
        replaceVideoWithValor(v);
      } else if (embedMode === 'badge') {
        attachHoverPill(v);
      }
    }
  }

  // Sniffer API for Extension Popup (only actual playable <video> tags)
  function getDetectedMediaStreams() {
    const streams = [];
    const seenUrls = new Set();

    const videos = Array.from(document.querySelectorAll('video'));
    videos.forEach((v, idx) => {
      if (!isLegitimateMediaTarget(v)) return;
      const src = extractVideoSource(v);
      if (src && !src.startsWith('blob:') && !src.startsWith('mediasource:') && !seenUrls.has(src)) {
        seenUrls.add(src);
        const rect = v.getBoundingClientRect();
        streams.push({
          id: `vid-${idx}`,
          title: getCleanMediaTitle() || `Stream #${idx + 1}`,
          url: src,
          duration: v.duration && isFinite(v.duration) ? Math.round(v.duration) : undefined,
          currentTime: Math.floor(v.currentTime || 0),
          width: Math.round(rect.width || v.videoWidth || 0),
          height: Math.round(rect.height || v.videoHeight || 0),
          isReplaced: v.dataset.valorReplaced === 'true'
        });
      }
    });

    return streams;
  }

  // Runtime message handler for popup requests
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.type === 'GET_PAGE_MEDIA') {
        sendResponse({
          success: true,
          pageTitle: document.title,
          url: window.location.href,
          streams: getDetectedMediaStreams(),
          embedMode
        });
        return true;
      }

      if (request.type === 'TRIGGER_EMBED_STREAM') {
        const streamUrl = request.url;
        const targetVideo = Array.from(document.querySelectorAll('video')).find(v => extractVideoSource(v) === streamUrl);
        if (targetVideo) {
          replaceVideoWithValor(targetVideo);
          sendResponse({ success: true });
        } else {
          const embedUrl = buildTargetEmbedUrl({ url: streamUrl, title: request.title || getCleanMediaTitle() });
          if (embedUrl) {
            window.location.href = embedUrl;
            sendResponse({ success: true });
          }
        }
        return true;
      }

      if (request.type === 'RESCAN') {
        scanMedia();
        sendResponse({ success: true, streams: getDetectedMediaStreams() });
        return true;
      }
    });
  }

  // Initialize extension storage and listeners
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['valorUrl', 'extensionEnabled', 'embedMode', 'upgradeVideos', 'theme', 'accentColor'], async (result) => {
      if (result) {
        if (result.theme) activeTheme = result.theme;
        if (result.accentColor !== undefined) activeAccent = result.accentColor || '';
        if (result.valorUrl) {
          valorEmbedUrl = normalizeEmbedUrl(result.valorUrl);
        }
        await detectValorPortIfLocal();
        upgradeVideos = result.upgradeVideos === true;
        if (upgradeVideos) {
          embedMode = 'auto';
        } else if (result.embedMode) {
          embedMode = result.embedMode;
        } else if (result.extensionEnabled !== undefined) {
          embedMode = result.extensionEnabled ? 'badge' : 'off';
        }
      } else {
        await detectValorPortIfLocal();
      }

      if (isValorHostPage()) return;
      initWatcher();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync') {
        if (changes.theme) {
          activeTheme = changes.theme.newValue || 'valor-purple';
        }
        if (changes.accentColor) {
          activeAccent = changes.accentColor.newValue || '';
        }
        if (changes.theme || changes.accentColor) {
          clearAllInjected();
        }
        if (changes.valorUrl) {
          valorEmbedUrl = normalizeEmbedUrl(changes.valorUrl.newValue);
          detectValorPortIfLocal();
        }
        if (changes.upgradeVideos) {
          upgradeVideos = changes.upgradeVideos.newValue === true;
          if (upgradeVideos) embedMode = 'auto';
        }
        if (changes.embedMode) {
          embedMode = changes.embedMode.newValue;
        }
        if (changes.extensionEnabled && !changes.embedMode) {
          embedMode = changes.extensionEnabled.newValue ? 'badge' : 'off';
        }
        if (embedMode === 'off' && !upgradeVideos) {
          clearAllInjected();
        } else if (!isValorHostPage()) {
          scanMedia();
        }
      }
    });
  } else {
    detectValorPortIfLocal().then(() => {
      if (!isValorHostPage()) initWatcher();
    });
  }

  function initWatcher() {
    scanMedia();

    // Catch dynamically loaded videos as soon as they play or load metadata
    const handleMediaEvent = (e) => {
      if (e.target && e.target instanceof HTMLVideoElement) {
        if (embedMode === 'off' || isValorHostPage()) return;
        setTimeout(() => {
          if (embedMode === 'auto') {
            replaceVideoWithValor(e.target);
          } else if (embedMode === 'badge') {
            attachHoverPill(e.target);
          }
        }, 150);
      }
    };

    document.addEventListener('play', handleMediaEvent, true);
    document.addEventListener('loadedmetadata', handleMediaEvent, true);
    document.addEventListener('canplay', handleMediaEvent, true);
    document.addEventListener('loadstart', handleMediaEvent, true);

    // Debounced Mutation Observer for DOM insertions
    let debounceTimer = null;
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        scanMedia();
      }, 400);
    });

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    // SPA navigation watcher
    const handleNav = () => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        setTimeout(scanMedia, 600);
      }
    };
    window.addEventListener('popstate', handleNav);
    setInterval(handleNav, 1200);
  }
})();
