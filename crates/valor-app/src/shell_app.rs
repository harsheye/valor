//! Runs the library shell while the playback implementation is being replaced.

use eframe::egui;
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::{
        atomic::AtomicBool,
        mpsc::{self, Receiver, Sender},
        Arc,
    },
};
use valor_core::path_utils::path_is_within;
use valor_core::{
    db::Database,
    models::{HistoryEntry, MediaItem, PlaybackPosition, WatchSession},
};
use valor_library::scanner::{scan_directory, ScanProgress};
use valor_player::{PlaybackState, PlayerCommand};
use valor_player::{PlayerEvent, PlayerService};
use valor_ui::player_ui::PlayerUiState;
use valor_ui::view_models::LibraryTab;
use valor_ui::{
    icons::IconRegistry,
    shell::{ShellAction, ShellRenderer},
    shell_state::{FolderTreeNode, NavItem, ShellState},
    shell_tokens::ShellTokens,
};

enum ScanUiEvent {
    Progress(PathBuf, ScanProgress),
    Finished(PathBuf, Result<ScanProgress, String>),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum FileDialogKind {
    Disc,
    NetworkStream,
    CaptureDevice,
    ConvertSave,
    Stream,
}

const MIN_APP_WIDTH: f32 = 960.0;
const MIN_APP_HEIGHT: f32 = 600.0;

pub struct ValorShellApp {
    db: Database,
    state: ShellState,
    tokens: ShellTokens,
    icons: IconRegistry,
    items: Vec<MediaItem>,
    history: Vec<HistoryEntry>,
    sessions: Vec<WatchSession>,
    positions: HashMap<String, PlaybackPosition>,
    folders: Vec<PathBuf>,
    pending_remove: Option<PathBuf>,
    player: PlayerService,
    player_ui: PlayerUiState,
    player_error: Option<String>,
    player_render_error: std::sync::Arc<parking_lot::Mutex<Option<String>>>,
    scan_tx: Sender<ScanUiEvent>,
    scan_rx: Receiver<ScanUiEvent>,
    scanning: HashSet<PathBuf>,
    textures: valor_ui::LruTextureCache,
    playback_started_at: chrono::DateTime<chrono::Utc>,
    last_scan_refresh: std::time::Instant,
    pending_thumbnail: Option<PathBuf>,
    is_fullscreen: bool,
    is_pip: bool,
    was_focused: bool,
    dwm_border_cleared: bool,
    opening_media: Option<String>,
    pre_pip_inner_size: Option<egui::Vec2>,
    file_dialog: Option<(FileDialogKind, String)>,
    tmdb_tx: Sender<(String, valor_ui::shell_state::TmdbSeriesInfo)>,
    tmdb_rx: Receiver<(String, valor_ui::shell_state::TmdbSeriesInfo)>,
    tmdb_token: String,
    bookmark_sync_tx: Sender<BookmarkSyncResult>,
    bookmark_sync_rx: Receiver<BookmarkSyncResult>,
    telemetry_tx: Sender<(String, u64, Vec<String>, f32)>,
    telemetry_rx: Receiver<(String, u64, Vec<String>, f32)>,
    recs_tx: Sender<Vec<valor_ui::shell_state::TmdbRecommendation>>,
    recs_rx: Receiver<Vec<valor_ui::shell_state::TmdbRecommendation>>,
    server_tx: Sender<ServerWorkerMsg>,
    server_rx: Receiver<ServerWorkerMsg>,
    last_telemetry_tick: std::time::Instant,
    restored_tracks_token: u64,
    last_saved_tracks: Option<(String, Option<i64>, Option<i64>)>,
    last_deleted_session: Option<WatchSession>,
    trakt_tx: Sender<valor_ui::history::trakt::TraktSyncEvent>,
    trakt_rx: Receiver<valor_ui::history::trakt::TraktSyncEvent>,
}

enum ServerWorkerMsg {
    Connected {
        server: valor_core::settings::MediaServerConfig,
        libs: Vec<valor_ui::shell_state::ServerLibraryItem>,
        first_lib_id: Option<String>,
        items: Vec<valor_ui::shell_state::ServerMediaItem>,
    },
    LibraryItems {
        server_id: String,
        lib_id: String,
        items: Vec<valor_ui::shell_state::ServerMediaItem>,
    },
    Error(String),
}

struct BookmarkSyncResult {
    fingerprint: String,
    bookmarks: Vec<valor_core::models::Bookmark>,
    tmdb_rating: Option<f32>,
    tidb_synced: bool,
}

impl ValorShellApp {
    pub fn new() -> Self {
        let db_path = directories::ProjectDirs::from("com", "valor", "Valor")
            .map(|dirs| dirs.data_dir().join("valor.db"))
            .unwrap_or_else(|| PathBuf::from("valor.db"));
        if let Some(parent) = db_path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let db = Database::open(&db_path)
            .unwrap_or_else(|_| Database::in_memory().expect("open fallback database"));
        let mut items = db.get_all_items().unwrap_or_default();
        items.retain(|i| !i.is_missing && std::path::Path::new(&i.file_path).exists());
        let history = db.get_history(50).unwrap_or_default();
        let sessions = db.get_watch_sessions(50).unwrap_or_default();
        let positions = db.get_all_playback_positions().unwrap_or_default();
        let folder_records = db.get_folders().unwrap_or_default();
        let folders: Vec<PathBuf> = folder_records
            .iter()
            .map(|f| PathBuf::from(&f.path))
            .collect();
        let excluded_paths = folder_records
            .iter()
            .flat_map(|folder| db.get_excluded_paths(&folder.id).unwrap_or_default())
            .map(PathBuf::from)
            .collect();
        let (scan_tx, scan_rx) = mpsc::channel();
        let (tmdb_tx, tmdb_rx) = mpsc::channel();
        let (bookmark_sync_tx, bookmark_sync_rx) = mpsc::channel();
        let (telemetry_tx, telemetry_rx) = mpsc::channel();
        let (recs_tx, recs_rx) = mpsc::channel();
        let (server_tx, server_rx) = mpsc::channel();
        let mut state = ShellState::new();
        let tmdb_token = load_tmdb_token(&state.settings.tmdb_api_key);
        state.root_folders = folders.iter().cloned().map(FolderTreeNode::new).collect();
        state.excluded_paths = excluded_paths;
        state.folder_counts = db.folder_media_counts().unwrap_or_default();
        state.media_telemetry = db.get_all_media_telemetry().unwrap_or_default();
        let mut app = Self {
            db,
            state,
            tokens: ShellTokens::default(),
            icons: IconRegistry::new(),
            items,
            history,
            sessions,
            positions,
            folders,
            pending_remove: None,
            player: PlayerService::spawn(None),
            player_ui: PlayerUiState::default(),
            player_error: None,
            player_render_error: std::sync::Arc::new(parking_lot::Mutex::new(None)),
            scan_tx,
            scan_rx,
            scanning: HashSet::new(),
            textures: valor_ui::LruTextureCache::new(),
            playback_started_at: chrono::Utc::now(),
            last_scan_refresh: std::time::Instant::now(),
            pending_thumbnail: None,
            is_fullscreen: false,
            is_pip: false,
            was_focused: true,
            dwm_border_cleared: false,
            opening_media: None,
            pre_pip_inner_size: None,
            file_dialog: None,
            tmdb_tx,
            tmdb_rx,
            tmdb_token,
            bookmark_sync_tx,
            bookmark_sync_rx,
            telemetry_tx,
            telemetry_rx,
            recs_tx,
            recs_rx,
            server_tx,
            server_rx,
            last_telemetry_tick: std::time::Instant::now(),
            restored_tracks_token: 0,
            last_saved_tracks: None,
            last_deleted_session: None,
            trakt_tx: std::sync::mpsc::channel().0,
            trakt_rx: std::sync::mpsc::channel().1,
        };
        let (trakt_tx, trakt_rx) = std::sync::mpsc::channel();
        app.trakt_tx = trakt_tx;
        app.trakt_rx = trakt_rx;
        let _ = app.player.ensure_render_context();
        spawn_background_thumbnailer(&app.items, &app.state.excluded_paths);
        for folder in app.folders.clone() {
            app.start_scan(folder);
        }
        {
            let items_snapshot = app.items.clone();
            let tele_snapshot = app.state.media_telemetry.clone();
            let token = app.tmdb_token.clone();
            let tx = app.telemetry_tx.clone();
            let r_tx = app.recs_tx.clone();
            std::thread::spawn(move || {
                resolve_library_tmdb_and_recommendations(&items_snapshot, &tele_snapshot, &token, &tx, &r_tx);
            });
        }
        app
    }

    fn exit_pip(&mut self, ctx: &egui::Context) {
        if !self.is_pip {
            return;
        }
        self.is_pip = false;
        ctx.send_viewport_cmd(egui::ViewportCommand::WindowLevel(egui::WindowLevel::Normal));
        ctx.send_viewport_cmd(egui::ViewportCommand::MinInnerSize(egui::vec2(
            MIN_APP_WIDTH,
            MIN_APP_HEIGHT,
        )));
        let restore_size = self
            .pre_pip_inner_size
            .take()
            .unwrap_or(egui::vec2(1280.0, 720.0));
        ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(egui::vec2(
            restore_size.x.max(MIN_APP_WIDTH),
            restore_size.y.max(MIN_APP_HEIGHT),
        )));
    }

    fn open_single_file(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter(
                "Media Files",
                &[
                    "mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "ts", "mts", "m2ts",
                    "mp3", "flac", "wav", "ogg", "m4a", "aac",
                ],
            )
            .pick_file()
        {
            self.start_playback(path);
        }
    }

    fn open_multiple_files(&mut self) {
        if let Some(paths) = rfd::FileDialog::new()
            .add_filter(
                "Media Files",
                &[
                    "mp4", "mkv", "avi", "mov", "webm", "flv", "wmv", "m4v", "ts", "mts", "m2ts",
                    "mp3", "flac", "wav", "ogg", "m4a", "aac",
                ],
            )
            .pick_files()
        {
            if !paths.is_empty() {
                self.player_error = None;
                self.playback_started_at = chrono::Utc::now();
                if let Err(error) = self.player.send(PlayerCommand::Open {
                    paths,
                    start_index: 0,
                    start_position_secs: 0.0,
                    origin: valor_player::OpenOrigin::default(),
                }) {
                    self.player_error = Some(error);
                }
            }
        }
    }

