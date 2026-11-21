use crate::theme::ValorTheme;
use egui::{Align2, Color32, CornerRadius, Pos2, Rect, Sense, Stroke, Ui, Vec2};
use valor_core::models::Bookmark;

#[derive(Debug, Clone, PartialEq)]
pub enum BookmarkAction {
    AddCurrentTime,
    SeekTo(f64),
    Delete(String),
    Close,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct BookmarksModalState {
    pub is_open: bool,
}

pub fn render_bookmarks_modal(
    ui: &mut Ui,
    theme: &ValorTheme,
    screen_rect: Rect,
    bookmarks: &[Bookmark],
    current_time_secs: f64,
    state: &mut BookmarksModalState,
) -> Option<BookmarkAction> {
    if !state.is_open {
        return None;
    }

    let mut action = None;

    // Full screen overlay backdrop
    let backdrop_resp = ui.allocate_rect(screen_rect, Sense::click());
    if backdrop_resp.clicked() {
        state.is_open = false;
        return Some(BookmarkAction::Close);
    }
    ui.painter().rect_filled(
        screen_rect,
        CornerRadius::ZERO,
        Color32::from_rgba_premultiplied(0, 0, 0, 160),
    );

    // Modal Card
    let modal_w = 420.0;
    let modal_h = (bookmarks.len() as f32 * 72.0 + 150.0).clamp(240.0, 540.0);
    let modal_rect = Rect::from_center_size(screen_rect.center(), Vec2::new(modal_w, modal_h));

    // Card background
    ui.painter().rect_filled(
        modal_rect,
        CornerRadius::same(16),
        Color32::from_rgb(22, 27, 38),
    );
    ui.painter().rect_stroke(
        modal_rect,
        CornerRadius::same(16),
        Stroke::new(1.0, theme.panel_border),
        egui::StrokeKind::Inside,
    );

    // Header
    let header_rect = Rect::from_min_size(modal_rect.min, Vec2::new(modal_w, 64.0));
    let icon_rect = Rect::from_center_size(
        Pos2::new(header_rect.min.x + 36.0, header_rect.center().y),
        Vec2::new(32.0, 32.0),
    );
    ui.painter().rect_filled(
        icon_rect,
        CornerRadius::same(8),
        Color32::from_rgba_premultiplied(168, 85, 247, 40),
    );
    ui.painter().text(
        icon_rect.center(),
        Align2::CENTER_CENTER,
        "🔖",
        egui::FontId::proportional(14.0),
        Color32::from_rgb(192, 132, 252),
    );

    ui.painter().text(
        Pos2::new(header_rect.min.x + 64.0, header_rect.min.y + 20.0),
        Align2::LEFT_TOP,
        "Bookmarks",
        egui::FontId::proportional(16.0),
        Color32::WHITE,
    );

    let count_text = format!("{} saved in this video", bookmarks.len());
    ui.painter().text(
        Pos2::new(header_rect.min.x + 64.0, header_rect.min.y + 40.0),
        Align2::LEFT_TOP,
        count_text,
        egui::FontId::proportional(12.0),
        theme.text_muted,
    );

    // Close button
    let close_rect = Rect::from_center_size(
        Pos2::new(header_rect.max.x - 28.0, header_rect.center().y),
        Vec2::new(28.0, 28.0),
    );
    if ui.allocate_rect(close_rect, Sense::click()).clicked() {
        state.is_open = false;
        return Some(BookmarkAction::Close);
    }
    ui.painter().text(
        close_rect.center(),
        Align2::CENTER_CENTER,
        "✕",
        egui::FontId::proportional(14.0),
        theme.text_muted,
    );

    // "+ Bookmark current time" primary action button
    let add_btn_rect = Rect::from_min_size(
        Pos2::new(modal_rect.min.x + 18.0, header_rect.max.y),
        Vec2::new(modal_w - 36.0, 38.0),
    );

    let add_resp = ui.allocate_rect(add_btn_rect, Sense::click());
    let add_bg = if add_resp.hovered() {
        Color32::from_rgb(168, 85, 247)
    } else {
        Color32::from_rgb(147, 51, 234)
    };
    ui.painter()
        .rect_filled(add_btn_rect, CornerRadius::same(10), add_bg);
    ui.painter().text(
        add_btn_rect.center(),
        Align2::CENTER_CENTER,
        format!(
            "+ Bookmark current time ({})",
            format_time(current_time_secs)
        ),
        egui::FontId::proportional(13.0),
        Color32::WHITE,
    );

    if add_resp.clicked() {
        action = Some(BookmarkAction::AddCurrentTime);
    }

    // Bookmarks list
    let list_top = add_btn_rect.max.y + 12.0;
    let item_h = 58.0;

    for (idx, b) in bookmarks.iter().enumerate() {
        let item_rect = Rect::from_min_size(
            Pos2::new(
                modal_rect.min.x + 18.0,
                list_top + idx as f32 * (item_h + 8.0),
            ),
            Vec2::new(modal_w - 36.0, item_h),
        );

        if item_rect.max.y > modal_rect.max.y - 10.0 {
            break;
        }

        ui.painter().rect_filled(
            item_rect,
            CornerRadius::same(12),
            Color32::from_rgba_premultiplied(30, 41, 59, 180),
        );
        ui.painter().rect_stroke(
            item_rect,
            CornerRadius::same(12),
            Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 12)),
            egui::StrokeKind::Inside,
        );

