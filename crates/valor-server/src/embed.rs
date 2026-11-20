use axum::extract::Query;
use axum::response::{Html, IntoResponse};
use serde::Deserialize;

#[derive(Deserialize, Debug)]
pub struct EmbedQuery {
    pub url: Option<String>,
    #[serde(alias = "overlayTimeout")]
    pub overlay_timeout: Option<u64>,
    #[serde(alias = "hideOverlay")]
    pub hide_overlay: Option<bool>,
    pub title: Option<String>,
    #[serde(alias = "startTime")]
    pub start_time: Option<f64>,
}

pub async fn handle_embed(Query(params): Query<EmbedQuery>) -> impl IntoResponse {
    let media_url = params.url.unwrap_or_default();
    let timeout_ms = params.overlay_timeout.unwrap_or(3000);
    let hide_overlay = params.hide_overlay.unwrap_or(false);
    let title = params.title.unwrap_or_else(|| "Valor Embed Player".to_string());
    let start_time = params.start_time.unwrap_or(0.0);

    let html = format!(r#"<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title}</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body, html {{ width: 100%; height: 100%; background: #000; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }}
    .player-container {{ position: relative; width: 100%; height: 100%; display: flex; justify-content: center; align-items: center; }}
    video {{ width: 100%; height: 100%; object-fit: contain; }}
    
    /* Overlay */
    .overlay {{
      position: absolute;
      top: 0; left: 0; right: 0; bottom: 0;
      display: {overlay_display};
      flex-direction: column;
      justify-content: space-between;
      pointer-events: none;
      transition: opacity 0.3s ease;
      opacity: 1;
      background: linear-gradient(180deg, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 75%, rgba(0,0,0,0.85) 100%);
    }}
    .overlay.hidden {{ opacity: 0; pointer-events: none; }}
    .overlay > * {{ pointer-events: auto; }}
    
    .top-bar {{ padding: 16px 20px; display: flex; justify-content: space-between; align-items: center; color: #fff; }}
    .badge {{ background: #e11d2e; font-size: 11px; font-weight: 800; padding: 2px 6px; border-radius: 4px; }}
    .title {{ font-size: 14px; font-weight: 600; margin-left: 8px; color: #f4f4f5; }}
    
    .bottom-bar {{ padding: 12px 20px; display: flex; flex-direction: column; gap: 8px; color: #fff; }}
    .seek-bar {{ width: 100%; height: 5px; -webkit-appearance: none; appearance: none; background: #3f3f46; border-radius: 3px; outline: none; cursor: pointer; }}
    .seek-bar::-webkit-slider-thumb {{ -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: #e11d2e; cursor: pointer; }}
    
    .controls {{ display: flex; justify-content: space-between; align-items: center; font-size: 13px; }}
    .btn {{ background: none; border: none; color: #fff; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 6px; }}
    .btn:hover {{ color: #e11d2e; }}
  </style>
</head>
<body>
  <div class="player-container" id="container">
    <video id="video" src="{media_url}" playsinline preload="auto"></video>
    
    <div class="overlay" id="overlay">
      <div class="top-bar">
        <div style="display: flex; align-items: center;">
          <span class="badge">VALOR</span>
          <span class="title">{title}</span>
        </div>
      </div>
      
      <div class="bottom-bar">
        <input type="range" class="seek-bar" id="seekBar" min="0" max="100" value="0" step="0.1">
        <div class="controls">
          <div style="display: flex; gap: 14px; align-items: center;">
            <button class="btn" id="playBtn">▶ Play</button>
            <span id="timeText" style="color: #a1a1aa; font-size: 12px;">00:00 / 00:00</span>
          </div>
          <button class="btn" id="fsBtn">⛶ Fullscreen</button>
        </div>
      </div>
    </div>
  </div>

  <script>
    const video = document.getElementById('video');
    const overlay = document.getElementById('overlay');
    const playBtn = document.getElementById('playBtn');
    const seekBar = document.getElementById('seekBar');
    const timeText = document.getElementById('timeText');
    const fsBtn = document.getElementById('fsBtn');
    const container = document.getElementById('container');
    
    const hideOverlayAlways = {hide_overlay_js};
    const timeoutMs = {timeout_ms};
    let hideTimer = null;

    if ({start_time} > 0) {{
      video.currentTime = {start_time};
    }}

    function resetTimer() {{
      if (hideOverlayAlways) return;
      overlay.classList.remove('hidden');
      if (hideTimer) clearTimeout(hideTimer);
      if (!video.paused && timeoutMs > 0) {{
        hideTimer = setTimeout(() => overlay.classList.add('hidden'), timeoutMs);
      }}
    }}

    container.addEventListener('mousemove', resetTimer);
    container.addEventListener('click', resetTimer);

    playBtn.addEventListener('click', () => {{
      if (video.paused) video.play(); else video.pause();
    }});

    video.addEventListener('play', () => {{
      playBtn.textContent = '❚❚ Pause';
      resetTimer();
      window.parent.postMessage({{ type: 'valor:play', time: video.currentTime }}, '*');
    }});

    video.addEventListener('pause', () => {{
      playBtn.textContent = '▶ Play';
      overlay.classList.remove('hidden');
      window.parent.postMessage({{ type: 'valor:pause', time: video.currentTime }}, '*');
    }});

    video.addEventListener('timeupdate', () => {{
      if (video.duration) {{
        seekBar.value = (video.currentTime / video.duration) * 100;
        timeText.textContent = `${{formatTime(video.currentTime)}} / ${{formatTime(video.duration)}}`;
        window.parent.postMessage({{ type: 'valor:timeupdate', time: video.currentTime, duration: video.duration }}, '*');
      }}
    }});

    seekBar.addEventListener('input', () => {{
      if (video.duration) {{
        video.currentTime = (seekBar.value / 100) * video.duration;
      }}
    }});

    fsBtn.addEventListener('click', () => {{
      if (!document.fullscreenElement) container.requestFullscreen();
      else document.exitFullscreen();
    }});

    function formatTime(s) {{
      const sec = Math.floor(s || 0);
      const m = Math.floor(sec / 60);
      const rem = sec % 60;
      return `${{m.toString().padStart(2, '0')}}:${{rem.toString().padStart(2, '0')}}`;
    }}

    // Embed Protocol Listener
    window.addEventListener('message', (event) => {{
      if (!event.data) return;
      switch (event.data.type) {{
        case 'valor:seek':
          if (typeof event.data.time === 'number') video.currentTime = event.data.time;
          break;
        case 'valor:play':
          video.play();
          break;
        case 'valor:pause':
          video.pause();
          break;
      }}
    }});

    window.parent.postMessage({{ type: 'valor:ready' }}, '*');
  </script>
</body>
</html>"#,
        title = title,
        media_url = media_url,
        overlay_display = if hide_overlay { "none" } else { "flex" },
        hide_overlay_js = if hide_overlay { "true" } else { "false" },
        timeout_ms = timeout_ms,
        start_time = start_time,
    );

    Html(html)
}
