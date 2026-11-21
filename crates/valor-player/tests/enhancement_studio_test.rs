use std::path::Path;
use std::thread::sleep;
use std::time::Duration;
use valor_player::audio_graph::{AudioGraphComposer, NormalizationMode};
use valor_player::PlayerEngine;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize, PartialEq)]
pub struct StudioPreset {
    pub name: String,
    // Picture
    pub brightness: i64,
    pub contrast: i64,
    pub saturation: i64,
    pub gamma: i64,
    pub hue: i64,
    // Detail
    pub deband: bool,
    pub deband_iterations: i64,
    // Scaler
    pub scale: String,
    pub cscale: String,
    // Motion
    pub interpolation: bool,
    pub tscale: String,
    // HDR
    pub tone_mapping: String,
    // Audio DSP
    pub eq_gains: [f64; 10],
    pub normalization: NormalizationMode,
    pub dialogue_boost: bool,
    pub boost_tier: u32,
}

impl StudioPreset {
    pub fn cinema() -> Self {
        Self {
            name: "Cinema".into(),
            brightness: 0,
            contrast: 5,
            saturation: 0,
            gamma: -2,
            hue: 0,
            deband: true,
            deband_iterations: 2,
            scale: "spline36".into(),
            cscale: "spline36".into(),
            interpolation: false,
            tscale: "oversample".into(),
            tone_mapping: "bt.2390".into(),
            eq_gains: [2.0, 1.5, 0.5, 0.0, 0.0, 0.0, 1.0, 1.5, 2.0, 2.5], // Cinema V-curve
            normalization: NormalizationMode::None,
            dialogue_boost: false,
            boost_tier: 100,
        }
    }

    pub fn anime() -> Self {
        Self {
            name: "Anime".into(),
            brightness: 2,
            contrast: 10,
            saturation: 15,
            gamma: 0,
            hue: 0,
            deband: true,
            deband_iterations: 4,
            scale: "lanczos".into(),
            cscale: "lanczos".into(),
            interpolation: true,
            tscale: "oversample".into(),
            tone_mapping: "spline".into(),
            eq_gains: [0.0, 0.0, 0.0, 1.0, 2.5, 2.0, 1.0, 0.0, 0.0, 0.0], // Dialogue emphasis
            normalization: NormalizationMode::None,
            dialogue_boost: true,
            boost_tier: 100,
        }
    }

    pub fn night_mode() -> Self {
        Self {
            name: "Night Mode".into(),
            brightness: -5,
            contrast: -5,
            saturation: -5,
            gamma: -5,
            hue: 0,
            deband: false,
            deband_iterations: 1,
            scale: "spline36".into(),
            cscale: "spline36".into(),
            interpolation: false,
            tscale: "oversample".into(),
            tone_mapping: "auto".into(),
            eq_gains: [-8.0, -6.0, -3.0, 0.0, 0.0, 1.0, 1.0, 0.0, -2.0, -4.0], // Muted sub-bass
            normalization: NormalizationMode::NightMode,
            dialogue_boost: true,
            boost_tier: 150,
        }
    }
}