    fn open_from_clipboard(&mut self) {
        if let Some(text) = read_clipboard_text() {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                let path = PathBuf::from(trimmed);
                if path.exists() || trimmed.contains("://") {
                    self.player_error = None;
                    self.playback_started_at = chrono::Utc::now();
                    if let Err(error) = self.player.send(PlayerCommand::Open {
                        paths: vec![path],
                        start_index: 0,
                        start_position_secs: 0.0,
                        origin: valor_player::OpenOrigin::default(),
                    }) {
                        self.player_error = Some(error);
                    }
                }
            }
        }
    }

    fn save_playlist_to_file(&self) {
        if let Some(save_path) = rfd::FileDialog::new()
            .set_file_name("valor_playlist.m3u8")
            .add_filter("M3U8 Playlist", &["m3u8", "m3u"])
            .save_file()
        {
            let mut content = String::from("#EXTM3U\n");
            for item in &self.items {
                if !item.is_missing {
                    content.push_str(&format!("#EXTINF:-1,{}\n{}\n", item.title, item.file_path));
                }
            }
            if let Err(error) = std::fs::write(&save_path, content) {
                tracing::error!(%error, "Failed to save playlist file");
            }
        }
    }

    fn choose_folder(&mut self) {
        if let Some(path) = rfd::FileDialog::new().pick_folder() {
            if !self.folders.contains(&path) && self.db.add_folder_path(&path).is_ok() {
                self.folders.push(path.clone());
                self.state.add_folder(path);
                if let Some(root) = self.folders.last().cloned() {
                    self.start_scan(root);
                }
            }
        }
    }

    fn start_playback(&mut self, selected_path: PathBuf) {
        self.state.mini_bar_dismissed_fingerprint = None;
        self.opening_media = selected_path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .or_else(|| Some("media".to_string()));
        let mut paths: Vec<PathBuf> = if let Some(ref folder) = self.state.selected_folder {
            // If in Folders view, queue only the items within the active folder scope
            let mut folder_items: Vec<PathBuf> = self
                .items
                .iter()
                .filter(|item| !item.is_missing)
                .filter(|item| {
                    let p = PathBuf::from(&item.file_path);
                    let s = p.to_string_lossy().to_ascii_lowercase();
                    !s.contains("$recycle.bin")
                        && !s.contains("system volume information")
                        && !s.contains(".trash")
                        && !p
                            .file_name()
                            .and_then(|n| n.to_str())
                            .is_some_and(|n| n.starts_with("$r") || n.starts_with("._"))
                        && path_is_within(&p, folder)
                })
                .map(|item| PathBuf::from(&item.file_path))
                .collect();
            folder_items.sort_by(|a, b| {
                let an = a.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                let bn = b.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                valor_core::path_utils::natural_cmp(&an, &bn)
            });
            if folder_items.is_empty() {
                vec![selected_path.clone()]
            } else {
                folder_items
            }
        } else if self.state.selected_nav == NavItem::Library && self.state.library_tab == LibraryTab::Series {
            // In Series view, group only the episodes belonging to this series/season folder
            let mut series_items: Vec<PathBuf> = Vec::new();
            if let Some(parent) = selected_path.parent() {
                for item in &self.items {
                    if !item.is_missing {
                        let p = PathBuf::from(&item.file_path);
                        if p.parent() == Some(parent) {
                            series_items.push(p);
                        }
                    }
                }
            }
            if series_items.is_empty() {
                vec![selected_path.clone()]
            } else {
                series_items.sort_by(|a, b| {
                    let an = a.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    let bn = b.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    valor_core::path_utils::natural_cmp(&an, &bn)
                });
                series_items
            }
        } else {
            // Single item from Movies, History, Search, etc. -> ONLY 1 item in queue!
            vec![selected_path.clone()]
        };

        let selected_str = selected_path.to_string_lossy();
        let find_selected = |list: &[PathBuf]| {
            list.iter().position(|p| {
                p == &selected_path || p.to_string_lossy().eq_ignore_ascii_case(&selected_str)
            })
        };
        if find_selected(&paths).is_none() {
            paths.insert(0, selected_path.clone());
        }
        let start_index = find_selected(&paths).unwrap_or(0);
        let start_position_secs = self
            .items
            .iter()
            .find(|item| std::path::Path::new(&item.file_path) == selected_path.as_path())
            .and_then(|item| self.positions.get(&item.fingerprint))
            .filter(|position| !position.completed)
            .map(|position| position.position_secs)
            .unwrap_or(0.0);
        self.playback_started_at = chrono::Utc::now();
        if let Err(error) = self.player.send(PlayerCommand::Open {
            paths,
            start_index,
            start_position_secs,
            origin: valor_player::OpenOrigin::default(),
        }) {
            self.opening_media = None;
            tracing::error!("Could not start playback: {error}");
        }
    }

    fn ensure_media_item_registered(&mut self, path: &std::path::Path) {
        if !path.is_file() {
            return;
        }
        let path_str = path.to_string_lossy();
        if self.items.iter().any(|item| {
            std::path::Path::new(&item.file_path) == path
                || item.file_path.eq_ignore_ascii_case(&path_str)
        }) {
            return;
        }
        let parsed = valor_library::parser::parse_media_filename(&path_str);
        let size_bytes = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        let fingerprint = format!("file:{}", path_str.to_lowercase());
        let id = uuid_like_id(&fingerprint);
        let item = MediaItem {
            id,
            fingerprint,
            file_path: path_str.to_string(),
            title: parsed.title,
            duration: 0.0,
            size_bytes,
            width: None,
            height: None,
            is_hdr: false,
            video_codec: None,
            audio_codec: None,
            series_id: None,
            season_number: parsed.season,
            episode_number: parsed.episode,
            is_missing: false,
            created_at: chrono::Utc::now(),
            updated_at: chrono::Utc::now(),
        };
        if let Err(error) = self.db.upsert_item(&item) {
            tracing::warn!(%error, "Could not register played media item in library");
        }
        self.items.push(item);
    }

    fn save_playback_session(
        &mut self,
        path: &std::path::Path,
        position_secs: f64,
        duration_secs: f64,
    ) {
        self.ensure_media_item_registered(path);
        let Some(mut item) = self
            .items
            .iter()
            .find(|item| std::path::Path::new(&item.file_path) == path)
            .cloned()
        else {
            return;
        };
        if duration_secs > 0.0 && (item.duration <= 0.0 || (item.duration - duration_secs).abs() > 1.0) {
            item.duration = duration_secs;
            item.updated_at = chrono::Utc::now();
            if let Some(existing) = self.items.iter_mut().find(|i| i.fingerprint == item.fingerprint) {
                existing.duration = duration_secs;
                existing.updated_at = item.updated_at;
            }
            let _ = self.db.upsert_item(&item);
        }
        let now = chrono::Utc::now();
        let position = PlaybackPosition {
            fingerprint: item.fingerprint.clone(),
            position_secs: position_secs.max(0.0),
            duration_secs: duration_secs.max(0.0),
            completed: duration_secs > 0.0 && position_secs / duration_secs >= 0.95,
            updated_at: now,
        };
        let start_pos_secs = self
            .positions
            .get(&item.fingerprint)
            .map(|value| value.position_secs)
            .unwrap_or(0.0);
        let session = WatchSession {
            id: format!("session_{}_{}", item.fingerprint, now.timestamp_millis()),
            fingerprint: item.fingerprint.clone(),
            collection_id: None,
            item_title: item.title.clone(),
            start_time: self.playback_started_at,
            end_time: now,
            start_pos_secs,
            end_pos_secs: position_secs.max(0.0),
            completed: position.completed,
            stopped_early: !position.completed,
        };
        match self.db.save_playback_session(&position, &session) {
            Ok(()) => {
                self.positions.insert(item.fingerprint.clone(), position);
                self.sessions.insert(0, session);
                self.sessions.truncate(50);
                self.history = self.db.get_history(50).unwrap_or_default();
            }
            Err(error) => tracing::error!("Could not save playback progress: {error}"),
        }
    }

    fn exclude_subfolder(&mut self, path: PathBuf) {
        let Some(root) = self
            .folders
            .iter()
            .filter(|root| path_is_within(&path, root))
            .max_by_key(|root| root.components().count())
            .cloned()
        else {
            tracing::warn!(
                "Selected exclusion is outside watched folders: {}",
                path.display()
            );
            return;
        };
        let result = self
            .db
            .get_folder_by_path(&root)
            .and_then(|record| {
                record.ok_or_else(|| valor_core::db::DbError::NotFound(root.display().to_string()))
            })
            .and_then(|record| self.db.exclude_subfolder(&record.id, &path));
        match result {
            Ok(()) => {
                let _ = self.db.purge_excluded_and_small_items();
                self.state.remove_tree_path(&path);
                self.refresh_exclusions();
                self.refresh_library_data();
            }
            Err(error) => tracing::error!("Could not exclude subfolder: {error}"),
        }
    }

    fn start_scan(&mut self, path: PathBuf) {
        if !self.scanning.insert(path.clone()) {
            return;
        }
        self.state
            .scan_status
            .insert(path.clone(), "Scanning…".to_owned());
        let db = self.db.clone();
        let tx = self.scan_tx.clone();
        let worker_path = path.clone();
        let progress_path = path.clone();
        let cancel = Arc::new(AtomicBool::new(false));
        let pause = Arc::new(AtomicBool::new(false));
        let spawn = std::thread::Builder::new()
            .name("valor-scan-worker".into())
            .spawn(move || {
                let progress_tx = tx.clone();
                let result = scan_directory(&worker_path, &db, cancel, pause, move |progress| {
                    let _ =
                        progress_tx.send(ScanUiEvent::Progress(progress_path.clone(), progress));
                });
                let _ = tx.send(ScanUiEvent::Finished(worker_path, result));
            });
        if let Err(error) = spawn {
            self.scanning.remove(&path);
            self.state
                .scan_status
                .insert(path, format!("Could not start scan: {error}"));
        }
    }

    fn refresh_library_data(&mut self) {
        self.refresh_scanned_items();
        self.history = self.db.get_history(50).unwrap_or_default();
        self.sessions = self.db.get_watch_sessions(50).unwrap_or_default();
        self.positions = self.db.get_all_playback_positions().unwrap_or_default();
        self.state.playlists = self.db.get_all_collections().unwrap_or_default();
    }

    fn refresh_scanned_items(&mut self) {
        let _ = self.db.purge_excluded_and_small_items();
        let mut items = self.db.get_all_items().unwrap_or_default();
        items.retain(|i| !i.is_missing && std::path::Path::new(&i.file_path).exists());
        self.items = items;
        self.state.folder_counts = self.db.folder_media_counts().unwrap_or_default();
        spawn_background_thumbnailer(&self.items, &self.state.excluded_paths);
    }

    fn refresh_exclusions(&mut self) {
        self.state.excluded_paths = self
            .db
            .get_folders()
            .unwrap_or_default()
            .iter()
            .flat_map(|folder| self.db.get_excluded_paths(&folder.id).unwrap_or_default())
            .map(PathBuf::from)
            .collect();
    }
}

impl Default for ValorShellApp {
    fn default() -> Self {
        Self::new()
    }
}

