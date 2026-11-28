//! Custom-painted UI Kit widgets and tokens for CnX Player.
//! No default egui widget styling is used.

use crate::cnx_theme::{font_mono, font_outfit_medium, font_outfit_regular, font_outfit_semibold};
use egui::{
    pos2, vec2, Align2, Color32, Context, CornerRadius, CursorIcon, FontId, Galley, Rect,
    Response, Sense, Shape, Stroke, StrokeKind, Ui,
};
use std::sync::Arc;

const fn rgba(r: u8, g: u8, b: u8, a: u8) -> Color32 {
    Color32::from_rgba_premultiplied(
        ((r as u16 * a as u16) / 255) as u8,
        ((g as u16 * a as u16) / 255) as u8,
        ((b as u16 * a as u16) / 255) as u8,
        a,
    )
}

/// Exact CnX History & Shell color tokens.
pub mod tokens {
    use super::{rgba, Color32};

    pub const BG: Color32 = Color32::from_rgb(0x12, 0x10, 0x0E);
    pub const RAIL: Color32 = Color32::from_rgb(0x16, 0x13, 0x0F);
    pub const TOOLBAR: Color32 = Color32::from_rgb(0x0C, 0x0A, 0x09);
    pub const CARD: Color32 = Color32::from_rgb(0x1C, 0x18, 0x14);
    pub const CARD_HOVER: Color32 = Color32::from_rgb(0x26, 0x20, 0x18);
    pub const LINE: Color32 = rgba(255, 255, 255, 15); // 0.06
    pub const TEXT: Color32 = Color32::from_rgb(0xF4, 0xEF, 0xE9);
    pub const TEXT_2: Color32 = Color32::from_rgb(0xA3, 0x9B, 0x93);
    pub const TEXT_3: Color32 = Color32::from_rgb(0x6B, 0x64, 0x5E);
    pub const ACCENT: Color32 = Color32::from_rgb(0xEB, 0x8C, 0x34);
    pub const ACCENT_LIGHT: Color32 = Color32::from_rgb(0xF8, 0xAC, 0x64);
    pub const ACCENT_TINT: Color32 = rgba(0xEB, 0x8C, 0x34, 36); // 0.14
    pub const ACCENT_ON_FILL: Color32 = Color32::from_rgb(0x2A, 0x17, 0x04);
    pub const DANGER: Color32 = Color32::from_rgb(0xE5, 0x60, 0x4D);
    pub const DANGER_TINT: Color32 = rgba(0xE5, 0x60, 0x4D, 41); // 0.16
    pub const CLOSE_HOVER: Color32 = Color32::from_rgb(0xC4, 0x2B, 0x1C);
    pub const TRACK_BG: Color32 = rgba(255, 255, 255, 20); // 0.08
    pub const SUBTLE_BTN_BG: Color32 = rgba(255, 255, 255, 18); // 0.07
    pub const SUBTLE_BTN_HOVER: Color32 = rgba(255, 255, 255, 33); // 0.13
    pub const HEAT_0: Color32 = rgba(255, 255, 255, 13); // 0.05
    pub const HEAT_1: Color32 = Color32::from_rgb(0x5C, 0x35, 0x10);
    pub const HEAT_2: Color32 = Color32::from_rgb(0x9A, 0x5A, 0x1C);
    pub const HEAT_GLOW: Color32 = rgba(0xF8, 0xAC, 0x64, 140); // 0.55
}

#[derive(Clone, Copy, Debug)]
pub struct UiKitPalette {
    pub bg: Color32,
    pub card: Color32,
    pub card_hover: Color32,
    pub line: Color32,
    pub text: Color32,
    pub text_2: Color32,
    pub text_3: Color32,
    pub accent: Color32,
    pub accent_light: Color32,
    pub accent_tint: Color32,
    pub accent_on_fill: Color32,
    pub track_bg: Color32,
    pub subtle_btn_bg: Color32,
    pub subtle_btn_hover: Color32,
    pub heat_0: Color32,
    pub heat_1: Color32,
    pub heat_2: Color32,
    pub heat_glow: Color32,
}

