use libmpv2::Mpv;

#[test]
fn test_v10_mpv_property_names_and_capabilities() {
    println!("================================================================================");
    println!("V10: LIBMPV PINNED DLL PROPERTY NAMES VERIFICATION");
    println!("================================================================================");

    let mpv = Mpv::with_initializer(|init| {
        init.set_property("vo", "null")?;
        init.set_property("ao", "null")?;
        init.set_property("hwdec", "no")?;
        init.set_property("idle", true)?;
        Ok(())
    })
    .expect("mpv init failed");

    let clip_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("tests/fixtures/media/clip_01_multitrack.mkv");
    assert!(clip_path.exists());

    let clip_str = clip_path.to_string_lossy().to_string();
    let _ = mpv.command("loadfile", &[&clip_str, "replace"]);
    std::thread::sleep(std::time::Duration::from_millis(50));

    // 1. Frame drop properties
    let drop_frame_count = mpv.get_property::<i64>("drop-frame-count");
    let vo_drop_frame_count = mpv.get_property::<i64>("vo-drop-frame-count");
    let frame_drop_count = mpv.get_property::<i64>("frame-drop-count");

    println!(
        "  • Property 'drop-frame-count' (active playback):    {:?}",
        drop_frame_count
    );
    println!(
        "  • Property 'vo-drop-frame-count' (active playback):  {:?}",
        vo_drop_frame_count
    );
    println!(
        "  • Property 'frame-drop-count' (active playback):     {:?}",
        frame_drop_count
    );

    // In pinned libmpv (v2.0):
    // 'frame-drop-count' is the verified active property that returns Ok(0) during playback!
    // 'drop-frame-count' and 'vo-drop-frame-count' return Err(Raw(-8)) (MPV_ERROR_PROPERTY_UNAVAILABLE) without an active hardware render VO context.
    println!("  • Note on mpv error codes: -8 is MPV_ERROR_PROPERTY_UNAVAILABLE, -10 is MPV_ERROR_PROPERTY_NOT_FOUND");
    assert_eq!(
        frame_drop_count,
        Ok(0),
        "'frame-drop-count' must return Ok(0)"
    );
    assert_eq!(
        drop_frame_count,
        Err(libmpv2::Error::Raw(-8)),
        "'drop-frame-count' returns PROPERTY_UNAVAILABLE (-8)"
    );
    assert_eq!(
        vo_drop_frame_count,
        Err(libmpv2::Error::Raw(-8)),
        "'vo-drop-frame-count' returns PROPERTY_UNAVAILABLE (-8)"
    );

    // 2. HDR & Tone-mapping properties
    let tone_mapping = mpv.get_property::<String>("tone-mapping");
    let target_colorspace_hint = mpv.get_property::<bool>("target-colorspace-hint");

    println!("  • Current tone-mapping:           {:?}", tone_mapping);
    println!(
        "  • Target colorspace hint:         {:?}",
        target_colorspace_hint
    );
    assert!(tone_mapping.is_ok());

    // 3. Audio Boost property: volume and volume-max
    let volume = mpv.get_property::<f64>("volume");
    let volume_max = mpv.get_property::<f64>("volume-max");
    println!("  • Current volume:                 {:?}", volume);
    println!("  • Current volume-max:             {:?}", volume_max);
    assert!(volume.is_ok());
    assert!(volume_max.is_ok());

    println!("================================================================================");
}
