use crate::theme::ValorTheme;
use egui::{Align2, Color32, CornerRadius, Pos2, Rect, Sense, Stroke, Ui, Vec2};
use valor_player::PlaybackState;

pub struct VideoUiState {
    pub is_ui_visible: bool,
    pub is_peeking: bool,
    pub is_dock_collapsed: bool,
    pub show_stats: bool,
    pub show_pause_card: bool,
    pub show_remaining_time: bool,
    pub active_dock_tiles: [bool; 16],
    pub context_menu: Option<Pos2>,
}

impl Default for VideoUiState {
    fn default() -> Self {
        Self {
            is_ui_visible: true,
            is_peeking: false,
            is_dock_collapsed: false,
            show_stats: false,
            show_pause_card: true,
            show_remaining_time: false,
            active_dock_tiles: [
                true, true, true, true, true, true, false, true, true, false, false, true, false,
                true, false, false,
            ],
            context_menu: None,
        }
    }
}

pub fn render_hold_g_peek(
    ui: &mut Ui,
    theme: &ValorTheme,
    playback: &PlaybackState,
    screen_rect: Rect,
) {
    // Dimmed overlay
    ui.painter().rect_filled(
        screen_rect,
        CornerRadius::ZERO,
        Color32::from_rgba_premultiplied(0, 0, 0, 180),
    );

    // Formatted time readouts
    let pos_secs = playback.position_secs;
    let dur_secs = playback.duration_secs;
    let time_str = format_time(pos_secs);
    let remaining_str = format!("-{}", format_time((dur_secs - pos_secs).max(0.0)));

    let center = screen_rect.center();

    // Large time readout
    ui.painter().text(
        Pos2::new(center.x, center.y - 70.0),
        Align2::CENTER_CENTER,
        time_str,
        egui::FontId::proportional(80.0),
        Color32::WHITE,
    );

    // Full-width timeline strip with tick marks at 10% increments
    let bar_width = (screen_rect.width() - 140.0).max(400.0);
    let bar_rect = Rect::from_center_size(
        Pos2::new(center.x, center.y + 10.0),
        Vec2::new(bar_width, 6.0),
    );
    ui.painter().rect_filled(
        bar_rect,
        CornerRadius::same(3),
        Color32::from_rgba_premultiplied(255, 255, 255, 50),
    );

    let progress = if dur_secs > 0.0 {
        (pos_secs / dur_secs).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let filled_rect =
        Rect::from_min_size(bar_rect.min, Vec2::new(bar_width * progress as f32, 6.0));
    ui.painter()
        .rect_filled(filled_rect, CornerRadius::same(3), theme.accent_amber);

    // 10% Increment Tick Marks (0% to 100%)
    for step in 0..=10 {
        let frac = step as f32 / 10.0;
        let tick_x = bar_rect.min.x + frac * bar_width;
        let is_major = step == 0 || step == 5 || step == 10;
        let tick_h = if is_major { 16.0 } else { 10.0 };
        let tick_rect = Rect::from_center_size(
            Pos2::new(tick_x, bar_rect.center().y),
            Vec2::new(2.0, tick_h),
        );
        ui.painter().rect_filled(
            tick_rect,
            CornerRadius::same(1),
            Color32::from_rgba_premultiplied(255, 255, 255, 140),
        );

        // Percentage label
        let pct_str = format!("{}%", step * 10);
        ui.painter().text(
            Pos2::new(tick_x, bar_rect.center().y + 18.0),
            Align2::CENTER_CENTER,
            pct_str,
            egui::FontId::proportional(11.0),
            theme.text_muted,
        );

        // Timestamp label
        if dur_secs > 0.0 && is_major {
            let tick_sec = dur_secs * (frac as f64);
            ui.painter().text(
                Pos2::new(tick_x, bar_rect.center().y + 32.0),
                Align2::CENTER_CENTER,
                format_time(tick_sec),
                egui::FontId::proportional(10.0),
                Color32::from_rgba_premultiplied(200, 200, 200, 120),
            );
        }
    }

    // Playhead thumb
    let thumb_center = Pos2::new(
        bar_rect.min.x + bar_width * progress as f32,
        bar_rect.center().y,
    );
    ui.painter()
        .circle_filled(thumb_center, 8.0, theme.accent_amber);

    // Stats line
    let stats_str = format!(
        "{} remaining • FPS: {:.1} • 4K HEVC Main 10 • E-AC-3 5.1",
        remaining_str, playback.fps
    );
    ui.painter().text(
        Pos2::new(center.x, center.y + 70.0),
        Align2::CENTER_CENTER,
        stats_str,
        egui::FontId::proportional(15.0),
        theme.text_muted,
    );
}

pub fn render_pause_screen(
    ui: &mut Ui,
    _theme: &ValorTheme,
    screen_rect: Rect,
    series_title: &str,
    episode_info: &str,
    description: &str,
) {
    // Blur/dim background
    ui.painter().rect_filled(
        screen_rect,
        CornerRadius::ZERO,
        Color32::from_rgba_premultiplied(0, 0, 0, 140),
    );

    // Left info card
    let info_x = screen_rect.min.x + 60.0;
    let info_y = screen_rect.center().y - 30.0;

    // Series title
    ui.painter().text(
        Pos2::new(info_x, info_y),
        Align2::LEFT_BOTTOM,
        series_title.to_uppercase(),
        egui::FontId::proportional(38.0),
        Color32::WHITE,
    );

    // Match badge & Episode info
    let sub_text = format!("85% Match 2026 TV-MA  {}", episode_info);
    ui.painter().text(
        Pos2::new(info_x, info_y + 24.0),
        Align2::LEFT_TOP,
        sub_text,
        egui::FontId::proportional(16.0),
        Color32::from_rgb(52, 211, 153), // Green match
    );

    // Description
    ui.painter().text(
        Pos2::new(info_x, info_y + 55.0),
        Align2::LEFT_TOP,
        description,
        egui::FontId::proportional(14.0),
        Color32::from_rgb(209, 213, 219),
    );

    // PAUSED badge in bottom right (as seen in screenshot 2)
    let badge_rect = Rect::from_min_size(
        Pos2::new(screen_rect.max.x - 140.0, screen_rect.max.y - 70.0),
        Vec2::new(100.0, 32.0),
    );
    ui.painter().rect_filled(
        badge_rect,
        CornerRadius::same(6),
        Color32::from_rgba_premultiplied(0, 0, 0, 180),
    );
    ui.painter().rect_stroke(
        badge_rect,
        CornerRadius::same(6),
        Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 40)),
        egui::StrokeKind::Inside,
    );
    ui.painter().text(
        badge_rect.center(),
        Align2::CENTER_CENTER,
        "⏸ PAUSED",
        egui::FontId::proportional(12.0),
        Color32::WHITE,
    );
}

