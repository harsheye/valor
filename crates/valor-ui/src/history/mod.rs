//! History page module: warm dark, amber accent, flat dense rows, virtualized feed.

pub mod data;
pub mod heatmap;
pub mod row;
pub mod trakt;

use crate::cnx_theme::{font_outfit_medium, font_outfit_regular, font_outfit_semibold};
use crate::history::data::{
    build_history_snapshot, format_duration_short, DayGroup, HistoryItem, HistoryState,
};
use crate::history::heatmap::{heatmap_card_height, render_heatmap_card, HeatmapOutcome};
use crate::history::row::{measure_row_height, render_history_row, RowOutcome};
use crate::history::trakt::TraktHistoryState;
use crate::shell::ShellAction;
use crate::shell_state::ShellState;
use crate::ui_kit::{
    layout_single_line_ellipsis, tokens, DebugOverlayState, Popover, Segmented, TextButton, Toast,
    ToastOutcome, ToastState,
};
use crate::view_models::HistoryFilterPill;
use chrono::{Datelike, Local, NaiveDate};
use egui::{
    pos2, vec2, Align2, Color32, CornerRadius, CursorIcon, Key, Rect, Sense, Stroke,
    StrokeKind, Ui,
};
use std::collections::HashSet;
use std::sync::Arc;
use valor_core::models::{MediaItem, WatchSession};

/// Pure responsive layout metrics computed from logical window width & UI scale.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct HistoryLayout {
    pub rail_w: f32,
    pub toolbar_h: f32,
    pub content_pad_x: f32,
    pub inner_max_w: f32,
    pub show_progress_col: bool,
    pub show_trakt_label: bool,
    pub show_toolbar_pills: bool,
    pub show_file_btn: bool,
    pub filter_below_search: bool,
}

/// Pure layout function: computes all responsive breakpoints from window width `win_w` and `scale`.
pub fn compute_layout(win_w: f32, scale: f32) -> HistoryLayout {
    let logical_w = win_w / scale.max(0.5);
    if logical_w >= 1100.0 {
        HistoryLayout {
            rail_w: 60.0 * scale,
            toolbar_h: 52.0 * scale,
            content_pad_x: 32.0 * scale,
            inner_max_w: 980.0 * scale,
            show_progress_col: true,
            show_trakt_label: true,
            show_toolbar_pills: true,
            show_file_btn: true,
            filter_below_search: false,
        }
    } else if logical_w >= 760.0 {
        HistoryLayout {
            rail_w: 60.0 * scale,
            toolbar_h: 52.0 * scale,
            content_pad_x: 24.0 * scale,
            inner_max_w: ((logical_w - 60.0 - 48.0).clamp(320.0, 980.0)) * scale,
            show_progress_col: true,
            show_trakt_label: true,
            show_toolbar_pills: true,
            show_file_btn: true,
            filter_below_search: false,
        }
    } else {
        HistoryLayout {
            rail_w: 52.0 * scale,
            toolbar_h: 52.0 * scale,
            content_pad_x: 16.0 * scale,
            inner_max_w: ((logical_w - 52.0 - 32.0).max(200.0)) * scale,
            show_progress_col: false,
            show_trakt_label: logical_w >= 480.0,
            show_toolbar_pills: false,
            show_file_btn: false,
            filter_below_search: true,
        }
    }
}

/// Persistent UI state for the History page (stored in `ShellState`).
#[derive(Debug, Default)]
pub struct HistoryUiState {
    pub selected_year: Option<i32>,
    pub removed_session_ids: HashSet<String>,
    pub trakt: TraktHistoryState,
    pub toast: Option<ToastState>,
    pub date_picker_open: bool,
    pub date_picker_ym: Option<(i32, u32)>,
    pub clear_confirm_open: bool,
    pub debug: DebugOverlayState,
    pub cached_snapshot: Option<Arc<HistoryState>>,
    pub cached_key: (usize, usize, i32, bool, usize, usize),
}

enum FlatRow<'a> {
    DayHeader {
        group: &'a DayGroup,
        filtered_videos: usize,
    },
    Item(&'a HistoryItem),
}