impl Default for UiKitPalette {
    fn default() -> Self {
        Self {
            bg: tokens::BG,
            card: tokens::CARD,
            card_hover: tokens::CARD_HOVER,
            line: tokens::LINE,
            text: tokens::TEXT,
            text_2: tokens::TEXT_2,
            text_3: tokens::TEXT_3,
            accent: tokens::ACCENT,
            accent_light: tokens::ACCENT_LIGHT,
            accent_tint: tokens::ACCENT_TINT,
            accent_on_fill: tokens::ACCENT_ON_FILL,
            track_bg: tokens::TRACK_BG,
            subtle_btn_bg: tokens::SUBTLE_BTN_BG,
            subtle_btn_hover: tokens::SUBTLE_BTN_HOVER,
            heat_0: tokens::HEAT_0,
            heat_1: tokens::HEAT_1,
            heat_2: tokens::HEAT_2,
            heat_glow: tokens::HEAT_GLOW,
        }
    }
}

pub fn contrast_on_accent(accent: Color32) -> Color32 {
    let lum = 0.2126 * accent.r() as f32 + 0.7152 * accent.g() as f32 + 0.0722 * accent.b() as f32;
    if lum > 155.0 {
        Color32::from_rgb(20, 20, 24)
    } else {
        Color32::WHITE
    }
}

pub fn install_palette(ctx: &Context, t: &crate::shell_tokens::ShellTokens) {
    let pal = UiKitPalette {
        bg: t.content_surface,
        card: t.card_fill,
        card_hover: t.hover_fill,
        line: t.divider,
        text: t.text_primary,
        text_2: t.text_secondary,
        text_3: t.text_tertiary,
        accent: t.accent,
        accent_light: t.accent_hover,
        accent_tint: t.selected_fill,
        accent_on_fill: contrast_on_accent(t.accent),
        track_bg: Color32::from_rgba_unmultiplied(255, 255, 255, 22),
        subtle_btn_bg: t.field_fill,
        subtle_btn_hover: t.hover_fill,
        heat_0: t.heatmap[0],
        heat_1: t.accent.gamma_multiply(0.32),
        heat_2: t.accent.gamma_multiply(0.60),
        heat_glow: t.accent_hover.gamma_multiply(0.55),
    };
    ctx.data_mut(|d| d.insert_temp(egui::Id::new("valor_uikit_palette"), pal));
}

pub fn palette(ctx: &Context) -> UiKitPalette {
    ctx.data(|d| d.get_temp::<UiKitPalette>(egui::Id::new("valor_uikit_palette")))
        .unwrap_or_default()
}

/// Single-line LayoutJob with `max_rows = 1` and ellipsis truncation.
pub fn layout_single_line_ellipsis(
    ctx: &Context,
    text: &str,
    font: FontId,
    color: Color32,
    max_width: f32,
) -> Arc<Galley> {
    let mut job = egui::text::LayoutJob::single_section(
        text.to_owned(),
        egui::text::TextFormat {
            font_id: font,
            color,
            ..Default::default()
        },
    );
    job.wrap.max_width = max_width.max(1.0);
    job.wrap.max_rows = 1;
    job.wrap.break_anywhere = true;
    job.wrap.overflow_character = Some('…');
    ctx.fonts_mut(|f| f.layout_job(job))
}

/// Paint a 2px accent focus ring around a widget rect when it has keyboard focus.
pub fn paint_focus_ring(ui: &Ui, rect: Rect, radius: u8, scale: f32) {
    ui.painter().rect_stroke(
        rect.expand(1.5 * scale),
        CornerRadius::same(radius),
        Stroke::new(2.0 * scale, tokens::ACCENT),
        StrokeKind::Outside,
    );
}

/// Inline toolbar pill: height 28, padding 0 12, radius 9, bg card.
pub struct Pill<'a> {
    pub prefix: &'a str,
    pub value: Option<&'a str>,
    pub value_color: Color32,
    pub clickable: bool,
    pub tooltip: Option<&'a str>,
}

impl<'a> Pill<'a> {
    pub fn new(prefix: &'a str) -> Self {
        Self {
            prefix,
            value: None,
            value_color: tokens::TEXT,
            clickable: false,
            tooltip: None,
        }
    }