impl eframe::App for ValorShellApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        #[cfg(windows)]
        {
            use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR};
            use windows::Win32::UI::WindowsAndMessaging::FindWindowW;
            use windows::core::w;

            unsafe {
                if let Ok(hwnd) = FindWindowW(None, w!("Valor")) {
                    if !hwnd.is_invalid() {
                        let color: u32 = 0xFFFFFFFE;
                        let _ = DwmSetWindowAttribute(
                            hwnd,
                            DWMWA_BORDER_COLOR,
                            &color as *const _ as *const _,
                            std::mem::size_of::<u32>() as u32,
                        );
                    }
                }
            }
        }
        self.player.pump();
        while let Ok(event) = self.scan_rx.try_recv() {
            match event {
                ScanUiEvent::Progress(path, progress) => {
                    self.state.scan_status.insert(
                        path,
                        format!(
                            "Scanning: {} media files found · {} added/updated · {} errors",
                            progress.files_seen, progress.files_new, progress.errors_count
                        ),
                    );
                    if progress.files_new > 0
                        && self.last_scan_refresh.elapsed() >= std::time::Duration::from_millis(500)
                    {
                        self.refresh_scanned_items();
                        self.last_scan_refresh = std::time::Instant::now();
                    }
                }
                ScanUiEvent::Finished(path, result) => {
                    self.scanning.remove(&path);
                    match result {
                        Ok(progress) => {
                            self.state.scan_status.insert(
                                path,
                                format!(
                                    "Scan complete · {} media files · {} added/updated · {} errors",
                                    progress.files_seen, progress.files_new, progress.errors_count
                                ),
                            );
                        }
                        Err(error) => {
                            self.state
                                .scan_status
                                .insert(path, format!("Scan failed: {error}"));
                            tracing::error!("Folder scan failed: {error}");
                        }
                    }
                    self.refresh_library_data();
                    self.refresh_exclusions();
                }
            }
            ctx.request_repaint();
        }
        while let Ok(ev) = self.trakt_rx.try_recv() {
            if let Some(err_msg) = self.state.history_ui.trakt.apply_event(ev) {
                self.state.history_ui.toast = Some(valor_ui::ui_kit::ToastState {
                    message: err_msg,
                    action_label: None,
                    undo_session_id: None,
                    expires_at: std::time::Instant::now() + std::time::Duration::from_secs(4),
                });
            }
        }
        while let Ok((key, info)) = self.tmdb_rx.try_recv() {
            self.state.tmdb_pending.remove(&key);
            self.state.tmdb_series_cache.insert(key, info);
        }
        while let Ok((fp, tmdb_id, genres, vote)) = self.telemetry_rx.try_recv() {
            let _ = self.db.update_media_tmdb(&fp, tmdb_id, &genres, vote);
            let entry = self.state.media_telemetry.entry(fp.clone()).or_insert_with(|| valor_core::models::MediaTelemetry {
                fingerprint: fp,
                ..Default::default()
            });
            entry.tmdb_id = Some(tmdb_id);
            entry.genres = genres;
            entry.vote_average = vote;
        }
        while let Ok(recs) = self.recs_rx.try_recv() {
            let total_time_secs: f64 = self
                .state
                .media_telemetry
                .values()
                .map(|t| t.time_spent_secs)
                .sum();
            if total_time_secs >= 30.0 * 3600.0 {
                self.state.tmdb_recommendations = recs;
            } else {
                self.state.tmdb_recommendations.clear();
            }
        }
        while let Ok(msg) = self.server_rx.try_recv() {
            match msg {
                ServerWorkerMsg::Connected {
                    server,
                    libs,
                    first_lib_id,
                    items,
                } => {
                    if let Some(pos) = self
                        .state
                        .settings
                        .media_servers
                        .iter()
                        .position(|s| s.id == server.id || s.base_url == server.base_url)
                    {
                        self.state.settings.media_servers[pos] = server.clone();
                    } else {
                        self.state.settings.media_servers.push(server.clone());
                    }
                    let _ = self.state.settings.save();
                    self.state.active_server_id = Some(server.id);
                    self.state.server_libraries = libs;
                    self.state.active_server_lib_id = first_lib_id;
                    self.state.server_items = items;
                    self.state.server_status = Some("Connected!".to_string());
                }
                ServerWorkerMsg::LibraryItems {
                    server_id,
                    lib_id,
                    items,
                } => {
                    if self.state.active_server_id.as_deref() == Some(server_id.as_str()) {
                        self.state.active_server_lib_id = Some(lib_id);
                        self.state.server_items = items;
                        self.state.server_status = None;
                    }
                }
                ServerWorkerMsg::Error(err) => {
                    self.state.server_status = Some(format!("Error: {err}"));
                }
            }
        }
        while let Ok(res) = self.bookmark_sync_rx.try_recv() {
            if self.player_ui.bookmark_fingerprint.as_deref() == Some(res.fingerprint.as_str()) {
                if res.tmdb_rating.is_some() {
                    self.player_ui.active_tmdb_rating = res.tmdb_rating;
                }
                if res.tidb_synced {
                    self.player_ui.active_tidb_synced = true;
                }
                let mut changed = false;
                for bm in res.bookmarks {
                    let dup = self.player_ui.bookmarks.iter().any(|existing| {
                        existing.id == bm.id
                            || (existing.category.eq_ignore_ascii_case(&bm.category)
                                && (existing.start_secs - bm.start_secs).abs() < 2.0)
                    });
                    if !dup {
                        let _ = self.db.save_bookmark(&bm);
                        self.player_ui.bookmarks.push(bm);
                        changed = true;
                    }
                }
                if changed {
                    self.player_ui
                        .bookmarks
                        .sort_by(|a, b| a.start_secs.total_cmp(&b.start_secs));
                }
            }
        }

        if self.state.selected_nav == NavItem::Library
            && self.state.library_tab == LibraryTab::Series
            && !self.tmdb_token.is_empty()
        {
            let series_cards = valor_ui::view_models::build_series_card_view_models(
                &self.items,
                &self.positions,
                &std::collections::HashMap::new(),
            );
            for card in series_cards {
                if !self.state.tmdb_series_cache.contains_key(&card.series_key)
                    && !self.state.tmdb_pending.contains(&card.series_key)
                {
                    self.state.tmdb_pending.insert(card.series_key.clone());
                    let tx = self.tmdb_tx.clone();
                    let token = self.tmdb_token.clone();
                    let key = card.series_key.clone();
                    let title = card.title.clone();
                    let seasons: Vec<u32> = card
                        .episodes
                        .iter()
                        .filter_map(|e| e.season_number)
                        .collect();
                    std::thread::spawn(move || {
                        if let Some(info) = fetch_tmdb_series_info(&token, &title, &seasons) {
                            let _ = tx.send((key, info));
                        }
                    });
                }
            }
        }

        while let Ok(event) = self.player.events().try_recv() {
            match event {
                PlayerEvent::Fatal(message) => {
                    tracing::error!("Player backend unavailable: {message}");
                    self.player_error = Some(message);
                    self.opening_media = None;
                }
                PlayerEvent::LoadFailed { reason, .. } => {
                    self.player_error = Some(reason);
                    self.opening_media = None;
                }
                PlayerEvent::ItemChanged { path, .. } => {
                    self.playback_started_at = chrono::Utc::now();
                    self.ensure_media_item_registered(&path);
                    if let Some(item) = self
                        .items
                        .iter()
                        .find(|item| std::path::Path::new(&item.file_path) == path)
                    {
                        if let Some(cache_dir) =
                            directories::ProjectDirs::from("com", "valor", "Valor")
                        {
                            let thumbnail = cache_dir
                                .cache_dir()
                                .join("thumbnails")
                                .join(format!("{}.jpg", item.fingerprint));
                            if !thumbnail.exists() {
                                self.pending_thumbnail = Some(thumbnail);
                            }
                        }
                    }
                }
                PlayerEvent::EndOfItem {
                    path,
                    position_secs,
                    duration_secs,
                    ..
                } => {
                    self.save_playback_session(&path, position_secs, duration_secs);
                }
                PlayerEvent::EndOfQueue { .. } => {
                    if self.state.quit_at_end_of_playlist {
                        ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                    }
                }
                PlayerEvent::Position { .. } => {}
                PlayerEvent::StateChanged {
                    state: PlaybackState::Playing,
                    ..
                } => {
                    self.player_error = None;
                }
                PlayerEvent::Toast(message) => tracing::info!("Player: {message}"),
                _ => {}
            }
        }
        let is_focused = ctx.input(|i| i.viewport().focused.unwrap_or(true));
        if !self.dwm_border_cleared && is_focused {
            disable_dwm_border_for_active_window();
            self.dwm_border_cleared = true;
        }
        if self.is_fullscreen && !self.was_focused && is_focused {
            disable_dwm_border_for_active_window();
        }
        self.was_focused = is_focused;

        let snapshot = self.player.snapshot().read().clone();
        self.player_ui.skip_secs = self.state.settings.skip_secs.max(1) as f64;
        self.player_ui.auto_skip_intro = self.state.settings.auto_skip_intro;
        self.player_ui.auto_skip_outro = self.state.settings.auto_skip_outro;
        self.player_ui.trakt_connected = !self.state.settings.trakt_access_token.trim().is_empty();
        if snapshot.state != PlaybackState::Idle {
            self.opening_media = None;
            if let Some(render_error) = self.player_render_error.lock().clone() {
                self.player_error = Some(render_error);
            }
            let matched_item = snapshot.path.as_ref().and_then(|path| {
                self.items
                    .iter()
                    .find(|item| {
                        let p = std::path::Path::new(&item.file_path);
                        p == path.as_path() || item.file_path.eq_ignore_ascii_case(&path.to_string_lossy())
                    })
                    .cloned()
            });
            let fingerprint = snapshot.path.as_ref().map(|path| {
                matched_item
                    .as_ref()
                    .map(|item| item.fingerprint.clone())
                    .unwrap_or_else(|| path.to_string_lossy().to_string())
            });
            if fingerprint != self.player_ui.bookmark_fingerprint {
                if let Some(ref fp) = fingerprint {
                    let _ = self.db.record_media_play(fp);
                    let entry = self.state.media_telemetry.entry(fp.clone()).or_insert_with(|| valor_core::models::MediaTelemetry {
                        fingerprint: fp.clone(),
                        ..Default::default()
                    });
                    entry.last_played_at = Some(chrono::Utc::now());
                }
                self.player_ui.bookmark_fingerprint = fingerprint.clone();
                self.player_ui.active_tmdb_rating = None;
                self.player_ui.active_tidb_synced = false;
                self.player_ui.skipped_segment_ids.clear();
                self.player_ui.skip_toast = None;
                self.player_ui.bookmarks = fingerprint
                    .as_deref()
                    .and_then(|value| self.db.get_bookmarks(value).ok())
                    .unwrap_or_default();

                if let Some(fp) = fingerprint.clone() {
                    let tx = self.bookmark_sync_tx.clone();
                    let tmdb_token = load_tmdb_token(&self.state.settings.tmdb_api_key);
                    let introdb_key = self.state.settings.theintrodb_api_key.clone();
                    let title = matched_item
                        .as_ref()
                        .map(|i| i.title.clone())
                        .or_else(|| {
                            snapshot.path.as_ref().and_then(|p| {
                                p.file_stem().map(|s| s.to_string_lossy().to_string())
                            })
                        })
                        .unwrap_or_default();
                    let season = matched_item.as_ref().and_then(|i| i.season_number);
                    let episode = matched_item.as_ref().and_then(|i| i.episode_number);
                    let duration_secs = snapshot.duration_secs;
                    std::thread::spawn(move || {
                        let res = fetch_web_db_and_tidb_bookmarks(
                            &fp,
                            &title,
                            season,
                            episode,
                            duration_secs,
                            &tmdb_token,
                            &introdb_key,
                        );
                        let _ = tx.send(res);
                    });
                }
            }
            if let Some(fp) = fingerprint.as_deref() {
                if snapshot.state == PlaybackState::Playing && self.last_telemetry_tick.elapsed().as_secs_f64() >= 5.0 {
                    let delta = self.last_telemetry_tick.elapsed().as_secs_f64();
                    self.last_telemetry_tick = std::time::Instant::now();
                    let _ = self.db.add_media_time_and_skips(fp, delta, 0);
                    let entry = self.state.media_telemetry.entry(fp.to_string()).or_insert_with(|| valor_core::models::MediaTelemetry {
                        fingerprint: fp.to_string(),
                        ..Default::default()
                    });
                    entry.time_spent_secs += delta;
                    entry.last_played_at = Some(chrono::Utc::now());
                }
                if !snapshot.tracks.is_empty() {
                    if self.restored_tracks_token != snapshot.token {
                        self.restored_tracks_token = snapshot.token;
                        if let Ok(Some((saved_audio, saved_sub))) = self.db.get_track_prefs(fp) {
                            if let Some(aid) = saved_audio {
                                if snapshot.tracks.iter().any(|t| t.kind == "audio" && t.id == aid) {
                                    let _ = self.player.send(PlayerCommand::SelectTrack {
                                        token: snapshot.token,
                                        id: aid,
                                    });
                                }
                            }
                            if let Some(sid) = saved_sub {
                                if sid < 0 {
                                    let _ = self.player.send(PlayerCommand::DisableSubtitles {
                                        token: snapshot.token,
                                    });
                                } else if snapshot.tracks.iter().any(|t| t.kind == "sub" && t.id == sid) {
                                    let _ = self.player.send(PlayerCommand::SelectTrack {
                                        token: snapshot.token,
                                        id: sid,
                                    });
                                }
                            }
                        }
                    } else {
                        let cur_audio_track = snapshot.tracks.iter().find(|t| t.kind == "audio" && t.selected);
                        let cur_sub_track = snapshot.tracks.iter().find(|t| t.kind == "sub" && t.selected);
                        let cur_audio = cur_audio_track.map(|t| t.id as i64);
                        let cur_sub = cur_sub_track.map(|t| t.id as i64).or(Some(-1));
                        let key = (fp.to_string(), cur_audio, cur_sub);
                        if self.last_saved_tracks.as_ref() != Some(&key) {
                            let _ = self.db.save_track_prefs(fp, cur_audio, cur_sub);
                            let a_lang = cur_audio_track.and_then(|t| t.language.clone()).unwrap_or_default();
                            let s_lang = cur_sub_track.and_then(|t| t.language.clone()).unwrap_or_else(|| "off".to_string());
                            let _ = self.db.update_media_langs(fp, &a_lang, &s_lang);
                            let entry = self.state.media_telemetry.entry(fp.to_string()).or_insert_with(|| valor_core::models::MediaTelemetry {
                                fingerprint: fp.to_string(),
                                ..Default::default()
                            });
                            if !a_lang.is_empty() {
                                entry.audio_lang = a_lang;
                            }
                            entry.sub_lang = s_lang;
                            self.last_saved_tracks = Some(key);
                        }
                    }
                }
            }
            let tokens = &self.tokens;
            let icons = &self.icons;
            let player_rect = ui.max_rect();
            if self.is_pip {
                let border = 7.0;
                if let Some(pos) = ctx.input(|i| i.pointer.hover_pos()) {
                    let on_l = (pos.x - player_rect.left()).abs() <= border;
                    let on_r = (player_rect.right() - pos.x).abs() <= border;
                    let on_t = (pos.y - player_rect.top()).abs() <= border;
                    let on_b = (player_rect.bottom() - pos.y).abs() <= border;
                    let resize_dir = match (on_l, on_r, on_t, on_b) {
                        (true, _, true, _) => Some((egui::ResizeDirection::NorthWest, egui::CursorIcon::ResizeNwSe)),
                        (_, true, true, _) => Some((egui::ResizeDirection::NorthEast, egui::CursorIcon::ResizeNeSw)),
                        (true, _, _, true) => Some((egui::ResizeDirection::SouthWest, egui::CursorIcon::ResizeNeSw)),
                        (_, true, _, true) => Some((egui::ResizeDirection::SouthEast, egui::CursorIcon::ResizeNwSe)),
                        (true, _, _, _) => Some((egui::ResizeDirection::West, egui::CursorIcon::ResizeHorizontal)),
                        (_, true, _, _) => Some((egui::ResizeDirection::East, egui::CursorIcon::ResizeHorizontal)),
                        (_, _, true, _) => Some((egui::ResizeDirection::North, egui::CursorIcon::ResizeVertical)),
                        (_, _, _, true) => Some((egui::ResizeDirection::South, egui::CursorIcon::ResizeVertical)),
                        _ => None,
                    };
                    if let Some((dir, cursor)) = resize_dir {
                        ctx.set_cursor_icon(cursor);
                        if ctx.input(|i| i.pointer.primary_pressed()) {
                            ctx.send_viewport_cmd(egui::ViewportCommand::BeginResize(dir));
                        }
                    } else if pos.y > player_rect.top() + 40.0
                        && pos.y < player_rect.bottom() - 58.0
                        && !self.player_ui.is_seeking
                        && ctx.input(|i| i.pointer.primary_down() && i.pointer.delta().length_sq() > 2.0)
                    {
                        ctx.send_viewport_cmd(egui::ViewportCommand::StartDrag);
                    }
                }
            }
            let video_rect = player_rect;
            let mut player_ui = ui.new_child(egui::UiBuilder::new().max_rect(player_rect));
            let bridge = self.player.render_bridge();
            let callback_error = std::sync::Arc::clone(&self.player_render_error);
            let video_callback = egui_glow::CallbackFn::new(move |info, painter| {
                let gl = painter.gl();
                let (prev_fbo, prev_vp, prev_scissor, prev_blend, prev_tex, prev_prog, prev_vao) = unsafe {
                    use egui_glow::glow::{self, HasContext};
                    let fbo = gl.get_parameter_i32(glow::DRAW_FRAMEBUFFER_BINDING);
                    let mut vp = [0i32; 4];
                    gl.get_parameter_i32_slice(glow::VIEWPORT, &mut vp);
                    let sc = gl.is_enabled(glow::SCISSOR_TEST);
                    let bl = gl.is_enabled(glow::BLEND);
                    let tex = gl.get_parameter_i32(glow::ACTIVE_TEXTURE);
                    let prog = gl.get_parameter_i32(glow::CURRENT_PROGRAM);
                    let vao = gl.get_parameter_i32(glow::VERTEX_ARRAY_BINDING);
                    (fbo, vp, sc, bl, tex, prog, vao)
                };
                let fbo = painter
                    .intermediate_fbo()
                    .map(|fb| fb.0.get() as i32)
                    .unwrap_or(prev_fbo);
                let viewport = info.viewport_in_pixels();
                unsafe {
                    use egui_glow::glow::{self, HasContext};
                    gl.disable(glow::BLEND);
                    gl.disable(glow::SCISSOR_TEST);
                    gl.disable(glow::STENCIL_TEST);
                    gl.disable(glow::DEPTH_TEST);
                    gl.viewport(viewport.left_px, viewport.from_bottom_px, viewport.width_px, viewport.height_px);
                }
                if let Err(error) = bridge.render_frame(fbo, viewport.width_px, viewport.height_px) {
                    let mut previous = callback_error.lock();
                    if previous.as_deref() != Some(error.as_str()) {
                        tracing::error!("Video render callback failed: {error}");
                        *previous = Some(error);
                    }
                } else {
                    *callback_error.lock() = None;
                }
                unsafe {
                    use egui_glow::glow::{self, HasContext};
                    gl.viewport(prev_vp[0], prev_vp[1], prev_vp[2], prev_vp[3]);
                    if prev_scissor { gl.enable(glow::SCISSOR_TEST); } else { gl.disable(glow::SCISSOR_TEST); }
                    if prev_blend { gl.enable(glow::BLEND); } else { gl.disable(glow::BLEND); }
                    gl.active_texture(prev_tex as u32);
                    gl.use_program(std::num::NonZeroU32::new(prev_prog as u32).map(glow::NativeProgram));
                    gl.bind_vertex_array(std::num::NonZeroU32::new(prev_vao as u32).map(glow::NativeVertexArray));
                }
            });
            let video_shape = egui::Shape::Callback(egui::PaintCallback {
                rect: video_rect,
                callback: std::sync::Arc::new(video_callback),
            });
            let player = &self.player;
            let player_error_display = self.player_error.clone();
            let player_error = &mut self.player_error;
            self.player_ui.scrub_preview_texture = None;
            let mut send = |command: PlayerCommand| {
                if let Err(error) = player.send(command) {
                    tracing::error!("Player command failed: {error}");
                    *player_error = Some(error);
                }
            };
            self.player_ui.auto_next = self.state.settings.auto_next;
            let action = valor_ui::player_ui::show(
                &mut player_ui,
                &snapshot,
                tokens,
                icons,
                Some(video_shape),
                &mut self.player_ui,
                player_error_display.as_deref(),
                &mut send,
            );
            if action.toggle_auto_next {
                self.state.settings.auto_next = self.player_ui.auto_next;
                let _ = self.state.settings.save();
            }
            if action.close_window {
                if let Some(path) = snapshot.path.as_deref() {
                    self.save_playback_session(
                        path,
                        snapshot.position_secs,
                        snapshot.duration_secs,
                    );
                }
                ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                return;
            }
            if action.minimize_window {
                ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(true));
            }
            if action.maximize_window {
                let is_fs = ctx.input(|i| i.viewport().fullscreen.unwrap_or(false));
                if is_fs {
                    self.is_fullscreen = false;
                    self.player_ui.is_fullscreen = false;
                    ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(false));
                } else {
                    let maximized = ctx.input(|input| input.viewport().maximized.unwrap_or(false));
                    ctx.send_viewport_cmd(egui::ViewportCommand::Maximized(!maximized));
                }
            }
            if let Some(fullscreen) = action.toggle_fullscreen {
                self.is_fullscreen = fullscreen;
                self.player_ui.is_fullscreen = fullscreen;
                if fullscreen {
                    ctx.send_viewport_cmd(egui::ViewportCommand::Maximized(false));
                    ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(true));
                    disable_dwm_border_for_active_window();
                } else {
                    ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(false));
                }
            }
            if action.toggle_pip {
                if !self.is_pip {
                    if self.is_fullscreen {
                        self.is_fullscreen = false;
                        self.player_ui.is_fullscreen = false;
                        ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(false));
                    }
                    ctx.send_viewport_cmd(egui::ViewportCommand::Maximized(false));
                    self.pre_pip_inner_size =
                        ctx.input(|i| i.viewport().inner_rect.map(|r| r.size()));
                    self.is_pip = true;
                    ctx.send_viewport_cmd(egui::ViewportCommand::Resizable(true));
                    ctx.send_viewport_cmd(egui::ViewportCommand::MinInnerSize(egui::vec2(260.0, 146.0)));
                    ctx.send_viewport_cmd(egui::ViewportCommand::WindowLevel(egui::WindowLevel::AlwaysOnTop));
                    ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(egui::vec2(420.0, 236.0)));
                } else {
                    self.exit_pip(&ctx);
                }
            }
            if action.skips_delta > 0 {
                if let Some(fp) = self.player_ui.bookmark_fingerprint.as_deref() {
                    let _ = self.db.add_media_time_and_skips(fp, 0.0, action.skips_delta as u64);
                    let entry = self.state.media_telemetry.entry(fp.to_string()).or_insert_with(|| valor_core::models::MediaTelemetry {
                        fingerprint: fp.to_string(),
                        ..Default::default()
                    });
                    entry.skips_used += action.skips_delta as u64;
                }
            }
            if action.sync_to_trakt {
                let token = self.state.settings.trakt_access_token.trim().to_string();
                let title = self
                    .player
                    .snapshot()
                    .read()
                    .title
                    .clone()
                    .or_else(|| self.opening_media.clone())
                    .unwrap_or_default();
                if !token.is_empty() && !title.is_empty() {
                    std::thread::spawn(move || {
                        let cid = trakt_client_id();
                        let auth = format!("Bearer {token}");
                        let body = serde_json::json!({
                            "movie": { "title": title },
                            "progress": 100.0
                        });
                        let _ = http_post_json_resp(
                            "https://api.trakt.tv/scrobble/stop",
                            &body,
                            &[
                                ("Authorization", &auth),
                                ("trakt-api-version", "2"),
                                ("trakt-api-key", &cid),
                                ("User-Agent", "Valor/1.0.0"),
                            ],
                        );
                    });
                }
            }
            for bookmark in &action.bookmarks_added {
                if let Err(error) = self.db.save_bookmark(bookmark) {
                    tracing::warn!(%error, "Could not save player bookmark");
                }
            }
            if !action.bookmarks_added.is_empty() {
                let to_push = action.bookmarks_added.clone();
                std::thread::spawn(move || {
                    push_bookmarks_to_web_db(&to_push);
                });
            }
            for id in &action.bookmarks_deleted {
                if let Err(error) = self.db.delete_bookmark(id) {
                    tracing::warn!(%error, "Could not delete player bookmark");
                }
            }
            if action.add_to_queue {
                if let Some(paths) = rfd::FileDialog::new()
                    .add_filter(
                        "Media",
                        &["mp4", "mkv", "webm", "mov", "avi", "m4v", "ts", "mp3", "flac", "wav"],
                    )
                    .pick_files()
                {
                    if !paths.is_empty() {
                        let _ = self.player.send(PlayerCommand::Enqueue {
                            token: snapshot.token,
                            paths,
                        });
                    }
                }
            }
            if action.choose_subtitle {
                if let Some(path) = rfd::FileDialog::new()
                    .add_filter("Subtitles", &["srt", "ass", "ssa", "vtt", "sub"])
                    .pick_file()
                {
                    if let Err(error) = self.player.send(PlayerCommand::LoadSubtitle {
                        token: snapshot.token,
                        path,
                    }) {
                        tracing::warn!(%error, "Could not load subtitle file");
                    }
                }
            }
            if matches!(snapshot.state, PlaybackState::Playing | PlaybackState::Loading | PlaybackState::Buffering) {
                ctx.request_repaint_after(std::time::Duration::from_millis(16));
            }
            if action.leave {
                self.player_ui.audio_only = false;
                self.exit_pip(&ctx);
                if self.is_fullscreen || ctx.input(|i| i.viewport().fullscreen.unwrap_or(false)) {
                    self.is_fullscreen = false;
                    self.player_ui.is_fullscreen = false;
                    ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(false));
                }
                if let Some(path) = snapshot.path.as_deref() {
                    self.save_playback_session(
                        path,
                        snapshot.position_secs,
                        snapshot.duration_secs,
                    );
                }
                let _ = self.player.send(PlayerCommand::Stop {
                    token: snapshot.token,
                });
                self.player_error = None;
            }
            return;
        }

        // Ensure PiP / always-on-top is exited whenever playback returns to Idle
        self.exit_pip(&ctx);

        if let Some(ref media_name) = self.opening_media {
            egui::CentralPanel::default()
                .frame(egui::Frame::NONE.fill(egui::Color32::BLACK))
                .show(ui, |ui| {
                    let rect = ui.max_rect();
                    ui.painter().rect_filled(rect, egui::CornerRadius::ZERO, egui::Color32::BLACK);
                    egui::Area::new(ui.scope_id().with("opening_media_overlay"))
                        .order(egui::Order::Foreground)
                        .anchor(egui::Align2::CENTER_CENTER, egui::Vec2::ZERO)
                        .show(&ctx, |ui| {
                            egui::Frame::new()
                                .fill(egui::Color32::from_rgb(18, 18, 22))
                                .stroke(egui::Stroke::new(1.0, egui::Color32::from_white_alpha(28)))
                                .corner_radius(egui::CornerRadius::same(10))
                                .inner_margin(egui::Margin::symmetric(24, 16))
                                .show(ui, |ui| {
                                    ui.horizontal(|ui| {
                                        if self.tokens.skin.shell_layout.loading_spinner == valor_ui::skin::LoadingSpinnerStyle::RedArc {
                                            let (spin_rect, _) = ui.allocate_exact_size(egui::vec2(34.0, 34.0), egui::Sense::hover());
                                            let t = ui.input(|i| i.time);
                                            valor_ui::spinner::render_red_arc_spinner(ui, spin_rect.center(), 13.0, t);
                                        } else {
                                            ui.add(
                                                egui::Spinner::new()
                                                    .size(24.0)
                                                    .color(egui::Color32::from_rgb(56, 152, 255)),
                                            );
                                        }
                                        ui.add_space(12.0);
                                        ui.vertical(|ui| {
                                            ui.label(
                                                egui::RichText::new("Opening media...")
                                                    .size(14.0)
                                                    .strong()
                                                    .color(egui::Color32::WHITE),
                                            );
                                            ui.label(
                                                egui::RichText::new(media_name)
                                                    .size(12.0)
                                                    .color(egui::Color32::from_gray(160)),
                                            );
                                        });
                                    });
                                });
                        });
                });
            if matches!(snapshot.state, PlaybackState::Playing | PlaybackState::Loading | PlaybackState::Buffering) {
                ctx.request_repaint_after(std::time::Duration::from_millis(16));
            }
            return;
        }

        if !ctx.egui_wants_keyboard_input() {
            let (ctrl, shift) = ctx.input(|i| (i.modifiers.ctrl, i.modifiers.shift));
            if ctrl {
                if shift && ctx.input(|i| i.key_pressed(egui::Key::O)) {
                    self.open_multiple_files();
                } else if ctx.input(|i| i.key_pressed(egui::Key::O)) {
                    self.open_single_file();
                } else if ctx.input(|i| i.key_pressed(egui::Key::F)) {
                    self.choose_folder();
                } else if ctx.input(|i| i.key_pressed(egui::Key::D)) {
                    self.file_dialog = Some((FileDialogKind::Disc, String::from("D:\\")));
                } else if ctx.input(|i| i.key_pressed(egui::Key::N)) {
                    self.file_dialog = Some((FileDialogKind::NetworkStream, String::new()));
                } else if ctx.input(|i| i.key_pressed(egui::Key::V)) {
                    self.open_from_clipboard();
                } else if ctx.input(|i| i.key_pressed(egui::Key::Y)) {
                    self.save_playlist_to_file();
                } else if ctx.input(|i| i.key_pressed(egui::Key::R)) {
                    self.file_dialog = Some((FileDialogKind::ConvertSave, String::new()));
                } else if ctx.input(|i| i.key_pressed(egui::Key::S)) {
                    self.file_dialog = Some((FileDialogKind::Stream, String::new()));
                } else if ctx.input(|i| i.key_pressed(egui::Key::Q)) {
                    ctx.send_viewport_cmd(egui::ViewportCommand::Close);
                }
            }
        }

        if ctx.input(|i| i.key_pressed(egui::Key::F11)) {
            let current = ctx.input(|i| i.viewport().fullscreen.unwrap_or(self.is_fullscreen));
            self.is_fullscreen = !current;
            self.player_ui.is_fullscreen = self.is_fullscreen;
            if self.is_fullscreen {
                ctx.send_viewport_cmd(egui::ViewportCommand::Maximized(false));
                ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(true));
            } else {
                ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(false));
            }
        }
        self.tokens = ShellTokens::from_skin_and_path(
            &self.state.settings.skin_id,
            &self.state.settings.custom_skin_path,
        );
        if !self.state.settings.accent_color.trim().is_empty() {
            self.tokens.apply_accent_hex(&self.state.settings.accent_color);
        }
        let text_scale = (self.state.settings.text_scale_pct.clamp(80, 150) as f32) / 100.0;
        if (ctx.zoom_factor() - text_scale).abs() > 0.001 {
            ctx.set_zoom_factor(text_scale);
        }
        let reduce_motion = self.state.settings.reduce_motion_mode == "on"
            || self.state.settings.prefers_reduced_motion;
        ctx.style_mut_of(egui::Theme::Dark, |s| {
            s.visuals.widgets.inactive.corner_radius = egui::CornerRadius::ZERO;
            s.visuals.widgets.hovered.corner_radius = egui::CornerRadius::ZERO;
            s.visuals.widgets.active.corner_radius = egui::CornerRadius::ZERO;
            s.visuals.widgets.noninteractive.corner_radius = egui::CornerRadius::ZERO;
            s.visuals.widgets.open.corner_radius = egui::CornerRadius::ZERO;
            s.animation_time = if reduce_motion { 0.0 } else { 1.0 / 12.0 };
        });
        let renderer = ShellRenderer::new(&self.tokens, &self.icons);
        let action = egui::CentralPanel::default()
            .frame(egui::Frame::NONE)
            .show(ui, |ui| {
                renderer.show_with_data(
                    ui,
                    &mut self.state,
                    self.items.len(),
                    0,
                    &self.items,
                    &self.history,
                    &self.sessions,
                    &self.positions,
                    &mut self.textures,
                )
            })
            .inner;
        let brightness = self.state.settings.interface_brightness.clamp(50, 100);
        if brightness < 100 {
            let dim_alpha = ((100 - brightness) as f32 / 100.0 * 255.0).round() as u8;
            let screen_rect = ctx.input(|i| i.viewport_rect());
            ctx.layer_painter(egui::LayerId::new(
                egui::Order::Foreground,
                egui::Id::unique("comfort_brightness_dim"),
            ))
            .rect_filled(screen_rect, 0.0, egui::Color32::from_black_alpha(dim_alpha));
        }
        if let Some(path) = self.pending_remove.clone() {
            let name = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| path.display().to_string());
            egui::Window::new("Remove folder from library?")
                .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
                .collapsible(false).resizable(false).show(&ctx, |ui| {
                    ui.label(format!("Remove {name} from library? Files on disk are not touched. Watch history and bookmarks are kept."));
                    ui.horizontal(|ui| {
                        if ui.button("Cancel").clicked() { self.pending_remove = None; }
                        if ui.button("Remove").clicked() {
                            match self.db.remove_folder_from_library(&path) {
                                Ok(()) => {
                                    self.folders.retain(|folder| folder != &path);
                                    self.state.remove_folder(&path);
                                    self.refresh_library_data();
                                    self.refresh_exclusions();
                                    self.pending_remove = None;
                                }
                                Err(error) => { tracing::error!("Could not remove library folder: {error}"); self.pending_remove = None; }
                            }
                        }
                    });
                });
        }
        match action {
            ShellAction::CloseWindow => ctx.send_viewport_cmd(egui::ViewportCommand::Close),
            ShellAction::StartTraktDeviceAuth => {
                if let Some((user_code, device_code, verify_url)) = request_trakt_device_code() {
                    let _ = open_url_in_browser(&verify_url);
                    self.state.trakt_status_msg = Some(format!(
                        "Opened {verify_url}. Enter code {user_code}, then click Verify Activation."
                    ));
                    self.state.trakt_device_code = Some((user_code, device_code, verify_url));
                } else {
                    self.state.trakt_status_msg = Some("Failed to request Trakt device code from backend.".to_string());
                }
            }
            ShellAction::PollTraktDeviceToken => {
                if let Some((_, ref device_code, _)) = self.state.trakt_device_code.clone() {
                    match poll_trakt_device_token(device_code) {
                        Ok((access_token, refresh_token, username)) => {
                            self.state.settings.trakt_access_token = access_token;
                            self.state.settings.trakt_refresh_token = refresh_token;
                            if !username.is_empty() {
                                self.state.settings.trakt_username = username;
                            }
                            self.state.trakt_device_code = None;
                            self.state.trakt_status_msg = Some("Connected to Trakt.tv!".to_string());
                            let _ = self.state.settings.save();
                        }
                        Err(msg) => {
                            self.state.trakt_status_msg = Some(msg);
                        }
                    }
                }
            }
            ShellAction::DisconnectTrakt => {
                self.state.settings.trakt_access_token.clear();
                self.state.settings.trakt_refresh_token.clear();
                self.state.trakt_device_code = None;
                self.state.trakt_status_msg = Some("Disconnected from Trakt.tv.".to_string());
                let _ = self.state.settings.save();
            }
            ShellAction::PlayMedia(path) => self.start_playback(path),
            ShellAction::EnqueueMedia(paths) => {
                if !paths.is_empty() {
                    let snap = self.player.snapshot().read().clone();
                    if snap.state == PlaybackState::Idle {
                        self.start_playback(paths[0].clone());
                        if paths.len() > 1 {
                            let rest = paths[1..].to_vec();
                            let token = self.player.snapshot().read().token;
                            let _ = self.player.send(PlayerCommand::Enqueue { token, paths: rest });
                        }
                    } else {
                        let _ = self.player.send(PlayerCommand::Enqueue {
                            token: snap.token,
                            paths,
                        });
                    }
                }
            }
            ShellAction::PlayMediaFromMiniBar {
                path,
                start_secs,
                audio_only,
            } => {
                self.player_ui.audio_only = audio_only;
                self.opening_media = path
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .or_else(|| Some("media".to_string()));
                self.playback_started_at = chrono::Utc::now();
                let _ = self.player.send(PlayerCommand::Open {
                    paths: vec![path],
                    start_index: 0,
                    start_position_secs: start_secs.max(0.0),
                    origin: valor_player::OpenOrigin::default(),
                });
                if audio_only {
                    let token = self.player.snapshot().read().token.saturating_add(1);
                    let _ = self.player.send(PlayerCommand::SetAudioOnly {
                        token,
                        enabled: true,
                    });
                }
            }
            ShellAction::AddFolderPicker => self.choose_folder(),
            ShellAction::LoadSkinPicker => {
                if let Some(path) = rfd::FileDialog::new()
                    .add_filter("Valor Skin Bundle", &["json", "zip", "valorskin"])
                    .pick_file()
                {
                    match valor_ui::skin::ValorSkin::from_file(&path) {
                        Ok(skin) => {
                            self.state.skin_load_error = None;
                            self.state.settings.custom_skin_path = path.to_string_lossy().to_string();
                            self.state.settings.skin_id = format!("custom:{}", skin.id);
                            let _ = self.state.settings.save();
                        }
                        Err(err) => {
                            self.state.skin_load_error = Some(err);
                        }
                    }
                }
            }
            ShellAction::ResetSkin => {
                self.state.skin_load_error = None;
                self.state.settings.skin_id = "valor-purple".to_string();
                self.state.settings.custom_skin_path.clear();
                let _ = self.state.settings.save();
            }
            ShellAction::ExcludeSubfolderPicker => {
                if let Some(path) = rfd::FileDialog::new().pick_folder() {
                    self.exclude_subfolder(path);
                }
            }
            ShellAction::ClearHistory { reset_positions } => {
                let db = self.db.clone();
                let _ = std::thread::Builder::new()
                    .name("valor-clear-history".into())
                    .spawn(move || {
                        let _ = db.clear_watch_sessions(reset_positions);
                    });
                self.sessions.clear();
                self.history.clear();
            }
            ShellAction::DeleteHistorySession(id) => {
                if let Some(pos) = self.sessions.iter().position(|s| s.id == id) {
                    let removed = self.sessions.remove(pos);
                    self.last_deleted_session = Some(removed);
                }
                let db = self.db.clone();
                let id_clone = id.clone();
                let _ = std::thread::Builder::new()
                    .name("valor-delete-session".into())
                    .spawn(move || {
                        let _ = db.delete_watch_session(&id_clone);
                    });
            }
            ShellAction::UndoDeleteHistorySession(id) => {
                if let Some(sess) = self.last_deleted_session.take() {
                    if sess.id == id {
                        let db = self.db.clone();
                        let sess_clone = sess.clone();
                        let _ = std::thread::Builder::new()
                            .name("valor-undo-session".into())
                            .spawn(move || {
                                let _ = db.record_watch_session(&sess_clone);
                            });
                        self.sessions.push(sess);
                        self.sessions.sort_by(|a, b| b.start_time.cmp(&a.start_time));
                    }
                }
            }
            ShellAction::MarkTraktWatched(payload) => {
                let token = self.state.settings.trakt_access_token.trim().to_string();
                let tx = self.trakt_tx.clone();
                if token.is_empty() {
                    let _ = tx.send(valor_ui::history::trakt::TraktSyncEvent::MarkFailed {
                        fingerprint: payload.fingerprint,
                    });
                } else {
                    let _ = std::thread::Builder::new()
                        .name("valor-trakt-mark".into())
                        .spawn(move || {
                            let cid = trakt_client_id();
                            let auth = format!("Bearer {token}");
                            let watched_at = chrono::Utc::now().to_rfc3339();
                            let body = if let (Some(s), Some(e)) = (payload.season_number, payload.episode_number) {
                                serde_json::json!({
                                    "shows": [{
                                        "title": payload.title,
                                        "seasons": [{
                                            "number": s,
                                            "episodes": [{ "number": e, "watched_at": watched_at }]
                                        }]
                                    }]
                                })
                            } else {
                                serde_json::json!({
                                    "movies": [{
                                        "title": payload.title,
                                        "watched_at": watched_at
                                    }]
                                })
                            };
                            let ok = http_post_json_resp(
                                "https://api.trakt.tv/sync/history",
                                &body,
                                &[
                                    ("Authorization", &auth),
                                    ("trakt-api-version", "2"),
                                    ("trakt-api-key", &cid),
                                    ("User-Agent", "Valor/1.0.0"),
                                ],
                            )
                            .is_some();
                            let ev = if ok {
                                valor_ui::history::trakt::TraktSyncEvent::MarkSucceeded {
                                    fingerprint: payload.fingerprint,
                                }
                            } else {
                                valor_ui::history::trakt::TraktSyncEvent::MarkFailed {
                                    fingerprint: payload.fingerprint,
                                }
                            };
                            let _ = tx.send(ev);
                        });
                }
            }
            ShellAction::SelectFolder(path) => self.state.selected_folder = Some(path),
            ShellAction::SelectNav(nav) => {
                self.state.selected_nav = nav;
                self.state.selected_folder = None;
            }
            ShellAction::RemoveFolder(path) => {
                self.pending_remove = Some(path);
            }
            ShellAction::ExcludeSubfolder(path) => self.exclude_subfolder(path),
            ShellAction::IncludeSubfolder(path) => {
                if let Some(root) = self
                    .folders
                    .iter()
                    .filter(|root| path_is_within(&path, root))
                    .max_by_key(|root| root.components().count())
                {
                    if let Ok(Some(record)) = self.db.get_folder_by_path(root) {
                        match self.db.include_excluded_subfolder(&record.id, &path) {
                            Ok(()) => {
                                self.refresh_library_data();
                                self.refresh_exclusions();
                                self.start_scan(path);
                            }
                            Err(error) => tracing::error!("Could not include subfolder: {error}"),
                        }
                    }
                }
            }
            ShellAction::ScanFolder(path) => self.start_scan(path),
            ShellAction::ScanAllFolders => {
                for path in self.folders.clone() {
                    self.start_scan(path);
                }
            }
            ShellAction::ToggleSubfolders(path) => self.state.toggle_node_expansion(&path),
            ShellAction::Search(query) => self.state.search_query = query,
            ShellAction::MinimizeWindow => {
                ctx.send_viewport_cmd(egui::ViewportCommand::Minimized(true))
            }
            ShellAction::ToggleMaximizeWindow => {
                let maximized = ctx.input(|input| input.viewport().maximized.unwrap_or(false));
                ctx.send_viewport_cmd(egui::ViewportCommand::Maximized(!maximized));
            }
            ShellAction::RescanFolder(path) => self.start_scan(path),
            ShellAction::OpenFilePicker => self.open_single_file(),
            ShellAction::OpenMultipleFilesPicker => self.open_multiple_files(),
            ShellAction::OpenFolderPicker => self.choose_folder(),
            ShellAction::OpenDiscDialog => {
                self.file_dialog = Some((FileDialogKind::Disc, String::from("D:\\")));
            }
            ShellAction::OpenNetworkStreamDialog => {
                self.file_dialog = Some((FileDialogKind::NetworkStream, String::new()));
            }
            ShellAction::OpenCaptureDeviceDialog => {
                self.file_dialog = Some((FileDialogKind::CaptureDevice, String::from("desktop://")));
            }
            ShellAction::OpenLocationFromClipboard => self.open_from_clipboard(),
            ShellAction::SavePlaylistToFile => self.save_playlist_to_file(),
            ShellAction::ConvertSaveDialog => {
                self.file_dialog = Some((FileDialogKind::ConvertSave, String::new()));
            }
            ShellAction::StreamDialog => {
                self.file_dialog = Some((FileDialogKind::Stream, String::new()));
            }
            ShellAction::ToggleQuitAtEndOfPlaylist => {
                self.state.quit_at_end_of_playlist = !self.state.quit_at_end_of_playlist;
            }
            ShellAction::OpenWithApp(path) => {
                #[cfg(windows)]
                {
                    std::thread::spawn(move || unsafe {
                        use std::os::windows::ffi::OsStrExt;
                        use windows::core::PCWSTR;
                        use windows::Win32::Foundation::HWND;
                        use windows::Win32::System::Com::{
                            CoInitializeEx, CoUninitialize, COINIT_APARTMENTTHREADED,
                        };
                        use windows::Win32::UI::Shell::{
                            SHOpenWithDialog, OAIF_ALLOW_REGISTRATION, OAIF_EXEC, OPENASINFO,
                        };

                        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
                        let wide: Vec<u16> = path
                            .as_os_str()
                            .encode_wide()
                            .chain(std::iter::once(0))
                            .collect();
                        let info = OPENASINFO {
                            pcszFile: PCWSTR(wide.as_ptr()),
                            pcszClass: PCWSTR::null(),
                            oaifInFlags: OAIF_ALLOW_REGISTRATION | OAIF_EXEC,
                        };
                        let _ = SHOpenWithDialog(HWND::default(), &info);
                        CoUninitialize();
                    });
                }
            }
            ShellAction::OpenInExplorer(path) => {
                #[cfg(windows)]
                {
                    let _ = std::process::Command::new("explorer.exe")
                        .arg(format!("/select,{}", path.to_string_lossy()))
                        .spawn();
                }
            }
            ShellAction::OpenAddToPlaylistModal(path) => {
                self.state.add_to_playlist_target = Some(path);
            }
            ShellAction::CreatePlaylist(name) => {
                let id = format!(
                    "pl_{}",
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis())
                        .unwrap_or(0)
                );
                let mut item_ids = Vec::new();
                if let Some(target_path) = self.state.add_to_playlist_target.take() {
                    let key = self
                        .items
                        .iter()
                        .find(|i| i.file_path.eq_ignore_ascii_case(&target_path))
                        .map(|i| i.id.clone())
                        .unwrap_or(target_path);
                    item_ids.push(key);
                }
                let coll = valor_core::models::Collection {
                    id: id.clone(),
                    name,
                    collection_type: "playlist".to_string(),
                    item_ids,
                    current_index: 0,
                    last_played_at: None,
                    is_pinned: false,
                };
                if let Err(err) = self.db.save_collection(&coll) {
                    tracing::error!("Failed to save playlist: {err}");
                } else {
                    self.state.playlists = self.db.get_all_collections().unwrap_or_default();
                    self.state.selected_playlist_id = Some(id);
                }
            }
            ShellAction::DeletePlaylist(id) => {
                let _ = self.db.delete_collection(&id);
                if self.state.selected_playlist_id.as_deref() == Some(id.as_str()) {
                    self.state.selected_playlist_id = None;
                }
                self.state.playlists = self.db.get_all_collections().unwrap_or_default();
            }
            ShellAction::RenamePlaylist { playlist_id, name } => {
                if let Some(mut pl) = self
                    .state
                    .playlists
                    .iter()
                    .find(|c| c.id == playlist_id)
                    .cloned()
                {
                    let trimmed = name.trim();
                    if !trimmed.is_empty() {
                        pl.name = trimmed.to_string();
                        let _ = self.db.save_collection(&pl);
                        self.state.playlists = self.db.get_all_collections().unwrap_or_default();
                    }
                }
            }
            ShellAction::AddToPlaylist {
                playlist_id,
                item_path,
            } => {
                if let Ok(Some(mut coll)) = self.db.get_collection_by_id(&playlist_id) {
                    let key = self
                        .items
                        .iter()
                        .find(|i| i.file_path.eq_ignore_ascii_case(&item_path))
                        .map(|i| i.id.clone())
                        .unwrap_or(item_path);
                    if !coll.item_ids.contains(&key) {
                        coll.item_ids.push(key);
                        let _ = self.db.save_collection(&coll);
                        self.state.playlists = self.db.get_all_collections().unwrap_or_default();
                    }
                }
            }
            ShellAction::RemoveFromPlaylist {
                playlist_id,
                item_id,
            } => {
                if let Ok(Some(mut coll)) = self.db.get_collection_by_id(&playlist_id) {
                    coll.item_ids.retain(|id| id != &item_id);
                    let _ = self.db.save_collection(&coll);
                    self.state.playlists = self.db.get_all_collections().unwrap_or_default();
                }
            }
            ShellAction::PlayPlaylist(playlist_id) => {
                if let Ok(Some(mut coll)) = self.db.get_collection_by_id(&playlist_id) {
                    let paths: Vec<PathBuf> = coll
                        .item_ids
                        .iter()
                        .filter_map(|key| {
                            self.items
                                .iter()
                                .find(|i| {
                                    i.id == *key
                                        || i.fingerprint == *key
                                        || i.file_path.eq_ignore_ascii_case(key)
                                })
                                .map(|i| PathBuf::from(&i.file_path))
                                .or_else(|| {
                                    let p = PathBuf::from(key);
                                    p.exists().then_some(p)
                                })
                        })
                        .collect();
                    if let Some((first, rest)) = paths.split_first() {
                        coll.last_played_at = Some(chrono::Utc::now());
                        let _ = self.db.save_collection(&coll);
                        self.start_playback(first.clone());
                        if !rest.is_empty() {
                            let token = self.player.snapshot().read().token;
                            let _ = self.player.send(PlayerCommand::Enqueue {
                                token,
                                paths: rest.to_vec(),
                            });
                        }
                    }
                }
            }
            ShellAction::ConnectNewServer => {
                let kind = self.state.server_form_kind.clone();
                let mut base_url = self.state.server_form_url.trim().trim_end_matches('/').to_string();
                if !base_url.starts_with("http://") && !base_url.starts_with("https://") {
                    base_url = format!("http://{base_url}");
                }
                let name = if self.state.server_form_name.trim().is_empty() {
                    base_url.clone()
                } else {
                    self.state.server_form_name.trim().to_string()
                };
                let user = self.state.server_form_user.trim().to_string();
                let pass = self.state.server_form_pass.clone();
                let token = self.state.server_form_token.trim().to_string();
                self.state.server_status = Some(format!("Connecting to {base_url}..."));
                let tx = self.server_tx.clone();
                let id = format!(
                    "srv_{}",
                    std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_millis())
                        .unwrap_or(0)
                );
                std::thread::spawn(move || {
                    let srv = valor_core::settings::MediaServerConfig {
                        id,
                        kind,
                        name,
                        base_url,
                        token,
                        user_id: String::new(),
                        username: user,
                    };
                    match connect_and_browse_server(srv, &pass) {
                        Ok(msg) => {
                            let _ = tx.send(msg);
                        }
                        Err(e) => {
                            let _ = tx.send(ServerWorkerMsg::Error(e));
                        }
                    }
                });
            }
            ShellAction::BrowseServer(srv_id) => {
                if let Some(srv) = self
                    .state
                    .settings
                    .media_servers
                    .iter()
                    .find(|s| s.id == srv_id)
                    .cloned()
                {
                    self.state.server_status = Some(format!("Loading {}...", srv.name));
                    let tx = self.server_tx.clone();
                    std::thread::spawn(move || {
                        match connect_and_browse_server(srv, "") {
                            Ok(msg) => {
                                let _ = tx.send(msg);
                            }
                            Err(e) => {
                                let _ = tx.send(ServerWorkerMsg::Error(e));
                            }
                        }
                    });
                }
            }
            ShellAction::SelectServerLibrary { server_id, lib_id } => {
                if let Some(srv) = self
                    .state
                    .settings
                    .media_servers
                    .iter()
                    .find(|s| s.id == server_id)
                    .cloned()
                {
                    self.state.server_status = Some("Loading library...".to_string());
                    let tx = self.server_tx.clone();
                    std::thread::spawn(move || {
                        match fetch_server_library_items(&srv, &lib_id) {
                            Ok(items) => {
                                let _ = tx.send(ServerWorkerMsg::LibraryItems {
                                    server_id,
                                    lib_id,
                                    items,
                                });
                            }
                            Err(e) => {
                                let _ = tx.send(ServerWorkerMsg::Error(e));
                            }
                        }
                    });
                }
            }
            ShellAction::DeleteServer(srv_id) => {
                self.state
                    .settings
                    .media_servers
                    .retain(|s| s.id != srv_id);
                let _ = self.state.settings.save();
                if self.state.active_server_id.as_deref() == Some(srv_id.as_str()) {
                    self.state.active_server_id = None;
                    self.state.server_libraries.clear();
                    self.state.server_items.clear();
                }
            }
            ShellAction::PlayServerStream { title, url } => {
                self.player_ui.audio_only = false;
                self.opening_media = Some(title);
                self.playback_started_at = chrono::Utc::now();
                let _ = self.player.send(PlayerCommand::Open {
                    paths: vec![PathBuf::from(url)],
                    start_index: 0,
                    start_position_secs: 0.0,
                    origin: valor_player::OpenOrigin {
                        collection_id: None,
                    },
                });
            }
            ShellAction::LocateFolder(_) | ShellAction::None => {}
        }

        if let Some((kind, mut input_val)) = self.file_dialog.take() {
            let (title, hint, action_lbl) = match kind {
                FileDialogKind::Disc => ("Open Disc", "Drive path or ISO file (e.g. D:\\ or C:\\movie.iso)", "Play"),
                FileDialogKind::NetworkStream => ("Open Network Stream", "Enter network URL (https://, rtsp://, rtmp://)", "Play"),
                FileDialogKind::CaptureDevice => ("Open Capture Device", "Capture source (e.g. desktop:// or dshow://)", "Open"),
                FileDialogKind::ConvertSave => ("Convert / Save", "Source media file path", "Select Output..."),
                FileDialogKind::Stream => ("Stream Media", "Stream source URL or file path", "Stream"),
            };
            let mut keep_open = true;
            egui::Window::new(title)
                .collapsible(false)
                .resizable(false)
                .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
                .show(&ctx, |ui| {
                    ui.set_min_width(380.0);
                    ui.label(hint);
                    ui.add_space(6.0);
                    ui.horizontal(|ui| {
                        ui.add_sized([290.0, 28.0], egui::TextEdit::singleline(&mut input_val));
                        if matches!(kind, FileDialogKind::Disc | FileDialogKind::ConvertSave)
                            && ui.button("Browse...").clicked()
                        {
                            if let Some(p) = rfd::FileDialog::new().pick_file() {
                                input_val = p.to_string_lossy().to_string();
                            }
                        }
                    });
                    ui.add_space(10.0);
                    ui.horizontal(|ui| {
                        if ui.button("Cancel").clicked() {
                            keep_open = false;
                        }
                        if ui.button(action_lbl).clicked() && !input_val.trim().is_empty() {
                            let target = input_val.trim().to_string();
                            if matches!(kind, FileDialogKind::ConvertSave) {
                                if let Some(out) = rfd::FileDialog::new()
                                    .set_file_name("converted.mp4")
                                    .save_file()
                                {
                                    let _ = std::process::Command::new("ffmpeg")
                                        .args(["-y", "-i", &target, "-c", "copy"])
                                        .arg(&out)
                                        .spawn();
                                }
                            } else {
                                self.player_error = None;
                                self.playback_started_at = chrono::Utc::now();
                                let _ = self.player.send(PlayerCommand::Open {
                                    paths: vec![PathBuf::from(target)],
                                    start_index: 0,
                                    start_position_secs: 0.0,
                                    origin: valor_player::OpenOrigin::default(),
                                });
                            }
                            keep_open = false;
                        }
                    });
                });
            if keep_open {
                self.file_dialog = Some((kind, input_val));
            }
        }
    }
}