/// Renders the complete History page into `outer_ui`.
pub fn render_history_page(
    outer_ui: &mut Ui,
    state: &mut ShellState,
    sessions: &[WatchSession],
    items: &[MediaItem],
) -> ShellAction {
    crate::cnx_theme::install_cnx_fonts(outer_ui.ctx());
    let scale = 1.0_f32;
    let available = outer_ui.max_rect();
    let mut action = ShellAction::None;

    // Keyboard: Esc clears day filter first, then search
    if outer_ui.input(|i| i.key_pressed(Key::Escape)) {
        if state.history_ui.date_picker_open {
            state.history_ui.date_picker_open = false;
        } else if state.history_ui.clear_confirm_open {
            state.history_ui.clear_confirm_open = false;
        } else if state.history_selected_day.is_some() {
            state.history_selected_day = None;
        } else if !state.history_search.is_empty() {
            state.history_search.clear();
        }
    }

    let reason = if outer_ui.input(|i| !i.events.is_empty()) {
        "input"
    } else {
        "data"
    };
    state.history_ui.debug.begin_frame(outer_ui.ctx(), reason);

    let pal = crate::ui_kit::palette(outer_ui.ctx());
    outer_ui
        .painter()
        .rect_filled(available, CornerRadius::ZERO, pal.bg);

    let win_w = outer_ui.ctx().content_rect().width();
    let layout = compute_layout(win_w, scale);
    state.history_ui.debug.track("history_page", available);

    let current_year = Local::now().date_naive().year();
    let selected_year = state.history_ui.selected_year.unwrap_or(current_year);
    let trakt_connected = !state.settings.trakt_access_token.is_empty();

    // Rebuild Arc<HistoryState> snapshot only when inputs change
    let cache_key = (
        sessions.len(),
        items.len(),
        selected_year,
        trakt_connected,
        state.history_ui.removed_session_ids.len(),
        state.history_ui.trakt.optimistically_done.len()
            + state.history_ui.trakt.watched_keys.len(),
    );
    if state.history_ui.cached_snapshot.is_none() || state.history_ui.cached_key != cache_key {
        let snap = build_history_snapshot(
            sessions,
            items,
            &state.tmdb_series_cache,
            &state.history_ui.trakt.watched_keys,
            &state.history_ui.trakt.optimistically_done,
            &state.history_ui.removed_session_ids,
            selected_year,
            trakt_connected,
        );
        state.history_ui.cached_snapshot = Some(snap);
        state.history_ui.cached_key = cache_key;
    }
    let snapshot = state.history_ui.cached_snapshot.clone().unwrap();

    // Content column centered, max width 980, padding 26 / 32 / 60 / 32
    let pad_top = 26.0 * scale;
    let pad_bottom = 60.0 * scale;
    let col_w = (available.width() - layout.content_pad_x * 2.0)
        .min(layout.inner_max_w)
        .max(200.0 * scale);
    let side_pad = ((available.width() - col_w) * 0.5).max(layout.content_pad_x);

    let mut scroll_ui = outer_ui.new_child(egui::UiBuilder::new().max_rect(available));
    scroll_ui.shrink_clip_rect(available);
    let mut scroll_style = egui::style::ScrollStyle::solid();
    scroll_style.bar_width = 7.0;
    scroll_style.bar_inner_margin = 4.0;
    scroll_style.bar_outer_margin = 4.0;
    scroll_ui.style_mut().spacing.scroll = scroll_style;

    let mut date_btn_rect: Option<Rect> = None;
    let mut clear_btn_rect: Option<Rect> = None;

    let scroll_out = egui::ScrollArea::vertical()
        .id_salt("cnx_history_scroll")
        .auto_shrink([false; 2])
        .scroll_bar_visibility(egui::scroll_area::ScrollBarVisibility::VisibleWhenNeeded)
        .show(&mut scroll_ui, |ui| {
            ui.add_space(pad_top);
            ui.horizontal(|ui| {
                ui.add_space(side_pad);
                ui.allocate_ui_with_layout(
                    vec2(col_w, 0.0),
                    egui::Layout::top_down(egui::Align::Min),
                    |ui| {
                        ui.set_width(col_w);

                        // 1. Heatmap Card
                        let hm_h = heatmap_card_height(scale);
                        let (_, hm_rect) = ui.allocate_space(vec2(col_w, hm_h));
                        state.history_ui.debug.track("heatmap_card", hm_rect);
                        let mut hm_ui = ui.new_child(egui::UiBuilder::new().max_rect(hm_rect).id_salt("hm_card_child"));
                        match render_heatmap_card(
                            &mut hm_ui,
                            hm_rect,
                            &snapshot.heatmap_counts,
                            snapshot.total_sessions_year,
                            selected_year,
                            state.history_selected_day,
                            scale,
                        ) {
                            HeatmapOutcome::SelectYear(yr) => {
                                state.history_ui.selected_year = Some(yr);
                                state.history_selected_day = None;
                            }
                            HeatmapOutcome::ToggleDay(d) => {
                                if state.history_selected_day == Some(d) {
                                    state.history_selected_day = None;
                                } else {
                                    state.history_selected_day = Some(d);
                                }
                            }
                            HeatmapOutcome::None => {}
                        }

                        // 2. Watch Activity Toolbar (30px below card)
                        ui.add_space(30.0 * scale);
                        let (d_rect, c_rect) =
                            render_watch_toolbar(ui, state, col_w, &layout, scale);
                        date_btn_rect = Some(d_rect);
                        clear_btn_rect = Some(c_rect);
                        ui.add_space(18.0 * scale);

                        // 3. Filter DayGroups
                        let search_q = state.history_search.trim().to_lowercase();
                        let filtered_groups: Vec<(&DayGroup, Vec<&HistoryItem>)> = snapshot
                            .day_groups
                            .iter()
                            .filter(|g| {
                                state.history_selected_day.is_none_or(|d| g.date == d)
                            })
                            .filter_map(|g| {
                                let matched: Vec<&HistoryItem> = g
                                    .items
                                    .iter()
                                    .filter(|item| {
                                        let seg_ok = match state.history_filter {
                                            HistoryFilterPill::All => true,
                                            HistoryFilterPill::StoppedEarly => {
                                                !item.marked_done && item.progress < 0.90
                                            }
                                            HistoryFilterPill::Finished => {
                                                item.marked_done || item.progress >= 0.90
                                            }
                                            _ => true,
                                        };
                                        let q_ok = search_q.is_empty()
                                            || item.title.to_lowercase().contains(&search_q)
                                            || item
                                                .parent_folder_str
                                                .to_lowercase()
                                                .contains(&search_q);
                                        seg_ok && q_ok
                                    })
                                    .collect();
                                if matched.is_empty() {
                                    None
                                } else {
                                    Some((g, matched))
                                }
                            })
                            .collect();

                        if filtered_groups.is_empty() {
                            let empty_msg = match state.history_filter {
                                HistoryFilterPill::Finished => {
                                    "Nothing finished yet. Keep watching to the credits."
                                }
                                _ => "No sessions match. Clear the filters to see everything.",
                            };
                            let (er, _) = ui.allocate_exact_size(
                                vec2(col_w, 100.0 * scale),
                                Sense::hover(),
                            );
                            let g = layout_single_line_ellipsis(
                                ui.ctx(),
                                empty_msg,
                                font_outfit_regular(13.0 * scale),
                                tokens::TEXT_2,
                                col_w - 32.0 * scale,
                            );
                            ui.painter().galley(
                                pos2(er.center().x - g.size().x * 0.5, er.center().y - g.size().y * 0.5),
                                g,
                                tokens::TEXT_2,
                            );
                        } else {
                            // Flatten into virtualizable rows with known heights
                            let mut flat: Vec<FlatRow<'_>> = Vec::new();
                            let mut header_offsets: Vec<(f32, &DayGroup, usize)> = Vec::new();
                            let hdr_h = 62.0 * scale;
                            let row_h = measure_row_height(scale);
                            let mut cur_y = 0.0f32;

                            for (g, matched) in &filtered_groups {
                                let mut uniq = HashSet::new();
                                for it in matched {
                                    uniq.insert(it.fingerprint.as_str());
                                }
                                let vid_count = uniq.len();
                                header_offsets.push((cur_y, g, vid_count));
                                flat.push(FlatRow::DayHeader {
                                    group: g,
                                    filtered_videos: vid_count,
                                });
                                cur_y += hdr_h;
                                for it in matched {
                                    flat.push(FlatRow::Item(it));
                                    cur_y += row_h;
                                }
                            }

                            let (_, list_rect) = ui.allocate_space(vec2(col_w, cur_y));
                            let clip = ui.clip_rect();
                            let vis_top = clip.min.y;
                            let vis_bottom = clip.max.y;

                            // Render only visible rows + headers
                            let mut y = list_rect.min.y;
                            for (row_i, entry) in flat.iter().enumerate() {
                                let h = match entry {
                                    FlatRow::DayHeader { .. } => hdr_h,
                                    FlatRow::Item(_) => row_h,
                                };
                                if y + h >= vis_top && y <= vis_bottom {
                                    let r = Rect::from_min_size(pos2(list_rect.min.x, y), vec2(col_w, h));
                                    let mut item_ui = ui.new_child(
                                        egui::UiBuilder::new()
                                            .max_rect(r)
                                            .id_salt(("hist_row", row_i)),
                                    );
                                    match entry {
                                        FlatRow::DayHeader {
                                            group,
                                            filtered_videos,
                                        } => {
                                            render_day_header(
                                                &mut item_ui,
                                                r,
                                                group,
                                                *filtered_videos,
                                                scale,
                                            );
                                        }
                                        FlatRow::Item(item) => {
                                            match render_history_row(
                                                &mut item_ui,
                                                r,
                                                item,
                                                trakt_connected,
                                                layout.show_progress_col,
                                                layout.show_trakt_label,
                                                scale,
                                            ) {
                                                RowOutcome::Resume { path, start_secs } => {
                                                    action = ShellAction::PlayMediaFromMiniBar {
                                                        path,
                                                        start_secs,
                                                        audio_only: false,
                                                    };
                                                }
                                                RowOutcome::RemoveSession { session_id, title } => {
                                                    state
                                                        .history_ui
                                                        .removed_session_ids
                                                        .insert(session_id.clone());
                                                    state.history_ui.toast = Some(ToastState {
                                                        message: format!("Removed {title}"),
                                                        action_label: Some("Undo".to_string()),
                                                        undo_session_id: Some(session_id.clone()),
                                                        expires_at: std::time::Instant::now()
                                                            + std::time::Duration::from_secs(5),
                                                    });
                                                    action = ShellAction::DeleteHistorySession(
                                                        session_id,
                                                    );
                                                }
                                                RowOutcome::OpenFolder {
                                                    file_path,
                                                    folder_str,
                                                } => {
                                                    if !open_folder_in_os(&file_path, &folder_str) {
                                                        state.history_ui.toast = Some(ToastState {
                                                            message: "Folder not found".to_string(),
                                                            action_label: None,
                                                            undo_session_id: None,
                                                            expires_at: std::time::Instant::now()
                                                                + std::time::Duration::from_secs(4),
                                                        });
                                                    }
                                                }
                                                RowOutcome::MarkTrakt(payload) => {
                                                    state
                                                        .history_ui
                                                        .trakt
                                                        .mark_optimistic(&payload.fingerprint);
                                                    state.history_ui.toast = Some(ToastState {
                                                        message: "Marked watched on Trakt"
                                                            .to_string(),
                                                        action_label: None,
                                                        undo_session_id: None,
                                                        expires_at: std::time::Instant::now()
                                                            + std::time::Duration::from_secs(4),
                                                    });
                                                    action =
                                                        ShellAction::MarkTraktWatched(payload);
                                                }
                                                RowOutcome::None => {}
                                            }
                                        }
                                    }
                                }
                                y += h;
                            }

                            // Sticky Day Header pinned at top of scroll viewport when scrolled past first header
                            if let Some(&(_, sticky_grp, sticky_vids)) = header_offsets
                                .iter()
                                .rev()
                                .find(|&&(off, _, _)| list_rect.min.y + off < vis_top)
                            {
                                let sticky_rect = Rect::from_min_size(
                                    pos2(list_rect.min.x, vis_top),
                                    vec2(col_w, hdr_h),
                                );
                                // Paint solid bg + bottom fade
                                ui.painter().rect_filled(
                                    sticky_rect,
                                    CornerRadius::ZERO,
                                    pal.bg,
                                );
                                render_day_header(
                                    ui,
                                    sticky_rect,
                                    sticky_grp,
                                    sticky_vids,
                                    scale,
                                );
                            }
                        }
                    },
                );
            });
            ui.add_space(pad_bottom);
        });
    let _ = scroll_out;

    // Popovers: Date Picker & Clear History confirmation
    if state.history_ui.date_picker_open {
        if let Some(d_rect) = date_btn_rect {
            render_date_picker_popover(outer_ui, state, d_rect, available, &snapshot, scale);
        }
    }
    if state.history_ui.clear_confirm_open {
        if let Some(c_rect) = clear_btn_rect {
            if let Some(clear_act) =
                render_clear_confirm_popover(outer_ui, state, c_rect, available, scale)
            {
                action = clear_act;
            }
        }
    }

    // Floating Toast (with Undo)
    if let ToastOutcome::Undo(session_id) =
        Toast::show(outer_ui, available, &mut state.history_ui.toast, scale)
    {
        state.history_ui.removed_session_ids.remove(&session_id);
        action = ShellAction::UndoDeleteHistorySession(session_id);
    }

    // F12 Debug Overlay
    state.history_ui.debug.paint(outer_ui, available, scale);

    action
}

