use crate::theme::ValorTheme;
use crate::view_models::{
    calculate_virtual_grid, filter_and_sort_movie_indices, group_and_filter_series,
    group_watch_sessions, resolve_next_episode_to_play, FilterPill, HdrFilter,
    LibraryTab, ResolutionFilter, SeriesSummary, SortOption, ViewMode,
};
use egui::{Align2, Color32, CornerRadius, Pos2, Rect, Sense, Stroke, Ui, Vec2};
use std::collections::HashMap;
use valor_core::models::{Collection, FolderRecord, HistoryEntry, MediaItem, PlaybackPosition, WatchSession};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DashboardTab {
    Home,
    Library,
    Collections,
    History,
    Scans,
    Stats,
    Settings,
}

#[derive(Debug, Clone, PartialEq)]
pub enum DashboardAction {
    PlayItem(MediaItem),
    ResumeHistory(HistoryEntry),
    ResumeSession(WatchSession),
    DeleteSession(String),
    PlayCollection(Collection),
    OpenFolderPicker,
    StartScan,
    PauseScan,
    CancelScan,
    SearchChanged(String),
    SwitchToPlayer,
    CreatePlaylist(String),
    RenameCollection(String, String),
    DeleteCollection(String),
    TogglePinCollection(String),
    ToggleFolderEnabled(String, bool),
    DeleteFolder(String),
    SetFolderType(String, String),
    LocateMissingFile(String),
    RemoveMissingItem(String),
    OpenPlaylistDrawer,
}

pub struct DashboardState {
    pub current_tab: DashboardTab,
    pub library_tab: LibraryTab,
    pub filter_pill: FilterPill,
    pub sort_option: SortOption,
    pub res_filter: ResolutionFilter,
    pub hdr_filter: HdrFilter,
    pub view_mode: ViewMode,
    pub search_query: String,
    pub search_focused: bool,
    pub scroll_offset_y: f32,
    pub selected_series: Option<String>,
    pub selected_season: u32,
    pub editing_collection_id: Option<String>,
    pub editing_collection_name: String,
    pub new_playlist_modal_open: bool,
    pub new_playlist_name: String,
    pub selected_folder: Option<String>,
    pub focus_index: Option<usize>,
    pub cached_filtered_movies: Vec<MediaItem>,
    pub cached_filtered_movie_indices: Vec<usize>,
    pub last_movies_key: Option<(FilterPill, SortOption, ResolutionFilter, HdrFilter, String, usize)>,
    pub cached_series_summaries: Vec<SeriesSummary>,
    pub last_series_key: Option<(FilterPill, SortOption, ResolutionFilter, HdrFilter, String, usize)>,
    pub cached_movies_count: usize,
    pub cached_series_count: usize,
    pub cached_counts_len: usize,
}

