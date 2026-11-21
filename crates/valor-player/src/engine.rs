use crate::audio_graph::{AudioGraphComposer, NormalizationMode};
use crate::state::{PlaybackState, PlaybackStatus};
use libmpv2::Mpv;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use thiserror::Error;
use tracing::info;
use valor_core::models::{ChapterItem, TrackItem};

#[derive(Error, Debug)]
pub enum PlayerError {
    #[error("libmpv error: {0}")]
    Mpv(#[from] libmpv2::Error),
    #[error("State error: {0}")]
    State(String),
}

pub struct PlayerEngine {
    mpv: Arc<Mutex<Mpv>>,
    state: Arc<Mutex<PlaybackState>>,
    audio_graph: Arc<Mutex<AudioGraphComposer>>,
    shader_manager: Arc<Mutex<crate::shaders::ShaderManager>>,
    saved_comparison_state: Arc<Mutex<Option<(VideoAdjustmentSnapshot, AudioGraphComposer)>>>,
    current_token: AtomicU64,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
pub struct VideoAdjustmentSnapshot {
    pub brightness: i64,
    pub contrast: i64,
    pub saturation: i64,
    pub gamma: i64,
    pub hue: i64,
    pub sharpen: f64,
    pub deband: bool,
    pub glsl_shaders: String,
}

impl Default for VideoAdjustmentSnapshot {
    fn default() -> Self {
        Self {
            brightness: 0,
            contrast: 0,
            saturation: 0,
            gamma: 0,
            hue: 0,
            sharpen: 0.0,
            deband: false,
            glsl_shaders: String::new(),
        }
    }
}

/// Computes the linear audio multiplier matching the production Valor tiers:
/// - <= 100%: 1.0x (0.0 dB, filter graph bypassed)
/// - 100%..150%: 1.0 + (boost - 100) * 0.04 -> 150% = 3.0x (+9.54 dB)
/// - 150%..200%: 3.0 + (boost - 150) * 0.02 -> 200% = 4.0x (+12.04 dB)
pub fn audio_boost_multiplier(boost_percent: u32) -> f64 {
    if boost_percent <= 100 {
        1.0
    } else if boost_percent <= 150 {
        1.0 + (boost_percent as f64 - 100.0) * 0.04
    } else if boost_percent <= 200 {
        3.0 + (boost_percent as f64 - 150.0) * 0.02
    } else {
        1.0
    }
}

impl PlayerEngine {
    /// Initializes mpv with hardware decoding, HDR tone mapping, and optional native window handle (wid).
    pub fn new(wid: Option<i64>) -> Result<Self, PlayerError> {
        Self::new_with_ao(wid, None, None, None)
    }

    /// Builds the lavfi audio boost filter string for a given tier percent.
    pub fn build_audio_boost_filter(tier_percent: u32) -> Option<String> {
        let mut composer = AudioGraphComposer::new();
        composer.set_boost_tier(tier_percent);
        composer.build_filter_string()
    }

    /// Initializes mpv with custom audio output sink (e.g. PCM file sink for testing).
    pub fn new_with_ao(
        wid: Option<i64>,
        ao: Option<&str>,
        ao_file: Option<&str>,
        initial_af: Option<&str>,
    ) -> Result<Self, PlayerError> {
        let mpv = Mpv::with_initializer(|init| {
            if let Some(ao_name) = ao {
                init.set_option("ao", ao_name)?;
                if ao_name == "pcm" {
                    init.set_option("vo", "null")?;
                }
            }
            if let Some(file_name) = ao_file {
                init.set_option("ao-pcm-file", file_name)?;
            }
            if let Some(af_str) = initial_af {
                init.set_option("af", af_str)?;
            }
            Ok(())
        })?;

        // Configure hardware decoding, presentation, and audio
        if ao.is_none() || ao != Some("pcm") {
            mpv.set_property("vo", "gpu")?;
        }
        mpv.set_property("hwdec", "auto-safe")?;
        mpv.set_property("keep-open", "yes")?;
        mpv.set_property("tone-mapping", "auto")?;
        mpv.set_property("target-prim", "auto")?;
        mpv.set_property("volume", 100.0)?;
        mpv.set_property("volume-max", 100.0)?;
        mpv.set_property("audio-client-name", "Valor")?;
        mpv.set_property("audio-pitch-correction", "yes")?;
        mpv.set_property("ytdl", "no")?; // pure local media

        if let Some(w) = wid {
            info!("Embedding mpv into native window wid: {}", w);
            mpv.set_property("wid", w)?;
        }

        let _ = mpv.set_property("msg-level", "all=v");

        let state = Arc::new(Mutex::new(PlaybackState::default()));
        let audio_graph = Arc::new(Mutex::new(AudioGraphComposer::default()));
        let mut shader_manager = crate::shaders::ShaderManager::new();
        let assets_dir = std::path::Path::new("assets/shaders");
        let _ = shader_manager.scan_directory(assets_dir);

        Ok(Self {
            mpv: Arc::new(Mutex::new(mpv)),
            state,
            audio_graph,
            shader_manager: Arc::new(Mutex::new(shader_manager)),
            saved_comparison_state: Arc::new(Mutex::new(None)),
            current_token: AtomicU64::new(1),
        })
    }

