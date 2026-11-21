use std::collections::HashMap;
use std::path::Path;
use serde::{Deserialize, Serialize};
use crate::audio_graph::NormalizationMode;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
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
    pub sharpen: f64,
    // Scaling
    pub scale: String,
    pub cscale: String,
    pub dscale: String,
    pub scale_antiring: f64,
    // Motion & Geometry
    pub video_rotate: i64,
    pub video_aspect_override: String,
    // HDR
    pub tone_mapping: String,
    // Audio DSP
    pub eq_gains: [f64; 10],
    pub normalization: NormalizationMode,
    pub dialogue_boost: bool,
    pub boost_tier: u32,
}

impl Default for StudioPreset {
    fn default() -> Self {
        Self::cinema()
    }
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
            sharpen: 0.0,
            scale: "spline36".into(),
            cscale: "spline36".into(),
            dscale: "mitchell".into(),
            scale_antiring: 0.8,
            video_rotate: 0,
            video_aspect_override: "auto".into(),
            tone_mapping: "bt.2390".into(),
            eq_gains: [2.0, 1.5, 0.5, 0.0, 0.0, 0.0, 1.0, 1.5, 2.0, 2.5],
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
            sharpen: 0.35,
            scale: "lanczos".into(),
            cscale: "lanczos".into(),
            dscale: "mitchell".into(),
            scale_antiring: 0.9,
            video_rotate: 0,
            video_aspect_override: "auto".into(),
            tone_mapping: "spline".into(),
            eq_gains: [0.0, 0.0, 0.0, 1.0, 2.5, 2.0, 1.0, 0.0, 0.0, 0.0],
            normalization: NormalizationMode::None,
            dialogue_boost: true,
            boost_tier: 100,
        }
    }

    pub fn low_light() -> Self {
        Self {
            name: "Low-light".into(),
            brightness: 12,
            contrast: 15,
            saturation: -5,
            gamma: 10,
            hue: 0,
            deband: true,
            deband_iterations: 3,
            sharpen: 0.15,
            scale: "spline36".into(),
            cscale: "spline36".into(),
            dscale: "mitchell".into(),
            scale_antiring: 0.8,
            video_rotate: 0,
            video_aspect_override: "auto".into(),
            tone_mapping: "auto".into(),
            eq_gains: [0.0; 10],
            normalization: NormalizationMode::DynAudNorm,
            dialogue_boost: true,
            boost_tier: 150,
        }
    }

    pub fn sports() -> Self {
        Self {
            name: "Sports".into(),
            brightness: 3,
            contrast: 12,
            saturation: 10,
            gamma: 2,
            hue: 0,
            deband: false,
            deband_iterations: 1,
            sharpen: 0.20,
            scale: "lanczos".into(),
            cscale: "lanczos".into(),
            dscale: "mitchell".into(),
            scale_antiring: 0.8,
            video_rotate: 0,
            video_aspect_override: "auto".into(),
            tone_mapping: "clip".into(),
            eq_gains: [1.0, 1.0, 1.0, 1.0, 2.0, 2.0, 2.0, 1.0, 1.0, 1.0],
            normalization: NormalizationMode::None,
            dialogue_boost: true,
            boost_tier: 100,
        }
    }

    pub fn night() -> Self {
        Self {
            name: "Night".into(),
            brightness: -5,
            contrast: -5,
            saturation: -5,
            gamma: -5,
            hue: 0,
            deband: false,
            deband_iterations: 1,
            sharpen: 0.0,
            scale: "spline36".into(),
            cscale: "spline36".into(),
            dscale: "mitchell".into(),
            scale_antiring: 0.8,
            video_rotate: 0,
            video_aspect_override: "auto".into(),
            tone_mapping: "auto".into(),
            eq_gains: [-8.0, -6.0, -3.0, 0.0, 0.0, 1.0, 1.0, 0.0, -2.0, -4.0],
            normalization: NormalizationMode::NightMode,
            dialogue_boost: true,
            boost_tier: 150,
        }
    }

    pub fn custom() -> Self {
        Self {
            name: "Custom".into(),
            brightness: 0,
            contrast: 0,
            saturation: 0,
            gamma: 0,
            hue: 0,
            deband: false,
            deband_iterations: 1,
            sharpen: 0.0,
            scale: "spline36".into(),
            cscale: "spline36".into(),
            dscale: "mitchell".into(),
            scale_antiring: 0.8,
            video_rotate: 0,
            video_aspect_override: "auto".into(),
            tone_mapping: "auto".into(),
            eq_gains: [0.0; 10],
            normalization: NormalizationMode::None,
            dialogue_boost: false,
            boost_tier: 100,
        }
    }

    pub fn to_json(&self) -> Result<String, serde_json::Error> {
        serde_json::to_string_pretty(self)
    }

    pub fn from_json(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }
}