fn render_watch_toolbar(
    ui: &mut Ui,
    state: &mut ShellState,
    col_w: f32,
    layout: &HistoryLayout,
    scale: f32,
) -> (Rect, Rect) {
    let h = 34.0 * scale;
    let gap = 10.0 * scale;

    let seg_opts = ["All", "Stopped early", "Finished"];
    let active_seg = match state.history_filter {
        HistoryFilterPill::StoppedEarly => 1,
        HistoryFilterPill::Finished => 2,
        _ => 0,
    };
    let seg = Segmented::new(&seg_opts, active_seg);
    let seg_w = seg.measure_width(ui.ctx(), scale);

    let row_h = if layout.filter_below_search {
        h * 2.0 + 10.0 * scale
    } else {
        h
    };
    let (_, tb_rect) = ui.allocate_space(vec2(col_w, row_h));
    let mut tb_ui = ui.new_child(egui::UiBuilder::new().max_rect(tb_rect).id_salt("watch_tb_child"));
    let ui = &mut tb_ui;

    let pal = crate::ui_kit::palette(ui.ctx());
    let mut x = tb_rect.min.x;
    let y = tb_rect.min.y;

    // "Watch activity" (17/semibold)
    let g_title = layout_single_line_ellipsis(
        ui.ctx(),
        "Watch activity",
        font_outfit_semibold(17.0 * scale),
        pal.text,
        200.0 * scale,
    );
    ui.painter().galley(
        pos2(x, y + (h - g_title.size().y) * 0.5),
        g_title.clone(),
        pal.text,
    );
    x += g_title.size().x + gap;

    // Removable selected-day chip if a day is selected
    if let Some(sel_day) = state.history_selected_day {
        let chip_txt = format!("{}  ×", sel_day.format("%d %b %Y"));
        let g_chip = layout_single_line_ellipsis(
            ui.ctx(),
            &chip_txt,
            font_outfit_medium(12.0 * scale),
            pal.accent,
            140.0 * scale,
        );
        let cw = g_chip.size().x + 20.0 * scale;
        let chip_r = Rect::from_min_size(pos2(x, y + 3.0 * scale), vec2(cw, 28.0 * scale));
        let c_resp = ui.allocate_rect(chip_r, Sense::click()).on_hover_text("Clear day filter");
        if c_resp.hovered() {
            ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
        }
        ui.painter().rect_filled(
            chip_r,
            CornerRadius::same((9.0 * scale).round() as u8),
            pal.accent_tint,
        );
        ui.painter().galley(
            pos2(chip_r.center().x - g_chip.size().x * 0.5, chip_r.center().y - g_chip.size().y * 0.5),
            g_chip,
            pal.accent,
        );
        if c_resp.clicked() {
            state.history_selected_day = None;
        }
        x += cw + gap;
    }

    // "Pick date" button (TEXT ONLY)
    let pick_btn = TextButton::primary_accent("Pick date");
    let pick_w = pick_btn.measure_width(ui.ctx(), 14.0, scale);
    let date_btn_rect = Rect::from_min_size(pos2(x, y), vec2(pick_w, h));
    if pick_btn.show(ui, date_btn_rect, scale).clicked() {
        state.history_ui.date_picker_open = !state.history_ui.date_picker_open;
        state.history_ui.clear_confirm_open = false;
    }
    x += pick_w + gap;

    // "Clear history" button (TEXT ONLY)
    let clear_btn = TextButton::danger_subtle("Clear history");
    let clear_w = clear_btn.measure_width(ui.ctx(), 14.0, scale);
    let clear_btn_rect = Rect::from_min_size(pos2(x, y), vec2(clear_w, h));
    if clear_btn.show(ui, clear_btn_rect, scale).clicked() {
        state.history_ui.clear_confirm_open = !state.history_ui.clear_confirm_open;
        state.history_ui.date_picker_open = false;
    }
    x += clear_w + gap;

    // Title search: height 34, width 190 (clamped), radius 11, bg card, 15px search glyph, "Search title"
    let right_limit = if layout.filter_below_search {
        tb_rect.max.x
    } else {
        (tb_rect.max.x - seg_w - gap).max(x + 80.0 * scale)
    };
    let search_w = (190.0 * scale).min((right_limit - x).max(80.0 * scale));
    let search_rect = Rect::from_min_size(pos2(x, y), vec2(search_w, h));
    ui.painter().rect(
        search_rect,
        CornerRadius::same((11.0 * scale).round() as u8),
        pal.card,
        Stroke::new(1.0, pal.line),
        StrokeKind::Inside,
    );
    // 15px search glyph
    let gc = pos2(search_rect.min.x + 16.0 * scale, search_rect.center().y);
    ui.painter().circle_stroke(gc - vec2(1.0, 1.0) * scale, 4.5 * scale, Stroke::new(1.5 * scale, pal.text_3));
    ui.painter().line_segment(
        [gc + vec2(2.3, 2.3) * scale, gc + vec2(5.5, 5.5) * scale],
        Stroke::new(1.5 * scale, pal.text_3),
    );
    let edit_rect = Rect::from_min_max(
        pos2(search_rect.min.x + 30.0 * scale, search_rect.min.y + 4.0 * scale),
        pos2(search_rect.max.x - 10.0 * scale, search_rect.max.y - 4.0 * scale),
    );
    let mut edit_ui = ui.new_child(
        egui::UiBuilder::new()
            .max_rect(edit_rect)
            .layout(egui::Layout::left_to_right(egui::Align::Center)),
    );
    edit_ui.add(
        egui::TextEdit::singleline(&mut state.history_search)
            .hint_text(
                egui::RichText::new("Search title")
                    .font(font_outfit_regular(13.0 * scale))
                    .color(tokens::TEXT_3),
            )
            .font(font_outfit_regular(13.0 * scale))
            .text_color(tokens::TEXT)
            .frame(egui::Frame::NONE),
    );

    // Segmented control: right-aligned or below search on narrow windows
    let seg_rect = if layout.filter_below_search {
        Rect::from_min_size(pos2(tb_rect.min.x, y + h + 10.0 * scale), vec2(seg_w, h))
    } else {
        Rect::from_min_size(pos2(tb_rect.max.x - seg_w, y), vec2(seg_w, h))
    };
    if let Some(idx) = seg.show(ui, seg_rect, scale) {
        state.history_filter = match idx {
            1 => HistoryFilterPill::StoppedEarly,
            2 => HistoryFilterPill::Finished,
            _ => HistoryFilterPill::All,
        };
    }

    (date_btn_rect, clear_btn_rect)
}

