use chrono::Utc;
use eframe::egui;
use egui::{Color32, CornerRadius, Pos2, Rect, Sense, Vec2};
use parking_lot::Mutex;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::mpsc::Receiver;
use std::sync::Arc;
use std::time::Instant;
use tracing::info;

use valor_core::db::Database;
use valor_core::fingerprint::compute_fingerprint;
use valor_core::models::{
    Bookmark, ChapterItem, Collection, HistoryEntry, MediaItem, PlaybackPosition,
};
use valor_core::settings::Settings;
use valor_core::tracks::{find_preferred_track, find_sidecar_subtitles, TrackPreferencesManager};
use valor_library::parser::parse_media_filename;
use valor_library::scanner::scan_directory;
use valor_library::thumbnails::ThumbnailManager;
use valor_player::{PlaybackState, PlaybackStatus, PlayerEngine};
use valor_ui::auto_next_card::{render_auto_next_card, render_finished_card, AutoNextAction};
use valor_ui::bookmarks_modal::{render_bookmarks_modal, BookmarkAction, BookmarksModalState};
use valor_ui::components::{
    render_bottom_controls, render_hold_g_peek, render_pause_screen, render_resume_prompt,
    render_ui_settings_dock, ResumePromptAction, VideoUiState,
};
use valor_ui::context_menu::{render_context_menu, ContextMenuAction, ContextMenuState};
use valor_ui::dashboard::{render_dashboard, DashboardAction, DashboardState};
use valor_ui::enhancement_studio::{
    render_enhancement_studio, EnhancementStudioState, StudioAction,
};
use valor_ui::peek::{HoldGStateMachine, SavedUiSnapshot};
use valor_ui::playlist_drawer::{render_playlist_drawer, PlaylistAction, PlaylistDrawerState};
use valor_ui::shortcuts::KeymapManager;
use valor_ui::theme::ValorTheme;

use crate::power::update_os_power_state;
use crate::render::{get_proc_address, GlassCompositor, SharedRenderContext};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppView {
    Player,
    Dashboard,
}

pub fn expand_single_path(path: &Path, out: &mut Vec<PathBuf>) {
    if path.is_dir() {
        if let Ok(entries) = std::fs::read_dir(path) {
            let mut sub_entries: Vec<PathBuf> = entries.flatten().map(|e| e.path()).collect();
            sub_entries.sort_by(|a, b| {
                valor_player::collection::natural_cmp(&a.to_string_lossy(), &b.to_string_lossy())
            });
            for sub in sub_entries {
                expand_single_path(&sub, out);
            }
        }
    } else if path.is_file() {
        let is_media = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|ext| {
                matches!(
                    ext.to_ascii_lowercase().as_str(),
                    "mkv"
                        | "mp4"
                        | "m4v"
                        | "avi"
                        | "mov"
                        | "webm"
                        | "flv"
                        | "ts"
                        | "wmv"
                        | "mp3"
                        | "flac"
                        | "wav"
                        | "aac"
                        | "m4a"
                        | "opus"
                        | "ogg"
                        | "ass"
                        | "srt"
                        | "vtt"
                )
            })
            .unwrap_or(false);
        if is_media {
            out.push(path.to_path_buf());
        }
    }
}

pub struct ValorNativeApp {
    pub current_view: AppView,
    pub player: Arc<PlayerEngine>,
    pub render_gl: SharedRenderContext,
    pub glass_compositor: Arc<Mutex<GlassCompositor>>,
    pub db: Database,
    pub _settings: Settings,
    pub _thumbnail_mgr: ThumbnailManager,
    pub theme: ValorTheme,

    // Playlist & Media Collection State
    pub collection_name: String,
    pub playlist_items: Vec<MediaItem>,
    pub current_playlist_index: usize,

    // UI Sub-States
    pub ui_state: VideoUiState,
    pub playlist_state: PlaylistDrawerState,
    pub context_menu_state: Option<ContextMenuState>,
    pub bookmarks_state: BookmarksModalState,
    pub enhancement_state: EnhancementStudioState,
    pub dashboard_state: DashboardState,

    // Playback State
    pub playback_state: PlaybackState,
    pub is_playing: bool,
    pub hold_g: HoldGStateMachine,
    pub auto_next_countdown: Option<f64>,
    pub finished_countdown: Option<f64>,
    pub last_position_saved: Instant,

    // Auto-hide and Resume Prompt state
    pub last_mouse_activity: Instant,
    pub resume_toast: Option<(f64, f64)>,
    pub chapters: Vec<ChapterItem>,
    pub _keymap: KeymapManager,
    pub _pip_active: bool,
    pub ipc_receiver: Option<Receiver<PathBuf>>,

    // Cached bookmarks & DB items
    pub current_bookmarks: Vec<Bookmark>,
    pub all_items: Vec<MediaItem>,
    pub all_collections: Vec<Collection>,
    pub history_entries: Vec<HistoryEntry>,

    // Phase 3: Track preferences, delays, and A-B loop
    pub track_prefs_mgr: TrackPreferencesManager,
    pub current_audio_delay: f64,
    pub current_sub_delay: f64,
    pub ab_loop_a: Option<f64>,
    pub ab_loop_b: Option<f64>,
}

