// Valor Auto-Embed Content Script

(function() {
  let valorEmbedUrl = 'https://localhost/embed';
  let extensionEnabled = true;
  let replacedContainers = new Set();
  let currentUrl = window.location.href;

  function normalizeEmbedUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return 'https://localhost/embed';
    let str = rawUrl.trim();
    if (!str) return 'https://localhost/embed';

    // If user typed only a port number, e.g. 443, :443, 5173
    if (/^:?\d+$/.test(str)) {
      const port = str.replace(':', '');
      if (port === '443') return 'https://localhost/embed';
      if (port === '80') return 'http://localhost/embed';
      return `http://localhost:${port}/embed`;
    }

    // Add protocol if missing (default to https)
    if (!/^https?:\/\//i.test(str)) {
      str = 'https://' + str;
    }

    try {
      const parsed = new URL(str);
      if (!parsed.pathname || parsed.pathname === '/') {
        parsed.pathname = '/embed';
      }
      return parsed.toString();
    } catch (e) {
      console.warn('[Valor Extension] Invalid URL provided, using fallback:', rawUrl, e);
      return 'https://localhost/embed';
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

  // Prevent running on Valor itself (prevents double UI / infinite loop)
  if (isValorHostPage()) {
    return;
  }

  // Auto-detect active local Valor port ONLY if valorEmbedUrl is configured as localhost
  async function detectValorPortIfLocal() {
    const isLocal = valorEmbedUrl.includes('localhost') || valorEmbedUrl.includes('127.0.0.1');
    if (!isLocal) return; // Do not attempt local port scan if user configured a remote player

    // Check backend heartbeat which reports active servicePort and protocol
    try {
      const res = await fetch('http://127.0.0.1:50001/api/heartbeat', { method: 'POST' }).catch(() => null);
      if (res && res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.servicePort) {
          const proto = data.protocol || (data.servicePort === 443 ? 'https' : 'http');
          const portPart = (data.servicePort === 443 || data.servicePort === 80) ? '' : `:${data.servicePort}`;
          valorEmbedUrl = `${proto}://localhost${portPart}/embed`;
          return;
        }
      }
    } catch {}

    // Check HTTPS on port 443
    try {
      const r443 = await fetch('https://localhost/embed', { method: 'HEAD' }).catch(() => null);
      if (r443 && r443.ok) {
        valorEmbedUrl = 'https://localhost/embed';
        return;
      }
    } catch {}

    // Check Vite dev port (5173)
    try {
      const r5173 = await fetch('http://localhost:5173/embed', { method: 'HEAD' }).catch(() => null);
      if (r5173 && r5173.ok) {
        valorEmbedUrl = 'http://localhost:5173/embed';
        return;
      }
    } catch {}

    // Check local service port (50000)
    try {
      const r50000 = await fetch('http://localhost:50000/embed', { method: 'HEAD' }).catch(() => null);
      if (r50000 && r50000.ok) {
        valorEmbedUrl = 'http://localhost:50000/embed';
        return;
      }
    } catch {}

    // Check standard HTTP port (80)
    try {
      const r80 = await fetch('http://localhost:80/embed', { method: 'HEAD' }).catch(() => null);
      if (r80 && r80.ok) {
        valorEmbedUrl = 'http://localhost/embed';
        return;
      }
    } catch {}
  }

  function buildTargetEmbedUrl(params) {
    try {
      const base = normalizeEmbedUrl(valorEmbedUrl);
      const url = new URL(base);
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, value);
        }
      }
      return url.toString();
    } catch (e) {
      console.error('[Valor Extension] Failed to construct embed URL:', e);
      return null;
    }
  }

  // Load initial configuration
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['valorUrl', 'extensionEnabled'], async (result) => {
      if (result) {
        if (result.valorUrl) {
          valorEmbedUrl = normalizeEmbedUrl(result.valorUrl);
        } else {
          await detectValorPortIfLocal();
        }
        if (result.extensionEnabled !== undefined) {
          extensionEnabled = result.extensionEnabled;
        }
      } else {
        await detectValorPortIfLocal();
      }

      if (isValorHostPage()) {
        return;
      }

      if (extensionEnabled) {
        initValorAutoEmbed();
      }
    });

    // Listen for setting changes in real-time
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync') {
        if (changes.valorUrl) {
          valorEmbedUrl = normalizeEmbedUrl(changes.valorUrl.newValue);
        }
        if (changes.extensionEnabled !== undefined) {
          extensionEnabled = changes.extensionEnabled.newValue;
          if (extensionEnabled && !isValorHostPage()) {
            initValorAutoEmbed();
          }
        }
      }
    });
  } else {
    detectValorPortIfLocal().then(() => {
      if (!isValorHostPage()) {
        initValorAutoEmbed();
      }
    });
  }

  function initValorAutoEmbed() {
    handlePage();
    observeDOM();
    observeNavigation();
  }

  // Watch for SPA URL changes
  function observeNavigation() {
    const checkUrlChange = () => {
      if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        replacedContainers.clear();
        setTimeout(handlePage, 500);
      }
    };

    window.addEventListener('popstate', checkUrlChange);
    const originalPushState = history.pushState;
    if (originalPushState) {
      history.pushState = function() {
        originalPushState.apply(this, arguments);
        checkUrlChange();
      };
    }
    const originalReplaceState = history.replaceState;
    if (originalReplaceState) {
      history.replaceState = function() {
        originalReplaceState.apply(this, arguments);
        checkUrlChange();
      };
    }
    setInterval(checkUrlChange, 1000);
  }

  function handlePage() {
    if (!extensionEnabled || isValorHostPage()) return;
    scanForVideos();
  }

  function scanForVideos() {
    const videos = document.querySelectorAll('video');
    videos.forEach(replaceVideoWithValor);
  }

  function observeDOM() {
    const observer = new MutationObserver(() => {
      handlePage();
    });

    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }

  function extractVideoSource(videoElement) {
    let src = videoElement.currentSrc || videoElement.getAttribute('src') || videoElement.src;
    
    if (!src || src.startsWith('blob:')) {
      const sourceElem = videoElement.querySelector('source');
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

    // Check if the current page itself is a direct video/media link
    if (!src || src.startsWith('blob:')) {
      if (window.location.href.match(/\.(mkv|mp4|webm|avi|mov|m3u8|flv|ts|m4v)(\?.*)?$/i)) {
        src = window.location.href;
      }
    }

    // Check for download buttons or direct links on file hosting sites
    if (!src || src.startsWith('blob:')) {
      const downloadBtn = document.querySelector('a[download], a.download-btn, a[href*=".mkv"], a[href*=".mp4"]');
      if (downloadBtn && downloadBtn.href) {
        src = downloadBtn.href;
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

  function replaceVideoWithValor(videoElement) {
    if (replacedContainers.has(videoElement)) return;
    if (videoElement.dataset.valorReplaced === 'true') return;

    const src = extractVideoSource(videoElement);
    if (!src || src.startsWith('blob:')) {
      return;
    }

    console.log('[Valor Extension] Found video to replace with Valor Player:', src);
    replacedContainers.add(videoElement);
    videoElement.dataset.valorReplaced = 'true';

    try {
      videoElement.pause();
      videoElement.muted = true;
    } catch (e) {}

    const targetContainer = getPlayerRootContainer(videoElement);
    replacedContainers.add(targetContainer);
    targetContainer.dataset.valorReplaced = 'true';

    const title = document.title || window.location.pathname.split('/').pop() || 'Embedded Video';
    const targetUrl = buildTargetEmbedUrl({ url: src, title: title });
    if (!targetUrl) return;

    const iframe = document.createElement('iframe');
    const extensionEmbedUrl = chrome.runtime.getURL('embed.html') + '?target=' + encodeURIComponent(targetUrl);
    iframe.src = extensionEmbedUrl;
    iframe.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture; clipboard-write';
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.minHeight = Math.max(targetContainer.clientHeight || videoElement.clientHeight || 0, 360) + 'px';
    iframe.style.border = 'none';
    iframe.style.display = 'block';
    iframe.style.position = 'relative';
    iframe.style.zIndex = '999';

    // Check if standalone browser video page
    if (document.body && document.body.children.length <= 2 && document.querySelector('video') === videoElement) {
      document.body.innerHTML = '';
      iframe.style.position = 'fixed';
      iframe.style.inset = '0';
      iframe.style.width = '100vw';
      iframe.style.height = '100vh';
      iframe.style.zIndex = '999999';
      document.body.appendChild(iframe);
    } else {
      // Replace the outer player container (e.g. Plyr / custom container)
      targetContainer.innerHTML = '';
      targetContainer.appendChild(iframe);
    }
  }
})();
