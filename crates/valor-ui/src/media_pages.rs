//! Native History and Library page content rendered inside the existing shell.

use std::collections::HashMap;

use egui::{
    Align, Align2, Color32, CornerRadius, FontId, Frame, Layout, Pos2, Rect, RichText, Sense, Stroke,
    StrokeKind, Ui, Vec2, vec2,
};
use valor_core::models::{HistoryEntry, MediaItem, PlaybackPosition, WatchSession};

use crate::shell::ShellAction;
use crate::shell_state::ShellState;
use crate::shell_tokens::{spacing, typography, ShellTokens};
use crate::texture_cache::LruTextureCache;
use crate::view_models::{
    build_movie_card_view_models, build_other_media_card_view_models, build_series_card_view_models,
    FilterPill, LibraryTab, MovieCardViewModel, SeriesCardViewModel,
};

fn thumbnail_path(fingerprint: &str) -> Option<std::path::PathBuf> {
    if fingerprint.is_empty() {
        return None;
    }
    let dirs = directories::ProjectDirs::from("com", "valor", "Valor")?;
    let path = dirs
        .cache_dir()
        .join("thumbnails")
        .join(format!("{fingerprint}.jpg"));
    if path.is_file() {
        if let Ok(meta) = path.metadata() {
            // 6146, 6479, and 14276 bytes are VLC cone icon files. Reject so it displays as named card.
            if meta.len() == 6146 || meta.len() == 6479 || meta.len() == 14276 || meta.len() < 1200 {
                return None;
            }
        }
        Some(path)
    } else {
        None
    }
}

fn padded_choice(ui: &mut Ui, label: &str, selected: bool, tokens: &ShellTokens) -> egui::Response {
    let fill = if selected {
        tokens.accent.gamma_multiply(0.24)
    } else {
        tokens.card_fill
    };
    let stroke = Stroke::new(
        1.0,
        if selected {
            tokens.accent
        } else {
            tokens.divider
        },
    );
    ui.add_sized(
        [ui.available_width().clamp(68.0, 160.0), 36.0],
        egui::Button::new(RichText::new(label).size(13.5))
            .fill(fill)
            .stroke(stroke)
            .corner_radius(CornerRadius::same(8)),
    )
}

fn card_frame(tokens: &ShellTokens) -> Frame {
    Frame::new()
        .fill(tokens.card_fill)
        .stroke(Stroke::new(1.0, tokens.divider))
        .corner_radius(CornerRadius::same(8))
        .inner_margin(12.0)
}

#[allow(dead_code)]
fn history_card_frame(tokens: &ShellTokens) -> Frame {
    Frame::new()
        .fill(tokens.card_fill)
        .stroke(Stroke::new(1.0, tokens.divider))
        .corner_radius(CornerRadius::same(12))
        .inner_margin(18.0)
}

fn sample_history_sessions() -> Vec<WatchSession> {
    let now = chrono::Utc::now();
    [
        ("The Blue Road", "S1E1", 1, 0.0, 1372.0, false, false, 0.0),
        ("Liar Game", "S1E7", 2, 0.0, 1320.0, true, true, 0.0),
        ("Liar Game", "S1E5", 3, 0.0, 1320.0, true, true, 3.5),
        ("Liar Game", "S1E4", 4, 0.0, 1380.0, true, true, 3.0),
        ("Video", "", 5, 0.0, 180.0, false, false, 0.0),
    ]
    .into_iter()
    .enumerate()
    .map(
        |(index, (show, ep, hours_ago, start_pos, end_pos, completed, stopped_early, _rating))| {
            let end_time = now - chrono::Duration::hours(hours_ago);
            let full_title = if ep.is_empty() {
                show.to_owned()
            } else {
                format!("{show} · {ep}")
            };
            WatchSession {
                id: format!("sample-history-{index}"),
                fingerprint: format!("sample-fingerprint-{index}"),
                collection_id: None,
                item_title: full_title,
                start_time: end_time - chrono::Duration::minutes(24),
                end_time,
                start_pos_secs: start_pos,
                end_pos_secs: end_pos,
                completed,
                stopped_early,
            }
        },
    )
    .collect()
}

fn title_letter(title: &str) -> String {
    title
        .trim()
        .chars()
        .next()
        .map(|c| c.to_uppercase().to_string())
        .unwrap_or_default()
}

fn sort_label(sort: crate::view_models::SortOption) -> &'static str {
    match sort {
        crate::view_models::SortOption::RecentlyAdded
        | crate::view_models::SortOption::DateAddedDesc => "Recently added",
        crate::view_models::SortOption::TitleAsc => "Title A–Z",
        crate::view_models::SortOption::TitleDesc => "Title Z–A",
        crate::view_models::SortOption::YearDesc => "Year newest",
        crate::view_models::SortOption::YearAsc => "Year oldest",
        crate::view_models::SortOption::DurationDesc => "Duration",
        crate::view_models::SortOption::LastWatched => "Recently watched",
        crate::view_models::SortOption::Progress => "Progress",
    }
}

fn title_color(title: &str, tokens: &ShellTokens) -> Color32 {
    let hash = title.bytes().fold(0usize, |acc, byte| {
        acc.wrapping_mul(31).wrapping_add(byte as usize)
    });
    tokens.avatar_palette[hash % tokens.avatar_palette.len()]
}

fn avatar(ui: &mut Ui, title: &str, size: f32, tokens: &ShellTokens) {
    let (rect, _) = ui.allocate_exact_size(Vec2::splat(size), egui::Sense::hover());
    ui.painter()
        .rect_filled(rect, CornerRadius::same(8), title_color(title, tokens));
    ui.painter().text(
        rect.center(),
        egui::Align2::CENTER_CENTER,
        title_letter(title),
        egui::FontId::proportional(size * 0.46),
        tokens.text_primary,
    );
}

#[allow(dead_code)]
fn progress(ui: &mut Ui, value: f32, tokens: &ShellTokens) {
    let (rect, _) =
        ui.allocate_exact_size(Vec2::new(ui.available_width(), 3.0), egui::Sense::hover());
    ui.painter()
        .rect_filled(rect, CornerRadius::same(2), tokens.divider);
    if value > 0.0 {
        let fill = egui::Rect::from_min_size(
            rect.min,
            Vec2::new(rect.width() * value.clamp(0.0, 1.0), rect.height()),
        );
        ui.painter()
            .rect_filled(fill, CornerRadius::same(2), tokens.accent);
    }
}

fn format_time(seconds: f64) -> Option<String> {
    if !seconds.is_finite() || seconds < 0.0 {
        return None;
    }
    let total = seconds as u64;
    let hours = total / 3600;
    let minutes = (total % 3600) / 60;
    Some(if hours > 0 {
        format!("{hours}h {minutes}m")
    } else if minutes > 0 {
        format!("{minutes}m")
    } else {
        format!("{}s", total % 60)
    })
}

fn format_hms(seconds: f64) -> String {
    if !seconds.is_finite() || seconds <= 0.0 {
        return "--:--".to_string();
    }
    let total = seconds.round() as u64;
    let h = total / 3600;
    let m = (total % 3600) / 60;
    let s = total % 60;
    format!("{:02}:{:02}:{:02}", h, m, s)
}

fn truncate_text(ui: &Ui, text: &str, font: FontId, max_width: f32) -> String {
    if max_width <= 10.0 {
        return String::new();
    }
    let full_w = ui.painter().layout_no_wrap(text.to_string(), font.clone(), Color32::WHITE).size().x;
    if full_w <= max_width {
        return text.to_string();
    }
    let mut truncated = text.to_string();
    while !truncated.is_empty() {
        truncated.pop();
        let candidate = format!("{truncated}…");
        if ui.painter().layout_no_wrap(candidate.clone(), font.clone(), Color32::WHITE).size().x <= max_width {
            return candidate;
        }
    }
    "…".to_string()
}

fn render_filter_pills(ui: &mut Ui, state: &mut ShellState, tokens: &ShellTokens) {
    ui.horizontal(|ui| {
        for (filter, label) in [
            (FilterPill::All, "All"),
            (FilterPill::InProgress, "In progress"),
            (FilterPill::Unwatched, "Unwatched"),
            (FilterPill::Watched, "Watched"),
        ] {
            let selected = state.library_filter == filter;
            let response = padded_choice(ui, label, selected, tokens);
            if response.clicked() {
                state.library_filter = filter;
            }
        }
    });
}

fn movie_matches(movie: &MovieCardViewModel, filter: FilterPill, query: &str) -> bool {
    let matches_query = query.trim().is_empty()
        || movie
            .display_title
            .to_lowercase()
            .contains(&query.to_lowercase());
    let matches_filter = match filter {
        FilterPill::All => true,
        FilterPill::InProgress => movie.progress.is_some(),
        FilterPill::Unwatched => !movie.is_watched && movie.progress.is_none(),
        FilterPill::Watched => movie.is_watched,
    };
    matches_query && matches_filter
}

fn series_matches(series: &SeriesCardViewModel, filter: FilterPill, query: &str) -> bool {
    let matches_query =
        query.trim().is_empty() || series.title.to_lowercase().contains(&query.to_lowercase());
    let matches_filter = match filter {
        FilterPill::All => true,
        FilterPill::InProgress => series.progress > 0.0 && !series.is_completed,
        FilterPill::Unwatched => series.watched_count == 0,
        FilterPill::Watched => series.is_completed,
    };
    matches_query && matches_filter
}

fn render_named_poster_card(
    ui: &mut Ui,
    rect: Rect,
    title: &str,
    subtitle_badge: Option<&str>,
    progress: Option<f32>,
    is_hovered: bool,
    tokens: &ShellTokens,
) {
    let base_color = title_color(title, tokens);
    ui.painter().rect_filled(rect, CornerRadius::same(10), base_color);

    // Subtle dark gradient bottom for readability
    let dark_overlay = Rect::from_min_max(
        egui::pos2(rect.left(), rect.top() + rect.height() * 0.45),
        rect.max,
    );
    ui.painter().rect_filled(
        dark_overlay,
        CornerRadius { nw: 0, ne: 0, sw: 10, se: 10 },
        Color32::from_rgba_unmultiplied(12, 16, 26, 200),
    );

    // Avatar circle with letter in center
    let circle_center = rect.center() - Vec2::new(0.0, 8.0);
    ui.painter().circle_filled(circle_center, 26.0, Color32::from_black_alpha(100));
    ui.painter().circle_stroke(circle_center, 26.0, Stroke::new(1.5, Color32::from_white_alpha(90)));
    ui.painter().text(
        circle_center,
        Align2::CENTER_CENTER,
        title_letter(title),
        FontId::proportional(22.0),
        Color32::WHITE,
    );

    if let Some(sub) = subtitle_badge {
        ui.painter().text(
            egui::pos2(rect.center().x, rect.bottom() - 14.0),
            Align2::CENTER_CENTER,
            sub,
            FontId::proportional(11.5),
            Color32::from_gray(210),
        );
    }

    if let Some(p) = progress {
        if p > 0.0 {
            let bar = Rect::from_min_size(
                egui::pos2(rect.left(), rect.bottom() - 4.0),
                Vec2::new(rect.width() * p.clamp(0.0, 1.0), 4.0),
            );
            ui.painter().rect_filled(bar, CornerRadius::ZERO, tokens.accent);
        }
    }

    if is_hovered {
        ui.painter().rect_stroke(
            rect,
            CornerRadius::same(10),
            Stroke::new(2.0, tokens.accent),
            egui::StrokeKind::Inside,
        );
        let play_center = rect.center();
        ui.painter().circle_filled(play_center, 26.0, tokens.accent);
        ui.painter().text(
            egui::pos2(play_center.x + 2.0, play_center.y),
            Align2::CENTER_CENTER,
            "▶",
            FontId::proportional(18.0),
            Color32::WHITE,
        );
    } else {
        ui.painter().rect_stroke(
            rect,
            CornerRadius::same(10),
            Stroke::new(1.0, tokens.field_border),
            egui::StrokeKind::Inside,
        );
    }
}

pub(crate) fn attach_media_context_menu(
    resp: &egui::Response,
    file_path: &str,
    fingerprint: &str,
    selected_media_info: &mut Option<String>,
    action: &mut ShellAction,
) {
    resp.context_menu(|ui| {
        ui.set_min_width(170.0);
        if ui.button("▶  Play in Valor").clicked() {
            *action = ShellAction::PlayMedia(std::path::PathBuf::from(file_path));
            ui.close();
        }
        if ui.button("↗  Open with...").clicked() {
            *action = ShellAction::OpenWithApp(std::path::PathBuf::from(file_path));
            ui.close();
        }
        if ui.button("📁  Show in Explorer").clicked() {
            *action = ShellAction::OpenInExplorer(std::path::PathBuf::from(file_path));
            ui.close();
        }
        ui.separator();
        if ui.button("ℹ  File information").clicked() {
            *selected_media_info = Some(fingerprint.to_string());
            ui.close();
        }
    });
}