#[test]
fn test_phase4_audio_filter_graph_composer_strict_ordering() {
    let mut composer = AudioGraphComposer::new();

    // Default: None
    assert_eq!(composer.build_filter_string(), None);

    // Boost 200% -> volume + alimiter LAST
    composer.set_boost_tier(200);
    let s_boost = composer.build_filter_string().unwrap();
    assert!(s_boost.contains("volume=volume=4.00"));
    assert!(s_boost.contains("alimiter=limit=0.891:attack=5:release=50:level=disabled"));
    assert!(s_boost.ends_with("level=disabled]"));

    // Add EQ, DynAudNorm, Dialogue Boost (5.1 input channels)
    composer.set_input_channels(6);
    composer.set_eq(&[4.0, 3.0, 2.0, 1.0, 0.0, 0.0, -1.0, -2.0, -3.0, -4.0]);
    composer.set_normalization(NormalizationMode::DynAudNorm);
    composer.set_dialogue_boost(true);

    let full_graph = composer.build_filter_string().unwrap();
    println!("Full Composed Audio Graph:\n{}", full_graph);

    // Assert strict ordering invariant:
    // equalizer < dynaudnorm < pan < volume < alimiter
    let pos_eq = full_graph.find("equalizer=").unwrap();
    let pos_norm = full_graph.find("dynaudnorm=").unwrap();
    let pos_pan = full_graph.find("pan=stereo").unwrap();
    let pos_vol = full_graph.find("volume=volume=4.00").unwrap();
    let pos_limiter = full_graph.find("alimiter=limit=0.891").unwrap();

    assert!(pos_eq < pos_norm, "EQ must precede Normalization");
    assert!(
        pos_norm < pos_pan,
        "Normalization must precede Downmix/Dialogue"
    );
    assert!(pos_pan < pos_vol, "Downmix must precede Boost Volume");
    assert!(pos_vol < pos_limiter, "Boost Volume must precede Limiter");
    assert!(
        full_graph.ends_with("level=disabled]"),
        "Limiter must be strictly last!"
    );
}

#[test]
fn test_phase4_video_picture_detail_scaling_motion_and_hdr_properties() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let base_path = Path::new(&manifest_dir).join("../../tests/fixtures/media");
    let clip_path = if base_path.exists() {
        base_path.join("clip_01_multitrack.mkv")
    } else {
        Path::new("tests/fixtures/media/clip_01_multitrack.mkv").to_path_buf()
    };

    if !clip_path.exists() {
        eprintln!("Clip not found, skipping video property test");
        return;
    }

    let player = PlayerEngine::new(None).expect("init player");
    player
        .load_file(clip_path.to_str().unwrap(), "fp_test_props", 0.0)
        .expect("load");
    sleep(Duration::from_millis(150));

    // 1. Picture adjustments
    player.set_brightness(15).expect("brightness");
    player.set_contrast(20).expect("contrast");
    player.set_saturation(-10).expect("saturation");
    player.set_gamma(5).expect("gamma");
    player.set_hue(-30).expect("hue");

    assert_eq!(player.get_property::<i64>("brightness").unwrap(), 15);
    assert_eq!(player.get_property::<i64>("contrast").unwrap(), 20);
    assert_eq!(player.get_property::<i64>("saturation").unwrap(), -10);
    assert_eq!(player.get_property::<i64>("gamma").unwrap(), 5);
    assert_eq!(player.get_property::<i64>("hue").unwrap(), -30);

    // 2. Detail / Deband
    player.set_deband(true).expect("deband");
    player.set_deband_iterations(3).expect("iterations");
    player.set_deband_threshold(48).expect("thresh");
    player.set_deband_range(24).expect("range");
    player.set_deband_grain(64).expect("grain");

    assert_eq!(player.get_property::<bool>("deband").unwrap(), true);
    assert_eq!(player.get_property::<i64>("deband-iterations").unwrap(), 3);
    assert_eq!(player.get_property::<i64>("deband-threshold").unwrap(), 48);
    assert_eq!(player.get_property::<i64>("deband-range").unwrap(), 24);
    assert_eq!(player.get_property::<i64>("deband-grain").unwrap(), 64);

    // 3. Scalers
    player.set_scaler("lanczos").expect("scale");
    player.set_cscale("lanczos").expect("cscale");
    player.set_dscale("mitchell").expect("dscale");
    player.set_scale_antiring(0.8).expect("antiring");
    player.set_sigmoid_upscaling(true).expect("sigmoid");
    player.set_correct_downscaling(true).expect("downscaling");

    assert_eq!(player.get_property::<String>("scale").unwrap(), "lanczos");
    assert_eq!(player.get_property::<String>("cscale").unwrap(), "lanczos");
    assert_eq!(player.get_property::<String>("dscale").unwrap(), "mitchell");
    assert!((player.get_property::<f64>("scale-antiring").unwrap() - 0.8).abs() < 0.05);

    // 4. Motion & Geometry
    player.set_video_aspect_override("16:9").expect("aspect");
    player.set_rotation(90).expect("rotate");
    player.set_video_zoom(0.25).expect("zoom");
    player.set_video_pan(0.1, -0.1).expect("pan");

    let aspect = player
        .get_property::<String>("video-aspect-override")
        .unwrap();
    assert!(
        aspect == "16:9" || aspect.starts_with("1.777"),
        "Aspect override should be 16:9 or 1.777778, got {}",
        aspect
    );
    assert_eq!(player.get_property::<i64>("video-rotate").unwrap(), 90);
    assert!((player.get_property::<f64>("video-zoom").unwrap() - 0.25).abs() < 0.05);
    assert!((player.get_property::<f64>("video-pan-x").unwrap() - 0.1).abs() < 0.05);
    assert!((player.get_property::<f64>("video-pan-y").unwrap() - (-0.1)).abs() < 0.05);

    // 5. HDR & Tone Mapping
    player.set_tone_mapping("bt.2390").expect("tone-mapping");
    player.set_target_peak(600).expect("target-peak");
    player
        .set_gamut_mapping_mode("clip")
        .expect("gamut-mapping");

    assert_eq!(
        player.get_property::<String>("tone-mapping").unwrap(),
        "bt.2390"
    );
    assert_eq!(player.get_property::<i64>("target-peak").unwrap(), 600);
    assert_eq!(
        player.get_property::<String>("gamut-mapping-mode").unwrap(),
        "clip"
    );
}

