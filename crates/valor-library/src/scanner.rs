use crate::parser::parse_media_filename;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::thread::sleep;
use std::time::Duration;
use tracing::{debug, error, info};
use valor_core::db::Database;
use valor_core::fingerprint::compute_fingerprint;
use valor_core::models::{MediaItem, ScannedFileRecord};
use walkdir::WalkDir;

const MEDIA_EXTENSIONS: &[&str] = &[
    "mkv", "mp4", "avi", "mov", "wmv", "flv", "webm", "m4v", "ts", "m2ts", "vob", "mpg", "mpeg",
    "iso",
];

const BATCH_SIZE: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScanFileError {
    pub path: String,
    pub error: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ScanProgress {
    pub files_seen: usize,
    pub files_new: usize,
    pub files_updated: usize,
    pub files_skipped: usize,
    pub errors_count: usize,
    pub file_errors: Vec<ScanFileError>,
    pub current_path: Option<String>,
}

pub fn is_media_file(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|s| s.to_str()) {
        MEDIA_EXTENSIONS.contains(&ext.to_lowercase().as_str())
    } else {
        false
    }
}

pub fn scan_directory<F>(
    root_dir: &Path,
    db: &Database,
    cancel_flag: Arc<AtomicBool>,
    pause_flag: Arc<AtomicBool>,
    progress_callback: F,
) -> Result<ScanProgress, String>
where
    F: Fn(ScanProgress) + Send + Sync,
{
    info!("Starting incremental scan on directory: {:?}", root_dir);

    if !root_dir.exists() || !root_dir.is_dir() {
        return Err(format!("Directory does not exist: {:?}", root_dir));
    }

    let mut progress = ScanProgress::default();
    let mut batch: Vec<ScannedFileRecord> = Vec::with_capacity(BATCH_SIZE);

    // Load in-memory cache of existing files for instantaneous incremental checking
    let cache = db.get_all_cached_file_info().unwrap_or_default();

    // Follow symlinks and handle directory traversal gracefully
    for entry_res in WalkDir::new(root_dir).follow_links(true).into_iter() {
        // 1. Check cancellation
        if cancel_flag.load(Ordering::Relaxed) {
            info!("Directory scan canceled by user");
            break;
        }

        // 2. Check pausable
        while pause_flag.load(Ordering::Relaxed) {
            sleep(Duration::from_millis(25));
            if cancel_flag.load(Ordering::Relaxed) {
                break;
            }
        }
        if cancel_flag.load(Ordering::Relaxed) {
            break;
        }

        // 3. Handle traversal errors per-file without aborting
        let entry = match entry_res {
            Ok(e) => e,
            Err(e) => {
                let err_path = e
                    .path()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or_else(|| "<unknown>".to_string());
                let err_msg = format!("WalkDir error: {}", e);
                debug!(
                    "Scanner skipped unreadable entry: {} ({})",
                    err_path, err_msg
                );
                progress.errors_count += 1;
                progress.file_errors.push(ScanFileError {
                    path: err_path,
                    error: err_msg,
                });
                continue;
            }
        };

        let p = entry.path();
        if !p.is_file() || !is_media_file(p) {
            continue;
        }

        progress.files_seen += 1;
        let path_str = p.to_string_lossy().to_string();
        progress.current_path = Some(path_str.clone());

        // 4. Read metadata (size and mtime)
        let meta = match fs::metadata(p) {
            Ok(m) => m,
            Err(e) => {
                progress.errors_count += 1;
                progress.file_errors.push(ScanFileError {
                    path: path_str,
                    error: format!("Metadata read error: {}", e),
                });
                continue;
            }
        };

        let size_bytes = meta.len();
        let mtime_secs = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);

        // 5. Incremental check: size + mtime against in-memory cache
        if let Some(cached) = cache.get(&path_str) {
            if cached.size_bytes == size_bytes && cached.mtime_secs == mtime_secs {
                progress.files_skipped += 1;
                if progress.files_seen % 500 == 0 {
                    progress_callback(progress.clone());
                }
                continue;
            }
        }

        // 6. Compute fingerprint
        let fingerprint = match compute_fingerprint(p) {
            Ok(fp) => fp,
            Err(e) => {
                progress.errors_count += 1;
                progress.file_errors.push(ScanFileError {
                    path: path_str,
                    error: format!("Fingerprint error: {}", e),
                });
                continue;
            }
        };

        // 7. Parse filename tags
        let parsed = parse_media_filename(&path_str);
        let now = Utc::now();
        let is_hdr = path_str.to_lowercase().contains("hdr")
            || path_str.to_lowercase().contains("2160p")
            || path_str.to_lowercase().contains("10bit");

        let video_codec = if path_str.to_lowercase().contains("hevc")
            || path_str.to_lowercase().contains("h.265")
            || path_str.to_lowercase().contains("x265")
        {
            Some("HEVC".to_string())
        } else if path_str.to_lowercase().contains("av1") {
            Some("AV1".to_string())
        } else {
            Some("H.264".to_string())
        };

        let audio_codec = if path_str.to_lowercase().contains("atmos") {
            Some("Dolby Atmos".to_string())
        } else if path_str.to_lowercase().contains("ddp")
            || path_str.to_lowercase().contains("e-ac-3")
            || path_str.to_lowercase().contains("eac3")
        {
            Some("E-AC-3".to_string())
        } else if path_str.to_lowercase().contains("dts") {
            Some("DTS".to_string())
        } else {
            Some("AAC".to_string())
        };

        let path_hash = blake3::hash(path_str.as_bytes()).to_hex();

        let item = MediaItem {
            id: format!("item_{}", path_hash),
            fingerprint: fingerprint.clone(),
            file_path: path_str.clone(),
            title: parsed.title,
            duration: 0.0,
            size_bytes,
            width: if is_hdr { Some(3840) } else { Some(1920) },
            height: if is_hdr { Some(2160) } else { Some(1080) },
            is_hdr,
            video_codec,
            audio_codec,
            series_id: None,
            season_number: parsed.season,
            episode_number: parsed.episode,
            is_missing: false,
            created_at: now,
            updated_at: now,
        };

        let file_id = format!("file_{}", path_hash);
        batch.push(ScannedFileRecord {
            id: file_id,
            path: path_str,
            size_bytes,
            mtime_secs,
            fingerprint,
            legacy_fingerprint: None,
            item,
        });

        progress.files_new += 1;

        // 8. Commit batch if reaching BATCH_SIZE
        if batch.len() >= BATCH_SIZE {
            if let Err(e) = db.batch_upsert_scanned_files(&batch) {
                error!("Batch upsert failed: {:?}", e);
                progress.errors_count += batch.len();
            }
            batch.clear();
            progress_callback(progress.clone());
        }
    }

    // Flush any remaining items in batch
    if !batch.is_empty() {
        if let Err(e) = db.batch_upsert_scanned_files(&batch) {
            error!("Final batch upsert failed: {:?}", e);
            progress.errors_count += batch.len();
        }
        batch.clear();
    }

    progress.current_path = None;
    progress_callback(progress.clone());

    info!(
        "Scan completed. Seen: {}, New/Updated: {}, Skipped: {}, Errors: {}",
        progress.files_seen, progress.files_new, progress.files_skipped, progress.errors_count
    );

    Ok(progress)
}