fn uuid_like_id(seed: &str) -> String {
    let mut hash: u64 = 0xcbf29ce484222325;
    for b in seed.as_bytes() {
        hash ^= *b as u64;
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("item-{hash:016x}")
}

fn load_env_key(keys: &[&str]) -> String {
    for &key in keys {
        if let Ok(v) = std::env::var(key) {
            if !v.trim().is_empty() {
                return v.trim().to_string();
            }
        }
    }
    let env_files = [
        ".env",
        ".env.local",
        ".env.valor-stack",
        "../valor-embed/.env",
        "../valor-embed/.env.local",
        "../valor-embed/.env.valor-stack",
    ];
    for file in env_files {
        if let Ok(env_text) = std::fs::read_to_string(file) {
            for line in env_text.lines() {
                let trimmed = line.trim();
                for &key in keys {
                    if let Some(rest) = trimmed.strip_prefix(&format!("{key}=")) {
                        let val = rest.trim().trim_matches('"').trim_matches('\'').to_string();
                        if !val.is_empty() {
                            return val;
                        }
                    }
                }
            }
        }
    }
    String::new()
}

fn load_tmdb_token(settings_key: &str) -> String {
    if !settings_key.trim().is_empty() {
        return settings_key.trim().to_string();
    }
    load_env_key(&["VITE_TMDB_BEARER_TOKEN", "VITE_TMDB_API_KEY"])
}

fn silent_curl() -> std::process::Command {
    let mut cmd = std::process::Command::new("curl");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd
}

fn tmdb_get_json(token: &str, url: &str) -> Option<serde_json::Value> {
    if token.trim().is_empty() {
        // Fallback to web folder backend TMDB proxy if running
        if let Some(endpoint) = url.strip_prefix("https://api.themoviedb.org/3") {
            let proxy_url = format!(
                "https://player.streamiteasy.xyz/api/tmdb-proxy?endpoint={}",
                url_encode_query(endpoint)
            );
            return http_get_json(&proxy_url, "");
        }
        return None;
    }
    let mut cmd = silent_curl();
    let final_url = if !token.contains('.') {
        let sep = if url.contains('?') { '&' } else { '?' };
        format!("{url}{sep}api_key={token}")
    } else {
        url.to_string()
    };
    cmd.args(["-sS", "--max-time", "8", "-H", "Accept: application/json"]);
    if token.contains('.') {
        cmd.args(["-H", &format!("Authorization: Bearer {token}")]);
    }
    cmd.arg(&final_url);
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    serde_json::from_slice(&output.stdout).ok()
}

fn http_get_json(url: &str, bearer: &str) -> Option<serde_json::Value> {
    let mut cmd = silent_curl();
    cmd.args(["-sS", "--max-time", "5", "-H", "Accept: application/json"]);
    if !bearer.trim().is_empty() {
        cmd.args(["-H", &format!("Authorization: Bearer {}", bearer.trim())]);
    }
    cmd.arg(url);
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    serde_json::from_slice(&output.stdout).ok()
}

fn http_post_json(url: &str, body: &serde_json::Value) {
    let payload = match serde_json::to_string(body) {
        Ok(s) => s,
        Err(_) => return,
    };
    let mut cmd = silent_curl();
    let _ = cmd
        .args([
            "-sS",
            "--max-time",
            "5",
            "-X",
            "POST",
            "-H",
            "Content-Type: application/json",
            "-d",
            &payload,
            url,
        ])
        .output();
}

fn url_encode_query(q: &str) -> String {
    let mut out = String::with_capacity(q.len() * 2);
    for b in q.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            b' ' => out.push_str("%20"),
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

fn fetch_tmdb_series_info(
    token: &str,
    title: &str,
    local_seasons: &[u32],
) -> Option<valor_ui::shell_state::TmdbSeriesInfo> {
    let search_url = format!(
        "https://api.themoviedb.org/3/search/tv?query={}",
        url_encode_query(title)
    );
    let search_json = tmdb_get_json(token, &search_url)?;
    let first = search_json.get("results")?.as_array()?.first()?;
    let tmdb_id = first.get("id")?.as_u64()?;

    let detail_url = format!("https://api.themoviedb.org/3/tv/{tmdb_id}");
    let detail_json = tmdb_get_json(token, &detail_url)?;
    let mut info = valor_ui::shell_state::TmdbSeriesInfo {
        tmdb_id,
        name: detail_json
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or(title)
            .to_string(),
        media_type: "tv".to_string(),
        release_year: detail_json
            .get("first_air_date")
            .and_then(|v| v.as_str())
            .and_then(|d| d.get(..4))
            .unwrap_or_default()
            .to_string(),
        vote_average: detail_json
            .get("vote_average")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0) as f32,
        overview: detail_json
            .get("overview")
            .and_then(|v| v.as_str())
            .unwrap_or_default()
            .to_string(),
        genres: detail_json
            .get("genres")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter()
                    .filter_map(|g| g.get("name").and_then(|n| n.as_str()).map(String::from))
                    .take(4)
                    .collect()
            })
            .unwrap_or_default(),
        total_seasons: detail_json
            .get("number_of_seasons")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
        total_episodes: detail_json
            .get("number_of_episodes")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32,
        ..Default::default()
    };

    if let Some(seasons) = detail_json.get("seasons").and_then(|v| v.as_array()) {
        for s in seasons {
            let s_num = s.get("season_number").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            let ep_cnt = s.get("episode_count").and_then(|v| v.as_u64()).unwrap_or(0) as u32;
            if s_num > 0 && ep_cnt > 0 {
                info.season_episode_counts.insert(s_num, ep_cnt);
            }
        }
    }

    let mut seasons_to_fetch: Vec<u32> = local_seasons.to_vec();
    for &s_num in info.season_episode_counts.keys() {
        if !seasons_to_fetch.contains(&s_num) && seasons_to_fetch.len() < 12 {
            seasons_to_fetch.push(s_num);
        }
    }
    seasons_to_fetch.sort_unstable();
    seasons_to_fetch.dedup();

    for s_num in seasons_to_fetch {
        let season_url = format!("https://api.themoviedb.org/3/tv/{tmdb_id}/season/{s_num}");
        if let Some(s_json) = tmdb_get_json(token, &season_url) {
            if let Some(eps) = s_json.get("episodes").and_then(|v| v.as_array()) {
                for ep in eps {
                    if let (Some(ep_num), Some(ep_name)) = (
                        ep.get("episode_number").and_then(|v| v.as_u64()),
                        ep.get("name").and_then(|v| v.as_str()),
                    ) {
                        info.episode_titles
                            .insert((s_num, ep_num as u32), ep_name.to_string());
                    }
                }
            }
        }
    }

    Some(info)
}

