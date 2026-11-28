//! Pixel-perfect, responsive CnX Player UI overlay rendered over libmpv's GL framebuffer.

use std::sync::Arc;
use std::time::{Duration, Instant};

use egui::{
    self, Align, Align2, Color32, CornerRadius, CursorIcon, FontId, Galley, Id, Key, Layout,
    Order, PointerButton, Rect, RichText, Sense, Shape, Stroke, StrokeKind, TextWrapMode, Ui,
    UiBuilder, pos2, text::LayoutJob, text::TextFormat, vec2,
};
use valor_core::Bookmark;
use valor_player::{PlaybackState, PlayerCommand, PlayerSnapshot, PlayerTrack, queue::RepeatMode};

use crate::{
    cnx_kit::*,
    cnx_theme::*,
    player_ui::{PlayerPanel, PlayerUiAction, PlayerUiState, fmt_time_hms},
};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum PanelKind {
    Viewing,
    SubsAudio,
    Queue,
    Bookmarks,
}

#[derive(Clone, Debug)]
pub struct CnxLayout {
    pub title_bar: Rect,
    pub video: Rect,
    pub top_overlay: Rect,
    pub title_block: Rect,
    pub top_pill: Rect,
    pub seek_row: Rect,
    pub control_row: Rect,
    pub left_pill: Rect,
    pub center_cluster: Rect,
    pub right_pill: Rect,
    pub panel: Option<Rect>,
    pub is_compact: bool,
    pub is_narrow: bool,
    pub is_sheet: bool,
}

/// Pure per-frame layout function (R2). All coordinates stay inside `win` with zero overlaps.
pub fn compute_layout(win: Rect, s: f32, is_fs: bool, panel: Option<PanelKind>) -> CnxLayout {
    let w = win.width();
    let h = win.height();
    let is_compact = w < 480.0 || h < 420.0;
    let is_narrow = w < 720.0;

    let _chrome_h = 0.0;
    let title_bar = Rect::from_min_size(win.min, vec2(w, 0.0));
    let video = win;

    let top_scrim_h = if is_fs { 150.0 * s } else { 120.0 * s };
    let top_overlay = Rect::from_min_size(video.min, vec2(w, top_scrim_h.min(video.height())));

    let top_icons_cnt = if is_narrow { 2.0 } else { 4.0 };
    let top_pill_w = top_icons_cnt * 34.0 * s + (top_icons_cnt - 1.0) * 4.0 * s + 8.0 * s;
    let top_pill_top = if is_fs { video.top() + 12.0 * s } else { video.top() + 40.0 * s };
    let top_pill = Rect::from_min_size(
        pos2((video.right() - 27.0 * s - top_pill_w).max(video.left() + 8.0), top_pill_top),
        vec2(top_pill_w, 42.0 * s),
    );

    let title_x = video.left() + 68.0 * s;
    let title_w = (top_pill.left() - title_x - 24.0 * s).max(80.0);
    let title_block = Rect::from_min_size(pos2(title_x, video.top() + 18.0 * s), vec2(title_w, 44.0 * s));

    let seek_y = if is_compact { video.bottom() - 96.0 * s } else { video.bottom() - 86.0 * s };
    let seek_row = Rect::from_min_size(pos2(video.left() + 16.0 * s, seek_y - 12.0 * s), vec2((w - 32.0 * s).max(40.0), 24.0 * s));

    let ctrl_y = video.bottom() - 42.0 * s;
    let control_row = Rect::from_min_size(pos2(video.left(), ctrl_y - 27.0 * s), vec2(w, 54.0 * s));

    let left_pill_w = if is_narrow { 46.0 * s } else { 184.0 * s };
    let left_x = if is_compact { video.left() + 12.0 * s } else { (video.left() + 22.0 * s).max(22.0) };
    let left_pill = Rect::from_center_size(pos2(left_x + left_pill_w * 0.5, ctrl_y), vec2(left_pill_w, 46.0 * s));

    let center_w = if is_narrow { 230.0 * s } else { 290.0 * s };
    let center_cluster = Rect::from_center_size(pos2(video.center().x, ctrl_y), vec2(center_w, 54.0 * s));

    let right_cnt = if is_narrow { 3.0 } else { 4.0 };
    let right_w = right_cnt * 36.0 * s + (right_cnt - 1.0) * 2.0 * s + 10.0 * s;
    let right_pill = Rect::from_min_size(
        pos2((video.right() - 22.0 * s - right_w).max(video.left() + 8.0), ctrl_y - 23.0 * s),
        vec2(right_w, 46.0 * s),
    );

    let mut is_sheet = false;
    let panel_rect = panel.map(|pk| {
        if is_compact {
            is_sheet = true;
            let pw = (w - 16.0).max(240.0);
            let ph = (video.height() * 0.70).max(200.0);
            Rect::from_min_size(pos2(video.left() + 8.0, video.bottom() - ph), vec2(pw, ph))
        } else {
            let (ref_w, ref_h) = match pk {
                PanelKind::Viewing => (480.0 * s, 519.0 * s),
                PanelKind::SubsAudio => (
                    720.0 * s,
                    if is_fs {
                        (video.height() - 140.0 * s).clamp(520.0 * s, 740.0 * s)
                    } else {
                        620.0 * s
                    },
                ),
                PanelKind::Queue => (359.0 * s, 519.0 * s),
                PanelKind::Bookmarks => (285.0 * s, 260.0 * s),
            };
            let pw = ref_w.min((w - 32.0 * s).max(260.0));
            let min_top = top_pill.bottom() + 8.0 * s;
            let max_bot = (video.bottom() - 120.0 * s).max(min_top + 120.0);
            let avail_h = (max_bot - min_top).max(120.0);
            let ph = ref_h.min(avail_h);
            let top = if pk == PanelKind::Queue {
                min_top
            } else {
                (max_bot - ph).max(min_top)
            };
            let right_m = if pk == PanelKind::Bookmarks { 22.0 * s } else { 16.0 * s };
            Rect::from_min_size(pos2((video.right() - right_m - pw).max(video.left() + 16.0 * s), top), vec2(pw, ph))
        }
    });

    CnxLayout {
        title_bar,
        video,
        top_overlay,
        title_block,
        top_pill,
        seek_row,
        control_row,
        left_pill,
        center_cluster,
        right_pill,
        panel: panel_rect,
        is_compact,
        is_narrow,
        is_sheet,
    }
}

fn layout_single_line(ctx: &egui::Context, text: &str, font: FontId, color: Color32, max_w: f32) -> Arc<Galley> {
    let mut job = LayoutJob::single_section(
        text.to_owned(),
        TextFormat {
            font_id: font,
            color,
            ..Default::default()
        },
    );
    job.wrap = egui::text::TextWrapping {
        max_width: max_w.max(20.0),
        max_rows: 1,
        break_anywhere: true,
        overflow_character: Some('…'),
    };
    ctx.fonts_mut(|f| f.layout_job(job))
}

/// Middle ellipsis helper (R1 / Section 1): keeps head & tail of long filenames/paths.
pub fn elide_middle(ctx: &egui::Context, text: &str, font: FontId, max_w: f32) -> Arc<Galley> {
    let full = layout_single_line(ctx, text, font.clone(), TEXT_PRIMARY, f32::INFINITY);
    if full.size().x <= max_w || text.chars().count() < 12 {
        return layout_single_line(ctx, text, font, TEXT_PRIMARY, max_w);
    }
    let chars: Vec<char> = text.chars().collect();
    let n = chars.len();
    let mut lo = 4usize;
    let mut hi = n / 2;
    let mut best = format!("{}…{}", chars[..4].iter().collect::<String>(), chars[n - 4..].iter().collect::<String>());
    while lo <= hi {
        let mid = (lo + hi) / 2;
        let cand = format!(
            "{}…{}",
            chars[..mid].iter().collect::<String>(),
            chars[n - mid..].iter().collect::<String>()
        );
        let g = layout_single_line(ctx, &cand, font.clone(), TEXT_PRIMARY, f32::INFINITY);
        if g.size().x <= max_w {
            best = cand;
            lo = mid + 1;
        } else if mid == 0 {
            break;
        } else {
            hi = mid - 1;
        }
    }
    layout_single_line(ctx, &best, font, TEXT_PRIMARY, max_w)
}

fn iso639_name(code: &str) -> &str {
    match code.to_ascii_lowercase().as_str() {
        "en" | "eng" => "English",
        "hi" | "hin" => "Hindi",
        "ko" | "kor" => "Korean",
        "ja" | "jpn" => "Japanese",
        "es" | "spa" => "Spanish",
        "fr" | "fre" | "fra" => "French",
        "de" | "ger" | "deu" => "German",
        "it" | "ita" => "Italian",
        "pt" | "por" => "Portuguese",
        "ru" | "rus" => "Russian",
        "zh" | "chi" | "zho" => "Chinese",
        "ar" | "ara" => "Arabic",
        "ta" | "tam" => "Tamil",
        "te" | "tel" => "Telugu",
        "und" => "Undetermined",
        _ => code,
    }
}

fn format_track_label(tr: &PlayerTrack, dup_idx: usize) -> String {
    let mut parts: Vec<String> = Vec::new();
    if let Some(lang) = tr.language.as_deref().filter(|s| !s.is_empty()) {
        parts.push(iso639_name(lang).to_string());
    }
    if let Some(title) = tr.title.as_deref().filter(|s| !s.is_empty()) {
        if !parts.iter().any(|p| p.eq_ignore_ascii_case(title)) {
            parts.push(title.to_string());
        }
    }
    if let Some(codec) = tr.codec.as_deref().filter(|s| !s.is_empty()) {
        parts.push(codec.to_uppercase());
    }
    if let Some(ch) = tr.channels.as_deref().filter(|s| !s.is_empty()) {
        parts.push(ch.to_string());
    }
    if tr.is_default {
        parts.push("Default".into());
    }
    if parts.is_empty() {
        parts.push(format!("Track {}", tr.id));
    }
    let mut base = parts.join(" · ");
    if dup_idx > 1 {
        base.push_str(&format!(" ({dup_idx})"));
    }
    base
}

