use egui::Color32;

pub mod dimensions {
    pub const TITLEBAR_HEIGHT: f32 = 36.0;
    pub const WINDOW_BUTTON_WIDTH: f32 = 46.0;
    pub const WINDOW_BUTTON_HEIGHT: f32 = 36.0;
    pub const TITLEBAR_SETTINGS_WIDTH: f32 = 40.0;
    pub const TOOLBAR_BUTTON_SIZE: f32 = crate::layout::TOOLBAR_BTN_H;
    pub const ICON_SIZE_TITLEBAR: f32 = 16.0;
    pub const SEARCH_HEIGHT: f32 = 28.0;
    pub const SEARCH_MIN_WIDTH: f32 = 200.0;
    pub const SEARCH_MAX_WIDTH: f32 = 640.0;
    pub const NAV_WIDTH_DEFAULT: f32 = crate::layout::EXPANDED_W;
    pub const NAV_WIDTH_MIN: f32 = 220.0;
    pub const NAV_WIDTH_MAX: f32 = 360.0;
    pub const NAV_WIDTH_COLLAPSED: f32 = crate::layout::RAIL_W;
    pub const HAMBURGER_SIZE: f32 = 32.0;
    pub const NAV_ROW_HEIGHT: f32 = crate::layout::ROW_PITCH;
    pub const TREE_ROW_HEIGHT: f32 = crate::layout::ROW_PITCH;
    pub const ICON_SIZE_NAV: f32 = crate::layout::ICON_BOX;
    pub const ICON_SIZE_TOOLBAR: f32 = 16.0;
    pub const ICON_SIZE_TREE: f32 = crate::layout::ICON_BOX;
    pub const ICON_SIZE_HEADER: f32 = crate::layout::TITLE_ICON_SIZE;
    pub const ACCENT_PILL_WIDTH: f32 = crate::layout::PILL_W;
    pub const ACCENT_PILL_HEIGHT: f32 = crate::layout::PILL_H;
    pub const TOOLBAR_HEIGHT: f32 = crate::layout::TOOLBAR_BTN_H;
    pub const POPUP_ROW_HEIGHT: f32 = 32.0;
    pub const POPUP_PADDING: f32 = 8.0;
    pub const TREE_INDENT_PER_LEVEL: f32 = crate::layout::TREE_INDENT;
    pub const MIN_WINDOW_WIDTH: f32 = 960.0;
    pub const MIN_WINDOW_HEIGHT: f32 = 600.0;
}

pub mod radii {
    pub const CONTROLS: u8 = 6;
    pub const PANELS: u8 = 8;
    pub const PILL: u8 = 16;
}

pub mod spacing {
    pub const PAD_4: f32 = 4.0;
    pub const PAD_8: f32 = 8.0;
    pub const PAD_12: f32 = 12.0;
    pub const PAD_16: f32 = 16.0;
    pub const PAD_24: f32 = 24.0;
    pub const PAD_32: f32 = 32.0;
    pub const SECTION_GAP: f32 = 24.0;
    pub const CONTENT_PADDING_X: f32 = crate::layout::PAGE_PAD_X_NARROW;
    pub const CONTENT_PADDING_Y: f32 = crate::layout::PAGE_PAD_TOP;
    pub const TOOLBAR_GAP: f32 = crate::layout::TOOLBAR_GAP;
    pub const SCALE: [f32; 6] = [4.0, 8.0, 12.0, 16.0, 24.0, 32.0];
}

pub mod typography {
    pub const PAGE_TITLE: f32 = 28.0;
    pub const DATE_HEADING: f32 = 16.0;
    pub const BODY: f32 = 14.0;
    pub const NAV_ITEM: f32 = 14.0;
    pub const TITLEBAR_APP_NAME: f32 = 14.0;
    pub const SUMMARY_TEXT: f32 = 14.0;
    pub const SECONDARY: f32 = 12.0;
    pub const SECTION_LABEL: f32 = 12.0;
}

