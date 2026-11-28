//! Custom-painted CnX Player UI kit widgets and Lucide/Phosphor-style vector icons.
//! Zero default egui Button/Slider/ComboBox/Checkbox styling is used.

use egui::{
    self, Align2, Color32, CornerRadius, CursorIcon, Id, Order, Painter, Rect, Response,
    Sense, Shape, Stroke, StrokeKind, Ui, Vec2, pos2, vec2,
};

use crate::cnx_theme::*;

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum CnxIcon {
    Back,
    Cast,
    Pip,
    Lock,
    Queue,
    Volume,
    Mute,
    SpeedGauge,
    Prev,
    Replay10,
    PlayFilled,
    PauseFilled,
    Forward10,
    Next,
    StopSquare,
    Bookmark,
    Captions,
    Sliders,
    Fullscreen,
    ExitFullscreen,
    Shuffle,
    Pin,
    CloseX,
    Check,
    Plus,
    Minus,
    Camera,
    Doc,
    ChevronDown,
    LockSmall,
    Trash,
    VideoTab,
    PlaybackTab,
    ChaptersTab,
    InfoTab,
}

/// Custom Lucide/Phosphor-style vector icon painter (rounded caps & joins).
pub fn draw_cnx_icon(
    painter: &Painter,
    rect: Rect,
    icon: CnxIcon,
    color: Color32,
    stroke_w: f32,
) {
    let c = rect.center();
    let r = rect.width().min(rect.height()) * 0.5;
    let st = Stroke::new(stroke_w, color);

    match icon {
        CnxIcon::Back => {
            let w = r * 0.72;
            painter.line_segment([pos2(c.x + w, c.y), pos2(c.x - w, c.y)], st);
            painter.line_segment([pos2(c.x - w * 0.25, c.y - w * 0.68), pos2(c.x - w, c.y)], st);
            painter.line_segment([pos2(c.x - w * 0.25, c.y + w * 0.68), pos2(c.x - w, c.y)], st);
        }
        CnxIcon::Cast => {
            let box_r = Rect::from_center_size(c, vec2(r * 1.5, r * 1.15));
            painter.rect_stroke(box_r, CornerRadius::same(2), st, StrokeKind::Middle);
            let ox = box_r.left() + 2.0;
            let oy = box_r.bottom() - 2.0;
            painter.circle_filled(pos2(ox + 1.5, oy - 1.5), 1.4, color);
            painter.line_segment([pos2(ox, oy - 5.0), pos2(ox + 5.0, oy)], st);
            painter.line_segment([pos2(ox, oy - 9.0), pos2(ox + 9.0, oy)], st);
        }
        CnxIcon::Pip => {
            let outer = Rect::from_center_size(c, vec2(r * 1.55, r * 1.2));
            painter.rect_stroke(outer, CornerRadius::same(2), st, StrokeKind::Middle);
            let inner = Rect::from_min_max(
                pos2(outer.center().x - 1.0, outer.center().y - 1.0),
                pos2(outer.right() - 2.5, outer.bottom() - 2.5),
            );
            painter.rect_filled(inner, CornerRadius::same(1), color);
        }
        CnxIcon::Lock | CnxIcon::LockSmall => {
            let bw = r * 1.15;
            let bh = r * 0.85;
            let body = Rect::from_center_size(pos2(c.x, c.y + r * 0.25), vec2(bw, bh));
            painter.rect_stroke(body, CornerRadius::same(2), st, StrokeKind::Middle);
            let aw = bw * 0.34;
            let top_y = body.top();
            painter.line_segment([pos2(c.x - aw, top_y), pos2(c.x - aw, top_y - r * 0.45)], st);
            painter.line_segment([pos2(c.x + aw, top_y), pos2(c.x + aw, top_y - r * 0.45)], st);
            painter.line_segment(
                [pos2(c.x - aw, top_y - r * 0.45), pos2(c.x + aw, top_y - r * 0.45)],
                st,
            );
        }
        CnxIcon::Queue => {
            for (i, dy) in [-0.48_f32, 0.0, 0.48].iter().enumerate() {
                let y = c.y + r * dy;
                let left = if i == 0 { c.x - r * 0.65 } else { c.x - r * 0.45 };
                painter.line_segment([pos2(left, y), pos2(c.x + r * 0.72, y)], st);
                if i > 0 {
                    painter.circle_filled(pos2(c.x - r * 0.68, y), 1.3, color);
                }
            }
        }
        CnxIcon::Volume => {
            let pts = vec![
                pos2(c.x - r * 0.65, c.y - r * 0.26),
                pos2(c.x - r * 0.28, c.y - r * 0.26),
                pos2(c.x + r * 0.12, c.y - r * 0.62),
                pos2(c.x + r * 0.12, c.y + r * 0.62),
                pos2(c.x - r * 0.28, c.y + r * 0.26),
                pos2(c.x - r * 0.65, c.y + r * 0.26),
            ];
            painter.add(Shape::closed_line(pts, st));
            painter.line_segment(
                [pos2(c.x + r * 0.42, c.y - r * 0.32), pos2(c.x + r * 0.42, c.y + r * 0.32)],
                st,
            );
            painter.line_segment(
                [pos2(c.x + r * 0.70, c.y - r * 0.52), pos2(c.x + r * 0.70, c.y + r * 0.52)],
                st,
            );
        }
        CnxIcon::Mute => {
            let pts = vec![
                pos2(c.x - r * 0.65, c.y - r * 0.26),
                pos2(c.x - r * 0.28, c.y - r * 0.26),
                pos2(c.x + r * 0.12, c.y - r * 0.62),
                pos2(c.x + r * 0.12, c.y + r * 0.62),
                pos2(c.x - r * 0.28, c.y + r * 0.26),
                pos2(c.x - r * 0.65, c.y + r * 0.26),
            ];
            painter.add(Shape::closed_line(pts, st));
            painter.line_segment(
                [pos2(c.x + r * 0.35, c.y - r * 0.25), pos2(c.x + r * 0.78, c.y + r * 0.25)],
                st,
            );
            painter.line_segment(
                [pos2(c.x + r * 0.78, c.y - r * 0.25), pos2(c.x + r * 0.35, c.y + r * 0.25)],
                st,
            );
        }
        CnxIcon::SpeedGauge => {
            painter.circle_stroke(c, r * 0.72, st);
            painter.line_segment([c, pos2(c.x + r * 0.42, c.y - r * 0.36)], st);
            painter.circle_filled(c, 1.5, color);
        }
        CnxIcon::Prev => {
            let x_bar = c.x - r * 0.55;
            painter.line_segment([pos2(x_bar, c.y - r * 0.52), pos2(x_bar, c.y + r * 0.52)], st);
            painter.add(Shape::convex_polygon(
                vec![
                    pos2(c.x + r * 0.55, c.y - r * 0.52),
                    pos2(c.x - r * 0.28, c.y),
                    pos2(c.x + r * 0.55, c.y + r * 0.52),
                ],
                color,
                Stroke::NONE,
            ));
        }
        CnxIcon::Next => {
            let x_bar = c.x + r * 0.55;
            painter.line_segment([pos2(x_bar, c.y - r * 0.52), pos2(x_bar, c.y + r * 0.52)], st);
            painter.add(Shape::convex_polygon(
                vec![
                    pos2(c.x - r * 0.55, c.y - r * 0.52),
                    pos2(c.x + r * 0.28, c.y),
                    pos2(c.x - r * 0.55, c.y + r * 0.52),
                ],
                color,
                Stroke::NONE,
            ));
        }
        CnxIcon::Replay10 => {
            let ar = r * 0.78;
            let mut pts = Vec::new();
            // Open arc from top-left (-115 deg) counter-clockwise around bottom to top (+90 deg)
            for i in 0..=18 {
                let deg = -20.0 + 275.0 * (i as f32 / 18.0);
                let a = deg.to_radians();
                pts.push(pos2(c.x + ar * a.cos(), c.y + ar * a.sin()));
            }
            painter.add(Shape::line(pts, st));
            // Arrowhead at top pointing left
            let tip = pos2(c.x - ar * 0.25, c.y - ar * 0.96);
            painter.line_segment([tip, pos2(tip.x + 4.0, tip.y - 3.0)], st);
            painter.line_segment([tip, pos2(tip.x + 4.0, tip.y + 3.5)], st);
            painter.text(
                pos2(c.x, c.y + 1.0),
                Align2::CENTER_CENTER,
                "10",
                font_mono(8.5),
                color,
            );
        }
        CnxIcon::Forward10 => {
            let ar = r * 0.78;
            let mut pts = Vec::new();
            // Open arc from top (-90 deg) clockwise around bottom to top-left (+200 deg)
            for i in 0..=18 {
                let deg = -75.0 + 275.0 * (i as f32 / 18.0);
                let a = deg.to_radians();
                pts.push(pos2(c.x + ar * a.cos(), c.y + ar * a.sin()));
            }
            painter.add(Shape::line(pts, st));
            // Arrowhead at top pointing right
            let tip = pos2(c.x + ar * 0.25, c.y - ar * 0.96);
            painter.line_segment([tip, pos2(tip.x - 4.0, tip.y - 3.0)], st);
            painter.line_segment([tip, pos2(tip.x - 4.0, tip.y + 3.5)], st);
            painter.text(
                pos2(c.x, c.y + 1.0),
                Align2::CENTER_CENTER,
                "10",
                font_mono(8.5),
                color,
            );
        }
        CnxIcon::PlayFilled => {
            let pts = vec![
                pos2(c.x - r * 0.36, c.y - r * 0.56),
                pos2(c.x + r * 0.58, c.y),
                pos2(c.x - r * 0.36, c.y + r * 0.56),
            ];
            painter.add(Shape::convex_polygon(pts, color, Stroke::NONE));
        }
        CnxIcon::PauseFilled => {
            let w = r * 0.26;
            let h = r * 0.96;
            painter.rect_filled(
                Rect::from_center_size(pos2(c.x - r * 0.28, c.y), vec2(w, h)),
                CornerRadius::same(2),
                color,
            );
            painter.rect_filled(
                Rect::from_center_size(pos2(c.x + r * 0.28, c.y), vec2(w, h)),
                CornerRadius::same(2),
                color,
            );
        }
        CnxIcon::StopSquare => {
            painter.rect_filled(
                Rect::from_center_size(c, vec2(12.0, 12.0)),
                CornerRadius::same(2),
                color,
            );
        }
        CnxIcon::Bookmark => {
            let pts = vec![
                pos2(c.x - r * 0.45, c.y - r * 0.65),
                pos2(c.x + r * 0.45, c.y - r * 0.65),
                pos2(c.x + r * 0.45, c.y + r * 0.68),
                pos2(c.x, c.y + r * 0.28),
                pos2(c.x - r * 0.45, c.y + r * 0.68),
            ];
            painter.add(Shape::closed_line(pts, st));
        }
        CnxIcon::Captions => {
            let box_r = Rect::from_center_size(c, vec2(r * 1.5, r * 1.1));
            painter.rect_stroke(box_r, CornerRadius::same(3), st, StrokeKind::Middle);
            painter.line_segment(
                [pos2(c.x - r * 0.42, c.y - r * 0.14), pos2(c.x + r * 0.08, c.y - r * 0.14)],
                st,
            );
            painter.line_segment(
                [pos2(c.x - r * 0.42, c.y + r * 0.20), pos2(c.x + r * 0.42, c.y + r * 0.20)],
                st,
            );
        }
        CnxIcon::Sliders => {
            for (idx, dy) in [-0.45_f32, 0.0, 0.45].iter().enumerate() {
                let y = c.y + r * dy;
                painter.line_segment([pos2(c.x - r * 0.68, y), pos2(c.x + r * 0.68, y)], st);
                let kx = match idx {
                    0 => c.x - r * 0.25,
                    1 => c.x + r * 0.28,
                    _ => c.x - r * 0.08,
                };
                painter.circle_filled(pos2(kx, y), 2.3, color);
            }
        }
        CnxIcon::Fullscreen => {
            let d = r * 0.62;
            let k = r * 0.26;
            painter.line_segment([pos2(c.x - d, c.y - d), pos2(c.x - d + k, c.y - d)], st);
            painter.line_segment([pos2(c.x - d, c.y - d), pos2(c.x - d, c.y - d + k)], st);
            painter.line_segment([pos2(c.x + d, c.y - d), pos2(c.x + d - k, c.y - d)], st);
            painter.line_segment([pos2(c.x + d, c.y - d), pos2(c.x + d, c.y - d + k)], st);
            painter.line_segment([pos2(c.x - d, c.y + d), pos2(c.x - d + k, c.y + d)], st);
            painter.line_segment([pos2(c.x - d, c.y + d), pos2(c.x - d, c.y + d - k)], st);
            painter.line_segment([pos2(c.x + d, c.y + d), pos2(c.x + d - k, c.y + d)], st);
            painter.line_segment([pos2(c.x + d, c.y + d), pos2(c.x + d, c.y + d - k)], st);
        }
        CnxIcon::ExitFullscreen => {
            let d = r * 0.28;
            let k = r * 0.62;
            painter.line_segment([pos2(c.x - d, c.y - d), pos2(c.x - k, c.y - d)], st);
            painter.line_segment([pos2(c.x - d, c.y - d), pos2(c.x - d, c.y - k)], st);
            painter.line_segment([pos2(c.x + d, c.y - d), pos2(c.x + k, c.y - d)], st);
            painter.line_segment([pos2(c.x + d, c.y - d), pos2(c.x + d, c.y - k)], st);
            painter.line_segment([pos2(c.x - d, c.y + d), pos2(c.x - k, c.y + d)], st);
            painter.line_segment([pos2(c.x - d, c.y + d), pos2(c.x - d, c.y + k)], st);
            painter.line_segment([pos2(c.x + d, c.y + d), pos2(c.x + k, c.y + d)], st);
            painter.line_segment([pos2(c.x + d, c.y + d), pos2(c.x + d, c.y + k)], st);
        }
        CnxIcon::Shuffle => {
            painter.line_segment(
                [pos2(c.x - r * 0.65, c.y - r * 0.38), pos2(c.x + r * 0.65, c.y + r * 0.38)],
                st,
            );
            painter.line_segment(
                [pos2(c.x - r * 0.65, c.y + r * 0.38), pos2(c.x + r * 0.65, c.y - r * 0.38)],
                st,
            );
        }
        CnxIcon::Pin => {
            painter.line_segment(
                [pos2(c.x - r * 0.35, c.y - r * 0.55), pos2(c.x + r * 0.35, c.y - r * 0.55)],
                st,
            );
            painter.line_segment([pos2(c.x, c.y - r * 0.55), pos2(c.x, c.y + r * 0.65)], st);
            painter.line_segment(
                [pos2(c.x - r * 0.45, c.y + r * 0.1), pos2(c.x + r * 0.45, c.y + r * 0.1)],
                st,
            );
        }
        CnxIcon::CloseX => {
            let d = r * 0.48;
            painter.line_segment([pos2(c.x - d, c.y - d), pos2(c.x + d, c.y + d)], st);
            painter.line_segment([pos2(c.x + d, c.y - d), pos2(c.x - d, c.y + d)], st);
        }
        CnxIcon::Check => {
            painter.line_segment(
                [pos2(c.x - r * 0.52, c.y + r * 0.05), pos2(c.x - r * 0.12, c.y + r * 0.45)],
                st,
            );
            painter.line_segment(
                [pos2(c.x - r * 0.12, c.y + r * 0.45), pos2(c.x + r * 0.55, c.y - r * 0.42)],
                st,
            );
        }
        CnxIcon::Plus => {
            let d = r * 0.5;
            painter.line_segment([pos2(c.x - d, c.y), pos2(c.x + d, c.y)], st);
            painter.line_segment([pos2(c.x, c.y - d), pos2(c.x, c.y + d)], st);
        }
        CnxIcon::Minus => {
            let d = r * 0.5;
            painter.line_segment([pos2(c.x - d, c.y), pos2(c.x + d, c.y)], st);
        }
        CnxIcon::Camera => {
            let body = Rect::from_center_size(pos2(c.x, c.y + r * 0.08), vec2(r * 1.45, r * 1.05));
            painter.rect_stroke(body, CornerRadius::same(2), st, StrokeKind::Middle);
            painter.circle_stroke(body.center(), r * 0.28, st);
        }
        CnxIcon::Doc => {
            let body = Rect::from_center_size(c, vec2(r * 1.15, r * 1.4));
            painter.rect_stroke(body, CornerRadius::same(2), st, StrokeKind::Middle);
            painter.line_segment([pos2(c.x - r * 0.3, c.y - r * 0.2), pos2(c.x + r * 0.3, c.y - r * 0.2)], st);
            painter.line_segment([pos2(c.x - r * 0.3, c.y + r * 0.18), pos2(c.x + r * 0.3, c.y + r * 0.18)], st);
        }
        CnxIcon::ChevronDown => {
            painter.line_segment(
                [pos2(c.x - r * 0.48, c.y - r * 0.18), pos2(c.x, c.y + r * 0.26)],
                st,
            );
            painter.line_segment(
                [pos2(c.x, c.y + r * 0.26), pos2(c.x + r * 0.48, c.y - r * 0.18)],
                st,
            );
        }
        CnxIcon::Trash => {
            let box_r = Rect::from_center_size(pos2(c.x, c.y + r * 0.15), vec2(r * 0.95, r * 1.0));
            painter.rect_stroke(box_r, CornerRadius::same(2), st, StrokeKind::Middle);
            painter.line_segment(
                [pos2(c.x - r * 0.65, c.y - r * 0.42), pos2(c.x + r * 0.65, c.y - r * 0.42)],
                st,
            );
        }
        CnxIcon::VideoTab => {
            let b = Rect::from_center_size(c, vec2(r * 1.4, r * 1.05));
            painter.rect_stroke(b, CornerRadius::same(2), st, StrokeKind::Middle);
            painter.circle_filled(pos2(b.left() + 4.0, b.top() + 4.0), 1.4, color);
        }
        CnxIcon::PlaybackTab => {
            let pts = vec![
                pos2(c.x - r * 0.32, c.y - r * 0.48),
                pos2(c.x + r * 0.48, c.y),
                pos2(c.x - r * 0.32, c.y + r * 0.48),
            ];
            painter.add(Shape::convex_polygon(pts, color, Stroke::NONE));
        }
        CnxIcon::ChaptersTab => {
            for dy in [-0.4_f32, 0.0, 0.4] {
                let y = c.y + r * dy;
                painter.circle_filled(pos2(c.x - r * 0.55, y), 1.3, color);
                painter.line_segment([pos2(c.x - r * 0.25, y), pos2(c.x + r * 0.6, y)], st);
            }
        }
        CnxIcon::InfoTab => {
            painter.circle_stroke(c, r * 0.68, st);
            painter.circle_filled(pos2(c.x, c.y - r * 0.28), 1.2, color);
            painter.line_segment([pos2(c.x, c.y - r * 0.04), pos2(c.x, c.y + r * 0.36)], st);
        }
    }
}