fn parse_web_db_bookmarks(fingerprint: &str, json: &serde_json::Value) -> Vec<valor_core::models::Bookmark> {
    let mut out = Vec::new();
    let Some(arr) = json.get("bookmarks").and_then(|v| v.as_array()) else {
        return out;
    };
    for (idx, b) in arr.iter().enumerate() {
        let start_secs = b
            .get("startTime")
            .or_else(|| b.get("time"))
            .or_else(|| b.get("start_secs"))
            .and_then(|v| v.as_f64())
            .unwrap_or(-1.0);
        if start_secs < 0.0 {
            continue;
        }
        let end_secs = b
            .get("endTime")
            .or_else(|| b.get("end_secs"))
            .and_then(|v| v.as_f64())
            .filter(|e| *e > start_secs);
        let raw_cat = b
            .get("category")
            .and_then(|v| v.as_str())
            .unwrap_or("custom");
        let is_intro = b.get("isIntro").and_then(|v| v.as_bool()).unwrap_or(false)
            || raw_cat.eq_ignore_ascii_case("intro");
        let is_outro = b.get("isOutro").and_then(|v| v.as_bool()).unwrap_or(false)
            || raw_cat.eq_ignore_ascii_case("outro")
            || raw_cat.eq_ignore_ascii_case("credits");
        let category = if is_intro {
            "intro".to_string()
        } else if is_outro {
            "credits".to_string()
        } else if raw_cat.eq_ignore_ascii_case("recap") {
            "recap".to_string()
        } else if raw_cat.eq_ignore_ascii_case("scene") {
            "scene".to_string()
        } else {
            "custom".to_string()
        };
        let title = b
            .get("title")
            .or_else(|| b.get("label"))
            .and_then(|v| v.as_str())
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(if is_intro { "Intro" } else if is_outro { "Outro" } else { "Bookmark" })
            .to_string();
        let id = b
            .get("id")
            .and_then(|v| v.as_str())
            .map(String::from)
            .unwrap_or_else(|| format!("web-{fingerprint}-{idx}-{}", (start_secs * 1000.0) as u64));
        out.push(valor_core::models::Bookmark {
            id,
            fingerprint: fingerprint.to_string(),
            title,
            start_secs,
            end_secs,
            category,
            created_at: chrono::Utc::now(),
        });
    }
    out
}

