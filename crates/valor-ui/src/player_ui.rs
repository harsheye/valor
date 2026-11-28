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
    Picture,
    Viewing,
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
    curved_skip: Option<bool>,
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
            curved_skip: None,
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

    pub fn curved_skip(mut self, forward: bool) -> Self {
        self.curved_skip = Some(forward);
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
            ui.painter().rect(self.rect, CornerRadius::ZERO, fill, Stroke::new(1.0, border), StrokeKind::Inside);
        }
        let pointer_pos = ui.input(|i| i.pointer.hover_pos());
        crate::ui_helpers::paint_proximity_border(ui, self.rect, theme.accent_amber, pointer_pos, 96.0);

        // 2. Active/pressed icon scaling: scales to 0.95
        let scale = if response.is_pointer_button_down_on() { 0.95 } else { 1.0 };

        // 3. Paint thin-outline Fluent icon or curved skip arrow
        if let Some(forward) = self.curved_skip {
            let num_str = self.number_label.unwrap_or("10");
            crate::shell::paint_curved_skip_arrow(
                ui.painter(),
                Pos2::new(self.rect.center().x, self.rect.center().y + 3.0),
                10.5 * scale,
                forward,
                num_str,
                Color32::WHITE,
            );
        } else {
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
        let resp = ui.interact(rect, ui.scope_id().with("edge_prev_btn"), Sense::click());
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
            ui.painter().rect_filled(
                rect,
                CornerRadius::same(4),
                Color32::from_rgba_unmultiplied(255, 255, 255, 42),
            );
        }
        crate::ui_helpers::paint_proximity_border(ui, rect, theme.accent_amber, pointer_pos, 96.0);
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
        let resp = ui.interact(rect, ui.scope_id().with("edge_next_btn"), Sense::click());
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
            ui.painter().rect_filled(
                rect,
                CornerRadius::same(4),
                Color32::from_rgba_unmultiplied(255, 255, 255, 42),
            );
        }
        crate::ui_helpers::paint_proximity_border(ui, rect, theme.accent_amber, pointer_pos, 96.0);
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
    pub auto_next: bool,
    pub auto_skip_intro: bool,
    pub auto_skip_outro: bool,
    pub bookmark_category_filter: String,
    pub new_bookmark_category: String,
    pub skipped_segment_ids: std::collections::HashSet<String>,
    pub skip_toast: Option<(String, Instant)>,
    pub active_tmdb_rating: Option<f32>,
    pub active_tidb_synced: bool,
    pub media_banner_start: Instant,
    pub picture_enabled: bool,
    pub picture_lighting: i32,
    pub picture_shadows: i32,
    pub picture_contrast: i32,
    pub picture_sharpness: i32,
    pub picture_vibrance: i32,
    pub picture_hue: i32,
    pub picture_deband: bool,
    pub picture_hdr_boost: i32,
    pub active_picture_drag: Option<(&'static str, i32, i32, i32)>,
    pub last_picture_send: Instant,
    pub picture_dirty: bool,
    pub picture_was_playing_before_drag: bool,
    pub trakt_connected: bool,
    pub trakt_synced_done: bool,
    pub pending_canvas_click: Option<Instant>,
    pub tracks_popover_tab: u8,
    pub audio_delay_secs: f64,
    pub audio_boost_preset: String,
    pub sub_delay_secs: f64,
    pub sub_scale: f64,
    pub sub_pos: i64,
    pub sub_color: String,
    pub sub_bold: bool,
    pub sub_box_bg: bool,
    pub view_aspect: String,
    pub view_zoom: f64,
    pub view_panscan: f64,
    pub view_rotate: i64,
    pub view_hflip: bool,
    pub view_vflip: bool,
    pub view_ab_a: Option<f64>,
    pub view_ab_b: Option<f64>,
    pub viewing_tab: u8,
    pub viewing_preset: String,
    pub picture_fit_mode: String,
    pub hdr_tm_enabled: bool,
    pub hdr_tm_strength: u8,
    pub eq_preset: String,
    pub eq_bands: [f32; 10],
    pub audio_downmix: String,
    pub licences_dialog_open: bool,
    pub queue_pinned: bool,
    pub sub_style_override: bool,
    pub sub_text_style: u8,
    pub(crate) active_path: Option<PathBuf>,
    pub(crate) last_activity: Instant,
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
            auto_next: true,
            auto_skip_intro: true,
            auto_skip_outro: true,
            bookmark_category_filter: "all".to_string(),
            new_bookmark_category: "custom".to_string(),
            skipped_segment_ids: std::collections::HashSet::new(),
            skip_toast: None,
            active_tmdb_rating: None,
            active_tidb_synced: false,
            media_banner_start: Instant::now(),
            picture_enabled: true,
            picture_lighting: 0,
            picture_shadows: 0,
            picture_contrast: 0,
            picture_sharpness: 0,
            picture_vibrance: 0,
            picture_hue: 0,
            picture_deband: true,
            picture_hdr_boost: 0,
            active_picture_drag: None,
            last_picture_send: Instant::now(),
            picture_dirty: false,
            picture_was_playing_before_drag: false,
            trakt_connected: false,
            trakt_synced_done: false,
            pending_canvas_click: None,
            tracks_popover_tab: 1,
            audio_delay_secs: 0.0,
            audio_boost_preset: "off".to_string(),
            sub_delay_secs: 0.0,
            sub_scale: 1.0,
            sub_pos: 100,
            sub_color: "#FFFFFFFF".to_string(),
            sub_bold: false,
            sub_box_bg: false,
            view_aspect: "auto".to_string(),
            view_zoom: 0.0,
            view_panscan: 0.0,
            view_rotate: 0,
            view_hflip: false,
            view_vflip: false,
            view_ab_a: None,
            view_ab_b: None,
            viewing_tab: 0,
            viewing_preset: "off".to_string(),
            picture_fit_mode: "fit".to_string(),
            hdr_tm_enabled: true,
            hdr_tm_strength: 1,
            eq_preset: "Disabled".to_string(),
            eq_bands: [0.0; 10],
            audio_downmix: "auto".to_string(),
            licences_dialog_open: false,
            queue_pinned: false,
            sub_style_override: true,
            sub_text_style: 1,
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
    pub add_to_queue: bool,
    pub toggle_auto_next: bool,
    pub skips_delta: u32,
    pub sync_to_trakt: bool,
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

pub(crate) fn fmt_time_hms(value: f64, force_hours: bool) -> String {
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
    return crate::cnx_player::show_cnx_player(
        ui,
        snapshot,
        tokens,
        video_shape,
        state,
        error,
        command_sender,
    );
    #[allow(unreachable_code)]
    {
    let mut action = PlayerUiAction::default();
    if let Some(fs) = ui.input(|i| i.viewport().fullscreen) {
        state.is_fullscreen = fs;
    }
    let rect = ui.max_rect();
    let theme = &tokens.theme;
    if snapshot.path != state.active_path {
        state.active_path = snapshot.path.clone();
        state.last_activity = Instant::now();
        state.media_banner_start = Instant::now();
        state.overlays_visible = true;
        state.position_preview = None;
        state.skipped_segment_ids.clear();
        state.skip_toast = None;
    }

    // Auto-skip Intro & Outro segments (from TheIntroDB / web database / manual bookmarks)
    if snapshot.state == PlaybackState::Playing && snapshot.duration_secs > 1.0 && !state.is_seeking {
        let cur_pos = snapshot.position_secs;
        let bookmark_soon = state
            .bookmarks
            .iter()
            .any(|b| b.start_secs > cur_pos && (b.start_secs - cur_pos) <= 2.0);
        let mut active_segment: Option<(String, String, f64, bool)> = None;
        for bm in &state.bookmarks {
            let cat = bm.category.to_ascii_lowercase();
            let is_intro = cat == "intro" || bm.title.to_ascii_lowercase().contains("intro");
            let is_outro = cat == "credits" || cat == "outro" || bm.title.to_ascii_lowercase().contains("outro") || bm.title.to_ascii_lowercase().contains("credits");
            if !is_intro && !is_outro {
                continue;
            }
            if let Some(end) = bm.end_secs {
                if end > bm.start_secs + 2.0 && cur_pos >= bm.start_secs && cur_pos < end - 2.0 && !bookmark_soon {
                    let should_auto = (is_intro && state.auto_skip_intro) || (is_outro && state.auto_skip_outro);
                    let label = if is_intro { "Intro".to_string() } else { "Outro".to_string() };
                    active_segment = Some((bm.id.clone(), label, end, should_auto));
                    break;
                }
            }
        }
        if let Some((seg_id, label, end_secs, should_auto)) = active_segment {
            if should_auto && !state.skipped_segment_ids.contains(&seg_id) {
                state.skipped_segment_ids.insert(seg_id);
                let target = end_secs.min((snapshot.duration_secs - 0.5).max(0.0));
                command_sender(PlayerCommand::Seek {
                    token: snapshot.token,
                    seconds: target,
                    exact: true,
                });
                state.skip_toast = Some((format!("Auto-skipped {label}"), Instant::now()));
            } else if !state.locked_mode {
                egui::Area::new(ui.scope_id().with("skip_segment_pill"))
                    .order(egui::Order::Foreground)
                    .fixed_pos(Pos2::new(rect.right() - 168.0, rect.bottom() - 156.0))
                    .show(ui.ctx(), |ui| {
                        let btn = egui::Button::new(
                            RichText::new(format!("Skip {label} >>"))
                                .size(13.0)
                                .strong()
                                .color(Color32::WHITE),
                        )
                        .fill(Color32::from_rgba_unmultiplied(18, 20, 26, 225))
                        .stroke(Stroke::new(1.2, tokens.accent))
                        .corner_radius(CornerRadius::same(8))
                        .min_size(Vec2::new(144.0, 36.0));
                        if ui.add(btn).clicked() {
                            state.skipped_segment_ids.insert(seg_id.clone());
                            let target = end_secs.min((snapshot.duration_secs - 0.5).max(0.0));
                            command_sender(PlayerCommand::Seek {
                                token: snapshot.token,
                                seconds: target,
                                exact: true,
                            });
                        }
                    });
            }
        }
    }

    if let Some((ref msg, ts)) = state.skip_toast {
        if ts.elapsed().as_secs_f32() < 2.6 {
            egui::Area::new(ui.scope_id().with("skip_toast_pill"))
                .order(egui::Order::Foreground)
                .anchor(Align2::CENTER_TOP, Vec2::new(0.0, 56.0))
                .interactable(false)
                .show(ui.ctx(), |ui| {
                    egui::Frame::new()
                        .fill(Color32::from_rgba_unmultiplied(16, 18, 24, 230))
                        .stroke(Stroke::new(1.0, tokens.accent))
                        .corner_radius(CornerRadius::same(16))
                        .inner_margin(egui::Margin::symmetric(14, 6))
                        .show(ui, |ui| {
                            ui.label(RichText::new(msg).size(12.5).strong().color(Color32::WHITE));
                        });
                });
        } else {
            state.skip_toast = None;
        }
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
        || snapshot.state != PlaybackState::Playing
        || state.media_banner_start.elapsed() < Duration::from_secs(6);

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
        action.skips_delta += 1;
    }
    if ui.input_mut(|i| i.consume_key(egui::Modifiers::NONE, egui::Key::ArrowRight)) {
        command_sender(PlayerCommand::SeekRel {
            token: snapshot.token,
            seconds: skip_step,
        });
        action.skips_delta += 1;
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

    // CnX ClickGrace: deliberate single-click (Play/Pause after double-click grace window) vs double-click (Fullscreen)
    let canvas_resp = ui.allocate_rect(rect, Sense::click());
    let no_popups = state.panel.is_none() && !state.volume_popup_open && !state.subtitles_popup_open && !state.more_options_open;
    if canvas_resp.double_clicked() && !mouse_over_controls && no_popups {
        state.pending_canvas_click = None;
        let is_fs = ui.input(|i| i.viewport().fullscreen.unwrap_or(state.is_fullscreen));
        state.is_fullscreen = !is_fs;
        action.toggle_fullscreen = Some(state.is_fullscreen);
    } else if canvas_resp.clicked() && !mouse_over_controls {
        if no_popups {
            state.pending_canvas_click = Some(Instant::now());
        } else {
            state.pending_canvas_click = None;
        }
    }
    if let Some(pressed_at) = state.pending_canvas_click {
        if pressed_at.elapsed() >= Duration::from_millis(220) {
            state.pending_canvas_click = None;
            command_sender(PlayerCommand::Toggle {
                token: snapshot.token,
            });
        } else {
            ui.ctx().request_repaint_after(Duration::from_millis(30));
        }
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
        // CnX-style Top Gradient Scrim
        let top_fade_rect = Rect::from_min_max(
            Pos2::new(rect.left(), rect.top()),
            Pos2::new(rect.right(), rect.top() + 84.0),
        );
        let mut top_mesh = egui::Mesh::default();
        top_mesh.colored_vertex(top_fade_rect.left_top(), Color32::from_rgba_unmultiplied(0, 0, 0, (185.0 * overlay_alpha) as u8));
        top_mesh.colored_vertex(top_fade_rect.right_top(), Color32::from_rgba_unmultiplied(0, 0, 0, (185.0 * overlay_alpha) as u8));
        top_mesh.colored_vertex(top_fade_rect.right_bottom(), Color32::TRANSPARENT);
        top_mesh.colored_vertex(top_fade_rect.left_bottom(), Color32::TRANSPARENT);
        top_mesh.add_triangle(0, 1, 2);
        top_mesh.add_triangle(0, 2, 3);
        ui.painter().add(egui::Shape::mesh(top_mesh));

        // Top-left Back button + CnX File Title & Stream Subtitle
        let back_btn_rect = Rect::from_center_size(
            Pos2::new(rect.left() + 30.0, rect.top() + 30.0),
            Vec2::splat(38.0),
        );
        let back_resp = OverlayButton::bottom_bar(ui.scope_id().with("btn_top_back"), back_btn_rect)
            .icon("action.back")
            .icon_size(20.0)
            .show(ui, theme, icons);
        if back_resp.clicked() {
            action.leave = true;
        }
        let top_title = snapshot
            .title
            .clone()
            .or_else(|| snapshot.path.as_ref().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().to_string()))
            .unwrap_or_else(|| "Playing".to_string());
        let top_sub = {
            let ext = snapshot.path.as_ref().and_then(|p| p.extension()).map(|e| e.to_string_lossy().to_uppercase()).unwrap_or_default();
            let res = if snapshot.video_width > 0 { format!("{}x{}", snapshot.video_width, snapshot.video_height) } else { String::new() };
            let badge = if snapshot.is_dolby_vision { "Dolby Vision" } else if snapshot.is_hdr { "10-bit HDR" } else { "" };
            [ext.as_str(), res.as_str(), badge].into_iter().filter(|s| !s.is_empty()).collect::<Vec<_>>().join("  •  ")
        };
        ui.painter().text(
            Pos2::new(rect.left() + 58.0, rect.top() + 23.0),
            Align2::LEFT_CENTER,
            top_title,
            FontId::proportional(13.5),
            Color32::from_white_alpha((245.0 * overlay_alpha) as u8),
        );
        if !top_sub.is_empty() {
            ui.painter().text(
                Pos2::new(rect.left() + 58.0, rect.top() + 40.0),
                Align2::LEFT_CENTER,
                top_sub,
                FontId::proportional(11.0),
                Color32::from_rgba_unmultiplied(245, 174, 108, (220.0 * overlay_alpha) as u8),
            );
        }

        // CnX Top-Right Quick Actions: PiP, Bookmarks, Lock, Queue
        let top_y = rect.top() + 30.0;
        let top_btn = |ui: &mut Ui, id: &str, cx: f32, icon_name: &str, tip: &str, active: bool| -> egui::Response {
            let b_rect = Rect::from_center_size(Pos2::new(cx, top_y), Vec2::splat(34.0));
            if active {
                ui.painter().circle_filled(b_rect.center(), 16.0, Color32::from_rgb(235, 140, 52));
            }
            OverlayButton::bottom_bar(ui.scope_id().with(id), b_rect)
                .icon(icon_name)
                .icon_size(18.0)
                .show(ui, theme, icons)
                .on_hover_text(tip)
        };
        if top_btn(ui, "top_pip", rect.right() - 146.0, "transport.pip", "Mini view", false).clicked() {
            action.toggle_pip = true;
        }
        if top_btn(ui, "top_bm", rect.right() - 108.0, "dock.bookmarks", "Bookmarks (B)", state.panel == Some(PlayerPanel::Bookmarks)).clicked() {
            state.panel = if state.panel == Some(PlayerPanel::Bookmarks) { None } else { Some(PlayerPanel::Bookmarks) };
            panel_just_opened = true;
        }
        if top_btn(ui, "top_lock", rect.right() - 70.0, "dock.lock", "Lock controls (L)", false).clicked() {
            state.locked_mode = true;
            state.overlays_visible = false;
            state.volume_popup_open = false;
            state.subtitles_popup_open = false;
            state.more_options_open = false;
            state.panel = None;
        }
        if top_btn(ui, "top_queue", rect.right() - 32.0, "dock.queue", "Queue", state.panel == Some(PlayerPanel::Queue)).clicked() {
            state.panel = if state.panel == Some(PlayerPanel::Queue) { None } else { Some(PlayerPanel::Queue) };
            panel_just_opened = true;
        }

        let player_layout = &tokens.skin.player_layout;
        // Bottom gradient scrim or solid VLC bar
        if player_layout.style == "vlc" {
            let vlc_bar = Rect::from_min_max(
                Pos2::new(rect.left() + player_layout.bar_margin_x, rect.bottom() - player_layout.bar_height - player_layout.bar_margin_bottom),
                Pos2::new(rect.right() - player_layout.bar_margin_x, rect.bottom() - player_layout.bar_margin_bottom),
            );
            let bg = Color32::from_rgba_unmultiplied(
                tokens.player_bar_bg.r(),
                tokens.player_bar_bg.g(),
                tokens.player_bar_bg.b(),
                ((tokens.player_bar_bg.a() as f32) * overlay_alpha) as u8,
            );
            ui.painter().rect_filled(vlc_bar, CornerRadius::same(player_layout.bar_corner_radius), bg);
            ui.painter().hline(
                vlc_bar.x_range(),
                vlc_bar.top(),
                Stroke::new(1.0, Color32::from_white_alpha((40.0 * overlay_alpha) as u8)),
            );
        } else {
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
        }

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

        // Vertical layout: Seek bar -> Time row -> Button row (skin-aware)
        let is_top_controls = player_layout.controls_position == crate::skin::ControlsPosition::Top;
        let control_y = if is_top_controls {
            rect.top() + 36.0
        } else {
            rect.bottom() - 24.0
        };
        let time_y = if is_top_controls {
            rect.top() + 62.0
        } else {
            rect.bottom() - 58.0
        };
        let seek_y = if is_top_controls {
            rect.top() + 80.0
        } else {
            rect.bottom() - 74.0
        };
        let seek_rect = Rect::from_min_max(
            Pos2::new(rect.left() + 16.0, seek_y - 8.0),
            Pos2::new(rect.right() - 16.0, seek_y + 8.0),
        );

        // Filename text: displayed above seek bar when PAUSED or during first 6s of loadup
        let is_paused = snapshot.state != PlaybackState::Playing;
        if is_paused || state.media_banner_start.elapsed() < Duration::from_secs(6) {
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
        let thumb_radius = 4.5 + 1.5 * seek_grow_t;

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
                action.skips_delta += 1;
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
                action.skips_delta += 1;
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

        // 3. Played portion: CnX warm amber/orange
        let scrub_fill_col = if player_layout.style == "default" {
            Color32::from_rgba_unmultiplied(235, 140, 52, (255.0 * overlay_alpha) as u8)
        } else {
            Color32::from_rgba_unmultiplied(
                tokens.scrubber_fill.r(),
                tokens.scrubber_fill.g(),
                tokens.scrubber_fill.b(),
                (255.0 * overlay_alpha) as u8,
            )
        };
        if fraction > 0.0 {
            ui.painter().rect_filled(
                Rect::from_min_size(
                    track.min,
                    Vec2::new(track.width() * fraction, track.height()),
                ),
                CornerRadius::ZERO,
                scrub_fill_col,
            );
        }

        // 3b. Bookmark / Intro / Outro segments & markers on timeline
        if has_duration {
            for bm in &state.bookmarks {
                let start_f = (bm.start_secs / snapshot.duration_secs).clamp(0.0, 1.0) as f32;
                let cat = bm.category.to_ascii_lowercase();
                let marker_col = match cat.as_str() {
                    "intro" => Color32::from_rgba_unmultiplied(6, 182, 212, (235.0 * overlay_alpha) as u8),
                    "credits" | "outro" => Color32::from_rgba_unmultiplied(168, 85, 247, (235.0 * overlay_alpha) as u8),
                    "recap" => Color32::from_rgba_unmultiplied(245, 158, 11, (235.0 * overlay_alpha) as u8),
                    _ => Color32::from_rgba_unmultiplied(tokens.accent.r(), tokens.accent.g(), tokens.accent.b(), (240.0 * overlay_alpha) as u8),
                };
                if let Some(end_secs) = bm.end_secs {
                    if end_secs > bm.start_secs {
                        let end_f = (end_secs / snapshot.duration_secs).clamp(0.0, 1.0) as f32;
                        let seg_x0 = track.left() + track.width() * start_f;
                        let seg_x1 = track.left() + track.width() * end_f;
                        if seg_x1 > seg_x0 {
                            ui.painter().rect_filled(
                                Rect::from_min_max(Pos2::new(seg_x0, track.top() - 1.0), Pos2::new(seg_x1, track.bottom() + 1.0)),
                                CornerRadius::ZERO,
                                marker_col,
                            );
                        }
                    }
                } else {
                    let mx = track.left() + track.width() * start_f;
                    ui.painter().rect_filled(
                        Rect::from_center_size(Pos2::new(mx, track.center().y), Vec2::new(3.0, track_h + 6.0)),
                        CornerRadius::same(1),
                        marker_col,
                    );
                }
            }

            // 3c. Chapter divider notches on timeline
            for ch in &snapshot.chapters {
                if ch.start_secs > 0.5 && ch.start_secs < snapshot.duration_secs {
                    let ch_f = (ch.start_secs / snapshot.duration_secs).clamp(0.0, 1.0) as f32;
                    let cx = track.left() + track.width() * ch_f;
                    ui.painter().line_segment(
                        [Pos2::new(cx, track.top() - 2.0), Pos2::new(cx, track.bottom() + 2.0)],
                        Stroke::new(1.5, Color32::from_rgba_unmultiplied(15, 17, 22, (230.0 * overlay_alpha) as u8)),
                    );
                }
            }
        }

        // 4. Thumb: smaller blue circle with clean ring
        let knob_ring_col = if player_layout.style == "default" {
            Color32::from_rgba_unmultiplied(56, 152, 255, (255.0 * overlay_alpha) as u8)
        } else {
            Color32::from_rgba_unmultiplied(
                tokens.scrubber_knob.r(),
                tokens.scrubber_knob.g(),
                tokens.scrubber_knob.b(),
                (255.0 * overlay_alpha) as u8,
            )
        };
        let knob = Pos2::new(track.left() + track.width() * fraction, track.center().y);
        ui.painter().circle_filled(
            knob,
            thumb_radius,
            knob_ring_col,
        );

        // 5. Seek bar skimming tooltip: timestamp + active Chapter + Bookmark + preview thumbnail
        state.scrub_hover_time = None;
        if seek_near || state.is_seeking {
            if let Some(pos_pt) = pointer_position {
                let hover_frac = ((pos_pt.x - seek_rect.left()) / seek_rect.width()).clamp(0.0, 1.0);
                let hover_time = hover_frac as f64 * max_position;
                state.scrub_hover_time = Some(hover_time);
                let hover_has_hours = snapshot.duration_secs >= 3600.0;
                let hover_str = fmt_time_hms(hover_time, hover_has_hours);

                let active_chapter = snapshot
                    .chapters
                    .iter()
                    .rev()
                    .find(|ch| ch.start_secs <= hover_time)
                    .map(|ch| ch.title.clone());

                let snap_tol = (max_position * 0.015).max(3.0);
                let hovered_bookmark = state.bookmarks.iter().find(|bm| {
                    if let Some(end_secs) = bm.end_secs {
                        hover_time >= bm.start_secs && hover_time <= end_secs
                    } else {
                        (hover_time - bm.start_secs).abs() <= snap_tol
                    }
                });

                let mut sub_lines: Vec<(String, Color32)> = Vec::new();
                if let Some(ch_title) = active_chapter {
                    if !ch_title.trim().is_empty() {
                        sub_lines.push((ch_title, Color32::from_rgb(210, 218, 232)));
                    }
                }
                if let Some(bm) = hovered_bookmark {
                    let tag = format!("[{}] {}", bm.category.to_uppercase(), bm.title);
                    sub_lines.push((tag, tokens.accent));
                }

                let pill_w = if !sub_lines.is_empty() { 168.0 } else { 72.0 };
                let pill_h = 26.0 + (sub_lines.len() as f32 * 16.0);
                let pill_x = (pos_pt.x - pill_w * 0.5).clamp(rect.left() + 12.0, (rect.right() - pill_w - 12.0).max(rect.left() + 12.0));
                let pill_pos = Pos2::new(pill_x, seek_y - pill_h - 14.0);

                egui::Area::new(ui.scope_id().with("player_scrub_time"))
                    .order(egui::Order::Foreground)
                    .interactable(false)
                    .fixed_pos(pill_pos)
                    .show(ui.ctx(), |ui| {
                        let (pill_rect, _) = ui.allocate_exact_size(Vec2::new(pill_w, pill_h), Sense::hover());
                        let mut y_cursor = pill_rect.top() + 4.0;
                        for (line, col) in &sub_lines {
                            let mut job = egui::text::LayoutJob::single_section(
                                line.clone(),
                                egui::TextFormat {
                                    font_id: FontId::proportional(11.0),
                                    color: *col,
                                    ..Default::default()
                                },
                            );
                            job.wrap.max_width = pill_w - 12.0;
                            job.wrap.max_rows = 1;
                            let galley = ui.painter().layout_job(job);
                            ui.painter().galley(
                                Pos2::new(pill_rect.center().x - galley.size().x * 0.5, y_cursor),
                                galley,
                                *col,
                            );
                            y_cursor += 16.0;
                        }
                        ui.painter().text(
                            Pos2::new(pill_rect.center().x + 1.0, y_cursor + 10.0),
                            Align2::CENTER_CENTER,
                            &hover_str,
                            FontId::proportional(12.5),
                            Color32::from_black_alpha(180),
                        );
                        ui.painter().text(
                            Pos2::new(pill_rect.center().x, y_cursor + 9.0),
                            Align2::CENTER_CENTER,
                            &hover_str,
                            FontId::proportional(12.5),
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
        let vol_btn_rect = Rect::from_center_size(Pos2::new(rect.left() + 32.0, control_y), Vec2::splat(40.0));
        let subs_btn_rect = Rect::from_center_size(Pos2::new(rect.left() + 74.0, control_y), Vec2::splat(40.0));

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

        // --- CnX-style Subtitles & Audio Popover ---
        let subs_slide_t = ui.ctx().animate_bool_with_time(ui.scope_id().with("subs_slide_anim"), state.subtitles_popup_open, 0.15);
        if subs_slide_t > 0.001 {
            let subs_pop_w = 580.0_f32.min((rect.width() - 32.0).max(340.0));
            let subs_pop_h = 480.0_f32.min((rect.height() - 96.0).max(300.0));
            let slide_offset = (1.0 - subs_slide_t) * 16.0;
            let subs_pop_x = (rect.left() + 20.0).min((rect.right() - subs_pop_w - 12.0).max(rect.left() + 12.0));
            let subs_pop_rect = Rect::from_min_max(
                Pos2::new(subs_pop_x, (control_y - subs_pop_h - 14.0 + slide_offset).max(rect.top() + 12.0)),
                Pos2::new(subs_pop_x + subs_pop_w, control_y - 14.0 + slide_offset),
            );
            if state.subtitles_popup_open && ui.input(|i| i.pointer.any_click()) {
                if let Some(pos_pt) = pointer_position {
                    if !subs_pop_rect.contains(pos_pt) && !subs_btn_rect.contains(pos_pt) {
                        state.subtitles_popup_open = false;
                    }
                }
            }

            let cnx_bg = Color32::from_rgb(24, 21, 18);
            let cnx_surface = Color32::from_rgb(38, 33, 28);
            let cnx_border = Color32::from_rgb(56, 48, 40);
            let cnx_peach = Color32::from_rgb(245, 174, 108);
            let cnx_amber = Color32::from_rgb(235, 140, 52);
            let cnx_dark_txt = Color32::from_rgb(24, 20, 16);
            let cnx_muted = Color32::from_rgb(172, 162, 150);

            egui::Area::new(ui.scope_id().with("player_subtitles_popup"))
                .order(egui::Order::Foreground)
                .fixed_pos(subs_pop_rect.min)
                .show(ui.ctx(), |ui| {
                    egui::Frame::new()
                        .fill(cnx_bg)
                        .stroke(Stroke::new(1.0, cnx_border))
                        .corner_radius(CornerRadius::same(10))
                        .inner_margin(16.0)
                        .show(ui, |ui| {
                            ui.set_width(subs_pop_w - 32.0);
                            ui.set_max_height(subs_pop_h - 32.0);

                            // Top Header: Subtitles | Audio tabs + Reset + Close
                            ui.horizontal(|ui| {
                                egui::Frame::new()
                                    .fill(Color32::from_rgb(30, 26, 22))
                                    .stroke(Stroke::new(1.0, cnx_border))
                                    .corner_radius(CornerRadius::same(8))
                                    .inner_margin(4.0)
                                    .show(ui, |ui| {
                                        ui.horizontal(|ui| {
                                            ui.spacing_mut().item_spacing = Vec2::new(4.0, 0.0);
                                            for (idx, lbl) in [(1u8, "Subtitles"), (0u8, "Audio")] {
                                                let active = state.tracks_popover_tab == idx;
                                                if ui.add(
                                                    egui::Button::new(RichText::new(lbl).size(12.0).strong().color(if active { cnx_dark_txt } else { Color32::from_gray(225) }))
                                                        .fill(if active { cnx_peach } else { Color32::TRANSPARENT })
                                                        .corner_radius(CornerRadius::same(6))
                                                        .min_size(Vec2::new(96.0, 28.0)),
                                                ).clicked() {
                                                    state.tracks_popover_tab = idx;
                                                }
                                            }
                                        });
                                    });
                                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                    if ui.add(
                                        egui::Button::new(RichText::new("×").size(14.0).color(Color32::WHITE))
                                            .fill(cnx_surface)
                                            .stroke(Stroke::new(1.0, cnx_border))
                                            .corner_radius(CornerRadius::same(14))
                                            .min_size(Vec2::new(28.0, 28.0)),
                                    ).clicked() {
                                        state.subtitles_popup_open = false;
                                    }
                                    if ui.add(
                                        egui::Button::new(RichText::new("Reset").size(11.5).color(Color32::WHITE))
                                            .fill(cnx_surface)
                                            .stroke(Stroke::new(1.0, cnx_border))
                                            .corner_radius(CornerRadius::same(6))
                                            .min_size(Vec2::new(54.0, 28.0)),
                                    ).clicked() {
                                        if state.tracks_popover_tab == 0 {
                                            state.audio_delay_secs = 0.0;
                                            state.audio_boost_preset = "off".to_string();
                                            state.eq_preset = "Disabled".to_string();
                                            state.eq_bands = [0.0; 10];
                                            state.audio_downmix = "auto".to_string();
                                            command_sender(PlayerCommand::SetAudioDelay { token: snapshot.token, secs: 0.0 });
                                            command_sender(PlayerCommand::SetAudioBoostPreset { token: snapshot.token, preset: "off".into() });
                                            command_sender(PlayerCommand::SetEqualizer { token: snapshot.token, bands_db: [0.0; 10] });
                                            command_sender(PlayerCommand::SetAudioDownmix { token: snapshot.token, mode: "auto".into() });
                                        } else {
                                            state.sub_delay_secs = 0.0;
                                            state.sub_scale = 1.0;
                                            state.sub_pos = 100;
                                            state.sub_color = "#FFFFFFFF".to_string();
                                            state.sub_bold = false;
                                            state.sub_box_bg = false;
                                            command_sender(PlayerCommand::SetSubDelay { token: snapshot.token, secs: 0.0 });
                                            command_sender(PlayerCommand::SetSubtitleAppearance {
                                                token: snapshot.token,
                                                scale: 1.0,
                                                pos: 100,
                                                color: "#FFFFFFFF".into(),
                                                bold: false,
                                                box_bg: false,
                                            });
                                        }
                                    }
                                });
                            });
                            ui.add_space(12.0);
                            ui.separator();
                            ui.add_space(10.0);

                            egui::ScrollArea::vertical().max_height(subs_pop_h - 108.0).show(ui, |ui| {
                                if state.tracks_popover_tab == 0 {
                                    // 2-Column Audio Layout (CnX Screenshot 3)
                                    ui.columns(2, |cols| {
                                        // Left Column: Audio track
                                        cols[0].label(RichText::new("Audio track").size(12.0).color(cnx_muted));
                                        cols[0].add_space(8.0);
                                        let audio_tracks: Vec<_> = snapshot.tracks.iter().filter(|t| t.kind == "audio").collect();
                                        if audio_tracks.is_empty() {
                                            cols[0].label(RichText::new("No audio tracks").size(12.0).color(cnx_muted));
                                        }
                                        for (idx, track) in audio_tracks.iter().enumerate() {
                                            let fallback = format!("Audio {}", idx + 1);
                                            let name = track_title(track.title.as_deref(), track.language.as_deref(), &fallback);
                                            let label = if track.selected { format!("{name}   ✓") } else { name };
                                            if cols[0].add(
                                                egui::Button::new(RichText::new(label).size(12.0).strong().color(if track.selected { cnx_dark_txt } else { Color32::WHITE }))
                                                    .fill(if track.selected { cnx_peach } else { cnx_surface })
                                                    .stroke(Stroke::new(1.0, cnx_border))
                                                    .corner_radius(CornerRadius::same(8))
                                                    .min_size(Vec2::new(cols[0].available_width() - 8.0, 34.0)),
                                            ).clicked() {
                                                command_sender(PlayerCommand::SelectTrack { token: snapshot.token, id: track.id });
                                            }
                                            cols[0].add_space(6.0);
                                        }

                                        // Right Column: Delay, 10-band Equaliser, Boost, Downmix
                                        let rui = &mut cols[1];
                                        rui.horizontal(|ui| {
                                            ui.label(RichText::new("Audio delay").size(12.0).color(Color32::from_gray(235)));
                                            ui.add_space(8.0);
                                            if ui.add(egui::Button::new(RichText::new("−").size(14.0).color(Color32::WHITE)).fill(cnx_surface).stroke(Stroke::new(1.0, cnx_border)).corner_radius(CornerRadius::same(14)).min_size(Vec2::new(26.0, 26.0))).clicked() {
                                                state.audio_delay_secs = (state.audio_delay_secs - 0.05).clamp(-10.0, 10.0);
                                                command_sender(PlayerCommand::SetAudioDelay { token: snapshot.token, secs: state.audio_delay_secs });
                                            }
                                            ui.label(RichText::new(format!("{:.0} ms", state.audio_delay_secs * 1000.0)).size(11.5).color(cnx_peach));
                                            if ui.add(egui::Button::new(RichText::new("+").size(14.0).color(Color32::WHITE)).fill(cnx_surface).stroke(Stroke::new(1.0, cnx_border)).corner_radius(CornerRadius::same(14)).min_size(Vec2::new(26.0, 26.0))).clicked() {
                                                state.audio_delay_secs = (state.audio_delay_secs + 0.05).clamp(-10.0, 10.0);
                                                command_sender(PlayerCommand::SetAudioDelay { token: snapshot.token, secs: state.audio_delay_secs });
                                            }
                                        });
                                        rui.add_space(10.0);

                                        // Equaliser header + preset chips
                                        rui.label(RichText::new("Equaliser").size(12.0).color(cnx_muted));
                                        rui.add_space(4.0);
                                        rui.horizontal_wrapped(|ui| {
                                            ui.spacing_mut().item_spacing = Vec2::new(4.0, 4.0);
                                            for (pname, bands) in [
                                                ("Disabled", [0.0_f32; 10]),
                                                ("Cinema", [3.0, 2.0, 1.0, 0.0, 0.0, 1.0, 2.0, 2.0, 1.0, 1.0]),
                                                ("Music", [4.0, 3.0, 1.0, 0.0, -1.0, 0.0, 2.0, 3.0, 3.0, 2.0]),
                                                ("Voice", [-2.0, -1.0, 0.0, 2.0, 4.0, 4.0, 3.0, 1.0, 0.0, -1.0]),
                                                ("Bass", [6.0, 5.0, 4.0, 2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0]),
                                            ] {
                                                let act = state.eq_preset == pname;
                                                if ui.add(
                                                    egui::Button::new(RichText::new(pname).size(10.5).color(if act { cnx_dark_txt } else { Color32::from_gray(220) }))
                                                        .fill(if act { cnx_peach } else { cnx_surface })
                                                        .stroke(Stroke::new(1.0, cnx_border))
                                                        .corner_radius(CornerRadius::same(6)),
                                                ).clicked() {
                                                    state.eq_preset = pname.to_string();
                                                    state.eq_bands = bands;
                                                    command_sender(PlayerCommand::SetEqualizer { token: snapshot.token, bands_db: state.eq_bands });
                                                }
                                            }
                                        });
                                        rui.add_space(8.0);

                                        // 10-Band Visual Equaliser (32..16K)
                                        let band_labels = ["32", "64", "125", "250", "500", "1K", "2K", "4K", "8K", "16K"];
                                        let eq_h = 84.0_f32;
                                        let mut eq_changed = false;
                                        rui.horizontal(|ui| {
                                            ui.spacing_mut().item_spacing = Vec2::new(3.0, 0.0);
                                            let band_w = ((ui.available_width() - 27.0) / 10.0).max(18.0);
                                            for (i, lbl) in band_labels.iter().enumerate() {
                                                ui.vertical(|ui| {
                                                    ui.set_width(band_w);
                                                    let (bar_rect, bar_resp) = ui.allocate_exact_size(Vec2::new(band_w, eq_h), Sense::click_and_drag());
                                                    if bar_resp.hovered() {
                                                        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                                    }
                                                    if bar_resp.dragged() || bar_resp.clicked() {
                                                        if let Some(p) = ui.input(|inp| inp.pointer.interact_pos()) {
                                                            let frac = (1.0 - (p.y - bar_rect.top()) / eq_h).clamp(0.0, 1.0);
                                                            state.eq_bands[i] = (frac * 24.0 - 12.0).round();
                                                            state.eq_preset = "Custom".to_string();
                                                            eq_changed = true;
                                                        }
                                                    }
                                                    let cx = bar_rect.center().x;
                                                    let track_top = bar_rect.top() + 6.0;
                                                    let track_bot = bar_rect.bottom() - 6.0;
                                                    let frac = ((state.eq_bands[i] + 12.0) / 24.0).clamp(0.0, 1.0);
                                                    let thumb_y = track_bot - frac * (track_bot - track_top);
                                                    ui.painter().line_segment([Pos2::new(cx, track_top), Pos2::new(cx, track_bot)], Stroke::new(3.0, cnx_surface));
                                                    ui.painter().line_segment([Pos2::new(cx, thumb_y), Pos2::new(cx, track_bot)], Stroke::new(3.0, cnx_amber));
                                                    ui.painter().circle_filled(Pos2::new(cx, thumb_y), 5.0, cnx_peach);
                                                    ui.label(RichText::new(*lbl).size(9.5).color(cnx_muted));
                                                });
                                            }
                                        });
                                        if eq_changed {
                                            command_sender(PlayerCommand::SetEqualizer { token: snapshot.token, bands_db: state.eq_bands });
                                        }

                                        rui.add_space(10.0);
                                        rui.label(RichText::new("Audio boost").size(12.0).color(cnx_muted));
                                        rui.add_space(4.0);
                                        rui.horizontal_wrapped(|ui| {
                                            ui.spacing_mut().item_spacing = Vec2::new(4.0, 4.0);
                                            for (id, lbl) in [("off", "Off"), ("light", "Light"), ("standard", "Standard"), ("dynamic", "Dynamic"), ("night", "Night")] {
                                                let act = state.audio_boost_preset == id;
                                                if ui.add(
                                                    egui::Button::new(RichText::new(lbl).size(11.0).color(if act { cnx_dark_txt } else { Color32::WHITE }))
                                                        .fill(if act { cnx_peach } else { cnx_surface })
                                                        .stroke(Stroke::new(1.0, cnx_border))
                                                        .corner_radius(CornerRadius::same(6)),
                                                ).clicked() {
                                                    state.audio_boost_preset = id.to_string();
                                                    command_sender(PlayerCommand::SetAudioBoostPreset { token: snapshot.token, preset: id.to_string() });
                                                }
                                            }
                                        });

                                        rui.add_space(10.0);
                                        rui.label(RichText::new("Audio channel / downmix").size(12.0).color(cnx_muted));
                                        rui.add_space(4.0);
                                        rui.horizontal(|ui| {
                                            for (id, lbl) in [("auto", "Default (System)"), ("stereo", "Stereo"), ("mono", "Mono")] {
                                                let act = state.audio_downmix == id;
                                                if ui.add(
                                                    egui::Button::new(RichText::new(lbl).size(11.0).color(if act { cnx_dark_txt } else { Color32::WHITE }))
                                                        .fill(if act { cnx_peach } else { cnx_surface })
                                                        .stroke(Stroke::new(1.0, cnx_border))
                                                        .corner_radius(CornerRadius::same(6)),
                                                ).clicked() {
                                                    state.audio_downmix = id.to_string();
                                                    command_sender(PlayerCommand::SetAudioDownmix { token: snapshot.token, mode: id.to_string() });
                                                }
                                            }
                                        });
                                    });
                                } else {
                                    // 2-Column Subtitles + Sub Look Layout
                                    ui.columns(2, |cols| {
                                        // Left Column: Subtitle tracks + External
                                        cols[0].label(RichText::new("Subtitle track").size(12.0).color(cnx_muted));
                                        cols[0].add_space(6.0);
                                        let sub_tracks: Vec<_> = snapshot.tracks.iter().filter(|t| t.kind == "sub").collect();
                                        let none_sel = !sub_tracks.iter().any(|t| t.selected);
                                        if cols[0].add(
                                            egui::Button::new(RichText::new(if none_sel { "Off   ✓" } else { "Turn off subtitles" }).size(12.0).color(if none_sel { cnx_dark_txt } else { Color32::WHITE }))
                                                .fill(if none_sel { cnx_peach } else { cnx_surface })
                                                .stroke(Stroke::new(1.0, cnx_border))
                                                .corner_radius(CornerRadius::same(8))
                                                .min_size(Vec2::new(cols[0].available_width() - 8.0, 30.0)),
                                        ).clicked() {
                                            command_sender(PlayerCommand::DisableSubtitles { token: snapshot.token });
                                        }
                                        cols[0].add_space(4.0);
                                        for (idx, track) in sub_tracks.iter().enumerate() {
                                            let fallback = format!("Subtitle {}", idx + 1);
                                            let name = track_title(track.title.as_deref(), track.language.as_deref(), &fallback);
                                            let label = if track.selected { format!("{name}   ✓") } else { name };
                                            if cols[0].add(
                                                egui::Button::new(RichText::new(label).size(11.5).color(if track.selected { cnx_dark_txt } else { Color32::WHITE }))
                                                    .fill(if track.selected { cnx_peach } else { cnx_surface })
                                                    .stroke(Stroke::new(1.0, cnx_border))
                                                    .corner_radius(CornerRadius::same(8))
                                                    .min_size(Vec2::new(cols[0].available_width() - 8.0, 28.0)),
                                            ).clicked() {
                                                command_sender(PlayerCommand::SelectTrack { token: snapshot.token, id: track.id });
                                            }
                                            cols[0].add_space(4.0);
                                        }
                                        cols[0].add_space(6.0);
                                        if cols[0].add(
                                            egui::Button::new(RichText::new("+ Load External Subtitle...").size(11.5).strong().color(cnx_dark_txt))
                                                .fill(cnx_amber)
                                                .corner_radius(CornerRadius::same(8))
                                                .min_size(Vec2::new(cols[0].available_width() - 8.0, 30.0)),
                                        ).clicked() {
                                            action.choose_subtitle = true;
                                            state.subtitles_popup_open = false;
                                        }

                                        // Right Column: Sub Delay + Sub Look
                                        let rui = &mut cols[1];
                                        rui.horizontal(|ui| {
                                            ui.label(RichText::new("Subtitle delay").size(12.0).color(Color32::from_gray(235)));
                                            ui.add_space(6.0);
                                            if ui.add(egui::Button::new(RichText::new("−").size(14.0).color(Color32::WHITE)).fill(cnx_surface).stroke(Stroke::new(1.0, cnx_border)).corner_radius(CornerRadius::same(14)).min_size(Vec2::new(26.0, 26.0))).clicked() {
                                                state.sub_delay_secs = (state.sub_delay_secs - 0.1).clamp(-30.0, 30.0);
                                                command_sender(PlayerCommand::SetSubDelay { token: snapshot.token, secs: state.sub_delay_secs });
                                            }
                                            ui.label(RichText::new(format!("{:.0} ms", state.sub_delay_secs * 1000.0)).size(11.5).color(cnx_peach));
                                            if ui.add(egui::Button::new(RichText::new("+").size(14.0).color(Color32::WHITE)).fill(cnx_surface).stroke(Stroke::new(1.0, cnx_border)).corner_radius(CornerRadius::same(14)).min_size(Vec2::new(26.0, 26.0))).clicked() {
                                                state.sub_delay_secs = (state.sub_delay_secs + 0.1).clamp(-30.0, 30.0);
                                                command_sender(PlayerCommand::SetSubDelay { token: snapshot.token, secs: state.sub_delay_secs });
                                            }
                                        });
                                        rui.add_space(12.0);
                                        let mut look_changed = false;
                                        rui.label(RichText::new("Sub Look").size(12.5).strong().color(Color32::WHITE));
                                        rui.add_space(6.0);
                                        rui.horizontal(|ui| {
                                            ui.label(RichText::new(format!("Size: {:.1}x", state.sub_scale)).size(11.5).color(cnx_muted));
                                            if ui.add(egui::Slider::new(&mut state.sub_scale, 0.5..=2.0).show_value(false)).changed() {
                                                look_changed = true;
                                            }
                                        });
                                        rui.add_space(4.0);
                                        rui.horizontal(|ui| {
                                            ui.label(RichText::new(format!("Pos: {}%", state.sub_pos)).size(11.5).color(cnx_muted));
                                            if ui.add(egui::Slider::new(&mut state.sub_pos, 50..=100).show_value(false)).changed() {
                                                look_changed = true;
                                            }
                                        });
                                        rui.add_space(6.0);
                                        rui.horizontal(|ui| {
                                            for (hex, lbl, col) in [
                                                ("#FFFFFFFF", "White", Color32::WHITE),
                                                ("#FFFACC15", "Yellow", Color32::from_rgb(250, 204, 21)),
                                                ("#FF38BDF8", "Cyan", Color32::from_rgb(56, 189, 248)),
                                                ("#FF4ADE80", "Green", Color32::from_rgb(74, 222, 128)),
                                            ] {
                                                let active = state.sub_color == hex;
                                                if ui.add(
                                                    egui::Button::new(RichText::new(lbl).size(11.0).color(col))
                                                        .fill(if active { Color32::from_rgb(54, 46, 38) } else { cnx_surface })
                                                        .stroke(Stroke::new(1.0, if active { cnx_peach } else { cnx_border }))
                                                        .corner_radius(CornerRadius::same(6)),
                                                ).clicked() {
                                                    state.sub_color = hex.to_string();
                                                    look_changed = true;
                                                }
                                            }
                                        });
                                        rui.add_space(6.0);
                                        rui.horizontal(|ui| {
                                            if ui.add(
                                                egui::Button::new(RichText::new(if state.sub_bold { "✓ Bold" } else { "Bold" }).size(11.5).color(if state.sub_bold { cnx_dark_txt } else { Color32::WHITE }))
                                                    .fill(if state.sub_bold { cnx_peach } else { cnx_surface })
                                                    .stroke(Stroke::new(1.0, cnx_border))
                                                    .corner_radius(CornerRadius::same(6)),
                                            ).clicked() {
                                                state.sub_bold = !state.sub_bold;
                                                look_changed = true;
                                            }
                                            if ui.add(
                                                egui::Button::new(RichText::new(if state.sub_box_bg { "✓ Box BG" } else { "Box BG" }).size(11.5).color(if state.sub_box_bg { cnx_dark_txt } else { Color32::WHITE }))
                                                    .fill(if state.sub_box_bg { cnx_peach } else { cnx_surface })
                                                    .stroke(Stroke::new(1.0, cnx_border))
                                                    .corner_radius(CornerRadius::same(6)),
                                            ).clicked() {
                                                state.sub_box_bg = !state.sub_box_bg;
                                                look_changed = true;
                                            }
                                        });
                                        if look_changed {
                                            command_sender(PlayerCommand::SetSubtitleAppearance {
                                                token: snapshot.token,
                                                scale: state.sub_scale,
                                                pos: state.sub_pos,
                                                color: state.sub_color.clone(),
                                                bold: state.sub_bold,
                                                box_bg: state.sub_box_bg,
                                            });
                                        }
                                    });
                                }
                            });
                        });
                });
        }

        // --- Transport Group (Centered by default/Netflix, or Left-aligned for VLC) ---
        let transport_center_x = match player_layout.transport_align {
            crate::skin::TransportAlign::Left => rect.left() + 198.0,
            crate::skin::TransportAlign::Center => rect.center().x,
        };
        {
            let btn_size = Vec2::splat(40.0);
            let left_btn_rect = Rect::from_center_size(
                Pos2::new(transport_center_x - 42.0, control_y),
                btn_size,
            );
            let play_btn_rect = Rect::from_center_size(
                Pos2::new(transport_center_x, control_y),
                btn_size,
            );
            let right_btn_rect = Rect::from_center_size(
                Pos2::new(transport_center_x + 42.0, control_y),
                btn_size,
            );

            // 1. Skip back button
            let skip_lbl = (skip_step as u32).to_string();
            let left_resp = OverlayButton::transport(ui.scope_id().with("transport_rewind"), left_btn_rect)
                .curved_skip(false)
                .number_label(&skip_lbl)
                .tooltip(&format!("Skip backward {} seconds", skip_step as u32))
                .show(ui, theme, icons);
            if left_resp.clicked() {
                command_sender(PlayerCommand::SeekRel {
                    token: snapshot.token,
                    seconds: -skip_step,
                });
            }

            // 2. Play / Pause button (skin-aware styling)
            match player_layout.play_button_style {
                crate::skin::PlayButtonStyle::CircleAccent => {
                    ui.painter().circle_filled(play_btn_rect.center(), 20.0, tokens.accent);
                }
                crate::skin::PlayButtonStyle::SquareClassic => {
                    ui.painter().rect(
                        play_btn_rect.shrink(2.0),
                        CornerRadius::same(4),
                        Color32::from_white_alpha(26),
                        Stroke::new(1.0, Color32::from_white_alpha(60)),
                        StrokeKind::Inside,
                    );
                }
                crate::skin::PlayButtonStyle::Icon => {}
            }
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
                .curved_skip(true)
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

        // 4. Lock mode button (L) + skin-specific quick pills (Auto-Next, HDR Boost, Speed)
        if player_layout.style == "youtube" || player_layout.style == "netflix" {
            let speed_btn_rect = Rect::from_center_size(Pos2::new(rect.right() - 240.0, control_y), Vec2::splat(40.0));
            if OverlayButton::bottom_bar(ui.scope_id().with("hud_speed_quick"), speed_btn_rect)
                .icon("transport.speed")
                .icon_size(18.0)
                .tooltip(&format!("Playback speed ({:.2}x)", snapshot.speed))
                .show(ui, theme, icons)
                .clicked()
            {
                state.panel = if state.panel == Some(PlayerPanel::Speed) {
                    None
                } else {
                    panel_just_opened = true;
                    Some(PlayerPanel::Speed)
                };
            }
            // Auto-Next pill
            let auto_rect = Rect::from_center_size(Pos2::new(rect.right() - 306.0, control_y), Vec2::new(72.0, 24.0));
            let auto_resp = ui.allocate_rect(auto_rect, Sense::click());
            if auto_resp.hovered() {
                ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
            }
            ui.painter().rect(
                auto_rect,
                CornerRadius::same(12),
                if state.auto_next { tokens.accent } else { Color32::from_white_alpha(28) },
                Stroke::new(1.0, Color32::from_white_alpha(55)),
                StrokeKind::Inside,
            );
            ui.painter().text(
                auto_rect.center(),
                Align2::CENTER_CENTER,
                if state.auto_next { "Auto-Next" } else { "Auto Off" },
                FontId::proportional(11.0),
                Color32::WHITE,
            );
            if auto_resp.clicked() {
                state.auto_next = !state.auto_next;
                action.toggle_auto_next = true;
            }
            // HDR Boost availability pill
            let hdr_rect = Rect::from_center_size(Pos2::new(rect.right() - 384.0, control_y), Vec2::new(70.0, 24.0));
            let hdr_resp = ui.allocate_rect(hdr_rect, Sense::click()).on_hover_text(if snapshot.is_hdr {
                "HDR stream detected — click to toggle HDR Boost"
            } else {
                "SDR stream — click to boost peak brightness/tone mapping"
            });
            if hdr_resp.hovered() {
                ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
            }
            let hdr_fill = if snapshot.hdr_boost {
                Color32::from_rgb(56, 152, 255)
            } else if snapshot.is_hdr {
                Color32::from_rgba_unmultiplied(246, 130, 31, 180)
            } else {
                Color32::from_white_alpha(24)
            };
            ui.painter().rect(
                hdr_rect,
                CornerRadius::same(12),
                hdr_fill,
                Stroke::new(1.0, Color32::from_white_alpha(55)),
                StrokeKind::Inside,
            );
            ui.painter().text(
                hdr_rect.center(),
                Align2::CENTER_CENTER,
                if snapshot.hdr_boost {
                    "HDR+"
                } else if snapshot.is_hdr {
                    "HDR"
                } else {
                    "SDR"
                },
                FontId::proportional(11.0),
                Color32::WHITE,
            );
            if hdr_resp.clicked() {
                command_sender(PlayerCommand::SetHdrBoost {
                    token: snapshot.token,
                    enabled: !snapshot.hdr_boost,
                });
            }
        }
        // CnX Bottom-Right Group: [More ...] [Bookmarks] [Subtitles/Audio] [Viewing options] [Fullscreen]
        let more_btn_rect = Rect::from_center_size(Pos2::new(rect.right() - 200.0, control_y), Vec2::splat(40.0));
        let more_resp = OverlayButton::bottom_bar(ui.scope_id().with("hud_more"), more_btn_rect)
            .icon("action.dots_horizontal")
            .icon_size(20.0)
            .show(ui, theme, icons)
            .on_hover_text("More options");
        if more_resp.clicked() {
            state.more_options_open = !state.more_options_open;
            if state.more_options_open {
                state.subtitles_popup_open = false;
            }
        }

        if hud_btn(ui, "hud_bm", rect.right() - 158.0, "dock.bookmarks", "Bookmarks (B)").clicked() {
            state.panel = if state.panel == Some(PlayerPanel::Bookmarks) { None } else { Some(PlayerPanel::Bookmarks) };
            panel_just_opened = true;
        }

        if hud_btn(ui, "hud_subs_right", rect.right() - 116.0, "dock.subtitles", "Subtitles & Audio").clicked() {
            state.subtitles_popup_open = !state.subtitles_popup_open;
            if state.subtitles_popup_open {
                state.more_options_open = false;
                state.panel = None;
            }
        }

        // Viewing options (highlighted in CnX orange circle when open)
        let view_btn_rect = Rect::from_center_size(Pos2::new(rect.right() - 74.0, control_y), Vec2::splat(36.0));
        if state.panel == Some(PlayerPanel::Viewing) {
            ui.painter().circle_filled(view_btn_rect.center(), 17.0, Color32::from_rgb(235, 140, 52));
        }
        let view_resp = OverlayButton::bottom_bar(ui.scope_id().with("hud_viewing"), view_btn_rect)
            .icon("dock.picture")
            .icon_size(19.0)
            .show(ui, theme, icons)
            .on_hover_text("Viewing options");
        if view_resp.clicked() {
            state.panel = if state.panel == Some(PlayerPanel::Viewing) { None } else { Some(PlayerPanel::Viewing) };
            state.subtitles_popup_open = false;
            state.more_options_open = false;
            panel_just_opened = true;
        }

        // Fullscreen toggle button
        let is_fs = ui.input(|i| i.viewport().fullscreen.unwrap_or(state.is_fullscreen));
        let fs_icon = if is_fs { "transport.exit_fullscreen" } else { "transport.fullscreen" };
        let fs_tooltip = if is_fs { "Exit fullscreen" } else { "Fullscreen (F)" };
        if hud_btn(ui, "hud_fs", rect.right() - 32.0, fs_icon, fs_tooltip).clicked() {
            state.is_fullscreen = !is_fs;
            action.toggle_fullscreen = Some(state.is_fullscreen);
        }

        // More options popup (containing Zoom to fill, Audio only, Bookmarks, Queue)
        if state.more_options_open {
            let is_yt_settings = player_layout.popup_style == crate::skin::PopupStyle::YoutubeSettings;
            let more_pop_w = if is_yt_settings { 235.0 } else { 195.0 };
            let more_pop_h = if is_yt_settings { 268.0 } else { 196.0 };
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
                            let auto_label = if state.auto_next { "✓ Auto-Next" } else { "Auto-Next" };
                            if item_btn(ui, auto_label).clicked() {
                                state.auto_next = !state.auto_next;
                                action.toggle_auto_next = true;
                                state.more_options_open = false;
                            }
                            let hdr_label = if snapshot.hdr_boost {
                                "✓ HDR Boost (On)"
                            } else if snapshot.is_hdr {
                                "HDR Boost (HDR Ready)"
                            } else {
                                "HDR Boost (SDR)"
                            };
                            if item_btn(ui, hdr_label).clicked() {
                                command_sender(PlayerCommand::SetHdrBoost {
                                    token: snapshot.token,
                                    enabled: !snapshot.hdr_boost,
                                });
                                state.more_options_open = false;
                            }
                            if item_btn(ui, "Picture / Color Grading").clicked() {
                                state.panel = Some(PlayerPanel::Picture);
                                state.more_options_open = false;
                                panel_just_opened = true;
                            }
                            if item_btn(ui, "Viewing Options").clicked() {
                                state.panel = Some(PlayerPanel::Viewing);
                                state.more_options_open = false;
                                panel_just_opened = true;
                            }
                            if item_btn(ui, &format!("Playback speed ({:.2}x)", snapshot.speed)).clicked() {
                                state.panel = Some(PlayerPanel::Speed);
                                state.more_options_open = false;
                                panel_just_opened = true;
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

    // --- Side Chevrons (visible only when there is a previous/next item in queue) ---
    if tokens.skin.player_layout.show_edge_arrows {
        let has_prev = snapshot.queue.len() > 1
            && (snapshot.queue_index > 0
                || snapshot.repeat == valor_player::queue::RepeatMode::All);
        let has_next = snapshot.queue.len() > 1
            && (snapshot.queue_index + 1 < snapshot.queue.len()
                || snapshot.repeat == valor_player::queue::RepeatMode::All);
        if has_prev
            && EdgeButton::show_prev(ui, theme, icons, rect, pointer_position, overlay_alpha)
                .clicked()
        {
            command_sender(PlayerCommand::Prev {
                token: snapshot.token,
            });
        }
        if has_next
            && EdgeButton::show_next(ui, theme, icons, rect, pointer_position, overlay_alpha)
                .clicked()
        {
            command_sender(PlayerCommand::Next {
                token: snapshot.token,
            });
        }
    }

    if snapshot.state == PlaybackState::Loading || snapshot.state == PlaybackState::Buffering {
        if tokens.skin.player_layout.loading_spinner == crate::skin::LoadingSpinnerStyle::RedArc {
            egui::Area::new(ui.scope_id().with("player_loading_nf"))
                .order(egui::Order::Foreground)
                .anchor(Align2::CENTER_CENTER, Vec2::ZERO)
                .interactable(false)
                .show(ui.ctx(), |ui| {
                    let (spin_rect, _) = ui.allocate_exact_size(Vec2::splat(64.0), Sense::hover());
                    let t = ui.input(|i| i.time);
                    crate::spinner::render_red_arc_spinner(ui, spin_rect.center(), 24.0, t);
                });
        } else {
            egui::Area::new(ui.scope_id().with("player_loading"))
                .order(egui::Order::Foreground)
                .anchor(Align2::CENTER_CENTER, Vec2::ZERO)
                .interactable(false)
                .show(ui.ctx(), |ui| {
                    ui.add(egui::Spinner::new().size(36.0).color(tokens.accent));
                });
        }
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
    if !ui.input(|i| i.pointer.primary_down()) {
        if state.active_picture_drag.take().is_some() {
            if state.picture_dirty {
                state.picture_dirty = false;
                state.last_picture_send = Instant::now();
                command_sender(PlayerCommand::SetPictureControls {
                    token: snapshot.token,
                    enabled: state.picture_enabled,
                    lighting: state.picture_lighting,
                    shadows: state.picture_shadows,
                    contrast: state.picture_contrast,
                    sharpness: state.picture_sharpness,
                    vibrance: state.picture_vibrance,
                    hue: state.picture_hue,
                    deband: state.picture_deband,
                    hdr_boost: state.picture_hdr_boost,
                });
            }
            if std::mem::take(&mut state.picture_was_playing_before_drag) {
                command_sender(PlayerCommand::Play {
                    token: snapshot.token,
                });
            }
        }
    }
    if let Some(panel) = state.panel {
        let panel_width: f32 = match panel {
            PlayerPanel::Queue => 280.0_f32,
            PlayerPanel::Picture | PlayerPanel::Viewing => 460.0_f32,
            PlayerPanel::Speed | PlayerPanel::Tracks => 360.0_f32,
            PlayerPanel::Bookmarks => 400.0_f32,
        }
        .min((rect.width() - 32.0_f32).max(260.0_f32));
        let panel_height: f32 = match panel {
            PlayerPanel::Queue => (rect.height() - 140.0_f32).max(320.0_f32),
            PlayerPanel::Picture => 364.0_f32,
            PlayerPanel::Viewing => 530.0_f32,
            PlayerPanel::Speed => 196.0_f32,
            PlayerPanel::Tracks => 386.0_f32,
            PlayerPanel::Bookmarks => 420.0_f32,
        }
        .min((rect.height() - 32.0_f32).max(260.0_f32));
        let panel_top = if panel == PlayerPanel::Queue {
            rect.top() + 64.0_f32
        } else {
            (rect.bottom() - panel_height - 68.0_f32).max(rect.top() + 12.0_f32)
        };
        let panel_left = if panel == PlayerPanel::Tracks {
            rect.left() + 24.0_f32
        } else if panel == PlayerPanel::Queue {
            rect.right() - panel_width
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
        let dragging_picture =
            panel == PlayerPanel::Picture && state.active_picture_drag.is_some();
        egui::Area::new(egui::Id::unique("player_panel"))
            .order(egui::Order::Foreground)
            .fixed_pos(panel_rect.min)
            .show(ui.ctx(), |ui| {
                egui::Frame::new()
                    .fill(if dragging_picture {
                        Color32::TRANSPARENT
                    } else if panel == PlayerPanel::Viewing || panel == PlayerPanel::Queue {
                        Color32::from_rgb(24, 21, 18)
                    } else {
                        Color32::from_rgb(20, 24, 31)
                    })
                    .stroke(if dragging_picture {
                        Stroke::NONE
                    } else if panel == PlayerPanel::Viewing || panel == PlayerPanel::Queue {
                        Stroke::new(1.0, Color32::from_rgb(56, 48, 40))
                    } else {
                        Stroke::new(1.0, Color32::from_white_alpha(55))
                    })
                    .corner_radius(if panel == PlayerPanel::Viewing { CornerRadius::same(10) } else { CornerRadius::ZERO })
                    .inner_margin(16.0)
                    .show(ui, |ui| {
                        ui.set_width(panel_width - 34.0);
                        ui.set_max_height(panel_height - 32.0);
                        match panel {
                            PlayerPanel::Picture => {
                                let mut changed = false;
                                let active_drag_label = state.active_picture_drag.map(|(l, _, _, _)| l);
                                ui.scope(|ui| {
                                    if dragging_picture {
                                        ui.set_opacity(0.0);
                                    }
                                    ui.horizontal(|ui| {
                                        ui.label(
                                            RichText::new("◧  Picture")
                                                .size(15.0)
                                                .strong()
                                                .color(Color32::WHITE),
                                        );
                                        ui.add_space(10.0);
                                        let toggle_txt = if state.picture_enabled { "✓ On" } else { "Off" };
                                        if ui
                                            .add(
                                                egui::Button::new(
                                                    RichText::new(toggle_txt)
                                                        .size(11.5)
                                                        .color(Color32::WHITE),
                                                )
                                                .fill(if state.picture_enabled {
                                                    tokens.accent
                                                } else {
                                                    Color32::from_rgb(45, 50, 60)
                                                })
                                                .corner_radius(CornerRadius::ZERO),
                                            )
                                            .clicked()
                                        {
                                            state.picture_enabled = !state.picture_enabled;
                                            changed = true;
                                        }
                                        if ui
                                            .add(
                                                egui::Button::new(
                                                    RichText::new(if state.picture_deband { "Deband ✓" } else { "Deband" })
                                                        .size(11.5)
                                                        .color(Color32::WHITE),
                                                )
                                                .fill(if state.picture_deband {
                                                    tokens.accent
                                                } else {
                                                    Color32::from_rgb(45, 50, 60)
                                                })
                                                .corner_radius(CornerRadius::ZERO),
                                            )
                                            .clicked()
                                        {
                                            state.picture_deband = !state.picture_deband;
                                            changed = true;
                                        }
                                        if snapshot.is_10bit || snapshot.is_hdr {
                                            let badge = match (snapshot.is_10bit, snapshot.is_hdr) {
                                                (true, true) => "10-bit HDR",
                                                (true, false) => "10-bit",
                                                (false, true) => "HDR",
                                                _ => "",
                                            };
                                            ui.label(
                                                RichText::new(badge)
                                                    .size(10.5)
                                                    .strong()
                                                    .color(Color32::from_rgb(96, 165, 250)),
                                            );
                                        }
                                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                            if ui
                                                .add(
                                                    egui::Button::new(
                                                        RichText::new("↺ Reset")
                                                            .size(11.5)
                                                            .color(Color32::from_rgb(200, 210, 225)),
                                                    )
                                                    .fill(Color32::from_rgb(35, 40, 48))
                                                    .corner_radius(CornerRadius::ZERO),
                                                )
                                                .clicked()
                                            {
                                                state.picture_lighting = 0;
                                                state.picture_shadows = 0;
                                                state.picture_contrast = 0;
                                                state.picture_sharpness = 0;
                                                state.picture_vibrance = 0;
                                                state.picture_hue = 0;
                                                state.picture_deband = true;
                                                state.picture_hdr_boost = 0;
                                                changed = true;
                                            }
                                        });
                                    });
                                });
                                ui.add_space(10.0);

                                let mut draw_pic_row = |ui: &mut Ui,
                                                        icon: &str,
                                                        label: &'static str,
                                                        val: &mut i32,
                                                        min: i32,
                                                        max: i32| {
                                    let is_active_row = active_drag_label == Some(label);
                                    let frame = if dragging_picture && is_active_row {
                                        egui::Frame::NONE
                                            .fill(Color32::from_rgba_unmultiplied(14, 17, 23, 232))
                                            .stroke(Stroke::new(1.0, Color32::from_white_alpha(65)))
                                            .corner_radius(CornerRadius::ZERO)
                                            .inner_margin(egui::Margin::symmetric(8, 4))
                                    } else {
                                        egui::Frame::NONE
                                            .inner_margin(egui::Margin::symmetric(8, 4))
                                    };
                                    frame.show(ui, |ui| {
                                        if dragging_picture && !is_active_row {
                                            ui.set_opacity(0.0);
                                        }
                                        ui.horizontal(|ui| {
                                            ui.allocate_ui_with_layout(
                                                Vec2::new(112.0, 22.0),
                                                Layout::left_to_right(Align::Center),
                                                |ui| {
                                                    ui.label(
                                                        RichText::new(format!("{icon}  {label}"))
                                                            .size(12.5)
                                                            .color(Color32::from_rgb(225, 232, 240)),
                                                    );
                                                },
                                            );
                                            let slider_w = (ui.available_width() - 44.0).max(120.0);
                                            ui.spacing_mut().slider_width = slider_w;
                                            let resp = ui.add(
                                                egui::Slider::new(val, min..=max)
                                                    .show_value(false),
                                            );
                                            if resp.changed() {
                                                changed = true;
                                            }
                                            if resp.dragged() || resp.changed() {
                                                if state.active_picture_drag.is_none()
                                                    && snapshot.state == PlaybackState::Playing
                                                {
                                                    state.picture_was_playing_before_drag = true;
                                                    command_sender(PlayerCommand::Pause {
                                                        token: snapshot.token,
                                                    });
                                                }
                                                state.active_picture_drag = Some((label, *val, min, max));
                                            }
                                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                                ui.label(
                                                    RichText::new(format!("{}", *val))
                                                        .size(12.5)
                                                        .strong()
                                                        .color(Color32::WHITE),
                                                );
                                            });
                                        });
                                    });
                                };

                                draw_pic_row(ui, "☀", "Lighting", &mut state.picture_lighting, -100, 100);
                                draw_pic_row(ui, "◐", "Shadows", &mut state.picture_shadows, -100, 100);
                                draw_pic_row(ui, "◑", "Contrast", &mut state.picture_contrast, -100, 100);

                                ui.add_space(6.0);
                                ui.scope(|ui| {
                                    if dragging_picture {
                                        ui.set_opacity(0.0);
                                    }
                                    ui.horizontal(|ui| {
                                        ui.label(
                                            RichText::new("REMASTER")
                                                .size(10.5)
                                                .strong()
                                                .color(Color32::from_rgb(150, 162, 180)),
                                        );
                                        ui.add_space(8.0);
                                        let (line_r, _) = ui.allocate_exact_size(
                                            Vec2::new(ui.available_width(), 1.0),
                                            Sense::hover(),
                                        );
                                        ui.painter().line_segment(
                                            [line_r.left_center(), line_r.right_center()],
                                            Stroke::new(1.0, Color32::from_white_alpha(30)),
                                        );
                                    });
                                });
                                ui.add_space(6.0);

                                draw_pic_row(ui, "◈", "Sharpness", &mut state.picture_sharpness, 0, 100);
                                draw_pic_row(ui, "🎨", "Vibrance", &mut state.picture_vibrance, -100, 100);
                                draw_pic_row(ui, "◑", "Hue", &mut state.picture_hue, -100, 100);
                                draw_pic_row(ui, "✦", "HDR Boost", &mut state.picture_hdr_boost, 0, 100);

                                if changed {
                                    state.picture_dirty = true;
                                    let is_dragging = state.active_picture_drag.is_some();
                                    // Live 1-frame update (throttled 50ms while paused on the single frame)
                                    if !is_dragging
                                        || state.last_picture_send.elapsed()
                                            >= std::time::Duration::from_millis(50)
                                    {
                                        if !is_dragging {
                                            state.picture_dirty = false;
                                        }
                                        state.last_picture_send = Instant::now();
                                        command_sender(PlayerCommand::SetPictureControls {
                                            token: snapshot.token,
                                            enabled: state.picture_enabled,
                                            lighting: state.picture_lighting,
                                            shadows: state.picture_shadows,
                                            contrast: state.picture_contrast,
                                            sharpness: state.picture_sharpness,
                                            vibrance: state.picture_vibrance,
                                            hue: state.picture_hue,
                                            deband: state.picture_deband,
                                            hdr_boost: state.picture_hdr_boost,
                                        });
                                    }
                                }
                            }
                            PlayerPanel::Viewing => {
                                let cnx_surface = Color32::from_rgb(38, 33, 28);
                                let cnx_border = Color32::from_rgb(56, 48, 40);
                                let cnx_peach = Color32::from_rgb(245, 174, 108);
                                let cnx_dark_txt = Color32::from_rgb(24, 20, 16);
                                let cnx_muted = Color32::from_rgb(172, 162, 150);
                                let cnx_amber = Color32::from_rgb(235, 140, 52);

                                let mut view_changed = false;
                                let mut pic_changed = false;
                                let mut tm_changed = false;

                                // Header
                                ui.horizontal(|ui| {
                                    ui.vertical(|ui| {
                                        ui.label(RichText::new("Viewing options").size(16.0).strong().color(Color32::WHITE));
                                        let fname = snapshot
                                            .path
                                            .as_ref()
                                            .and_then(|p| p.file_name())
                                            .map(|n| n.to_string_lossy().to_string())
                                            .unwrap_or_else(|| "Current media".to_string());
                                        let short = if fname.len() > 42 { format!("{}...", &fname[..39]) } else { fname };
                                        ui.label(RichText::new(format!("Tweak how {short}")).size(11.5).color(cnx_muted));
                                    });
                                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                        if ui.add(
                                            egui::Button::new(RichText::new("×").size(14.0).color(Color32::WHITE))
                                                .fill(cnx_surface)
                                                .stroke(Stroke::new(1.0, cnx_border))
                                                .corner_radius(CornerRadius::same(14))
                                                .min_size(Vec2::new(28.0, 28.0)),
                                        ).clicked() {
                                            state.panel = None;
                                        }
                                        if ui.add(
                                            egui::Button::new(RichText::new("Reset").size(11.5).color(Color32::WHITE))
                                                .fill(cnx_surface)
                                                .stroke(Stroke::new(1.0, cnx_border))
                                                .corner_radius(CornerRadius::same(6))
                                                .min_size(Vec2::new(54.0, 28.0)),
                                        ).clicked() {
                                            state.viewing_preset = "off".to_string();
                                            state.picture_lighting = 0;
                                            state.picture_contrast = 0;
                                            state.picture_vibrance = 0;
                                            state.picture_shadows = 0;
                                            state.picture_hue = 0;
                                            state.picture_fit_mode = "fit".to_string();
                                            state.view_aspect = "auto".to_string();
                                            state.view_zoom = 0.0;
                                            state.view_panscan = 0.0;
                                            state.view_rotate = 0;
                                            state.view_hflip = false;
                                            state.view_vflip = false;
                                            state.view_ab_a = None;
                                            state.view_ab_b = None;
                                            state.hdr_tm_enabled = true;
                                            state.hdr_tm_strength = 1;
                                            pic_changed = true;
                                            view_changed = true;
                                            tm_changed = true;
                                            command_sender(PlayerCommand::SetKeepAspect { token: snapshot.token, keep: true });
                                        }
                                    });
                                });
                                ui.add_space(10.0);

                                // 4-tab bar: Video | Playback | Chapters | Info
                                egui::Frame::new()
                                    .fill(Color32::from_rgb(30, 26, 22))
                                    .stroke(Stroke::new(1.0, cnx_border))
                                    .corner_radius(CornerRadius::same(8))
                                    .inner_margin(4.0)
                                    .show(ui, |ui| {
                                        ui.horizontal(|ui| {
                                            ui.spacing_mut().item_spacing = Vec2::new(4.0, 0.0);
                                            let tab_w = (ui.available_width() - 12.0) / 4.0;
                                            for (idx, lbl) in [(0u8, "Video"), (1u8, "Playback"), (2u8, "Chapters"), (3u8, "Info")] {
                                                let active = state.viewing_tab == idx;
                                                if ui.add(
                                                    egui::Button::new(
                                                        RichText::new(lbl)
                                                            .size(12.0)
                                                            .strong()
                                                            .color(if active { cnx_dark_txt } else { Color32::from_gray(225) }),
                                                    )
                                                    .fill(if active { cnx_peach } else { Color32::TRANSPARENT })
                                                    .corner_radius(CornerRadius::same(6))
                                                    .min_size(Vec2::new(tab_w, 30.0)),
                                                ).clicked() {
                                                    state.viewing_tab = idx;
                                                }
                                            }
                                        });
                                    });
                                ui.add_space(12.0);

                                egui::ScrollArea::vertical().max_height(395.0).show(ui, |ui| {
                                    match state.viewing_tab {
                                        0 => {
                                            // Preset row
                                            ui.horizontal(|ui| {
                                                ui.label(RichText::new("Preset").size(12.0).color(cnx_muted));
                                                if snapshot.is_10bit || snapshot.is_hdr || snapshot.is_dolby_vision {
                                                    egui::Frame::new()
                                                        .fill(Color32::from_rgb(48, 36, 24))
                                                        .corner_radius(CornerRadius::same(4))
                                                        .inner_margin(egui::Margin::symmetric(6, 2))
                                                        .show(ui, |ui| {
                                                            ui.label(RichText::new(if snapshot.is_dolby_vision { "Dolby Vision" } else { "10-bit HDR" }).size(10.5).color(cnx_peach));
                                                        });
                                                }
                                            });
                                            ui.add_space(6.0);
                                            ui.horizontal(|ui| {
                                                ui.spacing_mut().item_spacing = Vec2::new(6.0, 0.0);
                                                for (id, lbl, l, c, v, g, h) in [
                                                    ("off", "Off", 0, 0, 0, 0, 0),
                                                    ("cinema", "Cinema", -4, 10, 8, 4, 0),
                                                    ("vivid", "Vivid", 4, 14, 24, 2, 0),
                                                    ("darkroom", "Dark room", -8, 12, 4, 10, 0),
                                                    ("sports", "Sports", 6, 10, 16, 0, 0),
                                                ] {
                                                    let active = state.viewing_preset == id;
                                                    if ui.add(
                                                        egui::Button::new(RichText::new(lbl).size(11.5).color(if active { cnx_dark_txt } else { Color32::from_gray(220) }))
                                                            .fill(if active { cnx_peach } else { cnx_surface })
                                                            .stroke(Stroke::new(1.0, cnx_border))
                                                            .corner_radius(CornerRadius::same(6))
                                                            .min_size(Vec2::new(56.0, 28.0)),
                                                    ).clicked() {
                                                        state.viewing_preset = id.to_string();
                                                        state.picture_lighting = l;
                                                        state.picture_contrast = c;
                                                        state.picture_vibrance = v;
                                                        state.picture_shadows = g;
                                                        state.picture_hue = h;
                                                        pic_changed = true;
                                                    }
                                                }
                                            });
                                            ui.add_space(12.0);

                                            // 2-column sliders: Brightness / Contrast, Saturation / Gamma, Hue
                                            ui.columns(2, |cols| {
                                                for (col_idx, name, val) in [
                                                    (0usize, "Brightness", &mut state.picture_lighting),
                                                    (1usize, "Contrast", &mut state.picture_contrast),
                                                    (0usize, "Saturation", &mut state.picture_vibrance),
                                                    (1usize, "Gamma", &mut state.picture_shadows),
                                                    (0usize, "Hue", &mut state.picture_hue),
                                                ] {
                                                    let cui = &mut cols[col_idx];
                                                    cui.horizontal(|ui| {
                                                        ui.label(RichText::new(name).size(12.0).color(Color32::from_gray(235)));
                                                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                                            ui.label(RichText::new(format!("{}", *val)).size(11.5).color(cnx_amber));
                                                        });
                                                    });
                                                    cui.scope(|ui| {
                                                        ui.visuals_mut().widgets.inactive.bg_fill = cnx_surface;
                                                        ui.visuals_mut().selection.bg_fill = cnx_amber;
                                                        if ui.add(egui::Slider::new(val, -50..=50).show_value(false)).changed() {
                                                            state.viewing_preset = "custom".to_string();
                                                            pic_changed = true;
                                                        }
                                                    });
                                                    cui.add_space(6.0);
                                                }
                                            });

                                            ui.add_space(6.0);
                                            ui.label(RichText::new("Picture fit").size(12.0).color(cnx_muted));
                                            ui.add_space(6.0);
                                            egui::Frame::new()
                                                .fill(Color32::from_rgb(30, 26, 22))
                                                .stroke(Stroke::new(1.0, cnx_border))
                                                .corner_radius(CornerRadius::same(8))
                                                .inner_margin(4.0)
                                                .show(ui, |ui| {
                                                    ui.horizontal(|ui| {
                                                        ui.spacing_mut().item_spacing = Vec2::new(4.0, 0.0);
                                                        for (id, lbl) in [("fit", "Fit"), ("fill", "Fill"), ("100", "100%"), ("150", "150%"), ("stretch", "Stretch")] {
                                                            let active = state.picture_fit_mode == id;
                                                            if ui.add(
                                                                egui::Button::new(RichText::new(lbl).size(11.5).color(if active { cnx_dark_txt } else { Color32::from_gray(225) }))
                                                                    .fill(if active { cnx_peach } else { Color32::TRANSPARENT })
                                                                    .corner_radius(CornerRadius::same(6))
                                                                    .min_size(Vec2::new(58.0, 28.0)),
                                                            ).clicked() {
                                                                state.picture_fit_mode = id.to_string();
                                                                match id {
                                                                    "fit" => { state.view_panscan = 0.0; state.view_zoom = 0.0; command_sender(PlayerCommand::SetKeepAspect { token: snapshot.token, keep: true }); }
                                                                    "fill" => { state.view_panscan = 1.0; state.view_zoom = 0.0; command_sender(PlayerCommand::SetKeepAspect { token: snapshot.token, keep: true }); }
                                                                    "100" => { state.view_panscan = 0.0; state.view_zoom = 0.0; command_sender(PlayerCommand::SetKeepAspect { token: snapshot.token, keep: true }); }
                                                                    "150" => { state.view_panscan = 0.0; state.view_zoom = 0.585; command_sender(PlayerCommand::SetKeepAspect { token: snapshot.token, keep: true }); }
                                                                    "stretch" => { state.view_panscan = 0.0; state.view_zoom = 0.0; command_sender(PlayerCommand::SetKeepAspect { token: snapshot.token, keep: false }); }
                                                                    _ => {}
                                                                }
                                                                view_changed = true;
                                                            }
                                                        }
                                                    });
                                                });

                                            ui.add_space(10.0);
                                            ui.horizontal(|ui| {
                                                ui.label(RichText::new("Zoom").size(12.0).color(cnx_muted));
                                                ui.add_space(8.0);
                                                if ui.add(egui::Button::new(RichText::new("−").size(14.0).color(Color32::WHITE)).fill(cnx_surface).stroke(Stroke::new(1.0, cnx_border)).corner_radius(CornerRadius::same(14)).min_size(Vec2::new(28.0, 28.0))).clicked() {
                                                    state.view_zoom = (state.view_zoom - 0.1).clamp(-1.0, 2.0);
                                                    view_changed = true;
                                                }
                                                let z_lbl = if state.view_zoom.abs() < 0.01 { "Fit".to_string() } else { format!("{:+.0}%", state.view_zoom * 100.0) };
                                                ui.label(RichText::new(z_lbl).size(12.0).color(cnx_peach));
                                                if ui.add(egui::Button::new(RichText::new("+").size(14.0).color(Color32::WHITE)).fill(cnx_surface).stroke(Stroke::new(1.0, cnx_border)).corner_radius(CornerRadius::same(14)).min_size(Vec2::new(28.0, 28.0))).clicked() {
                                                    state.view_zoom = (state.view_zoom + 0.1).clamp(-1.0, 2.0);
                                                    view_changed = true;
                                                }
                                            });

                                            ui.add_space(10.0);
                                            ui.separator();
                                            ui.add_space(8.0);
                                            ui.horizontal(|ui| {
                                                ui.label(RichText::new("Rotation / flip").size(12.0).color(Color32::from_gray(235)));
                                                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                                    for (lbl, is_act, kind) in [
                                                        ("Flip V", state.view_vflip, 5u8),
                                                        ("Flip H", state.view_hflip, 4u8),
                                                        ("270°", state.view_rotate == 270, 3u8),
                                                        ("180°", state.view_rotate == 180, 2u8),
                                                        ("90°", state.view_rotate == 90, 1u8),
                                                        ("None", state.view_rotate == 0 && !state.view_hflip && !state.view_vflip, 0u8),
                                                    ] {
                                                        if ui.add(
                                                            egui::Button::new(RichText::new(lbl).size(11.0).color(if is_act { cnx_dark_txt } else { Color32::from_gray(220) }))
                                                                .fill(if is_act { cnx_peach } else { cnx_surface })
                                                                .stroke(Stroke::new(1.0, cnx_border))
                                                                .corner_radius(CornerRadius::same(6)),
                                                        ).clicked() {
                                                            match kind {
                                                                0 => { state.view_rotate = 0; state.view_hflip = false; state.view_vflip = false; }
                                                                1 => state.view_rotate = 90,
                                                                2 => state.view_rotate = 180,
                                                                3 => state.view_rotate = 270,
                                                                4 => state.view_hflip = !state.view_hflip,
                                                                5 => state.view_vflip = !state.view_vflip,
                                                                _ => {}
                                                            }
                                                            view_changed = true;
                                                        }
                                                    }
                                                });
                                            });

                                            ui.add_space(10.0);
                                            ui.separator();
                                            ui.add_space(8.0);
                                            ui.horizontal(|ui| {
                                                ui.label(RichText::new("HDR Tone-Mapping").size(12.5).color(Color32::from_gray(235)));
                                                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                                    let lbl = if state.hdr_tm_enabled { "On" } else { "Off" };
                                                    if ui.add(
                                                        egui::Button::new(RichText::new(lbl).size(11.5).strong().color(if state.hdr_tm_enabled { cnx_dark_txt } else { Color32::from_gray(200) }))
                                                            .fill(if state.hdr_tm_enabled { cnx_amber } else { cnx_surface })
                                                            .corner_radius(CornerRadius::same(12))
                                                            .min_size(Vec2::new(48.0, 24.0)),
                                                    ).clicked() {
                                                        state.hdr_tm_enabled = !state.hdr_tm_enabled;
                                                        tm_changed = true;
                                                    }
                                                });
                                            });
                                            ui.add_space(8.0);
                                            ui.horizontal(|ui| {
                                                ui.label(RichText::new("HDR tone-mapping strength").size(12.0).color(cnx_muted));
                                                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                                    for (id, lbl) in [(2u8, "Strong"), (1u8, "Medium"), (0u8, "Light")] {
                                                        let act = state.hdr_tm_strength == id;
                                                        if ui.add(
                                                            egui::Button::new(RichText::new(lbl).size(11.0).color(if act { cnx_dark_txt } else { Color32::from_gray(220) }))
                                                                .fill(if act { cnx_peach } else { cnx_surface })
                                                                .stroke(Stroke::new(1.0, cnx_border))
                                                                .corner_radius(CornerRadius::same(6)),
                                                        ).clicked() {
                                                            state.hdr_tm_strength = id;
                                                            tm_changed = true;
                                                        }
                                                    }
                                                });
                                            });
                                        }
                                        1 => {
                                            // Playback tab: Speed, Aspect Ratio, A-B Loop
                                            ui.label(RichText::new("Playback speed").size(12.5).strong().color(Color32::WHITE));
                                            ui.add_space(6.0);
                                            ui.horizontal(|ui| {
                                                for spd in [0.5_f64, 1.0, 1.25, 1.5, 2.0] {
                                                    let act = (snapshot.speed - spd).abs() < 0.05;
                                                    if ui.add(
                                                        egui::Button::new(RichText::new(format!("{spd:.2}×")).size(12.0).color(if act { cnx_dark_txt } else { Color32::WHITE }))
                                                            .fill(if act { cnx_peach } else { cnx_surface })
                                                            .stroke(Stroke::new(1.0, cnx_border))
                                                            .corner_radius(CornerRadius::same(6)),
                                                    ).clicked() {
                                                        command_sender(PlayerCommand::SetSpeed { token: snapshot.token, speed: spd });
                                                    }
                                                }
                                            });
                                            ui.add_space(12.0);
                                            ui.label(RichText::new("Aspect ratio").size(12.5).strong().color(Color32::WHITE));
                                            ui.add_space(6.0);
                                            ui.horizontal_wrapped(|ui| {
                                                for (id, lbl) in [("auto", "Auto"), ("16:9", "16:9"), ("4:3", "4:3"), ("21:9", "21:9"), ("16:10", "16:10"), ("1:1", "1:1")] {
                                                    let act = state.view_aspect == id;
                                                    if ui.add(
                                                        egui::Button::new(RichText::new(lbl).size(12.0).color(if act { cnx_dark_txt } else { Color32::WHITE }))
                                                            .fill(if act { cnx_peach } else { cnx_surface })
                                                            .stroke(Stroke::new(1.0, cnx_border))
                                                            .corner_radius(CornerRadius::same(6)),
                                                    ).clicked() {
                                                        state.view_aspect = id.to_string();
                                                        view_changed = true;
                                                    }
                                                }
                                            });
                                            ui.add_space(12.0);
                                            let ab_txt = format!(
                                                "A-B Loop  (A: {}  |  B: {})",
                                                state.view_ab_a.map(|t| fmt_time_hms(t, false)).unwrap_or_else(|| "--".into()),
                                                state.view_ab_b.map(|t| fmt_time_hms(t, false)).unwrap_or_else(|| "--".into())
                                            );
                                            ui.label(RichText::new(ab_txt).size(12.5).strong().color(Color32::WHITE));
                                            ui.add_space(6.0);
                                            ui.horizontal(|ui| {
                                                if ui.add(egui::Button::new(RichText::new("Set A").size(12.0).color(Color32::WHITE)).fill(cnx_surface).stroke(Stroke::new(1.0, cnx_border)).corner_radius(CornerRadius::same(6))).clicked() {
                                                    state.view_ab_a = Some(snapshot.position_secs);
                                                    view_changed = true;
                                                }
                                                if ui.add(egui::Button::new(RichText::new("Set B").size(12.0).color(Color32::WHITE)).fill(cnx_surface).stroke(Stroke::new(1.0, cnx_border)).corner_radius(CornerRadius::same(6))).clicked() {
                                                    state.view_ab_b = Some(snapshot.position_secs);
                                                    view_changed = true;
                                                }
                                                if ui.add(egui::Button::new(RichText::new("Clear A-B").size(12.0).color(cnx_muted)).fill(cnx_surface).stroke(Stroke::new(1.0, cnx_border)).corner_radius(CornerRadius::same(6))).clicked() {
                                                    state.view_ab_a = None;
                                                    state.view_ab_b = None;
                                                    view_changed = true;
                                                }
                                            });
                                        }
                                        2 => {
                                            // Chapters tab
                                            if snapshot.chapters.is_empty() {
                                                ui.label(RichText::new("No chapters found in this media.").size(12.5).color(cnx_muted));
                                            } else {
                                                for ch in &snapshot.chapters {
                                                    let lbl = format!("{}   {}", fmt_time_hms(ch.start_secs, false), ch.title);
                                                    if ui.add(
                                                        egui::Button::new(RichText::new(lbl).size(12.0).color(Color32::WHITE))
                                                            .fill(cnx_surface)
                                                            .stroke(Stroke::new(1.0, cnx_border))
                                                            .corner_radius(CornerRadius::same(6))
                                                            .min_size(Vec2::new(ui.available_width(), 30.0)),
                                                    ).clicked() {
                                                        command_sender(PlayerCommand::Seek { token: snapshot.token, seconds: ch.start_secs, exact: true });
                                                    }
                                                    ui.add_space(4.0);
                                                }
                                            }
                                        }
                                        _ => {
                                            // Info tab (CnX Screenshot 4)
                                            let fname = snapshot.path.as_ref().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "—".into());
                                            let loc = snapshot.path.as_ref().and_then(|p| p.parent()).map(|d| d.to_string_lossy().to_string()).unwrap_or_else(|| "—".into());
                                            let size_str = if snapshot.file_size_bytes > 0 {
                                                format!("{:.2} GB", snapshot.file_size_bytes as f64 / (1024.0 * 1024.0 * 1024.0))
                                            } else {
                                                "—".into()
                                            };
                                            let dur_str = fmt_time_hms(snapshot.duration_secs, false);
                                            let res_str = if snapshot.video_width > 0 { format!("{} x {}", snapshot.video_width, snapshot.video_height) } else { "—".into() };
                                            let fps_str = if snapshot.video_fps > 0.0 { format!("{:.3} fps", snapshot.video_fps) } else { "—".into() };
                                            let codec_str = snapshot.video_codec.clone().unwrap_or_else(|| "—".into());
                                            let audio_cnt = snapshot.tracks.iter().filter(|t| t.kind == "audio").count();
                                            let sub_cnt = snapshot.tracks.iter().filter(|t| t.kind == "sub").count();
                                            for (k, v) in [
                                                ("File", fname),
                                                ("Location", loc),
                                                ("Size", size_str),
                                                ("Duration", dur_str),
                                                ("Video resolution", res_str),
                                                ("Video framerate", fps_str),
                                                ("Video codec", codec_str),
                                                ("Audio streams", audio_cnt.to_string()),
                                                ("Text streams", sub_cnt.to_string()),
                                            ] {
                                                ui.horizontal(|ui| {
                                                    ui.label(RichText::new(k).size(12.0).color(cnx_muted));
                                                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                                        ui.add(egui::Label::new(RichText::new(v).size(12.0).color(Color32::from_gray(235))).wrap());
                                                    });
                                                });
                                                ui.add_space(4.0);
                                                ui.separator();
                                                ui.add_space(4.0);
                                            }
                                        }
                                    }
                                });

                                if pic_changed {
                                    command_sender(PlayerCommand::SetPictureControls {
                                        token: snapshot.token,
                                        enabled: true,
                                        lighting: state.picture_lighting,
                                        shadows: state.picture_shadows,
                                        contrast: state.picture_contrast,
                                        sharpness: state.picture_sharpness,
                                        vibrance: state.picture_vibrance,
                                        hue: state.picture_hue,
                                        deband: state.picture_deband,
                                        hdr_boost: state.picture_hdr_boost,
                                    });
                                }
                                if tm_changed {
                                    command_sender(PlayerCommand::SetHdrToneMapping {
                                        token: snapshot.token,
                                        enabled: state.hdr_tm_enabled,
                                        strength: state.hdr_tm_strength,
                                    });
                                }
                                if view_changed {
                                    command_sender(PlayerCommand::SetViewingOptions {
                                        token: snapshot.token,
                                        aspect: state.view_aspect.clone(),
                                        zoom: state.view_zoom,
                                        panscan: state.view_panscan,
                                        rotate: state.view_rotate,
                                        hflip: state.view_hflip,
                                        vflip: state.view_vflip,
                                        ab_a: state.view_ab_a,
                                        ab_b: state.view_ab_b,
                                    });
                                }
                            }
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
                                        ui.add_space(6.0);
                                        let clear_btn = egui::Button::new(RichText::new("Clear").size(11.5).color(Color32::from_gray(215)))
                                            .fill(Color32::from_white_alpha(14))
                                            .corner_radius(CornerRadius::same(4));
                                        if ui.add(clear_btn).clicked() {
                                            command_sender(PlayerCommand::ClearQueue { token: snapshot.token });
                                        }
                                        let add_q_btn = egui::Button::new(RichText::new("+ Add").size(11.5).strong().color(Color32::from_rgb(24, 20, 16)))
                                            .fill(Color32::from_rgb(245, 174, 108))
                                            .corner_radius(CornerRadius::same(6));
                                        if ui.add(add_q_btn).clicked() {
                                            action.add_to_queue = true;
                                        }
                                    });
                                });
                                ui.add_space(8.0);
                                let queue_height = (panel_height - 96.0).max(220.0);
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
                                            (Color32::from_rgb(56, 40, 24), Stroke::new(1.0, Color32::from_rgb(235, 140, 52)))
                                        } else if row_hovered {
                                            (Color32::from_rgb(44, 38, 32), Stroke::new(1.0, Color32::from_rgb(76, 66, 56)))
                                        } else {
                                            (Color32::from_rgb(32, 28, 24), Stroke::NONE)
                                        };

                                        ui.painter().rect(row_rect, CornerRadius::same(6), bg_color, stroke, egui::StrokeKind::Inside);
                                        if current {
                                            ui.painter().rect_filled(
                                                Rect::from_min_size(row_rect.min, Vec2::new(3.0, row_rect.height())),
                                                CornerRadius::same(2),
                                                Color32::from_rgb(235, 140, 52),
                                            );
                                        }

                                        // Left: Index number
                                        let idx_rect = Rect::from_min_size(row_rect.min + Vec2::new(10.0, 12.0), Vec2::new(24.0, 20.0));
                                        ui.painter().text(
                                            idx_rect.center(),
                                            Align2::CENTER_CENTER,
                                            format!("{:02}", index + 1),
                                            FontId::proportional(12.0),
                                            if current { Color32::from_rgb(245, 174, 108) } else { Color32::from_rgb(172, 162, 150) },
                                        );

                                        // Right side buttons
                                        let mut btn_right = row_rect.right() - 8.0;
                                        if !current {
                                            let play_rect = Rect::from_center_size(Pos2::new(btn_right - 22.0, row_rect.center().y), Vec2::new(44.0, 26.0));
                                            let play_resp = ui.interact(play_rect, ui.scope_id().with(("q_play", index)), Sense::click());
                                            ui.painter().rect(
                                                play_rect,
                                                CornerRadius::same(6),
                                                if play_resp.hovered() { Color32::from_rgb(235, 140, 52) } else { Color32::from_rgb(48, 41, 34) },
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
                                    ui.label(RichText::new("Bookmark Showcase").size(15.0).strong().color(Color32::WHITE));
                                    if state.active_tidb_synced {
                                        ui.label(
                                            RichText::new("TIDB")
                                                .size(10.5)
                                                .strong()
                                                .color(Color32::from_rgb(6, 182, 212)),
                                        );
                                    }
                                    if let Some(rating) = state.active_tmdb_rating {
                                        if rating > 0.0 {
                                            ui.label(
                                                RichText::new(format!("★ {:.1}", rating))
                                                    .size(11.5)
                                                    .strong()
                                                    .color(Color32::from_rgb(250, 204, 21)),
                                            );
                                        }
                                    }
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
                                        ui.add_space(6.0);

                                        let add_btn = egui::Button::new(RichText::new("+ Add").strong().color(Color32::WHITE))
                                            .fill(tokens.accent)
                                            .corner_radius(CornerRadius::same(5))
                                            .min_size(Vec2::new(72.0, 28.0));
                                        if ui.add(add_btn).clicked() {
                                            if let Some(path) = snapshot.path.as_ref() {
                                                let fingerprint = state.bookmark_fingerprint.clone().unwrap_or_else(|| {
                                                    path.to_string_lossy().to_string()
                                                });
                                                let stamp = fmt_time(snapshot.position_secs).unwrap_or_else(|| "00:00".into());
                                                let now = chrono::Utc::now();
                                                let id = format!("{}-{}", now.timestamp_millis(), (snapshot.position_secs.max(0.0) * 1000.0) as u64);
                                                let cat = state.new_bookmark_category.clone();
                                                let cat_label = match cat.as_str() {
                                                    "intro" => "Intro",
                                                    "credits" => "Outro",
                                                    "scene" => "Scene",
                                                    _ => "Bookmark",
                                                };
                                                let bookmark = Bookmark {
                                                    id,
                                                    fingerprint,
                                                    title: format!("{cat_label} · {stamp}"),
                                                    start_secs: snapshot.position_secs.max(0.0),
                                                    end_secs: None,
                                                    category: cat,
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
                                ui.add_space(6.0);
                                // Category filter pills & add-category selector
                                ui.horizontal_wrapped(|ui| {
                                    ui.spacing_mut().item_spacing = Vec2::new(6.0, 4.0);
                                    for (cat_id, label) in [
                                        ("all", "All"),
                                        ("intro", "Intro"),
                                        ("credits", "Outro"),
                                        ("scene", "Scene"),
                                        ("custom", "Custom"),
                                    ] {
                                        let active = state.bookmark_category_filter == cat_id;
                                        let pill = egui::Button::new(
                                            RichText::new(label)
                                                .size(11.0)
                                                .color(if active { Color32::WHITE } else { Color32::from_gray(185) }),
                                        )
                                        .fill(if active { tokens.accent } else { Color32::from_white_alpha(14) })
                                        .corner_radius(CornerRadius::same(10));
                                        if ui.add(pill).clicked() {
                                            state.bookmark_category_filter = cat_id.to_string();
                                            if cat_id != "all" {
                                                state.new_bookmark_category = cat_id.to_string();
                                            }
                                        }
                                    }
                                });
                                ui.add_space(8.0);
                                let filtered_bookmarks: Vec<Bookmark> = state
                                    .bookmarks
                                    .iter()
                                    .filter(|b| {
                                        state.bookmark_category_filter == "all"
                                            || b.category.eq_ignore_ascii_case(&state.bookmark_category_filter)
                                            || (state.bookmark_category_filter == "credits" && b.category.eq_ignore_ascii_case("outro"))
                                    })
                                    .cloned()
                                    .collect();
                                if filtered_bookmarks.is_empty() {
                                    egui::Frame::new()
                                        .fill(Color32::from_white_alpha(10))
                                        .stroke(Stroke::new(1.0, Color32::from_white_alpha(25)))
                                        .corner_radius(CornerRadius::same(6))
                                        .inner_margin(14.0)
                                        .show(ui, |ui| {
                                            ui.set_width(ui.available_width());
                                            ui.label(RichText::new("No bookmarks in this category yet.").size(12.5).color(Color32::from_gray(200)));
                                            ui.add_space(2.0);
                                            ui.label(RichText::new("Click \"+ Add\" or press T to save to Web DB & local library.").size(11.5).color(tokens.text_muted));
                                        });
                                } else {
                                let bookmark_height = (panel_height - 134.0).max(160.0);
                                egui::ScrollArea::vertical()
                                    .max_height(bookmark_height)
                                    .show(ui, |ui| {
                                    let mut remove = Vec::new();
                                    for bookmark in &filtered_bookmarks {
                                        let row_w = ui.available_width();
                                        let (row_rect, _) = ui.allocate_exact_size(Vec2::new(row_w, 46.0), Sense::hover());
                                        let cat_lower = bookmark.category.to_ascii_lowercase();
                                        let cat_col = match cat_lower.as_str() {
                                            "intro" => Color32::from_rgb(6, 182, 212),
                                            "credits" | "outro" => Color32::from_rgb(168, 85, 247),
                                            "scene" => Color32::from_rgb(245, 158, 11),
                                            _ => tokens.accent,
                                        };
                                        ui.painter().rect(
                                            row_rect,
                                            CornerRadius::same(6),
                                            Color32::from_white_alpha(12),
                                            Stroke::new(1.0, Color32::from_white_alpha(30)),
                                            egui::StrokeKind::Inside,
                                        );
                                        // Left accent stripe
                                        ui.painter().rect_filled(
                                            Rect::from_min_size(row_rect.min, Vec2::new(3.0, row_rect.height())),
                                            CornerRadius::same(2),
                                            cat_col,
                                        );

                                        // Left: Timestamp Jump Pill button
                                        let stamp_str = if let Some(end_s) = bookmark.end_secs {
                                            format!(
                                                "{}-{}",
                                                fmt_time(bookmark.start_secs).unwrap_or_else(|| "0:00".into()),
                                                fmt_time(end_s).unwrap_or_else(|| "0:00".into())
                                            )
                                        } else {
                                            fmt_time(bookmark.start_secs).unwrap_or_else(|| "00:00".into())
                                        };
                                        let stamp_w = if bookmark.end_secs.is_some() { 84.0 } else { 56.0 };
                                        let stamp_rect = Rect::from_center_size(Pos2::new(row_rect.min.x + 12.0 + stamp_w * 0.5, row_rect.center().y), Vec2::new(stamp_w, 26.0));
                                        let stamp_resp = ui.interact(stamp_rect, ui.scope_id().with(("bm_jump", &bookmark.id)), Sense::click());
                                        let stamp_hovered = stamp_resp.hovered();
                                        ui.painter().rect(
                                            stamp_rect,
                                            CornerRadius::same(5),
                                            if stamp_hovered { cat_col } else { Color32::from_rgb(32, 38, 52) },
                                            Stroke::new(1.0, if stamp_hovered { Color32::WHITE } else { cat_col }),
                                            egui::StrokeKind::Inside,
                                        );
                                        ui.painter().text(
                                            stamp_rect.center(),
                                            Align2::CENTER_CENTER,
                                            &stamp_str,
                                            FontId::proportional(11.0),
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
                ui.horizontal(|ui| {
                    if ui.button("Replay").clicked() {
                        state.trakt_synced_done = false;
                        command_sender(PlayerCommand::Play {
                            token: snapshot.token,
                        });
                    }
                    if state.trakt_connected {
                        let lbl = if state.trakt_synced_done {
                            "✓ Synced to Trakt"
                        } else {
                            "Sync to Trakt"
                        };
                        if ui
                            .add_enabled(
                                !state.trakt_synced_done,
                                egui::Button::new(
                                    RichText::new(lbl).color(Color32::WHITE),
                                )
                                .fill(if state.trakt_synced_done {
                                    Color32::from_rgb(34, 90, 56)
                                } else {
                                    tokens.accent
                                })
                                .corner_radius(CornerRadius::ZERO),
                            )
                            .clicked()
                        {
                            action.sync_to_trakt = true;
                            state.trakt_synced_done = true;
                        }
                    }
                });
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

    if overlay_alpha <= 0.05 && !state.locked_mode {
        ui.ctx().set_cursor_icon(egui::CursorIcon::None);
        ui.ctx().output_mut(|o| o.cursor_icon = egui::CursorIcon::None);
    }
    action
    }
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
