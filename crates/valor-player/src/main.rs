use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use slint::ComponentHandle;
use valor_db::{Database, MediaRecord};
use valor_engine::probe_media;

slint::include_modules!();

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();
    tracing::info!("Starting Valor Pure Rust Native Player");

    // Initialize local database
    let db_path = dirs_or_local_db_path();
    let db = match Database::open(&db_path) {
        Ok(db) => db,
        Err(e) => {
            tracing::warn!("Failed to open database at {:?}: {}, falling back to in-memory", db_path, e);
            Database::in_memory()?
        }
    };

    let main_window = MainWindow::new()?;
    let handle = main_window.as_weak();

    let is_playing = Arc::new(AtomicBool::new(false));
    let is_playing_clone = is_playing.clone();
    let handle_play = handle.clone();

    // Play/Pause callback
    main_window.on_toggle_play(move || {
        let current = is_playing_clone.load(Ordering::SeqCst);
        let next = !current;
        is_playing_clone.store(next, Ordering::SeqCst);
        if let Some(ui) = handle_play.upgrade() {
            ui.set_is_playing(next);
        }
    });

    // Open File callback
    let handle_open = handle.clone();
    let db_open = db.clone();
    main_window.on_open_file(move || {
        let handle_inner = handle_open.clone();
        let db_inner = db_open.clone();

        tokio::spawn(async move {
            let file = rfd::AsyncFileDialog::new()
                .add_filter("Video Files", &["mp4", "mkv", "webm", "avi", "mov", "ts"])
                .add_filter("Audio Files", &["mp3", "aac", "flac", "wav", "ogg"])
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
                    }
                });
            }
        });
    });

    // Seek callback
    let handle_seek = handle.clone();
    main_window.on_seek(move |val| {
        tracing::debug!("Seek requested to: {:.2}%", val * 100.0);
        if let Some(ui) = handle_seek.upgrade() {
            ui.set_progress(val);
        }
    });

    // Volume change
    main_window.on_change_volume(|vol| {
        tracing::debug!("Volume changed: {:.2}", vol);
    });

    // Audio & Subtitle menu toggles
    main_window.on_toggle_audio_menu(|| {
        tracing::info!("Toggled audio menu");
    });
    main_window.on_toggle_sub_menu(|| {
        tracing::info!("Toggled subtitle menu");
    });

    main_window.run()?;
    Ok(())
}

fn dirs_or_local_db_path() -> PathBuf {
    std::env::current_dir()
        .map(|p| p.join(".valor_data").join("valor.db"))
        .unwrap_or_else(|_| PathBuf::from("valor.db"))
}

fn hash_path(path: &std::path::Path) -> u64 {
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
