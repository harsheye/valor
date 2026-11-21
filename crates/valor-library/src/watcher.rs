use crate::parser::parse_media_filename;
use crate::scanner::is_media_file;
use chrono::Utc;
use notify::{Config, Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver};
use std::time::{Duration, Instant};
use tracing::{error, info};
use valor_core::db::Database;
use valor_core::fingerprint::compute_fingerprint;
use valor_core::models::{MediaItem, ScannedFileRecord};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WatcherProgressEvent {
    FileDiscovered(PathBuf),
    FileStabilizing {
        path: PathBuf,
        current_size: u64,
        elapsed_millis: u64,
    },
    FileIngested(PathBuf),
    FileRelinked {
        old_path: PathBuf,
        new_path: PathBuf,
        fingerprint: String,
    },
    FileRemoved(PathBuf),
    Ignored(PathBuf, String),
}

#[derive(Debug, Clone)]
pub struct FolderWatchConfig {
    pub path: PathBuf,
    pub folder_type: String, // 'Movies', 'Shows', 'Music', 'Other'
    pub ignore_globs: Vec<String>,
    pub debounce_stability_millis: u64, // e.g. 1000ms
}

impl Default for FolderWatchConfig {
    fn default() -> Self {
        Self {
            path: PathBuf::new(),
            folder_type: "Other".into(),
            ignore_globs: vec![
                "*.tmp".into(),
                "*.part".into(),
                "*.crdownload".into(),
                "*.!ut".into(),
                "*.aria2".into(),
                "*.~*".into(),
                "*.nfo".into(),
                "*.txt".into(),
                "*.sample.*".into(),
            ],
            debounce_stability_millis: 1000,
        }
    }
}

pub struct ActiveWatcher {
    _watcher: RecommendedWatcher,
    pub rx: Receiver<notify::Result<Event>>,
    pub config: FolderWatchConfig,
    pub pending_writes: HashMap<PathBuf, (u64, Instant)>,
}

impl ActiveWatcher {
    pub fn new(config: FolderWatchConfig) -> Result<Self, notify::Error> {
        let (tx, rx) = channel();
        let mut watcher = RecommendedWatcher::new(
            move |res| {
                let _ = tx.send(res);
            },
            Config::default().with_poll_interval(Duration::from_millis(500)),
        )?;

        if config.path.exists() {
            watcher.watch(&config.path, RecursiveMode::Recursive)?;
        }

        Ok(Self {
            _watcher: watcher,
            rx,
            config,
            pending_writes: HashMap::new(),
        })
    }

    /// Checks if a file path matches any configured ignore globs
    pub fn is_ignored(&self, path: &Path) -> Option<String> {
        let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        for glob in &self.config.ignore_globs {
            if glob.starts_with("*.") && name.ends_with(&glob[1..]) {
                return Some(glob.clone());
            }
            if glob.ends_with(".*") && name.starts_with(&glob[..glob.len() - 1]) {
                return Some(glob.clone());
            }
            if glob.starts_with('*') && glob.ends_with('*') {
                let inner = &glob[1..glob.len() - 1];
                if name.contains(inner) {
                    return Some(glob.clone());
                }
            }
        }
        None
    }

