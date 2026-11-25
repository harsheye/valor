use egui::{Color32, CornerRadius, Stroke, Vec2};

pub type Theme = ValorTheme;

#[derive(Debug, Clone)]
pub struct ValorTheme {
    pub bg_color: Color32,
    pub panel_bg: Color32,
    pub panel_border: Color32,
    pub accent_amber: Color32,
    pub accent_amber_light: Color32,
    pub accent_blue: Color32,
    pub accent_cyan: Color32,
    pub sidebar_bg: Color32,
    pub card_bg: Color32,
    pub text_primary: Color32,
    pub text_muted: Color32,
    pub danger: Color32,
    pub danger_soft: Color32,
    pub accent_soft: Color32,
    pub accent_coral: Color32,
    pub success: Color32,
    pub heat_0: Color32,
    pub heat_1: Color32,
    pub heat_2: Color32,
    pub heat_3: Color32,
    pub heat_4: Color32,
    pub name: String,

    // ==========================================
    // Video Player Overlay (Movies & TV styling)
    // ==========================================
    /// Corner radius for all overlay controls (transport buttons, bottom-bar buttons,
    /// edge nav buttons, tooltips). Sharp square corners (0.0).
    pub corner_radius: f32,

    // Fill colors for button states
    pub overlay_fill_rest: Color32,
    pub overlay_fill_hover: Color32,
    pub overlay_fill_pressed: Color32,

    // Border colors for button states
    pub overlay_border_rest_transport: Color32,
    pub overlay_border_rest_edge: Color32,
    pub overlay_border_rest_bar: Color32,
    pub overlay_border_hover: Color32,
    pub overlay_border_width: f32,

    // Animation transition duration
    pub overlay_transition_ms: f32,

    // Control sizes
    pub transport_button_size: Vec2,
    pub bottom_button_size: Vec2,
    pub edge_button_size: Vec2,

    // Icon styling
    pub overlay_icon_color: Color32,
    pub overlay_icon_color_hover: Color32,
    pub overlay_icon_stroke: f32,
    pub transport_icon_size: f32,
    pub transport_number_font_size: f32,
    pub bottom_icon_size: f32,
    pub edge_icon_size: f32,

    // Tooltip renderer parameters
    pub tooltip_fill: Color32,
    pub tooltip_border: Color32,
    pub tooltip_border_width: f32,
    pub tooltip_text_color: Color32,
    pub tooltip_font_size: f32,
    pub tooltip_padding: Vec2,
    pub tooltip_gap: f32,
    pub tooltip_shadow_color: Color32,
    pub tooltip_shadow_blur: f32,
    pub tooltip_shadow_offset_y: f32,

    // Bottom bar background gradient
    pub bottom_bar_gradient_height: f32,
    pub bottom_bar_gradient_top: Color32,
    pub bottom_bar_gradient_bottom: Color32,
}

impl Default for ValorTheme {
    fn default() -> Self {
        Self::valor_dark()
    }
}

fn apply_overlay_defaults(mut theme: ValorTheme) -> ValorTheme {
    theme.corner_radius = 4.0;
    theme.overlay_fill_rest = Color32::TRANSPARENT;
    theme.overlay_fill_hover = Color32::from_rgba_unmultiplied(255, 255, 255, 31); // 0.12 soft rounded highlight
    theme.overlay_fill_pressed = Color32::from_rgba_unmultiplied(255, 255, 255, 56); // 0.22 active pressed
    theme.overlay_border_rest_transport = Color32::TRANSPARENT; // No borders/boxes at rest
    theme.overlay_border_rest_edge = Color32::TRANSPARENT;
    theme.overlay_border_rest_bar = Color32::TRANSPARENT;
    theme.overlay_border_hover = Color32::TRANSPARENT;
    theme.overlay_border_width = 0.0;
    theme.overlay_transition_ms = 120.0;
    theme.transport_button_size = Vec2::new(40.0, 40.0);
    theme.bottom_button_size = Vec2::new(40.0, 40.0);
    theme.edge_button_size = Vec2::new(30.0, 100.0);
    theme.overlay_icon_color = Color32::WHITE; // Pure white #FFFFFF @ 100%
    theme.overlay_icon_color_hover = Color32::WHITE;
    theme.overlay_icon_stroke = 1.5;
    theme.transport_icon_size = 24.0; // 24px center group
    theme.transport_number_font_size = 8.5;
    theme.bottom_icon_size = 20.0; // 20px side groups
    theme.edge_icon_size = 22.0;
    theme.tooltip_fill = Color32::from_rgba_unmultiplied(32, 32, 32, 242); // rgba(32,32,32,0.95)
    theme.tooltip_border = Color32::from_rgba_unmultiplied(255, 255, 255, 25);
    theme.tooltip_border_width = 1.0;
    theme.tooltip_text_color = Color32::WHITE;
    theme.tooltip_font_size = 12.0;
    theme.tooltip_padding = Vec2::new(10.0, 6.0);
    theme.tooltip_gap = 6.0;
    theme.tooltip_shadow_color = Color32::from_rgba_unmultiplied(0, 0, 0, 102); // rgba(0,0,0,0.4)
    theme.tooltip_shadow_blur = 6.0;
    theme.tooltip_shadow_offset_y = 2.0;
    theme.bottom_bar_gradient_height = 160.0; // ~160px bottom scrim
    theme.bottom_bar_gradient_top = Color32::TRANSPARENT;
    theme.bottom_bar_gradient_bottom = Color32::from_rgba_unmultiplied(0, 0, 0, 166); // rgba(0,0,0,0.65)
    theme
}