pub fn draw_scrim_top(painter: &Painter, rect: Rect, alpha: f32) {
    let mut mesh = egui::Mesh::default();
    let top_col = Color32::from_rgba_unmultiplied(0, 0, 0, (191.0 * alpha) as u8);
    mesh.colored_vertex(rect.left_top(), top_col);
    mesh.colored_vertex(rect.right_top(), top_col);
    mesh.colored_vertex(rect.right_bottom(), Color32::TRANSPARENT);
    mesh.colored_vertex(rect.left_bottom(), Color32::TRANSPARENT);
    mesh.add_triangle(0, 1, 2);
    mesh.add_triangle(0, 2, 3);
    painter.add(Shape::mesh(mesh));
}

pub fn draw_scrim_bottom(painter: &Painter, rect: Rect, alpha: f32) {
    let mut mesh = egui::Mesh::default();
    let bot_col = Color32::from_rgba_unmultiplied(0, 0, 0, (204.0 * alpha) as u8);
    mesh.colored_vertex(rect.left_top(), Color32::TRANSPARENT);
    mesh.colored_vertex(rect.right_top(), Color32::TRANSPARENT);
    mesh.colored_vertex(rect.right_bottom(), bot_col);
    mesh.colored_vertex(rect.left_bottom(), bot_col);
    mesh.add_triangle(0, 1, 2);
    mesh.add_triangle(0, 2, 3);
    painter.add(Shape::mesh(mesh));
}