pub fn show_cnx_player(
    ui: &mut Ui,
    snapshot: &PlayerSnapshot,
    tokens: &crate::shell_tokens::ShellTokens,
    video_shape: Option<Shape>,
    state: &mut PlayerUiState,
    error: Option<&str>,
    command_sender: &mut dyn FnMut(PlayerCommand),
) -> PlayerUiAction {
    let frame_start = Instant::now();
    install_cnx_fonts(ui.ctx());
    apply_cnx_visuals(ui);
    ui.style_mut().wrap_mode = Some(TextWrapMode::Truncate);
    let theme_accent = tokens.accent;

    let mut action = PlayerUiAction::default();
    if let Some(fs) = ui.input(|i| i.viewport().fullscreen) {
        state.is_fullscreen = fs;
    }

    let win_rect = ui.max_rect();
    let cur_ppp = ui.ctx().pixels_per_point();

    let active_panel = if state.subtitles_popup_open {
        Some(PanelKind::SubsAudio)
    } else {
        match state.panel {
            Some(PlayerPanel::Viewing | PlayerPanel::Picture | PlayerPanel::Speed) => Some(PanelKind::Viewing),
            Some(PlayerPanel::Queue) => Some(PanelKind::Queue),
            Some(PlayerPanel::Bookmarks) => Some(PanelKind::Bookmarks),
            Some(PlayerPanel::Tracks) => Some(PanelKind::SubsAudio),
            None => None,
        }
    };

    let layout = compute_layout(win_rect, 1.0, state.is_fullscreen, active_panel);

    if snapshot.path != state.active_path {
        state.active_path = snapshot.path.clone();
        state.last_activity = Instant::now();
        state.media_banner_start = Instant::now();
        state.overlays_visible = true;
        state.position_preview = None;
    }

    // --- 1. Black window background + Video Frame ---
    ui.painter().rect_filled(win_rect, CornerRadius::same(if state.is_fullscreen { 0 } else { R_WINDOW }), BG_WINDOW);
    if let Some(shape) = video_shape {
        ui.painter().add(shape);
    }
    if !state.is_fullscreen {
        ui.painter().rect_stroke(
            round_rect_px(ui, win_rect),
            CornerRadius::same(R_WINDOW),
            Stroke::new(1.0, BORDER_HAIRLINE),
            StrokeKind::Inside,
        );
    }

    // Compact PiP window overlay (e.g. 420x236): Expand + Close at top-right, Prev | Play/Pause | Next at bottom
    if win_rect.width() <= 520.0 && win_rect.height() <= 320.0 && !state.is_fullscreen {
        state.panel = None;
        let close_r = Rect::from_min_size(pos2(win_rect.right() - 36.0, win_rect.top() + 10.0), vec2(26.0, 26.0));
        let exp_r = Rect::from_min_size(pos2(close_r.left() - 72.0, win_rect.top() + 10.0), vec2(64.0, 26.0));
        let exp_resp = ui.allocate_rect(exp_r, Sense::click());
        if exp_resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
        ui.painter().rect_filled(exp_r, CornerRadius::same(8), Color32::from_rgba_unmultiplied(26, 22, 19, 220));
        ui.painter().text(exp_r.center(), Align2::CENTER_CENTER, "Expand", font_outfit_medium(12.0), TEXT_PRIMARY);
        if exp_resp.clicked() { action.toggle_pip = true; }

        let c_resp = ui.allocate_rect(close_r, Sense::click());
        if c_resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
        ui.painter().rect_filled(close_r, CornerRadius::same(8), Color32::from_rgba_unmultiplied(26, 22, 19, 220));
        draw_cnx_icon(ui.painter(), Rect::from_center_size(close_r.center(), vec2(12.0, 12.0)), CnxIcon::CloseX, TEXT_PRIMARY, 1.75);
        if c_resp.clicked() { action.leave = true; }

        let bar_r = Rect::from_min_max(pos2(win_rect.left(), win_rect.bottom() - 54.0), win_rect.max);
        ui.painter().rect_filled(bar_r, CornerRadius::ZERO, SURFACE_PANEL);
        let cy = bar_r.center().y;
        let cx = bar_r.center().x;
        let play_r = Rect::from_center_size(pos2(cx, cy), vec2(34.0, 34.0));
        let p_resp = ui.allocate_rect(play_r, Sense::click());
        if p_resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
        ui.painter().rect_filled(play_r, CornerRadius::same(8), ACCENT_STRONG);
        let is_pl = snapshot.state == PlaybackState::Playing;
        draw_cnx_icon(ui.painter(), Rect::from_center_size(play_r.center(), vec2(16.0, 16.0)), if is_pl { CnxIcon::PauseFilled } else { CnxIcon::PlayFilled }, Color32::WHITE, 1.8);
        if p_resp.clicked() {
            if is_pl { command_sender(PlayerCommand::Pause { token: snapshot.token }); }
            else { command_sender(PlayerCommand::Play { token: snapshot.token }); }
        }
        let prev_r = Rect::from_center_size(pos2(cx - 44.0, cy), vec2(28.0, 28.0));
        if cnx_icon_button(ui, Id::new("pip_prev"), prev_r, CnxIcon::Prev, 16.0, false, false, 1.0, "Previous").clicked() {
            command_sender(PlayerCommand::Prev { token: snapshot.token });
        }
        let next_r = Rect::from_center_size(pos2(cx + 44.0, cy), vec2(28.0, 28.0));
        if cnx_icon_button(ui, Id::new("pip_next"), next_r, CnxIcon::Next, 16.0, false, false, 1.0, "Next").clicked() {
            command_sender(PlayerCommand::Next { token: snapshot.token });
        }
        return action;
    }

    // Corner-hover window actions are drawn in Order::Tooltip after canvas_rect so clicks never pass through.

    // --- 3. Pointer Idle / Auto-hide & Keyboard / Mouse Back Shortcuts ---
    let pointer_moved = ui.input(|i| i.pointer.delta().length_sq() > 0.5 || i.pointer.any_click());
    let any_panel_open = active_panel.is_some() || state.licences_dialog_open || state.is_seeking;

    if pointer_moved || any_panel_open {
        state.last_activity = Instant::now();
        state.overlays_visible = true;
    } else if snapshot.state == PlaybackState::Playing && state.last_activity.elapsed() > Duration::from_secs(3) {
        state.overlays_visible = false;
        ui.ctx().set_cursor_icon(CursorIcon::None);
    }

    // Repaint timer only while playing AND controls are visible (Bug 7)
    if snapshot.state == PlaybackState::Playing && state.overlays_visible && !any_panel_open {
        ui.ctx().request_repaint_after(Duration::from_millis(250));
    }

    let overlay_alpha = ui.ctx().animate_bool_with_time(
        Id::new("cnx_overlay_alpha"),
        state.overlays_visible || any_panel_open,
        0.20,
    );

    // Bug 2: Subtitle lift tweened with controls fade
    let target_sub_margin: i64 = (22.0 + overlay_alpha * 90.0).round() as i64;
    let last_margin_id = Id::new("cnx_last_sub_margin");
    let prev_margin = ui.data(|d| d.get_temp::<i64>(last_margin_id)).unwrap_or(-1);
    if (target_sub_margin - prev_margin).abs() >= 2 {
        ui.data_mut(|d| d.insert_temp(last_margin_id, target_sub_margin));
        command_sender(PlayerCommand::SetSubMarginY { token: snapshot.token, margin_y: target_sub_margin });
    }

    let debug_id = Id::new("cnx_f12_debug");
    if !ui.ctx().egui_wants_keyboard_input() {
        ui.input(|i| {
            if i.key_pressed(Key::F12) {
                let cur = ui.data(|d| d.get_temp::<bool>(debug_id)).unwrap_or(false);
                ui.data_mut(|d| d.insert_temp(debug_id, !cur));
            }
            if i.key_pressed(Key::Space) {
                if snapshot.state == PlaybackState::Playing {
                    command_sender(PlayerCommand::Pause { token: snapshot.token });
                } else {
                    command_sender(PlayerCommand::Play { token: snapshot.token });
                }
            }
            if i.key_pressed(Key::ArrowLeft) {
                if i.modifiers.alt {
                    action.leave = true;
                } else {
                    command_sender(PlayerCommand::SeekRel { token: snapshot.token, seconds: -10.0 });
                }
            }
            if i.key_pressed(Key::ArrowRight) {
                command_sender(PlayerCommand::SeekRel { token: snapshot.token, seconds: 10.0 });
            }
            if i.key_pressed(Key::ArrowUp) {
                command_sender(PlayerCommand::SetVolume { token: snapshot.token, volume: (snapshot.volume + 5.0).clamp(0.0, 100.0) });
            }
            if i.key_pressed(Key::ArrowDown) {
                command_sender(PlayerCommand::SetVolume { token: snapshot.token, volume: (snapshot.volume - 5.0).clamp(0.0, 100.0) });
            }
            if i.key_pressed(Key::F) {
                state.is_fullscreen = !state.is_fullscreen;
                action.toggle_fullscreen = Some(state.is_fullscreen);
            }
            if i.key_pressed(Key::M) {
                command_sender(PlayerCommand::SetMute { token: snapshot.token, muted: !snapshot.muted });
            }
            if i.key_pressed(Key::B) {
                state.panel = if state.panel == Some(PlayerPanel::Bookmarks) { None } else { Some(PlayerPanel::Bookmarks) };
            }
            if i.key_pressed(Key::Q) && i.modifiers.ctrl {
                state.panel = if state.panel == Some(PlayerPanel::Queue) { None } else { Some(PlayerPanel::Queue) };
            }
            if i.key_pressed(Key::OpenBracket) {
                command_sender(PlayerCommand::SetSpeed { token: snapshot.token, speed: (snapshot.speed - 0.25).clamp(0.5, 2.0) });
            }
            if i.key_pressed(Key::CloseBracket) {
                command_sender(PlayerCommand::SetSpeed { token: snapshot.token, speed: (snapshot.speed + 0.25).clamp(0.5, 2.0) });
            }
            if i.key_pressed(Key::Backspace) || i.pointer.button_clicked(PointerButton::Extra1) {
                action.leave = true;
            }
            if i.key_pressed(Key::Escape) {
                if state.licences_dialog_open {
                    state.licences_dialog_open = false;
                } else if state.subtitles_popup_open {
                    state.subtitles_popup_open = false;
                } else if state.panel.is_some() {
                    state.panel = None;
                } else if state.is_fullscreen {
                    state.is_fullscreen = false;
                    action.toggle_fullscreen = Some(false);
                } else {
                    action.leave = true;
                }
            }
        });
    }

    // --- 4. Locked Mode ---
    if state.locked_mode {
        let lock_r = Rect::from_center_size(pos2(layout.video.right() - 60.0, layout.video.top() + 34.0), vec2(88.0, 32.0));
        let lr = ui.allocate_rect(lock_r, Sense::click());
        if lr.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
        ui.painter().rect_filled(lock_r, CornerRadius::same(16), ACCENT_TINT);
        draw_cnx_icon(ui.painter(), Rect::from_center_size(pos2(lock_r.left() + 18.0, lock_r.center().y), vec2(14.0, 14.0)), CnxIcon::Lock, ACCENT, 1.75);
        ui.painter().text(pos2(lock_r.left() + 32.0, lock_r.center().y), Align2::LEFT_CENTER, "Unlock", font_outfit_medium(12.0), ACCENT);
        if lr.clicked() { state.locked_mode = false; state.overlays_visible = true; }
        return action;
    }

    // --- 5. Video Canvas ClickGrace ---
    let canvas_rect = Rect::from_min_max(layout.video.min, pos2(layout.video.right(), layout.seek_row.top() - 6.0));
    let canvas_resp = ui.allocate_rect(canvas_rect, Sense::click());
    if canvas_resp.double_clicked() {
        state.pending_canvas_click = None;
        state.is_fullscreen = !state.is_fullscreen;
        action.toggle_fullscreen = Some(state.is_fullscreen);
    } else if canvas_resp.clicked() && !any_panel_open {
        state.pending_canvas_click = Some(Instant::now());
    }
    if let Some(t) = state.pending_canvas_click {
        if t.elapsed() >= Duration::from_millis(220) {
            state.pending_canvas_click = None;
            if snapshot.state == PlaybackState::Playing {
                command_sender(PlayerCommand::Pause { token: snapshot.token });
            } else {
                command_sender(PlayerCommand::Play { token: snapshot.token });
            }
        } else {
            ui.ctx().request_repaint_after(Duration::from_millis(30));
        }
    }

    // --- 6. Top & Bottom Overlays (skip painting entirely when hidden, Bug 7) ---
    let mut panel_just_opened = false;
    if overlay_alpha > 0.01 {
        let bot_scrim_h = if state.is_fullscreen { 200.0 } else { 160.0 };
        draw_scrim_top(ui.painter(), layout.top_overlay, overlay_alpha);
        draw_scrim_bottom(
            ui.painter(),
            Rect::from_min_size(pos2(layout.video.left(), layout.video.bottom() - bot_scrim_h), vec2(layout.video.width(), bot_scrim_h)),
            overlay_alpha,
        );

        // Back button right beside the title
        let top_back_r = Rect::from_center_size(pos2(layout.video.left() + 34.0, layout.title_block.center().y), vec2(36.0, 36.0));
        if cnx_icon_button(ui, Id::new("top_back_btn"), top_back_r, CnxIcon::Back, 18.0, false, true, overlay_alpha, "Back to Library (Esc)").clicked() {
            action.leave = true;
        }

        // Bug 1: Single-line ellipsized title (break_anywhere=true) + fixed meta line below
        let title_str = snapshot
            .title
            .clone()
            .or_else(|| snapshot.path.as_ref().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().to_string()))
            .unwrap_or_else(|| "Playing".to_string());
        let title_galley = layout_single_line(
            ui.ctx(),
            &title_str,
            font_outfit_semibold(if state.is_fullscreen { 18.0 } else { 16.0 }),
            Color32::from_white_alpha((242.0 * overlay_alpha) as u8),
            layout.title_block.width(),
        );
        ui.painter().galley(layout.title_block.min, title_galley, TEXT_PRIMARY);

        let sub_str = {
            let ext = snapshot.path.as_ref().and_then(|p| p.extension()).map(|e| e.to_string_lossy().to_uppercase()).unwrap_or_else(|| "VIDEO".into());
            let res = if snapshot.video_height > 0 { format!("{}p", snapshot.video_height) } else { "HD".into() };
            let kind = if snapshot.is_dolby_vision { "Dolby Vision" } else if snapshot.is_hdr { "10-bit HDR" } else { "Video" };
            format!("{ext} · {res} · {kind}")
        };
        let sub_galley = layout_single_line(
            ui.ctx(),
            &sub_str,
            font_outfit_regular(12.0),
            Color32::from_rgba_unmultiplied(TEXT_SECONDARY.r(), TEXT_SECONDARY.g(), TEXT_SECONDARY.b(), (255.0 * overlay_alpha) as u8),
            layout.title_block.width(),
        );
        ui.painter().galley(pos2(layout.title_block.left(), layout.title_block.top() + 24.0), sub_galley, TEXT_SECONDARY);

        // Top-Right Pill
        ui.painter().rect_filled(layout.top_pill, CornerRadius::same(12), PILL_BG_SOLID);
        let top_icons: Vec<(CnxIcon, &str, bool)> = if layout.is_narrow {
            vec![
                (CnxIcon::Cast, "Cast", false),
                (CnxIcon::Queue, "Queue (Ctrl+Q)", state.panel == Some(PlayerPanel::Queue)),
            ]
        } else {
            vec![
                (CnxIcon::Cast, "Cast", false),
                (CnxIcon::Pip, "Picture-in-Picture", false),
                (CnxIcon::Lock, "Lock controls", state.locked_mode),
                (CnxIcon::Queue, "Queue (Ctrl+Q)", state.panel == Some(PlayerPanel::Queue)),
            ]
        };
        for (idx, (ico, tip, act)) in top_icons.iter().enumerate() {
            let br = Rect::from_min_size(pos2(layout.top_pill.left() + 4.0 + idx as f32 * 38.0, layout.top_pill.top() + 4.0), vec2(34.0, 34.0));
            let resp = cnx_icon_button(ui, Id::new(("top_ico", idx)), br, *ico, 18.0, *act, *act, overlay_alpha, tip);
            if resp.clicked() {
                match ico {
                    CnxIcon::Pip => action.toggle_pip = true,
                    CnxIcon::Lock => { state.locked_mode = true; state.panel = None; state.subtitles_popup_open = false; }
                    CnxIcon::Queue => {
                        state.panel = if state.panel == Some(PlayerPanel::Queue) { None } else { Some(PlayerPanel::Queue) };
                        state.subtitles_popup_open = false;
                        panel_just_opened = true;
                    }
                    _ => {}
                }
            }
        }

        // --- Seek Row (fixed-width mono timecodes so track never jitters, Section 8) ---
        let has_dur = snapshot.duration_secs.is_finite() && snapshot.duration_secs > 0.0;
        let max_pos = if has_dur { snapshot.duration_secs } else { 1.0 };
        let cur_pos = state.position_preview.unwrap_or(snapshot.position_secs).clamp(0.0, max_pos);
        let cur_str = fmt_time_hms(cur_pos, false);
        let dur_str = fmt_time_hms(max_pos, false);

        let seek_y = layout.seek_row.center().y;
        let (seek_left, seek_right) = if layout.is_compact {
            (layout.video.left() + 16.0, layout.video.right() - 16.0)
        } else {
            (layout.video.left() + 100.0, layout.video.right() - 100.0)
        };
        if !layout.is_compact {
            ui.painter().text(pos2(layout.video.left() + 26.0, seek_y), Align2::LEFT_CENTER, &cur_str, font_mono(12.0), TEXT_PRIMARY);
            ui.painter().text(pos2(layout.video.right() - 26.0, seek_y), Align2::RIGHT_CENTER, &dur_str, font_mono(12.0), TEXT_SECONDARY);
        } else {
            ui.painter().text(pos2(seek_left, seek_y + 16.0), Align2::LEFT_CENTER, &cur_str, font_mono(11.0), TEXT_PRIMARY);
            ui.painter().text(pos2(seek_right, seek_y + 16.0), Align2::RIGHT_CENTER, &dur_str, font_mono(11.0), TEXT_SECONDARY);
        }

        let seek_hit = Rect::from_min_max(pos2(seek_left, seek_y - 12.0), pos2(seek_right, seek_y + 12.0));
        let seek_resp = ui.allocate_rect(seek_hit, Sense::click_and_drag());
        if seek_resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
        let last_scrub_id = Id::new("cnx_last_scrub_ts");
        let last_scrub_pos_id = Id::new("cnx_last_scrub_pos");
        if seek_resp.dragged() || seek_resp.clicked() {
            if let Some(p) = ui.input(|i| i.pointer.interact_pos()) {
                let frac = ((p.x - seek_left) / (seek_right - seek_left).max(1.0)).clamp(0.0, 1.0);
                let target = f64::from(frac) * max_pos;
                state.position_preview = Some(target);
                state.is_seeking = true;
                if seek_resp.clicked() && !seek_resp.dragged() {
                    command_sender(PlayerCommand::Seek { token: snapshot.token, seconds: target, exact: false });
                    state.is_seeking = false;
                    state.position_preview = None;
                } else if seek_resp.dragged() {
                    let now = ui.input(|i| i.time);
                    let prev_t: f64 = ui.data(|d| d.get_temp(last_scrub_id)).unwrap_or(0.0);
                    let prev_p: f64 = ui.data(|d| d.get_temp(last_scrub_pos_id)).unwrap_or(-100.0);
                    if now - prev_t >= 0.06 && (target - prev_p).abs() >= 0.4 {
                        command_sender(PlayerCommand::Seek { token: snapshot.token, seconds: target, exact: false });
                        ui.data_mut(|d| {
                            d.insert_temp(last_scrub_id, now);
                            d.insert_temp(last_scrub_pos_id, target);
                        });
                    }
                }
            }
        }
        if state.is_seeking && seek_resp.drag_stopped() {
            if let Some(target) = state.position_preview.take() {
                command_sender(PlayerCommand::Seek { token: snapshot.token, seconds: target, exact: false });
            }
            state.is_seeking = false;
        }

        let frac = (cur_pos / max_pos).clamp(0.0, 1.0) as f32;
        let track_r = Rect::from_min_max(pos2(seek_left, seek_y - 2.0), pos2(seek_right, seek_y + 2.0));
        ui.painter().rect_filled(track_r, CornerRadius::same(2), TRACK_INACTIVE);
        let thumb_x = (track_r.left() + track_r.width() * frac).clamp(track_r.left() + 4.0, track_r.right() - 4.0);
        if frac > 0.001 {
            ui.painter().rect_filled(Rect::from_min_max(track_r.min, pos2(thumb_x, track_r.bottom())), CornerRadius::same(2), theme_accent);
        }
        if has_dur {
            for bm in &state.bookmarks {
                let bx = track_r.left() + track_r.width() * (bm.start_secs / max_pos).clamp(0.0, 1.0) as f32;
                ui.painter().rect_filled(Rect::from_center_size(pos2(bx, seek_y), vec2(3.0, 10.0)), CornerRadius::same(1), theme_accent);
            }
        }
        let thumb_r = if seek_resp.hovered() || state.is_seeking { 11.0 } else { 10.0 };
        ui.painter().circle_filled(pos2(thumb_x, seek_y), thumb_r, Color32::WHITE);
        ui.painter().circle_stroke(pos2(thumb_x, seek_y), thumb_r, Stroke::new(3.0, theme_accent));
        if state.is_seeking {
            let tip_r = Rect::from_center_size(pos2(thumb_x, seek_y - 28.0), vec2(60.0, 24.0));
            ui.painter().rect_filled(tip_r, CornerRadius::same(8), SURFACE_PANEL);
            ui.painter().text(tip_r.center(), Align2::CENTER_CENTER, &cur_str, font_mono(12.0), TEXT_PRIMARY);
        }

        // --- Control Row ---
        let ctrl_y = layout.control_row.center().y;
        ui.painter().rect_filled(layout.left_pill, CornerRadius::same(14), PILL_BG);
        let vol_btn_r = Rect::from_center_size(pos2(layout.left_pill.left() + 23.0, ctrl_y), vec2(34.0, 34.0));
        let vol_ico = if snapshot.muted || snapshot.volume <= 0.1 { CnxIcon::Mute } else { CnxIcon::Volume };
        if cnx_icon_button(ui, Id::new("ctrl_vol"), vol_btn_r, vol_ico, 18.0, false, false, overlay_alpha, "Mute (M)").clicked() {
            command_sender(PlayerCommand::SetMute { token: snapshot.token, muted: !snapshot.muted });
        }
        if !layout.is_narrow {
            let vs_rect = Rect::from_min_max(pos2(vol_btn_r.right() + 6.0, ctrl_y - 10.0), pos2(vol_btn_r.right() + 96.0, ctrl_y + 10.0));
            let vs_resp = ui.allocate_rect(vs_rect, Sense::click_and_drag());
            if vs_resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
            let mut v = if snapshot.muted { 0.0 } else { snapshot.volume };
            if vs_resp.dragged() || vs_resp.clicked() {
                if let Some(p) = ui.input(|i| i.pointer.interact_pos()) {
                    let vf = ((p.x - vs_rect.left()) / vs_rect.width()).clamp(0.0, 1.0);
                    v = f64::from(vf) * 100.0;
                    command_sender(PlayerCommand::SetVolume { token: snapshot.token, volume: v });
                    if snapshot.muted { command_sender(PlayerCommand::SetMute { token: snapshot.token, muted: false }); }
                }
            }
            let vf = (v / 100.0).clamp(0.0, 1.0) as f32;
            let vt = Rect::from_min_max(pos2(vs_rect.left(), ctrl_y - 1.5), pos2(vs_rect.right(), ctrl_y + 1.5));
            ui.painter().rect_filled(vt, CornerRadius::same(2), TRACK_INACTIVE_SMALL);
            let kx = vt.left() + vt.width() * vf;
            if vf > 0.0 { ui.painter().rect_filled(Rect::from_min_max(vt.min, pos2(kx, vt.bottom())), CornerRadius::same(2), Color32::WHITE); }
            ui.painter().circle_filled(pos2(kx, ctrl_y), 5.0, Color32::WHITE);

            let spd_r = Rect::from_center_size(pos2(layout.left_pill.right() - 21.0, ctrl_y), vec2(30.0, 30.0));
            ui.painter().rect_filled(spd_r, CornerRadius::same(8), SURFACE_RAISED);
            if cnx_icon_button(ui, Id::new("ctrl_spd"), spd_r, CnxIcon::SpeedGauge, 16.0, state.panel == Some(PlayerPanel::Speed), false, overlay_alpha, "Playback speed").clicked() {
                state.panel = if state.panel == Some(PlayerPanel::Speed) { None } else { Some(PlayerPanel::Speed) };
                state.subtitles_popup_open = false;
                panel_just_opened = true;
            }
        }

        // Center Transport Cluster (Play glyph nudged +1px right, Pause centered, Section 8)
        let cx = layout.center_cluster.center().x;
        let play_d = if layout.is_narrow { 48.0 } else { 54.0 };
        let play_r = Rect::from_center_size(pos2(cx, ctrl_y), vec2(play_d, play_d));
        let play_resp = ui.allocate_rect(play_r, Sense::click());
        if play_resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
        let scale = if play_resp.is_pointer_button_down_on() { 0.96 } else if play_resp.hovered() { 1.05 } else { 1.0 };
        ui.painter().add(big_play_shadow().as_shape(play_r, CornerRadius::same((play_d * 0.5) as u8)));
        ui.painter().circle_filled(play_r.center(), (play_d * 0.5) * scale, theme_accent);
        let is_playing = snapshot.state == PlaybackState::Playing;
        let play_ico = if is_playing { CnxIcon::PauseFilled } else { CnxIcon::PlayFilled };
        let glyph_c = if is_playing { play_r.center() } else { pos2(play_r.center().x + 1.0, play_r.center().y) };
        draw_cnx_icon(ui.painter(), Rect::from_center_size(glyph_c, vec2(24.0, 24.0)), play_ico, Color32::WHITE, 2.0);
        if play_resp.clicked() {
            if is_playing { command_sender(PlayerCommand::Pause { token: snapshot.token }); } else { command_sender(PlayerCommand::Play { token: snapshot.token }); }
        }

        let mut center_btns = vec![
            (-93.0, CnxIcon::Prev, "Previous", 0u8),
            (-51.0, CnxIcon::Replay10, "Replay 10s", 1u8),
            (50.0, CnxIcon::Forward10, "Forward 10s", 2u8),
            (93.0, CnxIcon::Next, "Next", 3u8),
        ];
        if !layout.is_narrow { center_btns.push((135.0, CnxIcon::StopSquare, "Stop", 4u8)); }
        for (dx, ico, tip, kind) in center_btns {
            let br = Rect::from_center_size(pos2(cx + dx, ctrl_y), vec2(40.0, 40.0));
            if cnx_icon_button(ui, Id::new(("ctr", kind)), br, ico, 22.0, false, true, overlay_alpha, tip).clicked() {
                match kind {
                    0 => command_sender(PlayerCommand::Prev { token: snapshot.token }),
                    1 => command_sender(PlayerCommand::SeekRel { token: snapshot.token, seconds: -10.0 }),
                    2 => command_sender(PlayerCommand::SeekRel { token: snapshot.token, seconds: 10.0 }),
                    3 => command_sender(PlayerCommand::Next { token: snapshot.token }),
                    4 => {
                        command_sender(PlayerCommand::Pause { token: snapshot.token });
                        command_sender(PlayerCommand::Seek { token: snapshot.token, seconds: 0.0, exact: true });
                    }
                    _ => {}
                }
            }
        }

        // Right Pill
        ui.painter().rect_filled(layout.right_pill, CornerRadius::same(14), PILL_BG);
        let right_btns: Vec<(CnxIcon, &str, bool, u8)> = if layout.is_narrow {
            vec![
                (CnxIcon::Captions, "Subtitles & Audio", state.subtitles_popup_open, 1),
                (CnxIcon::Sliders, "Viewing options", state.panel == Some(PlayerPanel::Viewing), 2),
                (if state.is_fullscreen { CnxIcon::ExitFullscreen } else { CnxIcon::Fullscreen }, "Fullscreen (F)", false, 3),
            ]
        } else {
            vec![
                (CnxIcon::Bookmark, "Bookmarks (B)", state.panel == Some(PlayerPanel::Bookmarks), 0),
                (CnxIcon::Captions, "Subtitles & Audio", state.subtitles_popup_open, 1),
                (CnxIcon::Sliders, "Viewing options", state.panel == Some(PlayerPanel::Viewing), 2),
                (if state.is_fullscreen { CnxIcon::ExitFullscreen } else { CnxIcon::Fullscreen }, "Fullscreen (F)", false, 3),
            ]
        };
        for (idx, (ico, tip, act, kind)) in right_btns.iter().enumerate() {
            let br = Rect::from_min_size(pos2(layout.right_pill.left() + 5.0 + idx as f32 * 38.0, layout.right_pill.top() + 5.0), vec2(36.0, 36.0));
            if cnx_icon_button(ui, Id::new(("rp", *kind)), br, *ico, 20.0, *act, *act, overlay_alpha, tip).clicked() {
                match kind {
                    0 => {
                        state.panel = if state.panel == Some(PlayerPanel::Bookmarks) { None } else { Some(PlayerPanel::Bookmarks) };
                        state.subtitles_popup_open = false;
                        panel_just_opened = true;
                    }
                    1 => {
                        state.subtitles_popup_open = !state.subtitles_popup_open;
                        if state.subtitles_popup_open { state.panel = None; }
                        panel_just_opened = true;
                    }
                    2 => {
                        state.panel = if state.panel == Some(PlayerPanel::Viewing) { None } else { Some(PlayerPanel::Viewing) };
                        state.subtitles_popup_open = false;
                        panel_just_opened = true;
                    }
                    3 => {
                        state.is_fullscreen = !state.is_fullscreen;
                        action.toggle_fullscreen = Some(state.is_fullscreen);
                    }
                    _ => {}
                }
            }
        }
    }

    // --- 7. Panels & Popovers (all from compute_layout, clipped & constrained) ---
    if let (Some(pk), Some(p_rect)) = (active_panel, layout.panel) {
        match pk {
            PanelKind::Viewing => show_viewing_panel(ui, p_rect, layout.is_sheet, snapshot, state, command_sender, panel_just_opened),
            PanelKind::SubsAudio => show_subs_audio_panel(ui, p_rect, layout.is_sheet, snapshot, state, &mut action, command_sender, panel_just_opened),
            PanelKind::Queue => show_queue_panel(ui, p_rect, layout.is_sheet, snapshot, state, command_sender, panel_just_opened),
            PanelKind::Bookmarks => show_bookmarks_popover(ui, p_rect, snapshot, state, &mut action, command_sender, panel_just_opened),
        }
    }
    if state.licences_dialog_open {
        show_licences_dialog(ui, win_rect, state);
    }

    // --- 7b. Compact Vertical Speed Popover (above Speed button) ---
    if state.panel == Some(PlayerPanel::Speed) {
        let sp_w = 68.0_f32;
        let sp_h = 236.0_f32;
        let sp_pos = pos2(layout.left_pill.right() - sp_w * 0.5 - 21.0, layout.left_pill.top() - sp_h - 10.0);
        let sp_rect = Rect::from_min_size(sp_pos, vec2(sp_w, sp_h));
        if !panel_just_opened && ui.input(|i| i.pointer.any_click()) {
            if let Some(p) = ui.input(|i| i.pointer.interact_pos()) {
                if !sp_rect.contains(p) {
                    state.panel = None;
                }
            }
        }
        egui::Area::new(Id::new("cnx_speed_pop"))
            .order(Order::Foreground)
            .fixed_pos(sp_pos)
            .show(ui.ctx(), |ui| {
                ui.painter().rect_filled(sp_rect, CornerRadius::same(14), SURFACE_PANEL);
                ui.painter().rect_stroke(sp_rect, CornerRadius::same(14), Stroke::new(1.0, BORDER_HAIRLINE), StrokeKind::Inside);
                draw_cnx_icon(ui.painter(), Rect::from_center_size(pos2(sp_rect.center().x, sp_rect.top() + 18.0), vec2(15.0, 15.0)), CnxIcon::SpeedGauge, TEXT_SECONDARY, 1.5);
                for (idx, spd) in [0.5_f64, 0.75, 1.0, 1.25, 1.5, 2.0].iter().enumerate() {
                    let br = Rect::from_min_size(pos2(sp_rect.left() + 6.0, sp_rect.top() + 34.0 + idx as f32 * 32.0), vec2(sp_w - 12.0, 28.0));
                    let resp = ui.allocate_rect(br, Sense::click());
                    let act = (snapshot.speed - *spd).abs() < 0.05;
                    if resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
                    if act {
                        ui.painter().rect_filled(br, CornerRadius::same(8), ACCENT_CONTAINER);
                    } else if resp.hovered() {
                        ui.painter().rect_filled(br, CornerRadius::same(8), SURFACE_HOVER);
                    }
                    ui.painter().text(br.center(), Align2::CENTER_CENTER, format!("{spd}×"), font_mono(12.0), if act { ACCENT_CONTAINER_TEXT } else { TEXT_PRIMARY });
                    if resp.clicked() {
                        command_sender(PlayerCommand::SetSpeed { token: snapshot.token, speed: *spd });
                        state.panel = None;
                    }
                }
            });
    }

    // --- 7c. 0.5s Corner-Hover Window Actions (Order::Tooltip so clicks never pass through!) ---
    if !state.is_fullscreen {
        let corner_zone = Rect::from_min_max(pos2(win_rect.right() - 160.0, win_rect.top()), pos2(win_rect.right(), win_rect.top() + 56.0));
        let in_corner = ui.input(|i| i.pointer.hover_pos()).is_some_and(|p| corner_zone.contains(p));
        if in_corner {
            let start = state.top_right_hover_start.get_or_insert_with(Instant::now);
            if start.elapsed() < Duration::from_millis(500) {
                ui.ctx().request_repaint_after(Duration::from_millis(50));
            } else {
                let bar_pos = pos2(win_rect.right() - 138.0, win_rect.top());
                egui::Area::new(Id::new("cnx_corner_win_btns"))
                    .order(Order::Tooltip)
                    .fixed_pos(bar_pos)
                    .show(ui.ctx(), |ui| {
                        let bar_r = Rect::from_min_size(bar_pos, vec2(138.0, 34.0));
                        ui.painter().rect_filled(bar_r, CornerRadius { nw: 0, ne: R_WINDOW, sw: 8, se: 0 }, PILL_BG_SOLID);
                        let min_r = Rect::from_min_size(bar_pos, vec2(46.0, 34.0));
                        let max_r = Rect::from_min_size(pos2(bar_pos.x + 46.0, bar_pos.y), vec2(46.0, 34.0));
                        let close_r = Rect::from_min_size(pos2(bar_pos.x + 92.0, bar_pos.y), vec2(46.0, 34.0));

                        let min_resp = ui.allocate_rect(min_r, Sense::click());
                        if min_resp.hovered() { ui.painter().rect_filled(min_r, CornerRadius::ZERO, SURFACE_HOVER); }
                        ui.painter().line_segment([pos2(min_r.center().x - 5.0, min_r.center().y), pos2(min_r.center().x + 5.0, min_r.center().y)], Stroke::new(1.2, TEXT_PRIMARY));
                        if min_resp.clicked() { action.minimize_window = true; }

                        let max_resp = ui.allocate_rect(max_r, Sense::click());
                        if max_resp.hovered() { ui.painter().rect_filled(max_r, CornerRadius::ZERO, SURFACE_HOVER); }
                        ui.painter().rect_stroke(Rect::from_center_size(max_r.center(), vec2(10.0, 10.0)), CornerRadius::ZERO, Stroke::new(1.2, TEXT_PRIMARY), StrokeKind::Middle);
                        if max_resp.clicked() { action.maximize_window = true; }

                        let close_resp = ui.allocate_rect(close_r, Sense::click());
                        if close_resp.hovered() { ui.painter().rect_filled(close_r, CornerRadius { nw: 0, ne: R_WINDOW, sw: 0, se: 0 }, CLOSE_HOVER_BG); }
                        let cc = close_r.center();
                        ui.painter().line_segment([pos2(cc.x - 5.0, cc.y - 5.0), pos2(cc.x + 5.0, cc.y + 5.0)], Stroke::new(1.2, TEXT_PRIMARY));
                        ui.painter().line_segment([pos2(cc.x + 5.0, cc.y - 5.0), pos2(cc.x - 5.0, cc.y + 5.0)], Stroke::new(1.2, TEXT_PRIMARY));
                        if close_resp.clicked() { action.close_window = true; }
                    });
            }
        } else {
            state.top_right_hover_start = None;
        }
    }

    if let Some(err) = error {
        ui.painter().text(layout.video.center(), Align2::CENTER_CENTER, err, font_outfit_medium(14.0), Color32::from_rgb(248, 113, 113));
    }

    // --- 8. F12 Debug Overlay (R4 + Section 7 frame-time graph) ---
    if ui.data(|d| d.get_temp::<bool>(debug_id)).unwrap_or(false) {
        let ms = frame_start.elapsed().as_secs_f32() * 1000.0;
        let fps = if ms > 0.01 { (1000.0 / ms).min(999.0) } else { 999.0 };
        let hist_id = Id::new("cnx_ft_hist");
        let mut hist = ui.data(|d| d.get_temp::<Vec<f32>>(hist_id)).unwrap_or_default();
        hist.push(ms);
        if hist.len() > 60 { hist.remove(0); }
        ui.data_mut(|d| d.insert_temp(hist_id, hist.clone()));

        for (r, col) in [
            (layout.title_bar, Color32::YELLOW),
            (layout.video, Color32::from_rgb(56, 189, 248)),
            (layout.title_block, Color32::GREEN),
            (layout.top_pill, Color32::GREEN),
            (layout.seek_row, Color32::from_rgb(244, 114, 182)),
            (layout.left_pill, Color32::GREEN),
            (layout.center_cluster, Color32::GREEN),
            (layout.right_pill, Color32::GREEN),
        ] {
            ui.painter().rect_stroke(r, CornerRadius::ZERO, Stroke::new(1.0, col), StrokeKind::Inside);
        }
        if let Some(pr) = layout.panel {
            ui.painter().rect_stroke(pr, CornerRadius::ZERO, Stroke::new(1.5, ACCENT), StrokeKind::Inside);
        }
        let dbg_r = Rect::from_min_size(pos2(win_rect.left() + 12.0, layout.video.top() + 68.0), vec2(210.0, 66.0));
        ui.painter().rect_filled(dbg_r, CornerRadius::same(8), Color32::from_rgba_unmultiplied(0, 0, 0, 200));
        ui.painter().text(
            pos2(dbg_r.left() + 8.0, dbg_r.top() + 8.0),
            Align2::LEFT_TOP,
            format!("CPU: {ms:.2} ms  ({fps:.0} fps)  ppp:{cur_ppp:.2}"),
            font_mono(10.5),
            if ms < 16.0 { Color32::from_rgb(74, 222, 128) } else { Color32::from_rgb(248, 113, 113) },
        );
        for (i, v) in hist.iter().enumerate() {
            let bh = (*v / 16.6 * 28.0).clamp(2.0, 28.0);
            let bx = dbg_r.left() + 8.0 + i as f32 * 3.2;
            let bar_col = if *v < 8.0 { Color32::from_rgb(74, 222, 128) } else if *v < 16.0 { ACCENT } else { Color32::RED };
            ui.painter().rect_filled(Rect::from_min_size(pos2(bx, dbg_r.bottom() - 6.0 - bh), vec2(2.5, bh)), CornerRadius::ZERO, bar_col);
        }
    }

    action
}