impl ValorTheme {
    pub fn valor_dark() -> Self {
        apply_overlay_defaults(Self {
            bg_color: Color32::from_rgb(10, 10, 10),
            panel_bg: Color32::from_rgba_premultiplied(18, 18, 18, 245),
            panel_border: Color32::from_rgba_unmultiplied(255, 255, 255, 20),
            accent_amber: Color32::from_rgb(235, 235, 235),
            accent_amber_light: Color32::from_rgb(255, 255, 255),
            accent_blue: Color32::from_rgb(220, 220, 220),
            accent_cyan: Color32::from_rgb(180, 180, 180),
            sidebar_bg: Color32::from_rgb(14, 14, 14),
            card_bg: Color32::from_rgb(20, 20, 20),
            text_primary: Color32::from_rgb(243, 244, 246),
            text_muted: Color32::from_rgb(156, 163, 175),
            danger: Color32::from_rgb(190, 190, 190),
            danger_soft: Color32::from_rgba_unmultiplied(190, 190, 190, 36),
            accent_soft: Color32::from_rgba_unmultiplied(235, 235, 235, 28),
            accent_coral: Color32::from_rgb(205, 205, 205),
            success: Color32::from_rgb(220, 220, 220),
            heat_0: Color32::from_rgb(24, 24, 24),
            heat_1: Color32::from_rgb(64, 64, 64),
            heat_2: Color32::from_rgb(104, 104, 104),
            heat_3: Color32::from_rgb(154, 154, 154),
            heat_4: Color32::from_rgb(220, 220, 220),
            name: "Monochrome".to_string(),
            corner_radius: 0.0,
            overlay_fill_rest: Color32::TRANSPARENT,
            overlay_fill_hover: Color32::TRANSPARENT,
            overlay_fill_pressed: Color32::TRANSPARENT,
            overlay_border_rest_transport: Color32::TRANSPARENT,
            overlay_border_rest_edge: Color32::TRANSPARENT,
            overlay_border_rest_bar: Color32::TRANSPARENT,
            overlay_border_hover: Color32::TRANSPARENT,
            overlay_border_width: 1.0,
            overlay_transition_ms: 100.0,
            transport_button_size: Vec2::ZERO,
            bottom_button_size: Vec2::ZERO,
            edge_button_size: Vec2::ZERO,
            overlay_icon_color: Color32::WHITE,
            overlay_icon_color_hover: Color32::WHITE,
            overlay_icon_stroke: 1.5,
            transport_icon_size: 20.0,
            transport_number_font_size: 8.5,
            bottom_icon_size: 18.0,
            edge_icon_size: 22.0,
            tooltip_fill: Color32::TRANSPARENT,
            tooltip_border: Color32::TRANSPARENT,
            tooltip_border_width: 1.0,
            tooltip_text_color: Color32::WHITE,
            tooltip_font_size: 12.0,
            tooltip_padding: Vec2::ZERO,
            tooltip_gap: 6.0,
            tooltip_shadow_color: Color32::TRANSPARENT,
            tooltip_shadow_blur: 6.0,
            tooltip_shadow_offset_y: 2.0,
            bottom_bar_gradient_height: 160.0,
            bottom_bar_gradient_top: Color32::TRANSPARENT,
            bottom_bar_gradient_bottom: Color32::TRANSPARENT,
        })
    }

