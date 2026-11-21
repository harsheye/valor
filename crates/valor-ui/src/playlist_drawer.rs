use crate::theme::ValorTheme;
use egui::{Align2, Color32, CornerRadius, Pos2, Rect, Sense, Stroke, Ui, Vec2};
use valor_core::models::MediaItem;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RepeatMode {
    Off,
    One,
    All,
}

#[derive(Debug, Clone, PartialEq)]
pub enum PlaylistAction {
    SelectIndex(usize),
    RemoveIndex(usize),
    MoveUp(usize),
    MoveDown(usize),
    ToggleShuffle,
    CycleRepeat,
    NaturalSort,
    Close,
}

pub struct PlaylistDrawerState {
    pub is_open: bool,
    pub repeat_mode: RepeatMode,
    pub is_shuffled: bool,
    pub shuffle_indices: Vec<usize>,
}

impl Default for PlaylistDrawerState {
    fn default() -> Self {
        Self {
            is_open: false,
            repeat_mode: RepeatMode::Off,
            is_shuffled: false,
            shuffle_indices: Vec::new(),
        }
    }
}

pub fn render_playlist_drawer(
    ui: &mut Ui,
    theme: &ValorTheme,
    screen_rect: Rect,
    collection_name: &str,
    items: &[MediaItem],
    current_index: usize,
    state: &mut PlaylistDrawerState,
) -> Option<PlaylistAction> {
    if !state.is_open {
        return None;
    }

    let mut action = None;
    let drawer_width = 320.0;
    let drawer_rect = Rect::from_min_size(
        Pos2::new(screen_rect.max.x - drawer_width, screen_rect.min.y),
        Vec2::new(drawer_width, screen_rect.height()),
    );

    // Dimmed backdrop behind drawer
    let backdrop_rect = Rect::from_min_size(
        screen_rect.min,
        Vec2::new(screen_rect.width() - drawer_width, screen_rect.height()),
    );
    let backdrop_resp = ui.allocate_rect(backdrop_rect, Sense::click());
    if backdrop_resp.clicked() {
        state.is_open = false;
        return Some(PlaylistAction::Close);
    }
    ui.painter().rect_filled(
        backdrop_rect,
        CornerRadius::ZERO,
        Color32::from_rgba_premultiplied(0, 0, 0, 80),
    );

    // Drawer surface
    ui.painter()
        .rect_filled(drawer_rect, CornerRadius::ZERO, theme.panel_bg);
    ui.painter().line_segment(
        [drawer_rect.left_top(), drawer_rect.left_bottom()],
        Stroke::new(1.0, theme.panel_border),
    );

    // Header area
    let header_rect = Rect::from_min_size(drawer_rect.min, Vec2::new(drawer_width, 56.0));
    ui.painter().rect_filled(
        header_rect,
        CornerRadius::ZERO,
        Color32::from_rgba_premultiplied(15, 20, 30, 240),
    );

    // Title & item count badge
    ui.painter().text(
        Pos2::new(header_rect.min.x + 16.0, header_rect.center().y),
        Align2::LEFT_CENTER,
        collection_name,
        egui::FontId::proportional(15.0),
        Color32::WHITE,
    );

    let count_text = format!("({})", items.len());
    ui.painter().text(
        Pos2::new(header_rect.min.x + 16.0 + 90.0, header_rect.center().y),
        Align2::LEFT_CENTER,
        count_text,
        egui::FontId::proportional(12.0),
        theme.text_muted,
    );

    // Sort Button
    let sort_rect = Rect::from_center_size(
        Pos2::new(header_rect.max.x - 105.0, header_rect.center().y),
        Vec2::new(26.0, 26.0),
    );
    if ui.allocate_rect(sort_rect, Sense::click()).clicked() {
        action = Some(PlaylistAction::NaturalSort);
    }
    ui.painter().text(
        sort_rect.center(),
        Align2::CENTER_CENTER,
        "🔤",
        egui::FontId::proportional(13.0),
        theme.text_primary,
    );

    // Shuffle Button
    let shuffle_rect = Rect::from_center_size(
        Pos2::new(header_rect.max.x - 75.0, header_rect.center().y),
        Vec2::new(26.0, 26.0),
    );
    if ui.allocate_rect(shuffle_rect, Sense::click()).clicked() {
        state.is_shuffled = !state.is_shuffled;
        action = Some(PlaylistAction::ToggleShuffle);
    }
    let shuffle_color = if state.is_shuffled {
        theme.accent_amber
    } else {
        theme.text_muted
    };
    ui.painter().text(
        shuffle_rect.center(),
        Align2::CENTER_CENTER,
        "🔀",
        egui::FontId::proportional(13.0),
        shuffle_color,
    );

    // Repeat Mode Button
    let repeat_rect = Rect::from_center_size(
        Pos2::new(header_rect.max.x - 45.0, header_rect.center().y),
        Vec2::new(26.0, 26.0),
    );
    if ui.allocate_rect(repeat_rect, Sense::click()).clicked() {
        state.repeat_mode = match state.repeat_mode {
            RepeatMode::Off => RepeatMode::All,
            RepeatMode::All => RepeatMode::One,
            RepeatMode::One => RepeatMode::Off,
        };
        action = Some(PlaylistAction::CycleRepeat);
    }
    let (rep_icon, rep_color) = match state.repeat_mode {
        RepeatMode::Off => ("🔁", theme.text_muted),
        RepeatMode::All => ("🔁", theme.accent_amber),
        RepeatMode::One => ("🔂", theme.accent_amber),
    };
    ui.painter().text(
        repeat_rect.center(),
        Align2::CENTER_CENTER,
        rep_icon,
        egui::FontId::proportional(13.0),
        rep_color,
    );

    // Close button
    let close_rect = Rect::from_center_size(
        Pos2::new(header_rect.max.x - 18.0, header_rect.center().y),
        Vec2::new(24.0, 24.0),
    );
    if ui.allocate_rect(close_rect, Sense::click()).clicked() {
        state.is_open = false;
        return Some(PlaylistAction::Close);
    }
    ui.painter().text(
        close_rect.center(),
        Align2::CENTER_CENTER,
        "✕",
        egui::FontId::proportional(14.0),
        theme.text_muted,
    );

    // Item List
    let item_h = 58.0;
    let list_top = header_rect.max.y + 6.0;

    for (idx, item) in items.iter().enumerate() {
        let is_active = idx == current_index;
        let item_rect = Rect::from_min_size(
            Pos2::new(
                drawer_rect.min.x + 8.0,
                list_top + idx as f32 * (item_h + 4.0),
            ),
            Vec2::new(drawer_width - 16.0, item_h),
        );

        if item_rect.max.y > screen_rect.max.y - 10.0 {
            break; // Virtualized view truncation
        }

        let is_hovered = ui.rect_contains_pointer(item_rect);

        let bg = if is_active {
            Color32::from_rgba_premultiplied(245, 158, 11, 35)
        } else if is_hovered {
            Color32::from_rgba_premultiplied(255, 255, 255, 12)
        } else {
            Color32::from_rgba_premultiplied(0, 0, 0, 40)
        };

        let stroke = if is_active {
            Stroke::new(1.0, theme.accent_amber)
        } else {
            Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 10))
        };

        ui.painter()
            .rect_filled(item_rect, CornerRadius::same(8), bg);
        ui.painter().rect_stroke(
            item_rect,
            CornerRadius::same(8),
            stroke,
            egui::StrokeKind::Inside,
        );

        // Click to play item
        let click_resp = ui.allocate_rect(item_rect, Sense::click());
        if click_resp.clicked() {
            action = Some(PlaylistAction::SelectIndex(idx));
        }

        // Index number
        let index_color = if is_active {
            theme.accent_amber
        } else {
            theme.text_muted
        };
        ui.painter().text(
            Pos2::new(item_rect.min.x + 12.0, item_rect.center().y),
            Align2::LEFT_CENTER,
            format!("{:02}", idx + 1),
            egui::FontId::proportional(11.0),
            index_color,
        );

        // Episode title
        let title_color = if is_active {
            Color32::WHITE
        } else {
            theme.text_primary
        };
        let mut display_title = item.title.clone();
        if display_title.len() > 24 {
            display_title.truncate(24);
            display_title.push('…');
        }

        ui.painter().text(
            Pos2::new(item_rect.min.x + 40.0, item_rect.min.y + 16.0),
            Align2::LEFT_CENTER,
            display_title,
            egui::FontId::proportional(12.0),
            title_color,
        );

        // Duration / Details
        let dur_str = format_time(item.duration);
        let detail_str = if let (Some(s), Some(e)) = (item.season_number, item.episode_number) {
            format!("S{:02}E{:02} • {}", s, e, dur_str)
        } else {
            dur_str
        };

        ui.painter().text(
            Pos2::new(item_rect.min.x + 40.0, item_rect.min.y + 36.0),
            Align2::LEFT_CENTER,
            detail_str,
            egui::FontId::proportional(10.0),
            theme.text_muted,
        );

        // Move Up / Down Buttons
        let up_rect = Rect::from_center_size(
            Pos2::new(item_rect.max.x - 44.0, item_rect.min.y + 18.0),
            Vec2::new(18.0, 18.0),
        );
        if ui.allocate_rect(up_rect, Sense::click()).clicked() && idx > 0 {
            action = Some(PlaylistAction::MoveUp(idx));
        }
        ui.painter().text(
            up_rect.center(),
            Align2::CENTER_CENTER,
            "▲",
            egui::FontId::proportional(9.0),
            theme.text_muted,
        );

        let down_rect = Rect::from_center_size(
            Pos2::new(item_rect.max.x - 44.0, item_rect.min.y + 38.0),
            Vec2::new(18.0, 18.0),
        );
        if ui.allocate_rect(down_rect, Sense::click()).clicked() && idx + 1 < items.len() {
            action = Some(PlaylistAction::MoveDown(idx));
        }
        ui.painter().text(
            down_rect.center(),
            Align2::CENTER_CENTER,
            "▼",
            egui::FontId::proportional(9.0),
            theme.text_muted,
        );

        // Remove button
        let rem_rect = Rect::from_center_size(
            Pos2::new(item_rect.max.x - 18.0, item_rect.center().y),
            Vec2::new(20.0, 20.0),
        );
        if ui.allocate_rect(rem_rect, Sense::click()).clicked() {
            action = Some(PlaylistAction::RemoveIndex(idx));
        }
        ui.painter().text(
            rem_rect.center(),
            Align2::CENTER_CENTER,
            "✕",
            egui::FontId::proportional(11.0),
            theme.text_muted,
        );
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
