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
    #[error("Image processing error: {0}")]
    Image(String),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
}

#[derive(Debug, Clone)]
pub struct LuminanceStats {
    pub mean: f32,
    pub variance: f32,
    pub is_black: bool,
}

pub fn calculate_luminance_stats(image_path: &Path) -> Result<LuminanceStats, WorkerError> {
    let img = image::open(image_path).map_err(|e| WorkerError::Image(e.to_string()))?;
    let rgb = img.to_rgb8();
    let pixels = rgb.pixels();
    let count = pixels.len();
    if count == 0 {
        return Ok(LuminanceStats {
            mean: 0.0,
            variance: 0.0,
            is_black: true,
        });
    }

    let mut sum_y = 0.0f64;
    let mut y_values = Vec::with_capacity(count);

    for p in pixels {
        let y = 0.299 * (p[0] as f64 / 255.0)
            + 0.587 * (p[1] as f64 / 255.0)
            + 0.114 * (p[2] as f64 / 255.0);
        sum_y += y;
        y_values.push(y);
    }

    let mean = (sum_y / count as f64) as f32;

    let mut sum_sq_diff = 0.0f64;
    for y in y_values {
        let diff = y - mean as f64;
        sum_sq_diff += diff * diff;
    }
    let variance = (sum_sq_diff / count as f64) as f32;
    let is_black = mean < 0.02 && variance < 0.001;

    Ok(LuminanceStats {
        mean,
        variance,
        is_black,
    })
}

