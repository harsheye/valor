use crate::theme::ValorTheme;
use egui::{Color32, CornerRadius, FontId, Pos2, Rect, Stroke, Ui, Vec2};

#[derive(Debug, Clone)]
pub enum BadgeKind {
    New,
    Versions(usize),
    Resolution(String),
    Hdr,
    Codec(String),
    Watched,
    Unwatched,
    InProgress(f64),
    Unidentified,
    Missing,
    Chip(String),
}

pub struct Badge {
    pub kind: BadgeKind,
}

impl Badge {
    pub fn new(kind: BadgeKind) -> Self {
        Self { kind }
    }

    pub fn render(&self, ui: &mut Ui, theme: &ValorTheme, pos: Pos2) -> Rect {
        let (text, bg_color, text_color, border_stroke) = match &self.kind {
            BadgeKind::New => (
                "NEW".to_string(),
                Color32::from_rgb(230, 230, 230),
                Color32::from_rgb(10, 10, 10),
                Stroke::NONE,
            ),
            BadgeKind::Versions(count) => (
                format!("{} versions", count),
                Color32::from_rgba_premultiplied(36, 36, 36, 220),
                Color32::from_rgb(210, 210, 210),
                Stroke::new(1.0, Color32::from_rgb(78, 78, 78)),
            ),
            BadgeKind::Resolution(res) => (
                res.clone(),
                Color32::from_rgba_premultiplied(36, 36, 36, 200),
                Color32::from_rgb(210, 210, 210),
                Stroke::new(1.0, Color32::from_rgb(78, 78, 78)),
            ),
            BadgeKind::Hdr => (
                "HDR".to_string(),
                Color32::from_rgba_premultiplied(180, 180, 180, 24),
                Color32::from_rgb(220, 220, 220),
                Stroke::new(1.0, Color32::from_rgb(110, 110, 110)),
            ),
            BadgeKind::Codec(codec) => (
                codec.to_uppercase(),
                Color32::from_rgba_premultiplied(36, 36, 36, 200),
                Color32::from_rgb(190, 190, 190),
                Stroke::new(1.0, Color32::from_rgb(78, 78, 78)),
            ),
            BadgeKind::Watched => (
                "Watched".to_string(),
                Color32::from_rgba_premultiplied(200, 200, 200, 25),
                Color32::from_rgb(230, 230, 230),
                Stroke::new(1.0, Color32::from_rgba_premultiplied(200, 200, 200, 80)),
            ),
            BadgeKind::Unwatched => (
                "Unwatched".to_string(),
                Color32::from_rgba_premultiplied(120, 120, 120, 30),
                Color32::from_rgb(190, 190, 190),
                Stroke::new(1.0, Color32::from_rgba_premultiplied(180, 180, 180, 80)),
            ),
            BadgeKind::InProgress(secs) => {
                let m = (*secs as i64) / 60;
                let s = (*secs as i64) % 60;
                (
                    format!("In progress {:02}:{:02}", m, s),
                    Color32::from_rgba_premultiplied(170, 170, 170, 30),
                    Color32::from_rgb(220, 220, 220),
                    Stroke::new(1.0, Color32::from_rgba_premultiplied(190, 190, 190, 80)),
                )
            }
            BadgeKind::Unidentified => (
                "Unidentified".to_string(),
                Color32::from_rgba_premultiplied(245, 158, 11, 30),
                theme.accent_amber,
                Stroke::new(1.0, Color32::from_rgba_premultiplied(245, 158, 11, 80)),
            ),
            BadgeKind::Missing => (
                "Missing file".to_string(),
                Color32::from_rgba_premultiplied(120, 120, 120, 40),
                Color32::from_rgb(200, 200, 200),
                Stroke::new(1.0, Color32::from_rgb(160, 160, 160)),
            ),
            BadgeKind::Chip(text) => (
                text.clone(),
                Color32::from_rgba_premultiplied(170, 170, 170, 30),
                Color32::from_rgb(220, 220, 220),
                Stroke::new(1.0, Color32::from_rgba_premultiplied(190, 190, 190, 100)),
            ),
        };

        let font = FontId::proportional(10.5);
        let galley = ui.painter().layout_no_wrap(text, font, text_color);
        let pad_x = 6.0;
        let pad_y = 2.5;
        let badge_size = Vec2::new(galley.size().x + pad_x * 2.0, galley.size().y + pad_y * 2.0);
        let badge_rect = Rect::from_min_size(pos, badge_size);

        ui.painter().rect(
            badge_rect,
            CornerRadius::same(4),
            bg_color,
            border_stroke,
            egui::StrokeKind::Inside,
        );
        ui.painter().galley(
            Pos2::new(badge_rect.min.x + pad_x, badge_rect.min.y + pad_y),
            galley,
            text_color,
        );

        badge_rect
    }
}