fn show_viewing_panel(
    ui: &mut Ui,
    p_rect: Rect,
    is_sheet: bool,
    snapshot: &PlayerSnapshot,
    state: &mut PlayerUiState,
    command_sender: &mut dyn FnMut(PlayerCommand),
    just_opened: bool,
) {
    if !just_opened && ui.input(|i| i.pointer.any_click()) {
        if let Some(p) = ui.input(|i| i.pointer.interact_pos()) {
            if !p_rect.contains(p) {
                state.panel = None;
                return;
            }
        }
    }

    // Pause playback while dragging Brightness/Contrast/Saturation/Gamma/Hue (panel stays fully visible)
    let dragging_pic_id = Id::new("cnx_dragging_pic");
    let was_dragging = ui.data(|d| d.get_temp::<bool>(dragging_pic_id)).unwrap_or(false);
    let mut is_dragging_now = false;

    egui::Area::new(Id::new("cnx_viewing_panel"))
        .order(Order::Foreground)
        .fixed_pos(p_rect.min)
        .constrain(false)
        .show(ui.ctx(), |ui| {
            ui.set_clip_rect(p_rect);
            let (outer_r, _) = ui.allocate_exact_size(p_rect.size(), Sense::hover());
            ui.painter().add(panel_shadow().as_shape(outer_r, CornerRadius::same(R_PANEL)));
            ui.painter().rect_filled(outer_r, CornerRadius::same(R_PANEL), SURFACE_PANEL);
            ui.painter().rect_stroke(outer_r, CornerRadius::same(R_PANEL), Stroke::new(1.0, BORDER_HAIRLINE), StrokeKind::Inside);

            let inner = outer_r.shrink(S18);
            let mut cui = ui.new_child(UiBuilder::new().max_rect(inner));
            cui.set_max_size(inner.size());

            if is_sheet {
                cui.horizontal(|ui| {
                    let (bk, b_resp) = ui.allocate_exact_size(vec2(28.0, 28.0), Sense::click());
                    draw_cnx_icon(ui.painter(), Rect::from_center_size(bk.center(), vec2(16.0, 16.0)), CnxIcon::Back, TEXT_PRIMARY, 1.75);
                    if b_resp.clicked() { state.panel = None; }
                    let hr = Rect::from_center_size(pos2(inner.center().x, bk.center().y), vec2(36.0, 4.0));
                    ui.painter().rect_filled(hr, CornerRadius::same(2), Color32::from_white_alpha(77));
                });
                cui.add_space(6.0);
            }

            let mut view_changed = false;
            let mut pic_changed = false;

            // Header (Bug 8: text ends 12px before Reset + Close)
            let header_w = inner.width();
            let btns_w = if state.viewing_tab <= 1 { 104.0 } else { 36.0 };
            let text_max_w = (header_w - btns_w - 12.0).max(80.0);
            cui.horizontal(|ui| {
                ui.allocate_ui_with_layout(vec2(text_max_w, 44.0), Layout::top_down(Align::Min), |ui| {
                    ui.label(RichText::new("Viewing options").font(font_outfit_semibold(17.0)).color(TEXT_PRIMARY));
                    let fname = snapshot.title.clone().unwrap_or_else(|| "Current media".into());
                    let g = layout_single_line(ui.ctx(), &format!("Tweak how '{fname}' looks"), font_outfit_regular(11.0), TEXT_SECONDARY, text_max_w);
                    ui.painter().galley(ui.cursor().min, g, TEXT_SECONDARY);
                });
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    let (cr, c_resp) = ui.allocate_exact_size(vec2(32.0, 32.0), Sense::click());
                    if c_resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
                    ui.painter().circle_filled(cr.center(), 16.0, if c_resp.hovered() { SURFACE_HOVER } else { SURFACE_RAISED });
                    draw_cnx_icon(ui.painter(), Rect::from_center_size(cr.center(), vec2(14.0, 14.0)), CnxIcon::CloseX, TEXT_PRIMARY, 1.75);
                    if c_resp.clicked() { state.panel = None; }
                    if state.viewing_tab <= 1 {
                        ui.add_space(8.0);
                        let (rr, r_resp) = ui.allocate_exact_size(vec2(60.0, 30.0), Sense::click());
                        if r_resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
                        ui.painter().rect_filled(rr, CornerRadius::same(R_BTN), if r_resp.hovered() { SURFACE_HOVER } else { SURFACE_RAISED });
                        ui.painter().text(rr.center(), Align2::CENTER_CENTER, "Reset", font_outfit_semibold(12.0), TEXT_PRIMARY);
                        if r_resp.clicked() {
                            state.viewing_preset = "off".into();
                            state.picture_lighting = 0;
                            state.picture_contrast = 0;
                            state.picture_vibrance = 0;
                            state.picture_shadows = 0;
                            state.picture_hue = 0;
                            state.picture_fit_mode = "fill".into();
                            state.view_aspect = "auto".into();
                            state.view_zoom = 0.0;
                            state.view_panscan = 1.0;
                            state.view_ab_a = None;
                            state.view_ab_b = None;
                            pic_changed = true;
                            view_changed = true;
                        }
                    }
                });
            });
            cui.add_space(12.0);

            if let Some(next_t) = cnx_segmented(
                &mut cui,
                Id::new("view_tabs"),
                &[
                    (Some(CnxIcon::VideoTab), "Video"),
                    (Some(CnxIcon::PlaybackTab), "Playback"),
                    (Some(CnxIcon::ChaptersTab), "Chapters"),
                    (Some(CnxIcon::InfoTab), "Info"),
                ],
                state.viewing_tab as usize,
                inner.width(),
                false,
            ) {
                state.viewing_tab = next_t as u8;
            }
            cui.add_space(12.0);

            let body_h = cui.available_height().max(80.0);
            egui::ScrollArea::vertical().max_height(body_h).auto_shrink([false, false]).show(&mut cui, |ui| {
                match state.viewing_tab {
                    0 => {
                        // All presets & sliders UNLOCKED (10-bit restriction removed per user request)
                        ui.label(RichText::new("Preset").font(font_outfit_regular(11.0)).color(TEXT_SECONDARY));
                        ui.add_space(8.0);
                        ui.horizontal_wrapped(|ui| {
                            ui.spacing_mut().item_spacing = vec2(8.0, 8.0);
                            for (id, lbl, l, c, v, g) in [
                                ("off", "Off", 0, 0, 0, 0),
                                ("cinema", "Cinema", -4, 10, 8, 4),
                                ("vivid", "Vivid", 4, 14, 24, 2),
                                ("darkroom", "Dark room", -8, 12, 4, 10),
                                ("sports", "Sports", 6, 10, 16, 0),
                            ] {
                                if cnx_chip_button(ui, lbl, state.viewing_preset == id, false) {
                                    state.viewing_preset = id.into();
                                    state.picture_lighting = l;
                                    state.picture_contrast = c;
                                    state.picture_vibrance = v;
                                    state.picture_shadows = g;
                                    pic_changed = true;
                                }
                            }
                        });
                        ui.add_space(16.0);

                        let dragging_any = ui.input(|i| i.pointer.primary_down());
                        ui.columns(2, |cols| {
                            if cnx_bipolar_slider(&mut cols[0], Id::new("sl_br"), "Brightness", &mut state.picture_lighting, -100, 100, false) {
                                pic_changed = true;
                                if dragging_any { is_dragging_now = true; }
                            }
                            cols[0].add_space(12.0);
                            if cnx_bipolar_slider(&mut cols[0], Id::new("sl_sat"), "Saturation", &mut state.picture_vibrance, -100, 100, false) {
                                pic_changed = true;
                                if dragging_any { is_dragging_now = true; }
                            }
                            cols[0].add_space(12.0);
                            if cnx_bipolar_slider(&mut cols[0], Id::new("sl_hue"), "Hue", &mut state.picture_hue, -100, 100, false) {
                                pic_changed = true;
                                if dragging_any { is_dragging_now = true; }
                            }

                            if cnx_bipolar_slider(&mut cols[1], Id::new("sl_con"), "Contrast", &mut state.picture_contrast, -100, 100, false) {
                                pic_changed = true;
                                if dragging_any { is_dragging_now = true; }
                            }
                            cols[1].add_space(12.0);
                            if cnx_bipolar_slider(&mut cols[1], Id::new("sl_gam"), "Gamma", &mut state.picture_shadows, -100, 100, false) {
                                pic_changed = true;
                                if dragging_any { is_dragging_now = true; }
                            }
                        });
                        if is_dragging_now && !was_dragging {
                            if snapshot.state == PlaybackState::Playing {
                                state.picture_was_playing_before_drag = true;
                                command_sender(PlayerCommand::Pause { token: snapshot.token });
                            }
                        } else if !dragging_any && was_dragging && state.picture_was_playing_before_drag {
                            state.picture_was_playing_before_drag = false;
                            command_sender(PlayerCommand::Play { token: snapshot.token });
                        }
                        ui.data_mut(|d| {
                            d.insert_temp(dragging_pic_id, dragging_any && (was_dragging || is_dragging_now));
                        });

                        ui.add_space(16.0);
                        ui.label(RichText::new("Picture fit").font(font_outfit_regular(11.0)).color(TEXT_SECONDARY));
                        ui.add_space(8.0);
                        let fit_idx = match state.picture_fit_mode.as_str() {
                            "fit" => 0, "fill" => 1, "100" => 2, "150" => 3, _ => 4,
                        };
                        if let Some(picked) = cnx_segmented(
                            ui,
                            Id::new("pic_fit_seg"),
                            &[(None, "Fit"), (None, "Fill"), (None, "100%"), (None, "150%"), (None, "Stretch")],
                            fit_idx,
                            ui.available_width(),
                            false,
                        ) {
                            let modes = ["fit", "fill", "100", "150", "stretch"];
                            state.picture_fit_mode = modes[picked].into();
                            match picked {
                                0 => { state.view_panscan = 0.0; state.view_zoom = 0.0; command_sender(PlayerCommand::SetKeepAspect { token: snapshot.token, keep: true }); }
                                1 => { state.view_panscan = 1.0; state.view_zoom = 0.0; command_sender(PlayerCommand::SetKeepAspect { token: snapshot.token, keep: true }); }
                                2 => { state.view_panscan = 0.0; state.view_zoom = 0.0; command_sender(PlayerCommand::SetKeepAspect { token: snapshot.token, keep: true }); }
                                3 => { state.view_panscan = 0.0; state.view_zoom = 0.585; command_sender(PlayerCommand::SetKeepAspect { token: snapshot.token, keep: true }); }
                                _ => { state.view_panscan = 0.0; state.view_zoom = 0.0; command_sender(PlayerCommand::SetKeepAspect { token: snapshot.token, keep: false }); }
                            }
                            view_changed = true;
                        }
                    }
                    1 => {
                        ui.horizontal(|ui| {
                            ui.label(RichText::new("Playback speed").font(font_outfit_medium(13.0)).color(TEXT_PRIMARY));
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                ui.label(RichText::new(format!("{:.2}×", snapshot.speed)).font(font_mono(11.0)).color(ACCENT));
                            });
                        });
                        ui.add_space(8.0);
                        let speeds = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
                        let sp_idx = speeds.iter().position(|&s| (s - snapshot.speed).abs() < 0.05).unwrap_or(2);
                        if let Some(p) = cnx_segmented(
                            ui,
                            Id::new("pb_speed_seg"),
                            &[(None, "0.5×"), (None, "0.75×"), (None, "1×"), (None, "1.25×"), (None, "1.5×"), (None, "2×")],
                            sp_idx,
                            ui.available_width(),
                            true,
                        ) {
                            command_sender(PlayerCommand::SetSpeed { token: snapshot.token, speed: speeds[p] });
                        }
                        ui.add_space(12.0);
                        ui.horizontal(|ui| {
                            ui.set_height(47.0);
                            ui.label(RichText::new("Repeat").font(font_outfit_medium(13.0)).color(TEXT_PRIMARY));
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                let cur = match snapshot.repeat { RepeatMode::Off => "Play next", RepeatMode::One => "Repeat one", RepeatMode::All => "Repeat all" };
                                if let Some(i) = cnx_select(ui, Id::new("rep_sel"), 208.0, 32.0, cur, &["Play next", "Repeat one", "Repeat all"], false) {
                                    let mode = match i { 1 => RepeatMode::One, 2 => RepeatMode::All, _ => RepeatMode::Off };
                                    command_sender(PlayerCommand::SetRepeat { token: snapshot.token, mode });
                                }
                            });
                        });
                        ui.painter().hline(ui.available_rect_before_wrap().x_range(), round_px(ui, ui.cursor().top()), Stroke::new(1.0, BORDER_HAIRLINE));
                        ui.horizontal(|ui| {
                            ui.set_height(47.0);
                            ui.label(RichText::new("A-B repeat").font(font_outfit_medium(13.0)).color(TEXT_PRIMARY));
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                let has_a = state.view_ab_a.is_some();
                                let (br, b_resp) = ui.allocate_exact_size(vec2(104.0, 30.0), if has_a { Sense::click() } else { Sense::hover() });
                                ui.painter().rect_filled(br, CornerRadius::same(R_BTN), SURFACE_RAISED);
                                ui.painter().text(br.center(), Align2::CENTER_CENTER, "Set point B", font_outfit_medium(12.0), if has_a { TEXT_PRIMARY } else { TEXT_DISABLED });
                                if has_a && b_resp.clicked() { state.view_ab_b = Some(snapshot.position_secs); view_changed = true; }
                                ui.add_space(8.0);
                                let (ar, a_resp) = ui.allocate_exact_size(vec2(104.0, 30.0), Sense::click());
                                ui.painter().rect_filled(ar, CornerRadius::same(R_BTN), if a_resp.hovered() { SURFACE_HOVER } else { SURFACE_RAISED });
                                ui.painter().text(ar.center(), Align2::CENTER_CENTER, "Set point A", font_outfit_medium(12.0), TEXT_PRIMARY);
                                if a_resp.clicked() { state.view_ab_a = Some(snapshot.position_secs); view_changed = true; }
                            });
                        });
                        ui.painter().hline(ui.available_rect_before_wrap().x_range(), round_px(ui, ui.cursor().top()), Stroke::new(1.0, BORDER_HAIRLINE));
                        ui.horizontal(|ui| {
                            ui.set_height(47.0);
                            ui.label(RichText::new("Audio Only").font(font_outfit_medium(13.0)).color(TEXT_PRIMARY));
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| { cnx_toggle(ui, Id::new("aud_only_tog"), &mut state.audio_only); });
                        });
                    }
                    2 => {
                        if snapshot.chapters.is_empty() {
                            ui.add_space(40.0);
                            ui.vertical_centered(|ui| { ui.label(RichText::new("No chapters").font(font_outfit_regular(13.0)).color(TEXT_SECONDARY)); });
                        } else {
                            for ch in &snapshot.chapters {
                                let (rr, r_resp) = ui.allocate_exact_size(vec2(ui.available_width(), 40.0), Sense::click());
                                let active = snapshot.position_secs >= ch.start_secs;
                                if active { ui.painter().rect_filled(rr, CornerRadius::same(R_ROW), ACCENT_TINT); }
                                else if r_resp.hovered() { ui.painter().rect_filled(rr, CornerRadius::same(R_ROW), SURFACE_HOVER); }
                                ui.painter().text(pos2(rr.left() + 12.0, rr.center().y), Align2::LEFT_CENTER, fmt_time_hms(ch.start_secs, false), font_mono(12.0), ACCENT);
                                let g = layout_single_line(ui.ctx(), &ch.title, font_outfit_medium(13.0), TEXT_PRIMARY, (rr.width() - 84.0).max(40.0));
                                ui.painter().galley(pos2(rr.left() + 72.0, rr.center().y - g.size().y * 0.5), g, TEXT_PRIMARY);
                                if r_resp.clicked() { command_sender(PlayerCommand::Seek { token: snapshot.token, seconds: ch.start_secs, exact: true }); }
                            }
                        }
                    }
                    _ => {
                        // Info tab (Bug 1 & Bug 8: 120px key, middle-ellipsized value, click copies, all 9 rows scrollable)
                        let fname = snapshot.path.as_ref().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "—".into());
                        let loc = snapshot.path.as_ref().and_then(|p| p.parent()).map(|d| d.to_string_lossy().to_string()).unwrap_or_else(|| "—".into());
                        let size_s = if snapshot.file_size_bytes > 0 { format!("{:.2} GB", snapshot.file_size_bytes as f64 / 1_073_741_824.0) } else { "—".into() };
                        let dur_s = fmt_time_hms(snapshot.duration_secs, false);
                        let res_s = if snapshot.video_width > 0 { format!("{} × {}", snapshot.video_width, snapshot.video_height) } else { "—".into() };
                        let fps_s = if snapshot.video_fps > 0.0 { format!("{:.3} fps", snapshot.video_fps) } else { "—".into() };
                        let codec_s = snapshot.video_codec.clone().unwrap_or_else(|| "—".into());
                        let aud_s = snapshot.tracks.iter().filter(|t| t.kind == "audio").count().to_string();
                        let sub_s = snapshot.tracks.iter().filter(|t| t.kind == "sub").count().to_string();
                        let row_w = ui.available_width();
                        let val_max_w = (row_w - 132.0).max(80.0);
                        for (k, v) in [
                            ("File", fname), ("Location", loc), ("Size", size_s), ("Duration", dur_s),
                            ("Video resolution", res_s), ("Video framerate", fps_s), ("Video codec", codec_s),
                            ("Audio streams", aud_s), ("Text streams", sub_s),
                        ] {
                            let g = elide_middle(ui.ctx(), &v, font_outfit_medium(13.0), val_max_w);
                            let rh = (g.size().y + 16.0).max(44.0);
                            let (rr, r_resp) = ui.allocate_exact_size(vec2(row_w, rh), Sense::click());
                            if r_resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
                            ui.painter().text(pos2(rr.left(), rr.center().y), Align2::LEFT_CENTER, k, font_outfit_regular(12.0), TEXT_SECONDARY);
                            ui.painter().galley(pos2(rr.right() - g.size().x, rr.center().y - g.size().y * 0.5), g, TEXT_PRIMARY);
                            ui.painter().hline(rr.x_range(), round_px(ui, rr.bottom()), Stroke::new(1.0, BORDER_HAIRLINE));
                            if r_resp.clicked() {
                                ui.ctx().copy_text(v.clone());
                            }
                            r_resp.on_hover_text(v);
                        }
                        ui.add_space(10.0);
                        if ui.add(egui::Label::new(RichText::new("Open-source licences").font(font_outfit_medium(12.5)).color(ACCENT)).sense(Sense::click())).clicked() {
                            state.licences_dialog_open = true;
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
        });
}