fn parse_tidb_segments(fingerprint: &str, json: &serde_json::Value) -> Vec<valor_core::models::Bookmark> {
    let mut out = Vec::new();
    for (field, category, label) in [
        ("intro", "intro", "Intro"),
        ("recap", "recap", "Recap"),
        ("credits", "credits", "Outro / Credits"),
        ("outro", "credits", "Outro"),
    ] {
        if let Some(arr) = json.get(field).and_then(|v| v.as_array()) {
            for (idx, seg) in arr.iter().enumerate() {
                let start_secs = seg
                    .get("start_ms")
                    .and_then(|v| v.as_f64())
                    .map(|ms| ms / 1000.0)
                    .or_else(|| seg.get("start_sec").and_then(|v| v.as_f64()))
                    .unwrap_or(-1.0);
                let end_secs = seg
                    .get("end_ms")
                    .and_then(|v| v.as_f64())
                    .map(|ms| ms / 1000.0)
                    .or_else(|| seg.get("end_sec").and_then(|v| v.as_f64()));
                if start_secs >= 0.0 {
                    out.push(valor_core::models::Bookmark {
                        id: format!("tidb-{fingerprint}-{category}-{idx}"),
                        fingerprint: fingerprint.to_string(),
                        title: label.to_string(),
                        start_secs,
                        end_secs: end_secs.filter(|e| *e > start_secs),
                        category: category.to_string(),
                        created_at: chrono::Utc::now(),
                    });
                }
            }
        }
    }
    out
}

