use axum::response::Html;

pub async fn handle_index() -> Html<&'static str> {
    Html(INDEX_HTML)
}

const INDEX_HTML: &str = r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Valor - Pure Rust WebApp Player</title>
  <style>
    :root {
      --bg: #000000;
      --card-bg: #0a0a0e;
      --popover-bg: #10141d;
      --border: #1a1a24;
      --primary: #e11d2e;
      --accent-blue: #3b82f6;
      --accent-purple: #7c3aed;
      --text: #f4f4f5;
      --text-muted: #a1a1aa;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { width: 100%; height: 100%; background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; overflow: hidden; }
    
    .app { display: flex; flex-direction: column; width: 100vw; height: 100vh; }
    
    /* Top Bar */
    .top-bar { height: 52px; background: var(--card-bg); border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; padding: 0 16px; z-index: 10; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo { color: var(--primary); font-size: 16px; font-weight: 800; letter-spacing: 0.05em; }
    .media-title { font-size: 13px; font-weight: 500; color: #fff; max-width: 320px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    
    /* Mode Switcher (Local / Remote / Embed) */
    .mode-switcher { display: flex; gap: 4px; background: #14141c; padding: 3px; border-radius: 8px; border: 1px solid #262634; }
    .mode-btn { background: none; border: none; color: var(--text-muted); padding: 5px 12px; font-size: 11px; font-weight: 600; border-radius: 6px; cursor: pointer; transition: all 0.2s; }
    .mode-btn.active.local { background: var(--primary); color: #fff; }
    .mode-btn.active.remote { background: var(--accent-blue); color: #fff; }
    .mode-btn.active.embed { background: var(--accent-purple); color: #fff; }
    
    /* Top Actions */
    .top-actions { display: flex; align-items: center; gap: 8px; }
    .btn { background: #1c1c26; border: 1px solid #2c2c3e; color: #fff; padding: 6px 12px; font-size: 11px; font-weight: 600; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
    .btn:hover { background: #282838; }
    .btn.primary { background: var(--primary); border-color: var(--primary); }
    .btn.primary:hover { background: #ff2b3e; }
    
    /* Subheaders for Remote / Embed */
    .subheader { height: 38px; display: flex; justify-content: space-between; align-items: center; padding: 0 16px; font-size: 11px; border-bottom: 1px solid var(--border); }
    .subheader.remote { background: #0f1522; border-color: #1e293b; }
    .subheader.embed { background: #170d2a; border-color: #3b1d64; }
    .stream-input { background: #090d16; border: 1px solid #1e293b; color: #38bdf8; padding: 4px 8px; border-radius: 4px; width: 440px; font-size: 11px; outline: none; }
    
    /* Viewport */
    .viewport { flex: 1; position: relative; display: flex; justify-content: center; align-items: center; background: #000; overflow: hidden; }
    video { width: 100%; height: 100%; object-fit: contain; }
    
    /* Subtitles Overlay */
    .subtitles-overlay { position: absolute; bottom: 70px; left: 32px; right: 32px; display: flex; justify-content: center; pointer-events: none; z-index: 5; }
    .subtitles-text { background: rgba(0, 0, 0, 0.78); color: #fff; font-size: 20px; font-weight: 700; padding: 6px 14px; border-radius: 6px; text-align: center; }
    
    /* Popover Panel (Audio & Subtitles) */
    .popover { position: absolute; bottom: 80px; right: 20px; width: 460px; background: var(--popover-bg); border: 1px solid #1f293d; border-radius: 12px; padding: 16px; display: flex; flex-direction: column; gap: 12px; z-index: 20; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
    .popover-header { display: flex; justify-content: space-between; align-items: center; font-size: 11px; font-weight: 700; color: #8e9cb0; }
    .chips-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
    .chip { height: 28px; background: #141923; border: 1px solid #263043; color: #cbd5e1; border-radius: 6px; padding: 0 10px; font-size: 11px; font-weight: 500; cursor: pointer; display: flex; align-items: center; gap: 6px; }
    .chip:hover { background: #1c2331; }
    .chip.active { background: #1e293b; border-color: var(--accent-blue); color: #fff; font-weight: 700; }
    .chip.dashed { border-style: dashed; border-color: #334155; color: #94a3b8; }
    .divider { height: 1px; background: #1b2230; }
    
    /* Subtitle Styling / Unfold Row */
    .unfold-panel { display: flex; flex-direction: column; gap: 10px; padding-top: 4px; }
    .color-dot { width: 18px; height: 18px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; }
    .color-dot.active { border-color: var(--accent-blue); }
    
    /* Recent Drawer */
    .drawer { position: absolute; top: 0; right: 0; width: 320px; height: 100%; background: #0d0d12; border-left: 1px solid #1f1f2e; padding: 16px; display: flex; flex-direction: column; gap: 12px; z-index: 25; }
    .drawer-header { display: flex; justify-content: space-between; align-items: center; font-size: 14px; font-weight: 700; }
    .history-item { background: #12121a; border: 1px solid #1e1e2d; border-radius: 6px; padding: 8px 10px; cursor: pointer; }
    .history-item:hover { background: #181824; }
    
    /* Bottom Controls Bar */
    .bottom-bar { height: 68px; background: var(--card-bg); border-top: 1px solid var(--border); display: flex; flex-direction: column; padding: 6px 16px 8px; gap: 6px; z-index: 10; }
    .seekbar { width: 100%; height: 5px; -webkit-appearance: none; appearance: none; background: #262634; border-radius: 3px; outline: none; cursor: pointer; }
    .seekbar::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--primary); cursor: pointer; }
    .controls-row { display: flex; justify-content: space-between; align-items: center; }
    .ctrl-group { display: flex; align-items: center; gap: 10px; }
    .round-btn { width: 32px; height: 32px; border-radius: 16px; background: #1c1c24; border: none; color: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 13px; }
    .round-btn:hover { background: var(--primary); }
    .pill { height: 26px; background: #14141c; border: 1px solid #262632; border-radius: 6px; padding: 0 10px; display: flex; align-items: center; font-size: 11px; color: #d4d4d8; cursor: pointer; }
    .pill:hover, .pill.active { background: #1e293b; border-color: var(--accent-blue); }
    
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="app">
    <!-- Top Navigation Bar -->
    <div class="top-bar">
      <div class="brand">
        <span class="logo">VALOR</span>
        <span class="media-title" id="mediaTitle">Valor - Pure Rust Native WebApp</span>
      </div>
      
      <!-- 3 Players Mode Switcher -->
      <div class="mode-switcher">
        <button class="mode-btn active local" id="modeLocal" onclick="setMode('local')">Local Player</button>
        <button class="mode-btn remote" id="modeRemote" onclick="setMode('remote')">Remote Player</button>
        <button class="mode-btn embed" id="modeEmbed" onclick="setMode('embed')">Embed Player</button>
      </div>

      <!-- Action Buttons -->
      <div class="top-actions">
        <button class="btn" onclick="toggleDrawer()">History</button>
        <input type="file" id="localFileInput" accept="video/*,audio/*" style="display:none;" onchange="handleFileSelect(event)">
        <button class="btn primary" id="openFileBtn" onclick="document.getElementById('localFileInput').click()">+ Open File</button>
        <button class="btn hidden" id="embedSettingsBtn" onclick="toggleEmbedSettings()">⚙ Embed Setup</button>
      </div>
    </div>

    <!-- Remote Stream Subheader -->
    <div class="subheader remote hidden" id="remoteSubheader">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: #94a3b8; font-weight: 600;">Remote Stream:</span>
        <input type="text" class="stream-input" id="remoteUrlInput" value="/api/stream?path=" placeholder="Enter remote stream URL">
        <button class="btn primary" style="padding: 4px 10px;" onclick="connectRemote()">▶ Connect</button>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <span style="color: #86efac; font-weight: 600;" id="remoteStatusText">Ready (HTTP Range Seekable)</span>
      </div>
    </div>

    <!-- Embed Player Subheader -->
    <div class="subheader embed hidden" id="embedSubheader">
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: #c4b5fd; font-weight: 700;">Embed Player Mode Active</span>
        <span style="color: #a78bfa;" id="embedTimerDisplay">• Inactivity Timeout: 3s</span>
        <span style="color: #f43f5e; font-weight: 700; display: none;" id="embedHiddenBadge">• Overlay: HIDDEN</span>
      </div>
      <span style="color: #8b5cf6;">Embed Protocol Active (PostMessage + WS)</span>
    </div>

    <!-- Center Viewport -->
    <div class="viewport" id="viewport">
      <video id="videoElement" playsinline preload="auto"></video>
      <div class="subtitles-overlay hidden" id="subtitlesOverlay">
        <div class="subtitles-text" id="subtitlesText"></div>
      </div>

      <!-- Audio & Subtitles Popover Panel (Clean Deduplication & Single Selection) -->
      <div class="popover hidden" id="popover">
        <div class="popover-header">
          <span>AUDIO</span>
          <span style="color: #475569; font-size: 10px;">Single Active Selection</span>
        </div>
        <div class="chips-row" id="audioChips">
          <button class="chip active" onclick="selectAudioTrack('default', this)">Original (WASAPI) ✓</button>
          <button class="chip dashed" onclick="document.getElementById('audioFileInput').click()">+ File</button>
          <input type="file" id="audioFileInput" accept="audio/*" style="display:none;" onchange="handleCustomAudio(event)">
        </div>

        <div class="divider"></div>

        <div class="popover-header">
          <span>SUBTITLES</span>
          <button class="chip" style="height: 22px; font-size: 10px;" onclick="toggleUnfold()">◨ <span id="unfoldLabel">Unfold</span></button>
        </div>
        <div class="chips-row" id="subChips">
          <!-- Clean single Off chip -->
          <button class="chip active" id="subOffChip" onclick="selectSubTrack('off', this)">Off ✓</button>
          <button class="chip dashed" onclick="document.getElementById('subFileInput').click()">+ File</button>
          <input type="file" id="subFileInput" accept=".srt,.vtt" style="display:none;" onchange="handleCustomSub(event)">
        </div>

        <!-- Unfolded Subtitle Styling -->
        <div class="unfold-panel hidden" id="unfoldPanel">
          <div class="divider"></div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px;">
            <div style="display: flex; gap: 4px; align-items: center;">
              <span style="color: #64748b;">Size:</span>
              <button class="chip" style="height: 22px; padding: 0 6px;" onclick="setSubSize(16)">16px</button>
              <button class="chip active" style="height: 22px; padding: 0 6px;" onclick="setSubSize(20)">20px</button>
              <button class="chip" style="height: 22px; padding: 0 6px;" onclick="setSubSize(24)">24px</button>
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              <span style="color: #64748b;">Color:</span>
              <div class="color-dot active" style="background: #ffffff;" onclick="setSubColor('#ffffff', this)"></div>
              <div class="color-dot" style="background: #fef08a;" onclick="setSubColor('#fef08a', this)"></div>
              <div class="color-dot" style="background: #67e8f9;" onclick="setSubColor('#67e8f9', this)"></div>
            </div>
          </div>
          <div style="display: flex; gap: 8px; align-items: center; font-size: 11px;">
            <span style="color: #64748b;">Sync Delay: <span id="syncDelayLabel">0.0s</span></span>
            <button class="chip" style="height: 22px; padding: 0 6px;" onclick="adjustDelay(-0.5)">-0.5s</button>
            <button class="chip" style="height: 22px; padding: 0 6px;" onclick="adjustDelay(0)">Reset</button>
            <button class="chip" style="height: 22px; padding: 0 6px;" onclick="adjustDelay(0.5)">+0.5s</button>
          </div>
        </div>
      </div>

      <!-- Embed Settings Popover -->
      <div class="popover hidden" id="embedSettingsPopover" style="width: 420px; top: 10px; right: 20px; bottom: auto; background: #110924; border-color: #3b1d64;">
        <div class="popover-header" style="color: #c4b5fd;">
          <span>EMBED PLAYER SETTINGS</span>
          <span style="cursor: pointer;" onclick="toggleEmbedSettings()">✕</span>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px; font-size: 11px;">
          <span style="color: #e2e8f0; font-weight: 600;">Overlay Inactivity Timer:</span>
          <div style="display: flex; gap: 6px;">
            <button class="chip" onclick="setOverlayTimeout(1)">1s</button>
            <button class="chip active" onclick="setOverlayTimeout(3)">3s</button>
            <button class="chip" onclick="setOverlayTimeout(5)">5s</button>
            <button class="chip" onclick="setOverlayTimeout(10)">10s</button>
          </div>
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px; font-size: 11px;">
          <span style="color: #e2e8f0; font-weight: 600;">Overlay Visibility in Query:</span>
          <button class="btn" id="toggleHideOverlayBtn" onclick="toggleHideOverlay()" style="justify-content: space-between;">
            <span id="hideOverlayStatus">Normal Overlay with Timer</span>
            <span style="color: #a78bfa; font-weight: 700;" id="hideOverlayBadge">VISIBLE</span>
          </button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px; font-size: 11px;">
          <span style="color: #c4b5fd; font-weight: 600;">Generated Embed URL:</span>
          <div style="background: #090514; border: 1px solid #3b1d64; border-radius: 4px; padding: 8px; font-size: 10px; color: #a78bfa; word-break: break-all;" id="generatedEmbedUrl">
            http://localhost:8080/embed?overlayTimeout=3000&hideOverlay=false
          </div>
        </div>
      </div>

      <!-- History Drawer -->
      <div class="drawer hidden" id="drawer">
        <div class="drawer-header">
          <span>Media History</span>
          <span style="cursor: pointer; color: #a1a1aa;" onclick="toggleDrawer()">✕</span>
        </div>
        <div id="historyList" style="display: flex; flex-direction: column; gap: 8px; overflow-y: auto;">
          <span style="color: #71717a; font-size: 12px;">Loading recent history...</span>
        </div>
      </div>
    </div>

    <!-- Bottom Controls Bar -->
    <div class="bottom-bar" id="bottomBar">
      <input type="range" class="seekbar" id="seekBar" min="0" max="100" value="0" step="0.1" oninput="handleSeek(this.value)">
      <div class="controls-row">
        <!-- Left: Play/Pause, Step, Time -->
        <div class="ctrl-group">
          <button class="round-btn" id="playBtn" onclick="togglePlay()">▶</button>
          <button class="round-btn" style="width: 28px; height: 28px; font-size: 10px; font-weight: 700;" onclick="step(-5)">↺ 5</button>
          <button class="round-btn" style="width: 28px; height: 28px; font-size: 10px; font-weight: 700;" onclick="step(5)">5 ↻</button>
          <span style="color: var(--text-muted); font-size: 12px; font-weight: 500;" id="timeDisplay">00:00 / 00:00</span>
        </div>

        <!-- Right: Speed, Audio, Subs, Volume -->
        <div class="ctrl-group">
          <button class="pill" id="speedPill" onclick="cycleSpeed()">1.0x</button>
          <button class="pill" id="audioPill" onclick="togglePopover()">Audio: Default (WASAPI)</button>
          <button class="pill" id="subPill" onclick="togglePopover()">Subs: Off</button>
          <button class="round-btn" style="width: 28px; height: 28px;" onclick="toggleMute()" id="muteBtn">🔊</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const video = document.getElementById('videoElement');
    const playBtn = document.getElementById('playBtn');
    const seekBar = document.getElementById('seekBar');
    const timeDisplay = document.getElementById('timeDisplay');
    const mediaTitle = document.getElementById('mediaTitle');
    const subtitlesOverlay = document.getElementById('subtitlesOverlay');
    const subtitlesText = document.getElementById('subtitlesText');
    const popover = document.getElementById('popover');
    const drawer = document.getElementById('drawer');
    const embedSettingsPopover = document.getElementById('embedSettingsPopover');
    const bottomBar = document.getElementById('bottomBar');

    let currentMode = 'local';
    let subCues = [];
    let subDelay = 0.0;
    let overlayTimeout = 3000;
    let hideOverlay = false;
    let overlayTimer = null;

    // Modes
    function setMode(mode) {
      currentMode = mode;
      document.getElementById('modeLocal').classList.toggle('active', mode === 'local');
      document.getElementById('modeRemote').classList.toggle('active', mode === 'remote');
      document.getElementById('modeEmbed').classList.toggle('active', mode === 'embed');

      document.getElementById('openFileBtn').classList.toggle('hidden', mode !== 'local');
      document.getElementById('remoteSubheader').classList.toggle('hidden', mode !== 'remote');
      document.getElementById('embedSubheader').classList.toggle('hidden', mode !== 'embed');
      document.getElementById('embedSettingsBtn').classList.toggle('hidden', mode !== 'embed');

      if (mode === 'embed' && hideOverlay) {
        bottomBar.classList.add('hidden');
      } else {
        bottomBar.classList.remove('hidden');
      }
    }

    // Playback
    function togglePlay() {
      if (video.paused) video.play(); else video.pause();
    }
    video.addEventListener('play', () => playBtn.textContent = '❚❚');
    video.addEventListener('pause', () => playBtn.textContent = '▶');

    video.addEventListener('timeupdate', () => {
      if (video.duration) {
        seekBar.value = (video.currentTime / video.duration) * 100;
        timeDisplay.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;
      }
      // Subtitle cue matching with sync delay
      if (subCues.length > 0) {
        const t = video.currentTime + subDelay;
        const active = subCues.find(c => t >= c.start && t <= c.end);
        if (active) {
          subtitlesText.textContent = active.text;
          subtitlesOverlay.classList.remove('hidden');
        } else {
          subtitlesOverlay.classList.add('hidden');
        }
      }
    });

    function handleSeek(val) {
      if (video.duration) video.currentTime = (val / 100) * video.duration;
    }

    function step(s) {
      video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + s));
    }

    // Speed
    const speeds = [1.0, 1.25, 1.5, 2.0, 0.75];
    let speedIdx = 0;
    function cycleSpeed() {
      speedIdx = (speedIdx + 1) % speeds.length;
      video.playbackRate = speeds[speedIdx];
      document.getElementById('speedPill').textContent = `${speeds[speedIdx]}x`;
    }

    // Volume & Mute
    function toggleMute() {
      video.muted = !video.muted;
      document.getElementById('muteBtn').textContent = video.muted ? '🔇' : '🔊';
    }

    // Local file loading
    function handleFileSelect(e) {
      const file = e.target.files[0];
      if (file) {
        const url = URL.createObjectURL(file);
        video.src = url;
        video.play();
        mediaTitle.textContent = file.name;
        // Save to DB
        fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: 'local-' + Date.now(),
            title: file.name,
            file_path: file.name,
            duration: 0.0,
            current_time: 0.0,
            last_played_date: new Date().toISOString(),
            is_remote: false
          })
        }).catch(() => {});
      }
    }

    // Remote stream connect
    function connectRemote() {
      const url = document.getElementById('remoteUrlInput').value;
      if (url) {
        video.src = url;
        video.play();
        mediaTitle.textContent = 'Remote: ' + url;
        document.getElementById('remoteStatusText').textContent = 'Connected (Active Stream)';
      }
    }

    // Popover toggle
    function togglePopover() {
      popover.classList.toggle('hidden');
      drawer.classList.add('hidden');
      embedSettingsPopover.classList.add('hidden');
    }

    function toggleDrawer() {
      drawer.classList.toggle('hidden');
      popover.classList.add('hidden');
      embedSettingsPopover.classList.add('hidden');
      if (!drawer.classList.contains('hidden')) {
        loadHistory();
      }
    }

    function toggleEmbedSettings() {
      embedSettingsPopover.classList.toggle('hidden');
      popover.classList.add('hidden');
      drawer.classList.add('hidden');
    }

    // Audio & Subtitle single selection
    function selectAudioTrack(id, el) {
      document.querySelectorAll('#audioChips .chip').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      document.getElementById('audioPill').textContent = 'Audio: ' + el.textContent.replace('✓', '').trim();
    }

    function selectSubTrack(id, el) {
      document.querySelectorAll('#subChips .chip').forEach(c => c.classList.remove('active'));
      el.classList.add('active');
      if (id === 'off') {
        subCues = [];
        subtitlesOverlay.classList.add('hidden');
        document.getElementById('subPill').textContent = 'Subs: Off';
      } else {
        document.getElementById('subPill').textContent = 'Subs: ' + el.textContent.replace('✓', '').trim();
      }
    }

    // Subtitle Custom File
    function handleCustomSub(e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          parseSubtitles(evt.target.result);
          const btn = document.createElement('button');
          btn.className = 'chip active';
          btn.textContent = file.name + ' ✓';
          btn.onclick = () => selectSubTrack(file.name, btn);
          document.getElementById('subChips').insertBefore(btn, document.getElementById('subChips').lastElementChild);
          selectSubTrack(file.name, btn);
        };
        reader.readAsText(file);
      }
    }

    function parseSubtitles(text) {
      subCues = [];
      const blocks = text.trim().replace(/\r\n/g, '\n').split('\n\n');
      for (const b of blocks) {
        const lines = b.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('-->')) {
            const [s, e] = lines[i].split('-->').map(parseTimestamp);
            const cueText = lines.slice(i + 1).join('\n');
            if (s !== null && e !== null) subCues.push({ start: s, end: e, text: cueText });
            break;
          }
        }
      }
    }

    function parseTimestamp(raw) {
      const parts = raw.trim().replace(',', '.').split(':');
      if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
      if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
      return null;
    }

    // Subtitle Styles
    function toggleUnfold() {
      const panel = document.getElementById('unfoldPanel');
      panel.classList.toggle('hidden');
      document.getElementById('unfoldLabel').textContent = panel.classList.contains('hidden') ? 'Unfold' : 'Fold';
    }
    function setSubSize(sz) {
      subtitlesText.style.fontSize = sz + 'px';
    }
    function setSubColor(col, el) {
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('active'));
      el.classList.add('active');
      subtitlesText.style.color = col;
    }
    function adjustDelay(d) {
      if (d === 0) subDelay = 0; else subDelay += d;
      document.getElementById('syncDelayLabel').textContent = subDelay.toFixed(1) + 's';
    }

    // Embed Settings
    function setOverlayTimeout(s) {
      overlayTimeout = s * 1000;
      document.getElementById('embedTimerDisplay').textContent = `• Inactivity Timeout: ${s}s`;
      updateEmbedUrl();
    }
    function toggleHideOverlay() {
      hideOverlay = !hideOverlay;
      document.getElementById('hideOverlayStatus').textContent = hideOverlay ? 'Overlay Hidden Completely (hideOverlay=true)' : 'Normal Overlay with Timer';
      document.getElementById('hideOverlayBadge').textContent = hideOverlay ? 'HIDDEN' : 'VISIBLE';
      document.getElementById('embedHiddenBadge').style.display = hideOverlay ? 'inline' : 'none';
      if (currentMode === 'embed') {
        bottomBar.classList.toggle('hidden', hideOverlay);
      }
      updateEmbedUrl();
    }
    function updateEmbedUrl() {
      const origin = window.location.origin || 'http://localhost:9090';
      const url = `${origin}/embed?overlayTimeout=${overlayTimeout}&hideOverlay=${hideOverlay}`;
      document.getElementById('generatedEmbedUrl').textContent = url;
    }

    // History
    async function loadHistory() {
      try {
        const res = await fetch('/api/history');
        const items = await res.json();
        const container = document.getElementById('historyList');
        container.innerHTML = '';
        if (items.length === 0) {
          container.innerHTML = '<span style="color:#71717a;font-size:12px;">No recent history.</span>';
          return;
        }
        for (const it of items) {
          const div = document.createElement('div');
          div.className = 'history-item';
          div.innerHTML = `<div style="font-size:12px;font-weight:600;color:#fff;">${it.title}</div><div style="font-size:10px;color:#71717a;">${formatTime(it.current_time)} / ${formatTime(it.duration)} • <span style="color:#e11d2e;">Resume ▶</span></div>`;
          div.onclick = () => {
            if (it.file_path) {
              video.src = it.file_path;
              video.currentTime = it.current_time;
              video.play();
              mediaTitle.textContent = it.title;
              toggleDrawer();
            }
          };
          container.appendChild(div);
        }
      } catch (e) {
        console.error(e);
      }
    }

    function formatTime(secs) {
      const s = Math.floor(secs || 0);
      const m = Math.floor(s / 60);
      const rem = s % 60;
      return `${m.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`;
    }
  </script>
</body>
</html>
"#;