fn show_subs_audio_panel(
    ui: &mut Ui,
    p_rect: Rect,
    is_sheet: bool,
    snapshot: &PlayerSnapshot,
    state: &mut PlayerUiState,
    action: &mut PlayerUiAction,
    command_sender: &mut dyn FnMut(PlayerCommand),
    just_opened: bool,
) {
    if !just_opened && ui.input(|i| i.pointer.any_click()) {
        if let Some(p) = ui.input(|i| i.pointer.interact_pos()) {
            if !p_rect.contains(p) {
                state.subtitles_popup_open = false;
                return;
            }
        }
    }
    let single_pane = p_rect.width() < 560.0;

    egui::Area::new(Id::new("cnx_subs_audio_panel"))
        .order(Order::Foreground)
        .fixed_pos(p_rect.min)
        .constrain(false)
        .show(ui.ctx(), |ui| {
            ui.set_clip_rect(p_rect);
            let (outer_r, _) = ui.allocate_exact_size(p_rect.size(), Sense::hover());
            ui.painter().add(panel_shadow().as_shape(outer_r, CornerRadius::same(R_PANEL)));
            ui.painter().rect_filled(outer_r, CornerRadius::same(R_PANEL), SURFACE_PANEL);
            ui.painter().rect_stroke(outer_r, CornerRadius::same(R_PANEL), Stroke::new(1.0, BORDER_HAIRLINE), StrokeKind::Inside);

            let inner = outer_r.shrink(S18);
            let mut cui = ui.new_child(UiBuilder::new().max_rect(inner));
            cui.set_max_size(inner.size());

            if is_sheet {
                cui.horizontal(|ui| {
                    let (bk, b_resp) = ui.allocate_exact_size(vec2(28.0, 28.0), Sense::click());
                    draw_cnx_icon(ui.painter(), Rect::from_center_size(bk.center(), vec2(16.0, 16.0)), CnxIcon::Back, TEXT_PRIMARY, 1.75);
                    if b_resp.clicked() { state.subtitles_popup_open = false; }
                    let hr = Rect::from_center_size(pos2(inner.center().x, bk.center().y), vec2(36.0, 4.0));
                    ui.painter().rect_filled(hr, CornerRadius::same(2), Color32::from_white_alpha(77));
                });
                cui.add_space(6.0);
            }

            cui.horizontal(|ui| {
                let cur_tab = if state.tracks_popover_tab == 0 { 1 } else { 0 };
                if let Some(picked) = cnx_segmented(
                    ui,
                    Id::new("sa_tabs"),
                    &[(Some(CnxIcon::Captions), "Subtitles"), (Some(CnxIcon::Volume), "Audio")],
                    cur_tab,
                    212.0,
                    false,
                ) {
                    state.tracks_popover_tab = if picked == 0 { 1 } else { 0 };
                }
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    let (cr, c_resp) = ui.allocate_exact_size(vec2(32.0, 32.0), Sense::click());
                    if c_resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
                    ui.painter().circle_filled(cr.center(), 16.0, if c_resp.hovered() { SURFACE_HOVER } else { SURFACE_RAISED });
                    draw_cnx_icon(ui.painter(), Rect::from_center_size(cr.center(), vec2(14.0, 14.0)), CnxIcon::CloseX, TEXT_PRIMARY, 1.75);
                    if c_resp.clicked() { state.subtitles_popup_open = false; }
                    ui.add_space(8.0);
                    let (rr, r_resp) = ui.allocate_exact_size(vec2(60.0, 30.0), Sense::click());
                    if r_resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
                    ui.painter().rect_filled(rr, CornerRadius::same(R_BTN), if r_resp.hovered() { SURFACE_HOVER } else { SURFACE_RAISED });
                    ui.painter().text(rr.center(), Align2::CENTER_CENTER, "Reset", font_outfit_semibold(12.0), TEXT_PRIMARY);
                    if r_resp.clicked() {
                        state.audio_delay_secs = 0.0;
                        state.sub_delay_secs = 0.0;
                        state.eq_bands = [0.0; 10];
                        state.eq_preset = "Disabled".into();
                        command_sender(PlayerCommand::SetAudioDelay { token: snapshot.token, secs: 0.0 });
                        command_sender(PlayerCommand::SetSubDelay { token: snapshot.token, secs: 0.0 });
                        command_sender(PlayerCommand::SetEqualizer { token: snapshot.token, bands_db: [0.0; 10] });
                    }
                });
            });
            cui.add_space(12.0);
            cui.painter().hline(inner.x_range(), round_px(&cui, cui.cursor().top()), Stroke::new(1.0, BORDER_HAIRLINE));
            cui.add_space(12.0);

            let is_subs = state.tracks_popover_tab != 0;
            let kind = if is_subs { "sub" } else { "audio" };
            let tracks: Vec<&PlayerTrack> = snapshot.tracks.iter().filter(|t| t.kind == kind).collect();
            let mut counts: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
            let track_labels: Vec<String> = tracks.iter().map(|tr| {
                let raw = format_track_label(tr, 1);
                let c = counts.entry(raw.clone()).or_insert(0);
                *c += 1;
                if *c > 1 { format!("{raw} ({c})") } else { raw }
            }).collect();

            let body_h = cui.available_height().max(80.0);
            if single_pane {
                let mut right_ui = cui.new_child(UiBuilder::new().max_rect(Rect::from_min_size(cui.cursor().min, vec2(inner.width(), body_h))));
                egui::ScrollArea::vertical().max_height(body_h).auto_shrink([false, false]).show(&mut right_ui, |ui| {
                    let sel_lbl = tracks.iter().zip(track_labels.iter()).find(|(t, _)| t.selected).map(|(_, l)| l.as_str()).unwrap_or(if is_subs { "Off" } else { "Track" });
                    let opts: Vec<&str> = track_labels.iter().map(|s| s.as_str()).collect();
                    if let Some(i) = cnx_select(ui, Id::new("mob_tr_sel"), ui.available_width(), 34.0, sel_lbl, &opts, opts.is_empty()) {
                        if let Some(tr) = tracks.get(i) {
                            command_sender(PlayerCommand::SelectTrack { token: snapshot.token, id: tr.id });
                        }
                    }
                    ui.add_space(16.0);
                    render_sa_right_pane(ui, is_subs, snapshot, state, command_sender);
                });
            } else {
                let left_rect = Rect::from_min_size(cui.cursor().min, vec2(200.0, body_h));
                let div_x = round_px(&cui, left_rect.right() + 8.0);
                cui.painter().vline(div_x, left_rect.top()..=left_rect.bottom(), Stroke::new(1.0, BORDER_HAIRLINE));
                let right_rect = Rect::from_min_max(pos2(div_x + 18.0, left_rect.top()), pos2(inner.right(), left_rect.bottom()));

                // Left pane: 200px fixed, "+ Add external subtitle" pinned at bottom
                let mut left_ui = cui.new_child(UiBuilder::new().max_rect(left_rect));
                left_ui.set_max_size(left_rect.size());
                left_ui.label(RichText::new(if is_subs { "Subtitle track" } else { "Audio track" }).font(font_outfit_regular(11.0)).color(TEXT_SECONDARY));
                left_ui.add_space(8.0);
                let footer_h = if is_subs { 34.0 } else { 0.0 };
                let list_h = (left_ui.available_height() - footer_h).max(40.0);
                egui::ScrollArea::vertical().id_salt("sa_left_scroll").max_height(list_h).auto_shrink([false, false]).show(&mut left_ui, |ui| {
                    if is_subs {
                        let off_sel = !tracks.iter().any(|t| t.selected);
                        let (rr, r_resp) = ui.allocate_exact_size(vec2(196.0, 36.0), Sense::click());
                        if r_resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
                        if off_sel { ui.painter().rect_filled(rr, CornerRadius::same(R_ROW), ACCENT_CONTAINER); }
                        else if r_resp.hovered() { ui.painter().rect_filled(rr, CornerRadius::same(R_ROW), SURFACE_HOVER); }
                        ui.painter().text(pos2(rr.left() + 12.0, rr.center().y), Align2::LEFT_CENTER, "Off", font_outfit_medium(13.0), if off_sel { ACCENT_CONTAINER_TEXT } else { TEXT_PRIMARY });
                        if off_sel {
                            draw_cnx_icon(ui.painter(), Rect::from_center_size(pos2(rr.right() - 16.0, rr.center().y), vec2(16.0, 16.0)), CnxIcon::Check, ACCENT_CONTAINER_TEXT, 1.8);
                        }
                        if r_resp.clicked() { command_sender(PlayerCommand::DisableSubtitles { token: snapshot.token }); }
                        ui.add_space(4.0);
                    }
                    for (tr, lbl) in tracks.iter().zip(track_labels.iter()) {
                        let (rr, r_resp) = ui.allocate_exact_size(vec2(196.0, 36.0), Sense::click());
                        if r_resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
                        if tr.selected { ui.painter().rect_filled(rr, CornerRadius::same(R_ROW), ACCENT_CONTAINER); }
                        else if r_resp.hovered() { ui.painter().rect_filled(rr, CornerRadius::same(R_ROW), SURFACE_HOVER); }
                        let max_tw = if tr.selected { 154.0 } else { 172.0 };
                        let g = layout_single_line(ui.ctx(), lbl, font_outfit_medium(13.0), if tr.selected { ACCENT_CONTAINER_TEXT } else { TEXT_PRIMARY }, max_tw);
                        ui.painter().galley(pos2(rr.left() + 12.0, rr.center().y - g.size().y * 0.5), g, TEXT_PRIMARY);
                        if tr.selected {
                            draw_cnx_icon(ui.painter(), Rect::from_center_size(pos2(rr.right() - 16.0, rr.center().y), vec2(16.0, 16.0)), CnxIcon::Check, ACCENT_CONTAINER_TEXT, 1.8);
                        }
                        if r_resp.clicked() { command_sender(PlayerCommand::SelectTrack { token: snapshot.token, id: tr.id }); }
                        ui.add_space(4.0);
                    }
                });
                if is_subs {
                    left_ui.add_space(6.0);
                    if left_ui.add(egui::Label::new(RichText::new("+ Add external subtitle").font(font_outfit_medium(13.0)).color(ACCENT)).sense(Sense::click())).clicked() {
                        action.choose_subtitle = true;
                        state.subtitles_popup_open = false;
                    }
                }

                // Right pane: top_down, 20px vertical gaps, clipped to right_rect
                let mut right_ui = cui.new_child(UiBuilder::new().max_rect(right_rect));
                right_ui.set_max_size(right_rect.size());
                egui::ScrollArea::vertical().id_salt("sa_right_scroll").max_height(right_rect.height()).auto_shrink([false, false]).show(&mut right_ui, |ui| {
                    render_sa_right_pane(ui, is_subs, snapshot, state, command_sender);
                });
            }
        });
}

