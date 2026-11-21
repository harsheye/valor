use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SkinTokens {
    // Primary Colors
    pub bg: String,
    pub surface: String,
    pub surface_2: String,
    pub surface_3: String,
    pub panel: String,
    pub border: String,
    pub control_border: String,

    // Accents & Semantic States
    pub accent: String,
    pub accent_2: String,
    pub on_accent: String,
    pub accent_soft: String,
    pub text: String,
    pub muted: String,
    pub text_3: String,
    pub danger: String,
    pub warning: String,
    pub success: String,
    pub focus_ring: String,
    pub scrim: String,

    // Radii & Spacing
    pub radius_sm: String,
    pub radius_md: String,
    pub radius_lg: String,
    pub radius_full: String,
    pub spacing_unit: String,

    // Glass & Elevation
    pub blur_strength: String,
    pub shadow_level: String,
    pub border_alpha: f64,
    pub panel_opacity: f64,

    // Typography
    pub font_family: String,
    pub font_mono: String,
    pub peek_time_size: String,

    // Player Elements
    pub progress_thickness: String,
    pub icon_stroke_width: f64,

    // Motion
    pub duration_fast: String,
    pub duration_normal: String,
    pub ease_default: String,
}

impl Default for SkinTokens {
    fn default() -> Self {
        Self::midnight_slate()
    }
}

impl SkinTokens {
    /// 1. Midnight Slate: Production Default - Cool, quiet dark
    pub fn midnight_slate() -> Self {
        Self {
            bg: "#0F1217".to_string(),
            surface: "#151A21".to_string(),
            surface_2: "#1B212A".to_string(),
            surface_3: "#232B36".to_string(),
            panel: "rgba(21, 26, 33, 0.85)".to_string(),
            border: "#262D39".to_string(),
            control_border: "#6C778A".to_string(),

            accent: "#8CA9EE".to_string(),
            accent_2: "#9BB3F2".to_string(),
            on_accent: "#0C1424".to_string(),
            accent_soft: "rgba(140, 169, 238, 0.14)".to_string(),

            text: "#E4E8EE".to_string(),
            muted: "#A9B2C0".to_string(),
            text_3: "#8F99AA".to_string(),

            danger: "#EC8F95".to_string(),
            warning: "#E3BD7A".to_string(),
            success: "#86CDA6".to_string(),
            focus_ring: "#8CA9EE".to_string(),
            scrim: "rgba(15, 18, 23, 0.75)".to_string(),

            radius_sm: "8px".to_string(),
            radius_md: "12px".to_string(),
            radius_lg: "16px".to_string(),
            radius_full: "9999px".to_string(),
            spacing_unit: "8px".to_string(),

            blur_strength: "16px".to_string(),
            shadow_level: "0 10px 30px rgba(0, 0, 0, 0.5)".to_string(),
            border_alpha: 0.15,
            panel_opacity: 0.85,

            font_family: "Inter, system-ui, sans-serif".to_string(),
            font_mono: "JetBrains Mono, monospace".to_string(),
            peek_time_size: "3.5rem".to_string(),

            progress_thickness: "4px".to_string(),
            icon_stroke_width: 2.0,

            duration_fast: "150ms".to_string(),
            duration_normal: "280ms".to_string(),
            ease_default: "cubic-bezier(0.16, 1, 0.3, 1)".to_string(),
        }
    }

    /// 2. Ember Night: Warm, low-blue amber
    pub fn ember_night() -> Self {
        let mut s = Self::midnight_slate();
        s.bg = "#100C09".to_string();
        s.surface = "#18130E".to_string();
        s.surface_2 = "#221B14".to_string();
        s.surface_3 = "#2D241B".to_string();
        s.panel = "rgba(24, 19, 14, 0.88)".to_string();
        s.border = "#382C22".to_string();
        s.control_border = "#8C715B".to_string();
        s.accent = "#F59E0B".to_string();
        s.accent_2 = "#E5A86D".to_string();
        s.on_accent = "#1A0E04".to_string();
        s.accent_soft = "rgba(245, 158, 11, 0.16)".to_string();
        s.text = "#F5E8DD".to_string();
        s.muted = "#C4B1A0".to_string();
        s.text_3 = "#9A8778".to_string();
        s.warning = "#E5A86D".to_string();
        s.scrim = "rgba(16, 12, 9, 0.80)".to_string();
        s
    }

    /// 3. Forest Mist: Muted green-grey sage
    pub fn forest_mist() -> Self {
        let mut s = Self::midnight_slate();
        s.bg = "#08100D".to_string();
        s.surface = "#0F1A15".to_string();
        s.surface_2 = "#15241E".to_string();
        s.surface_3 = "#1E332B".to_string();
        s.panel = "rgba(15, 26, 21, 0.88)".to_string();
        s.border = "#264237".to_string();
        s.control_border = "#5D8A78".to_string();
        s.accent = "#7CC3A1".to_string();
        s.accent_2 = "#65B590".to_string();
        s.on_accent = "#04140D".to_string();
        s.accent_soft = "rgba(124, 195, 161, 0.15)".to_string();
        s.text = "#E2EFE9".to_string();
        s.muted = "#9CB8AC".to_string();
        s.text_3 = "#7A968A".to_string();
        s.scrim = "rgba(8, 16, 13, 0.80)".to_string();
        s
    }

