# Valor Player SDK

Embed the powerful Valor video player on any website using our JavaScript SDK, or our native wrappers for React, Vue, and Angular. The Valor Player provides a comprehensive suite of media playback features, granular API controls, and deep UI customization.

## Features

### Supported Media
- **Video:** MP4, MKV, AVI, MOV, WebM
- **Streaming:** HLS (.m3u8), DASH (.mpd)
- **Audio:** MP3, FLAC, AAC, WAV
- **Subtitles:** SRT, ASS, SSA, VTT

### Playback & Streaming Capabilities
- Play, Pause, Stop, Resume, Seek
- Skip Intro / Outro, Next/Previous Episode
- Playback Speed, Frame Stepping
- Picture in Picture (PiP), Fullscreen, Mini Player
- Continuous Playback, Auto Next Episode, Repeat Episode
- Loop, Shuffle Playlist
- HTTP Range Requests, Adaptive Buffering, Smart Prefetching
- Chunk Caching, Bandwidth Estimation, Network Recovery
- Low Latency Streaming & Retry Logic
- Quality Controls: Auto, 240p, 360p, 480p, 720p, 1080p, 1440p, 2160p (Adaptive)

### Subtitle & Audio Features
- Enable/Disable subtitles, Subtitle Selection, Subtitle Delay
- Subtitle Customization: Font, Size, Weight, Background Opacity, Outline, Shadow, Position, Colour
- Custom subtitle renderer
- Audio Track Selector, Audio Delay
- Volume Boost, Normalize Volume, Stereo/Mono Selection

### Resume Watching
The player automatically saves and restores:
- Playback position (watched percentage)
- Selected audio and subtitle tracks
- Playback speed and volume

### Keyboard Shortcuts
Extensive keyboard navigation (can be individually disabled):
- Space (Play/Pause), J (Rewind), L (Forward)
- Arrow Keys (Volume/Seek), F (Fullscreen), M (Mute), C (Captions), P (PiP), N (Next), Esc (Exit)

### Mobile Support & Accessibility
- Touch gestures, Swipe seek, Double tap seek, Pinch zoom
- Landscape mode and Mobile fullscreen
- ARIA support, Screen readers, Keyboard navigation
- High contrast mode, Focus management

---

## Installation

```bash
npm install @our-player/sdk
```

---

## Quick Start (Vanilla JS)

```html
<div id="player"></div>
<script type="module">
  import { MediaPlayer } from '@our-player/sdk';
  
  const player = new MediaPlayer({
    container: '#player',
    media: 'https://media.example.com/video.mp4',
    autoplay: true,
    theme: {
      accent: '#7C3AED',
      background: '#111111',
      text: '#ffffff',
      radius: 12,
      font: 'Inter'
    },
    controls: {
      play: true,
      volume: true,
      download: false, // hide download button
      chapters: true
    }
  });

  player.on('ready', () => {
    player.play();
  });
</script>
```

## React Example

```tsx
import { ValorPlayer } from '@our-player/react';

function App() {
  return (
    <ValorPlayer 
      media="https://media.example.com/video.mkv"
      theme={{ accent: '#ff0000', hideLogo: true }}
      controls={{ pip: false, screenshot: false }}
      onPlay={() => console.log('Video started playing')}
    />
  );
}
```

---

## Customization & Theming

You have total control over the player's branding and feature visibility.

### Theme Configuration
```javascript
theme: {
    accent: "#7C3AED",
    background: "#111111",
    text: "#ffffff",
    radius: 12,
    font: "Inter",
    logoUrl: "...", // Replace logo
    watermarkUrl: "...", // Add watermark
    hideLogo: true // Hide default branding
}
```

### Controls Configuration
Selectively hide any feature you do not want your users to access:
```javascript
controls: {
    play: true,
    pause: true,
    volume: false,
    subtitles: false,
    fullscreen: true,
    speed: false,
    settings: false,
    nextEpisode: false,
    previousEpisode: false,
    pip: true,
    download: false,
    screenshot: false,
    chapters: true
}
```

---

## API Reference

### Methods
- `player.play()`
- `player.pause()`
- `player.stop()`
- `player.seek(120)` // Seek to 120 seconds
- `player.volume(80)` // Set volume to 80%
- `player.mute()` / `player.unmute()`
- `player.fullscreen()` / `player.exitFullscreen()`
- `player.setSpeed(2)` // 2x speed
- `player.load(url)`
- `player.destroy()` // Cleanup event listeners and remove iframe

### Events
- `player.on("ready", callback)`
- `player.on("play", callback)`
- `player.on("pause", callback)`
- `player.on("ended", callback)`
- `player.on("timeupdate", callback)`
- `player.on("buffering", callback)`
- `player.on("seek", callback)`
- `player.on("subtitlechange", callback)`
- `player.on("audiochange", callback)`
- `player.on("fullscreen", callback)`
- `player.on("error", callback)`

---

## Security

Provide configurable embedding options directly via your backend deployment.
- **Allowed Origins**: The SDK validates origins using secure `window.postMessage()` verification.
- **CORS Handling**: Cross-origin Resource Sharing is handled dynamically by our backend to allow all origins when configured.
- **Token Protection**: Backend supports optional signed URLs, JWT-based access, expiring playback links, and hotlink protection for secure media delivery.
