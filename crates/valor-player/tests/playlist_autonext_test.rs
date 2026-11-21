use std::path::Path;
use valor_player::collection::{CollectionItem, PlaylistCollection, RepeatMode};
use valor_player::PlayerEngine;

#[test]
fn test_playlist_3_item_autonext_and_finish_to_home() {
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

    if !clip_01.exists() || !clip_02.exists() || !clip_03.exists() {
        eprintln!("Test clips missing, skipping playlist autonext integration test");
        return;
    }

    // 1. Initialize PlayerEngine
    let player = PlayerEngine::new(None).expect("Failed to initialize PlayerEngine");

    // 2. Initialize 3-item PlaylistCollection in unsorted order
    let mut playlist = PlaylistCollection::new("Test Series Season 1");
    playlist.enqueue(CollectionItem {
        id: "clip_3".into(),
        path: clip_03.to_str().unwrap().into(),
        title: "Episode 03 - Countdown".into(),
        duration_secs: 2.0,
        fingerprint: "fp_clip_3".into(),
    });
    playlist.enqueue(CollectionItem {
        id: "clip_1".into(),
        path: clip_01.to_str().unwrap().into(),
        title: "Episode 01 - Multitrack".into(),
        duration_secs: 2.0,
        fingerprint: "fp_clip_1".into(),
    });
    playlist.enqueue(CollectionItem {
        id: "clip_2".into(),
        path: clip_02.to_str().unwrap().into(),
        title: "Episode 02 - SMPTE".into(),
        duration_secs: 2.0,
        fingerprint: "fp_clip_2".into(),
    });

    assert_eq!(playlist.len(), 3);

    // 3. Natural Sort the collection
    playlist.natural_sort();
    assert_eq!(playlist.items[0].title, "Episode 01 - Multitrack");
    assert_eq!(playlist.items[1].title, "Episode 02 - SMPTE");
    assert_eq!(playlist.items[2].title, "Episode 03 - Countdown");

    // Start playback from the first item after sorting
    playlist.current_index = 0;

    // Repeat mode Off initially
    playlist.set_repeat(RepeatMode::Off);

    // 4. Start item 0 (Episode 01)
    let item_0 = &playlist.items[0];
    let token_0 = player
        .load_file(&item_0.path, &item_0.fingerprint, 0.0)
        .expect("Failed to load item 0");
    assert_eq!(token_0, 2); // Initial token was 1, fetch_add gives 2

    // 5. Simulate transition to next item (Auto-next item 0 -> 1)
    let next_idx_1 = playlist.next_index();
    assert_eq!(next_idx_1, Some(1));
    let item_1 = &playlist.items[1];
    let token_1 = player
        .load_file(&item_1.path, &item_1.fingerprint, 0.0)
        .expect("Failed to load item 1");
    assert_eq!(token_1, 3);

    // 6. Simulate transition to next item (Auto-next item 1 -> 2)
    let next_idx_2 = playlist.next_index();
    assert_eq!(next_idx_2, Some(2));
    let item_2 = &playlist.items[2];
    let token_2 = player
        .load_file(&item_2.path, &item_2.fingerprint, 0.0)
        .expect("Failed to load item 2");
    assert_eq!(token_2, 4);

    // 7. Last item completes: Auto-next should detect end of playlist
    let next_idx_3 = playlist.next_index();
    assert_eq!(next_idx_3, None); // Playlist ended

    // In the application coordinator: when next_idx is None, transition to Finished / Home placeholder
    let is_playlist_finished = next_idx_3.is_none();
    assert!(is_playlist_finished);

    println!(
        "Integration Test: Successfully navigated 3-item synthetic playlist to completion (Home)."
    );
}
