use egui::{Color32, Stroke};

pub struct ValorTheme {
    pub bg_color: Color32,
    pub panel_bg: Color32,
    pub panel_border: Color32,
    pub accent_amber: Color32,
    pub accent_amber_light: Color32,
    pub text_primary: Color32,
    pub text_muted: Color32,
    pub danger: Color32,
    pub success: Color32,
}

impl Default for ValorTheme {
    fn default() -> Self {
        Self {
            bg_color: Color32::from_rgb(10, 12, 16),
            panel_bg: Color32::from_rgba_premultiplied(22, 27, 38, 220),
            panel_border: Color32::from_rgba_premultiplied(255, 255, 255, 30),
            accent_amber: Color32::from_rgb(245, 158, 11), // #f59e0b
            accent_amber_light: Color32::from_rgb(251, 191, 36), // #fbbf24
            text_primary: Color32::from_rgb(243, 244, 246),
            text_muted: Color32::from_rgb(156, 163, 175),
            danger: Color32::from_rgb(239, 68, 68),
            success: Color32::from_rgb(16, 185, 129),
        }
    }
}

impl ValorTheme {
    pub fn panel_stroke(&self) -> Stroke {
        Stroke::new(1.0, self.panel_border)
    }

    pub fn accent_stroke(&self) -> Stroke {
        Stroke::new(2.0, self.accent_amber)
    }
}