#[derive(Debug, Clone)]
pub struct ShellTokens {
    pub window_bg: Color32,
    pub chrome_bg: Color32,
    pub nav_surface: Color32,
    pub content_surface: Color32,
    pub divider: Color32,
    pub divider_strong: Color32,
    pub text_primary: Color32,
    pub text_secondary: Color32,
    pub text_tertiary: Color32,
    pub text_muted: Color32,
    pub field_fill: Color32,
    pub field_border: Color32,
    pub accent: Color32,
    pub accent_hover: Color32,
    pub selected_fill: Color32,
    pub hover_fill: Color32,
    pub close_hover: Color32,
    pub close_pressed: Color32,
    pub pressed_fill: Color32,
    pub warning: Color32,
    pub card_fill: Color32,
    pub danger: Color32,
    pub success: Color32,
    pub avatar_palette: [Color32; 8],
    pub heatmap: [Color32; 5],
    pub theme: crate::theme::ValorTheme,
}

impl Default for ShellTokens {
    fn default() -> Self {
        Self {
            theme: crate::theme::ValorTheme::default(),
            window_bg: Color32::from_rgb(0x10, 0x10, 0x10),
            chrome_bg: Color32::from_rgb(0x10, 0x10, 0x10),
            nav_surface: Color32::from_rgb(0x10, 0x10, 0x10),
            content_surface: Color32::from_rgb(0x1E, 0x1E, 0x1E),
            divider: Color32::from_rgba_unmultiplied(255, 255, 255, 31), // 12% white
            divider_strong: Color32::from_rgba_unmultiplied(255, 255, 255, 41), // 16% white
            text_primary: Color32::from_rgb(0xFF, 0xFF, 0xFF),
            text_secondary: Color32::from_rgb(0xB0, 0xB0, 0xB0),
            text_tertiary: Color32::from_rgb(0x72, 0x72, 0x72),
            text_muted: Color32::from_rgb(0x72, 0x72, 0x72),
            field_fill: Color32::from_rgb(0x12, 0x12, 0x12),
            field_border: Color32::from_rgba_unmultiplied(255, 255, 255, 26),
            accent: Color32::from_rgb(168, 85, 247), // #A855F7 vibrant purple
            accent_hover: Color32::from_rgb(192, 132, 252), // #C084FC lighter purple
            selected_fill: Color32::from_rgba_unmultiplied(168, 85, 247, 36),
            hover_fill: Color32::from_rgba_unmultiplied(255, 255, 255, 15),    // 6% white
            close_hover: Color32::from_rgb(0xC4, 0x2B, 0x1C),
            close_pressed: Color32::from_rgb(0xA5, 0x23, 0x13),
            pressed_fill: Color32::from_rgba_unmultiplied(255, 255, 255, 26),
            warning: Color32::from_rgb(0xD0, 0xD0, 0xD0),
            card_fill: Color32::from_rgb(0x21, 0x21, 0x21),
            danger: Color32::from_rgb(0xD8, 0x8A, 0x8A),
            success: Color32::from_rgb(0x9C, 0xC7, 0xA5),
            avatar_palette: [
                Color32::from_rgb(76, 87, 105),
                Color32::from_rgb(96, 75, 84),
                Color32::from_rgb(75, 94, 84),
                Color32::from_rgb(93, 83, 68),
                Color32::from_rgb(72, 91, 99),
                Color32::from_rgb(91, 77, 101),
                Color32::from_rgb(98, 83, 72),
                Color32::from_rgb(70, 91, 81),
            ],
            heatmap: [
                Color32::from_rgb(34, 38, 48),    // level 0: dark slate
                Color32::from_rgb(139, 44, 92),   // level 1: muted rose
                Color32::from_rgb(190, 48, 108),  // level 2: rose pink
                Color32::from_rgb(236, 72, 127),  // level 3: bright pink
                Color32::from_rgb(255, 128, 168), // level 4: vivid rose
            ],
        }
    }
}

