document.addEventListener('DOMContentLoaded', () => {
  const valorUrlInput = document.getElementById('valorUrlInput');
  const btnSave = document.getElementById('btnSave');
  const btnTestConn = document.getElementById('btnTestConn');
  const btnRescan = document.getElementById('btnRescan');
  const rescanIcon = document.getElementById('rescanIcon');
  const connStatus = document.getElementById('connStatus');
  const toastMessage = document.getElementById('toastMessage');
  const mediaSnifferList = document.getElementById('mediaSnifferList');
  const chkResume = document.getElementById('chkResume');
  const chkCinema = document.getElementById('chkCinema');
  const modeSelector = document.getElementById('modeSelector');

  let currentMode = 'auto';

  // 1. Load saved settings from Chrome storage
  chrome.storage.sync.get(['valorUrl', 'embedMode', 'resumePlayback', 'cinemaMode'], (res) => {
    valorUrlInput.value = res.valorUrl || 'http://localhost:5173/embed';
    currentMode = res.embedMode || 'auto';
    chkResume.checked = res.resumePlayback !== false;
    chkCinema.checked = res.cinemaMode === true;
    updateModeUI(currentMode);
    checkServerPing(valorUrlInput.value);
    queryActiveTabMedia();
  });

  // 2. Mode Segmented Control
  function updateModeUI(mode) {
    currentMode = mode;
    const buttons = modeSelector.querySelectorAll('.seg-btn');
    buttons.forEach((btn) => {
      if (btn.dataset.mode === mode) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  modeSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    const mode = btn.dataset.mode;
    updateModeUI(mode);
    saveSettings(true);
  });

  // 3. Preset Pills
  document.querySelectorAll('.preset-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      valorUrlInput.value = pill.dataset.url;
      checkServerPing(valorUrlInput.value);
      showToast('Preset applied!');
    });
  });

  // 4. Test Server Connection Ping
  async function checkServerPing(url) {
    connStatus.className = 'valor-status-pill checking';
    connStatus.querySelector('.status-label').textContent = 'CHECKING...';

    const normalized = normalizeUrl(url);
    try {
      // Use background fetch or direct head fetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const res = await fetch(normalized, { method: 'HEAD', signal: controller.signal }).catch(() => null);
      clearTimeout(timeoutId);

      if (res && (res.ok || res.status < 500)) {
        connStatus.className = 'valor-status-pill online';
        try {
          const parsed = new URL(normalized);
          const portStr = parsed.port ? `:${parsed.port}` : '';
          connStatus.querySelector('.status-label').textContent = `ONLINE ${portStr}`;
        } catch {
          connStatus.querySelector('.status-label').textContent = 'ONLINE';
        }
        return true;
      }
    } catch {}

    connStatus.className = 'valor-status-pill offline';
    connStatus.querySelector('.status-label').textContent = 'OFFLINE';
    return false;
  }

  btnTestConn.addEventListener('click', () => {
    checkServerPing(valorUrlInput.value);
  });

  valorUrlInput.addEventListener('change', () => {
    checkServerPing(valorUrlInput.value);
  });

  // 5. Query Active Tab for Media Streams (Media Sniffer)
  function queryActiveTabMedia() {
    mediaSnifferList.innerHTML = '<div class="sniffer-empty">Scanning for media on current tab...</div>';

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs || tabs.length === 0 || !tabs[0].id) {
        mediaSnifferList.innerHTML = '<div class="sniffer-empty">No active web tab detected.</div>';
        return;
      }

      const activeTabId = tabs[0].id;
      chrome.tabs.sendMessage(activeTabId, { type: 'GET_PAGE_MEDIA' }, (response) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr || !response || !response.streams) {
          mediaSnifferList.innerHTML = '<div class="sniffer-empty">No media streams found on this page.</div>';
          return;
        }

        renderMediaList(response.streams, activeTabId);
      });
    });
  }

  function renderMediaList(streams, activeTabId) {
    if (!streams || streams.length === 0) {
      mediaSnifferList.innerHTML = '<div class="sniffer-empty">No active video players found on this page.</div>';
      return;
    }

    mediaSnifferList.innerHTML = '';
    streams.forEach((s) => {
      const item = document.createElement('div');
      item.className = 'sniffer-item';

      const format = s.url.includes('.m3u8') ? 'HLS' : (s.url.includes('.mkv') ? 'MKV' : 'MP4');
      const resLabel = s.width && s.height ? `${s.width}x${s.height}` : '';
      const durLabel = s.duration ? formatDuration(s.duration) : '';

      item.innerHTML = `
        <div class="sniffer-meta">
          <span class="sniffer-title" title="${escapeHtml(s.title || s.url)}">${escapeHtml(s.title || 'Video Stream')}</span>
          <div class="sniffer-tags">
            <span class="sniffer-tag">${format}</span>
            ${resLabel ? `<span class="sniffer-tag res">${resLabel}</span>` : ''}
            ${durLabel ? `<span class="sniffer-tag">${durLabel}</span>` : ''}
          </div>
        </div>
        <button type="button" class="sniffer-action-btn" data-url="${escapeHtml(s.url)}" data-title="${escapeHtml(s.title)}">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          <span>${s.isReplaced ? 'Active' : 'Play'}</span>
        </button>
      `;

      const actionBtn = item.querySelector('.sniffer-action-btn');
      actionBtn.addEventListener('click', () => {
        actionBtn.disabled = true;
        actionBtn.innerHTML = '<span>Opening...</span>';
        chrome.tabs.sendMessage(activeTabId, {
          type: 'TRIGGER_EMBED_STREAM',
          url: s.url,
          title: s.title
        }, () => {
          setTimeout(queryActiveTabMedia, 800);
        });
      });

      mediaSnifferList.appendChild(item);
    });
  }

  // Rescan Page Button
  btnRescan.addEventListener('click', () => {
    rescanIcon.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
    rescanIcon.style.transform = 'rotate(360deg)';
    setTimeout(() => {
      rescanIcon.style.transition = 'none';
      rescanIcon.style.transform = 'rotate(0deg)';
    }, 600);

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs && tabs[0]?.id) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'RESCAN' }, () => {
          queryActiveTabMedia();
        });
      }
    });
  });

  // 6. Save Settings
  function saveSettings(silent = false) {
    const rawUrl = valorUrlInput.value.trim();
    const valorUrl = normalizeUrl(rawUrl);
    valorUrlInput.value = valorUrl;

    const embedMode = currentMode;
    const resumePlayback = chkResume.checked;
    const cinemaMode = chkCinema.checked;

    chrome.storage.sync.set({
      valorUrl,
      embedMode,
      extensionEnabled: embedMode !== 'off',
      resumePlayback,
      cinemaMode
    }, () => {
      checkServerPing(valorUrl);
      if (!silent) {
        showToast('Settings saved successfully!');
      }
    });
  }

  btnSave.addEventListener('click', () => saveSettings(false));

  function showToast(msg) {
    toastMessage.textContent = msg;
    toastMessage.style.opacity = '1';
    setTimeout(() => {
      toastMessage.style.opacity = '0';
    }, 2200);
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
      val = 'http://' + val;
    }

    try {
      const parsed = new URL(val);
      if (!parsed.pathname || parsed.pathname === '/') {
        parsed.pathname = '/embed';
      }
      return parsed.toString();
    } catch {
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