    pub fn value(mut self, val: &'a str, color: Color32) -> Self {
        self.value = Some(val);
        self.value_color = color;
        self
    }

    pub fn clickable(mut self, clickable: bool) -> Self {
        self.clickable = clickable;
        self
    }

    pub fn tooltip(mut self, tip: &'a str) -> Self {
        self.tooltip = Some(tip);
        self
    }

    pub fn measure_width(&self, ctx: &Context, scale: f32) -> f32 {
        let pad_x = 12.0 * scale;
        let font_reg = font_outfit_regular(12.5 * scale);
        let font_semi = font_outfit_semibold(12.5 * scale);
        let g1 = layout_single_line_ellipsis(ctx, self.prefix, font_reg, tokens::TEXT_2, 400.0 * scale);
        let mut w = pad_x * 2.0 + g1.size().x;
        if let Some(val) = self.value {
            let g2 = layout_single_line_ellipsis(ctx, val, font_semi, self.value_color, 400.0 * scale);
            w += 6.0 * scale + g2.size().x;
        }
        w.ceil()
    }

    pub fn show(&self, ui: &mut Ui, rect: Rect, scale: f32) -> Response {
        let pal = palette(ui.ctx());
        let sense = if self.clickable { Sense::click() } else { Sense::hover() };
        let resp = ui.allocate_rect(rect, sense);
        if self.clickable && resp.hovered() {
            ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
        }
        let bg = if self.clickable && resp.hovered() {
            pal.card_hover
        } else {
            pal.card
        };
        let r = (9.0 * scale).round() as u8;
        ui.painter().rect(
            rect,
            CornerRadius::same(r),
            bg,
            Stroke::new(1.0, pal.line),
            StrokeKind::Inside,
        );
        if resp.has_focus() {
            paint_focus_ring(ui, rect, r, scale);
        }
        let pad_x = 12.0 * scale;
        let font_reg = font_outfit_regular(12.5 * scale);
        let g1 = layout_single_line_ellipsis(
            ui.ctx(),
            self.prefix,
            font_reg,
            if self.value.is_some() { tokens::TEXT_2 } else { tokens::TEXT_2 },
            (rect.width() - pad_x * 2.0).max(1.0),
        );
        let mut x = rect.min.x + pad_x;
        ui.painter().galley(
            pos2(x, rect.center().y - g1.size().y * 0.5),
            g1.clone(),
            tokens::TEXT_2,
        );
        if let Some(val) = self.value {
            x += g1.size().x + 6.0 * scale;
            let rem = (rect.max.x - pad_x - x).max(1.0);
            let g2 = layout_single_line_ellipsis(
                ui.ctx(),
                val,
                font_outfit_semibold(12.5 * scale),
                self.value_color,
                rem,
            );
            ui.painter().galley(
                pos2(x, rect.center().y - g2.size().y * 0.5),
                g2,
                self.value_color,
            );
        }
        if let Some(tip) = self.tooltip {
            resp.on_hover_text(tip)
        } else {
            resp
        }
    }
}

/// Custom segmented control: track bg card/bg, radius 12, padding 3, segments 28 high.
pub struct Segmented<'a> {
    pub options: &'a [&'a str],
    pub active: usize,
    pub track_bg: Color32,
    pub track_radius: f32,
    pub seg_radius: f32,
    pub solid_accent_active: bool,
}