fn render_sa_right_pane(
    ui: &mut Ui,
    is_subs: bool,
    snapshot: &PlayerSnapshot,
    state: &mut PlayerUiState,
    command_sender: &mut dyn FnMut(PlayerCommand),
) {
    let pane_w = ui.available_width();
    if is_subs {
        // 1. Subtitle delay
        ui.horizontal(|ui| {
            ui.set_width(pane_w);
            ui.label(RichText::new("Subtitle delay").font(font_outfit_medium(13.0)).color(TEXT_PRIMARY));
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                let (pr, p_resp) = ui.allocate_exact_size(vec2(32.0, 32.0), Sense::click());
                ui.painter().circle_filled(pr.center(), 16.0, if p_resp.hovered() { SURFACE_HOVER } else { SURFACE_RAISED });
                draw_cnx_icon(ui.painter(), Rect::from_center_size(pr.center(), vec2(14.0, 14.0)), CnxIcon::Plus, TEXT_PRIMARY, 1.75);
                if p_resp.clicked() {
                    state.sub_delay_secs = (state.sub_delay_secs + 0.1).clamp(-30.0, 30.0);
                    command_sender(PlayerCommand::SetSubDelay { token: snapshot.token, secs: state.sub_delay_secs });
                }
                let (vr, _) = ui.allocate_exact_size(vec2(60.0, 32.0), Sense::hover());
                ui.painter().text(vr.center(), Align2::CENTER_CENTER, format!("{:.0} ms", state.sub_delay_secs * 1000.0), font_mono(11.0), ACCENT);
                let (mr, m_resp) = ui.allocate_exact_size(vec2(32.0, 32.0), Sense::click());
                ui.painter().circle_filled(mr.center(), 16.0, if m_resp.hovered() { SURFACE_HOVER } else { SURFACE_RAISED });
                draw_cnx_icon(ui.painter(), Rect::from_center_size(mr.center(), vec2(14.0, 14.0)), CnxIcon::Minus, TEXT_PRIMARY, 1.75);
                if m_resp.clicked() {
                    state.sub_delay_secs = (state.sub_delay_secs - 0.1).clamp(-30.0, 30.0);
                    command_sender(PlayerCommand::SetSubDelay { token: snapshot.token, secs: state.sub_delay_secs });
                }
            });
        });
        ui.add_space(20.0);

        // 2. Subtitle style override (label left, toggle right, same baseline, max_w = pane_w - 52)
        ui.horizontal(|ui| {
            ui.set_width(pane_w);
            let g = layout_single_line(ui.ctx(), "Subtitle style override", font_outfit_medium(13.0), TEXT_PRIMARY, (pane_w - 52.0).max(80.0));
            let (lr, _) = ui.allocate_exact_size(vec2((pane_w - 52.0).max(80.0), 22.0), Sense::hover());
            ui.painter().galley(pos2(lr.left(), lr.center().y - g.size().y * 0.5), g, TEXT_PRIMARY);
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                cnx_toggle(ui, Id::new("sub_ov_tog"), &mut state.sub_style_override);
            });
        });
        ui.add_space(20.0);

        // 3. Text size
        ui.label(RichText::new("Text size").font(font_outfit_regular(11.0)).color(TEXT_SECONDARY));
        ui.add_space(8.0);
        let mut look_changed = false;
        ui.horizontal(|ui| {
            ui.spacing_mut().item_spacing = vec2(20.0, 0.0);
            for (sz, scale_v) in [(12.0_f32, 0.65_f64), (15.0, 0.85), (18.0, 1.0), (22.0, 1.3), (26.0, 1.65)] {
                let sel = (state.sub_scale - scale_v).abs() < 0.12;
                let (r, resp) = ui.allocate_exact_size(vec2(28.0, 32.0), Sense::click());
                ui.painter().text(r.center(), Align2::CENTER_CENTER, "Aa", font_outfit_medium(sz), if sel { TEXT_PRIMARY } else { TEXT_SECONDARY });
                if sel {
                    ui.painter().line_segment([pos2(r.center().x - 7.0, r.bottom()), pos2(r.center().x + 7.0, r.bottom())], Stroke::new(2.0, ACCENT));
                }
                if resp.clicked() { state.sub_scale = scale_v; look_changed = true; }
            }
        });
        ui.add_space(20.0);

        // 4. Text colour
        ui.label(RichText::new("Text colour").font(font_outfit_regular(11.0)).color(TEXT_SECONDARY));
        ui.add_space(8.0);
        ui.horizontal_wrapped(|ui| {
            ui.spacing_mut().item_spacing = vec2(8.0, 8.0);
            for (hex, lbl, col) in [
                ("#FFFFFFFF", "Original", Color32::WHITE),
                ("#FFF8F8F8", "White", Color32::WHITE),
                ("#FFF5D547", "Yellow", Color32::from_rgb(0xF5, 0xD5, 0x47)),
                ("#FF4ADE80", "Green", Color32::from_rgb(0x4A, 0xDE, 0x80)),
                ("#FF60A5FA", "Blue", Color32::from_rgb(0x60, 0xA5, 0xFA)),
                ("#FFF87171", "Red", Color32::from_rgb(0xF8, 0x71, 0x71)),
            ] {
                ui.vertical(|ui| {
                    let (tr, resp) = ui.allocate_exact_size(vec2(42.0, 40.0), Sense::click());
                    ui.painter().rect_filled(tr, CornerRadius::same(R_ROW), SURFACE_RAISED);
                    if state.sub_color == hex { ui.painter().rect_stroke(tr, CornerRadius::same(R_ROW), Stroke::new(2.0, ACCENT), StrokeKind::Inside); }
                    ui.painter().text(tr.center(), Align2::CENTER_CENTER, "Aa", font_outfit_semibold(15.0), col);
                    ui.label(RichText::new(lbl).font(font_outfit_regular(10.0)).color(TEXT_SECONDARY));
                    if resp.clicked() { state.sub_color = hex.into(); look_changed = true; }
                });
            }
        });
        ui.add_space(20.0);

        // 5. Text style
        ui.label(RichText::new("Text style").font(font_outfit_regular(11.0)).color(TEXT_SECONDARY));
        ui.add_space(8.0);
        ui.horizontal(|ui| {
            ui.spacing_mut().item_spacing = vec2(8.0, 0.0);
            for (idx, lbl) in [(0u8, "Bold"), (1, "Outline"), (2, "Shadow"), (3, "Box")] {
                ui.vertical(|ui| {
                    let (tr, resp) = ui.allocate_exact_size(vec2(56.0, 40.0), Sense::click());
                    ui.painter().rect_filled(tr, CornerRadius::same(R_ROW), if idx == 3 { Color32::BLACK } else { SURFACE_RAISED });
                    if state.sub_text_style == idx { ui.painter().rect_stroke(tr, CornerRadius::same(R_ROW), Stroke::new(2.0, ACCENT), StrokeKind::Inside); }
                    ui.painter().text(tr.center(), Align2::CENTER_CENTER, "Aa", font_outfit_semibold(15.0), TEXT_PRIMARY);
                    ui.label(RichText::new(lbl).font(font_outfit_regular(10.0)).color(TEXT_SECONDARY));
                    if resp.clicked() {
                        state.sub_text_style = idx;
                        state.sub_bold = idx == 0;
                        state.sub_box_bg = idx == 3;
                        look_changed = true;
                    }
                });
            }
        });
        ui.add_space(20.0);

        // 6. Vertical position
        let mut pos_i = state.sub_pos as i32;
        if cnx_bipolar_slider(ui, Id::new("sub_vpos"), "Vertical position", &mut pos_i, 50, 100, false) {
            state.sub_pos = i64::from(pos_i);
            look_changed = true;
        }
        ui.add_space(20.0);
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
    } else {
        // AUDIO right pane
        ui.horizontal(|ui| {
            ui.set_width(pane_w);
            ui.label(RichText::new("Audio delay").font(font_outfit_medium(13.0)).color(TEXT_PRIMARY));
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                let (pr, p_resp) = ui.allocate_exact_size(vec2(32.0, 32.0), Sense::click());
                ui.painter().circle_filled(pr.center(), 16.0, if p_resp.hovered() { SURFACE_HOVER } else { SURFACE_RAISED });
                draw_cnx_icon(ui.painter(), Rect::from_center_size(pr.center(), vec2(14.0, 14.0)), CnxIcon::Plus, TEXT_PRIMARY, 1.75);
                if p_resp.clicked() {
                    state.audio_delay_secs = (state.audio_delay_secs + 0.05).clamp(-10.0, 10.0);
                    command_sender(PlayerCommand::SetAudioDelay { token: snapshot.token, secs: state.audio_delay_secs });
                }
                let (vr, _) = ui.allocate_exact_size(vec2(60.0, 32.0), Sense::hover());
                ui.painter().text(vr.center(), Align2::CENTER_CENTER, format!("{:.0} ms", state.audio_delay_secs * 1000.0), font_mono(11.0), ACCENT);
                let (mr, m_resp) = ui.allocate_exact_size(vec2(32.0, 32.0), Sense::click());
                ui.painter().circle_filled(mr.center(), 16.0, if m_resp.hovered() { SURFACE_HOVER } else { SURFACE_RAISED });
                draw_cnx_icon(ui.painter(), Rect::from_center_size(mr.center(), vec2(14.0, 14.0)), CnxIcon::Minus, TEXT_PRIMARY, 1.75);
                if m_resp.clicked() {
                    state.audio_delay_secs = (state.audio_delay_secs - 0.05).clamp(-10.0, 10.0);
                    command_sender(PlayerCommand::SetAudioDelay { token: snapshot.token, secs: state.audio_delay_secs });
                }
            });
        });
        ui.add_space(20.0);
        ui.horizontal(|ui| {
            ui.set_width(pane_w);
            ui.label(RichText::new("Equaliser").font(font_outfit_medium(13.0)).color(TEXT_PRIMARY));
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                let presets = ["Disabled", "Cinema", "Music", "Voice", "Bass"];
                if let Some(i) = cnx_select(ui, Id::new("eq_pre_sel"), 208.0_f32.min(pane_w - 80.0), 32.0, &state.eq_preset, &presets, false) {
                    state.eq_preset = presets[i].into();
                    state.eq_bands = match i {
                        1 => [3.0, 2.0, 1.0, 0.0, 0.0, 1.0, 2.0, 2.0, 1.0, 1.0],
                        2 => [4.0, 3.0, 1.0, 0.0, -1.0, 0.0, 2.0, 3.0, 3.0, 2.0],
                        3 => [-2.0, -1.0, 0.0, 2.0, 4.0, 4.0, 3.0, 1.0, 0.0, -1.0],
                        4 => [6.0, 5.0, 4.0, 2.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
                        _ => [0.0; 10],
                    };
                    command_sender(PlayerCommand::SetEqualizer { token: snapshot.token, bands_db: state.eq_bands });
                }
            });
        });
        ui.add_space(12.0);

        let freqs = ["32", "64", "125", "250", "500", "1K", "2K", "4K", "8K", "16K"];
        let mut eq_changed = false;
        let band_w = ((pane_w - 36.0) / 10.0).max(20.0);
        ui.horizontal(|ui| {
            ui.spacing_mut().item_spacing = vec2(4.0, 0.0);
            for (i, fl) in freqs.iter().enumerate() {
                ui.vertical(|ui| {
                    let (sr, s_resp) = ui.allocate_exact_size(vec2(band_w, 80.0), Sense::click_and_drag());
                    if s_resp.dragged() || s_resp.clicked() {
                        if let Some(p) = ui.input(|inp| inp.pointer.interact_pos()) {
                            let frac = (1.0_f32 - (p.y - sr.top()) / 80.0).clamp(0.0, 1.0);
                            state.eq_bands[i] = (frac * 24.0 - 12.0).round();
                            state.eq_preset = "Custom".into();
                            eq_changed = true;
                        }
                    }
                    let cx = sr.center().x;
                    let cy = sr.center().y;
                    ui.painter().line_segment([pos2(cx, sr.top() + 4.0), pos2(cx, sr.bottom() - 4.0)], Stroke::new(3.0, TRACK_INACTIVE_SMALL));
                    let frac = ((state.eq_bands[i] + 12.0) / 24.0).clamp(0.0, 1.0);
                    let ty = sr.bottom() - 4.0 - frac * 72.0;
                    ui.painter().line_segment([pos2(cx, cy), pos2(cx, ty)], Stroke::new(3.0, ACCENT));
                    ui.painter().circle_filled(pos2(cx, ty), 7.0, THUMB_BG);
                    ui.painter().circle_filled(pos2(cx, ty), 2.5, ACCENT);
                    ui.painter().text(pos2(cx, sr.bottom() + 8.0), Align2::CENTER_CENTER, *fl, font_mono(10.0), TEXT_SECONDARY);
                });
            }
        });
        if eq_changed {
            command_sender(PlayerCommand::SetEqualizer { token: snapshot.token, bands_db: state.eq_bands });
        }
        ui.add_space(20.0);

        ui.label(RichText::new("Audio boost").font(font_outfit_regular(11.0)).color(TEXT_SECONDARY));
        ui.add_space(4.0);
        let boost_opts = ["Off", "Light", "Standard", "Dynamic", "Night"];
        let boost_cur = match state.audio_boost_preset.as_str() {
            "light" => "Light", "standard" => "Standard", "dynamic" => "Dynamic", "night" => "Night", _ => "Off",
        };
        if let Some(i) = cnx_select(ui, Id::new("aud_boost_sel"), pane_w, 36.0, boost_cur, &boost_opts, false) {
            let ids = ["off", "light", "standard", "dynamic", "night"];
            state.audio_boost_preset = ids[i].into();
            command_sender(PlayerCommand::SetAudioBoostPreset { token: snapshot.token, preset: state.audio_boost_preset.clone() });
        }
        ui.add_space(16.0);
        ui.columns(2, |cols| {
            let cw0 = cols[0].available_width();
            cols[0].label(RichText::new("Audio channel / downmix").font(font_outfit_regular(11.0)).color(TEXT_SECONDARY));
            let dm_cur = match state.audio_downmix.as_str() { "stereo" => "Stereo (2.0)", "mono" => "Mono", _ => "Default (System)" };
            if let Some(i) = cnx_select(&mut cols[0], Id::new("dm_sel"), cw0, 32.0, dm_cur, &["Default (System)", "Stereo (2.0)", "Mono"], false) {
                let modes = ["auto", "stereo", "mono"];
                state.audio_downmix = modes[i].into();
                command_sender(PlayerCommand::SetAudioDownmix { token: snapshot.token, mode: state.audio_downmix.clone() });
            }
            let cw1 = cols[1].available_width();
            cols[1].label(RichText::new("Audio device").font(font_outfit_regular(11.0)).color(TEXT_SECONDARY));
            cnx_select(&mut cols[1], Id::new("adev_sel"), cw1, 32.0, "Autoselect device", &["Autoselect device"], false);
        });
    }
}