pub fn cnx_icon_button(
    ui: &mut Ui,
    id: Id,
    rect: Rect,
    icon: CnxIcon,
    icon_px: f32,
    active: bool,
    circle_hover: bool,
    alpha: f32,
    tooltip: &str,
) -> Response {
    let resp = ui.allocate_rect(rect, Sense::click());
    if resp.hovered() {
        ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
    }
    let hov_t = ui.ctx().animate_bool_with_time(id.with("hov"), resp.hovered(), 0.12);
    if active {
        ui.painter().circle_filled(
            rect.center(),
            rect.width().min(rect.height()) * 0.5,
            Color32::from_rgba_unmultiplied(
                ACCENT_STRONG.r(),
                ACCENT_STRONG.g(),
                ACCENT_STRONG.b(),
                (255.0 * alpha) as u8,
            ),
        );
    } else if hov_t > 0.01 {
        let bg = if resp.is_pointer_button_down_on() {
            SURFACE_PRESSED
        } else {
            SURFACE_HOVER
        };
        let col = Color32::from_rgba_unmultiplied(bg.r(), bg.g(), bg.b(), (bg.a() as f32 * hov_t * alpha) as u8);
        if circle_hover {
            ui.painter()
                .circle_filled(rect.center(), rect.width().min(rect.height()) * 0.5, col);
        } else {
            ui.painter().rect_filled(rect, CornerRadius::same(10), col);
        }
    }

    let icon_col = if active {
        Color32::from_rgba_unmultiplied(
            ACCENT_CONTAINER_TEXT.r(),
            ACCENT_CONTAINER_TEXT.g(),
            ACCENT_CONTAINER_TEXT.b(),
            (255.0 * alpha) as u8,
        )
    } else {
        Color32::from_rgba_unmultiplied(
            TEXT_PRIMARY.r(),
            TEXT_PRIMARY.g(),
            TEXT_PRIMARY.b(),
            (255.0 * alpha) as u8,
        )
    };
    let icon_r = Rect::from_center_size(rect.center(), Vec2::splat(icon_px));
    draw_cnx_icon(ui.painter(), icon_r, icon, icon_col, 1.75);

    if !tooltip.is_empty() {
        resp.clone().on_hover_text(tooltip);
    }
    resp
}

