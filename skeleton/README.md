<!-- Minimal native Valor workspace and local libmpv setup instructions. -->
# Valor

Valor is a native Rust desktop application using eframe/egui with Glow and a separate libmpv integration crate. This workspace is an empty structural skeleton; it contains no playback, library, or presentation features.

## Fetch libmpv

- Windows: run `./scripts/fetch-mpv.ps1` from this directory. It fetches the current x86_64 development archive from the `zhongfly/mpv-winbuild` GitHub releases and extracts it under `libmpv/`.
- Linux: run `./scripts/fetch-mpv.sh` to install the development package with the detected distribution package manager.
- macOS: run `./scripts/fetch-mpv.sh` to install mpv with Homebrew.

Install a stable Rust toolchain, then run `cargo run -p valor-app`. The app opens one borderless dark window; close it with the window close control to stop its idle workers.