/// Precedence resolver enforcing: file > collection > folder > library type > global
#[derive(Debug, Clone, Default)]
pub struct PresetPrecedenceManager {
    pub global_preset: StudioPreset,
    pub library_type_overrides: HashMap<String, StudioPreset>, // "movie", "series", "anime", "course"
    pub folder_overrides: HashMap<String, StudioPreset>,
    pub collection_overrides: HashMap<String, StudioPreset>,
    pub file_overrides: HashMap<String, StudioPreset>,
}

impl PresetPrecedenceManager {
    pub fn new() -> Self {
        Self {
            global_preset: StudioPreset::cinema(),
            library_type_overrides: HashMap::new(),
            folder_overrides: HashMap::new(),
            collection_overrides: HashMap::new(),
            file_overrides: HashMap::new(),
        }
    }

    /// Resolves active preset using strict precedence:
    /// 1. File override (highest)
    /// 2. Collection override
    /// 3. Folder override
    /// 4. Library type override
    /// 5. Global preset (lowest fallback)
    pub fn resolve_preset(
        &self,
        file_path: &str,
        collection_id: Option<&str>,
        folder_path: Option<&str>,
        library_type: Option<&str>,
    ) -> (&StudioPreset, &'static str) {
        // 1. File override
        if let Some(preset) = self.file_overrides.get(file_path) {
            return (preset, "file");
        }

        // 2. Collection override
        if let Some(cid) = collection_id {
            if let Some(preset) = self.collection_overrides.get(cid) {
                return (preset, "collection");
            }
        }

        // 3. Folder override (exact or parent)
        if let Some(fp) = folder_path {
            if let Some(preset) = self.folder_overrides.get(fp) {
                return (preset, "folder");
            }
            let p = Path::new(fp);
            for (saved_folder, preset) in &self.folder_overrides {
                if p.starts_with(saved_folder) {
                    return (preset, "folder");
                }
            }
        }

        // 4. Library type override
        if let Some(lt) = library_type {
            if let Some(preset) = self.library_type_overrides.get(lt) {
                return (preset, "library_type");
            }
        }

        // 5. Global
        (&self.global_preset, "global")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_x6_presets_json_roundtrip_and_precedence_rules() {
        // 1. Round-trip serialization for all 6 presets
        let presets = [
            StudioPreset::cinema(),
            StudioPreset::anime(),
            StudioPreset::low_light(),
            StudioPreset::sports(),
            StudioPreset::night(),
            StudioPreset::custom(),
        ];

        for p in &presets {
            let json = p.to_json().expect("serialize preset");
            let restored = StudioPreset::from_json(&json).expect("deserialize preset");
            assert_eq!(p, &restored, "Preset '{}' must roundtrip via JSON", p.name);
        }

        // 2. Precedence Hierarchy Test: file > collection > folder > library type > global
        let mut mgr = PresetPrecedenceManager::new();
        mgr.global_preset = StudioPreset::cinema();
        mgr.library_type_overrides.insert("anime".into(), StudioPreset::anime());
        mgr.folder_overrides.insert("/media/sports".into(), StudioPreset::sports());
        mgr.collection_overrides.insert("coll_night".into(), StudioPreset::night());
        mgr.file_overrides.insert("/media/special.mkv".into(), StudioPreset::low_light());

        // Base case: nothing matches -> global
        let (res, rule) = mgr.resolve_preset("/media/movie.mkv", None, None, None);
        assert_eq!(res.name, "Cinema");
        assert_eq!(rule, "global");

        // Library type matches
        let (res, rule) = mgr.resolve_preset("/media/anime/ep1.mkv", None, None, Some("anime"));
        assert_eq!(res.name, "Anime");
        assert_eq!(rule, "library_type");

        // Folder matches (overrides library type)
        let (res, rule) = mgr.resolve_preset("/media/sports/match.mkv", None, Some("/media/sports"), Some("anime"));
        assert_eq!(res.name, "Sports");
        assert_eq!(rule, "folder");

        // Collection matches (overrides folder)
        let (res, rule) = mgr.resolve_preset("/media/sports/match.mkv", Some("coll_night"), Some("/media/sports"), Some("anime"));
        assert_eq!(res.name, "Night");
        assert_eq!(rule, "collection");

        // File matches (overrides everything)
        let (res, rule) = mgr.resolve_preset("/media/special.mkv", Some("coll_night"), Some("/media/sports"), Some("anime"));
        assert_eq!(res.name, "Low-light");
        assert_eq!(rule, "file");
    }
}
