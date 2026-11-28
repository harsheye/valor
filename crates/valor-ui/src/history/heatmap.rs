//! History activity heatmap card with explicit row/column geometry.

use crate::cnx_theme::{font_outfit_regular, font_outfit_semibold};
use crate::ui_kit::{layout_single_line_ellipsis, tokens, Popover, Segmented};
use chrono::{Datelike, Duration, Local, NaiveDate};
use egui::{
    pos2, vec2, CornerRadius, CursorIcon, Pos2, Rect, Sense, Stroke, StrokeKind, Ui,
};
use std::collections::HashMap;

pub const WEEKS: usize = 53;
pub const WEEKDAYS: usize = 7;
pub const CELL_SIZE: f32 = 14.0;
pub const CELL_GAP: f32 = 3.0;
pub const CELL_PITCH: f32 = CELL_SIZE + CELL_GAP; // 17.0
pub const LEFT_GUTTER: f32 = 34.0;
pub const MONTH_ROW_H: f32 = 18.0;

/// Pure geometry function: returns the exact cell rect for `(week, weekday)` relative to `grid_origin`.
pub fn heat_cell_rect(grid_origin: Pos2, week: usize, weekday: usize, scale: f32) -> Rect {
    let pitch = CELL_PITCH * scale;
    let size = CELL_SIZE * scale;
    Rect::from_min_size(
        pos2(
            grid_origin.x + week as f32 * pitch,
            grid_origin.y + weekday as f32 * pitch,
        ),
        vec2(size, size),
    )
}

pub enum HeatmapOutcome {
    None,
    SelectYear(i32),
    ToggleDay(NaiveDate),
}