impl ShellTokens {
    /// Construct a complete color token palette from a persisted `skin_id`.
    pub fn from_skin_id(skin_id: &str) -> Self {
        let mut t = Self::default();
        match skin_id {
            "oled-black" => {
                t.window_bg = Color32::BLACK;
                t.chrome_bg = Color32::BLACK;
                t.nav_surface = Color32::BLACK;
                t.content_surface = Color32::BLACK;
                t.card_fill = Color32::from_rgb(8, 8, 10);
                t.field_fill = Color32::from_rgb(10, 10, 12);
                t.field_border = Color32::from_rgb(32, 32, 36);
                t.divider = Color32::from_rgb(28, 28, 32);
                t.divider_strong = Color32::from_rgb(52, 52, 58);
                t.accent = Color32::from_rgb(246, 130, 31);
                t.accent_hover = Color32::from_rgb(255, 152, 67);
                t.selected_fill = Color32::from_rgba_unmultiplied(246, 130, 31, 36);
                t.theme = crate::theme::Theme::oled_black();
            }
            "github-midnight" => {
                t.window_bg = Color32::from_rgb(13, 17, 23);
                t.chrome_bg = Color32::from_rgb(13, 17, 23);
                t.nav_surface = Color32::from_rgb(13, 17, 23);
                t.content_surface = Color32::from_rgb(22, 27, 34);
                t.card_fill = Color32::from_rgb(22, 27, 34);
                t.field_fill = Color32::from_rgb(13, 17, 23);
                t.field_border = Color32::from_rgb(48, 54, 61);
                t.divider = Color32::from_rgb(48, 54, 61);
                t.divider_strong = Color32::from_rgb(68, 76, 86);
                t.accent = Color32::from_rgb(31, 111, 235);
                t.accent_hover = Color32::from_rgb(88, 166, 255);
                t.selected_fill = Color32::from_rgba_unmultiplied(31, 111, 235, 45);
                t.text_secondary = Color32::from_rgb(139, 148, 158);
                t.theme.accent_blue = Color32::from_rgb(88, 166, 255);
            }
            "cyber-crimson" => {
                t.window_bg = Color32::from_rgb(12, 10, 15);
                t.chrome_bg = Color32::from_rgb(12, 10, 15);
                t.nav_surface = Color32::from_rgb(14, 11, 18);
                t.content_surface = Color32::from_rgb(22, 18, 28);
                t.card_fill = Color32::from_rgb(26, 21, 34);
                t.field_fill = Color32::from_rgb(16, 13, 21);
                t.field_border = Color32::from_rgba_unmultiplied(244, 63, 94, 55);
                t.divider = Color32::from_rgba_unmultiplied(255, 255, 255, 28);
                t.accent = Color32::from_rgb(244, 63, 94);
                t.accent_hover = Color32::from_rgb(251, 113, 133);
                t.selected_fill = Color32::from_rgba_unmultiplied(244, 63, 94, 42);
                t.theme.accent_blue = Color32::from_rgb(244, 63, 94);
            }
            "emerald-studio" => {
                t.window_bg = Color32::from_rgb(11, 17, 14);
                t.chrome_bg = Color32::from_rgb(11, 17, 14);
                t.nav_surface = Color32::from_rgb(13, 20, 16);
                t.content_surface = Color32::from_rgb(18, 27, 23);
                t.card_fill = Color32::from_rgb(22, 33, 28);
                t.field_fill = Color32::from_rgb(14, 21, 18);
                t.field_border = Color32::from_rgba_unmultiplied(16, 185, 129, 55);
                t.divider = Color32::from_rgba_unmultiplied(255, 255, 255, 28);
                t.accent = Color32::from_rgb(16, 185, 129);
                t.accent_hover = Color32::from_rgb(52, 211, 153);
                t.selected_fill = Color32::from_rgba_unmultiplied(16, 185, 129, 42);
                t.theme.accent_blue = Color32::from_rgb(16, 185, 129);
            }
            _ => {}
        }
        t
    }

    /// Calculate relative luminance for WCAG contrast calculation
    pub fn relative_luminance(c: Color32) -> f32 {
        let channel = |v: u8| -> f32 {
            let s = v as f32 / 255.0;
            if s <= 0.03928 {
                s / 12.92
            } else {
                ((s + 0.055) / 1.055).powf(2.4)
            }
        };
        0.2126 * channel(c.r()) + 0.7152 * channel(c.g()) + 0.0722 * channel(c.b())
    }

    /// Calculate WCAG contrast ratio between two colors
    pub fn contrast_ratio(c1: Color32, c2: Color32) -> f32 {
        let l1 = Self::relative_luminance(c1);
        let l2 = Self::relative_luminance(c2);
        let (lighter, darker) = if l1 > l2 { (l1, l2) } else { (l2, l1) };
        (lighter + 0.05) / (darker + 0.05)
    }

    /// Calculate HSL lightness percentage (0.0 to 100.0)
    pub fn lightness_hsl(c: Color32) -> f32 {
        let r = c.r() as f32 / 255.0;
        let g = c.g() as f32 / 255.0;
        let b = c.b() as f32 / 255.0;
        let max = r.max(g).max(b);
        let min = r.min(g).min(b);
        ((max + min) / 2.0) * 100.0
    }
}
