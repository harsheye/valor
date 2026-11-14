// Valor Auto-Embed & Stream Sniffer Content Script v2.4

(function() {
  let valorEmbedUrl = 'http://localhost:5173/embed';
  let embedMode = 'badge'; // Default: 'badge' (Hover Toggle) | 'auto' | 'off'
  let replacedElements = new WeakSet();
  let currentUrl = window.location.href;

  function normalizeEmbedUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return 'http://localhost:5173/embed';
    let str = rawUrl.trim();
    if (!str) return 'http://localhost:5173/embed';

    if (/^:?\d+$/.test(str)) {
      const port = str.replace(':', '');
      if (port === '443') return 'https://localhost/embed';
      if (port === '80') return 'http://localhost/embed';
      return `http://localhost:${port}/embed`;
    }

    if (!/^https?:\/\//i.test(str)) {
      str = 'http://' + str;
    }

    try {
      const parsed = new URL(str);
      if (!parsed.pathname || parsed.pathname === '/') {
        parsed.pathname = '/embed';
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

  // Detect active local Valor port
  async function detectValorPortIfLocal() {
    const isLocal = valorEmbedUrl.includes('localhost') || valorEmbedUrl.includes('127.0.0.1');
    if (!isLocal) return;

    const ports = ['5173', '50000', '443', '80'];
    for (const port of ports) {
      const proto = port === '443' ? 'https' : 'http';
      const testUrl = `${proto}://localhost:${port}/embed`;
      try {
        const res = await fetch(testUrl, { method: 'HEAD' }).catch(() => null);
        if (res && res.ok) {
          valorEmbedUrl = testUrl;
          return;
        }
      } catch {}
    }
  }

  function buildTargetEmbedUrl(params) {
    try {
      const base = normalizeEmbedUrl(valorEmbedUrl);
      const url = new URL(base);
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

  // Heuristic Media Filter: Only target legitimate, interactive media
  function isLegitimateMediaTarget(videoEl) {
    if (!videoEl || !(videoEl instanceof HTMLVideoElement)) return false;
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

    // 2. Standalone media document (direct video in browser tab)
    const isStandalone = document.body && 
      document.body.children.length <= 3 && 
      document.querySelector('video') === videoEl;
    if (isStandalone) return true;

    // 3. Filter out zero-size or tiny tracking / thumbnail elements
    const rect = videoEl.getBoundingClientRect();
    if (rect.width < 240 || rect.height < 130) {
      return false;
    }

    // 4. Filter out background decorative / ambient looping videos without audio
    const isLoopingSilentHero = videoEl.loop && videoEl.muted && videoEl.autoplay && !videoEl.controls;
    const isHeroBackground = videoEl.closest('.hero, .banner, .background, [class*="bg-video"], [class*="ambient"], [class*="decorative"]');
    if (isLoopingSilentHero && (isHeroBackground || (videoEl.duration > 0 && videoEl.duration < 20))) {
      return false;
    }

    // 5. Filter out tiny audio-only sound effects
    if (videoEl.duration > 0 && videoEl.duration < 4) {
      return false;
    }

    return true;
  }

  function extractVideoSource(videoElement) {
    let src = videoElement.currentSrc || videoElement.getAttribute('src') || videoElement.src;
    
    if (!src || src.startsWith('blob:')) {
      const sourceElem = videoElement.querySelector('source[src]');
      if (sourceElem) {
        src = sourceElem.getAttribute('src') || sourceElem.src;
      }
    }

    if (!src || src.startsWith('blob:')) {
      if (videoElement.dataset && videoElement.dataset.src) {
        src = videoElement.dataset.src;
      } else if (videoElement.getAttribute('data-src')) {
        src = videoElement.getAttribute('data-src');
      }
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

  // Replace legitimate video with Valor player iframe (with Restore option)
  function replaceVideoWithValor(videoElement) {
    if (!isLegitimateMediaTarget(videoElement)) return;

    const src = extractVideoSource(videoElement);
    if (!src || src.startsWith('blob:')) return;

    replacedElements.add(videoElement);
    videoElement.dataset.valorReplaced = 'true';

    // Capture playback state so resume is 100% seamless
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

    // Stash original child elements so user can click "Restore Original" anytime
    const originalChildren = Array.from(targetContainer.childNodes);

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

    // Restore Original Player Button (Non-intrusive floating control)
    const restoreBtn = document.createElement('button');
    restoreBtn.className = 'valor-restore-btn';
    restoreBtn.type = 'button';
    restoreBtn.title = 'Switch back to original website player';
    restoreBtn.innerHTML = `
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      <span>Restore Original Player</span>
    `;

    restoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      activeWrapper.remove();
      delete targetContainer.dataset.valorReplaced;
      delete targetContainer.dataset.valorContainer;
      delete videoElement.dataset.valorReplaced;
      delete videoElement.dataset.valorPillAttached;
      replacedElements.delete(videoElement);
      replacedElements.delete(targetContainer);

      targetContainer.innerHTML = '';
      originalChildren.forEach(child => targetContainer.appendChild(child));

      // Re-attach hover toggle
      setTimeout(() => attachHoverPill(videoElement), 300);
    });

    activeWrapper.appendChild(iframe);
    activeWrapper.appendChild(restoreBtn);

    // Standalone direct media tab
    if (document.body && document.body.children.length <= 3 && document.querySelector('video') === videoElement) {
      document.body.innerHTML = '';
      document.body.style.margin = '0';
      document.body.style.padding = '0';
      document.body.style.overflow = 'hidden';
      document.body.style.background = '#000';
      activeWrapper.style.position = 'fixed';
      activeWrapper.style.inset = '0';
      activeWrapper.style.width = '100vw';
      activeWrapper.style.height = '100vh';
      activeWrapper.style.zIndex = '999999';
      document.body.appendChild(activeWrapper);
    } else {
      targetContainer.innerHTML = '';
      targetContainer.appendChild(activeWrapper);
    }
  }

  // Floating "Play in Valor" Hover Toggle Pill
  function attachHoverPill(videoElement) {
    if (!isLegitimateMediaTarget(videoElement)) return;
    if (videoElement.dataset.valorPillAttached === 'true') return;
    videoElement.dataset.valorPillAttached = 'true';

    const container = getPlayerRootContainer(videoElement);
    if (!container || container.querySelector('.valor-hover-pill-btn')) return;

    // Ensure relative positioning
    const compPos = window.getComputedStyle(container).position;
    if (compPos === 'static') {
      container.style.position = 'relative';
    }

    const pill = document.createElement('button');
    pill.className = 'valor-hover-pill-btn';
    pill.type = 'button';
    pill.innerHTML = `
      <span class="valor-pill-pulse"></span>
      <svg class="valor-pill-icon" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      <span class="valor-pill-label">Play in Valor</span>
    `;

    const labelSpan = pill.querySelector('.valor-pill-label');

    let hideTimer = null;
    const showPill = () => {
      if (hideTimer) clearTimeout(hideTimer);
      pill.classList.add('valor-visible');
      if (videoElement.currentTime > 2) {
        labelSpan.textContent = `Play in Valor (${formatDuration(videoElement.currentTime)})`;
      } else {
        labelSpan.textContent = 'Play in Valor';
      }
    };

    const scheduleHide = () => {
      hideTimer = setTimeout(() => {
        pill.classList.remove('valor-visible');
      }, 1500);
    };

    container.addEventListener('mouseenter', showPill);
    container.addEventListener('mousemove', showPill);
    container.addEventListener('mouseleave', scheduleHide);
    videoElement.addEventListener('mouseenter', showPill);
    videoElement.addEventListener('mousemove', showPill);

    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      pill.remove();
      replaceVideoWithValor(videoElement);
    });

    container.appendChild(pill);
  }

  // Inject sleek floating badge and restore styles
  function injectPillStyles() {
    if (document.getElementById('valor-extension-styles')) return;
    const style = document.createElement('style');
    style.id = 'valor-extension-styles';
    style.textContent = `
      .valor-hover-pill-btn {
        position: absolute;
        top: 14px;
        right: 14px;
        z-index: 2147483647;
        display: inline-flex;
        align-items: center;
        gap: 7px;
        padding: 7px 15px;
        background: rgba(11, 14, 20, 0.92);
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
        font-size: 11.5px;
        font-weight: 700;
        letter-spacing: 0.03em;
        border: 1px solid rgba(229, 9, 20, 0.5);
        border-radius: 999px;
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.65), 0 0 14px rgba(229, 9, 20, 0.35);
        cursor: pointer;
        opacity: 0;
        transform: translateY(-6px) scale(0.95);
        transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s, box-shadow 0.2s, border-color 0.2s;
        pointer-events: none;
      }
      .valor-hover-pill-btn.valor-visible,
      *:hover > .valor-hover-pill-btn,
      .valor-hover-pill-btn:hover {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }
      .valor-hover-pill-btn:hover {
        background: #e50914;
        border-color: #ff3e3e;
        box-shadow: 0 12px 36px rgba(229, 9, 20, 0.6), 0 0 20px rgba(229, 9, 20, 0.5);
        transform: translateY(-1px) scale(1.03);
      }
      .valor-pill-pulse {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #e50914;
        box-shadow: 0 0 8px #ff3e3e;
        animation: valor-pulse 1.8s infinite;
      }
      .valor-hover-pill-btn:hover .valor-pill-pulse {
        background: #fff;
        box-shadow: 0 0 8px #fff;
      }
      @keyframes valor-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.85); }
      }
      .valor-restore-btn {
        position: absolute;
        top: 10px;
        left: 10px;
        z-index: 2147483647;
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 5px 11px;
        background: rgba(14, 18, 26, 0.88);
        color: #cbd5e1;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 11px;
        font-weight: 600;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 6px;
        backdrop-filter: blur(14px);
        -webkit-backdrop-filter: blur(14px);
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.2s ease, background 0.2s, color 0.2s;
      }
      .valor-active-wrapper:hover .valor-restore-btn {
        opacity: 0.85;
      }
      .valor-restore-btn:hover {
        opacity: 1 !important;
        background: rgba(229, 9, 20, 0.9);
        color: #fff;
        border-color: rgba(229, 9, 20, 0.6);
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  function scanMedia() {
    if (embedMode === 'off' || isValorHostPage()) return;
    injectPillStyles();

    const videos = Array.from(document.querySelectorAll('video'));
    for (const v of videos) {
      if (embedMode === 'auto') {
        replaceVideoWithValor(v);
      } else if (embedMode === 'badge') {
        // Preferred default: Attach sleek hover toggle pill
        attachHoverPill(v);
      }
    }
  }

  // Sniffer API for Extension Popup
  function getDetectedMediaStreams() {
    const streams = [];
    const videos = Array.from(document.querySelectorAll('video'));

    videos.forEach((v, idx) => {
      const src = extractVideoSource(v);
      if (src && !src.startsWith('blob:')) {
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
    chrome.storage.sync.get(['valorUrl', 'extensionEnabled', 'embedMode'], async (result) => {
      if (result) {
        if (result.valorUrl) {
          valorEmbedUrl = normalizeEmbedUrl(result.valorUrl);
        } else {
          await detectValorPortIfLocal();
        }
        if (result.embedMode) {
          embedMode = result.embedMode;
        } else if (result.extensionEnabled !== undefined) {
          embedMode = result.extensionEnabled ? 'badge' : 'off';
        }
      } else {
        await detectValorPortIfLocal();
      }

      if (isValorHostPage()) return;
      if (embedMode !== 'off') {
        initWatcher();
      }
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync') {
        if (changes.valorUrl) valorEmbedUrl = normalizeEmbedUrl(changes.valorUrl.newValue);
        if (changes.embedMode) embedMode = changes.embedMode.newValue;
        if (changes.extensionEnabled && !changes.embedMode) {
          embedMode = changes.extensionEnabled.newValue ? 'badge' : 'off';
        }
        if (embedMode !== 'off' && !isValorHostPage()) {
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

    // Debounced Mutation Observer
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