pub fn render_heatmap_card(
    ui: &mut Ui,
    card_rect: Rect,
    heatmap_counts: &HashMap<NaiveDate, u32>,
    total_sessions_year: u32,
    selected_year: i32,
    selected_day: Option<NaiveDate>,
    scale: f32,
) -> HeatmapOutcome {
    let pal = crate::ui_kit::palette(ui.ctx());
    let mut outcome = HeatmapOutcome::None;
    let r = (16.0 * scale).round() as u8;
    ui.painter().rect(
        card_rect,
        CornerRadius::same(r),
        pal.card,
        Stroke::new(1.0, pal.line),
        StrokeKind::Inside,
    );

    let pad_v = 20.0 * scale;
    let pad_h = 22.0 * scale;
    let inner = Rect::from_min_max(
        pos2(card_rect.min.x + pad_h, card_rect.min.y + pad_v),
        pos2(card_rect.max.x - pad_h, card_rect.max.y - pad_v),
    );

    // 1. Header row: left "**50** sessions in the last year", right year switcher
    let header_h = 34.0 * scale;
    let header_rect = Rect::from_min_size(inner.min, vec2(inner.width(), header_h));

    let count_str = total_sessions_year.to_string();
    let suffix_str = if total_sessions_year == 1 {
        " session in the last year"
    } else {
        " sessions in the last year"
    };
    let g_num = layout_single_line_ellipsis(
        ui.ctx(),
        &count_str,
        font_outfit_semibold(17.0 * scale),
        pal.accent,
        120.0 * scale,
    );
    let current_year = Local::now().date_naive().year();
    let years = [
        current_year,
        current_year - 1,
        current_year - 2,
        current_year - 3,
    ];
    let yr_labels: [String; 4] = years.map(|y| y.to_string());
    let yr_refs: [&str; 4] = [
        &yr_labels[0],
        &yr_labels[1],
        &yr_labels[2],
        &yr_labels[3],
    ];
    let active_yr_idx = years.iter().position(|&y| y == selected_year).unwrap_or(0);
    let seg = Segmented::year_switcher(&yr_refs, active_yr_idx);
    let seg_w = seg.measure_width(ui.ctx(), scale);
    let seg_h = 34.0 * scale;
    let seg_rect = Rect::from_min_size(
        pos2(header_rect.max.x - seg_w, header_rect.center().y - seg_h * 0.5),
        vec2(seg_w, seg_h),
    );

    let title_max_w = (seg_rect.min.x - 12.0 * scale - header_rect.min.x - g_num.size().x).max(40.0);
    let g_suf = layout_single_line_ellipsis(
        ui.ctx(),
        suffix_str,
        font_outfit_semibold(17.0 * scale),
        pal.text,
        title_max_w,
    );
    ui.painter().galley(
        pos2(header_rect.min.x, header_rect.center().y - g_num.size().y * 0.5),
        g_num.clone(),
        pal.accent,
    );
    ui.painter().galley(
        pos2(
            header_rect.min.x + g_num.size().x,
            header_rect.center().y - g_suf.size().y * 0.5,
        ),
        g_suf,
        pal.text,
    );

    if let Some(clicked_idx) = seg.show(ui, seg_rect, scale) {
        outcome = HeatmapOutcome::SelectYear(years[clicked_idx]);
    }

    // 2. Grid area (Jan 1..today for current year, Jan 1..Dec 31 for past years; auto-fits width with no hscroll)
    let today = Local::now().date_naive();
    let is_current_year = selected_year == today.year();
    let jan1 = NaiveDate::from_ymd_opt(selected_year, 1, 1).unwrap_or(today);
    let end_date = if is_current_year {
        today
    } else {
        NaiveDate::from_ymd_opt(selected_year, 12, 31).unwrap_or(today)
    };
    let sun_offset = jan1.weekday().num_days_from_sunday() as i64;
    let grid_start = jan1 - Duration::days(sun_offset);
    let weeks = ((((end_date - grid_start).num_days() + 1).max(1) as f32) / 7.0)
        .ceil()
        .max(1.0) as usize;

    let avail_grid_w = (inner.width() - LEFT_GUTTER * scale).max(100.0 * scale);
    let dyn_pitch = (avail_grid_w / weeks as f32).min(CELL_PITCH * scale);
    let dyn_gap = (CELL_GAP * scale).min(dyn_pitch * 0.25);
    let dyn_size = (dyn_pitch - dyn_gap).max(4.0 * scale);

    let grid_content_w = LEFT_GUTTER * scale + weeks as f32 * dyn_pitch;
    let grid_content_h = (MONTH_ROW_H + WEEKDAYS as f32 * CELL_PITCH) * scale;
    let grid_area_top = header_rect.max.y + 14.0 * scale;
    let grid_area_rect = Rect::from_min_size(
        pos2(inner.min.x, grid_area_top),
        vec2(inner.width(), grid_content_h),
    );

    let mut hovered_cell: Option<(Rect, NaiveDate, u32)> = None;

    let mut grid_ui = ui.new_child(egui::UiBuilder::new().max_rect(grid_area_rect));
    grid_ui.shrink_clip_rect(grid_area_rect);

    {
        let ui = &mut grid_ui;
        let (_, canvas_rect) = ui.allocate_space(vec2(grid_content_w, grid_content_h));
        let grid_origin = pos2(
            canvas_rect.min.x + LEFT_GUTTER * scale,
            canvas_rect.min.y + MONTH_ROW_H * scale,
        );
        let cell_at = |week: usize, weekday: usize| -> Rect {
            Rect::from_min_size(
                pos2(
                    grid_origin.x + week as f32 * dyn_pitch,
                    grid_origin.y + weekday as f32 * CELL_PITCH * scale,
                ),
                vec2(dyn_size, CELL_SIZE * scale),
            )
        };

        // Month labels placed at first column where month starts within selected_year
        let mut last_label_right = f32::NEG_INFINITY;
        let mut prev_month: Option<u32> = None;
        for week in 0..weeks {
            let col_sun = grid_start + Duration::weeks(week as i64);
            let mut month_start_day: Option<NaiveDate> = None;
            for wd in 0..WEEKDAYS {
                let d = col_sun + Duration::days(wd as i64);
                if d < jan1 || d > end_date || d.year() != selected_year {
                    continue;
                }
                if prev_month != Some(d.month()) {
                    month_start_day = Some(d);
                    prev_month = Some(d.month());
                    break;
                }
            }
            if let Some(d) = month_start_day {
                let m_name = d.format("%b").to_string();
                let g = layout_single_line_ellipsis(
                    ui.ctx(),
                    &m_name,
                    font_outfit_regular(11.0 * scale),
                    tokens::TEXT_3,
                    48.0 * scale,
                );
                let cell_x = cell_at(week, 0).min.x;
                if cell_x >= last_label_right + 4.0 * scale {
                    ui.painter().galley(
                        pos2(cell_x, canvas_rect.min.y + 2.0 * scale),
                        g.clone(),
                        tokens::TEXT_3,
                    );
                    last_label_right = cell_x + g.size().x;
                }
            }
        }

        // Weekday labels from same grid_origin
        for (row, label) in [(1usize, "Mon"), (3usize, "Wed"), (5usize, "Fri")] {
            let row_center_y = cell_at(0, row).center().y;
            let g = layout_single_line_ellipsis(
                ui.ctx(),
                label,
                font_outfit_regular(11.0 * scale),
                tokens::TEXT_3,
                (LEFT_GUTTER - 6.0) * scale,
            );
            ui.painter().galley(
                pos2(canvas_rect.min.x, row_center_y - g.size().y * 0.5),
                g,
                tokens::TEXT_3,
            );
        }

        // Cells placed by explicit (week, weekday)
        let cell_r = (4.0 * scale).round() as u8;
        for week in 0..weeks {
            for weekday in 0..WEEKDAYS {
                let d = grid_start + Duration::days((week * 7 + weekday) as i64);
                if d < jan1 || d > end_date || d.year() != selected_year {
                    continue; // keep space, do not draw
                }
                let cell_rect = cell_at(week, weekday);
                let resp = ui.allocate_rect(cell_rect, Sense::click());
                let count = heatmap_counts.get(&d).copied().unwrap_or(0);
                let fill = match count {
                    0 => pal.heat_0,
                    1 => pal.heat_1,
                    2 => pal.heat_2,
                    3..=19 => pal.accent,
                    _ => pal.accent_light,
                };
                if count >= 20 {
                    // 10px glow halo
                    ui.painter().rect_filled(
                        cell_rect.expand(4.0 * scale),
                        CornerRadius::same((6.0 * scale).round() as u8),
                        pal.heat_glow.gamma_multiply(0.30),
                    );
                }
                ui.painter().rect_filled(cell_rect, CornerRadius::same(cell_r), fill);

                let is_sel = selected_day == Some(d);
                if is_sel {
                    ui.painter().rect_stroke(
                        cell_rect.expand(1.0 * scale),
                        CornerRadius::same(cell_r),
                        Stroke::new(2.0 * scale, tokens::TEXT),
                        StrokeKind::Outside,
                    );
                } else if resp.hovered() {
                    ui.painter().rect_stroke(
                        cell_rect.expand(1.0 * scale),
                        CornerRadius::same(cell_r),
                        Stroke::new(2.0 * scale, tokens::TEXT_2),
                        StrokeKind::Outside,
                    );
                }

                if resp.hovered() {
                    ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
                    hovered_cell = Some((cell_rect, d, count));
                }
                if resp.clicked() {
                    outcome = HeatmapOutcome::ToggleDay(d);
                }
            }
        }
    }

    // 3. Legend row 12px below the grid
    let legend_y = grid_area_rect.max.y + 12.0 * scale;
    let legend_h = 16.0 * scale;
    let legend_rect = Rect::from_min_size(pos2(inner.min.x, legend_y), vec2(inner.width(), legend_h));

    let g_hint = layout_single_line_ellipsis(
        ui.ctx(),
        "Each square is a day. Click one to filter what you watched.",
        font_outfit_regular(12.0 * scale),
        tokens::TEXT_3,
        (inner.width() - 150.0 * scale).max(80.0),
    );
    ui.painter().galley(
        pos2(legend_rect.min.x, legend_rect.center().y - g_hint.size().y * 0.5),
        g_hint,
        tokens::TEXT_3,
    );

    // Right legend: "Less [5 cells] More"
    let g_more = layout_single_line_ellipsis(
        ui.ctx(),
        "More",
        font_outfit_regular(12.0 * scale),
        tokens::TEXT_3,
        60.0 * scale,
    );
    let g_less = layout_single_line_ellipsis(
        ui.ctx(),
        "Less",
        font_outfit_regular(12.0 * scale),
        tokens::TEXT_3,
        60.0 * scale,
    );
    let leg_cell = 12.0 * scale;
    let leg_gap = 3.0 * scale;
    let leg_r = (3.0 * scale).round() as u8;
    let mut rx = legend_rect.max.x - g_more.size().x;
    ui.painter().galley(
        pos2(rx, legend_rect.center().y - g_more.size().y * 0.5),
        g_more,
        tokens::TEXT_3,
    );
    rx -= 6.0 * scale;
    for color in [
        pal.accent_light,
        pal.accent,
        pal.heat_2,
        pal.heat_1,
        pal.heat_0,
    ] {
        rx -= leg_cell;
        let r_box = Rect::from_min_size(
            pos2(rx, legend_rect.center().y - leg_cell * 0.5),
            vec2(leg_cell, leg_cell),
        );
        ui.painter().rect_filled(r_box, CornerRadius::same(leg_r), color);
        rx -= leg_gap;
    }
    rx -= 3.0 * scale + g_less.size().x;
    ui.painter().galley(
        pos2(rx, legend_rect.center().y - g_less.size().y * 0.5),
        g_less,
        tokens::TEXT_3,
    );

    // Instant hover tooltip
    if let Some((cell_rect, d, count)) = hovered_cell {
        let s_word = if count == 1 { "session" } else { "sessions" };
        let tip = format!("{count} {s_word} · {}", d.format("%Y-%m-%d"));
        let g = layout_single_line_ellipsis(
            ui.ctx(),
            &tip,
            font_outfit_regular(12.0 * scale),
            tokens::TEXT,
            260.0 * scale,
        );
        let pad_x = 10.0 * scale;
        let pad_y = 6.0 * scale;
        let tip_w = g.size().x + pad_x * 2.0;
        let tip_h = g.size().y + pad_y * 2.0;
        let tip_pos = pos2(
            (cell_rect.center().x - tip_w * 0.5).max(card_rect.min.x + 4.0),
            cell_rect.top() - tip_h - 6.0 * scale,
        );
        egui::Area::new(ui.scope_id().with("heatmap_cell_tip"))
            .order(egui::Order::Tooltip)
            .fixed_pos(tip_pos)
            .interactable(false)
            .show(ui.ctx(), |ui| {
                let (tr, _) = ui.allocate_exact_size(vec2(tip_w, tip_h), Sense::hover());
                Popover::paint_frame(ui, tr, scale);
                ui.painter().galley(
                    pos2(tr.min.x + pad_x, tr.min.y + pad_y),
                    g,
                    tokens::TEXT,
                );
            });
    }

    outcome
}

pub fn heatmap_card_height(scale: f32) -> f32 {
    let pad_v = 20.0 * scale;
    let header_h = 34.0 * scale;
    let gap1 = 14.0 * scale;
    let grid_h = (MONTH_ROW_H + WEEKDAYS as f32 * CELL_PITCH) * scale;
    let gap2 = 12.0 * scale;
    let legend_h = 16.0 * scale;
    pad_v * 2.0 + header_h + gap1 + grid_h + gap2 + legend_h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_heat_cell_rect_origin_alignment() {
        let origin = pos2(100.0, 200.0);
        let r0 = heat_cell_rect(origin, 0, 0, 1.0);
        assert_eq!(r0.min, origin);
        assert_eq!(r0.size(), vec2(14.0, 14.0));

        let r_mon = heat_cell_rect(origin, 0, 1, 1.0);
        assert_eq!(r_mon.min, pos2(100.0, 217.0));

        let r_col5_fri = heat_cell_rect(origin, 5, 5, 2.0);
        assert_eq!(r_col5_fri.min, pos2(100.0 + 5.0 * 34.0, 200.0 + 5.0 * 34.0));
        assert_eq!(r_col5_fri.size(), vec2(28.0, 28.0));
    }
}