impl<'a> Segmented<'a> {
    pub fn new(options: &'a [&'a str], active: usize) -> Self {
        Self {
            options,
            active,
            track_bg: tokens::CARD,
            track_radius: 12.0,
            seg_radius: 9.0,
            solid_accent_active: false,
        }
    }

    pub fn year_switcher(options: &'a [&'a str], active: usize) -> Self {
        Self {
            options,
            active,
            track_bg: tokens::BG,
            track_radius: 11.0,
            seg_radius: 8.0,
            solid_accent_active: true,
        }
    }

    pub fn measure_width(&self, ctx: &Context, scale: f32) -> f32 {
        let pad = 3.0 * scale;
        let seg_pad = 12.0 * scale;
        let font = font_outfit_medium(13.0 * scale);
        let mut total = pad * 2.0;
        for (idx, opt) in self.options.iter().enumerate() {
            let g = layout_single_line_ellipsis(ctx, opt, font.clone(), tokens::TEXT, 200.0 * scale);
            total += g.size().x + seg_pad * 2.0;
            if idx + 1 < self.options.len() {
                total += 2.0 * scale;
            }
        }
        total.ceil()
    }

    pub fn show(&self, ui: &mut Ui, rect: Rect, scale: f32) -> Option<usize> {
        let pal = palette(ui.ctx());
        let mut clicked = None;
        let tr = (self.track_radius * scale).round() as u8;
        let sr = (self.seg_radius * scale).round() as u8;
        let track_bg = if self.track_bg == tokens::CARD { pal.card } else { pal.subtle_btn_bg };
        ui.painter().rect(
            rect,
            CornerRadius::same(tr),
            track_bg,
            Stroke::new(1.0, pal.line),
            StrokeKind::Inside,
        );
        let pad = 3.0 * scale;
        let seg_pad = 12.0 * scale;
        let seg_h = (rect.height() - pad * 2.0).max(16.0);
        let mut x = rect.min.x + pad;
        for (idx, opt) in self.options.iter().enumerate() {
            let is_active = idx == self.active;
            let font = if is_active {
                font_outfit_semibold(13.0 * scale)
            } else {
                font_outfit_medium(13.0 * scale)
            };
            let g = layout_single_line_ellipsis(ui.ctx(), opt, font, pal.text, 200.0 * scale);
            let seg_w = g.size().x + seg_pad * 2.0;
            let seg_rect = Rect::from_min_size(pos2(x, rect.min.y + pad), vec2(seg_w, seg_h));
            let resp = ui.allocate_rect(seg_rect, Sense::click());
            if resp.hovered() {
                ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
            }
            let (bg, fg) = if is_active {
                if self.solid_accent_active {
                    (pal.accent, pal.accent_on_fill)
                } else {
                    (pal.accent_tint, pal.accent)
                }
            } else if resp.hovered() {
                (pal.card_hover, pal.text)
            } else {
                (Color32::TRANSPARENT, pal.text_2)
            };
            if bg != Color32::TRANSPARENT {
                ui.painter().rect_filled(seg_rect, CornerRadius::same(sr), bg);
            }
            if resp.has_focus() {
                paint_focus_ring(ui, seg_rect, sr, scale);
            }
            let g_paint = layout_single_line_ellipsis(
                ui.ctx(),
                opt,
                if is_active {
                    font_outfit_semibold(13.0 * scale)
                } else {
                    font_outfit_medium(13.0 * scale)
                },
                fg,
                (seg_w - 4.0 * scale).max(1.0),
            );
            ui.painter().galley(
                pos2(
                    seg_rect.center().x - g_paint.size().x * 0.5,
                    seg_rect.center().y - g_paint.size().y * 0.5,
                ),
                g_paint,
                fg,
            );
            if resp.clicked() {
                clicked = Some(idx);
            }
            x += seg_w + 2.0 * scale;
        }
        clicked
    }
}

/// Custom text-only button (no icons) with hover/disabled/focus states.
pub struct TextButton<'a> {
    pub label: &'a str,
    pub bg: Color32,
    pub hover_bg: Color32,
    pub fg: Color32,
    pub hover_fg: Color32,
    pub radius: f32,
    pub font_size: f32,
    pub semibold: bool,
    pub disabled: bool,
    pub tooltip: Option<&'a str>,
}

impl<'a> TextButton<'a> {
    pub fn primary_accent(label: &'a str) -> Self {
        Self {
            label,
            bg: tokens::ACCENT,
            hover_bg: tokens::ACCENT_LIGHT,
            fg: tokens::ACCENT_ON_FILL,
            hover_fg: tokens::ACCENT_ON_FILL,
            radius: 11.0,
            font_size: 13.0,
            semibold: true,
            disabled: false,
            tooltip: None,
        }
    }