fn render_day_header(
    ui: &mut Ui,
    rect: Rect,
    group: &DayGroup,
    filtered_videos: usize,
    scale: f32,
) {
    let today = Local::now().date_naive();
    let yesterday = today - chrono::Duration::days(1);
    let (prefix_opt, date_str) = if group.date == today {
        (Some("Today "), group.date.format("%d %b %Y").to_string())
    } else if group.date == yesterday {
        (Some("Yesterday "), group.date.format("%d %b %Y").to_string())
    } else {
        (None, group.date.format("%d %b %Y").to_string())
    };

    let pal = crate::ui_kit::palette(ui.ctx());
    let top_y = rect.min.y + 10.0 * scale;
    let line1_cy = top_y + 10.0 * scale;
    let mut lx = rect.min.x;

    if let Some(prefix) = prefix_opt {
        let gp = layout_single_line_ellipsis(
            ui.ctx(),
            prefix,
            font_outfit_semibold(15.0 * scale),
            pal.accent,
            120.0 * scale,
        );
        ui.painter().galley(
            pos2(lx, line1_cy - gp.size().y * 0.5),
            gp.clone(),
            pal.accent,
        );
        lx += gp.size().x;
    }

    let gd = layout_single_line_ellipsis(
        ui.ctx(),
        &date_str,
        font_outfit_semibold(15.0 * scale),
        pal.text,
        160.0 * scale,
    );
    ui.painter().galley(
        pos2(lx, line1_cy - gd.size().y * 0.5),
        gd.clone(),
        pal.text,
    );
    lx += gd.size().x + 14.0 * scale;

    let sess_word = if group.sessions == 1 { "session" } else { "sessions" };
    let totals = format!("{} · {} {sess_word}", format_duration_short(group.total_secs), group.sessions);
    let gt = layout_single_line_ellipsis(
        ui.ctx(),
        &totals,
        font_outfit_regular(13.0 * scale),
        pal.text_3,
        180.0 * scale,
    );
    let rx = rect.max.x - gt.size().x;
    ui.painter().galley(
        pos2(rx, line1_cy - gt.size().y * 0.5),
        gt,
        pal.text_3,
    );

    if rx - 14.0 * scale > lx {
        ui.painter().hline(
            lx..=(rx - 14.0 * scale),
            line1_cy,
            Stroke::new(1.0, pal.line),
        );
    }

    // Plain text line below (NO icon): "Watched N videos"
    let vid_word = if filtered_videos == 1 { "video" } else { "videos" };
    let watched_line = format!("Watched {filtered_videos} {vid_word}");
    let gw = layout_single_line_ellipsis(
        ui.ctx(),
        &watched_line,
        font_outfit_regular(13.0 * scale),
        pal.text_2,
        rect.width(),
    );
    ui.painter().galley(
        pos2(rect.min.x, top_y + 24.0 * scale),
        gw,
        pal.text_2,
    );

    // 1px top border before rows
    ui.painter().hline(
        rect.min.x..=rect.max.x,
        rect.max.y - 0.5,
        Stroke::new(1.0, pal.line),
    );
}

