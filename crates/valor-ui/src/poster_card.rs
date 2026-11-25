use crate::badge::{Badge, BadgeKind};
use crate::icons::IconRegistry;
use crate::texture_cache::LruTextureCache;
use crate::theme::ValorTheme;
use egui::{Align2, Color32, CornerRadius, FontId, Pos2, Rect, Response, Sense, Stroke, Ui, Vec2};
use std::hash::{Hash, Hasher};
use std::path::Path;

pub fn letter_avatar_color(title: &str) -> Color32 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    title.hash(&mut hasher);
    let hash = hasher.finish();

    const PALETTE: [Color32; 6] = [
        Color32::from_rgb(26, 26, 26),
        Color32::from_rgb(34, 34, 34),
        Color32::from_rgb(42, 42, 42),
        Color32::from_rgb(50, 50, 50),
        Color32::from_rgb(58, 58, 58),
        Color32::from_rgb(66, 66, 66),
    ];

    PALETTE[(hash as usize) % PALETTE.len()]
}

pub struct PosterCardProps<'a> {
    pub fingerprint: &'a str,
    pub title: &'a str,
    pub poster_path: Option<&'a Path>,
    pub meta_text: &'a str,
    pub resume_text: Option<&'a str>,
    pub is_watched: bool,
    pub progress: Option<f32>,
    pub is_new: bool,
    pub versions_count: usize,
    pub is_unidentified: bool,
    pub is_focused: bool,
}

pub struct PosterCard;