    pub fn accent_tint(label: &'a str) -> Self {
        Self {
            label,
            bg: tokens::ACCENT_TINT,
            hover_bg: tokens::ACCENT,
            fg: tokens::ACCENT,
            hover_fg: tokens::ACCENT_ON_FILL,
            radius: 10.0,
            font_size: 13.0,
            semibold: true,
            disabled: false,
            tooltip: None,
        }
    }

    pub fn subtle(label: &'a str) -> Self {
        Self {
            label,
            bg: tokens::SUBTLE_BTN_BG,
            hover_bg: tokens::SUBTLE_BTN_HOVER,
            fg: tokens::TEXT_2,
            hover_fg: tokens::TEXT,
            radius: 10.0,
            font_size: 13.0,
            semibold: true,
            disabled: false,
            tooltip: None,
        }
    }

    pub fn danger_subtle(label: &'a str) -> Self {
        Self {
            label,
            bg: tokens::CARD,
            hover_bg: tokens::CARD_HOVER,
            fg: tokens::TEXT_2,
            hover_fg: tokens::DANGER,
            radius: 11.0,
            font_size: 13.0,
            semibold: true,
            disabled: false,
            tooltip: None,
        }
    }

    pub fn disabled(mut self, disabled: bool) -> Self {
        self.disabled = disabled;
        self
    }

    pub fn tooltip(mut self, tip: &'a str) -> Self {
        self.tooltip = Some(tip);
        self
    }

    pub fn measure_width(&self, ctx: &Context, pad_x: f32, scale: f32) -> f32 {
        let font = if self.semibold {
            font_outfit_semibold(self.font_size * scale)
        } else {
            font_outfit_medium(self.font_size * scale)
        };
        let g = layout_single_line_ellipsis(ctx, self.label, font, self.fg, 300.0 * scale);
        (g.size().x + pad_x * 2.0 * scale).ceil()
    }

    pub fn show(&self, ui: &mut Ui, rect: Rect, scale: f32) -> Response {
        let pal = palette(ui.ctx());
        let map_col = |c: Color32| -> Color32 {
            if c == tokens::ACCENT { pal.accent }
            else if c == tokens::ACCENT_LIGHT { pal.accent_light }
            else if c == tokens::ACCENT_TINT { pal.accent_tint }
            else if c == tokens::ACCENT_ON_FILL { pal.accent_on_fill }
            else if c == tokens::SUBTLE_BTN_BG { pal.subtle_btn_bg }
            else if c == tokens::SUBTLE_BTN_HOVER { pal.subtle_btn_hover }
            else if c == tokens::TEXT { pal.text }
            else if c == tokens::TEXT_2 { pal.text_2 }
            else { c }
        };
        let sense = if self.disabled { Sense::hover() } else { Sense::click() };
        let resp = ui.allocate_rect(rect, sense);
        if resp.hovered() {
            ui.ctx().set_cursor_icon(if self.disabled {
                CursorIcon::NotAllowed
            } else {
                CursorIcon::PointingHand
            });
        }
        let r = (self.radius * scale).round() as u8;
        let (bg, fg) = if self.disabled {
            (map_col(self.bg).gamma_multiply(0.35), map_col(self.fg).gamma_multiply(0.35))
        } else if resp.hovered() {
            (map_col(self.hover_bg), map_col(self.hover_fg))
        } else {
            (map_col(self.bg), map_col(self.fg))
        };
        ui.painter().rect_filled(rect, CornerRadius::same(r), bg);
        if !self.disabled && resp.has_focus() {
            paint_focus_ring(ui, rect, r, scale);
        }
        let font = if self.semibold {
            font_outfit_semibold(self.font_size * scale)
        } else {
            font_outfit_medium(self.font_size * scale)
        };
        let g = layout_single_line_ellipsis(
            ui.ctx(),
            self.label,
            font,
            fg,
            (rect.width() - 8.0 * scale).max(1.0),
        );
        ui.painter().galley(
            pos2(
                rect.center().x - g.size().x * 0.5,
                rect.center().y - g.size().y * 0.5,
            ),
            g,
            fg,
        );
        if let Some(tip) = self.tooltip {
            resp.on_hover_text(tip)
        } else {
            resp
        }
    }
}

