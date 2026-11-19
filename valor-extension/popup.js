document.addEventListener('DOMContentLoaded', () => {
  const connStatus = document.getElementById('connStatus');
  const addressStatusDot = document.getElementById('addressStatusDot');
  const valorUrlInput = document.getElementById('valorUrlInput');
  const modeSelector = document.getElementById('modeSelector');
  const mediaSnifferList = document.getElementById('mediaSnifferList');
  const btnRescan = document.getElementById('btnRescan');
  const rescanIcon = document.getElementById('rescanIcon');
  const btnSwitchResume = document.getElementById('btnSwitchResume');
  const chkResume = document.getElementById('chkResume');
  const btnSwitchCinema = document.getElementById('btnSwitchCinema');
  const chkCinema = document.getElementById('chkCinema');
  const btnSave = document.getElementById('btnSave');
  const toastMessage = document.getElementById('toastMessage');
  const versionLabel = document.getElementById('versionLabel');

  let currentMode = 'badge';
  let debounceTimer = null;
  let toastTimer = null;

  // Set manifest version in footer
  try {
    const version = chrome.runtime?.getManifest?.()?.version || '2.4.0';
    if (versionLabel) {
      versionLabel.textContent = `Valor v${version}`;
    }
  } catch (e) {}

  // 1. Load saved settings from Chrome storage
  chrome.storage.sync.get(['valorUrl', 'embedMode', 'resumePlayback', 'cinemaMode'], (res) => {
    const initialUrl = res.valorUrl || 'http://localhost:5173/embed';
    if (valorUrlInput) {
      valorUrlInput.value = initialUrl;
    }
    currentMode = res.embedMode || 'badge';
    updateModeUI(currentMode);

    const isResume = res.resumePlayback !== false;
    setToggleState(btnSwitchResume, chkResume, isResume);

    const isCinema = res.cinemaMode === true;
    setToggleState(btnSwitchCinema, chkCinema, isCinema);

    checkConnection(initialUrl);
    queryActiveTabMedia();
  });

  // 2. Segmented control handling
  function updateModeUI(mode) {
    currentMode = mode;
    const buttons = modeSelector.querySelectorAll('.seg-btn');
    buttons.forEach((btn) => {
      const isActive = btn.dataset.mode === mode;
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      if (isActive) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  modeSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    updateModeUI(btn.dataset.mode);
  });

  // 3. Toggle switch helper & handlers
  function setToggleState(btn, input, checked) {
    if (!btn || !input) return;
    input.checked = checked;
    btn.setAttribute('aria-checked', checked ? 'true' : 'false');
  }

  btnSwitchResume.addEventListener('click', () => {
    const nextState = btnSwitchResume.getAttribute('aria-checked') !== 'true';
    setToggleState(btnSwitchResume, chkResume, nextState);
  });

  btnSwitchCinema.addEventListener('click', () => {
    const nextState = btnSwitchCinema.getAttribute('aria-checked') !== 'true';
    setToggleState(btnSwitchCinema, chkCinema, nextState);
  });

  // 4. Reachability check (debounced automatically on input)
  async function checkConnection(url) {
    const normalized = normalizeUrl(url);
    let reachable = false;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1800);
      const res = await fetch(normalized, { method: 'HEAD', signal: controller.signal }).catch(() => null);
      clearTimeout(timer);
      if (res && (res.ok || res.status < 500)) {
        reachable = true;
      }
    } catch (e) {}

    // Update Header Status
    if (connStatus) {
      const statusText = connStatus.querySelector('.status-text');
      if (reachable) {
        connStatus.classList.remove('not-connected');
        connStatus.classList.add('connected');
        if (statusText) statusText.textContent = 'Connected';
      } else {
        connStatus.classList.remove('connected');
        connStatus.classList.add('not-connected');
        if (statusText) statusText.textContent = 'Not connected';
      }
    }

    // Update Input Dot
    if (addressStatusDot) {
      if (reachable) {
        addressStatusDot.classList.add('reachable');
      } else {
        addressStatusDot.classList.remove('reachable');
      }
    }

    // Inform background script
    try {
      chrome.runtime.sendMessage({
        type: 'SYNC_LIVE_STATE',
        isLive: reachable && currentMode !== 'off'
      });
    } catch (e) {}

    return reachable;
  }

  valorUrlInput.addEventListener('input', () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      checkConnection(valorUrlInput.value);
    }, 300);
  });

  // 5. Query Active Tab Media
  function queryActiveTabMedia() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0 || !tabs[0].id) {
        showEmptyDetected('No active tab detected');
        return;
      }

      const activeTabId = tabs[0].id;
      chrome.tabs.sendMessage(activeTabId, { type: 'GET_PAGE_MEDIA' }, (response) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr || !response || !response.streams || response.streams.length === 0) {
          showEmptyDetected('No media detected on this page');
          return;
        }

        renderDetectedMedia(response.streams, activeTabId);
      });
    });
  }

  function showEmptyDetected(message) {
    mediaSnifferList.innerHTML = `<div class="detected-empty">${escapeHtml(message)}</div>`;
  }

  function renderDetectedMedia(streams, activeTabId) {
    mediaSnifferList.innerHTML = '';

    streams.forEach((s) => {
      const card = document.createElement('div');
      card.className = 'media-card';

      const format = s.url.includes('.m3u8') ? 'HLS' : (s.url.includes('.mkv') ? 'MKV' : 'MP4');
      const parts = [format];
      if (s.width && s.height) {
        parts.push(`${s.width}×${s.height}`);
      }
      if (s.duration) {
        parts.push(formatDuration(s.duration));
      }
      const metaLine = parts.join(' · ');

      card.innerHTML = `
        <div class="media-thumb" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
        </div>
        <div class="media-info">
          <span class="media-title" title="${escapeHtml(s.title || s.url)}">${escapeHtml(s.title || 'Video stream')}</span>
          <span class="media-meta">${escapeHtml(metaLine)}</span>
        </div>
        <button type="button" class="btn-ghost" data-url="${escapeHtml(s.url)}">
          Play
        </button>
      `;

      const playBtn = card.querySelector('.btn-ghost');
      playBtn.addEventListener('click', () => {
        playBtn.disabled = true;
        playBtn.textContent = 'Opening…';
        chrome.tabs.sendMessage(activeTabId, {
          type: 'TRIGGER_EMBED_STREAM',
          url: s.url,
          title: s.title
        }, () => {
          setTimeout(queryActiveTabMedia, 500);
        });
      });

      mediaSnifferList.appendChild(card);
    });
  }

  // Rescan button
  btnRescan.addEventListener('click', () => {
    rescanIcon.style.transition = 'transform 300ms ease';
    rescanIcon.style.transform = 'rotate(180deg)';
    setTimeout(() => {
      rescanIcon.style.transition = 'none';
      rescanIcon.style.transform = 'rotate(0deg)';
    }, 300);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'RESCAN' }, () => {
          queryActiveTabMedia();
          showToast('Rescanned');
        });
      }
    });
  });

  // 6. Save Button
  btnSave.addEventListener('click', () => {
    const rawUrl = valorUrlInput.value;
    const normalized = normalizeUrl(rawUrl);

    chrome.storage.sync.set({
      valorUrl: normalized,
      embedMode: currentMode,
      extensionEnabled: currentMode !== 'off',
      resumePlayback: chkResume.checked,
      cinemaMode: chkCinema.checked
    }, () => {
      checkConnection(normalized);
      showToast('Saved');
    });
  });

  function showToast(msg) {
    if (!toastMessage) return;
    if (toastTimer) clearTimeout(toastTimer);
    toastMessage.textContent = msg;
    toastMessage.style.opacity = '1';
    toastTimer = setTimeout(() => {
      toastMessage.style.opacity = '0';
    }, 1500);
  }

  function normalizeUrl(input) {
    let val = (input || '').trim();
    if (!val) return 'http://localhost:5173/embed';

    if (/^:?\d+$/.test(val)) {
      const port = val.replace(':', '');
      if (port === '443') return 'https://localhost/embed';
      if (port === '80') return 'http://localhost/embed';
      return `http://localhost:${port}/embed`;
    }

    if (!/^https?:\/\//i.test(val)) {
      const isLocal = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0)(:\d+)?/i.test(val);
      val = (isLocal ? 'http://' : 'https://') + val;
    }

    try {
      const parsed = new URL(val);
      if (!parsed.pathname || parsed.pathname === '/') {
        parsed.pathname = '/embed';
      }
      return parsed.toString();
    } catch (e) {
      return val;
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

  function escapeHtml(str) {
    return (str || '').replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m]));
  }
});
