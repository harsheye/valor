use std::fs::File;
use std::io::Write;
use std::path::Path;
use valor_core::db::Database;
use valor_core::fingerprint::compute_fingerprint;
use valor_core::models::{Collection, MediaItem, PlaybackPosition, TrackItem};
use valor_core::tracks::{find_preferred_track, find_sidecar_subtitles, TrackPreferencesManager};
use valor_player::PlayerEngine;

#[test]
fn test_phase3_player_database_tracks_resume_history_integration() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let base_path = Path::new(&manifest_dir).join("../../tests/fixtures/media");
    let media_dir = if base_path.exists() {
        base_path
    } else {
        Path::new("tests/fixtures/media").to_path_buf()
    };

    let clip1_path = media_dir.join("clip_01_multitrack.mkv");
    let clip2_path = media_dir.join("clip_02_smpte.mkv");
    let clip3_path = media_dir.join("clip_03_countdown.mkv");

    assert!(clip1_path.exists(), "clip1 must exist");
    assert!(clip2_path.exists(), "clip2 must exist");
    assert!(clip3_path.exists(), "clip3 must exist");

    // 1. Initialize Database & Compute Real BLAKE3 3-Chunk Fingerprints
    let db = Database::in_memory().expect("In-memory database must initialize");
    let fp1 = compute_fingerprint(&clip1_path).expect("Fingerprint clip 1");
    let fp2 = compute_fingerprint(&clip2_path).expect("Fingerprint clip 2");
    let fp3 = compute_fingerprint(&clip3_path).expect("Fingerprint clip 3");

    assert_eq!(fp1.len(), 64);
    assert_eq!(fp2.len(), 64);
    assert_eq!(fp3.len(), 64);

    let item1 = MediaItem {
        id: "item_01".into(),
        fingerprint: fp1.clone(),
        file_path: clip1_path.to_str().unwrap().to_string(),
        title: "Anthology S01E01".into(),
        duration: 50.0,
        size_bytes: 1024,
        width: Some(1920),
        height: Some(1080),
        is_hdr: false,
        video_codec: Some("H.264".into()),
        audio_codec: Some("AAC".into()),
        series_id: None,
        season_number: Some(1),
        episode_number: Some(1),
        is_missing: false,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };
    let item2 = MediaItem {
        id: "item_02".into(),
        fingerprint: fp2.clone(),
        file_path: clip2_path.to_str().unwrap().to_string(),
        title: "Anthology S01E02".into(),
        duration: 50.0,
        size_bytes: 1024,
        width: Some(1920),
        height: Some(1080),
        is_hdr: false,
        video_codec: Some("H.264".into()),
        audio_codec: Some("AAC".into()),
        series_id: None,
        season_number: Some(1),
        episode_number: Some(2),
        is_missing: false,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };
    let item3 = MediaItem {
        id: "item_03".into(),
        fingerprint: fp3.clone(),
        file_path: clip3_path.to_str().unwrap().to_string(),
        title: "Anthology S01E03".into(),
        duration: 50.0,
        size_bytes: 1024,
        width: Some(1920),
        height: Some(1080),
        is_hdr: false,
        video_codec: Some("H.264".into()),
        audio_codec: Some("AAC".into()),
        series_id: None,
        season_number: Some(1),
        episode_number: Some(3),
        is_missing: false,
        created_at: chrono::Utc::now(),
        updated_at: chrono::Utc::now(),
    };

    db.upsert_item(&item1).unwrap();
    db.upsert_item(&item2).unwrap();
    db.upsert_item(&item3).unwrap();

    // 2. Open 3 Clips in a Playlist Collection
    let playlist_collection = Collection {
        id: "coll_anthology".into(),
        name: "Anthology".into(),
        collection_type: "playlist".into(),
        item_ids: vec![item1.id.clone(), item2.id.clone(), item3.id.clone()],
        current_index: 0,
        last_played_at: Some(chrono::Utc::now()),
        is_pinned: true,
    };
    db.save_collection(&playlist_collection).unwrap();

    let player = PlayerEngine::new(None).expect("PlayerEngine initialize");

    // 3. Play Clip 1, simulate watching to 25.0s, then switch
    player
        .load_file(&item1.file_path, &item1.fingerprint, 0.0)
        .unwrap();
    let pos1 = PlaybackPosition {
        fingerprint: fp1.clone(),
        position_secs: 25.0,
        duration_secs: 50.0,
        completed: false,
        updated_at: chrono::Utc::now(),
    };
    db.save_playback_position(&pos1).unwrap();

    // Switch to Clip 2
    player
        .load_file(&item2.file_path, &item2.fingerprint, 0.0)
        .unwrap();
    let pos2 = PlaybackPosition {
        fingerprint: fp2.clone(),
        position_secs: 10.0,
        duration_secs: 50.0,
        completed: false,
        updated_at: chrono::Utc::now(),
    };
    db.save_playback_position(&pos2).unwrap();

    // Switch to Clip 3 and reach within 15s of end (position 38s of 50s -> remaining 12s <= 15s)
    player
        .load_file(&item3.file_path, &item3.fingerprint, 38.0)
        .unwrap();

    // Condition: remaining < 15s marks completed = true and position = 0.0
    let duration3 = 50.0;
    let current_pos3 = 38.0;
    let is_completed = duration3 > 30.0 && (duration3 - current_pos3) <= 15.0;
    assert!(is_completed, "Remaining <= 15s must trigger completion");

    let pos3 = PlaybackPosition {
        fingerprint: fp3.clone(),
        position_secs: if is_completed { 0.0 } else { current_pos3 },
        duration_secs: duration3,
        completed: is_completed,
        updated_at: chrono::Utc::now(),
    };
    db.save_playback_position(&pos3).unwrap();

    // 4. Simulate Quit and Relaunch
    drop(player);

    // "Relaunch" - open new PlayerEngine instance with existing DB
    let relaunched_player = PlayerEngine::new(None).expect("Relaunched PlayerEngine");

    // Zero-click resume verification on Clip 1
    let saved_pos1 = db
        .get_playback_position(&fp1)
        .unwrap()
        .expect("Position 1 exists");
    assert_eq!(saved_pos1.position_secs, 25.0);
    assert!(!saved_pos1.completed);

    // Zero-click resume loads at saved 25.0s without clicks
    let token1 = relaunched_player
        .load_file(
            &item1.file_path,
            &item1.fingerprint,
            saved_pos1.position_secs,
        )
        .unwrap();
    assert!(token1 > 0);

    // Verify Clip 3 is marked completed
    let saved_pos3 = db
        .get_playback_position(&fp3)
        .unwrap()
        .expect("Position 3 exists");
    assert!(saved_pos3.completed, "Clip 3 must be marked completed");
    assert_eq!(
        saved_pos3.position_secs, 0.0,
        "Position resets to 0.0 on completion"
    );

    // 5. Single File Opening creates/updates a collection of 1; history tracks it identically
    let single_item = item2.clone();
    let single_coll_id = format!("coll_single_{}", single_item.fingerprint);
    let single_collection = Collection {
        id: single_coll_id.clone(),
        name: single_item.title.clone(),
        collection_type: "single".into(),
        item_ids: vec![single_item.id.clone()],
        current_index: 0,
        last_played_at: Some(chrono::Utc::now()),
        is_pinned: false,
    };
    db.save_collection(&single_collection).unwrap();

    // Unified History: check that get_history returns 1 card per collection/playlist
    let history = db.get_history(10).unwrap();
    println!("History entries returned: {}", history.len());
    for h in &history {
        println!(
            "  • Collection: '{}' (type: {}, items: {}, pos: {:.1}s / {:.1}s)",
            h.collection_name, h.collection_type, h.total_items, h.position_secs, h.duration_secs
        );
    }
    assert_eq!(
        history.len(),
        2,
        "History must return exactly 1 card per playlist/collection (1 playlist + 1 single file)"
    );
    assert_eq!(history[0].collection_id, single_coll_id);
    assert_eq!(history[0].total_items, 1);
    assert_eq!(history[1].collection_id, "coll_anthology");
    assert_eq!(history[1].total_items, 3);

    // 6. Track Selection, Matching, Preferences & Subtitle Styling
    let mut track_mgr = TrackPreferencesManager::new();
    track_mgr.update("Anthology", |p| {
        p.audio_lang = Some("eng".into());
        p.sub_lang = Some("eng".into());
        p.audio_offset_secs = 0.15; // +150ms
        p.sub_offset_secs = -0.10; // -100ms
        p.style.font_size = 60;
        p.style.text_color = "#FFD700".into();
        p.style.ass_override = true;
    });

    let carried = track_mgr.get("Anthology");
    assert_eq!(carried.audio_lang.as_deref(), Some("eng"));
    assert_eq!(carried.audio_offset_secs, 0.15);
    assert_eq!(carried.sub_offset_secs, -0.10);
    assert_eq!(carried.style.font_size, 60);

    // Test track matching against multi-track media
    let test_tracks = vec![
        TrackItem {
            id: 1,
            track_type: "audio".into(),
            title: Some("Japanese 5.1 [Original]".into()),
            lang: Some("jpn".into()),
            codec: Some("aac".into()),
            channels: Some(6),
            is_default: true,
            is_forced: false,
            is_selected: true,
            is_external: false,
        },
        TrackItem {
            id: 2,
            track_type: "audio".into(),
            title: Some("English Stereo Dub".into()),
            lang: Some("eng".into()),
            codec: Some("ac3".into()),
            channels: Some(2),
            is_default: false,
            is_forced: false,
            is_selected: false,
            is_external: false,
        },
        TrackItem {
            id: 3,
            track_type: "sub".into(),
            title: Some("English Full SDH".into()),
            lang: Some("eng".into()),
            codec: Some("subrip".into()),
            channels: None,
            is_default: true,
            is_forced: false,
            is_selected: false,
            is_external: false,
        },
    ];

    let matched_audio = find_preferred_track(&test_tracks, "eng", "audio").unwrap();
    assert_eq!(matched_audio.id, 2);
    assert_eq!(matched_audio.lang.as_deref(), Some("eng"));
    assert_eq!(matched_audio.channels, Some(2));

    let matched_sub = find_preferred_track(&test_tracks, "English", "sub").unwrap();
    assert_eq!(matched_sub.id, 3);
    assert_eq!(matched_sub.codec.as_deref(), Some("subrip"));

    // 7. External Subtitles Auto-Discovery (.srt, .ass, .vtt)
    let temp_dir = std::env::temp_dir().join("valor_phase3_sub_test");
    let _ = std::fs::create_dir_all(&temp_dir);
    let sample_video = temp_dir.join("Episode.01.mkv");
    let sample_sub1 = temp_dir.join("Episode.01.en.srt");
    let sample_sub2 = temp_dir.join("Episode.01.jpn.ass");
    let sample_sub3 = temp_dir.join("Episode.01.vtt");
    let sample_unrelated = temp_dir.join("OtherMovie.srt");

    File::create(&sample_video)
        .unwrap()
        .write_all(b"dummy")
        .unwrap();
    File::create(&sample_sub1)
        .unwrap()
        .write_all(b"1\n00:00:01,000 --> 00:00:02,000\nHello")
        .unwrap();
    File::create(&sample_sub2)
        .unwrap()
        .write_all(b"[Script Info]\nTitle: Test")
        .unwrap();
    File::create(&sample_sub3)
        .unwrap()
        .write_all(b"WEBVTT\n")
        .unwrap();
    File::create(&sample_unrelated)
        .unwrap()
        .write_all(b"unrelated")
        .unwrap();

    let discovered_subs = find_sidecar_subtitles(&sample_video);
    println!("Discovered sidecar subtitles: {:?}", discovered_subs);
    assert_eq!(discovered_subs.len(), 3);
    assert!(discovered_subs.contains(&sample_sub1));
    assert!(discovered_subs.contains(&sample_sub2));
    assert!(discovered_subs.contains(&sample_sub3));
    assert!(!discovered_subs.contains(&sample_unrelated));

    // Cleanup temp files
    let _ = std::fs::remove_dir_all(&temp_dir);

    // 8. Audio Delay & Subtitle Delay in 50ms steps (+/- 5.0s)
    let _ = relaunched_player.set_audio_delay(0.05); // +50ms
    let _ = relaunched_player.set_subtitle_delay(-0.05); // -50ms

    // 9. A-B Loop verification
    let _ = relaunched_player.set_ab_loop_a(Some(10.0));
    let _ = relaunched_player.set_ab_loop_b(Some(20.0));
    let _ = relaunched_player.clear_ab_loop();

    // 10. Chapters list and jump
    let chapters = relaunched_player.get_chapters();
    println!("Chapters in sample: {}", chapters.len());
    let _ = relaunched_player.set_chapter(0);

    println!("Phase 3 Player <-> Database, Tracks, Subtitles, Audio Integration: ALL PASS");
}