impl Default for DashboardState {
    fn default() -> Self {
        Self {
            current_tab: DashboardTab::Home,
            library_tab: LibraryTab::Movies,
            filter_pill: FilterPill::All,
            sort_option: SortOption::TitleAsc,
            res_filter: ResolutionFilter::All,
            hdr_filter: HdrFilter::All,
            view_mode: ViewMode::Grid,
            search_query: String::new(),
            search_focused: false,
            scroll_offset_y: 0.0,
            selected_series: None,
            selected_season: 1,
            editing_collection_id: None,
            editing_collection_name: String::new(),
            new_playlist_modal_open: false,
            new_playlist_name: String::new(),
            selected_folder: None,
            focus_index: None,
            cached_filtered_movies: Vec::new(),
            cached_filtered_movie_indices: Vec::new(),
            last_movies_key: None,
            cached_series_summaries: Vec::new(),
            last_series_key: None,
            cached_movies_count: 0,
            cached_series_count: 0,
            cached_counts_len: 0,
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
    watch_sessions: &[WatchSession],
    folders: &[FolderRecord],
    positions: &HashMap<String, PlaybackPosition>,
    storage_stats: &[(String, u64, usize)],
    state: &mut DashboardState,
) -> Option<DashboardAction> {
    let mut action = None;

    // Full screen canvas background
    ui.painter()
        .rect_filled(screen_rect, CornerRadius::ZERO, theme.bg_color);

    // Global Key Shortcut: "/" focuses the search bar
    if ui.input(|i| i.key_pressed(egui::Key::Slash)) && !state.search_focused {
        state.search_focused = true;
    }
    if ui.input(|i| i.key_pressed(egui::Key::Escape)) {
        if state.search_focused {
            state.search_focused = false;
        }
        if state.selected_series.is_some() {
            state.selected_series = None;
        }
    }

    // =========================================================================
    // 1. LEFT RAIL NAVIGATION
    // =========================================================================
    let rail_width = 72.0;
    let rail_rect = Rect::from_min_size(
        screen_rect.min,
        Vec2::new(rail_width, screen_rect.height()),
    );

    ui.painter()
        .rect_filled(rail_rect, CornerRadius::ZERO, theme.panel_bg);
    ui.painter().line_segment(
        [rail_rect.right_top(), rail_rect.right_bottom()],
        Stroke::new(1.0, theme.panel_border),
    );

    // Logo at top of left rail
    let logo_center = Pos2::new(rail_rect.center().x, rail_rect.min.y + 36.0);
    ui.painter().circle_filled(logo_center, 18.0, Color32::from_rgba_premultiplied(245, 158, 11, 40));
    ui.painter().text(
        logo_center,
        Align2::CENTER_CENTER,
        "V",
        egui::FontId::proportional(18.0),
        theme.accent_amber,
    );

    // Navigation Rail Buttons (Icons + Labels)
    let rail_items = [
        (DashboardTab::Home, "🏠", "Home"),
        (DashboardTab::Library, "🎬", "Library"),
        (DashboardTab::Collections, "📑", "Playlists"),
        (DashboardTab::History, "🕒", "History"),
        (DashboardTab::Scans, "📁", "Scans"),
        (DashboardTab::Stats, "📊", "Stats"),
        (DashboardTab::Settings, "⚙", "Settings"),
    ];

    let start_y = rail_rect.min.y + 80.0;
    for (idx, (tab, icon, label)) in rail_items.iter().enumerate() {
        let is_selected = state.current_tab == *tab;
        let btn_rect = Rect::from_center_size(
            Pos2::new(rail_rect.center().x, start_y + idx as f32 * 64.0),
            Vec2::new(56.0, 52.0),
        );

        let resp = ui.allocate_rect(btn_rect, Sense::click());
        if resp.clicked() {
            state.current_tab = *tab;
            state.selected_series = None; // Reset series detail when switching tabs
        }

        let (bg, border_color, icon_color) = if is_selected {
            (
                Color32::from_rgba_premultiplied(245, 158, 11, 35),
                theme.accent_amber,
                theme.accent_amber,
            )
        } else if resp.hovered() {
            (
                Color32::from_rgba_premultiplied(255, 255, 255, 12),
                Color32::TRANSPARENT,
                Color32::WHITE,
            )
        } else {
            (Color32::TRANSPARENT, Color32::TRANSPARENT, theme.text_muted)
        };

        ui.painter()
            .rect_filled(btn_rect, CornerRadius::same(10), bg);
        if is_selected {
            ui.painter().rect_stroke(
                btn_rect,
                CornerRadius::same(10),
                Stroke::new(1.5, border_color),
                egui::StrokeKind::Inside,
            );
        }

        // Icon
        ui.painter().text(
            Pos2::new(btn_rect.center().x, btn_rect.min.y + 16.0),
            Align2::CENTER_CENTER,
            *icon,
            egui::FontId::proportional(16.0),
            icon_color,
        );
        // Text
        ui.painter().text(
            Pos2::new(btn_rect.center().x, btn_rect.max.y - 12.0),
            Align2::CENTER_CENTER,
            *label,
            egui::FontId::proportional(10.0),
            icon_color,
        );
    }

    // Switch to Player Mini-Button at bottom of rail
    let player_btn_rect = Rect::from_center_size(
        Pos2::new(rail_rect.center().x, rail_rect.max.y - 40.0),
        Vec2::new(52.0, 36.0),
    );
    let p_resp = ui.allocate_rect(player_btn_rect, Sense::click());
    if p_resp.clicked() {
        action = Some(DashboardAction::SwitchToPlayer);
    }
    ui.painter().rect_filled(
        player_btn_rect,
        CornerRadius::same(8),
        if p_resp.hovered() {
            Color32::from_rgba_premultiplied(245, 158, 11, 40)
        } else {
            Color32::from_rgba_premultiplied(255, 255, 255, 10)
        },
    );
    ui.painter().text(
        player_btn_rect.center(),
        Align2::CENTER_CENTER,
        "▶ Player",
        egui::FontId::proportional(10.0),
        theme.accent_amber,
    );

    // =========================================================================
    // 2. TOP HEADER BAR
    // =========================================================================
    let top_bar_height = 60.0;
    let top_bar_rect = Rect::from_min_size(
        Pos2::new(rail_rect.max.x, screen_rect.min.y),
        Vec2::new(screen_rect.width() - rail_width, top_bar_height),
    );

    ui.painter()
        .rect_filled(top_bar_rect, CornerRadius::ZERO, theme.panel_bg);
    ui.painter().line_segment(
        [top_bar_rect.left_bottom(), top_bar_rect.right_bottom()],
        Stroke::new(1.0, theme.panel_border),
    );

    // Library Tabs & Filter Pills (Matching Screenshot 4)
    if state.cached_counts_len != items.len() || (state.cached_counts_len == 0 && !items.is_empty()) {
        let mut series_set = std::collections::HashSet::new();
        let mut movies = 0;
        for i in items {
            if let Some(s) = &i.series_id {
                series_set.insert(s.as_str());
            } else {
                movies += 1;
            }
        }
        state.cached_movies_count = movies;
        state.cached_series_count = series_set.len();
        state.cached_counts_len = items.len();
    }
    let movies_count = state.cached_movies_count;
    let series_count = state.cached_series_count;

    let mut left_pills_x = top_bar_rect.min.x + 24.0;

    // Movies (n) / Series (n) mode pills
    let lib_tabs = [
        (LibraryTab::Movies, format!("Movies {}", movies_count)),
        (LibraryTab::Series, format!("Series {}", series_count)),
    ];
    for (tab, label) in lib_tabs {
        let is_sel = state.library_tab == tab;
        let p_w = 90.0;
        let p_rect = Rect::from_min_size(
            Pos2::new(left_pills_x, top_bar_rect.min.y + 14.0),
            Vec2::new(p_w, 32.0),
        );
        let resp = ui.allocate_rect(p_rect, Sense::click());
        if resp.clicked() {
            state.library_tab = tab;
            state.current_tab = DashboardTab::Library;
        }
        let bg = if is_sel {
            Color32::from_rgb(37, 99, 235) // Deep blue selection pill (from Screenshot 4)
        } else if resp.hovered() {
            Color32::from_rgba_premultiplied(255, 255, 255, 15)
        } else {
            Color32::from_rgba_premultiplied(255, 255, 255, 6)
        };
        ui.painter()
            .rect_filled(p_rect, CornerRadius::same(16), bg);
        ui.painter().text(
            p_rect.center(),
            Align2::CENTER_CENTER,
            label,
            egui::FontId::proportional(12.0),
            Color32::WHITE,
        );
        left_pills_x += p_w + 10.0;
    }

    left_pills_x += 16.0;

    // Filter pills: All / In progress / Unwatched
    let filter_pills = [
        (FilterPill::All, "All"),
        (FilterPill::InProgress, "In progress"),
        (FilterPill::Unwatched, "Unwatched"),
    ];
    for (pill, label) in filter_pills {
        let is_sel = state.filter_pill == pill;
        let p_w = 80.0;
        let p_rect = Rect::from_min_size(
            Pos2::new(left_pills_x, top_bar_rect.min.y + 16.0),
            Vec2::new(p_w, 28.0),
        );
        let resp = ui.allocate_rect(p_rect, Sense::click());
        if resp.clicked() {
            state.filter_pill = pill;
        }
        let bg = if is_sel {
            Color32::from_rgba_premultiplied(245, 158, 11, 40)
        } else if resp.hovered() {
            Color32::from_rgba_premultiplied(255, 255, 255, 15)
        } else {
            Color32::TRANSPARENT
        };
        ui.painter()
            .rect_filled(p_rect, CornerRadius::same(14), bg);
        if is_sel {
            ui.painter().rect_stroke(
                p_rect,
                CornerRadius::same(14),
                Stroke::new(1.0, theme.accent_amber),
                egui::StrokeKind::Inside,
            );
        }
        ui.painter().text(
            p_rect.center(),
            Align2::CENTER_CENTER,
            label,
            egui::FontId::proportional(11.0),
            if is_sel {
                theme.accent_amber
            } else {
                theme.text_muted
            },
        );
        left_pills_x += p_w + 6.0;
    }

    // Top Right Controls: Search bar + New Playlist button
    let search_w = 260.0;
    let search_rect = Rect::from_center_size(
        Pos2::new(top_bar_rect.max.x - search_w * 0.5 - 140.0, top_bar_rect.center().y),
        Vec2::new(search_w, 34.0),
    );
    let s_resp = ui.allocate_rect(search_rect, Sense::click());
    if s_resp.clicked() {
        state.search_focused = true;
    }

    ui.painter().rect_filled(
        search_rect,
        CornerRadius::same(8),
        Color32::from_rgba_premultiplied(255, 255, 255, 14),
    );
    let s_stroke_color = if state.search_focused {
        theme.accent_amber
    } else {
        theme.panel_border
    };
    ui.painter().rect_stroke(
        search_rect,
        CornerRadius::same(8),
        Stroke::new(1.0, s_stroke_color),
        egui::StrokeKind::Inside,
    );

    let query_display = if state.search_query.is_empty() {
        "🔍  Search library ( / )"
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

    // "+ New Playlist" button (Screenshot 4)
    let new_pl_rect = Rect::from_center_size(
        Pos2::new(top_bar_rect.max.x - 70.0, top_bar_rect.center().y),
        Vec2::new(110.0, 32.0),
    );
    let npl_resp = ui.allocate_rect(new_pl_rect, Sense::click());
    if npl_resp.clicked() {
        state.new_playlist_modal_open = true;
    }
    ui.painter().rect_filled(
        new_pl_rect,
        CornerRadius::same(8),
        if npl_resp.hovered() {
            Color32::from_rgba_premultiplied(37, 99, 235, 180)
        } else {
            Color32::from_rgba_premultiplied(37, 99, 235, 120)
        },
    );
    ui.painter().text(
        new_pl_rect.center(),
        Align2::CENTER_CENTER,
        "+ New Playlist",
        egui::FontId::proportional(11.0),
        Color32::WHITE,
    );

    // =========================================================================
    // 3. MAIN CONTENT VIEW AREA
    // =========================================================================
    let content_rect = Rect::from_min_size(
        Pos2::new(rail_rect.max.x + 24.0, top_bar_rect.max.y + 16.0),
        Vec2::new(
            screen_rect.width() - rail_width - 48.0,
            screen_rect.height() - top_bar_height - 24.0,
        ),
    );

    // First Run Empty State Check
    if items.is_empty() && state.current_tab != DashboardTab::Scans && state.current_tab != DashboardTab::Settings {
        render_first_run_empty_state(ui, theme, content_rect, &mut action);
        return action;
    }

    match state.current_tab {
        DashboardTab::Home => {
            render_home_tab(
                ui,
                theme,
                content_rect,
                history,
                collections,
                items,
                positions,
                &mut action,
            );
        }
        DashboardTab::Library => {
            if let Some(ref sid) = state.selected_series {
                let series_list = group_and_filter_series(
                    items,
                    positions,
                    FilterPill::All,
                    SortOption::TitleAsc,
                    ResolutionFilter::All,
                    HdrFilter::All,
                    "",
                );
                if let Some(summary) = series_list.into_iter().find(|s| &s.series_id == sid) {
                    render_series_detail_view(ui, theme, content_rect, &summary, positions, state, &mut action);
                } else {
                    state.selected_series = None;
                }
            } else {
                render_library_tab(ui, theme, content_rect, items, positions, state, &mut action);
            }
        }
        DashboardTab::Collections => {
            render_collections_tab(ui, theme, content_rect, collections, items, state, &mut action);
        }
        DashboardTab::History => {
            render_history_tab(ui, theme, content_rect, watch_sessions, &mut action);
        }
        DashboardTab::Scans => {
            render_scans_tab(ui, theme, content_rect, folders, items.len(), &mut action);
        }
        DashboardTab::Stats => {
            render_stats_tab(ui, theme, content_rect, items, watch_sessions, storage_stats);
        }
        DashboardTab::Settings => {
            render_settings_tab(ui, theme, content_rect);
        }
    }

    // Modal: Create New Playlist
    if state.new_playlist_modal_open {
        render_create_playlist_modal(ui, theme, screen_rect, state, &mut action);
    }

    action
}

// =============================================================================
// SUB-VIEWS IMPLEMENTATIONS
// =============================================================================

fn render_first_run_empty_state(
    ui: &mut Ui,
    theme: &ValorTheme,
    rect: Rect,
    action: &mut Option<DashboardAction>,
) {
    let card_w = 480.0;
    let card_h = 240.0;
    let card_rect = Rect::from_center_size(rect.center(), Vec2::new(card_w, card_h));

    ui.painter().rect_filled(
        card_rect,
        CornerRadius::same(16),
        Color32::from_rgb(22, 27, 38),
    );
    ui.painter().rect_stroke(
        card_rect,
        CornerRadius::same(16),
        Stroke::new(1.0, theme.panel_border),
        egui::StrokeKind::Inside,
    );

    ui.painter().text(
        Pos2::new(card_rect.center().x, card_rect.min.y + 40.0),
        Align2::CENTER_CENTER,
        "Welcome to Valor",
        egui::FontId::proportional(22.0),
        theme.accent_amber,
    );

    ui.painter().text(
        Pos2::new(card_rect.center().x, card_rect.min.y + 75.0),
        Align2::CENTER_CENTER,
        "No media files scanned yet. Add your video folder to build your local library.",
        egui::FontId::proportional(13.0),
        theme.text_muted,
    );

    let add_rect = Rect::from_center_size(
        Pos2::new(card_rect.center().x, card_rect.min.y + 140.0),
        Vec2::new(160.0, 42.0),
    );
    let resp = ui.allocate_rect(add_rect, Sense::click());
    if resp.clicked() {
        *action = Some(DashboardAction::OpenFolderPicker);
    }
    ui.painter().rect_filled(
        add_rect,
        CornerRadius::same(10),
        if resp.hovered() {
            Color32::from_rgb(245, 158, 11)
        } else {
            Color32::from_rgb(217, 119, 6)
        },
    );
    ui.painter().text(
        add_rect.center(),
        Align2::CENTER_CENTER,
        "📁 Add a Folder",
        egui::FontId::proportional(14.0),
        Color32::from_rgb(17, 24, 39),
    );
}

fn render_home_tab(
    ui: &mut Ui,
    theme: &ValorTheme,
    rect: Rect,
    history: &[HistoryEntry],
    collections: &[Collection],
    items: &[MediaItem],
    _positions: &HashMap<String, PlaybackPosition>,
    action: &mut Option<DashboardAction>,
) {
    let mut curr_y = rect.min.y;

    // 1. "Continue where you left off" Hero Card (from prototype screenshot 4)
    if let Some(recent) = history.first() {
        let hero_w = rect.width().min(640.0);
        let hero_rect = Rect::from_min_size(Pos2::new(rect.min.x, curr_y), Vec2::new(hero_w, 110.0));

        ui.painter().rect_filled(
            hero_rect,
            CornerRadius::same(14),
            Color32::from_rgb(22, 27, 38),
        );
        ui.painter().rect_stroke(
            hero_rect,
            CornerRadius::same(14),
            Stroke::new(1.0, Color32::from_rgba_premultiplied(245, 158, 11, 120)),
            egui::StrokeKind::Inside,
        );

        // Red/amber indicator pill
        ui.painter().rect_filled(
            Rect::from_min_size(
                Pos2::new(hero_rect.min.x + 18.0, hero_rect.min.y + 18.0),
                Vec2::new(4.0, 16.0),
            ),
            CornerRadius::same(2),
            Color32::from_rgb(239, 68, 68),
        );

        ui.painter().text(
            Pos2::new(hero_rect.min.x + 30.0, hero_rect.min.y + 26.0),
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
            Pos2::new(hero_rect.min.x + 30.0, hero_rect.min.y + 50.0),
            Align2::LEFT_CENTER,
            sub_title,
            egui::FontId::proportional(12.0),
            theme.text_muted,
        );

        ui.painter().text(
            Pos2::new(hero_rect.min.x + 30.0, hero_rect.min.y + 80.0),
            Align2::LEFT_CENTER,
            "💡 Native desktop player: zero permission dialogs, resumes instantly with real paths.",
            egui::FontId::proportional(10.0),
            theme.text_muted,
        );

        // Continue Button (Purple)
        let cont_rect = Rect::from_center_size(
            Pos2::new(hero_rect.max.x - 140.0, hero_rect.min.y + 36.0),
            Vec2::new(90.0, 32.0),
        );
        let cont_resp = ui.allocate_rect(cont_rect, Sense::click());
        ui.painter().rect_filled(
            cont_rect,
            CornerRadius::same(8),
            if cont_resp.hovered() {
                Color32::from_rgb(129, 140, 248)
            } else {
                Color32::from_rgb(99, 102, 241)
            },
        );
        ui.painter().text(
            cont_rect.center(),
            Align2::CENTER_CENTER,
            "Continue",
            egui::FontId::proportional(12.0),
            Color32::WHITE,
        );
        if cont_resp.clicked() {
            *action = Some(DashboardAction::ResumeHistory(recent.clone()));
        }

        // Playlist Button
        let pl_rect = Rect::from_center_size(
            Pos2::new(hero_rect.max.x - 45.0, hero_rect.min.y + 36.0),
            Vec2::new(80.0, 32.0),
        );
        let pl_resp = ui.allocate_rect(pl_rect, Sense::click());
        ui.painter().rect_filled(
            pl_rect,
            CornerRadius::same(8),
            if pl_resp.hovered() {
                Color32::from_rgba_premultiplied(255, 255, 255, 25)
            } else {
                Color32::from_rgba_premultiplied(255, 255, 255, 12)
            },
        );
        let pl_label = format!("Playlist ({})", recent.total_items);
        ui.painter().text(
            pl_rect.center(),
            Align2::CENTER_CENTER,
            pl_label,
            egui::FontId::proportional(11.0),
            Color32::WHITE,
        );
        if pl_resp.clicked() {
            *action = Some(DashboardAction::OpenPlaylistDrawer);
        }

        curr_y += 130.0;
    }

    // 2. Playlists Shelf (Matching Screenshot 4)
    ui.painter().text(
        Pos2::new(rect.min.x, curr_y + 10.0),
        Align2::LEFT_BOTTOM,
        format!("{} Playlists", collections.len()),
        egui::FontId::proportional(15.0),
        Color32::WHITE,
    );

    let card_w = 150.0;
    let card_h = 200.0;
    let shelf_y = curr_y + 18.0;

    for (idx, coll) in collections.iter().enumerate() {
        let col_x = rect.min.x + idx as f32 * (card_w + 16.0);
        if col_x + card_w > rect.max.x {
            break;
        }

        let card_rect = Rect::from_min_size(Pos2::new(col_x, shelf_y), Vec2::new(card_w, card_h));
        let c_resp = ui.allocate_rect(card_rect, Sense::click());

        let bg = if c_resp.hovered() {
            Color32::from_rgba_premultiplied(37, 99, 235, 35)
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

        // Tracks count badge on top left
        let badge_rect = Rect::from_min_size(
            Pos2::new(card_rect.min.x + 10.0, card_rect.min.y + 10.0),
            Vec2::new(60.0, 18.0),
        );
        ui.painter().rect_filled(
            badge_rect,
            CornerRadius::same(4),
            Color32::from_rgba_premultiplied(0, 0, 0, 120),
        );
        ui.painter().text(
            badge_rect.center(),
            Align2::CENTER_CENTER,
            format!("📑 {} tracks", coll.item_ids.len()),
            egui::FontId::proportional(9.0),
            Color32::WHITE,
        );

        // Big Letter Initial Avatar
        let initial = coll.name.chars().next().unwrap_or('D').to_string();
        ui.painter().text(
            Pos2::new(card_rect.center().x, card_rect.min.y + 80.0),
            Align2::CENTER_CENTER,
            initial,
            egui::FontId::proportional(48.0),
            theme.accent_amber,
        );

        // Hover Play Overlay Circle
        let play_circle = Rect::from_center_size(
            Pos2::new(card_rect.max.x - 26.0, card_rect.min.y + 120.0),
            Vec2::new(32.0, 32.0),
        );
        ui.painter().circle_filled(
            play_circle.center(),
            16.0,
            if c_resp.hovered() {
                theme.accent_amber
            } else {
                Color32::from_rgba_premultiplied(245, 158, 11, 160)
            },
        );
        ui.painter().text(
            play_circle.center(),
            Align2::CENTER_CENTER,
            "▶",
            egui::FontId::proportional(13.0),
            Color32::from_rgb(17, 24, 39),
        );

        // Title and Updated Date
        ui.painter().text(
            Pos2::new(card_rect.min.x + 12.0, card_rect.min.y + 152.0),
            Align2::LEFT_TOP,
            &coll.name,
            egui::FontId::proportional(13.0),
            Color32::WHITE,
        );
        let date_str = coll
            .last_played_at
            .map(|dt| format!("Updated {}", dt.format("%d/%m/%Y")))
            .unwrap_or_else(|| "Updated recently".to_string());
        ui.painter().text(
            Pos2::new(card_rect.min.x + 12.0, card_rect.min.y + 172.0),
            Align2::LEFT_TOP,
            date_str,
            egui::FontId::proportional(10.0),
            theme.text_muted,
        );

        if c_resp.clicked() {
            *action = Some(DashboardAction::PlayCollection(coll.clone()));
        }
    }

    curr_y += 240.0;

    // 3. Recently Added Shelf
    ui.painter().text(
        Pos2::new(rect.min.x, curr_y + 10.0),
        Align2::LEFT_BOTTOM,
        "Recently Added",
        egui::FontId::proportional(15.0),
        Color32::WHITE,
    );

    let rec_w = 170.0;
    let rec_h = 110.0;
    let rec_y = curr_y + 18.0;

    for (idx, item) in items.iter().take(6).enumerate() {
        let col_x = rect.min.x + idx as f32 * (rec_w + 14.0);
        if col_x + rec_w > rect.max.x {
            break;
        }

        let item_rect = Rect::from_min_size(Pos2::new(col_x, rec_y), Vec2::new(rec_w, rec_h));
        let i_resp = ui.allocate_rect(item_rect, Sense::click());

        let bg = if i_resp.hovered() {
            Color32::from_rgba_premultiplied(245, 158, 11, 20)
        } else {
            Color32::from_rgb(22, 27, 38)
        };
        ui.painter()
            .rect_filled(item_rect, CornerRadius::same(10), bg);
        ui.painter().rect_stroke(
            item_rect,
            CornerRadius::same(10),
            Stroke::new(1.0, theme.panel_border),
            egui::StrokeKind::Inside,
        );

        let title = if item.title.len() > 22 {
            format!("{}…", &item.title[..22])
        } else {
            item.title.clone()
        };
        ui.painter().text(
            Pos2::new(item_rect.min.x + 10.0, item_rect.min.y + 12.0),
            Align2::LEFT_TOP,
            title,
            egui::FontId::proportional(11.0),
            Color32::WHITE,
        );

        ui.painter().text(
            Pos2::new(item_rect.min.x + 10.0, item_rect.min.y + 34.0),
            Align2::LEFT_TOP,
            format_time(item.duration),
            egui::FontId::proportional(10.0),
            theme.text_muted,
        );

        if item.is_hdr {
            let hdr_badge = Rect::from_min_size(
                Pos2::new(item_rect.min.x + 10.0, item_rect.max.y - 24.0),
                Vec2::new(34.0, 14.0),
            );
            ui.painter().rect_filled(
                hdr_badge,
                CornerRadius::same(3),
                Color32::from_rgba_premultiplied(245, 158, 11, 40),
            );
            ui.painter().text(
                hdr_badge.center(),
                Align2::CENTER_CENTER,
                "HDR",
                egui::FontId::proportional(8.0),
                theme.accent_amber,
            );
        }

        if i_resp.clicked() {
            *action = Some(DashboardAction::PlayItem(item.clone()));
        }
    }
}

fn render_library_tab(
    ui: &mut Ui,
    theme: &ValorTheme,
    rect: Rect,
    items: &[MediaItem],
    positions: &HashMap<String, PlaybackPosition>,
    state: &mut DashboardState,
    action: &mut Option<DashboardAction>,
) {
    match state.library_tab {
        LibraryTab::Movies => {
            let key = (
                state.filter_pill,
                state.sort_option,
                state.res_filter,
                state.hdr_filter,
                state.search_query.clone(),
                items.len(),
            );
            if state.last_movies_key.as_ref() != Some(&key) {
                state.cached_filtered_movie_indices = filter_and_sort_movie_indices(
                    items,
                    positions,
                    state.filter_pill,
                    state.sort_option,
                    state.res_filter,
                    state.hdr_filter,
                    &state.search_query,
                );
                state.last_movies_key = Some(key);
            }
            let filtered_indices = &state.cached_filtered_movie_indices;

            let card_w = 180.0;
            let card_h = 130.0;
            let spacing = 16.0;
            let cols = ((rect.width() + spacing) / (card_w + spacing)).floor() as usize;
            let cols = cols.max(1);

            let virtual_range = calculate_virtual_grid(
                filtered_indices.len(),
                cols,
                card_h,
                spacing,
                state.scroll_offset_y,
                rect.height(),
            );

            // Render visible cards in virtual slice
            for idx in virtual_range.start_index..virtual_range.end_index {
                let row = idx / cols;
                let col = idx % cols;
                let x = rect.min.x + col as f32 * (card_w + spacing);
                let y = rect.min.y + row as f32 * (card_h + spacing) - state.scroll_offset_y;

                if y + card_h < rect.min.y || y > rect.max.y {
                    continue; // Skip out of viewport
                }

                let item = &items[filtered_indices[idx]];
                let card_rect = Rect::from_min_size(Pos2::new(x, y), Vec2::new(card_w, card_h));
                let resp = ui.allocate_rect(card_rect, Sense::click());

                let bg = if resp.hovered() {
                    Color32::from_rgba_premultiplied(245, 158, 11, 25)
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

                // Title
                let title = if item.title.len() > 22 {
                    format!("{}…", &item.title[..22])
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

                // Duration
                ui.painter().text(
                    Pos2::new(card_rect.min.x + 12.0, card_rect.min.y + 36.0),
                    Align2::LEFT_TOP,
                    format_time(item.duration),
                    egui::FontId::proportional(11.0),
                    theme.text_muted,
                );

                // Badges
                let mut badge_x = card_rect.min.x + 12.0;
                if item.is_hdr {
                    let b = Rect::from_min_size(Pos2::new(badge_x, card_rect.max.y - 28.0), Vec2::new(34.0, 16.0));
                    ui.painter().rect_filled(b, CornerRadius::same(4), Color32::from_rgba_premultiplied(245, 158, 11, 40));
                    ui.painter().text(b.center(), Align2::CENTER_CENTER, "HDR", egui::FontId::proportional(9.0), theme.accent_amber);
                    badge_x += 40.0;
                }
                if item.is_missing {
                    let b = Rect::from_min_size(Pos2::new(badge_x, card_rect.max.y - 28.0), Vec2::new(56.0, 16.0));
                    ui.painter().rect_filled(b, CornerRadius::same(4), Color32::from_rgba_premultiplied(239, 68, 68, 60));
                    ui.painter().text(b.center(), Align2::CENTER_CENTER, "MISSING", egui::FontId::proportional(8.0), Color32::from_rgb(252, 165, 165));
                }

                // Progress Bar at bottom of card
                if let Some(pos) = positions.get(&item.fingerprint) {
                    let ratio = (pos.position_secs / item.duration.max(1.0)).clamp(0.0, 1.0) as f32;
                    let p_bar = Rect::from_min_size(
                        Pos2::new(card_rect.min.x, card_rect.max.y - 3.0),
                        Vec2::new(card_w * ratio, 3.0),
                    );
                    ui.painter().rect_filled(p_bar, CornerRadius::ZERO, theme.accent_amber);
                }

                if resp.clicked() {
                    *action = Some(DashboardAction::PlayItem(item.clone()));
                }
            }
        }
        LibraryTab::Series => {
            let key = (
                state.filter_pill,
                state.sort_option,
                state.res_filter,
                state.hdr_filter,
                state.search_query.clone(),
                items.len(),
            );
            if state.last_series_key.as_ref() != Some(&key) {
                state.cached_series_summaries = group_and_filter_series(
                    items,
                    positions,
                    state.filter_pill,
                    state.sort_option,
                    state.res_filter,
                    state.hdr_filter,
                    &state.search_query,
                );
                state.last_series_key = Some(key);
            }
            let series_list = &state.cached_series_summaries;

            let card_w = 180.0;
            let card_h = 160.0;
            let spacing = 16.0;
            let cols = ((rect.width() + spacing) / (card_w + spacing)).floor() as usize;
            let cols = cols.max(1);

            let virtual_range = calculate_virtual_grid(
                series_list.len(),
                cols,
                card_h,
                spacing,
                state.scroll_offset_y,
                rect.height(),
            );

            for idx in virtual_range.start_index..virtual_range.end_index {
                let row = idx / cols;
                let col = idx % cols;
                let x = rect.min.x + col as f32 * (card_w + spacing);
                let y = rect.min.y + row as f32 * (card_h + spacing) - state.scroll_offset_y;

                if y + card_h < rect.min.y || y > rect.max.y {
                    continue;
                }
                let series = &series_list[idx];

                let card_rect = Rect::from_min_size(Pos2::new(x, y), Vec2::new(card_w, card_h));
                let resp = ui.allocate_rect(card_rect, Sense::click());

                let bg = if resp.hovered() {
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

                // Initial Icon Box
                let icon_box = Rect::from_center_size(
                    Pos2::new(card_rect.center().x, card_rect.min.y + 45.0),
                    Vec2::new(50.0, 50.0),
                );
                ui.painter().rect_filled(
                    icon_box,
                    CornerRadius::same(10),
                    Color32::from_rgba_premultiplied(16, 185, 129, 30),
                );
                let init = series.title.chars().next().unwrap_or('S').to_string();
                ui.painter().text(
                    icon_box.center(),
                    Align2::CENTER_CENTER,
                    init,
                    egui::FontId::proportional(24.0),
                    Color32::from_rgb(52, 211, 153),
                );

                // Title
                let title = if series.title.len() > 20 {
                    format!("{}…", &series.title[..20])
                } else {
                    series.title.clone()
                };
                ui.painter().text(
                    Pos2::new(card_rect.center().x, card_rect.min.y + 90.0),
                    Align2::CENTER_CENTER,
                    title,
                    egui::FontId::proportional(13.0),
                    Color32::WHITE,
                );

                // Metadata: "S1 • 8 Episodes"
                let meta = format!(
                    "{} Season{} · {} Eps",
                    series.season_count,
                    if series.season_count > 1 { "s" } else { "" },
                    series.episode_count
                );
                ui.painter().text(
                    Pos2::new(card_rect.center().x, card_rect.min.y + 115.0),
                    Align2::CENTER_CENTER,
                    meta,
                    egui::FontId::proportional(11.0),
                    theme.text_muted,
                );

                // Progress Bar
                let ratio = (series.watched_count as f32 / series.episode_count.max(1) as f32).clamp(0.0, 1.0);
                let p_bar = Rect::from_min_size(
                    Pos2::new(card_rect.min.x, card_rect.max.y - 3.0),
                    Vec2::new(card_w * ratio, 3.0),
                );
                ui.painter()
                    .rect_filled(p_bar, CornerRadius::ZERO, theme.accent_amber);

                if resp.clicked() {
                    state.selected_series = Some(series.series_id.clone());
                    state.selected_season = 1;
                }
            }
        }
    }
}

fn render_series_detail_view(
    ui: &mut Ui,
    theme: &ValorTheme,
    rect: Rect,
    series: &SeriesSummary,
    positions: &HashMap<String, PlaybackPosition>,
    state: &mut DashboardState,
    action: &mut Option<DashboardAction>,
) {
    // Back Button
    let back_rect = Rect::from_min_size(rect.min, Vec2::new(120.0, 32.0));
    let b_resp = ui.allocate_rect(back_rect, Sense::click());
    if b_resp.clicked() {
        state.selected_series = None;
    }
    ui.painter().text(
        back_rect.center(),
        Align2::CENTER_CENTER,
        "← Back to Series",
        egui::FontId::proportional(12.0),
        theme.accent_amber,
    );

    // Series Header
    let header_y = rect.min.y + 44.0;
    ui.painter().text(
        Pos2::new(rect.min.x, header_y),
        Align2::LEFT_TOP,
        &series.title,
        egui::FontId::proportional(22.0),
        Color32::WHITE,
    );

    let meta = format!(
        "{} Season{} · {} Episodes · {} Watched",
        series.season_count,
        if series.season_count > 1 { "s" } else { "" },
        series.episode_count,
        series.watched_count
    );
    ui.painter().text(
        Pos2::new(rect.min.x, header_y + 32.0),
        Align2::LEFT_TOP,
        meta,
        egui::FontId::proportional(12.0),
        theme.text_muted,
    );

    // "Play next episode" button
    let next_rect = Rect::from_min_size(
        Pos2::new(rect.max.x - 170.0, header_y + 10.0),
        Vec2::new(170.0, 38.0),
    );
    let n_resp = ui.allocate_rect(next_rect, Sense::click());
    ui.painter().rect_filled(
        next_rect,
        CornerRadius::same(10),
        if n_resp.hovered() {
            Color32::from_rgb(129, 140, 248)
        } else {
            Color32::from_rgb(99, 102, 241)
        },
    );
    ui.painter().text(
        next_rect.center(),
        Align2::CENTER_CENTER,
        "▶ Play Next Episode",
        egui::FontId::proportional(12.0),
        Color32::WHITE,
    );
    if n_resp.clicked() {
        if let Some(next_ep) = resolve_next_episode_to_play(series, positions) {
            *action = Some(DashboardAction::PlayItem(next_ep));
        }
    }

    // Episode List for Season
    let mut ep_y = header_y + 80.0;
    for ep in &series.episodes {
        let ep_rect = Rect::from_min_size(Pos2::new(rect.min.x, ep_y), Vec2::new(rect.width(), 48.0));
        let resp = ui.allocate_rect(ep_rect, Sense::click());

        let bg = if resp.hovered() {
            Color32::from_rgba_premultiplied(255, 255, 255, 12)
        } else {
            Color32::from_rgb(22, 27, 38)
        };
        ui.painter()
            .rect_filled(ep_rect, CornerRadius::same(8), bg);

        let ep_tag = format!(
            "S{:02}E{:02}",
            ep.season_number.unwrap_or(1),
            ep.episode_number.unwrap_or(1)
        );
        ui.painter().text(
            Pos2::new(ep_rect.min.x + 16.0, ep_rect.center().y),
            Align2::LEFT_CENTER,
            ep_tag,
            egui::FontId::proportional(12.0),
            theme.accent_amber,
        );

        ui.painter().text(
            Pos2::new(ep_rect.min.x + 85.0, ep_rect.center().y),
            Align2::LEFT_CENTER,
            &ep.title,
            egui::FontId::proportional(12.0),
            Color32::WHITE,
        );

        ui.painter().text(
            Pos2::new(ep_rect.max.x - 70.0, ep_rect.center().y),
            Align2::RIGHT_CENTER,
            format_time(ep.duration),
            egui::FontId::proportional(11.0),
            theme.text_muted,
        );

        if resp.clicked() {
            *action = Some(DashboardAction::PlayItem(ep.clone()));
        }

        ep_y += 56.0;
    }
}

fn render_collections_tab(
    ui: &mut Ui,
    theme: &ValorTheme,
    rect: Rect,
    collections: &[Collection],
    _items: &[MediaItem],
    _state: &mut DashboardState,
    action: &mut Option<DashboardAction>,
) {
    ui.painter().text(
        Pos2::new(rect.min.x, rect.min.y + 10.0),
        Align2::LEFT_TOP,
        format!("Playlists & Collections ({})", collections.len()),
        egui::FontId::proportional(16.0),
        Color32::WHITE,
    );

    let card_w = 200.0;
    let card_h = 130.0;
    let spacing = 16.0;
    let cols = ((rect.width() + spacing) / (card_w + spacing)).floor() as usize;
    let cols = cols.max(1);

    for (idx, coll) in collections.iter().enumerate() {
        let row = idx / cols;
        let col = idx % cols;
        let x = rect.min.x + col as f32 * (card_w + spacing);
        let y = rect.min.y + 44.0 + row as f32 * (card_h + spacing);

        let card_rect = Rect::from_min_size(Pos2::new(x, y), Vec2::new(card_w, card_h));
        let resp = ui.allocate_rect(card_rect, Sense::click());

        let bg = if resp.hovered() {
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

        // Title
        ui.painter().text(
            Pos2::new(card_rect.min.x + 14.0, card_rect.min.y + 16.0),
            Align2::LEFT_TOP,
            &coll.name,
            egui::FontId::proportional(14.0),
            Color32::WHITE,
        );

        // Track count
        ui.painter().text(
            Pos2::new(card_rect.min.x + 14.0, card_rect.min.y + 42.0),
            Align2::LEFT_TOP,
            format!("{} tracks", coll.item_ids.len()),
            egui::FontId::proportional(11.0),
            theme.text_muted,
        );

        // Actions: Pin and Delete buttons
        let pin_btn = Rect::from_center_size(
            Pos2::new(card_rect.max.x - 45.0, card_rect.max.y - 25.0),
            Vec2::new(28.0, 28.0),
        );
        if ui.allocate_rect(pin_btn, Sense::click()).clicked() {
            *action = Some(DashboardAction::TogglePinCollection(coll.id.clone()));
        }
        ui.painter().text(
            pin_btn.center(),
            Align2::CENTER_CENTER,
            if coll.is_pinned { "📌" } else { "📍" },
            egui::FontId::proportional(12.0),
            if coll.is_pinned {
                theme.accent_amber
            } else {
                theme.text_muted
            },
        );

        let del_btn = Rect::from_center_size(
            Pos2::new(card_rect.max.x - 18.0, card_rect.max.y - 25.0),
            Vec2::new(28.0, 28.0),
        );
        if ui.allocate_rect(del_btn, Sense::click()).clicked() {
            *action = Some(DashboardAction::DeleteCollection(coll.id.clone()));
        }
        ui.painter().text(
            del_btn.center(),
            Align2::CENTER_CENTER,
            "🗑",
            egui::FontId::proportional(11.0),
            Color32::from_rgb(239, 68, 68),
        );

        if resp.clicked() {
            *action = Some(DashboardAction::PlayCollection(coll.clone()));
        }
    }
}

fn render_history_tab(
    ui: &mut Ui,
    theme: &ValorTheme,
    rect: Rect,
    watch_sessions: &[WatchSession],
    action: &mut Option<DashboardAction>,
) {
    let groups = group_watch_sessions(watch_sessions);

    let mut curr_y = rect.min.y;

    for group in groups {
        // Group Header (Matching Screenshot 9: "Today 20 Nov 2026" on left, "1h 36m · 6 sessions" on right)
        ui.painter().text(
            Pos2::new(rect.min.x, curr_y + 12.0),
            Align2::LEFT_TOP,
            &group.date_label,
            egui::FontId::proportional(14.0),
            Color32::WHITE,
        );

        ui.painter().text(
            Pos2::new(rect.max.x - 20.0, curr_y + 12.0),
            Align2::RIGHT_TOP,
            &group.aggregate_label,
            egui::FontId::proportional(12.0),
            theme.text_muted,
        );

        curr_y += 38.0;

        // Session rows
        let row_h = 56.0;
        for sess in group.sessions {
            let row_rect = Rect::from_min_size(Pos2::new(rect.min.x, curr_y), Vec2::new(rect.width(), row_h));
            let r_resp = ui.allocate_rect(row_rect, Sense::click());

            let bg = if r_resp.hovered() {
                Color32::from_rgba_premultiplied(255, 255, 255, 8)
            } else {
                Color32::from_rgb(22, 27, 38)
            };
            ui.painter()
                .rect_filled(row_rect, CornerRadius::same(10), bg);
            ui.painter().rect_stroke(
                row_rect,
                CornerRadius::same(10),
                Stroke::new(1.0, theme.panel_border),
                egui::StrokeKind::Inside,
            );

            // Initial Avatar box (Green background from Screenshot 9)
            let icon_rect = Rect::from_center_size(
                Pos2::new(row_rect.min.x + 32.0, row_rect.center().y),
                Vec2::new(32.0, 32.0),
            );
            ui.painter().rect_filled(
                icon_rect,
                CornerRadius::same(8),
                Color32::from_rgba_premultiplied(16, 185, 129, 35),
            );
            let init = sess.item_title.chars().next().unwrap_or('D').to_string();
            ui.painter().text(
                icon_rect.center(),
                Align2::CENTER_CENTER,
                init,
                egui::FontId::proportional(14.0),
                Color32::from_rgb(52, 211, 153),
            );

            // Title
            ui.painter().text(
                Pos2::new(row_rect.min.x + 64.0, row_rect.min.y + 12.0),
                Align2::LEFT_TOP,
                &sess.item_title,
                egui::FontId::proportional(13.0),
                Color32::WHITE,
            );

            // Badges row: LOCAL (cyan border) + Episode tag + Watched duration + Stopped early
            let mut badge_x = row_rect.min.x + 64.0;
            let local_rect = Rect::from_min_size(Pos2::new(badge_x, row_rect.min.y + 32.0), Vec2::new(48.0, 16.0));
            ui.painter().rect_stroke(
                local_rect,
                CornerRadius::same(4),
                Stroke::new(1.0, Color32::from_rgb(6, 182, 212)),
                egui::StrokeKind::Inside,
            );
            ui.painter().text(
                local_rect.center(),
                Align2::CENTER_CENTER,
                "LOCAL",
                egui::FontId::proportional(9.0),
                Color32::from_rgb(6, 182, 212),
            );
            badge_x += 54.0;

            let dur_watched = (sess.end_pos_secs - sess.start_pos_secs).abs().max(1.0);
            let watched_str = format!(
                "{} · {} watched",
                format_time(sess.start_pos_secs),
                crate::view_models::format_duration_short(dur_watched)
            );
            ui.painter().text(
                Pos2::new(badge_x, row_rect.min.y + 33.0),
                Align2::LEFT_TOP,
                watched_str,
                egui::FontId::proportional(11.0),
                theme.text_muted,
            );
            badge_x += 140.0;

            if sess.stopped_early {
                let stopped_rect = Rect::from_min_size(Pos2::new(badge_x, row_rect.min.y + 32.0), Vec2::new(80.0, 16.0));
                ui.painter().rect_filled(
                    stopped_rect,
                    CornerRadius::same(4),
                    Color32::from_rgba_premultiplied(255, 255, 255, 15),
                );
                ui.painter().text(
                    stopped_rect.center(),
                    Align2::CENTER_CENTER,
                    "Stopped early",
                    egui::FontId::proportional(9.0),
                    theme.text_muted,
                );
            }

            // Resume button
            let resume_rect = Rect::from_center_size(
                Pos2::new(row_rect.max.x - 90.0, row_rect.center().y),
                Vec2::new(85.0, 28.0),
            );
            let res_resp = ui.allocate_rect(resume_rect, Sense::click());
            ui.painter().rect_filled(
                resume_rect,
                CornerRadius::same(6),
                if res_resp.hovered() {
                    Color32::from_rgb(129, 140, 248)
                } else {
                    Color32::from_rgb(99, 102, 241)
                },
            );
            ui.painter().text(
                resume_rect.center(),
                Align2::CENTER_CENTER,
                "▶ Resume",
                egui::FontId::proportional(11.0),
                Color32::WHITE,
            );
            if res_resp.clicked() {
                *action = Some(DashboardAction::ResumeSession(sess.clone()));
            }

            // Remove button
            let del_rect = Rect::from_center_size(
                Pos2::new(row_rect.max.x - 25.0, row_rect.center().y),
                Vec2::new(24.0, 24.0),
            );
            if ui.allocate_rect(del_rect, Sense::click()).clicked() {
                *action = Some(DashboardAction::DeleteSession(sess.id.clone()));
            }
            ui.painter().text(
                del_rect.center(),
                Align2::CENTER_CENTER,
                "✕",
                egui::FontId::proportional(12.0),
                theme.text_muted,
            );

            curr_y += 64.0;
        }

        curr_y += 16.0;
    }
}

fn render_scans_tab(
    ui: &mut Ui,
    theme: &ValorTheme,
    rect: Rect,
    folders: &[FolderRecord],
    total_files: usize,
    action: &mut Option<DashboardAction>,
) {
    ui.painter().text(
        Pos2::new(rect.min.x, rect.min.y + 10.0),
        Align2::LEFT_TOP,
        "Watched Folders & Library Scanner",
        egui::FontId::proportional(16.0),
        Color32::WHITE,
    );

    // Control buttons: Add folder, Scan Now
    let add_rect = Rect::from_min_size(
        Pos2::new(rect.min.x, rect.min.y + 40.0),
        Vec2::new(140.0, 36.0),
    );
    if ui.allocate_rect(add_rect, Sense::click()).clicked() {
        *action = Some(DashboardAction::OpenFolderPicker);
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

    let scan_rect = Rect::from_min_size(
        Pos2::new(add_rect.max.x + 12.0, rect.min.y + 40.0),
        Vec2::new(120.0, 36.0),
    );
    if ui.allocate_rect(scan_rect, Sense::click()).clicked() {
        *action = Some(DashboardAction::StartScan);
    }
    ui.painter().rect_filled(
        scan_rect,
        CornerRadius::same(8),
        Color32::from_rgba_premultiplied(255, 255, 255, 18),
    );
    ui.painter().text(
        scan_rect.center(),
        Align2::CENTER_CENTER,
        "⟳ Scan Now",
        egui::FontId::proportional(12.0),
        Color32::WHITE,
    );

    // Folders List
    let mut list_y = rect.min.y + 95.0;
    ui.painter().text(
        Pos2::new(rect.min.x, list_y),
        Align2::LEFT_TOP,
        format!("Configured Scan Roots ({})", folders.len()),
        egui::FontId::proportional(13.0),
        theme.text_muted,
    );

    list_y += 24.0;
    for folder in folders {
        let f_rect = Rect::from_min_size(Pos2::new(rect.min.x, list_y), Vec2::new(rect.width(), 48.0));
        ui.painter().rect_filled(
            f_rect,
            CornerRadius::same(8),
            Color32::from_rgb(22, 27, 38),
        );
        ui.painter().rect_stroke(
            f_rect,
            CornerRadius::same(8),
            Stroke::new(1.0, theme.panel_border),
            egui::StrokeKind::Inside,
        );

        ui.painter().text(
            Pos2::new(f_rect.min.x + 16.0, f_rect.center().y),
            Align2::LEFT_CENTER,
            &folder.path,
            egui::FontId::proportional(12.0),
            Color32::WHITE,
        );

        let type_badge = Rect::from_center_size(
            Pos2::new(f_rect.max.x - 140.0, f_rect.center().y),
            Vec2::new(75.0, 22.0),
        );
        ui.painter().rect_filled(
            type_badge,
            CornerRadius::same(4),
            Color32::from_rgba_premultiplied(245, 158, 11, 30),
        );
        ui.painter().text(
            type_badge.center(),
            Align2::CENTER_CENTER,
            &folder.folder_type,
            egui::FontId::proportional(10.0),
            theme.accent_amber,
        );

        // Delete button
        let del_btn = Rect::from_center_size(
            Pos2::new(f_rect.max.x - 30.0, f_rect.center().y),
            Vec2::new(28.0, 28.0),
        );
        if ui.allocate_rect(del_btn, Sense::click()).clicked() {
            *action = Some(DashboardAction::DeleteFolder(folder.id.clone()));
        }
        ui.painter().text(
            del_btn.center(),
            Align2::CENTER_CENTER,
            "🗑",
            egui::FontId::proportional(12.0),
            Color32::from_rgb(239, 68, 68),
        );

        list_y += 56.0;
    }

    // Live Progress Summary
    list_y += 20.0;
    let prog_card = Rect::from_min_size(Pos2::new(rect.min.x, list_y), Vec2::new(rect.width(), 80.0));
    ui.painter().rect_filled(
        prog_card,
        CornerRadius::same(12),
        Color32::from_rgb(22, 27, 38),
    );
    ui.painter().rect_stroke(
        prog_card,
        CornerRadius::same(12),
        Stroke::new(1.0, theme.panel_border),
        egui::StrokeKind::Inside,
    );

    ui.painter().text(
        Pos2::new(prog_card.min.x + 20.0, prog_card.min.y + 20.0),
        Align2::LEFT_TOP,
        "Scanner Engine Status: Ready / Idle",
        egui::FontId::proportional(13.0),
        Color32::WHITE,
    );

    let stats_text = format!(
        "Total Indexed Files: {} · SQLite WAL Active · Instant FTS5 Search Enabled",
        total_files
    );
    ui.painter().text(
        Pos2::new(prog_card.min.x + 20.0, prog_card.min.y + 44.0),
        Align2::LEFT_TOP,
        stats_text,
        egui::FontId::proportional(11.0),
        theme.text_muted,
    );
}

fn render_stats_tab(
    ui: &mut Ui,
    theme: &ValorTheme,
    rect: Rect,
    items: &[MediaItem],
    watch_sessions: &[WatchSession],
    storage_stats: &[(String, u64, usize)],
) {
    ui.painter().text(
        Pos2::new(rect.min.x, rect.min.y + 10.0),
        Align2::LEFT_TOP,
        "Library & Playback Statistics",
        egui::FontId::proportional(16.0),
        Color32::WHITE,
    );

    let total_watch_secs: f64 = watch_sessions
        .iter()
        .map(|s| (s.end_pos_secs - s.start_pos_secs).abs().max(1.0))
        .sum();

    let card_w = 220.0;
    let card_h = 100.0;
    let mut card_x = rect.min.x;
    let card_y = rect.min.y + 44.0;

    let stat_cards = [
        ("Total Watch Time", crate::view_models::format_duration_short(total_watch_secs)),
        ("Indexed Media Files", items.len().to_string()),
        ("Completed Sessions", watch_sessions.iter().filter(|s| s.completed).count().to_string()),
    ];

    for (label, val) in stat_cards {
        let c_rect = Rect::from_min_size(Pos2::new(card_x, card_y), Vec2::new(card_w, card_h));
        ui.painter().rect_filled(c_rect, CornerRadius::same(12), Color32::from_rgb(22, 27, 38));
        ui.painter().rect_stroke(c_rect, CornerRadius::same(12), Stroke::new(1.0, theme.panel_border), egui::StrokeKind::Inside);

        ui.painter().text(
            Pos2::new(c_rect.center().x, c_rect.min.y + 26.0),
            Align2::CENTER_CENTER,
            label,
            egui::FontId::proportional(12.0),
            theme.text_muted,
        );

        ui.painter().text(
            Pos2::new(c_rect.center().x, c_rect.min.y + 60.0),
            Align2::CENTER_CENTER,
            val,
            egui::FontId::proportional(22.0),
            theme.accent_amber,
        );

        card_x += card_w + 16.0;
    }

    // Storage breakdown
    let table_y = card_y + 130.0;
    ui.painter().text(
        Pos2::new(rect.min.x, table_y),
        Align2::LEFT_TOP,
        "Storage Usage by Folder",
        egui::FontId::proportional(14.0),
        Color32::WHITE,
    );

    let mut row_y = table_y + 26.0;
    for (folder, bytes, count) in storage_stats {
        let r_rect = Rect::from_min_size(Pos2::new(rect.min.x, row_y), Vec2::new(rect.width(), 38.0));
        ui.painter().rect_filled(r_rect, CornerRadius::same(6), Color32::from_rgb(22, 27, 38));

        ui.painter().text(
            Pos2::new(r_rect.min.x + 14.0, r_rect.center().y),
            Align2::LEFT_CENTER,
            folder,
            egui::FontId::proportional(11.0),
            Color32::WHITE,
        );

        let gb = *bytes as f64 / (1024.0 * 1024.0 * 1024.0);
        let stat_str = format!("{:.2} GB · {} files", gb, count);
        ui.painter().text(
            Pos2::new(r_rect.max.x - 14.0, r_rect.center().y),
            Align2::RIGHT_CENTER,
            stat_str,
            egui::FontId::proportional(11.0),
            theme.accent_amber,
        );

        row_y += 44.0;
    }
}

fn render_settings_tab(ui: &mut Ui, theme: &ValorTheme, rect: Rect) {
    ui.painter().text(
        Pos2::new(rect.min.x, rect.min.y + 10.0),
        Align2::LEFT_TOP,
        "Application Settings & Keybindings",
        egui::FontId::proportional(16.0),
        Color32::WHITE,
    );

    let keys = [
        ("Space", "Play / Pause video"),
        ("Hold G", "Momentary timeline peek (shows large time readout)"),
        ("Left / Right Arrow", "Seek 10 seconds backward / forward"),
        ("Up / Down Arrow", "Adjust audio volume ±5%"),
        ("F", "Toggle borderless fullscreen"),
        ("M", "Toggle audio mute"),
        ("I", "Toggle video stats overlay (frame time, drop counters)"),
        ("D / E", "Frame step backward / forward (exact video frame)"),
        ("Tab", "Cycle compare mode / Hold Tab to compare enhancements"),
        ("/", "Focus library search bar"),
        ("Right Click", "Nested Context Menu with outside click containment"),
    ];

    let start_y = rect.min.y + 50.0;
    for (idx, (k, desc)) in keys.iter().enumerate() {
        let y = start_y + idx as f32 * 34.0;
        let k_rect = Rect::from_min_size(Pos2::new(rect.min.x, y), Vec2::new(140.0, 24.0));
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

fn render_create_playlist_modal(
    ui: &mut Ui,
    theme: &ValorTheme,
    screen_rect: Rect,
    state: &mut DashboardState,
    action: &mut Option<DashboardAction>,
) {
    // Backdrop
    ui.painter().rect_filled(
        screen_rect,
        CornerRadius::ZERO,
        Color32::from_rgba_premultiplied(0, 0, 0, 160),
    );

    let modal_w = 380.0;
    let modal_h = 180.0;
    let modal_rect = Rect::from_center_size(screen_rect.center(), Vec2::new(modal_w, modal_h));

    ui.painter().rect_filled(modal_rect, CornerRadius::same(14), Color32::from_rgb(22, 27, 38));
    ui.painter().rect_stroke(modal_rect, CornerRadius::same(14), Stroke::new(1.0, theme.panel_border), egui::StrokeKind::Inside);

    ui.painter().text(
        Pos2::new(modal_rect.min.x + 24.0, modal_rect.min.y + 24.0),
        Align2::LEFT_TOP,
        "New Playlist",
        egui::FontId::proportional(16.0),
        Color32::WHITE,
    );

    // Close X
    let close_btn = Rect::from_center_size(Pos2::new(modal_rect.max.x - 24.0, modal_rect.min.y + 24.0), Vec2::new(24.0, 24.0));
    if ui.allocate_rect(close_btn, Sense::click()).clicked() {
        state.new_playlist_modal_open = false;
    }
    ui.painter().text(close_btn.center(), Align2::CENTER_CENTER, "✕", egui::FontId::proportional(12.0), theme.text_muted);

    // Text field
    let input_rect = Rect::from_min_size(Pos2::new(modal_rect.min.x + 24.0, modal_rect.min.y + 60.0), Vec2::new(modal_w - 48.0, 36.0));
    ui.painter().rect_filled(input_rect, CornerRadius::same(8), Color32::from_rgba_premultiplied(255, 255, 255, 12));
    ui.painter().rect_stroke(input_rect, CornerRadius::same(8), Stroke::new(1.0, theme.accent_amber), egui::StrokeKind::Inside);

    let display_name = if state.new_playlist_name.is_empty() {
        "Playlist Name"
    } else {
        &state.new_playlist_name
    };
    ui.painter().text(
        Pos2::new(input_rect.min.x + 12.0, input_rect.center().y),
        Align2::LEFT_CENTER,
        display_name,
        egui::FontId::proportional(12.0),
        if state.new_playlist_name.is_empty() { theme.text_muted } else { Color32::WHITE },
    );

    // Create Button
    let btn_rect = Rect::from_min_size(Pos2::new(modal_rect.max.x - 130.0, modal_rect.max.y - 48.0), Vec2::new(106.0, 32.0));
    let resp = ui.allocate_rect(btn_rect, Sense::click());
    ui.painter().rect_filled(btn_rect, CornerRadius::same(8), theme.accent_amber);
    ui.painter().text(btn_rect.center(), Align2::CENTER_CENTER, "Create", egui::FontId::proportional(12.0), Color32::from_rgb(17, 24, 39));

    if resp.clicked() {
        let name = if state.new_playlist_name.trim().is_empty() {
            "New Playlist".to_string()
        } else {
            state.new_playlist_name.trim().to_string()
        };
        *action = Some(DashboardAction::CreatePlaylist(name));
        state.new_playlist_name.clear();
        state.new_playlist_modal_open = false;
    }
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
