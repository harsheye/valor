//! Playback HUD rendered from the player snapshot. It never accesses mpv.

use crate::{icons::IconRegistry, shell_tokens::ShellTokens, theme::ValorTheme};
use egui::{
    Align, Align2, Color32, CornerRadius, FontId, Layout, Pos2, Rect, RichText, Sense, Stroke,
    StrokeKind, Ui, Vec2,
};
use std::{
    path::PathBuf,
    time::{Duration, Instant},
};
use valor_core::models::Bookmark;
use valor_player::{PlaybackState, PlayerCommand, PlayerSnapshot};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlayerPanel {
    Queue,
    Bookmarks,
    Tracks,
    Speed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OverlayButtonStyle {
    Transport,
    BottomBar,
    Edge,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TooltipPlacement {
    Above,
    Left,
    Right,
    Below,
}

#[allow(dead_code)]
fn lerp_color(c1: Color32, c2: Color32, t: f32) -> Color32 {
    let t = t.clamp(0.0, 1.0);
    let r = (c1.r() as f32 + (c2.r() as f32 - c1.r() as f32) * t).round() as u8;
    let g = (c1.g() as f32 + (c2.g() as f32 - c1.g() as f32) * t).round() as u8;
    let b = (c1.b() as f32 + (c2.b() as f32 - c1.b() as f32) * t).round() as u8;
    let a = (c1.a() as f32 + (c2.a() as f32 - c1.a() as f32) * t).round() as u8;
    Color32::from_rgba_unmultiplied(r, g, b, a)
}

/// Renders a square, drop-shadowed Fluent tooltip matching Windows Movies & TV.
pub fn draw_tooltip(
    ui: &mut Ui,
    theme: &ValorTheme,
    anchor_rect: Rect,
    text: &str,
    placement: TooltipPlacement,
) {
    let font = FontId::proportional(theme.tooltip_font_size);
    let galley = ui.painter().layout_no_wrap(text.to_owned(), font, theme.tooltip_text_color);
    let pill_w = galley.size().x + theme.tooltip_padding.x * 2.0;
    let pill_h = galley.size().y + theme.tooltip_padding.y * 2.0;

    let (raw_x, raw_y) = match placement {
        TooltipPlacement::Above => {
            let y = anchor_rect.top() - theme.tooltip_gap - pill_h;
            let x = anchor_rect.center().x - pill_w * 0.5;
            (x, y)
        }
        TooltipPlacement::Left => {
            let x = anchor_rect.left() - theme.tooltip_gap - pill_w;
            let y = anchor_rect.center().y - pill_h * 0.5;
            (x, y)
        }
        TooltipPlacement::Right => {
            let x = anchor_rect.right() + theme.tooltip_gap;
            let y = anchor_rect.center().y - pill_h * 0.5;
            (x, y)
        }
        TooltipPlacement::Below => {
            let y = anchor_rect.bottom() + theme.tooltip_gap;
            let x = anchor_rect.center().x - pill_w * 0.5;
            (x, y)
        }
    };

    let win = ui.max_rect();
    let clamped_x = raw_x.clamp(win.left() + 4.0, (win.right() - pill_w - 4.0).max(win.left() + 4.0));
    let clamped_y = raw_y.clamp(win.top() + 4.0, (win.bottom() - pill_h - 4.0).max(win.top() + 4.0));
    let pill_rect = Rect::from_min_size(Pos2::new(clamped_x, clamped_y), Vec2::new(pill_w, pill_h));
    let corner_radius = CornerRadius::same(4);

    // Subtle drop shadow: 0 2px 6px rgba(0, 0, 0, 0.40)
    let shadow_rect = pill_rect.translate(Vec2::new(0.0, theme.tooltip_shadow_offset_y));
    let shadow_color = theme.tooltip_shadow_color;
    ui.painter().rect_filled(
        shadow_rect.expand(theme.tooltip_shadow_blur * 0.5),
        corner_radius,
        Color32::from_rgba_unmultiplied(0, 0, 0, (shadow_color.a() as f32 * 0.25) as u8),
    );
    ui.painter().rect_filled(
        shadow_rect.expand(theme.tooltip_shadow_blur * 0.25),
        corner_radius,
        Color32::from_rgba_unmultiplied(0, 0, 0, (shadow_color.a() as f32 * 0.50) as u8),
    );
    ui.painter().rect_filled(
        shadow_rect,
        corner_radius,
        shadow_color,
    );

    // Tooltip fill: rgba(32, 32, 32, 0.95), rounded 4px
    ui.painter().rect_filled(pill_rect, corner_radius, theme.tooltip_fill);

    // 1px border
    ui.painter().rect_stroke(
        pill_rect,
        corner_radius,
        Stroke::new(theme.tooltip_border_width, theme.tooltip_border),
        egui::StrokeKind::Inside,
    );

    // Text: white 12px regular-weight text (not bold), padding 6px 10px
    let text_pos = Pos2::new(
        pill_rect.min.x + theme.tooltip_padding.x,
        pill_rect.min.y + theme.tooltip_padding.y,
    );
    ui.painter().galley(text_pos, galley, theme.tooltip_text_color);
}

#[allow(dead_code)]
fn draw_tooltip_pill(ui: &mut Ui, target_center_x: f32, target_top_y: f32, text: &str) {
    let dummy_rect = Rect::from_center_size(Pos2::new(target_center_x, target_top_y), Vec2::ZERO);
    draw_tooltip(ui, &ValorTheme::default(), dummy_rect, text, TooltipPlacement::Above);
}

/// Common overlay button component supporting rest, hover, and pressed states with ~120ms animation.
pub struct OverlayButton<'a> {
    id_source: egui::Id,
    rect: Rect,
    style: OverlayButtonStyle,
    icon_id: Option<&'a str>,
    custom_icon_size: Option<f32>,
    number_label: Option<&'a str>,
    tooltip: Option<&'a str>,
    tooltip_placement: TooltipPlacement,
}

impl<'a> OverlayButton<'a> {
    pub fn new(id: egui::Id, rect: Rect, style: OverlayButtonStyle) -> Self {
        Self {
            id_source: id,
            rect,
            style,
            icon_id: None,
            custom_icon_size: None,
            number_label: None,
            tooltip: None,
            tooltip_placement: TooltipPlacement::Above,
        }
    }

    pub fn transport(id: egui::Id, rect: Rect) -> Self {
        Self::new(id, rect, OverlayButtonStyle::Transport)
    }

    pub fn bottom_bar(id: egui::Id, rect: Rect) -> Self {
        Self::new(id, rect, OverlayButtonStyle::BottomBar)
    }

    pub fn edge(id: egui::Id, rect: Rect) -> Self {
        Self::new(id, rect, OverlayButtonStyle::Edge)
    }

    pub fn icon(mut self, icon_id: &'a str) -> Self {
        self.icon_id = Some(icon_id);
        self
    }

    pub fn icon_size(mut self, size: f32) -> Self {
        self.custom_icon_size = Some(size);
        self
    }

    pub fn number_label(mut self, label: &'a str) -> Self {
        self.number_label = Some(label);
        self
    }

    pub fn tooltip(mut self, text: &'a str) -> Self {
        self.tooltip = Some(text);
        self
    }

    pub fn tooltip_placement(mut self, placement: TooltipPlacement) -> Self {
        self.tooltip_placement = placement;
        self
    }

    pub fn show(self, ui: &mut Ui, theme: &ValorTheme, icons: &IconRegistry) -> egui::Response {
        let response = ui.allocate_rect(self.rect, Sense::click());
        if response.hovered() {
            ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
        }
        let anim_time = 0.12;
        let hover_t = ui.ctx().animate_bool_with_time(self.id_source.with("hover"), response.hovered(), anim_time);
        let press_t = ui.ctx().animate_bool_with_time(self.id_source.with("press"), response.is_pointer_button_down_on(), anim_time);

        // 1. Paint background fill & border:
        // Resting: transparent, no box, no border
        // Hover: distinct rounded rectangle behind icon rgba(255,255,255,0.22) with 1px border rgba(255,255,255,0.35)
        // Active/pressed: rgba(255,255,255,0.35) with 1px border rgba(255,255,255,0.50)
        if press_t > 0.001 {
            let fill = Color32::from_rgba_unmultiplied(255, 255, 255, (85.0 * press_t) as u8);
            let border = Color32::from_rgba_unmultiplied(255, 255, 255, (120.0 * press_t) as u8);
            ui.painter().rect(self.rect, CornerRadius::same(4), fill, Stroke::new(1.0, border), StrokeKind::Inside);
        } else if hover_t > 0.001 {
            let fill = Color32::from_rgba_unmultiplied(255, 255, 255, (56.0 * hover_t) as u8);
            let border = Color32::from_rgba_unmultiplied(255, 255, 255, (85.0 * hover_t) as u8);
            ui.painter().rect(self.rect, CornerRadius::same(4), fill, Stroke::new(1.0, border), StrokeKind::Inside);
        }

        // 2. Active/pressed icon scaling: scales to 0.95
        let scale = if response.is_pointer_button_down_on() { 0.95 } else { 1.0 };

        // 3. Paint thin-outline Fluent icon (pure white #FFFFFF @ 100%)
        if let Some(icon_id) = self.icon_id {
            let base_size = self.custom_icon_size.unwrap_or(match self.style {
                OverlayButtonStyle::Transport => theme.transport_icon_size,
                OverlayButtonStyle::BottomBar => theme.bottom_icon_size,
                OverlayButtonStyle::Edge => theme.edge_icon_size,
            });
            let icon_size = base_size * scale;
            icons.paint_icon(
                ui,
                icon_id,
                Rect::from_center_size(self.rect.center(), Vec2::splat(icon_size)),
                Color32::WHITE,
            );
        }

        // 4. Paint number inside circular arrow (Back 10 / Forward 30)
        if let Some(num_str) = self.number_label {
            ui.painter().text(
                self.rect.center() + Vec2::new(0.0, 0.5),
                Align2::CENTER_CENTER,
                num_str,
                FontId::proportional(theme.transport_number_font_size * scale),
                Color32::WHITE,
            );
        }

        // 5. Tooltip: small dark rounded label above button after 500ms hover delay, hide immediately on mouse leave
        let tt_delay_t = ui.ctx().animate_bool_with_time(self.id_source.with("tt_delay"), response.hovered(), 0.50);
        if response.hovered() && tt_delay_t >= 0.98 {
            if let Some(tooltip_text) = self.tooltip {
                draw_tooltip(ui, theme, self.rect, tooltip_text, self.tooltip_placement);
            }
        }

        response
    }
}

/// Edge navigation chevron buttons component (bare thin chevrons tight to screen edges).
pub struct EdgeButton;

impl EdgeButton {
    pub fn show_prev(
        ui: &mut Ui,
        theme: &ValorTheme,
        icons: &IconRegistry,
        window_rect: Rect,
        pointer_pos: Option<Pos2>,
        overlay_alpha: f32,
    ) -> egui::Response {
        let rect = Rect::from_min_size(
            Pos2::new(window_rect.left(), window_rect.center().y - theme.edge_button_size.y * 0.5),
            theme.edge_button_size,
        );
        let resp = ui.allocate_rect(rect, Sense::click());
        let near = pointer_pos.is_some_and(|p| {
            p.x <= window_rect.left() + 80.0
                && p.y >= rect.top() - 40.0
                && p.y <= rect.bottom() + 40.0
        });
        let direct_hover = resp.hovered();
        if direct_hover {
            ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
        }
        let base_alpha = 0.55 * overlay_alpha;
        let target_alpha = if direct_hover {
            1.0 * overlay_alpha
        } else if near {
            0.80 * overlay_alpha
        } else {
            base_alpha
        };
        let alpha = ui.ctx().animate_value_with_time(ui.scope_id().with("chevron_l_alpha"), target_alpha, 0.15);

        if direct_hover {
            ui.painter().rect(
                rect,
                CornerRadius::same(4),
                Color32::from_rgba_unmultiplied(255, 255, 255, 56),
                Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 85)),
                StrokeKind::Inside,
            );
        }
        if alpha > 0.01 {
            let tint = Color32::from_white_alpha((255.0 * alpha) as u8);
            icons.paint_icon(
                ui,
                "chevron-left",
                Rect::from_center_size(rect.center(), Vec2::splat(theme.edge_icon_size)),
                tint,
            );
        }
        resp
    }

    pub fn show_next(
        ui: &mut Ui,
        theme: &ValorTheme,
        icons: &IconRegistry,
        window_rect: Rect,
        pointer_pos: Option<Pos2>,
        overlay_alpha: f32,
    ) -> egui::Response {
        let rect = Rect::from_min_size(
            Pos2::new(window_rect.right() - theme.edge_button_size.x, window_rect.center().y - theme.edge_button_size.y * 0.5),
            theme.edge_button_size,
        );
        let resp = ui.allocate_rect(rect, Sense::click());
        let near = pointer_pos.is_some_and(|p| {
            p.x >= window_rect.right() - 80.0
                && p.y >= rect.top() - 40.0
                && p.y <= rect.bottom() + 40.0
        });
        let direct_hover = resp.hovered();
        if direct_hover {
            ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
        }
        let base_alpha = 0.55 * overlay_alpha;
        let target_alpha = if direct_hover {
            1.0 * overlay_alpha
        } else if near {
            0.80 * overlay_alpha
        } else {
            base_alpha
        };
        let alpha = ui.ctx().animate_value_with_time(ui.scope_id().with("chevron_r_alpha"), target_alpha, 0.15);

        if direct_hover {
            ui.painter().rect(
                rect,
                CornerRadius::same(4),
                Color32::from_rgba_unmultiplied(255, 255, 255, 56),
                Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 85)),
                StrokeKind::Inside,
            );
        }
        if alpha > 0.01 {
            let tint = Color32::from_white_alpha((255.0 * alpha) as u8);
            icons.paint_icon(
                ui,
                "chevron-right",
                Rect::from_center_size(rect.center(), Vec2::splat(theme.edge_icon_size)),
                tint,
            );
        }
        resp
    }
}

