use chrono::Utc;
use std::collections::HashMap;
use valor_core::models::MediaItem;
use valor_ui::letter_avatar_color;
use valor_ui::view_models::{
    build_movie_card_view_models, build_series_card_view_models, build_series_episodes_with_gaps,
    is_unidentified_title,
};

#[test]
fn test_series_dedupe_12_12_12_groups_into_one_card() {
    let now = Utc::now();
    let items = vec![
        MediaItem {
            id: "12_12_12_ep1".into(),
            fingerprint: "fp_12_12_12_1".into(),
            file_path: "C:/Media/TV Shows/12 12 12/Season 1/12 12 12 - S01E01.mkv".into(),
            title: "12 12 12 - S01E01".into(),
            duration: 2700.0,
            size_bytes: 1_000_000_000,
            width: Some(1920),
            height: Some(1080),
            is_hdr: false,
            video_codec: Some("h264".into()),
            audio_codec: Some("aac".into()),
            series_id: Some("12 12 12".into()),
            season_number: Some(1),
            episode_number: Some(1),
            is_missing: false,
            created_at: now,
            updated_at: now,
        },
        MediaItem {
            id: "12_12_12_ep2".into(),
            fingerprint: "fp_12_12_12_2".into(),
            file_path: "C:/Media/TV Shows/12 12 12/Season 1/12 12 12 - S01E02.mkv".into(),
            title: "12 12 12 - S01E02".into(),
            duration: 2700.0,
            size_bytes: 1_000_000_000,
            width: Some(1920),
            height: Some(1080),
            is_hdr: false,
            video_codec: Some("h264".into()),
            audio_codec: Some("aac".into()),
            series_id: Some("12 12 12".into()),
            season_number: Some(1),
            episode_number: Some(2),
            is_missing: false,
            created_at: now,
            updated_at: now,
        },
        MediaItem {
            id: "12_12_12_ep3".into(),
            fingerprint: "fp_12_12_12_3".into(),
            file_path: "C:/Media/TV Shows/12 12 12/Season 1/12 12 12 - S01E03.mkv".into(),
            title: "12 12 12 - S01E03".into(),
            duration: 2700.0,
            size_bytes: 1_000_000_000,
            width: Some(1920),
            height: Some(1080),
            is_hdr: false,
            video_codec: Some("h264".into()),
            audio_codec: Some("aac".into()),
            series_id: Some("12 12 12".into()),
            season_number: Some(1),
            episode_number: Some(3),
            is_missing: false,
            created_at: now,
            updated_at: now,
        },
    ];

    let positions = HashMap::new();
    let overrides = HashMap::new();

    let cards = build_series_card_view_models(&items, &positions, &overrides);

    // CRITICAL: Must be exactly ONE card, NOT three cards!
    assert_eq!(
        cards.len(),
        1,
        "Expected exactly 1 SeriesCardViewModel for '12 12 12', found {}",
        cards.len()
    );
    let card = &cards[0];
    assert_eq!(card.title, "12 12 12");
    assert_eq!(card.season_count, 1);
    assert_eq!(card.episode_count, 3);
}

#[test]
fn test_fight_club_multi_version_grouping() {
    let now = Utc::now();
    let items = vec![
        MediaItem {
            id: "fc_1080p".into(),
            fingerprint: "fp_fc_1080p".into(),
            file_path: "C:/Media/Movies/Fight Club (1999)/Fight Club (1999) 1080p.mp4".into(),
            title: "Fight Club (1999)".into(),
            duration: 8340.0,
            size_bytes: 8_200_000_000,
            width: Some(1920),
            height: Some(1080),
            is_hdr: false,
            video_codec: Some("h264".into()),
            audio_codec: Some("aac".into()),
            series_id: None,
            season_number: None,
            episode_number: None,
            is_missing: false,
            created_at: now,
            updated_at: now,
        },
        MediaItem {
            id: "fc_4k".into(),
            fingerprint: "fp_fc_4k".into(),
            file_path: "C:/Media/Movies/Fight Club (1999)/Fight Club (1999) 2160p UHD.mkv".into(),
            title: "Fight Club (1999)".into(),
            duration: 8340.0,
            size_bytes: 24_500_000_000,
            width: Some(3840),
            height: Some(2160),
            is_hdr: true,
            video_codec: Some("hevc".into()),
            audio_codec: Some("dts-hd".into()),
            series_id: None,
            season_number: None,
            episode_number: None,
            is_missing: false,
            created_at: now,
            updated_at: now,
        },
    ];

    let positions = HashMap::new();
    let overrides = HashMap::new();

    let movie_cards = build_movie_card_view_models(&items, &positions, &overrides);

    // CRITICAL: Exactly ONE movie card with 2 versions badge, default = 4K (best resolution)
    assert_eq!(
        movie_cards.len(),
        1,
        "Expected 1 MovieCardViewModel for Fight Club, found {}",
        movie_cards.len()
    );
    let card = &movie_cards[0];
    assert!(card.display_title.contains("Fight Club"));
    assert_eq!(card.year, Some(1999));
    assert_eq!(card.versions.len(), 2);
    // Best resolution must be primary
    assert_eq!(card.height, Some(2160));
    assert!(card.is_hdr);
}

#[test]
fn test_unidentified_low_confidence_titles() {
    assert!(is_unidentified_title(
        "D90ddb61-0e83-414d-b94f-0fa0b86a3fb9"
    ));
    assert!(is_unidentified_title("Ó ]"));
    assert!(is_unidentified_title("---..---"));
    assert!(!is_unidentified_title("Fight Club"));
    assert!(!is_unidentified_title("The Dark Knight"));
}

#[test]
fn test_episode_gap_detection_e05_missing() {
    let now = Utc::now();
    // 8 episodes total, but episode 5 is omitted
    let mut items = Vec::new();
    for ep in 1..=8 {
        if ep == 5 {
            continue; // Gap!
        }
        items.push(MediaItem {
            id: format!("ep_{}", ep),
            fingerprint: format!("fp_{}", ep),
            file_path: format!("C:/Shows/Alpha/Season 1/Alpha.S01E{:02}.mkv", ep),
            title: format!("Alpha Episode {}", ep),
            duration: 3540.0,
            size_bytes: 1_000_000_000,
            width: Some(1920),
            height: Some(1080),
            is_hdr: false,
            video_codec: Some("h264".into()),
            audio_codec: Some("aac".into()),
            series_id: Some("Alpha".into()),
            season_number: Some(1),
            episode_number: Some(ep),
            is_missing: ep == 8, // Episode 8 file missing on disk
            created_at: now,
            updated_at: now,
        });
    }

    let positions = HashMap::new();
    let episodes = build_series_episodes_with_gaps(&items, 1, &positions);

    // Must have 8 rows: 7 real + 1 gap row for E05
    assert_eq!(episodes.len(), 8);
    let ep5 = &episodes[4]; // 0-indexed, 5th row is E05
    assert_eq!(ep5.episode_number, 5);
    assert!(ep5.is_missing_gap);
    assert_eq!(ep5.title, "E05 missing");

    let ep8 = &episodes[7];
    assert_eq!(ep8.episode_number, 8);
    assert!(!ep8.is_missing_gap);
    assert!(ep8.is_missing_file);
}

#[test]
fn test_deterministic_letter_avatar_palette() {
    let c1 = letter_avatar_color("Fight Club");
    let c2 = letter_avatar_color("Fight Club");
    let c3 = letter_avatar_color("Inception");

    assert_eq!(c1, c2, "Same title must yield identical color");
    // Colors must be non-zero alpha
    assert!(c1.a() > 0);
    assert!(c3.a() > 0);
}