/// Custom-painted 32x32 cross (X) icon button: 1.75px stroke, rounded caps.
pub struct IconButton;

impl IconButton {
    pub fn show_cross(
        ui: &mut Ui,
        rect: Rect,
        row_hovered: bool,
        scale: f32,
        tooltip: &str,
    ) -> Response {
        let resp = ui.allocate_rect(rect, Sense::click());
        if resp.hovered() {
            ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
        }
        let r = (10.0 * scale).round() as u8;
        if resp.hovered() {
            ui.painter().rect_filled(rect, CornerRadius::same(r), tokens::DANGER_TINT);
        }
        if resp.has_focus() {
            paint_focus_ring(ui, rect, r, scale);
        }
        let icon_color = if resp.hovered() {
            tokens::DANGER
        } else if row_hovered {
            tokens::TEXT_3
        } else {
            tokens::TEXT_3.gamma_multiply(0.5)
        };
        let half = 4.8 * scale; // ~15px diagonal box
        let c = rect.center();
        let stroke = Stroke::new(1.75 * scale, icon_color);
        // Rounded caps via small circles at endpoints + line segments
        for (a, b) in [
            (pos2(c.x - half, c.y - half), pos2(c.x + half, c.y + half)),
            (pos2(c.x + half, c.y - half), pos2(c.x - half, c.y + half)),
        ] {
            ui.painter().line_segment([a, b], stroke);
            let cap_r = 0.875 * scale;
            ui.painter().circle_filled(a, cap_r, icon_color);
            ui.painter().circle_filled(b, cap_r, icon_color);
        }
        resp.on_hover_text(tooltip)
    }
}

/// 6px high progress bar with gradient accent -> accent_light and min 4% fill when p > 0.
pub struct ProgressBar;

impl ProgressBar {
    pub fn show(ui: &Ui, rect: Rect, progress: f32, scale: f32) {
        let pal = palette(ui.ctx());
        let r = (rect.height() * 0.5).ceil() as u8;
        ui.painter().rect_filled(rect, CornerRadius::same(r), pal.track_bg);
        let p = progress.clamp(0.0, 1.0);
        if p <= 0.0 {
            return;
        }
        let eff = p.max(0.04);
        let fill_w = (rect.width() * eff).max(rect.height());
        let fill_rect = Rect::from_min_size(rect.min, vec2(fill_w.min(rect.width()), rect.height()));
        // Paint horizontal gradient mesh from ACCENT to ACCENT_LIGHT
        let mut mesh = egui::Mesh::default();
        let idx = mesh.vertices.len() as u32;
        mesh.vertices.push(egui::epaint::Vertex {
            pos: fill_rect.left_top(),
            uv: egui::epaint::WHITE_UV,
            color: pal.accent,
        });
        mesh.vertices.push(egui::epaint::Vertex {
            pos: fill_rect.right_top(),
            uv: egui::epaint::WHITE_UV,
            color: pal.accent_light,
        });
        mesh.vertices.push(egui::epaint::Vertex {
            pos: fill_rect.right_bottom(),
            uv: egui::epaint::WHITE_UV,
            color: pal.accent_light,
        });
        mesh.vertices.push(egui::epaint::Vertex {
            pos: fill_rect.left_bottom(),
            uv: egui::epaint::WHITE_UV,
            color: pal.accent,
        });
        mesh.add_triangle(idx, idx + 1, idx + 2);
        mesh.add_triangle(idx, idx + 2, idx + 3);
        // Clip to rounded pill shape using a small rect_filled or clipped painter
        let clipped = ui.painter().with_clip_rect(fill_rect);
        clipped.add(Shape::mesh(mesh));
        // Subtle rounded endcap smoothing
        let cap_r = rect.height() * 0.5;
        ui.painter().circle_filled(
            pos2(fill_rect.min.x + cap_r, fill_rect.center().y),
            cap_r * 0.85,
            pal.accent,
        );
        if fill_rect.width() > rect.height() {
            ui.painter().circle_filled(
                pos2(fill_rect.max.x - cap_r, fill_rect.center().y),
                cap_r * 0.85,
                pal.accent_light,
            );
        }
        let _ = scale;
    }
}

