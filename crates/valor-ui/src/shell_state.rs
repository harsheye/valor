use crate::shell_tokens::dimensions;
use egui::Pos2;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Receiver, Sender};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NavItem {
    Home,
    Library,
    Playlists,
    History,
    Scans,
    Stats,
    Theme,
    Settings,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ActivePopupMenu {
    File,
    Sort,
    Filter,
    View,
    Overflow,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortField {
    DateTaken,
    DateCreated,
    DateModified,
    Name,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GalleryLayout {
    River,
    Square,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TileSize {
    Small,
    Medium,
    Large,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ProgressFilter {
    All,
    InProgress,
    Unwatched,
    Watched,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewMode {
    Large,
    Medium,
    Small,
    List,
}

#[derive(Debug, Clone)]
pub struct SortChoice {
    pub field: SortField,
    pub ascending: bool,
}

impl Default for SortChoice {
    fn default() -> Self {
        Self {
            field: SortField::DateTaken,
            ascending: false,
        }
    }
}

#[derive(Debug, Clone)]
pub struct FilterChoice {
    pub progress: ProgressFilter,
}

impl Default for FilterChoice {
    fn default() -> Self {
        Self {
            progress: ProgressFilter::All,
        }
    }
}

impl FilterChoice {
    pub fn is_active(&self) -> bool {
        self.progress != ProgressFilter::All
    }
}

#[derive(Debug, Clone)]
pub struct ViewChoice {
    pub mode: ViewMode,
}

impl Default for ViewChoice {
    fn default() -> Self {
        Self {
            mode: ViewMode::Medium,
        }
    }
}

#[derive(Debug, Clone)]
pub struct FolderTreeNode {
    pub name: String,
    pub path: PathBuf,
    pub is_expanded: bool,
    pub is_missing: bool,
    pub has_subfolders: bool,
    pub children: Vec<FolderTreeNode>,
}

impl FolderTreeNode {
    pub fn new(path: PathBuf) -> Self {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path.to_string_lossy().to_string());
        Self {
            name,
            path,
            is_expanded: false,
            is_missing: false,
            // Children are discovered asynchronously when the row is expanded.
            has_subfolders: true,
            children: Vec::new(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct FolderContextMenu {
    pub path: PathBuf,
    pub position: Pos2,
    pub is_root: bool,
}

pub enum FolderWorkerMsg {
    SubfoldersLoaded {
        parent_path: PathBuf,
        subfolders: Vec<PathBuf>,
    },
}

fn is_tree_junk(path: &Path) -> bool {
    let name = path
        .file_name()
        .map(|value| value.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    [
        "$recycle.bin",
        "system volume information",
        "recovery",
        "$windows.~bt",
        "windows",
        "program files",
        "program files (x86)",
        "programdata",
        "appdata",
        "node_modules",
        ".git",
        ".cache",
    ]
    .contains(&name.as_str())
        || name.starts_with('.')
}

fn contains_video(path: &Path, depth: u8) -> bool {
    if depth == 0 {
        return false;
    }
    let Ok(entries) = std::fs::read_dir(path) else {
        return false;
    };
    for entry in entries.flatten() {
        let candidate = entry.path();
        if candidate.is_dir() {
            if !is_tree_junk(&candidate) && contains_video(&candidate, depth - 1) {
                return true;
            }
        } else if candidate.extension().is_some_and(|extension| {
            matches!(
                extension.to_string_lossy().to_ascii_lowercase().as_str(),
                "mp4"
                    | "mkv"
                    | "mov"
                    | "avi"
                    | "webm"
                    | "m4v"
                    | "mpg"
                    | "mpeg"
                    | "wmv"
                    | "ts"
                    | "mts"
                    | "m2ts"
            )
        }) {
            return true;
        }
    }
    false
}

#[derive(Debug, Clone, Default)]
pub struct TmdbRecommendation {
    pub tmdb_id: u64,
    pub title: String,
    pub media_type: String,
    pub vote_average: f32,
    pub release_year: String,
    pub reason: String,
}

#[derive(Debug, Clone, Default)]
pub struct TmdbSeriesInfo {
    pub tmdb_id: u64,
    pub name: String,
    pub media_type: String,
    pub release_year: String,
    pub vote_average: f32,
    pub overview: String,
    pub genres: Vec<String>,
    pub total_seasons: u32,
    pub total_episodes: u32,
    pub season_episode_counts: std::collections::HashMap<u32, u32>,
    pub episode_titles: std::collections::HashMap<(u32, u32), String>,
}

pub struct ShellState {
    pub settings: valor_core::settings::Settings,
    pub selected_media_info: Option<String>,
    pub skin_load_error: Option<String>,
    pub settings_section: usize,
    pub settings_search: String,
    pub settings_scroll_speed: u16,
    pub settings_reduce_motion: bool,
    pub nav_width: f32,
    pub is_nav_collapsed: bool,
    pub nav_user_overrode: bool,
    pub nav_pinned_open: bool,
    pub tree_flyout_open: bool,
    pub selected_nav: NavItem,
    pub selected_folder: Option<PathBuf>,
    pub this_pc_expanded: bool,
    pub root_folders: Vec<FolderTreeNode>,
    pub folder_counts: std::collections::HashMap<String, usize>,
    pub scan_status: std::collections::HashMap<PathBuf, String>,
    pub excluded_paths: Vec<PathBuf>,
    pub active_popup: Option<ActivePopupMenu>,
    pub file_menu_pos: Pos2,
    pub recent_submenu_open: bool,
    pub quit_at_end_of_playlist: bool,
    pub mini_bar_dismissed_fingerprint: Option<String>,
    pub context_menu: Option<FolderContextMenu>,
    pub search_query: String,
    pub search_focused: bool,
    pub request_search_focus: bool,
    pub select_mode: bool,
    pub selected_media: HashSet<String>,
    pub history_search: String,
    pub history_filter: crate::view_models::HistoryFilterPill,
    pub history_selected_day: Option<chrono::NaiveDate>,
    pub confirm_clear_history: bool,
    pub clear_history_reset_positions: bool,
    pub library_tab: crate::view_models::LibraryTab,
    pub library_filter: crate::view_models::FilterPill,
    pub library_sort: crate::view_models::SortOption,
    pub library_view: crate::view_models::ViewMode,
    pub timeline_year: Option<i32>,
    pub selected_series: Option<String>,
    pub tmdb_series_cache: std::collections::HashMap<String, TmdbSeriesInfo>,
    pub tmdb_pending: std::collections::HashSet<String>,
    pub sort_choice: SortChoice,
    pub movie_list_col_widths: [f32; 9],
    pub series_list_col_widths: [f32; 5],
    pub media_telemetry: std::collections::HashMap<String, valor_core::models::MediaTelemetry>,
    pub tmdb_recommendations: Vec<TmdbRecommendation>,
    pub gallery_layout: GalleryLayout,
    pub tile_size: TileSize,
    pub group_by_date: bool,
    pub filter_choice: FilterChoice,
    pub view_choice: ViewChoice,
    pub history_count: usize,
    pub fake_hover_settings: bool,
    pub fake_hover_close: bool,
    pub trakt_device_code: Option<(String, String, String)>,
    pub trakt_status_msg: Option<String>,
    pub list_sort_col: usize,
    pub list_sort_asc: bool,
    pub playlists: Vec<valor_core::models::Collection>,
    pub selected_playlist_id: Option<String>,
    pub new_playlist_name: String,
    pub add_to_playlist_target: Option<String>,
    pub playlist_picker_open: bool,
    pub playlist_picker_query: String,

    // Async worker channels for lazy folder child loading
    worker_tx: Sender<PathBuf>,
    worker_rx: Receiver<FolderWorkerMsg>,
}

impl Default for ShellState {
    fn default() -> Self {
        Self::new()
    }
}

impl ShellState {
    pub fn new() -> Self {
        let (worker_tx, work_rx) = channel::<PathBuf>();
        let (res_tx, worker_rx) = channel::<FolderWorkerMsg>();

        // Spawn background worker for non-blocking directory inspection
        std::thread::Builder::new()
            .name("valor-folder-worker".into())
            .spawn(move || {
                while let Ok(path) = work_rx.recv() {
                    let mut subfolders = Vec::new();
                    if let Ok(entries) = std::fs::read_dir(&path) {
                        for entry in entries.flatten() {
                            let p = entry.path();
                            if p.is_dir() && !is_tree_junk(&p) && contains_video(&p, 6) {
                                subfolders.push(p);
                            }
                        }
                    }
                    subfolders.sort_by(|a, b| a.file_name().cmp(&b.file_name()));
                    let _ = res_tx.send(FolderWorkerMsg::SubfoldersLoaded {
                        parent_path: path,
                        subfolders,
                    });
                }
            })
            .expect("Failed to spawn folder worker thread");

        Self {
            settings: valor_core::settings::Settings::load().unwrap_or_default(),
            selected_media_info: None,
            skin_load_error: None,
            settings_section: 0,
            settings_search: String::new(),
            settings_scroll_speed: 100,
            settings_reduce_motion: false,
            nav_width: dimensions::NAV_WIDTH_DEFAULT,
            is_nav_collapsed: true,
            nav_user_overrode: false,
            nav_pinned_open: false,
            tree_flyout_open: false,
            selected_nav: NavItem::Home,
            selected_folder: None,
            this_pc_expanded: true,
            root_folders: Vec::new(),
            folder_counts: std::collections::HashMap::new(),
            scan_status: std::collections::HashMap::new(),
            excluded_paths: Vec::new(),
            active_popup: None,
            file_menu_pos: Pos2::ZERO,
            recent_submenu_open: false,
            quit_at_end_of_playlist: false,
            mini_bar_dismissed_fingerprint: None,
            context_menu: None,
            search_query: String::new(),
            search_focused: false,
            request_search_focus: false,
            select_mode: false,
            selected_media: HashSet::new(),
            history_search: String::new(),
            history_filter: crate::view_models::HistoryFilterPill::All,
            history_selected_day: None,
            confirm_clear_history: false,
            clear_history_reset_positions: false,
            library_tab: crate::view_models::LibraryTab::Movies,
            library_filter: crate::view_models::FilterPill::All,
            library_sort: crate::view_models::SortOption::DateAddedDesc,
            library_view: crate::view_models::ViewMode::Grid,
            timeline_year: None,
            selected_series: None,
            tmdb_series_cache: std::collections::HashMap::new(),
            tmdb_pending: std::collections::HashSet::new(),
            movie_list_col_widths: [250.0, 130.0, 70.0, 72.0, 72.0, 62.0, 124.0, 88.0, 56.0],
            series_list_col_widths: [280.0, 80.0, 80.0, 100.0, 70.0],
            media_telemetry: std::collections::HashMap::new(),
            tmdb_recommendations: Vec::new(),
            sort_choice: SortChoice::default(),
            gallery_layout: GalleryLayout::River,
            tile_size: TileSize::Medium,
            group_by_date: true,
            filter_choice: FilterChoice::default(),
            view_choice: ViewChoice::default(),
            history_count: 0,
            fake_hover_settings: false,
            fake_hover_close: false,
            trakt_device_code: None,
            trakt_status_msg: None,
            list_sort_col: 0,
            list_sort_asc: true,
            playlists: Vec::new(),
            selected_playlist_id: None,
            new_playlist_name: String::new(),
            add_to_playlist_target: None,
            playlist_picker_open: false,
            playlist_picker_query: String::new(),
            worker_tx,
            worker_rx,
        }
    }

    pub fn clamp_nav_width(&mut self, w: f32) {
        self.nav_width = w.clamp(dimensions::NAV_WIDTH_MIN, dimensions::NAV_WIDTH_MAX);
    }

    pub fn toggle_nav_collapsed(&mut self) {
        self.is_nav_collapsed = !self.is_nav_collapsed;
        self.nav_user_overrode = true;
        self.nav_pinned_open = !self.is_nav_collapsed;
    }

    pub fn toggle_this_pc(&mut self) {
        self.this_pc_expanded = !self.this_pc_expanded;
    }

    pub fn toggle_popup(&mut self, popup: ActivePopupMenu) {
        if self.active_popup == Some(popup) {
            self.active_popup = None;
        } else {
            self.active_popup = Some(popup);
        }
    }

    pub fn close_popup(&mut self) {
        self.active_popup = None;
    }

    pub fn add_folder(&mut self, path: PathBuf) {
        if !self.root_folders.iter().any(|f| f.path == path) {
            self.root_folders.push(FolderTreeNode::new(path));
        }
    }

    pub fn remove_folder(&mut self, path: &Path) {
        self.root_folders.retain(|f| f.path != path);
        if self.selected_folder.as_deref() == Some(path) {
            self.selected_folder = None;
        }
    }

    pub fn remove_tree_path(&mut self, path: &Path) {
        fn remove(nodes: &mut Vec<FolderTreeNode>, path: &Path) -> bool {
            let before = nodes.len();
            nodes.retain(|node| node.path != path);
            if nodes.len() != before {
                return true;
            }
            nodes
                .iter_mut()
                .any(|node| remove(&mut node.children, path))
        }
        let _ = remove(&mut self.root_folders, path);
    }

    pub fn toggle_node_expansion(&mut self, path: &Path) {
        fn toggle_rec(nodes: &mut [FolderTreeNode], target: &Path, tx: &Sender<PathBuf>) -> bool {
            for node in nodes {
                if node.path == target {
                    node.is_expanded = !node.is_expanded;
                    if node.is_expanded && node.children.is_empty() && node.has_subfolders {
                        let _ = tx.send(node.path.clone());
                    }
                    return true;
                }
                if toggle_rec(&mut node.children, target, tx) {
                    return true;
                }
            }
            false
        }
        toggle_rec(&mut self.root_folders, path, &self.worker_tx);
    }

    pub fn poll_worker(&mut self) {
        while let Ok(msg) = self.worker_rx.try_recv() {
            match msg {
                FolderWorkerMsg::SubfoldersLoaded {
                    parent_path,
                    mut subfolders,
                } => {
                    subfolders.retain(|path| {
                        !self
                            .excluded_paths
                            .iter()
                            .any(|excluded| valor_core::path_utils::path_is_within(path, excluded))
                    });
                    fn update_rec(nodes: &mut [FolderTreeNode], parent: &Path, subs: &[PathBuf]) {
                        for node in nodes {
                            if node.path == parent {
                                node.children = subs
                                    .iter()
                                    .map(|p| FolderTreeNode::new(p.clone()))
                                    .collect();
                                node.has_subfolders = !subs.is_empty();
                                return;
                            }
                            update_rec(&mut node.children, parent, subs);
                        }
                    }
                    update_rec(&mut self.root_folders, &parent_path, &subfolders);
                }
            }
        }
    }
}