pub fn cnx_lock_chip(ui: &mut Ui, label: Option<&str>) {
    let h = 22.0_f32;
    let w = match label {
        Some(txt) => 22.0 + txt.len() as f32 * 6.0,
        None => 24.0,
    };
    let (rect, _) = ui.allocate_exact_size(vec2(w, h), Sense::hover());
    ui.painter()
        .rect_filled(rect, CornerRadius::same(6), ACCENT_TINT);
    let icon_r = if label.is_some() {
        Rect::from_center_size(pos2(rect.left() + 11.0, rect.center().y), vec2(10.0, 10.0))
    } else {
        Rect::from_center_size(rect.center(), vec2(10.0, 10.0))
    };
    draw_cnx_icon(ui.painter(), icon_r, CnxIcon::LockSmall, ACCENT, 1.4);
    if let Some(txt) = label {
        ui.painter().text(
            pos2(rect.left() + 19.0, rect.center().y),
            Align2::LEFT_CENTER,
            txt,
            font_outfit_semibold(11.0),
            ACCENT,
        );
    }
}

pub fn cnx_chip_button(ui: &mut Ui, label: &str, selected: bool, locked: bool) -> bool {
    let w = (label.len() as f32 * 7.2 + 28.0).max(52.0);
    let (rect, resp) = ui.allocate_exact_size(
        vec2(w, 30.0),
        if locked { Sense::hover() } else { Sense::click() },
    );
    if !locked && resp.hovered() {
        ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
    }
    let fill = if locked {
        SURFACE_RAISED
    } else if selected {
        ACCENT_TINT
    } else if resp.hovered() {
        SURFACE_HOVER
    } else {
        SURFACE_RAISED
    };
    let txt_col = if locked {
        TEXT_DISABLED
    } else if selected {
        ACCENT
    } else {
        TEXT_SECONDARY
    };
    ui.painter()
        .rect_filled(rect, CornerRadius::same(R_CHIP), fill);
    ui.painter().text(
        rect.center(),
        Align2::CENTER_CENTER,
        label,
        font_outfit_medium(12.0),
        txt_col,
    );
    !locked && resp.clicked()
}