fn show_queue_panel(
    ui: &mut Ui,
    p_rect: Rect,
    is_sheet: bool,
    snapshot: &PlayerSnapshot,
    state: &mut PlayerUiState,
    command_sender: &mut dyn FnMut(PlayerCommand),
    just_opened: bool,
) {
    if !just_opened && !state.queue_pinned && ui.input(|i| i.pointer.any_click()) {
        if let Some(p) = ui.input(|i| i.pointer.interact_pos()) {
            if !p_rect.contains(p) {
                state.panel = None;
                return;
            }
        }
    }

    egui::Area::new(Id::new("cnx_queue_panel"))
        .order(Order::Foreground)
        .fixed_pos(p_rect.min)
        .constrain(false)
        .show(ui.ctx(), |ui| {
            ui.set_clip_rect(p_rect);
            let (outer_r, _) = ui.allocate_exact_size(p_rect.size(), Sense::hover());
            ui.painter().add(panel_shadow().as_shape(outer_r, CornerRadius::same(R_PANEL)));
            ui.painter().rect_filled(outer_r, CornerRadius::same(R_PANEL), SURFACE_PANEL);
            ui.painter().rect_stroke(outer_r, CornerRadius::same(R_PANEL), Stroke::new(1.0, BORDER_HAIRLINE), StrokeKind::Inside);

            let inner = outer_r.shrink(S18);
            let mut cui = ui.new_child(UiBuilder::new().max_rect(inner));
            cui.set_max_size(inner.size());

            if is_sheet {
                cui.horizontal(|ui| {
                    let (bk, b_resp) = ui.allocate_exact_size(vec2(28.0, 28.0), Sense::click());
                    draw_cnx_icon(ui.painter(), Rect::from_center_size(bk.center(), vec2(16.0, 16.0)), CnxIcon::Back, TEXT_PRIMARY, 1.75);
                    if b_resp.clicked() { state.panel = None; }
                    let hr = Rect::from_center_size(pos2(inner.center().x, bk.center().y), vec2(36.0, 4.0));
                    ui.painter().rect_filled(hr, CornerRadius::same(2), Color32::from_white_alpha(77));
                });
                cui.add_space(6.0);
            }

            // Header: single align_center row (Bug 4)
            cui.horizontal(|ui| {
                ui.set_height(36.0);
                ui.label(RichText::new("Queue").font(font_outfit_semibold(16.0)).color(TEXT_PRIMARY));
                ui.label(RichText::new(format!("({})", snapshot.queue.len())).font(font_mono(12.0)).color(TEXT_SECONDARY));
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    let (pill_r, _) = ui.allocate_exact_size(vec2(96.0, 36.0), Sense::hover());
                    ui.painter().rect_filled(pill_r, CornerRadius::same(10), SURFACE_RAISED);
                    let shuf_r = Rect::from_min_size(pos2(pill_r.left() + 4.0, pill_r.top() + 4.0), vec2(28.0, 28.0));
                    let pin_r = Rect::from_min_size(pos2(pill_r.left() + 34.0, pill_r.top() + 4.0), vec2(28.0, 28.0));
                    let clr_r = Rect::from_min_size(pos2(pill_r.left() + 64.0, pill_r.top() + 4.0), vec2(28.0, 28.0));
                    if cnx_icon_button(ui, Id::new("q_shuf"), shuf_r, CnxIcon::Shuffle, 15.0, snapshot.shuffle, false, 1.0, "Shuffle").clicked() {
                        command_sender(PlayerCommand::SetShuffle { token: snapshot.token, enabled: !snapshot.shuffle });
                    }
                    if cnx_icon_button(ui, Id::new("q_pin"), pin_r, CnxIcon::Pin, 15.0, state.queue_pinned, false, 1.0, "Pin queue").clicked() {
                        state.queue_pinned = !state.queue_pinned;
                    }
                    let clr_resp = ui.allocate_rect(clr_r, Sense::click());
                    draw_cnx_icon(ui.painter(), Rect::from_center_size(clr_r.center(), vec2(14.0, 14.0)), CnxIcon::CloseX, ACCENT, 1.75);
                    if clr_resp.clicked() { state.panel = None; }
                });
            });
            cui.add_space(12.0);

            // Virtualized rows (68px pitch, 60px row, clipped text, Bug 1 & Bug 4)
            let total = snapshot.queue.len();
            egui::ScrollArea::vertical().max_height(cui.available_height()).auto_shrink([false, false]).show_rows(&mut cui, 68.0, total, |ui, range| {
                for idx in range {
                    let item = &snapshot.queue[idx];
                    let is_cur = idx == snapshot.queue_index;
                    let (rr, r_resp) = ui.allocate_exact_size(vec2(ui.available_width(), 60.0), Sense::click());
                    if r_resp.hovered() { ui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
                    if is_cur { ui.painter().rect_filled(rr, CornerRadius::same(R_ROW), ACCENT_TINT); }
                    else if r_resp.hovered() { ui.painter().rect_filled(rr, CornerRadius::same(R_ROW), SURFACE_HOVER); }

                    let thumb_r = Rect::from_min_size(pos2(rr.left() + 6.0, rr.top() + 5.0), vec2(76.0, 50.0));
                    ui.painter().rect_filled(thumb_r, CornerRadius::same(6), SURFACE_RAISED);
                    draw_cnx_icon(ui.painter(), Rect::from_center_size(thumb_r.center(), vec2(18.0, 18.0)), CnxIcon::VideoTab, TEXT_DISABLED, 1.5);
                    if is_cur && snapshot.duration_secs > 0.0 {
                        let p = (snapshot.position_secs / snapshot.duration_secs).clamp(0.0, 1.0) as f32;
                        ui.painter().rect_filled(Rect::from_min_size(pos2(thumb_r.left(), thumb_r.bottom() - 2.0), vec2(thumb_r.width() * p, 2.0)), CornerRadius::ZERO, ACCENT);
                        let badge_r = Rect::from_min_max(pos2(thumb_r.right() - 40.0, thumb_r.bottom() - 16.0), pos2(thumb_r.right() - 3.0, thumb_r.bottom() - 3.0));
                        ui.painter().rect_filled(badge_r, CornerRadius::same(4), Color32::from_rgba_unmultiplied(0, 0, 0, 180));
                        ui.painter().text(badge_r.center(), Align2::CENTER_CENTER, fmt_time_hms(snapshot.duration_secs, false), font_mono(10.0), TEXT_PRIMARY);
                    }

                    let text_max_w = (rr.width() - 96.0).max(40.0);
                    let g1 = layout_single_line(ui.ctx(), &item.title, font_outfit_semibold(13.0), TEXT_PRIMARY, text_max_w);
                    ui.painter().with_clip_rect(rr).galley(pos2(thumb_r.right() + 12.0, rr.top() + 10.0), g1, TEXT_PRIMARY);
                    let sub = if is_cur {
                        format!("Playing · {}", fmt_time_hms(snapshot.position_secs, false))
                    } else {
                        item.path.parent().and_then(|p| p.file_name()).map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "Media".into())
                    };
                    let g2 = layout_single_line(ui.ctx(), &sub, font_outfit_regular(12.0), if is_cur { ACCENT } else { TEXT_SECONDARY }, text_max_w);
                    ui.painter().with_clip_rect(rr).galley(pos2(thumb_r.right() + 12.0, rr.top() + 33.0), g2, TEXT_SECONDARY);

                    if r_resp.clicked() {
                        command_sender(PlayerCommand::JumpToQueue { token: snapshot.token, index: idx });
                    }
                    ui.add_space(8.0);
                }
            });
        });
}

