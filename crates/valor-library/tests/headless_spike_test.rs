use libmpv2::Mpv;
use std::path::PathBuf;
use std::thread::sleep;
use std::time::Duration;

#[test]
fn test_headless_probe_and_thumbnail_spike() {
    let clip_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("tests/fixtures/media/clip_01_multitrack.mkv");
    assert!(
        clip_path.exists(),
        "Clip path does not exist: {:?}",
        clip_path
    );

    let out_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("target/spike_thumbs");
    let _ = std::fs::create_dir_all(&out_dir);

    println!("Testing mpv initializer options...");

    let mpv = Mpv::with_initializer(|init| {
        // Test vo=null
        match init.set_property("vo", "null") {
            Ok(_) => println!("vo=null accepted!"),
            Err(e) => println!("vo=null failed: {:?}", e),
        }
        match init.set_property("ao", "null") {
            Ok(_) => println!("ao=null accepted!"),
            Err(e) => println!("ao=null failed: {:?}", e),
        }
        Ok(())
    })
    .expect("Failed to initialize mpv with vo=null");

    println!("Initialized mpv successfully!");
    if let Ok(vo_list) = mpv.get_property::<String>("vo") {
        println!("Current vo: {}", vo_list);
    }

    mpv.command("loadfile", &[clip_path.to_str().unwrap(), "replace"])
        .expect("Failed to load file");

    // Wait for frame to be processed
    let mut loaded = false;
    for _ in 0..100 {
        sleep(Duration::from_millis(20));
        let event = mpv.wait_event(0.0);
        if let Some(ev) = event {
            println!("mpv event: {:?}", ev);
        }
        // Check if track-list can be read
        if let Ok(tracks_json) = mpv.get_property::<String>("track-list") {
            println!("Headless track-list read: {} bytes", tracks_json.len());
            loaded = true;
            break;
        }
    }

    assert!(loaded, "Failed to read track-list from headless mpv");

    let thumb_file = out_dir.join("test_thumb.webp");
    let thumb_str = thumb_file.to_str().unwrap().replace('\\', "/");
    match mpv.command("screenshot-to-file", &[thumb_str.as_str(), "video"]) {
        Ok(_) => println!("screenshot-to-file succeeded with vo=null!"),
        Err(e) => println!("screenshot-to-file failed with vo=null: {:?}", e),
    }
}