fn render_movie_grid(
    ui: &mut Ui,
    movies: &[MovieCardViewModel],
    state: &mut ShellState,
    tokens: &ShellTokens,
    textures: &mut LruTextureCache,
    action: &mut ShellAction,
) {
    if state.library_view == crate::view_models::ViewMode::List {
        let avail_w = ui.available_width();
        let total_table_w: f32 = state.movie_list_col_widths.iter().sum::<f32>().max(avail_w);

        // Windows Explorer-like Table Header with interactive draggable dividers
        let header_titles = ["Name", "Date", "Type", "Size", "Length", "Quality"];
        let (header_rect, _) = ui.allocate_exact_size(Vec2::new(total_table_w, 28.0), Sense::hover());
        ui.painter().rect_filled(header_rect, CornerRadius::same(4), tokens.field_fill);

        let mut col_x = header_rect.left();
        for i in 0..6 {
            let col_w = state.movie_list_col_widths[i];
            let header_text = header_titles[i];

            ui.painter().text(
                Pos2::new(col_x + 10.0, header_rect.center().y),
                Align2::LEFT_CENTER,
                header_text,
                FontId::proportional(11.5),
                tokens.text_tertiary,
            );

            let right_x = col_x + col_w;
            ui.painter().vline(right_x, header_rect.y_range(), Stroke::new(1.0, tokens.divider));

            // Resize handle on divider (drag left/right to resize column)
            let handle_rect = Rect::from_x_y_ranges((right_x - 5.0)..=(right_x + 5.0), header_rect.y_range());
            let handle_resp = ui.interact(handle_rect, ui.scope_id().with(("col_res_movie", i)), Sense::drag());
            if handle_resp.hovered() || handle_resp.dragged() {
                ui.ctx().set_cursor_icon(egui::CursorIcon::ResizeHorizontal);
                ui.painter().vline(right_x, header_rect.y_range(), Stroke::new(2.0, tokens.accent));
            }
            if handle_resp.dragged() {
                let delta = handle_resp.drag_delta().x;
                state.movie_list_col_widths[i] = (state.movie_list_col_widths[i] + delta).max(40.0);
            }

            col_x = right_x;
        }

        ui.add_space(2.0);

        // Table Rows (Windows Explorer style: clickable rows, play button removed)
        egui::ScrollArea::both()
            .id_salt("library_movie_list_table")
            .auto_shrink([false; 2])
            .show(ui, |ui| {
                for movie in movies {
                    let (row_rect, row_resp) = ui.allocate_exact_size(Vec2::new(total_table_w, 32.0), Sense::click());
                    let hover = row_resp.hovered();
                    if hover {
                        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                        ui.painter().rect_filled(row_rect, CornerRadius::same(3), tokens.hover_fill);
                    }

                    let mut rx = row_rect.left();

                    // Column 0: Name (with icon)
                    let col0_w = state.movie_list_col_widths[0];
                    let icon_color = title_color(&movie.display_title, tokens);
                    let icon_rect = Rect::from_center_size(Pos2::new(rx + 16.0, row_rect.center().y), Vec2::splat(18.0));
                    ui.painter().rect_filled(icon_rect, CornerRadius::same(3), icon_color);
                    ui.painter().text(icon_rect.center(), Align2::CENTER_CENTER, title_letter(&movie.display_title), FontId::proportional(10.0), Color32::WHITE);

                    let title_text_pos = Pos2::new(rx + 32.0, row_rect.center().y);
                    let title_font = FontId::proportional(13.0);
                    let max_t_w = (col0_w - 40.0).max(10.0);
                    let disp_title = truncate_text(ui, &movie.display_title, title_font.clone(), max_t_w);
                    ui.painter().text(title_text_pos, Align2::LEFT_CENTER, disp_title, title_font, if hover { tokens.accent } else { tokens.text_primary });

                    rx += col0_w;
                    ui.painter().vline(rx, row_rect.y_range(), Stroke::new(1.0, tokens.divider.gamma_multiply(0.4)));

                    // Column 1: Date
                    let col1_w = state.movie_list_col_widths[1];
                    let date_str = if movie.created_at.timestamp() > 86400 {
                        movie.created_at.with_timezone(&chrono::Local).format("%m/%d/%Y %I:%M %p").to_string()
                    } else if let Some(y) = movie.year {
                        y.to_string()
                    } else {
                        "--".to_string()
                    };
                    let disp_date = truncate_text(ui, &date_str, FontId::proportional(12.0), (col1_w - 16.0).max(10.0));
                    ui.painter().text(Pos2::new(rx + 10.0, row_rect.center().y), Align2::LEFT_CENTER, disp_date, FontId::proportional(12.0), tokens.text_secondary);

                    rx += col1_w;
                    ui.painter().vline(rx, row_rect.y_range(), Stroke::new(1.0, tokens.divider.gamma_multiply(0.4)));

                    // Column 2: Type (Format)
                    let col2_w = state.movie_list_col_widths[2];
                    let ext = std::path::Path::new(&movie.primary_file_path)
                        .extension()
                        .and_then(|e| e.to_str())
                        .unwrap_or("MKV")
                        .to_uppercase();
                    let type_str = format!("{ext} Video File");
                    let disp_type = truncate_text(ui, &type_str, FontId::proportional(11.5), (col2_w - 16.0).max(10.0));
                    ui.painter().text(Pos2::new(rx + 10.0, row_rect.center().y), Align2::LEFT_CENTER, disp_type, FontId::proportional(11.5), tokens.text_secondary);

                    rx += col2_w;
                    ui.painter().vline(rx, row_rect.y_range(), Stroke::new(1.0, tokens.divider.gamma_multiply(0.4)));

                    // Column 3: Size
                    let col3_w = state.movie_list_col_widths[3];
                    let size_str = if let Some(v) = movie.versions.first() {
                        crate::shell::format_file_size(v.size_bytes)
                    } else {
                        String::new()
                    };
                    let disp_size = truncate_text(ui, &size_str, FontId::proportional(12.0), (col3_w - 16.0).max(10.0));
                    ui.painter().text(Pos2::new(rx + 10.0, row_rect.center().y), Align2::LEFT_CENTER, disp_size, FontId::proportional(12.0), tokens.text_secondary);

                    rx += col3_w;
                    ui.painter().vline(rx, row_rect.y_range(), Stroke::new(1.0, tokens.divider.gamma_multiply(0.4)));

                    // Column 4: Length (Duration)
                    let col4_w = state.movie_list_col_widths[4];
                    let dur_str = format_hms(movie.duration_secs);
                    let disp_dur = truncate_text(ui, &dur_str, FontId::proportional(12.0), (col4_w - 16.0).max(10.0));
                    ui.painter().text(Pos2::new(rx + 10.0, row_rect.center().y), Align2::LEFT_CENTER, disp_dur, FontId::proportional(12.0), tokens.text_secondary);

                    rx += col4_w;
                    ui.painter().vline(rx, row_rect.y_range(), Stroke::new(1.0, tokens.divider.gamma_multiply(0.4)));

                    // Column 5: Quality
                    let col5_w = state.movie_list_col_widths[5];
                    let res_str = movie.height.map(|h| format!("{h}p")).unwrap_or_else(|| "HD".into());
                    let disp_res = truncate_text(ui, &res_str, FontId::proportional(12.0), (col5_w - 16.0).max(10.0));
                    ui.painter().text(Pos2::new(rx + 10.0, row_rect.center().y), Align2::LEFT_CENTER, disp_res, FontId::proportional(12.0), tokens.text_secondary);

                    // Clicking row plays media; right-click opens context menu
                    if row_resp.hovered() {
                        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                    }
                    if row_resp.clicked() {
                        *action = ShellAction::PlayMedia(std::path::PathBuf::from(&movie.primary_file_path));
                    }
                    attach_media_context_menu(
                        &row_resp,
                        &movie.primary_file_path,
                        &movie.primary_fingerprint,
                        &mut state.selected_media_info,
                        action,
                    );

                    // Bottom divider line
                    ui.painter().hline(row_rect.x_range(), row_rect.bottom(), Stroke::new(1.0, tokens.divider.gamma_multiply(0.4)));
                }
            });
        return;
    }
    let avail_w = ui.available_width();
    let gap = 20.0;
    let target_w = 260.0;
    let columns = (((avail_w + gap) / (target_w + gap)).floor() as usize).max(1);
    let card_w = ((avail_w - (columns - 1) as f32 * gap) / columns as f32).clamp(240.0, 320.0);
    let poster_h = (card_w / 16.0 * 9.0).round();
    let row_h = poster_h + 74.0;
    let rows = movies.len().div_ceil(columns);

    let mouse_on_window = ui.ctx().input(|i| i.pointer.latest_pos().is_some());
    ui.style_mut().spacing.scroll = egui::style::ScrollStyle::floating();
    egui::ScrollArea::vertical()
        .id_salt("library_movie_grid")
        .auto_shrink([false; 2])
        .scroll_bar_visibility(if mouse_on_window {
            egui::scroll_area::ScrollBarVisibility::VisibleWhenNeeded
        } else {
            egui::scroll_area::ScrollBarVisibility::AlwaysHidden
        })
        .show_rows(ui, row_h + gap, rows, |ui, visible| {
            for row in visible {
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = gap;
                    for movie in movies.iter().skip(row * columns).take(columns) {
                        ui.allocate_ui_with_layout(Vec2::new(card_w, row_h), Layout::top_down(Align::Min), |ui| {
                            let (rect, response) = ui.allocate_exact_size(
                                Vec2::new(card_w, poster_h),
                                egui::Sense::click(),
                            );
                            if response.hovered() {
                                ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                            }
                            attach_media_context_menu(
                                &response,
                                &movie.primary_file_path,
                                &movie.primary_fingerprint,
                                &mut state.selected_media_info,
                                action,
                            );
                            let thumb = thumbnail_path(&movie.primary_fingerprint);
                            let mut drew_image = false;
                            if let Some(tex) = textures.get_or_request(
                                ui.ctx(),
                                &movie.primary_fingerprint,
                                thumb.as_ref(),
                            ) {
                                ui.painter().rect_filled(rect, CornerRadius::same(10), Color32::BLACK);
                                let uv = egui::Rect::from_min_max(
                                    egui::pos2(0.0, 0.0),
                                    egui::pos2(1.0, 1.0),
                                );
                                ui.painter().image(tex.id(), rect, uv, Color32::WHITE);
                                ui.painter().rect_stroke(
                                    rect,
                                    CornerRadius::same(10),
                                    Stroke::new(1.0, if response.hovered() { tokens.accent } else { tokens.field_border }),
                                    egui::StrokeKind::Inside,
                                );
                                if response.hovered() {
                                    ui.painter().rect_filled(rect, CornerRadius::same(10), Color32::from_black_alpha(100));
                                    let play_center = rect.center();
                                    ui.painter().circle_filled(play_center, 26.0, tokens.accent);
                                    ui.painter().text(
                                        egui::pos2(play_center.x + 2.0, play_center.y),
                                        Align2::CENTER_CENTER,
                                        "▶",
                                        FontId::proportional(18.0),
                                        Color32::WHITE,
                                    );
                                }
                                drew_image = true;
                            }
                            if !drew_image {
                                let sub = movie.year.map(|y| y.to_string());
                                render_named_poster_card(
                                    ui,
                                    rect,
                                    &movie.display_title,
                                    sub.as_deref(),
                                    movie.progress,
                                    response.hovered(),
                                    tokens,
                                );
                            }

                            if response.clicked() {
                                *action = ShellAction::PlayMedia(std::path::PathBuf::from(
                                    &movie.primary_file_path,
                                ));
                            }

                            ui.add_space(6.0);
                            ui.label(
                                RichText::new(&movie.display_title)
                                    .size(13.5)
                                    .strong()
                                    .color(if response.hovered() { tokens.accent } else { tokens.text_primary }),
                            );

                            let ext = std::path::Path::new(&movie.primary_file_path)
                                .extension()
                                .and_then(|e| e.to_str())
                                .unwrap_or("MKV")
                                .to_uppercase();
                            let size = if let Some(v) = movie.versions.first() {
                                crate::shell::format_file_size(v.size_bytes)
                            } else {
                                String::new()
                            };
                            let res = movie.height.map(|h| format!("{h}p")).unwrap_or_default();
                            let mut parts = Vec::new();
                            if let Some(y) = movie.year {
                                if y > 0 {
                                    parts.push(y.to_string());
                                }
                            }
                            if !res.is_empty() {
                                parts.push(res);
                            }
                            parts.push(ext);
                            if !size.is_empty() {
                                parts.push(size);
                            }
                            let meta_line = parts.join(" · ");
                            ui.label(
                                RichText::new(meta_line)
                                    .size(typography::SECONDARY)
                                    .color(tokens.text_muted),
                            );

                            ui.horizontal(|ui| {
                                if let Some(position) = movie.resume_pos_secs {
                                    ui.label(
                                        RichText::new(format!(
                                            "Resume at {}",
                                            format_time(position).unwrap_or_default()
                                        ))
                                        .size(11.0)
                                        .color(tokens.accent),
                                    );
                                } else if movie.is_watched {
                                    ui.label(
                                        RichText::new("✓ Watched")
                                            .size(11.0)
                                            .color(tokens.success),
                                    );
                                }
                            });
                        });
                    }
                });
                ui.add_space(gap);
            }
        });
}