fn fetch_web_db_and_tidb_bookmarks(
    fingerprint: &str,
    title: &str,
    season: Option<u32>,
    episode: Option<u32>,
    duration_secs: f64,
    tmdb_token: &str,
    introdb_key: &str,
) -> BookmarkSyncResult {
    let mut tmdb_id: Option<u64> = None;
    let mut tmdb_rating: Option<f32> = None;

    if !tmdb_token.is_empty() && !title.trim().is_empty() {
        let is_tv = season.is_some() || episode.is_some();
        let endpoint = if is_tv { "tv" } else { "movie" };
        let search_url = format!(
            "https://api.themoviedb.org/3/search/{endpoint}?query={}",
            url_encode_query(title)
        );
        if let Some(s_json) = tmdb_get_json(tmdb_token, &search_url) {
            if let Some(first) = s_json.get("results").and_then(|v| v.as_array()).and_then(|a| a.first()) {
                tmdb_id = first.get("id").and_then(|v| v.as_u64());
                tmdb_rating = first
                    .get("vote_average")
                    .and_then(|v| v.as_f64())
                    .map(|r| r as f32)
                    .filter(|r| *r > 0.0);
            }
        }
    }

    let mut web_url = format!(
        "https://player.streamiteasy.xyz/api/timestamps?videoId={}&autoSync=true",
        url_encode_query(fingerprint)
    );
    if let Some(id) = tmdb_id {
        web_url.push_str(&format!("&tmdbId={id}"));
    }
    if let (Some(s), Some(e)) = (season, episode) {
        web_url.push_str(&format!("&season={s}&episode={e}"));
    }
    if duration_secs > 1.0 {
        web_url.push_str(&format!("&duration={:.0}", duration_secs));
    }

    let mut bookmarks = Vec::new();
    let mut tidb_synced = false;

    if let Some(web_json) = http_get_json(&web_url, "") {
        tidb_synced = web_json
            .get("inIntroDb")
            .and_then(|v| v.as_bool())
            .unwrap_or(false);
        bookmarks.extend(parse_web_db_bookmarks(fingerprint, &web_json));
    }

    // Direct TheIntroDB v4 fallback if web player DB is offline or has no intro/outro yet
    let has_intro_or_outro = bookmarks
        .iter()
        .any(|b| b.category == "intro" || b.category == "credits");
    if !has_intro_or_outro {
        if let Some(id) = tmdb_id {
            let mut tidb_url = format!("https://api.theintrodb.org/v4/media?tmdb_id={id}");
            if let (Some(s), Some(e)) = (season, episode) {
                if s > 0 {
                    tidb_url.push_str(&format!("&season={s}&episode={e}"));
                }
            }
            if let Some(tidb_json) = http_get_json(&tidb_url, introdb_key) {
                let tidb_bms = parse_tidb_segments(fingerprint, &tidb_json);
                if !tidb_bms.is_empty() {
                    tidb_synced = true;
                    bookmarks.extend(tidb_bms);
                }
            }
        }
    }

    BookmarkSyncResult {
        fingerprint: fingerprint.to_string(),
        bookmarks,
        tmdb_rating,
        tidb_synced,
    }
}

fn push_bookmarks_to_web_db(bookmarks: &[valor_core::models::Bookmark]) {
    if bookmarks.is_empty() {
        return;
    }
    let video_id = bookmarks[0].fingerprint.clone();
    let arr: Vec<serde_json::Value> = bookmarks
        .iter()
        .map(|bm| {
            let is_intro = bm.category.eq_ignore_ascii_case("intro");
            let is_outro = bm.category.eq_ignore_ascii_case("credits")
                || bm.category.eq_ignore_ascii_case("outro");
            serde_json::json!({
                "id": bm.id,
                "videoId": bm.fingerprint,
                "title": bm.title,
                "label": bm.title,
                "startTime": bm.start_secs,
                "time": bm.start_secs,
                "endTime": bm.end_secs,
                "category": if is_intro { "Intro" } else if is_outro { "Outro" } else { &bm.category },
                "isIntro": is_intro,
                "isOutro": is_outro,
                "createdBy": "manual"
            })
        })
        .collect();
    let body = serde_json::json!({
        "userId": "admin",
        "videoId": video_id,
        "bookmarks": arr,
    });
    http_post_json("https://player.streamiteasy.xyz/api/timestamps", &body);
}

const WEB_TRAKT_CLIENT_ID: &str = "V4WfZovVxhKMc-KNyfTHgL_KtI84gJLnBHMss-qwu88";

fn trakt_client_id() -> String {
    let from_env = load_env_key(&["VITE_TRAKT_CLIENT_ID"]);
    if from_env.is_empty() {
        WEB_TRAKT_CLIENT_ID.to_string()
    } else {
        from_env
    }
}

fn http_post_json_resp(url: &str, body: &serde_json::Value, extra_headers: &[(&str, &str)]) -> Option<serde_json::Value> {
    let payload = serde_json::to_string(body).ok()?;
    let mut cmd = silent_curl();
    cmd.args(["-sS", "--max-time", "8", "-X", "POST", "-H", "Content-Type: application/json"]);
    for (k, v) in extra_headers {
        cmd.args(["-H", &format!("{k}: {v}")]);
    }
    cmd.args(["-d", &payload, url]);
    let output = cmd.output().ok()?;
    if !output.status.success() {
        return None;
    }
    serde_json::from_slice(&output.stdout).ok()
}

fn request_trakt_device_code() -> Option<(String, String, String)> {
    let res = http_post_json_resp(
        "https://player.streamiteasy.xyz/api/trakt/device/code",
        &serde_json::json!({}),
        &[],
    )
    .or_else(|| {
        let cid = trakt_client_id();
        http_post_json_resp(
            "https://api.trakt.tv/oauth/device/code",
            &serde_json::json!({ "client_id": cid }),
            &[("trakt-api-version", "2"), ("trakt-api-key", &cid), ("User-Agent", "Valor/1.0.0")],
        )
    })?;
    let user_code = res.get("user_code")?.as_str()?.to_string();
    let device_code = res.get("device_code")?.as_str()?.to_string();
    let verify_url = res
        .get("verification_url")
        .and_then(|v| v.as_str())
        .unwrap_or("https://trakt.tv/activate")
        .to_string();
    Some((user_code, device_code, verify_url))
}

fn poll_trakt_device_token(device_code: &str) -> Result<(String, String, String), String> {
    let res = http_post_json_resp(
        "https://player.streamiteasy.xyz/api/trakt/device/token",
        &serde_json::json!({ "code": device_code }),
        &[],
    )
    .or_else(|| {
        let cid = trakt_client_id();
        http_post_json_resp(
            "https://api.trakt.tv/oauth/device/token",
            &serde_json::json!({ "code": device_code, "client_id": cid }),
            &[("trakt-api-version", "2"), ("trakt-api-key", &cid), ("User-Agent", "Valor/1.0.0")],
        )
    })
    .ok_or_else(|| "Unable to reach Trakt backend.".to_string())?;

    let Some(access_token) = res.get("access_token").and_then(|v| v.as_str()) else {
        return Err("Authorization still pending — finish entering the code on trakt.tv/activate and try again.".to_string());
    };
    let refresh_token = res
        .get("refresh_token")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let mut username = String::new();
    if let Some(user_json) = http_post_json_resp(
        "https://player.streamiteasy.xyz/api/trakt/user",
        &serde_json::json!({ "access_token": access_token }),
        &[],
    ) {
        username = user_json
            .get("user")
            .and_then(|u| u.get("username"))
            .or_else(|| user_json.get("username"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
    }
    Ok((access_token.to_string(), refresh_token, username))
}

fn open_url_in_browser(url: &str) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(url).spawn()?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::process::Command::new("xdg-open").arg(url).spawn();
    }
    Ok(())
}

