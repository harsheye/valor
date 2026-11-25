//! Shared UI helper functions.

use egui::{Align, Color32, CornerRadius, Frame, Layout, Rect, RichText, Stroke, Ui, Vec2};
use crate::{layout, shell_tokens::{typography, ShellTokens}};

/// Draw a standard separator with consistent vertical spacing and design token styling.
pub fn section_separator(ui: &mut Ui, tokens: &ShellTokens) {
    ui.add_space(layout::SECTION_SPACING);
    let w = if ui.available_width().is_finite() { ui.available_width() } else { 400.0 };
    let (rect, _response) = ui.allocate_exact_size(
        egui::vec2(w, layout::DIVIDER_H),
        egui::Sense::hover(),
    );
    let snapped_y = layout::snap_to_pixel(rect.center().y, ui.ctx().pixels_per_point());
    ui.painter().hline(
        rect.x_range(),
        snapped_y,
        Stroke::new(layout::DIVIDER_H, tokens.divider),
    );
    ui.add_space(layout::SECTION_SPACING);
}

/// Draw a lighter/tighter divider for sub-sections.
pub fn sub_divider(ui: &mut Ui, tokens: &ShellTokens) {
    ui.add_space(layout::SECTION_SPACING * 0.5);
    let w = if ui.available_width().is_finite() { ui.available_width() } else { 400.0 };
    let (rect, _response) = ui.allocate_exact_size(
        egui::vec2(w, layout::DIVIDER_H),
        egui::Sense::hover(),
    );
    let snapped_y = layout::snap_to_pixel(rect.center().y, ui.ctx().pixels_per_point());
    ui.painter().hline(
        rect.x_range(),
        snapped_y,
        Stroke::new(layout::DIVIDER_H, tokens.divider),
    );
    ui.add_space(layout::SECTION_SPACING * 0.5);
}

/// Render a modern iOS/fluent style toggle switch pill using current theme tokens.
pub fn toggle_switch(ui: &mut Ui, on: &mut bool, tokens: &ShellTokens) -> egui::Response {
    let desired_size = Vec2::new(42.0, 24.0);
    let (rect, mut response) = ui.allocate_exact_size(desired_size, egui::Sense::click());
    if response.clicked() {
        *on = !*on;
        response.mark_changed();
    }

    if ui.is_rect_visible(rect) {
        let how_on = if *on { 1.0 } else { 0.0 };
        let bg_color = if *on {
            tokens.accent
        } else {
            Color32::from_rgb(42, 46, 56)
        };
        ui.painter().rect_filled(rect, CornerRadius::same(12), bg_color);
        if !*on {
            ui.painter().rect_stroke(
                rect,
                CornerRadius::same(12),
                Stroke::new(1.0, Color32::from_rgb(64, 70, 84)),
                egui::StrokeKind::Inside,
            );
        }

        let knob_radius = 8.5;
        let circle_x = egui::lerp((rect.left() + knob_radius + 2.5)..=(rect.right() - knob_radius - 2.5), how_on);
        let center = egui::pos2(circle_x, rect.center().y);
        let knob_color = if *on { Color32::WHITE } else { Color32::from_rgb(180, 185, 195) };
        ui.painter().circle_filled(center, knob_radius, knob_color);
    }
    response
}

/// Render a segmented button control using current theme tokens.
pub fn segmented_pills(ui: &mut Ui, options: &[&str], selected_index: usize, tokens: &ShellTokens) -> Option<usize> {
    let mut newly_selected = None;
    Frame::new()
        .fill(tokens.field_fill)
        .corner_radius(CornerRadius::same(14))
        .stroke(Stroke::new(1.0, tokens.field_border))
        .inner_margin(egui::Margin::symmetric(2, 2))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.spacing_mut().item_spacing.x = 2.0;
                for (idx, label) in options.iter().enumerate() {
                    let is_active = idx == selected_index;
                    let (fill, text_color) = if is_active {
                        (tokens.accent, tokens.window_bg)
                    } else {
                        (Color32::TRANSPARENT, tokens.text_secondary)
                    };
                    let btn = egui::Button::new(RichText::new(*label).size(12.0).strong().color(text_color))
                        .fill(fill)
                        .corner_radius(CornerRadius::same(12))
                        .min_size(Vec2::new(42.0, 24.0));
                    if ui.add(btn).clicked() && !is_active {
                        newly_selected = Some(idx);
                    }
                }
            });
        });
    newly_selected
}