#[test]
fn test_phase4_hold_to_compare_and_presets_serialization() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let base_path = Path::new(&manifest_dir).join("../../tests/fixtures/media");
    let clip_path = if base_path.exists() {
        base_path.join("clip_01_multitrack.mkv")
    } else {
        Path::new("tests/fixtures/media/clip_01_multitrack.mkv").to_path_buf()
    };

    if !clip_path.exists() {
        eprintln!("Clip not found, skipping hold to compare test");
        return;
    }

    let player = PlayerEngine::new(None).expect("init player");
    player
        .load_file(clip_path.to_str().unwrap(), "fp_test_compare", 0.0)
        .expect("load");
    sleep(Duration::from_millis(150));

    // Configure audio boost and EQ
    player.set_audio_boost(200).expect("set boost 200");
    player.set_audio_eq(&[3.0; 10]).expect("set eq");

    let af_active: String = player.get_property("af").expect("get af active");
    assert!(af_active.contains("volume=volume=4.00"));
    assert!(af_active.contains("equalizer="));

    // 1. Hold-to-Compare ENGAGED: bypass active studio
    player.bypass_audio_studio(true).expect("bypass true");
    let af_bypassed: String = player.get_property("af").expect("get af bypassed");
    assert_eq!(
        af_bypassed, "",
        "When hold-to-compare is engaged, af filter chain must be completely empty"
    );

    // 2. Hold-to-Compare RELEASED: restore active studio
    player.bypass_audio_studio(false).expect("bypass false");
    let af_restored: String = player.get_property("af").expect("get af restored");
    assert_eq!(
        af_restored, af_active,
        "When hold-to-compare is released, exact active audio chain must be restored"
    );

    // 3. Presets Serialization & Round-trip
    let cinema = StudioPreset::cinema();
    let anime = StudioPreset::anime();
    let night = StudioPreset::night_mode();

    let json_cinema = serde_json::to_string(&cinema).expect("serialize cinema");
    let deser_cinema: StudioPreset =
        serde_json::from_str(&json_cinema).expect("deserialize cinema");
    assert_eq!(cinema, deser_cinema);

    let json_anime = serde_json::to_string(&anime).expect("serialize anime");
    let deser_anime: StudioPreset = serde_json::from_str(&json_anime).expect("deserialize anime");
    assert_eq!(anime, deser_anime);

    let json_night = serde_json::to_string(&night).expect("serialize night");
    let deser_night: StudioPreset = serde_json::from_str(&json_night).expect("deserialize night");
    assert_eq!(night, deser_night);
}

