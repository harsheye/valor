use chrono::{Duration, Local, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Utc};
use valor_core::db::Database;
use valor_core::models::{Collection, MediaItem, PlaybackPosition, WatchSession};

pub fn seed_empty_history(_db: &Database) {
    // Database is already empty upon creation
}

pub fn seed_demo_history(db: &Database) {
    // Reference date: 21 Nov 2026
    let ref_date = NaiveDate::from_ymd_opt(2026, 11, 21).unwrap();
    let ref_now = Local
        .from_local_datetime(&NaiveDateTime::new(
            ref_date,
            NaiveTime::from_hms_opt(22, 30, 0).unwrap(),
        ))
        .single()
        .unwrap();

    // 1. Seed 3 Collections
    let col1 = Collection {
        id: "col_perfect_lie".into(),
        name: "The Perfect Lie".into(),
        collection_type: "series".into(),
        item_ids: vec!["item_tpl_s1e8".into()],
        current_index: 0,
        last_played_at: Some(ref_now.with_timezone(&Utc)),
        is_pinned: false,
    };
    let col2 = Collection {
        id: "col_video".into(),
        name: "Video".into(),
        collection_type: "playlist".into(),
        item_ids: vec!["item_video_1".into()],
        current_index: 0,
        last_played_at: Some((ref_now - Duration::hours(1)).with_timezone(&Utc)),
        is_pinned: false,
    };
    let col3 = Collection {
        id: "col_fight_club".into(),
        name: "Fight Club".into(),
        collection_type: "movies".into(),
        item_ids: vec!["item_fc_1".into()],
        current_index: 0,
        last_played_at: Some((ref_now - Duration::hours(2)).with_timezone(&Utc)),
        is_pinned: false,
    };

    let _ = db.save_collection(&col1);
    let _ = db.save_collection(&col2);
    let _ = db.save_collection(&col3);

    // 2. Seed Media Items
    let item_tpl = MediaItem {
        id: "item_tpl_s1e8".into(),
        fingerprint: "fp_tpl_s1e8".into(),
        file_path: "The.Perfect.Lie.S01E08.1080p.mkv".into(),
        title: "The Perfect Lie".into(),
        duration: 3960.0, // 1h 6m
        size_bytes: 2_500_000_000,
        width: Some(1920),
        height: Some(1080),
        is_hdr: false,
        video_codec: Some("H.264".into()),
        audio_codec: Some("AAC".into()),
        series_id: Some("The Perfect Lie".into()),
        season_number: Some(1),
        episode_number: Some(8),
        is_missing: false,
        created_at: ref_now.with_timezone(&Utc),
        updated_at: ref_now.with_timezone(&Utc),
    };
    let item_video = MediaItem {
        id: "item_video_1".into(),
        fingerprint: "fp_video_1".into(),
        file_path: "Video.mp4".into(),
        title: "Video".into(),
        duration: 0.0, // Null/0 runtime
        size_bytes: 400_000_000,
        width: Some(1920),
        height: Some(1080),
        is_hdr: false,
        video_codec: Some("H.264".into()),
        audio_codec: Some("AAC".into()),
        series_id: None,
        season_number: None,
        episode_number: None,
        is_missing: false,
        created_at: ref_now.with_timezone(&Utc),
        updated_at: ref_now.with_timezone(&Utc),
    };
    let item_fc = MediaItem {
        id: "item_fc_1".into(),
        fingerprint: "fp_fc_1".into(),
        file_path: "Fight.Club.1999.1080p.mkv".into(),
        title: "Fight Club".into(),
        duration: 8340.0, // 2h 19m
        size_bytes: 4_200_000_000,
        width: Some(1920),
        height: Some(1080),
        is_hdr: false,
        video_codec: Some("H.264".into()),
        audio_codec: Some("AC3".into()),
        series_id: None,
        season_number: None,
        episode_number: None,
        is_missing: false,
        created_at: ref_now.with_timezone(&Utc),
        updated_at: ref_now.with_timezone(&Utc),
    };

    let _ = db.upsert_item(&item_tpl);
    let _ = db.upsert_item(&item_video);
    let _ = db.upsert_item(&item_fc);

    // 3. Seed Playback Positions & Resume Cards (Unfinished only)
    let pos_tpl = PlaybackPosition {
        fingerprint: "fp_tpl_s1e8".into(),
        position_secs: 60.0,   // 1m
        duration_secs: 3960.0, // 1h 6m
        completed: false,
        updated_at: ref_now.with_timezone(&Utc),
    };
    let pos_video = PlaybackPosition {
        fingerprint: "fp_video_1".into(),
        position_secs: 180.0, // 3m
        duration_secs: 1800.0,
        completed: false,
        updated_at: (ref_now - Duration::hours(1)).with_timezone(&Utc),
    };
    let pos_fc = PlaybackPosition {
        fingerprint: "fp_fc_1".into(),
        position_secs: 240.0,  // 4m
        duration_secs: 8340.0, // 2h 19m
        completed: false,
        updated_at: (ref_now - Duration::hours(2)).with_timezone(&Utc),
    };

    let _ = db.save_playback_position(&pos_tpl);
    let _ = db.save_playback_position(&pos_video);
    let _ = db.save_playback_position(&pos_fc);

    // 4. Seed Exactly 29 Watch Sessions (Matching production screenshot "29 sessions in the last year")
    // Today 21 Nov 2026: 3 sessions, total 3m watched
    // Row 1: The Perfect Lie, 22:22, 1m / 1h 6m watched, Stopped early
    let t1_start = Local
        .from_local_datetime(&NaiveDateTime::new(
            ref_date,
            NaiveTime::from_hms_opt(22, 22, 0).unwrap(),
        ))
        .single()
        .unwrap();
    let _ = db.record_watch_session(&WatchSession {
        id: "sess_today_1".into(),
        fingerprint: "fp_tpl_s1e8".into(),
        collection_id: Some("col_perfect_lie".into()),
        item_title: "The Perfect Lie".into(),
        start_time: t1_start.with_timezone(&Utc),
        end_time: (t1_start + Duration::seconds(60)).with_timezone(&Utc),
        start_pos_secs: 0.0,
        end_pos_secs: 60.0,
        completed: false,
        stopped_early: true,
    });

    // Row 2: Video, 20:54, 3m watched, Stopped early
    let t2_start = Local
        .from_local_datetime(&NaiveDateTime::new(
            ref_date,
            NaiveTime::from_hms_opt(20, 54, 0).unwrap(),
        ))
        .single()
        .unwrap();
    let _ = db.record_watch_session(&WatchSession {
        id: "sess_today_2".into(),
        fingerprint: "fp_video_1".into(),
        collection_id: Some("col_video".into()),
        item_title: "Video".into(),
        start_time: t2_start.with_timezone(&Utc),
        end_time: (t2_start + Duration::seconds(180)).with_timezone(&Utc),
        start_pos_secs: 0.0,
        end_pos_secs: 180.0,
        completed: false,
        stopped_early: true,
    });

    // Row 3: Fight Club, 20:54, 4m / 2h 19m watched, Stopped early
    let _ = db.record_watch_session(&WatchSession {
        id: "sess_today_3".into(),
        fingerprint: "fp_fc_1".into(),
        collection_id: Some("col_fight_club".into()),
        item_title: "Fight Club".into(),
        start_time: (t2_start - Duration::seconds(10)).with_timezone(&Utc),
        end_time: (t2_start + Duration::seconds(230)).with_timezone(&Utc),
        start_pos_secs: 0.0,
        end_pos_secs: 240.0,
        completed: false,
        stopped_early: true,
    });

    // Nov 20: Session crossing midnight! (Starts at 23:50 on Nov 20, ends at 00:20 on Nov 21)
    let mid_start = Local
        .from_local_datetime(&NaiveDateTime::new(
            ref_date - Duration::days(1),
            NaiveTime::from_hms_opt(23, 50, 0).unwrap(),
        ))
        .single()
        .unwrap();
    let _ = db.record_watch_session(&WatchSession {
        id: "sess_midnight".into(),
        fingerprint: "fp_tpl_s1e8".into(),
        collection_id: Some("col_perfect_lie".into()),
        item_title: "The Perfect Lie".into(),
        start_time: mid_start.with_timezone(&Utc),
        end_time: (mid_start + Duration::minutes(30)).with_timezone(&Utc),
        start_pos_secs: 1000.0,
        end_pos_secs: 2800.0,
        completed: true,
        stopped_early: false,
    });

    // Finished sessions and varied trailing 30 days sessions to reach exactly 29 sessions total
    let titles = [
        ("The Perfect Lie", "fp_tpl_s1e8", Some("col_perfect_lie")),
        ("Video", "fp_video_1", Some("col_video")),
        ("Fight Club", "fp_fc_1", Some("col_fight_club")),
        ("Cosmic Odyssey", "fp_cosmic", None),
        ("Blade Runner 2049", "fp_br", None),
    ];

    for i in 5..=29 {
        let days_ago = (i as i64) % 25 + 2;
        let day = ref_date - Duration::days(days_ago);
        let start_hour = (18 + (i % 5)) as u32;
        let dt = Local
            .from_local_datetime(&NaiveDateTime::new(
                day,
                NaiveTime::from_hms_opt(start_hour, 15, 0).unwrap(),
            ))
            .single()
            .unwrap();

        let (title, fp, col) = titles[i % titles.len()];
        let is_completed = i % 3 == 0;
        let duration = if is_completed { 3600.0 } else { 1200.0 };

        let _ = db.record_watch_session(&WatchSession {
            id: format!("sess_past_{}", i),
            fingerprint: fp.into(),
            collection_id: col.map(|c| c.into()),
            item_title: title.into(),
            start_time: dt.with_timezone(&Utc),
            end_time: (dt + Duration::seconds(duration as i64)).with_timezone(&Utc),
            start_pos_secs: 0.0,
            end_pos_secs: duration,
            completed: is_completed,
            stopped_early: !is_completed,
        });
    }
}