pub fn render_ui_settings_dock(
    ui: &mut Ui,
    theme: &ValorTheme,
    screen_rect: Rect,
    dock_state: &mut VideoUiState,
) {
    let tile_size = 46.0;
    let padding = 8.0;
    let grid_size = 4;
    let dock_width = grid_size as f32 * tile_size + (grid_size as f32 + 1.0) * padding;
    let dock_height = grid_size as f32 * tile_size + (grid_size as f32 + 1.0) * padding + 40.0;

    let dock_x = if dock_state.is_dock_collapsed {
        screen_rect.max.x - 24.0
    } else {
        screen_rect.max.x - dock_width - 24.0
    };
    let dock_y = screen_rect.center().y - dock_height * 0.5;

    let dock_rect = Rect::from_min_size(
        Pos2::new(dock_x, dock_y),
        Vec2::new(dock_width, dock_height),
    );

    // Collapse pill button
    let pill_rect = Rect::from_center_size(
        Pos2::new(dock_rect.min.x - 12.0, dock_rect.center().y),
        Vec2::new(24.0, 48.0),
    );

    let pill_response = ui.allocate_rect(pill_rect, Sense::click());
    if pill_response.clicked() {
        dock_state.is_dock_collapsed = !dock_state.is_dock_collapsed;
    }

    ui.painter().rect_filled(
        pill_rect,
        CornerRadius::same(6),
        Color32::from_rgba_premultiplied(22, 27, 38, 230),
    );
    ui.painter().rect_stroke(
        pill_rect,
        CornerRadius::same(6),
        Stroke::new(1.0, theme.panel_border),
        egui::StrokeKind::Inside,
    );
    let arrow_str = if dock_state.is_dock_collapsed {
        "◀"
    } else {
        "▶"
    };
    ui.painter().text(
        pill_rect.center(),
        Align2::CENTER_CENTER,
        arrow_str,
        egui::FontId::proportional(11.0),
        theme.text_muted,
    );

    if dock_state.is_dock_collapsed {
        return;
    }

    // Dock container background
    ui.painter()
        .rect_filled(dock_rect, CornerRadius::same(14), theme.panel_bg);
    ui.painter().rect_stroke(
        dock_rect,
        CornerRadius::same(14),
        Stroke::new(1.0, theme.panel_border),
        egui::StrokeKind::Inside,
    );

    // Title & Close
    ui.painter().text(
        Pos2::new(dock_rect.min.x + 14.0, dock_rect.min.y + 14.0),
        Align2::LEFT_TOP,
        "UI Settings",
        egui::FontId::proportional(14.0),
        Color32::WHITE,
    );

    // 4x4 Grid of Tiles
    let tile_labels = [
        "✨", "☀️", "📚", "T", "▶", "⏰", "🎛", "🔊", "⛶", "⚡", "☕", "⏭", "🚫", "⏩", "🔒", "⏮",
    ];

    let start_x = dock_rect.min.x + padding;
    let start_y = dock_rect.min.y + 36.0;

    for row in 0..4 {
        for col in 0..4 {
            let idx = row * 4 + col;
            let tile_rect = Rect::from_min_size(
                Pos2::new(
                    start_x + col as f32 * (tile_size + padding),
                    start_y + row as f32 * (tile_size + padding),
                ),
                Vec2::new(tile_size, tile_size),
            );

            let is_active = dock_state.active_dock_tiles[idx];
            let resp = ui.allocate_rect(tile_rect, Sense::click());
            if resp.clicked() {
                dock_state.active_dock_tiles[idx] = !dock_state.active_dock_tiles[idx];
            }

            // Tile #1 (idx 1): HDR Tone Mapping uses amber accent with REIN badge
            let (bg, stroke) = if idx == 1 && is_active {
                (
                    Color32::from_rgba_premultiplied(60, 40, 10, 220),
                    Stroke::new(1.5, Color32::from_rgb(245, 158, 11)), // Amber-500
                )
            } else if is_active {
                (
                    Color32::from_rgb(37, 99, 235), // Blue active
                    Stroke::new(1.5, Color32::from_rgb(96, 165, 250)),
                )
            } else {
                (
                    Color32::from_rgba_premultiplied(30, 41, 59, 200),
                    Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 20)),
                )
            };

            ui.painter()
                .rect_filled(tile_rect, CornerRadius::same(10), bg);
            ui.painter().rect_stroke(
                tile_rect,
                CornerRadius::same(10),
                stroke,
                egui::StrokeKind::Inside,
            );

            // Render REIN badge on HDR Tone Mapping tile (idx 1)
            if idx == 1 {
                let badge_rect = Rect::from_min_size(
                    Pos2::new(tile_rect.max.x - 22.0, tile_rect.min.y + 4.0),
                    Vec2::new(18.0, 10.0),
                );
                ui.painter().rect_filled(
                    badge_rect,
                    CornerRadius::same(3),
                    Color32::from_rgb(245, 158, 11),
                );
                ui.painter().text(
                    badge_rect.center(),
                    Align2::CENTER_CENTER,
                    "REIN",
                    egui::FontId::proportional(7.5),
                    Color32::BLACK,
                );
            }

            ui.painter().text(
                tile_rect.center(),
                Align2::CENTER_CENTER,
                tile_labels[idx],
                egui::FontId::proportional(18.0),
                if idx == 1 && is_active {
                    Color32::from_rgb(245, 158, 11)
                } else {
                    Color32::WHITE
                },
            );
        }
    }
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct BottomControlEvents {
    pub toggle_play: bool,
    pub seek_target: Option<f64>,
    pub seek_relative: Option<f64>,
    pub set_volume: Option<f64>,
    pub toggle_mute: bool,
    pub cycle_audio_boost: bool,
    pub set_speed: Option<f64>,
    pub cycle_audio_track: bool,
    pub cycle_subtitle_track: bool,
    pub toggle_fullscreen: bool,
    pub toggle_pip: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResumePromptAction {
    Resume,
    StartOver,
    Dismiss,
}

pub fn render_resume_prompt(
    ui: &mut Ui,
    theme: &ValorTheme,
    screen_rect: Rect,
    resume_secs: f64,
    remaining_secs: f64,
) -> Option<ResumePromptAction> {
    let mut action = None;
    let card_w = 420.0;
    let card_h = 44.0;
    let card_rect = Rect::from_center_size(
        Pos2::new(screen_rect.center().x, screen_rect.min.y + 76.0),
        Vec2::new(card_w, card_h),
    );

    ui.painter().rect_filled(
        card_rect,
        CornerRadius::same(10),
        Color32::from_rgba_premultiplied(17, 24, 39, 230),
    );
    ui.painter().rect_stroke(
        card_rect,
        CornerRadius::same(10),
        Stroke::new(1.0, theme.accent_amber),
        egui::StrokeKind::Inside,
    );

    let text = format!(
        "Resume from {}? ({:.0}s left)",
        format_time(resume_secs),
        remaining_secs.max(0.0)
    );
    ui.painter().text(
        Pos2::new(card_rect.min.x + 16.0, card_rect.center().y),
        Align2::LEFT_CENTER,
        text,
        egui::FontId::proportional(13.0),
        Color32::WHITE,
    );

    // Resume button
    let res_rect = Rect::from_center_size(
        Pos2::new(card_rect.max.x - 120.0, card_rect.center().y),
        Vec2::new(65.0, 26.0),
    );
    let res_btn = ui.allocate_rect(res_rect, Sense::click());
    if res_btn.clicked() {
        action = Some(ResumePromptAction::Resume);
    }
    ui.painter()
        .rect_filled(res_rect, CornerRadius::same(5), theme.accent_amber);
    ui.painter().text(
        res_rect.center(),
        Align2::CENTER_CENTER,
        "Resume",
        egui::FontId::proportional(12.0),
        Color32::from_rgb(17, 24, 39),
    );

    // Start Over button
    let start_rect = Rect::from_center_size(
        Pos2::new(card_rect.max.x - 45.0, card_rect.center().y),
        Vec2::new(75.0, 26.0),
    );
    let start_btn = ui.allocate_rect(start_rect, Sense::click());
    if start_btn.clicked() {
        action = Some(ResumePromptAction::StartOver);
    }
    ui.painter().rect_stroke(
        start_rect,
        CornerRadius::same(5),
        Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 80)),
        egui::StrokeKind::Inside,
    );
    ui.painter().text(
        start_rect.center(),
        Align2::CENTER_CENTER,
        "Restart",
        egui::FontId::proportional(12.0),
        Color32::WHITE,
    );

    action
}

