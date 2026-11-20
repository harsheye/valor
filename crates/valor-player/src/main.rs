use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use parking_lot::Mutex;
use slint::ComponentHandle;
use valor_db::{Database, MediaRecord};
use valor_engine::{probe_media, parse_subtitles, AudioEngine, SubtitleCue};

slint::include_modules!();

#[derive(Default)]
struct PlaybackState {
    current_time: f64,
    duration: f64,
    current_path: Option<PathBuf>,
    subtitles: Vec<SubtitleCue>,
    speed_index: usize,
    volume: f32,
    is_muted: bool,
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

    let state = Arc::new(Mutex::new(PlaybackState {
        volume: 1.0,
        ..Default::default()
    }));
    let is_playing = Arc::new(AtomicBool::new(false));

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
                let file_name = path
                    .file_name()
                    .map(|f| f.to_string_lossy().to_string())
                    .unwrap_or_else(|| "Unknown".to_string());

                tracing::info!("Probing media: {:?}", path);
                let meta = probe_media(&path);
                let dur = meta.as_ref().ok().and_then(|m| m.duration_seconds).unwrap_or(0.0);

                // Check for sibling subtitles (e.g., video.srt or video.vtt)
                let mut loaded_subs = Vec::new();
                let mut sub_label = "Off".to_string();
                if let Some(sub_path) = find_sibling_subtitle(&path) {
                    if let Ok(content) = std::fs::read_to_string(&sub_path) {
                        loaded_subs = parse_subtitles(&content);
                        if !loaded_subs.is_empty() {
                            sub_label = sub_path.extension().and_then(|e| e.to_str()).unwrap_or("SRT").to_uppercase();
                            tracing::info!("Loaded {} subtitle cues from {:?}", loaded_subs.len(), sub_path);
                        }
                    }
                }

                // Start native audio playback if supported
                if let Some(ref audio) = audio_inner {
                    let _ = audio.play_file(&path);
                }
                is_playing_inner.store(true, Ordering::SeqCst);

                {
                    let mut st = state_inner.lock();
                    st.current_path = Some(path.clone());
                    st.duration = dur;
                    st.current_time = 0.0;
                    st.subtitles = loaded_subs;
                }

                let record = MediaRecord {
                    id: format!("local-{}", hash_path(&path)),
                    title: file_name.clone(),
                    file_path: path.to_string_lossy().to_string(),
                    duration: dur,
                    current_time: 0.0,
                    last_played_date: chrono::Utc::now().to_rfc3339(),
                    is_remote: false,
                };
                let _ = db_inner.save_media(&record);

                let dur_str = format_seconds(dur);
                let time_str = format!("00:00 / {}", dur_str);

                let _ = slint::invoke_from_event_loop(move || {
                    if let Some(ui) = handle_inner.upgrade() {
                        ui.set_media_title(file_name.into());
                        ui.set_time_display(time_str.into());
                        ui.set_progress(0.0);
                        ui.set_is_playing(true);
                        ui.set_sub_track_label(sub_label.into());
                        ui.set_active_subtitle_text("".into());
                    }
                });
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

    // Menus
    main_window.on_toggle_audio_menu(|| {
        tracing::info!("Audio track selection triggered");
    });
    main_window.on_toggle_sub_menu(|| {
        tracing::info!("Subtitle track selection triggered");
    });
    main_window.on_toggle_recent(|| {
        tracing::info!("Recent media drawer toggled");
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

                    // Find matching subtitle cue
                    let active_sub = st
                        .subtitles
                        .iter()
                        .find(|c| st.current_time >= c.start_time && st.current_time <= c.end_time)
                        .map(|c| c.text.clone())
                        .unwrap_or_default();

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