impl ValorNativeApp {
    pub fn new(
        cc: &eframe::CreationContext,
        ipc_receiver: Option<Receiver<PathBuf>>,
        disable_blur: bool,
    ) -> Self {
        info!("Initializing Valor Native Player Application");

        let db_path = directories::ProjectDirs::from("com", "valor", "Valor")
            .map(|p| {
                let dir = p.data_dir();
                let _ = std::fs::create_dir_all(dir);
                dir.join("valor.db")
            })
            .unwrap_or_else(|| PathBuf::from("valor.db"));

        let db = Database::open(&db_path).unwrap_or_else(|_| Database::in_memory().unwrap());
        let settings = Settings::load().unwrap_or_default();
        let thumbnail_mgr = ThumbnailManager::new();

        let player = Arc::new(PlayerEngine::new(None).expect("Failed to initialize mpv engine"));

        let raw_mpv = player.raw_handle();
        let render_ctx =
            valor_player::RenderGlContext::new(raw_mpv, get_proc_address, std::ptr::null_mut())
                .expect("Failed to create mpv OpenGL render context");

        let egui_ctx = Box::new(cc.egui_ctx.clone());
        let raw_ctx_ptr = Box::into_raw(egui_ctx);

        unsafe extern "C" fn on_mpv_update(ctx: *mut std::ffi::c_void) {
            let egui_ctx = &*(ctx as *const egui::Context);
            egui_ctx.request_repaint();
        }

        render_ctx.set_update_callback(Some(on_mpv_update), raw_ctx_ptr as *mut std::ffi::c_void);

        let mut compositor = GlassCompositor::new();
        let blur_active = !disable_blur && settings.glass_blur_enabled;
        compositor.set_blur_enabled(blur_active);
        let glass_compositor = Arc::new(Mutex::new(compositor));

        let sample_candidates = [
            r"C:\Users\Admin\Downloads\MobLand.2025.S02E09.Nervous.Breakdown.2160p.ATV.WEB-DL.DUAL.DD5.1.H.265-Spidey.mkv",
            r"C:\Users\Admin\Downloads\Video\In The Grey (2026) 2160p 10bit UHD BluRay HDR10 x265 HEVC [Hindi AMZN DDP 5.1 + English TrueHD Atmos 7.1] ESub  TDP  SPHD.mkv",
            r"C:\Users\Admin\Downloads\By Any Means (2026) English 1080p WEB-DL ESub [BollyFlix].mkv",
            r"C:\Users\Admin\Downloads\Video\Ackella Webcam Model Profile - Omg Adult.mp4",
        ];

        let mut playlist_items = Vec::new();
        for candidate in sample_candidates {
            if Path::new(candidate).exists() {
                let parsed = parse_media_filename(candidate);
                let is_hdr = candidate.contains("2160p") || candidate.contains("HDR");
                let item = MediaItem {
                    id: format!("item_{}", playlist_items.len() + 1),
                    fingerprint: format!("fp_{}", playlist_items.len() + 1),
                    file_path: candidate.to_string(),
                    title: parsed.title,
                    duration: 3081.0,
                    size_bytes: 4_500_000_000,
                    width: if is_hdr { Some(3840) } else { Some(1920) },
                    height: if is_hdr { Some(2160) } else { Some(1080) },
                    is_hdr,
                    video_codec: Some(if is_hdr {
                        "HEVC".into()
                    } else {
                        "H.264".into()
                    }),
                    audio_codec: Some("E-AC-3 5.1".into()),
                    series_id: None,
                    season_number: parsed.season.or(Some(1)),
                    episode_number: parsed.episode.or(Some((playlist_items.len() + 1) as u32)),
                    is_missing: false,
                    created_at: Utc::now(),
                    updated_at: Utc::now(),
                };
                let _ = db.upsert_item(&item);
                playlist_items.push(item);
            }
        }

        let ass_path = r"C:\Users\Admin\valor\valor\sample_subtitle.ass";
        if Path::new(ass_path).exists() {
            let _ = player.add_external_subtitle(ass_path);
        }

        let collection_name = "Devs".to_string();
        let coll = Collection {
            id: "coll_devs".to_string(),
            name: collection_name.clone(),
            collection_type: "playlist".to_string(),
            item_ids: playlist_items.iter().map(|i| i.id.clone()).collect(),
            current_index: 0,
            last_played_at: Some(Utc::now()),
            is_pinned: true,
        };
        let _ = db.save_collection(&coll);

        let all_items = db.get_all_items().unwrap_or_default();
        let all_collections = db.get_all_collections().unwrap_or_default();
        let history_entries = db.get_history(20).unwrap_or_default();

        let mut initial_bookmarks = Vec::new();
        let mut resume_toast = None;
        if let Some(first_item) = playlist_items.first() {
            info!("Loading initial playlist item: {}", first_item.file_path);
            let resume = db
                .get_playback_position(&first_item.fingerprint)
                .ok()
                .flatten();
            let start_secs = resume.map(|p| p.position_secs).unwrap_or(0.0);
            let _ = player.load_file(&first_item.file_path, &first_item.fingerprint, start_secs);
            if start_secs > 10.0 {
                resume_toast = Some((start_secs, 10.0));
            }
            update_os_power_state(true);

            let sample_b1 = Bookmark {
                id: "b1".into(),
                fingerprint: first_item.fingerprint.clone(),
                title: "Intro".into(),
                start_secs: 101.0,
                end_secs: Some(114.0),
                category: "intro".into(),
                created_at: Utc::now(),
            };
            let sample_b2 = Bookmark {
                id: "b2".into(),
                fingerprint: first_item.fingerprint.clone(),
                title: "Credits / Outro".into(),
                start_secs: 3002.0,
                end_secs: Some(3081.0),
                category: "credits".into(),
                created_at: Utc::now(),
            };
            let _ = db.save_bookmark(&sample_b1);
            let _ = db.save_bookmark(&sample_b2);
            initial_bookmarks = db
                .get_bookmarks(&first_item.fingerprint)
                .unwrap_or_default();
        }

        Self {
            current_view: AppView::Player,
            player,
            render_gl: Arc::new(Mutex::new(Some(render_ctx))),
            glass_compositor,
            db,
            _settings: settings,
            _thumbnail_mgr: thumbnail_mgr,
            theme: ValorTheme::default(),
            collection_name,
            playlist_items,
            current_playlist_index: 0,
            ui_state: VideoUiState::default(),
            playlist_state: PlaylistDrawerState::default(),
            context_menu_state: None,
            bookmarks_state: BookmarksModalState::default(),
            enhancement_state: EnhancementStudioState::default(),
            dashboard_state: DashboardState::default(),
            playback_state: PlaybackState::default(),
            is_playing: true,
            hold_g: HoldGStateMachine::new(),
            auto_next_countdown: None,
            finished_countdown: None,
            last_position_saved: Instant::now(),
            last_mouse_activity: Instant::now(),
            resume_toast,
            chapters: Vec::new(),
            _keymap: KeymapManager::new(),
            _pip_active: false,
            ipc_receiver,
            current_bookmarks: initial_bookmarks,
            all_items,
            all_collections,
            history_entries,
            track_prefs_mgr: TrackPreferencesManager::new(),
            current_audio_delay: 0.0,
            current_sub_delay: 0.0,
            ab_loop_a: None,
            ab_loop_b: None,
        }
    }

    #[allow(dead_code)]
    pub fn rebind_key(&mut self, action_id: &str, key: &str) -> Result<(), String> {
        if let Some(conflict) = self._keymap.detect_conflict(action_id, key) {
            Err(format!(
                "Shortcut '{}' conflicts with action '{}'",
                key, conflict
            ))
        } else {
            self._keymap.rebind(action_id, key)
        }
    }

    pub fn pick_and_open_file(&mut self) {
        if let Some(path) = rfd::FileDialog::new()
            .add_filter(
                "Media Files",
                &[
                    "mkv", "mp4", "m4v", "avi", "mov", "webm", "flv", "ts", "wmv", "mp3", "flac",
                    "wav", "aac", "m4a", "opus", "ogg",
                ],
            )
            .pick_file()
        {
            self.enqueue_paths(&[path]);
        }
    }

