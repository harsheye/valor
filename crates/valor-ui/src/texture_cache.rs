use egui::{ColorImage, Context, TextureHandle, TextureOptions};
use parking_lot::Mutex;
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::Arc;
use std::thread;

const MAX_GPU_TEXTURES: usize = 256; // Capped to maintain ~50 MB VRAM ceiling

struct DecodedImage {
    fingerprint: String,
    image: ColorImage,
}

pub struct LruTextureCache {
    gpu_textures: HashMap<String, TextureHandle>,
    access_order: VecDeque<String>,
    pending_requests: Arc<Mutex<HashMap<String, bool>>>,
    request_tx: Sender<(String, PathBuf)>,
    result_rx: Receiver<DecodedImage>,
    max_textures: usize,
}

impl LruTextureCache {
    pub fn new() -> Self {
        let (request_tx, request_rx) = channel::<(String, PathBuf)>();
        let (result_tx, result_rx) = channel::<DecodedImage>();
        let pending = Arc::new(Mutex::new(HashMap::<String, bool>::new()));
        let pending_clone = pending.clone();

        // Background worker thread for decoding image files off the UI thread
        thread::Builder::new()
            .name("valor-thumb-decoder".into())
            .spawn(move || {
                while let Ok((fp, path)) = request_rx.recv() {
                    if let Ok(bytes) = std::fs::read(&path) {
                        // Attempt JPEG or WebP decode via image crate or basic RGBA
                        if let Ok(img) = image::load_from_memory(&bytes) {
                            let rgba = img.to_rgba8();
                            let (w, h) = rgba.dimensions();
                            let color_img = ColorImage::from_rgba_unmultiplied(
                                [w as usize, h as usize],
                                &rgba.into_raw(),
                            );
                            let _ = result_tx.send(DecodedImage {
                                fingerprint: fp.clone(),
                                image: color_img,
                            });
                        }
                    }
                    pending_clone.lock().remove(&fp);
                }
            })
            .expect("Failed to spawn thumbnail decoder thread");

        Self {
            gpu_textures: HashMap::new(),
            access_order: VecDeque::new(),
            pending_requests: pending,
            request_tx,
            result_rx,
            max_textures: MAX_GPU_TEXTURES,
        }
    }

    /// Pumps newly decoded images from worker thread and uploads them to GPU
    pub fn pump_uploads(&mut self, ctx: &Context) {
        let mut pumped = false;
        while let Ok(decoded) = self.result_rx.try_recv() {
            let handle = ctx.load_texture(
                format!("thumb_{}", decoded.fingerprint),
                decoded.image,
                TextureOptions::LINEAR,
            );
            self.insert_texture(decoded.fingerprint, handle);
            pumped = true;
        }
        if pumped {
            ctx.request_repaint();
        }
    }

    fn insert_texture(&mut self, fingerprint: String, handle: TextureHandle) {
        if self.gpu_textures.len() >= self.max_textures {
            if let Some(oldest_fp) = self.access_order.pop_front() {
                self.gpu_textures.remove(&oldest_fp);
            }
        }
        self.access_order.push_back(fingerprint.clone());
        self.gpu_textures.insert(fingerprint, handle);
    }

    /// Gets an existing GPU texture or schedules background decoding if not loaded
    pub fn get_or_request(
        &mut self,
        ctx: &Context,
        fingerprint: &str,
        disk_path: Option<&PathBuf>,
    ) -> Option<&TextureHandle> {
        self.pump_uploads(ctx);

        if self.gpu_textures.contains_key(fingerprint) {
            // Touch access order (move to back of LRU queue)
            if let Some(pos) = self.access_order.iter().position(|k| k == fingerprint) {
                self.access_order.remove(pos);
            }
            self.access_order.push_back(fingerprint.to_string());
            return self.gpu_textures.get(fingerprint);
        }

        // Not on GPU: request background load if disk path exists
        if let Some(p) = disk_path {
            let mut pending = self.pending_requests.lock();
            if !pending.contains_key(fingerprint) && p.exists() {
                pending.insert(fingerprint.to_string(), true);
                let _ = self.request_tx.send((fingerprint.to_string(), p.clone()));
                ctx.request_repaint_after(std::time::Duration::from_millis(50));
            }
        }

        None
    }

    /// Convenience getter for `Path`
    pub fn get(
        &mut self,
        fingerprint: &str,
        path: &std::path::Path,
        ctx: &Context,
    ) -> Option<&TextureHandle> {
        let pb = path.to_path_buf();
        self.get_or_request(ctx, fingerprint, Some(&pb))
    }

    /// Number of textures currently allocated in GPU VRAM
    pub fn loaded_gpu_count(&self) -> usize {
        self.gpu_textures.len()
    }

    /// Estimated GPU VRAM usage in megabytes (assuming 320x180 RGBA average)
    pub fn estimated_vram_mb(&self) -> f32 {
        (self.gpu_textures.len() as f32 * 320.0 * 180.0 * 4.0) / (1024.0 * 1024.0)
    }
}

impl Default for LruTextureCache {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_lru_texture_cache_cap() {
        let mut cache = LruTextureCache::new();
        cache.max_textures = 3;

        // Dummy textures
        let dummy_img = ColorImage::example();
        let ctx = Context::default();

        for i in 0..5 {
            let handle = ctx.load_texture(
                format!("t{}", i),
                dummy_img.clone(),
                TextureOptions::NEAREST,
            );
            cache.insert_texture(format!("fp_{}", i), handle);
        }

        assert_eq!(
            cache.loaded_gpu_count(),
            3,
            "Must not exceed max_textures cap"
        );
        assert!(!cache.gpu_textures.contains_key("fp_0"));
        assert!(!cache.gpu_textures.contains_key("fp_1"));
        assert!(cache.gpu_textures.contains_key("fp_2"));
        assert!(cache.gpu_textures.contains_key("fp_3"));
        assert!(cache.gpu_textures.contains_key("fp_4"));
    }
}
