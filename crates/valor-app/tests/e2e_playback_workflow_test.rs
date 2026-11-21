use chrono::Utc;
use std::fs;
use std::path::Path;
use std::time::Duration;
use valor_core::db::Database;
use valor_core::models::{Collection, MediaItem, PlaybackPosition, WatchSession};
use valor_core::tracks::is_playback_completed;
use valor_player::state::PlaybackStatus;
use valor_player::PlayerEngine;

#[test]
fn test_w7_y4_real_engine_playback_workflow_end_event_and_resume() {
    let db_path = std::env::temp_dir().join(format!("valor_e2e_real_engine_{}.db", std::process::id()));
    if db_path.exists() {
        let _ = fs::remove_file(&db_path);
    }

    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let base_path = Path::new(&manifest_dir).join("../../tests/fixtures/media");
    let media_dir = if base_path.exists() {
        base_path
    } else {
        Path::new("tests/fixtures/media").to_path_buf()
    };

    let clip_01 = media_dir.join("clip_01_multitrack.mkv");
    let clip_02 = media_dir.join("clip_02_smpte.mkv");
    let clip_03 = media_dir.join("clip_03_countdown.mkv");

    assert!(
        clip_01.exists() && clip_02.exists() && clip_03.exists(),
        "Test fixtures must exist"
    );

    let collection_name = "SciFi Anthology";
    let coll_id = "coll_scifi_anthology";

    // =========================================================================
    // SESSION 1: Real-Engine Playback, Advancing, Seeking, and End Event
    // =========================================================================
    {
        let db = Database::open(&db_path).expect("open db");
        let now = Utc::now();

        // 1. Seed collection items
        let items = [
            ("item_ep1", "fp_scifi_1", clip_01.to_str().unwrap(), "Episode 1 - Prologue", 10.0),
            ("item_ep2", "fp_scifi_2", clip_02.to_str().unwrap(), "Episode 2 - Convergence", 10.0),
            ("item_ep3", "fp_scifi_3", clip_03.to_str().unwrap(), "Episode 3 - Horizon", 1.0),
        ];

        let mut item_ids = Vec::new();
        for (id, fp, path, title, dur) in items {
            let item = MediaItem {
                id: id.to_string(),
                fingerprint: fp.to_string(),
                file_path: path.to_string(),
                title: title.to_string(),
                duration: dur,
                size_bytes: 1_000_000,
                width: Some(1920),
                height: Some(1080),
                is_hdr: false,
                video_codec: Some("H.264".into()),
                audio_codec: Some("AAC".into()),
                series_id: None,
                season_number: Some(1),
                episode_number: Some(item_ids.len() as u32 + 1),
                is_missing: false,
                created_at: now,
                updated_at: now,
            };
            db.upsert_item(&item).expect("upsert item");
            item_ids.push(id.to_string());
        }

        let mut coll = Collection {
            id: coll_id.to_string(),
            name: collection_name.to_string(),
            collection_type: "playlist".to_string(),
            item_ids: item_ids.clone(),
            current_index: 0,
            last_played_at: Some(now),
            is_pinned: true,
        };
        db.save_collection(&coll).expect("save collection");

        // 2. Start Real Engine
        let player = PlayerEngine::new(None).expect("Failed to initialize PlayerEngine");

        // Play Episode 1, seek to 4.5s, save session
        player.load_file(items[0].2, items[0].1, 0.0).expect("load ep1");
        std::thread::sleep(Duration::from_millis(150));
        player.seek(4.5).expect("seek ep1");
        std::thread::sleep(Duration::from_millis(100));

        db.save_playback_position(&PlaybackPosition {
            fingerprint: items[0].1.to_string(),
            position_secs: 4.5,
            duration_secs: items[0].4,
            completed: false,
            updated_at: now,
        }).expect("save pos ep1");

        db.record_watch_session(&WatchSession {
            id: "session_01".to_string(),
            fingerprint: items[0].1.to_string(),
            collection_id: Some(coll_id.to_string()),
            item_title: items[0].3.to_string(),
            start_time: now,
            end_time: now + chrono::Duration::seconds(5),
            start_pos_secs: 0.0,
            end_pos_secs: 4.5,
            completed: false,
            stopped_early: true,
        }).expect("record session 1");

        // Advance to Episode 3 (countdown clip), seek near the end and observe REAL mpv completion event
        coll.current_index = 2;
        coll.last_played_at = Some(now + chrono::Duration::seconds(20));
        db.save_collection(&coll).expect("update coll to ep3");

        player.load_file(items[2].2, items[2].1, 0.0).expect("load ep3");
        std::thread::sleep(Duration::from_millis(200));

        let real_duration = player.get_property::<f64>("duration").unwrap_or(items[2].4);
        println!("Real media duration detected by mpv engine: {:.3}s", real_duration);

        // Seek to 95% of duration so it completes quickly in real engine
        let seek_target = (real_duration - 0.25).max(0.0);
        player.seek(seek_target).expect("seek near end");
        player.play().expect("play");

        // Loop until real end event is observed from engine
        let start_wait = std::time::Instant::now();
        let mut completed_event_observed = false;
        while start_wait.elapsed() < Duration::from_secs(3) {
            let state = player.update_tick();
            if state.status == PlaybackStatus::Completed {
                completed_event_observed = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(25));
        }

        println!("Real engine completion event observed: {}", completed_event_observed);
        assert!(completed_event_observed, "Engine must transition to PlaybackStatus::Completed on clip EOF");

        // Record completed position and watch session
        let is_completed = is_playback_completed(real_duration, real_duration);
        assert!(is_completed);

        db.save_playback_position(&PlaybackPosition {
            fingerprint: items[2].1.to_string(),
            position_secs: real_duration,
            duration_secs: real_duration,
            completed: true,
            updated_at: Utc::now(),
        }).expect("save completed pos ep3");

        db.record_watch_session(&WatchSession {
            id: "session_02".to_string(),
            fingerprint: items[2].1.to_string(),
            collection_id: Some(coll_id.to_string()),
            item_title: items[2].3.to_string(),
            start_time: now + chrono::Duration::seconds(20),
            end_time: Utc::now(),
            start_pos_secs: seek_target,
            end_pos_secs: real_duration,
            completed: true,
            stopped_early: false,
        }).expect("record session 2");

        // Verify history has EXACTLY ONE unified entry for the collection
        let history = db.get_history(10).expect("get history");
        assert_eq!(history.len(), 1, "History must have exactly one card per collection");
        assert_eq!(history[0].collection_name, collection_name);
        assert_eq!(history[0].current_index, 2);
    }

    // =========================================================================
    // SESSION 2: Relaunch, Assert Zero-Click Resume & Watch Session Rows
    // =========================================================================
    {
        let db = Database::open(&db_path).expect("reopen db on relaunch");

        // 1. Verify history on relaunch
        let history = db.get_history(5).expect("get history on relaunch");
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].collection_name, collection_name);
        assert_eq!(history[0].current_index, 2);

        // 2. Verify discrete watch_sessions table rows
        let sessions = db.get_watch_sessions(10).expect("get watch sessions");
        assert_eq!(sessions.len(), 2, "Expected exactly 2 watch sessions recorded");

        // Most recent session was Episode 3 completion
        assert_eq!(sessions[0].id, "session_02");
        assert_eq!(sessions[0].completed, true);
        assert_eq!(sessions[0].stopped_early, false);

        // Prior session was Episode 1 stopped early
        assert_eq!(sessions[1].id, "session_01");
        assert_eq!(sessions[1].completed, false);
        assert_eq!(sessions[1].stopped_early, true);
        assert_eq!(sessions[1].end_pos_secs, 4.5);
    }

    let _ = fs::remove_file(&db_path);
}