pub fn cnx_segmented(
    ui: &mut Ui,
    id: Id,
    items: &[(Option<CnxIcon>, &str)],
    selected: usize,
    total_w: f32,
    mono: bool,
) -> Option<usize> {
    let h = 40.0_f32;
    let (track_rect, _) = ui.allocate_exact_size(vec2(total_w, h), Sense::hover());
    ui.painter()
        .rect_filled(track_rect, CornerRadius::same(R_SEG_TRACK), SURFACE_RAISED);

    let inner = track_rect.shrink(4.0);
    let n = items.len().max(1);
    let seg_w = inner.width() / n as f32;

    // 180ms animated sliding indicator
    let anim_x = ui.ctx().animate_value_with_time(
        id.with("seg_x"),
        inner.left() + seg_w * selected as f32,
        0.18,
    );
    let ind_rect = Rect::from_min_size(pos2(anim_x, inner.top()), vec2(seg_w, inner.height()));
    ui.painter()
        .rect_filled(ind_rect, CornerRadius::same(R_SEG), ACCENT_CONTAINER);

    let mut clicked_idx = None;
    for (i, (icon_opt, lbl)) in items.iter().enumerate() {
        let seg_rect = Rect::from_min_size(
            pos2(inner.left() + seg_w * i as f32, inner.top()),
            vec2(seg_w, inner.height()),
        );
        let resp = ui.interact(seg_rect, id.with(("seg", i)), Sense::click());
        if resp.hovered() {
            ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
            if i != selected {
                ui.painter()
                    .rect_filled(seg_rect, CornerRadius::same(R_SEG), SURFACE_HOVER);
            }
        }
        let is_sel = i == selected;
        let col = if is_sel {
            ACCENT_CONTAINER_TEXT
        } else {
            TEXT_SECONDARY
        };
        let font = if mono {
            font_mono(12.0)
        } else {
            font_outfit_medium(13.0)
        };
        if let Some(ico) = icon_opt {
            let cx = seg_rect.center().x;
            let icon_r = Rect::from_center_size(pos2(cx - (lbl.len() as f32 * 3.1) - 6.0, seg_rect.center().y), vec2(14.0, 14.0));
            draw_cnx_icon(ui.painter(), icon_r, *ico, col, 1.65);
            ui.painter().text(
                pos2(icon_r.right() + 6.0, seg_rect.center().y),
                Align2::LEFT_CENTER,
                *lbl,
                font,
                col,
            );
        } else {
            ui.painter()
                .text(seg_rect.center(), Align2::CENTER_CENTER, *lbl, font, col);
        }
        if resp.clicked() {
            clicked_idx = Some(i);
        }
    }
    clicked_idx
}