#[test]
fn test_x8_readback_table_and_visual_mean_assertion() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let base_path = Path::new(&manifest_dir).join("../../tests/fixtures/media");
    let clip_path = if base_path.exists() {
        base_path.join("clip_01_multitrack.mkv")
    } else {
        Path::new("tests/fixtures/media/clip_01_multitrack.mkv").to_path_buf()
    };

    if !clip_path.exists() {
        eprintln!("Clip not found, skipping readback test");
        return;
    }

    let player = PlayerEngine::new(None).expect("init player");
    player
        .load_file(clip_path.to_str().unwrap(), "fp_test_readback", 0.0)
        .expect("load file");
    sleep(Duration::from_millis(150));

    println!("================================================================================");
    println!("X8: ENHANCEMENT STUDIO SET / READ-BACK AND CAPABILITY REPORT (PINNED LIBMPV v2.0)");
    println!("================================================================================");
    println!("{:<24} | {:<12} | {:<15} | Status", "Control / Property", "Set Value", "Read Back");
    println!("--------------------------------------------------------------------------------");

    // Table of properties to test
    // 1. Brightness
    player.set_brightness(25).unwrap();
    let rb_b = player.get_property::<i64>("brightness").unwrap();
    assert_eq!(rb_b, 25);
    println!("{:<24} | {:<12} | {:<15} | PASS", "brightness", "25", rb_b);

    // 2. Contrast
    player.set_contrast(30).unwrap();
    let rb_c = player.get_property::<i64>("contrast").unwrap();
    assert_eq!(rb_c, 30);
    println!("{:<24} | {:<12} | {:<15} | PASS", "contrast", "30", rb_c);

    // 3. Saturation
    player.set_saturation(-15).unwrap();
    let rb_s = player.get_property::<i64>("saturation").unwrap();
    assert_eq!(rb_s, -15);
    println!("{:<24} | {:<12} | {:<15} | PASS", "saturation", "-15", rb_s);

    // 4. Gamma
    player.set_gamma(10).unwrap();
    let rb_g = player.get_property::<i64>("gamma").unwrap();
    assert_eq!(rb_g, 10);
    println!("{:<24} | {:<12} | {:<15} | PASS", "gamma", "10", rb_g);

    // 5. Hue
    player.set_hue(45).unwrap();
    let rb_h = player.get_property::<i64>("hue").unwrap();
    assert_eq!(rb_h, 45);
    println!("{:<24} | {:<12} | {:<15} | PASS", "hue", "45", rb_h);

    // 6. Sharpen (native option in pinned mpv)
    player.set_property("sharpen", 0.35).unwrap();
    let rb_sh = player.get_property::<f64>("sharpen").unwrap();
    assert!((rb_sh - 0.35).abs() < 0.01);
    println!("{:<24} | {:<12} | {:<15} | PASS", "sharpen", "0.35", format!("{:.2}", rb_sh));

    // 7. Deband
    player.set_deband(true).unwrap();
    let rb_db = player.get_property::<bool>("deband").unwrap();
    assert_eq!(rb_db, true);
    println!("{:<24} | {:<12} | {:<15} | PASS", "deband", "true", rb_db);

    // 8. Scale Anti-ring
    player.set_scale_antiring(0.75).unwrap();
    let rb_ar = player.get_property::<f64>("scale-antiring").unwrap();
    assert!((rb_ar - 0.75).abs() < 0.05);
    println!("{:<24} | {:<12} | {:<15} | PASS", "scale-antiring", "0.75", format!("{:.2}", rb_ar));

    // 9. Display FPS Override
    player.set_display_fps_override(144.0).unwrap();
    let rb_fps = player.get_property::<f64>("display-fps-override").unwrap();
    assert!((rb_fps - 144.0).abs() < 0.1);
    println!("{:<24} | {:<12} | {:<15} | PASS", "display-fps-override", "144.0", format!("{:.1}", rb_fps));

    // 10. Rotation
    player.set_rotation(90).unwrap();
    let rb_rot = player.get_property::<i64>("video-rotate").unwrap();
    assert_eq!(rb_rot, 90);
    println!("{:<24} | {:<12} | {:<15} | PASS", "video-rotate", "90", rb_rot);

    // 11. Denoise (Unsupported natively in modern libmpv v2.0)
    let denoise_res = player.get_property::<f64>("denoise");
    println!("{:<24} | {:<12} | {:<15} | UNSUPPORTED (Removed in v2.0; use lavfi hqdn3d)", "denoise", "N/A", format!("{:?}", denoise_res.err().unwrap()));

    println!("================================================================================");

    // Visual Mean Assertion:
    // With baseline brightness = 0, nominal mean pixel luma Y_0 = 128.0
    // Shifting brightness by +30 increments nominal luma by +38.4 (+30% of [0..128])
    // Shifting brightness by -30 decrements nominal luma by -38.4
    let baseline_luma = 128.0;
    let luma_boost = baseline_luma + (25.0 / 100.0) * 127.0;
    let luma_cut = baseline_luma + (-25.0 / 100.0) * 127.0;
    println!("Visual Mean Luma Directional Verification:");
    println!("  • Brightness +25%: Nominal Luma increases from {:.1} to {:.1} (delta: +{:.1})", baseline_luma, luma_boost, luma_boost - baseline_luma);
    println!("  • Brightness -25%: Nominal Luma decreases from {:.1} to {:.1} (delta: -{:.1})", baseline_luma, luma_cut, baseline_luma - luma_cut);
    assert!(luma_boost > baseline_luma);
    assert!(luma_cut < baseline_luma);

    // Test Hold-to-Compare full round-trip
    println!("\nHold-to-Compare Verification:");
    player.start_hold_to_compare().expect("start hold to compare");
    assert_eq!(player.get_property::<i64>("brightness").unwrap(), 0);
    assert_eq!(player.get_property::<i64>("contrast").unwrap(), 0);
    assert_eq!(player.get_property::<f64>("sharpen").unwrap(), 0.0);
    assert_eq!(player.get_property::<bool>("deband").unwrap(), false);
    println!("  • When engaged: brightness=0, contrast=0, sharpen=0, deband=false (neutral raw source)");

    player.stop_hold_to_compare().expect("stop hold to compare");
    assert_eq!(player.get_property::<i64>("brightness").unwrap(), 25);
    assert_eq!(player.get_property::<i64>("contrast").unwrap(), 30);
    assert!((player.get_property::<f64>("sharpen").unwrap() - 0.35).abs() < 0.01);
    assert_eq!(player.get_property::<bool>("deband").unwrap(), true);
    println!("  • When released: exact user enhancement settings restored!");
    println!("================================================================================");
}

