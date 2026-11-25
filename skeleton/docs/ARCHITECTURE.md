<!-- Crate boundaries, worker ownership, and the intended Valor data flow. -->
# Architecture

## Crates

- `valor-core` owns serializable domain models, the shared error type, and platform-aware project paths.
- `valor-player` owns the libmpv boundary and its OpenGL rendering integration point. It depends on `valor-core` and `libmpv2`.
- `valor-ui` owns the egui surface configuration. It depends on egui, not on a webview or UI framework wrapper.
- `valor-app` owns the eframe/Glow entry point, message vocabulary, worker lifecycle, and application orchestration.

## Thread model

The eframe UI runs on the main thread. `valor-app::workers` starts one idle mpv-event worker, one database-writer worker, two database-reader workers, one scanner worker, one watcher worker, and two analysis workers. Each worker blocks on a shutdown channel and exits when the app's close path sends its shutdown message. The worker owner joins every thread before teardown completes.

## Data flow

The UI will eventually submit typed messages through the app layer. The app layer will route writes through the single database writer, reads through the reader pool, scan requests through the scanner, filesystem events through the watcher, and analysis jobs through the two analysis workers. Player events will enter through the mpv-event worker. This skeleton defines the message and ownership boundaries only; it intentionally processes no media or data.
