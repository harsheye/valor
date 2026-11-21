use directories::ProjectDirs;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tracing::info;

#[derive(Clone)]
pub struct ThumbnailManager {
    cache_dir: PathBuf,
    lru_cache: Arc<Mutex<HashMap<String, PathBuf>>>,
}

impl ThumbnailManager {
    pub fn new() -> Self {
        let cache_dir = ProjectDirs::from("com", "valor", "Valor")
            .map(|p| p.cache_dir().join("thumbnails"))
            .unwrap_or_else(|| PathBuf::from("target/thumbnails"));

        let _ = fs::create_dir_all(&cache_dir);

        Self {
            cache_dir,
            lru_cache: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn thumbnail_path(&self, fingerprint: &str) -> PathBuf {
        self.cache_dir.join(format!("{}.jpg", fingerprint))
    }

    pub fn has_thumbnail(&self, fingerprint: &str) -> bool {
        let lock = self.lru_cache.lock();
        if lock.contains_key(fingerprint) {
            return true;
        }
        self.thumbnail_path(fingerprint).exists()
    }

    pub fn get_thumbnail(&self, fingerprint: &str) -> Option<PathBuf> {
        let mut lock = self.lru_cache.lock();
        if let Some(p) = lock.get(fingerprint) {
            return Some(p.clone());
        }

        let p = self.thumbnail_path(fingerprint);
        if p.exists() {
            lock.insert(fingerprint.to_string(), p.clone());
            Some(p)
        } else {
            None
        }
    }

    pub fn save_thumbnail(
        &self,
        fingerprint: &str,
        image_bytes: &[u8],
    ) -> std::io::Result<PathBuf> {
        let target = self.thumbnail_path(fingerprint);
        fs::write(&target, image_bytes)?;
        info!("Saved thumbnail to {:?}", target);
        self.lru_cache
            .lock()
            .insert(fingerprint.to_string(), target.clone());
        Ok(target)
    }
}

impl Default for ThumbnailManager {
    fn default() -> Self {
        Self::new()
    }
}
