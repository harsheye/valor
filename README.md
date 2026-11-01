# Valor

Valor is a cutting-edge, high-performance local and remote media player and streaming server designed to deliver a modern viewing experience directly in your browser.

---

## 🚀 Features

### 🎬 Advanced Playback Engine
* **Local Media Support**: Stream and play local video files (`.mp4`, `.mkv`, `.avi`, `.webm`, `.mov`, `.ts`) with full HTTP Range request support.
* **Actively Downloading Files**: Uniquely supports playback of files that are actively downloading (like `.fdmdownload` or `.part` files) by dynamically probing and buffering available byte ranges.
* **WASM-Powered Audio Demuxing**: Uses `@ffmpeg/wasm` in the browser to extract, decode, and schedule audio chunks natively through the Web Audio API, ensuring low-latency A/V sync without requiring heavy server transcoding.
* **Remote Streaming & HLS**: Integrated proxy pipelines for external feeds, HLS live streams, and cross-origin video feeds.
* **External Subtitles & Audio**: Easily load and sync external subtitle (`.srt`, `.vtt`, `.ass`) and audio tracks directly onto your media.

### 🎨 Themes & Design Tokens
* **True-Black OLED Theme ("Black Ops")**: Engineered specifically for OLED displays where background surfaces are `#000000` to completely power off pixels.
* **Themes**: Includes `Midnight Slate`, `Soft Paper`, and `Black Ops` with WCAG AA compliance across all views.
* **Responsive Layouts**: Desktop, tablet, and mobile optimized with custom controls, shortcuts, and PiP support.

### 💾 Smart History, Bookmarks & Sync
* **Progress Tracking**: Automatically remembers your playback position for every video.
* **Trakt.tv Integration**: OAuth PKCE flow & device pairing for automatic scrobbling and history synchronization.
* **TheMovieDatabase (TMDB)**: Automatic poster, backdrop, overview, and cast metadata retrieval.
* **Local SQLite Store**: High-performance SQLite engine (`node:sqlite`) for profiles, settings, and media history.

---

## 🛠️ Tech Stack
* **Frontend**: React 19, TypeScript, Vite, Design Tokens
* **Backend**: Node.js, `node:sqlite`, HTTP Range Streaming
* **Media Processing**: `@ffmpeg/core`, `@ffmpeg/ffmpeg` (WASM), `hls.js`

---

## 📦 Getting Started

### Prerequisites
* **Node.js**: Version 20.x or higher
* **npm**: Version 9.x or higher

### 1. Installation
```bash
git clone git@github.com:harsheye/valor.git
cd valor
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env` and configure your API keys and ports:
```bash
cp .env.example .env
```
Key configuration parameters:
* `HOST`: Binding address (`127.0.0.1` by default for local security).
* `PORT_SERVICE`: HTTP Service server port (`80` by default; use `3000` if non-root on Linux).
* `PORT_BACKEND`: Local Engine API port (`50001` by default).
* `VITE_TMDB_BEARER_TOKEN` or `VITE_TMDB_API_KEY`: TMDB metadata access token.
* `VITE_TRAKT_CLIENT_ID`: Trakt.tv OAuth application client ID.
* `VALOR_LOG_MODE`: Logging verbosity (`release` for quiet production, `developer` for verbose).

---

## 🚢 Running in Production

### Build the Application
```bash
npm run build
```
This runs TypeScript checks (`tsc -b`), bundles assets via Vite with vendor chunk splitting (`vendor-react`, `vendor-hls`, `vendor-icons`, `vendor-radix`), strips debug statements, and generates minified assets in `dist/`.

### Start the Production Server
```bash
npm start
```
Or explicitly with production flag:
```bash
node start-app.js --prod
```
The server will automatically detect the compiled `dist/` directory, serve static assets with optimal caching headers (`max-age=31536000, immutable`), and bind the backend API on the configured host.

### Development Mode
```bash
npm run dev
```

---

## 🛡️ Security & Hardening
* **Localhost Binding**: Binds to `127.0.0.1` by default instead of `0.0.0.0` to prevent unauthorized local network exposure.
* **Origin Restriction**: CORS restricted to matching local app origins.
* **Path Traversal Protection**: File requests validate paths against allowed media extensions (`.mp4`, `.mkv`, `.webm`, `.avi`, `.mov`, `.ts`, etc.) and reject traversal (`..`).
* **SSRF Mitigation**: Remote proxies block cloud metadata endpoints (e.g. AWS/GCP `169.254.169.254`) and internal loopback addresses.
* **Rate Limiting**: Remote fetch and logging endpoints enforce per-IP rate limiting.
* **Log Sanitization**: All runtime loggers redact JWTs, Bearer tokens, authentication queries, and user profile directory paths.

---

## 🎛️ Feature Flags

Valor includes commands to disable or re-enable features on-the-fly:
```bash
# Check current feature status
npm run features:status

# Disable specific modules (displays branded Under Construction views)
npm run disable:online    # Disables Online Stream tab
npm run disable:engine    # Disables Local Engine backend features
npm run disable:app       # Puts entire application under maintenance

# Re-enable modules
npm run enable:online
npm run enable:engine
npm run enable:app
npm run enable:all
```

---

## 📜 License
Valor is a private project. All rights reserved.
