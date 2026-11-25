//! Configures platform-specific linking for the bundled libmpv distribution.

use std::path::PathBuf;

fn main() {
    let manifest_dir = PathBuf::from(std::env::var_os("CARGO_MANIFEST_DIR").unwrap_or_default());
    let mpv_dir = manifest_dir.join("..").join("..").join("libmpv");
    println!("cargo:rerun-if-changed={}", mpv_dir.display());
    if cfg!(windows) {
        println!("cargo:rustc-link-search=native={}", mpv_dir.display());
        println!("cargo:rustc-link-lib=dylib=mpv-2");
    } else if cfg!(unix) {
        println!("cargo:rustc-link-lib=dylib=mpv");
    }
}
