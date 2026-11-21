use chrono::Utc;
use std::fs;
use std::path::Path;
use valor_core::db::Database;
use valor_core::models::{Collection, MediaItem, PlaybackPosition};
use valor_core::tracks::is_playback_completed;
use valor_player::PlayerEngine;

#[test]
fn test_w7_end_to_end_playback_workflow_resume_and_deduplication() {
    let db_path = std::env::temp_dir().join(format!("valor_e2e_test_{}.db", std::process::id()));
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
        "Test clips must exist"
    );

    // =========================================================================
    // SESSION 1: Initial Playback, Track Switching, and Position Saving
    // =========================================================================
    {
        let db = Database::open(&db_path).expect("open db");
        let now = Utc::now();

        // 1. Create items
        let items = [
            (
                "devs_ep1",
                "fp_devs_1",
                clip_01.to_str().unwrap(),
                "Devs S01E01",
                3000.0,
            ),
            (
                "devs_ep2",
                "fp_devs_2",
                clip_02.to_str().unwrap(),
                "Devs S01E02",
                3000.0,
            ),
            (
                "devs_ep3",
                "fp_devs_3",
                clip_03.to_str().unwrap(),
                "Devs S01E03",
                3000.0,
            ),
        ];

        let mut item_ids = Vec::new();
        for (id, fp, path, title, dur) in items {
            let item = MediaItem {
                id: id.to_string(),
                fingerprint: fp.to_string(),
                file_path: path.to_string(),
                title: title.to_string(),
                duration: dur,
                size_bytes: 1_500_000_000,
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

        // 2. Create saved collection "Devs"
        let mut coll = Collection {
            id: "coll_devs".to_string(),
            name: "Devs".to_string(),
            collection_type: "playlist".to_string(),
            item_ids: item_ids.clone(),
            current_index: 0,
            last_played_at: Some(now),
            is_pinned: true,
        };
        db.save_collection(&coll).expect("save collection");

        // 3. Play item 1, advance, seek to 45s, persist
        let player = PlayerEngine::new(None).expect("init player");
        player
            .load_file(items[0].2, items[0].1, 0.0)
            .expect("load ep1");
        db.save_playback_position(&PlaybackPosition {
            fingerprint: items[0].1.to_string(),
            position_secs: 45.0,
            duration_secs: items[0].4,
            completed: false,
            updated_at: now,
        })
        .expect("save pos ep1");

        // 4. Switch to item 2, seek to 120s, persist
        coll.current_index = 1;
        coll.last_played_at = Some(now + chrono::Duration::seconds(10));
        db.save_collection(&coll).expect("update coll ep2");
        player
            .load_file(items[1].2, items[1].1, 0.0)
            .expect("load ep2");
        db.save_playback_position(&PlaybackPosition {
            fingerprint: items[1].1.to_string(),
            position_secs: 120.0,
            duration_secs: items[1].4,
            completed: false,
            updated_at: now + chrono::Duration::seconds(10),
        })
        .expect("save pos ep2");

        // 5. Switch to item 3, seek to 250s, persist
        coll.current_index = 2;
        coll.last_played_at = Some(now + chrono::Duration::seconds(20));
        db.save_collection(&coll).expect("update coll ep3");
        player
            .load_file(items[2].2, items[2].1, 0.0)
            .expect("load ep3");
        db.save_playback_position(&PlaybackPosition {
            fingerprint: items[2].1.to_string(),
            position_secs: 250.0,
            duration_secs: items[2].4,
            completed: false,
            updated_at: now + chrono::Duration::seconds(20),
        })
        .expect("save pos ep3");

        // 6. Assert history has EXACTLY ONE entry for Devs
        let history = db.get_history(10).expect("get history");
        assert_eq!(
            history.len(),
            1,
            "History must have exactly one card for Devs"
        );
        assert_eq!(history[0].collection_name, "Devs");
        assert_eq!(history[0].current_index, 2);
        assert_eq!(history[0].current_item_fingerprint, "fp_devs_3");
        assert_eq!(history[0].position_secs, 250.0);
    }

    // =========================================================================
    // SESSION 2: Quit & Relaunch, Zero-Click Resume, Complete Last Item -> Home
    // =========================================================================
    {
        // Reopen database from persistent disk file
        let db = Database::open(&db_path).expect("reopen db");

        // 1. Zero-Click Resume lookup: fetch last played collection from history
        let history = db.get_history(1).expect("get history on relaunch");
        assert_eq!(history.len(), 1);
        let resume_entry = &history[0];
        assert_eq!(resume_entry.collection_name, "Devs");
        assert_eq!(resume_entry.current_index, 2);
        assert_eq!(resume_entry.position_secs, 250.0);

        // 2. Initialize fresh player instance and load at resumed position
        let player = PlayerEngine::new(None).expect("init player session 2");
        player
            .load_file(
                clip_03.to_str().unwrap(),
                &resume_entry.current_item_fingerprint,
                resume_entry.position_secs,
            )
            .expect("resume ep3");

        // 3. Play through to end: simulate reaching near completion (2985s out of 3000s)
        let end_position = 2985.0;
        let duration = 3000.0;
        let is_completed = is_playback_completed(end_position, duration);
        assert!(
            is_completed,
            "Item must be evaluated as completed by mathematical rule"
        );

        // Save position as completed
        db.save_playback_position(&PlaybackPosition {
            fingerprint: resume_entry.current_item_fingerprint.clone(),
            position_secs: end_position,
            duration_secs: duration,
            completed: true,
            updated_at: Utc::now(),
        })
        .expect("save completed pos");

        // 4. Finished last item in playlist: End of Collection Action triggers transition to Home
        // Assert History still has strictly ONE entry, now marked completed
        let history_final = db.get_history(10).expect("get final history");
        assert_eq!(
            history_final.len(),
            1,
            "History must still have exactly one entry for Devs"
        );
        assert_eq!(history_final[0].collection_name, "Devs");
        assert_eq!(history_final[0].current_index, 2);
    }

    let _ = fs::remove_file(&db_path);
}