        // Leading icon
        let b_icon_rect = Rect::from_center_size(
            Pos2::new(item_rect.min.x + 28.0, item_rect.center().y),
            Vec2::new(32.0, 32.0),
        );
        let is_credits = b.category.to_lowercase().contains("credit");
        let (icon_bg, icon_str, icon_color) = if is_credits {
            (
                Color32::from_rgba_premultiplied(234, 179, 8, 30),
                "🚩",
                Color32::from_rgb(250, 204, 21),
            )
        } else {
            (
                Color32::from_rgba_premultiplied(59, 130, 246, 30),
                "▷",
                Color32::from_rgb(96, 165, 250),
            )
        };
        ui.painter()
            .rect_filled(b_icon_rect, CornerRadius::same(8), icon_bg);
        ui.painter().text(
            b_icon_rect.center(),
            Align2::CENTER_CENTER,
            icon_str,
            egui::FontId::proportional(13.0),
            icon_color,
        );

        // Title & Category Badge
        ui.painter().text(
            Pos2::new(item_rect.min.x + 54.0, item_rect.min.y + 14.0),
            Align2::LEFT_TOP,
            &b.title,
            egui::FontId::proportional(13.0),
            Color32::WHITE,
        );

        let badge_rect = Rect::from_min_size(
            Pos2::new(item_rect.min.x + 120.0, item_rect.min.y + 13.0),
            Vec2::new(60.0, 16.0),
        );
        ui.painter().rect_filled(
            badge_rect,
            CornerRadius::same(4),
            Color32::from_rgba_premultiplied(59, 130, 246, 40),
        );
        ui.painter().text(
            badge_rect.center(),
            Align2::CENTER_CENTER,
            b.category.to_uppercase(),
            egui::FontId::proportional(9.0),
            Color32::from_rgb(147, 197, 253),
        );

        // Timestamp text
        let time_range_str = if let Some(end) = b.end_secs {
            let dur = (end - b.start_secs).max(0.0) as u64;
            format!(
                "{} → {} · {}s",
                format_time(b.start_secs),
                format_time(end),
                dur
            )
        } else {
            format_time(b.start_secs)
        };
        ui.painter().text(
            Pos2::new(item_rect.min.x + 54.0, item_rect.min.y + 34.0),
            Align2::LEFT_TOP,
            time_range_str,
            egui::FontId::proportional(11.0),
            theme.text_muted,
        );

        // Delete button
        let del_rect = Rect::from_center_size(
            Pos2::new(item_rect.max.x - 56.0, item_rect.center().y),
            Vec2::new(24.0, 24.0),
        );
        if ui.allocate_rect(del_rect, Sense::click()).clicked() {
            action = Some(BookmarkAction::Delete(b.id.clone()));
        }
        ui.painter().text(
            del_rect.center(),
            Align2::CENTER_CENTER,
            "🗑",
            egui::FontId::proportional(12.0),
            theme.text_muted,
        );

        // Play/Jump circular button
        let play_b_rect = Rect::from_center_size(
            Pos2::new(item_rect.max.x - 24.0, item_rect.center().y),
            Vec2::new(28.0, 28.0),
        );
        let play_resp = ui.allocate_rect(play_b_rect, Sense::click());
        let p_bg = if play_resp.hovered() {
            Color32::from_rgb(192, 132, 252)
        } else {
            Color32::from_rgb(168, 85, 247)
        };
        ui.painter().circle_filled(play_b_rect.center(), 14.0, p_bg);
        ui.painter().text(
            play_b_rect.center(),
            Align2::CENTER_CENTER,
            "▶",
            egui::FontId::proportional(11.0),
            Color32::from_rgb(17, 24, 39),
        );

        if play_resp.clicked() {
            action = Some(BookmarkAction::SeekTo(b.start_secs));
        }
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