impl PosterCard {
    pub fn show(
        ui: &mut Ui,
        theme: &ValorTheme,
        _icons: &IconRegistry,
        texture_cache: &mut LruTextureCache,
        rect: Rect,
        props: PosterCardProps,
    ) -> Response {
        let resp = ui.allocate_rect(rect, Sense::click());
        let is_hovered = resp.hovered();

        let poster_h = (rect.height() - 58.0).max(60.0);
        let poster_rect = Rect::from_min_size(rect.min, Vec2::new(rect.width(), poster_h));
        let corner_radius = CornerRadius::same(8);

        let mut rendered_texture = false;
        if let Some(path) = props.poster_path {
            if let Some(tex) = texture_cache.get(props.fingerprint, path, ui.ctx()) {
                let uv = Rect::from_min_max(Pos2::new(0.0, 0.0), Pos2::new(1.0, 1.0));
                ui.painter()
                    .image(tex.id(), poster_rect, uv, Color32::WHITE);
                rendered_texture = true;
            }
        }

        if !rendered_texture {
            let bg_col = letter_avatar_color(props.title);
            ui.painter().rect_filled(poster_rect, corner_radius, bg_col);

            let first_char = props
                .title
                .chars()
                .find(|c| c.is_alphanumeric())
                .unwrap_or('?')
                .to_uppercase()
                .to_string();
            let font_size = 40.0_f32.min(poster_rect.width() * 0.35);
            ui.painter().text(
                poster_rect.center(),
                Align2::CENTER_CENTER,
                first_char,
                FontId::proportional(font_size),
                Color32::from_rgba_premultiplied(255, 255, 255, 220),
            );
        }

        let border_stroke = if props.is_focused {
            Stroke::new(2.0, theme.accent_blue)
        } else if is_hovered {
            Stroke::new(1.5, theme.accent_blue.linear_multiply(0.8))
        } else {
            Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 20))
        };
        ui.painter().rect_stroke(
            poster_rect,
            corner_radius,
            border_stroke,
            egui::StrokeKind::Inside,
        );

        if props.is_new {
            Badge::new(BadgeKind::New).render(
                ui,
                theme,
                Pos2::new(poster_rect.min.x + 8.0, poster_rect.min.y + 8.0),
            );
        }

        if props.versions_count > 1 {
            let _ = Badge::new(BadgeKind::Versions(props.versions_count)).render(
                ui,
                theme,
                Pos2::new(poster_rect.max.x - 76.0, poster_rect.min.y + 8.0),
            );
        }

        if props.is_unidentified {
            Badge::new(BadgeKind::Unidentified).render(
                ui,
                theme,
                Pos2::new(poster_rect.min.x + 8.0, poster_rect.max.y - 28.0),
            );
        }

        if let Some(prog) = props.progress {
            if prog > 0.0 && prog < 0.98 {
                let bar_h = 3.5;
                let bar_bg = Rect::from_min_size(
                    Pos2::new(poster_rect.min.x, poster_rect.max.y - bar_h),
                    Vec2::new(poster_rect.width(), bar_h),
                );
                ui.painter().rect_filled(
                    bar_bg,
                    CornerRadius::ZERO,
                    Color32::from_black_alpha(150),
                );

                let fill_w = poster_rect.width() * prog.clamp(0.0, 1.0);
                let bar_fill = Rect::from_min_size(
                    Pos2::new(poster_rect.min.x, poster_rect.max.y - bar_h),
                    Vec2::new(fill_w, bar_h),
                );
                ui.painter()
                    .rect_filled(bar_fill, CornerRadius::ZERO, theme.accent_blue);
            }
        }

        let text_y = poster_rect.max.y + 6.0;

        let max_w = (rect.width() - 4.0).max(10.0);
        let title_col = if is_hovered || props.is_focused {
            theme.accent_blue
        } else {
            theme.text_primary
        };
        let title_font = FontId::proportional(13.0);
        let disp_title = crate::ui_helpers::truncate_text_exact(ui.painter(), props.title, title_font.clone(), max_w);
        let clip_painter = ui.painter().with_clip_rect(Rect::from_min_max(rect.min, Pos2::new(rect.max.x, rect.max.y + 60.0)));
        clip_painter.text(
            Pos2::new(rect.min.x, text_y),
            Align2::LEFT_TOP,
            disp_title,
            title_font,
            title_col,
        );

        let meta_y = text_y + 18.0;
        let meta_font = FontId::proportional(11.5);
        let disp_meta = crate::ui_helpers::truncate_text_exact(ui.painter(), props.meta_text, meta_font.clone(), max_w);
        clip_painter.text(
            Pos2::new(rect.min.x, meta_y),
            Align2::LEFT_TOP,
            disp_meta,
            meta_font,
            theme.text_muted,
        );

        let status_y = meta_y + 16.0;
        if let Some(resume) = props.resume_text {
            ui.painter().text(
                Pos2::new(rect.min.x, status_y),
                Align2::LEFT_TOP,
                resume,
                FontId::proportional(11.5),
                Color32::from_rgb(239, 68, 68),
            );
        } else if props.is_watched {
            ui.painter().text(
                Pos2::new(rect.min.x, status_y),
                Align2::LEFT_TOP,
                "✓ Watched",
                FontId::proportional(11.5),
                Color32::from_rgb(52, 211, 153),
            );
        }

        resp.on_hover_ui(|ui| {
            ui.label(props.title);
            if !props.meta_text.is_empty() {
                ui.label(props.meta_text);
            }
        })
    }
}

pub struct ListRowProps<'a> {
    pub fingerprint: &'a str,
    pub title: &'a str,
    pub year: Option<u32>,
    pub duration_text: &'a str,
    pub resolution: Option<&'a str>,
    pub is_hdr: bool,
    pub progress: Option<f32>,
    pub last_played_text: Option<&'a str>,
    pub size_text: &'a str,
    pub is_focused: bool,
}

pub struct ListRow;