fn render_date_picker_popover(
    ui: &mut Ui,
    state: &mut ShellState,
    anchor: Rect,
    bounds: Rect,
    snapshot: &HistoryState,
    scale: f32,
) {
    let today = Local::now().date_naive();
    let (mut cal_year, mut cal_month) = state
        .history_ui
        .date_picker_ym
        .unwrap_or((today.year(), today.month()));
    let cal_w = 272.0 * scale;
    let cal_h = 264.0 * scale;
    let pos = pos2(
        anchor.min.x.min(bounds.max.x - cal_w - 8.0),
        anchor.max.y + 6.0 * scale,
    );
    let pop_rect = Rect::from_min_size(pos, vec2(cal_w, cal_h));

    egui::Area::new(ui.scope_id().with("cnx_history_date_picker"))
        .order(egui::Order::Foreground)
        .fixed_pos(pos)
        .show(ui.ctx(), |ui| {
            let (r, _) = ui.allocate_exact_size(vec2(cal_w, cal_h), Sense::hover());
            Popover::paint_frame(ui, r, scale);

            let pad = 12.0 * scale;
            let first = NaiveDate::from_ymd_opt(cal_year, cal_month, 1).unwrap_or(today);
            let prev_r = Rect::from_min_size(pos2(r.min.x + pad, r.min.y + pad), vec2(26.0 * scale, 24.0 * scale));
            let next_r = Rect::from_min_size(pos2(r.max.x - pad - 26.0 * scale, r.min.y + pad), vec2(26.0 * scale, 24.0 * scale));
            if TextButton::subtle("<").show(ui, prev_r, scale).clicked() {
                if cal_month == 1 {
                    cal_month = 12;
                    cal_year -= 1;
                } else {
                    cal_month -= 1;
                }
            }
            if TextButton::subtle(">").show(ui, next_r, scale).clicked() {
                if cal_month == 12 {
                    cal_month = 1;
                    cal_year += 1;
                } else {
                    cal_month += 1;
                }
            }
            let gm = layout_single_line_ellipsis(
                ui.ctx(),
                &first.format("%B %Y").to_string(),
                font_outfit_semibold(13.0 * scale),
                tokens::TEXT,
                160.0 * scale,
            );
            ui.painter().galley(
                pos2(r.center().x - gm.size().x * 0.5, prev_r.center().y - gm.size().y * 0.5),
                gm,
                tokens::TEXT,
            );

            let cell_sz = 32.0 * scale;
            let start_y = prev_r.max.y + 8.0 * scale;
            let start_x = r.min.x + pad;
            for (ci, wd) in ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].iter().enumerate() {
                let cr = Rect::from_min_size(pos2(start_x + ci as f32 * (cell_sz + 2.0), start_y), vec2(cell_sz, 18.0 * scale));
                ui.painter().text(cr.center(), Align2::CENTER_CENTER, *wd, font_outfit_regular(11.0 * scale), tokens::TEXT_3);
            }

            let start_offset = first.weekday().num_days_from_sunday() as i64;
            let next_m = if cal_month == 12 {
                NaiveDate::from_ymd_opt(cal_year + 1, 1, 1)
            } else {
                NaiveDate::from_ymd_opt(cal_year, cal_month + 1, 1)
            }.unwrap_or(today);
            let days_in_m = next_m.signed_duration_since(first).num_days();
            for day_num in 1..=days_in_m {
                let idx = start_offset + day_num - 1;
                let row = idx / 7;
                let col = idx % 7;
                let d = NaiveDate::from_ymd_opt(cal_year, cal_month, day_num as u32).unwrap_or(today);
                let cr = Rect::from_min_size(
                    pos2(
                        start_x + col as f32 * (cell_sz + 2.0),
                        start_y + 22.0 * scale + row as f32 * (cell_sz + 2.0),
                    ),
                    vec2(cell_sz, cell_sz),
                );
                let resp = ui.allocate_rect(cr, Sense::click());
                if resp.hovered() {
                    ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
                }
                let is_sel = state.history_selected_day == Some(d);
                let has_data = snapshot.heatmap_counts.get(&d).copied().unwrap_or(0) > 0;
                let bg = if is_sel {
                    tokens::ACCENT
                } else if resp.hovered() {
                    tokens::CARD_HOVER
                } else if has_data {
                    tokens::ACCENT_TINT
                } else {
                    Color32::TRANSPARENT
                };
                if bg != Color32::TRANSPARENT {
                    ui.painter().rect_filled(cr, CornerRadius::same(6), bg);
                }
                let fg = if is_sel {
                    tokens::ACCENT_ON_FILL
                } else if has_data {
                    tokens::ACCENT
                } else {
                    tokens::TEXT_2
                };
                ui.painter().text(cr.center(), Align2::CENTER_CENTER, day_num.to_string(), font_outfit_regular(12.0 * scale), fg);
                if resp.clicked() {
                    state.history_selected_day = Some(d);
                    state.history_ui.date_picker_open = false;
                }
            }
        });

    state.history_ui.date_picker_ym = Some((cal_year, cal_month));
    if ui.input(|i| i.pointer.any_pressed())
        && !ui.rect_contains_pointer(pop_rect)
        && !ui.rect_contains_pointer(anchor)
    {
        state.history_ui.date_picker_open = false;
    }
}