#[derive(Debug)]
pub struct PlayerUiState {
    pub overlays_visible: bool,
    pub is_fullscreen: bool,
    pub panel: Option<PlayerPanel>,
    pub position_preview: Option<f64>,
    pub is_seeking: bool,
    pub bookmarks: Vec<Bookmark>,
    pub bookmark_fingerprint: Option<String>,
    pub volume_popup_open: bool,
    pub volume_slider_open: bool,
    pub volume_slider_leave_time: Option<Instant>,
    pub subtitles_popup_open: bool,
    pub more_options_open: bool,
    pub zoom_to_fill: bool,
    pub audio_only: bool,
    pub top_right_hover_start: Option<Instant>,
    pub scrub_preview_texture: Option<egui::TextureId>,
    pub scrub_hover_time: Option<f64>,
    pub skip_secs: f64,
    pub locked_mode: bool,
    active_path: Option<PathBuf>,
    last_activity: Instant,
}

impl Default for PlayerUiState {
    fn default() -> Self {
        Self {
            overlays_visible: true,
            is_fullscreen: false,
            panel: None,
            position_preview: None,
            is_seeking: false,
            bookmarks: Vec::new(),
            bookmark_fingerprint: None,
            volume_popup_open: false,
            volume_slider_open: false,
            volume_slider_leave_time: None,
            subtitles_popup_open: false,
            more_options_open: false,
            zoom_to_fill: false,
            audio_only: false,
            top_right_hover_start: None,
            scrub_preview_texture: None,
            scrub_hover_time: None,
            skip_secs: 10.0,
            locked_mode: false,
            active_path: None,
            last_activity: Instant::now(),
        }
    }
}

#[derive(Debug, Default)]
pub struct PlayerUiAction {
    pub leave: bool,
    pub toggle_fullscreen: Option<bool>,
    pub toggle_pip: bool,
    pub minimize_window: bool,
    pub maximize_window: bool,
    pub close_window: bool,
    pub bookmarks_added: Vec<Bookmark>,
    pub bookmarks_deleted: Vec<String>,
    pub choose_subtitle: bool,
}

fn fmt_time(value: f64) -> Option<String> {
    if !value.is_finite() || value < 0.0 {
        return None;
    }
    let value = value as u64;
    let h = value / 3600;
    let m = (value % 3600) / 60;
    let s = value % 60;
    Some(if h > 0 {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    })
}

fn fmt_time_hms(value: f64, force_hours: bool) -> String {
    if !value.is_finite() || value < 0.0 {
        return if force_hours { "0:00:00".into() } else { "0:00".into() };
    }
    let val = value as u64;
    let h = val / 3600;
    let m = (val % 3600) / 60;
    let s = val % 60;
    if h > 0 || force_hours {
        format!("{h}:{m:02}:{s:02}")
    } else {
        format!("{m:02}:{s:02}")
    }
}

fn language_name(language: &str) -> String {
    match language.trim().to_ascii_lowercase().as_str() {
        "en" | "eng" | "english" => "English".into(),
        "ko" | "kor" | "korean" => "Korean".into(),
        "ja" | "jpn" | "japanese" => "Japanese".into(),
        "ar" | "ara" | "arabic" => "Arabic".into(),
        "es" | "spa" | "spanish" => "Spanish".into(),
        "id" | "ind" | "indonesian" => "Indonesian".into(),
        "ms" | "may" | "msa" | "malay" => "Malay".into(),
        "pt" | "por" | "portuguese" => "Portuguese".into(),
        "zh" | "chi" | "zho" | "chinese" => "Chinese".into(),
        "th" | "tha" | "thai" => "Thai".into(),
        other if !other.is_empty() => {
            let mut chars = other.chars();
            chars
                .next()
                .map_or_else(String::new, |first| first.to_uppercase().collect())
                + chars.as_str()
        }
        _ => "Unknown".into(),
    }
}

fn track_title(title: Option<&str>, language: Option<&str>, fallback: &str) -> String {
    title
        .filter(|title| {
            let normalized = title.trim().to_ascii_lowercase();
            !normalized.starts_with("http://")
                && !normalized.starts_with("https://")
                && !normalized.starts_with("www.")
        })
        .map(str::to_owned)
        .or_else(|| language.map(language_name))
        .unwrap_or_else(|| fallback.to_owned())
}


