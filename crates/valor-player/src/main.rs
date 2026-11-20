use std::path::{Path, PathBuf};
use std::rc::Rc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use parking_lot::Mutex;
use slint::{ComponentHandle, ModelRc, VecModel};
use valor_db::{Database, MediaRecord};
use valor_engine::{probe_media, parse_subtitles, AudioEngine, SubtitleCue, StreamType};

slint::include_modules!();

#[derive(Clone, Debug)]
struct InternalAudioTrack {
    id: String,
    name: String,
    path: Option<PathBuf>,
}

#[derive(Clone, Debug)]
struct InternalSubTrack {
    id: String,
    name: String,
    cues: Vec<SubtitleCue>,
}

struct PlaybackState {
    current_time: f64,
    duration: f64,
    current_path: Option<PathBuf>,
    speed_index: usize,
    volume: f32,
    is_muted: bool,

    // Audio tracks (strictly deduplicated & single active selection)
    audio_tracks: Vec<InternalAudioTrack>,
    active_audio_id: String,

    // Subtitle tracks (strictly deduplicated, single active selection or Off)
    sub_tracks: Vec<InternalSubTrack>,
    active_sub_id: Option<String>,
    sub_font_size: i32,
    sub_color: String,
    sub_delay: f64,
}

impl Default for PlaybackState {
    fn default() -> Self {
        Self {
            current_time: 0.0,
            duration: 0.0,
            current_path: None,
            speed_index: 0,
            volume: 1.0,
            is_muted: false,
            audio_tracks: Vec::new(),
            active_audio_id: "default".to_string(),
            sub_tracks: Vec::new(),
            active_sub_id: None,
            sub_font_size: 20,
            sub_color: "#ffffff".to_string(),
            sub_delay: 0.0,
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();
    tracing::info!("Starting Valor Pure Rust Native Player");

    // Initialize local database
    let db_path = dirs_or_local_db_path();
    let db = match Database::open(&db_path) {
        Ok(db) => db,
        Err(e) => {
            tracing::warn!("Database fallback to in-memory: {}", e);
            Database::in_memory()?
        }
    };

    // Initialize Audio Engine
    let audio_engine = match AudioEngine::new() {
        Ok(engine) => {
            tracing::info!("Audio engine initialized successfully (WASAPI)");
            Some(Arc::new(engine))
        }
        Err(e) => {
            tracing::warn!("Audio output unavailable: {}", e);
            None
        }
    };

    let main_window = MainWindow::new()?;
    let handle = main_window.as_weak();

    let state = Arc::new(Mutex::new(PlaybackState::default()));
    let is_playing = Arc::new(AtomicBool::new(false));

    // Initialize empty UI models
    main_window.set_audio_tracks(ModelRc::from(Rc::new(VecModel::<TrackItem>::default())));
    main_window.set_sub_tracks(ModelRc::from(Rc::new(VecModel::<TrackItem>::default())));
    main_window.set_history_items(ModelRc::from(Rc::new(VecModel::<HistoryItem>::default())));

    // Play/Pause callback
    let is_playing_toggle = is_playing.clone();
    let audio_toggle = audio_engine.clone();
    let handle_toggle = handle.clone();
    main_window.on_toggle_play(move || {
        let current = is_playing_toggle.load(Ordering::SeqCst);
        let next = !current;
        is_playing_toggle.store(next, Ordering::SeqCst);

        if let Some(ref audio) = audio_toggle {
            if next {
                audio.resume();
            } else {
                audio.pause();
            }
        }

        if let Some(ui) = handle_toggle.upgrade() {
            ui.set_is_playing(next);
        }
    });

    // Step Forward (+5s)
    let state_fwd = state.clone();
    let handle_fwd = handle.clone();
    main_window.on_step_forward(move || {
        let mut st = state_fwd.lock();
        if st.duration > 0.0 {
            st.current_time = (st.current_time + 5.0).min(st.duration);
            let prog = (st.current_time / st.duration) as f32;
            let time_str = format!("{}/{}", format_seconds(st.current_time), format_seconds(st.duration));
            if let Some(ui) = handle_fwd.upgrade() {
                ui.set_progress(prog);
                ui.set_time_display(time_str.into());
            }
        }
    });

    // Step Backward (-5s)
    let state_bwd = state.clone();
    let handle_bwd = handle.clone();
    main_window.on_step_backward(move || {
        let mut st = state_bwd.lock();
        if st.duration > 0.0 {
            st.current_time = (st.current_time - 5.0).max(0.0);
            let prog = (st.current_time / st.duration) as f32;
            let time_str = format!("{}/{}", format_seconds(st.current_time), format_seconds(st.duration));
            if let Some(ui) = handle_bwd.upgrade() {
                ui.set_progress(prog);
                ui.set_time_display(time_str.into());
            }
        }
    });

    // Mute Toggle
    let state_mute = state.clone();
    let audio_mute = audio_engine.clone();
    let handle_mute = handle.clone();
    main_window.on_toggle_mute(move || {
        let mut st = state_mute.lock();
        st.is_muted = !st.is_muted;
        let effective_vol = if st.is_muted { 0.0 } else { st.volume };
        if let Some(ref audio) = audio_mute {
            audio.set_volume(effective_vol);
        }
        if let Some(ui) = handle_mute.upgrade() {
            ui.set_volume(effective_vol);
        }
    });

    // Speed Toggle (1.0x -> 1.25x -> 1.5x -> 2.0x -> 0.75x)
    let speeds = [1.0f32, 1.25, 1.5, 2.0, 0.75];
    let speed_labels = ["1.0x", "1.25x", "1.5x", "2.0x", "0.75x"];
    let state_speed = state.clone();
    let audio_speed = audio_engine.clone();
    let handle_speed = handle.clone();
    main_window.on_toggle_speed(move || {
        let mut st = state_speed.lock();
        st.speed_index = (st.speed_index + 1) % speeds.len();
        let spd = speeds[st.speed_index];
        let label = speed_labels[st.speed_index];
        if let Some(ref audio) = audio_speed {
            audio.set_speed(spd);
        }
        if let Some(ui) = handle_speed.upgrade() {
            ui.set_speed_label(label.into());
        }
    });

    // Open File
    let state_open = state.clone();
    let audio_open = audio_engine.clone();
    let is_playing_open = is_playing.clone();
    let handle_open = handle.clone();
    let db_open = db.clone();
    main_window.on_open_file(move || {
        let handle_inner = handle_open.clone();
        let db_inner = db_open.clone();
        let state_inner = state_open.clone();
        let audio_inner = audio_open.clone();
        let is_playing_inner = is_playing_open.clone();

        tokio::spawn(async move {
            let file = rfd::AsyncFileDialog::new()
                .add_filter("Video & Audio Files", &["mp4", "mkv", "webm", "avi", "mov", "ts", "mp3", "aac", "flac", "wav"])
                .add_filter("All Files", &["*"])
                .set_title("Open Media with Valor")
                .pick_file()
                .await;

            if let Some(file_handle) = file {
                let path = file_handle.path().to_path_buf();
                load_and_play_media(path, state_inner, audio_inner, is_playing_inner, handle_inner, db_inner, 0.0).await;
            }
        });
    });

    // Seek callback
    let state_seek = state.clone();
    let handle_seek = handle.clone();
    main_window.on_seek(move |val| {
        let mut st = state_seek.lock();
        if st.duration > 0.0 {
            st.current_time = (val as f64 * st.duration).clamp(0.0, st.duration);
            let time_str = format!("{}/{}", format_seconds(st.current_time), format_seconds(st.duration));
            if let Some(ui) = handle_seek.upgrade() {
                ui.set_progress(val);
                ui.set_time_display(time_str.into());
            }
        }
    });

    // Volume change
    let state_vol = state.clone();
    let audio_vol = audio_engine.clone();
    main_window.on_change_volume(move |vol| {
        let mut st = state_vol.lock();
        st.volume = vol;
        if !st.is_muted {
            if let Some(ref audio) = audio_vol {
                audio.set_volume(vol);
            }
        }
    });

    // Toggle Audio Menu (Popover)
    let handle_aud_menu = handle.clone();
    main_window.on_toggle_audio_menu(move || {
        if let Some(ui) = handle_aud_menu.upgrade() {
            let cur = ui.get_show_audio_sub_popover();
            ui.set_show_audio_sub_popover(!cur);
            ui.set_show_recent_panel(false);
        }
    });

    // Toggle Subtitle Menu (Popover)
    let handle_sub_menu = handle.clone();
    main_window.on_toggle_sub_menu(move || {
        if let Some(ui) = handle_sub_menu.upgrade() {
            let cur = ui.get_show_audio_sub_popover();
            ui.set_show_audio_sub_popover(!cur);
            ui.set_show_recent_panel(false);
        }
    });

    // Close Popovers
    let handle_close = handle.clone();
    main_window.on_close_popovers(move || {
        if let Some(ui) = handle_close.upgrade() {
            ui.set_show_audio_sub_popover(false);
            ui.set_show_recent_panel(false);
        }
    });

    // Toggle Fold
    let handle_fold = handle.clone();
    main_window.on_toggle_fold(move || {
        if let Some(ui) = handle_fold.upgrade() {
            let f = ui.get_is_folded();
            ui.set_is_folded(!f);
        }
    });

    // Select Audio Track (strictly mutually exclusive single selection)
    let state_sel_aud = state.clone();
    let audio_sel_aud = audio_engine.clone();
    let handle_sel_aud = handle.clone();
    main_window.on_select_audio_track(move |track_id| {
        let mut st = state_sel_aud.lock();
        let track_id_str = track_id.to_string();
        st.active_audio_id = track_id_str.clone();

        // Find track
        if let Some(track) = st.audio_tracks.iter().find(|t| t.id == track_id_str) {
            let track_name = track.name.clone();
            if let Some(ref path) = track.path {
                if let Some(ref audio) = audio_sel_aud {
                    let _ = audio.play_file(path);
                }
            } else if let Some(ref main_path) = st.current_path {
                if let Some(ref audio) = audio_sel_aud {
                    let _ = audio.play_file(main_path);
                }
            }

            if let Some(ui) = handle_sel_aud.upgrade() {
                ui.set_audio_track_label(track_name.into());
                refresh_audio_ui_model(&ui, &st.audio_tracks, &st.active_audio_id);
            }
        }
    });

    // Add External Audio File (+ File button)
    let state_add_aud = state.clone();
    let audio_add_aud = audio_engine.clone();
    let handle_add_aud = handle.clone();
    main_window.on_add_audio_file(move || {
        let state_inner = state_add_aud.clone();
        let audio_inner = audio_add_aud.clone();
        let handle_inner = handle_add_aud.clone();

        tokio::spawn(async move {
            let file = rfd::AsyncFileDialog::new()
                .add_filter("Audio Tracks", &["mp3", "aac", "flac", "wav", "m4a", "ogg", "ac3"])
                .set_title("Add External Audio Track")
                .pick_file()
                .await;

            if let Some(fh) = file {
                let path = fh.path().to_path_buf();
                let file_name = path
                    .file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Custom Audio".to_string());

                let track_id = format!("ext-aud-{}", hash_path(&path));
                let mut st = state_inner.lock();

                // Deduplicate: remove if already present
                st.audio_tracks.retain(|t| t.id != track_id);
                st.audio_tracks.push(InternalAudioTrack {
                    id: track_id.clone(),
                    name: format!("Ext: {}", file_name),
                    path: Some(path.clone()),
                });
                st.active_audio_id = track_id.clone();

                if let Some(ref audio) = audio_inner {
                    let _ = audio.play_file(&path);
                }

                let tracks_clone = st.audio_tracks.clone();
                let active_id_clone = st.active_audio_id.clone();
                let display_label = format!("Ext: {}", file_name);

                let _ = slint::invoke_from_event_loop(move || {
                    if let Some(ui) = handle_inner.upgrade() {
                        ui.set_audio_track_label(display_label.into());
                        refresh_audio_ui_model(&ui, &tracks_clone, &active_id_clone);
                    }
                });
            }
        });
    });

    // Subtitles: Off chip
    let state_sub_off = state.clone();
    let handle_sub_off = handle.clone();
    main_window.on_set_sub_off(move || {
        let mut st = state_sub_off.lock();
        st.active_sub_id = None;

        if let Some(ui) = handle_sub_off.upgrade() {
            ui.set_is_sub_off(true);
            ui.set_sub_track_label("Off".into());
            ui.set_active_subtitle_text("".into());
            refresh_sub_ui_model(&ui, &st.sub_tracks, &None);
        }
    });

    // Select Subtitle Track
    let state_sel_sub = state.clone();
    let handle_sel_sub = handle.clone();
    main_window.on_select_sub_track(move |track_id| {
        let mut st = state_sel_sub.lock();
        let track_id_str = track_id.to_string();
        st.active_sub_id = Some(track_id_str.clone());

        if let Some(track) = st.sub_tracks.iter().find(|t| t.id == track_id_str) {
            let name = track.name.clone();
            if let Some(ui) = handle_sel_sub.upgrade() {
                ui.set_is_sub_off(false);
                ui.set_sub_track_label(name.into());
                refresh_sub_ui_model(&ui, &st.sub_tracks, &st.active_sub_id);
            }
        }
    });

    // Add External Subtitle File (+ File button)
    let state_add_sub = state.clone();
    let handle_add_sub = handle.clone();
    main_window.on_add_sub_file(move || {
        let state_inner = state_add_sub.clone();
        let handle_inner = handle_add_sub.clone();

        tokio::spawn(async move {
            let file = rfd::AsyncFileDialog::new()
                .add_filter("Subtitle Files", &["srt", "vtt", "sub", "ass"])
                .set_title("Add External Subtitle Track")
                .pick_file()
                .await;

            if let Some(fh) = file {
                let path = fh.path().to_path_buf();
                let file_name = path
                    .file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Custom Subs".to_string());

                if let Ok(content) = std::fs::read_to_string(&path) {
                    let cues = parse_subtitles(&content);
                    let track_id = format!("ext-sub-{}", hash_path(&path));
                    let mut st = state_inner.lock();

                    // Deduplicate
                    st.sub_tracks.retain(|t| t.id != track_id);
                    st.sub_tracks.push(InternalSubTrack {
                        id: track_id.clone(),
                        name: file_name.clone(),
                        cues,
                    });
                    st.active_sub_id = Some(track_id.clone());

                    let tracks_clone = st.sub_tracks.clone();
                    let active_id_clone = st.active_sub_id.clone();

                    let _ = slint::invoke_from_event_loop(move || {
                        if let Some(ui) = handle_inner.upgrade() {
                            ui.set_is_sub_off(false);
                            ui.set_sub_track_label(file_name.into());
                            refresh_sub_ui_model(&ui, &tracks_clone, &active_id_clone);
                        }
                    });
                }
            }
        });
    });

    // Subtitle Style Customization Callbacks
    let state_sub_size = state.clone();
    let handle_sub_size = handle.clone();
    main_window.on_set_sub_font_size(move |size| {
        let mut st = state_sub_size.lock();
        st.sub_font_size = size;
        if let Some(ui) = handle_sub_size.upgrade() {
            ui.set_sub_font_size(size);
        }
    });

    let state_sub_col = state.clone();
    let handle_sub_col = handle.clone();
    main_window.on_set_sub_color(move |col| {
        let mut st = state_sub_col.lock();
        st.sub_color = col.to_string();
        if let Some(ui) = handle_sub_col.upgrade() {
            ui.set_sub_color(col);
        }
    });

    let state_sub_del = state.clone();
    let handle_sub_del = handle.clone();
    main_window.on_adjust_sub_delay(move |delta| {
        let mut st = state_sub_del.lock();
        if delta == 0.0 {
            st.sub_delay = 0.0;
        } else {
            st.sub_delay += delta as f64;
        }
        let label = format!("{:.1}s", st.sub_delay);
        if let Some(ui) = handle_sub_del.upgrade() {
            ui.set_sub_delay(st.sub_delay as f32);
            ui.set_sub_delay_label(label.into());
        }
    });

    // Toggle Recent Media History Drawer
    let handle_recent = handle.clone();
    let db_recent = db.clone();
    main_window.on_toggle_recent(move || {
        if let Some(ui) = handle_recent.upgrade() {
            let cur = ui.get_show_recent_panel();
            let next = !cur;
            ui.set_show_recent_panel(next);
            ui.set_show_audio_sub_popover(false);

            if next {
                if let Ok(history) = db_recent.list_history(10) {
                    let items: Vec<HistoryItem> = history
                        .into_iter()
                        .map(|rec| {
                            let dur_str = format_seconds(rec.duration);
                            let cur_str = format_seconds(rec.current_time);
                            let time_str = format!("{}/{}", cur_str, dur_str);
                            let prog = if rec.duration > 0.0 {
                                (rec.current_time / rec.duration) as f32
                            } else {
                                0.0
                            };
                            HistoryItem {
                                id: rec.id.into(),
                                title: rec.title.into(),
                                time_str: time_str.into(),
                                progress: prog,
                            }
                        })
                        .collect();
                    ui.set_history_items(ModelRc::from(Rc::new(VecModel::from(items))));
                }
            }
        }
    });

    // Play item from History
    let state_play_hist = state.clone();
    let audio_play_hist = audio_engine.clone();
    let is_playing_play_hist = is_playing.clone();
    let handle_play_hist = handle.clone();
    let db_play_hist = db.clone();
    main_window.on_play_history_item(move |item_id| {
        let db_inner = db_play_hist.clone();
        let state_inner = state_play_hist.clone();
        let audio_inner = audio_play_hist.clone();
        let is_playing_inner = is_playing_play_hist.clone();
        let handle_inner = handle_play_hist.clone();

        tokio::spawn(async move {
            if let Ok(Some(rec)) = db_inner.get_media(&item_id) {
                let path = PathBuf::from(&rec.file_path);
                if path.exists() {
                    load_and_play_media(path, state_inner, audio_inner, is_playing_inner, handle_inner, db_inner, rec.current_time).await;
                }
            }
        });
    });

    // Real-Time Playback Clock Ticker Task (updates seekbar and active subtitle text at 10Hz)
    let state_ticker = state.clone();
    let is_playing_ticker = is_playing.clone();
    let handle_ticker = handle.clone();
    let db_ticker = db.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_millis(100));
        let mut save_counter = 0;

        loop {
            interval.tick().await;

            if is_playing_ticker.load(Ordering::SeqCst) {
                let mut st = state_ticker.lock();
                if st.duration > 0.0 {
                    let step = 0.1 * speeds[st.speed_index] as f64;
                    st.current_time = (st.current_time + step).min(st.duration);

                    let prog = (st.current_time / st.duration) as f32;
                    let cur_str = format_seconds(st.current_time);
                    let dur_str = format_seconds(st.duration);
                    let time_display = format!("{} / {}", cur_str, dur_str);

                    // Find matching subtitle cue with sync delay applied
                    let effective_time = st.current_time + st.sub_delay;
                    let active_sub = if let Some(ref sub_id) = st.active_sub_id {
                        if let Some(track) = st.sub_tracks.iter().find(|t| &t.id == sub_id) {
                            track
                                .cues
                                .iter()
                                .find(|c| effective_time >= c.start_time && effective_time <= c.end_time)
                                .map(|c| c.text.clone())
                                .unwrap_or_default()
                        } else {
                            String::new()
                        }
                    } else {
                        String::new()
                    };

                    let handle_loop = handle_ticker.clone();
                    let _ = slint::invoke_from_event_loop(move || {
                        if let Some(ui) = handle_loop.upgrade() {
                            ui.set_progress(prog);
                            ui.set_time_display(time_display.into());
                            ui.set_active_subtitle_text(active_sub.into());
                        }
                    });

                    // Save timestamp to DB every 5 seconds
                    save_counter += 1;
                    if save_counter >= 50 {
                        save_counter = 0;
                        if let Some(path) = &st.current_path {
                            let id = format!("local-{}", hash_path(path));
                            let _ = db_ticker.update_timestamp(&id, st.current_time);
                        }
                    }
                }
            }
        }
    });

    main_window.run()?;
    Ok(())
}