/// Clickable single-line link label (hover = accent + underline).
pub struct LinkLabel;

impl LinkLabel {
    pub fn show(
        ui: &mut Ui,
        rect: Rect,
        galley: Arc<Galley>,
        missing: bool,
        tooltip: &str,
        scale: f32,
    ) -> Response {
        let resp = ui.allocate_rect(rect, Sense::click());
        let hovered = resp.hovered() && !missing;
        if resp.hovered() {
            ui.ctx().set_cursor_icon(if missing {
                CursorIcon::Default
            } else {
                CursorIcon::PointingHand
            });
        }
        let color = if missing {
            tokens::TEXT_3.gamma_multiply(0.55)
        } else if hovered {
            tokens::ACCENT
        } else {
            tokens::TEXT_3
        };
        let text_pos = pos2(rect.min.x, rect.center().y - galley.size().y * 0.5);
        ui.painter().galley(text_pos, galley.clone(), color);
        if hovered {
            let ul_y = text_pos.y + galley.size().y + 0.5 * scale;
            let ul_w = galley.size().x.min(rect.width());
            ui.painter().hline(
                rect.min.x..=(rect.min.x + ul_w),
                ul_y,
                Stroke::new(1.0 * scale, tokens::ACCENT),
            );
        }
        if resp.has_focus() {
            paint_focus_ring(ui, rect, 4, scale);
        }
        resp.on_hover_text(tooltip)
    }
}

/// Floating bottom-center toast with optional action (e.g. Undo).
#[derive(Debug, Clone)]
pub struct ToastState {
    pub message: String,
    pub action_label: Option<String>,
    pub undo_session_id: Option<String>,
    pub expires_at: std::time::Instant,
}

pub enum ToastOutcome {
    None,
    Undo(String),
}

pub struct Toast;

impl Toast {
    pub fn show(
        ui: &mut Ui,
        window_rect: Rect,
        toast: &mut Option<ToastState>,
        scale: f32,
    ) -> ToastOutcome {
        let Some(t) = toast.as_ref() else {
            return ToastOutcome::None;
        };
        let now = std::time::Instant::now();
        if now >= t.expires_at {
            *toast = None;
            return ToastOutcome::None;
        }
        let remaining = t.expires_at.saturating_duration_since(now);
        ui.ctx().request_repaint_after(remaining.min(std::time::Duration::from_millis(250)));

        let msg_g = layout_single_line_ellipsis(
            ui.ctx(),
            &t.message,
            font_outfit_medium(13.0 * scale),
            tokens::TEXT,
            340.0 * scale,
        );
        let action_w = t.action_label.as_deref().map_or(0.0, |lbl| {
            let g = layout_single_line_ellipsis(
                ui.ctx(),
                lbl,
                font_outfit_semibold(13.0 * scale),
                tokens::ACCENT,
                120.0 * scale,
            );
            g.size().x + 18.0 * scale
        });
        let pad_x = 16.0 * scale;
        let h = 38.0 * scale;
        let w = pad_x * 2.0 + msg_g.size().x + if action_w > 0.0 { 10.0 * scale + action_w } else { 0.0 };
        let rect = Rect::from_min_size(
            pos2(
                window_rect.center().x - w * 0.5,
                window_rect.max.y - h - 22.0 * scale,
            ),
            vec2(w, h),
        );
        let mut out = ToastOutcome::None;
        let undo_id = t.undo_session_id.clone();
        let action_lbl = t.action_label.clone();

        egui::Area::new(ui.scope_id().with("cnx_toast_area"))
            .order(egui::Order::Tooltip)
            .fixed_pos(rect.min)
            .show(ui.ctx(), |ui| {
                let (r, _) = ui.allocate_exact_size(rect.size(), Sense::hover());
                ui.painter().rect(
                    r,
                    CornerRadius::same((11.0 * scale).round() as u8),
                    tokens::CARD,
                    Stroke::new(1.0, tokens::LINE),
                    StrokeKind::Inside,
                );
                ui.painter().galley(
                    pos2(r.min.x + pad_x, r.center().y - msg_g.size().y * 0.5),
                    msg_g,
                    tokens::TEXT,
                );
                if let Some(lbl) = action_lbl {
                    let btn_rect = Rect::from_min_size(
                        pos2(r.max.x - pad_x - action_w, r.center().y - 13.0 * scale),
                        vec2(action_w, 26.0 * scale),
                    );
                    let resp = TextButton::accent_tint(&lbl).show(ui, btn_rect, scale);
                    if resp.clicked() {
                        if let Some(id) = undo_id {
                            out = ToastOutcome::Undo(id);
                        }
                        *toast = None;
                    }
                }
            });

        out
    }
}