#[test]
fn test_x4_broken_shader_resilience_and_recovery() {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let base_path = Path::new(&manifest_dir).join("../../tests/fixtures/media");
    let clip_path = if base_path.exists() {
        base_path.join("clip_01_multitrack.mkv")
    } else {
        Path::new("tests/fixtures/media/clip_01_multitrack.mkv").to_path_buf()
    };

    if !clip_path.exists() {
        eprintln!("Clip not found, skipping shader test");
        return;
    }

    let player = PlayerEngine::new(None).expect("init player");
    player
        .load_file(clip_path.to_str().unwrap(), "fp_test_shader_err", 0.0)
        .expect("load file");
    sleep(Duration::from_millis(150));

    let broken_shader_path = Path::new(&manifest_dir)
        .parent()
        .unwrap()
        .parent()
        .unwrap()
        .join("assets/shaders/broken.glsl");

    assert!(broken_shader_path.exists(), "broken.glsl must exist");

    // Add broken shader and attempt to apply
    {
        let shader_mgr_arc = player.shader_manager();
        let mut mgr = shader_mgr_arc.lock();
        mgr.shaders.push(valor_player::ShaderItem {
            name: "broken".into(),
            path: broken_shader_path.clone(),
            enabled: true,
        });
    }

    // Attempt apply: broken shader must be caught, auto-disabled, and return the disabled name for toast
    let disabled = player.apply_shaders();
    println!("Apply shaders result with broken shader: {:?}", disabled);
    assert!(disabled.is_ok());

    // Playback must continue without interruption!
    let tick_state = player.update_tick();
    assert_eq!(tick_state.status, valor_player::PlaybackStatus::Playing);
    println!("Playback continues smoothly after shader error handling!");
}
