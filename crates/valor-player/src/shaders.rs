use std::fs;
use std::path::{Path, PathBuf};
use serde::{Deserialize, Serialize};
use libmpv2::Mpv;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShaderItem {
    pub name: String,
    pub path: PathBuf,
    pub enabled: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ShaderManager {
    pub shaders: Vec<ShaderItem>,
    pub disabled_failed: Vec<String>,
}

impl ShaderManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn scan_directory<P: AsRef<Path>>(&mut self, dir: P) -> std::io::Result<usize> {
        let dir_path = dir.as_ref();
        if !dir_path.exists() {
            return Ok(0);
        }

        let mut count = 0;
        for entry in fs::read_dir(dir_path)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
                    if ext.eq_ignore_ascii_case("glsl") {
                        let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("shader").to_string();
                        if !self.shaders.iter().any(|s| s.path == path) {
                            self.shaders.push(ShaderItem {
                                name,
                                path,
                                enabled: false,
                            });
                            count += 1;
                        }
                    }
                }
            }
        }
        Ok(count)
    }

    pub fn set_enabled(&mut self, name: &str, enabled: bool) {
        if let Some(item) = self.shaders.iter_mut().find(|s| s.name == name) {
            item.enabled = enabled;
        }
    }

    pub fn move_up(&mut self, index: usize) {
        if index > 0 && index < self.shaders.len() {
            self.shaders.swap(index, index - 1);
        }
    }

    pub fn move_down(&mut self, index: usize) {
        if index + 1 < self.shaders.len() {
            self.shaders.swap(index, index + 1);
        }
    }

    pub fn build_shaders_property(&self) -> String {
        let active_paths: Vec<String> = self
            .shaders
            .iter()
            .filter(|s| s.enabled && !self.disabled_failed.contains(&s.name))
            .map(|s| s.path.to_string_lossy().to_string())
            .collect();
        active_paths.join(";")
    }

    pub fn apply_to_mpv(&mut self, mpv: &Mpv) -> Result<Option<String>, libmpv2::Error> {
        let prop_str = self.build_shaders_property();
        let res = mpv.set_property("glsl-shaders", prop_str.as_str());
        match res {
            Ok(()) => Ok(None),
            Err(e) => {
                // If setting fails, disable the most recently enabled or active shader
                if let Some(failed_name) = self.shaders.iter().find(|s| s.enabled && !self.disabled_failed.contains(&s.name)).map(|s| s.name.clone()) {
                    self.disabled_failed.push(failed_name.clone());
                    let fallback_str = self.build_shaders_property();
                    let _ = mpv.set_property("glsl-shaders", fallback_str.as_str());
                    Ok(Some(failed_name))
                } else {
                    let _ = mpv.set_property("glsl-shaders", "");
                    Err(e)
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shader_scanner_reorder_and_resilience() {
        let mut mgr = ShaderManager::new();
        let assets_dir = Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("assets/shaders");

        if assets_dir.exists() {
            let count = mgr.scan_directory(&assets_dir).expect("scan shaders");
            assert!(count >= 1, "Must discover at least one shader");
        }

        mgr.shaders.clear();
        mgr.shaders.push(ShaderItem {
            name: "test_a".into(),
            path: PathBuf::from("/shaders/a.glsl"),
            enabled: true,
        });
        mgr.shaders.push(ShaderItem {
            name: "test_b".into(),
            path: PathBuf::from("/shaders/b.glsl"),
            enabled: true,
        });

        assert_eq!(mgr.build_shaders_property(), "/shaders/a.glsl;/shaders/b.glsl");

        mgr.move_down(0);
        assert_eq!(mgr.build_shaders_property(), "/shaders/b.glsl;/shaders/a.glsl");

        mgr.disabled_failed.push("test_b".into());
        assert_eq!(mgr.build_shaders_property(), "/shaders/a.glsl");
    }
}
