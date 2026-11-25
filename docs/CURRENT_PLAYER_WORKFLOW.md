# Current Player Workflow

This document describes the playback path implemented in the current Rust app. It distinguishes library discovery from what the playback backend can decode: the library currently scans a video extension list, while libmpv handles the actual media probing and decoding after a path is opened.

## At a glance

```text
Library item / Play action
        │
        ▼
shell_app::start_playback
  choose ordered paths, selected index, saved resume position
        │ PlayerCommand::Open
        ▼
PlayerService / PlayerCore (libmpv owner)
  validate path → queue → loadfile → optional seek → play
        │
        ├── pump events and publish snapshot / events
        └── RenderBridge paints mpv output into egui's OpenGL framebuffer
                    │
                    ▼
               Player UI overlay
```

## 1. Discovery and selection

`valor-library::scanner` recognizes these extensions for library scans: `mkv`, `mp4`, `avi`, `mov`, `wmv`, `flv`, `webm`, `m4v`, `ts`, `m2ts`, `vob`, `mpg`, `mpeg`, `iso`, `3gp`, `3g2`, `ogv`, `mxf`, `m2v`, `asf`, `divx`, `f4v`, `rmvb`, `mts`, `mpe`, and `mpv`. It parses names for display and grouping metadata; this parsing does not select a decoder.

The current library shell's `start_playback` gathers non-missing items under the selected folder, sorts them by filename, and makes the selected item the queue start. It looks up an incomplete saved position by fingerprint and passes that resume point to the player. The open request can also be used for an arbitrary path, but the ordinary scanned-library route is video-focused; it does not currently index music or still images as separate media classes.

## 2. Open and decode

`PlayerService` initializes libmpv with `vo=libmpv`, `terminal=no`, and `keep-open=yes`. `PlayerCommand::Open`:

1. Rejects an empty/invalid start index.
2. Increments a playback token and builds a queue from the supplied paths.
3. Checks that the selected path exists as a file. A missing file produces `Error` state and a recoverable `LoadFailed` event.
4. Calls libmpv `loadfile` in replace mode and publishes `Loading` and `ItemChanged`.
5. On libmpv `FileLoaded`, seeks to the requested resume position (if positive), unpauses playback, and publishes `Playing`.

libmpv/FFmpeg probes the opened file's streams and handles demuxing, audio/video decoding, and embedded subtitle decoding. There is no app-side per-codec dispatch. Actual support depends on the bundled/runtime libmpv build and available decoders; the scanner extension whitelist is not a codec-support guarantee.

## 3. Media and stream behavior

| Media content | Current handling |
| --- | --- |
| Video with audio | libmpv decodes both; video is rendered into the app's current OpenGL framebuffer and audio is sent through mpv's audio output. The player controls operate on the active item. |
| Video-only file | The same open/decode path; mpv plays the video stream without requiring an audio stream. |
| Audio-only file | There is no special audio player route. If an open request supplies a valid audio file, libmpv's normal file loading can handle it, but the library scanner/UI are currently video-oriented and provide no distinct music browsing workflow. |
| Multiple audio tracks | The service polls mpv's `track-list` and exposes audio tracks (id, title, language, codec, channel count, selected/default/external flags where available). The Tracks panel selects one through mpv's `aid` property. |
| Embedded subtitles | `track-list` exposes subtitle (`sub`) tracks. The Tracks panel selects one through `sid`, or disables subtitles with `sid=no`. mpv performs subtitle rendering. |
| External subtitles | The Tracks panel opens a file picker filtered to SRT, ASS, SSA, VTT, and SUB; `sub-add ... select` loads and selects the file. |
| Chapters / other stream types | No chapter list or video-track selector is exposed by the current player UI/service snapshot. libmpv may handle streams internally, but this workflow does not offer app controls for them. |
| Still images | No image-library or slideshow workflow is implemented. Image thumbnails/artwork decoded by the UI are separate from playback. Whether a direct image path displays through mpv is not surfaced as a supported player flow. |

The app samples position/duration/volume/speed/mute about every 34 ms and refreshes track metadata about every 250 ms. The UI uses the snapshot for its timeline, track panel, and status. The token attached to commands prevents stale controls from an old playback session from affecting the active one.

## 4. Rendering and controls

The egui Glow paint callback obtains the current framebuffer and asks `RenderBridge` to render libmpv's OpenGL render context into it. The native UI is drawn around/over that output; media bytes do not pass through a browser layer.

The player UI sends commands for play/pause/toggle, absolute or relative seek, exact seek, frame step/back, speed, volume/mute, audio boost, track selection, and queue operations. Speed is clamped to 0.1–4.0× and volume to 0–100. The speed panel exposes 0.5×, 0.75×, 1×, 1.25×, 1.5×, and 2×. Boost tiers 150% and 200% apply a libavfilter volume stage followed by an `alimiter`; the base tier clears the filter chain.

## 5. Queue and end-of-file behavior

The queue stores paths, display titles, and optional durations. It supports next/previous, direct jump, reorder, remove, shuffle, and repeat off/one/all. At natural end-of-file the service emits `EndOfItem`, advances according to queue repeat rules, and loads the next item. If there is no next item, the snapshot becomes `Finished` and the UI offers Replay. Manual Stop clears the queue and returns the snapshot to its default idle state.

Note: the current `PlaybackQueue` stores a shuffle order, but traversal (`advance_next` / `advance_previous`) currently increments the cursor through item order rather than consulting that shuffled order. The Shuffle control therefore records/publishes a setting, but does not currently produce shuffled advancement. This is a code-level implementation gap.

## 6. Progress, errors, and lifecycle

The shell saves a `PlaybackPosition` and watch session when an item ends, when playback is left, or when the window closes. Completion is marked when position/duration reaches at least 95%. Resume is offered for an incomplete saved position. Progress persistence is tied to a path matching a scanned library item; a direct path outside the library will not match that save lookup.

File load failures are surfaced as a playback error with a Back action. Render and libmpv initialization errors are also reported. Leaving playback saves the current position, sends Stop, and returns to the library. Shutdown frees the mpv render context and quits libmpv.

## Implementation references

- Playback commands, snapshot, events: [`crates/valor-player/src/lib.rs`](../crates/valor-player/src/lib.rs)
- libmpv lifecycle, event pump, rendering and stream selection: [`crates/valor-player/src/service.rs`](../crates/valor-player/src/service.rs)
- Queue traversal: [`crates/valor-player/src/queue.rs`](../crates/valor-player/src/queue.rs)
- Audio boost filter chain: [`crates/valor-player/src/audio_graph.rs`](../crates/valor-player/src/audio_graph.rs)
- Library media extension recognition: [`crates/valor-library/src/scanner.rs`](../crates/valor-library/src/scanner.rs)
- Shell open/save/render flow: [`crates/valor-app/src/shell_app.rs`](../crates/valor-app/src/shell_app.rs)
- Player controls and track panel: [`crates/valor-ui/src/player_ui.rs`](../crates/valor-ui/src/player_ui.rs)
