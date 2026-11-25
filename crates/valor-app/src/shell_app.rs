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
    restored_tracks_token: u64,
    last_saved_tracks: Option<(String, Option<i64>, Option<i64>)>,
    scrub_extracting: HashSet<String>,
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
        let mut state = ShellState::new();
        let tmdb_token = load_tmdb_token(&state.settings.tmdb_api_key);
        state.root_folders = folders.iter().cloned().map(FolderTreeNode::new).collect();
        state.excluded_paths = excluded_paths;
        state.folder_counts = db.folder_media_counts().unwrap_or_default();
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
            restored_tracks_token: 0,
            last_saved_tracks: None,
            scrub_extracting: HashSet::new(),
        };
        let _ = app.player.ensure_render_context();
        spawn_background_thumbnailer(&app.items, &app.state.excluded_paths);
        for folder in app.folders.clone() {
            app.start_scan(folder);
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
            folder_items.sort_by_key(|path| {
                path.file_name()
                    .map(|name| name.to_string_lossy().to_lowercase())
                    .unwrap_or_default()
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
                series_items.sort_by_key(|path| {
                    path.file_name()
                        .map(|name| name.to_string_lossy().to_lowercase())
                        .unwrap_or_default()
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
        let Some(item) = self
            .items
            .iter()
            .find(|item| std::path::Path::new(&item.file_path) == path)
            .cloned()
        else {
            return;
        };
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
        while let Ok((key, info)) = self.tmdb_rx.try_recv() {
            self.state.tmdb_pending.remove(&key);
            self.state.tmdb_series_cache.insert(key, info);
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
        if self.is_fullscreen {
            if self.was_focused && !is_focused {
                // Alt+Tab out: cleanly drop fullscreen so Windows doesn't leave a broken frame
                ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(false));
            } else if !self.was_focused && is_focused {
                // Alt+Tab back in: automatically restore fullscreen + remove DWM border
                ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(true));
                disable_dwm_border_for_active_window();
            }
        }
        self.was_focused = is_focused;

        let snapshot = self.player.snapshot().read().clone();
        self.player_ui.skip_secs = self.state.settings.skip_secs.max(1) as f64;
        if snapshot.state != PlaybackState::Idle {
            self.opening_media = None;
            if let Some(render_error) = self.player_render_error.lock().clone() {
                self.player_error = Some(render_error);
            }
            let fingerprint = snapshot.path.as_ref().map(|path| {
                self.items
                    .iter()
                    .find(|item| {
                        let p = std::path::Path::new(&item.file_path);
                        p == path.as_path() || item.file_path.eq_ignore_ascii_case(&path.to_string_lossy())
                    })
                    .map(|item| item.fingerprint.clone())
                    .unwrap_or_else(|| path.to_string_lossy().to_string())
            });
            if fingerprint != self.player_ui.bookmark_fingerprint {
                self.player_ui.bookmark_fingerprint = fingerprint.clone();
                self.player_ui.bookmarks = fingerprint
                    .as_deref()
                    .and_then(|value| self.db.get_bookmarks(value).ok())
                    .unwrap_or_default();
            }
            if let Some(fp) = fingerprint.as_deref() {
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
                        let cur_audio = snapshot.tracks.iter().find(|t| t.kind == "audio" && t.selected).map(|t| t.id as i64);
                        let cur_sub = snapshot.tracks.iter().find(|t| t.kind == "sub" && t.selected).map(|t| t.id as i64).or(Some(-1));
                        let key = (fp.to_string(), cur_audio, cur_sub);
                        if self.last_saved_tracks.as_ref() != Some(&key) {
                            let _ = self.db.save_track_prefs(fp, cur_audio, cur_sub);
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
                    } else if pos.y < player_rect.bottom() - 88.0
                        && !self.player_ui.is_seeking
                        && ctx.input(|i| i.pointer.primary_down() && i.pointer.delta().length_sq() > 2.0)
                    {
                        ctx.send_viewport_cmd(egui::ViewportCommand::StartDrag);
                    }
                }
            }
            let mut player_ui = ui.new_child(egui::UiBuilder::new().max_rect(player_rect));
            let bridge = self.player.render_bridge();
            let callback_error = std::sync::Arc::clone(&self.player_render_error);
            let video_callback = egui_glow::CallbackFn::new(move |info, painter| {
                let gl = painter.gl();
                let current_fbo = unsafe {
                    use egui_glow::glow::{self, HasContext};
                    gl.get_parameter_i32(glow::DRAW_FRAMEBUFFER_BINDING)
                };
                let fbo = painter
                    .intermediate_fbo()
                    .map(|fb| fb.0.get() as i32)
                    .unwrap_or(current_fbo);
                let viewport = info.viewport_in_pixels();
                unsafe {
                    use egui_glow::glow::{self, HasContext};
                    gl.disable(glow::BLEND);
                    gl.disable(glow::SCISSOR_TEST);
                    gl.disable(glow::STENCIL_TEST);
                    gl.disable(glow::DEPTH_TEST);
                    gl.viewport(viewport.left_px, viewport.from_bottom_px, viewport.width_px, viewport.height_px);
                }
                if let Err(error) = bridge.render_frame(fbo, viewport.width_px, viewport.height_px)
                {
                    let mut previous = callback_error.lock();
                    if previous.as_deref() != Some(error.as_str()) {
                        tracing::error!("Video render callback failed: {error}");
                        *previous = Some(error);
                    }
                } else {
                    *callback_error.lock() = None;
                }
            });
            let video_shape = egui::Shape::Callback(egui::PaintCallback {
                rect: player_rect,
                callback: std::sync::Arc::new(video_callback),
            });
            let player = &self.player;
            let player_error_display = self.player_error.clone();
            let player_error = &mut self.player_error;
            self.player_ui.scrub_preview_texture = snapshot.path.as_deref().and_then(|p| {
                let fp = fingerprint.as_deref().unwrap_or("active");
                let thumb_dir = directories::ProjectDirs::from("com", "valor", "Valor")
                    .map(|dirs| dirs.cache_dir().join("thumbnails"))?;
                if let Some(hover_secs) = self.player_ui.scrub_hover_time {
                    let bucket = ((hover_secs.max(0.0) as u64) / 5) * 5;
                    let scrub_key = format!("scrub_{fp}_{bucket}");
                    let scrub_path = thumb_dir.join(format!("{scrub_key}.jpg"));
                    if scrub_path.is_file() {
                        return self.textures.get_or_request(&ctx, &scrub_key, Some(&scrub_path)).map(|t| t.id());
                    }
                    if self.scrub_extracting.insert(scrub_key.clone()) {
                        let src_path = p.to_path_buf();
                        let out_path = scrub_path.clone();
                        std::thread::spawn(move || {
                            let _ = std::fs::create_dir_all(out_path.parent().unwrap_or(&out_path));
                            let _ = std::process::Command::new("ffmpeg")
                                .args([
                                    "-ss",
                                    &bucket.to_string(),
                                    "-i",
                                    &src_path.to_string_lossy(),
                                    "-frames:v",
                                    "1",
                                    "-vf",
                                    "scale=168:94:force_original_aspect_ratio=decrease",
                                    "-q:v",
                                    "5",
                                    "-y",
                                ])
                                .arg(&out_path)
                                .output();
                        });
                    }
                }
                let thumb = thumb_dir.join(format!("{fp}.jpg"));
                if !thumb.is_file() {
                    let main_key = format!("main_{fp}");
                    if self.scrub_extracting.insert(main_key) {
                        let src_path = p.to_path_buf();
                        let out_path = thumb.clone();
                        std::thread::spawn(move || {
                            let _ = crate::thumbnail_extractor::extract_thumbnail_to_file(&src_path, &out_path, 320, 180);
                        });
                    }
                    return None;
                }
                self.textures.get_or_request(&ctx, fp, Some(&thumb)).map(|t| t.id())
            });
            let mut send = |command: PlayerCommand| {
                if let Err(error) = player.send(command) {
                    tracing::error!("Player command failed: {error}");
                    *player_error = Some(error);
                }
            };
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
                    self.pre_pip_inner_size =
                        ctx.input(|i| i.viewport().inner_rect.map(|r| r.size()));
                    self.is_pip = true;
                    ctx.send_viewport_cmd(egui::ViewportCommand::Resizable(true));
                    ctx.send_viewport_cmd(egui::ViewportCommand::MinInnerSize(egui::vec2(260.0, 146.0)));
                    ctx.send_viewport_cmd(egui::ViewportCommand::WindowLevel(egui::WindowLevel::AlwaysOnTop));
                    ctx.send_viewport_cmd(egui::ViewportCommand::InnerSize(egui::vec2(480.0, 270.0)));
                } else {
                    self.exit_pip(&ctx);
                }
            }
            for bookmark in &action.bookmarks_added {
                if let Err(error) = self.db.save_bookmark(bookmark) {
                    tracing::warn!(%error, "Could not save player bookmark");
                }
            }
            for id in &action.bookmarks_deleted {
                if let Err(error) = self.db.delete_bookmark(id) {
                    tracing::warn!(%error, "Could not delete player bookmark");
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
            ctx.request_repaint_after(std::time::Duration::from_millis(16));
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
                                        ui.add(
                                            egui::Spinner::new()
                                                .size(22.0)
                                                .color(egui::Color32::from_rgb(246, 130, 31)),
                                        );
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
            ctx.request_repaint_after(std::time::Duration::from_millis(16));
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
        self.tokens = ShellTokens::from_skin_id(&self.state.settings.skin_id);
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
            ShellAction::PlayMedia(path) => self.start_playback(path),
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
                let db = self.db.clone();
                let id_clone = id.clone();
                let _ = std::thread::Builder::new()
                    .name("valor-delete-session".into())
                    .spawn(move || {
                        let _ = db.delete_watch_session(&id_clone);
                    });
                self.sessions.retain(|s| s.id != id);
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
                    let _ = std::process::Command::new("rundll32.exe")
                        .args(["shell32.dll,OpenAs_RunDLL", &path.to_string_lossy()])
                        .spawn();
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

fn load_tmdb_token(settings_key: &str) -> String {
    if !settings_key.trim().is_empty() {
        return settings_key.trim().to_string();
    }
    if let Ok(v) = std::env::var("VITE_TMDB_BEARER_TOKEN") {
        if !v.trim().is_empty() {
            return v.trim().to_string();
        }
    }
    if let Ok(env_text) = std::fs::read_to_string(".env") {
        for line in env_text.lines() {
            let trimmed = line.trim();
            if let Some(rest) = trimmed.strip_prefix("VITE_TMDB_BEARER_TOKEN=") {
                return rest.trim().trim_matches('"').to_string();
            }
        }
    }
    String::new()
}

fn tmdb_get_json(token: &str, url: &str) -> Option<serde_json::Value> {
    let output = std::process::Command::new("curl")
        .args([
            "-sS",
            "--max-time",
            "8",
            "-H",
            "Accept: application/json",
            "-H",
            &format!("Authorization: Bearer {token}"),
            url,
        ])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    serde_json::from_slice(&output.stdout).ok()
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
