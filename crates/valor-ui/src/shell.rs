use crate::icons::IconRegistry;
use crate::layout;
use crate::shell_state::{
    ActivePopupMenu, FolderTreeNode, GalleryLayout, NavItem, ProgressFilter, ShellState, SortField,
    TileSize,
};
use crate::shell_tokens::{dimensions, radii, spacing, typography, ShellTokens};
use egui::{
    vec2, Align, Align2, Color32, CornerRadius, CursorIcon, FontId, Key, Layout, Pos2, Rect, Sense,
    Stroke, StrokeKind, Ui,
};
use std::path::PathBuf;
use valor_core::models::{HistoryEntry, MediaItem};

/// Action emitted by the shell to be handled by the application runner
#[derive(Debug, Clone, PartialEq)]
pub enum ShellAction {
    None,
    CloseWindow,
    PlayMedia(PathBuf),
    EnqueueMedia(Vec<PathBuf>),
    PlayMediaFromMiniBar {
        path: PathBuf,
        start_secs: f64,
        audio_only: bool,
    },
    OpenWithApp(PathBuf),
    MinimizeWindow,
    ToggleMaximizeWindow,
    AddFolderPicker,
    ExcludeSubfolderPicker,
    SelectNav(NavItem),
    SelectFolder(PathBuf),
    RescanFolder(PathBuf),
    LocateFolder(PathBuf),
    RemoveFolder(PathBuf),
    ExcludeSubfolder(PathBuf),
    IncludeSubfolder(PathBuf),
    ScanFolder(PathBuf),
    ScanAllFolders,
    OpenInExplorer(PathBuf),
    ToggleSubfolders(PathBuf),
    Search(String),
    ClearHistory { reset_positions: bool },
    DeleteHistorySession(String),
    OpenFilePicker,
    OpenMultipleFilesPicker,
    OpenFolderPicker,
    OpenDiscDialog,
    OpenNetworkStreamDialog,
    OpenCaptureDeviceDialog,
    OpenLocationFromClipboard,
    SavePlaylistToFile,
    ConvertSaveDialog,
    StreamDialog,
    ToggleQuitAtEndOfPlaylist,
    LoadSkinPicker,
    ResetSkin,
    StartTraktDeviceAuth,
    PollTraktDeviceToken,
    DisconnectTrakt,
    CreatePlaylist(String),
    DeletePlaylist(String),
    AddToPlaylist { playlist_id: String, item_path: String },
    RemoveFromPlaylist { playlist_id: String, item_id: String },
    PlayPlaylist(String),
    OpenAddToPlaylistModal(String),
}

/// The App Shell renderer
pub struct ShellRenderer<'a> {
    pub tokens: &'a ShellTokens,
    pub icons: &'a IconRegistry,
}

#[derive(Clone)]
struct FlatTreeNode {
    name: String,
    path: PathBuf,
    depth: usize,
    is_expanded: bool,
    is_missing: bool,
    has_subfolders: bool,
}

fn flatten_tree(nodes: &[FolderTreeNode]) -> Vec<FlatTreeNode> {
    fn append(nodes: &[FolderTreeNode], depth: usize, output: &mut Vec<FlatTreeNode>) {
        for node in nodes {
            output.push(FlatTreeNode {
                name: node.name.clone(),
                path: node.path.clone(),
                depth,
                is_expanded: node.is_expanded,
                is_missing: node.is_missing,
                has_subfolders: node.has_subfolders,
            });
            if node.is_expanded {
                append(&node.children, depth + 1, output);
            }
        }
    }
    let mut rows = Vec::new();
    append(nodes, 0, &mut rows);
    rows
}

fn format_gallery_duration(seconds: f64) -> String {
    let seconds = seconds as u64;
    let hours = seconds / 3600;
    let minutes = (seconds % 3600) / 60;
    let secs = seconds % 60;
    if hours > 0 {
        format!("{hours}:{minutes:02}:{secs:02}")
    } else {
        format!("{minutes:02}:{secs:02}")
    }
}

pub(crate) fn paint_curved_skip_arrow(
    painter: &egui::Painter,
    center: Pos2,
    radius: f32,
    forward: bool,
    label: &str,
    color: Color32,
) {
    use std::f32::consts::PI;
    // Top-half curved arc (like Image 3: <-arc-> above the number)
    let steps = 14;
    let arc_center = Pos2::new(center.x, center.y - 1.0);
    let (start_a, end_a) = if forward {
        (-PI * 0.82, -PI * 0.18)
    } else {
        (-PI * 0.18, -PI * 0.82)
    };
    let mut pts = Vec::with_capacity(steps + 1);
    for i in 0..=steps {
        let t = i as f32 / steps as f32;
        let a = start_a + (end_a - start_a) * t;
        pts.push(Pos2::new(arc_center.x + radius * a.cos(), arc_center.y + radius * a.sin()));
    }
    painter.add(egui::Shape::line(pts.clone(), Stroke::new(1.7, color)));
    if let Some(&tip) = pts.last() {
        let head = 3.5;
        if forward {
            painter.line_segment([tip, Pos2::new(tip.x - head, tip.y - 1.2)], Stroke::new(1.7, color));
            painter.line_segment([tip, Pos2::new(tip.x - 0.5, tip.y - head)], Stroke::new(1.7, color));
        } else {
            painter.line_segment([tip, Pos2::new(tip.x + head, tip.y - 1.2)], Stroke::new(1.7, color));
            painter.line_segment([tip, Pos2::new(tip.x + 0.5, tip.y - head)], Stroke::new(1.7, color));
        }
    }
    painter.text(
        Pos2::new(center.x, center.y + 3.5),
        Align2::CENTER_CENTER,
        label,
        FontId::proportional(9.5),
        color,
    );
}

pub fn format_file_size(bytes: u64) -> String {
    if bytes >= 1024 * 1024 * 1024 {
        format!("{:.1} GB", bytes as f64 / (1024.0 * 1024.0 * 1024.0))
    } else if bytes >= 1024 * 1024 {
        format!("{:.0} MB", bytes as f64 / (1024.0 * 1024.0))
    } else if bytes > 0 {
        format!("{} KB", bytes / 1024)
    } else {
        String::new()
    }
}

fn format_resolution(width: Option<u32>, height: Option<u32>) -> &'static str {
    match height.or(width) {
        Some(h) if h >= 2160 => "4K",
        Some(h) if h >= 1440 => "1440p",
        Some(h) if h >= 1080 => "1080p",
        Some(h) if h >= 720 => "720p",
        Some(h) if h >= 480 => "480p",
        _ => "HD",
    }
}

fn extract_year_from_path(path: &str) -> Option<String> {
    let fname = std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(path);
    for token in fname.split(|c: char| !c.is_ascii_digit()) {
        if token.len() == 4 {
            if let Ok(y) = token.parse::<u32>() {
                if (1920..=2035).contains(&y) {
                    return Some(token.to_string());
                }
            }
        }
    }
    None
}

fn format_home_title(item: &MediaItem) -> String {
    let mut title = item.title.trim().to_string();
    if let (Some(s), Some(e)) = (item.season_number, item.episode_number) {
        let tag = format!("S{s:02}E{e:02}");
        if !title.to_uppercase().contains(&tag) {
            title.push(' ');
            title.push_str(&tag);
        }
    } else if let Some(y_str) = extract_year_from_path(&item.file_path) {
        if !title.contains(&y_str) {
            title.push_str(&format!(" ({y_str})"));
        }
    }
    title
}

impl<'a> ShellRenderer<'a> {
    pub fn new(tokens: &'a ShellTokens, icons: &'a IconRegistry) -> Self {
        Self { tokens, icons }
    }

    /// Render only the native-style title bar so existing full-page views can
    /// share the same spacing and working window controls as the new shell.
    pub fn show_titlebar(&self, ui: &mut Ui, state: &mut ShellState) -> ShellAction {
        let rect = ui.max_rect();
        let titlebar =
            Rect::from_min_size(rect.min, vec2(rect.width(), dimensions::TITLEBAR_HEIGHT));
        let action = self.render_titlebar(ui, titlebar, state);
        ui.painter().hline(
            rect.x_range(),
            rect.min.y + dimensions::TITLEBAR_HEIGHT,
            Stroke::new(1.0, self.tokens.divider),
        );
        action
    }

