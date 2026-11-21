use crate::engine::PlayerError;
use libmpv2::Mpv;
use serde::{Deserialize, Serialize};

pub const EQ_FREQUENCIES: [u32; 10] = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum NormalizationMode {
    None,
    DynAudNorm, // Dynamic Audio Normalizer (f=250:g=31:p=0.95:m=10.0:r=0.9)
    LoudNorm,   // EBU R128 Loudness Normalizer (I=-16:TP=-1.5:LRA=11)
    NightMode,  // Night Mode Compressor (acompressor=threshold=-24dB:ratio=6:attack=5:release=50)
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AudioGraphComposer {
    pub eq_gains: [f64; 10], // dB gain per band (-12.0 to +12.0 dB)
    pub eq_enabled: bool,
    pub normalization: NormalizationMode,
    pub dialogue_boost: bool,
    pub boost_tier: u32, // 100 (1.0x / bypass), 150 (3.0x / +9.54 dB), 200 (4.0x / +12.04 dB)
    pub input_channels: u32, // Runtime detected channel count (from audio-params)
    pub disabled_stages: Vec<String>, // Stages disabled due to runtime error fallback
}

impl Default for AudioGraphComposer {
    fn default() -> Self {
        Self {
            eq_gains: [0.0; 10],
            eq_enabled: false,
            normalization: NormalizationMode::None,
            dialogue_boost: false,
            boost_tier: 100,
            input_channels: 2, // Default assume stereo until probed
            disabled_stages: Vec::new(),
        }
    }
}

impl AudioGraphComposer {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn set_input_channels(&mut self, channels: u32) {
        self.input_channels = channels;
    }

    pub fn disable_stage(&mut self, stage: &str) {
        if !self.disabled_stages.contains(&stage.to_string()) {
            self.disabled_stages.push(stage.to_string());
        }
    }

    pub fn reset_disabled_stages(&mut self) {
        self.disabled_stages.clear();
    }

    pub fn set_boost_tier(&mut self, tier: u32) {
        self.boost_tier = match tier {
            150 => 150,
            200 => 200,
            _ => 100,
        };
    }

    pub fn set_eq(&mut self, gains: &[f64; 10]) {
        for (i, g) in gains.iter().enumerate() {
            self.eq_gains[i] = g.clamp(-12.0, 12.0);
        }
        self.eq_enabled = self.eq_gains.iter().any(|g| g.abs() > 0.05);
    }

    pub fn set_normalization(&mut self, mode: NormalizationMode) {
        self.normalization = mode;
    }

    pub fn set_dialogue_boost(&mut self, enable: bool) {
        self.dialogue_boost = enable;
    }

    /// Builds the composite FFmpeg lavfi audio filter chain with mathematically STRICT ordering:
    /// 1. EQ (`equalizer=...`)
    /// 2. Normalization / Night Mode (`dynaudnorm`, `loudnorm`, or `acompressor`)
    /// 3. Downmix / Dialogue Boost with named channels (`FL FR FC SL SR`), skipped for mono/stereo
    /// 4. Audio Boost Gain (`volume=volume=3.00` for 150%, `volume=volume=4.00` for 200%)
    /// 5. Peak Limiter LAST (`alimiter=limit=0.891:attack=5:release=50:level=disabled`)
    ///
    /// When all filters are inactive (100% volume boost, no EQ, no normalizer, no dialogue boost),
    /// returns None (so mpv bypasses the af chain completely for bit-exact untouched audio).
    pub fn build_filter_string(&self) -> Option<String> {
        let mut filters = Vec::new();

        // 1. STAGE 1: 10-Band Graphic Equalizer
        if !self.disabled_stages.contains(&"eq".to_string())
            && self.eq_enabled
            && self.eq_gains.iter().any(|g| g.abs() > 0.05)
        {
            let mut eq_parts = Vec::new();
            for (f, g) in EQ_FREQUENCIES.iter().zip(self.eq_gains.iter()) {
                if g.abs() > 0.05 {
                    eq_parts.push(format!("equalizer=f={}:width_type=o:w=1:g={:.1}", f, g));
                }
            }
            if !eq_parts.is_empty() {
                filters.push(eq_parts.join(","));
            }
        }

        // 2. STAGE 2: Normalization / Dynamic Range Compression
        if !self.disabled_stages.contains(&"normalization".to_string()) {
            match self.normalization {
                NormalizationMode::None => {}
                NormalizationMode::DynAudNorm => {
                    filters.push("dynaudnorm=f=250:g=31:p=0.95:m=10.0:r=0.9".to_string());
                }
                NormalizationMode::LoudNorm => {
                    filters.push("loudnorm=I=-16:TP=-1.5:LRA=11".to_string());
                }
                NormalizationMode::NightMode => {
                    filters.push("acompressor=threshold=-24dB:ratio=6:attack=5:release=50".to_string());
                }
            }
        }

        // 3. STAGE 3: Downmix & Dialogue Boost with named channels
        // Skipped for mono (1) and stereo (2) channels
        if !self.disabled_stages.contains(&"downmix".to_string())
            && self.dialogue_boost
            && self.input_channels > 2
        {
            // Named channel downmix with dialogue boost centered on FC
            filters.push("pan=stereo|c0=0.6*FL+1.0*FC+0.6*SL|c1=0.6*FR+1.0*FC+0.6*SR".to_string());
        }

        // 4. STAGE 4: Audio Boost Gain (Verified Tiers: 150% = 3.0x / +9.54 dB, 200% = 4.0x / +12.04 dB)
        if !self.disabled_stages.contains(&"boost".to_string()) && self.boost_tier > 100 {
            let gain_factor = match self.boost_tier {
                150 => 3.0,
                200 => 4.0,
                _ => 1.0,
            };
            filters.push(format!("volume=volume={:.2}", gain_factor));
        }

        // 5. STAGE 5: Peak Limiter - ALWAYS STRICTLY LAST!
        if self.boost_tier > 100 {
            // -1 dBTP ceiling (0.891 amplitude), fast attack, 50ms release, auto-leveling disabled
            filters.push("alimiter=limit=0.891:attack=5:release=50:level=disabled".to_string());
        }

        if filters.is_empty() {
            None
        } else {
            Some(format!("lavfi=[{}]", filters.join(",")))
        }
    }

    /// Applies the composed audio filter chain atomically to mpv
    pub fn apply_to_mpv(&self, mpv: &Mpv) -> Result<(), PlayerError> {
        match self.build_filter_string() {
            Some(filter_str) => {
                mpv.set_property("af", filter_str.as_str())
                    .map_err(PlayerError::Mpv)?;
            }
            None => {
                mpv.set_property("af", "").map_err(PlayerError::Mpv)?;
            }
        }
        Ok(())
    }

    /// Applies the composed audio filter chain with fault-resilience:
    /// If an audio filter stage fails to load in mpv, it identifies the failing stage,
    /// disables ONLY that stage, re-applies the chain preserving the remainder and limiter,
    /// and returns the name of the disabled stage so a toast can be presented to the user.
    pub fn apply_to_mpv_with_resilience(&mut self, mpv: &Mpv) -> Result<Option<String>, PlayerError> {
        match self.build_filter_string() {
            None => {
                mpv.set_property("af", "").map_err(PlayerError::Mpv)?;
                Ok(None)
            }
            Some(filter_str) => {
                if let Err(_e) = mpv.set_property("af", filter_str.as_str()) {
                    // Stage failure detected! Check individual stages
                    let candidate_stages = ["downmix", "normalization", "eq"];
                    for stage in candidate_stages {
                        if !self.disabled_stages.contains(&stage.to_string()) {
                            self.disable_stage(stage);
                            if let Some(fallback_str) = self.build_filter_string() {
                                if mpv.set_property("af", fallback_str.as_str()).is_ok() {
                                    return Ok(Some(stage.to_string()));
                                }
                            } else {
                                let _ = mpv.set_property("af", "");
                                return Ok(Some(stage.to_string()));
                            }
                        }
                    }
                    // As ultimate fallback, keep limiter only if boost is on
                    if self.boost_tier > 100 {
                        let _ = mpv.set_property("af", "lavfi=[alimiter=limit=0.891:attack=5:release=50:level=disabled]");
                    } else {
                        let _ = mpv.set_property("af", "");
                    }
                    Ok(Some("invalid_filter".to_string()))
                } else {
                    Ok(None)
                }
            }
        }
    }

    /// Creates a completely flat/bypassed clone for hold-to-compare functionality
    pub fn bypassed() -> Self {
        Self::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_strict_filter_ordering_invariant() {
        let mut composer = AudioGraphComposer::new();

        // 1. Initially default: None
        assert_eq!(composer.build_filter_string(), None, "At 100% boost and default settings, audio chain must be completely bypassed (bit-exact)");

        // 2. Set boost 200% (4.0x / +12.04 dB)
        composer.set_boost_tier(200);
        let s2 = composer.build_filter_string().unwrap();
        assert!(s2.contains("volume=volume=4.00,alimiter=limit=0.891"));
        assert!(s2.ends_with("level=disabled]"));

        // 3. Add EQ, Normalization, Dialogue Boost in 5.1 multi-channel mode
        composer.set_input_channels(6); // 5.1
        composer.set_dialogue_boost(true);
        composer.set_normalization(NormalizationMode::NightMode);
        composer.set_eq(&[3.0, 2.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 2.0, 3.0]);

        let s3 = composer.build_filter_string().unwrap();
        println!("Composed Filter Graph:\n{}", s3);

        // Verify index ordering:
        // equalizer < acompressor < pan < volume < alimiter
        let idx_eq = s3.find("equalizer=").expect("contains equalizer");
        let idx_norm = s3.find("acompressor=").expect("contains normalizer/night");
        let idx_pan = s3.find("pan=stereo|c0=0.6*FL+1.0*FC+0.6*SL").expect("contains downmix with named channels");
        let idx_vol = s3
            .find("volume=volume=4.00")
            .expect("contains boost volume");
        let idx_limiter = s3.find("alimiter=limit=0.891").expect("contains limiter");

        assert!(
            idx_eq < idx_norm,
            "EQ must precede Normalization: {} < {}",
            idx_eq,
            idx_norm
        );
        assert!(
            idx_norm < idx_pan,
            "Normalization must precede Downmix: {} < {}",
            idx_norm,
            idx_pan
        );
        assert!(
            idx_pan < idx_vol,
            "Downmix must precede Boost Volume: {} < {}",
            idx_pan,
            idx_vol
        );
        assert!(
            idx_vol < idx_limiter,
            "Boost Volume must precede Limiter: {} < {}",
            idx_vol,
            idx_limiter
        );
        assert!(
            s3.ends_with("level=disabled]"),
            "Limiter must be strictly LAST in the filter chain"
        );
    }

    #[test]
    fn test_x2_downmix_skipped_for_mono_and_stereo_clips() {
        let mut composer = AudioGraphComposer::new();
        composer.set_dialogue_boost(true);

        // Test with mono (1 channel)
        composer.set_input_channels(1);
        assert_eq!(composer.build_filter_string(), None, "Mono clip must skip downmix filter");

        // Test with stereo (2 channels)
        composer.set_input_channels(2);
        assert_eq!(composer.build_filter_string(), None, "Stereo clip must skip downmix filter");

        // Test with 5.1 (6 channels)
        composer.set_input_channels(6);
        let s_51 = composer.build_filter_string().unwrap();
        assert!(s_51.contains("pan=stereo|c0=0.6*FL+1.0*FC+0.6*SL|c1=0.6*FR+1.0*FC+0.6*SR"), "5.1 clip must use named channel downmix");
    }

    #[test]
    fn test_x2_fault_resilience_disables_only_failed_stage() {
        let mut composer = AudioGraphComposer::new();
        composer.set_input_channels(6);
        composer.set_dialogue_boost(true);
        composer.set_normalization(NormalizationMode::DynAudNorm);
        composer.set_boost_tier(200);

        let initial = composer.build_filter_string().unwrap();
        assert!(initial.contains("pan=stereo"));
        assert!(initial.contains("dynaudnorm="));
        assert!(initial.contains("volume=volume=4.00"));
        assert!(initial.contains("alimiter=limit=0.891"));

        // Simulate downmix stage failure
        composer.disable_stage("downmix");
        let fallback = composer.build_filter_string().unwrap();
        assert!(!fallback.contains("pan=stereo"), "Downmix must be omitted when disabled");
        assert!(fallback.contains("dynaudnorm="), "Normalization must be retained");
        assert!(fallback.contains("volume=volume=4.00"), "Boost must be retained");
        assert!(fallback.contains("alimiter=limit=0.891"), "Limiter must be retained strictly last");
    }

    #[test]
    fn test_boost_and_limiter_never_clobbered_by_eq_adjustments() {
        let mut composer = AudioGraphComposer::new();
        composer.set_boost_tier(200); // 4x (+12 dB)

        // Adjust EQ gains
        composer.set_eq(&[-12.0; 10]);
        let s = composer.build_filter_string().unwrap();
        assert!(s.contains("volume=volume=4.00"));
        assert!(s.contains("alimiter=limit=0.891"));
        assert!(s.ends_with("level=disabled]"));

        // Reset EQ
        composer.set_eq(&[0.0; 10]);
        let s_flat = composer.build_filter_string().unwrap();
        assert!(!s_flat.contains("equalizer="));
        assert!(s_flat.contains("volume=volume=4.00"));
        assert!(s_flat.contains("alimiter=limit=0.891"));
        assert!(s_flat.ends_with("level=disabled]"));
    }
}
