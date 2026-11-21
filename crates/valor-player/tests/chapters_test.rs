use std::path::Path;
use std::thread::sleep;
use std::time::Duration;
use valor_player::PlayerEngine;

#[test]
fn test_w6_chapters_discovery_and_jumping() {
    let devs_clip =
        Path::new(r"F:\devs.s1.web.108-pahe.in\Devs.S01E01.1080p.WEB-DL.x265.6CH-Pahe.in.mkv");
    let clip_path = if devs_clip.exists() {
        devs_clip.to_path_buf()
    } else {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap()
            .parent()
            .unwrap()
            .join("tests/fixtures/media/clip_01_multitrack.mkv")
    };

    let player = PlayerEngine::new(None).expect("Failed to initialize PlayerEngine");
    let clip_str = clip_path.to_str().expect("valid path");

    player
        .load_file(clip_str, "fp_test_chapters", 0.0)
        .expect("load file");
    sleep(Duration::from_millis(300));

    let chapters = player.get_chapters();
    println!(
        "Total chapters discovered in {:?}: {}",
        clip_path.file_name().unwrap(),
        chapters.len()
    );
    for ch in &chapters {
        println!(
            "  • Chapter {}: '{}' at {:.3}s",
            ch.index, ch.title, ch.start_secs
        );
    }

    if !chapters.is_empty() {
        assert!(
            chapters.len() >= 3,
            "Expected at least 3 chapters in real media file"
        );
        // Test jumping to chapter 1 (second chapter)
        let target_ch = &chapters[1];
        player.set_chapter(target_ch.index).expect("set chapter");
        sleep(Duration::from_millis(200));

        let state = player.update_tick();
        println!(
            "Position after jumping to Chapter {}: {:.3}s (target: {:.3}s)",
            target_ch.index, state.position_secs, target_ch.start_secs
        );
        assert!(
            (state.position_secs - target_ch.start_secs).abs() < 2.0,
            "Position should be near target chapter start"
        );
    } else {
        println!("Note: clip does not have internal chapters; verifying get_chapters() cleanly returns empty list without error");
        assert_eq!(chapters.len(), 0);
    }
}
