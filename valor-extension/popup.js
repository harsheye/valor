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
  const btnSwitchUpgrade = document.getElementById('btnSwitchUpgrade');
  const chkUpgrade = document.getElementById('chkUpgrade');
  const btnOpenApp = document.getElementById('btnOpenApp');
  const btnSave = document.getElementById('btnSave');
  const toastMessage = document.getElementById('toastMessage');
  const versionLabel = document.getElementById('versionLabel');
  const themeChips = document.getElementById('themeChips');
  const accentColorPicker = document.getElementById('accentColorPicker');
  const btnResetAccent = document.getElementById('btnResetAccent');

  const THEME_PRESETS = [
    { id: 'valor-purple', name: 'Valor Purple', bg: '#0f0f11', surface: '#16161a', surface2: '#1e1e24', border: '#27272e', text: '#f4f4f6', muted: '#8e8e9a', accent: '#a855f7' },
    { id: 'cnx', name: 'CnX Amber', bg: '#120f0c', surface: '#1a1613', surface2: '#221d18', border: '#332b24', text: '#f2ede8', muted: '#6b645e', accent: '#eb8c34' },
    { id: 'cloudflare-docs', name: 'Cloudflare', bg: '#0d1117', surface: '#11161e', surface2: '#161b22', border: '#30363d', text: '#f0f6fc', muted: '#8b949e', accent: '#2f81f7' },
    { id: 'oled-black', name: 'OLED', bg: '#000000', surface: '#08080a', surface2: '#101014', border: '#1c1c20', text: '#f4f4f6', muted: '#7a7a85', accent: '#f6821f' },
    { id: 'github-midnight', name: 'Midnight', bg: '#0d1117', surface: '#161b22', surface2: '#21262d', border: '#30363d', text: '#f0f6fc', muted: '#8b949e', accent: '#1f6feb' },
    { id: 'cyber-crimson', name: 'Crimson', bg: '#0c0a0f', surface: '#16121c', surface2: '#1a1522', border: '#2a2234', text: '#f4f1f6', muted: '#8b8294', accent: '#f43f5e' },
    { id: 'emerald-studio', name: 'Emerald', bg: '#0b110e', surface: '#121b17', surface2: '#16211c', border: '#1f2e27', text: '#eaf2ee', muted: '#71887d', accent: '#10b981' },
    { id: 'midnight-slate', name: 'Slate', bg: '#0b0e14', surface: '#141a25', surface2: '#1b212a', border: '#232b3a', text: '#f1f3f8', muted: '#8b93a5', accent: '#9db3f6' },
  ];

  let currentMode = 'badge';
  let currentTheme = 'valor-purple';
  let currentAccent = '';
  let debounceTimer = null;
  let toastTimer = null;

  function applyThemeToPopup(themeId, accentOverride) {
    const preset = THEME_PRESETS.find((t) => t.id === themeId) || THEME_PRESETS[0];
    const root = document.documentElement.style;
    const activeAccent = accentOverride || preset.accent;
    root.setProperty('--bg', preset.bg);
    root.setProperty('--surface', preset.surface);
    root.setProperty('--surface-2', preset.surface2);
    root.setProperty('--border', preset.border);
    root.setProperty('--text', preset.text);
    root.setProperty('--muted', preset.muted);
    root.setProperty('--accent', activeAccent);
    if (accentColorPicker) {
      accentColorPicker.value = activeAccent;
    }
    if (themeChips) {
      themeChips.querySelectorAll('.theme-chip').forEach((chip) => {
        chip.classList.toggle('active', chip.dataset.theme === preset.id);
      });
    }
  }

  function renderThemeChips() {
    if (!themeChips) return;
    themeChips.innerHTML = '';
    THEME_PRESETS.forEach((t) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `theme-chip ${t.id === currentTheme ? 'active' : ''}`;
      btn.dataset.theme = t.id;
      btn.innerHTML = `<span class="theme-dot" style="background:${t.accent}"></span><span>${escapeHtml(t.name)}</span>`;
      btn.addEventListener('click', () => {
        currentTheme = t.id;
        currentAccent = '';
        applyThemeToPopup(currentTheme, currentAccent);
        chrome.storage.sync.set({ theme: currentTheme, accentColor: '' }, () => {
          showToast(`${t.name} theme`);
        });
      });
      themeChips.appendChild(btn);
    });
  }

  renderThemeChips();

  if (accentColorPicker) {
    accentColorPicker.addEventListener('input', (e) => {
      currentAccent = e.target.value;
      applyThemeToPopup(currentTheme, currentAccent);
      chrome.storage.sync.set({ accentColor: currentAccent });
    });
  }

  if (btnResetAccent) {
    btnResetAccent.addEventListener('click', () => {
      currentAccent = '';
      applyThemeToPopup(currentTheme, '');
      chrome.storage.sync.set({ accentColor: '' }, () => {
        showToast('Accent reset');
      });
    });
  }

  // Set manifest version in footer
  try {
    const version = chrome.runtime?.getManifest?.()?.version || '2.4.0';
    if (versionLabel) {
      versionLabel.textContent = `Valor v${version}`;
    }
  } catch (e) {}

  // 1. Load saved settings from Chrome storage
  chrome.storage.sync.get(['valorUrl', 'embedMode', 'resumePlayback', 'cinemaMode', 'upgradeVideos', 'theme', 'accentColor'], (res) => {
    currentTheme = res.theme || 'valor-purple';
    currentAccent = res.accentColor || '';
    applyThemeToPopup(currentTheme, currentAccent);

    const rawSaved = res.valorUrl;
    const initialUrl = (!rawSaved || rawSaved === 'http://localhost:5173/embed') ? 'builtin' : rawSaved;
    if (rawSaved === 'http://localhost:5173/embed' || !rawSaved) {
      chrome.storage.sync.set({ valorUrl: 'builtin' });
    }
    if (valorUrlInput) {
      valorUrlInput.value = initialUrl === 'builtin' ? '' : initialUrl;
    }
    currentMode = res.embedMode || 'badge';
    updateModeUI(currentMode);

    const isResume = res.resumePlayback !== false;
    setToggleState(btnSwitchResume, chkResume, isResume);

    const isCinema = res.cinemaMode === true;
    setToggleState(btnSwitchCinema, chkCinema, isCinema);

    const isUpgrade = res.upgradeVideos === true || currentMode === 'auto';
    setToggleState(btnSwitchUpgrade, chkUpgrade, isUpgrade);

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

  if (btnSwitchUpgrade) {
    btnSwitchUpgrade.addEventListener('click', () => {
      const nextState = btnSwitchUpgrade.getAttribute('aria-checked') !== 'true';
      setToggleState(btnSwitchUpgrade, chkUpgrade, nextState);
      const nextMode = nextState ? 'auto' : (currentMode === 'auto' ? 'badge' : currentMode);
      updateModeUI(nextMode);
      chrome.storage.sync.set({
        upgradeVideos: nextState,
        embedMode: nextMode,
        extensionEnabled: nextMode !== 'off'
      }, () => {
        showToast(nextState ? 'Page video takeover ON' : 'Page video takeover OFF');
      });
    });
  }

  if (btnOpenApp) {
    btnOpenApp.addEventListener('click', () => {
      const url = new URL(chrome.runtime.getURL('app/index.html'));
      if (currentTheme) url.searchParams.set('theme', currentTheme);
      if (currentAccent) url.searchParams.set('accent', currentAccent);
      chrome.tabs.create({ url: url.toString() });
    });
  }

  // 4. Reachability check (debounced automatically on input)
  async function checkConnection(url) {
    const normalized = normalizeUrl(url);
    let reachable = false;

    if (normalized === 'builtin' || normalized.startsWith('chrome-extension://')) {
      reachable = true;
    } else {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1800);
        const res = await fetch(normalized, { method: 'HEAD', signal: controller.signal }).catch(() => null);
        clearTimeout(timer);
        if (res && (res.ok || res.status < 500)) {
          reachable = true;
        }
      } catch (e) {}
    }

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
      cinemaMode: chkCinema.checked,
      upgradeVideos: chkUpgrade ? chkUpgrade.checked : currentMode === 'auto',
      theme: currentTheme,
      accentColor: currentAccent
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
    if (!val || val.toLowerCase() === 'builtin' || val === 'http://localhost:5173/embed') return 'builtin';
    if (val.startsWith('chrome-extension://')) return val;

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