    pub fn raw_handle(&self) -> *mut libmpv2_sys::mpv_handle {
        self.mpv.lock().ctx.as_ptr()
    }

    pub fn get_property<T: libmpv2::GetData>(&self, name: &str) -> Result<T, PlayerError> {
        let mpv = self.mpv.lock();
        mpv.get_property(name).map_err(PlayerError::Mpv)
    }

    pub fn set_property<T: libmpv2::SetData>(
        &self,
        name: &str,
        data: T,
    ) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property(name, data).map_err(PlayerError::Mpv)
    }

    /// Loads a media file safely using a monotonic switch token to prevent async race conditions.
    pub fn load_file(
        &self,
        path: &str,
        fingerprint: &str,
        start_pos_secs: f64,
    ) -> Result<u64, PlayerError> {
        let token = self.current_token.fetch_add(1, Ordering::SeqCst) + 1;
        info!(
            "Loading file '{}' (token: {}, resume: {}s)",
            path, token, start_pos_secs
        );

        let mpv = self.mpv.lock();

        // Update state to Loading
        {
            let mut s = self.state.lock();
            s.status = PlaybackStatus::Loading;
            s.current_file_path = Some(path.to_string());
            s.current_fingerprint = Some(fingerprint.to_string());
            s.switch_token = token;
            s.position_secs = start_pos_secs;
        }

        mpv.command("loadfile", &[path, "replace"])?;

        if start_pos_secs > 0.0 {
            let pos_str = start_pos_secs.to_string();
            let _ = mpv.command("seek", &[&pos_str, "absolute"]);
        }

        mpv.set_property("pause", false)?;

        {
            let mut s = self.state.lock();
            s.status = PlaybackStatus::Playing;
        }

        Ok(token)
    }

    pub fn play(&self) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("pause", false)?;
        self.state.lock().status = PlaybackStatus::Playing;
        Ok(())
    }

