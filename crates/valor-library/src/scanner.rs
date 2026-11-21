use crate::parser::parse_media_filename;
use chrono::Utc;
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tracing::{error, info};
use valor_core::db::Database;
use valor_core::fingerprint::compute_fingerprint;
use valor_core::models::MediaItem;
use walkdir::WalkDir;

const MEDIA_EXTENSIONS: &[&str] = &[
    "mkv", "mp4", "avi", "mov", "wmv", "flv", "webm", "m4v", "ts", "m2ts", "vob", "mpg", "mpeg",
    "iso",
];

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ScanProgress {
    pub files_seen: usize,
    pub files_new: usize,
    pub files_updated: usize,
    pub files_removed: usize,
    pub errors_count: usize,
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
    progress_callback: F,
) -> Result<ScanProgress, String>
where
    F: Fn(ScanProgress) + Send + Sync,
{
    info!("Starting scan on directory: {:?}", root_dir);

    if !root_dir.exists() || !root_dir.is_dir() {
        return Err(format!("Directory does not exist: {:?}", root_dir));
    }

    // 1. Collect all media candidate paths
    let mut candidate_paths: Vec<PathBuf> = Vec::new();
    for entry in WalkDir::new(root_dir).into_iter().filter_map(|e| e.ok()) {
        if cancel_flag.load(Ordering::Relaxed) {
            info!("Directory scan canceled by user");
            break;
        }

        let p = entry.path();
        if p.is_file() && is_media_file(p) {
            candidate_paths.push(p.to_path_buf());
        }
    }

    let mut progress = ScanProgress {
        files_seen: candidate_paths.len(),
        ..Default::default()
    };
    progress_callback(progress.clone());

    // 2. Parallel processing of media items (fingerprinting + parsing)
    let processed_items: Vec<Result<MediaItem, String>> = candidate_paths
        .par_iter()
        .map(|path| {
            if cancel_flag.load(Ordering::Relaxed) {
                return Err("Canceled".to_string());
            }

            let meta = path
                .metadata()
                .map_err(|e| format!("Failed to read metadata for {:?}: {}", path, e))?;
            let size_bytes = meta.len();

            let fingerprint = compute_fingerprint(path)
                .map_err(|e| format!("Fingerprint error for {:?}: {}", path, e))?;

            let path_str = path.to_string_lossy().to_string();
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

            let item = MediaItem {
                id: format!("item_{}", fingerprint),
                fingerprint,
                file_path: path_str,
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

            Ok(item)
        })
        .collect();

    // 3. Insert into database
    for result in processed_items {
        match result {
            Ok(item) => {
                if let Err(e) = db.upsert_item(&item) {
                    error!("Failed to upsert item {}: {:?}", item.title, e);
                    progress.errors_count += 1;
                } else {
                    progress.files_new += 1;
                }
            }
            Err(e) => {
                if e != "Canceled" {
                    progress.errors_count += 1;
                }
            }
        }
        progress_callback(progress.clone());
    }

    info!(
        "Scan completed. Files seen: {}, added: {}, errors: {}",
        progress.files_seen, progress.files_new, progress.errors_count
    );

    Ok(progress)
}