pub fn cnx_bipolar_slider(
    ui: &mut Ui,
    id: Id,
    label: &str,
    value: &mut i32,
    min: i32,
    max: i32,
    locked: bool,
) -> bool {
    let w = ui.available_width();
    let (rect, resp) = ui.allocate_exact_size(
        vec2(w, 42.0),
        if locked { Sense::hover() } else { Sense::click_and_drag() },
    );
    if !locked && resp.hovered() {
        ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
    }

    let lbl_col = if locked { TEXT_DISABLED } else { TEXT_PRIMARY };
    let val_col = if locked { TEXT_DISABLED } else { ACCENT };
    ui.painter().text(
        pos2(rect.left(), rect.top() + 8.0),
        Align2::LEFT_CENTER,
        label,
        font_outfit_medium(13.0),
        lbl_col,
    );
    if locked {
        let lock_r = Rect::from_center_size(
            pos2(rect.left() + label.len() as f32 * 7.2 + 16.0, rect.top() + 8.0),
            vec2(10.0, 10.0),
        );
        draw_cnx_icon(ui.painter(), lock_r, CnxIcon::LockSmall, ACCENT, 1.4);
    }
    ui.painter().text(
        pos2(rect.right(), rect.top() + 8.0),
        Align2::RIGHT_CENTER,
        format!("{}", *value),
        font_mono(11.0),
        val_col,
    );

    let track_y = rect.top() + 28.0;
    let track_rect = Rect::from_min_max(pos2(rect.left(), track_y - 2.0), pos2(rect.right(), track_y + 2.0));
    let mut changed = false;

    if !locked {
        if resp.double_clicked() {
            *value = 0;
            changed = true;
        } else if resp.dragged() || resp.clicked() {
            if let Some(p) = ui.input(|i| i.pointer.interact_pos()) {
                let frac = ((p.x - track_rect.left()) / track_rect.width().max(1.0)).clamp(0.0, 1.0);
                let next = (min as f32 + frac * (max - min) as f32).round() as i32;
                if next != *value {
                    *value = next;
                    changed = true;
                }
            }
        }
    }

    let frac = ((*value - min) as f32 / (max - min).max(1) as f32).clamp(0.0, 1.0);
    let thumb_x = track_rect.left() + track_rect.width() * frac;

    ui.painter().rect_filled(
        track_rect,
        CornerRadius::same(2),
        if locked { TRACK_LOCKED } else { TRACK_INACTIVE_SMALL },
    );
    if !locked && frac > 0.0 {
        ui.painter().rect_filled(
            Rect::from_min_max(track_rect.min, pos2(thumb_x, track_rect.bottom())),
            CornerRadius::same(2),
            ACCENT,
        );
    }
    let thumb_c = pos2(thumb_x, track_y);
    ui.painter().circle_filled(
        thumb_c,
        9.0,
        if locked { THUMB_LOCKED } else { THUMB_BG },
    );
    if !locked {
        ui.painter().circle_filled(thumb_c, 3.0, ACCENT);
    }
    let _ = id;
    changed
}

