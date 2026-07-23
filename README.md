# Valor

Valor is a cutting-edge, high-performance local and remote media player designed to bring a premium, immersive viewing experience directly to your desktop and browser. It bridges the gap between powerful native desktop media players (like VLC) and the modern, sleek aesthetics of web applications.

## 🚀 Features

### 🎬 Advanced Playback Engine
* **Local Media Support**: Drop any video file (`.mp4`, `.mkv`, `.avi`, `.webm`) into Valor and it plays seamlessly.
* **Actively Downloading Files**: Uniquely supports playback of files that are actively downloading (like `.fdmdownload` or `.part` files) by dynamically probing and buffering without fatal browser lockups.
* **WASM-Powered Audio Demuxing**: Uses `@ffmpeg/wasm` in the browser to extract, decode, and schedule audio chunks natively through the Web Audio API, ensuring perfect A/V sync without requiring backend transcoding!
* **Remote Streaming**: Support for remote file streams with integrated proxying to bypass CORS restrictions.
* **External Subtitles & Audio**: Easily load and sync external subtitle (`.srt`, `.vtt`) and audio tracks directly onto your media.

### 🎨 Premium User Interface
* **Immersive Aesthetics**: Valor is built with a deep focus on design. Expect dynamic background glow, glassmorphism overlays, and smooth micro-animations.
* **Flame Burst Spinners**: Custom Canvas-based particle rendering for realistic fire/flame buffering animations (Fire Circle, Flame Ring, Flame Burst).
* **TMDB Metadata Integration**: Automatically queries TMDB to fetch movie and TV show posters, titles, episode names, and overviews to create a Netflix-like HUD.
* **Rich Subtitle Customizer**: Real-time, in-player subtitle customization (fonts, sizes, colors, shadows, backgrounds) to tailor your reading experience.

### 💾 Smart History & Bookmarks
* **Progress Tracking**: Automatically remembers your playback position for every video.
* **Intelligent Resumption**: Prompts you to resume where you left off or automatically seeks based on strict watch-time limits.
* **IndexedDB File Re-association**: Remembers your local files across sessions securely without constantly prompting for file picker permissions.

### 🖥️ Native Desktop Integration
* **Single Executable (SEA)**: Valor can run completely detached from a terminal using its bundled Node.js Single Executable Application (`start-app.exe`).
* **System Tray Mode (`Valor.exe`)**: Built-in C# wrapper allows Valor to run silently in your Windows system tray, exposing a clean context menu for logs and controls.

## 🛠️ Tech Stack
* **Frontend**: React 19, TypeScript, Vite, Vanilla CSS (Design Tokens)
* **Backend (Bundled)**: Node.js (Express), SQLite, Node SEA
* **Media Processing**: `@ffmpeg/core`, `@ffmpeg/ffmpeg` (WASM)
* **Desktop Wrapper**: C# (.NET Framework)

## 📦 Building & Running

### Prerequisites
* Node.js (v20+ recommended)
* NPM or Yarn
* (Optional) Visual Studio / `csc` for compiling the C# wrapper

### Development
1. Clone the repository.
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`

### Production Build
1. Build the frontend: `npm run build`
2. Bundle the backend into a single script: `npx esbuild start-app.js --bundle --platform=node --outfile=wrapper.cjs`
3. Generate the SEA blob: `node --experimental-sea-config sea-config.json`
4. Inject into the executable:
   ```bash
   node -e "require('fs').copyFileSync(process.execPath, 'start-app.exe')"
   npx postject start-app.exe NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2
   ```
5. Run `Valor.exe` to launch the tray app!

## 📜 License
Valor is a private project. All rights reserved.