fn render_clear_confirm_popover(
    ui: &mut Ui,
    state: &mut ShellState,
    anchor: Rect,
    bounds: Rect,
    scale: f32,
) -> Option<ShellAction> {
    let mut out = None;
    let w = 236.0 * scale;
    let h = 92.0 * scale;
    let pos = pos2(
        anchor.min.x.min(bounds.max.x - w - 8.0),
        anchor.max.y + 6.0 * scale,
    );
    let pop_rect = Rect::from_min_size(pos, vec2(w, h));

    egui::Area::new(ui.scope_id().with("cnx_clear_history_confirm"))
        .order(egui::Order::Foreground)
        .fixed_pos(pos)
        .show(ui.ctx(), |ui| {
            let (r, _) = ui.allocate_exact_size(vec2(w, h), Sense::hover());
            Popover::paint_frame(ui, r, scale);
            let pad = 14.0 * scale;
            let gm = layout_single_line_ellipsis(
                ui.ctx(),
                "Clear all watch history?",
                font_outfit_semibold(13.0 * scale),
                tokens::TEXT,
                w - pad * 2.0,
            );
            ui.painter().galley(pos2(r.min.x + pad, r.min.y + pad), gm, tokens::TEXT);

            let btn_y = r.max.y - pad - 30.0 * scale;
            let cancel_r = Rect::from_min_size(pos2(r.min.x + pad, btn_y), vec2(92.0 * scale, 30.0 * scale));
            let confirm_r = Rect::from_min_size(pos2(r.max.x - pad - 96.0 * scale, btn_y), vec2(96.0 * scale, 30.0 * scale));
            if TextButton::subtle("Cancel").show(ui, cancel_r, scale).clicked() {
                state.history_ui.clear_confirm_open = false;
            }
            if TextButton::danger_subtle("Clear all").show(ui, confirm_r, scale).clicked() {
                state.history_ui.clear_confirm_open = false;
                state.history_ui.removed_session_ids.clear();
                out = Some(ShellAction::ClearHistory {
                    reset_positions: false,
                });
            }
        });

    if ui.input(|i| i.pointer.any_pressed())
        && !ui.rect_contains_pointer(pop_rect)
        && !ui.rect_contains_pointer(anchor)
    {
        state.history_ui.clear_confirm_open = false;
    }

    out
}

fn open_folder_in_os(file_path: &std::path::Path, folder_str: &str) -> bool {
    let folder = std::path::Path::new(folder_str);
    if !folder.exists() && !file_path.exists() {
        return false;
    }
    #[cfg(target_os = "windows")]
    {
        if file_path.exists() && file_path.is_file() {
            let arg = format!("/select,\"{}\"", file_path.display());
            let _ = std::process::Command::new("explorer").raw_arg_compat(&arg).spawn();
        } else {
            let _ = std::process::Command::new("explorer").arg(folder_str).spawn();
        }
        return true;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = file_path;
        let _ = std::process::Command::new("xdg-open").arg(folder_str).spawn();
        true
    }
}

#[cfg(target_os = "windows")]
trait CommandRawArgCompat {
    fn raw_arg_compat(&mut self, arg: &str) -> &mut Self;
}

#[cfg(target_os = "windows")]
impl CommandRawArgCompat for std::process::Command {
    fn raw_arg_compat(&mut self, arg: &str) -> &mut Self {
        use std::os::windows::process::CommandExt;
        self.raw_arg(arg)
    }
}
