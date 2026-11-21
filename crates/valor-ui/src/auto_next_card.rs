use crate::theme::ValorTheme;
use egui::{Align2, Color32, CornerRadius, Pos2, Rect, Sense, Stroke, Ui, Vec2};

#[derive(Debug, Clone, PartialEq)]
pub enum AutoNextAction {
    PlayNow,
    Cancel,
}

pub fn render_auto_next_card(
    ui: &mut Ui,
    theme: &ValorTheme,
    screen_rect: Rect,
    next_title: &str,
    countdown_secs: f64,
) -> Option<AutoNextAction> {
    let mut action = None;

    let card_w = 380.0;
    let card_h = 100.0;
    let card_rect = Rect::from_center_size(
        Pos2::new(
            screen_rect.max.x - card_w * 0.5 - 30.0,
            screen_rect.max.y - 120.0,
        ),
        Vec2::new(card_w, card_h),
    );

    ui.painter()
        .rect_filled(card_rect, CornerRadius::same(14), theme.panel_bg);
    ui.painter().rect_stroke(
        card_rect,
        CornerRadius::same(14),
        Stroke::new(1.0, theme.accent_amber),
        egui::StrokeKind::Inside,
    );

    // Title
    ui.painter().text(
        Pos2::new(card_rect.min.x + 16.0, card_rect.min.y + 16.0),
        Align2::LEFT_TOP,
        "Up Next",
        egui::FontId::proportional(12.0),
        theme.accent_amber,
    );

    let display_title = if next_title.len() > 30 {
        format!("{}…", &next_title[..30])
    } else {
        next_title.to_string()
    };

    ui.painter().text(
        Pos2::new(card_rect.min.x + 16.0, card_rect.min.y + 36.0),
        Align2::LEFT_TOP,
        format!("{} ({:.0}s)", display_title, countdown_secs.ceil()),
        egui::FontId::proportional(14.0),
        Color32::WHITE,
    );

    // Buttons
    let btn_y = card_rect.max.y - 34.0;

    // Play Now
    let play_rect = Rect::from_min_size(
        Pos2::new(card_rect.min.x + 16.0, btn_y),
        Vec2::new(100.0, 26.0),
    );
    let play_resp = ui.allocate_rect(play_rect, Sense::click());
    let p_bg = if play_resp.hovered() {
        theme.accent_amber
    } else {
        Color32::from_rgb(217, 119, 6)
    };
    ui.painter()
        .rect_filled(play_rect, CornerRadius::same(6), p_bg);
    ui.painter().text(
        play_rect.center(),
        Align2::CENTER_CENTER,
        "▶ Play Now",
        egui::FontId::proportional(11.0),
        Color32::from_rgb(17, 24, 39),
    );
    if play_resp.clicked() {
        action = Some(AutoNextAction::PlayNow);
    }

    // Cancel
    let cancel_rect = Rect::from_min_size(
        Pos2::new(play_rect.max.x + 10.0, btn_y),
        Vec2::new(80.0, 26.0),
    );
    let cancel_resp = ui.allocate_rect(cancel_rect, Sense::click());
    ui.painter().rect_filled(
        cancel_rect,
        CornerRadius::same(6),
        Color32::from_rgba_premultiplied(255, 255, 255, 20),
    );
    ui.painter().text(
        cancel_rect.center(),
        Align2::CENTER_CENTER,
        "Cancel",
        egui::FontId::proportional(11.0),
        theme.text_muted,
    );
    if cancel_resp.clicked() {
        action = Some(AutoNextAction::Cancel);
    }

    action
}

pub fn render_finished_card(
    ui: &mut Ui,
    theme: &ValorTheme,
    screen_rect: Rect,
    countdown_secs: f64,
) -> Option<AutoNextAction> {
    let mut action = None;

    let card_w = 340.0;
    let card_h = 100.0;
    let card_rect = Rect::from_center_size(screen_rect.center(), Vec2::new(card_w, card_h));

    ui.painter()
        .rect_filled(card_rect, CornerRadius::same(14), theme.panel_bg);
    ui.painter().rect_stroke(
        card_rect,
        CornerRadius::same(14),
        Stroke::new(1.0, theme.panel_border),
        egui::StrokeKind::Inside,
    );

    ui.painter().text(
        Pos2::new(card_rect.center().x, card_rect.min.y + 24.0),
        Align2::CENTER_CENTER,
        format!("Finished. Back to home in {:.0}s", countdown_secs.ceil()),
        egui::FontId::proportional(15.0),
        Color32::WHITE,
    );

    let btn_y = card_rect.max.y - 38.0;

    let home_rect = Rect::from_center_size(
        Pos2::new(card_rect.center().x - 60.0, btn_y),
        Vec2::new(100.0, 28.0),
    );
    if ui.allocate_rect(home_rect, Sense::click()).clicked() {
        action = Some(AutoNextAction::PlayNow); // Trigger go home immediately
    }
    ui.painter()
        .rect_filled(home_rect, CornerRadius::same(6), theme.accent_amber);
    ui.painter().text(
        home_rect.center(),
        Align2::CENTER_CENTER,
        "Go Home",
        egui::FontId::proportional(12.0),
        Color32::from_rgb(17, 24, 39),
    );

    let cancel_rect = Rect::from_center_size(
        Pos2::new(card_rect.center().x + 60.0, btn_y),
        Vec2::new(100.0, 28.0),
    );
    if ui.allocate_rect(cancel_rect, Sense::click()).clicked() {
        action = Some(AutoNextAction::Cancel);
    }
    ui.painter().rect_filled(
        cancel_rect,
        CornerRadius::same(6),
        Color32::from_rgba_premultiplied(255, 255, 255, 20),
    );
    ui.painter().text(
        cancel_rect.center(),
        Align2::CENTER_CENTER,
        "Stay",
        egui::FontId::proportional(12.0),
        theme.text_muted,
    );

    action
}