    /// 4. Valor Crimson: Softened red brand
    pub fn valor_crimson() -> Self {
        let mut s = Self::midnight_slate();
        s.bg = "#0F0A0B".to_string();
        s.surface = "#1A1012".to_string();
        s.surface_2 = "#251619".to_string();
        s.surface_3 = "#331E23".to_string();
        s.panel = "rgba(26, 16, 18, 0.88)".to_string();
        s.border = "#44262D".to_string();
        s.control_border = "#9C5A67".to_string();
        s.accent = "#E57C86".to_string();
        s.accent_2 = "#D8636E".to_string();
        s.on_accent = "#1A0407".to_string();
        s.accent_soft = "rgba(229, 124, 134, 0.15)".to_string();
        s.text = "#F8E6E9".to_string();
        s.muted = "#C8ACB2".to_string();
        s.text_3 = "#A88B92".to_string();
        s.scrim = "rgba(15, 10, 11, 0.80)".to_string();
        s
    }

    /// 5. Black-Ops: Calibrated OLED Pure Black
    pub fn black_ops() -> Self {
        let mut s = Self::midnight_slate();
        s.bg = "#000000".to_string();
        s.surface = "#0A0A0A".to_string();
        s.surface_2 = "#121212".to_string();
        s.surface_3 = "#1C1C1C".to_string();
        s.panel = "rgba(10, 10, 10, 0.95)".to_string();
        s.border = "#242424".to_string();
        s.control_border = "#666666".to_string();
        s.accent = "#FFFFFF".to_string();
        s.accent_2 = "#E5E5E5".to_string();
        s.on_accent = "#000000".to_string();
        s.accent_soft = "rgba(255, 255, 255, 0.12)".to_string();
        s.text = "#F2F2F2".to_string();
        s.muted = "#999999".to_string();
        s.text_3 = "#666666".to_string();
        s.scrim = "rgba(0, 0, 0, 0.85)".to_string();
        s
    }

    /// 6. Soft Paper: Warm paper light theme
    pub fn soft_paper() -> Self {
        let mut s = Self::midnight_slate();
        s.bg = "#F1EBE0".to_string();
        s.surface = "#FAF6EE".to_string();
        s.surface_2 = "#E8E0D2".to_string();
        s.surface_3 = "#D9CFC0".to_string();
        s.panel = "rgba(250, 246, 238, 0.92)".to_string();
        s.border = "#C8BCAB".to_string();
        s.control_border = "#8C7E6A".to_string();
        s.accent = "#3A5CB0".to_string();
        s.accent_2 = "#2E4B94".to_string();
        s.on_accent = "#FFFFFF".to_string();
        s.accent_soft = "rgba(58, 92, 176, 0.10)".to_string();
        s.text = "#24211C".to_string();
        s.muted = "#6E6659".to_string();
        s.text_3 = "#8A8071".to_string();
        s.scrim = "rgba(241, 235, 224, 0.82)".to_string();
        s
    }

    /// 7. Valor Cyber Dark: Modern canvas #0B0C10 with coral #FF6B7A
    pub fn valor_cyber_dark() -> Self {
        let mut s = Self::midnight_slate();
        s.bg = "#07090D".to_string();
        s.surface = "#0E121A".to_string();
        s.surface_2 = "#151B27".to_string();
        s.surface_3 = "#1E2637".to_string();
        s.panel = "rgba(14, 18, 26, 0.88)".to_string();
        s.border = "#273248".to_string();
        s.control_border = "#546A94".to_string();
        s.accent = "#FF6B7A".to_string();
        s.accent_2 = "#FA5263".to_string();
        s.on_accent = "#1A0507".to_string();
        s.accent_soft = "rgba(255, 107, 122, 0.16)".to_string();
        s.text = "#EBF0FA".to_string();
        s.muted = "#9AA8C4".to_string();
        s.text_3 = "#7785A1".to_string();
        s.scrim = "rgba(7, 9, 13, 0.82)".to_string();
        s
    }

    /// 8. Studio Light: Crisp pure white #FFFFFF with crimson #C4263A
    pub fn studio_light() -> Self {
        let mut s = Self::midnight_slate();
        s.bg = "#F6F7FA".to_string();
        s.surface = "#FFFFFF".to_string();
        s.surface_2 = "#ECEEF4".to_string();
        s.surface_3 = "#DFE3EC".to_string();
        s.panel = "rgba(255, 255, 255, 0.94)".to_string();
        s.border = "#D0D5E2".to_string();
        s.control_border = "#8A94A8".to_string();
        s.accent = "#C4263A".to_string();
        s.accent_2 = "#A81D2F".to_string();
        s.on_accent = "#FFFFFF".to_string();
        s.accent_soft = "rgba(196, 38, 58, 0.10)".to_string();
        s.text = "#14171F".to_string();
        s.muted = "#5A6275".to_string();
        s.text_3 = "#7E879C".to_string();
        s.scrim = "rgba(246, 247, 250, 0.82)".to_string();
        s
    }

    /// 9. Auto (System): Dynamically adapts to OS light/dark scheme
    pub fn auto(is_dark_mode: bool) -> Self {
        if is_dark_mode {
            Self::midnight_slate()
        } else {
            Self::soft_paper()
        }
    }
}
