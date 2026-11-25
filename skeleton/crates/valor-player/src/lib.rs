//! libmpv ownership and platform path conversion for Valor playback.

mod opengl;
mod player;

#[cfg(unix)]
mod platform_unix;
#[cfg(windows)]
mod platform_windows;

pub use opengl::OpenGlSurface;
pub use player::{Player, Mpv};

#[cfg(unix)]
pub use platform_unix::native_path;
#[cfg(windows)]
pub use platform_windows::native_path;