/// Custom-painted popover container helper.
pub struct Popover;

impl Popover {
    pub fn paint_frame(ui: &Ui, rect: Rect, scale: f32) {
        let r = (12.0 * scale).round() as u8;
        ui.painter().rect(
            rect,
            CornerRadius::same(r),
            tokens::CARD,
            Stroke::new(1.0, tokens::LINE),
            StrokeKind::Inside,
        );
    }
}

/// Shared F12 debug overlay: outlines layout rects and shows FPS + repaint reason.
#[derive(Debug, Default)]
pub struct DebugOverlayState {
    pub enabled: bool,
    pub last_frame_time: Option<std::time::Instant>,
    pub fps_ema: f32,
    pub repaint_reason: String,
    pub tracked_rects: Vec<(&'static str, Rect)>,
}

impl DebugOverlayState {
    pub fn begin_frame(&mut self, ctx: &Context, reason: impl Into<String>) {
        if ctx.input(|i| i.key_pressed(egui::Key::F12)) {
            self.enabled = !self.enabled;
        }
        let now = std::time::Instant::now();
        if let Some(prev) = self.last_frame_time {
            let dt = now.duration_since(prev).as_secs_f32().max(0.0001);
            let inst_fps = (1.0 / dt).min(240.0);
            self.fps_ema = if self.fps_ema <= 0.0 {
                inst_fps
            } else {
                self.fps_ema * 0.9 + inst_fps * 0.1
            };
        }
        self.last_frame_time = Some(now);
        self.repaint_reason = reason.into();
        self.tracked_rects.clear();
    }

    pub fn track(&mut self, label: &'static str, rect: Rect) {
        if self.enabled {
            self.tracked_rects.push((label, rect));
        }
    }

    pub fn paint(&self, ui: &Ui, window_rect: Rect, scale: f32) {
        if !self.enabled {
            return;
        }
        for (label, rect) in &self.tracked_rects {
            ui.painter().rect_stroke(
                *rect,
                CornerRadius::ZERO,
                Stroke::new(1.0, Color32::from_rgba_unmultiplied(0, 220, 180, 140)),
                StrokeKind::Inside,
            );
            ui.painter().text(
                pos2(rect.min.x + 3.0, rect.min.y + 2.0),
                Align2::LEFT_TOP,
                *label,
                font_mono(10.0 * scale),
                Color32::from_rgba_unmultiplied(0, 220, 180, 200),
            );
        }
        let hud_text = format!(
            "F12 DEBUG | {:.1} FPS | {}",
            self.fps_ema, self.repaint_reason
        );
        let g = layout_single_line_ellipsis(
            ui.ctx(),
            &hud_text,
            font_mono(11.0 * scale),
            tokens::ACCENT_LIGHT,
            400.0 * scale,
        );
        let hud_rect = Rect::from_min_size(
            pos2(window_rect.max.x - g.size().x - 24.0, window_rect.max.y - 28.0),
            vec2(g.size().x + 16.0, 22.0),
        );
        ui.painter().rect_filled(hud_rect, CornerRadius::same(6), Color32::from_black_alpha(210));
        ui.painter().galley(
            pos2(hud_rect.min.x + 8.0, hud_rect.center().y - g.size().y * 0.5),
            g,
            tokens::ACCENT_LIGHT,
        );
    }
}