fn show_bookmarks_popover(
    ui: &mut Ui,
    p_rect: Rect,
    snapshot: &PlayerSnapshot,
    state: &mut PlayerUiState,
    action: &mut PlayerUiAction,
    command_sender: &mut dyn FnMut(PlayerCommand),
    just_opened: bool,
) {
    if !just_opened && ui.input(|i| i.pointer.any_click()) {
        if let Some(p) = ui.input(|i| i.pointer.interact_pos()) {
            if !p_rect.contains(p) {
                state.panel = None;
                return;
            }
        }
    }

    egui::Area::new(Id::new("cnx_bookmarks_pop"))
        .order(Order::Foreground)
        .fixed_pos(p_rect.min)
        .constrain(false)
        .show(ui.ctx(), |ui| {
            ui.set_clip_rect(p_rect);
            let (outer_r, _) = ui.allocate_exact_size(p_rect.size(), Sense::hover());
            ui.painter().add(panel_shadow().as_shape(outer_r, CornerRadius::same(R_POPOVER)));
            ui.painter().rect_filled(outer_r, CornerRadius::same(R_POPOVER), SURFACE_PANEL);
            ui.painter().rect_stroke(outer_r, CornerRadius::same(R_POPOVER), Stroke::new(1.0, BORDER_HAIRLINE), StrokeKind::Inside);

            let inner = outer_r.shrink(S16);
            let mut cui = ui.new_child(UiBuilder::new().max_rect(inner));
            cui.set_max_size(inner.size());

            cui.horizontal(|ui| {
                ui.label(RichText::new("Bookmarks").font(font_outfit_semibold(15.0)).color(TEXT_PRIMARY));
                ui.label(RichText::new(format!("{}", state.bookmarks.len())).font(font_mono(12.0)).color(TEXT_SECONDARY));
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    let (cr, c_resp) = ui.allocate_exact_size(vec2(32.0, 32.0), Sense::click());
                    ui.painter().circle_filled(cr.center(), 16.0, if c_resp.hovered() { SURFACE_HOVER } else { SURFACE_RAISED });
                    draw_cnx_icon(ui.painter(), Rect::from_center_size(cr.center(), vec2(14.0, 14.0)), CnxIcon::CloseX, TEXT_PRIMARY, 1.75);
                    if c_resp.clicked() { state.panel = None; }
                });
            });
            cui.add_space(10.0);
            let (br, b_resp) = cui.allocate_exact_size(vec2(inner.width(), 32.0), Sense::click());
            if b_resp.hovered() { cui.ctx().set_cursor_icon(CursorIcon::PointingHand); }
            cui.painter().rect_filled(br, CornerRadius::same(R_BTN), ACCENT_BUTTON);
            cui.painter().text(br.center(), Align2::CENTER_CENTER, "+  Add bookmark at current position", font_outfit_semibold(12.5), Color32::WHITE);
            if b_resp.clicked() {
                let bm = Bookmark {
                    id: format!("bm_{}", chrono::Utc::now().timestamp_millis()),
                    fingerprint: state.bookmark_fingerprint.clone().unwrap_or_default(),
                    title: format!("Bookmark @ {}", fmt_time_hms(snapshot.position_secs, false)),
                    category: "custom".into(),
                    start_secs: snapshot.position_secs,
                    end_secs: None,
                    created_at: chrono::Utc::now(),
                };
                state.bookmarks.push(bm.clone());
                action.bookmarks_added.push(bm);
            }
            cui.add_space(12.0);
            if state.bookmarks.is_empty() {
                cui.label(RichText::new("No bookmarks yet.").font(font_outfit_regular(12.0)).color(TEXT_SECONDARY));
            } else {
                let mut del_id = None;
                egui::ScrollArea::vertical().max_height(cui.available_height()).auto_shrink([false, false]).show(&mut cui, |ui| {
                    for bm in &state.bookmarks {
                        let (rr, r_resp) = ui.allocate_exact_size(vec2(ui.available_width(), 34.0), Sense::click());
                        ui.painter().text(pos2(rr.left(), rr.center().y), Align2::LEFT_CENTER, fmt_time_hms(bm.start_secs, false), font_mono(12.0), ACCENT);
                        let g = layout_single_line(ui.ctx(), &bm.title, font_outfit_regular(12.0), TEXT_PRIMARY, (rr.width() - 88.0).max(40.0));
                        ui.painter().galley(pos2(rr.left() + 56.0, rr.center().y - g.size().y * 0.5), g, TEXT_PRIMARY);
                        let dr = Rect::from_center_size(pos2(rr.right() - 12.0, rr.center().y), vec2(20.0, 20.0));
                        let d_resp = ui.interact(dr, Id::new(("bm_d", &bm.id)), Sense::click());
                        draw_cnx_icon(ui.painter(), Rect::from_center_size(dr.center(), vec2(12.0, 12.0)), CnxIcon::Trash, TEXT_SECONDARY, 1.5);
                        if d_resp.clicked() { del_id = Some(bm.id.clone()); }
                        else if r_resp.clicked() { command_sender(PlayerCommand::Seek { token: snapshot.token, seconds: bm.start_secs, exact: true }); }
                    }
                });
                if let Some(id) = del_id {
                    state.bookmarks.retain(|b| b.id != id);
                    action.bookmarks_deleted.push(id);
                }
            }
        });
}