pub fn cnx_toggle(ui: &mut Ui, id: Id, on: &mut bool) -> bool {
    let (rect, resp) = ui.allocate_exact_size(vec2(40.0, 22.0), Sense::click());
    if resp.hovered() {
        ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
    }
    let mut changed = false;
    if resp.clicked() {
        *on = !*on;
        changed = true;
    }
    let t = ui.ctx().animate_bool_with_time(id.with("tog"), *on, 0.14);
    let track_col = if *on { ACCENT } else { TRACK_INACTIVE_SMALL };
    ui.painter()
        .rect_filled(rect, CornerRadius::same(11), track_col);
    let knob_x = rect.left() + 11.0 + t * (rect.width() - 22.0);
    let knob_col = if *on {
        ACCENT_CONTAINER_TEXT
    } else {
        Color32::WHITE
    };
    ui.painter()
        .circle_filled(pos2(knob_x, rect.center().y), 8.0, knob_col);
    changed
}

pub fn cnx_select(
    ui: &mut Ui,
    id: Id,
    width: f32,
    height: f32,
    current_label: &str,
    options: &[&str],
    disabled: bool,
) -> Option<usize> {
    let open_id = id.with("open");
    let mut is_open = ui.data(|d| d.get_temp::<bool>(open_id)).unwrap_or(false);
    let (rect, resp) = ui.allocate_exact_size(
        vec2(width, height),
        if disabled { Sense::hover() } else { Sense::click() },
    );
    if !disabled && resp.hovered() {
        ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
    }
    if !disabled && resp.clicked() {
        is_open = !is_open;
        ui.data_mut(|d| d.insert_temp(open_id, is_open));
    }
    let bg = if !disabled && resp.hovered() {
        SURFACE_HOVER
    } else {
        SURFACE_RAISED
    };
    ui.painter()
        .rect_filled(rect, CornerRadius::same(R_INPUT), bg);
    ui.painter().rect_stroke(
        rect,
        CornerRadius::same(R_INPUT),
        Stroke::new(1.0, BORDER_HAIRLINE),
        StrokeKind::Inside,
    );
    ui.painter().text(
        pos2(rect.left() + 12.0, rect.center().y),
        Align2::LEFT_CENTER,
        current_label,
        font_outfit_medium(13.0),
        if disabled { TEXT_DISABLED } else { TEXT_PRIMARY },
    );
    let chev_r = Rect::from_center_size(pos2(rect.right() - 16.0, rect.center().y), vec2(14.0, 14.0));
    draw_cnx_icon(
        ui.painter(),
        chev_r,
        CnxIcon::ChevronDown,
        if disabled { TEXT_DISABLED } else { TEXT_SECONDARY },
        1.5,
    );

    let mut picked = None;
    if is_open && !disabled {
        let pop_h = (options.len() as f32 * 34.0 + 8.0).min(220.0);
        let pop_pos = pos2(rect.left(), rect.bottom() + 4.0);
        let pop_rect = Rect::from_min_size(pop_pos, vec2(width, pop_h));
        if ui.input(|i| i.pointer.any_click()) {
            if let Some(p) = ui.input(|i| i.pointer.interact_pos()) {
                if !pop_rect.contains(p) && !rect.contains(p) {
                    ui.data_mut(|d| d.insert_temp(open_id, false));
                }
            }
        }
        egui::Area::new(id.with("popup"))
            .order(Order::Tooltip)
            .fixed_pos(pop_pos)
            .show(ui.ctx(), |ui| {
                egui::Frame::new()
                    .fill(SURFACE_PANEL)
                    .stroke(Stroke::new(1.0, BORDER_HAIRLINE))
                    .corner_radius(CornerRadius::same(R_INPUT))
                    .shadow(panel_shadow())
                    .inner_margin(4.0)
                    .show(ui, |ui| {
                        ui.set_width(width - 8.0);
                        for (idx, opt) in options.iter().enumerate() {
                            let (r, r_resp) = ui.allocate_exact_size(vec2(ui.available_width(), 32.0), Sense::click());
                            if r_resp.hovered() {
                                ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
                                ui.painter().rect_filled(r, CornerRadius::same(6), SURFACE_HOVER);
                            }
                            let is_cur = *opt == current_label;
                            if is_cur {
                                ui.painter().rect_filled(r, CornerRadius::same(6), ACCENT_TINT);
                            }
                            ui.painter().text(
                                pos2(r.left() + 10.0, r.center().y),
                                Align2::LEFT_CENTER,
                                *opt,
                                font_outfit_medium(12.5),
                                if is_cur { ACCENT } else { TEXT_PRIMARY },
                            );
                            if r_resp.clicked() {
                                picked = Some(idx);
                                ui.data_mut(|d| d.insert_temp(open_id, false));
                            }
                        }
                    });
            });
    }
    picked
}