    pub fn pause(&self) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("pause", true)?;
        self.state.lock().status = PlaybackStatus::Paused;
        Ok(())
    }

    pub fn toggle_pause(&self) -> Result<bool, PlayerError> {
        let mpv = self.mpv.lock();
        let is_paused: bool = mpv.get_property("pause").unwrap_or(false);
        let next_paused = !is_paused;
        mpv.set_property("pause", next_paused)?;
        self.state.lock().status = if next_paused {
            PlaybackStatus::Paused
        } else {
            PlaybackStatus::Playing
        };
        Ok(next_paused)
    }

    pub fn seek(&self, target_secs: f64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let target_str = target_secs.to_string();
        mpv.command("seek", &[&target_str, "absolute+exact"])?;
        self.state.lock().position_secs = target_secs;
        Ok(())
    }

    pub fn seek_relative(&self, delta_secs: f64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let delta_str = delta_secs.to_string();
        mpv.command("seek", &[&delta_str, "relative"])?;
        Ok(())
    }

    pub fn set_volume(&self, vol: f64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let mpv_vol = (vol * 100.0).clamp(0.0, 200.0);
        mpv.set_property("volume", mpv_vol)?;
        self.state.lock().volume = vol;
        Ok(())
    }

    pub fn set_mute(&self, mute: bool) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("mute", mute)?;
        self.state.lock().is_muted = mute;
        Ok(())
    }

    pub fn set_speed(&self, speed: f64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let clamped = speed.clamp(0.1, 4.0);
        mpv.set_property("speed", clamped)?;
        self.state.lock().speed = clamped;
        Ok(())
    }

    pub fn frame_step(&self) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.command("frame-step", &[])?;
        Ok(())
    }

    pub fn frame_back_step(&self) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.command("frame-back-step", &[])?;
        Ok(())
    }

    pub fn set_ab_loop_a(&self, pos: Option<f64>) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        match pos {
            Some(p) => mpv.set_property("ab-loop-a", p)?,
            None => mpv.set_property("ab-loop-a", "no")?,
        }
        Ok(())
    }

    pub fn set_ab_loop_b(&self, pos: Option<f64>) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        match pos {
            Some(p) => mpv.set_property("ab-loop-b", p)?,
            None => mpv.set_property("ab-loop-b", "no")?,
        }
        Ok(())
    }

    pub fn clear_ab_loop(&self) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("ab-loop-a", "no")?;
        mpv.set_property("ab-loop-b", "no")?;
        Ok(())
    }

    pub fn get_chapters(&self) -> Vec<ChapterItem> {
        let mpv = self.mpv.lock();
        let count: i64 = mpv.get_property("chapter-list/count").unwrap_or(0);
        let mut list = Vec::new();
        for i in 0..count {
            let title: String = mpv
                .get_property(&format!("chapter-list/{}/title", i))
                .unwrap_or_else(|_| format!("Chapter {}", i + 1));
            let start: f64 = mpv
                .get_property(&format!("chapter-list/{}/time", i))
                .unwrap_or(0.0);
            list.push(ChapterItem {
                index: i,
                title,
                start_secs: start,
            });
        }
        list
    }

    pub fn set_chapter(&self, index: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("chapter", index)?;
        Ok(())
    }

    pub fn set_subtitle_delay(&self, delay_secs: f64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("sub-delay", delay_secs)?;
        Ok(())
    }

    pub fn set_audio_delay(&self, delay_secs: f64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("audio-delay", delay_secs)?;
        Ok(())
    }

    // Video Picture Enhancement Controls
    pub fn set_brightness(&self, val: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("brightness", val.clamp(-100, 100))?;
        Ok(())
    }

    pub fn set_contrast(&self, val: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("contrast", val.clamp(-100, 100))?;
        Ok(())
    }

    pub fn set_saturation(&self, val: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("saturation", val.clamp(-100, 100))?;
        Ok(())
    }

    pub fn set_gamma(&self, val: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("gamma", val.clamp(-100, 100))?;
        Ok(())
    }

    pub fn set_hue(&self, val: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("hue", val.clamp(-180, 180))?;
        Ok(())
    }

    pub fn set_deband(&self, enable: bool) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("deband", enable)?;
        Ok(())
    }

    pub fn set_scaler(&self, scaler: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let valid = match scaler {
            "lanczos" | "ewa_lanczos" | "spline36" | "bicubic" | "bilinear" | "nearest" => scaler,
            _ => "spline36",
        };
        mpv.set_property("scale", valid)?;
        Ok(())
    }

    pub fn set_cscale(&self, algo: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let valid = match algo {
            "lanczos" | "spline36" | "bilinear" => algo,
            _ => "spline36",
        };
        mpv.set_property("cscale", valid)?;
        Ok(())
    }

    pub fn set_dscale(&self, algo: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let valid = match algo {
            "mitchell" | "bicubic" | "bilinear" => algo,
            _ => "mitchell",
        };
        mpv.set_property("dscale", valid)?;
        Ok(())
    }

    pub fn set_scale_antiring(&self, val: f64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("scale-antiring", val.clamp(0.0, 1.0))?;
        Ok(())
    }

    pub fn set_sigmoid_upscaling(&self, enable: bool) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("sigmoid-upscaling", enable)?;
        Ok(())
    }

    pub fn set_correct_downscaling(&self, enable: bool) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("correct-downscaling", enable)?;
        Ok(())
    }

    // Phase 4: Video Picture & Detail Controls
    pub fn set_deband_iterations(&self, count: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("deband-iterations", count.clamp(1, 16))?;
        Ok(())
    }

    pub fn set_deband_threshold(&self, thresh: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("deband-threshold", thresh.clamp(0, 4096))?;
        Ok(())
    }

    pub fn set_deband_range(&self, range: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("deband-range", range.clamp(1, 64))?;
        Ok(())
    }

    pub fn set_deband_grain(&self, grain: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("deband-grain", grain.clamp(0, 4096))?;
        Ok(())
    }

    // Motion & Interpolation
    pub fn set_display_fps_override(&self, fps: f64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("display-fps-override", fps)?;
        Ok(())
    }

    pub fn set_interpolation(&self, enable: bool) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("interpolation", enable)?;
        if enable {
            let _ = mpv.set_property("video-sync", "display-resample");
        }
        Ok(())
    }

    pub fn set_tscale(&self, algo: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let valid = match algo {
            "linear" | "catmull_rom" | "mitchell" | "bicubic" | "oversample" => algo,
            _ => "oversample",
        };
        mpv.set_property("tscale", valid)?;
        Ok(())
    }

    pub fn set_video_sync(&self, mode: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let valid = match mode {
            "display-resample" | "audio" => mode,
            _ => "audio",
        };
        mpv.set_property("video-sync", valid)?;
        Ok(())
    }

    // Geometry Controls
    pub fn set_video_zoom(&self, zoom: f64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("video-zoom", zoom.clamp(-1.0, 4.0))?;
        Ok(())
    }

    pub fn set_video_pan(&self, x: f64, y: f64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("video-pan-x", x.clamp(-1.0, 1.0))?;
        mpv.set_property("video-pan-y", y.clamp(-1.0, 1.0))?;
        Ok(())
    }

    // HDR Parameters
    pub fn set_target_peak(&self, nits: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        if nits <= 0 {
            mpv.set_property("target-peak", "auto")?;
        } else {
            mpv.set_property("target-peak", nits.clamp(100, 4000))?;
        }
        Ok(())
    }

    pub fn set_tone_mapping_param(&self, param: f64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("tone-mapping-param", param)?;
        Ok(())
    }

    pub fn set_gamut_mapping_mode(&self, mode: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let valid = match mode {
            "clip" | "warn" | "linear" | "auto" => mode,
            _ => "auto",
        };
        mpv.set_property("gamut-mapping-mode", valid)?;
        Ok(())
    }

    pub fn set_rotation(&self, degrees: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let valid = match degrees {
            90 | 180 | 270 => degrees,
            _ => 0,
        };
        mpv.set_property("video-rotate", valid)?;
        self.state.lock().rotation = valid;
        Ok(())
    }

    pub fn set_tone_mapping(&self, algo: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("tone-mapping", algo)?;
        Ok(())
    }

    pub fn set_aspect_ratio(&self, aspect: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let val = match aspect {
            "16:9" => "16:9",
            "4:3" => "4:3",
            "2.35:1" => "2.35:1",
            _ => "no",
        };
        mpv.set_property("video-aspect-override", val)?;
        Ok(())
    }

    pub fn set_video_aspect_override(&self, aspect: &str) -> Result<(), PlayerError> {
        self.set_aspect_ratio(aspect)
    }

    pub fn get_debug_stats(&self) -> String {
        let s = self.state.lock();
        format!(
            "Valor Native Player Statistics:\n\
             • File: {}\n\
             • Position: {:.2}s / {:.2}s ({:.1}%)\n\
             • Resolution: {}x{}\n\
             • Video FPS: {:.2}\n\
             • Hardware Decoder: {}\n\
             • HDR: {}\n\
             • Audio Boost: {}%\n\
             • Playback Speed: {:.2}x\n\
             • Rotation: {}°\n\
             • Switch Token: {}\n",
            s.current_file_path.as_deref().unwrap_or("None"),
            s.position_secs,
            s.duration_secs,
            if s.duration_secs > 0.0 {
                (s.position_secs / s.duration_secs) * 100.0
            } else {
                0.0
            },
            s.width,
            s.height,
            s.fps,
            s.hwdec_current,
            s.is_hdr,
            s.audio_boost_tier,
            s.speed,
            s.rotation,
            s.switch_token
        )
    }

    // Phase 4 Audio Graph Composer Integration
    fn sync_audio_graph(&self, mpv: &Mpv, graph: &mut AudioGraphComposer) -> Result<Option<String>, PlayerError> {
        let ch = mpv.get_property::<i64>("audio-params/channel-count")
            .or_else(|_| mpv.get_property::<i64>("audio-params/channels"))
            .unwrap_or(2) as u32;
        graph.set_input_channels(ch);
        let res = graph.apply_to_mpv_with_resilience(mpv)?;
        if let Some(ref stage) = res {
            eprintln!("[Valor Audio] Stage '{}' failed to load in mpv and was safely disabled. Remainder and limiter preserved.", stage);
        }
        Ok(res)
    }

    pub fn set_audio_boost(&self, tier_percent: u32) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        // Keep master output volume strictly at 100% so mpv does not amplify after the filter chain
        mpv.set_property("volume", 100.0)?;

        let mut graph = self.audio_graph.lock();
        graph.set_boost_tier(tier_percent);
        self.sync_audio_graph(&mpv, &mut graph)?;

        self.state.lock().audio_boost_tier = tier_percent;
        Ok(())
    }

    pub fn set_audio_eq(&self, gains: &[f64; 10]) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let mut graph = self.audio_graph.lock();
        graph.set_eq(gains);
        self.sync_audio_graph(&mpv, &mut graph)?;
        Ok(())
    }

    pub fn set_dynaudnorm(&self, enable: bool) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let mut graph = self.audio_graph.lock();
        graph.set_normalization(if enable {
            NormalizationMode::DynAudNorm
        } else {
            NormalizationMode::None
        });
        self.sync_audio_graph(&mpv, &mut graph)?;
        Ok(())
    }

    pub fn set_loudnorm(&self, enable: bool) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let mut graph = self.audio_graph.lock();
        graph.set_normalization(if enable {
            NormalizationMode::LoudNorm
        } else {
            NormalizationMode::None
        });
        self.sync_audio_graph(&mpv, &mut graph)?;
        Ok(())
    }

    pub fn set_night_mode(&self, enable: bool) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let mut graph = self.audio_graph.lock();
        graph.set_normalization(if enable {
            NormalizationMode::NightMode
        } else {
            NormalizationMode::None
        });
        self.sync_audio_graph(&mpv, &mut graph)?;
        Ok(())
    }

    pub fn set_dialogue_boost(&self, enable: bool) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let mut graph = self.audio_graph.lock();
        graph.set_dialogue_boost(enable);
        self.sync_audio_graph(&mpv, &mut graph)?;
        Ok(())
    }

    /// Hold-to-compare (X5): Temporarily bypasses ALL enhancements (video adjustments,
    /// shaders, filters, audio graph) to compare raw original source against enhanced picture.
    pub fn start_hold_to_compare(&self) -> Result<(), PlayerError> {
        let mut saved = self.saved_comparison_state.lock();
        if saved.is_some() {
            return Ok(()); // Already in comparison mode
        }

        let mpv = self.mpv.lock();
        let snap = VideoAdjustmentSnapshot {
            brightness: mpv.get_property("brightness").unwrap_or(0),
            contrast: mpv.get_property("contrast").unwrap_or(0),
            saturation: mpv.get_property("saturation").unwrap_or(0),
            gamma: mpv.get_property("gamma").unwrap_or(0),
            hue: mpv.get_property("hue").unwrap_or(0),
            sharpen: mpv.get_property("sharpen").unwrap_or(0.0),
            deband: mpv.get_property("deband").unwrap_or(false),
            glsl_shaders: mpv.get_property("glsl-shaders").unwrap_or_default(),
        };
        let audio_snap = self.audio_graph.lock().clone();
        *saved = Some((snap, audio_snap));

        // Apply neutral raw baseline
        let _ = mpv.set_property("brightness", 0);
        let _ = mpv.set_property("contrast", 0);
        let _ = mpv.set_property("saturation", 0);
        let _ = mpv.set_property("gamma", 0);
        let _ = mpv.set_property("hue", 0);
        let _ = mpv.set_property("sharpen", 0.0);
        let _ = mpv.set_property("deband", false);
        let _ = mpv.set_property("glsl-shaders", "");
        let _ = AudioGraphComposer::bypassed().apply_to_mpv(&mpv);

        Ok(())
    }

    /// Releases Hold-to-compare and restores exact active enhancement state.
    pub fn stop_hold_to_compare(&self) -> Result<(), PlayerError> {
        let mut saved = self.saved_comparison_state.lock();
        if let Some((video, audio)) = saved.take() {
            let mpv = self.mpv.lock();
            let _ = mpv.set_property("brightness", video.brightness);
            let _ = mpv.set_property("contrast", video.contrast);
            let _ = mpv.set_property("saturation", video.saturation);
            let _ = mpv.set_property("gamma", video.gamma);
            let _ = mpv.set_property("hue", video.hue);
            let _ = mpv.set_property("sharpen", video.sharpen);
            let _ = mpv.set_property("deband", video.deband);
            let _ = mpv.set_property("glsl-shaders", video.glsl_shaders.as_str());
            let _ = audio.apply_to_mpv(&mpv);
        }
        Ok(())
    }

    /// Toggle comparison mode: returns true if now in comparison (raw baseline), false if restored.
    pub fn toggle_compare_mode(&self) -> Result<bool, PlayerError> {
        if self.saved_comparison_state.lock().is_some() {
            self.stop_hold_to_compare()?;
            Ok(false)
        } else {
            self.start_hold_to_compare()?;
            Ok(true)
        }
    }

    pub fn is_compare_active(&self) -> bool {
        self.saved_comparison_state.lock().is_some()
    }

    pub fn shader_manager(&self) -> Arc<Mutex<crate::shaders::ShaderManager>> {
        self.shader_manager.clone()
    }

    pub fn apply_shaders(&self) -> Result<Option<String>, PlayerError> {
        let mpv = self.mpv.lock();
        let mut mgr = self.shader_manager.lock();
        mgr.apply_to_mpv(&mpv).map_err(PlayerError::Mpv)
    }

    /// Hold-to-compare: temporarily bypasses all active audio filter graph processing
    pub fn bypass_audio_studio(&self, bypass: bool) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        if bypass {
            AudioGraphComposer::bypassed().apply_to_mpv(&mpv)?;
        } else {
            self.audio_graph.lock().apply_to_mpv(&mpv)?;
        }
        Ok(())
    }

    pub fn get_audio_graph(&self) -> AudioGraphComposer {
        self.audio_graph.lock().clone()
    }

    pub fn set_sub_font(&self, font: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("sub-font", font)?;
        Ok(())
    }

    pub fn set_sub_font_size(&self, size: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("sub-font-size", size)?;
        Ok(())
    }

    pub fn set_sub_color(&self, color: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("sub-color", color)?;
        Ok(())
    }

    pub fn set_sub_border_color(&self, color: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("sub-border-color", color)?;
        Ok(())
    }

    pub fn set_sub_border_size(&self, size: f64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("sub-border-size", size)?;
        Ok(())
    }

    pub fn set_sub_shadow_color(&self, color: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("sub-shadow-color", color)?;
        Ok(())
    }

    pub fn set_sub_shadow_offset(&self, offset: f64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("sub-shadow-offset", offset)?;
        Ok(())
    }

    pub fn set_sub_pos(&self, pos: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("sub-pos", pos)?;
        Ok(())
    }

    pub fn set_sub_ass_override(&self, mode: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("sub-ass-override", mode)?;
        Ok(())
    }

    pub fn add_external_subtitle(&self, path: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.command("sub-add", &[path, "select"])?;
        Ok(())
    }

    pub fn take_snapshot(&self, output_path: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.command("screenshot-to-file", &[output_path, "video"])?;
        Ok(())
    }

    /// Ticks and refreshes live playback status (duration, position, fps, eof).
    pub fn update_tick(&self) -> PlaybackState {
        let mpv = self.mpv.lock();
        let mut s = self.state.lock();

        if let Ok(pos) = mpv.get_property::<f64>("time-pos") {
            s.position_secs = pos;
        }
        if let Ok(dur) = mpv.get_property::<f64>("duration") {
            s.duration_secs = dur;
        }
        if let Ok(fps) = mpv.get_property::<f64>("estimated-vf-fps") {
            s.fps = fps;
        }
        if let Ok(w) = mpv.get_property::<i64>("width") {
            s.width = w as u32;
        }
        if let Ok(h) = mpv.get_property::<i64>("height") {
            s.height = h as u32;
        }
        if let Ok(colormatrix) = mpv.get_property::<String>("video-params/colormatrix") {
            s.is_hdr = colormatrix.contains("2020")
                || colormatrix.contains("pq")
                || colormatrix.contains("hlg");
        }
        if let Ok(cache_secs) = mpv.get_property::<f64>("demuxer-cache-time") {
            s.buffered_secs = (s.position_secs + cache_secs).min(s.duration_secs);
        }
        if let Ok(sp) = mpv.get_property::<f64>("speed") {
            s.speed = sp;
        }
        if let Ok(m) = mpv.get_property::<bool>("mute") {
            s.is_muted = m;
        }
        if let Ok(is_paused) = mpv.get_property::<bool>("pause") {
            if s.status != PlaybackStatus::Loading {
                s.status = if is_paused {
                    PlaybackStatus::Paused
                } else {
                    PlaybackStatus::Playing
                };
            }
        }
        if let Ok(eof) = mpv.get_property::<bool>("eof-reached") {
            if eof && s.duration_secs > 0.0 && s.position_secs >= (s.duration_secs - 1.0) {
                s.status = PlaybackStatus::Completed;
            }
        }
        if let Ok(hwdec) = mpv.get_property::<String>("hwdec-current") {
            s.hwdec_current = hwdec;
        }

        s.clone()
    }

    pub fn get_active_hwdec(&self) -> String {
        let mpv = self.mpv.lock();
        mpv.get_property::<String>("hwdec-current")
            .unwrap_or_else(|_| "no".to_string())
    }

    pub fn set_hwdec_mode(&self, mode: &str) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        mpv.set_property("hwdec", mode)?;
        Ok(())
    }

    pub fn get_dropped_frames(&self) -> Result<i64, PlayerError> {
        let (decoder_drops, vo_drops) = self.get_detailed_dropped_frames();
        Ok(decoder_drops + vo_drops)
    }

    /// Queries separate decoder drops and presentation (VO) drops.
    pub fn get_detailed_dropped_frames(&self) -> (i64, i64) {
        let mpv = self.mpv.lock();
        let decoder_drops = mpv
            .get_property::<i64>("decoder-frame-drop-count")
            .or_else(|_| mpv.get_property::<i64>("frame-drop-count"))
            .unwrap_or(0);
        let vo_drops = mpv
            .get_property::<i64>("vo-drop-frame-count")
            .or_else(|_| mpv.get_property::<i64>("drop-frame-count"))
            .unwrap_or(0);
        (decoder_drops, vo_drops)
    }

    /// Queries tracks currently present in mpv.
    pub fn get_tracks(&self) -> Result<Vec<TrackItem>, PlayerError> {
        let mpv = self.mpv.lock();
        let count: i64 = mpv.get_property("track-list/count").unwrap_or(0);
        let mut tracks = Vec::new();

        for i in 0..count {
            let prefix = format!("track-list/{}", i);
            let track_type: String = mpv
                .get_property(&format!("{}/type", prefix))
                .unwrap_or_default();
            if track_type != "audio" && track_type != "sub" && track_type != "video" {
                continue;
            }

            let id: i64 = mpv.get_property(&format!("{}/id", prefix)).unwrap_or(i + 1);
            let title: Option<String> = mpv.get_property(&format!("{}/title", prefix)).ok();
            let lang: Option<String> = mpv.get_property(&format!("{}/lang", prefix)).ok();
            let codec: Option<String> = mpv.get_property(&format!("{}/codec", prefix)).ok();
            let selected: bool = mpv
                .get_property(&format!("{}/selected", prefix))
                .unwrap_or(false);
            let external: bool = mpv
                .get_property(&format!("{}/external", prefix))
                .unwrap_or(false);

            let channels: Option<i64> =
                mpv.get_property(&format!("{}/audio-channels", prefix)).ok();
            let is_default: bool = mpv
                .get_property(&format!("{}/default", prefix))
                .unwrap_or(false);
            let is_forced: bool = mpv
                .get_property(&format!("{}/forced", prefix))
                .unwrap_or(false);

            tracks.push(TrackItem {
                id,
                track_type,
                title,
                lang,
                codec,
                channels,
                is_default,
                is_forced,
                is_selected: selected,
                is_external: external,
            });
        }

        Ok(tracks)
    }

    /// Sets the selected track for audio or subtitle.
    pub fn set_track(&self, track_type: &str, track_id: i64) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        let prop = match track_type {
            "audio" => "aid",
            "sub" => "sid",
            _ => return Ok(()),
        };

        if track_id <= 0 {
            mpv.set_property(prop, "no")?;
        } else {
            mpv.set_property(prop, track_id)?;
        }
        Ok(())
    }
}
