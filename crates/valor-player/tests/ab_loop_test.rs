use std::path::Path;
use std::thread::sleep;
use std::time::Duration;
use valor_player::PlayerEngine;

#[test]
fn test_w6_ab_loop_setting_looping_and_clearing() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let base_path = Path::new(&manifest_dir).join("../../tests/fixtures/media");
    let clip_path = if base_path.exists() {
        base_path.join("clip_01_multitrack.mkv")
    } else {
        Path::new("tests/fixtures/media/clip_01_multitrack.mkv").to_path_buf()
    };

    if !clip_path.exists() {
        eprintln!("Clip {:?} not found, skipping AB loop test", clip_path);
        return;
    }

    let player = PlayerEngine::new(None).expect("Failed to initialize PlayerEngine");
    let clip_str = clip_path.to_str().expect("valid path");

    // 1. Load clip
    player
        .load_file(clip_str, "fp_test_ab", 0.0)
        .expect("Failed to load clip");
    sleep(Duration::from_millis(150));

    // 2. Set A-B loop: A = 0.5s, B = 1.2s
    player.set_ab_loop_a(Some(0.5)).expect("Failed to set A");
    player.set_ab_loop_b(Some(1.2)).expect("Failed to set B");

    let a_val: f64 = player.get_property("ab-loop-a").expect("get loop a");
    let b_val: f64 = player.get_property("ab-loop-b").expect("get loop b");
    assert!(
        (a_val - 0.5).abs() < 0.05,
        "Loop A should be 0.5s, got {}",
        a_val
    );
    assert!(
        (b_val - 1.2).abs() < 0.05,
        "Loop B should be 1.2s, got {}",
        b_val
    );

    // 3. Seek near end of loop (1.15s) and let it play past B
    player.seek(1.15).expect("seek exact failed");
    sleep(Duration::from_millis(250));

    // After playing past B (1.2s), position must loop back near A (0.5s), staying <= 1.2s
    let state = player.update_tick();
    println!(
        "Looping position after playing past B: {:.3}s",
        state.position_secs
    );
    assert!(
        state.position_secs >= 0.45 && state.position_secs <= 1.25,
        "Position should loop back to A (0.5s), got {}",
        state.position_secs
    );

    // 4. Clear A-B loop
    player.clear_ab_loop().expect("Failed to clear AB loop");
    let a_cleared: Result<f64, _> = player.get_property("ab-loop-a");
    let b_cleared: Result<f64, _> = player.get_property("ab-loop-b");
    assert!(
        a_cleared.is_err(),
        "ab-loop-a should be 'no' (cannot parse as f64)"
    );
    assert!(
        b_cleared.is_err(),
        "ab-loop-b should be 'no' (cannot parse as f64)"
    );
}