    /// Processes pending file events, enforcing debounce size stability,
    /// rename/move relinking by fingerprint, and database ingestion.
    pub fn tick<F>(&mut self, db: &Database, mut on_event: F)
    where
        F: FnMut(WatcherProgressEvent),
    {
        // 1. Drain incoming filesystem notifications
        while let Ok(res) = self.rx.try_recv() {
            if let Ok(event) = res {
                for path in event.paths {
                    // Check ignore globs
                    if let Some(glob) = self.is_ignored(&path) {
                        on_event(WatcherProgressEvent::Ignored(path.clone(), glob));
                        continue;
                    }

                    match event.kind {
                        EventKind::Create(_) | EventKind::Modify(_) => {
                            if path.is_file() && is_media_file(&path) {
                                if let Ok(meta) = fs::metadata(&path) {
                                    let size = meta.len();
                                    use std::collections::hash_map::Entry;
                                    if let Entry::Vacant(e) =
                                        self.pending_writes.entry(path.clone())
                                    {
                                        on_event(WatcherProgressEvent::FileDiscovered(path));
                                        e.insert((size, Instant::now()));
                                    }
                                }
                            }
                        }
                        EventKind::Remove(_) => {
                            self.pending_writes.remove(&path);
                            let path_str = path.to_string_lossy().to_string();
                            let _ = db.mark_file_missing(&path_str);
                            on_event(WatcherProgressEvent::FileRemoved(path));
                        }
                        _ => {}
                    }
                }
            }
        }

        // 2. Check size stability for pending files
        let mut ready_to_ingest = Vec::new();
        let mut still_pending = HashMap::new();
        let required_stability = Duration::from_millis(self.config.debounce_stability_millis);

        for (path, (last_size, first_seen)) in self.pending_writes.drain() {
            match fs::metadata(&path) {
                Ok(meta) => {
                    let current_size = meta.len();
                    if current_size != last_size {
                        // File is still being actively written / appended to!
                        on_event(WatcherProgressEvent::FileStabilizing {
                            path: path.clone(),
                            current_size,
                            elapsed_millis: first_seen.elapsed().as_millis() as u64,
                        });
                        // Reset timer with new size
                        still_pending.insert(path, (current_size, Instant::now()));
                    } else if first_seen.elapsed() >= required_stability {
                        // Size has remained completely stable for N duration: Ready to ingest!
                        ready_to_ingest.push((path, current_size));
                    } else {
                        // Size unchanged but waiting for stability duration to elapse
                        still_pending.insert(path, (last_size, first_seen));
                    }
                }
                Err(_) => {
                    // File disappeared or was transient temp file
                }
            }
        }
        self.pending_writes = still_pending;

        // 3. Ingest stable files and check for Rename/Move relinking
        for (path, size_bytes) in ready_to_ingest {
            let path_str = path.to_string_lossy().to_string();
            let fingerprint = match compute_fingerprint(&path) {
                Ok(fp) => fp,
                Err(e) => {
                    error!("Fingerprint error for {:?}: {:?}", path, e);
                    continue;
                }
            };

            // Check if this fingerprint already exists in media_files under an old path (Rename/Move)
            if let Ok(Some(existing_item)) = db.find_item_by_fingerprint(&fingerprint) {
                if existing_item.file_path != path_str {
                    // RENAME / MOVE RELINKING: Path changed, but fingerprint is identical!
                    info!(
                        "Relinking moved/renamed media: '{}' -> '{}'",
                        existing_item.file_path, path_str
                    );
                    let old_path = PathBuf::from(&existing_item.file_path);
                    let _ = db.relink_file_path(&existing_item.file_path, &path_str, &fingerprint);

                    on_event(WatcherProgressEvent::FileRelinked {
                        old_path,
                        new_path: path,
                        fingerprint,
                    });
                    continue;
                }
            }

            // Fresh file ingestion
            let parsed = parse_media_filename(&path_str);
            let now = Utc::now();
            let path_hash = blake3::hash(path_str.as_bytes()).to_hex();

            let item = MediaItem {
                id: format!("item_{}", path_hash),
                fingerprint: fingerprint.clone(),
                file_path: path_str.clone(),
                title: parsed.title,
                duration: 0.0,
                size_bytes,
                width: Some(1920),
                height: Some(1080),
                is_hdr: false,
                video_codec: parsed.video_codec,
                audio_codec: parsed.audio_codec,
                series_id: None,
                season_number: parsed.season,
                episode_number: parsed.episode,
                is_missing: false,
                created_at: now,
                updated_at: now,
            };

            let record = ScannedFileRecord {
                id: format!("file_{}", path_hash),
                path: path_str,
                size_bytes,
                mtime_secs: now.timestamp(),
                fingerprint,
                legacy_fingerprint: None,
                item,
            };

            let _ = db.batch_upsert_scanned_files(&[record]);
            on_event(WatcherProgressEvent::FileIngested(path));
        }
    }
}