    pub fn midnight() -> Self {
        let mut base = Self::valor_dark();
        base.bg_color = Color32::from_rgb(8, 14, 30);
        base.panel_bg = Color32::from_rgba_premultiplied(14, 25, 55, 240);
        base.panel_border = Color32::from_rgba_premultiplied(56, 189, 248, 40);
        base.accent_amber = Color32::from_rgb(56, 189, 248);
        base.accent_amber_light = Color32::from_rgb(125, 211, 252);
        base.accent_blue = Color32::from_rgb(14, 165, 233);
        base.accent_cyan = Color32::from_rgb(6, 182, 212);
        base.sidebar_bg = Color32::from_rgb(10, 18, 40);
        base.card_bg = Color32::from_rgb(15, 28, 62);
        base.text_primary = Color32::from_rgb(240, 249, 255);
        base.text_muted = Color32::from_rgb(148, 163, 184);
        base.danger = Color32::from_rgb(244, 63, 94);
        base.danger_soft = Color32::from_rgba_premultiplied(244, 63, 94, 36);
        base.accent_soft = Color32::from_rgba_premultiplied(56, 189, 248, 36);
        base.accent_coral = Color32::from_rgb(244, 63, 94);
        base.success = Color32::from_rgb(52, 211, 153);
        base.heat_0 = Color32::from_rgb(20, 32, 54);
        base.heat_1 = Color32::from_rgb(30, 58, 95);
        base.heat_2 = Color32::from_rgb(14, 116, 144);
        base.heat_3 = Color32::from_rgb(6, 182, 212);
        base.heat_4 = Color32::from_rgb(56, 189, 248);
        base.name = "Midnight Blue".to_string();
        apply_overlay_defaults(base)
    }

    pub fn cyberpunk() -> Self {
        let mut base = Self::valor_dark();
        base.bg_color = Color32::from_rgb(13, 13, 18);
        base.panel_bg = Color32::from_rgba_premultiplied(26, 26, 36, 240);
        base.panel_border = Color32::from_rgba_premultiplied(245, 158, 11, 40);
        base.accent_amber = Color32::from_rgb(245, 158, 11);
        base.accent_amber_light = Color32::from_rgb(251, 191, 36);
        base.accent_blue = Color32::from_rgb(236, 72, 153);
        base.accent_cyan = Color32::from_rgb(245, 158, 11);
        base.sidebar_bg = Color32::from_rgb(18, 18, 26);
        base.card_bg = Color32::from_rgb(26, 26, 38);
        base.text_primary = Color32::from_rgb(254, 243, 199);
        base.text_muted = Color32::from_rgb(161, 161, 170);
        base.danger = Color32::from_rgb(239, 68, 68);
        base.danger_soft = Color32::from_rgba_premultiplied(239, 68, 68, 36);
        base.accent_soft = Color32::from_rgba_premultiplied(245, 158, 11, 36);
        base.accent_coral = Color32::from_rgb(244, 63, 94);
        base.success = Color32::from_rgb(34, 197, 94);
        base.heat_0 = Color32::from_rgb(34, 30, 44);
        base.heat_1 = Color32::from_rgb(88, 28, 70);
        base.heat_2 = Color32::from_rgb(157, 23, 77);
        base.heat_3 = Color32::from_rgb(219, 39, 119);
        base.heat_4 = Color32::from_rgb(244, 114, 182);
        base.name = "Cyberpunk Amber".to_string();
        apply_overlay_defaults(base)
    }

