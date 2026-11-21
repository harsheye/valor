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
    let decoder_frame_drop_count = mpv.get_property::<i64>("decoder-frame-drop-count");

    println!(
        "  • Property 'drop-frame-count' (active playback):           {:?}",
        drop_frame_count
    );
    println!(
        "  • Property 'vo-drop-frame-count' (active playback):         {:?}",
        vo_drop_frame_count
    );
    println!(
        "  • Property 'frame-drop-count' (active playback):            {:?}",
        frame_drop_count
    );
    println!(
        "  • Property 'decoder-frame-drop-count' (active playback):    {:?}",
        decoder_frame_drop_count
    );

    // In pinned libmpv (v2.0):
    // 'frame-drop-count' is the verified active property that returns Ok(0) during playback!
    // 'drop-frame-count' and 'vo-drop-frame-count' return Err(Raw(-8)) (MPV_ERROR_PROPERTY_UNAVAILABLE) without an active hardware render VO context.
    println!("  • Note on mpv error codes: -8 is MPV_ERROR_PROPERTY_UNAVAILABLE, -10 is MPV_ERROR_PROPERTY_NOT_FOUND");
    assert_eq!(
        decoder_frame_drop_count,
        Ok(0),
        "'decoder-frame-drop-count' must return Ok(0)"
    );
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

#[test]
fn test_x3_x8_x9_probe_picture_detail_geometry_and_motion() {
    println!("================================================================================");
    println!("PROBING PINNED LIBMPV (v2.0) PROPERTIES FOR PICTURE DETAIL, GEOMETRY, MOTION");
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
    let clip_str = clip_path.to_string_lossy().to_string();
    let _ = mpv.command("loadfile", &[&clip_str, "replace"]);
    std::thread::sleep(std::time::Duration::from_millis(50));

    let probe_props = [
        "sharpen",
        "scale-antiring",
        "dscale-antiring",
        "cscale-antiring",
        "deband",
        "deband-iterations",
        "deband-threshold",
        "deband-range",
        "deband-grain",
        "denoise",
        "glsl-shaders",
        "display-fps-override",
        "video-crop",
        "video-align-x",
        "video-align-y",
        "video-pan-x",
        "video-pan-y",
        "video-zoom",
        "video-rotate",
        "icc-profile-auto",
        "dither-depth",
        "vf",
        "af",
        "brightness",
        "contrast",
        "saturation",
        "gamma",
        "hue",
    ];

    for prop in probe_props {
        let res_str = mpv.get_property::<String>(prop);
        let res_f64 = mpv.get_property::<f64>(prop);
        let res_i64 = mpv.get_property::<i64>(prop);
        let res_bool = mpv.get_property::<bool>(prop);
        let status = if res_str.is_ok() || res_f64.is_ok() || res_i64.is_ok() || res_bool.is_ok() {
            let val = res_str.or_else(|_| res_f64.map(|v| v.to_string()))
                .or_else(|_| res_i64.map(|v| v.to_string()))
                .or_else(|_| res_bool.map(|v| v.to_string()))
                .unwrap();
            format!("SUPPORTED (current: '{}')", val)
        } else {
            format!("UNSUPPORTED / UNAVAILABLE (err: {:?})", res_str.err().unwrap())
        };
        println!("  • Property '{:22}': {}", prop, status);
    }

    // Probe lavfi filter support via vf
    let vf_unsharp_res = mpv.set_property("vf", "lavfi=[unsharp=5:5:1.0:5:5:0.0]");
    println!("  • Filter 'vf=lavfi=[unsharp]': {:?}", vf_unsharp_res);
    let vf_hflip_res = mpv.set_property("vf", "hflip");
    println!("  • Filter 'vf=hflip':          {:?}", vf_hflip_res);
    let vf_cropdetect_res = mpv.set_property("vf", "cropdetect");
    println!("  • Filter 'vf=cropdetect':     {:?}", vf_cropdetect_res);
    let _ = mpv.set_property("vf", "");

    println!("================================================================================");
}