async fn load_and_play_media(
    path: PathBuf,
    state: Arc<Mutex<PlaybackState>>,
    audio_engine: Option<Arc<AudioEngine>>,
    is_playing: Arc<AtomicBool>,
    handle: slint::Weak<MainWindow>,
    db: Database,
    resume_time: f64,
) {
    let file_name = path
        .file_name()
        .map(|f| f.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    tracing::info!("Probing media: {:?}", path);
    let meta = probe_media(&path);
    let dur = meta.as_ref().ok().and_then(|m| m.duration_seconds).unwrap_or(0.0);

    // Build deduplicated audio tracks
    let mut audio_tracks = vec![
        InternalAudioTrack {
            id: "default".to_string(),
            name: "Original (WASAPI)".to_string(),
            path: None,
        }
    ];

    if let Ok(ref m) = meta {
        for (i, stream) in m.streams.iter().filter(|s| s.stream_type == StreamType::Audio).enumerate() {
            if i > 0 {
                let name = stream.language.clone().unwrap_or_else(|| format!("Track #{} ({})", i + 1, stream.codec));
                audio_tracks.push(InternalAudioTrack {
                    id: format!("stream-{}", stream.index),
                    name,
                    path: None,
                });
            }
        }
    }

    // Auto-detect sibling subtitles (e.g. video.srt or video.vtt)
    let mut sub_tracks = Vec::new();
    let mut active_sub_id = None;
    let mut sub_label = "Off".to_string();

    if let Some(sub_path) = find_sibling_subtitle(&path) {
        if let Ok(content) = std::fs::read_to_string(&sub_path) {
            let cues = parse_subtitles(&content);
            if !cues.is_empty() {
                let sub_name = sub_path.extension().and_then(|e| e.to_str()).unwrap_or("SRT").to_uppercase();
                let sub_id = format!("sibling-sub-{}", hash_path(&sub_path));
                sub_label = format!("{} (Auto)", sub_name);
                active_sub_id = Some(sub_id.clone());
                sub_tracks.push(InternalSubTrack {
                    id: sub_id,
                    name: sub_label.clone(),
                    cues,
                });
                tracing::info!("Loaded sibling subtitles from {:?}", sub_path);
            }
        }
    }

    // Start audio playback
    if let Some(ref audio) = audio_engine {
        let _ = audio.play_file(&path);
    }
    is_playing.store(true, Ordering::SeqCst);

    {
        let mut st = state.lock();
        st.current_path = Some(path.clone());
        st.duration = dur;
        st.current_time = resume_time;
        st.audio_tracks = audio_tracks.clone();
        st.active_audio_id = "default".to_string();
        st.sub_tracks = sub_tracks.clone();
        st.active_sub_id = active_sub_id.clone();
    }

    let record = MediaRecord {
        id: format!("local-{}", hash_path(&path)),
        title: file_name.clone(),
        file_path: path.to_string_lossy().to_string(),
        duration: dur,
        current_time: resume_time,
        last_played_date: chrono::Utc::now().to_rfc3339(),
        is_remote: false,
    };
    let _ = db.save_media(&record);

    let dur_str = format_seconds(dur);
    let cur_str = format_seconds(resume_time);
    let time_str = format!("{} / {}", cur_str, dur_str);
    let prog = if dur > 0.0 { (resume_time / dur) as f32 } else { 0.0 };

    let tracks_for_ui = audio_tracks.clone();
    let subs_for_ui = sub_tracks.clone();
    let is_sub_off = active_sub_id.is_none();

    let _ = slint::invoke_from_event_loop(move || {
        if let Some(ui) = handle.upgrade() {
            ui.set_media_title(file_name.into());
            ui.set_time_display(time_str.into());
            ui.set_progress(prog);
            ui.set_is_playing(true);
            ui.set_audio_track_label("Original (WASAPI)".into());
            ui.set_sub_track_label(sub_label.into());
            ui.set_is_sub_off(is_sub_off);
            ui.set_active_subtitle_text("".into());
            ui.set_show_recent_panel(false);

            refresh_audio_ui_model(&ui, &tracks_for_ui, "default");
            refresh_sub_ui_model(&ui, &subs_for_ui, &active_sub_id);
        }
    });
}

fn refresh_audio_ui_model(ui: &MainWindow, tracks: &[InternalAudioTrack], active_id: &str) {
    let items: Vec<TrackItem> = tracks
        .iter()
        .map(|t| TrackItem {
            id: t.id.clone().into(),
            name: t.name.clone().into(),
            badge: "".into(),
            is_active: t.id == active_id,
        })
        .collect();
    ui.set_audio_tracks(ModelRc::from(Rc::new(VecModel::from(items))));
}

fn refresh_sub_ui_model(ui: &MainWindow, tracks: &[InternalSubTrack], active_id: &Option<String>) {
    let items: Vec<TrackItem> = tracks
        .iter()
        .map(|t| TrackItem {
            id: t.id.clone().into(),
            name: t.name.clone().into(),
            badge: "".into(),
            is_active: Some(t.id.clone()) == *active_id,
        })
        .collect();
    ui.set_sub_tracks(ModelRc::from(Rc::new(VecModel::from(items))));
}

fn find_sibling_subtitle(media_path: &Path) -> Option<PathBuf> {
    let extensions = ["srt", "vtt", "en.srt", "eng.srt"];
    let stem = media_path.file_stem()?.to_string_lossy();
    let parent = media_path.parent()?;

    for ext in &extensions {
        let candidate = parent.join(format!("{}.{}", stem, ext));
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

fn dirs_or_local_db_path() -> PathBuf {
    std::env::current_dir()
        .map(|p| p.join(".valor_data").join("valor.db"))
        .unwrap_or_else(|_| PathBuf::from("valor.db"))
}

fn hash_path(path: &Path) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    path.to_string_lossy().hash(&mut hasher);
    hasher.finish()
}

fn format_seconds(secs: f64) -> String {
    let s = secs as u64;
    let m = s / 60;
    let s_rem = s % 60;
    let h = m / 60;
    let m_rem = m % 60;

    if h > 0 {
        format!("{:02}:{:02}:{:02}", h, m_rem, s_rem)
    } else {
        format!("{:02}:{:02}", m_rem, s_rem)
    }
}
