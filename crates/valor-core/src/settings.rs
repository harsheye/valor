use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum SettingsError {
    #[error("Could not determine system config directory")]
    NoConfigDir,
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("TOML serialization/deserialization error: {0}")]
    Toml(#[from] toml::de::Error),
    #[error("TOML write error: {0}")]
    TomlSer(#[from] toml::ser::Error),
}

fn default_skip_secs() -> u32 {
    10
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct Settings {
    pub version: u32,

    // Playback preferences
    pub volume: f64,
    pub is_muted: bool,
    pub default_audio_lang: String,
    pub default_sub_lang: String,
    pub auto_next: bool,
    pub auto_next_countdown_secs: u32,
    #[serde(default = "default_skip_secs")]
    pub skip_secs: u32,
    pub end_of_collection_action: String, // "home", "stay", "replay"
    pub confirm_quit_while_playing: bool,
    pub system_media_controls: bool,
    pub decoding_mode: String, // "auto-safe", "auto", "software", "d3d11va", "nvdec"

    // Visuals & HUD
    pub ambiance_glow: bool,
    pub glass_blur_enabled: bool,
    pub pause_info_card: bool,
    pub subtitles_overlay: bool,
    pub stats_overlay: bool,
    pub timeline_peek: bool,
    pub lock_controls: bool,
    pub tone_mapping_mode: String, // "auto", "clip", "reinhard", "mobius", "hable"

    // Skin & Appearance
    pub skin_id: String,
    pub icon_pack_id: String,
    pub animation_speed: f64, // 1.0 = normal, 0.5 = slow, 0.0 = reduced motion
    pub prefers_reduced_motion: bool,

    // Online Metadata
    pub tmdb_enabled: bool,
    pub tmdb_api_key: String,

    // UI Settings Dock Toggles
    pub dock_tiles: [bool; 16],

    // Window state
    pub window_width: u32,
    pub window_height: u32,
    pub window_maximized: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            version: 1,
            volume: 1.0,
            is_muted: false,
            default_audio_lang: "eng".to_string(),
            default_sub_lang: "eng".to_string(),
            auto_next: true,
            auto_next_countdown_secs: 5,
            skip_secs: 10,
            end_of_collection_action: "home".to_string(),
            confirm_quit_while_playing: true,
            system_media_controls: true,
            decoding_mode: "auto-safe".to_string(),
            ambiance_glow: true,
            glass_blur_enabled: true,
            pause_info_card: true,
            subtitles_overlay: true,
            stats_overlay: false,
            timeline_peek: true,
            lock_controls: false,
            tone_mapping_mode: "auto".to_string(),
            skin_id: "amber-dark".to_string(),
            icon_pack_id: "lucide-default".to_string(),
            animation_speed: 1.0,
            prefers_reduced_motion: false,
            tmdb_enabled: false,
            tmdb_api_key: String::new(),
            dock_tiles: [
                true, true, true, true, true, true, false, true, true, false, false, true, false,
                true, false, false,
            ],
            window_width: 1280,
            window_height: 720,
            window_maximized: false,
        }
    }
}

impl Settings {
    pub fn config_path() -> Result<PathBuf, SettingsError> {
        let proj = ProjectDirs::from("com", "valor", "Valor").ok_or(SettingsError::NoConfigDir)?;
        let config_dir = proj.config_dir();
        fs::create_dir_all(config_dir)?;
        Ok(config_dir.join("config.toml"))
    }

    pub fn load() -> Result<Self, SettingsError> {
        let path = Self::config_path()?;
        Self::load_from_path(&path)
    }

    pub fn load_from_path<P: AsRef<Path>>(path: P) -> Result<Self, SettingsError> {
        let path = path.as_ref();
        if !path.exists() {
            let defaults = Self::default();
            defaults.save_to_path(path)?;
            return Ok(defaults);
        }

        let content = fs::read_to_string(path)?;
        let settings: Settings = toml::from_str(&content)?;
        Ok(settings)
    }

    pub fn save(&self) -> Result<(), SettingsError> {
        let path = Self::config_path()?;
        self.save_to_path(&path)
    }

    pub fn save_to_path<P: AsRef<Path>>(&self, path: P) -> Result<(), SettingsError> {
        let content = toml::to_string_pretty(self)?;
        fs::write(path, content)?;
        Ok(())
    }
}