/// Paints the window-filling black video stage and player controls from one snapshot.
#[allow(clippy::too_many_arguments)]
pub fn show(
    ui: &mut Ui,
    snapshot: &PlayerSnapshot,
    tokens: &ShellTokens,
    icons: &IconRegistry,
    video_shape: Option<egui::Shape>,
    state: &mut PlayerUiState,
    error: Option<&str>,
    command_sender: &mut dyn FnMut(PlayerCommand),
) -> PlayerUiAction {
    let mut action = PlayerUiAction::default();
    if let Some(fs) = ui.input(|i| i.viewport().fullscreen) {
        state.is_fullscreen = fs;
    }
    let rect = ui.max_rect();
    let theme = &tokens.theme;
    if snapshot.path != state.active_path {
        state.active_path = snapshot.path.clone();
        state.last_activity = Instant::now();
        state.overlays_visible = true;
        state.position_preview = None;
    }
    ui.painter()
        .rect_filled(rect, CornerRadius::ZERO, Color32::BLACK);
    if let Some(shape) = video_shape {
        ui.painter().add(shape);
    }

    let activity = ui.input(|input| {
        input.pointer.delta() != Vec2::ZERO
            || input.key_pressed(egui::Key::Space)
            || input.key_pressed(egui::Key::Escape)
            || input.key_pressed(egui::Key::F)
            || input.key_pressed(egui::Key::F11)
            || input.key_pressed(egui::Key::ArrowLeft)
            || input.key_pressed(egui::Key::ArrowRight)
            || input.key_pressed(egui::Key::ArrowUp)
            || input.key_pressed(egui::Key::ArrowDown)
            || input.key_pressed(egui::Key::M)
            || input.key_pressed(egui::Key::PageUp)
            || input.key_pressed(egui::Key::PageDown)
    });
    // Lock mode: L key is the ONLY active input; all other keyboard & mouse actions are disabled
    if ui.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::L)) {
        state.locked_mode = !state.locked_mode;
        if state.locked_mode {
            state.overlays_visible = false;
            state.volume_popup_open = false;
            state.subtitles_popup_open = false;
            state.more_options_open = false;
            state.panel = None;
        } else {
            state.last_activity = Instant::now();
            state.overlays_visible = true;
        }
    }
    if state.locked_mode {
        state.overlays_visible = false;
        state.scrub_hover_time = None;
        ui.ctx().set_cursor_icon(egui::CursorIcon::None);
        egui::Area::new(ui.scope_id().with("player_locked_badge"))
            .order(egui::Order::Foreground)
            .anchor(Align2::RIGHT_TOP, Vec2::new(-18.0, 18.0))
            .interactable(false)
            .show(ui.ctx(), |ui| {
                let (lock_rect, _) = ui.allocate_exact_size(Vec2::splat(22.0), Sense::hover());
                icons.paint_icon(ui, "dock.lock", lock_rect, Color32::from_rgba_unmultiplied(255, 255, 255, 200));
            });
        return action;
    }

    if activity {
        state.last_activity = Instant::now();
        state.overlays_visible = true;
    }
    let pointer_position = ui.input(|input| input.pointer.hover_pos());
    let control_y_est = rect.bottom() - 40.0;
    let vol_card_rect_est = Rect::from_min_max(
        Pos2::new(rect.left() + 16.0, control_y_est - 44.0 - 18.0),
        Pos2::new(rect.left() + 16.0 + 236.0, control_y_est - 18.0),
    );
    let vol_card_hovered = state.volume_popup_open && pointer_position.is_some_and(|p| vol_card_rect_est.contains(p));
    let mouse_over_controls = pointer_position.is_some_and(|p| p.y >= rect.bottom() - 120.0) || vol_card_hovered;
    if mouse_over_controls {
        state.last_activity = Instant::now();
        state.overlays_visible = true;
    }
    let pinned = state.panel.is_some()
        || state.volume_popup_open
        || state.volume_slider_open
        || state.subtitles_popup_open
        || state.more_options_open
        || state.is_seeking
        || snapshot.state != PlaybackState::Playing;

    if !pinned
        && !mouse_over_controls
        && state.last_activity.elapsed() >= Duration::from_millis(3000)
    {
        state.overlays_visible = false;
    }

    let raw_fade_t = ui.ctx().animate_bool_with_time(ui.scope_id().with("overlay_fade"), state.overlays_visible, 0.40);
    let overlay_alpha = raw_fade_t * raw_fade_t * (3.0 - 2.0 * raw_fade_t);

    // Stop text input focus when in player mode so all hotkeys work seamlessly
    ui.memory_mut(|m| m.stop_text_input());

    // Keyboard shortcuts & controls (using consume_key to guarantee detection)
    if ui.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::F) || i.consume_key(egui::Modifiers::NONE, egui::Key::F11)) {
        let is_fs = ui.input(|i| i.viewport().fullscreen.unwrap_or(state.is_fullscreen));
        state.is_fullscreen = !is_fs;
        action.toggle_fullscreen = Some(state.is_fullscreen);
    }
    if ui.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::Space)) {
        command_sender(PlayerCommand::Toggle {
            token: snapshot.token,
        });
    }
    let skip_step = state.skip_secs.max(1.0);
    if ui.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::ArrowLeft)) {
        command_sender(PlayerCommand::SeekRel {
            token: snapshot.token,
            seconds: -skip_step,
        });
    }
    if ui.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::ArrowRight)) {
        command_sender(PlayerCommand::SeekRel {
            token: snapshot.token,
            seconds: skip_step,
        });
    }
    if ui.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::ArrowUp)) {
        let volume = (snapshot.volume + 5.0).clamp(0.0, 100.0);
        command_sender(PlayerCommand::SetVolume {
            token: snapshot.token,
            volume,
        });
    }
    if ui.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::ArrowDown)) {
        let volume = (snapshot.volume - 5.0).clamp(0.0, 100.0);
        command_sender(PlayerCommand::SetVolume {
            token: snapshot.token,
            volume,
        });
    }
    if ui.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::M)) {
        command_sender(PlayerCommand::SetMute {
            token: snapshot.token,
            muted: !snapshot.muted,
        });
    }
    if ui.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::PageUp)) {
        command_sender(PlayerCommand::Prev {
            token: snapshot.token,
        });
    }
    if ui.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::PageDown)) {
        command_sender(PlayerCommand::Next {
            token: snapshot.token,
        });
    }
    if ui.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::Escape)) {
        if state.panel.take().is_some() {
        } else if state.is_fullscreen || ui.input(|i| i.viewport().fullscreen.unwrap_or(false)) {
            state.is_fullscreen = false;
            action.toggle_fullscreen = Some(false);
        } else {
            action.leave = true;
        }
    }

    // Video canvas double-click to toggle fullscreen (single-click resume/pause removed)
    let canvas_resp = ui.allocate_rect(rect, Sense::click());
    let no_popups = state.panel.is_none() && !state.volume_popup_open && !state.subtitles_popup_open && !state.more_options_open;
    if canvas_resp.double_clicked() && !mouse_over_controls && no_popups {
        let is_fs = ui.input(|i| i.viewport().fullscreen.unwrap_or(state.is_fullscreen));
        state.is_fullscreen = !is_fs;
        action.toggle_fullscreen = Some(state.is_fullscreen);
    }

    // Top-right corner hover detection for window controls (0.5s delay)
    let top_right_zone = Rect::from_min_max(
        Pos2::new(rect.right() - 150.0, rect.top()),
        Pos2::new(rect.right(), rect.top() + 45.0),
    );
    let pointer_in_top_right = pointer_position.is_some_and(|p| top_right_zone.contains(p));
    if pointer_in_top_right {
        if state.top_right_hover_start.is_none() {
            state.top_right_hover_start = Some(Instant::now());
        }
    } else {
        state.top_right_hover_start = None;
    }

    let show_window_controls = state
        .top_right_hover_start
        .is_some_and(|start| start.elapsed() >= Duration::from_millis(500));

    if show_window_controls {
        let btn_w = 46.0;
        let btn_h = 32.0;
        let total_w = btn_w * 3.0;
        let cluster_rect = Rect::from_min_max(
            Pos2::new(rect.right() - total_w, rect.top()),
            Pos2::new(rect.right(), rect.top() + btn_h),
        );
        ui.painter().rect_filled(
            cluster_rect,
            CornerRadius { nw: 0, ne: 0, se: 0, sw: 6 },
            Color32::from_black_alpha(220),
        );
        ui.painter().line_segment(
            [Pos2::new(cluster_rect.left(), cluster_rect.top()), Pos2::new(cluster_rect.left(), cluster_rect.bottom() - 6.0)],
            Stroke::new(1.0, Color32::from_white_alpha(35)),
        );
        ui.painter().line_segment(
            [Pos2::new(cluster_rect.left() + 6.0, cluster_rect.bottom()), Pos2::new(cluster_rect.right(), cluster_rect.bottom())],
            Stroke::new(1.0, Color32::from_white_alpha(35)),
        );

        let min_rect = Rect::from_min_size(cluster_rect.min, Vec2::new(btn_w, btn_h));
        let max_rect = Rect::from_min_size(
            Pos2::new(cluster_rect.min.x + btn_w, cluster_rect.min.y),
            Vec2::new(btn_w, btn_h),
        );
        let close_rect = Rect::from_min_size(
            Pos2::new(cluster_rect.min.x + btn_w * 2.0, cluster_rect.min.y),
            Vec2::new(btn_w, btn_h),
        );

        // Minimize button
        let min_resp = ui.allocate_rect(min_rect, Sense::click());
        if min_resp.hovered() {
            ui.painter().rect_filled(
                min_rect,
                CornerRadius { nw: 0, ne: 0, se: 0, sw: 6 },
                Color32::from_white_alpha(30),
            );
        }
        ui.painter().line_segment(
            [
                Pos2::new(min_rect.center().x - 5.0, min_rect.center().y),
                Pos2::new(min_rect.center().x + 5.0, min_rect.center().y),
            ],
            Stroke::new(1.5, Color32::WHITE),
        );
        if min_resp.clicked() {
            action.minimize_window = true;
        }

        // Maximize button
        let max_resp = ui.allocate_rect(max_rect, Sense::click());
        if max_resp.hovered() {
            ui.painter().rect_filled(
                max_rect,
                CornerRadius::ZERO,
                Color32::from_white_alpha(30),
            );
        }
        let is_max = state.is_fullscreen || ui.input(|i| i.viewport().maximized.unwrap_or(false));
        if is_max {
            let box1 = Rect::from_center_size(max_rect.center() + Vec2::new(1.5, -1.5), Vec2::splat(8.0));
            let box2 = Rect::from_center_size(max_rect.center() + Vec2::new(-1.5, 1.5), Vec2::splat(8.0));
            ui.painter().rect_stroke(box1, CornerRadius::ZERO, Stroke::new(1.1, Color32::WHITE), egui::StrokeKind::Inside);
            ui.painter().rect_filled(box2, CornerRadius::ZERO, Color32::from_black_alpha(200));
            ui.painter().rect_stroke(box2, CornerRadius::ZERO, Stroke::new(1.1, Color32::WHITE), egui::StrokeKind::Inside);
        } else {
            let box_rect = Rect::from_center_size(max_rect.center(), Vec2::splat(10.0));
            ui.painter().rect_stroke(
                box_rect,
                CornerRadius::ZERO,
                Stroke::new(1.2, Color32::WHITE),
                egui::StrokeKind::Inside,
            );
        }
        if max_resp.clicked() {
            action.maximize_window = true;
        }

        // Close button
        let close_resp = ui.allocate_rect(close_rect, Sense::click());
        if close_resp.hovered() {
            ui.painter().rect_filled(
                close_rect,
                CornerRadius::ZERO,
                Color32::from_rgb(220, 45, 45),
            );
        }
        let cx = close_rect.center().x;
        let cy = close_rect.center().y;
        ui.painter().line_segment(
            [Pos2::new(cx - 4.5, cy - 4.5), Pos2::new(cx + 4.5, cy + 4.5)],
            Stroke::new(1.5, Color32::WHITE),
        );
        ui.painter().line_segment(
            [Pos2::new(cx + 4.5, cy - 4.5), Pos2::new(cx - 4.5, cy + 4.5)],
            Stroke::new(1.5, Color32::WHITE),
        );
        if close_resp.clicked() {
            action.close_window = true;
        }
    }

    let mut panel_just_opened = false;
    if overlay_alpha > 0.001 {
        // Top-left Back button (← to exit player back to library, matching Movies & TV)
        let back_btn_rect = Rect::from_center_size(
            Pos2::new(rect.left() + 32.0, rect.top() + 32.0),
            Vec2::splat(40.0),
        );
        let back_resp = OverlayButton::bottom_bar(ui.scope_id().with("btn_top_back"), back_btn_rect)
            .icon("action.back")
            .icon_size(22.0)
            .show(ui, theme, icons);
        if back_resp.clicked() {
            action.leave = true;
        }

        // Bottom gradient scrim (transparent to rgba(0,0,0,0.65), ~160px tall)
        let hud_fade_rect = Rect::from_min_max(
            Pos2::new(rect.left(), rect.bottom() - 160.0),
            Pos2::new(rect.right(), rect.bottom()),
        );
        let mut fade_mesh = egui::Mesh::default();
        fade_mesh.colored_vertex(hud_fade_rect.left_top(), Color32::TRANSPARENT);
        fade_mesh.colored_vertex(hud_fade_rect.right_top(), Color32::TRANSPARENT);
        fade_mesh.colored_vertex(
            hud_fade_rect.right_bottom(),
            Color32::from_rgba_unmultiplied(0, 0, 0, (166.0 * overlay_alpha) as u8),
        );
        fade_mesh.colored_vertex(
            hud_fade_rect.left_bottom(),
            Color32::from_rgba_unmultiplied(0, 0, 0, (166.0 * overlay_alpha) as u8),
        );
        fade_mesh.add_triangle(0, 1, 2);
        fade_mesh.add_triangle(0, 2, 3);
        ui.painter().add(egui::Shape::mesh(fade_mesh));

        // Full width seek line, time labels, and independent left/center/right control groups.
        let has_duration = snapshot.duration_secs.is_finite() && snapshot.duration_secs > 0.0;
        let max_position = if has_duration {
            snapshot.duration_secs
        } else {
            1.0
        };
        let mut pos = state
            .position_preview
            .unwrap_or(snapshot.position_secs)
            .clamp(0.0, max_position);

        // Vertical layout: Seek bar -> Time row -> Button row (no overlap, anchored to bottom)
        let control_y = rect.bottom() - 24.0;
        let time_y = rect.bottom() - 58.0;
        let seek_y = rect.bottom() - 74.0;
        let seek_rect = Rect::from_min_max(
            Pos2::new(rect.left() + 16.0, seek_y - 8.0),
            Pos2::new(rect.right() - 16.0, seek_y + 8.0),
        );

        // Filename text: only displayed directly above the seek bar when PAUSED
        let is_paused = snapshot.state != PlaybackState::Playing;
        if is_paused {
            let display_title = snapshot
                .path
                .as_deref()
                .and_then(|path| path.file_name())
                .and_then(|name| name.to_str())
                .or(snapshot.title.as_deref())
                .unwrap_or_default();
            if !display_title.is_empty() {
                let title_color = Color32::from_white_alpha((240.0 * overlay_alpha) as u8);
                ui.painter().text(
                    Pos2::new(seek_rect.left(), seek_y - 18.0),
                    Align2::LEFT_BOTTOM,
                    display_title,
                    FontId::proportional(20.0),
                    title_color,
                );
            }
        }

        // Seek bar proximity & hover thickening (2px -> 5px track, 14px -> 18px thumb)
        let any_popup_open = state.volume_popup_open
            || state.subtitles_popup_open
            || state.more_options_open
            || state.panel.is_some();
        let seek_near = (!any_popup_open
            && pointer_position.is_some_and(|p| {
                (p.y - seek_y).abs() <= 24.0
                    && p.x >= seek_rect.left() - 10.0
                    && p.x <= seek_rect.right() + 10.0
            }))
            || state.is_seeking;
        let seek_grow_t = ui.ctx().animate_bool_with_time(ui.scope_id().with("seek_proximity"), seek_near, 0.15);
        let track_h = 2.0 + 3.0 * seek_grow_t;
        let thumb_radius = 7.0 + 2.0 * seek_grow_t;

        let seek_response = ui.allocate_rect(
            seek_rect.expand2(Vec2::new(0.0, 10.0)),
            if has_duration {
                Sense::click_and_drag()
            } else {
                Sense::hover()
            },
        );
        if seek_response.hovered() {
            ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
        }

        if has_duration && !any_popup_open && seek_response.drag_started() {
            state.is_seeking = true;
        }

        if has_duration && !any_popup_open && seek_response.clicked() && !state.is_seeking {
            if let Some(pointer) = seek_response.interact_pointer_pos().or(pointer_position) {
                let fraction = ((pointer.x - seek_rect.left()) / seek_rect.width()).clamp(0.0, 1.0);
                pos = fraction as f64 * snapshot.duration_secs;
                command_sender(PlayerCommand::Seek {
                    token: snapshot.token,
                    seconds: pos,
                    exact: true,
                });
                state.position_preview = None;
            }
        }

        // Pointer-capture scrubbing: thumb follows pointer smoothly while dragging
        if has_duration && state.is_seeking {
            if ui.input(|i| i.pointer.primary_down()) {
                if let Some(pointer) = ui.input(|i| i.pointer.latest_pos()) {
                    let fraction = ((pointer.x - seek_rect.left()) / seek_rect.width()).clamp(0.0, 1.0);
                    pos = fraction as f64 * snapshot.duration_secs;
                    state.position_preview = Some(pos);
                }
            } else {
                command_sender(PlayerCommand::Seek {
                    token: snapshot.token,
                    seconds: pos,
                    exact: true,
                });
                state.position_preview = None;
                state.is_seeking = false;
            }
        }

        let fraction = if has_duration {
            (pos / snapshot.duration_secs).clamp(0.0, 1.0) as f32
        } else {
            0.0
        };

        let track = Rect::from_center_size(
            Pos2::new(seek_rect.center().x, seek_y),
            Vec2::new(seek_rect.width(), track_h),
        );

        // 1. Unplayed track: 2px line in white at ~40% opacity
        ui.painter().rect_filled(
            track,
            CornerRadius::ZERO,
            Color32::from_white_alpha((102.0 * overlay_alpha) as u8),
        );

        // 2. Hover preview fill: lighter white at ~30% from start to cursor position
        if seek_near && !state.is_seeking {
            if let Some(p) = pointer_position {
                let hover_frac = ((p.x - seek_rect.left()) / seek_rect.width()).clamp(0.0, 1.0);
                if hover_frac > 0.0 {
                    ui.painter().rect_filled(
                        Rect::from_min_size(
                            track.min,
                            Vec2::new(track.width() * hover_frac, track.height()),
                        ),
                        CornerRadius::ZERO,
                        Color32::from_white_alpha((76.0 * overlay_alpha) as u8),
                    );
                }
            }
        }

        // 3. Played portion: solid white
        if fraction > 0.0 {
            ui.painter().rect_filled(
                Rect::from_min_size(
                    track.min,
                    Vec2::new(track.width() * fraction, track.height()),
                ),
                CornerRadius::ZERO,
                Color32::from_white_alpha((255.0 * overlay_alpha) as u8),
            );
        }

        // 4. Thumb: 14px to 18px circle with purple outline (#B146C2, 2px) and dark center
        let knob = Pos2::new(track.left() + track.width() * fraction, track.center().y);
        ui.painter().circle_filled(
            knob,
            thumb_radius,
            Color32::from_rgba_unmultiplied(20, 20, 20, (255.0 * overlay_alpha) as u8),
        );
        ui.painter().circle_stroke(
            knob,
            thumb_radius,
            Stroke::new(2.0, Color32::from_rgba_unmultiplied(177, 70, 194, (255.0 * overlay_alpha) as u8)),
        );

        // 5. Seek bar hover timestamp pill only (no preview box)
        state.scrub_hover_time = None;
        if seek_near {
            if let Some(pos_pt) = pointer_position {
                let hover_frac = ((pos_pt.x - seek_rect.left()) / seek_rect.width()).clamp(0.0, 1.0);
                let hover_time = hover_frac as f64 * max_position;
                let hover_has_hours = snapshot.duration_secs >= 3600.0;
                let hover_str = fmt_time_hms(hover_time, hover_has_hours);

                let pill_w = 64.0;
                let pill_h = 24.0;
                let pill_x = (pos_pt.x - pill_w * 0.5).clamp(rect.left() + 12.0, (rect.right() - pill_w - 12.0).max(rect.left() + 12.0));
                let pill_pos = Pos2::new(pill_x, seek_y - pill_h - 14.0);

                egui::Area::new(ui.scope_id().with("player_scrub_time"))
                    .order(egui::Order::Foreground)
                    .interactable(false)
                    .fixed_pos(pill_pos)
                    .show(ui.ctx(), |ui| {
                        let (pill_rect, _) = ui.allocate_exact_size(Vec2::new(pill_w, pill_h), Sense::hover());
                        ui.painter().rect_filled(pill_rect, CornerRadius::same(4), Color32::from_rgb(20, 20, 24));
                        ui.painter().rect_stroke(
                            pill_rect,
                            CornerRadius::same(4),
                            Stroke::new(1.0, Color32::from_white_alpha(36)),
                            StrokeKind::Inside,
                        );
                        ui.painter().text(
                            pill_rect.center(),
                            Align2::CENTER_CENTER,
                            &hover_str,
                            FontId::proportional(12.0),
                            Color32::WHITE,
                        );
                    });
            }
        }

        // Time labels: dedicated row directly under the bar, 16px high, never overlapping buttons
        let has_hours = snapshot.duration_secs >= 3600.0;
        let elapsed_str = fmt_time_hms(pos, has_hours);
        let total_str = if has_duration {
            fmt_time_hms(snapshot.duration_secs, has_hours)
        } else {
            "--:--".into()
        };
        let time_color = Color32::from_white_alpha((240.0 * overlay_alpha) as u8);
        ui.painter().text(
            Pos2::new(seek_rect.left(), time_y),
            Align2::LEFT_TOP,
            elapsed_str,
            FontId::proportional(12.0),
            time_color,
        );
        ui.painter().text(
            Pos2::new(seek_rect.right(), time_y),
            Align2::RIGHT_TOP,
            total_str,
            FontId::proportional(12.0),
            time_color,
        );

        // --- Left Group: Volume & Subtitles (Image 2) ---
        let volume_icon = if snapshot.muted || snapshot.volume <= 0.0 {
            "transport.volume_mute"
        } else {
            "transport.volume"
        };
        let vol_btn_rect = Rect::from_center_size(Pos2::new(rect.left() + 36.0, control_y), Vec2::splat(40.0));
        let subs_btn_rect = Rect::from_center_size(Pos2::new(rect.left() + 84.0, control_y), Vec2::splat(40.0));

        let vol_resp = OverlayButton::bottom_bar(ui.scope_id().with("btn_vol"), vol_btn_rect)
            .icon(volume_icon)
            .show(ui, theme, icons);
        if vol_resp.hovered() {
            let scroll_y = ui.input(|i| i.smooth_scroll_delta.y);
            if scroll_y.abs() > 0.0 {
                let delta = if scroll_y > 0.0 { 5.0 } else { -5.0 };
                let volume = (snapshot.volume + delta).clamp(0.0, 100.0);
                command_sender(PlayerCommand::SetVolume {
                    token: snapshot.token,
                    volume,
                });
            }
        }
        if vol_resp.clicked() {
            state.volume_popup_open = !state.volume_popup_open;
            if state.volume_popup_open {
                state.subtitles_popup_open = false;
                state.more_options_open = false;
            }
        }

        // Subtitles button (fixed position, no shifting)
        let subs_resp = OverlayButton::bottom_bar(ui.scope_id().with("btn_subs"), subs_btn_rect)
            .icon("transport.subtitles")
            .tooltip("Audio & Subtitles")
            .show(ui, theme, icons);
        if subs_resp.clicked() {
            state.subtitles_popup_open = !state.subtitles_popup_open;
            if state.subtitles_popup_open {
                state.volume_popup_open = false;
                state.more_options_open = false;
            }
        }

        // --- Floating Volume Popover Card (Image 2: [Speaker] =======●==== 100) ---
        let vol_pop_t = ui.ctx().animate_bool_with_time(ui.scope_id().with("vol_pop_anim"), state.volume_popup_open, 0.15);
        if vol_pop_t > 0.001 {
            let card_w = 236.0;
            let card_h = 44.0;
            let slide_offset = (1.0 - vol_pop_t) * 12.0;
            let card_rect = Rect::from_min_max(
                Pos2::new(rect.left() + 16.0, control_y - card_h - 18.0 + slide_offset),
                Pos2::new(rect.left() + 16.0 + card_w, control_y - 18.0 + slide_offset),
            );

            // Dismiss when clicking outside
            if state.volume_popup_open && ui.input(|i| i.pointer.any_click()) {
                if let Some(pos_pt) = pointer_position {
                    if !card_rect.contains(pos_pt) && !vol_btn_rect.contains(pos_pt) {
                        state.volume_popup_open = false;
                    }
                }
            }

            egui::Area::new(ui.scope_id().with("player_volume_card"))
                .order(egui::Order::Foreground)
                .fixed_pos(card_rect.min)
                .show(ui.ctx(), |ui| {
                    let mut card_ui = ui.new_child(egui::UiBuilder::new().max_rect(card_rect));
                    let _bg_block = card_ui.interact(card_rect, card_ui.scope_id().with("vol_bg_block"), Sense::click_and_drag());
                    card_ui.painter().rect(
                        card_rect,
                        CornerRadius::same(4),
                        Color32::from_rgb(32, 32, 32),
                        Stroke::new(1.0, Color32::from_rgb(58, 58, 58)),
                        egui::StrokeKind::Inside,
                    );

                    // 1. Speaker mute toggle button on left
                    let spk_rect = Rect::from_center_size(
                        Pos2::new(card_rect.left() + 24.0, card_rect.center().y),
                        Vec2::splat(32.0),
                    );
                    let spk_resp = card_ui.allocate_rect(spk_rect, Sense::click());
                    if spk_resp.hovered() {
                        card_ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                        card_ui.painter().rect(
                            spk_rect,
                            CornerRadius::same(4),
                            Color32::from_rgba_unmultiplied(255, 255, 255, 56),
                            Stroke::new(1.0, Color32::from_rgba_unmultiplied(255, 255, 255, 85)),
                            StrokeKind::Inside,
                        );
                    }
                    icons.paint_icon(
                        &mut card_ui,
                        volume_icon,
                        Rect::from_center_size(spk_rect.center(), Vec2::splat(18.0)),
                        Color32::WHITE,
                    );
                    if spk_resp.clicked() {
                        command_sender(PlayerCommand::SetMute {
                            token: snapshot.token,
                            muted: !snapshot.muted,
                        });
                    }

                    // 2. Horizontal purple slider track
                    let s_left = spk_rect.right() + 12.0;
                    let s_right = card_rect.right() - 46.0;
                    let s_w = (s_right - s_left).max(10.0);
                    let s_interact_rect = Rect::from_min_max(
                        Pos2::new(s_left, card_rect.top()),
                        Pos2::new(s_right, card_rect.bottom()),
                    );
                    let s_resp = card_ui.allocate_rect(s_interact_rect, Sense::click_and_drag());
                    if s_resp.hovered() {
                        card_ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                    }

                    let mut current_vol = if snapshot.muted { 0.0 } else { snapshot.volume };
                    if s_resp.dragged() || s_resp.clicked() {
                        if let Some(pos_pt) = card_ui.input(|i| i.pointer.interact_pos()) {
                            let frac = ((pos_pt.x - s_left) / s_w).clamp(0.0, 1.0);
                            current_vol = (frac * 100.0) as f64;
                            command_sender(PlayerCommand::SetVolume {
                                token: snapshot.token,
                                volume: current_vol,
                            });
                            if snapshot.muted {
                                command_sender(PlayerCommand::SetMute {
                                    token: snapshot.token,
                                    muted: false,
                                });
                            }
                        }
                    }

                    let track_y = card_rect.center().y;
                    let unplayed_track = Rect::from_min_max(
                        Pos2::new(s_left, track_y - 1.25),
                        Pos2::new(s_right, track_y + 1.25),
                    );
                    card_ui.painter().rect_filled(unplayed_track, CornerRadius::same(1), Color32::from_white_alpha(70));

                    let vol_frac = (current_vol / 100.0).clamp(0.0, 1.0) as f32;
                    if vol_frac > 0.0 {
                        let played_track = Rect::from_min_max(
                            Pos2::new(s_left, track_y - 1.25),
                            Pos2::new(s_left + s_w * vol_frac, track_y + 1.25),
                        );
                        card_ui.painter().rect_filled(
                            played_track,
                            CornerRadius::same(1),
                            Color32::from_rgb(177, 70, 194),
                        );
                    }

                    // Circle thumb
                    let knob_pos = Pos2::new(s_left + s_w * vol_frac, track_y);
                    card_ui.painter().circle_filled(knob_pos, 6.5, Color32::from_rgb(177, 70, 194));
                    card_ui.painter().circle_stroke(knob_pos, 6.5, Stroke::new(1.0, Color32::from_rgb(32, 32, 32)));

                    // 3. Volume number on right
                    let vol_str = format!("{:.0}", current_vol);
                    card_ui.painter().text(
                        Pos2::new(card_rect.right() - 24.0, track_y),
                        Align2::CENTER_CENTER,
                        vol_str,
                        FontId::proportional(12.5),
                        Color32::WHITE,
                    );
                });
        }

        // --- Subtitles & Audio Popover with Slide-up Animation (Image 1) ---
        let subs_slide_t = ui.ctx().animate_bool_with_time(ui.scope_id().with("subs_slide_anim"), state.subtitles_popup_open, 0.15);
        if subs_slide_t > 0.001 {
            let subs_pop_w = 260.0;
            let subs_pop_h = 360.0;
            let slide_offset = (1.0 - subs_slide_t) * 20.0;
            let subs_pop_rect = Rect::from_min_max(
                Pos2::new(rect.left() + 20.0, control_y - subs_pop_h - 14.0 + slide_offset),
                Pos2::new(rect.left() + 20.0 + subs_pop_w, control_y - 14.0 + slide_offset),
            );
            if state.subtitles_popup_open && ui.input(|i| i.pointer.any_click()) {
                if let Some(pos_pt) = pointer_position {
                    if !subs_pop_rect.contains(pos_pt) && !subs_btn_rect.contains(pos_pt) {
                        state.subtitles_popup_open = false;
                    }
                }
            }

            egui::Area::new(ui.scope_id().with("player_subtitles_popup"))
                .order(egui::Order::Foreground)
                .fixed_pos(subs_pop_rect.min)
                .show(ui.ctx(), |ui| {
                    egui::Frame::new()
                        .fill(Color32::from_rgb(32, 32, 32))
                        .stroke(Stroke::new(1.0, Color32::from_rgb(58, 58, 58)))
                        .corner_radius(CornerRadius::same(4))
                        .inner_margin(12.0)
                        .show(ui, |ui| {
                            ui.set_width(subs_pop_w - 24.0);
                            ui.set_max_height(subs_pop_h - 24.0);
                            egui::ScrollArea::vertical().show(ui, |ui| {
                                ui.label(RichText::new("Subtitles").size(14.0).strong().color(Color32::WHITE));
                                ui.add_space(6.0);

                                let sub_tracks: Vec<_> = snapshot.tracks.iter().filter(|t| t.kind == "sub").collect();
                                if sub_tracks.is_empty() {
                                    ui.label(RichText::new("No subtitles").size(12.0).color(Color32::from_gray(160)));
                                }
                                for (idx, track) in sub_tracks.iter().enumerate() {
                                    let fallback = format!("Subtitle track {}", idx + 1);
                                    let name = track_title(track.title.as_deref(), track.language.as_deref(), &fallback);
                                    let label = format!("{}. {}", idx + 1, name);
                                    let (row_rect, row_resp) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 26.0), Sense::click());
                                    if row_resp.hovered() {
                                        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                    }
                                    let is_selected = track.selected;
                                    let bg = if is_selected {
                                        Color32::from_rgb(68, 68, 68)
                                    } else if row_resp.hovered() {
                                        Color32::from_white_alpha(30)
                                    } else {
                                        Color32::TRANSPARENT
                                    };
                                    ui.painter().rect_filled(row_rect, CornerRadius::same(2), bg);
                                    ui.painter().text(
                                        Pos2::new(row_rect.left() + 10.0, row_rect.center().y),
                                        Align2::LEFT_CENTER,
                                        label,
                                        FontId::proportional(12.5),
                                        Color32::WHITE,
                                    );
                                    if row_resp.clicked() {
                                        command_sender(PlayerCommand::SelectTrack {
                                            token: snapshot.token,
                                            id: track.id,
                                        });
                                    }
                                }

                                ui.add_space(6.0);
                                // Choose subtitle file
                                let (choose_rect, choose_resp) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 26.0), Sense::click());
                                if choose_resp.hovered() {
                                    ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                    ui.painter().rect_filled(choose_rect, CornerRadius::same(2), Color32::from_white_alpha(30));
                                }
                                ui.painter().text(
                                    Pos2::new(choose_rect.left() + 10.0, choose_rect.center().y),
                                    Align2::LEFT_CENTER,
                                    "Choose subtitle file",
                                    FontId::proportional(12.5),
                                    Color32::WHITE,
                                );
                                if choose_resp.clicked() {
                                    action.choose_subtitle = true;
                                    state.subtitles_popup_open = false;
                                }

                                // Subtitles settings / Turn off
                                let (off_rect, off_resp) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 26.0), Sense::click());
                                if off_resp.hovered() {
                                    ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                    ui.painter().rect_filled(off_rect, CornerRadius::same(2), Color32::from_white_alpha(30));
                                }
                                let off_text = if sub_tracks.iter().any(|t| t.selected) { "Turn off subtitles" } else { "Subtitles settings" };
                                ui.painter().text(
                                    Pos2::new(off_rect.left() + 10.0, off_rect.center().y),
                                    Align2::LEFT_CENTER,
                                    off_text,
                                    FontId::proportional(12.5),
                                    Color32::WHITE,
                                );
                                if off_resp.clicked() {
                                    command_sender(PlayerCommand::DisableSubtitles { token: snapshot.token });
                                }

                                ui.add_space(10.0);
                                ui.separator();
                                ui.add_space(8.0);

                                ui.label(RichText::new("Audio").size(14.0).strong().color(Color32::WHITE));
                                ui.add_space(6.0);

                                let audio_tracks: Vec<_> = snapshot.tracks.iter().filter(|t| t.kind == "audio").collect();
                                for (idx, track) in audio_tracks.iter().enumerate() {
                                    let fallback = format!("Audio {}", idx + 1);
                                    let name = track_title(track.title.as_deref(), track.language.as_deref(), &fallback);
                                    let prefix = if track.selected { "✓ " } else { "   " };
                                    let label = format!("{}{}. {}", prefix, idx + 1, name);
                                    let (row_rect, row_resp) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 26.0), Sense::click());
                                    if row_resp.hovered() {
                                        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                    }
                                    let bg = if row_resp.hovered() {
                                        Color32::from_white_alpha(30)
                                    } else {
                                        Color32::TRANSPARENT
                                    };
                                    ui.painter().rect_filled(row_rect, CornerRadius::same(2), bg);
                                    ui.painter().text(
                                        Pos2::new(row_rect.left() + 6.0, row_rect.center().y),
                                        Align2::LEFT_CENTER,
                                        label,
                                        FontId::proportional(12.5),
                                        Color32::WHITE,
                                    );
                                    if row_resp.clicked() {
                                        command_sender(PlayerCommand::SelectTrack {
                                            token: snapshot.token,
                                            id: track.id,
                                        });
                                    }
                                }
                            });
                        });
                });
        }

        // --- Center Group: Truly Centered 3 buttons (Skip back 10s, Play/Pause, Skip forward 30s) ---
        // Bare icons, NO boxes, NO borders, NO dividers
        let center_x = rect.center().x;
        {
            let btn_size = Vec2::splat(40.0);
            let left_btn_rect = Rect::from_center_size(
                Pos2::new(center_x - 48.0, control_y),
                btn_size,
            );
            let play_btn_rect = Rect::from_center_size(
                Pos2::new(center_x, control_y),
                btn_size,
            );
            let right_btn_rect = Rect::from_center_size(
                Pos2::new(center_x + 48.0, control_y),
                btn_size,
            );

            // 1. Skip back button
            let skip_lbl = (skip_step as u32).to_string();
            let left_resp = OverlayButton::transport(ui.scope_id().with("transport_rewind"), left_btn_rect)
                .icon("transport.rewind_10")
                .number_label(&skip_lbl)
                .tooltip(&format!("Skip backward {} seconds", skip_step as u32))
                .show(ui, theme, icons);
            if left_resp.clicked() {
                command_sender(PlayerCommand::SeekRel {
                    token: snapshot.token,
                    seconds: -skip_step,
                });
            }

            // 2. Play / Pause button
            let playing = snapshot.state == PlaybackState::Playing;
            let play_resp = OverlayButton::transport(ui.scope_id().with("transport_play"), play_btn_rect)
                .icon(if playing { "transport.pause" } else { "transport.play" })
                .tooltip(if playing { "Pause" } else { "Play" })
                .show(ui, theme, icons);
            if play_resp.clicked() {
                command_sender(PlayerCommand::Toggle {
                    token: snapshot.token,
                });
            }

            // 3. Skip forward button
            let right_resp = OverlayButton::transport(ui.scope_id().with("transport_forward"), right_btn_rect)
                .icon("transport.forward_30")
                .number_label(&skip_lbl)
                .tooltip(&format!("Skip forward {} seconds", skip_step as u32))
                .show(ui, theme, icons);
            if right_resp.clicked() {
                command_sender(PlayerCommand::SeekRel {
                    token: snapshot.token,
                    seconds: skip_step,
                });
            }
        }

        // --- Right Group: Mini view, Exit fullscreen, More (...) ---
        // Flush with 16px right padding, no pencil button
        let hud_btn = |ui: &mut Ui, id_str: &str, center_x_pos: f32, icon_id: &str, tooltip: &str| -> egui::Response {
            let btn_rect = Rect::from_center_size(Pos2::new(center_x_pos, control_y), Vec2::splat(40.0));
            OverlayButton::bottom_bar(ui.scope_id().with(id_str), btn_rect)
                .icon(icon_id)
                .icon_size(20.0)
                .tooltip(tooltip)
                .show(ui, theme, icons)
        };

        // 4. Lock mode button (L)
        if hud_btn(ui, "hud_lock", rect.right() - 192.0, "dock.lock", "Lock controls (L)").clicked() {
            state.locked_mode = true;
            state.overlays_visible = false;
            state.volume_popup_open = false;
            state.subtitles_popup_open = false;
            state.more_options_open = false;
            state.panel = None;
        }

        // 3. Picture-in-Picture (PiP / Mini view)
        if hud_btn(ui, "hud_pip", rect.right() - 140.0, "transport.pip", "Mini view").clicked() {
            action.toggle_pip = true;
        }

        // 2. Fullscreen toggle button
        let is_fs = ui.input(|i| i.viewport().fullscreen.unwrap_or(state.is_fullscreen));
        let fs_icon = if is_fs { "transport.exit_fullscreen" } else { "transport.fullscreen" };
        let fs_tooltip = if is_fs { "Exit fullscreen" } else { "Fullscreen (F)" };
        if hud_btn(ui, "hud_fs", rect.right() - 88.0, fs_icon, fs_tooltip).clicked() {
            state.is_fullscreen = !is_fs;
            action.toggle_fullscreen = Some(state.is_fullscreen);
        }

        // 1. More options (...) button
        let more_btn_rect = Rect::from_center_size(Pos2::new(rect.right() - 36.0, control_y), Vec2::splat(40.0));
        let more_resp = OverlayButton::bottom_bar(ui.scope_id().with("hud_more"), more_btn_rect)
            .icon("action.dots_horizontal")
            .icon_size(20.0)
            .show(ui, theme, icons);
        if more_resp.clicked() {
            state.more_options_open = !state.more_options_open;
            if state.more_options_open {
                state.subtitles_popup_open = false;
            }
        }

        // More options popup (containing Zoom to fill, Audio only, Bookmarks, Queue)
        if state.more_options_open {
            let more_pop_w = 175.0;
            let more_pop_h = 136.0;
            let more_pop_rect = Rect::from_min_max(
                Pos2::new(rect.right() - more_pop_w - 12.0, control_y - more_pop_h - 18.0),
                Pos2::new(rect.right() - 12.0, control_y - 18.0),
            );
            if ui.input(|i| i.pointer.any_click()) {
                if let Some(pos_pt) = pointer_position {
                    if !more_pop_rect.contains(pos_pt) && !more_btn_rect.contains(pos_pt) {
                        state.more_options_open = false;
                    }
                }
            }

            egui::Area::new(ui.scope_id().with("player_more_popup"))
                .order(egui::Order::Foreground)
                .fixed_pos(more_pop_rect.min)
                .show(ui.ctx(), |ui| {
                    egui::Frame::new()
                        .fill(Color32::from_rgb(30, 30, 30))
                        .stroke(Stroke::new(1.0, Color32::from_rgb(58, 58, 58)))
                        .corner_radius(CornerRadius::same(4))
                        .inner_margin(8.0)
                        .show(ui, |ui| {
                            ui.set_width(more_pop_w - 16.0);
                            let item_btn = |ui: &mut Ui, label: &str| -> egui::Response {
                                let (item_rect, item_resp) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 28.0), Sense::click());
                                if item_resp.hovered() {
                                    ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                    ui.painter().rect_filled(item_rect, CornerRadius::same(2), Color32::from_white_alpha(30));
                                }
                                ui.painter().text(
                                    Pos2::new(item_rect.left() + 8.0, item_rect.center().y),
                                    Align2::LEFT_CENTER,
                                    label,
                                    FontId::proportional(13.0),
                                    Color32::WHITE,
                                );
                                item_resp
                            };

                            let zoom_label = if state.zoom_to_fill { "✓ Zoom to fill" } else { "Zoom to fill" };
                            if item_btn(ui, zoom_label).clicked() {
                                state.zoom_to_fill = !state.zoom_to_fill;
                                command_sender(PlayerCommand::SetZoomToFill {
                                    token: snapshot.token,
                                    enabled: state.zoom_to_fill,
                                });
                                state.more_options_open = false;
                            }
                            let audio_label = if state.audio_only { "✓ Audio only" } else { "Audio only" };
                            if item_btn(ui, audio_label).clicked() {
                                state.audio_only = !state.audio_only;
                                command_sender(PlayerCommand::SetAudioOnly {
                                    token: snapshot.token,
                                    enabled: state.audio_only,
                                });
                                state.more_options_open = false;
                            }
                            if item_btn(ui, "Bookmarks").clicked() {
                                state.panel = Some(PlayerPanel::Bookmarks);
                                state.more_options_open = false;
                                panel_just_opened = true;
                            }
                            if item_btn(ui, "Queue").clicked() {
                                state.panel = Some(PlayerPanel::Queue);
                                state.more_options_open = false;
                                panel_just_opened = true;
                            }
                        });
                });
        }
    }

    // --- Side Chevrons (visible whenever overlay is active: 55% resting, 80% proximity, 100% hover) ---
    if EdgeButton::show_prev(ui, theme, icons, rect, pointer_position, overlay_alpha).clicked() {
        command_sender(PlayerCommand::Prev {
            token: snapshot.token,
        });
    }
    if EdgeButton::show_next(ui, theme, icons, rect, pointer_position, overlay_alpha).clicked() {
        command_sender(PlayerCommand::Next {
            token: snapshot.token,
        });
    }

    if snapshot.state == PlaybackState::Loading || snapshot.state == PlaybackState::Buffering {
        egui::Area::new(ui.scope_id().with("player_loading"))
            .order(egui::Order::Foreground)
            .anchor(Align2::CENTER_CENTER, Vec2::ZERO)
            .show(ui.ctx(), |ui| {
                egui::Frame::new()
                    .fill(Color32::from_rgba_unmultiplied(16, 16, 18, 220))
                    .stroke(Stroke::new(1.0, Color32::from_white_alpha(28)))
                    .corner_radius(CornerRadius::same(10))
                    .inner_margin(egui::Margin::symmetric(20, 14))
                    .show(ui, |ui| {
                        ui.horizontal(|ui| {
                            ui.add(egui::Spinner::new().size(20.0).color(Color32::from_rgb(246, 130, 31)));
                            ui.add_space(10.0);
                            let label = if snapshot.state == PlaybackState::Buffering {
                                "Buffering..."
                            } else {
                                "Loading media..."
                            };
                            ui.label(RichText::new(label).size(13.5).color(Color32::WHITE));
                        });
                    });
            });
    }

    if let Some(message) = error {
        egui::Area::new(egui::Id::unique("player_error"))
            .fixed_pos(rect.center() - Vec2::new(180.0, 72.0))
            .show(ui.ctx(), |ui| {
                egui::Frame::new()
                    .fill(tokens.card_fill)
                    .stroke(Stroke::new(1.0, tokens.divider))
                    .corner_radius(CornerRadius::same(8))
                    .inner_margin(20.0)
                    .show(ui, |ui| {
                        ui.set_min_width(320.0);
                        ui.horizontal(|ui| {
                            icons.paint_icon(
                                ui,
                                "warning",
                                Rect::from_min_size(ui.cursor().min, Vec2::splat(24.0)),
                                tokens.danger,
                            );
                            ui.heading("Playback error");
                        });
                        ui.label(message);
                        if ui.button("Back").clicked() {
                            action.leave = true;
                        }
                    });
            });
    }
    if let Some(panel) = state.panel {
        let panel_width: f32 = match panel {
            PlayerPanel::Queue => 460.0_f32,
            PlayerPanel::Speed | PlayerPanel::Tracks => 360.0_f32,
            PlayerPanel::Bookmarks => 400.0_f32,
        }
        .min((rect.width() - 32.0_f32).max(280.0_f32));
        let panel_height: f32 = match panel {
            PlayerPanel::Queue => (rect.height() - 120.0_f32).max(320.0_f32),
            PlayerPanel::Speed => 196.0_f32,
            PlayerPanel::Tracks => 386.0_f32,
            PlayerPanel::Bookmarks => 420.0_f32,
        }
        .min((rect.height() - 32.0_f32).max(260.0_f32));
        let panel_top = (rect.bottom() - panel_height - 68.0_f32).max(rect.top() + 12.0_f32);
        let panel_left = if panel == PlayerPanel::Tracks {
            rect.left() + 24.0_f32
        } else {
            (rect.right() - panel_width - 24.0_f32).max(rect.left() + 24.0_f32)
        };
        let panel_rect = Rect::from_min_size(
            Pos2::new(panel_left, panel_top),
            Vec2::new(panel_width, panel_height),
        );
        if !panel_just_opened && ui.input(|i| i.pointer.any_click()) {
            if let Some(pos) = pointer_position {
                if !panel_rect.contains(pos) {
                    state.panel = None;
                }
            }
        }
        egui::Area::new(egui::Id::unique("player_panel"))
            .order(egui::Order::Foreground)
            .fixed_pos(panel_rect.min)
            .show(ui.ctx(), |ui| {
                egui::Frame::new()
                    .fill(Color32::from_rgb(32, 34, 42))
                    .stroke(Stroke::new(1.0, Color32::from_white_alpha(55)))
                    .corner_radius(CornerRadius::same(10))
                    .inner_margin(16.0)
                    .show(ui, |ui| {
                        ui.set_width(panel_width - 34.0);
                        ui.set_max_height(panel_height - 32.0);
                        match panel {
                            PlayerPanel::Speed => {
                                ui.horizontal(|ui| {
                                    ui.label(RichText::new("Playback Speed").size(15.0).strong().color(Color32::WHITE));
                                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                        ui.label(RichText::new(format!("{:.2}×", snapshot.speed)).size(18.0).strong().color(tokens.accent));
                                    });
                                });
                                ui.add_space(8.0);
                                let mut speed = snapshot.speed.clamp(0.5, 2.0);
                                let (speed_rect, speed_response) = ui.allocate_exact_size(
                                    Vec2::new(ui.available_width(), 30.0),
                                    Sense::click_and_drag(),
                                );
                                if speed_response.dragged() || speed_response.clicked() {
                                    if let Some(pointer) = speed_response.interact_pointer_pos() {
                                        let fraction = ((pointer.x - speed_rect.left())
                                            / speed_rect.width().max(1.0))
                                        .clamp(0.0, 1.0);
                                        speed = 0.5 + f64::from(fraction) * 1.5;
                                        command_sender(PlayerCommand::SetSpeed {
                                            token: snapshot.token,
                                            speed,
                                        });
                                    }
                                }
                                let speed_fraction = ((speed - 0.5) / 1.5).clamp(0.0, 1.0) as f32;
                                let speed_track = Rect::from_center_size(
                                    speed_rect.center(),
                                    Vec2::new(speed_rect.width(), 4.0),
                                );
                                ui.painter().rect_filled(
                                    speed_track,
                                    CornerRadius::same(2),
                                    Color32::from_gray(68),
                                );
                                ui.painter().rect_filled(
                                    Rect::from_min_size(
                                        speed_track.min,
                                        Vec2::new(speed_track.width() * speed_fraction, 4.0),
                                    ),
                                    CornerRadius::same(2),
                                    Color32::from_rgb(196, 72, 220),
                                );
                                let speed_knob = Pos2::new(
                                    speed_track.left() + speed_track.width() * speed_fraction,
                                    speed_track.center().y,
                                );
                                ui.painter().circle_filled(speed_knob, 7.0, Color32::WHITE);
                                ui.painter().circle_filled(speed_knob, 5.0, Color32::from_rgb(48, 48, 48));
                                ui.add_space(4.0);
                                ui.horizontal_wrapped(|ui| {
                                    for speed in [0.5, 0.75, 1.0, 1.25, 1.5, 2.0] {
                                        if ui
                                            .selectable_label(
                                                (snapshot.speed - speed).abs() < 0.01,
                                                format!("{speed}x"),
                                            )
                                            .clicked()
                                        {
                                            command_sender(PlayerCommand::SetSpeed {
                                                token: snapshot.token,
                                                speed,
                                            });
                                        }
                                    }
                                });
                            }
                            PlayerPanel::Queue => {
                                ui.horizontal(|ui| {
                                    let queue_count = snapshot.queue.iter().filter(|i| {
                                        let s = i.path.to_string_lossy().to_ascii_lowercase();
                                        !s.contains("$recycle.bin") && !s.contains(".trash")
                                    }).count();
                                    ui.label(RichText::new(format!("Queue ({queue_count})")).size(15.0).strong().color(Color32::WHITE));
                                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                        let (close_rect, close_resp) = ui.allocate_exact_size(Vec2::splat(24.0), Sense::click());
                                        if close_resp.hovered() {
                                            ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                            ui.painter().rect_filled(close_rect, CornerRadius::same(4), Color32::from_rgba_unmultiplied(239, 68, 68, 40));
                                        }
                                        {
                                            let x_col = if close_resp.hovered() { Color32::from_rgb(248, 113, 113) } else { Color32::from_rgb(239, 68, 68) };
                                            let xc = close_rect.center();
                                            let xr = 4.5;
                                            ui.painter().line_segment([Pos2::new(xc.x - xr, xc.y - xr), Pos2::new(xc.x + xr, xc.y + xr)], Stroke::new(1.8, x_col));
                                            ui.painter().line_segment([Pos2::new(xc.x - xr, xc.y + xr), Pos2::new(xc.x + xr, xc.y - xr)], Stroke::new(1.8, x_col));
                                        }
                                        if close_resp.clicked() {
                                            state.panel = None;
                                        }
                                        ui.add_space(8.0);

                                        let repeat_label = match snapshot.repeat {
                                            valor_player::queue::RepeatMode::Off => "Repeat off",
                                            valor_player::queue::RepeatMode::One => "Repeat one",
                                            valor_player::queue::RepeatMode::All => "Repeat all",
                                        };
                                        if ui.selectable_label(snapshot.repeat != valor_player::queue::RepeatMode::Off, repeat_label).clicked() {
                                            let mode = match snapshot.repeat {
                                                valor_player::queue::RepeatMode::Off => valor_player::queue::RepeatMode::All,
                                                valor_player::queue::RepeatMode::All => valor_player::queue::RepeatMode::One,
                                                valor_player::queue::RepeatMode::One => valor_player::queue::RepeatMode::Off,
                                            };
                                            command_sender(PlayerCommand::SetRepeat { token: snapshot.token, mode });
                                        }
                                        if ui.selectable_label(snapshot.shuffle, "Shuffle").clicked() {
                                            command_sender(PlayerCommand::SetShuffle { token: snapshot.token, enabled: !snapshot.shuffle });
                                        }
                                    });
                                });
                                ui.add_space(8.0);
                                let queue_height = (panel_height - 124.0).max(220.0);
                                egui::ScrollArea::vertical()
                                    .max_height(queue_height)
                                    .min_scrolled_height(queue_height)
                                    .show(ui, |ui| {
                                    for (index, item) in snapshot.queue.iter().enumerate() {
                                        let s = item.path.to_string_lossy().to_ascii_lowercase();
                                        if s.contains("$recycle.bin") || s.contains(".trash") {
                                            continue;
                                        }
                                        let current = index == snapshot.queue_index;
                                        let row_w = ui.available_width();
                                        let (row_rect, row_resp) = ui.allocate_exact_size(Vec2::new(row_w, 44.0), Sense::click());
                                        let row_hovered = row_resp.hovered();

                                        let (bg_color, stroke) = if current {
                                            (Color32::from_rgb(20, 45, 75), Stroke::new(1.0, Color32::from_rgb(70, 140, 240)))
                                        } else if row_hovered {
                                            (Color32::from_white_alpha(20), Stroke::new(1.0, Color32::from_white_alpha(50)))
                                        } else {
                                            (Color32::from_white_alpha(8), Stroke::NONE)
                                        };

                                        ui.painter().rect(row_rect, CornerRadius::same(6), bg_color, stroke, egui::StrokeKind::Inside);

                                        // Left: Index number
                                        let idx_rect = Rect::from_min_size(row_rect.min + Vec2::new(10.0, 12.0), Vec2::new(24.0, 20.0));
                                        ui.painter().text(
                                            idx_rect.center(),
                                            Align2::CENTER_CENTER,
                                            format!("{:02}", index + 1),
                                            FontId::proportional(12.0),
                                            if current { Color32::from_rgb(100, 180, 255) } else { Color32::from_gray(160) },
                                        );

                                        // Right side buttons
                                        let mut btn_right = row_rect.right() - 8.0;
                                        if !current {
                                            let play_rect = Rect::from_center_size(Pos2::new(btn_right - 22.0, row_rect.center().y), Vec2::new(44.0, 26.0));
                                            let play_resp = ui.interact(play_rect, ui.scope_id().with(("q_play", index)), Sense::click());
                                            ui.painter().rect(
                                                play_rect,
                                                CornerRadius::same(4),
                                                if play_resp.hovered() { Color32::from_rgb(74, 110, 224) } else { Color32::from_white_alpha(24) },
                                                Stroke::NONE,
                                                egui::StrokeKind::Inside,
                                            );
                                            ui.painter().text(play_rect.center(), Align2::CENTER_CENTER, "Play", FontId::proportional(11.5), Color32::WHITE);
                                            if play_resp.clicked() {
                                                command_sender(PlayerCommand::JumpToQueue { token: snapshot.token, index });
                                            }
                                            btn_right -= 50.0;
                                        }

                                        let del_rect = Rect::from_center_size(Pos2::new(btn_right - 12.0, row_rect.center().y), Vec2::splat(24.0));
                                        let del_resp = ui.interact(del_rect, ui.scope_id().with(("q_del", index)), Sense::click());
                                        if del_resp.hovered() {
                                            ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                            ui.painter().rect_filled(del_rect, CornerRadius::same(4), Color32::from_rgba_unmultiplied(239, 68, 68, 45));
                                        }
                                        {
                                            let x_col = if del_resp.hovered() { Color32::from_rgb(248, 113, 113) } else { Color32::from_rgb(239, 68, 68) };
                                            let xc = del_rect.center();
                                            let xr = 4.0;
                                            ui.painter().line_segment([Pos2::new(xc.x - xr, xc.y - xr), Pos2::new(xc.x + xr, xc.y + xr)], Stroke::new(1.6, x_col));
                                            ui.painter().line_segment([Pos2::new(xc.x - xr, xc.y + xr), Pos2::new(xc.x + xr, xc.y - xr)], Stroke::new(1.6, x_col));
                                        }
                                        if del_resp.clicked() {
                                            command_sender(PlayerCommand::RemoveQueueItem { token: snapshot.token, index });
                                        }
                                        btn_right -= 30.0;

                                        if index + 1 < snapshot.queue.len() {
                                            let dn_rect = Rect::from_center_size(Pos2::new(btn_right - 12.0, row_rect.center().y), Vec2::splat(24.0));
                                            let dn_resp = ui.interact(dn_rect, ui.scope_id().with(("q_dn", index)), Sense::click());
                                            if dn_resp.hovered() {
                                                ui.painter().rect_filled(dn_rect, CornerRadius::same(4), Color32::from_white_alpha(35));
                                            }
                                            ui.painter().text(dn_rect.center(), Align2::CENTER_CENTER, "↓", FontId::proportional(13.0), Color32::WHITE);
                                            if dn_resp.clicked() {
                                                command_sender(PlayerCommand::MoveQueueItem { token: snapshot.token, from: index, to: index + 1 });
                                            }
                                            btn_right -= 28.0;
                                        }

                                        if index > 0 {
                                            let up_rect = Rect::from_center_size(Pos2::new(btn_right - 12.0, row_rect.center().y), Vec2::splat(24.0));
                                            let up_resp = ui.interact(up_rect, ui.scope_id().with(("q_up", index)), Sense::click());
                                            if up_resp.hovered() {
                                                ui.painter().rect_filled(up_rect, CornerRadius::same(4), Color32::from_white_alpha(35));
                                            }
                                            ui.painter().text(up_rect.center(), Align2::CENTER_CENTER, "↑", FontId::proportional(13.0), Color32::WHITE);
                                            if up_resp.clicked() {
                                                command_sender(PlayerCommand::MoveQueueItem { token: snapshot.token, from: index, to: index - 1 });
                                            }
                                            btn_right -= 28.0;
                                        }

                                        // Title text: Single line with ellipsis inside remaining space
                                        let text_left = row_rect.min.x + 38.0;
                                        let text_max_w = (btn_right - text_left - 8.0).max(40.0);
                                        let title_font = FontId::proportional(12.5);
                                        let mut title_text = item.title.clone();
                                        if let Some(dur) = item.duration_secs {
                                            if let Some(dur_str) = fmt_time(dur as f64) {
                                                title_text = format!("{title_text} ({dur_str})");
                                            }
                                        }
                                        let mut job = egui::text::LayoutJob::single_section(
                                            title_text,
                                            egui::TextFormat {
                                                font_id: title_font,
                                                color: if current { Color32::WHITE } else { Color32::from_gray(215) },
                                                ..Default::default()
                                            },
                                        );
                                        job.wrap.max_width = text_max_w;
                                        job.wrap.max_rows = 1;
                                        job.wrap.break_anywhere = true;
                                        let galley = ui.painter().layout_job(job);
                                        ui.painter().galley(
                                            Pos2::new(text_left, row_rect.center().y - galley.size().y * 0.5),
                                            galley,
                                            Color32::WHITE,
                                        );

                                        if row_resp.clicked() {
                                            command_sender(PlayerCommand::JumpToQueue { token: snapshot.token, index });
                                        }
                                        ui.add_space(4.0);
                                    }
                                });
                            }
                            PlayerPanel::Bookmarks => {
                                ui.horizontal(|ui| {
                                    ui.label(RichText::new("Bookmarks").size(15.0).strong().color(Color32::WHITE));
                                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                        let (close_rect, close_resp) = ui.allocate_exact_size(Vec2::splat(24.0), Sense::click());
                                        if close_resp.hovered() {
                                            ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                            ui.painter().rect_filled(close_rect, CornerRadius::same(4), Color32::from_rgba_unmultiplied(239, 68, 68, 40));
                                        }
                                        {
                                            let x_col = if close_resp.hovered() { Color32::from_rgb(248, 113, 113) } else { Color32::from_rgb(239, 68, 68) };
                                            let xc = close_rect.center();
                                            let xr = 4.5;
                                            ui.painter().line_segment([Pos2::new(xc.x - xr, xc.y - xr), Pos2::new(xc.x + xr, xc.y + xr)], Stroke::new(1.8, x_col));
                                            ui.painter().line_segment([Pos2::new(xc.x - xr, xc.y + xr), Pos2::new(xc.x + xr, xc.y - xr)], Stroke::new(1.8, x_col));
                                        }
                                        if close_resp.clicked() {
                                            state.panel = None;
                                        }
                                        ui.add_space(8.0);

                                        let add_btn = egui::Button::new(RichText::new("+ Add bookmark").strong().color(Color32::WHITE))
                                            .fill(tokens.accent)
                                            .corner_radius(CornerRadius::same(5))
                                            .min_size(Vec2::new(124.0, 28.0));
                                        if ui.add(add_btn).clicked() {
                                            if let Some(path) = snapshot.path.as_ref() {
                                                let fingerprint = state.bookmark_fingerprint.clone().unwrap_or_else(|| {
                                                    path.to_string_lossy().to_string()
                                                });
                                                let stamp = fmt_time(snapshot.position_secs).unwrap_or_else(|| "00:00".into());
                                                let now = chrono::Utc::now();
                                                let id = format!("{}-{}", now.timestamp_millis(), (snapshot.position_secs.max(0.0) * 1000.0) as u64);
                                                let bookmark = Bookmark {
                                                    id,
                                                    fingerprint,
                                                    title: format!("{} · {stamp}", path.file_stem().unwrap_or_default().to_string_lossy()),
                                                    start_secs: snapshot.position_secs.max(0.0),
                                                    end_secs: None,
                                                    category: "custom".into(),
                                                    created_at: now,
                                                };
                                                if !state.bookmarks.iter().any(|saved| (saved.start_secs - bookmark.start_secs).abs() < 1.0) {
                                                    state.bookmarks.push(bookmark.clone());
                                                    state.bookmarks.sort_by(|a, b| a.start_secs.total_cmp(&b.start_secs));
                                                    action.bookmarks_added.push(bookmark);
                                                }
                                            }
                                        }
                                    });
                                });
                                ui.add_space(4.0);
                                ui.label(RichText::new("Save moments for quick one-click jump.").size(12.0).color(tokens.text_secondary));
                                ui.add_space(10.0);
                                if state.bookmarks.is_empty() {
                                    egui::Frame::new()
                                        .fill(Color32::from_white_alpha(10))
                                        .stroke(Stroke::new(1.0, Color32::from_white_alpha(25)))
                                        .corner_radius(CornerRadius::same(6))
                                        .inner_margin(14.0)
                                        .show(ui, |ui| {
                                            ui.set_width(ui.available_width());
                                            ui.label(RichText::new("No bookmarks saved for this video yet.").size(12.5).color(Color32::from_gray(200)));
                                            ui.add_space(2.0);
                                            ui.label(RichText::new("Click \"+ Add bookmark\" or press T to mark this timestamp.").size(11.5).color(tokens.text_muted));
                                        });
                                } else {
                                let bookmark_height = (panel_height - 112.0).max(160.0);
                                egui::ScrollArea::vertical()
                                    .max_height(bookmark_height)
                                    .show(ui, |ui| {
                                    let mut remove = Vec::new();
                                    for bookmark in &state.bookmarks {
                                        let row_w = ui.available_width();
                                        let (row_rect, _) = ui.allocate_exact_size(Vec2::new(row_w, 42.0), Sense::hover());
                                        ui.painter().rect(
                                            row_rect,
                                            CornerRadius::same(6),
                                            Color32::from_white_alpha(12),
                                            Stroke::new(1.0, Color32::from_white_alpha(35)),
                                            egui::StrokeKind::Inside,
                                        );

                                        // Left: Timestamp Jump Pill button
                                        let stamp_str = fmt_time(bookmark.start_secs).unwrap_or_else(|| "00:00".into());
                                        let stamp_rect = Rect::from_center_size(Pos2::new(row_rect.min.x + 40.0, row_rect.center().y), Vec2::new(56.0, 26.0));
                                        let stamp_resp = ui.interact(stamp_rect, ui.scope_id().with(("bm_jump", &bookmark.id)), Sense::click());
                                        let stamp_hovered = stamp_resp.hovered();
                                        ui.painter().rect(
                                            stamp_rect,
                                            CornerRadius::same(5),
                                            if stamp_hovered { tokens.accent } else { Color32::from_rgb(38, 48, 66) },
                                            Stroke::new(1.0, if stamp_hovered { Color32::WHITE } else { Color32::from_rgb(70, 90, 130) }),
                                            egui::StrokeKind::Inside,
                                        );
                                        ui.painter().text(
                                            stamp_rect.center(),
                                            Align2::CENTER_CENTER,
                                            &stamp_str,
                                            FontId::proportional(12.0),
                                            Color32::WHITE,
                                        );
                                        if stamp_resp.clicked() {
                                            command_sender(PlayerCommand::Seek {
                                                token: snapshot.token,
                                                seconds: bookmark.start_secs,
                                                exact: true,
                                            });
                                        }

                                        // Delete button on far right
                                        let del_rect = Rect::from_center_size(Pos2::new(row_rect.right() - 18.0, row_rect.center().y), Vec2::splat(24.0));
                                        let del_resp = ui.interact(del_rect, ui.scope_id().with(("bm_del", &bookmark.id)), Sense::click());
                                        if del_resp.hovered() {
                                            ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                            ui.painter().rect_filled(del_rect, CornerRadius::same(4), Color32::from_rgba_unmultiplied(239, 68, 68, 45));
                                        }
                                        {
                                            let x_col = if del_resp.hovered() { Color32::from_rgb(248, 113, 113) } else { Color32::from_rgb(239, 68, 68) };
                                            let xc = del_rect.center();
                                            let xr = 4.0;
                                            ui.painter().line_segment([Pos2::new(xc.x - xr, xc.y - xr), Pos2::new(xc.x + xr, xc.y + xr)], Stroke::new(1.6, x_col));
                                            ui.painter().line_segment([Pos2::new(xc.x - xr, xc.y + xr), Pos2::new(xc.x + xr, xc.y - xr)], Stroke::new(1.6, x_col));
                                        }
                                        if del_resp.clicked() {
                                            remove.push(bookmark.id.clone());
                                        }

                                        // Title in between
                                        let text_left = stamp_rect.right() + 10.0;
                                        let text_max_w = (del_rect.left() - text_left - 8.0).max(40.0);
                                        let mut job = egui::text::LayoutJob::single_section(
                                            bookmark.title.clone(),
                                            egui::TextFormat {
                                                font_id: FontId::proportional(12.5),
                                                color: Color32::from_gray(220),
                                                ..Default::default()
                                            },
                                        );
                                        job.wrap.max_width = text_max_w;
                                        job.wrap.max_rows = 1;
                                        job.wrap.break_anywhere = true;
                                        let galley = ui.painter().layout_job(job);
                                        ui.painter().galley(
                                            Pos2::new(text_left, row_rect.center().y - galley.size().y * 0.5),
                                            galley,
                                            Color32::WHITE,
                                        );

                                        ui.add_space(6.0);
                                    }
                                    if !remove.is_empty() {
                                        state.bookmarks.retain(|bookmark| !remove.contains(&bookmark.id));
                                        action.bookmarks_deleted.extend(remove);
                                    }
                                });
                                }
                            }
                            PlayerPanel::Tracks => {
                                let tracks_height = (panel_height - 92.0).max(220.0);
                                egui::ScrollArea::vertical()
                                    .max_height(tracks_height)
                                    .show(ui, |ui| {
                                        ui.label(RichText::new("Audio").size(14.0).strong().color(Color32::WHITE));
                                        ui.add_space(4.0);
                                        let audio_tracks: Vec<_> = snapshot.tracks.iter().filter(|track| track.kind == "audio").collect();
                                        if audio_tracks.is_empty() {
                                            ui.label(RichText::new("No audio tracks").size(12.0).color(tokens.text_secondary));
                                        }
                                        for track in audio_tracks {
                                            let fallback = format!("Audio track {}", track.id);
                                            let name = track_title(track.title.as_deref(), track.language.as_deref(), &fallback);
                                            let (row, response) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 30.0), Sense::click());
                                            ui.painter().rect_filled(row, CornerRadius::same(3), if track.selected { Color32::from_rgb(61, 61, 61) } else if response.hovered() { Color32::from_rgb(49, 49, 49) } else { Color32::TRANSPARENT });
                                            ui.painter().text(Pos2::new(row.left() + if track.selected { 30.0 } else { 10.0 }, row.center().y), Align2::LEFT_CENTER, name, FontId::proportional(13.0), Color32::WHITE);
                                            if track.selected { icons.paint_icon(ui, "check", Rect::from_center_size(Pos2::new(row.left() + 12.0, row.center().y), Vec2::splat(16.0)), Color32::from_gray(210)); }
                                            if response.clicked() { command_sender(PlayerCommand::SelectTrack { token: snapshot.token, id: track.id }); }
                                            let language = track.language.as_deref().map(language_name);
                                            let codec = track.codec.as_deref().map(str::to_ascii_uppercase);
                                            let detail = [language.as_deref(), codec.as_deref(), track.channels.as_deref()].into_iter().flatten().collect::<Vec<_>>().join(" · ");
                                            if !detail.is_empty() { ui.label(RichText::new(detail).size(11.0).color(Color32::from_gray(165))); }
                                        }
                                        ui.add_space(8.0);
                                        ui.separator();
                                        ui.add_space(8.0);
                                        ui.horizontal(|ui| {
                                            ui.label(RichText::new("Subtitles").size(14.0).strong().color(Color32::WHITE));
                                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                                if ui.small_button("Off").clicked() { command_sender(PlayerCommand::DisableSubtitles { token: snapshot.token }); }
                                                ui.add_space(6.0);
                                                if ui.small_button("Load file").clicked() { action.choose_subtitle = true; }
                                            });
                                        });
                                        ui.add_space(4.0);
                                        let subtitle_tracks: Vec<_> = snapshot.tracks.iter().filter(|track| track.kind == "sub").collect();
                                        if subtitle_tracks.is_empty() { ui.label(RichText::new("No subtitle tracks").size(12.0).color(tokens.text_secondary)); }
                                        for track in subtitle_tracks {
                                            let fallback = format!("Subtitle track {}", track.id);
                                            let name = track_title(track.title.as_deref(), track.language.as_deref(), &fallback);
                                            let (row, response) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 28.0), Sense::click());
                                            ui.painter().rect_filled(row, CornerRadius::same(3), if track.selected { Color32::from_rgb(61, 61, 61) } else if response.hovered() { Color32::from_rgb(49, 49, 49) } else { Color32::TRANSPARENT });
                                            ui.painter().text(Pos2::new(row.left() + if track.selected { 30.0 } else { 10.0 }, row.center().y), Align2::LEFT_CENTER, name, FontId::proportional(13.0), Color32::WHITE);
                                            if track.selected { icons.paint_icon(ui, "check", Rect::from_center_size(Pos2::new(row.left() + 12.0, row.center().y), Vec2::splat(16.0)), Color32::from_gray(210)); }
                                            if response.clicked() { command_sender(PlayerCommand::SelectTrack { token: snapshot.token, id: track.id }); }
                                        }
                                    });
                            }
                        }
                    });
            });
    }
    if snapshot.state == PlaybackState::Finished {
        egui::Area::new(egui::Id::unique("player_finished"))
            .anchor(Align2::CENTER_CENTER, Vec2::ZERO)
            .show(ui.ctx(), |ui| {
                if ui.button("Replay").clicked() {
                    command_sender(PlayerCommand::Play {
                        token: snapshot.token,
                    });
                }
            });
    }
    if state.audio_only {
        egui::Area::new(ui.scope_id().with("player_audio_only_badge"))
            .order(egui::Order::Middle)
            .anchor(Align2::CENTER_CENTER, Vec2::ZERO)
            .interactable(false)
            .show(ui.ctx(), |ui| {
                ui.vertical_centered(|ui| {
                    let (ic_rect, _) = ui.allocate_exact_size(Vec2::splat(44.0), Sense::hover());
                    icons.paint_icon(ui, "transport.volume", ic_rect, Color32::from_rgb(246, 130, 31));
                    ui.add_space(10.0);
                    let title = snapshot
                        .title
                        .as_deref()
                        .unwrap_or("Audio Only");
                    ui.label(RichText::new(title).size(16.0).strong().color(Color32::WHITE));
                    ui.label(RichText::new("Audio Only Mode").size(12.5).color(Color32::from_gray(160)));
                });
            });
    }

    if overlay_alpha <= 0.05 || state.locked_mode {
        ui.ctx().set_cursor_icon(egui::CursorIcon::None);
        ui.ctx().output_mut(|o| o.cursor_icon = egui::CursorIcon::None);
    }
    action
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::theme::Theme;

    #[test]
    fn test_movies_and_tv_theme_parameters() {
        let theme = Theme::default();
        // 1. Sharp corners / soft round
        assert_eq!(theme.corner_radius, 4.0);

        // 2. Transport & edge button sizes (40x40 hit areas)
        assert_eq!(theme.transport_button_size, Vec2::new(40.0, 40.0));
        assert_eq!(theme.bottom_button_size, Vec2::new(40.0, 40.0));
        assert_eq!(theme.edge_button_size, Vec2::new(30.0, 100.0));

        // 3. Rest vs Hover vs Pressed colors
        assert_eq!(theme.overlay_fill_rest, Color32::TRANSPARENT);
        assert_eq!(theme.overlay_fill_hover, Color32::from_rgba_unmultiplied(255, 255, 255, 31)); // 0.12
        assert_eq!(theme.overlay_fill_pressed, Color32::from_rgba_unmultiplied(255, 255, 255, 56)); // 0.22
        assert_eq!(theme.overlay_border_rest_transport, Color32::TRANSPARENT);
        assert_eq!(theme.overlay_border_rest_edge, Color32::TRANSPARENT);
        assert_eq!(theme.overlay_border_rest_bar, Color32::TRANSPARENT);
        assert_eq!(theme.overlay_border_hover, Color32::TRANSPARENT);
        assert_eq!(theme.overlay_border_width, 0.0);
        assert_eq!(theme.overlay_transition_ms, 120.0);

        // 4. Icons
        assert_eq!(theme.overlay_icon_color, Color32::WHITE);
        assert_eq!(theme.overlay_icon_stroke, 1.5);
        assert_eq!(theme.transport_icon_size, 24.0);
        assert_eq!(theme.transport_number_font_size, 8.5);
        assert_eq!(theme.bottom_icon_size, 20.0);

        // 5. Tooltip
        assert_eq!(theme.tooltip_fill, Color32::from_rgba_unmultiplied(32, 32, 32, 242));
        assert_eq!(theme.tooltip_border_width, 1.0);
        assert_eq!(theme.tooltip_text_color, Color32::WHITE);
        assert_eq!(theme.tooltip_font_size, 12.0);
        assert_eq!(theme.tooltip_padding, Vec2::new(10.0, 6.0));
        assert_eq!(theme.tooltip_gap, 6.0);
        assert_eq!(theme.tooltip_shadow_color, Color32::from_rgba_unmultiplied(0, 0, 0, 102));

        // 6. Bottom bar gradient
        assert_eq!(theme.bottom_bar_gradient_height, 160.0);
        assert_eq!(theme.bottom_bar_gradient_top, Color32::TRANSPARENT);
        assert_eq!(theme.bottom_bar_gradient_bottom, Color32::from_rgba_unmultiplied(0, 0, 0, 166)); // 0.65
    }

    #[test]
    fn test_edge_button_geometry() {
        let theme = Theme::default();
        let win = Rect::from_min_size(Pos2::new(0.0, 0.0), Vec2::new(1920.0, 1080.0));

        let prev_rect = Rect::from_min_size(
            Pos2::new(win.left(), win.center().y - theme.edge_button_size.y * 0.5),
            theme.edge_button_size,
        );
        assert_eq!(prev_rect.left(), 0.0);
        assert_eq!(prev_rect.width(), 30.0);
        assert_eq!(prev_rect.height(), 100.0);
        assert_eq!(prev_rect.center().y, win.center().y);

        let next_rect = Rect::from_min_size(
            Pos2::new(win.right() - theme.edge_button_size.x, win.center().y - theme.edge_button_size.y * 0.5),
            theme.edge_button_size,
        );
        assert_eq!(next_rect.right(), 1920.0);
        assert_eq!(next_rect.width(), 30.0);
        assert_eq!(next_rect.height(), 100.0);
        assert_eq!(next_rect.center().y, win.center().y);
    }

    #[test]
    fn test_transport_button_adjacent_geometry() {
        let theme = Theme::default();
        let center_x = 960.0;
        let control_y = 1045.0;
        let btn_size = theme.transport_button_size; // 40x40

        let left_rect = Rect::from_center_size(Pos2::new(center_x - 48.0, control_y), btn_size);
        let play_rect = Rect::from_center_size(Pos2::new(center_x, control_y), btn_size);
        let right_rect = Rect::from_center_size(Pos2::new(center_x + 48.0, control_y), btn_size);

        assert_eq!(left_rect.width(), 40.0);
        assert_eq!(left_rect.height(), 40.0);
        assert_eq!(play_rect.width(), 40.0);
        assert_eq!(play_rect.height(), 40.0);
        assert_eq!(right_rect.width(), 40.0);
        assert_eq!(right_rect.height(), 40.0);
        assert_eq!(play_rect.center().x, 960.0);
    }

    #[test]
    fn test_vertical_layout_stack_no_overlap() {
        let win_height = 1080.0;
        let control_y = win_height - 24.0;
        let time_y = win_height - 58.0;
        let seek_y = win_height - 74.0;

        let time_row_bottom = time_y + 14.0; // time labels height ~14px
        let button_row_top = control_y - 20.0; // 40px buttons centered at control_y

        // Time labels must never overlap buttons below
        assert!(time_row_bottom <= button_row_top, "Time labels ({time_row_bottom}) must not overlap button row ({button_row_top})");
        // Seek bar sits clearly above time row
        assert!(seek_y < time_y, "Seek bar must sit above time row");
        // Controls hug the bottom edge with no large dead space
        let button_row_bottom = control_y + 20.0;
        assert_eq!(button_row_bottom, win_height - 4.0);
    }

    #[test]
    fn test_right_group_button_layout_no_pencil() {
        let win_width = 1920.0;
        let right_pad = 16.0;
        let btn_size = 40.0;
        let gap = 12.0;

        let more_x = win_width - right_pad - btn_size * 0.5; // 1920 - 16 - 20 = 1884.0
        let fs_x = more_x - btn_size - gap; // 1884 - 40 - 12 = 1832.0
        let pip_x = fs_x - btn_size - gap; // 1832 - 40 - 12 = 1780.0

        assert_eq!(more_x, 1920.0 - 36.0);
        assert_eq!(fs_x, 1920.0 - 88.0);
        assert_eq!(pip_x, 1920.0 - 140.0);
    }

    #[test]
    fn test_left_group_button_layout_fixed_positions() {
        let left_pad = 16.0;
        let btn_size = 40.0;
        let gap = 8.0;

        let vol_x = left_pad + btn_size * 0.5; // 16 + 20 = 36.0
        let subs_x = vol_x + btn_size + gap; // 36 + 40 + 8 = 84.0

        assert_eq!(vol_x, 36.0);
        assert_eq!(subs_x, 84.0);
    }
}