impl ListRow {
    pub fn show(ui: &mut Ui, theme: &ValorTheme, rect: Rect, props: ListRowProps) -> Response {
        let resp = ui.allocate_rect(rect, Sense::click());
        let is_hovered = resp.hovered();

        let bg = if props.is_focused {
            Color32::from_rgba_premultiplied(37, 99, 235, 35)
        } else if is_hovered {
            Color32::from_rgba_premultiplied(255, 255, 255, 8)
        } else {
            Color32::TRANSPARENT
        };
        ui.painter().rect_filled(rect, CornerRadius::same(4), bg);

        if props.is_focused {
            ui.painter().rect_stroke(
                rect,
                CornerRadius::same(4),
                Stroke::new(1.0, theme.accent_blue),
                egui::StrokeKind::Inside,
            );
        }

        let thumb_rect = Rect::from_min_size(
            Pos2::new(rect.min.x + 12.0, rect.center().y - 13.0),
            Vec2::new(40.0, 26.0),
        );
        let col = letter_avatar_color(props.title);
        ui.painter()
            .rect_filled(thumb_rect, CornerRadius::same(3), col);
        let initial = props
            .title
            .chars()
            .find(|c| c.is_alphanumeric())
            .unwrap_or('?')
            .to_uppercase()
            .to_string();
        ui.painter().text(
            thumb_rect.center(),
            Align2::CENTER_CENTER,
            initial,
            FontId::proportional(12.0),
            Color32::WHITE,
        );

        let title_col = if is_hovered || props.is_focused {
            theme.accent_blue
        } else {
            theme.text_primary
        };
        ui.painter().text(
            Pos2::new(rect.min.x + 64.0, rect.center().y),
            Align2::LEFT_CENTER,
            props.title,
            FontId::proportional(13.0),
            title_col,
        );

        let year_str = props
            .year
            .map(|y| y.to_string())
            .unwrap_or_else(|| "—".to_string());
        ui.painter().text(
            Pos2::new(rect.min.x + 380.0, rect.center().y),
            Align2::LEFT_CENTER,
            year_str,
            FontId::proportional(12.0),
            theme.text_muted,
        );

        ui.painter().text(
            Pos2::new(rect.min.x + 450.0, rect.center().y),
            Align2::LEFT_CENTER,
            props.duration_text,
            FontId::proportional(12.0),
            theme.text_muted,
        );

        let mut badge_x = rect.min.x + 530.0;
        if let Some(res) = props.resolution {
            let b = Badge::new(BadgeKind::Resolution(res.to_string())).render(
                ui,
                theme,
                Pos2::new(badge_x, rect.center().y - 8.0),
            );
            badge_x = b.max.x + 4.0;
        }
        if props.is_hdr {
            Badge::new(BadgeKind::Hdr).render(ui, theme, Pos2::new(badge_x, rect.center().y - 8.0));
        }

        let p_bar = Rect::from_min_size(
            Pos2::new(rect.min.x + 630.0, rect.center().y - 2.5),
            Vec2::new(70.0, 5.0),
        );
        ui.painter()
            .rect_filled(p_bar, CornerRadius::same(2), Color32::from_rgb(30, 41, 59));
        if let Some(prog) = props.progress {
            if prog > 0.0 {
                let fill = Rect::from_min_size(
                    p_bar.min,
                    Vec2::new(p_bar.width() * prog.clamp(0.0, 1.0), 5.0),
                );
                ui.painter()
                    .rect_filled(fill, CornerRadius::same(2), theme.accent_blue);
            }
        }

        let lp_str = props.last_played_text.unwrap_or("Never");
        ui.painter().text(
            Pos2::new(rect.min.x + 720.0, rect.center().y),
            Align2::LEFT_CENTER,
            lp_str,
            FontId::proportional(11.5),
            theme.text_muted,
        );

        ui.painter().text(
            Pos2::new(rect.max.x - 24.0, rect.center().y),
            Align2::RIGHT_CENTER,
            props.size_text,
            FontId::proportional(12.0),
            theme.text_muted,
        );

        ui.painter().hline(
            rect.x_range(),
            rect.max.y,
            Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 10)),
        );

        resp
    }
}
