use std::path::Path;
use std::thread::sleep;
use std::time::Duration;
use valor_player::{PlaybackStatus, PlayerEngine};

#[test]
fn test_mpv_spike_playback() {
    let test_file = r"C:\Users\Admin\Downloads\MobLand.2025.S02E09.Nervous.Breakdown.2160p.ATV.WEB-DL.DUAL.DD5.1.H.265-Spidey.mkv";
    if !Path::new(test_file).exists() {
        eprintln!(
            "Test file not found, skipping integration test: {}",
            test_file
        );
        return;
    }

    // Initialize player engine (headless for test verification)
    let player = PlayerEngine::new(None).expect("Failed to initialize PlayerEngine");

    // Load HEVC 4K MKV
    let token = player
        .load_file(test_file, "test_fingerprint", 0.0)
        .expect("Failed to load MKV file");
    assert!(token > 0);

    // Let mpv probe and start playback
    sleep(Duration::from_millis(600));

    let tick = player.update_tick();
    assert_eq!(tick.status, PlaybackStatus::Playing);
    assert!(
        tick.duration_secs > 0.0,
        "Expected duration > 0, got {}",
        tick.duration_secs
    );
    assert!(tick.width > 0, "Expected width > 0, got {}", tick.width);
    assert!(tick.height > 0, "Expected height > 0, got {}", tick.height);

    // Test pause
    player.pause().expect("Failed to pause");
    sleep(Duration::from_millis(100));
    let tick_paused = player.update_tick();
    assert_eq!(tick_paused.status, PlaybackStatus::Paused);

    // Test resume
    player.play().expect("Failed to resume");
    sleep(Duration::from_millis(100));
    let tick_resumed = player.update_tick();
    assert_eq!(tick_resumed.status, PlaybackStatus::Playing);

    // Test seek
    player.seek(15.0).expect("Failed to seek");
    sleep(Duration::from_millis(200));
    let tick_seek = player.update_tick();
    assert!(
        tick_seek.position_secs >= 14.0,
        "Seek position unexpected: {}",
        tick_seek.position_secs
    );

    // Test tracks
    let tracks = player.get_tracks().expect("Failed to get tracks");
    assert!(!tracks.is_empty(), "Expected tracks to be discovered");
    let audio_tracks: Vec<_> = tracks.iter().filter(|t| t.track_type == "audio").collect();
    assert!(
        !audio_tracks.is_empty(),
        "Expected at least one audio track"
    );

    // Test snapshot
    let snapshot_file = "test_snapshot.jpg";
    let _ = player.take_snapshot(snapshot_file);
    sleep(Duration::from_millis(300));
    if Path::new(snapshot_file).exists() {
        let _ = std::fs::remove_file(snapshot_file);
    }

    // Query valid tone-mapping options against pinned libmpv
    let candidate_algos = [
        "auto", "clip", "mobius", "reinhard", "hable", "bt.2390", "bt.2446a", "spline", "linear",
        "gamma",
    ];
    let mut valid_algos = Vec::new();
    for algo in candidate_algos {
        if player.set_tone_mapping(algo).is_ok() {
            valid_algos.push(algo);
        }
    }
    println!("PINNED_LIBMPV_VALID_TONE_MAPPING: {:?}", valid_algos);
}