fn render_timeline_scrubber(
    ui: &mut Ui,
    rect: Rect,
    years: &[i32],
    tokens: &ShellTokens,
    state: &mut ShellState,
) {
    if years.is_empty() {
        return;
    }
    let center_x = rect.center().x;
    let top_y = rect.top() + 10.0;

    // Up arrow ▲ - click to reset year filter
    let up_rect = Rect::from_center_size(egui::pos2(center_x, top_y), Vec2::splat(18.0));
    let up_resp = ui.interact(up_rect, ui.scope_id().with("timeline_up_arrow"), Sense::click());
    if up_resp.clicked() {
        state.timeline_year = None;
    }
    ui.painter().text(
        up_rect.center(),
        Align2::CENTER_CENTER,
        "▲",
        FontId::proportional(11.0),
        if up_resp.hovered() || state.timeline_year.is_some() { tokens.accent } else { tokens.text_secondary },
    );

    let track_top = top_y + 20.0;
    let track_bot = rect.bottom() - 30.0;
    let track_h = (track_bot - track_top).max(60.0);

    let step = (track_h / years.len().max(1) as f32).min(32.0);
    for (i, &year) in years.iter().enumerate() {
        let y = track_top + (i as f32 + 0.5) * step;
        let year_rect = Rect::from_center_size(egui::pos2(center_x, y), Vec2::new(42.0, 18.0));
        let hover = ui.rect_contains_pointer(year_rect);
        let year_resp = ui.interact(year_rect, ui.scope_id().with(("timeline_year", year)), Sense::click());
        if year_resp.clicked() {
            state.timeline_year = if state.timeline_year == Some(year) {
                None
            } else {
                Some(year)
            };
        }

        let is_selected = state.timeline_year == Some(year);
        let color = if is_selected {
            tokens.accent
        } else if hover {
            tokens.text_primary
        } else if i == 0 && state.timeline_year.is_none() {
            Color32::WHITE
        } else {
            tokens.text_secondary
        };

        // Year text
        ui.painter().text(
            year_rect.center(),
            Align2::CENTER_CENTER,
            year.to_string(),
            FontId::proportional(12.0),
            color,
        );

        // Active underline indicator
        if is_selected || (i == 0 && state.timeline_year.is_none()) {
            ui.painter().line_segment(
                [
                    egui::pos2(year_rect.left() + 4.0, year_rect.bottom() + 2.0),
                    egui::pos2(year_rect.right() - 4.0, year_rect.bottom() + 2.0),
                ],
                Stroke::new(2.0, tokens.accent),
            );
        }

        // Dots between years
        if i + 1 < years.len() && step >= 24.0 {
            let dot_y1 = y + step * 0.35;
            let dot_y2 = y + step * 0.65;
            ui.painter().circle_filled(egui::pos2(center_x, dot_y1), 1.5, tokens.text_muted);
            ui.painter().circle_filled(egui::pos2(center_x, dot_y2), 1.5, tokens.text_muted);
        }

        // Floating tooltip bubble when hovered
        if hover {
            let bubble_rect = Rect::from_min_size(
                egui::pos2(year_rect.left() - 88.0, year_rect.center().y - 12.0),
                Vec2::new(76.0, 24.0),
            );
            ui.painter().rect_filled(
                bubble_rect,
                CornerRadius::same(6),
                Color32::from_rgb(36, 42, 54),
            );
            ui.painter().text(
                bubble_rect.center(),
                Align2::CENTER_CENTER,
                format!("{year}"),
                FontId::proportional(11.5),
                Color32::WHITE,
            );
            ui.painter().line_segment(
                [
                    egui::pos2(bubble_rect.right(), bubble_rect.center().y),
                    egui::pos2(year_rect.left() - 2.0, year_rect.center().y),
                ],
                Stroke::new(1.5, tokens.accent),
            );
        }
    }

    // Down arrow ▼
    let down_rect = Rect::from_center_size(egui::pos2(center_x, rect.bottom() - 15.0), Vec2::splat(18.0));
    ui.painter().text(
        down_rect.center(),
        Align2::CENTER_CENTER,
        "▼",
        FontId::proportional(11.0),
        tokens.text_secondary,
    );
}

fn render_series_grid(
    ui: &mut Ui,
    series: &[SeriesCardViewModel],
    tokens: &ShellTokens,
    state: &mut ShellState,
    textures: &mut LruTextureCache,
    _action: &mut ShellAction,
) {
    if state.library_view == crate::view_models::ViewMode::List {
        let avail_w = ui.available_width();
        let total_table_w: f32 = state.series_list_col_widths.iter().sum::<f32>().max(avail_w);

        // Windows Explorer-like Table Header with interactive draggable dividers
        let header_titles = ["Name", "Seasons", "Episodes", "Status", "Year"];
        let (header_rect, _) = ui.allocate_exact_size(Vec2::new(total_table_w, 28.0), Sense::hover());
        ui.painter().rect_filled(header_rect, CornerRadius::same(4), tokens.field_fill);

        let mut col_x = header_rect.left();
        for i in 0..5 {
            let col_w = state.series_list_col_widths[i];
            let header_text = header_titles[i];

            ui.painter().text(
                Pos2::new(col_x + 10.0, header_rect.center().y),
                Align2::LEFT_CENTER,
                header_text,
                FontId::proportional(11.5),
                tokens.text_tertiary,
            );

            let right_x = col_x + col_w;
            ui.painter().vline(right_x, header_rect.y_range(), Stroke::new(1.0, tokens.divider));

            // Resize handle on divider (drag left/right to resize column)
            let handle_rect = Rect::from_x_y_ranges((right_x - 5.0)..=(right_x + 5.0), header_rect.y_range());
            let handle_resp = ui.interact(handle_rect, ui.scope_id().with(("col_res_series", i)), Sense::drag());
            if handle_resp.hovered() || handle_resp.dragged() {
                ui.ctx().set_cursor_icon(egui::CursorIcon::ResizeHorizontal);
                ui.painter().vline(right_x, header_rect.y_range(), Stroke::new(2.0, tokens.accent));
            }
            if handle_resp.dragged() {
                let delta = handle_resp.drag_delta().x;
                state.series_list_col_widths[i] = (state.series_list_col_widths[i] + delta).max(40.0);
            }

            col_x = right_x;
        }

        ui.add_space(2.0);

        // Table Rows (Windows Explorer style: clickable rows, play button removed)
        egui::ScrollArea::both()
            .id_salt("library_series_list_table")
            .auto_shrink([false; 2])
            .show(ui, |ui| {
                for item in series {
                    let (row_rect, row_resp) = ui.allocate_exact_size(Vec2::new(total_table_w, 32.0), Sense::click());
                    let hover = row_resp.hovered();
                    if hover {
                        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                        ui.painter().rect_filled(row_rect, CornerRadius::same(3), tokens.hover_fill);
                    }

                    let mut rx = row_rect.left();

                    // Column 0: Name (with icon)
                    let col0_w = state.series_list_col_widths[0];
                    let icon_color = title_color(&item.title, tokens);
                    let icon_rect = Rect::from_center_size(Pos2::new(rx + 16.0, row_rect.center().y), Vec2::splat(18.0));
                    ui.painter().rect_filled(icon_rect, CornerRadius::same(3), icon_color);
                    ui.painter().text(icon_rect.center(), Align2::CENTER_CENTER, title_letter(&item.title), FontId::proportional(10.0), Color32::WHITE);

                    let title_text_pos = Pos2::new(rx + 32.0, row_rect.center().y);
                    let title_font = FontId::proportional(13.0);
                    let max_t_w = (col0_w - 40.0).max(10.0);
                    let disp_title = truncate_text(ui, &item.title, title_font.clone(), max_t_w);
                    ui.painter().text(title_text_pos, Align2::LEFT_CENTER, disp_title, title_font, if hover { tokens.accent } else { tokens.text_primary });

                    rx += col0_w;
                    ui.painter().vline(rx, row_rect.y_range(), Stroke::new(1.0, tokens.divider.gamma_multiply(0.4)));

                    // Column 1: Seasons
                    let col1_w = state.series_list_col_widths[1];
                    let seasons_str = format!("{} Season{}", item.season_count, if item.season_count == 1 { "" } else { "s" });
                    let disp_seasons = truncate_text(ui, &seasons_str, FontId::proportional(12.0), (col1_w - 16.0).max(10.0));
                    ui.painter().text(Pos2::new(rx + 10.0, row_rect.center().y), Align2::LEFT_CENTER, disp_seasons, FontId::proportional(12.0), tokens.text_secondary);

                    rx += col1_w;
                    ui.painter().vline(rx, row_rect.y_range(), Stroke::new(1.0, tokens.divider.gamma_multiply(0.4)));

                    // Column 2: Episodes
                    let col2_w = state.series_list_col_widths[2];
                    let eps_str = format!("{} Eps", item.episode_count);
                    let disp_eps = truncate_text(ui, &eps_str, FontId::proportional(12.0), (col2_w - 16.0).max(10.0));
                    ui.painter().text(Pos2::new(rx + 10.0, row_rect.center().y), Align2::LEFT_CENTER, disp_eps, FontId::proportional(12.0), tokens.text_secondary);

                    rx += col2_w;
                    ui.painter().vline(rx, row_rect.y_range(), Stroke::new(1.0, tokens.divider.gamma_multiply(0.4)));

                    // Column 3: Status / Unwatched
                    let col3_w = state.series_list_col_widths[3];
                    let unwatched = item.episode_count.saturating_sub(item.watched_count);
                    let status_str = if item.is_completed { "Completed".into() } else if unwatched > 0 { format!("{unwatched} left") } else { "All watched".into() };
                    let disp_status = truncate_text(ui, &status_str, FontId::proportional(12.0), (col3_w - 16.0).max(10.0));
                    ui.painter().text(Pos2::new(rx + 10.0, row_rect.center().y), Align2::LEFT_CENTER, disp_status, FontId::proportional(12.0), if unwatched > 0 { tokens.accent } else { tokens.success });

                    rx += col3_w;
                    ui.painter().vline(rx, row_rect.y_range(), Stroke::new(1.0, tokens.divider.gamma_multiply(0.4)));

                    // Column 4: Year
                    let col4_w = state.series_list_col_widths[4];
                    let year_str = item.year.map(|y| y.to_string()).unwrap_or_else(|| "--".into());
                    let disp_year = truncate_text(ui, &year_str, FontId::proportional(12.0), (col4_w - 16.0).max(10.0));
                    ui.painter().text(Pos2::new(rx + 10.0, row_rect.center().y), Align2::LEFT_CENTER, disp_year, FontId::proportional(12.0), tokens.text_muted);

                    // Row interaction (play button removed)
                    if row_resp.clicked() {
                        state.selected_series = Some(item.series_key.clone());
                    }

                    // Bottom divider line
                    ui.painter().hline(row_rect.x_range(), row_rect.bottom(), Stroke::new(1.0, tokens.divider.gamma_multiply(0.4)));
                }
            });
        return;
    }

    let avail_w = ui.available_width();
    let gap = 20.0;
    let target_w = 260.0;
    let columns = (((avail_w + gap) / (target_w + gap)).floor() as usize).max(1);
    let card_w = ((avail_w - (columns - 1) as f32 * gap) / columns as f32).clamp(240.0, 320.0);
    let card_h = (card_w / 16.0 * 9.0).round();
    let rows = series.len().div_ceil(columns);
    let row_pitch = card_h + 74.0;

    let mouse_on_window = ui.ctx().input(|i| i.pointer.latest_pos().is_some());
    ui.style_mut().spacing.scroll = egui::style::ScrollStyle::floating();
    egui::ScrollArea::vertical()
        .id_salt("library_series_grid")
        .auto_shrink([false; 2])
        .scroll_bar_visibility(if mouse_on_window {
            egui::scroll_area::ScrollBarVisibility::VisibleWhenNeeded
        } else {
            egui::scroll_area::ScrollBarVisibility::AlwaysHidden
        })
        .show_rows(ui, row_pitch, rows, |ui, visible| {
            for row in visible {
                ui.horizontal_top(|ui| {
                    ui.spacing_mut().item_spacing.x = gap;
                    for item in series.iter().skip(row * columns).take(columns) {
                        ui.allocate_ui_with_layout(Vec2::new(card_w, row_pitch - 10.0), Layout::top_down(Align::Min), |ui| {
                            let (rect, response) = ui.allocate_exact_size(
                                Vec2::new(card_w, card_h),
                                egui::Sense::click(),
                            );
                            if response.hovered() {
                                ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                            }
                            if let Some(ep) = item.next_episode_item.as_ref().or_else(|| item.episodes.first()) {
                                attach_media_context_menu(
                                    &response,
                                    &ep.file_path,
                                    &ep.fingerprint,
                                    &mut state.selected_media_info,
                                    _action,
                                );
                            }

                            let thumb_path = thumbnail_path(&item.primary_fingerprint);

                            let mut drew_image = false;
                            if let Some(texture) = textures.get_or_request(ui.ctx(), &item.primary_fingerprint, thumb_path.as_ref()) {
                                ui.painter().rect_filled(rect, CornerRadius::same(8), tokens.field_fill);
                                let uv = Rect::from_min_max(Pos2::new(0.0, 0.0), Pos2::new(1.0, 1.0));
                                ui.painter().image(texture.id(), rect, uv, Color32::WHITE);
                                if response.hovered() {
                                    ui.painter().rect_stroke(
                                        rect,
                                        CornerRadius::same(8),
                                        Stroke::new(2.0, tokens.accent),
                                        StrokeKind::Inside,
                                    );
                                    let play_circle = Rect::from_center_size(rect.center(), Vec2::splat(44.0));
                                    ui.painter().circle_filled(
                                        play_circle.center(),
                                        22.0,
                                        Color32::from_rgba_unmultiplied(10, 14, 22, 210),
                                    );
                                    ui.painter().text(
                                        play_circle.center(),
                                        Align2::CENTER_CENTER,
                                        "▶",
                                        FontId::proportional(18.0),
                                        Color32::WHITE,
                                    );
                                }
                                drew_image = true;
                            }
                            if !drew_image {
                                let sub_info = format!("{} Season{}", item.season_count, if item.season_count == 1 { "" } else { "s" });
                                render_named_poster_card(
                                    ui,
                                    rect,
                                    &item.title,
                                    Some(&sub_info),
                                    Some(item.progress),
                                    response.hovered(),
                                    tokens,
                                );
                            }

                            if response.clicked() {
                                state.selected_series = Some(item.series_key.clone());
                            }

                            ui.add_space(6.0);
                            ui.label(
                                RichText::new(&item.title)
                                    .size(13.5)
                                    .strong()
                                    .color(if response.hovered() { tokens.accent } else { tokens.text_primary }),
                            );

                            let tmdb_info = state.tmdb_series_cache.get(&item.series_key);
                            let sub_text = if let Some(info) = tmdb_info {
                                let missing = (info.total_episodes as usize).saturating_sub(item.episode_count);
                                if missing > 0 {
                                    format!(
                                        "{} / {} eps · {} missing",
                                        item.episode_count, info.total_episodes, missing
                                    )
                                } else {
                                    format!("{} / {} eps · Complete", item.episode_count, info.total_episodes)
                                }
                            } else {
                                format!(
                                    "{} season{}, {} episode{}",
                                    item.season_count,
                                    if item.season_count == 1 { "" } else { "s" },
                                    item.episode_count,
                                    if item.episode_count == 1 { "" } else { "s" }
                                )
                            };
                            ui.label(
                                RichText::new(sub_text)
                                    .size(typography::SECONDARY)
                                    .color(tokens.text_muted),
                            );

                            ui.horizontal(|ui| {
                                let open_btn = egui::Button::new(RichText::new("Open").size(11.0).color(tokens.text_secondary))
                                    .fill(tokens.field_fill)
                                    .corner_radius(CornerRadius::same(4))
                                    .min_size(Vec2::new(44.0, 20.0));
                                if ui.add(open_btn).clicked() {
                                    state.selected_series = Some(item.series_key.clone());
                                }
                            });
                        });
                    }
                });
                ui.add_space(gap);
            }
        });
}

