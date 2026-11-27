# Valor

Valor is a multi-platform media playback ecosystem consisting of:
- **Valor Desktop (`rust` branch)**: Native Rust (`eframe`/`egui` + `libmpv`) media player & library manager.
- **Valor Browser Extension (`extension` branch)**: Manifest V3 browser extension (`valor-extension/`) that upgrades web `<video>` players with Valor's controls, color grading, and sync.
- **Valor Web & Embed (`production` branch)**: React 19 + TypeScript + Vite streaming app, `<valor-player>` SDK (`packages/sdk`), and Node.js backend (`player.streamiteasy.xyz`).

---

## 🦀 Valor Desktop App (`rust` branch)

### Features
- **Native `libmpv` Playback**: Hardware-accelerated playback (`d3d11va` / `nvdec` / `auto-safe`) for `.mp4`, `.mkv`, `.avi`, `.webm`, `.mov`, `.ts`, and actively downloading files.
- **Cloudflare Docs UI & Themes**: Crisp `#0D1117` / `#161B22` surfaces, `#30363D` 1px borders, square controls (`CornerRadius::ZERO`), `#2F81F7` Cloudflare Docs Blue accent, plus `OLED Super Black`, `GitHub Midnight`, `VLC Classic`, `Netflix`, `YouTube Player`, `Obsidian Violet`, `Cyber Crimson`, and `Emerald Studio`.
- **Home & Library Views**:
  - **Grid & List Views**: Explorer-style 9-column sortable & resizable table (`Name`, `Date`, `Type`, `Size`, `Length`, `Quality`, `Last Played`, `Time Spent`, `Skips`) with natural episode sorting (`S01E02` < `S01E10`).
  - **Deduplicated Media**: Automatic deduplication across folders/fingerprints, with `(YYYY)` and `SxxExx` display formatting.
  - **Playlists**: Create, delete, and manage playlists persisted in SQLite (`collections` / `collection_items`), add media via the library picker or right-click **Add to Playlist...**, and play/queue playlists.
- **In-Player Controls & Picture / Color Grading**:
  - **Picture Panel** (in **More → Picture / Color Grading**): Toggleable **Lighting**, **Shadows**, **Contrast**, **Sharpness**, **Vibrance**, and **HDR Boost** with zero-lag live dragging and `mpv` application on release.
  - **TheIntroDB & Bookmarks**: Auto-skip / floating `Skip Intro >>` and `Skip Outro >>` pills, custom bookmarks, and chapter scrub markers.
  - **Comfort Settings**: Live **Interface brightness** (chrome dimmer), **Text size** (`90%`–`120%` UI zoom), and **Reduce motion** (`System` / `On` / `Off`).
  - **Trakt.tv & TMDB**: Device-code Trakt pairing, **Sync to Trakt** button on media completion, TMDB metadata & ratings, and personalized recommendations unlocked after 30+ hours watched.

### Build & Run (Rust)
```bash
cargo build --release -p valor-app
# Binary output: target/release/valor-app.exe
```

---

## 🧩 Valor Browser Extension (`extension` branch)

Located in `valor-extension/` (Manifest V3):
- **Automatic Video Detection (`content.js`, `background.js`)**: Detects HTML5 `<video>` elements on web pages and attaches Valor's custom overlay player UI.
- **Smooth Color Grading**: Real-time GPU/CSS filter adjustments (`Lighting`, `Shadows`, `Contrast`, `Sharpness`, `Vibrance`, `HDR Boost`) applied directly to active web videos.
- **Enhanced Controls**: Custom scrub bar, volume/subtitle/audio popovers, playback speed selector, keyboard shortcuts, and lock mode.
- **Extension Popup (`popup.html`, `popup.js`, `popup.css`)**: Quick toggle, status, and Valor companion integration (`valor-extension/app/`).

### Load Unpacked in Chrome / Edge
1. Switch to the `extension` branch (or open `valor-extension/`).
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the `valor-extension` directory.

---

## 🌐 Valor Web & Embed (`production` branch)

- **Frontend**: React 19, TypeScript, Vite, `@valor/sdk` (`<valor-player>` custom element), HLS quality selector (`hls.js`), chapter scrub bars, and `@valor/proxy-server`.
- **Backend**: Node.js (`start-app.js`), `node:sqlite`, HTTP Range streaming, `@ffmpeg/wasm` audio demuxing, Trakt.tv OAuth, and TMDB integration.

### Setup & Production
```bash
npm install
cp .env.example .env
npm run build
node start-app.js --prod
```