fn resolve_library_tmdb_and_recommendations(
    items: &[valor_core::models::MediaItem],
    tele: &std::collections::HashMap<String, valor_core::models::MediaTelemetry>,
    token: &str,
    tx: &Sender<(String, u64, Vec<String>, f32)>,
    recs_tx: &Sender<Vec<valor_ui::shell_state::TmdbRecommendation>>,
) {
    let mut resolved_ids: Vec<(String, u64, String, f64)> = Vec::new();
    let mut fetched = 0usize;
    for item in items {
        if item.is_missing {
            continue;
        }
        if let Some(existing) = tele.get(&item.fingerprint) {
            if let Some(tid) = existing.tmdb_id {
                let kind = if item.season_number.is_some() { "tv" } else { "movie" };
                let skip_pen = 1.0 / (1.0 + (existing.skips_used as f64) * 0.25);
                let score = existing.time_spent_secs.max(1.0) * skip_pen;
                resolved_ids.push((item.fingerprint.clone(), tid, kind.to_string(), score));
                continue;
            }
        }
        if fetched >= 25 || item.title.trim().is_empty() {
            continue;
        }
        fetched += 1;
        let is_tv = item.season_number.is_some() || item.episode_number.is_some();
        let endpoint = if is_tv { "tv" } else { "movie" };
        let url = format!(
            "https://api.themoviedb.org/3/search/{endpoint}?query={}",
            url_encode_query(&item.title)
        );
        if let Some(json) = tmdb_get_json(token, &url) {
            if let Some(first) = json.get("results").and_then(|v| v.as_array()).and_then(|a| a.first()) {
                if let Some(tmdb_id) = first.get("id").and_then(|v| v.as_u64()) {
                    let vote = first.get("vote_average").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
                    let detail_url = format!("https://api.themoviedb.org/3/{endpoint}/{tmdb_id}");
                    let genres = tmdb_get_json(token, &detail_url)
                        .and_then(|d| {
                            d.get("genres").and_then(|v| v.as_array()).map(|arr| {
                                arr.iter()
                                    .filter_map(|g| g.get("name").and_then(|n| n.as_str()).map(String::from))
                                    .take(4)
                                    .collect::<Vec<_>>()
                            })
                        })
                        .unwrap_or_default();
                    let _ = tx.send((item.fingerprint.clone(), tmdb_id, genres, vote));
                    let skip_pen = tele
                        .get(&item.fingerprint)
                        .map(|t| 1.0 / (1.0 + (t.skips_used as f64) * 0.25))
                        .unwrap_or(1.0);
                    let spent = tele.get(&item.fingerprint).map(|t| t.time_spent_secs).unwrap_or(0.0);
                    resolved_ids.push((item.fingerprint.clone(), tmdb_id, endpoint.to_string(), spent * skip_pen));
                }
            }
        }
    }

    // Pick top-judged watched TMDB ID to fetch recommendations
    resolved_ids.sort_by(|a, b| b.3.total_cmp(&a.3));
    if let Some((_, top_id, top_kind, _)) = resolved_ids.first() {
        let rec_url = format!("https://api.themoviedb.org/3/{top_kind}/{top_id}/recommendations");
        if let Some(rec_json) = tmdb_get_json(token, &rec_url) {
            if let Some(arr) = rec_json.get("results").and_then(|v| v.as_array()) {
                let mut recs = Vec::new();
                for r in arr.iter().take(6) {
                    let Some(id) = r.get("id").and_then(|v| v.as_u64()) else { continue; };
                    let title = r
                        .get("title")
                        .or_else(|| r.get("name"))
                        .and_then(|v| v.as_str())
                        .unwrap_or("Recommended")
                        .to_string();
                    let vote = r.get("vote_average").and_then(|v| v.as_f64()).unwrap_or(0.0) as f32;
                    let year = r
                        .get("release_date")
                        .or_else(|| r.get("first_air_date"))
                        .and_then(|v| v.as_str())
                        .and_then(|d| d.get(..4))
                        .unwrap_or("")
                        .to_string();
                    recs.push(valor_ui::shell_state::TmdbRecommendation {
                        tmdb_id: id,
                        title,
                        media_type: top_kind.clone(),
                        vote_average: vote,
                        release_year: year,
                        reason: "Based on your watched media & low skips".to_string(),
                    });
                }
                let _ = recs_tx.send(recs);
            }
        }
    }
}

fn disable_dwm_border_for_active_window() {
    #[cfg(windows)]
    unsafe {
        use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWINDOWATTRIBUTE};
        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        let hwnd = GetForegroundWindow();
        if !hwnd.0.is_null() {
            // DWMWA_BORDER_COLOR = 34, DWMWA_COLOR_NONE = 0xFFFFFFFE
            let color_none: u32 = 0xFFFFFFFE;
            let _ = DwmSetWindowAttribute(
                hwnd,
                DWMWINDOWATTRIBUTE(34),
                &color_none as *const u32 as *const _,
                std::mem::size_of::<u32>() as u32,
            );
        }
    }
}

fn read_clipboard_text() -> Option<String> {
    #[cfg(windows)]
    {
        if let Ok(output) = std::process::Command::new("powershell")
            .args(["-NoProfile", "-Command", "Get-Clipboard"])
            .output()
        {
            if output.status.success() {
                let s = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if !s.is_empty() {
                    return Some(s);
                }
            }
        }
    }
    None
}

fn spawn_background_thumbnailer(
    items: &[valor_core::models::MediaItem],
    excluded_paths: &[PathBuf],
) {
    let excluded = excluded_paths.to_vec();
    let items_to_process: Vec<(PathBuf, String)> = items
        .iter()
        .filter_map(|item| {
            let path = PathBuf::from(&item.file_path);
            if excluded.iter().any(|ex| valor_core::path_utils::path_is_within(&path, ex)) {
                None
            } else {
                Some((path, item.fingerprint.clone()))
            }
        })
        .collect();

    std::thread::spawn(move || {
        let Some(cache_dir) = directories::ProjectDirs::from("com", "valor", "Valor") else {
            return;
        };
        let thumb_dir = cache_dir.cache_dir().join("thumbnails");
        let _ = std::fs::create_dir_all(&thumb_dir);

        for (file_path, fingerprint) in items_to_process {
            let thumb_path = thumb_dir.join(format!("{}.jpg", fingerprint));
            if thumb_path.exists() {
                continue;
            }
            if !file_path.exists() {
                continue;
            }

            let _ = crate::thumbnail_extractor::extract_thumbnail_to_file(
                &file_path,
                &thumb_path,
                320,
                180,
            );
        }
    });
}

fn http_get_json_headers(url: &str, headers: &[(&str, &str)]) -> Result<serde_json::Value, String> {
    let mut cmd = silent_curl();
    cmd.args(["-sS", "--max-time", "10", "-H", "Accept: application/json"]);
    for (k, v) in headers {
        cmd.args(["-H", &format!("{k}: {v}")]);
    }
    cmd.arg(url);
    let out = cmd.output().map_err(|e| format!("curl failed: {e}"))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("HTTP request failed: {err}"));
    }
    serde_json::from_slice(&out.stdout).map_err(|e| format!("Invalid JSON from server: {e}"))
}

fn connect_and_browse_server(
    mut srv: valor_core::settings::MediaServerConfig,
    password: &str,
) -> Result<ServerWorkerMsg, String> {
    let base = srv.base_url.trim_end_matches('/').to_string();
    if srv.kind == "plex" {
        if srv.token.trim().is_empty() {
            return Err("Plex requires an X-Plex-Token.".to_string());
        }
        let sections_url = format!("{base}/library/sections?X-Plex-Token={}", srv.token);
        let res = http_get_json_headers(
            &sections_url,
            &[
                ("X-Plex-Product", "Valor"),
                ("X-Plex-Version", "1.0.0"),
                ("X-Plex-Client-Identifier", "valor-desktop"),
                ("X-Plex-Device", "Desktop"),
            ],
        )?;
        let dirs = res
            .get("MediaContainer")
            .and_then(|mc| mc.get("Directory"))
            .and_then(|d| d.as_array())
            .cloned()
            .unwrap_or_default();
        let libs: Vec<valor_ui::shell_state::ServerLibraryItem> = dirs
            .iter()
            .filter_map(|d| {
                let id = d.get("key")?.as_str()?.to_string();
                let name = d.get("title")?.as_str()?.to_string();
                let kind = d.get("type").and_then(|t| t.as_str()).unwrap_or("movie").to_string();
                Some(valor_ui::shell_state::ServerLibraryItem { id, name, kind })
            })
            .collect();
        let first_lib_id = libs.first().map(|l| l.id.clone());
        let items = if let Some(ref lib_id) = first_lib_id {
            fetch_server_library_items(&srv, lib_id).unwrap_or_default()
        } else {
            Vec::new()
        };
        return Ok(ServerWorkerMsg::Connected {
            server: srv,
            libs,
            first_lib_id,
            items,
        });
    }

    // Jellyfin / Emby
    let auth_header_base = "MediaBrowser Client=\"Valor\", Device=\"Desktop\", DeviceId=\"valor-desktop\", Version=\"1.0.0\"".to_string();
    if srv.token.trim().is_empty() {
        if srv.username.trim().is_empty() {
            return Err("Jellyfin requires Username + Password or an API Token.".to_string());
        }
        let auth_url = format!("{base}/Users/AuthenticateByName");
        let auth_res = http_post_json_resp(
            &auth_url,
            &serde_json::json!({
                "Username": srv.username,
                "Pw": password,
            }),
            &[("X-Emby-Authorization", &auth_header_base)],
        )
        .ok_or_else(|| "Jellyfin authentication failed.".to_string())?;
        srv.token = auth_res
            .get("AccessToken")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Jellyfin did not return AccessToken.".to_string())?
            .to_string();
        if let Some(uid) = auth_res.get("User").and_then(|u| u.get("Id")).and_then(|v| v.as_str()) {
            srv.user_id = uid.to_string();
        }
    }

    if srv.user_id.trim().is_empty() {
        let me_url = format!("{base}/Users/Me?api_key={}", srv.token);
        if let Ok(me) = http_get_json_headers(&me_url, &[]) {
            if let Some(uid) = me.get("Id").and_then(|v| v.as_str()) {
                srv.user_id = uid.to_string();
            }
        }
    }

    let views_url = if srv.user_id.is_empty() {
        format!("{base}/Library/MediaFolders?api_key={}", srv.token)
    } else {
        format!("{base}/Users/{}/Views?api_key={}", srv.user_id, srv.token)
    };
    let views = http_get_json_headers(&views_url, &[])?;
    let arr = views
        .get("Items")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let libs: Vec<valor_ui::shell_state::ServerLibraryItem> = arr
        .iter()
        .filter_map(|it| {
            let id = it.get("Id")?.as_str()?.to_string();
            let name = it.get("Name")?.as_str()?.to_string();
            let kind = it.get("CollectionType").and_then(|v| v.as_str()).unwrap_or("movies").to_string();
            Some(valor_ui::shell_state::ServerLibraryItem { id, name, kind })
        })
        .collect();
    let first_lib_id = libs.first().map(|l| l.id.clone());
    let items = if let Some(ref lib_id) = first_lib_id {
        fetch_server_library_items(&srv, lib_id).unwrap_or_default()
    } else {
        Vec::new()
    };
    Ok(ServerWorkerMsg::Connected {
        server: srv,
        libs,
        first_lib_id,
        items,
    })
}

fn fetch_server_library_items(
    srv: &valor_core::settings::MediaServerConfig,
    lib_id: &str,
) -> Result<Vec<valor_ui::shell_state::ServerMediaItem>, String> {
    let base = srv.base_url.trim_end_matches('/');
    if srv.kind == "plex" {
        let url = format!("{base}/library/sections/{lib_id}/all?X-Plex-Token={}", srv.token);
        let res = http_get_json_headers(
            &url,
            &[
                ("X-Plex-Product", "Valor"),
                ("X-Plex-Version", "1.0.0"),
                ("X-Plex-Client-Identifier", "valor-desktop"),
            ],
        )?;
        let meta = res
            .get("MediaContainer")
            .and_then(|mc| mc.get("Metadata"))
            .and_then(|m| m.as_array())
            .cloned()
            .unwrap_or_default();
        let mut items = Vec::new();
        for m in meta {
            let id = m.get("ratingKey").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let title = m.get("title").and_then(|v| v.as_str()).unwrap_or("Untitled").to_string();
            let kind = m.get("type").and_then(|v| v.as_str()).unwrap_or("movie").to_string();
            let year = m.get("year").and_then(|v| v.as_u64()).map(|y| y as u32);
            let duration_secs = m.get("duration").and_then(|v| v.as_f64()).unwrap_or(0.0) / 1000.0;
            let part_key = m
                .get("Media")
                .and_then(|med| med.as_array())
                .and_then(|arr| arr.first())
                .and_then(|med0| med0.get("Part"))
                .and_then(|p| p.as_array())
                .and_then(|arr| arr.first())
                .and_then(|p0| p0.get("key"))
                .and_then(|k| k.as_str());
            if let Some(pk) = part_key {
                let stream_url = format!("{base}{pk}?X-Plex-Token={}", srv.token);
                items.push(valor_ui::shell_state::ServerMediaItem {
                    id,
                    title,
                    kind,
                    stream_url,
                    year,
                    duration_secs,
                });
            }
        }
        return Ok(items);
    }

    // Jellyfin / Emby
    let items_url = if srv.user_id.is_empty() {
        format!(
            "{base}/Items?ParentId={lib_id}&IncludeItemTypes=Movie,Episode,Video&Recursive=true&Fields=MediaSources,RunTimeTicks,ProductionYear&Limit=300&api_key={}",
            srv.token
        )
    } else {
        format!(
            "{base}/Users/{}/Items?ParentId={lib_id}&IncludeItemTypes=Movie,Episode,Video&Recursive=true&Fields=MediaSources,RunTimeTicks,ProductionYear&Limit=300&api_key={}",
            srv.user_id, srv.token
        )
    };
    let res = http_get_json_headers(&items_url, &[])?;
    let arr = res
        .get("Items")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for it in arr {
        let Some(id) = it.get("Id").and_then(|v| v.as_str()).map(|s| s.to_string()) else {
            continue;
        };
        let series_name = it.get("SeriesName").and_then(|v| v.as_str());
        let raw_name = it.get("Name").and_then(|v| v.as_str()).unwrap_or("Untitled");
        let title = if let Some(sn) = series_name {
            let s = it.get("ParentIndexNumber").and_then(|v| v.as_u64()).unwrap_or(0);
            let e = it.get("IndexNumber").and_then(|v| v.as_u64()).unwrap_or(0);
            if s > 0 && e > 0 {
                format!("{sn} S{s:02}E{e:02} - {raw_name}")
            } else {
                format!("{sn} - {raw_name}")
            }
        } else {
            raw_name.to_string()
        };
        let kind = it.get("Type").and_then(|v| v.as_str()).unwrap_or("Movie").to_string();
        let year = it.get("ProductionYear").and_then(|v| v.as_u64()).map(|y| y as u32);
        let ticks = it.get("RunTimeTicks").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let duration_secs = ticks / 10_000_000.0;
        let source_id = it
            .get("MediaSources")
            .and_then(|ms| ms.as_array())
            .and_then(|arr| arr.first())
            .and_then(|ms0| ms0.get("Id"))
            .and_then(|v| v.as_str())
            .unwrap_or(&id);
        let stream_url = format!(
            "{base}/Videos/{id}/stream?static=true&MediaSourceId={source_id}&api_key={}",
            srv.token
        );
        out.push(valor_ui::shell_state::ServerMediaItem {
            id,
            title,
            kind,
            stream_url,
            year,
            duration_secs,
        });
    }
    Ok(out)
}
