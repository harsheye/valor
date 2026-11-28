//! Flat dense History row renderer (no thumbnails, no decorative icons).

use crate::cnx_theme::{font_mono, font_outfit_medium, font_outfit_regular, font_outfit_semibold};
use crate::history::data::{elide_left, format_duration_short, HistoryItem};
use crate::history::trakt::{is_trakt_disabled, TraktMarkPayload};
use crate::ui_kit::{
    layout_single_line_ellipsis, IconButton, LinkLabel, ProgressBar, TextButton,
};
use egui::{pos2, vec2, CornerRadius, Rect, Sense, Ui};
use std::path::PathBuf;

pub enum RowOutcome {
    None,
    Resume { path: PathBuf, start_secs: f64 },
    RemoveSession { session_id: String, title: String },
    OpenFolder { file_path: PathBuf, folder_str: String },
    MarkTrakt(TraktMarkPayload),
}

pub fn measure_row_height(scale: f32) -> f32 {
    // 12px top + 3 lines (20 + 18 + 18) + 12px bottom = ~80px at 1x
    (12.0 + 20.0 + 4.0 + 18.0 + 4.0 + 18.0 + 12.0) * scale
}

pub fn render_history_row(
    ui: &mut Ui,
    row_rect: Rect,
    item: &HistoryItem,
    trakt_connected: bool,
    show_progress_col: bool,
    show_trakt_label: bool,
    scale: f32,
) -> RowOutcome {
    let pal = crate::ui_kit::palette(ui.ctx());
    let mut outcome = RowOutcome::None;
    let pointer_in_row = ui.rect_contains_pointer(row_rect);
    if pointer_in_row {
        ui.painter().rect_filled(row_rect, CornerRadius::ZERO, pal.card);
    }
    // 1px bottom divider
    ui.painter().hline(
        row_rect.min.x..=row_rect.max.x,
        row_rect.max.y - 0.5,
        egui::Stroke::new(1.0, pal.line),
    );

    let pad_v = 12.0 * scale;
    let pad_h = 10.0 * scale;
    let col_gap = 20.0 * scale;
    let inner = Rect::from_min_max(
        pos2(row_rect.min.x + pad_h, row_rect.min.y + pad_v),
        pos2(row_rect.max.x - pad_h, row_rect.max.y - pad_v),
    );

    // 1. Measure actions column on the right
    let btn_h = 32.0 * scale;
    let act_gap = 6.0 * scale;
    let cross_w = 32.0 * scale;
    let resume_lbl = if item.progress < 0.90 { "Resume" } else { "Replay" };
    let resume_btn = TextButton::accent_tint(resume_lbl);
    let resume_w = resume_btn.measure_width(ui.ctx(), 14.0, scale);

    let trakt_disabled = is_trakt_disabled(item);
    let trakt_lbl = if show_trakt_label { "Trakt" } else { "T" };
    let trakt_btn = TextButton::subtle(trakt_lbl)
        .disabled(trakt_disabled)
        .tooltip(if trakt_disabled {
            "Already watched on Trakt"
        } else {
            "Mark watched on Trakt"
        });
    let trakt_w = if trakt_connected {
        trakt_btn.measure_width(ui.ctx(), if show_trakt_label { 12.0 } else { 8.0 }, scale)
    } else {
        0.0
    };

    let actions_w = cross_w
        + act_gap
        + resume_w
        + if trakt_connected {
            act_gap + trakt_w
        } else {
            0.0
        };
    let actions_x = (inner.max.x - actions_w).max(inner.min.x + 80.0 * scale);
    let act_y = inner.center().y - btn_h * 0.5;

    let mut ax = actions_x;
    if trakt_connected {
        let trakt_rect = Rect::from_min_size(pos2(ax, act_y), vec2(trakt_w, btn_h));
        if trakt_btn.show(ui, trakt_rect, scale).clicked() && !trakt_disabled {
            outcome = RowOutcome::MarkTrakt(TraktMarkPayload {
                fingerprint: item.fingerprint.clone(),
                title: item.title.clone(),
                season_number: item.season_number,
                episode_number: item.episode_number,
                imdb_id: item.imdb_id.clone(),
                tmdb_id: item.tmdb_id,
            });
        }
        ax += trakt_w + act_gap;
    }

    let resume_rect = Rect::from_min_size(pos2(ax, act_y), vec2(resume_w, btn_h));
    if resume_btn.show(ui, resume_rect, scale).clicked() {
        let start_secs = if item.progress < 0.90 {
            item.paused_at_secs as f64
        } else {
            0.0
        };
        outcome = RowOutcome::Resume {
            path: item.file_path.clone(),
            start_secs,
        };
    }
    ax += resume_w + act_gap;

    let cross_rect = Rect::from_min_size(pos2(ax, act_y), vec2(cross_w, btn_h));
    if IconButton::show_cross(ui, cross_rect, pointer_in_row, scale, "Remove from history").clicked()
    {
        outcome = RowOutcome::RemoveSession {
            session_id: item.session_id.clone(),
            title: item.title.clone(),
        };
    }

    // 2. Progress column (150px) if visible
    let prog_w = if show_progress_col { 150.0 * scale } else { 0.0 };
    let text_right = if show_progress_col {
        let prog_x = (actions_x - col_gap - prog_w).max(inner.min.x + 120.0 * scale);
        let prog_bar_h = 6.0 * scale;
        let prog_bar_rect = Rect::from_min_size(
            pos2(prog_x, inner.center().y - prog_bar_h - 3.0 * scale),
            vec2(prog_w, prog_bar_h),
        );
        ProgressBar::show(ui, prog_bar_rect, item.progress, scale);

        let pct = format!("{}%", (item.progress * 100.0).round() as u32);
        let g_pct = layout_single_line_ellipsis(
            ui.ctx(),
            &pct,
            font_mono(11.0 * scale),
            pal.text_3,
            prog_w,
        );
        ui.painter().galley(
            pos2(prog_bar_rect.max.x - g_pct.size().x, prog_bar_rect.max.y + 5.0 * scale),
            g_pct,
            pal.text_3,
        );
        prog_x - col_gap
    } else {
        actions_x - col_gap
    };

    // 3. Text column (1fr, 3 single-line ellipsized lines)
    let text_w = (text_right - inner.min.x).max(40.0 * scale);
    let mut y = inner.min.y;

    // Line 1: Title + Episode badge + ×N + Rating (baseline-aligned, gap 8)
    let line1_h = 20.0 * scale;
    let gap8 = 8.0 * scale;

    // Pre-measure non-shrinkable trailing badges so title shrinks cleanly
    let mut trailing_w = 0.0f32;
    let ep_galley = item.episode.as_deref().map(|ep| {
        let g = layout_single_line_ellipsis(
            ui.ctx(),
            ep,
            font_outfit_medium(11.5 * scale),
            pal.text_2,
            100.0 * scale,
        );
        trailing_w += gap8 + g.size().x + 14.0 * scale;
        g
    });
    let plays_str = if item.plays > 1 {
        Some(format!("×{}", item.plays))
    } else {
        None
    };
    let plays_galley = plays_str.as_deref().map(|ps| {
        let g = layout_single_line_ellipsis(
            ui.ctx(),
            ps,
            font_outfit_regular(11.5 * scale),
            pal.text_3,
            60.0 * scale,
        );
        trailing_w += gap8 + g.size().x;
        g
    });
    let rating_str = item.rating.map(|r| format!("★ {r:.1}"));
    let rating_galley = rating_str.as_deref().map(|rs| {
        let g = layout_single_line_ellipsis(
            ui.ctx(),
            rs,
            font_outfit_medium(11.5 * scale),
            pal.accent_light,
            80.0 * scale,
        );
        trailing_w += gap8 + g.size().x;
        g
    });

    let title_max_w = (text_w - trailing_w).max(30.0 * scale);
    let g_title = layout_single_line_ellipsis(
        ui.ctx(),
        &item.title,
        font_outfit_semibold(14.5 * scale),
        pal.accent_light,
        title_max_w,
    );
    let mut lx = inner.min.x;
    let line1_cy = y + line1_h * 0.5;
    ui.painter().galley(
        pos2(lx, line1_cy - g_title.size().y * 0.5),
        g_title.clone(),
        pal.accent_light,
    );
    lx += g_title.size().x;

    if let Some(g_ep) = ep_galley {
        lx += gap8;
        let badge_w = g_ep.size().x + 14.0 * scale;
        let badge_h = 18.0 * scale;
        let badge_rect = Rect::from_min_size(
            pos2(lx, line1_cy - badge_h * 0.5),
            vec2(badge_w, badge_h),
        );
        ui.painter().rect_filled(
            badge_rect,
            CornerRadius::same((6.0 * scale).round() as u8),
            pal.bg,
        );
        ui.painter().galley(
            pos2(
                badge_rect.center().x - g_ep.size().x * 0.5,
                badge_rect.center().y - g_ep.size().y * 0.5,
            ),
            g_ep,
            pal.text_2,
        );
        lx += badge_w;
    }

    if let Some(g_plays) = plays_galley {
        lx += gap8;
        ui.painter().galley(
            pos2(lx, line1_cy - g_plays.size().y * 0.5),
            g_plays.clone(),
            pal.text_3,
        );
        lx += g_plays.size().x;
    }

    if let Some(g_rat) = rating_galley {
        lx += gap8;
        let rat_rect = Rect::from_min_size(
            pos2(lx, line1_cy - g_rat.size().y * 0.5),
            g_rat.size(),
        );
        ui.painter().galley(rat_rect.min, g_rat, pal.accent_light);
        let _ = ui.allocate_rect(rat_rect, Sense::hover()).on_hover_text("Rating");
    }

    y += line1_h + 4.0 * scale;

    // Line 2: Meta line "Watched 1m of 50m · paused at 1m"
    let line2_h = 18.0 * scale;
    let meta = format!(
        "Watched {} of {} · paused at {}",
        format_duration_short(item.watched_secs),
        format_duration_short(item.duration_secs),
        format_duration_short(item.paused_at_secs),
    );
    let g_meta = layout_single_line_ellipsis(
        ui.ctx(),
        &meta,
        font_outfit_regular(12.5 * scale),
        pal.text_2,
        text_w,
    );
    ui.painter().galley(
        pos2(inner.min.x, y + (line2_h - g_meta.size().y) * 0.5),
        g_meta,
        pal.text_2,
    );
    y += line2_h + 4.0 * scale;

    // Line 3: Parent folder ONLY, left-ellipsized, clickable
    if !item.parent_folder_str.is_empty() {
        let line3_h = 18.0 * scale;
        let g_path = elide_left(
            ui.ctx(),
            &item.parent_folder_str,
            font_mono(11.5 * scale),
            pal.text_3,
            text_w,
        );
        let link_w = g_path.size().x.min(text_w);
        let link_rect = Rect::from_min_size(pos2(inner.min.x, y), vec2(link_w, line3_h));
        let folder_exists = std::path::Path::new(&item.parent_folder_str).exists();
        let resp = LinkLabel::show(
            ui,
            link_rect,
            g_path,
            !folder_exists,
            &item.parent_folder_str,
            scale,
        );
        if resp.clicked() {
            outcome = RowOutcome::OpenFolder {
                file_path: item.file_path.clone(),
                folder_str: item.parent_folder_str.clone(),
            };
        }
    }

    outcome
}