pub fn render_bottom_controls(
    ui: &mut Ui,
    theme: &ValorTheme,
    screen_rect: Rect,
    playback: &PlaybackState,
    is_playing: bool,
    ui_state: &mut VideoUiState,
    chapters: &[valor_core::models::ChapterItem],
) -> BottomControlEvents {
    let mut events = BottomControlEvents::default();

    let dock_width = (screen_rect.width() - 48.0).min(1040.0);
    let dock_height = 80.0;
    let dock_rect = Rect::from_center_size(
        Pos2::new(screen_rect.center().x, screen_rect.max.y - 56.0),
        Vec2::new(dock_width, dock_height),
    );

    ui.painter()
        .rect_filled(dock_rect, CornerRadius::same(16), theme.panel_bg);
    ui.painter().rect_stroke(
        dock_rect,
        CornerRadius::same(16),
        Stroke::new(1.0, theme.panel_border),
        egui::StrokeKind::Inside,
    );

    // ==========================================
    // 1. SEEK BAR WITH BUFFERED RANGE & CHAPTERS
    // ==========================================
    let slider_x = dock_rect.min.x + 16.0;
    let slider_w = dock_rect.width() - 32.0;
    let slider_rect = Rect::from_min_size(
        Pos2::new(slider_x, dock_rect.min.y + 12.0),
        Vec2::new(slider_w, 6.0),
    );

    let slider_resp = ui.allocate_rect(slider_rect.expand(6.0), Sense::click_and_drag());
    if let Some(pos) = slider_resp.interact_pointer_pos() {
        let norm = ((pos.x - slider_rect.min.x) / slider_rect.width()).clamp(0.0, 1.0);
        events.seek_target = Some(norm as f64 * playback.duration_secs);
    }

    // Background track
    ui.painter().rect_filled(
        slider_rect,
        CornerRadius::same(3),
        Color32::from_rgba_premultiplied(255, 255, 255, 30),
    );

    // Buffered range fill
    if playback.duration_secs > 0.0 && playback.buffered_secs > 0.0 {
        let buf_norm = (playback.buffered_secs / playback.duration_secs).clamp(0.0, 1.0);
        let buf_rect =
            Rect::from_min_size(slider_rect.min, Vec2::new(slider_w * buf_norm as f32, 6.0));
        ui.painter().rect_filled(
            buf_rect,
            CornerRadius::same(3),
            Color32::from_rgba_premultiplied(255, 255, 255, 65),
        );
    }

    // Played range fill
    let progress = if playback.duration_secs > 0.0 {
        (playback.position_secs / playback.duration_secs).clamp(0.0, 1.0)
    } else {
        0.0
    };
    let filled_rect =
        Rect::from_min_size(slider_rect.min, Vec2::new(slider_w * progress as f32, 6.0));
    ui.painter()
        .rect_filled(filled_rect, CornerRadius::same(3), theme.accent_amber);

    // Chapter marks
    if playback.duration_secs > 0.0 {
        for ch in chapters {
            let ch_norm = (ch.start_secs / playback.duration_secs).clamp(0.0, 1.0) as f32;
            let ch_x = slider_rect.min.x + ch_norm * slider_w;
            let tick_rect = Rect::from_center_size(
                Pos2::new(ch_x, slider_rect.center().y),
                Vec2::new(2.0, 8.0),
            );
            ui.painter().rect_filled(
                tick_rect,
                CornerRadius::same(1),
                Color32::from_rgba_premultiplied(255, 255, 255, 180),
            );
        }
    }

    // Playhead thumb
    let thumb_center = Pos2::new(
        slider_rect.min.x + slider_w * progress as f32,
        slider_rect.center().y,
    );
    ui.painter()
        .circle_filled(thumb_center, 6.0, theme.accent_amber);

    // Hover timestamp tooltip over seek bar
    if let Some(hover_pos) = slider_resp.hover_pos() {
        let hover_norm = ((hover_pos.x - slider_rect.min.x) / slider_w).clamp(0.0, 1.0);
        let hover_sec = hover_norm as f64 * playback.duration_secs;
        let mut hover_text = format_time(hover_sec);

        // Check if near any chapter mark
        if playback.duration_secs > 0.0 {
            for ch in chapters {
                let ch_norm = (ch.start_secs / playback.duration_secs).clamp(0.0, 1.0) as f32;
                let ch_x = slider_rect.min.x + ch_norm * slider_w;
                if (hover_pos.x - ch_x).abs() < 8.0 {
                    hover_text = format!("{} • {}", ch.title, hover_text);
                    break;
                }
            }
        }

        let tip_rect = Rect::from_center_size(
            Pos2::new(hover_pos.x, slider_rect.min.y - 16.0),
            Vec2::new(hover_text.len() as f32 * 7.5 + 16.0, 22.0),
        );
        ui.painter().rect_filled(
            tip_rect,
            CornerRadius::same(5),
            Color32::from_rgba_premultiplied(15, 23, 42, 230),
        );
        ui.painter().rect_stroke(
            tip_rect,
            CornerRadius::same(5),
            Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 50)),
            egui::StrokeKind::Inside,
        );
        ui.painter().text(
            tip_rect.center(),
            Align2::CENTER_CENTER,
            hover_text,
            egui::FontId::proportional(11.0),
            Color32::WHITE,
        );
    }

    // ==========================================
    // 2. CONTROLS ROW (LEFT, CENTER, RIGHT)
    // ==========================================
    let btn_center_y = dock_rect.min.y + 46.0;

    // --- LEFT GROUP ---
    // Play/Pause button
    let play_rect = Rect::from_center_size(
        Pos2::new(dock_rect.min.x + 36.0, btn_center_y),
        Vec2::new(34.0, 34.0),
    );
    if ui.allocate_rect(play_rect, Sense::click()).clicked() {
        events.toggle_play = true;
    }
    ui.painter()
        .circle_filled(play_rect.center(), 17.0, theme.accent_amber);
    let icon = if is_playing { "⏸" } else { "▶" };
    ui.painter().text(
        play_rect.center(),
        Align2::CENTER_CENTER,
        icon,
        egui::FontId::proportional(15.0),
        Color32::from_rgb(17, 24, 39),
    );

    // Rewind 10s
    let rew_rect = Rect::from_center_size(
        Pos2::new(dock_rect.min.x + 80.0, btn_center_y),
        Vec2::new(28.0, 28.0),
    );
    if ui.allocate_rect(rew_rect, Sense::click()).clicked() {
        events.seek_relative = Some(-10.0);
    }
    ui.painter().text(
        rew_rect.center(),
        Align2::CENTER_CENTER,
        "↺10",
        egui::FontId::proportional(12.0),
        theme.text_primary,
    );

    // Forward 10s
    let fwd_rect = Rect::from_center_size(
        Pos2::new(dock_rect.min.x + 116.0, btn_center_y),
        Vec2::new(28.0, 28.0),
    );
    if ui.allocate_rect(fwd_rect, Sense::click()).clicked() {
        events.seek_relative = Some(10.0);
    }
    ui.painter().text(
        fwd_rect.center(),
        Align2::CENTER_CENTER,
        "↻10",
        egui::FontId::proportional(12.0),
        theme.text_primary,
    );

    // Mute / Unmute Button
    let mute_rect = Rect::from_center_size(
        Pos2::new(dock_rect.min.x + 154.0, btn_center_y),
        Vec2::new(28.0, 28.0),
    );
    if ui.allocate_rect(mute_rect, Sense::click()).clicked() {
        events.toggle_mute = true;
    }
    let vol_icon = if playback.is_muted || playback.volume <= 0.0 {
        "🔇"
    } else {
        "🔊"
    };
    ui.painter().text(
        mute_rect.center(),
        Align2::CENTER_CENTER,
        vol_icon,
        egui::FontId::proportional(13.0),
        theme.text_primary,
    );

    // Volume Mini Slider (width 50px)
    let vol_slider_rect = Rect::from_min_size(
        Pos2::new(dock_rect.min.x + 174.0, btn_center_y - 2.0),
        Vec2::new(50.0, 4.0),
    );
    let vol_resp = ui.allocate_rect(vol_slider_rect.expand(4.0), Sense::click_and_drag());
    if let Some(pos) = vol_resp.interact_pointer_pos() {
        let vol_norm = ((pos.x - vol_slider_rect.min.x) / vol_slider_rect.width()).clamp(0.0, 1.0);
        events.set_volume = Some(vol_norm as f64 * 2.0); // 0% to 200%
    }
    ui.painter().rect_filled(
        vol_slider_rect,
        CornerRadius::same(2),
        Color32::from_rgba_premultiplied(255, 255, 255, 40),
    );
    let vol_frac = (playback.volume / 2.0).clamp(0.0, 1.0) as f32;
    ui.painter().rect_filled(
        Rect::from_min_size(vol_slider_rect.min, Vec2::new(50.0 * vol_frac, 4.0)),
        CornerRadius::same(2),
        theme.accent_amber,
    );

    // Time Display (Click to toggle elapsed vs remaining, Hover shows total)
    let time_str = if ui_state.show_remaining_time {
        format!(
            "-{}",
            format_time((playback.duration_secs - playback.position_secs).max(0.0))
        )
    } else {
        format_time(playback.position_secs)
    };
    let time_rect = Rect::from_center_size(
        Pos2::new(dock_rect.min.x + 270.0, btn_center_y),
        Vec2::new(60.0, 24.0),
    );
    let time_resp = ui.allocate_rect(time_rect, Sense::click());
    if time_resp.clicked() {
        ui_state.show_remaining_time = !ui_state.show_remaining_time;
    }
    if time_resp.hovered() {
        time_resp.on_hover_text(format!(
            "Total Duration: {}\nClick to toggle elapsed/remaining",
            format_time(playback.duration_secs)
        ));
    }
    ui.painter().text(
        time_rect.center(),
        Align2::CENTER_CENTER,
        time_str,
        egui::FontId::proportional(12.0),
        theme.text_muted,
    );

    // --- RIGHT GROUP ---
    // Fullscreen Button
    let fs_rect = Rect::from_center_size(
        Pos2::new(dock_rect.max.x - 30.0, btn_center_y),
        Vec2::new(28.0, 28.0),
    );
    if ui.allocate_rect(fs_rect, Sense::click()).clicked() {
        events.toggle_fullscreen = true;
    }
    ui.painter().text(
        fs_rect.center(),
        Align2::CENTER_CENTER,
        "⛶",
        egui::FontId::proportional(14.0),
        theme.text_primary,
    );

    // Picture-in-Picture Button
    let pip_rect = Rect::from_center_size(
        Pos2::new(dock_rect.max.x - 66.0, btn_center_y),
        Vec2::new(28.0, 28.0),
    );
    if ui.allocate_rect(pip_rect, Sense::click()).clicked() {
        events.toggle_pip = true;
    }
    ui.painter().text(
        pip_rect.center(),
        Align2::CENTER_CENTER,
        "🗗",
        egui::FontId::proportional(13.0),
        theme.text_primary,
    );

    // Subtitle Picker Button
    let sub_rect = Rect::from_center_size(
        Pos2::new(dock_rect.max.x - 108.0, btn_center_y),
        Vec2::new(42.0, 24.0),
    );
    if ui.allocate_rect(sub_rect, Sense::click()).clicked() {
        events.cycle_subtitle_track = true;
    }
    ui.painter().rect_stroke(
        sub_rect,
        CornerRadius::same(4),
        Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 40)),
        egui::StrokeKind::Inside,
    );
    ui.painter().text(
        sub_rect.center(),
        Align2::CENTER_CENTER,
        "SUB",
        egui::FontId::proportional(10.0),
        theme.text_primary,
    );

    // Audio Track Button
    let aud_rect = Rect::from_center_size(
        Pos2::new(dock_rect.max.x - 156.0, btn_center_y),
        Vec2::new(42.0, 24.0),
    );
    if ui.allocate_rect(aud_rect, Sense::click()).clicked() {
        events.cycle_audio_track = true;
    }
    ui.painter().rect_stroke(
        aud_rect,
        CornerRadius::same(4),
        Stroke::new(1.0, Color32::from_rgba_premultiplied(255, 255, 255, 40)),
        egui::StrokeKind::Inside,
    );
    ui.painter().text(
        aud_rect.center(),
        Align2::CENTER_CENTER,
        "AUD",
        egui::FontId::proportional(10.0),
        theme.text_primary,
    );

    // Playback Speed Button (cycles 0.5x -> 0.75x -> 1.0x -> 1.25x -> 1.5x -> 2.0x -> 1.0x)
    let spd_rect = Rect::from_center_size(
        Pos2::new(dock_rect.max.x - 206.0, btn_center_y),
        Vec2::new(46.0, 24.0),
    );
    if ui.allocate_rect(spd_rect, Sense::click()).clicked() {
        let next_spd = if playback.speed < 0.75 {
            0.75
        } else if playback.speed < 1.0 {
            1.0
        } else if playback.speed < 1.25 {
            1.25
        } else if playback.speed < 1.5 {
            1.5
        } else if playback.speed < 2.0 {
            2.0
        } else {
            1.0
        };
        events.set_speed = Some(next_spd);
    }
    ui.painter().rect_filled(
        spd_rect,
        CornerRadius::same(4),
        Color32::from_rgba_premultiplied(255, 255, 255, 20),
    );
    ui.painter().text(
        spd_rect.center(),
        Align2::CENTER_CENTER,
        format!("{:.1}x", playback.speed),
        egui::FontId::proportional(11.0),
        Color32::WHITE,
    );

    // Audio Boost Toggle Pill (Off, +6dB, +12dB with peak limiter)
    let boost_rect = Rect::from_center_size(
        Pos2::new(dock_rect.max.x - 272.0, btn_center_y),
        Vec2::new(72.0, 24.0),
    );
    if ui.allocate_rect(boost_rect, Sense::click()).clicked() {
        events.cycle_audio_boost = true;
    }
    let (boost_label, boost_color) = match playback.audio_boost_tier {
        200 => ("+6 dB", theme.accent_amber),
        400 => ("+12 dB", Color32::from_rgb(239, 68, 68)),
        _ => ("BOOST OFF", theme.text_muted),
    };
    ui.painter().rect_filled(
        boost_rect,
        CornerRadius::same(4),
        Color32::from_rgba_premultiplied(255, 255, 255, 20),
    );
    ui.painter().text(
        boost_rect.center(),
        Align2::CENTER_CENTER,
        boost_label,
        egui::FontId::proportional(10.0),
        boost_color,
    );

    events
}

fn format_time(secs: f64) -> String {
    if secs.is_nan() || secs < 0.0 {
        return "00:00".to_string();
    }
    let total = secs as u64;
    let h = total / 3600;
    let m = (total % 3600) / 60;
    let s = total % 60;
    if h > 0 {
        format!("{}:{:02}:{:02}", h, m, s)
    } else {
        format!("{:02}:{:02}", m, s)
    }
}
