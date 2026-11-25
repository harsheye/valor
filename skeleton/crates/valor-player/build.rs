//! Emit the Windows link search path for a fetched libmpv distribution.

fn main() {
    #[cfg(windows)]
    {
        use std::path::PathBuf;

        println!("cargo:rerun-if-env-changed=VALOR_LIBMPV_DIR");
        let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let workspace_dir = manifest_dir.parent().and_then(|crates| crates.parent());
        let default_lib_dir = workspace_dir.map(|root| root.join("libmpv"));
        let lib_dir = std::env::var_os("VALOR_LIBMPV_DIR")
            .map(PathBuf::from)
            .or(default_lib_dir);
        if let Some(lib_dir) = lib_dir.filter(|path| path.is_dir()) {
            println!("cargo:rustc-link-search=native={}", lib_dir.display());
        }
    }
}