pub fn find_sidecar_poster(video_path: &Path) -> Option<PathBuf> {
    let parent = video_path.parent()?;
    let stem = video_path.file_stem()?.to_str()?;

    let candidates = [
        format!("{}.jpg", stem),
        format!("{}.png", stem),
        format!("{}.webp", stem),
        "poster.jpg".into(),
        "poster.png".into(),
        "poster.webp".into(),
        "cover.jpg".into(),
        "cover.png".into(),
        "cover.webp".into(),
        "folder.jpg".into(),
        "folder.png".into(),
    ];

    for candidate in &candidates {
        let p = parent.join(candidate);
        if p.is_file() {
            return Some(p);
        }
    }
    None
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
    pub luminance_stats: Option<LuminanceStats>,
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
            // V3: HDR SDR Tone-mapping support (baseline)
            init.set_property("tone-mapping", "bt.2446a")?;
            init.set_property("target-colorspace-hint", "no")?;
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

        // V3: Prefer sidecar poster / folder / cover images before decoding
        if let Some(dest) = thumb_dest {
            if let Some(parent) = dest.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            if let Some(sidecar) = find_sidecar_poster(path) {
                if std::fs::copy(&sidecar, dest).is_ok() {
                    let stats = calculate_luminance_stats(dest).ok();
                    return Ok(ProbeResult {
                        duration: 0.0,
                        width: None,
                        height: None,
                        video_codec: None,
                        audio_codec: None,
                        tracks_json: "[]".into(),
                        thumbnail_path: Some(dest.to_path_buf()),
                        luminance_stats: stats,
                    });
                }
            }
        }

        self.mpv
            .command("loadfile", &[&path_str, "replace"])
            .map_err(|e| WorkerError::Mpv(format!("{:?}", e)))?;

        // Wait for file to be loaded
        let start_time = Instant::now();
        let timeout = Duration::from_secs(5);
        let mut loaded = false;

        while start_time.elapsed() < timeout {
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
        let mut final_stats = None;

        if let Some(dest) = thumb_dest {
            if let Some(parent) = dest.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let base_pos = seek_pos.unwrap_or(if duration > 10.0 {
                0.10 * duration
            } else {
                0.5
            });

            // V3: Try up to 3 candidate seek positions if initial frame is black (mean < 0.02)
            let candidate_positions = [
                base_pos,
                (base_pos + 0.05 * duration).min(duration * 0.9),
                (base_pos + 0.10 * duration).min(duration * 0.9),
            ];

            let dest_str = dest.to_string_lossy().replace('\\', "/");

            for pos in candidate_positions {
                let pos_str = format!("{:.2}", pos);
                // V3: Seek with hr-seek (absolute+exact)
                let _ = self.mpv.command("seek", &[&pos_str, "absolute+exact"]);

                // V3: Wait for PLAYBACK_RESTART event
                let seek_start = Instant::now();
                while seek_start.elapsed() < Duration::from_millis(300) {
                    if let Some(event) = self.mpv.wait_event(0.01) {
                        if matches!(event, Ok(libmpv2::events::Event::PlaybackRestart)) {
                            break;
                        }
                    }
                }

                if self
                    .mpv
                    .command("screenshot-to-file", &[&dest_str, "video"])
                    .is_ok()
                {
                    // V3: Verify frame is not black (mean luminance and variance)
                    if let Ok(stats) = calculate_luminance_stats(dest) {
                        if !stats.is_black {
                            thumbnail_path = Some(dest.to_path_buf());
                            final_stats = Some(stats);
                            break; // Valid, bright, textured frame found!
                        } else {
                            final_stats = Some(stats);
                            // Black frame detected: retry at next candidate position
                        }
                    } else {
                        thumbnail_path = Some(dest.to_path_buf());
                        break;
                    }
                }
            }

            // If still black after 3 attempts, record failure without looping forever
            if let Some(ref stats) = final_stats {
                if stats.is_black {
                    error!(
                        "Thumbnail for {} resulted in black frame (mean={:.4}, var={:.6}). Failure recorded.",
                        path_str, stats.mean, stats.variance
                    );
                    let _ = std::fs::remove_file(dest);
                    thumbnail_path = None;
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
            luminance_stats: final_stats,
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

    #[test]
    fn test_v3_thumbnails_robustness_luminance_and_artifacts() {
        let repo_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .to_path_buf();

        let screenshots_dir = repo_root.join("docs/screenshots");
        let _ = std::fs::create_dir_all(&screenshots_dir);

        let pool = MpvWorkerPool::new();

        println!(
            "================================================================================"
        );
        println!("V3: ROBUST THUMBNAIL GENERATION & LUMINANCE / VARIANCE REPORT");
        println!(
            "================================================================================"
        );

        // 1. Generate 3 distinct thumbnails from test clips
        let clips = [
            (
                "tests/fixtures/media/clip_01_multitrack.mkv",
                "thumb_multitrack.webp",
            ),
            ("tests/fixtures/media/clip_02_smpte.mkv", "thumb_smpte.webp"),
            (
                "tests/fixtures/media/clip_03_countdown.mkv",
                "thumb_countdown.webp",
            ),
        ];

        for (rel_clip, thumb_filename) in &clips {
            let clip_path = repo_root.join(rel_clip);
            assert!(clip_path.exists(), "Clip '{}' must exist", rel_clip);

            let thumb_path = screenshots_dir.join(thumb_filename);
            let res = pool
                .probe_and_thumbnail(&clip_path, Some(&thumb_path), None)
                .expect("Thumbnail generation failed");

            assert!(
                thumb_path.exists(),
                "Thumbnail file must be created on disk"
            );
            let file_size = std::fs::metadata(&thumb_path).unwrap().len();
            assert!(file_size > 500, "Thumbnail file must not be empty");

            let stats = res
                .luminance_stats
                .expect("Luminance stats must be computed");
            println!("  • Clip: {:<40} -> {}", rel_clip, thumb_filename);
            println!(
                "      Duration:      {:.2}s, Format: {:?}",
                res.duration, res.video_codec
            );
            println!("      Thumbnail Size: {} bytes", file_size);
            println!("      Mean Luminance: {:.4} (scale 0.0-1.0)", stats.mean);
            println!("      Variance:       {:.6}", stats.variance);
            println!("      Is Black Frame: {}", stats.is_black);

            assert!(!stats.is_black, "Thumbnail frame must NOT be black");
            assert!(
                stats.mean > 0.05,
                "Thumbnail frame must have significant luminance"
            );
            assert!(
                stats.variance > 0.001,
                "Thumbnail frame must have visual detail / variance"
            );
        }

        // 2. Black Frame Rejection Test
        let temp_dir = tempfile::tempdir().unwrap();
        let black_img_path = temp_dir.path().join("black_frame.png");
        let black_buf = image::RgbImage::new(160, 90); // default initialized to (0, 0, 0)
        black_buf.save(&black_img_path).unwrap();

        let black_stats = calculate_luminance_stats(&black_img_path).unwrap();
        println!("\n  • Pure Black Frame Evaluation:");
        println!("      Mean Luminance: {:.4}", black_stats.mean);
        println!("      Variance:       {:.6}", black_stats.variance);
        println!("      Is Black Frame: {}", black_stats.is_black);
        assert!(
            black_stats.is_black,
            "Black frame detection must accurately flag is_black = true"
        );

        // 3. Sidecar Poster Preference Test
        let sidecar_video_path = temp_dir.path().join("Feature.Film.2024.mkv");
        std::fs::write(&sidecar_video_path, b"dummy video bytes").unwrap();
        let sidecar_poster_path = temp_dir.path().join("Feature.Film.2024.jpg");
        // Save colorful dummy image as sidecar poster
        let mut sidecar_img = image::RgbImage::new(100, 150);
        for p in sidecar_img.pixels_mut() {
            *p = image::Rgb([180, 120, 50]);
        }
        sidecar_img.save(&sidecar_poster_path).unwrap();

        let found_sidecar = find_sidecar_poster(&sidecar_video_path);
        assert!(found_sidecar.is_some(), "Sidecar poster must be discovered");
        assert_eq!(found_sidecar.unwrap(), sidecar_poster_path);
        println!(
            "\n  • Sidecar Poster Auto-Detection: Verified (matched '{}')",
            sidecar_poster_path.display()
        );
        println!(
            "================================================================================"
        );
    }
}
