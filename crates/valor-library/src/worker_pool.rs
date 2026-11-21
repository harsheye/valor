use libmpv2::Mpv;
use parking_lot::Mutex;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::thread::sleep;
use std::time::{Duration, Instant};
use thiserror::Error;
use tracing::{debug, error};

pub const MAX_HEADLESS_WORKERS: usize = 2;

#[derive(Error, Debug)]
pub enum WorkerError {
    #[error("Failed to initialize headless mpv: {0}")]
    Init(String),
    #[error("Mpv command error: {0}")]
    Mpv(String),
    #[error("File load timed out after {0:?}")]
    Timeout(Duration),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone)]
pub struct ProbeResult {
    pub duration: f64,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub tracks_json: String,
    pub thumbnail_path: Option<PathBuf>,
}

pub struct HeadlessWorker {
    mpv: Mpv,
}

impl HeadlessWorker {
    pub fn new() -> Result<Self, WorkerError> {
        let mpv = Mpv::with_initializer(|init| {
            init.set_property("vo", "null")?;
            init.set_property("ao", "null")?;
            init.set_property("hwdec", "no")?;
            init.set_property("pause", true)?;
            init.set_property("idle", true)?;
            init.set_property("demuxer-max-bytes", 4 * 1024 * 1024)?;
            Ok(())
        })
        .map_err(|e| WorkerError::Init(format!("{:?}", e)))?;

        Ok(Self { mpv })
    }

    pub fn probe_and_thumbnail(
        &mut self,
        path: &Path,
        thumb_dest: Option<&Path>,
        seek_pos: Option<f64>,
    ) -> Result<ProbeResult, WorkerError> {
        let path_str = path.to_string_lossy().to_string();
        debug!("Headless worker loading file: {}", path_str);

        self.mpv
            .command("loadfile", &[&path_str, "replace"])
            .map_err(|e| WorkerError::Mpv(format!("{:?}", e)))?;

        // Wait for file to be loaded
        let start_time = Instant::now();
        let timeout = Duration::from_secs(5);
        let mut loaded = false;

        while start_time.elapsed() < timeout {
            // Drain mpv events
            let _ = self.mpv.wait_event(0.01);
            if let Ok(tracks) = self.mpv.get_property::<String>("track-list") {
                if !tracks.is_empty() && tracks != "[]" {
                    loaded = true;
                    break;
                }
            }
            sleep(Duration::from_millis(15));
        }

        if !loaded {
            let _ = self.mpv.command("stop", &[]);
            return Err(WorkerError::Timeout(timeout));
        }

        let duration = self.mpv.get_property::<f64>("duration").unwrap_or(0.0);
        let width = self.mpv.get_property::<i64>("width").ok();
        let height = self.mpv.get_property::<i64>("height").ok();
        let video_codec = self.mpv.get_property::<String>("video-format").ok();
        let audio_codec = self.mpv.get_property::<String>("audio-codec-name").ok();
        let tracks_json = self
            .mpv
            .get_property::<String>("track-list")
            .unwrap_or_else(|_| "[]".to_string());

        let mut thumbnail_path = None;
        if let Some(dest) = thumb_dest {
            if let Some(parent) = dest.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let pos = seek_pos.unwrap_or(if duration > 10.0 {
                0.10 * duration
            } else {
                0.5
            });
            let pos_str = format!("{:.2}", pos);
            let _ = self.mpv.command("seek", &[&pos_str, "absolute+exact"]);
            sleep(Duration::from_millis(20));

            let dest_str = dest.to_string_lossy().replace('\\', "/");
            match self
                .mpv
                .command("screenshot-to-file", &[&dest_str, "video"])
            {
                Ok(_) => {
                    thumbnail_path = Some(dest.to_path_buf());
                }
                Err(e) => {
                    error!("Screenshot failed for {}: {:?}", path_str, e);
                }
            }
        }

        // Return worker to idle state
        let _ = self.mpv.command("stop", &[]);

        Ok(ProbeResult {
            duration,
            width,
            height,
            video_codec,
            audio_codec,
            tracks_json,
            thumbnail_path,
        })
    }
}

use std::sync::atomic::{AtomicUsize, Ordering};

/// A small, thread-safe pool of at most 2 headless mpv instances, reused across probe
/// and thumbnail extraction jobs.
#[derive(Clone)]
pub struct MpvWorkerPool {
    pool: Arc<Mutex<Vec<HeadlessWorker>>>,
    spawned_count: Arc<AtomicUsize>,
}

impl MpvWorkerPool {
    pub fn new() -> Self {
        Self {
            pool: Arc::new(Mutex::new(Vec::with_capacity(MAX_HEADLESS_WORKERS))),
            spawned_count: Arc::new(AtomicUsize::new(0)),
        }
    }

    /// Acquires an idle worker or creates a new one (strictly capped at MAX_HEADLESS_WORKERS)
    fn acquire(&self) -> Result<HeadlessWorker, WorkerError> {
        loop {
            {
                let mut pool = self.pool.lock();
                if let Some(worker) = pool.pop() {
                    return Ok(worker);
                }
            }

            // Attempt to atomically claim a spawn slot if under MAX_HEADLESS_WORKERS
            let current = self.spawned_count.load(Ordering::SeqCst);
            if current < MAX_HEADLESS_WORKERS
                && self
                    .spawned_count
                    .compare_exchange(current, current + 1, Ordering::SeqCst, Ordering::SeqCst)
                    .is_ok()
            {
                match HeadlessWorker::new() {
                    Ok(worker) => return Ok(worker),
                    Err(e) => {
                        self.spawned_count.fetch_sub(1, Ordering::SeqCst);
                        return Err(e);
                    }
                }
            }

            // Wait for a worker to be returned to the pool
            sleep(Duration::from_millis(15));
        }
    }

    fn release(&self, worker: HeadlessWorker) {
        let mut pool = self.pool.lock();
        pool.push(worker);
    }

    pub fn probe_and_thumbnail(
        &self,
        path: &Path,
        thumb_dest: Option<&Path>,
        seek_pos: Option<f64>,
    ) -> Result<ProbeResult, WorkerError> {
        let mut worker = self.acquire()?;
        let result = worker.probe_and_thumbnail(path, thumb_dest, seek_pos);
        self.release(worker);
        result
    }
}

impl Default for MpvWorkerPool {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_worker_pool_probe_and_thumbnail() {
        let clip_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("tests/fixtures/media/clip_01_multitrack.mkv");
        assert!(clip_path.exists());

        let out_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("target/pool_thumbs");
        let thumb_path = out_dir.join("pool_thumb.webp");

        let pool = MpvWorkerPool::new();
        let res = pool
            .probe_and_thumbnail(&clip_path, Some(&thumb_path), Some(0.5))
            .expect("Headless worker probe failed");

        assert!(res.duration > 0.0);
        assert!(!res.tracks_json.is_empty());
        assert!(thumb_path.exists());
        let meta = std::fs::metadata(&thumb_path).unwrap();
        assert!(meta.len() > 100);
    }
}