    pub fn enqueue_paths(&mut self, paths: &[PathBuf]) {
        let mut expanded = Vec::new();
        for p in paths {
            expand_single_path(p, &mut expanded);
        }
        if expanded.is_empty() {
            return;
        }

        let is_single_file = paths.len() == 1 && expanded.len() == 1;

        for p in &expanded {
            let path_str = p.to_string_lossy().to_string();
            if path_str.ends_with(".ass")
                || path_str.ends_with(".srt")
                || path_str.ends_with(".vtt")
            {
                let _ = self.player.add_external_subtitle(&path_str);
            } else {
                let fingerprint = match compute_fingerprint(p) {
                    Ok(fp) => fp,
                    Err(_) => format!("fp_{}", Utc::now().timestamp_nanos_opt().unwrap_or(0)),
                };

                let existing = self
                    .db
                    .find_item_by_fingerprint(&fingerprint)
                    .ok()
                    .flatten();

                let item = if let Some(mut it) = existing {
                    it.file_path = path_str;
                    let _ = self.db.upsert_item(&it);
                    it
                } else {
                    let parsed = parse_media_filename(&path_str);
                    let item = MediaItem {
                        id: format!("item_{}", Utc::now().timestamp_nanos_opt().unwrap_or(0)),
                        fingerprint,
                        file_path: path_str,
                        title: parsed.title,
                        duration: 0.0,
                        size_bytes: std::fs::metadata(p).map(|m| m.len()).unwrap_or(0),
                        width: Some(1920),
                        height: Some(1080),
                        is_hdr: false,
                        video_codec: None,
                        audio_codec: None,
                        series_id: None,
                        season_number: parsed.season,
                        episode_number: parsed.episode,
                        is_missing: false,
                        created_at: Utc::now(),
                        updated_at: Utc::now(),
                    };
                    let _ = self.db.upsert_item(&item);
                    item
                };

                if is_single_file {
                    self.collection_name = item.title.clone();
                    self.playlist_items = vec![item];
                } else {
                    self.playlist_items.push(item);
                }
            }
        }

        if !self.playlist_items.is_empty() {
            let target_idx = if is_single_file {
                0
            } else {
                self.playlist_items.len() - 1
            };
            self.play_playlist_item(target_idx);
            self.current_view = AppView::Player;
        }
    }

    pub fn play_playlist_item(&mut self, index: usize) {
        if index >= self.playlist_items.len() {
            return;
        }

        self.persist_current_position(false);

        self.current_playlist_index = index;
        let item = &self.playlist_items[index];

        // 1. Auto-discover external sidecar subtitles (.srt, .ass, .vtt) in same folder
        let sidecar_subs = find_sidecar_subtitles(&item.file_path);
        for sub_path in sidecar_subs {
            if let Some(s) = sub_path.to_str() {
                let _ = self.player.add_external_subtitle(s);
            }
        }

        // 2. Apply Carried Track Preferences across playlist/series
        let carried = self.track_prefs_mgr.get(&self.collection_name);
        let _ = self.player.set_sub_font_size(carried.style.font_size);
        let _ = self.player.set_sub_color(&carried.style.text_color);
        let _ = self
            .player
            .set_sub_ass_override(if carried.style.ass_override {
                "yes"
            } else {
                "no"
            });
        let _ = self.player.set_subtitle_delay(carried.sub_offset_secs);
        let _ = self.player.set_audio_delay(carried.audio_offset_secs);
        self.current_sub_delay = carried.sub_offset_secs;
        self.current_audio_delay = carried.audio_offset_secs;

        // 3. Zero-click resume calculation: saved position or start from 0 if completed / remaining < 15s
        let resume = self
            .db
            .get_playback_position(&item.fingerprint)
            .ok()
            .flatten();

        let mut start_secs = 0.0;
        if let Some(pos) = resume {
            let is_near_completion =
                pos.duration_secs > 30.0 && (pos.duration_secs - pos.position_secs) <= 15.0;
            if !pos.completed && !is_near_completion && pos.position_secs > 0.0 {
                start_secs = pos.position_secs;
            }
        }

        info!(
            "Switching to playlist item #{}: {} (resume: {}s)",
            index, item.title, start_secs
        );
        let _ = self
            .player
            .load_file(&item.file_path, &item.fingerprint, start_secs);
        self.is_playing = true;
        self.auto_next_countdown = None;
        self.finished_countdown = None;

        if start_secs > 10.0 {
            self.resume_toast = Some((start_secs, 10.0));
        } else {
            self.resume_toast = None;
        }
        update_os_power_state(true);

        self.current_bookmarks = self.db.get_bookmarks(&item.fingerprint).unwrap_or_default();

        // 4. Track auto-selection based on carried language preferences
        if let Ok(tracks) = self.player.get_tracks() {
            let target_audio = carried
                .audio_lang
                .as_deref()
                .unwrap_or(&self._settings.default_audio_lang);
            if let Some(matched_audio) = find_preferred_track(&tracks, target_audio, "audio") {
                let _ = self.player.set_track("audio", matched_audio.id);
            }

            let target_sub = carried
                .sub_lang
                .as_deref()
                .unwrap_or(&self._settings.default_sub_lang);
            if target_sub.eq_ignore_ascii_case("off") {
                let _ = self.player.set_track("sub", 0);
            } else if let Some(matched_sub) = find_preferred_track(&tracks, target_sub, "sub") {
                let _ = self.player.set_track("sub", matched_sub.id);
            }
        }

        // 5. Save Collection: Single file creates/updates a collection of 1; history tracks it identically
        let is_single = self.playlist_items.len() == 1;
        let coll_id = if is_single {
            format!("coll_single_{}", item.fingerprint)
        } else {
            format!("coll_{}", self.collection_name.to_lowercase())
        };

        let coll = Collection {
            id: coll_id,
            name: self.collection_name.clone(),
            collection_type: if is_single {
                "single".to_string()
            } else {
                "playlist".to_string()
            },
            item_ids: self.playlist_items.iter().map(|i| i.id.clone()).collect(),
            current_index: index,
            last_played_at: Some(Utc::now()),
            is_pinned: !is_single,
        };
        let _ = self.db.save_collection(&coll);
    }

    pub fn persist_current_position(&mut self, completed_flag: bool) {
        if let Some(fp) = &self.playback_state.current_fingerprint {
            let is_completed = completed_flag
                || (self.playback_state.duration_secs > 30.0
                    && (self.playback_state.duration_secs - self.playback_state.position_secs)
                        <= 15.0);

            let pos = PlaybackPosition {
                fingerprint: fp.clone(),
                position_secs: if is_completed {
                    0.0
                } else {
                    self.playback_state.position_secs
                },
                duration_secs: self.playback_state.duration_secs,
                completed: is_completed,
                updated_at: Utc::now(),
            };
            let _ = self.db.save_playback_position(&pos);
            self.last_position_saved = Instant::now();
        }
    }
}

