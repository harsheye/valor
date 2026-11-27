use egui::Color32;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum NavPosition {
    #[default]
    LeftSidebar,
    TopNavbar,
    ClassicMenubar,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum MiniBarPosition {
    #[default]
    Bottom,
    Top,
    Hidden,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TitlebarStyle {
    #[default]
    Modern,
    Classic,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ControlsPosition {
    #[default]
    Bottom,
    Top,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum ScrubberPosition {
    #[default]
    AboveControls,
    BelowControls,
    Inline,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum TransportAlign {
    #[default]
    Center,
    Left,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum PlayButtonStyle {
    #[default]
    Icon,
    CircleAccent,
    SquareClassic,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum LoadingSpinnerStyle {
    #[default]
    BlueCircle,
    RedArc,
    Ember,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum HoverCardStyle {
    #[default]
    Default,
    NetflixPreview,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum PopupStyle {
    #[default]
    Default,
    NetflixDualTracks,
    YoutubeSettings,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default)]
#[serde(default)]
pub struct SkinColors {
    pub window_bg: Option<String>,
    pub chrome_bg: Option<String>,
    pub nav_surface: Option<String>,
    pub content_surface: Option<String>,
    pub card_fill: Option<String>,
    pub field_fill: Option<String>,
    pub accent: Option<String>,
    pub accent_hover: Option<String>,
    pub text_primary: Option<String>,
    pub text_secondary: Option<String>,
    pub text_tertiary: Option<String>,
    pub divider: Option<String>,
    pub player_bar_bg: Option<String>,
    pub scrubber_fill: Option<String>,
    pub scrubber_track: Option<String>,
    pub scrubber_knob: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ShellLayoutConfig {
    pub nav_position: NavPosition,
    pub nav_width: f32,
    pub content_corner_radius: u8,
    pub card_corner_radius: u8,
    pub show_hero_banner: bool,
    pub mini_bar_position: MiniBarPosition,
    pub titlebar_style: TitlebarStyle,
    pub loading_spinner: LoadingSpinnerStyle,
    pub hover_card_style: HoverCardStyle,
}

impl Default for ShellLayoutConfig {
    fn default() -> Self {
        Self {
            nav_position: NavPosition::LeftSidebar,
            nav_width: 260.0,
            content_corner_radius: 8,
            card_corner_radius: 8,
            show_hero_banner: true,
            mini_bar_position: MiniBarPosition::Bottom,
            titlebar_style: TitlebarStyle::Modern,
            loading_spinner: LoadingSpinnerStyle::BlueCircle,
            hover_card_style: HoverCardStyle::Default,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct PlayerLayoutConfig {
    pub style: String,
    pub controls_position: ControlsPosition,
    pub scrubber_position: ScrubberPosition,
    pub transport_align: TransportAlign,
    pub show_title_top: bool,
    pub show_edge_arrows: bool,
    pub bar_height: f32,
    pub bar_corner_radius: u8,
    pub bar_margin_x: f32,
    pub bar_margin_bottom: f32,
    pub scrubber_height: f32,
    pub play_button_style: PlayButtonStyle,
    pub popup_style: PopupStyle,
    pub loading_spinner: LoadingSpinnerStyle,
    pub left_controls: Vec<String>,
    pub center_controls: Vec<String>,
    pub right_controls: Vec<String>,
}

impl Default for PlayerLayoutConfig {
    fn default() -> Self {
        Self {
            style: "default".to_string(),
            controls_position: ControlsPosition::Bottom,
            scrubber_position: ScrubberPosition::AboveControls,
            transport_align: TransportAlign::Center,
            show_title_top: true,
            show_edge_arrows: true,
            bar_height: 104.0,
            bar_corner_radius: 0,
            bar_margin_x: 0.0,
            bar_margin_bottom: 0.0,
            scrubber_height: 4.0,
            play_button_style: PlayButtonStyle::Icon,
            popup_style: PopupStyle::Default,
            loading_spinner: LoadingSpinnerStyle::BlueCircle,
            left_controls: vec!["volume".into(), "subtitles".into()],
            center_controls: vec!["skip_back".into(), "play".into(), "skip_forward".into()],
            right_controls: vec!["lock".into(), "pip".into(), "fullscreen".into(), "more".into()],
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(default)]
pub struct ValorSkin {
    pub id: String,
    pub name: String,
    pub author: String,
    pub version: String,
    pub description: String,
    pub colors: SkinColors,
    pub shell_layout: ShellLayoutConfig,
    pub player_layout: PlayerLayoutConfig,
    /// Optional custom icon overrides: icon_id -> relative path inside the skin bundle (PNG/SVG)
    pub icons: HashMap<String, String>,
    #[serde(skip)]
    pub bundle_dir: Option<PathBuf>,
}

impl Default for ValorSkin {
    fn default() -> Self {
        Self {
            id: "default".to_string(),
            name: "Valor Default".to_string(),
            author: "Valor Team".to_string(),
            version: "1.0.0".to_string(),
            description: "Standard Valor layout".to_string(),
            colors: SkinColors::default(),
            shell_layout: ShellLayoutConfig::default(),
            player_layout: PlayerLayoutConfig::default(),
            icons: HashMap::new(),
            bundle_dir: None,
        }
    }
}

pub const VLC_SKIN_JSON: &str = include_str!("../../../assets/skins/vlc.json");
pub const NETFLIX_SKIN_JSON: &str = include_str!("../../../assets/skins/netflix.json");
pub const YOUTUBE_SKIN_JSON: &str = include_str!("../../../assets/skins/youtube.json");

impl ValorSkin {
    pub fn from_json_str(json: &str) -> Result<Self, serde_json::Error> {
        serde_json::from_str(json)
    }

    pub fn from_file(path: &Path) -> Result<Self, String> {
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();

        let (resolved_json, bundle_dir) = if ext == "zip" || ext == "valorskin" {
            let cache_root = directories::ProjectDirs::from("com", "valor", "Valor")
                .map(|p| p.cache_dir().join("skins"))
                .unwrap_or_else(|| std::env::temp_dir().join("valor_skins"));
            let stem = path
                .file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("custom_bundle");
            let dest_dir = cache_root.join(stem);
            let _ = std::fs::remove_dir_all(&dest_dir);
            std::fs::create_dir_all(&dest_dir)
                .map_err(|e| format!("Failed to prepare skin bundle cache: {e}"))?;

            #[cfg(windows)]
            let status = {
                use std::os::windows::process::CommandExt;
                const CREATE_NO_WINDOW: u32 = 0x0800_0000;
                std::process::Command::new("powershell")
                    .creation_flags(CREATE_NO_WINDOW)
                    .args([
                        "-NoProfile",
                        "-Command",
                        &format!(
                            "Expand-Archive -LiteralPath '{}' -DestinationPath '{}' -Force",
                            path.to_string_lossy().replace('\'', "''"),
                            dest_dir.to_string_lossy().replace('\'', "''")
                        ),
                    ])
                    .status()
            };
            #[cfg(not(windows))]
            let status = std::process::Command::new("unzip")
                .args(["-o", &path.to_string_lossy(), "-d", &dest_dir.to_string_lossy()])
                .status();

            match status {
                Ok(s) if s.success() => {}
                Ok(s) => return Err(format!("Failed to extract skin bundle (exit {s})")),
                Err(e) => return Err(format!("Failed to extract skin bundle: {e}")),
            }

            let candidate = dest_dir.join("skin.json");
            if candidate.exists() {
                (candidate, Some(dest_dir))
            } else {
                // Find first .json in extracted bundle
                let first_json = std::fs::read_dir(&dest_dir)
                    .ok()
                    .and_then(|rd| {
                        rd.flatten()
                            .map(|e| e.path())
                            .find(|p| p.extension().and_then(|e| e.to_str()) == Some("json"))
                    })
                    .ok_or_else(|| "Skin bundle does not contain skin.json".to_string())?;
                (first_json, Some(dest_dir))
            }
        } else if path.is_dir() {
            (path.join("skin.json"), Some(path.to_path_buf()))
        } else {
            (path.to_path_buf(), path.parent().map(|p| p.to_path_buf()))
        };

        let raw = std::fs::read_to_string(&resolved_json)
            .map_err(|e| format!("Failed to read skin {}: {e}", resolved_json.display()))?;
        let mut skin = Self::from_json_str(&raw)
            .map_err(|e| format!("Invalid skin JSON in {}: {e}", resolved_json.display()))?;
        skin.bundle_dir = bundle_dir;
        Ok(skin)
    }

    pub fn builtin(id: &str) -> Option<Self> {
        match id {
            "vlc" => Self::from_json_str(VLC_SKIN_JSON).ok(),
            "netflix" => Self::from_json_str(NETFLIX_SKIN_JSON).ok(),
            "youtube" => Self::from_json_str(YOUTUBE_SKIN_JSON).ok(),
            _ => None,
        }
    }

    pub fn resolve(skin_id: &str, custom_skin_path: &str) -> Self {
        if !custom_skin_path.is_empty() && (skin_id == "custom" || skin_id.starts_with("custom:")) {
            if let Ok(skin) = Self::from_file(Path::new(custom_skin_path)) {
                return skin;
            }
        }
        if let Some(builtin) = Self::builtin(skin_id) {
            return builtin;
        }
        Self::default()
    }
}

pub fn parse_hex_color(s: &str) -> Option<Color32> {
    let hex = s.trim().trim_start_matches('#');
    match hex.len() {
        6 => {
            let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
            let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
            let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
            Some(Color32::from_rgb(r, g, b))
        }
        8 => {
            let r = u8::from_str_radix(&hex[0..2], 16).ok()?;
            let g = u8::from_str_radix(&hex[2..4], 16).ok()?;
            let b = u8::from_str_radix(&hex[4..6], 16).ok()?;
            let a = u8::from_str_radix(&hex[6..8], 16).ok()?;
            Some(Color32::from_rgba_unmultiplied(r, g, b, a))
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builtin_vlc_netflix_youtube_parse() {
        let vlc = ValorSkin::builtin("vlc").expect("vlc skin should parse");
        assert_eq!(vlc.id, "vlc");
        assert_eq!(vlc.shell_layout.nav_position, NavPosition::ClassicMenubar);
        assert_eq!(vlc.player_layout.transport_align, TransportAlign::Left);

        let netflix = ValorSkin::builtin("netflix").expect("netflix skin should parse");
        assert_eq!(netflix.id, "netflix");
        assert_eq!(netflix.shell_layout.nav_position, NavPosition::TopNavbar);
        assert_eq!(netflix.shell_layout.loading_spinner, LoadingSpinnerStyle::RedArc);
        assert_eq!(netflix.shell_layout.hover_card_style, HoverCardStyle::NetflixPreview);
        assert_eq!(netflix.player_layout.popup_style, PopupStyle::NetflixDualTracks);

        let youtube = ValorSkin::builtin("youtube").expect("youtube skin should parse");
        assert_eq!(youtube.id, "youtube");
        assert_eq!(youtube.player_layout.popup_style, PopupStyle::YoutubeSettings);
    }

    #[test]
    fn hex_color_parses_rgb_and_rgba() {
        assert_eq!(parse_hex_color("#E50914"), Some(Color32::from_rgb(0xE5, 0x09, 0x14)));
        assert_eq!(
            parse_hex_color("#232326EB"),
            Some(Color32::from_rgba_unmultiplied(0x23, 0x23, 0x26, 0xEB))
        );
        assert_eq!(parse_hex_color("invalid"), None);
    }
}
