# Valor

Valor is a cutting-edge, high-performance local and remote media player and streaming server designed to bring a premium, immersive viewing experience directly to your browser across your network.

## 🚀 Features

### 🎬 Advanced Playback Engine
* **Local Media Support**: Stream and play local video files (`.mp4`, `.mkv`, `.avi`, `.webm`) with range requests.
* **Actively Downloading Files**: Uniquely supports playback of files that are actively downloading (like `.fdmdownload` or `.part` files) by dynamically probing and buffering.
* **WASM-Powered Audio Demuxing**: Uses `@ffmpeg/wasm` in the browser to extract, decode, and schedule audio chunks natively through the Web Audio API, ensuring perfect A/V sync without requiring heavy server transcoding.
* **Remote Streaming**: Integrated proxies for external feeds and CORS workarounds.
* **External Subtitles & Audio**: Easily load and sync external subtitle (`.srt`, `.vtt`) and audio tracks directly onto your media.

### 🎨 Premium User Interface
* **Immersive Aesthetics**: Built with dynamic background glow, glassmorphism overlays, and smooth micro-animations.
* **Flame Burst Spinners**: Custom Canvas-based particle rendering for realistic fire/flame buffering animations.
* **TMDB Metadata Integration**: Automatically queries TMDB to fetch movie and TV show posters, titles, episode names, and overviews.
* **Rich Subtitle Customizer**: Real-time, in-player subtitle customization (fonts, sizes, colors, shadows, backgrounds).

### 💾 Smart History & Bookmarks
* **Progress Tracking**: Automatically remembers your playback position for every video.
* **Intelligent Resumption**: Prompts you to resume where you left off.
* **IndexedDB File Re-association**: Remembers file handles securely across browser sessions.

## 🛠️ Tech Stack
* **Frontend**: React 19, TypeScript, Vite, Design Tokens
* **Backend**: Node.js, `node:sqlite`
* **Media Processing**: `@ffmpeg/core`, `@ffmpeg/ffmpeg` (WASM), `hls.js`

## 📦 Running the Server

### Prerequisites
* Node.js (v20+ recommended)
* NPM

### Setup & Run
1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the application server:
   ```bash
   npm start
   ```
   * By default, the server binds to `0.0.0.0:80` (service / UI) and `127.0.0.1:50001` (backend API).
   * Customize via environment variables:
     - `PORT` or `PORT_SERVICE`: Public port (default: `80`)
     - `PORT_BACKEND`: Backend API port (default: `50001`)
     - `HOST`: Listening host (default: `0.0.0.0`)

3. Development mode (Vite frontend directly):
   ```bash
   npm run dev
   ```
4. Build frontend for production:
   ```bash
   npm run build
   ```

5. Auto-start on system boot / login (macOS LaunchAgent):
   * Install and start the service:
     ```bash
     ./setup-service.sh
     ```
   * Uninstall the auto-start service:
     ```bash
     ./uninstall-service.sh
     ```
   * View logs:
     ```bash
     tail -f .valor_data/service.log
     ```

## 📜 License
Valor is a private project. All rights reserved.