    /// Render the entire shell frame into egui::Ui
    pub fn show(
        &self,
        ui: &mut Ui,
        state: &mut ShellState,
        total_videos: usize,
        _total_photos: usize,
    ) -> ShellAction {
        let mut textures = crate::texture_cache::LruTextureCache::new();
        self.show_with_data(
            ui,
            state,
            total_videos,
            0,
            &[],
            &[],
            &[],
            &std::collections::HashMap::new(),
            &mut textures,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn show_with_data(
        &self,
        ui: &mut Ui,
        state: &mut ShellState,
        total_videos: usize,
        _total_photos: usize,
        items: &[MediaItem],
        history: &[HistoryEntry],
        sessions: &[valor_core::models::WatchSession],
        positions: &std::collections::HashMap<String, valor_core::models::PlaybackPosition>,
        textures: &mut crate::texture_cache::LruTextureCache,
    ) -> ShellAction {
        state.poll_worker();

        let mut action = ShellAction::None;
        let available_rect = ui.max_rect();
        if available_rect.width() < 960.0 {
            state.is_nav_collapsed = true;
        }

        // 1. Fill entire window canvas with window_bg
        ui.painter()
            .rect_filled(available_rect, CornerRadius::ZERO, self.tokens.chrome_bg);

        // Handle global search focus shortcut '/'
        if ui.input(|i| i.key_pressed(Key::Slash) && !state.search_focused) {
            state.request_search_focus = true;
        }

        // Close popups on Esc
        if ui.input(|i| i.key_pressed(Key::Escape)) {
            state.close_popup();
            state.context_menu = None;
        }

        // 2. Title Bar (40px)
        let titlebar_rect = Rect::from_min_size(
            available_rect.min,
            vec2(available_rect.width(), dimensions::TITLEBAR_HEIGHT),
        );
        let titlebar_action = self.render_titlebar(ui, titlebar_rect, state);
        if titlebar_action != ShellAction::None {
            action = titlebar_action;
        }

        // Find latest Continue Watching item (prefer latest WatchSession, fall back to HistoryEntry)
        let mini_bar_item: Option<(f64, f64, &MediaItem)> = sessions
            .iter()
            .filter(|s| {
                let low = s.item_title.to_lowercase();
                !low.contains("$recycle.bin") && !low.starts_with("$r")
            })
            .find_map(|s| {
                if state.mini_bar_dismissed_fingerprint.as_deref() == Some(&s.fingerprint) {
                    return None;
                }
                items
                    .iter()
                    .find(|item| {
                        item.fingerprint == s.fingerprint
                            && !item.file_path.is_empty()
                            && !item.is_missing
                    })
                    .map(|item| {
                        let pos = positions
                            .get(&item.fingerprint)
                            .map(|p| p.position_secs)
                            .unwrap_or(s.end_pos_secs);
                        let dur = item
                            .duration
                            .max(positions.get(&item.fingerprint).map(|p| p.duration_secs).unwrap_or(0.0))
                            .max(s.end_pos_secs);
                        (pos, dur, item)
                    })
            })
            .or_else(|| {
                history
                    .iter()
                    .filter(|e| {
                        let s = e.collection_name.to_lowercase();
                        !s.contains("$recycle.bin") && !s.starts_with("$r")
                    })
                    .find_map(|entry| {
                        if state.mini_bar_dismissed_fingerprint.as_deref() == Some(&entry.current_item_fingerprint) {
                            return None;
                        }
                        items
                            .iter()
                            .find(|item| {
                                item.fingerprint == entry.current_item_fingerprint
                                    && !item.file_path.is_empty()
                                    && !item.is_missing
                            })
                            .map(|item| (entry.position_secs, entry.duration_secs.max(item.duration), item))
                    })
            });
        let mini_bar_h = if mini_bar_item.is_some() { 72.0 } else { 0.0 };
        let body_bottom = available_rect.max.y - mini_bar_h;

        // Body area below titlebar and above Continue Watching bar
        let body_top = available_rect.min.y + dimensions::TITLEBAR_HEIGHT;
        let body_rect = Rect::from_min_max(
            Pos2::new(available_rect.min.x, body_top),
            Pos2::new(available_rect.max.x, body_bottom),
        );

        // 3. Left Navigation Rail
        let current_nav_w = if state.is_nav_collapsed {
            dimensions::NAV_WIDTH_COLLAPSED
        } else {
            state.nav_width
        };
        let nav_rect = Rect::from_min_size(body_rect.min, vec2(current_nav_w, body_rect.height()));

        let nav_action = self.render_sidebar(ui, nav_rect, state);
        if nav_action != ShellAction::None {
            action = nav_action;
        }

        // Nav Resizer Handle (if not collapsed)
        if !state.is_nav_collapsed {
            let resizer_rect = Rect::from_min_size(
                Pos2::new(nav_rect.max.x - 2.0, nav_rect.min.y),
                vec2(4.0, nav_rect.height()),
            );
            let resizer_resp = ui.allocate_rect(resizer_rect, Sense::click_and_drag());
            if resizer_resp.hovered() || resizer_resp.dragged() {
                ui.ctx().set_cursor_icon(CursorIcon::ResizeHorizontal);
            }
            if resizer_resp.dragged() {
                let delta_x = resizer_resp.drag_delta().x;
                state.clamp_nav_width(state.nav_width + delta_x);
            }
        }

        // 4. Content Area
        let content_rect = Rect::from_min_max(
            Pos2::new(nav_rect.max.x, body_top),
            Pos2::new(available_rect.max.x, body_bottom),
        );

        // Content surface fill with 8px rounded top-left corner
        ui.painter().rect_filled(
            content_rect,
            CornerRadius {
                nw: radii::PANELS,
                ne: 0,
                sw: 0,
                se: 0,
            },
            self.tokens.content_surface,
        );

        let ppp = ui.ctx().pixels_per_point();
        let edge_x = layout::snap_to_pixel(content_rect.min.x + 0.5, ppp);
        let edge_y = layout::snap_to_pixel(content_rect.min.y + 0.5, ppp);
        ui.painter().vline(
            edge_x,
            (content_rect.min.y + radii::PANELS as f32)..=content_rect.max.y,
            Stroke::new(1.0, self.tokens.divider_strong),
        );
        ui.painter().hline(
            (content_rect.min.x + radii::PANELS as f32)..=content_rect.max.x,
            edge_y,
            Stroke::new(1.0, self.tokens.divider_strong),
        );

        let mut content_ui = ui.new_child(egui::UiBuilder::new().max_rect(content_rect));
        content_ui.set_clip_rect(content_rect);
        let content_action = self.render_content(
            &mut content_ui,
            content_rect,
            state,
            total_videos,
            _total_photos,
            items,
            history,
            sessions,
            positions,
            textures,
        );
        if content_action != ShellAction::None {
            action = content_action;
        }

        // 4b. Spotify-style Continue Watching Bottom Bar
        if let Some((pos_secs, dur_secs, item)) = mini_bar_item {
            let bar_rect = Rect::from_min_max(
                Pos2::new(available_rect.left(), body_bottom),
                available_rect.max,
            );
            self.render_continue_watching_bar(ui, bar_rect, state, pos_secs, dur_secs, item, textures, &mut action);
        }

        // 5. Active Popups / Context Menu
        self.render_popups_and_context(ui, state, items, history, &mut action);
        self.render_tree_flyout(ui, available_rect, nav_rect, state, &mut action);
        self.render_resize_edges(ui, available_rect);

        action
    }

    fn render_resize_edges(&self, ui: &mut Ui, rect: Rect) {
        if ui.input(|input| input.viewport().maximized.unwrap_or(false)) {
            return;
        }
        let edge = 6.0;
        let zones = [
            (
                Rect::from_min_size(rect.min, vec2(edge, edge)),
                egui::ResizeDirection::NorthWest,
            ),
            (
                Rect::from_min_size(Pos2::new(rect.max.x - edge, rect.min.y), vec2(edge, edge)),
                egui::ResizeDirection::NorthEast,
            ),
            (
                Rect::from_min_size(Pos2::new(rect.min.x, rect.max.y - edge), vec2(edge, edge)),
                egui::ResizeDirection::SouthWest,
            ),
            (
                Rect::from_min_size(rect.max - vec2(edge, edge), vec2(edge, edge)),
                egui::ResizeDirection::SouthEast,
            ),
            (
                Rect::from_min_max(
                    Pos2::new(rect.min.x + edge, rect.min.y),
                    Pos2::new(rect.max.x - edge, rect.min.y + edge),
                ),
                egui::ResizeDirection::North,
            ),
            (
                Rect::from_min_max(
                    Pos2::new(rect.min.x + edge, rect.max.y - edge),
                    Pos2::new(rect.max.x - edge, rect.max.y),
                ),
                egui::ResizeDirection::South,
            ),
            (
                Rect::from_min_max(
                    Pos2::new(rect.min.x, rect.min.y + edge),
                    Pos2::new(rect.min.x + edge, rect.max.y - edge),
                ),
                egui::ResizeDirection::West,
            ),
            (
                Rect::from_min_max(
                    Pos2::new(rect.max.x - edge, rect.min.y + edge),
                    Pos2::new(rect.max.x, rect.max.y - edge),
                ),
                egui::ResizeDirection::East,
            ),
        ];
        for (zone, direction) in zones {
            let response = ui.allocate_rect(zone, Sense::click_and_drag());
            if response.drag_started() {
                ui.ctx()
                    .send_viewport_cmd(egui::ViewportCommand::BeginResize(direction));
            }
        }
    }

    fn render_tree_flyout(
        &self,
        ui: &mut Ui,
        window: Rect,
        nav: Rect,
        state: &mut ShellState,
        action: &mut ShellAction,
    ) {
        if !state.is_nav_collapsed || !state.tree_flyout_open {
            return;
        }
        let row_h = layout::ROW_PITCH;
        let tree_top =
            nav.min.y + layout::PANE_TOP_PAD + 3.0 * layout::ROW_PITCH + layout::DIVIDER_BLOCK_H;
        let anchor = Rect::from_min_size(Pos2::new(nav.min.x + 4.0, tree_top), vec2(40.0, 40.0));
        let popup_height = (window.height() * 0.60)
            .min(window.max.y - tree_top - layout::PANE_BOTTOM_PAD)
            .max(96.0);
        let popup = Rect::from_min_size(Pos2::new(nav.max.x, tree_top), vec2(280.0, popup_height));

        let hover_pos = ui.input(|input| input.pointer.hover_pos());
        let anchor_expanded = anchor.expand2(vec2(12.0, 12.0));
        let popup_expanded = popup.expand2(vec2(12.0, 12.0));
        if let Some(pos) = hover_pos {
            if !popup_expanded.contains(pos) && !anchor_expanded.contains(pos) {
                state.tree_flyout_open = false;
                return;
            }
        } else {
            state.tree_flyout_open = false;
            return;
        }

        egui::Area::new(ui.scope_id().with("this_pc_flyout_area"))
            .order(egui::Order::Foreground)
            .fixed_pos(popup.min)
            .show(ui.ctx(), |ui| {
                let (fly_rect, _) = ui.allocate_exact_size(popup.size(), Sense::hover());
                ui.painter().rect_filled(
                    fly_rect,
                    CornerRadius::same(radii::PANELS),
                    self.tokens.content_surface,
                );
                ui.painter().rect_stroke(
                    fly_rect,
                    CornerRadius::same(radii::PANELS),
                    Stroke::new(1.0, self.tokens.divider_strong),
                    StrokeKind::Inside,
                );
                let header_pitch = Rect::from_min_size(
                    fly_rect.min + vec2(layout::PANE_TOP_PAD, layout::PANE_TOP_PAD),
                    vec2(fly_rect.width() - layout::PANE_TOP_PAD * 2.0, row_h),
                );
                let header = Rect::from_min_size(
                    header_pitch.min + vec2(layout::ROW_INSET_X, 2.0),
                    vec2(
                        header_pitch.width() - layout::ROW_INSET_X * 2.0,
                        layout::ROW_FILL_H,
                    ),
                );
                let header_response = ui.allocate_rect(header_pitch, Sense::click());
                if header_response.hovered() {
                    ui.painter().rect_filled(
                        header,
                        CornerRadius::same(radii::CONTROLS),
                        self.tokens.hover_fill,
                    );
                }
                self.icons.paint_icon(
                    ui,
                    "computer",
                    Rect::from_min_size(
                        header.min
                            + vec2(
                                layout::ROW_PAD_X,
                                (layout::ROW_FILL_H - layout::ICON_BOX) * 0.5,
                            ),
                        vec2(layout::ICON_BOX, layout::ICON_BOX),
                    ),
                    self.tokens.text_secondary,
                );
                ui.painter().text(
                    Pos2::new(header_pitch.min.x + layout::LABEL_X, header.center().y),
                    Align2::LEFT_CENTER,
                    "This PC",
                    FontId::proportional(typography::NAV_ITEM),
                    self.tokens.text_primary,
                );
                let chevron = if state.this_pc_expanded {
                    "chevron-up"
                } else {
                    "chevron-down"
                };
                let add = Rect::from_min_size(
                    Pos2::new(
                        header.max.x - layout::ROW_PAD_X - 32.0,
                        header.center().y - 16.0,
                    ),
                    vec2(32.0, 32.0),
                );
                let chevron_rect = Rect::from_min_size(
                    Pos2::new(add.min.x - 4.0 - 16.0, header.center().y - 8.0),
                    vec2(16.0, 16.0),
                );
                self.icons
                    .paint_icon(ui, chevron, chevron_rect, self.tokens.text_secondary);
                let add_response = ui
                    .allocate_rect(add, Sense::click())
                    .on_hover_text("Add a folder");
                if add_response.hovered() {
                    ui.painter().rect_filled(
                        add,
                        CornerRadius::same(radii::CONTROLS),
                        self.tokens.hover_fill,
                    );
                }
                self.icons.paint_icon(
                    ui,
                    "folder-plus",
                    Rect::from_center_size(add.center(), vec2(layout::ICON_BOX, layout::ICON_BOX)),
                    self.tokens.text_secondary,
                );
                if add_response.clicked() {
                    *action = ShellAction::AddFolderPicker;
                }
                if header_response.clicked() && !add_response.clicked() {
                    state.this_pc_expanded = !state.this_pc_expanded;
                }
                let rows = flatten_tree(&state.root_folders);
                let list_rect = Rect::from_min_max(
                    Pos2::new(fly_rect.min.x + layout::PANE_TOP_PAD, header_pitch.max.y),
                    Pos2::new(
                        fly_rect.max.x - layout::PANE_BOTTOM_PAD,
                        fly_rect.max.y - layout::PANE_BOTTOM_PAD,
                    ),
                );
                let mut list_ui = ui.new_child(egui::UiBuilder::new().max_rect(list_rect));
                list_ui.set_clip_rect(list_rect);
                egui::ScrollArea::vertical()
                    .id_salt("this_pc_flyout")
                    .auto_shrink([false, false])
                    .max_height(list_rect.height())
                    .show_rows(&mut list_ui, row_h, rows.len(), |list_ui, visible| {
                for index in visible {
                    let node = &rows[index];
                    let (pitch, response) = list_ui.allocate_exact_size(
                        vec2(list_ui.available_width(), row_h),
                        Sense::click(),
                    );
                    let row = Rect::from_min_size(
                        pitch.min + vec2(layout::ROW_INSET_X, 2.0),
                        vec2(
                            (pitch.width() - layout::ROW_INSET_X * 2.0).max(0.0),
                            layout::ROW_FILL_H,
                        ),
                    );
                    let selected = state.selected_folder.as_ref() == Some(&node.path);
                    if response.hovered() && !selected {
                        list_ui.painter().rect_filled(
                            row,
                            CornerRadius::same(radii::CONTROLS),
                            if response.is_pointer_button_down_on() {
                                self.tokens.pressed_fill
                            } else {
                                self.tokens.hover_fill
                            },
                        );
                    }
                    if selected {
                        list_ui.painter().rect_filled(
                            row,
                            CornerRadius::same(radii::CONTROLS),
                            self.tokens.selected_fill,
                        );
                        list_ui.painter().rect_filled(
                            Rect::from_min_size(
                                Pos2::new(
                                    row.min.x + layout::PILL_LEFT,
                                    row.center().y - layout::PILL_H * 0.5,
                                ),
                                vec2(layout::PILL_W, layout::PILL_H),
                            ),
                            CornerRadius::same(2),
                            self.tokens.accent,
                        );
                    }
                    let indent_x = node.depth as f32 * layout::TREE_INDENT;
                    let icon_rect = Rect::from_min_size(
                        Pos2::new(
                            row.min.x + layout::ROW_PAD_X + indent_x,
                            row.center().y - layout::ICON_BOX * 0.5,
                        ),
                        vec2(layout::ICON_BOX, layout::ICON_BOX),
                    );
                    self.icons.paint_icon(
                        list_ui,
                        if node.is_missing {
                            "warning"
                        } else if node.is_expanded {
                            "folder-open"
                        } else {
                            "folder"
                        },
                        icon_rect,
                        if selected {
                            self.tokens.text_primary
                        } else {
                            self.tokens.text_secondary
                        },
                    );
                    let mut chevron_clicked = false;
                    if node.has_subfolders {
                        let chev = Rect::from_min_size(
                            Pos2::new(row.max.x - layout::ROW_PAD_X - 16.0, row.center().y - 8.0),
                            vec2(16.0, 16.0),
                        );
                        let chev_response = list_ui.interact(
                            chev,
                            list_ui.scope_id().with(("flyout-tree-chevron", &node.path)),
                            Sense::click(),
                        );
                        self.icons.paint_icon(
                            list_ui,
                            if node.is_expanded {
                                "chevron-up"
                            } else {
                                "chevron-down"
                            },
                            chev,
                            self.tokens.text_secondary,
                        );
                        if chev_response.clicked() {
                            state.toggle_node_expansion(&node.path);
                            chevron_clicked = true;
                        }
                    }
                    let reserve_right = if node.has_subfolders {
                        layout::ROW_PAD_X + 16.0 + 8.0
                    } else {
                        layout::ROW_PAD_X
                    };
                    let text_rect = Rect::from_min_max(
                        Pos2::new(header_pitch.min.x + layout::LABEL_X + indent_x, row.min.y),
                        Pos2::new(row.max.x - reserve_right, row.max.y),
                    );
                    let mut label = node.name.clone();
                    let font = FontId::proportional(typography::BODY);
                    while !label.is_empty()
                        && list_ui
                            .painter()
                            .layout_no_wrap(label.clone(), font.clone(), self.tokens.text_secondary)
                            .size()
                            .x
                            > text_rect.width()
                    {
                        label.pop();
                    }
                    if label.len() < node.name.len() {
                        label.push('…');
                    }
                    let galley =
                        list_ui
                            .painter()
                            .layout_no_wrap(label, font, self.tokens.text_secondary);
                    list_ui.painter().galley(
                        Pos2::new(text_rect.min.x, row.center().y - galley.size().y * 0.5),
                        galley,
                        if selected {
                            self.tokens.text_primary
                        } else {
                            self.tokens.text_secondary
                        },
                    );
                    let response = response.on_hover_text(node.path.display().to_string());
                    if response.clicked() && !chevron_clicked {
                        if node.has_subfolders {
                            state.toggle_node_expansion(&node.path);
                        } else {
                            state.selected_folder = Some(node.path.clone());
                            state.tree_flyout_open = false;
                            *action = ShellAction::SelectFolder(node.path.clone());
                        }
                    }
                }
            });
            });
    }

    /// Render the title bar and its native window controls.
    fn render_titlebar(&self, ui: &mut Ui, rect: Rect, state: &mut ShellState) -> ShellAction {
        let mut action = ShellAction::None;
        ui.painter()
            .rect_filled(rect, CornerRadius::ZERO, self.tokens.chrome_bg);

        let left = rect.min.x + 8.0;
        let sidebar_button =
            Rect::from_min_size(Pos2::new(left, rect.min.y + 4.0), vec2(32.0, 28.0));
        let sidebar_response = ui
            .allocate_rect(sidebar_button, Sense::click())
            .on_hover_text("Toggle sidebar");
        if sidebar_response.hovered() {
            ui.painter().rect_filled(
                sidebar_button,
                CornerRadius::same(radii::CONTROLS),
                self.tokens.hover_fill,
            );
        }
        self.icons.paint_icon(
            ui,
            "hamburger",
            sidebar_button.shrink(7.0),
            self.tokens.text_secondary,
        );
        if sidebar_response.clicked() {
            state.toggle_nav_collapsed();
        }
        let menu_left = left + 40.0;
        for (idx, label) in ["File"].into_iter().enumerate() {
            let btn_rect = Rect::from_min_size(
                Pos2::new(menu_left + idx as f32 * 48.0 - 6.0, rect.min.y + 4.0),
                vec2(42.0, rect.height() - 8.0),
            );
            let is_file_open = idx == 0 && state.active_popup == Some(ActivePopupMenu::File);
            let resp = ui.allocate_rect(btn_rect, Sense::click());
            if resp.hovered() {
                ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
            }
            if is_file_open {
                ui.painter().rect_filled(
                    btn_rect,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.selected_fill,
                );
            } else if resp.hovered() {
                ui.painter().rect_filled(
                    btn_rect,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.hover_fill,
                );
            }
            ui.painter().text(
                btn_rect.center(),
                Align2::CENTER_CENTER,
                label,
                FontId::proportional(13.0),
                if is_file_open || resp.hovered() {
                    self.tokens.text_primary
                } else {
                    self.tokens.text_secondary
                },
            );
            if idx == 0 && resp.clicked() {
                state.file_menu_pos = Pos2::new(btn_rect.min.x, rect.max.y);
                state.recent_submenu_open = false;
                state.toggle_popup(ActivePopupMenu::File);
            }
        }
        let left_controls_right = menu_left + 4.0 * 48.0;

        let btn_w = dimensions::WINDOW_BUTTON_WIDTH;
        let right_edge = rect.max.x;
        let close_rect = Rect::from_min_size(
            Pos2::new(right_edge - btn_w, rect.min.y),
            vec2(btn_w, rect.height()),
        );
        let max_rect = close_rect.translate(vec2(-btn_w, 0.0));
        let min_rect = max_rect.translate(vec2(-btn_w, 0.0));

        let min_resp = ui
            .allocate_rect(min_rect, Sense::click())
            .on_hover_text("Minimize");
        let max_resp = ui.allocate_rect(max_rect, Sense::click()).on_hover_text(
            if ui.input(|i| i.viewport().maximized.unwrap_or(false)) {
                "Restore"
            } else {
                "Maximize"
            },
        );
        let is_maximized = ui.input(|i| i.viewport().maximized.unwrap_or(false));
        let close_resp = ui
            .allocate_rect(close_rect, Sense::click())
            .on_hover_text("Close");
        for (response, area) in [(&min_resp, min_rect), (&max_resp, max_rect)] {
            if response.hovered() || response.is_pointer_button_down_on() {
                ui.painter().rect_filled(
                    area,
                    CornerRadius::ZERO,
                    if response.is_pointer_button_down_on() {
                        self.tokens.pressed_fill
                    } else {
                        self.tokens.hover_fill
                    },
                );
            }
        }
        if min_resp.clicked() {
            action = ShellAction::MinimizeWindow;
        }
        if max_resp.clicked() {
            action = ShellAction::ToggleMaximizeWindow;
        }
        if close_resp.hovered() || close_resp.is_pointer_button_down_on() {
            ui.painter().rect_filled(
                close_rect,
                CornerRadius::ZERO,
                if close_resp.is_pointer_button_down_on() {
                    self.tokens.close_pressed
                } else {
                    self.tokens.close_hover
                },
            );
        }
        if close_resp.clicked() {
            action = ShellAction::CloseWindow;
        }
        let icon_color = |hovered: bool| {
            if hovered {
                self.tokens.text_primary
            } else {
                self.tokens.text_secondary
            }
        };
        let mid = min_rect.center();
        ui.painter().hline(
            (mid.x - 5.0)..=(mid.x + 5.0),
            mid.y.floor() + 0.5,
            Stroke::new(1.0, icon_color(min_resp.hovered())),
        );
        let mid = max_rect.center();
        if is_maximized {
            ui.painter().rect_stroke(
                Rect::from_min_size(Pos2::new(mid.x - 3.0, mid.y - 5.0), vec2(8.0, 8.0)),
                CornerRadius::ZERO,
                Stroke::new(1.0, icon_color(max_resp.hovered())),
                StrokeKind::Inside,
            );
            ui.painter().line_segment(
                [
                    Pos2::new(mid.x - 5.0, mid.y - 3.0),
                    Pos2::new(mid.x - 5.0, mid.y + 5.0),
                ],
                Stroke::new(1.0, icon_color(max_resp.hovered())),
            );
            ui.painter().line_segment(
                [
                    Pos2::new(mid.x - 5.0, mid.y + 5.0),
                    Pos2::new(mid.x + 3.0, mid.y + 5.0),
                ],
                Stroke::new(1.0, icon_color(max_resp.hovered())),
            );
        } else {
            ui.painter().rect_stroke(
                Rect::from_center_size(mid, vec2(10.0, 10.0)),
                CornerRadius::ZERO,
                Stroke::new(1.0, icon_color(max_resp.hovered())),
                StrokeKind::Inside,
            );
        }
        let mid = close_rect.center();
        let close_color = if close_resp.hovered() {
            Color32::WHITE
        } else {
            self.tokens.text_secondary
        };
        ui.painter().line_segment(
            [mid + vec2(-5.0, -5.0), mid + vec2(5.0, 5.0)],
            Stroke::new(1.0, close_color),
        );
        ui.painter().line_segment(
            [mid + vec2(5.0, -5.0), mid + vec2(-5.0, 5.0)],
            Stroke::new(1.0, close_color),
        );

        // Search width yields to the fixed left and right control clusters.
        let max_search = (rect.width() - 460.0).max(dimensions::SEARCH_MIN_WIDTH);
        let search_target_w = (rect.width() * 0.40)
            .clamp(dimensions::SEARCH_MIN_WIDTH, dimensions::SEARCH_MAX_WIDTH)
            .min(max_search);
        let search_center_x = rect.center().x;
        let search_rect = Rect::from_min_size(
            Pos2::new(search_center_x - (search_target_w / 2.0), rect.min.y + 4.0),
            vec2(search_target_w, dimensions::SEARCH_HEIGHT),
        );

        // Allocate search bar
        let _search_resp = ui.allocate_rect(search_rect, Sense::click());
        ui.painter().rect_filled(
            search_rect,
            CornerRadius::same(radii::CONTROLS),
            self.tokens.field_fill,
        );
        ui.painter().rect_stroke(
            search_rect,
            CornerRadius::same(radii::CONTROLS),
            Stroke::new(
                if state.search_focused { 2.0 } else { 1.0 },
                if state.search_focused {
                    self.tokens.accent
                } else {
                    self.tokens.field_border
                },
            ),
            StrokeKind::Inside,
        );

        let search_icon_rect = Rect::from_min_size(
            Pos2::new(search_rect.min.x + 8.0, search_rect.min.y + 8.0),
            vec2(16.0, 16.0),
        );
        self.icons
            .paint_icon(ui, "search", search_icon_rect, self.tokens.text_tertiary);

        let text_input_rect = Rect::from_min_max(
            Pos2::new(search_icon_rect.max.x + 6.0, search_rect.min.y),
            Pos2::new(search_rect.max.x - 32.0, search_rect.max.y),
        );

        let mut text_ui = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(text_input_rect)
                .layout(Layout::left_to_right(Align::Center)),
        );
        let edit_id = text_ui.scope_id().with("titlebar_search");
        if state.request_search_focus {
            text_ui.memory_mut(|m| m.request_focus(edit_id));
            state.request_search_focus = false;
        }

        let edit_resp = text_ui.add(
            egui::TextEdit::singleline(&mut state.search_query)
                .id(edit_id)
                .hint_text("Search library")
                .font(FontId::proportional(typography::BODY))
                .text_color(self.tokens.text_primary)
                .frame(egui::Frame::NONE),
        );
        if edit_resp.has_focus() && ui.input(|i| i.key_pressed(Key::Escape)) {
            state.search_query.clear();
            edit_resp.surrender_focus();
        }
        state.search_focused = edit_resp.has_focus() && !ui.input(|i| i.key_pressed(Key::Escape));

        if edit_resp.changed() {
            action = ShellAction::Search(state.search_query.clone());
        }

        // Drag window area (any click-drag on titlebar outside interactive controls)
        let drag_rect_left = Rect::from_min_max(
            Pos2::new(left_controls_right + 8.0, rect.min.y),
            Pos2::new(search_rect.min.x, rect.max.y),
        );
        let drag_rect_right = Rect::from_min_max(
            Pos2::new(search_rect.max.x, rect.min.y),
            Pos2::new(min_rect.min.x, rect.max.y),
        );

        let drag_resp_left = ui.allocate_rect(drag_rect_left, Sense::click_and_drag());
        let drag_resp_right = ui.allocate_rect(drag_rect_right, Sense::click_and_drag());
        if drag_resp_left.drag_started() || drag_resp_right.drag_started() {
            ui.ctx().send_viewport_cmd(egui::ViewportCommand::StartDrag);
        }
        if drag_resp_left.double_clicked() || drag_resp_right.double_clicked() {
            action = ShellAction::ToggleMaximizeWindow;
        }

        action
    }

    /// Render the sidebar as fixed top and bottom regions around the clipped folder tree.
    fn render_sidebar(&self, ui: &mut Ui, rect: Rect, state: &mut ShellState) -> ShellAction {
        ui.painter()
            .rect_filled(rect, CornerRadius::ZERO, self.tokens.chrome_bg);
        let top_group_end = rect.min.y + layout::PANE_TOP_PAD + 3.0 * layout::ROW_PITCH;
        let first_divider_y = top_group_end + layout::GROUP_GAP;
        let middle_top = first_divider_y + layout::GROUP_GAP + layout::DIVIDER_H;
        let bottom_h = layout::PANE_BOTTOM_PAD
            + 2.0 * layout::ROW_PITCH
            + layout::GROUP_GAP * 2.0
            + layout::DIVIDER_H;
        let bottom_rect = Rect::from_min_size(
            Pos2::new(rect.min.x, rect.max.y - bottom_h),
            vec2(rect.width(), bottom_h),
        );
        let middle_rect = Rect::from_min_max(
            Pos2::new(rect.min.x, middle_top),
            Pos2::new(rect.max.x, bottom_rect.min.y),
        );
        let collapsed = state.is_nav_collapsed;
        let fill_x = if collapsed {
            rect.min.x + layout::RAIL_ROW_INSET_X
        } else {
            rect.min.x + layout::ROW_INSET_X
        };
        let fill_w = if collapsed {
            40.0
        } else {
            (rect.width() - layout::ROW_INSET_X * 2.0).max(0.0)
        };
        let mut action = ShellAction::None;

        let draw_divider = |ui: &Ui, y: f32| {
            let snapped = layout::snap_to_pixel(y, ui.ctx().pixels_per_point());
            ui.painter().hline(
                (rect.min.x + layout::ROW_INSET_X)..=(rect.max.x - layout::ROW_INSET_X),
                snapped,
                Stroke::new(layout::DIVIDER_H, self.tokens.divider),
            );
        };

        // Region A: fixed primary destinations. The sidebar toggle lives in the title bar.
        let nav_items = [
            (NavItem::Home, "home", "Home"),
            (NavItem::Library, "nav.library", "Library"),
            (NavItem::History, "history", "History"),
        ];
        for (index, (item, icon, label)) in nav_items.into_iter().enumerate() {
            let pitch = Rect::from_min_size(
                Pos2::new(
                    fill_x,
                    rect.min.y + layout::PANE_TOP_PAD + index as f32 * layout::ROW_PITCH,
                ),
                vec2(fill_w, layout::ROW_PITCH),
            );
            let fill = Rect::from_min_size(
                Pos2::new(
                    pitch.min.x,
                    pitch.min.y + (layout::ROW_PITCH - layout::ROW_FILL_H) * 0.5,
                ),
                vec2(pitch.width(), layout::ROW_FILL_H),
            );
            let response = ui.allocate_rect(pitch, Sense::click()).on_hover_text(label);
            let selected = state.selected_nav == item && state.selected_folder.is_none();
            if response.hovered() && !selected {
                ui.painter().rect_filled(
                    fill,
                    CornerRadius::same(radii::CONTROLS),
                    if response.is_pointer_button_down_on() {
                        self.tokens.pressed_fill
                    } else {
                        self.tokens.hover_fill
                    },
                );
            }
            if selected {
                ui.painter().rect_filled(
                    fill,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.selected_fill,
                );
                let pill_x = if collapsed {
                    rect.min.x + layout::RAIL_PILL_LEFT
                } else {
                    fill.min.x + layout::PILL_LEFT
                };
                ui.painter().rect_filled(
                    Rect::from_center_size(
                        Pos2::new(pill_x + layout::PILL_W * 0.5, fill.center().y),
                        vec2(layout::PILL_W, layout::PILL_H),
                    ),
                    CornerRadius::same(2),
                    self.tokens.accent,
                );
            }
            let icon_rect = if collapsed {
                Rect::from_center_size(fill.center(), vec2(layout::ICON_BOX, layout::ICON_BOX))
            } else {
                Rect::from_min_size(
                    Pos2::new(
                        fill.min.x + layout::ROW_PAD_X,
                        fill.center().y - layout::ICON_BOX * 0.5,
                    ),
                    vec2(layout::ICON_BOX, layout::ICON_BOX),
                )
            };
            self.icons.paint_icon(
                ui,
                icon,
                icon_rect,
                if selected {
                    self.tokens.text_primary
                } else {
                    self.tokens.text_secondary
                },
            );
            if !collapsed {
                ui.painter().text(
                    Pos2::new(rect.min.x + layout::LABEL_X, fill.center().y),
                    Align2::LEFT_CENTER,
                    label,
                    FontId::proportional(typography::NAV_ITEM),
                    if selected {
                        self.tokens.text_primary
                    } else {
                        self.tokens.text_secondary
                    },
                );
                if item == NavItem::History && state.history_count > 0 {
                    let count = state.history_count.to_string();
                    let chip_w = (count.chars().count() as f32 * 7.0
                        + layout::COUNT_CHIP_PAD_X * 2.0)
                        .max(layout::COUNT_CHIP_H);
                    let chip = Rect::from_min_size(
                        Pos2::new(
                            fill.max.x - layout::ROW_PAD_X - chip_w,
                            fill.center().y - layout::COUNT_CHIP_H * 0.5,
                        ),
                        vec2(chip_w, layout::COUNT_CHIP_H),
                    );
                    ui.painter().rect_filled(
                        chip,
                        CornerRadius::same(radii::PILL),
                        self.tokens.hover_fill,
                    );
                    ui.painter().text(
                        chip.center(),
                        Align2::CENTER_CENTER,
                        count,
                        FontId::proportional(typography::SECONDARY),
                        if selected {
                            self.tokens.text_primary
                        } else {
                            self.tokens.text_secondary
                        },
                    );
                }
            }
            if response.clicked() {
                state.selected_nav = item;
                state.selected_folder = None;
                action = ShellAction::SelectNav(item);
            }
        }

        let middle_visible = middle_rect.height() >= layout::ROW_PITCH;
        if middle_visible {
            draw_divider(ui, first_divider_y);
        }

        // Region B: pinned header, independently scrollable and virtualized children.
        if collapsed && middle_visible {
            let pitch = Rect::from_min_size(
                Pos2::new(fill_x, middle_rect.min.y),
                vec2(fill_w, layout::ROW_PITCH),
            );
            let fill = Rect::from_min_size(
                pitch.min + vec2(0.0, layout::ROW_FILL_V_MARGIN),
                vec2(pitch.width(), layout::ROW_FILL_H),
            );
            let response = ui
                .allocate_rect(pitch, Sense::click())
                .on_hover_text("This PC");
            if response.hovered() {
                ui.painter().rect_filled(
                    fill,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.hover_fill,
                );
                state.tree_flyout_open = true;
            }
            self.icons.paint_icon(
                ui,
                "computer",
                Rect::from_center_size(fill.center(), vec2(layout::ICON_BOX, layout::ICON_BOX)),
                self.tokens.text_secondary,
            );
        } else if !collapsed && middle_visible {
            let header_pitch = Rect::from_min_size(
                middle_rect.min,
                vec2(middle_rect.width(), layout::ROW_PITCH),
            );
            let header = Rect::from_min_size(
                header_pitch.min + vec2(layout::ROW_INSET_X, layout::ROW_FILL_V_MARGIN),
                vec2(
                    header_pitch.width() - 2.0 * layout::ROW_INSET_X,
                    layout::ROW_FILL_H,
                ),
            );
            let header_response = ui.allocate_rect(header_pitch, Sense::click());
            if header_response.hovered() {
                ui.painter().rect_filled(
                    header,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.hover_fill,
                );
            }
            self.icons.paint_icon(
                ui,
                "computer",
                Rect::from_min_size(
                    Pos2::new(
                        header.min.x + layout::ROW_PAD_X,
                        header.center().y - layout::ICON_BOX * 0.5,
                    ),
                    vec2(layout::ICON_BOX, layout::ICON_BOX),
                ),
                self.tokens.text_secondary,
            );
            ui.painter().text(
                Pos2::new(rect.min.x + layout::LABEL_X, header.center().y),
                Align2::LEFT_CENTER,
                "This PC",
                FontId::proportional(typography::NAV_ITEM),
                self.tokens.text_primary,
            );
            let chevron = if state.this_pc_expanded {
                "chevron-up"
            } else {
                "chevron-down"
            };
            let add = Rect::from_min_size(
                Pos2::new(
                    header.max.x - layout::ROW_PAD_X - 32.0,
                    header.center().y - 16.0,
                ),
                vec2(32.0, 32.0),
            );
            let chevron_rect = Rect::from_min_size(
                Pos2::new(add.min.x - 4.0 - 16.0, header.center().y - 8.0),
                vec2(16.0, 16.0),
            );
            self.icons
                .paint_icon(ui, chevron, chevron_rect, self.tokens.text_secondary);
            let add_response = ui
                .allocate_rect(add, Sense::click())
                .on_hover_text("Add a folder");
            if add_response.hovered() {
                ui.painter().rect_filled(
                    add,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.hover_fill,
                );
            }
            self.icons.paint_icon(
                ui,
                "folder-plus",
                Rect::from_center_size(add.center(), vec2(layout::ICON_BOX, layout::ICON_BOX)),
                self.tokens.text_secondary,
            );
            if add_response.clicked() {
                action = ShellAction::AddFolderPicker;
            }
            if header_response.clicked() && !add_response.clicked() {
                state.toggle_this_pc();
            }

            if state.this_pc_expanded {
                let tree_rect = Rect::from_min_max(
                    Pos2::new(middle_rect.min.x, header_pitch.max.y),
                    middle_rect.max,
                );
                let mut tree_ui = ui.new_child(egui::UiBuilder::new().max_rect(tree_rect));
                tree_ui.set_clip_rect(tree_rect);
                tree_ui.style_mut().spacing.scroll.floating = true;
                tree_ui.style_mut().spacing.scroll.bar_width = 8.0;
                tree_ui.style_mut().spacing.scroll.handle_min_length = 24.0;
                tree_ui.style_mut().spacing.scroll.floating_width = 2.0;
                tree_ui.style_mut().spacing.scroll.floating_allocated_width = 0.0;
                let rows = flatten_tree(&state.root_folders);
                if rows.is_empty() {
                    tree_ui.allocate_ui_with_layout(
                        vec2(tree_rect.width(), layout::ROW_PITCH),
                        Layout::left_to_right(Align::Center),
                        |row_ui| {
                            row_ui.add_space(layout::LABEL_X);
                            row_ui.label(
                                egui::RichText::new("No folders added")
                                    .size(typography::SECONDARY)
                                    .color(self.tokens.text_secondary),
                            );
                        },
                    );
                } else {
                    let tree_output = egui::ScrollArea::vertical()
                        .id_salt("this_pc_tree")
                        .auto_shrink([false, false])
                        .show_rows(
                            &mut tree_ui,
                            layout::ROW_PITCH,
                            rows.len(),
                            |tree_ui, visible| {
                                for index in visible {
                                    let node = &rows[index];
                                    let (pitch, response) = tree_ui.allocate_exact_size(
                                        vec2(tree_ui.available_width(), layout::ROW_PITCH),
                                        Sense::click(),
                                    );
                                    let row_rect = Rect::from_min_size(
                                        pitch.min
                                            + vec2(layout::ROW_INSET_X, layout::ROW_FILL_V_MARGIN),
                                        vec2(
                                            (pitch.width() - layout::ROW_INSET_X * 2.0).max(0.0),
                                            layout::ROW_FILL_H,
                                        ),
                                    );
                                    let selected =
                                        state.selected_folder.as_ref() == Some(&node.path);
                                    if response.hovered() && !selected {
                                        tree_ui.painter().rect_filled(
                                            row_rect,
                                            CornerRadius::same(radii::CONTROLS),
                                            if response.is_pointer_button_down_on() {
                                                self.tokens.pressed_fill
                                            } else {
                                                self.tokens.hover_fill
                                            },
                                        );
                                    }
                                    if selected {
                                        tree_ui.painter().rect_filled(
                                            row_rect,
                                            CornerRadius::same(radii::CONTROLS),
                                            self.tokens.selected_fill,
                                        );
                                        tree_ui.painter().rect_stroke(
                                            row_rect.shrink(0.5),
                                            CornerRadius::same(radii::CONTROLS),
                                            Stroke::new(1.0, self.tokens.accent),
                                            StrokeKind::Inside,
                                        );
                                        let indent_x = node.depth as f32 * layout::TREE_INDENT;
                                        let indicator = Rect::from_min_size(
                                            Pos2::new(
                                                (row_rect.min.x + layout::ROW_PAD_X + indent_x - 8.0).max(row_rect.min.x + 2.0),
                                                row_rect.center().y - 8.0,
                                            ),
                                            vec2(3.0, 16.0),
                                        );
                                        tree_ui.painter().rect_filled(indicator, CornerRadius::same(1), self.tokens.accent);
                                    }
                                    let mut chevron_clicked = false;
                                    if node.has_subfolders {
                                        let chevron = if node.is_expanded {
                                            "chevron-up"
                                        } else {
                                            "chevron-down"
                                        };
                                        let chev = Rect::from_min_size(
                                            Pos2::new(
                                                row_rect.max.x - layout::ROW_PAD_X - 16.0,
                                                row_rect.center().y - 8.0,
                                            ),
                                            vec2(16.0, 16.0),
                                        );
                                        let chevron_response = tree_ui.interact(
                                            chev,
                                            tree_ui.scope_id().with(("tree-chevron", &node.path)),
                                            Sense::click(),
                                        );
                                        self.icons.paint_icon(
                                            tree_ui,
                                            chevron,
                                            chev,
                                            self.tokens.text_secondary,
                                        );
                                        if chevron_response.clicked() {
                                            state.toggle_node_expansion(&node.path);
                                            chevron_clicked = true;
                                        }
                                    }
                                    let indent_x = node.depth as f32 * layout::TREE_INDENT;
                                    let icon_rect = Rect::from_min_size(
                                        Pos2::new(
                                            row_rect.min.x + layout::ROW_PAD_X + indent_x,
                                            row_rect.center().y - layout::ICON_BOX * 0.5,
                                        ),
                                        vec2(layout::ICON_BOX, layout::ICON_BOX),
                                    );
                                    self.icons.paint_icon(
                                        tree_ui,
                                        if node.is_missing {
                                            "warning"
                                        } else if node.is_expanded {
                                            "folder-open"
                                        } else {
                                            "folder"
                                        },
                                        icon_rect,
                                        if selected {
                                            self.tokens.text_primary
                                        } else {
                                            self.tokens.text_secondary
                                        },
                                    );
                                    let reserve_right = if node.has_subfolders {
                                        layout::ROW_PAD_X + 16.0 + 8.0
                                    } else {
                                        layout::ROW_PAD_X
                                    };
                                    let label_rect = Rect::from_min_max(
                                        Pos2::new(
                                            rect.min.x + layout::LABEL_X + indent_x,
                                            row_rect.min.y,
                                        ),
                                        Pos2::new(row_rect.max.x - reserve_right, row_rect.max.y),
                                    );
                                    let font = FontId::proportional(typography::BODY);
                                    let count_key = valor_core::path_utils::normalize_path_string(
                                        &node.path.to_string_lossy(),
                                    );
                                    let mut label = state
                                        .folder_counts
                                        .get(&count_key)
                                        .map(|count| format!("{}  ({count})", node.name))
                                        .unwrap_or_else(|| node.name.clone());
                                    while !label.is_empty()
                                        && tree_ui
                                            .painter()
                                            .layout_no_wrap(
                                                label.clone(),
                                                font.clone(),
                                                self.tokens.text_secondary,
                                            )
                                            .size()
                                            .x
                                            > label_rect.width()
                                    {
                                        label.pop();
                                    }
                                    if label.len() < node.name.len() {
                                        label.push('…');
                                    }
                                    let galley = tree_ui.painter().layout_no_wrap(
                                        label,
                                        font,
                                        self.tokens.text_secondary,
                                    );
                                    tree_ui.painter().galley(
                                        Pos2::new(
                                            label_rect.min.x,
                                            row_rect.center().y - galley.size().y * 0.5,
                                        ),
                                        galley,
                                        if selected {
                                            self.tokens.text_primary
                                        } else {
                                            self.tokens.text_secondary
                                        },
                                    );
                                    let response =
                                        response.on_hover_text(node.path.display().to_string());
                                    if response.clicked() && !chevron_clicked {
                                        if node.has_subfolders {
                                            state.toggle_node_expansion(&node.path);
                                        } else {
                                            state.selected_folder = Some(node.path.clone());
                                            action = ShellAction::SelectFolder(node.path.clone());
                                        }
                                    }
                                    if response.secondary_clicked() {
                                        state.context_menu =
                                            Some(crate::shell_state::FolderContextMenu {
                                                path: node.path.clone(),
                                                position: response
                                                    .interact_pointer_pos()
                                                    .unwrap_or(row_rect.center()),
                                                is_root: node.depth == 0,
                                            });
                                    }
                                }
                            },
                        );
                    let max_scroll =
                        (tree_output.content_size.y - tree_output.inner_rect.height()).max(0.0);
                    if max_scroll > 0.0 && tree_output.state.clamped_offset().y < max_scroll - 1.0 {
                        let fade_top =
                            (tree_output.inner_rect.max.y - 24.0).max(tree_output.inner_rect.min.y);
                        for (index, alpha) in
                            [24_u8, 56, 104, 160, 220, 255].into_iter().enumerate()
                        {
                            let band = 4.0;
                            let y = fade_top + index as f32 * band;
                            let color = Color32::from_rgba_unmultiplied(
                                self.tokens.chrome_bg.r(),
                                self.tokens.chrome_bg.g(),
                                self.tokens.chrome_bg.b(),
                                alpha,
                            );
                            ui.painter().rect_filled(
                                Rect::from_min_size(
                                    Pos2::new(tree_output.inner_rect.min.x, y),
                                    vec2(tree_output.inner_rect.width(), band),
                                ),
                                CornerRadius::ZERO,
                                color,
                            );
                        }
                    }
                }
            }
        }

        // Region C: bottom actions remain pinned, with the divider separated by 8 px.
        if middle_visible {
            draw_divider(ui, bottom_rect.min.y + layout::GROUP_GAP);
        }
        for (index, (item, icon, label)) in [
            (NavItem::Theme, "nav.theme", "Theme"),
            (NavItem::Settings, "settings", "Settings"),
        ]
        .into_iter()
        .enumerate()
        {
            let pitch = Rect::from_min_size(
                Pos2::new(
                    fill_x,
                    bottom_rect.min.y + layout::DIVIDER_BLOCK_H + index as f32 * layout::ROW_PITCH,
                ),
                vec2(fill_w, layout::ROW_PITCH),
            );
            let fill = Rect::from_min_size(
                pitch.min + vec2(0.0, layout::ROW_FILL_V_MARGIN),
                vec2(pitch.width(), layout::ROW_FILL_H),
            );
            let response = ui.allocate_rect(pitch, Sense::click()).on_hover_text(label);
            let selected = state.selected_nav == item;
            if response.hovered() && !selected {
                ui.painter().rect_filled(
                    fill,
                    CornerRadius::same(radii::CONTROLS),
                    if response.is_pointer_button_down_on() {
                        self.tokens.pressed_fill
                    } else {
                        self.tokens.hover_fill
                    },
                );
            }
            if selected {
                ui.painter().rect_filled(
                    fill,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.selected_fill,
                );
                let pill_x = if collapsed {
                    rect.min.x + layout::RAIL_PILL_LEFT
                } else {
                    fill.min.x + layout::PILL_LEFT
                };
                ui.painter().rect_filled(
                    Rect::from_min_size(
                        Pos2::new(pill_x, fill.center().y - layout::PILL_H * 0.5),
                        vec2(layout::PILL_W, layout::PILL_H),
                    ),
                    CornerRadius::same(2),
                    self.tokens.accent,
                );
            }
            let icon_rect = if collapsed {
                Rect::from_center_size(fill.center(), vec2(layout::ICON_BOX, layout::ICON_BOX))
            } else {
                Rect::from_min_size(
                    Pos2::new(
                        fill.min.x + layout::ROW_PAD_X,
                        fill.center().y - layout::ICON_BOX * 0.5,
                    ),
                    vec2(layout::ICON_BOX, layout::ICON_BOX),
                )
            };
            self.icons.paint_icon(
                ui,
                icon,
                icon_rect,
                if selected {
                    self.tokens.text_primary
                } else {
                    self.tokens.text_secondary
                },
            );
            if !collapsed {
                ui.painter().text(
                    Pos2::new(rect.min.x + layout::LABEL_X, fill.center().y),
                    Align2::LEFT_CENTER,
                    label,
                    FontId::proportional(typography::NAV_ITEM),
                    if selected {
                        self.tokens.text_primary
                    } else {
                        self.tokens.text_secondary
                    },
                );
            }
            if response.clicked() {
                state.selected_nav = item;
                action = ShellAction::SelectNav(item);
            }
        }

        action
    }

    #[allow(dead_code)]
    fn render_nav_legacy(&self, ui: &mut Ui, rect: Rect, state: &mut ShellState) -> ShellAction {
        let mut action = ShellAction::None;

        // Nav Background Fill
        ui.painter()
            .rect_filled(rect, CornerRadius::ZERO, self.tokens.nav_surface);

        let mut current_y = rect.min.y + 8.0;

        // 1. Hamburger Button (32x32) at top
        let hamburger_rect = Rect::from_min_size(
            Pos2::new(rect.min.x + 8.0, current_y),
            vec2(dimensions::HAMBURGER_SIZE, dimensions::HAMBURGER_SIZE),
        );
        let ham_resp = ui.allocate_rect(hamburger_rect, Sense::click());
        if ham_resp.hovered() {
            ui.painter().rect_filled(
                hamburger_rect,
                CornerRadius::same(radii::CONTROLS),
                self.tokens.hover_fill,
            );
        }
        self.icons.paint_icon(
            ui,
            "hamburger",
            hamburger_rect.shrink(6.0),
            if ham_resp.hovered() {
                self.tokens.text_primary
            } else {
                self.tokens.text_secondary
            },
        );
        if ham_resp.clicked() {
            state.toggle_nav_collapsed();
        }

        current_y += dimensions::HAMBURGER_SIZE + 8.0;

        // 2. Main navigation destinations
        let nav_items = [
            (NavItem::Home, "home", "Home"),
            (NavItem::Library, "nav.library", "Library"),
            (NavItem::Playlists, "folder-plus", "Playlists"),
            (NavItem::History, "history", "History"),
            (NavItem::Scans, "folder-open", "Scans"),
            (NavItem::Stats, "dock.studio", "Stats"),
        ];

        for (item, icon, label) in nav_items {
            let is_selected = state.selected_nav == item && state.selected_folder.is_none();
            let row_rect = Rect::from_min_size(
                Pos2::new(rect.min.x + 8.0, current_y),
                vec2(rect.width() - 16.0, dimensions::NAV_ROW_HEIGHT),
            );
            let row_resp = ui.allocate_rect(row_rect, Sense::click());

            if row_resp.hovered() {
                ui.painter().rect_filled(
                    row_rect,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.hover_fill,
                );
            }
            if is_selected {
                ui.painter().rect_filled(
                    row_rect,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.selected_fill,
                );
                // 3x16 vertical accent pill on far left
                let pill_rect = Rect::from_min_size(
                    Pos2::new(
                        row_rect.min.x,
                        row_rect.center().y - (dimensions::ACCENT_PILL_HEIGHT / 2.0),
                    ),
                    vec2(
                        dimensions::ACCENT_PILL_WIDTH,
                        dimensions::ACCENT_PILL_HEIGHT,
                    ),
                );
                ui.painter()
                    .rect_filled(pill_rect, CornerRadius::same(2), self.tokens.accent);
            }

            // Nav Icon (20x20)
            let icon_rect = Rect::from_min_size(
                Pos2::new(
                    row_rect.min.x + 10.0,
                    row_rect.center().y - (dimensions::ICON_SIZE_NAV / 2.0),
                ),
                vec2(dimensions::ICON_SIZE_NAV, dimensions::ICON_SIZE_NAV),
            );
            self.icons.paint_icon(
                ui,
                icon,
                icon_rect,
                if is_selected {
                    self.tokens.accent
                } else {
                    self.tokens.text_secondary
                },
            );

            // Label (if not collapsed)
            if !state.is_nav_collapsed {
                let text_label = if item == NavItem::History && state.history_count > 0 {
                    format!("{} ({})", label, state.history_count)
                } else {
                    label.to_string()
                };
                ui.painter().text(
                    Pos2::new(icon_rect.max.x + 12.0, row_rect.center().y),
                    Align2::LEFT_CENTER,
                    text_label,
                    FontId::proportional(typography::NAV_ITEM),
                    if is_selected {
                        self.tokens.text_primary
                    } else {
                        self.tokens.text_secondary
                    },
                );
            }

            if row_resp.clicked() {
                state.selected_nav = item;
                state.selected_folder = None;
                action = ShellAction::SelectNav(item);
            }

            current_y += dimensions::NAV_ROW_HEIGHT + 4.0;
        }

        // Thin divider before "This PC"
        current_y += 4.0;
        ui.painter().hline(
            (rect.min.x + 8.0)..=(rect.max.x - 8.0),
            current_y,
            Stroke::new(1.0, self.tokens.divider),
        );
        current_y += 8.0;

        // 3. "This PC" Section Header (Only visible if expanded nav)
        if !state.is_nav_collapsed {
            let this_pc_row = Rect::from_min_size(
                Pos2::new(rect.min.x + 8.0, current_y),
                vec2(rect.width() - 16.0, dimensions::NAV_ROW_HEIGHT),
            );
            let this_pc_resp = ui.allocate_rect(this_pc_row, Sense::click());
            if this_pc_resp.hovered() {
                ui.painter().rect_filled(
                    this_pc_row,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.hover_fill,
                );
            }

            // Computer icon
            let pc_icon_rect = Rect::from_min_size(
                Pos2::new(
                    this_pc_row.min.x + 10.0,
                    this_pc_row.center().y - (dimensions::ICON_SIZE_NAV / 2.0),
                ),
                vec2(dimensions::ICON_SIZE_NAV, dimensions::ICON_SIZE_NAV),
            );
            self.icons
                .paint_icon(ui, "computer", pc_icon_rect, self.tokens.text_secondary);

            // Label "This PC"
            ui.painter().text(
                Pos2::new(pc_icon_rect.max.x + 12.0, this_pc_row.center().y),
                Align2::LEFT_CENTER,
                "This PC",
                FontId::proportional(typography::NAV_ITEM),
                self.tokens.text_primary,
            );

            // Rotating chevron on right of This PC
            let chevron_icon = if state.this_pc_expanded {
                "chevron-up"
            } else {
                "chevron-down"
            };
            let chevron_rect = Rect::from_min_size(
                Pos2::new(this_pc_row.max.x - 54.0, this_pc_row.center().y - 8.0),
                vec2(16.0, 16.0),
            );
            self.icons
                .paint_icon(ui, chevron_icon, chevron_rect, self.tokens.text_secondary);

            // Folder-plus button on the far right of "This PC" row
            let add_btn_rect = Rect::from_min_size(
                Pos2::new(this_pc_row.max.x - 30.0, this_pc_row.center().y - 12.0),
                vec2(24.0, 24.0),
            );
            let add_resp = ui.allocate_rect(add_btn_rect, Sense::click());
            if add_resp.hovered() {
                ui.painter().rect_filled(
                    add_btn_rect,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.hover_fill,
                );
            }
            self.icons.paint_icon(
                ui,
                "folder-plus",
                add_btn_rect.shrink(4.0),
                if add_resp.hovered() {
                    self.tokens.text_primary
                } else {
                    self.tokens.text_secondary
                },
            );
            if add_resp.clicked() {
                action = ShellAction::AddFolderPicker;
            }

            if this_pc_resp.clicked() && !add_resp.clicked() {
                state.toggle_this_pc();
            }

            current_y += dimensions::NAV_ROW_HEIGHT + 4.0;

            // Child folders in This PC
            if state.this_pc_expanded {
                if state.root_folders.is_empty() {
                    // Empty state row with inline "Add a folder" button
                    let empty_row = Rect::from_min_size(
                        Pos2::new(rect.min.x + 24.0, current_y),
                        vec2(rect.width() - 32.0, dimensions::NAV_ROW_HEIGHT),
                    );
                    ui.painter().text(
                        Pos2::new(empty_row.min.x, empty_row.center().y),
                        Align2::LEFT_CENTER,
                        "No folders added · ",
                        FontId::proportional(typography::SECONDARY),
                        self.tokens.text_secondary,
                    );
                    let add_inline_rect = Rect::from_min_size(
                        Pos2::new(empty_row.min.x + 104.0, empty_row.center().y - 12.0),
                        vec2(80.0, 24.0),
                    );
                    let add_inline_resp = ui.allocate_rect(add_inline_rect, Sense::click());
                    if add_inline_resp.hovered() {
                        ui.painter().rect_filled(
                            add_inline_rect,
                            CornerRadius::same(radii::CONTROLS),
                            self.tokens.hover_fill,
                        );
                    }
                    ui.painter().text(
                        add_inline_rect.center(),
                        Align2::CENTER_CENTER,
                        "Add folder",
                        FontId::proportional(typography::SECONDARY),
                        self.tokens.accent,
                    );
                    if add_inline_resp.clicked() {
                        action = ShellAction::AddFolderPicker;
                    }
                } else {
                    let mut tree_actions = Vec::new();
                    let root_nodes = state.root_folders.clone();
                    for node in &root_nodes {
                        self.render_tree_node(
                            ui,
                            rect,
                            node,
                            0,
                            &mut current_y,
                            state,
                            &mut tree_actions,
                        );
                    }
                    if let Some(act) = tree_actions.into_iter().next() {
                        action = act;
                    }
                }
            }
        }

        // 4. Pinned Bottom Navigation: Theme and Settings
        let bottom_pad = 8.0;
        let settings_row = Rect::from_min_size(
            Pos2::new(
                rect.min.x + 8.0,
                rect.max.y - bottom_pad - dimensions::NAV_ROW_HEIGHT,
            ),
            vec2(rect.width() - 16.0, dimensions::NAV_ROW_HEIGHT),
        );
        let theme_row = Rect::from_min_size(
            Pos2::new(
                rect.min.x + 8.0,
                settings_row.min.y - dimensions::NAV_ROW_HEIGHT - 4.0,
            ),
            vec2(rect.width() - 16.0, dimensions::NAV_ROW_HEIGHT),
        );

        // Divider above bottom rows
        ui.painter().hline(
            (rect.min.x + 8.0)..=(rect.max.x - 8.0),
            theme_row.min.y - 8.0,
            Stroke::new(1.0, self.tokens.divider),
        );

        // Theme Row
        let theme_resp = ui.allocate_rect(theme_row, Sense::click());
        if theme_resp.hovered() {
            ui.painter().rect_filled(
                theme_row,
                CornerRadius::same(radii::CONTROLS),
                self.tokens.hover_fill,
            );
        }
        let theme_icon_rect = Rect::from_min_size(
            Pos2::new(
                theme_row.min.x + 10.0,
                theme_row.center().y - (dimensions::ICON_SIZE_NAV / 2.0),
            ),
            vec2(dimensions::ICON_SIZE_NAV, dimensions::ICON_SIZE_NAV),
        );
        self.icons
            .paint_icon(ui, "palette", theme_icon_rect, self.tokens.text_secondary);
        if !state.is_nav_collapsed {
            ui.painter().text(
                Pos2::new(theme_icon_rect.max.x + 12.0, theme_row.center().y),
                Align2::LEFT_CENTER,
                "Theme",
                FontId::proportional(typography::NAV_ITEM),
                self.tokens.text_secondary,
            );
        }
        if theme_resp.clicked() {
            state.selected_nav = NavItem::Theme;
            action = ShellAction::SelectNav(NavItem::Theme);
        }

        // Settings Row
        let set_resp = ui.allocate_rect(settings_row, Sense::click());
        if set_resp.hovered() {
            ui.painter().rect_filled(
                settings_row,
                CornerRadius::same(radii::CONTROLS),
                self.tokens.hover_fill,
            );
        }
        let set_icon_rect = Rect::from_min_size(
            Pos2::new(
                settings_row.min.x + 10.0,
                settings_row.center().y - (dimensions::ICON_SIZE_NAV / 2.0),
            ),
            vec2(dimensions::ICON_SIZE_NAV, dimensions::ICON_SIZE_NAV),
        );
        self.icons
            .paint_icon(ui, "settings", set_icon_rect, self.tokens.text_secondary);
        if !state.is_nav_collapsed {
            ui.painter().text(
                Pos2::new(set_icon_rect.max.x + 12.0, settings_row.center().y),
                Align2::LEFT_CENTER,
                "Settings",
                FontId::proportional(typography::NAV_ITEM),
                self.tokens.text_secondary,
            );
        }
        if set_resp.clicked() {
            state.selected_nav = NavItem::Settings;
            action = ShellAction::SelectNav(NavItem::Settings);
        }

        action
    }

    /// Render a tree row in "This PC"
    #[allow(clippy::too_many_arguments)]
    fn render_tree_node(
        &self,
        ui: &mut Ui,
        nav_rect: Rect,
        node: &FolderTreeNode,
        depth: usize,
        current_y: &mut f32,
        state: &mut ShellState,
        actions: &mut Vec<ShellAction>,
    ) {
        let indent = 16.0 + (depth as f32 * dimensions::TREE_INDENT_PER_LEVEL);
        let row_rect = Rect::from_min_size(
            Pos2::new(nav_rect.min.x + 8.0, *current_y),
            vec2(nav_rect.width() - 16.0, dimensions::TREE_ROW_HEIGHT),
        );

        let is_selected = state.selected_folder.as_ref() == Some(&node.path);
        let row_resp = ui.allocate_rect(row_rect, Sense::click_and_drag());

        if row_resp.hovered() {
            ui.painter().rect_filled(
                row_rect,
                CornerRadius::same(radii::CONTROLS),
                self.tokens.hover_fill,
            );
        }
        if is_selected {
            ui.painter().rect_filled(
                row_rect,
                CornerRadius::same(radii::CONTROLS),
                self.tokens.selected_fill,
            );
            ui.painter().rect_stroke(
                row_rect.shrink(0.5),
                CornerRadius::same(radii::CONTROLS),
                Stroke::new(1.0, self.tokens.accent),
                StrokeKind::Inside,
            );
            // Vertical accent pill indicator on left edge (matching Image 9)
            let indicator = Rect::from_min_size(
                Pos2::new(row_rect.min.x + indent - 10.0, row_rect.center().y - 8.0),
                vec2(3.0, 16.0),
            );
            ui.painter().rect_filled(indicator, CornerRadius::same(1), self.tokens.accent);
        }

        // Folder Icon
        let folder_icon_rect = Rect::from_min_size(
            Pos2::new(
                row_rect.min.x + indent,
                row_rect.center().y - (dimensions::ICON_SIZE_TREE / 2.0),
            ),
            vec2(dimensions::ICON_SIZE_TREE, dimensions::ICON_SIZE_TREE),
        );

        if node.is_missing {
            self.icons
                .paint_icon(ui, "warning", folder_icon_rect, self.tokens.warning);
        } else {
            let icon_id = if node.is_expanded {
                "folder-open"
            } else {
                "folder"
            };
            self.icons.paint_icon(
                ui,
                icon_id,
                folder_icon_rect,
                if is_selected {
                    self.tokens.accent
                } else {
                    self.tokens.text_secondary
                },
            );
        }

        // Folder Name
        let name_pos = Pos2::new(folder_icon_rect.max.x + 8.0, row_rect.center().y);
        let count_key = valor_core::path_utils::normalize_path_string(&node.path.to_string_lossy());
        let count_suffix = state
            .folder_counts
            .get(&count_key)
            .map(|count| format!(" ({count})"))
            .unwrap_or_default();
        let label_text = if node.is_missing {
            format!("{} (Missing){}", node.name, count_suffix)
        } else {
            format!("{}{}", node.name, count_suffix)
        };

        let galley = ui.painter().layout_no_wrap(
            label_text,
            FontId::proportional(typography::BODY),
            if is_selected {
                self.tokens.text_primary
            } else {
                self.tokens.text_secondary
            },
        );
        ui.painter().galley(
            name_pos - vec2(0.0, galley.size().y / 2.0),
            galley,
            self.tokens.text_primary,
        );

        // Chevron if subfolders exist
        let mut chevron_toggled = false;
        if node.has_subfolders {
            let chevron_icon = if node.is_expanded {
                "chevron-up"
            } else {
                "chevron-down"
            };
            let chevron_rect = Rect::from_min_size(
                Pos2::new(row_rect.max.x - 24.0, row_rect.center().y - 8.0),
                vec2(16.0, 16.0),
            );
            let chev_resp = ui.allocate_rect(chevron_rect, Sense::click());
            self.icons
                .paint_icon(ui, chevron_icon, chevron_rect, self.tokens.text_secondary);
            if chev_resp.clicked() {
                state.toggle_node_expansion(&node.path);
                chevron_toggled = true;
            }
        }

        // Context menu on right click
        if row_resp.secondary_clicked() {
            state.context_menu = Some(crate::shell_state::FolderContextMenu {
                path: node.path.clone(),
                position: row_resp.interact_pointer_pos().unwrap_or(row_rect.center()),
                is_root: depth == 0,
            });
        }

        if row_resp.clicked() && !chevron_toggled {
            if node.has_subfolders {
                state.toggle_node_expansion(&node.path);
            }
            state.selected_folder = Some(node.path.clone());
            actions.push(ShellAction::SelectFolder(node.path.clone()));
        }

        *current_y += dimensions::TREE_ROW_HEIGHT;

        // Render children recursively if expanded
        if node.is_expanded {
            for child in &node.children {
                self.render_tree_node(ui, nav_rect, child, depth + 1, current_y, state, actions);
            }
        }
    }

    /// Render Content Area Header Toolbar and Minimal Home Page
    #[allow(clippy::too_many_arguments)]
    fn render_content(
        &self,
        ui: &mut Ui,
        rect: Rect,
        state: &mut ShellState,
        total_videos: usize,
        _total_photos: usize,
        items: &[MediaItem],
        history: &[HistoryEntry],
        sessions: &[valor_core::models::WatchSession],
        positions: &std::collections::HashMap<String, valor_core::models::PlaybackPosition>,
        textures: &mut crate::texture_cache::LruTextureCache,
    ) -> ShellAction {
        let mut action = ShellAction::None;

        if state.selected_folder.is_none() && state.selected_nav == NavItem::History {
            return crate::media_pages::render_history(
                ui,
                state,
                history,
                sessions,
                items,
                self.tokens,
                textures,
            );
        }
        if state.selected_folder.is_none() && state.selected_nav == NavItem::Library {
            return crate::media_pages::render_library(
                ui,
                state,
                items,
                positions,
                self.tokens,
                textures,
            );
        }
        if state.selected_folder.is_none() && state.selected_nav == NavItem::Settings {
            return crate::settings_page::render(ui, state, self.tokens, self.icons);
        }

        let content_pad_x = if ui.ctx().content_rect().width() >= layout::PAGE_PAD_WIDE_THRESHOLD {
            layout::PAGE_PAD_X_WIDE
        } else {
            layout::PAGE_PAD_X_NARROW
        };

        // 1. Content Header & Toolbar Row
        let header_top = rect.min.y + layout::PAGE_PAD_TOP;
        let header_left = rect.min.x + content_pad_x;

        // Determine Page Title and Icon
        let (page_title, page_icon) = if let Some(path) = &state.selected_folder {
            let name = path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| "Folder".into());
            (name, "folder")
        } else {
            match state.selected_nav {
                NavItem::Home => ("Home".to_string(), "home"),
                NavItem::Library => ("Library".to_string(), "nav.library"),
                NavItem::Playlists => ("Playlists".to_string(), "folder-plus"),
                NavItem::History => ("History".to_string(), "history"),
                NavItem::Scans => ("Scans".to_string(), "folder-open"),
                NavItem::Stats => ("Stats".to_string(), "dock.studio"),
                NavItem::Theme => ("Themes".to_string(), "nav.theme"),
                NavItem::Settings => ("Settings".to_string(), "settings"),
            }
        };

        // Title Icon + Name
        let title_icon_rect = Rect::from_min_size(
            Pos2::new(header_left, header_top + 4.0),
            vec2(layout::TITLE_ICON_SIZE, layout::TITLE_ICON_SIZE),
        );
        self.icons
            .paint_icon(ui, page_icon, title_icon_rect, self.tokens.text_primary);

        let title_pos = Pos2::new(title_icon_rect.max.x + layout::ICON_GAP, header_top);
        let title_font = FontId::proportional(layout::TITLE_SIZE);
        let title_text_right =
            rect.max.x - content_pad_x - layout::TOOLBAR_BASE_W - layout::TIMELINE_RESERVE_W;
        let title_text_width = (title_text_right - title_pos.x).max(0.0);
        let painter = ui.painter();
        let mut visible_title = page_title.clone();
        while !visible_title.is_empty()
            && painter
                .layout_no_wrap(
                    visible_title.clone(),
                    title_font.clone(),
                    self.tokens.text_primary,
                )
                .size()
                .x
                > title_text_width
        {
            visible_title.pop();
        }
        if visible_title.len() < page_title.len() && title_text_width > 0.0 {
            visible_title.push('…');
        }
        painter.text(
            title_pos,
            Align2::LEFT_TOP,
            visible_title,
            title_font,
            self.tokens.text_primary,
        );

        let summary_text = if state.selected_folder.is_some() {
            format!(
                "{} videos",
                items
                    .iter()
                    .filter(|item| valor_core::path_utils::path_is_within(
                        PathBuf::from(&item.file_path).as_path(),
                        state.selected_folder.as_ref().unwrap(),
                    ))
                    .count()
            )
        } else if state.selected_nav == NavItem::History {
            format!("{} recent sessions", history.len())
        } else if state.selected_nav == NavItem::Home || state.selected_nav == NavItem::Library {
            format!("{} videos", total_videos)
        } else {
            String::new()
        };
        let summary_pos = Pos2::new(
            header_left,
            header_top + layout::TITLE_SIZE + layout::TITLE_TO_SUMMARY,
        );
        if !summary_text.is_empty() {
            ui.painter().text(
                summary_pos,
                Align2::LEFT_TOP,
                summary_text,
                FontId::proportional(typography::SUMMARY_TEXT),
                self.tokens.text_secondary,
            );
        }

        // Right-aligned Toolbar Controls (only on Home / folder views):
        // [Select] [Play/Slideshow] [Sort v] [Filter v] [Grid/List] [View v] [...]
        let toolbar_h = dimensions::TOOLBAR_HEIGHT;
        let mut tb_right = rect.max.x - content_pad_x;
        let show_gallery_toolbar =
            state.selected_nav == NavItem::Home || state.selected_folder.is_some();

        if show_gallery_toolbar && state.select_mode {
            let selected_count = state.selected_media.len();
            ui.painter().text(
                Pos2::new(header_left, header_top + 12.0),
                Align2::LEFT_CENTER,
                format!("{selected_count} selected"),
                FontId::proportional(typography::BODY),
                self.tokens.text_primary,
            );
            let clear = Rect::from_min_size(
                Pos2::new(tb_right - 72.0, header_top),
                vec2(72.0, toolbar_h),
            );
            let clear_resp = ui.allocate_rect(clear, Sense::click());
            ui.painter().text(
                clear.center(),
                Align2::CENTER_CENTER,
                "Clear",
                FontId::proportional(typography::BODY),
                self.tokens.text_secondary,
            );
            if clear_resp.clicked() {
                state.selected_media.clear();
                state.select_mode = false;
            }
        } else if !show_gallery_toolbar {
            // Non-gallery views (Themes, History, Scans, Playlists) do not render the Home toolbar.
        } else {
            // Overflow More Button [...]
            let more_rect = Rect::from_min_size(
                Pos2::new(tb_right - dimensions::TOOLBAR_BUTTON_SIZE, header_top),
                vec2(dimensions::TOOLBAR_BUTTON_SIZE, toolbar_h),
            );
            let more_resp = ui.allocate_rect(more_rect, Sense::click());
            if more_resp.hovered() {
                ui.painter().rect_filled(
                    more_rect,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.hover_fill,
                );
            }
            self.icons.paint_icon(
                ui,
                "more-horizontal",
                more_rect.shrink(6.0),
                self.tokens.text_secondary,
            );
            if more_resp.clicked() {
                state.toggle_popup(ActivePopupMenu::Overflow);
            }
            tb_right -= dimensions::TOOLBAR_BUTTON_SIZE + spacing::TOOLBAR_GAP;

            // View Mode Button [View v]
            let view_w = layout::TOOLBAR_DROPDOWN_W;
            let view_rect = Rect::from_min_size(
                Pos2::new(tb_right - view_w, header_top),
                vec2(view_w, toolbar_h),
            );
            let view_resp = ui.allocate_rect(view_rect, Sense::click());
            if view_resp.hovered() {
                ui.painter().rect_filled(
                    view_rect,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.hover_fill,
                );
            }
            let view_icon = if state.gallery_layout == GalleryLayout::River {
                "view-grid"
            } else {
                "grid"
            };
            self.icons.paint_icon(
                ui,
                view_icon,
                Rect::from_min_size(
                    view_rect.min
                        + vec2(
                            layout::TOOLBAR_DROPDOWN_PAD,
                            (toolbar_h - layout::ICON_BOX) * 0.5,
                        ),
                    vec2(layout::ICON_BOX, layout::ICON_BOX),
                ),
                self.tokens.text_secondary,
            );
            self.icons.paint_icon(
                ui,
                "chevron-down",
                Rect::from_min_size(
                    view_rect.min
                        + vec2(
                            layout::TOOLBAR_DROPDOWN_PAD + layout::ICON_BOX + layout::TOOLBAR_GAP,
                            (toolbar_h - layout::TOOLBAR_CHEVRON_SIZE) * 0.5,
                        ),
                    vec2(layout::TOOLBAR_CHEVRON_SIZE, layout::TOOLBAR_CHEVRON_SIZE),
                ),
                self.tokens.text_secondary,
            );
            if view_resp.clicked() {
                state.toggle_popup(ActivePopupMenu::View);
            }
            tb_right -= view_w + spacing::TOOLBAR_GAP;

            // Direct Grid / List square toggle buttons
            for (is_list, lbl) in [(true, "List"), (false, "Grid")] {
                let active = (state.library_view == crate::view_models::ViewMode::List) == is_list;
                let bw = 44.0;
                let b_rect = Rect::from_min_size(
                    Pos2::new(tb_right - bw, header_top),
                    vec2(bw, toolbar_h),
                );
                let b_resp = ui.allocate_rect(b_rect, Sense::click());
                if b_resp.hovered() {
                    ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
                }
                ui.painter().rect(
                    b_rect,
                    CornerRadius::ZERO,
                    if active {
                        self.tokens.accent
                    } else if b_resp.hovered() {
                        self.tokens.hover_fill
                    } else {
                        self.tokens.field_fill
                    },
                    Stroke::new(1.0, if active { self.tokens.accent } else { self.tokens.divider }),
                    StrokeKind::Inside,
                );
                ui.painter().text(
                    b_rect.center(),
                    Align2::CENTER_CENTER,
                    lbl,
                    FontId::proportional(11.5),
                    if active { Color32::WHITE } else { self.tokens.text_secondary },
                );
                if b_resp.clicked() {
                    state.library_view = if is_list {
                        crate::view_models::ViewMode::List
                    } else {
                        crate::view_models::ViewMode::Grid
                    };
                }
                tb_right -= bw + 4.0;
            }
            tb_right -= spacing::TOOLBAR_GAP;

            // Filter Button [Filter v] with accent dot when active
            let filter_w = view_w;
            let filter_rect = Rect::from_min_size(
                Pos2::new(tb_right - filter_w, header_top),
                vec2(filter_w, toolbar_h),
            );
            let filter_resp = ui.allocate_rect(filter_rect, Sense::click());
            if filter_resp.hovered() {
                ui.painter().rect_filled(
                    filter_rect,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.hover_fill,
                );
            }
            self.icons.paint_icon(
                ui,
                "filter",
                Rect::from_min_size(
                    filter_rect.min
                        + vec2(
                            layout::TOOLBAR_DROPDOWN_PAD,
                            (toolbar_h - layout::ICON_BOX) * 0.5,
                        ),
                    vec2(layout::ICON_BOX, layout::ICON_BOX),
                ),
                if state.filter_choice.is_active() {
                    self.tokens.accent
                } else {
                    self.tokens.text_secondary
                },
            );
            self.icons.paint_icon(
                ui,
                "chevron-down",
                Rect::from_min_size(
                    filter_rect.min
                        + vec2(
                            layout::TOOLBAR_DROPDOWN_PAD + layout::ICON_BOX + layout::TOOLBAR_GAP,
                            (toolbar_h - layout::TOOLBAR_CHEVRON_SIZE) * 0.5,
                        ),
                    vec2(layout::TOOLBAR_CHEVRON_SIZE, layout::TOOLBAR_CHEVRON_SIZE),
                ),
                self.tokens.text_secondary,
            );
            if state.filter_choice.is_active() {
                // Blue dot indicator
                ui.painter().circle_filled(
                    Pos2::new(filter_rect.min.x + 8.0, filter_rect.min.y + 8.0),
                    3.0,
                    self.tokens.accent,
                );
            }
            if filter_resp.clicked() {
                state.toggle_popup(ActivePopupMenu::Filter);
            }
            tb_right -= filter_w + spacing::TOOLBAR_GAP;

            // Sort Button [Sort v]
            let sort_w = view_w;
            let sort_rect = Rect::from_min_size(
                Pos2::new(tb_right - sort_w, header_top),
                vec2(sort_w, toolbar_h),
            );
            let sort_resp = ui.allocate_rect(sort_rect, Sense::click());
            if sort_resp.hovered() {
                ui.painter().rect_filled(
                    sort_rect,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.hover_fill,
                );
            }
            self.icons.paint_icon(
                ui,
                "arrow-up-down",
                Rect::from_min_size(
                    sort_rect.min
                        + vec2(
                            layout::TOOLBAR_DROPDOWN_PAD,
                            (toolbar_h - layout::ICON_BOX) * 0.5,
                        ),
                    vec2(layout::ICON_BOX, layout::ICON_BOX),
                ),
                self.tokens.text_secondary,
            );
            self.icons.paint_icon(
                ui,
                "chevron-down",
                Rect::from_min_size(
                    sort_rect.min
                        + vec2(
                            layout::TOOLBAR_DROPDOWN_PAD + layout::ICON_BOX + layout::TOOLBAR_GAP,
                            (toolbar_h - layout::TOOLBAR_CHEVRON_SIZE) * 0.5,
                        ),
                    vec2(layout::TOOLBAR_CHEVRON_SIZE, layout::TOOLBAR_CHEVRON_SIZE),
                ),
                self.tokens.text_secondary,
            );
            if sort_resp.clicked() {
                state.toggle_popup(ActivePopupMenu::Sort);
            }
            tb_right -= sort_w + spacing::TOOLBAR_GAP;

            // Select Button [Select]
            let select_w = 84.0;
            let select_rect = Rect::from_min_size(
                Pos2::new(tb_right - select_w, header_top),
                vec2(select_w, toolbar_h),
            );
            let select_resp = ui.allocate_rect(select_rect, Sense::click());
            if select_resp.hovered() {
                ui.painter().rect_filled(
                    select_rect,
                    CornerRadius::same(radii::CONTROLS),
                    self.tokens.hover_fill,
                );
                if state.select_mode {
                    ui.painter().rect_filled(
                        select_rect,
                        CornerRadius::same(radii::CONTROLS),
                        self.tokens.selected_fill,
                    );
                    ui.painter().rect_stroke(
                        select_rect,
                        CornerRadius::same(radii::CONTROLS),
                        Stroke::new(1.0, self.tokens.accent),
                        StrokeKind::Inside,
                    );
                }
                self.icons.paint_icon(
                    ui,
                    "check-square",
                    Rect::from_min_size(
                        Pos2::new(select_rect.min.x + 8.0, select_rect.center().y - 8.0),
                        vec2(16.0, 16.0),
                    ),
                    if state.select_mode {
                        self.tokens.accent
                    } else {
                        self.tokens.text_secondary
                    },
                );
                ui.painter().text(
                    Pos2::new(select_rect.min.x + 30.0, select_rect.center().y),
                    Align2::LEFT_CENTER,
                    "Select",
                    FontId::proportional(typography::BODY),
                    if state.select_mode {
                        self.tokens.text_primary
                    } else {
                        self.tokens.text_secondary
                    },
                );
                if select_resp.clicked() {
                    state.select_mode = !state.select_mode;
                    if !state.select_mode {
                        state.selected_media.clear();
                    }
                }
            }
        }

        // Section divider under toolbar
        let divider_y = summary_pos.y + layout::SUMMARY_LINE_H + layout::SUMMARY_TO_FIRST_HEADING;
        ui.painter().hline(
            (rect.min.x + content_pad_x)..=(rect.max.x - content_pad_x),
            layout::snap_to_pixel(divider_y, ui.ctx().pixels_per_point()),
            Stroke::new(1.0, self.tokens.divider),
        );

        // Gallery is shared by Home, Library, and folder-scoped views.
        let body_y = divider_y + layout::HEADING_TO_CONTENT;
        if state.selected_nav == NavItem::Scans && state.selected_folder.is_none() {
            let body_rect = Rect::from_min_max(
                Pos2::new(header_left, body_y),
                Pos2::new(rect.max.x - content_pad_x, rect.max.y - 16.0),
            );
            let mut body = ui.new_child(egui::UiBuilder::new().max_rect(body_rect));
            egui::ScrollArea::vertical().show(&mut body, |ui| {
                ui.horizontal(|ui| {
                    ui.heading("Folder scans");
                    if ui.button("Scan all folders").clicked() {
                        action = ShellAction::ScanAllFolders;
                    }
                    if ui.button("Add folder").clicked() {
                        action = ShellAction::AddFolderPicker;
                    }
                });
                ui.label(
                    "Start or rerun a scan for any watched folder. Scans run in the background.",
                );
                ui.add_space(16.0);
                for root in &state.root_folders {
                    ui.group(|ui| {
                        ui.set_min_width(ui.available_width());
                        ui.horizontal(|ui| {
                            ui.vertical(|ui| {
                                ui.label(egui::RichText::new(&root.name).strong());
                                ui.label(
                                    egui::RichText::new(root.path.display().to_string())
                                        .color(self.tokens.text_secondary),
                                );
                                let status = state
                                    .scan_status
                                    .get(&root.path)
                                    .map(String::as_str)
                                    .unwrap_or("Not scanned yet");
                                ui.label(
                                    egui::RichText::new(status).color(self.tokens.text_secondary),
                                );
                            });
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                if ui.button("Remove").clicked() {
                                    action = ShellAction::RemoveFolder(root.path.clone());
                                }
                                if ui.button("Scan now").clicked() {
                                    action = ShellAction::ScanFolder(root.path.clone());
                                }
                            });
                        });
                    });
                    ui.add_space(8.0);
                }
                if !state.excluded_paths.is_empty() {
                    ui.add_space(8.0);
                    ui.heading("Excluded subfolders");
                    for path in &state.excluded_paths {
                        ui.horizontal(|ui| {
                            ui.label(path.display().to_string());
                            if ui.button("Include again").clicked() {
                                action = ShellAction::IncludeSubfolder(path.clone());
                            }
                        });
                    }
                }
                ui.add_space(20.0);
                let valid_scanned: Vec<&MediaItem> = items
                    .iter()
                    .filter(|item| {
                        item.size_bytes >= 100 * 1024 * 1024
                            && !state.excluded_paths.iter().any(|ex| {
                                valor_core::path_utils::path_is_within(std::path::Path::new(&item.file_path), ex)
                            })
                    })
                    .collect();
                ui.heading(format!("Scanned videos · {}", valid_scanned.len()));
                ui.add_space(8.0);
                let width = ui.available_width();
                let columns = (width / 190.0).floor().max(1.0) as usize;
                egui::Grid::new("scanned_media_grid")
                    .num_columns(columns)
                    .spacing(vec2(12.0, 12.0))
                    .show(ui, |ui| {
                        for (index, item) in valid_scanned.iter().enumerate() {
                            ui.vertical(|ui| {
                                let (rect, _) =
                                    ui.allocate_exact_size(vec2(176.0, 116.0), Sense::hover());
                                ui.painter().rect_filled(
                                    rect,
                                    CornerRadius::same(8),
                                    self.tokens.field_fill,
                                );
                                let thumb = directories::ProjectDirs::from("com", "valor", "Valor")
                                    .map(|dirs| {
                                        dirs.cache_dir()
                                            .join("thumbnails")
                                            .join(format!("{}.jpg", item.fingerprint))
                                    });
                                if let Some(tex) = thumb.as_ref().and_then(|path| {
                                    textures.get_or_request(ui.ctx(), &item.fingerprint, Some(path))
                                }) {
                                    ui.painter().image(
                                        tex.id(),
                                        rect,
                                        Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0)),
                                        Color32::WHITE,
                                    );
                                } else {
                                    ui.painter().text(
                                        rect.center(),
                                        Align2::CENTER_CENTER,
                                        item.title.chars().next().unwrap_or('▶').to_string(),
                                        FontId::proportional(36.0),
                                        self.tokens.text_primary,
                                    );
                                }
                                ui.add_space(4.0);
                                ui.label(egui::RichText::new(&item.title).strong());
                                ui.label(
                                    egui::RichText::new(&item.file_path)
                                        .size(typography::SECONDARY)
                                        .color(self.tokens.text_secondary),
                                );
                            });
                            if (index + 1) % columns == 0 {
                                ui.end_row();
                            }
                        }
                    });
            });
        } else if state.selected_nav == NavItem::History && state.selected_folder.is_none() {
            if history.is_empty() {
                ui.painter().text(
                    Pos2::new(header_left, body_y),
                    Align2::LEFT_TOP,
                    "Nothing in your history yet.",
                    FontId::proportional(typography::BODY),
                    self.tokens.text_secondary,
                );
            } else {
                self.render_history_rows(
                    ui,
                    header_left,
                    body_y,
                    rect.max.x - content_pad_x,
                    history,
                    &mut action,
                );
            }
        } else if state.selected_nav == NavItem::Playlists && state.selected_folder.is_none() {
            let content_rect = Rect::from_min_max(
                Pos2::new(header_left, body_y),
                Pos2::new(rect.max.x - content_pad_x, rect.max.y - 16.0),
            );
            let mut sub_ui = ui.new_child(egui::UiBuilder::new().max_rect(content_rect));
            egui::ScrollArea::vertical()
                .id_salt("playlists_nav_scroll")
                .show(&mut sub_ui, |ui| {
                    crate::playlists_tab::render_playlists_view(
                        ui,
                        state,
                        items,
                        &self.tokens,
                        &mut action,
                    );
                });
        } else if state.selected_nav == NavItem::Theme && state.selected_folder.is_none() {
            let content_rect = Rect::from_min_max(
                Pos2::new(header_left, body_y),
                Pos2::new(rect.max.x - content_pad_x, rect.max.y - 16.0),
            );
            let mut sub_ui = ui.new_child(egui::UiBuilder::new().max_rect(content_rect));
            egui::ScrollArea::vertical()
                .id_salt("themes_nav_scroll")
                .show(&mut sub_ui, |ui| {
                    let themes = [
                        ("cloudflare-docs", "Cloudflare Docs", Color32::from_rgb(13, 17, 23), Color32::from_rgb(47, 129, 247)),
                        ("oled-black", "OLED Super Black", Color32::BLACK, Color32::from_rgb(246, 130, 31)),
                        ("github-midnight", "GitHub Midnight", Color32::from_rgb(13, 17, 23), Color32::from_rgb(31, 111, 235)),
                        ("vlc", "VLC Classic", Color32::from_rgb(37, 37, 38), Color32::from_rgb(255, 136, 0)),
                        ("netflix", "Netflix", Color32::from_rgb(20, 20, 20), Color32::from_rgb(229, 9, 20)),
                        ("youtube", "YouTube Player", Color32::from_rgb(15, 15, 15), Color32::from_rgb(62, 166, 255)),
                        ("valor-purple", "Obsidian Violet", Color32::from_rgb(16, 16, 16), Color32::from_rgb(168, 85, 247)),
                        ("cyber-crimson", "Cyber Crimson", Color32::from_rgb(12, 10, 15), Color32::from_rgb(244, 63, 94)),
                        ("emerald-studio", "Emerald Studio", Color32::from_rgb(11, 17, 14), Color32::from_rgb(16, 185, 129)),
                    ];
                    ui.label(
                        egui::RichText::new("COLOR THEMES")
                            .size(11.5)
                            .strong()
                            .color(self.tokens.text_tertiary),
                    );
                    ui.add_space(10.0);
                    ui.horizontal_wrapped(|ui| {
                        ui.spacing_mut().item_spacing = vec2(12.0, 12.0);
                        for (id, label, bg_col, accent_col) in themes {
                            let active = state.settings.skin_id == id;
                            let (card_rect, resp) = ui.allocate_exact_size(vec2(190.0, 74.0), Sense::click());
                            if resp.hovered() {
                                ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
                            }
                            ui.painter().rect(
                                card_rect,
                                CornerRadius::ZERO,
                                if active { self.tokens.selected_fill } else { bg_col },
                                Stroke::new(
                                    if active { 2.0 } else { 1.0 },
                                    if active { accent_col } else if resp.hovered() { self.tokens.text_secondary } else { self.tokens.divider },
                                ),
                                StrokeKind::Inside,
                            );
                            let swatch = Rect::from_min_size(
                                Pos2::new(card_rect.left() + 12.0, card_rect.center().y - 10.0),
                                vec2(20.0, 20.0),
                            );
                            ui.painter().rect_filled(swatch, CornerRadius::ZERO, accent_col);
                            ui.painter().text(
                                Pos2::new(swatch.right() + 10.0, card_rect.center().y - 7.0),
                                Align2::LEFT_CENTER,
                                label,
                                FontId::proportional(13.0),
                                self.tokens.text_primary,
                            );
                            ui.painter().text(
                                Pos2::new(swatch.right() + 10.0, card_rect.center().y + 9.0),
                                Align2::LEFT_CENTER,
                                if active { "Active" } else { "Click to apply" },
                                FontId::proportional(11.0),
                                if active { accent_col } else { self.tokens.text_tertiary },
                            );
                            if resp.clicked() {
                                state.settings.skin_id = id.to_string();
                                state.settings.accent_color.clear();
                                let _ = state.settings.save();
                            }
                        }
                    });
                    ui.add_space(20.0);
                    ui.label(
                        egui::RichText::new("ACCENT COLOR OVERRIDE")
                            .size(11.5)
                            .strong()
                            .color(self.tokens.text_tertiary),
                    );
                    ui.add_space(8.0);
                    ui.horizontal_wrapped(|ui| {
                        ui.spacing_mut().item_spacing = vec2(8.0, 8.0);
                        for (hex, name, col) in [
                            ("#2F81F7", "Cloudflare Blue", Color32::from_rgb(47, 129, 247)),
                            ("#1F6FEB", "GitHub Blue", Color32::from_rgb(31, 111, 235)),
                            ("#10B981", "Emerald", Color32::from_rgb(16, 185, 129)),
                            ("#A855F7", "Violet", Color32::from_rgb(168, 85, 247)),
                            ("#F43F5E", "Crimson", Color32::from_rgb(244, 63, 94)),
                            ("#F6821F", "Amber", Color32::from_rgb(246, 130, 31)),
                        ] {
                            let is_cur = state.settings.accent_color.eq_ignore_ascii_case(hex);
                            if ui
                                .add(
                                    egui::Button::new(
                                        egui::RichText::new(format!("■  {name}"))
                                            .size(12.0)
                                            .color(if is_cur { Color32::WHITE } else { self.tokens.text_primary }),
                                    )
                                    .fill(if is_cur { col } else { self.tokens.card_fill })
                                    .stroke(Stroke::new(1.0, if is_cur { col } else { self.tokens.divider }))
                                    .corner_radius(CornerRadius::ZERO),
                                )
                                .clicked()
                            {
                                state.settings.accent_color = hex.to_string();
                                let _ = state.settings.save();
                            }
                        }
                        if ui
                            .add(
                                egui::Button::new(
                                    egui::RichText::new("Reset Accent")
                                        .size(12.0)
                                        .color(self.tokens.text_secondary),
                                )
                                .fill(self.tokens.field_fill)
                                .stroke(Stroke::new(1.0, self.tokens.divider))
                                .corner_radius(CornerRadius::ZERO),
                            )
                            .clicked()
                        {
                            state.settings.accent_color.clear();
                            let _ = state.settings.save();
                        }
                    });
                });
        } else if state.selected_nav == NavItem::Home
            || state.selected_nav == NavItem::Library
            || state.selected_folder.is_some()
        {
            let search_q = state.search_query.trim().to_lowercase();
            let mut gallery_items: Vec<MediaItem> = items
                .iter()
                .filter(|item| {
                    if item.is_missing || item.size_bytes < 100 * 1024 * 1024 {
                        return false;
                    }
                    let path_low = item.file_path.to_lowercase();
                    if path_low.contains("$recycle.bin") || path_low.contains(".trash") {
                        return false;
                    }
                    if !search_q.is_empty()
                        && !item.title.to_lowercase().contains(&search_q)
                        && !path_low.contains(&search_q)
                    {
                        return false;
                    }
                    let item_path = PathBuf::from(&item.file_path);
                    if state.excluded_paths.iter().any(|ex| {
                        valor_core::path_utils::path_is_within(&item_path, ex)
                    }) {
                        return false;
                    }
                    state.selected_folder.as_ref().is_none_or(|folder| {
                        valor_core::path_utils::path_is_within(
                            &item_path,
                            folder,
                        )
                    })
                })
                .cloned()
                .collect();
            // Deduplicate by fingerprint and normalized file_path (prefer entry with duration > 0)
            {
                let mut dedup: std::collections::HashMap<String, MediaItem> =
                    std::collections::HashMap::new();
                let mut seen_paths: std::collections::HashSet<String> =
                    std::collections::HashSet::new();
                for item in gallery_items {
                    let norm_path = item.file_path.replace('/', "\\").to_lowercase();
                    let fp_key = if item.fingerprint.is_empty() {
                        norm_path.clone()
                    } else {
                        item.fingerprint.clone()
                    };
                    if let Some(existing) = dedup.get_mut(&fp_key) {
                        if existing.duration <= 0.0 && item.duration > 0.0 {
                            *existing = item;
                        }
                    } else if seen_paths.insert(norm_path) {
                        dedup.insert(fp_key, item);
                    }
                }
                gallery_items = dedup.into_values().collect();
            }
            if state.filter_choice.progress != ProgressFilter::All {
                gallery_items.retain(|item| {
                    let progress = history
                        .iter()
                        .find(|entry| entry.current_item_fingerprint == item.fingerprint)
                        .map(|entry| entry.progress_ratio);
                    match state.filter_choice.progress {
                        ProgressFilter::All => true,
                        ProgressFilter::InProgress => {
                            progress.is_some_and(|value| value > 0.0 && value < 1.0)
                        }
                        ProgressFilter::Unwatched => progress.is_none_or(|value| value <= 0.0),
                        ProgressFilter::Watched => progress.is_some_and(|value| value >= 1.0),
                    }
                });
            }
            match state.sort_choice.field {
                SortField::Name => gallery_items.sort_by(|a, b| {
                    valor_core::path_utils::natural_cmp(&a.title, &b.title)
                }),
                SortField::DateModified => gallery_items.sort_by_key(|item| item.updated_at),
                SortField::DateCreated | SortField::DateTaken => {
                    gallery_items.sort_by_key(|item| item.created_at)
                }
            }
            if !state.sort_choice.ascending {
                gallery_items.reverse();
            }
            if gallery_items.is_empty() {
                let text = if state.selected_folder.is_some() {
                    "No media found here yet"
                } else if state.root_folders.is_empty() {
                    "Add a folder to see your videos here"
                } else {
                    "Your library is empty"
                };
                ui.painter().text(
                    Pos2::new(header_left, body_y),
                    Align2::LEFT_TOP,
                    text,
                    FontId::proportional(typography::BODY),
                    self.tokens.text_secondary,
                );
                if let Some(folder) = state.selected_folder.clone() {
                    let status = state
                        .scan_status
                        .get(&folder)
                        .map(String::as_str)
                        .unwrap_or("This folder has not been scanned yet");
                    ui.painter().text(
                        Pos2::new(header_left, body_y + 24.0),
                        Align2::LEFT_TOP,
                        status,
                        FontId::proportional(typography::SECONDARY),
                        self.tokens.text_secondary,
                    );
                    let scan = Rect::from_min_size(
                        Pos2::new(header_left, body_y + 52.0),
                        vec2(148.0, 36.0),
                    );
                    let response = ui.allocate_rect(scan, Sense::click());
                    ui.painter().rect_filled(
                        scan,
                        CornerRadius::same(radii::CONTROLS),
                        self.tokens.accent,
                    );
                    ui.painter().text(
                        scan.center(),
                        Align2::CENTER_CENTER,
                        "Scan this folder",
                        FontId::proportional(typography::BODY),
                        self.tokens.window_bg,
                    );
                    if response.clicked() {
                        action = ShellAction::ScanFolder(folder);
                    }
                } else if state.root_folders.is_empty() {
                    let add = Rect::from_min_size(
                        Pos2::new(header_left, body_y + 32.0),
                        vec2(132.0, 36.0),
                    );
                    let response = ui.allocate_rect(add, Sense::click());
                    ui.painter().rect_filled(
                        add,
                        CornerRadius::same(radii::CONTROLS),
                        self.tokens.accent,
                    );
                    ui.painter().text(
                        add.center(),
                        Align2::CENTER_CENTER,
                        "Add a folder",
                        FontId::proportional(typography::BODY),
                        self.tokens.window_bg,
                    );
                    if response.clicked() {
                        action = ShellAction::AddFolderPicker;
                    }
                }
            } else {
                if state.select_mode
                    && ui.input(|input| input.modifiers.command && input.key_pressed(Key::A))
                {
                    state.selected_media =
                        gallery_items.iter().map(|item| item.id.clone()).collect();
                }
                if state.library_view == crate::view_models::ViewMode::List {
                    self.render_gallery_list(
                        ui,
                        header_left,
                        body_y,
                        rect.max.x - content_pad_x,
                        &gallery_items,
                        state,
                        &mut action,
                    );
                } else {
                    self.render_gallery_tiles(
                        ui,
                        header_left,
                        body_y,
                        rect.max.x - content_pad_x,
                        &gallery_items,
                        state,
                        &mut action,
                        textures,
                    );
                }
            }
        }

        crate::playlists_tab::render_add_to_playlist_modal(
            ui.ctx(),
            state,
            &self.tokens,
            &mut action,
        );

        action
    }

    #[allow(clippy::too_many_arguments)]
    fn render_gallery_list(
        &self,
        ui: &mut Ui,
        left: f32,
        top: f32,
        right: f32,
        items: &[MediaItem],
        state: &mut ShellState,
        action: &mut ShellAction,
    ) {
        let content_rect = Rect::from_min_max(
            Pos2::new(left, top),
            Pos2::new(right, ui.max_rect().max.y - 16.0),
        );
        let mut list_ui = ui.new_child(egui::UiBuilder::new().max_rect(content_rect));
        let avail_w = list_ui.available_width();
        let total_table_w = state.movie_list_col_widths.iter().sum::<f32>().max(avail_w);
        let header_titles = [
            "Name",
            "Date",
            "Type",
            "Size",
            "Length",
            "Quality",
            "Last Played",
            "Time Spent",
            "Skips",
        ];

        let mut sorted: Vec<&MediaItem> = items.iter().collect();
        sorted.sort_by(|a, b| {
            let ord = match state.list_sort_col {
                0 => valor_core::path_utils::natural_cmp(&a.title, &b.title),
                1 => a.created_at.cmp(&b.created_at),
                2 => a
                    .file_path
                    .rsplit('.')
                    .next()
                    .unwrap_or("")
                    .cmp(b.file_path.rsplit('.').next().unwrap_or("")),
                3 => a.size_bytes.cmp(&b.size_bytes),
                4 => a.duration.total_cmp(&b.duration),
                5 => a.height.cmp(&b.height),
                6 => {
                    let ta = state.media_telemetry.get(&a.fingerprint).and_then(|t| t.last_played_at);
                    let tb = state.media_telemetry.get(&b.fingerprint).and_then(|t| t.last_played_at);
                    ta.cmp(&tb)
                }
                7 => {
                    let ta = state.media_telemetry.get(&a.fingerprint).map(|t| t.time_spent_secs).unwrap_or(0.0);
                    let tb = state.media_telemetry.get(&b.fingerprint).map(|t| t.time_spent_secs).unwrap_or(0.0);
                    ta.total_cmp(&tb)
                }
                8 => {
                    let ta = state.media_telemetry.get(&a.fingerprint).map(|t| t.skips_used).unwrap_or(0);
                    let tb = state.media_telemetry.get(&b.fingerprint).map(|t| t.skips_used).unwrap_or(0);
                    ta.cmp(&tb)
                }
                _ => std::cmp::Ordering::Equal,
            };
            if state.list_sort_asc { ord } else { ord.reverse() }
        });

        egui::ScrollArea::horizontal()
            .id_salt("home_list_hscroll")
            .show(&mut list_ui, |ui| {
                ui.set_min_width(total_table_w);
                let (header_rect, _) =
                    ui.allocate_exact_size(vec2(total_table_w, 28.0), Sense::hover());
                ui.painter()
                    .rect_filled(header_rect, CornerRadius::ZERO, self.tokens.field_fill);

                let mut col_x = header_rect.left();
                for i in 0..9 {
                    let col_w = state.movie_list_col_widths[i];
                    let cell_rect = Rect::from_min_size(
                        Pos2::new(col_x, header_rect.top()),
                        vec2((col_w - 6.0).max(20.0), header_rect.height()),
                    );
                    let cell_resp = ui.interact(
                        cell_rect,
                        ui.scope_id().with(("home_col_sort", i)),
                        Sense::click(),
                    );
                    let is_active = state.list_sort_col == i;
                    if cell_resp.hovered() {
                        ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
                        ui.painter()
                            .rect_filled(cell_rect, CornerRadius::ZERO, self.tokens.hover_fill);
                    } else if is_active {
                        ui.painter().rect_filled(
                            cell_rect,
                            CornerRadius::ZERO,
                            self.tokens.selected_fill,
                        );
                    }
                    let galley = ui.painter().layout_no_wrap(
                        header_titles[i].to_string(),
                        FontId::proportional(11.5),
                        if is_active {
                            Color32::WHITE
                        } else {
                            self.tokens.text_tertiary
                        },
                    );
                    let t_pos =
                        Pos2::new(col_x + 10.0, header_rect.center().y - galley.size().y * 0.5);
                    let icon_x = t_pos.x + galley.size().x + 8.0;
                    ui.painter()
                        .galley(t_pos, galley, self.tokens.text_tertiary);
                    if is_active {
                        let cy = header_rect.center().y;
                        let dir = if state.list_sort_asc { -1.0 } else { 1.0 };
                        ui.painter().line_segment(
                            [Pos2::new(icon_x, cy - 2.0 * dir), Pos2::new(icon_x + 3.5, cy + 2.0 * dir)],
                            Stroke::new(1.4, self.tokens.accent),
                        );
                        ui.painter().line_segment(
                            [Pos2::new(icon_x + 3.5, cy + 2.0 * dir), Pos2::new(icon_x + 7.0, cy - 2.0 * dir)],
                            Stroke::new(1.4, self.tokens.accent),
                        );
                    }
                    if cell_resp.clicked() {
                        if state.list_sort_col == i {
                            state.list_sort_asc = !state.list_sort_asc;
                        } else {
                            state.list_sort_col = i;
                            state.list_sort_asc = true;
                        }
                    }

                    let div_rect = Rect::from_min_size(
                        Pos2::new(col_x + col_w - 4.0, header_rect.top()),
                        vec2(8.0, header_rect.height()),
                    );
                    let div_resp = ui.interact(
                        div_rect,
                        ui.scope_id().with(("home_col_div", i)),
                        Sense::drag(),
                    );
                    if div_resp.hovered() || div_resp.dragged() {
                        ui.ctx().set_cursor_icon(CursorIcon::ResizeHorizontal);
                    }
                    if div_resp.dragged() {
                        state.movie_list_col_widths[i] =
                            (state.movie_list_col_widths[i] + div_resp.drag_delta().x).max(40.0);
                    }
                    ui.painter().line_segment(
                        [
                            Pos2::new(col_x + col_w, header_rect.top() + 4.0),
                            Pos2::new(col_x + col_w, header_rect.bottom() - 4.0),
                        ],
                        Stroke::new(1.0, self.tokens.divider),
                    );
                    col_x += col_w;
                }

                egui::ScrollArea::vertical()
                    .id_salt("home_list_vscroll")
                    .auto_shrink([false, false])
                    .show_rows(ui, 30.0, sorted.len(), |ui, row_range| {
                        for idx in row_range {
                            let item = sorted[idx];
                            let (row_rect, row_resp) = ui.allocate_exact_size(
                                vec2(total_table_w, 30.0),
                                Sense::click(),
                            );
                            if row_resp.hovered() {
                                ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
                                ui.painter().rect_filled(
                                    row_rect,
                                    CornerRadius::ZERO,
                                    self.tokens.hover_fill,
                                );
                            } else if idx % 2 == 1 {
                                ui.painter().rect_filled(
                                    row_rect,
                                    CornerRadius::ZERO,
                                    Color32::from_white_alpha(4),
                                );
                            }
                            let mut cx = row_rect.left();
                            let w = &state.movie_list_col_widths;
                            let display_name = format_home_title(item);
                            let ext = item
                                .file_path
                                .rsplit('.')
                                .next()
                                .unwrap_or("")
                                .to_ascii_uppercase();
                            let size_gb = (item.size_bytes as f64) / (1024.0 * 1024.0 * 1024.0);
                            let size_str = if size_gb >= 1.0 {
                                format!("{size_gb:.1} GB")
                            } else {
                                format!("{} MB", item.size_bytes / (1024 * 1024))
                            };
                            let dur = item.duration.max(0.0) as u64;
                            let dur_str = if dur > 0 {
                                format!("{}:{:02}:{:02}", dur / 3600, (dur % 3600) / 60, dur % 60)
                            } else {
                                "-".to_string()
                            };
                            let h = item.height.unwrap_or(0);
                            let (qual, qual_col) = if h >= 2160 {
                                ("4K", Color32::from_rgb(251, 191, 36))
                            } else if h >= 1080 {
                                ("1080p", Color32::from_rgb(96, 165, 250))
                            } else if h >= 720 {
                                ("720p", Color32::from_rgb(45, 212, 191))
                            } else {
                                ("SD", self.tokens.text_secondary)
                            };
                            let type_col = match ext.as_str() {
                                "MKV" => Color32::from_rgb(96, 165, 250),
                                "MP4" => Color32::from_rgb(74, 222, 128),
                                "AVI" | "WMV" | "MOV" => Color32::from_rgb(251, 191, 36),
                                _ => self.tokens.text_secondary,
                            };
                            let tele = state.media_telemetry.get(&item.fingerprint);
                            let last_played = tele
                                .and_then(|t| t.last_played_at)
                                .map(|dt| dt.format("%Y-%m-%d").to_string())
                                .unwrap_or_else(|| "-".to_string());
                            let time_secs = tele.map(|t| t.time_spent_secs as u64).unwrap_or(0);
                            let time_spent = if time_secs >= 60 {
                                format!("{}m", time_secs / 60)
                            } else if time_secs > 0 {
                                format!("{time_secs}s")
                            } else {
                                "-".to_string()
                            };
                            let skips_cnt = tele.map(|t| t.skips_used).unwrap_or(0);
                            let skips = skips_cnt.to_string();
                            let date_str = item.created_at.format("%Y-%m-%d").to_string();
                            let cols: [(&str, Color32); 9] = [
                                (&display_name, self.tokens.text_primary),
                                (&date_str, self.tokens.text_secondary),
                                (&ext, type_col),
                                (&size_str, self.tokens.text_secondary),
                                (&dur_str, self.tokens.text_secondary),
                                (qual, qual_col),
                                (&last_played, self.tokens.text_secondary),
                                (
                                    &time_spent,
                                    if time_secs > 0 {
                                        Color32::from_rgb(74, 222, 128)
                                    } else {
                                        self.tokens.text_tertiary
                                    },
                                ),
                                (
                                    &skips,
                                    if skips_cnt > 0 {
                                        Color32::from_rgb(251, 191, 36)
                                    } else {
                                        self.tokens.text_tertiary
                                    },
                                ),
                            ];
                            for (ci, (text, col)) in cols.iter().enumerate() {
                                let mut text_left = cx + 10.0;
                                if ci == 0 {
                                    let icon_name = if item.season_number.is_some()
                                        || item.episode_number.is_some()
                                    {
                                        "tv"
                                    } else {
                                        "film"
                                    };
                                    let icon_col = if item.season_number.is_some() {
                                        Color32::from_rgb(167, 139, 250)
                                    } else {
                                        Color32::from_rgb(96, 165, 250)
                                    };
                                    let icon_r = Rect::from_center_size(
                                        Pos2::new(cx + 16.0, row_rect.center().y),
                                        vec2(14.0, 14.0),
                                    );
                                    self.icons.paint_icon(ui, icon_name, icon_r, icon_col);
                                    text_left = cx + 30.0;
                                }
                                let cell_r = Rect::from_min_size(
                                    Pos2::new(text_left, row_rect.top()),
                                    vec2((cx + w[ci] - text_left - 6.0).max(16.0), row_rect.height()),
                                );
                                ui.painter().with_clip_rect(cell_r).text(
                                    Pos2::new(cell_r.left(), row_rect.center().y),
                                    Align2::LEFT_CENTER,
                                    *text,
                                    FontId::proportional(12.0),
                                    *col,
                                );
                                cx += w[ci];
                            }
                            if row_resp.clicked() {
                                *action = ShellAction::PlayMedia(PathBuf::from(&item.file_path));
                            }
                            crate::media_pages::attach_media_context_menu(
                                &row_resp,
                                &item.file_path,
                                &item.fingerprint,
                                &mut state.selected_media_info,
                                action,
                            );
                        }
                    });
            });
    }

    #[allow(clippy::too_many_arguments)]
    fn render_gallery_tiles(
        &self,
        ui: &mut Ui,
        left: f32,
        top: f32,
        right: f32,
        items: &[MediaItem],
        state: &mut ShellState,
        _action: &mut ShellAction,
        textures: &mut crate::texture_cache::LruTextureCache,
    ) {
        let target_tile_w = match state.tile_size {
            TileSize::Small => 240.0,
            TileSize::Medium => 300.0,
            TileSize::Large => 380.0,
        };
        let gap = 16.0;
        let square = state.gallery_layout == GalleryLayout::Square;
        let width = (right - left).max(200.0);
        let columns = (((width + gap) / (target_tile_w + gap)).floor() as usize).max(1);
        let tile_width = ((width - (gap * (columns - 1) as f32)) / columns as f32).max(120.0);
        let thumb_height = if square {
            tile_width
        } else {
            (tile_width * 9.0 / 16.0).round()
        };
        let text_h = 48.0;
        let card_h = thumb_height + text_h;
        let row_count = items.len().div_ceil(columns);
        let grid_rect = Rect::from_min_max(
            Pos2::new(left, top),
            Pos2::new(ui.max_rect().max.x - 2.0, ui.max_rect().max.y - 8.0),
        );
        let mut grid_ui = ui.new_child(egui::UiBuilder::new().max_rect(grid_rect));
        let mouse_on_window = ui.ctx().input(|i| i.pointer.latest_pos().is_some());
        grid_ui.style_mut().spacing.scroll = egui::style::ScrollStyle::floating();
        egui::ScrollArea::vertical()
            .id_salt("home_video_gallery")
            .auto_shrink([false, false])
            .scroll_bar_visibility(if mouse_on_window {
                egui::scroll_area::ScrollBarVisibility::VisibleWhenNeeded
            } else {
                egui::scroll_area::ScrollBarVisibility::AlwaysHidden
            })
            .show_rows(&mut grid_ui, card_h + gap, row_count, |row_ui, visible| {
                for row_index in visible {
                    let (row_rect, _) =
                        row_ui.allocate_exact_size(vec2(width, card_h + gap), Sense::hover());
                    let start = row_index * columns;
                    let end = (start + columns).min(items.len());
                    for (col_idx, item) in items[start..end].iter().enumerate() {
                        let col_x = left + col_idx as f32 * (tile_width + gap);
                        let card_rect = Rect::from_min_size(
                            Pos2::new(col_x, row_rect.min.y),
                            vec2(tile_width, card_h),
                        );
                        let thumb_rect = Rect::from_min_size(
                            card_rect.min,
                            vec2(tile_width, thumb_height),
                        );
                        let full_filename = std::path::Path::new(&item.file_path)
                            .file_name()
                            .and_then(|s| s.to_str())
                            .unwrap_or(&item.title);
                        let response = row_ui
                            .allocate_rect(card_rect, Sense::click())
                            .on_hover_text(format!(
                                "{}\nFile: {}\nSize: {}\nPath: {}\nAdded: {}",
                                item.title,
                                full_filename,
                                format_file_size(item.size_bytes),
                                item.file_path,
                                item.created_at.format("%B %d, %Y")
                            ));

                        if response.hovered() {
                            row_ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
                        }

                        // Thumbnail container background
                        row_ui.painter().rect_filled(
                            thumb_rect,
                            CornerRadius::ZERO,
                            Color32::from_rgb(16, 22, 32),
                        );

                        let thumb = directories::ProjectDirs::from("com", "valor", "Valor").and_then(|dirs| {
                            let p = dirs.cache_dir()
                                .join("thumbnails")
                                .join(format!("{}.jpg", item.fingerprint));
                            if p.is_file() {
                                if let Ok(meta) = p.metadata() {
                                    if meta.len() == 6479 || meta.len() < 1200 {
                                        return None;
                                    }
                                }
                                Some(p)
                            } else {
                                None
                            }
                        });

                        let _has_thumb = thumb.as_ref().map(|p| p.exists()).unwrap_or(false);

                        if let Some(tex) = thumb.as_ref().and_then(|path| {
                            textures.get_or_request(row_ui.ctx(), &item.fingerprint, Some(path))
                        }) {
                            row_ui.painter().image(
                                tex.id(),
                                thumb_rect,
                                Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0)),
                                Color32::WHITE,
                            );
                        } else {
                            // Rich media preview fallback canvas
                            let center = thumb_rect.center();
                            let icon_circle_radius = if response.hovered() { 24.0 } else { 22.0 };
                            let circle_fill = if response.hovered() {
                                Color32::from_rgb(34, 46, 68)
                            } else {
                                Color32::from_rgb(24, 32, 46)
                            };

                            row_ui.painter().circle_filled(
                                center,
                                icon_circle_radius,
                                circle_fill,
                            );
                            row_ui.painter().circle_stroke(
                                center,
                                icon_circle_radius,
                                Stroke::new(1.0, Color32::from_rgb(48, 64, 92)),
                            );

                            self.icons.paint_icon(
                                row_ui,
                                "transport.play",
                                Rect::from_center_size(center, vec2(20.0, 20.0)),
                                if response.hovered() { Color32::WHITE } else { self.tokens.accent },
                            );
                        }

                        // Top-left: file format badge (e.g. MKV, MP4)
                        let ext = std::path::Path::new(&item.file_path)
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("VID")
                            .to_uppercase();
                        let ext_badge = Rect::from_min_size(
                            thumb_rect.min + vec2(8.0, 8.0),
                            vec2(38.0, 18.0),
                        );
                        row_ui.painter().rect_filled(
                            ext_badge,
                            CornerRadius::same(4),
                            Color32::from_rgba_unmultiplied(12, 16, 26, 220),
                        );
                        row_ui.painter().text(
                            ext_badge.center(),
                            Align2::CENTER_CENTER,
                            ext,
                            FontId::proportional(10.5),
                            self.tokens.text_secondary,
                        );

                        // HDR Badge if HDR content
                        if item.is_hdr {
                            let hdr_badge = Rect::from_min_size(
                                Pos2::new(ext_badge.max.x + 4.0, ext_badge.min.y),
                                vec2(34.0, 18.0),
                            );
                            row_ui.painter().rect_filled(
                                hdr_badge,
                                CornerRadius::same(4),
                                Color32::from_rgba_unmultiplied(210, 150, 20, 210),
                            );
                            row_ui.painter().text(
                                hdr_badge.center(),
                                Align2::CENTER_CENTER,
                                "HDR",
                                FontId::proportional(10.0),
                                Color32::BLACK,
                            );
                        }

                        // Top-right: TV series episode badge (e.g. S01E01)
                        if let (Some(s), Some(e)) = (item.season_number, item.episode_number) {
                            let ep_text = format!("S{:02}E{:02}", s, e);
                            let ep_w = 48.0;
                            let badge = Rect::from_min_size(
                                Pos2::new(thumb_rect.max.x - ep_w - 8.0, thumb_rect.min.y + 8.0),
                                vec2(ep_w, 18.0),
                            );
                            row_ui.painter().rect_filled(
                                badge,
                                CornerRadius::same(4),
                                Color32::from_rgb(26, 48, 80),
                            );
                            row_ui.painter().text(
                                badge.center(),
                                Align2::CENTER_CENTER,
                                ep_text,
                                FontId::proportional(11.0),
                                Color32::from_rgb(148, 190, 255),
                            );
                        }

                        // Duration badge in bottom-right of thumbnail
                        if item.duration > 0.0 {
                            let duration = format_gallery_duration(item.duration);
                            let dur_w = 44.0 + (duration.len().saturating_sub(5) as f32 * 7.0);
                            let badge = Rect::from_min_size(
                                Pos2::new(thumb_rect.max.x - dur_w - 6.0, thumb_rect.max.y - 24.0),
                                vec2(dur_w, 18.0),
                            );
                            row_ui.painter().rect_filled(
                                badge,
                                CornerRadius::same(4),
                                Color32::from_rgba_unmultiplied(10, 14, 22, 225),
                            );
                            row_ui.painter().text(
                                badge.center(),
                                Align2::CENTER_CENTER,
                                duration,
                                FontId::proportional(11.0),
                                Color32::WHITE,
                            );
                        }

                        // Hover or focus highlight
                        if response.hovered() {
                            row_ui.painter().rect_stroke(
                                thumb_rect,
                                CornerRadius::ZERO,
                                Stroke::new(1.5, self.tokens.accent),
                                StrokeKind::Inside,
                            );
                        }

                        // File name and Title display
                        let title_y = thumb_rect.max.y + 6.0;
                        let title_base = format_home_title(item);

                        let max_w = (card_rect.width() - 4.0).max(10.0);
                        let title_col = if response.hovered() { self.tokens.accent } else { self.tokens.text_primary };
                        let title_font = FontId::proportional(12.5);
                        let disp_title = crate::ui_helpers::truncate_text_exact(row_ui.painter(), &title_base, title_font.clone(), max_w);
                        let clip_painter = row_ui.painter().with_clip_rect(Rect::from_min_max(card_rect.min, Pos2::new(card_rect.max.x, card_rect.max.y + 60.0)));
                        clip_painter.text(
                            Pos2::new(card_rect.min.x, title_y),
                            Align2::LEFT_TOP,
                            disp_title,
                            title_font,
                            title_col,
                        );

                        // Meta details line: resolution · format · size
                        let meta_y = title_y + 17.0;
                        let res = format_resolution(item.width, item.height);
                        let size = format_file_size(item.size_bytes);
                        let ext = std::path::Path::new(&item.file_path)
                            .extension()
                            .and_then(|e| e.to_str())
                            .map(|e| e.to_uppercase())
                            .unwrap_or_default();
                        let mut parts = Vec::new();
                        if !res.is_empty() {
                            parts.push(res.to_string());
                        }
                        if !ext.is_empty() {
                            parts.push(ext);
                        }
                        if !size.is_empty() {
                            parts.push(size);
                        }
                        let meta_text = parts.join(" · ");
                        let meta_font = FontId::proportional(11.0);
                        let disp_meta = crate::ui_helpers::truncate_text_exact(row_ui.painter(), &meta_text, meta_font.clone(), max_w);
                        clip_painter.text(
                            Pos2::new(card_rect.min.x, meta_y),
                            Align2::LEFT_TOP,
                            disp_meta,
                            meta_font,
                            self.tokens.text_muted,
                        );

                        // Select mode checkbox
                        let selected = state.selected_media.contains(&item.id);
                        if state.select_mode && (response.hovered() || selected) {
                            let checkbox =
                                Rect::from_min_size(thumb_rect.min + vec2(8.0, 8.0), vec2(20.0, 20.0));
                            row_ui.painter().circle_filled(
                                checkbox.center(),
                                10.0,
                                if selected {
                                    self.tokens.accent
                                } else {
                                    self.tokens.window_bg
                                },
                            );
                            if selected {
                                self.icons.paint_icon(
                                    row_ui,
                                    "check",
                                    checkbox.shrink(4.0),
                                    self.tokens.window_bg,
                                );
                            }
                        }

                        crate::media_pages::attach_media_context_menu(
                            &response,
                            &item.file_path,
                            &item.fingerprint,
                            &mut state.selected_media_info,
                            _action,
                        );

                        if response.clicked() {
                            if state.select_mode {
                                if selected {
                                    state.selected_media.remove(&item.id);
                                } else {
                                    state.selected_media.insert(item.id.clone());
                                }
                            } else {
                                *_action = ShellAction::PlayMedia(PathBuf::from(&item.file_path));
                            }
                        }
                    }
                }
            });
    }

    fn render_history_rows(
        &self,
        ui: &mut Ui,
        left: f32,
        mut y: f32,
        right: f32,
        entries: &[HistoryEntry],
        _action: &mut ShellAction,
    ) {
        let width = (right - left).max(120.0);
        for entry in entries.iter().take(80) {
            let row = Rect::from_min_size(Pos2::new(left, y), vec2(width, 50.0));
            let response = ui.allocate_rect(row, Sense::click());
            if response.hovered() {
                ui.painter().rect_filled(
                    row,
                    CornerRadius::same(radii::PANELS),
                    self.tokens.hover_fill,
                );
            }
            ui.painter()
                .rect_filled(row, CornerRadius::ZERO, self.tokens.window_bg);
            ui.painter().rect_stroke(
                row,
                CornerRadius::ZERO,
                Stroke::new(1.0, self.tokens.divider),
                StrokeKind::Inside,
            );
            ui.painter().text(
                row.min + vec2(12.0, 9.0),
                Align2::LEFT_TOP,
                &entry.current_item_title,
                FontId::proportional(typography::BODY),
                self.tokens.text_primary,
            );
            let date = entry.last_played_at.format("%b %d, %Y · %H:%M").to_string();
            let progress = format!(
                "{}  ·  {:.0}%",
                date,
                entry.progress_ratio.clamp(0.0, 1.0) * 100.0
            );
            ui.painter().text(
                row.min + vec2(12.0, 29.0),
                Align2::LEFT_TOP,
                progress,
                FontId::proportional(typography::SECONDARY),
                self.tokens.text_secondary,
            );
            y += 58.0;
            if y > ui.max_rect().bottom() - 20.0 {
                break;
            }
        }
    }

    fn render_continue_watching_bar(
        &self,
        ui: &mut Ui,
        rect: Rect,
        state: &mut ShellState,
        pos_secs: f64,
        dur_secs: f64,
        item: &MediaItem,
        textures: &mut crate::LruTextureCache,
        action: &mut ShellAction,
    ) {
        let mut bar_ui = ui.new_child(egui::UiBuilder::new().max_rect(rect));
        bar_ui.set_clip_rect(rect);
        let ui = &mut bar_ui;
        ui.painter().rect_filled(rect, CornerRadius::ZERO, self.tokens.chrome_bg);
        ui.painter().hline(
            rect.left()..=rect.right(),
            rect.top() + 0.5,
            Stroke::new(1.0, self.tokens.divider),
        );

        let path = PathBuf::from(&item.file_path);
        let resume_pos = pos_secs.max(0.0);
        let total_dur = dur_secs.max(item.duration).max(1.0);
        let prog_frac = (resume_pos / total_dur).clamp(0.0, 1.0) as f32;

        // Left: Thumbnail + Title + Subtitle
        let thumb_rect = Rect::from_min_size(
            Pos2::new(rect.left() + 14.0, rect.center().y - 22.0),
            vec2(76.0, 44.0),
        );
        let thumb_path = directories::ProjectDirs::from("com", "valor", "Valor")
            .map(|d| d.cache_dir().join("thumbnails").join(format!("{}.jpg", item.fingerprint)))
            .filter(|p| p.is_file());
        if let Some(tex) = textures.get_or_request(ui.ctx(), &item.fingerprint, thumb_path.as_ref()) {
            ui.painter().rect_filled(thumb_rect, CornerRadius::same(4), Color32::BLACK);
            ui.painter().image(
                tex.id(),
                thumb_rect,
                Rect::from_min_max(Pos2::ZERO, Pos2::new(1.0, 1.0)),
                Color32::WHITE,
            );
        } else {
            ui.painter().rect_filled(thumb_rect, CornerRadius::same(4), self.tokens.card_fill);
            ui.painter().text(
                thumb_rect.center(),
                Align2::CENTER_CENTER,
                "▶",
                FontId::proportional(14.0),
                self.tokens.text_secondary,
            );
        }
        let thumb_resp = ui.allocate_rect(thumb_rect, Sense::click());
        if thumb_resp.hovered() {
            ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
        }
        if thumb_resp.clicked() {
            *action = ShellAction::PlayMediaFromMiniBar {
                path: path.clone(),
                start_secs: resume_pos,
                audio_only: false,
            };
        }

        let text_left = thumb_rect.right() + 12.0;
        let center_w = (rect.width() * 0.42).clamp(280.0, 460.0);
        let center_left = (rect.center().x - center_w * 0.5).max(text_left + 160.0);
        let title_max_w = (center_left - text_left - 16.0).max(80.0);

        let ep_tag = match (item.season_number, item.episode_number) {
            (Some(s), Some(e)) => format!("S{s:02}E{e:02} · "),
            _ => String::new(),
        };
        let disp_title = crate::ui_helpers::truncate_text_exact(
            ui.painter(),
            &format!("{ep_tag}{}", item.title),
            FontId::proportional(13.0),
            title_max_w,
        );
        ui.painter().text(
            Pos2::new(text_left, rect.center().y - 9.0),
            Align2::LEFT_CENTER,
            disp_title,
            FontId::proportional(13.0),
            self.tokens.text_primary,
        );
        let sub_text = format!(
            "Continue at {} · {:.0}%",
            format_gallery_duration(resume_pos),
            prog_frac * 100.0
        );
        let disp_sub = crate::ui_helpers::truncate_text_exact(
            ui.painter(),
            &sub_text,
            FontId::proportional(11.0),
            title_max_w,
        );
        ui.painter().text(
            Pos2::new(text_left, rect.center().y + 9.0),
            Align2::LEFT_CENTER,
            disp_sub,
            FontId::proportional(11.0),
            self.tokens.text_muted,
        );

        // Center: Spotify-style Transport Controls + Interactive Progress Bar
        let btn_y = rect.top() + 24.0;
        let cx = rect.center().x;

        let skip = state.settings.skip_secs.max(1) as f64;
        let skip_str = (skip as u32).to_string();
        let controls = [
            (-44.0, -1, format!("Backward {}s", skip as u32), -skip),
            (0.0, 1, "Play / Resume".to_string(), 0.0),
            (44.0, 2, format!("Forward {}s", skip as u32), skip),
        ];

        for (dx, kind, tip, offset) in controls {
            let is_primary = dx == 0.0;
            let sz = if is_primary { 32.0 } else { 28.0 };
            let btn_rect = Rect::from_center_size(Pos2::new(cx + dx, btn_y), vec2(sz, sz));
            let resp = ui
                .allocate_rect(btn_rect, Sense::click())
                .on_hover_text(tip);
            if resp.hovered() {
                ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
            }
            if is_primary {
                ui.painter().rect_filled(
                    Rect::from_center_size(btn_rect.center(), vec2(32.0, 32.0)),
                    CornerRadius::ZERO,
                    if resp.hovered() {
                        self.tokens.accent_hover
                    } else {
                        self.tokens.accent
                    },
                );
                self.icons.paint_icon(
                    ui,
                    "transport.play",
                    Rect::from_center_size(btn_rect.center(), vec2(16.0, 16.0)),
                    Color32::WHITE,
                );
            } else {
                if resp.hovered() {
                    ui.painter().rect_filled(
                        btn_rect,
                        CornerRadius::ZERO,
                        self.tokens.hover_fill,
                    );
                }
                let col = if resp.hovered() {
                    self.tokens.text_primary
                } else {
                    self.tokens.text_secondary
                };
                match kind {
                    -1 => paint_curved_skip_arrow(ui.painter(), btn_rect.center(), 8.0, false, &skip_str, col),
                    2 => paint_curved_skip_arrow(ui.painter(), btn_rect.center(), 8.0, true, &skip_str, col),
                    _ => {}
                }
            }
            if resp.clicked() {
                let target_secs = (resume_pos + offset).clamp(0.0, total_dur);
                *action = ShellAction::PlayMediaFromMiniBar {
                    path: path.clone(),
                    start_secs: target_secs,
                    audio_only: false,
                };
            }
        }

        // Progress bar row underneath buttons
        let bar_y = rect.bottom() - 16.0;
        let bar_left = cx - center_w * 0.5 + 42.0;
        let bar_right = cx + center_w * 0.5 - 42.0;
        let bar_w = (bar_right - bar_left).max(60.0);

        ui.painter().text(
            Pos2::new(bar_left - 8.0, bar_y),
            Align2::RIGHT_CENTER,
            format_gallery_duration(resume_pos),
            FontId::proportional(10.5),
            self.tokens.text_muted,
        );
        ui.painter().text(
            Pos2::new(bar_right + 8.0, bar_y),
            Align2::LEFT_CENTER,
            format_gallery_duration(total_dur),
            FontId::proportional(10.5),
            self.tokens.text_muted,
        );

        let track_hit = Rect::from_min_max(
            Pos2::new(bar_left, bar_y - 6.0),
            Pos2::new(bar_right, bar_y + 6.0),
        );
        let track_resp = ui.allocate_rect(track_hit, Sense::click());
        if track_resp.hovered() {
            ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
        }
        let track_vis = Rect::from_min_size(Pos2::new(bar_left, bar_y - 2.0), vec2(bar_w, 4.0));
        ui.painter().rect_filled(track_vis, CornerRadius::ZERO, self.tokens.divider);
        let fill_vis = Rect::from_min_size(
            Pos2::new(bar_left, bar_y - 2.0),
            vec2(bar_w * prog_frac, 4.0),
        );
        ui.painter().rect_filled(
            fill_vis,
            CornerRadius::ZERO,
            self.tokens.accent,
        );
        if track_resp.clicked() {
            if let Some(pos) = track_resp.interact_pointer_pos() {
                let frac = ((pos.x - bar_left) / bar_w).clamp(0.0, 1.0) as f64;
                *action = ShellAction::PlayMediaFromMiniBar {
                    path: path.clone(),
                    start_secs: frac * total_dur,
                    audio_only: false,
                };
            }
        }

        // Right: Sound Only button + Cross (X) dismiss button
        let sound_btn = Rect::from_center_size(
            Pos2::new(rect.right() - 96.0, rect.center().y),
            vec2(96.0, 28.0),
        );
        let s_resp = ui
            .allocate_rect(sound_btn, Sense::click())
            .on_hover_text("Play audio only (hide video)");
        if s_resp.hovered() {
            ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
        }
        ui.painter().rect(
            sound_btn,
            CornerRadius::ZERO,
            if s_resp.hovered() {
                self.tokens.hover_fill
            } else {
                self.tokens.field_fill
            },
            Stroke::new(1.0, self.tokens.divider),
            StrokeKind::Inside,
        );
        self.icons.paint_icon(
            ui,
            "transport.volume",
            Rect::from_center_size(Pos2::new(sound_btn.left() + 16.0, sound_btn.center().y), vec2(14.0, 14.0)),
            self.tokens.accent,
        );
        ui.painter().text(
            Pos2::new(sound_btn.left() + 28.0, sound_btn.center().y),
            Align2::LEFT_CENTER,
            "Sound Only",
            FontId::proportional(11.0),
            self.tokens.text_primary,
        );
        if s_resp.clicked() {
            *action = ShellAction::PlayMediaFromMiniBar {
                path,
                start_secs: resume_pos,
                audio_only: true,
            };
        }

        // Right: Cross (✕) dismiss button
        let close_btn = Rect::from_center_size(
            Pos2::new(rect.right() - 28.0, rect.center().y),
            vec2(28.0, 28.0),
        );
        let c_resp = ui
            .allocate_rect(close_btn, Sense::click())
            .on_hover_text("Dismiss Continue Watching bar");
        if c_resp.hovered() {
            ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
            ui.painter().rect_filled(
                close_btn,
                CornerRadius::same(14),
                Color32::from_rgba_unmultiplied(239, 68, 68, 36),
            );
        }
        let x_col = if c_resp.hovered() {
            Color32::from_rgb(248, 113, 113)
        } else {
            Color32::from_rgb(239, 68, 68)
        };
        let xc = close_btn.center();
        let xr = 5.0;
        ui.painter().line_segment([Pos2::new(xc.x - xr, xc.y - xr), Pos2::new(xc.x + xr, xc.y + xr)], Stroke::new(1.8, x_col));
        ui.painter().line_segment([Pos2::new(xc.x - xr, xc.y + xr), Pos2::new(xc.x + xr, xc.y - xr)], Stroke::new(1.8, x_col));
        if c_resp.clicked() {
            state.mini_bar_dismissed_fingerprint = Some(item.fingerprint.clone());
        }
    }

    /// Render Popups (File, Sort, Filter, View, Overflow) and Tree Context Menu
    fn render_popups_and_context(
        &self,
        ui: &mut Ui,
        state: &mut ShellState,
        items: &[MediaItem],
        history: &[HistoryEntry],
        action: &mut ShellAction,
    ) {
        // Render Active Popup Menu
        if let Some(popup) = state.active_popup {
            let page_pad_x = if ui.ctx().content_rect().width() >= 1100.0 {
                layout::PAGE_PAD_X_WIDE
            } else {
                layout::PAGE_PAD_X_NARROW
            };
            let top_bar_y = ui.max_rect().min.y
                + dimensions::TITLEBAR_HEIGHT
                + layout::PAGE_PAD_TOP
                + layout::TOOLBAR_BTN_H;
            let right_x = ui.max_rect().max.x - page_pad_x;
            let menu_w = 200.0;
            let menu_pos = Pos2::new(right_x - menu_w, top_bar_y);

            match popup {
                ActivePopupMenu::File => {
                    let file_menu_w = 300.0;
                    let row_h = 28.0;
                    let sep_h = 9.0;
                    // 13 items + 2 separators
                    let menu_h = 13.0 * row_h + 2.0 * sep_h + (dimensions::POPUP_PADDING * 2.0);
                    let menu_rect = Rect::from_min_size(state.file_menu_pos, vec2(file_menu_w, menu_h));

                    egui::Area::new(ui.scope_id().with("file_menu_popup"))
                        .order(egui::Order::Foreground)
                        .fixed_pos(menu_rect.min)
                        .show(ui.ctx(), |ui| {
                            let (rect, _) = ui.allocate_exact_size(menu_rect.size(), Sense::hover());
                            ui.painter().rect_filled(
                                rect,
                                CornerRadius::same(radii::PANELS),
                                self.tokens.window_bg,
                            );
                            ui.painter().rect_stroke(
                                rect,
                                CornerRadius::same(radii::PANELS),
                                Stroke::new(1.0, self.tokens.divider),
                                StrokeKind::Inside,
                            );

                            enum FileEntry {
                                Item {
                                    label: &'static str,
                                    shortcut: &'static str,
                                    icon: Option<&'static str>,
                                    has_submenu: bool,
                                    checked: bool,
                                    cmd: Option<ShellAction>,
                                },
                                Separator,
                            }

                            let entries = [
                                FileEntry::Item {
                                    label: "Open File...",
                                    shortcut: "Ctrl+O",
                                    icon: Some("file-video"),
                                    has_submenu: false,
                                    checked: false,
                                    cmd: Some(ShellAction::OpenFilePicker),
                                },
                                FileEntry::Item {
                                    label: "Open Multiple Files...",
                                    shortcut: "Ctrl+Shift+O",
                                    icon: Some("file-video"),
                                    has_submenu: false,
                                    checked: false,
                                    cmd: Some(ShellAction::OpenMultipleFilesPicker),
                                },
                                FileEntry::Item {
                                    label: "Open Folder...",
                                    shortcut: "Ctrl+F",
                                    icon: Some("folder-open"),
                                    has_submenu: false,
                                    checked: false,
                                    cmd: Some(ShellAction::OpenFolderPicker),
                                },
                                FileEntry::Item {
                                    label: "Open Disc...",
                                    shortcut: "Ctrl+D",
                                    icon: None,
                                    has_submenu: false,
                                    checked: false,
                                    cmd: Some(ShellAction::OpenDiscDialog),
                                },
                                FileEntry::Item {
                                    label: "Open Network Stream...",
                                    shortcut: "Ctrl+N",
                                    icon: None,
                                    has_submenu: false,
                                    checked: false,
                                    cmd: Some(ShellAction::OpenNetworkStreamDialog),
                                },
                                FileEntry::Item {
                                    label: "Open Capture Device...",
                                    shortcut: "Ctrl+C",
                                    icon: None,
                                    has_submenu: false,
                                    checked: false,
                                    cmd: Some(ShellAction::OpenCaptureDeviceDialog),
                                },
                                FileEntry::Item {
                                    label: "Open Location from clipboard",
                                    shortcut: "Ctrl+V",
                                    icon: None,
                                    has_submenu: false,
                                    checked: false,
                                    cmd: Some(ShellAction::OpenLocationFromClipboard),
                                },
                                FileEntry::Item {
                                    label: "Open Recent Media",
                                    shortcut: "",
                                    icon: None,
                                    has_submenu: true,
                                    checked: false,
                                    cmd: None,
                                },
                                FileEntry::Separator,
                                FileEntry::Item {
                                    label: "Save Playlist to File...",
                                    shortcut: "Ctrl+Y",
                                    icon: None,
                                    has_submenu: false,
                                    checked: false,
                                    cmd: Some(ShellAction::SavePlaylistToFile),
                                },
                                FileEntry::Item {
                                    label: "Convert / Save...",
                                    shortcut: "Ctrl+R",
                                    icon: None,
                                    has_submenu: false,
                                    checked: false,
                                    cmd: Some(ShellAction::ConvertSaveDialog),
                                },
                                FileEntry::Item {
                                    label: "Stream...",
                                    shortcut: "Ctrl+S",
                                    icon: None,
                                    has_submenu: false,
                                    checked: false,
                                    cmd: Some(ShellAction::StreamDialog),
                                },
                                FileEntry::Separator,
                                FileEntry::Item {
                                    label: "Quit at the end of playlist",
                                    shortcut: "",
                                    icon: None,
                                    has_submenu: false,
                                    checked: state.quit_at_end_of_playlist,
                                    cmd: Some(ShellAction::ToggleQuitAtEndOfPlaylist),
                                },
                                FileEntry::Item {
                                    label: "Quit",
                                    shortcut: "Ctrl+Q",
                                    icon: None,
                                    has_submenu: false,
                                    checked: false,
                                    cmd: Some(ShellAction::CloseWindow),
                                },
                            ];

                            let mut item_y = rect.min.y + dimensions::POPUP_PADDING;
                            let mut recent_row_rect = Rect::NOTHING;

                            for entry in entries {
                                match entry {
                                    FileEntry::Separator => {
                                        let sep_y = item_y + sep_h * 0.5;
                                        ui.painter().hline(
                                            (rect.min.x + 8.0)..=(rect.max.x - 8.0),
                                            sep_y,
                                            Stroke::new(1.0, self.tokens.divider),
                                        );
                                        item_y += sep_h;
                                    }
                                    FileEntry::Item {
                                        label,
                                        shortcut,
                                        icon,
                                        has_submenu,
                                        checked,
                                        cmd,
                                    } => {
                                        let item_rect = Rect::from_min_size(
                                            Pos2::new(rect.min.x + dimensions::POPUP_PADDING, item_y),
                                            vec2(file_menu_w - dimensions::POPUP_PADDING * 2.0, row_h),
                                        );
                                        let resp = ui.allocate_rect(item_rect, Sense::click());
                                        if resp.hovered() {
                                            ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
                                            ui.painter().rect_filled(
                                                item_rect,
                                                CornerRadius::same(radii::CONTROLS),
                                                self.tokens.hover_fill,
                                            );
                                            if has_submenu {
                                                state.recent_submenu_open = true;
                                            } else {
                                                state.recent_submenu_open = false;
                                            }
                                        }
                                        if has_submenu {
                                            recent_row_rect = item_rect;
                                        }
                                        if checked {
                                            self.icons.paint_icon(
                                                ui,
                                                "check",
                                                Rect::from_min_size(
                                                    Pos2::new(item_rect.min.x + 6.0, item_rect.center().y - 7.0),
                                                    vec2(14.0, 14.0),
                                                ),
                                                self.tokens.accent,
                                            );
                                        } else if let Some(icon_name) = icon {
                                            self.icons.paint_icon(
                                                ui,
                                                icon_name,
                                                Rect::from_min_size(
                                                    Pos2::new(item_rect.min.x + 6.0, item_rect.center().y - 7.0),
                                                    vec2(14.0, 14.0),
                                                ),
                                                self.tokens.text_secondary,
                                            );
                                        }
                                        ui.painter().text(
                                            Pos2::new(item_rect.min.x + 28.0, item_rect.center().y),
                                            Align2::LEFT_CENTER,
                                            label,
                                            FontId::proportional(typography::BODY),
                                            if resp.hovered() {
                                                self.tokens.text_primary
                                            } else {
                                                self.tokens.text_secondary
                                            },
                                        );
                                        if !shortcut.is_empty() {
                                            ui.painter().text(
                                                Pos2::new(item_rect.max.x - 10.0, item_rect.center().y),
                                                Align2::RIGHT_CENTER,
                                                shortcut,
                                                FontId::proportional(11.5),
                                                self.tokens.text_muted,
                                            );
                                        } else if has_submenu {
                                            ui.painter().text(
                                                Pos2::new(item_rect.max.x - 10.0, item_rect.center().y),
                                                Align2::RIGHT_CENTER,
                                                "▶",
                                                FontId::proportional(9.5),
                                                self.tokens.text_muted,
                                            );
                                        }
                                        if resp.clicked() {
                                            if has_submenu {
                                                state.recent_submenu_open = !state.recent_submenu_open;
                                            } else if let Some(act) = cmd {
                                                *action = act;
                                                state.close_popup();
                                                state.recent_submenu_open = false;
                                            }
                                        }
                                        item_y += row_h;
                                    }
                                }
                            }

                            // Render Recent Media Submenu
                            let mut sub_rect = Rect::NOTHING;
                            if state.recent_submenu_open {
                                let sub_w = 280.0;
                                let recent_entries: Vec<&HistoryEntry> = history.iter().take(10).collect();
                                let sub_rows = recent_entries.len().max(1);
                                let sub_h = sub_rows as f32 * row_h + dimensions::POPUP_PADDING * 2.0;
                                let sub_pos = Pos2::new(rect.max.x + 2.0, recent_row_rect.min.y);
                                sub_rect = Rect::from_min_size(sub_pos, vec2(sub_w, sub_h));
                                egui::Area::new(ui.scope_id().with("file_recent_submenu"))
                                    .order(egui::Order::Foreground)
                                    .fixed_pos(sub_pos)
                                    .show(ui.ctx(), |ui| {
                                        let (srect, _) = ui.allocate_exact_size(sub_rect.size(), Sense::hover());
                                        ui.painter().rect_filled(
                                            srect,
                                            CornerRadius::same(radii::PANELS),
                                            self.tokens.window_bg,
                                        );
                                        ui.painter().rect_stroke(
                                            srect,
                                            CornerRadius::same(radii::PANELS),
                                            Stroke::new(1.0, self.tokens.divider),
                                            StrokeKind::Inside,
                                        );
                                        let mut sy = srect.min.y + dimensions::POPUP_PADDING;
                                        if recent_entries.is_empty() {
                                            let r = Rect::from_min_size(
                                                Pos2::new(srect.min.x + dimensions::POPUP_PADDING, sy),
                                                vec2(sub_w - dimensions::POPUP_PADDING * 2.0, row_h),
                                            );
                                            ui.painter().text(
                                                Pos2::new(r.min.x + 8.0, r.center().y),
                                                Align2::LEFT_CENTER,
                                                "No recent media",
                                                FontId::proportional(typography::BODY),
                                                self.tokens.text_muted,
                                            );
                                        } else {
                                            for (r_idx, entry) in recent_entries.iter().enumerate() {
                                                let r = Rect::from_min_size(
                                                    Pos2::new(srect.min.x + dimensions::POPUP_PADDING, sy),
                                                    vec2(sub_w - dimensions::POPUP_PADDING * 2.0, row_h),
                                                );
                                                let r_resp = ui.allocate_rect(r, Sense::click());
                                                if r_resp.hovered() {
                                                    ui.ctx().set_cursor_icon(CursorIcon::PointingHand);
                                                    ui.painter().rect_filled(
                                                        r,
                                                        CornerRadius::same(radii::CONTROLS),
                                                        self.tokens.hover_fill,
                                                    );
                                                }
                                                let title = crate::ui_helpers::truncate_text_exact(
                                                    ui.painter(),
                                                    &format!("{}. {}", r_idx + 1, entry.current_item_title),
                                                    FontId::proportional(typography::BODY),
                                                    r.width() - 16.0,
                                                );
                                                ui.painter().text(
                                                    Pos2::new(r.min.x + 8.0, r.center().y),
                                                    Align2::LEFT_CENTER,
                                                    title,
                                                    FontId::proportional(typography::BODY),
                                                    if r_resp.hovered() {
                                                        self.tokens.text_primary
                                                    } else {
                                                        self.tokens.text_secondary
                                                    },
                                                );
                                                if r_resp.clicked() {
                                                    if let Some(m_item) = items.iter().find(|i| i.fingerprint == entry.current_item_fingerprint) {
                                                        *action = ShellAction::PlayMedia(PathBuf::from(&m_item.file_path));
                                                    }
                                                    state.close_popup();
                                                    state.recent_submenu_open = false;
                                                }
                                                sy += row_h;
                                            }
                                        }
                                    });
                            }

                            if ui.input(|i| i.pointer.any_click()) {
                                if let Some(pos) = ui.input(|i| i.pointer.latest_pos()) {
                                    let in_title_btn = pos.y < state.file_menu_pos.y
                                        && pos.x >= state.file_menu_pos.x
                                        && pos.x <= state.file_menu_pos.x + 48.0;
                                    if !rect.contains(pos) && !sub_rect.contains(pos) && !in_title_btn {
                                        state.close_popup();
                                        state.recent_submenu_open = false;
                                    }
                                }
                            }
                        });
                }
                ActivePopupMenu::Sort => {
                    let items = [
                        (SortField::DateTaken, "Date taken"),
                        (SortField::DateCreated, "Date created"),
                        (SortField::DateModified, "Date modified"),
                        (SortField::Name, "Name"),
                    ];
                    let menu_h = ((items.len() + 2) as f32 * dimensions::POPUP_ROW_HEIGHT)
                        + (dimensions::POPUP_PADDING * 2.0)
                        + 1.0;
                    let menu_rect = Rect::from_min_size(menu_pos, vec2(menu_w, menu_h));

                    // Background & border
                    ui.painter().rect_filled(
                        menu_rect,
                        CornerRadius::same(radii::PANELS),
                        self.tokens.window_bg,
                    );
                    ui.painter().rect_stroke(
                        menu_rect,
                        CornerRadius::same(radii::PANELS),
                        Stroke::new(1.0, self.tokens.divider),
                        StrokeKind::Inside,
                    );

                    let mut item_y = menu_rect.min.y + dimensions::POPUP_PADDING;
                    for (field, label) in items {
                        let item_rect = Rect::from_min_size(
                            Pos2::new(menu_rect.min.x + dimensions::POPUP_PADDING, item_y),
                            vec2(
                                menu_w - (dimensions::POPUP_PADDING * 2.0),
                                dimensions::POPUP_ROW_HEIGHT,
                            ),
                        );
                        let item_resp = ui.allocate_rect(item_rect, Sense::click());
                        let is_active = state.sort_choice.field == field;

                        if item_resp.hovered() {
                            ui.painter().rect_filled(
                                item_rect,
                                CornerRadius::same(radii::CONTROLS),
                                self.tokens.hover_fill,
                            );
                        }
                        if is_active {
                            ui.painter().rect_filled(
                                item_rect,
                                CornerRadius::same(radii::CONTROLS),
                                self.tokens.selected_fill,
                            );
                            self.icons.paint_icon(
                                ui,
                                "check",
                                Rect::from_min_size(
                                    Pos2::new(item_rect.min.x + 8.0, item_rect.center().y - 8.0),
                                    vec2(16.0, 16.0),
                                ),
                                self.tokens.accent,
                            );
                        }

                        ui.painter().text(
                            Pos2::new(item_rect.min.x + 32.0, item_rect.center().y),
                            Align2::LEFT_CENTER,
                            label,
                            FontId::proportional(typography::BODY),
                            if is_active {
                                self.tokens.text_primary
                            } else {
                                self.tokens.text_secondary
                            },
                        );

                        if item_resp.clicked() {
                            state.sort_choice.field = field;
                            state.close_popup();
                        }
                        item_y += dimensions::POPUP_ROW_HEIGHT;
                    }
                    ui.painter().hline(
                        (menu_rect.min.x + 8.0)..=(menu_rect.max.x - 8.0),
                        item_y,
                        Stroke::new(1.0, self.tokens.divider),
                    );
                    item_y += 2.0;
                    for (ascending, label, icon) in [
                        (true, "Ascending", "arrow-up"),
                        (false, "Descending", "arrow-down"),
                    ] {
                        let item_rect = Rect::from_min_size(
                            Pos2::new(menu_rect.min.x + 8.0, item_y),
                            vec2(menu_w - 16.0, dimensions::POPUP_ROW_HEIGHT),
                        );
                        let response = ui.allocate_rect(item_rect, Sense::click());
                        let selected = state.sort_choice.ascending == ascending;
                        if response.hovered() {
                            ui.painter().rect_filled(
                                item_rect,
                                CornerRadius::same(radii::CONTROLS),
                                self.tokens.hover_fill,
                            );
                        }
                        self.icons.paint_icon(
                            ui,
                            icon,
                            Rect::from_center_size(
                                Pos2::new(item_rect.min.x + 16.0, item_rect.center().y),
                                vec2(16.0, 16.0),
                            ),
                            if selected {
                                self.tokens.accent
                            } else {
                                self.tokens.text_secondary
                            },
                        );
                        ui.painter().text(
                            Pos2::new(item_rect.min.x + 32.0, item_rect.center().y),
                            Align2::LEFT_CENTER,
                            label,
                            FontId::proportional(typography::BODY),
                            self.tokens.text_secondary,
                        );
                        if response.clicked() {
                            state.sort_choice.ascending = ascending;
                            state.close_popup();
                        }
                        item_y += dimensions::POPUP_ROW_HEIGHT;
                    }
                }
                ActivePopupMenu::Filter => {
                    let items = [
                        (ProgressFilter::All, "All videos"),
                        (ProgressFilter::InProgress, "In progress"),
                        (ProgressFilter::Unwatched, "Unwatched"),
                        (ProgressFilter::Watched, "Watched"),
                    ];
                    let menu_h = ((items.len() + 1) as f32 * dimensions::POPUP_ROW_HEIGHT)
                        + (dimensions::POPUP_PADDING * 2.0)
                        + 1.0;
                    let menu_rect = Rect::from_min_size(menu_pos, vec2(menu_w, menu_h));

                    ui.painter().rect_filled(
                        menu_rect,
                        CornerRadius::same(radii::PANELS),
                        self.tokens.window_bg,
                    );
                    ui.painter().rect_stroke(
                        menu_rect,
                        CornerRadius::same(radii::PANELS),
                        Stroke::new(1.0, self.tokens.divider),
                        StrokeKind::Inside,
                    );

                    let mut item_y = menu_rect.min.y + dimensions::POPUP_PADDING;
                    for (prog, label) in items {
                        let item_rect = Rect::from_min_size(
                            Pos2::new(menu_rect.min.x + dimensions::POPUP_PADDING, item_y),
                            vec2(
                                menu_w - (dimensions::POPUP_PADDING * 2.0),
                                dimensions::POPUP_ROW_HEIGHT,
                            ),
                        );
                        let item_resp = ui.allocate_rect(item_rect, Sense::click());
                        let is_active = state.filter_choice.progress == prog;

                        if item_resp.hovered() {
                            ui.painter().rect_filled(
                                item_rect,
                                CornerRadius::same(radii::CONTROLS),
                                self.tokens.hover_fill,
                            );
                        }
                        if is_active {
                            ui.painter().rect_filled(
                                item_rect,
                                CornerRadius::same(radii::CONTROLS),
                                self.tokens.selected_fill,
                            );
                            self.icons.paint_icon(
                                ui,
                                "check",
                                Rect::from_min_size(
                                    Pos2::new(item_rect.min.x + 8.0, item_rect.center().y - 8.0),
                                    vec2(16.0, 16.0),
                                ),
                                self.tokens.accent,
                            );
                        }

                        ui.painter().text(
                            Pos2::new(item_rect.min.x + 32.0, item_rect.center().y),
                            Align2::LEFT_CENTER,
                            label,
                            FontId::proportional(typography::BODY),
                            if is_active {
                                self.tokens.text_primary
                            } else {
                                self.tokens.text_secondary
                            },
                        );

                        if item_resp.clicked() {
                            state.filter_choice.progress = prog;
                            state.close_popup();
                        }
                        item_y += dimensions::POPUP_ROW_HEIGHT;
                    }
                    ui.painter().hline(
                        (menu_rect.min.x + 8.0)..=(menu_rect.max.x - 8.0),
                        item_y,
                        Stroke::new(1.0, self.tokens.divider),
                    );
                    let clear_rect = Rect::from_min_size(
                        Pos2::new(menu_rect.min.x + 8.0, item_y + 2.0),
                        vec2(menu_w - 16.0, dimensions::POPUP_ROW_HEIGHT),
                    );
                    let clear_response = ui.allocate_rect(clear_rect, Sense::click());
                    if clear_response.hovered() {
                        ui.painter().rect_filled(
                            clear_rect,
                            CornerRadius::same(radii::CONTROLS),
                            self.tokens.hover_fill,
                        );
                    }
                    ui.painter().text(
                        clear_rect.left_center() + vec2(8.0, 0.0),
                        Align2::LEFT_CENTER,
                        "Clear filters",
                        FontId::proportional(typography::BODY),
                        self.tokens.text_secondary,
                    );
                    if clear_response.clicked() {
                        state.filter_choice.progress = ProgressFilter::All;
                        state.close_popup();
                    }
                }
                ActivePopupMenu::View => {
                    let items = ["River", "Square", "Small", "Medium", "Large"];
                    let menu_h = (items.len() as f32 * dimensions::POPUP_ROW_HEIGHT)
                        + (dimensions::POPUP_PADDING * 2.0);
                    let menu_rect = Rect::from_min_size(menu_pos, vec2(menu_w, menu_h));

                    ui.painter().rect_filled(
                        menu_rect,
                        CornerRadius::same(radii::PANELS),
                        self.tokens.window_bg,
                    );
                    ui.painter().rect_stroke(
                        menu_rect,
                        CornerRadius::same(radii::PANELS),
                        Stroke::new(1.0, self.tokens.divider),
                        StrokeKind::Inside,
                    );

                    let mut item_y = menu_rect.min.y + dimensions::POPUP_PADDING;
                    for (index, label) in items.into_iter().enumerate() {
                        let item_rect = Rect::from_min_size(
                            Pos2::new(menu_rect.min.x + dimensions::POPUP_PADDING, item_y),
                            vec2(
                                menu_w - (dimensions::POPUP_PADDING * 2.0),
                                dimensions::POPUP_ROW_HEIGHT,
                            ),
                        );
                        let item_resp = ui.allocate_rect(item_rect, Sense::click());
                        let is_active = match index {
                            0 => state.gallery_layout == GalleryLayout::River,
                            1 => state.gallery_layout == GalleryLayout::Square,
                            2 => state.tile_size == TileSize::Small,
                            3 => state.tile_size == TileSize::Medium,
                            _ => state.tile_size == TileSize::Large,
                        };

                        if item_resp.hovered() {
                            ui.painter().rect_filled(
                                item_rect,
                                CornerRadius::same(radii::CONTROLS),
                                self.tokens.hover_fill,
                            );
                        }
                        if is_active {
                            ui.painter().rect_filled(
                                item_rect,
                                CornerRadius::same(radii::CONTROLS),
                                self.tokens.selected_fill,
                            );
                            self.icons.paint_icon(
                                ui,
                                "check",
                                Rect::from_min_size(
                                    Pos2::new(item_rect.min.x + 8.0, item_rect.center().y - 8.0),
                                    vec2(16.0, 16.0),
                                ),
                                self.tokens.accent,
                            );
                        }

                        ui.painter().text(
                            Pos2::new(item_rect.min.x + 32.0, item_rect.center().y),
                            Align2::LEFT_CENTER,
                            label,
                            FontId::proportional(typography::BODY),
                            if is_active {
                                self.tokens.text_primary
                            } else {
                                self.tokens.text_secondary
                            },
                        );

                        if item_resp.clicked() {
                            match index {
                                0 => state.gallery_layout = GalleryLayout::River,
                                1 => state.gallery_layout = GalleryLayout::Square,
                                2 => state.tile_size = TileSize::Small,
                                3 => state.tile_size = TileSize::Medium,
                                _ => state.tile_size = TileSize::Large,
                            }
                            state.close_popup();
                        }
                        item_y += dimensions::POPUP_ROW_HEIGHT;
                    }
                }
                ActivePopupMenu::Overflow => {
                    let menu_h =
                        (2.0 * dimensions::POPUP_ROW_HEIGHT) + (dimensions::POPUP_PADDING * 2.0);
                    let menu_rect = Rect::from_min_size(menu_pos, vec2(menu_w, menu_h));

                    ui.painter().rect_filled(
                        menu_rect,
                        CornerRadius::same(radii::PANELS),
                        self.tokens.window_bg,
                    );
                    ui.painter().rect_stroke(
                        menu_rect,
                        CornerRadius::same(radii::PANELS),
                        Stroke::new(1.0, self.tokens.divider),
                        StrokeKind::Inside,
                    );

                    let item1_rect = Rect::from_min_size(
                        Pos2::new(
                            menu_rect.min.x + dimensions::POPUP_PADDING,
                            menu_rect.min.y + dimensions::POPUP_PADDING,
                        ),
                        vec2(
                            menu_w - (dimensions::POPUP_PADDING * 2.0),
                            dimensions::POPUP_ROW_HEIGHT,
                        ),
                    );
                    let item1_resp = ui.allocate_rect(item1_rect, Sense::click());
                    if item1_resp.hovered() {
                        ui.painter().rect_filled(
                            item1_rect,
                            CornerRadius::same(radii::CONTROLS),
                            self.tokens.hover_fill,
                        );
                    }
                    ui.painter().text(
                        Pos2::new(item1_rect.min.x + 12.0, item1_rect.center().y),
                        Align2::LEFT_CENTER,
                        "Rescan all",
                        FontId::proportional(typography::BODY),
                        self.tokens.text_primary,
                    );
                    if item1_resp.clicked() {
                        state.close_popup();
                    }
                }
            }
        }

        // Render Folder Context Menu if open
        if let Some(ctx_menu) = state.context_menu.clone() {
            let menu_w = 210.0;
            let mut items = vec![("Scan this folder", 1), ("Open in Explorer", 2)];
            if ctx_menu.is_root {
                items.push(("Remove from library", 3));
            } else {
                items.push(("Exclude from library", 4));
            }
            let menu_h = (items.len() as f32 * dimensions::POPUP_ROW_HEIGHT)
                + (dimensions::POPUP_PADDING * 2.0);
            let menu_rect = Rect::from_min_size(ctx_menu.position, vec2(menu_w, menu_h));

            ui.painter().rect_filled(
                menu_rect,
                CornerRadius::same(radii::PANELS),
                self.tokens.window_bg,
            );
            ui.painter().rect_stroke(
                menu_rect,
                CornerRadius::same(radii::PANELS),
                Stroke::new(1.0, self.tokens.divider),
                StrokeKind::Inside,
            );

            let mut item_y = menu_rect.min.y + dimensions::POPUP_PADDING;
            for (label, id) in items {
                let item_rect = Rect::from_min_size(
                    Pos2::new(menu_rect.min.x + dimensions::POPUP_PADDING, item_y),
                    vec2(
                        menu_w - (dimensions::POPUP_PADDING * 2.0),
                        dimensions::POPUP_ROW_HEIGHT,
                    ),
                );
                let item_resp = ui.allocate_rect(item_rect, Sense::click());
                if item_resp.hovered() {
                    ui.painter().rect_filled(
                        item_rect,
                        CornerRadius::same(radii::CONTROLS),
                        self.tokens.hover_fill,
                    );
                }
                ui.painter().text(
                    Pos2::new(item_rect.min.x + 12.0, item_rect.center().y),
                    Align2::LEFT_CENTER,
                    label,
                    FontId::proportional(typography::BODY),
                    self.tokens.text_primary,
                );

                if item_resp.clicked() {
                    match id {
                        1 => *action = ShellAction::ScanFolder(ctx_menu.path.clone()),
                        2 => *action = ShellAction::OpenInExplorer(ctx_menu.path.clone()),
                        3 => {
                            *action = ShellAction::RemoveFolder(ctx_menu.path.clone());
                        }
                        4 => *action = ShellAction::ExcludeSubfolder(ctx_menu.path.clone()),
                        _ => {}
                    }
                    state.context_menu = None;
                }
                item_y += dimensions::POPUP_ROW_HEIGHT;
            }
        }
    }
}