impl eframe::App for ValorNativeApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        let screen_rect = ui.max_rect();

        // 1. Process any incoming validated file paths from IPC single instance
        if let Some(ref rx) = self.ipc_receiver {
            let mut incoming = Vec::new();
            while let Ok(path) = rx.try_recv() {
                incoming.push(path);
            }
            if !incoming.is_empty() {
                self.enqueue_paths(&incoming);
            }
        }

        // 2. Refresh live mpv playback metrics and chapters
        self.playback_state = self.player.update_tick();
        self.is_playing = self.playback_state.status == PlaybackStatus::Playing;
        self.chapters = self.player.get_chapters();

        if self.last_position_saved.elapsed().as_secs() >= 5 {
            self.persist_current_position(false);
        }

        let pointer_delta = ctx.input(|i| i.pointer.delta());
        let pointer_any_click = ctx.input(|i| i.pointer.any_click());
        let has_input_events = ctx.input(|i| !i.events.is_empty());
        if pointer_delta != Vec2::ZERO || pointer_any_click || has_input_events {
            self.last_mouse_activity = Instant::now();
        }

        // 3. Handle Global Keyboard Hotkeys
        ctx.input(|i| {
            if i.key_pressed(egui::Key::Space) || i.key_pressed(egui::Key::K) {
                if let Ok(is_paused) = self.player.toggle_pause() {
                    self.is_playing = !is_paused;
                    update_os_power_state(self.is_playing);
                }
            }

            if i.key_pressed(egui::Key::ArrowLeft) || i.key_pressed(egui::Key::J) {
                let _ = self.player.seek_relative(-10.0);
            }
            if i.key_pressed(egui::Key::ArrowRight) || i.key_pressed(egui::Key::L) {
                let _ = self.player.seek_relative(10.0);
            }

            if i.key_pressed(egui::Key::ArrowUp) {
                let new_vol = (self.playback_state.volume + 0.05).min(2.0);
                let _ = self.player.set_volume(new_vol);
            }
            if i.key_pressed(egui::Key::ArrowDown) {
                let new_vol = (self.playback_state.volume - 0.05).max(0.0);
                let _ = self.player.set_volume(new_vol);
            }

            let num_keys = [
                (egui::Key::Num0, 0.0),
                (egui::Key::Num1, 0.1),
                (egui::Key::Num2, 0.2),
                (egui::Key::Num3, 0.3),
                (egui::Key::Num4, 0.4),
                (egui::Key::Num5, 0.5),
                (egui::Key::Num6, 0.6),
                (egui::Key::Num7, 0.7),
                (egui::Key::Num8, 0.8),
                (egui::Key::Num9, 0.9),
            ];
            for (key, frac) in num_keys {
                if i.key_pressed(key) && self.playback_state.duration_secs > 0.0 {
                    let _ = self.player.seek(self.playback_state.duration_secs * frac);
                }
            }

            if i.key_pressed(egui::Key::F) {
                let full = ui.input(|inp| inp.viewport().fullscreen.unwrap_or(false));
                ui.ctx()
                    .send_viewport_cmd(egui::ViewportCommand::Fullscreen(!full));
            }
            if i.key_pressed(egui::Key::Escape) {
                if self.context_menu_state.is_some() {
                    self.context_menu_state = None;
                } else if self.playlist_state.is_open {
                    self.playlist_state.is_open = false;
                } else if self.bookmarks_state.is_open {
                    self.bookmarks_state.is_open = false;
                } else if self.enhancement_state.is_open {
                    self.enhancement_state.is_open = false;
                } else {
                    ui.ctx()
                        .send_viewport_cmd(egui::ViewportCommand::Fullscreen(false));
                }
            }

            if i.key_pressed(egui::Key::M) {
                let _ = self.player.set_mute(!self.playback_state.is_muted);
            }

            if i.key_pressed(egui::Key::C) {
                let _ = self.player.set_track(
                    "sub",
                    if self.ui_state.active_dock_tiles[3] {
                        0
                    } else {
                        1
                    },
                );
                self.ui_state.active_dock_tiles[3] = !self.ui_state.active_dock_tiles[3];
            }

            if i.key_pressed(egui::Key::OpenBracket) {
                let new_spd = (self.playback_state.speed - 0.1).clamp(0.25, 4.0);
                let _ = self.player.set_speed(new_spd);
            }
            if i.key_pressed(egui::Key::CloseBracket) {
                let new_spd = (self.playback_state.speed + 0.1).clamp(0.25, 4.0);
                let _ = self.player.set_speed(new_spd);
            }
            if i.key_pressed(egui::Key::Backspace) {
                let _ = self.player.set_speed(1.0);
            }

            if i.modifiers.shift
                && i.key_pressed(egui::Key::N)
                && self.current_playlist_index + 1 < self.playlist_items.len()
            {
                self.play_playlist_item(self.current_playlist_index + 1);
            }
            if i.modifiers.shift && i.key_pressed(egui::Key::P) && self.current_playlist_index > 0 {
                self.play_playlist_item(self.current_playlist_index - 1);
            }

            if i.key_pressed(egui::Key::E) || i.key_pressed(egui::Key::Period) {
                let _ = self.player.frame_step();
            }
            if i.key_pressed(egui::Key::D) || i.key_pressed(egui::Key::Comma) {
                let _ = self.player.frame_back_step();
            }

            if i.key_pressed(egui::Key::I) {
                let stats = self.player.get_debug_stats();
                info!("Debug Stats: {:?}", stats);
            }

            if i.key_pressed(egui::Key::S) {
                info!("Triggering Video Snapshot");
            }

            if i.key_pressed(egui::Key::B) {
                let current_boost = self.playback_state.audio_boost_tier;
                let next_boost = match current_boost {
                    100 => 150,
                    150 => 200,
                    _ => 100,
                };
                let _ = self.player.set_audio_boost(next_boost);
            }

            // Audio Delay (+/- 50ms, bounds: -5.0s .. +5.0s)
            if i.key_pressed(egui::Key::Z) {
                self.current_audio_delay = (self.current_audio_delay - 0.05).clamp(-5.0, 5.0);
                let _ = self.player.set_audio_delay(self.current_audio_delay);
                self.track_prefs_mgr.update(&self.collection_name, |p| {
                    p.audio_offset_secs = self.current_audio_delay;
                });
                info!("Audio Delay: {:.3}s", self.current_audio_delay);
            }
            if i.key_pressed(egui::Key::X) {
                self.current_audio_delay = (self.current_audio_delay + 0.05).clamp(-5.0, 5.0);
                let _ = self.player.set_audio_delay(self.current_audio_delay);
                self.track_prefs_mgr.update(&self.collection_name, |p| {
                    p.audio_offset_secs = self.current_audio_delay;
                });
                info!("Audio Delay: {:.3}s", self.current_audio_delay);
            }

            // Subtitle Delay (+/- 50ms, bounds: -5.0s .. +5.0s)
            if i.key_pressed(egui::Key::Minus) {
                self.current_sub_delay = (self.current_sub_delay - 0.05).clamp(-5.0, 5.0);
                let _ = self.player.set_subtitle_delay(self.current_sub_delay);
                self.track_prefs_mgr.update(&self.collection_name, |p| {
                    p.sub_offset_secs = self.current_sub_delay;
                });
                info!("Subtitle Delay: {:.3}s", self.current_sub_delay);
            }
            if i.key_pressed(egui::Key::Equals) {
                self.current_sub_delay = (self.current_sub_delay + 0.05).clamp(-5.0, 5.0);
                let _ = self.player.set_subtitle_delay(self.current_sub_delay);
                self.track_prefs_mgr.update(&self.collection_name, |p| {
                    p.sub_offset_secs = self.current_sub_delay;
                });
                info!("Subtitle Delay: {:.3}s", self.current_sub_delay);
            }

            // A-B Loop (Set A -> Set B -> Clear)
            if i.key_pressed(egui::Key::R) {
                if self.ab_loop_a.is_none() {
                    self.ab_loop_a = Some(self.playback_state.position_secs);
                    let _ = self.player.set_ab_loop_a(self.ab_loop_a);
                    info!(
                        "A-B Loop: Point A set at {:.2}s",
                        self.playback_state.position_secs
                    );
                } else if self.ab_loop_b.is_none() {
                    self.ab_loop_b = Some(self.playback_state.position_secs);
                    let _ = self.player.set_ab_loop_b(self.ab_loop_b);
                    info!(
                        "A-B Loop: Point B set at {:.2}s (Loop Active)",
                        self.playback_state.position_secs
                    );
                } else {
                    self.ab_loop_a = None;
                    self.ab_loop_b = None;
                    let _ = self.player.clear_ab_loop();
                    info!("A-B Loop: Cleared");
                }
            }

            // Chapter Jump (PageDown -> Next Chapter, PageUp -> Prev Chapter)
            if i.key_pressed(egui::Key::PageDown) {
                let cur = self.playback_state.position_secs;
                if let Some(ch) = self.chapters.iter().find(|c| c.start_secs > cur + 0.5) {
                    let _ = self.player.seek(ch.start_secs);
                }
            }
            if i.key_pressed(egui::Key::PageUp) {
                let cur = self.playback_state.position_secs;
                if let Some(ch) = self
                    .chapters
                    .iter()
                    .rev()
                    .find(|c| c.start_secs < cur - 1.0)
                {
                    let _ = self.player.seek(ch.start_secs);
                } else {
                    let _ = self.player.seek(0.0);
                }
            }

            if i.modifiers.ctrl && i.key_pressed(egui::Key::O) {
                self.pick_and_open_file();
            }

            let g_down = i.key_down(egui::Key::G);
            let now = Instant::now();
            let is_focused = i.focused;

            if !is_focused {
                if let Some(restored) = self.hold_g.on_focus_lost(now) {
                    self.ui_state.is_peeking = false;
                    self.ui_state.is_ui_visible = restored.controls_visible;
                    self.ui_state.is_dock_collapsed = !restored.dock_open;
                }
            } else if g_down {
                let current_snapshot = SavedUiSnapshot {
                    controls_visible: self.ui_state.is_ui_visible,
                    dock_open: !self.ui_state.is_dock_collapsed,
                    drawer_open: self.playlist_state.is_open,
                };
                self.hold_g.on_key_down(now, current_snapshot);
                if self.hold_g.update(now) {
                    self.ui_state.is_peeking = true;
                }
            } else if let Some(restored) = self.hold_g.on_key_up(now) {
                self.ui_state.is_peeking = false;
                self.ui_state.is_ui_visible = restored.controls_visible;
                self.ui_state.is_dock_collapsed = !restored.dock_open;
            }
        });

        // Handle native drag & drop of media files/folders
        let dropped_files: Vec<PathBuf> = ctx.input(|i| {
            i.raw
                .dropped_files
                .iter()
                .map(|f| f.path().to_path_buf())
                .collect()
        });
        if !dropped_files.is_empty() {
            info!("Received dropped files: {:?}", dropped_files);
            self.enqueue_paths(&dropped_files);
        }

        // ==========================================
        // VIEW SWITCHING: DASHBOARD vs PLAYER
        // ==========================================
        if self.current_view == AppView::Dashboard {
            let dash_act = render_dashboard(
                ui,
                &self.theme,
                screen_rect,
                &self.all_items,
                &self.all_collections,
                &self.history_entries,
                &mut self.dashboard_state,
            );

            if let Some(act) = dash_act {
                match act {
                    DashboardAction::PlayItem(item) => {
                        self.playlist_items = vec![item];
                        self.current_playlist_index = 0;
                        self.play_playlist_item(0);
                        self.current_view = AppView::Player;
                    }
                    DashboardAction::ResumeHistory(_entry) => {
                        self.current_view = AppView::Player;
                    }
                    DashboardAction::PlayCollection(coll) => {
                        self.collection_name = coll.name.clone();
                        self.current_playlist_index = coll.current_index;
                        self.current_view = AppView::Player;
                    }
                    DashboardAction::StartScan => {
                        let downloads = r"C:\Users\Admin\Downloads";
                        let cancel_flag = Arc::new(AtomicBool::new(false));
                        let pause_flag = Arc::new(AtomicBool::new(false));
                        let _ = scan_directory(
                            Path::new(downloads),
                            &self.db,
                            cancel_flag,
                            pause_flag,
                            |_| {},
                        );
                        self.all_items = self.db.get_all_items().unwrap_or_default();
                    }
                    DashboardAction::SwitchToPlayer => {
                        self.current_view = AppView::Player;
                    }
                    _ => {}
                }
            }
            return;
        }

        // ==========================================
        // RENDER VIEW: PLAYER
        // ==========================================

        // 1. OpenGL Custom Paint: render mpv frame with GlassCompositor
        let width = screen_rect.width() as i32;
        let height = screen_rect.height() as i32;
        let render_gl_clone = self.render_gl.clone();
        let compositor_clone = self.glass_compositor.clone();
        let callback = egui_glow::CallbackFn::new(move |_info, _painter| {
            if let Some(render_ctx) = render_gl_clone.lock().as_ref() {
                compositor_clone
                    .lock()
                    .render_frame(render_ctx, width, height);
            }
        });

        ui.painter().add(egui::PaintCallback {
            rect: screen_rect,
            callback: Arc::new(callback),
        });

        // Background click handler
        let bg_resp = ui.allocate_rect(screen_rect, Sense::click_and_drag());

        if bg_resp.double_clicked() {
            let full = ui.input(|inp| inp.viewport().fullscreen.unwrap_or(false));
            ui.ctx()
                .send_viewport_cmd(egui::ViewportCommand::Fullscreen(!full));
        } else if bg_resp.middle_clicked() {
            let _ = self.player.set_mute(!self.playback_state.is_muted);
        } else if bg_resp.secondary_clicked() {
            if let Some(pos) = ui.input(|i| i.pointer.hover_pos()) {
                self.context_menu_state = Some(ContextMenuState::new(pos));
            }
        } else if bg_resp.clicked()
            && self.context_menu_state.is_none()
            && !self.ui_state.is_peeking
        {
            if let Ok(is_paused) = self.player.toggle_pause() {
                self.is_playing = !is_paused;
                update_os_power_state(self.is_playing);
            }
        }

        let scroll_y = ui.input(|i| i.smooth_scroll_delta.y);
        if scroll_y.abs() > 0.5 && bg_resp.hovered() {
            let delta = if scroll_y > 0.0 { 0.05 } else { -0.05 };
            let new_vol = (self.playback_state.volume + delta).clamp(0.0, 2.0);
            let _ = self.player.set_volume(new_vol);
        }

        // 2. Hold-G Momentary Timeline Peek
        if self.ui_state.is_peeking {
            render_hold_g_peek(ui, &self.theme, &self.playback_state, screen_rect);
            return;
        }

        // 3. Pause Screen Overlay
        if !self.is_playing
            && self.ui_state.show_pause_card
            && !self.playlist_state.is_open
            && self.context_menu_state.is_none()
        {
            let active_item = self.playlist_items.get(self.current_playlist_index);
            let title = active_item
                .map(|i| i.title.as_str())
                .unwrap_or("Valor Native Player");
            let ep_info = active_item
                .and_then(|i| i.season_number.zip(i.episode_number))
                .map(|(s, e)| format!("Season {} • Episode {}", s, e))
                .unwrap_or_else(|| "Featured Film".into());

            render_pause_screen(
                ui,
                &self.theme,
                screen_rect,
                title,
                &ep_info,
                "Shaken by a secret, Jisun fights on as suspicions around Joonho put those around him in danger.",
            );
        }

        // 4. Calculate Rects for Autohide & Hover detection
        let bottom_bar_rect = Rect::from_min_max(
            Pos2::new(screen_rect.min.x, screen_rect.max.y - 100.0),
            screen_rect.max,
        );
        let top_bar_rect = Rect::from_min_max(
            screen_rect.min,
            Pos2::new(screen_rect.max.x, screen_rect.min.y + 60.0),
        );

        let mouse_pos = ctx.input(|i| i.pointer.hover_pos());
        let hovering_controls = mouse_pos.is_some_and(|p| {
            bottom_bar_rect.contains(p)
                || top_bar_rect.contains(p)
                || !self.ui_state.is_dock_collapsed
                || self.playlist_state.is_open
                || self.bookmarks_state.is_open
                || self.enhancement_state.is_open
                || self.context_menu_state.is_some()
        });

        let idle_time = self.last_mouse_activity.elapsed().as_secs_f32();
        let should_autohide = self.is_playing
            && idle_time > 2.0
            && !hovering_controls
            && !self.ui_state.is_ui_visible;

        if should_autohide {
            ctx.set_cursor_icon(egui::CursorIcon::None);
        } else {
            ctx.set_cursor_icon(egui::CursorIcon::Default);
        }

        // 5. Render Top Info Bar
        if !should_autohide {
            let active_item = self.playlist_items.get(self.current_playlist_index);
            let display_title = active_item
                .map(|i| {
                    if let (Some(s), Some(e)) = (i.season_number, i.episode_number) {
                        format!(
                            "{} - S{:02}E{:02} - {}",
                            self.collection_name, s, e, i.title
                        )
                    } else {
                        i.title.clone()
                    }
                })
                .unwrap_or_else(|| "Valor Native Player".to_string());

            let top_bg = Color32::from_black_alpha(160);
            ui.painter()
                .rect_filled(top_bar_rect, CornerRadius::ZERO, top_bg);

            ui.allocate_ui(top_bar_rect.size(), |ui| {
                ui.horizontal_centered(|ui| {
                    ui.add_space(16.0);
                    if ui
                        .add(egui::Button::new("←").fill(Color32::TRANSPARENT))
                        .clicked()
                    {
                        self.current_view = AppView::Dashboard;
                    }

                    ui.add_space(8.0);
                    ui.colored_label(Color32::WHITE, &display_title);

                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        ui.add_space(16.0);
                        let pl_count = self.playlist_items.len();
                        let pl_btn = ui.add(
                            egui::Button::new(format!("☰ ({})", pl_count))
                                .fill(Color32::from_white_alpha(30)),
                        );
                        if pl_btn.clicked() {
                            self.playlist_state.is_open = !self.playlist_state.is_open;
                        }

                        let pip_btn =
                            ui.add(egui::Button::new("⧉ PiP").fill(Color32::from_white_alpha(30)));
                        if pip_btn.clicked() {
                            self._pip_active = !self._pip_active;
                            let new_level = if self._pip_active {
                                egui::WindowLevel::AlwaysOnTop
                            } else {
                                egui::WindowLevel::Normal
                            };
                            ui.ctx()
                                .send_viewport_cmd(egui::ViewportCommand::WindowLevel(new_level));
                        }
                    });
                });
            });
        }

        // 6. Floating Resume Prompt
        if let Some((resume_secs, ref mut timer)) = self.resume_toast {
            *timer -= ui.input(|i| i.unstable_dt as f64);
            if *timer <= 0.0 {
                self.resume_toast = None;
            } else {
                let resume_action =
                    render_resume_prompt(ui, &self.theme, screen_rect, resume_secs, *timer);
                if let Some(act) = resume_action {
                    match act {
                        ResumePromptAction::Resume => {
                            let _ = self.player.seek(resume_secs);
                            self.resume_toast = None;
                        }
                        ResumePromptAction::StartOver => {
                            let _ = self.player.seek(0.0);
                            self.resume_toast = None;
                        }
                        ResumePromptAction::Dismiss => {
                            self.resume_toast = None;
                        }
                    }
                }
            }
        }

        // 7. Context Menu
        if let Some(mut state) = self.context_menu_state.take() {
            let act = render_context_menu(ui, &self.theme, screen_rect, &mut state);
            if let Some(action) = act {
                match action {
                    ContextMenuAction::TogglePlay => {
                        let _ = self.player.toggle_pause();
                    }
                    ContextMenuAction::SeekRelative(delta) => {
                        let _ = self.player.seek_relative(delta);
                    }
                    ContextMenuAction::SetSpeed(spd) => {
                        let _ = self.player.set_speed(spd);
                    }
                    ContextMenuAction::SetAspectRatio(ratio) => {
                        let _ = self.player.set_aspect_ratio(&ratio);
                    }
                    ContextMenuAction::SetRotation(deg) => {
                        let _ = self.player.set_rotation(deg);
                    }
                    ContextMenuAction::SetAudioBoost(tier) => {
                        let _ = self.player.set_audio_boost(tier);
                    }
                    ContextMenuAction::SelectAudioTrack(id) => {
                        let _ = self.player.set_track("audio", id);
                        if let Ok(tracks) = self.player.get_tracks() {
                            if let Some(t) = tracks
                                .iter()
                                .find(|t| t.id == id && t.track_type == "audio")
                            {
                                self.track_prefs_mgr.update(&self.collection_name, |p| {
                                    p.audio_lang = t.lang.clone();
                                    p.audio_title = t.title.clone();
                                });
                            }
                        }
                    }
                    ContextMenuAction::SelectSubtitleTrack(id) => {
                        let _ = self.player.set_track("sub", id);
                        self.track_prefs_mgr.update(&self.collection_name, |p| {
                            if id == 0 {
                                p.sub_lang = Some("off".to_string());
                            } else if let Ok(tracks) = self.player.get_tracks() {
                                if let Some(t) =
                                    tracks.iter().find(|t| t.id == id && t.track_type == "sub")
                                {
                                    p.sub_lang = t.lang.clone();
                                    p.sub_title = t.title.clone();
                                }
                            }
                        });
                    }
                    ContextMenuAction::SetSubtitleDelay(delta) => {
                        self.current_sub_delay = (self.current_sub_delay + delta).clamp(-5.0, 5.0);
                        let _ = self.player.set_subtitle_delay(self.current_sub_delay);
                        self.track_prefs_mgr.update(&self.collection_name, |p| {
                            p.sub_offset_secs = self.current_sub_delay;
                        });
                    }
                    ContextMenuAction::SetAudioDelay(delta) => {
                        self.current_audio_delay =
                            (self.current_audio_delay + delta).clamp(-5.0, 5.0);
                        let _ = self.player.set_audio_delay(self.current_audio_delay);
                        self.track_prefs_mgr.update(&self.collection_name, |p| {
                            p.audio_offset_secs = self.current_audio_delay;
                        });
                    }
                    ContextMenuAction::SetToneMapping(mode) => {
                        let _ = self.player.set_tone_mapping(&mode);
                    }
                    ContextMenuAction::ToggleSubtitles => {
                        let _ = self.player.set_track("sub", 0);
                    }
                    ContextMenuAction::ToggleFullscreen => {
                        let full = ui.input(|inp| inp.viewport().fullscreen.unwrap_or(false));
                        ui.ctx()
                            .send_viewport_cmd(egui::ViewportCommand::Fullscreen(!full));
                    }
                    ContextMenuAction::OpenEnhancementStudio => {
                        self.enhancement_state.is_open = true;
                    }
                    ContextMenuAction::OpenBookmarks => {
                        self.bookmarks_state.is_open = true;
                    }
                    ContextMenuAction::OpenPlaylist => {
                        self.playlist_state.is_open = true;
                    }
                    ContextMenuAction::OpenDashboard => {
                        self.current_view = AppView::Dashboard;
                    }
                    ContextMenuAction::CopyTimestamp => {
                        ui.ctx()
                            .copy_text(format_time(self.playback_state.position_secs));
                    }
                    ContextMenuAction::CopyDebugInfo => {
                        let stats = self.player.get_debug_stats();
                        let blur_us = self.glass_compositor.lock().last_blur_duration_us;
                        let text = format!("{}\n• Glass Blur Pass: {} µs", stats, blur_us);
                        ui.ctx().copy_text(text);
                    }
                    ContextMenuAction::OpenFile => {
                        self.pick_and_open_file();
                    }
                    ContextMenuAction::OpenContainingFolder => {
                        if let Some(item) = self.playlist_items.get(self.current_playlist_index) {
                            if let Some(parent) = Path::new(&item.file_path).parent() {
                                #[cfg(windows)]
                                let _ = std::process::Command::new("explorer").arg(parent).spawn();
                                #[cfg(target_os = "macos")]
                                let _ = std::process::Command::new("open").arg(parent).spawn();
                                #[cfg(target_os = "linux")]
                                let _ = std::process::Command::new("xdg-open").arg(parent).spawn();
                            }
                        }
                    }
                    ContextMenuAction::Close => {}
                    _ => {}
                }
            } else {
                self.context_menu_state = Some(state);
            }
        }

        // 8. Bottom Controls
        if !should_autohide {
            let events = render_bottom_controls(
                ui,
                &self.theme,
                screen_rect,
                &self.playback_state,
                self.is_playing,
                &mut self.ui_state,
                &self.chapters,
            );

            if events.toggle_play {
                if let Ok(is_paused) = self.player.toggle_pause() {
                    self.is_playing = !is_paused;
                    update_os_power_state(self.is_playing);
                }
            }
            if let Some(target) = events.seek_target {
                let _ = self.player.seek(target);
            }
            if let Some(delta) = events.seek_relative {
                let _ = self.player.seek_relative(delta);
            }
            if let Some(vol) = events.set_volume {
                let _ = self.player.set_volume(vol);
            }
            if events.toggle_mute {
                let _ = self.player.set_mute(!self.playback_state.is_muted);
            }
            if let Some(spd) = events.set_speed {
                let _ = self.player.set_speed(spd);
            }
            if events.cycle_audio_boost {
                let current_boost = self.playback_state.audio_boost_tier;
                let next_boost = match current_boost {
                    100 => 150,
                    150 => 200,
                    _ => 100,
                };
                let _ = self.player.set_audio_boost(next_boost);
            }
            if events.cycle_audio_track {
                let audio_tracks: Vec<_> = self
                    .playback_state
                    .tracks
                    .iter()
                    .filter(|t| t.track_type == "audio")
                    .collect();
                if !audio_tracks.is_empty() {
                    let current_idx = audio_tracks.iter().position(|t| t.is_selected).unwrap_or(0);
                    let next_track = audio_tracks[(current_idx + 1) % audio_tracks.len()];
                    let _ = self.player.set_track("audio", next_track.id);
                    self.track_prefs_mgr.update(&self.collection_name, |p| {
                        p.audio_lang = next_track.lang.clone();
                        p.audio_title = next_track.title.clone();
                    });
                }
            }
            if events.cycle_subtitle_track {
                let sub_tracks: Vec<_> = self
                    .playback_state
                    .tracks
                    .iter()
                    .filter(|t| t.track_type == "sub")
                    .collect();
                if !sub_tracks.is_empty() {
                    let current_idx = sub_tracks.iter().position(|t| t.is_selected);
                    let next_id = match current_idx {
                        Some(idx) if idx + 1 < sub_tracks.len() => sub_tracks[idx + 1].id,
                        Some(_) => 0, // Cycle to Off
                        None => sub_tracks[0].id,
                    };
                    let _ = self.player.set_track("sub", next_id);
                    self.track_prefs_mgr.update(&self.collection_name, |p| {
                        if next_id == 0 {
                            p.sub_lang = Some("off".to_string());
                        } else if let Some(t) = sub_tracks.iter().find(|t| t.id == next_id) {
                            p.sub_lang = t.lang.clone();
                            p.sub_title = t.title.clone();
                        }
                    });
                }
            }
            if events.toggle_fullscreen {
                let full = ui.input(|inp| inp.viewport().fullscreen.unwrap_or(false));
                ui.ctx()
                    .send_viewport_cmd(egui::ViewportCommand::Fullscreen(!full));
            }
            if events.toggle_pip {
                self._pip_active = !self._pip_active;
                let new_level = if self._pip_active {
                    egui::WindowLevel::AlwaysOnTop
                } else {
                    egui::WindowLevel::Normal
                };
                ui.ctx()
                    .send_viewport_cmd(egui::ViewportCommand::WindowLevel(new_level));
            }
        }

        // 9. UI Settings Dock (16 Tiles)
        render_ui_settings_dock(ui, &self.theme, screen_rect, &mut self.ui_state);

        // 10. Auto-Next Countdown Card & Finished Card
        let is_near_end = self.playback_state.duration_secs > 0.0
            && (self.playback_state.duration_secs - self.playback_state.position_secs) <= 0.5
            && self.playback_state.status == PlaybackStatus::Playing;

        if is_near_end {
            let has_next = self.current_playlist_index + 1 < self.playlist_items.len();
            if has_next {
                if self.auto_next_countdown.is_none() {
                    self.auto_next_countdown = Some(5.0);
                }

                if let Some(ref mut count) = self.auto_next_countdown {
                    *count -= ui.input(|i| i.unstable_dt as f64).min(0.1);
                    let next_item = &self.playlist_items[self.current_playlist_index + 1];
                    let auto_act = render_auto_next_card(
                        ui,
                        &self.theme,
                        screen_rect,
                        &next_item.title,
                        *count,
                    );

                    if *count <= 0.0 || auto_act == Some(AutoNextAction::PlayNow) {
                        self.play_playlist_item(self.current_playlist_index + 1);
                    } else if auto_act == Some(AutoNextAction::Cancel) {
                        self.auto_next_countdown = None;
                    }
                }
            } else {
                if self.finished_countdown.is_none() {
                    self.persist_current_position(true);
                    ui.ctx()
                        .send_viewport_cmd(egui::ViewportCommand::Fullscreen(false));
                    self.finished_countdown = Some(5.0);
                }

                if let Some(ref mut count) = self.finished_countdown {
                    *count -= ui.input(|i| i.unstable_dt as f64).min(0.1);
                    let fin_act = render_finished_card(ui, &self.theme, screen_rect, *count);

                    if *count <= 0.0 || fin_act == Some(AutoNextAction::PlayNow) {
                        self.current_view = AppView::Dashboard;
                        self.finished_countdown = None;
                    } else if fin_act == Some(AutoNextAction::Cancel) {
                        self.finished_countdown = None;
                    }
                }
            }
        }

        // 11. Playlist Drawer
        let pl_action = render_playlist_drawer(
            ui,
            &self.theme,
            screen_rect,
            &self.collection_name,
            &self.playlist_items,
            self.current_playlist_index,
            &mut self.playlist_state,
        );

        if let Some(act) = pl_action {
            match act {
                PlaylistAction::SelectIndex(idx) => {
                    self.play_playlist_item(idx);
                }
                PlaylistAction::RemoveIndex(idx) => {
                    if idx < self.playlist_items.len() {
                        self.playlist_items.remove(idx);
                        if self.current_playlist_index >= self.playlist_items.len()
                            && !self.playlist_items.is_empty()
                        {
                            self.current_playlist_index = self.playlist_items.len() - 1;
                        }
                    }
                }
                PlaylistAction::MoveUp(idx) => {
                    if idx > 0 && idx < self.playlist_items.len() {
                        self.playlist_items.swap(idx, idx - 1);
                    }
                }
                PlaylistAction::MoveDown(idx) => {
                    if idx + 1 < self.playlist_items.len() {
                        self.playlist_items.swap(idx, idx + 1);
                    }
                }
                PlaylistAction::NaturalSort => {
                    self.playlist_items
                        .sort_by(|a, b| valor_player::collection::natural_cmp(&a.title, &b.title));
                }
                _ => {}
            }
        }

        // 12. Bookmarks Modal
        let bm_action = render_bookmarks_modal(
            ui,
            &self.theme,
            screen_rect,
            &self.current_bookmarks,
            self.playback_state.position_secs,
            &mut self.bookmarks_state,
        );

        if let Some(act) = bm_action {
            match act {
                BookmarkAction::AddCurrentTime => {
                    if let Some(item) = self.playlist_items.get(self.current_playlist_index) {
                        let new_bm = Bookmark {
                            id: format!("bm_{}", Utc::now().timestamp_millis()),
                            fingerprint: item.fingerprint.clone(),
                            title: format!(
                                "Scene @ {}",
                                format_time(self.playback_state.position_secs)
                            ),
                            start_secs: self.playback_state.position_secs,
                            end_secs: None,
                            category: "scene".into(),
                            created_at: Utc::now(),
                        };
                        let _ = self.db.save_bookmark(&new_bm);
                        self.current_bookmarks =
                            self.db.get_bookmarks(&item.fingerprint).unwrap_or_default();
                    }
                }
                BookmarkAction::SeekTo(target) => {
                    let _ = self.player.seek(target);
                }
                BookmarkAction::Delete(id) => {
                    let _ = self.db.delete_bookmark(&id);
                    if let Some(item) = self.playlist_items.get(self.current_playlist_index) {
                        self.current_bookmarks =
                            self.db.get_bookmarks(&item.fingerprint).unwrap_or_default();
                    }
                }
                _ => {}
            }
        }

        // 13. Video & Audio Enhancement Studio Modal
        let studio_action =
            render_enhancement_studio(ui, &self.theme, screen_rect, &mut self.enhancement_state);

        if let Some(act) = studio_action {
            match act {
                StudioAction::ApplyValues => {
                    let v = &self.enhancement_state.values;
                    let _ = self.player.set_brightness(v.brightness);
                    let _ = self.player.set_contrast(v.contrast);
                    let _ = self.player.set_saturation(v.saturation);
                    let _ = self.player.set_gamma(v.gamma);
                    let _ = self.player.set_hue(v.hue);
                    let _ = self.player.set_deband(v.deband);
                    let _ = self.player.set_scaler(&v.scaler);
                    let _ = self.player.set_audio_eq(&v.eq_gains);
                    let _ = self.player.set_dynaudnorm(v.dynaudnorm);
                    let _ = self.player.set_night_mode(v.night_mode);
                    let _ = self.player.set_dialogue_boost(v.dialogue_boost);
                    let _ = self.player.set_tone_mapping(&v.tone_mapping);
                }
                StudioAction::ResetDefaults => {
                    let _ = self.player.set_brightness(0);
                    let _ = self.player.set_contrast(0);
                    let _ = self.player.set_saturation(0);
                    let _ = self.player.set_gamma(0);
                    let _ = self.player.set_hue(0);
                    let _ = self.player.set_deband(false);
                    let _ = self.player.set_scaler("spline36");
                    let _ = self.player.set_audio_eq(&[0.0; 10]);
                    let _ = self.player.set_dynaudnorm(false);
                    let _ = self.player.set_night_mode(false);
                    let _ = self.player.set_dialogue_boost(false);
                    let _ = self.player.set_tone_mapping("auto");
                }
                StudioAction::Close => {
                    self.enhancement_state.is_open = false;
                }
            }
        }
    }

    fn on_exit(&mut self, _gl: Option<&eframe::glow::Context>) {
        info!("Valor exiting: saving current playback position");
        self.persist_current_position(false);
    }
}

impl Drop for ValorNativeApp {
    fn drop(&mut self) {
        self.persist_current_position(false);
    }
}

pub fn format_time(secs: f64) -> String {
    if secs <= 0.0 {
        return "00:00".to_string();
    }
    let total = secs as u64;
    let m = (total % 3600) / 60;
    let s = total % 60;
    let h = total / 3600;
    if h > 0 {
        format!("{}:{:02}:{:02}", h, m, s)
    } else {
        format!("{:02}:{:02}", m, s)
    }
}