/// Render a keyboard hotkey pill badge using current theme tokens.
pub fn hotkey_badge(ui: &mut Ui, key: &str, tokens: &ShellTokens) {
    Frame::new()
        .fill(tokens.field_fill)
        .corner_radius(CornerRadius::same(6))
        .stroke(Stroke::new(1.0, tokens.field_border))
        .inner_margin(egui::Margin::symmetric(14, 6))
        .show(ui, |ui| {
            ui.label(RichText::new(key).size(12.5).strong().color(tokens.text_primary));
        });
}

/// Standard settings card container styled with active theme tokens.
/// Automatically stretches to fill available width responsively.
pub fn setting_card<R>(
    ui: &mut Ui,
    tokens: &ShellTokens,
    title: &str,
    subtitle: &str,
    add: impl FnOnce(&mut Ui) -> R,
) -> R {
    Frame::new()
        .fill(tokens.card_fill)
        .stroke(Stroke::new(1.0, tokens.field_border))
        .corner_radius(CornerRadius::same(12))
        .inner_margin(egui::Margin::symmetric(20, 18))
        .show(ui, |ui| {
            let inner_w = ui.available_width();
            if inner_w.is_finite() && inner_w > 0.0 {
                ui.set_width(inner_w);
            }
            ui.vertical(|ui| {
                if !title.is_empty() {
                    ui.label(RichText::new(title).size(16.0).strong().color(tokens.text_primary));
                    if !subtitle.is_empty() {
                        ui.add_space(2.0);
                        ui.label(RichText::new(subtitle).size(typography::SECONDARY).color(tokens.text_secondary));
                    }
                    ui.add_space(14.0);
                }
                add(ui)
            }).inner
        })
        .inner
}

/// Setting row with label + subtitle on left, interactive control on right.
/// Stretches to full card width with robust natural ordering.
pub fn setting_row<R>(
    ui: &mut Ui,
    tokens: &ShellTokens,
    title: &str,
    subtitle: &str,
    add_control: impl FnOnce(&mut Ui) -> R,
) -> R {
    let full_w = ui.available_width();
    let min_h = if subtitle.is_empty() { 34.0 } else { 44.0 };
    let (row_rect, _resp) = ui.allocate_exact_size(
        Vec2::new(full_w, min_h),
        egui::Sense::hover(),
    );

    // Left text column gets available width minus space for controls on the right
    let control_box_w = 260.0f32.min(full_w * 0.45);
    let text_w = (full_w - control_box_w - 16.0).max(140.0);
    let text_rect = Rect::from_min_size(row_rect.min, Vec2::new(text_w, row_rect.height()));

    let mut text_ui = ui.new_child(egui::UiBuilder::new().max_rect(text_rect));
    text_ui.vertical(|ui| {
        ui.label(RichText::new(title).size(14.0).strong().color(tokens.text_primary));
        if !subtitle.is_empty() {
            ui.add_space(2.0);
            ui.label(RichText::new(subtitle).size(12.0).color(tokens.text_secondary));
        }
    });

    // Right control column
    let control_rect = Rect::from_min_max(
        egui::pos2(row_rect.max.x - control_box_w, row_rect.min.y),
        row_rect.max,
    );
    let mut ctrl_ui = ui.new_child(egui::UiBuilder::new().max_rect(control_rect));
    let res = ctrl_ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
        add_control(ui)
    }).inner;

    ui.add_space(14.0);
    res
}

/// Truncate text with ellipsis "..." strictly constrained to exact max pixel width.
pub fn truncate_text_exact(painter: &egui::Painter, text: &str, font: egui::FontId, max_width: f32) -> String {
    if max_width <= 8.0 {
        return String::new();
    }
    let full_w = painter.layout_no_wrap(text.to_string(), font.clone(), Color32::WHITE).size().x;
    if full_w <= max_width {
        return text.to_string();
    }
    let mut truncated = text.to_string();
    while !truncated.is_empty() {
        truncated.pop();
        let candidate = format!("{}...", truncated);
        let w = painter.layout_no_wrap(candidate.clone(), font.clone(), Color32::WHITE).size().x;
        if w <= max_width {
            return candidate;
        }
    }
    String::new()
}