pub fn render_library(
    outer_ui: &mut Ui,
    state: &mut ShellState,
    items: &[MediaItem],
    positions: &HashMap<String, PlaybackPosition>,
    tokens: &ShellTokens,
    textures: &mut LruTextureCache,
) -> ShellAction {
    let available = outer_ui.max_rect();
    let pad_x = if available.width() >= 1100.0 {
        48.0
    } else {
        32.0
    };
    let page_rect = Rect::from_min_max(
        egui::pos2(available.left() + pad_x, available.top() + 32.0),
        egui::pos2(available.right() - 2.0, available.bottom() - 8.0),
    );
    let mut page = outer_ui.new_child(egui::UiBuilder::new().max_rect(page_rect));
    page.set_clip_rect(page_rect);
    let ui = &mut page;
    let active_items: Vec<MediaItem> = items
        .iter()
        .filter(|i| {
            if i.is_missing {
                return false;
            }
            let low = i.file_path.to_lowercase();
            !low.contains("$recycle.bin") && !low.contains(".trash")
        })
        .cloned()
        .collect();
    let movies = build_movie_card_view_models(&active_items, positions, &HashMap::new());
    let series = build_series_card_view_models(&active_items, positions, &HashMap::new());
    let other_videos = build_other_media_card_view_models(&active_items, positions, &HashMap::new());
    let mut action = ShellAction::None;
    ui.heading(
        RichText::new("Library")
            .size(typography::PAGE_TITLE)
            .strong()
            .color(tokens.text_primary),
    );
    ui.add_space(spacing::PAD_16);
    ui.horizontal_wrapped(|ui| {
        for (tab, label, count) in [
            (LibraryTab::Movies, "Movies", movies.len()),
            (LibraryTab::Series, "Series", series.len()),
            (LibraryTab::Videos, "Videos", other_videos.len()),
        ] {
            let text = format!("{label}  {count}");
            let response = padded_choice(ui, &text, state.library_tab == tab, tokens);
            if response.clicked() {
                state.library_tab = tab;
                state.selected_series = None;
            }
        }
        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            if padded_choice(
                ui,
                "List",
                state.library_view == crate::view_models::ViewMode::List,
                tokens,
            )
            .clicked()
            {
                state.library_view = crate::view_models::ViewMode::List;
            }
            if padded_choice(
                ui,
                "Grid",
                state.library_view == crate::view_models::ViewMode::Grid,
                tokens,
            )
            .clicked()
            {
                state.library_view = crate::view_models::ViewMode::Grid;
            }
            ui.add_space(spacing::PAD_8);
            let sort_btn = ui.add(
                egui::Button::new(
                    RichText::new(format!("Sort: {}", sort_label(state.library_sort)))
                        .size(13.5)
                        .color(tokens.text_secondary),
                )
                .min_size(Vec2::new(140.0, 36.0))
                .corner_radius(CornerRadius::same(8)),
            );
            if sort_btn.clicked() {
                state.library_sort = match state.library_sort {
                    crate::view_models::SortOption::DateAddedDesc => crate::view_models::SortOption::TitleAsc,
                    crate::view_models::SortOption::TitleAsc => crate::view_models::SortOption::TitleDesc,
                    crate::view_models::SortOption::TitleDesc => crate::view_models::SortOption::YearDesc,
                    crate::view_models::SortOption::YearDesc => crate::view_models::SortOption::DateAddedDesc,
                    _ => crate::view_models::SortOption::DateAddedDesc,
                };
            }
        });
    });
    ui.add_space(spacing::PAD_8);
    render_filter_pills(ui, state, tokens);
    ui.separator();
    if let Some(series_key) = state.selected_series.clone() {
        if let Some(item) = series.iter().find(|s| s.series_key == series_key) {
            if ui.button("←  All series").clicked() {
                state.selected_series = None;
            }
            ui.add_space(spacing::PAD_12);
            let tmdb_info = state.tmdb_series_cache.get(&item.series_key).cloned();
            card_frame(tokens).show(ui, |ui| {
                ui.horizontal(|ui| {
                    avatar(ui, &item.title, 96.0, tokens);
                    ui.vertical(|ui| {
                        ui.heading(&item.title);
                        let unwatched = item.episode_count.saturating_sub(item.watched_count);
                        if let Some(ref info) = tmdb_info {
                            let missing = (info.total_episodes as usize).saturating_sub(item.episode_count);
                            ui.label(format!(
                                "{} / {} seasons · {}/{} episodes ({} missing) · {} watched · {} unwatched",
                                item.season_count,
                                info.total_seasons.max(item.season_count as u32),
                                item.episode_count,
                                info.total_episodes,
                                missing,
                                item.watched_count,
                                unwatched
                            ));
                        } else {
                            ui.label(format!(
                                "{} season{} · {} of {} watched · {} unwatched",
                                item.season_count,
                                if item.season_count == 1 { "" } else { "s" },
                                item.watched_count,
                                item.episode_count,
                                unwatched
                            ));
                        }
                        if let Some(next) = item.next_episode_item.as_ref() {
                            let _ = next;
                            if let Some(label) = item.next_episode_text.as_deref() {
                                ui.label(label);
                            }
                        }
                    });
                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                        let play_target = item.next_episode_item.as_ref().or_else(|| item.episodes.first());
                        if let Some(ep) = play_target {
                            let play_label = if item.watched_count > 0 { "▶ Resume Next" } else { "▶ Play Episode 1" };
                            let btn = egui::Button::new(RichText::new(play_label).strong().color(Color32::WHITE))
                                .fill(tokens.accent)
                                .corner_radius(CornerRadius::same(6))
                                .min_size(Vec2::new(130.0, 36.0));
                            if ui.add(btn).clicked() {
                                action = ShellAction::PlayMedia(std::path::PathBuf::from(&ep.file_path));
                            }
                        }
                    });
                });
            });
            ui.add_space(spacing::PAD_16);
            ui.label(
                RichText::new("SEASONS")
                    .size(typography::SECTION_LABEL)
                    .strong(),
            );
            let mut episodes = item.episodes.clone();
            episodes.sort_by_key(|e| (e.season_number.unwrap_or(0), e.episode_number.unwrap_or(0)));
            let mut seasons_present: Vec<u32> = episodes
                .iter()
                .map(|e| e.season_number.unwrap_or(1))
                .collect();
            if let Some(ref info) = tmdb_info {
                for &s_num in info.season_episode_counts.keys() {
                    if s_num > 0 {
                        seasons_present.push(s_num);
                    }
                }
            }
            seasons_present.sort_unstable();
            seasons_present.dedup();

            egui::ScrollArea::vertical().show(ui, |ui| {
                for season in seasons_present {
                    let season_eps: Vec<&MediaItem> = episodes
                        .iter()
                        .filter(|e| e.season_number.unwrap_or(1) == season)
                        .collect();
                    let tmdb_count = tmdb_info
                        .as_ref()
                        .and_then(|i| i.season_episode_counts.get(&season).copied())
                        .unwrap_or(0);
                    let max_ep = season_eps
                        .iter()
                        .filter_map(|e| e.episode_number)
                        .max()
                        .unwrap_or(0)
                        .max(tmdb_count)
                        .max(1);

                    ui.add_space(8.0);
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new(if season == 0 {
                                "Specials".to_owned()
                            } else {
                                format!("Season {season}")
                            })
                            .strong()
                            .size(14.0),
                        );
                        if tmdb_count > 0 {
                            let owned = season_eps.len();
                            let missing = (tmdb_count as usize).saturating_sub(owned);
                            ui.label(
                                RichText::new(format!("({owned}/{tmdb_count} eps · {missing} missing)"))
                                    .size(12.0)
                                    .color(if missing > 0 {
                                        Color32::from_rgb(246, 130, 31)
                                    } else {
                                        tokens.text_muted
                                    }),
                            );
                        }
                    });

                    for ep_num in 1..=max_ep {
                        if let Some(episode) = season_eps
                            .iter()
                            .copied()
                            .find(|e| e.episode_number.unwrap_or(1) == ep_num)
                        {
                    let filename_stem = std::path::Path::new(&episode.file_path)
                        .file_stem()
                        .and_then(|s| s.to_str())
                        .unwrap_or(&episode.title);
                    let ep_display_name = if episode.title.is_empty() || episode.title == item.title {
                        filename_stem.to_string()
                    } else {
                        episode.title.clone()
                    };

                    let res_str = match (episode.width, episode.height) {
                        (Some(w), Some(h)) if h >= 2160 || w >= 3840 => "4K",
                        (Some(w), Some(h)) if h >= 1080 || w >= 1920 => "1080p",
                        (Some(w), Some(h)) if h >= 720 || w >= 1280 => "720p",
                        (Some(_), Some(_h)) => "SD",
                        _ => "",
                    };
                    let ext_str = std::path::Path::new(&episode.file_path)
                        .extension()
                        .and_then(|e| e.to_str())
                        .map(|e| e.to_uppercase())
                        .unwrap_or_default();
                    let size_str = format_bytes(episode.size_bytes);
                    let meta_line = [res_str, &ext_str, &size_str]
                        .into_iter()
                        .filter(|s| !s.is_empty())
                        .collect::<Vec<_>>()
                        .join(" · ");

                    let (row_rect, row_resp) = ui.allocate_exact_size(
                        Vec2::new(ui.available_width(), 48.0),
                        egui::Sense::click(),
                    );
                    let hover = row_resp.hovered();
                    ui.painter().rect_filled(
                        row_rect,
                        CornerRadius::same(6),
                        if hover { tokens.hover_fill } else { tokens.field_fill },
                    );

                    // Episode badge E01
                    let badge_rect = Rect::from_min_size(
                        Pos2::new(row_rect.left() + 10.0, row_rect.center().y - 12.0),
                        Vec2::new(38.0, 24.0),
                    );
                    ui.painter().rect_filled(
                        badge_rect,
                        CornerRadius::same(4),
                        tokens.selected_fill,
                    );
                    ui.painter().text(
                        badge_rect.center(),
                        Align2::CENTER_CENTER,
                        format!("E{ep_num:02}"),
                        FontId::proportional(12.0),
                        Color32::from_rgb(148, 190, 255),
                    );

                    // Title
                    let text_x = badge_rect.right() + 12.0;
                    ui.painter().text(
                        Pos2::new(text_x, row_rect.min.y + 8.0),
                        Align2::LEFT_TOP,
                        &ep_display_name,
                        FontId::proportional(typography::BODY),
                        if hover { tokens.accent } else { tokens.text_primary },
                    );

                    // Meta line
                    ui.painter().text(
                        Pos2::new(text_x, row_rect.min.y + 26.0),
                        Align2::LEFT_TOP,
                        meta_line,
                        FontId::proportional(typography::SECONDARY),
                        tokens.text_muted,
                    );

                    // Play button
                    let play_rect = Rect::from_min_size(
                        Pos2::new(row_rect.right() - 80.0, row_rect.center().y - 14.0),
                        Vec2::new(70.0, 28.0),
                    );
                    let play_resp = ui.interact(play_rect, ui.scope_id().with(("ep_play", &episode.file_path)), egui::Sense::click());
                    let play_hover = play_resp.hovered();
                    ui.painter().rect_filled(
                        play_rect,
                        CornerRadius::same(4),
                        if play_hover { tokens.accent } else { tokens.selected_fill },
                    );
                    ui.painter().text(
                        play_rect.center(),
                        Align2::CENTER_CENTER,
                        "▶ Play",
                        FontId::proportional(12.0),
                        Color32::WHITE,
                    );

                    if row_resp.hovered() {
                        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                    }
                    attach_media_context_menu(
                        &row_resp,
                        &episode.file_path,
                        &episode.fingerprint,
                        &mut state.selected_media_info,
                        &mut action,
                    );
                    if row_resp.clicked() || play_resp.clicked() {
                        action = ShellAction::PlayMedia(std::path::PathBuf::from(&episode.file_path));
                    }
                    ui.add_space(4.0);
                        } else if tmdb_count > 0 || !season_eps.is_empty() {
                            let (row_rect, _) = ui.allocate_exact_size(
                                Vec2::new(ui.available_width(), 44.0),
                                egui::Sense::hover(),
                            );
                            ui.painter().rect(
                                row_rect,
                                CornerRadius::same(6),
                                tokens.window_bg,
                                Stroke::new(1.0, tokens.divider),
                                StrokeKind::Inside,
                            );
                            let badge_rect = Rect::from_min_size(
                                Pos2::new(row_rect.left() + 10.0, row_rect.center().y - 11.0),
                                Vec2::new(38.0, 22.0),
                            );
                            ui.painter().rect_filled(
                                badge_rect,
                                CornerRadius::same(4),
                                Color32::from_rgba_unmultiplied(246, 130, 31, 30),
                            );
                            ui.painter().text(
                                badge_rect.center(),
                                Align2::CENTER_CENTER,
                                format!("E{ep_num:02}"),
                                FontId::proportional(11.5),
                                Color32::from_rgb(246, 130, 31),
                            );
                            let tmdb_ep_title = tmdb_info
                                .as_ref()
                                .and_then(|i| i.episode_titles.get(&(season, ep_num)))
                                .cloned()
                                .unwrap_or_else(|| format!("Episode {ep_num}"));
                            ui.painter().text(
                                Pos2::new(badge_rect.right() + 12.0, row_rect.center().y),
                                Align2::LEFT_CENTER,
                                format!("{tmdb_ep_title} · Missing locally"),
                                FontId::proportional(typography::BODY),
                                tokens.text_muted,
                            );
                            ui.add_space(4.0);
                        }
                    }
                }
            });
        } else {
            state.selected_series = None;
        }
    } else {
        let available_w = ui.available_width();
        let timeline_w = 48.0;
        let content_w = (available_w - timeline_w).max(200.0);
        let content_rect = Rect::from_min_size(
            ui.cursor().min,
            Vec2::new(content_w, (ui.max_rect().bottom() - ui.cursor().min.y).max(100.0)),
        );
        let timeline_rect = Rect::from_min_size(
            egui::pos2(content_rect.max.x + 4.0, content_rect.min.y),
            Vec2::new(timeline_w, content_rect.height()),
        );

        let mut content_ui = ui.new_child(egui::UiBuilder::new().max_rect(content_rect));
        content_ui.set_clip_rect(content_rect);

        let mut years: Vec<i32> = Vec::new();

        match state.library_tab {
            LibraryTab::Movies => {
                let mut filtered: Vec<_> = movies
                    .iter()
                    .filter(|m| movie_matches(m, state.library_filter, &state.search_query))
                    .cloned()
                    .collect();
                for m in &filtered {
                    if let Some(y) = m.year {
                        if y > 1900 && y < 2100 {
                            years.push(y as i32);
                        }
                    }
                }
                if let Some(target_year) = state.timeline_year {
                    filtered.retain(|m| m.year.map(|y| y as i32) == Some(target_year));
                }
                match state.library_sort {
                    crate::view_models::SortOption::TitleAsc => filtered.sort_by(|a, b| {
                        a.display_title.to_lowercase().cmp(&b.display_title.to_lowercase())
                            .then_with(|| a.primary_fingerprint.cmp(&b.primary_fingerprint))
                    }),
                    crate::view_models::SortOption::TitleDesc => filtered.sort_by(|a, b| {
                        b.display_title.to_lowercase().cmp(&a.display_title.to_lowercase())
                            .then_with(|| a.primary_fingerprint.cmp(&b.primary_fingerprint))
                    }),
                    crate::view_models::SortOption::DateAddedDesc | crate::view_models::SortOption::RecentlyAdded => filtered.sort_by(|a, b| {
                        b.created_at.cmp(&a.created_at)
                            .then_with(|| a.display_title.to_lowercase().cmp(&b.display_title.to_lowercase()))
                            .then_with(|| a.primary_fingerprint.cmp(&b.primary_fingerprint))
                    }),
                    crate::view_models::SortOption::YearDesc => filtered.sort_by(|a, b| {
                        b.year.unwrap_or(0).cmp(&a.year.unwrap_or(0))
                            .then_with(|| a.display_title.to_lowercase().cmp(&b.display_title.to_lowercase()))
                            .then_with(|| a.primary_fingerprint.cmp(&b.primary_fingerprint))
                    }),
                    _ => {}
                }
                render_movie_grid(&mut content_ui, &filtered, state, tokens, textures, &mut action);
            }
            LibraryTab::Series => {
                let mut filtered: Vec<_> = series
                    .iter()
                    .filter(|s| series_matches(s, state.library_filter, &state.search_query))
                    .cloned()
                    .collect();
                for s in &filtered {
                    if let Some(y) = s.year {
                        if y > 1900 && y < 2100 {
                            years.push(y as i32);
                        }
                    }
                }
                if let Some(target_year) = state.timeline_year {
                    filtered.retain(|s| s.year.map(|y| y as i32) == Some(target_year));
                }
                match state.library_sort {
                    crate::view_models::SortOption::TitleAsc => filtered.sort_by(|a, b| {
                        a.title.to_lowercase().cmp(&b.title.to_lowercase())
                            .then_with(|| a.series_key.cmp(&b.series_key))
                    }),
                    crate::view_models::SortOption::TitleDesc => filtered.sort_by(|a, b| {
                        b.title.to_lowercase().cmp(&a.title.to_lowercase())
                            .then_with(|| a.series_key.cmp(&b.series_key))
                    }),
                    crate::view_models::SortOption::DateAddedDesc | crate::view_models::SortOption::RecentlyAdded => filtered.sort_by(|a, b| {
                        b.created_at.cmp(&a.created_at)
                            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
                            .then_with(|| a.series_key.cmp(&b.series_key))
                    }),
                    crate::view_models::SortOption::YearDesc => filtered.sort_by(|a, b| {
                        b.year.unwrap_or(0).cmp(&a.year.unwrap_or(0))
                            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
                            .then_with(|| a.series_key.cmp(&b.series_key))
                    }),
                    _ => {}
                }
                render_series_grid(&mut content_ui, &filtered, tokens, state, textures, &mut action);
            }
            LibraryTab::Videos => {
                let mut filtered: Vec<_> = other_videos
                    .iter()
                    .filter(|m| movie_matches(m, state.library_filter, &state.search_query))
                    .cloned()
                    .collect();
                for m in &filtered {
                    if let Some(y) = m.year {
                        if y > 1900 && y < 2100 {
                            years.push(y as i32);
                        }
                    }
                }
                if let Some(target_year) = state.timeline_year {
                    filtered.retain(|m| m.year.map(|y| y as i32) == Some(target_year));
                }
                match state.library_sort {
                    crate::view_models::SortOption::TitleAsc => filtered.sort_by(|a, b| {
                        a.display_title.to_lowercase().cmp(&b.display_title.to_lowercase())
                            .then_with(|| a.primary_fingerprint.cmp(&b.primary_fingerprint))
                    }),
                    crate::view_models::SortOption::TitleDesc => filtered.sort_by(|a, b| {
                        b.display_title.to_lowercase().cmp(&a.display_title.to_lowercase())
                            .then_with(|| a.primary_fingerprint.cmp(&b.primary_fingerprint))
                    }),
                    crate::view_models::SortOption::DateAddedDesc | crate::view_models::SortOption::RecentlyAdded => filtered.sort_by(|a, b| {
                        b.created_at.cmp(&a.created_at)
                            .then_with(|| a.display_title.to_lowercase().cmp(&b.display_title.to_lowercase()))
                            .then_with(|| a.primary_fingerprint.cmp(&b.primary_fingerprint))
                    }),
                    crate::view_models::SortOption::YearDesc => filtered.sort_by(|a, b| {
                        b.year.unwrap_or(0).cmp(&a.year.unwrap_or(0))
                            .then_with(|| a.display_title.to_lowercase().cmp(&b.display_title.to_lowercase()))
                            .then_with(|| a.primary_fingerprint.cmp(&b.primary_fingerprint))
                    }),
                    _ => {}
                }
                render_movie_grid(&mut content_ui, &filtered, state, tokens, textures, &mut action);
            }
            LibraryTab::Playlists => {}
        }

        years.sort_by(|a, b| b.cmp(a));
        years.dedup();
        if !years.is_empty() {
            render_timeline_scrubber(ui, timeline_rect, &years, tokens, state);
        }
    }
    if let Some(fingerprint) = state.selected_media_info.clone() {
        if let Some(item) = items.iter().find(|item| item.fingerprint == fingerprint) {
            let mut open = true;
            egui::Window::new("Media information")
                .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
                .open(&mut open)
                .collapsible(false)
                .resizable(false)
                .show(outer_ui.ctx(), |ui| {
                    ui.heading(&item.title);
                    ui.add_space(8.0);
                    ui.label(format!("File: {}", item.file_path));
                    ui.label(format!("Size: {}", format_bytes(item.size_bytes)));
                    ui.label(if item.duration > 0.0 {
                        format!(
                            "Duration: {}",
                            format_time(item.duration).unwrap_or_default()
                        )
                    } else {
                        "Duration: not analyzed".to_owned()
                    });
                    ui.label(match (item.width, item.height) {
                        (Some(w), Some(h)) => format!("Resolution: {w} × {h}"),
                        _ => "Resolution: not analyzed".to_owned(),
                    });
                    ui.label(format!(
                        "Video codec: {}",
                        item.video_codec.as_deref().unwrap_or("unknown")
                    ));
                    ui.label(format!(
                        "Audio codec: {}",
                        item.audio_codec.as_deref().unwrap_or("unknown")
                    ));
                    if let (Some(season), Some(episode)) = (item.season_number, item.episode_number)
                    {
                        ui.label(format!("Season {season}, episode {episode}"));
                    }
                });
            if !open {
                state.selected_media_info = None;
            }
        } else {
            state.selected_media_info = None;
        }
    }
    action
}

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    format!("{value:.1} {}", UNITS[unit])
}