    pub fn oled_black() -> Self {
        let mut base = Self::valor_dark();
        base.bg_color = Color32::from_rgb(0, 0, 0);
        base.panel_bg = Color32::from_rgba_premultiplied(10, 10, 10, 250);
        base.panel_border = Color32::from_rgba_premultiplied(255, 255, 255, 25);
        base.accent_amber = Color32::from_rgb(239, 68, 68);
        base.accent_amber_light = Color32::from_rgb(248, 113, 113);
        base.accent_blue = Color32::from_rgb(239, 68, 68);
        base.accent_cyan = Color32::from_rgb(248, 113, 113);
        base.sidebar_bg = Color32::from_rgb(5, 5, 5);
        base.card_bg = Color32::from_rgb(14, 14, 14);
        base.text_primary = Color32::from_rgb(255, 255, 255);
        base.text_muted = Color32::from_rgb(140, 140, 140);
        base.danger = Color32::from_rgb(239, 68, 68);
        base.danger_soft = Color32::from_rgba_premultiplied(239, 68, 68, 36);
        base.accent_soft = Color32::from_rgba_premultiplied(239, 68, 68, 36);
        base.accent_coral = Color32::from_rgb(244, 63, 94);
        base.success = Color32::from_rgb(34, 197, 94);
        base.heat_0 = Color32::from_rgb(22, 22, 22);
        base.heat_1 = Color32::from_rgb(64, 24, 34);
        base.heat_2 = Color32::from_rgb(112, 32, 48);
        base.heat_3 = Color32::from_rgb(168, 43, 68);
        base.heat_4 = Color32::from_rgb(225, 56, 88);
        base.name = "OLED Pitch Black".to_string();
        apply_overlay_defaults(base)
    }

    pub fn slate() -> Self {
        let mut base = Self::valor_dark();
        base.bg_color = Color32::from_rgb(24, 24, 27);
        base.panel_bg = Color32::from_rgba_premultiplied(39, 39, 42, 235);
        base.panel_border = Color32::from_rgba_premultiplied(255, 255, 255, 25);
        base.accent_amber = Color32::from_rgb(168, 85, 247);
        base.accent_amber_light = Color32::from_rgb(192, 132, 252);
        base.accent_blue = Color32::from_rgb(147, 51, 234);
        base.accent_cyan = Color32::from_rgb(168, 85, 247);
        base.sidebar_bg = Color32::from_rgb(30, 30, 36);
        base.card_bg = Color32::from_rgb(45, 45, 52);
        base.text_primary = Color32::from_rgb(250, 250, 250);
        base.text_muted = Color32::from_rgb(161, 161, 170);
        base.danger = Color32::from_rgb(239, 68, 68);
        base.danger_soft = Color32::from_rgba_premultiplied(239, 68, 68, 36);
        base.accent_soft = Color32::from_rgba_premultiplied(168, 85, 247, 36);
        base.accent_coral = Color32::from_rgb(244, 63, 94);
        base.success = Color32::from_rgb(34, 197, 94);
        base.heat_0 = Color32::from_rgb(35, 35, 42);
        base.heat_1 = Color32::from_rgb(70, 35, 95);
        base.heat_2 = Color32::from_rgb(109, 40, 160);
        base.heat_3 = Color32::from_rgb(147, 51, 234);
        base.heat_4 = Color32::from_rgb(192, 132, 252);
        base.name = "Slate Purple".to_string();
        apply_overlay_defaults(base)
    }

    #[inline]
    pub fn overlay_corner_radius(&self) -> CornerRadius {
        CornerRadius::same(self.corner_radius.round() as u8)
    }

    pub fn avatar_palette() -> [Color32; 8] {
        [
            Color32::from_rgb(245, 158, 11),  // Amber / Orange
            Color32::from_rgb(56, 189, 248),  // Sky Blue
            Color32::from_rgb(217, 249, 157), // Lime Yellow
            Color32::from_rgb(52, 211, 153),  // Emerald Green
            Color32::from_rgb(251, 113, 133), // Rose Coral
            Color32::from_rgb(192, 132, 252), // Violet
            Color32::from_rgb(45, 212, 191),  // Teal
            Color32::from_rgb(129, 140, 248), // Indigo
        ]
    }

    pub fn avatar_color_for_title(&self, title: &str) -> Color32 {
        let palette = Self::avatar_palette();
        let mut hash: u32 = 5381;
        for b in title.as_bytes() {
            hash = ((hash << 5).wrapping_add(hash)).wrapping_add(*b as u32);
        }
        palette[(hash as usize) % palette.len()]
    }

    pub fn panel_stroke(&self) -> Stroke {
        Stroke::new(1.0, self.panel_border)
    }

    pub fn accent_stroke(&self) -> Stroke {
        Stroke::new(2.0, self.accent_amber)
    }
}
