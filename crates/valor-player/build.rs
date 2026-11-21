use std::path::Path;

fn main() {
    let dir = std::env::var("CARGO_MANIFEST_DIR").unwrap();
    let mpv_dir = Path::new(&dir)
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("libmpv");
    println!("cargo:rustc-link-search=native={}", mpv_dir.display());
    println!("cargo:rustc-link-lib=mpv");
}