fn get_codec_badges(item: Option<&MediaItem>) -> (Option<&'static str>, bool, Option<String>) {
    if let Some(item) = item {
        let res = if let Some(h) = item.height {
            if h >= 2100 {
                Some("4K")
            } else if h >= 1000 {
                Some("1080p")
            } else if h >= 700 {
                Some("720p")
            } else {
                None
            }
        } else {
            None
        };
        let hdr = item.is_hdr;
        let ext = std::path::Path::new(&item.file_path)
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_uppercase());
        (res, hdr, ext)
    } else {
        (None, false, None)
    }
}

pub fn render_history(
    outer_ui: &mut Ui,
    state: &mut ShellState,
    entries: &[HistoryEntry],
    sessions: &[WatchSession],
    items: &[MediaItem],
    tokens: &ShellTokens,
    textures: &mut LruTextureCache,
) -> ShellAction {
    let available = outer_ui.max_rect();
    let page_rect = Rect::from_min_max(
        egui::pos2(available.left(), available.top() + 8.0),
        egui::pos2(available.right() - 2.0, available.bottom() - 6.0),
    );
    let mut page = outer_ui.new_child(egui::UiBuilder::new().max_rect(page_rect));
    page.set_clip_rect(page_rect);
    let ui = &mut page;
    let mut action = ShellAction::None;

    // Cloudflare Developer Docs palette (with OLED Super Black support)
    let is_oled = tokens.window_bg == Color32::BLACK;
    let cf_bg = if is_oled { Color32::BLACK } else { Color32::from_rgb(18, 18, 20) };
    let cf_surface = if is_oled { Color32::from_rgb(6, 6, 8) } else { Color32::from_rgb(22, 22, 25) };
    let cf_surface_alt = if is_oled { Color32::from_rgb(14, 14, 17) } else { Color32::from_rgb(28, 28, 32) };
    let cf_border = Color32::from_rgb(44, 44, 50);       // #2C2C32
    let cf_border_subtle = Color32::from_rgb(34, 34, 39);// #222227
    let cf_tick = Color32::from_rgb(68, 68, 76);         // #44444C
    let cf_orange = Color32::from_rgb(246, 130, 31);     // #F6821F
    let cf_orange_soft = Color32::from_rgb(255, 152, 67);// #FF9843
    let cf_text_primary = Color32::from_rgb(244, 244, 245); // #F4F4F5
    let cf_text_muted = Color32::from_rgb(161, 161, 170);   // #A1A1AA
    let cf_text_dim = Color32::from_rgb(113, 113, 122);     // #71717A
    let cf_green = Color32::from_rgb(34, 197, 94);       // #22C55E

    ui.painter().rect_filled(page_rect, CornerRadius::ZERO, cf_bg);

    // Subtle Cloudflare-style vertical dotted strip on the right margin
    let dot_strip_x = page_rect.right() - 140.0;
    if page_rect.width() > 900.0 {
        let mut dy = page_rect.top() + 8.0;
        while dy < page_rect.bottom() - 8.0 {
            for col in 0..4 {
                ui.painter().circle_filled(
                    Pos2::new(dot_strip_x + col as f32 * 10.0, dy),
                    1.0,
                    Color32::from_white_alpha(16),
                );
            }
            dy += 10.0;
        }
    }

    let mouse_on_window = ui.ctx().input(|i| i.pointer.latest_pos().is_some());
    ui.style_mut().spacing.scroll = egui::style::ScrollStyle::floating();

    let container_w = (available.width() - 48.0).clamp(320.0, 980.0);
    let side_pad = ((page_rect.width() - container_w) * 0.5).max(16.0);

    egui::ScrollArea::vertical()
        .id_salt("history_page_scroll")
        .auto_shrink([false; 2])
        .scroll_bar_visibility(if mouse_on_window {
            egui::scroll_area::ScrollBarVisibility::VisibleWhenNeeded
        } else {
            egui::scroll_area::ScrollBarVisibility::AlwaysHidden
        })
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.add_space(side_pad);
                ui.allocate_ui_with_layout(Vec2::new(container_w, 0.0), Layout::top_down(Align::Min), |ui| {
                    ui.set_width(container_w);
                    ui.add_space(spacing::PAD_16);

            // 1. Cloudflare-style Hero Header with left vertical rule, subtitle, and pill controls
            let picker_open_id = ui.scope_id().with("gh_date_picker_open");
            let picker_month_id = ui.scope_id().with("gh_date_picker_ym");
            let mut picker_open: bool = ui.data(|d| d.get_temp(picker_open_id)).unwrap_or(false);
            let today_local = chrono::Local::now().date_naive();
            let (mut cal_year, mut cal_month): (i32, u32) = ui
                .data(|d| d.get_temp(picker_month_id))
                .unwrap_or((chrono::Datelike::year(&today_local), chrono::Datelike::month(&today_local)));

            let mut date_btn_rect = Rect::NOTHING;
            let hero_start_y = ui.cursor().min.y;
            ui.horizontal(|ui| {
                ui.add_space(14.0);
                ui.vertical(|ui| {
                    ui.heading(
                        RichText::new("Watch History")
                            .size(28.0)
                            .strong()
                            .color(cf_text_primary),
                    );
                    ui.add_space(4.0);
                    ui.label(
                        RichText::new("Explore playback sessions, resume interrupted media, and inspect daily viewing activity.")
                            .size(13.0)
                            .color(cf_text_muted),
                    );
                });
            });
            let hero_end_y = ui.cursor().min.y;
            ui.painter().line_segment(
                [
                    Pos2::new(ui.min_rect().left() + 2.0, hero_start_y + 2.0),
                    Pos2::new(ui.min_rect().left() + 2.0, hero_end_y - 2.0),
                ],
                Stroke::new(2.0, cf_border),
            );

            ui.add_space(14.0);
            ui.horizontal(|ui| {
                let date_label = if let Some(d) = state.history_selected_day {
                    format!("{} ✕", d.format("%d %b %Y"))
                } else {
                    "Pick date".to_string()
                };
                let date_btn = egui::Button::new(
                    RichText::new(date_label)
                        .size(12.5)
                        .strong()
                        .color(Color32::from_rgb(18, 18, 20)),
                )
                .fill(cf_orange)
                .stroke(Stroke::NONE)
                .corner_radius(CornerRadius::same(16))
                .min_size(Vec2::new(104.0, 32.0));
                let date_resp = ui.add(date_btn);
                date_btn_rect = date_resp.rect;
                if date_resp.hovered() {
                    ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                }
                if date_resp.clicked() {
                    if state.history_selected_day.is_some() && !picker_open {
                        state.history_selected_day = None;
                    } else {
                        picker_open = !picker_open;
                    }
                }

                ui.add_space(6.0);
                let clear_btn = egui::Button::new(
                    RichText::new("Clear history")
                        .size(12.0)
                        .color(cf_text_primary),
                )
                .fill(cf_surface_alt)
                .stroke(Stroke::new(1.0, cf_border))
                .corner_radius(CornerRadius::same(16))
                .min_size(Vec2::new(102.0, 32.0));
                if ui.add(clear_btn).clicked() {
                    state.confirm_clear_history = true;
                }

                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    ui.add_sized(
                        [240.0, 32.0],
                        egui::TextEdit::singleline(&mut state.history_search).hint_text("Search title..."),
                    );
                });
            });

            // Sexy Floating Date Picker Calendar Popover
            if picker_open {
                let cal_w = 274.0;
                let cal_pos = Pos2::new(
                    (date_btn_rect.right() - cal_w).max(available.left() + 12.0),
                    date_btn_rect.bottom() + 6.0,
                );
                let mut active_dates: std::collections::HashSet<chrono::NaiveDate> = std::collections::HashSet::new();
                for s in sessions {
                    active_dates.insert(s.start_time.with_timezone(&chrono::Local).date_naive());
                }
                let cal_area = egui::Area::new(ui.scope_id().with("gh_date_picker_area"))
                    .order(egui::Order::Foreground)
                    .fixed_pos(cal_pos)
                    .show(ui.ctx(), |ui| {
                        egui::Frame::new()
                            .fill(Color32::from_rgb(22, 27, 34))
                            .stroke(Stroke::new(1.0, Color32::from_rgb(48, 54, 61)))
                            .corner_radius(CornerRadius::same(8))
                            .inner_margin(12.0)
                            .show(ui, |ui| {
                                ui.set_width(cal_w - 24.0);
                                let first_of_month = chrono::NaiveDate::from_ymd_opt(cal_year, cal_month, 1).unwrap_or(today_local);
                                ui.horizontal(|ui| {
                                    if ui.add(egui::Button::new("‹").min_size(Vec2::new(26.0, 24.0))).clicked() {
                                        if cal_month == 1 {
                                            cal_month = 12;
                                            cal_year -= 1;
                                        } else {
                                            cal_month -= 1;
                                        }
                                    }
                                    ui.with_layout(Layout::centered_and_justified(egui::Direction::LeftToRight), |ui| {
                                        ui.label(RichText::new(first_of_month.format("%B %Y").to_string()).size(13.0).strong().color(Color32::from_rgb(240, 246, 252)));
                                    });
                                    if ui.add(egui::Button::new("›").min_size(Vec2::new(26.0, 24.0))).clicked() {
                                        if cal_month == 12 {
                                            cal_month = 1;
                                            cal_year += 1;
                                        } else {
                                            cal_month += 1;
                                        }
                                    }
                                });
                                ui.add_space(6.0);
                                let cell_sz = 32.0;
                                ui.horizontal(|ui| {
                                    ui.spacing_mut().item_spacing.x = 2.0;
                                    for wd in ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] {
                                        let (r, _) = ui.allocate_exact_size(Vec2::new(cell_sz, 20.0), Sense::hover());
                                        ui.painter().text(r.center(), Align2::CENTER_CENTER, wd, FontId::proportional(11.0), Color32::from_rgb(139, 148, 158));
                                    }
                                });
                                let start_offset = chrono::Datelike::weekday(&first_of_month).num_days_from_sunday() as i64;
                                let next_month = if cal_month == 12 {
                                    chrono::NaiveDate::from_ymd_opt(cal_year + 1, 1, 1)
                                } else {
                                    chrono::NaiveDate::from_ymd_opt(cal_year, cal_month + 1, 1)
                                }.unwrap_or(today_local);
                                let days_in_month = next_month.signed_duration_since(first_of_month).num_days();
                                let total_cells = start_offset + days_in_month;
                                let rows = (total_cells + 6) / 7;
                                for row in 0..rows {
                                    ui.horizontal(|ui| {
                                        ui.spacing_mut().item_spacing.x = 2.0;
                                        for col in 0..7 {
                                            let idx = row * 7 + col;
                                            let day_num = idx - start_offset + 1;
                                            if day_num >= 1 && day_num <= days_in_month {
                                                let d = chrono::NaiveDate::from_ymd_opt(cal_year, cal_month, day_num as u32).unwrap_or(today_local);
                                                let (r, resp) = ui.allocate_exact_size(Vec2::splat(cell_sz), Sense::click());
                                                let is_sel = state.history_selected_day == Some(d);
                                                let is_today = d == today_local;
                                                let has_data = active_dates.contains(&d);
                                                if resp.hovered() {
                                                    ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                                }
                                                let bg = if is_sel {
                                                    Color32::from_rgb(31, 111, 235)
                                                } else if resp.hovered() {
                                                    Color32::from_rgb(48, 54, 61)
                                                } else if has_data {
                                                    Color32::from_rgb(14, 68, 41)
                                                } else {
                                                    Color32::TRANSPARENT
                                                };
                                                ui.painter().rect_filled(r, CornerRadius::same(6), bg);
                                                if is_today && !is_sel {
                                                    ui.painter().rect_stroke(r, CornerRadius::same(6), Stroke::new(1.0, Color32::from_rgb(88, 166, 255)), StrokeKind::Inside);
                                                }
                                                ui.painter().text(
                                                    r.center(),
                                                    Align2::CENTER_CENTER,
                                                    day_num.to_string(),
                                                    FontId::proportional(12.0),
                                                    if is_sel || has_data { Color32::WHITE } else { Color32::from_rgb(201, 209, 217) },
                                                );
                                                if resp.clicked() {
                                                    state.history_selected_day = Some(d);
                                                    picker_open = false;
                                                }
                                            } else {
                                                ui.allocate_exact_size(Vec2::splat(cell_sz), Sense::hover());
                                            }
                                        }
                                    });
                                    ui.add_space(2.0);
                                }
                                ui.add_space(6.0);
                                ui.horizontal(|ui| {
                                    if ui.button("Today").clicked() {
                                        state.history_selected_day = Some(today_local);
                                        picker_open = false;
                                    }
                                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                        if ui.button("Clear").clicked() {
                                            state.history_selected_day = None;
                                            picker_open = false;
                                        }
                                    });
                                });
                            });
                    });
                if ui.input(|i| i.pointer.any_click()) {
                    if let Some(pos) = ui.input(|i| i.pointer.latest_pos()) {
                        if !cal_area.response.rect.contains(pos) && !date_btn_rect.contains(pos) {
                            picker_open = false;
                        }
                    }
                }
            }
            ui.data_mut(|d| {
                d.insert_temp(picker_open_id, picker_open);
                d.insert_temp(picker_month_id, (cal_year, cal_month));
            });

            if state.confirm_clear_history {
                egui::Window::new("Clear all watch history?")
                    .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
                    .collapsible(false)
                    .resizable(false)
                    .show(ui.ctx(), |ui| {
                        ui.label(
                            "Watch sessions will be cleared. Resume positions can be reset separately.",
                        );
                        ui.checkbox(
                            &mut state.clear_history_reset_positions,
                            "Also reset resume positions",
                        );
                        ui.horizontal(|ui| {
                            if ui.button("Cancel").clicked() {
                                state.confirm_clear_history = false;
                            }
                            if ui.button("Clear").clicked() {
                                state.confirm_clear_history = false;
                                action = ShellAction::ClearHistory {
                                    reset_positions: state.clear_history_reset_positions,
                                };
                            }
                        });
                    });
            }

            let filtered: Vec<_> = entries
                .iter()
                .filter(|e| {
                    state.history_search.trim().is_empty()
                        || e.current_item_title
                            .to_lowercase()
                            .contains(&state.history_search.to_lowercase())
                })
                .collect();
            let using_sample_history = sessions.is_empty();
            let display_sessions = if using_sample_history {
                sample_history_sessions()
            } else {
                sessions.to_vec()
            };

            // 2. Architectural Stats Ribbon (2 large stat boxes + 8x8 corner ticks)
            ui.add_space(spacing::PAD_16);
            let ribbon_h = 84.0;
            let ribbon_w = ui.available_width().max(320.0);
            let (ribbon_rect, _) = ui.allocate_exact_size(Vec2::new(ribbon_w, ribbon_h), Sense::hover());

            ui.painter().rect(
                ribbon_rect,
                CornerRadius::same(2),
                cf_surface,
                Stroke::new(1.0, cf_border),
                StrokeKind::Inside,
            );
            // 4 large corner boxes (Cloudflare Docs card signature)
            for corner in [
                ribbon_rect.left_top(),
                ribbon_rect.right_top() - Vec2::new(8.0, 0.0),
                ribbon_rect.left_bottom() - Vec2::new(0.0, 8.0),
                ribbon_rect.right_bottom() - Vec2::new(8.0, 8.0),
            ] {
                ui.painter().rect_stroke(
                    Rect::from_min_size(corner, Vec2::new(8.0, 8.0)),
                    CornerRadius::ZERO,
                    Stroke::new(1.0, cf_tick),
                    StrokeKind::Inside,
                );
            }

            // Compute metrics
            let total_watch_secs: f64 = display_sessions.iter().map(|s| (s.end_pos_secs - s.start_pos_secs).abs()).sum();
            let total_hours = (total_watch_secs / 3600.0).floor() as u64;
            let total_mins = ((total_watch_secs % 3600.0) / 60.0).floor() as u64;
            let watch_time_str = if total_hours > 0 {
                format!("{}h {}m", total_hours, total_mins)
            } else {
                format!("{}m", total_mins.max(1))
            };

            let col_w = ribbon_w / 2.0;
            let metrics = [
                ("IMMERSION TIME", watch_time_str, cf_orange),
                ("TITLES LOGGED", display_sessions.len().to_string(), cf_text_primary),
            ];

            for (idx, (label, val, col)) in metrics.iter().enumerate() {
                let col_left = ribbon_rect.left() + idx as f32 * col_w;
                let col_center = col_left + col_w * 0.5;

                if idx > 0 {
                    ui.painter().line_segment(
                        [Pos2::new(col_left, ribbon_rect.top() + 14.0), Pos2::new(col_left, ribbon_rect.bottom() - 14.0)],
                        Stroke::new(1.0, cf_border_subtle),
                    );
                }

                ui.painter().text(
                    Pos2::new(col_center, ribbon_rect.top() + 24.0),
                    Align2::CENTER_CENTER,
                    *label,
                    FontId::proportional(11.0),
                    cf_text_dim,
                );
                ui.painter().text(
                    Pos2::new(col_center, ribbon_rect.top() + 54.0),
                    Align2::CENTER_CENTER,
                    val,
                    FontId::proportional(22.0),
                    *col,
                );
            }
            let _ = &filtered;
            let _ = cf_orange_soft;

            // 3. Cloudflare-Styled Activity Heatmap Card
            ui.add_space(spacing::PAD_24);

            // Compute real daily aggregates from sessions
            let mut day_counts: HashMap<chrono::NaiveDate, (usize, f64)> = HashMap::new();
            for s in &display_sessions {
                let d = s.start_time.with_timezone(&chrono::Local).date_naive();
                let dur = (s.end_pos_secs - s.start_pos_secs).abs().max(1.0);
                let entry = day_counts.entry(d).or_insert((0, 0.0));
                entry.0 += 1;
                entry.1 += dur;
            }
            let aggregates: Vec<(chrono::NaiveDate, usize, f64)> = day_counts
                .into_iter()
                .map(|(d, (c, dur))| (d, c, dur))
                .collect();

            let today = chrono::Local::now().date_naive();
            let heatmap_layout = crate::view_models::calculate_heatmap_layout(&aggregates, today);

            // Header sits OUTSIDE and ABOVE the bordered card
            let count_label = if heatmap_layout.total_sessions_365 == 1 {
                "1 session in the last year".to_string()
            } else {
                format!("{} sessions in the last year", heatmap_layout.total_sessions_365)
            };
            ui.label(
                RichText::new(count_label)
                    .size(16.0)
                    .strong()
                    .color(cf_text_primary),
            );
            ui.add_space(8.0);

            // Cloudflare Docs Dark + Orange heatmap palette
            let gh_card_bg = cf_surface;
            let gh_card_border = cf_border;
            let gh_text_muted = cf_text_muted;
            let gh_text_label = cf_text_primary;
            let gh_level_0 = Color32::from_rgb(30, 30, 35);
            let gh_level_0_border = Color32::from_rgba_unmultiplied(255, 255, 255, 14);
            let gh_level_1 = Color32::from_rgb(92, 43, 12);
            let gh_level_2 = Color32::from_rgb(154, 67, 13);
            let gh_level_3 = Color32::from_rgb(217, 91, 22);
            let gh_level_4 = cf_orange;

            let total_weeks = heatmap_layout.total_weeks.max(53);
            let label_w = 34.0;
            let right_rail_w = if ui.available_width() > 640.0 { 156.0 } else { 0.0 };
            let card_target_w = (ui.available_width() - right_rail_w).max(400.0);
            let avail_for_grid = (card_target_w - 36.0 - label_w).max(360.0);
            // Uniform column spacing (no month gaps), responsive square size matching GitHub proportions
            let step_x = avail_for_grid / total_weeks as f32;
            let col_spacing = (step_x * 0.22).clamp(2.5, 4.0);
            let sq_size = (step_x - col_spacing).clamp(8.5, 15.0);
            let actual_step_x = sq_size + col_spacing;
            let grid_total_w = label_w + total_weeks as f32 * actual_step_x;

            let mut hovered_cell: Option<(Rect, String)> = None;

            Frame::new()
                .fill(gh_card_bg)
                .stroke(Stroke::new(1.0, gh_card_border))
                .corner_radius(CornerRadius::same(6))
                .inner_margin(egui::Margin::symmetric(18, 16))
                .show(ui, |ui| {
                    ui.set_width(grid_total_w);

                    // Month labels placed directly over each month's first week column (uniform spacing)
                    ui.horizontal(|ui| {
                        ui.spacing_mut().item_spacing.x = 0.0;
                        ui.allocate_exact_size(Vec2::new(label_w, 18.0), Sense::hover());
                        let start_x = ui.cursor().min.x;
                        for ml in &heatmap_layout.month_labels {
                            let x_offset = ml.col_index as f32 * actual_step_x;
                            ui.painter().text(
                                Pos2::new(start_x + x_offset, ui.cursor().min.y + 7.0),
                                Align2::LEFT_CENTER,
                                ml.name,
                                FontId::proportional(11.5),
                                gh_text_label,
                            );
                        }
                        ui.allocate_exact_size(Vec2::new(total_weeks as f32 * actual_step_x, 18.0), Sense::hover());
                    });
                    ui.add_space(3.0);

                    let mut day_cell_map = HashMap::new();
                    for day in &heatmap_layout.days {
                        day_cell_map.insert((day.col_index, day.row_index), day);
                    }

                    // 7 Rows (days of week: Sun-Sat, labeled Mon, Wed, Fri like GitHub)
                    let days = ["", "Mon", "", "Wed", "", "Fri", ""];
                    for (day_idx, day_name) in days.iter().enumerate() {
                        ui.horizontal(|ui| {
                            ui.spacing_mut().item_spacing.x = col_spacing;
                            let (lbl_rect, _) = ui.allocate_exact_size(Vec2::new(label_w - col_spacing, sq_size), Sense::hover());
                            if !day_name.is_empty() {
                                ui.painter().text(
                                    Pos2::new(lbl_rect.left(), lbl_rect.center().y),
                                    Align2::LEFT_CENTER,
                                    *day_name,
                                    FontId::proportional(11.5),
                                    gh_text_label,
                                );
                            }

                            for col in 0..total_weeks {
                                if let Some(day) = day_cell_map.get(&(col, day_idx)) {
                                    let cell_tint = match day.intensity {
                                        0 => gh_level_0,
                                        1 => gh_level_1,
                                        2 => gh_level_2,
                                        3 => gh_level_3,
                                        _ => gh_level_4,
                                    };

                                    let (cell_rect, resp) = ui.allocate_exact_size(Vec2::splat(sq_size), egui::Sense::click());
                                    ui.painter().rect_filled(cell_rect, CornerRadius::same(2), cell_tint);
                                    if day.intensity == 0 {
                                        ui.painter().rect_stroke(
                                            cell_rect,
                                            CornerRadius::same(2),
                                            Stroke::new(1.0, gh_level_0_border),
                                            StrokeKind::Inside,
                                        );
                                    }

                                    let is_selected = state.history_selected_day == Some(day.date);
                                    if is_selected {
                                        ui.painter().rect_stroke(
                                            cell_rect,
                                            CornerRadius::same(2),
                                            Stroke::new(1.5, cf_text_primary),
                                            StrokeKind::Inside,
                                        );
                                    } else if resp.hovered() {
                                        ui.painter().rect_stroke(
                                            cell_rect,
                                            CornerRadius::same(2),
                                            Stroke::new(1.0, Color32::from_rgba_unmultiplied(240, 246, 252, 180)),
                                            StrokeKind::Inside,
                                        );
                                    }

                                    if resp.clicked() {
                                        if is_selected {
                                            state.history_selected_day = None;
                                        } else {
                                            state.history_selected_day = Some(day.date);
                                        }
                                    }

                                    if resp.hovered() {
                                        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                        let day_num = chrono::Datelike::day(&day.date);
                                        let suffix = match day_num {
                                            1 | 21 | 31 => "st",
                                            2 | 22 => "nd",
                                            3 | 23 => "rd",
                                            _ => "th",
                                        };
                                        let month_name = day.date.format("%B");
                                        let date_str = format!("{month_name} {day_num}{suffix}");
                                        let hover_text = if day.session_count == 0 {
                                            format!("No sessions on {date_str}.")
                                        } else if day.session_count == 1 {
                                            format!("1 session on {date_str} ({}).", crate::view_models::format_duration_compact(day.total_duration_secs))
                                        } else {
                                            format!("{} sessions on {date_str} ({}).", day.session_count, crate::view_models::format_duration_compact(day.total_duration_secs))
                                        };
                                        hovered_cell = Some((cell_rect, hover_text));
                                    }
                                } else {
                                    ui.allocate_exact_size(Vec2::splat(sq_size), egui::Sense::hover());
                                }
                            }
                        });
                        ui.add_space(3.0);
                    }

                    // Bottom row inside card: muted hint on left, "Less [][][][][] More" on right
                    ui.add_space(6.0);
                    ui.horizontal(|ui| {
                        ui.add_space(label_w);
                        ui.label(
                            RichText::new("Each square is a day. Click one to filter what you watched.")
                                .size(11.5)
                                .color(gh_text_muted),
                        );
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            ui.spacing_mut().item_spacing.x = 3.0;
                            ui.label(RichText::new("More").size(11.5).color(gh_text_muted));
                            for (idx, color) in [gh_level_4, gh_level_3, gh_level_2, gh_level_1, gh_level_0].into_iter().enumerate() {
                                let (rect, _) = ui.allocate_exact_size(Vec2::splat(11.0), egui::Sense::hover());
                                ui.painter().rect_filled(rect, CornerRadius::same(2), color);
                                if idx == 4 {
                                    ui.painter().rect_stroke(
                                        rect,
                                        CornerRadius::same(2),
                                        Stroke::new(1.0, gh_level_0_border),
                                        StrokeKind::Inside,
                                    );
                                }
                            }
                            ui.label(RichText::new("Less").size(11.5).color(gh_text_muted));
                        });
                    });
                });

            // Instant GitHub-style floating tooltip above the hovered square
            if let Some((cell_rect, tip_text)) = hovered_cell {
                let tip_font = FontId::proportional(12.0);
                let tip_galley = ui.painter().layout_no_wrap(
                    tip_text,
                    tip_font,
                    Color32::from_rgb(240, 246, 252),
                );
                let pad_x = 10.0;
                let pad_y = 6.0;
                let tip_w = tip_galley.size().x + pad_x * 2.0;
                let tip_h = tip_galley.size().y + pad_y * 2.0;
                let tip_pos = Pos2::new(
                    (cell_rect.center().x - tip_w * 0.5).max(page_rect.left() + 4.0),
                    cell_rect.top() - tip_h - 6.0,
                );
                egui::Area::new(ui.scope_id().with("gh_heatmap_tooltip"))
                    .order(egui::Order::Tooltip)
                    .fixed_pos(tip_pos)
                    .interactable(false)
                    .show(ui.ctx(), |ui| {
                        let (tip_rect, _) = ui.allocate_exact_size(Vec2::new(tip_w, tip_h), Sense::hover());
                        ui.painter().rect(
                            tip_rect,
                            CornerRadius::same(6),
                            Color32::from_rgb(45, 51, 59), // #2D333B
                            Stroke::new(1.0, Color32::from_rgb(68, 76, 86)),
                            StrokeKind::Inside,
                        );
                        ui.painter().galley(
                            Pos2::new(tip_rect.left() + pad_x, tip_rect.top() + pad_y),
                            tip_galley,
                            Color32::from_rgb(240, 246, 252),
                        );
                    });
            }

            // Filter sessions based on search, filter pill, and day filter
            let filtered_sessions: Vec<_> = display_sessions
                .iter()
                .filter(|s| {
                    let s_low = s.item_title.to_lowercase();
                    !s_low.contains("$recycle.bin") && !s_low.starts_with("$r")
                })
                .filter(|s| {
                    state.history_search.trim().is_empty()
                        || s.item_title.to_lowercase().contains(&state.history_search.to_lowercase())
                })
                .filter(|s| {
                    if let Some(target_day) = state.history_selected_day {
                        let local_day = s.start_time.with_timezone(&chrono::Local).date_naive();
                        local_day == target_day
                    } else {
                        true
                    }
                })
                .filter(|s| {
                    match state.history_filter {
                        crate::view_models::HistoryFilterPill::All => true,
                        crate::view_models::HistoryFilterPill::Local => true,
                        crate::view_models::HistoryFilterPill::Remote => false,
                        crate::view_models::HistoryFilterPill::Online => false,
                        crate::view_models::HistoryFilterPill::StoppedEarly => s.stopped_early,
                        crate::view_models::HistoryFilterPill::Finished => s.completed,
                        crate::view_models::HistoryFilterPill::NeedsTraktSync => false,
                    }
                })
                .cloned()
                .collect();

            // 5. GitHub-Style Watch Activity Timeline + Right Year Selector
            ui.add_space(spacing::PAD_24);

            // Persisted UI state for selected year & visible activity groups
            let current_year = chrono::Datelike::year(&today);
            let year_state_id = ui.scope_id().with("gh_selected_year");
            let limit_state_id = ui.scope_id().with("gh_visible_groups");
            let mut selected_year: Option<i32> = ui.data(|d| d.get_temp(year_state_id)).unwrap_or(Some(current_year));
            let mut visible_groups: usize = ui.data(|d| d.get_temp(limit_state_id)).unwrap_or(6);

            // Collect available years from sessions (plus current year down to current_year - 3)
            let mut years: Vec<i32> = display_sessions
                .iter()
                .map(|s| chrono::Datelike::year(&s.start_time.with_timezone(&chrono::Local).date_naive()))
                .collect();
            for offset in 0..4 {
                years.push(current_year - offset);
            }
            years.sort_unstable_by(|a, b| b.cmp(a));
            years.dedup();

            // Apply year filter if selected (and no specific day is clicked)
            let year_filtered_sessions: Vec<_> = filtered_sessions
                .iter()
                .filter(|s| {
                    if state.history_selected_day.is_some() {
                        true
                    } else if let Some(yr) = selected_year {
                        chrono::Datelike::year(&s.start_time.with_timezone(&chrono::Local).date_naive()) == yr
                    } else {
                        true
                    }
                })
                .cloned()
                .collect();

            let gh_blue = cf_orange;
            let gh_link = cf_orange_soft;
            let gh_green_bar = cf_green;
            let gh_track = cf_surface_alt;
            let gh_node_bg = cf_surface_alt;

            let total_avail_w = ui.available_width().max(320.0);
            let show_year_rail = total_avail_w > 640.0;
            let rail_w = if show_year_rail { 136.0 } else { 0.0 };
            let rail_gap = if show_year_rail { 20.0 } else { 0.0 };
            let left_col_w = (total_avail_w - rail_w - rail_gap).max(300.0);

            ui.horizontal_top(|ui| {
                // LEFT COLUMN: Watch activity timeline
                ui.allocate_ui_with_layout(Vec2::new(left_col_w, 0.0), Layout::top_down(Align::Min), |ui| {
                    ui.set_width(left_col_w);

                    // Activity Header + Filter Pills
                    ui.horizontal(|ui| {
                        ui.label(
                            RichText::new("Watch activity")
                                .size(16.0)
                                .color(Color32::from_rgb(240, 246, 252)),
                        );
                        if let Some(selected_day) = state.history_selected_day {
                            ui.add_space(8.0);
                            let pill_text = format!("Day: {} ✕", selected_day.format("%d %b %Y"));
                            let pill_btn = egui::Button::new(
                                RichText::new(pill_text).size(11.5).color(gh_link),
                            )
                            .fill(gh_track)
                            .stroke(Stroke::new(1.0, gh_card_border))
                            .corner_radius(CornerRadius::same(12));
                            if ui.add(pill_btn).clicked() {
                                state.history_selected_day = None;
                            }
                        }

                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            for (filter, label) in [
                                (crate::view_models::HistoryFilterPill::Finished, "Finished"),
                                (crate::view_models::HistoryFilterPill::StoppedEarly, "Stopped early"),
                                (crate::view_models::HistoryFilterPill::All, "All"),
                            ] {
                                let is_active = state.history_filter == filter;
                                let btn = egui::Button::new(
                                    RichText::new(label)
                                        .size(12.0)
                                        .color(if is_active { cf_text_primary } else { gh_text_muted }),
                                )
                                .fill(if is_active { cf_surface_alt } else { Color32::TRANSPARENT })
                                .stroke(Stroke::new(1.0, if is_active { cf_border } else { Color32::TRANSPARENT }))
                                .corner_radius(CornerRadius::same(4))
                                .min_size(Vec2::new(52.0, 26.0));
                                let resp = ui.add(btn);
                                if is_active {
                                    ui.painter().line_segment(
                                        [
                                            Pos2::new(resp.rect.left() + 4.0, resp.rect.bottom() - 1.0),
                                            Pos2::new(resp.rect.right() - 4.0, resp.rect.bottom() - 1.0),
                                        ],
                                        Stroke::new(2.0, cf_orange),
                                    );
                                }
                                if resp.clicked() {
                                    state.history_filter = filter;
                                }
                            }
                        });
                    });

                    ui.add_space(14.0);

                    let date_groups = crate::view_models::group_watch_sessions(&year_filtered_sessions);
                    if date_groups.is_empty() {
                        Frame::new()
                            .fill(gh_card_bg)
                            .stroke(Stroke::new(1.0, gh_card_border))
                            .corner_radius(CornerRadius::same(6))
                            .inner_margin(egui::Margin::symmetric(20, 24))
                            .show(ui, |ui| {
                                ui.set_width(left_col_w - 40.0);
                                ui.label(
                                    RichText::new("No watch activity recorded for this selection.")
                                        .size(13.0)
                                        .color(gh_text_muted),
                                );
                            });
                    } else {
                        let total_groups = date_groups.len();
                        for group in date_groups.into_iter().take(visible_groups) {
                            // Date Header + Horizontal Divider Rule (matching "July 22, 2026 ─────────")
                            let (hdr_rect, _) = ui.allocate_exact_size(Vec2::new(left_col_w, 22.0), Sense::hover());
                            let date_galley = ui.painter().layout_no_wrap(
                                group.date_label.clone(),
                                FontId::proportional(12.5),
                                Color32::from_rgb(240, 246, 252),
                            );
                            let date_w = date_galley.size().x;
                            ui.painter().galley(
                                Pos2::new(hdr_rect.left(), hdr_rect.center().y - date_galley.size().y * 0.5),
                                date_galley,
                                Color32::from_rgb(240, 246, 252),
                            );

                            let agg_galley = ui.painter().layout_no_wrap(
                                group.aggregate_label.clone(),
                                FontId::proportional(11.5),
                                gh_text_muted,
                            );
                            let agg_w = agg_galley.size().x;
                            ui.painter().galley(
                                Pos2::new(hdr_rect.right() - agg_w, hdr_rect.center().y - agg_galley.size().y * 0.5),
                                agg_galley,
                                gh_text_muted,
                            );

                            let line_start_x = hdr_rect.left() + date_w + 12.0;
                            let line_end_x = hdr_rect.right() - agg_w - 12.0;
                            if line_end_x > line_start_x {
                                ui.painter().line_segment(
                                    [Pos2::new(line_start_x, hdr_rect.center().y), Pos2::new(line_end_x, hdr_rect.center().y)],
                                    Stroke::new(1.0, gh_card_border),
                                );
                            }

                            // Deduplicate same-day accesses of the same file (keep latest accessed, sum watched duration, count accesses)
                            let mut merged_sessions: Vec<(valor_core::models::WatchSession, usize, f64)> = Vec::new();
                            for s in &group.sessions {
                                let s_dur = (s.end_pos_secs - s.start_pos_secs).abs().max(1.0);
                                if let Some(existing) = merged_sessions.iter_mut().find(|(es, _, _)| es.fingerprint == s.fingerprint) {
                                    existing.1 += 1;
                                    existing.2 += s_dur;
                                } else {
                                    merged_sessions.push((s.clone(), 1, s_dur));
                                }
                            }

                            // Timeline body with vertical line + circular node + item rows
                            let item_count = merged_sessions.len();
                            let row_h = 42.0;
                            let summary_h = 30.0;
                            let body_h = summary_h + item_count as f32 * row_h + 12.0;
                            let (body_rect, _) = ui.allocate_exact_size(Vec2::new(left_col_w, body_h), Sense::hover());

                            let timeline_x = body_rect.left() + 16.0;
                            // Vertical timeline line (#30363D)
                            ui.painter().line_segment(
                                [Pos2::new(timeline_x, body_rect.top()), Pos2::new(timeline_x, body_rect.bottom())],
                                Stroke::new(2.0, gh_card_border),
                            );

                            // Circular node centered on vertical line
                            let node_center = Pos2::new(timeline_x, body_rect.top() + 16.0);
                            ui.painter().circle_filled(node_center, 14.0, gh_node_bg);
                            ui.painter().circle_stroke(node_center, 14.0, Stroke::new(1.0, gh_card_border));
                            ui.painter().text(
                                Pos2::new(node_center.x + 1.0, node_center.y),
                                Align2::CENTER_CENTER,
                                "▶",
                                FontId::proportional(10.0),
                                gh_text_muted,
                            );

                            let content_left = body_rect.left() + 42.0;
                            let summary_text = if item_count == 1 {
                                "Watched 1 video".to_string()
                            } else {
                                format!("Watched {} videos", item_count)
                            };
                            ui.painter().text(
                                Pos2::new(content_left, node_center.y),
                                Align2::LEFT_CENTER,
                                summary_text,
                                FontId::proportional(14.0),
                                Color32::from_rgb(240, 246, 252),
                            );

                            // Individual session rows underneath
                            let mut max_dur = 1.0_f64;
                            for (_, _, d) in &merged_sessions {
                                if *d > max_dur {
                                    max_dur = *d;
                                }
                            }

                            for (idx, (session, access_count, total_session_dur)) in merged_sessions.iter().enumerate() {
                                let row_y = body_rect.top() + summary_h + idx as f32 * row_h;
                                let row_rect = Rect::from_min_size(
                                    Pos2::new(content_left, row_y),
                                    Vec2::new((body_rect.right() - content_left).max(120.0), row_h),
                                );
                                let top_center_y = row_rect.top() + 12.0;

                                // Right controls: [Progress Bar] [Play] [✕]
                                let del_rect = Rect::from_center_size(
                                    Pos2::new(row_rect.right() - 12.0, top_center_y),
                                    Vec2::splat(20.0),
                                );
                                let del_resp = ui.interact(del_rect, ui.scope_id().with(("gh_del", session.id.as_str())), Sense::click());
                                if del_resp.hovered() {
                                    ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                    ui.painter().rect_filled(del_rect, CornerRadius::same(4), Color32::from_rgba_unmultiplied(239, 68, 68, 40));
                                }
                                {
                                    let x_col = if del_resp.hovered() { Color32::from_rgb(248, 113, 113) } else { Color32::from_rgb(239, 68, 68) };
                                    let xc = del_rect.center();
                                    let xr = 4.0;
                                    ui.painter().line_segment([Pos2::new(xc.x - xr, xc.y - xr), Pos2::new(xc.x + xr, xc.y + xr)], Stroke::new(1.6, x_col));
                                    ui.painter().line_segment([Pos2::new(xc.x - xr, xc.y + xr), Pos2::new(xc.x + xr, xc.y - xr)], Stroke::new(1.6, x_col));
                                }
                                if del_resp.clicked() {
                                    action = ShellAction::DeleteHistorySession(session.id.clone());
                                }

                                let play_rect = Rect::from_center_size(
                                    Pos2::new(del_rect.left() - 34.0, top_center_y),
                                    Vec2::new(56.0, 20.0),
                                );
                                let play_resp = ui.interact(play_rect, ui.scope_id().with(("gh_play", session.id.as_str())), Sense::click());
                                if play_resp.hovered() {
                                    ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                }
                                let is_resume = !session.completed;
                                ui.painter().rect(
                                    play_rect,
                                    CornerRadius::same(4),
                                    if play_resp.hovered() {
                                        if is_resume { gh_blue } else { Color32::from_rgb(48, 54, 61) }
                                    } else {
                                        gh_track
                                    },
                                    Stroke::new(1.0, gh_card_border),
                                    StrokeKind::Inside,
                                );
                                ui.painter().text(
                                    play_rect.center(),
                                    Align2::CENTER_CENTER,
                                    if is_resume { "Resume" } else { "Replay" },
                                    FontId::proportional(10.5),
                                    Color32::from_rgb(240, 246, 252),
                                );

                                // Horizontal bar
                                let bar_w = (row_rect.width() * 0.22).clamp(60.0, 140.0);
                                let bar_right = play_rect.left() - 14.0;
                                let bar_left = bar_right - bar_w;
                                let session_dur = *total_session_dur;
                                let media_item = items.iter().find(|i| i.fingerprint == session.fingerprint);
                                let fill_frac = if session.completed {
                                    1.0
                                } else if let Some(mi) = media_item {
                                    if mi.duration > 0.0 { (session.end_pos_secs / mi.duration).clamp(0.15, 0.95) as f32 } else { (session_dur / max_dur).clamp(0.15, 0.95) as f32 }
                                } else {
                                    (session_dur / max_dur).clamp(0.15, 0.95) as f32
                                };

                                let track_rect = Rect::from_min_size(
                                    Pos2::new(bar_left, top_center_y - 4.0),
                                    Vec2::new(bar_w, 8.0),
                                );
                                ui.painter().rect_filled(track_rect, CornerRadius::same(4), gh_track);
                                let fill_rect = Rect::from_min_size(
                                    track_rect.min,
                                    Vec2::new(bar_w * fill_frac, 8.0),
                                );
                                ui.painter().rect_filled(
                                    fill_rect,
                                    CornerRadius::same(4),
                                    if session.completed { gh_green_bar } else { gh_blue },
                                );

                                // Left: Clickable title + optional SxxEyy badge + ×N count + muted duration/watched
                                let title_area_max_w = (bar_left - row_rect.left() - 14.0).max(60.0);
                                let dur_str = format_time(session_dur).unwrap_or_else(|| "1s".into());
                                let total_media_secs = media_item.map(|m| m.duration).filter(|&d| d > 0.0).unwrap_or(session.end_pos_secs.max(session_dur));
                                let total_str = format_time(total_media_secs).unwrap_or_else(|| "1s".into());
                                let count_prefix = if *access_count > 1 {
                                    format!("×{access_count} · ")
                                } else {
                                    String::new()
                                };
                                let ep_prefix = if let Some(mi) = media_item {
                                    match (mi.season_number, mi.episode_number) {
                                        (Some(s), Some(e)) => format!("S{s:02}E{e:02} · "),
                                        _ => String::new(),
                                    }
                                } else {
                                    String::new()
                                };
                                let status_suffix = if session.completed {
                                    format!("{ep_prefix}{count_prefix}Watched {dur_str} of {total_str} · ★ Rated")
                                } else {
                                    let paused_at = format_time(session.end_pos_secs).unwrap_or_else(|| "0:00".into());
                                    format!("{ep_prefix}{count_prefix}Watched {dur_str} of {total_str} · paused at {paused_at}")
                                };
                                let suffix_galley = ui.painter().layout_no_wrap(
                                    status_suffix,
                                    FontId::proportional(11.5),
                                    gh_text_muted,
                                );
                                let suffix_w = suffix_galley.size().x;
                                let title_max_w = (title_area_max_w - suffix_w - 10.0).max(40.0);
                                let disp_title = truncate_text(ui, &session.item_title, FontId::proportional(13.0), title_max_w);
                                let title_galley = ui.painter().layout_no_wrap(
                                    disp_title,
                                    FontId::proportional(13.0),
                                    gh_link,
                                );
                                let title_w = title_galley.size().x;
                                let link_rect = Rect::from_min_size(
                                    Pos2::new(row_rect.left(), top_center_y - 9.0),
                                    Vec2::new(title_w, 18.0),
                                );
                                let full_filename = media_item
                                    .and_then(|m| std::path::Path::new(&m.file_path).file_name())
                                    .map(|n| n.to_string_lossy().to_string())
                                    .unwrap_or_else(|| session.item_title.clone());
                                let link_resp = ui
                                    .interact(link_rect, ui.scope_id().with(("gh_link", session.id.as_str())), Sense::click())
                                    .on_hover_text(&full_filename);
                                if link_resp.hovered() {
                                    ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                    ui.painter().line_segment(
                                        [Pos2::new(link_rect.left(), link_rect.bottom() - 1.0), Pos2::new(link_rect.right(), link_rect.bottom() - 1.0)],
                                        Stroke::new(1.0, gh_link),
                                    );
                                }
                                ui.painter().galley(link_rect.min, title_galley, gh_link);
                                ui.painter().galley(
                                    Pos2::new(link_rect.right() + 8.0, top_center_y - suffix_galley.size().y * 0.5),
                                    suffix_galley,
                                    gh_text_muted,
                                );

                                // Small tab-indented filename below the title row
                                let disp_file = truncate_text(
                                    ui,
                                    &full_filename,
                                    FontId::proportional(10.5),
                                    (bar_left - row_rect.left() - 32.0).max(60.0),
                                );
                                ui.painter().text(
                                    Pos2::new(row_rect.left() + 24.0, row_rect.top() + 28.0),
                                    Align2::LEFT_CENTER,
                                    disp_file,
                                    FontId::proportional(10.5),
                                    cf_text_dim,
                                );

                                if link_resp.clicked() || play_resp.clicked() {
                                    if let Some(item) = items.iter().find(|item| item.fingerprint == session.fingerprint) {
                                        action = ShellAction::PlayMedia(std::path::PathBuf::from(&item.file_path));
                                    } else if let Some(first_item) = items.first() {
                                        action = ShellAction::PlayMedia(std::path::PathBuf::from(&first_item.file_path));
                                    }
                                }
                            }

                            ui.add_space(12.0);
                        }

                        // "Show more activity" full-width GitHub button
                        if total_groups > visible_groups {
                            ui.add_space(6.0);
                            let more_btn = egui::Button::new(
                                RichText::new("Show more activity")
                                    .size(12.5)
                                    .strong()
                                    .color(gh_link),
                            )
                            .fill(gh_card_bg)
                            .stroke(Stroke::new(1.0, gh_card_border))
                            .corner_radius(CornerRadius::same(6))
                            .min_size(Vec2::new(left_col_w, 34.0));
                            if ui.add(more_btn).clicked() {
                                visible_groups += 6;
                            }
                        }
                    }
                });

                // RIGHT COLUMN: GitHub Year Selector Rail (2026, 2025, 2024, 2023)
                if show_year_rail {
                    ui.add_space(rail_gap);
                    ui.allocate_ui_with_layout(Vec2::new(rail_w, 0.0), Layout::top_down(Align::Min), |ui| {
                        ui.set_width(rail_w);
                        for yr in years {
                            let is_active = selected_year == Some(yr);
                            let (yr_rect, yr_resp) = ui.allocate_exact_size(Vec2::new(rail_w, 32.0), Sense::click());
                            if yr_resp.hovered() {
                                ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                            }
                            let bg = if is_active {
                                gh_blue
                            } else if yr_resp.hovered() {
                                cf_surface_alt
                            } else {
                                Color32::TRANSPARENT
                            };
                            ui.painter().rect_filled(yr_rect, CornerRadius::same(16), bg);
                            ui.painter().text(
                                Pos2::new(yr_rect.left() + 14.0, yr_rect.center().y),
                                Align2::LEFT_CENTER,
                                yr.to_string(),
                                FontId::proportional(12.5),
                                if is_active { Color32::from_rgb(18, 18, 20) } else { gh_text_muted },
                            );
                            if yr_resp.clicked() {
                                if is_active {
                                    selected_year = None;
                                } else {
                                    selected_year = Some(yr);
                                }
                                state.history_selected_day = None;
                            }
                            ui.add_space(4.0);
                        }
                    });
                }
            });

            ui.data_mut(|d| {
                d.insert_temp(year_state_id, selected_year);
                d.insert_temp(limit_state_id, visible_groups);
            });
            ui.add_space(spacing::PAD_16);
                });
            });
        });

    action
}
