use crate::theme::ValorTheme;
use egui::{Align2, Color32, CornerRadius, Pos2, Rect, Sense, Stroke, Ui, Vec2};
use valor_core::models::{Collection, HistoryEntry, MediaItem};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DashboardTab {
    Home,
    Library,
    Collections,
    History,
    Scans,
    Settings,
}

#[derive(Debug, Clone, PartialEq)]
pub enum DashboardAction {
    PlayItem(MediaItem),
    ResumeHistory(HistoryEntry),
    PlayCollection(Collection),
    OpenFolderPicker,
    StartScan,
    SearchChanged(String),
    SwitchToPlayer,
}

pub struct DashboardState {
    pub current_tab: DashboardTab,
    pub search_query: String,
    pub filter_mode: usize, // 0 = All, 1 = In Progress, 2 = Unwatched
    pub selected_folder: Option<String>,
}

impl Default for DashboardState {
    fn default() -> Self {
        Self {
            current_tab: DashboardTab::Home,
            search_query: String::new(),
            filter_mode: 0,
            selected_folder: None,
        }
    }
}

pub fn render_dashboard(
    ui: &mut Ui,
    theme: &ValorTheme,
    screen_rect: Rect,
    items: &[MediaItem],
    collections: &[Collection],
    history: &[HistoryEntry],
    state: &mut DashboardState,
) -> Option<DashboardAction> {
    let mut action = None;

    // Background
    ui.painter()
        .rect_filled(screen_rect, CornerRadius::ZERO, theme.bg_color);

    // Top Navigation Bar
    let nav_height = 56.0;
    let nav_rect = Rect::from_min_size(screen_rect.min, Vec2::new(screen_rect.width(), nav_height));
    ui.painter()
        .rect_filled(nav_rect, CornerRadius::ZERO, theme.panel_bg);
    ui.painter().line_segment(
        [nav_rect.left_bottom(), nav_rect.right_bottom()],
        Stroke::new(1.0, theme.panel_border),
    );

    // Logo
    ui.painter().text(
        Pos2::new(nav_rect.min.x + 24.0, nav_rect.center().y),
        Align2::LEFT_CENTER,
        "VALOR",
        egui::FontId::proportional(18.0),
        theme.accent_amber,
    );

    // Tabs
    let tabs = [
        (DashboardTab::Home, "Home"),
        (DashboardTab::Library, "Library"),
        (DashboardTab::Collections, "Collections"),
        (DashboardTab::History, "History"),
        (DashboardTab::Scans, "Scans"),
        (DashboardTab::Settings, "Settings"),
    ];

    let mut tab_x = nav_rect.min.x + 120.0;
    for (tab, label) in tabs {
        let is_sel = state.current_tab == tab;
        let tab_w = 90.0;
        let t_rect = Rect::from_min_size(
            Pos2::new(tab_x, nav_rect.min.y + 12.0),
            Vec2::new(tab_w, 32.0),
        );

        let resp = ui.allocate_rect(t_rect, Sense::click());
        if resp.clicked() {
            state.current_tab = tab;
        }

        if is_sel {
            ui.painter().rect_filled(
                t_rect,
                CornerRadius::same(8),
                Color32::from_rgba_premultiplied(245, 158, 11, 35),
            );
        } else if resp.hovered() {
            ui.painter().rect_filled(
                t_rect,
                CornerRadius::same(8),
                Color32::from_rgba_premultiplied(255, 255, 255, 10),
            );
        }

        let text_color = if is_sel {
            theme.accent_amber
        } else {
            theme.text_muted
        };
        ui.painter().text(
            t_rect.center(),
            Align2::CENTER_CENTER,
            label,
            egui::FontId::proportional(13.0),
            text_color,
        );

        tab_x += tab_w + 6.0;
    }

    // Search bar on top right
    let search_w = 220.0;
    let search_rect = Rect::from_center_size(
        Pos2::new(nav_rect.max.x - search_w * 0.5 - 24.0, nav_rect.center().y),
        Vec2::new(search_w, 32.0),
    );
    ui.painter().rect_filled(
        search_rect,
        CornerRadius::same(8),
        Color32::from_rgba_premultiplied(255, 255, 255, 15),
    );
    ui.painter().rect_stroke(
        search_rect,
        CornerRadius::same(8),
        Stroke::new(1.0, theme.panel_border),
        egui::StrokeKind::Inside,
    );

    let query_display = if state.search_query.is_empty() {
        "🔍  Search library (/)"
    } else {
        &state.search_query
    };
    ui.painter().text(
        Pos2::new(search_rect.min.x + 12.0, search_rect.center().y),
        Align2::LEFT_CENTER,
        query_display,
        egui::FontId::proportional(12.0),
        if state.search_query.is_empty() {
            theme.text_muted
        } else {
            Color32::WHITE
        },
    );

    // Main Content Area
    let content_rect = Rect::from_min_size(
        Pos2::new(screen_rect.min.x + 24.0, nav_rect.max.y + 20.0),
        Vec2::new(
            screen_rect.width() - 48.0,
            screen_rect.height() - nav_rect.height() - 36.0,
        ),
    );

    match state.current_tab {
        DashboardTab::Home => {
            // "Continue where you left off" Hero Card (from prototype screenshot 4)
            if let Some(recent) = history.first() {
                let hero_w = (content_rect.width() * 0.6).min(560.0);
                let hero_rect = Rect::from_min_size(content_rect.min, Vec2::new(hero_w, 110.0));

                ui.painter().rect_filled(
                    hero_rect,
                    CornerRadius::same(14),
                    Color32::from_rgb(22, 27, 38),
                );
                ui.painter().rect_stroke(
                    hero_rect,
                    CornerRadius::same(14),
                    Stroke::new(1.0, Color32::from_rgba_premultiplied(245, 158, 11, 100)),
                    egui::StrokeKind::Inside,
                );

                // Indicator pip
                ui.painter().circle_filled(
                    Pos2::new(hero_rect.min.x + 20.0, hero_rect.min.y + 24.0),
                    4.0,
                    theme.accent_amber,
                );

                ui.painter().text(
                    Pos2::new(hero_rect.min.x + 34.0, hero_rect.min.y + 24.0),
                    Align2::LEFT_CENTER,
                    "Continue where you left off",
                    egui::FontId::proportional(14.0),
                    Color32::WHITE,
                );

                let sub_title = format!(
                    "{} ({})",
                    recent.current_item_title,
                    format_time(recent.position_secs)
                );
                ui.painter().text(
                    Pos2::new(hero_rect.min.x + 34.0, hero_rect.min.y + 48.0),
                    Align2::LEFT_CENTER,
                    sub_title,
                    egui::FontId::proportional(12.0),
                    theme.text_muted,
                );

                ui.painter().text(
                    Pos2::new(hero_rect.min.x + 34.0, hero_rect.min.y + 78.0),
                    Align2::LEFT_CENTER,
                    "💡 Native desktop player: zero permission dialogs, resumes instantly with real paths.",
                    egui::FontId::proportional(10.0),
                    theme.text_muted,
                );

                // Continue button
                let cont_rect = Rect::from_center_size(
                    Pos2::new(hero_rect.max.x - 70.0, hero_rect.min.y + 36.0),
                    Vec2::new(90.0, 32.0),
                );
                let cont_resp = ui.allocate_rect(cont_rect, Sense::click());
                let c_bg = if cont_resp.hovered() {
                    Color32::from_rgb(129, 140, 248)
                } else {
                    Color32::from_rgb(99, 102, 241)
                };
                ui.painter()
                    .rect_filled(cont_rect, CornerRadius::same(8), c_bg);
                ui.painter().text(
                    cont_rect.center(),
                    Align2::CENTER_CENTER,
                    "Continue",
                    egui::FontId::proportional(12.0),
                    Color32::WHITE,
                );

                if cont_resp.clicked() {
                    action = Some(DashboardAction::ResumeHistory(recent.clone()));
                }
            }

            // Playlist Cards Grid
            let grid_top = content_rect.min.y + 140.0;
            ui.painter().text(
                Pos2::new(content_rect.min.x, grid_top),
                Align2::LEFT_BOTTOM,
                format!("Playlists & Series ({})", collections.len()),
                egui::FontId::proportional(16.0),
                Color32::WHITE,
            );

            let card_w = 160.0;
            let card_h = 220.0;
            for (idx, coll) in collections.iter().enumerate() {
                let col_x = content_rect.min.x + idx as f32 * (card_w + 16.0);
                if col_x + card_w > content_rect.max.x {
                    break;
                }

                let card_rect = Rect::from_min_size(
                    Pos2::new(col_x, grid_top + 10.0),
                    Vec2::new(card_w, card_h),
                );
                let c_resp = ui.allocate_rect(card_rect, Sense::click());

                let bg = if c_resp.hovered() {
                    Color32::from_rgba_premultiplied(37, 99, 235, 30)
                } else {
                    Color32::from_rgb(22, 27, 38)
                };

                ui.painter()
                    .rect_filled(card_rect, CornerRadius::same(12), bg);
                ui.painter().rect_stroke(
                    card_rect,
                    CornerRadius::same(12),
                    Stroke::new(1.0, theme.panel_border),
                    egui::StrokeKind::Inside,
                );

                // Big Initial Icon
                let initial = coll.name.chars().next().unwrap_or('D').to_string();
                ui.painter().text(
                    Pos2::new(card_rect.center().x, card_rect.min.y + 80.0),
                    Align2::CENTER_CENTER,
                    initial,
                    egui::FontId::proportional(54.0),
                    theme.accent_amber,
                );

                // Play Button
                let play_rect = Rect::from_center_size(
                    Pos2::new(card_rect.max.x - 30.0, card_rect.min.y + 140.0),
                    Vec2::new(32.0, 32.0),
                );
                ui.painter()
                    .circle_filled(play_rect.center(), 16.0, theme.accent_amber);
                ui.painter().text(
                    play_rect.center(),
                    Align2::CENTER_CENTER,
                    "▶",
                    egui::FontId::proportional(13.0),
                    Color32::from_rgb(17, 24, 39),
                );

                // Title
                ui.painter().text(
                    Pos2::new(card_rect.min.x + 12.0, card_rect.min.y + 175.0),
                    Align2::LEFT_TOP,
                    &coll.name,
                    egui::FontId::proportional(13.0),
                    Color32::WHITE,
                );

                let sub = format!("{} tracks", coll.item_ids.len());
                ui.painter().text(
                    Pos2::new(card_rect.min.x + 12.0, card_rect.min.y + 195.0),
                    Align2::LEFT_TOP,
                    sub,
                    egui::FontId::proportional(11.0),
                    theme.text_muted,
                );

                if c_resp.clicked() {
                    action = Some(DashboardAction::PlayCollection(coll.clone()));
                }
            }
        }
        DashboardTab::Library => {
            // Virtualized Library Grid
            let card_w = 180.0;
            let card_h = 120.0;
            let cols = ((content_rect.width() + 16.0) / (card_w + 16.0)).floor() as usize;

            for (idx, item) in items.iter().enumerate() {
                let row = idx / cols.max(1);
                let col = idx % cols.max(1);
                let x = content_rect.min.x + col as f32 * (card_w + 16.0);
                let y = content_rect.min.y + row as f32 * (card_h + 16.0);

                if y + card_h > content_rect.max.y {
                    break; // Virtualized clip
                }

                let card_rect = Rect::from_min_size(Pos2::new(x, y), Vec2::new(card_w, card_h));
                let resp = ui.allocate_rect(card_rect, Sense::click());

                let bg = if resp.hovered() {
                    Color32::from_rgba_premultiplied(245, 158, 11, 20)
                } else {
                    Color32::from_rgb(22, 27, 38)
                };

                ui.painter()
                    .rect_filled(card_rect, CornerRadius::same(10), bg);
                ui.painter().rect_stroke(
                    card_rect,
                    CornerRadius::same(10),
                    Stroke::new(1.0, theme.panel_border),
                    egui::StrokeKind::Inside,
                );

                let title = if item.title.len() > 20 {
                    format!("{}…", &item.title[..20])
                } else {
                    item.title.clone()
                };

                ui.painter().text(
                    Pos2::new(card_rect.min.x + 12.0, card_rect.min.y + 14.0),
                    Align2::LEFT_TOP,
                    title,
                    egui::FontId::proportional(12.0),
                    Color32::WHITE,
                );

                let dur_str = format_time(item.duration);
                ui.painter().text(
                    Pos2::new(card_rect.min.x + 12.0, card_rect.min.y + 36.0),
                    Align2::LEFT_TOP,
                    dur_str,
                    egui::FontId::proportional(11.0),
                    theme.text_muted,
                );

                if item.is_hdr {
                    let badge = Rect::from_min_size(
                        Pos2::new(card_rect.min.x + 12.0, card_rect.max.y - 28.0),
                        Vec2::new(36.0, 16.0),
                    );
                    ui.painter().rect_filled(
                        badge,
                        CornerRadius::same(4),
                        Color32::from_rgba_premultiplied(245, 158, 11, 40),
                    );
                    ui.painter().text(
                        badge.center(),
                        Align2::CENTER_CENTER,
                        "HDR",
                        egui::FontId::proportional(9.0),
                        theme.accent_amber,
                    );
                }

                if resp.clicked() {
                    action = Some(DashboardAction::PlayItem(item.clone()));
                }
            }
        }
        DashboardTab::History => {
            // History List (matching screenshot 10)
            ui.painter().text(
                Pos2::new(content_rect.min.x, content_rect.min.y + 10.0),
                Align2::LEFT_TOP,
                "Playback History",
                egui::FontId::proportional(16.0),
                Color32::WHITE,
            );

            let row_h = 58.0;
            let list_y = content_rect.min.y + 40.0;

            for (idx, entry) in history.iter().enumerate() {
                let row_rect = Rect::from_min_size(
                    Pos2::new(content_rect.min.x, list_y + idx as f32 * (row_h + 8.0)),
                    Vec2::new(content_rect.width(), row_h),
                );

                if row_rect.max.y > content_rect.max.y {
                    break;
                }

                ui.painter().rect_filled(
                    row_rect,
                    CornerRadius::same(10),
                    Color32::from_rgb(22, 27, 38),
                );
                ui.painter().rect_stroke(
                    row_rect,
                    CornerRadius::same(10),
                    Stroke::new(1.0, theme.panel_border),
                    egui::StrokeKind::Inside,
                );

                // Initial Icon Box
                let icon_rect = Rect::from_center_size(
                    Pos2::new(row_rect.min.x + 34.0, row_rect.center().y),
                    Vec2::new(34.0, 34.0),
                );
                ui.painter().rect_filled(
                    icon_rect,
                    CornerRadius::same(8),
                    Color32::from_rgba_premultiplied(16, 185, 129, 30),
                );
                let init = entry
                    .collection_name
                    .chars()
                    .next()
                    .unwrap_or('D')
                    .to_string();
                ui.painter().text(
                    icon_rect.center(),
                    Align2::CENTER_CENTER,
                    init,
                    egui::FontId::proportional(15.0),
                    Color32::from_rgb(52, 211, 153),
                );

                // Title & metadata
                ui.painter().text(
                    Pos2::new(row_rect.min.x + 64.0, row_rect.min.y + 12.0),
                    Align2::LEFT_TOP,
                    &entry.collection_name,
                    egui::FontId::proportional(13.0),
                    Color32::WHITE,
                );

                let meta_str = format!(
                    "LOCAL • {} • {} watched",
                    entry.current_item_title,
                    format_time(entry.position_secs)
                );
                ui.painter().text(
                    Pos2::new(row_rect.min.x + 64.0, row_rect.min.y + 32.0),
                    Align2::LEFT_TOP,
                    meta_str,
                    egui::FontId::proportional(11.0),
                    theme.text_muted,
                );

                // Resume button
                let resume_rect = Rect::from_center_size(
                    Pos2::new(row_rect.max.x - 80.0, row_rect.center().y),
                    Vec2::new(90.0, 30.0),
                );
                let r_resp = ui.allocate_rect(resume_rect, Sense::click());
                let r_bg = if r_resp.hovered() {
                    Color32::from_rgb(129, 140, 248)
                } else {
                    Color32::from_rgb(99, 102, 241)
                };
                ui.painter()
                    .rect_filled(resume_rect, CornerRadius::same(6), r_bg);
                ui.painter().text(
                    resume_rect.center(),
                    Align2::CENTER_CENTER,
                    "▶ Resume",
                    egui::FontId::proportional(11.0),
                    Color32::WHITE,
                );

                if r_resp.clicked() {
                    action = Some(DashboardAction::ResumeHistory(entry.clone()));
                }
            }
        }
        DashboardTab::Scans => {
            ui.painter().text(
                Pos2::new(content_rect.min.x, content_rect.min.y + 10.0),
                Align2::LEFT_TOP,
                "Watched Folders & Library Scanner",
                egui::FontId::proportional(16.0),
                Color32::WHITE,
            );

            // Add folder button
            let add_rect = Rect::from_min_size(
                Pos2::new(content_rect.min.x, content_rect.min.y + 40.0),
                Vec2::new(140.0, 36.0),
            );
            if ui.allocate_rect(add_rect, Sense::click()).clicked() {
                action = Some(DashboardAction::OpenFolderPicker);
            }
            ui.painter()
                .rect_filled(add_rect, CornerRadius::same(8), theme.accent_amber);
            ui.painter().text(
                add_rect.center(),
                Align2::CENTER_CENTER,
                "+ Add Folder",
                egui::FontId::proportional(12.0),
                Color32::from_rgb(17, 24, 39),
            );

            // Scan Now button
            let scan_rect = Rect::from_min_size(
                Pos2::new(add_rect.max.x + 12.0, content_rect.min.y + 40.0),
                Vec2::new(120.0, 36.0),
            );
            if ui.allocate_rect(scan_rect, Sense::click()).clicked() {
                action = Some(DashboardAction::StartScan);
            }
            ui.painter().rect_filled(
                scan_rect,
                CornerRadius::same(8),
                Color32::from_rgba_premultiplied(255, 255, 255, 20),
            );
            ui.painter().text(
                scan_rect.center(),
                Align2::CENTER_CENTER,
                "⟳ Scan Now",
                egui::FontId::proportional(12.0),
                theme.text_primary,
            );
        }
        DashboardTab::Settings => {
            ui.painter().text(
                Pos2::new(content_rect.min.x, content_rect.min.y + 10.0),
                Align2::LEFT_TOP,
                "Application Settings & Keybindings",
                egui::FontId::proportional(16.0),
                Color32::WHITE,
            );

            let keys = [
                ("Space", "Play / Pause video"),
                (
                    "Hold G",
                    "Momentary timeline peek (shows large time readout)",
                ),
                ("Left / Right Arrow", "Seek 10 seconds backward / forward"),
                ("F", "Toggle borderless fullscreen"),
                ("M", "Toggle audio mute"),
                ("I", "Toggle video stats overlay"),
                ("D / E", "Frame step backward / forward"),
                (
                    "Right Click",
                    "Nested Context Menu with outside click containment",
                ),
            ];

            let start_y = content_rect.min.y + 50.0;
            for (idx, (k, desc)) in keys.iter().enumerate() {
                let y = start_y + idx as f32 * 32.0;
                let k_rect =
                    Rect::from_min_size(Pos2::new(content_rect.min.x, y), Vec2::new(130.0, 24.0));
                ui.painter().rect_filled(
                    k_rect,
                    CornerRadius::same(6),
                    Color32::from_rgba_premultiplied(255, 255, 255, 18),
                );
                ui.painter().text(
                    k_rect.center(),
                    Align2::CENTER_CENTER,
                    *k,
                    egui::FontId::proportional(11.0),
                    theme.accent_amber,
                );

                ui.painter().text(
                    Pos2::new(k_rect.max.x + 16.0, k_rect.center().y),
                    Align2::LEFT_CENTER,
                    *desc,
                    egui::FontId::proportional(12.0),
                    theme.text_primary,
                );
            }
        }
        _ => {}
    }

    action
}

fn format_time(secs: f64) -> String {
    if secs <= 0.0 || secs.is_nan() {
        return "00:00".to_string();
    }
    let total = secs as u64;
    let m = (total % 3600) / 60;
    let s = total % 60;
    let h = total / 3600;
    if h > 0 {
        format!("{}:{:02}:{:02}", h, m, s)
    } else {
        format!("{:02}:{:02}", m, s)
    }
}
