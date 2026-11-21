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
    current_token: AtomicU64,
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
        if tier_percent > 100 {
            let mult = audio_boost_multiplier(tier_percent);
            Some(format!(
                "lavfi=[volume=volume={:.2},alimiter=limit=0.891:attack=5:release=50:level=disabled]",
                mult
            ))
        } else {
            None
        }
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

        Ok(Self {
            mpv: Arc::new(Mutex::new(mpv)),
            state,
            current_token: AtomicU64::new(1),
        })
    }

    pub fn raw_handle(&self) -> *mut libmpv2_sys::mpv_handle {
        self.mpv.lock().ctx.as_ptr()
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

    pub fn set_audio_boost(&self, tier_percent: u32) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        // Keep master output volume strictly at 100% so mpv does not amplify after the filter chain
        mpv.set_property("volume", 100.0)?;

        if let Some(filter) = Self::build_audio_boost_filter(tier_percent) {
            let res = mpv.set_property("af", filter.as_str());
            if let Err(e) = &res {
                eprintln!("Warning: af set_property failed: {:?}", e);
            }
        } else {
            let _ = mpv.set_property("af", "");
        }
        self.state.lock().audio_boost_tier = tier_percent;
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

    pub fn get_debug_stats(&self) -> String {
        let s = self.state.lock();
        format!(
            "Valor Native Player Statistics:\n\
             • File: {}\n\
             • Position: {:.2}s / {:.2}s ({:.1}%)\n\
             • Resolution: {}x{}\n\
             • Video FPS: {:.2}\n\
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
            s.is_hdr,
            s.audio_boost_tier,
            s.speed,
            s.rotation,
            s.switch_token
        )
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

    // Audio DSP Studio: 10-band Equalizer and Audio Compressors
    pub fn set_audio_eq(&self, gains: &[f64; 10]) -> Result<(), PlayerError> {
        let freqs = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
        let mut filter_parts = Vec::new();
        for (f, g) in freqs.iter().zip(gains.iter()) {
            filter_parts.push(format!("equalizer=f={}:width_type=o:w=1:g={:.1}", f, g));
        }
        let filter_str = filter_parts.join(",");
        let mpv = self.mpv.lock();
        mpv.set_property("af-add", format!("lavfi=[{}]", filter_str))?;
        Ok(())
    }

    pub fn set_dynaudnorm(&self, enable: bool) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        if enable {
            mpv.command(
                "af",
                &[
                    "add",
                    "@dynaud:lavfi=[dynaudnorm=f=250:g=31:p=0.95:m=10.0:r=0.9]",
                ],
            )?;
        } else {
            let _ = mpv.command("af", &["del", "@dynaud"]);
        }
        Ok(())
    }

    pub fn set_night_mode(&self, enable: bool) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        if enable {
            mpv.command(
                "af",
                &[
                    "add",
                    "@night:lavfi=[acompressor=threshold=-24dB:ratio=6:attack=5:release=50]",
                ],
            )?;
        } else {
            let _ = mpv.command("af", &["del", "@night"]);
        }
        Ok(())
    }

    pub fn set_dialogue_boost(&self, enable: bool) -> Result<(), PlayerError> {
        let mpv = self.mpv.lock();
        if enable {
            mpv.command(
                "af",
                &[
                    "add",
                    "@diagboost:lavfi=[pan=stereo|c0=c2+0.6*c0+0.6*c4|c1=c2+0.6*c1+0.6*c5]",
                ],
            )?;
        } else {
            let _ = mpv.command("af", &["del", "@diagboost"]);
        }
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

        s.clone()
    }

    pub fn get_dropped_frames(&self) -> Result<i64, PlayerError> {
        let mpv = self.mpv.lock();
        let dropped = mpv.get_property::<i64>("drop-frame-count").unwrap_or(0);
        Ok(dropped)
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

            tracks.push(TrackItem {
                id,
                track_type,
                title,
                lang,
                codec,
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