fn show_licences_dialog(ui: &mut Ui, win_rect: Rect, state: &mut PlayerUiState) {
    ui.painter().rect_filled(win_rect, CornerRadius::ZERO, Color32::from_rgba_unmultiplied(0, 0, 0, 140));
    let dw = 740.0_f32.min(win_rect.width() - 32.0);
    let dh = 640.0_f32.min(win_rect.height() - 48.0);
    let d_rect = Rect::from_center_size(win_rect.center(), vec2(dw, dh));

    egui::Area::new(Id::new("cnx_licences_dlg"))
        .order(Order::Tooltip)
        .fixed_pos(d_rect.min)
        .constrain(false)
        .show(ui.ctx(), |ui| {
            ui.set_clip_rect(d_rect);
            let (outer_r, _) = ui.allocate_exact_size(d_rect.size(), Sense::hover());
            ui.painter().add(panel_shadow().as_shape(outer_r, CornerRadius::same(R_DIALOG)));
            ui.painter().rect_filled(outer_r, CornerRadius::same(R_DIALOG), SURFACE_PANEL);
            ui.painter().rect_stroke(outer_r, CornerRadius::same(R_DIALOG), Stroke::new(1.0, BORDER_HAIRLINE), StrokeKind::Inside);

            let inner = outer_r.shrink(S24);
            let mut cui = ui.new_child(UiBuilder::new().max_rect(inner));
            cui.set_max_size(inner.size());

            cui.horizontal(|ui| {
                let (tr, _) = ui.allocate_exact_size(vec2(40.0, 40.0), Sense::hover());
                ui.painter().rect_filled(tr, CornerRadius::same(12), ACCENT_TINT);
                draw_cnx_icon(ui.painter(), Rect::from_center_size(tr.center(), vec2(20.0, 20.0)), CnxIcon::Doc, ACCENT, 1.75);
                ui.add_space(12.0);
                ui.label(RichText::new("Open-source licences").font(font_outfit_semibold(16.0)).color(TEXT_PRIMARY));
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    let (cr, c_resp) = ui.allocate_exact_size(vec2(32.0, 32.0), Sense::click());
                    ui.painter().rect_filled(cr, CornerRadius::same(10), if c_resp.hovered() { SURFACE_HOVER } else { SURFACE_RAISED });
                    draw_cnx_icon(ui.painter(), Rect::from_center_size(cr.center(), vec2(14.0, 14.0)), CnxIcon::CloseX, TEXT_PRIMARY, 1.75);
                    if c_resp.clicked() { state.licences_dialog_open = false; }
                });
            });
            cui.add_space(18.0);
            egui::ScrollArea::vertical().max_height(cui.available_height()).auto_shrink([false, false]).show(&mut cui, |ui| {
                for (name, ver, lic, url) in [
                    ("mpv", "0.40.0", "GPL-2.0 / LGPL-2.1", "https://mpv.io"),
                    ("libplacebo", "7.399.0", "LGPL-2.1", "https://libplacebo.org"),
                    ("FFmpeg", "7.1", "LGPL-2.1 / GPL-2.0", "https://ffmpeg.org"),
                    ("egui / eframe", "0.31", "MIT / Apache-2.0", "https://github.com/emilk/egui"),
                    ("Outfit Font", "1.0", "OFL-1.1", "https://github.com/Outfitio/Outfit-Fonts"),
                    ("JetBrains Mono", "2.304", "OFL-1.1", "https://github.com/JetBrains/JetBrainsMono"),
                ] {
                    ui.label(RichText::new(format!("▪ {name} {ver} — {lic}")).font(font_outfit_medium(13.0)).color(TEXT_PRIMARY));
                    if ui.add(egui::Label::new(RichText::new(url).font(font_outfit_regular(13.0)).color(ACCENT).underline()).sense(Sense::click())).clicked() {
                        ui.ctx().open_url(egui::OpenUrl::new_tab(url));
                    }
                    ui.add_space(14.0);
                }
            });
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compute_layout_has_no_overlaps_and_stays_inside_window() {
        for (w, h) in [
            (480.0_f32, 360.0_f32),
            (720.0, 480.0),
            (1280.0, 720.0),
            (1920.0, 1080.0),
            (2576.0, 1042.0),
            (3840.0, 2160.0),
        ] {
            let win = Rect::from_min_size(pos2(0.0, 0.0), vec2(w, h));
            for pk in [
                None,
                Some(PanelKind::Viewing),
                Some(PanelKind::SubsAudio),
                Some(PanelKind::Queue),
                Some(PanelKind::Bookmarks),
            ] {
                let l = compute_layout(win, 1.0, false, pk);
                assert!(win.contains_rect(l.title_bar), "title_bar outside {w}x{h}");
                assert!(win.contains_rect(l.video), "video outside {w}x{h}");
                assert!(win.contains_rect(l.top_pill), "top_pill outside {w}x{h}");
                assert!(win.contains_rect(l.title_block), "title_block outside {w}x{h}");
                assert!(!l.title_block.intersects(l.top_pill), "title_block overlaps top_pill at {w}x{h}");
                if let Some(pr) = l.panel {
                    assert!(win.contains_rect(pr), "panel {:?} outside {w}x{h}: {:?}", pk, pr);
                    assert!(!pr.intersects(l.top_pill), "panel {:?} overlaps top_pill at {w}x{h}", pk);
                }
            }
        }
    }
}
