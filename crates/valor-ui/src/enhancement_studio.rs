use crate::theme::ValorTheme;
use egui::{Align2, Color32, CornerRadius, Pos2, Rect, Sense, Stroke, Ui, Vec2};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StudioTab {
    Video,
    Audio,
    Hdr,
}

#[derive(Debug, Clone)]
pub struct VideoEnhancementValues {
    pub brightness: i64,
    pub contrast: i64,
    pub saturation: i64,
    pub gamma: i64,
    pub hue: i64,
    pub deband: bool,
    pub scaler: String,
    // Audio
    pub eq_gains: [f64; 10],
    pub dynaudnorm: bool,
    pub night_mode: bool,
    pub dialogue_boost: bool,
    // HDR
    pub tone_mapping: String,
    pub desaturate: f64,
}

impl Default for VideoEnhancementValues {
    fn default() -> Self {
        Self {
            brightness: 0,
            contrast: 0,
            saturation: 0,
            gamma: 0,
            hue: 0,
            deband: false,
            scaler: "spline36".to_string(),
            eq_gains: [0.0; 10],
            dynaudnorm: false,
            night_mode: false,
            dialogue_boost: false,
            tone_mapping: "auto".to_string(),
            desaturate: 0.5,
        }
    }
}

pub struct EnhancementStudioState {
    pub is_open: bool,
    pub current_tab: StudioTab,
    pub values: VideoEnhancementValues,
}

impl Default for EnhancementStudioState {
    fn default() -> Self {
        Self {
            is_open: false,
            current_tab: StudioTab::Video,
            values: VideoEnhancementValues::default(),
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub enum StudioAction {
    ApplyValues,
    ResetDefaults,
    Close,
}

pub fn render_enhancement_studio(
    ui: &mut Ui,
    theme: &ValorTheme,
    screen_rect: Rect,
    state: &mut EnhancementStudioState,
) -> Option<StudioAction> {
    if !state.is_open {
        return None;
    }

    let mut action = None;

    // Dimmed background
    let backdrop_resp = ui.allocate_rect(screen_rect, Sense::click());
    if backdrop_resp.clicked() {
        state.is_open = false;
        return Some(StudioAction::Close);
    }
    ui.painter().rect_filled(
        screen_rect,
        CornerRadius::ZERO,
        Color32::from_rgba_premultiplied(0, 0, 0, 160),
    );

    // Studio window
    let w = 540.0;
    let h = 480.0;
    let win_rect = Rect::from_center_size(screen_rect.center(), Vec2::new(w, h));

    ui.painter().rect_filled(
        win_rect,
        CornerRadius::same(16),
        Color32::from_rgb(22, 27, 38),
    );
    ui.painter().rect_stroke(
        win_rect,
        CornerRadius::same(16),
        Stroke::new(1.0, theme.panel_border),
        egui::StrokeKind::Inside,
    );

    // Header
    let header_rect = Rect::from_min_size(win_rect.min, Vec2::new(w, 54.0));
    ui.painter().text(
        Pos2::new(header_rect.min.x + 20.0, header_rect.center().y),
        Align2::LEFT_CENTER,
        "✨  Video & Audio Enhancement Studio",
        egui::FontId::proportional(16.0),
        Color32::WHITE,
    );

    let close_rect = Rect::from_center_size(
        Pos2::new(header_rect.max.x - 24.0, header_rect.center().y),
        Vec2::new(24.0, 24.0),
    );
    if ui.allocate_rect(close_rect, Sense::click()).clicked() {
        state.is_open = false;
        return Some(StudioAction::Close);
    }
    ui.painter().text(
        close_rect.center(),
        Align2::CENTER_CENTER,
        "✕",
        egui::FontId::proportional(14.0),
        theme.text_muted,
    );

    // Tabs bar
    let tabs_y = header_rect.max.y;
    let tab_w = w / 3.0;

    let tabs = [
        (StudioTab::Video, "🎬 Picture & Scaler"),
        (StudioTab::Audio, "🔊 10-Band EQ & DSP"),
        (StudioTab::Hdr, "☀️ HDR Tone Mapping"),
    ];

    for (idx, (tab, label)) in tabs.iter().enumerate() {
        let tab_rect = Rect::from_min_size(
            Pos2::new(win_rect.min.x + idx as f32 * tab_w, tabs_y),
            Vec2::new(tab_w, 36.0),
        );
        let is_selected = state.current_tab == *tab;

        let resp = ui.allocate_rect(tab_rect, Sense::click());
        if resp.clicked() {
            state.current_tab = *tab;
        }

        let bg = if is_selected {
            Color32::from_rgba_premultiplied(245, 158, 11, 40)
        } else if resp.hovered() {
            Color32::from_rgba_premultiplied(255, 255, 255, 10)
        } else {
            Color32::from_rgba_premultiplied(0, 0, 0, 40)
        };
        ui.painter().rect_filled(tab_rect, CornerRadius::ZERO, bg);

        if is_selected {
            ui.painter().line_segment(
                [
                    Pos2::new(tab_rect.min.x, tab_rect.max.y),
                    Pos2::new(tab_rect.max.x, tab_rect.max.y),
                ],
                Stroke::new(2.0, theme.accent_amber),
            );
        }

        let text_color = if is_selected {
            theme.accent_amber
        } else {
            theme.text_muted
        };
        ui.painter().text(
            tab_rect.center(),
            Align2::CENTER_CENTER,
            *label,
            egui::FontId::proportional(12.0),
            text_color,
        );
    }

    // Tab Contents
    let content_rect = Rect::from_min_size(
        Pos2::new(win_rect.min.x + 20.0, tabs_y + 46.0),
        Vec2::new(w - 40.0, h - 146.0),
    );

    let mut changed = false;

    match state.current_tab {
        StudioTab::Video => {
            let row_h = 42.0;
            let sliders = [
                ("Brightness", &mut state.values.brightness, -100, 100),
                ("Contrast", &mut state.values.contrast, -100, 100),
                ("Saturation", &mut state.values.saturation, -100, 100),
                ("Gamma", &mut state.values.gamma, -100, 100),
                ("Hue", &mut state.values.hue, -180, 180),
            ];

            for (idx, (name, val, min, max)) in sliders.into_iter().enumerate() {
                let slider_rect = Rect::from_min_size(
                    Pos2::new(content_rect.min.x, content_rect.min.y + idx as f32 * row_h),
                    Vec2::new(content_rect.width(), row_h),
                );

                ui.painter().text(
                    Pos2::new(slider_rect.min.x, slider_rect.center().y),
                    Align2::LEFT_CENTER,
                    format!("{}: {}", name, *val),
                    egui::FontId::proportional(12.0),
                    theme.text_primary,
                );

                let track_w = 260.0;
                let track_rect = Rect::from_center_size(
                    Pos2::new(slider_rect.max.x - track_w * 0.5, slider_rect.center().y),
                    Vec2::new(track_w, 6.0),
                );

                let s_resp = ui.allocate_rect(track_rect.expand(6.0), Sense::click_and_drag());
                if let Some(pos) = s_resp.interact_pointer_pos() {
                    let norm = ((pos.x - track_rect.min.x) / track_w).clamp(0.0, 1.0);
                    *val = min + (norm as f64 * (max - min) as f64).round() as i64;
                    changed = true;
                }

                ui.painter().rect_filled(
                    track_rect,
                    CornerRadius::same(3),
                    Color32::from_rgba_premultiplied(255, 255, 255, 30),
                );
                let norm_val = ((*val - min) as f32 / (max - min) as f32).clamp(0.0, 1.0);
                let filled =
                    Rect::from_min_size(track_rect.min, Vec2::new(track_w * norm_val, 6.0));
                ui.painter()
                    .rect_filled(filled, CornerRadius::same(3), theme.accent_amber);
                ui.painter().circle_filled(
                    Pos2::new(track_rect.min.x + track_w * norm_val, track_rect.center().y),
                    6.0,
                    theme.accent_amber,
                );
            }

            // Deband toggle
            let deband_y = content_rect.min.y + 5.0 * row_h + 10.0;
            let deband_rect = Rect::from_min_size(
                Pos2::new(content_rect.min.x, deband_y),
                Vec2::new(180.0, 30.0),
            );
            if ui.allocate_rect(deband_rect, Sense::click()).clicked() {
                state.values.deband = !state.values.deband;
                changed = true;
            }
            let deband_bg = if state.values.deband {
                theme.accent_amber
            } else {
                Color32::from_rgba_premultiplied(255, 255, 255, 20)
            };
            ui.painter()
                .rect_filled(deband_rect, CornerRadius::same(6), deband_bg);
            let d_text = if state.values.deband {
                "✓ Deband: ON"
            } else {
                "Deband: OFF"
            };
            ui.painter().text(
                deband_rect.center(),
                Align2::CENTER_CENTER,
                d_text,
                egui::FontId::proportional(12.0),
                Color32::WHITE,
            );
        }
        StudioTab::Audio => {
            // 10-band equalizer sliders
            let freqs = [
                "31Hz", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k",
            ];
            let col_w = content_rect.width() / 10.0;
            let track_h = 130.0;

            for (idx, freq) in freqs.iter().enumerate() {
                let x = content_rect.min.x + idx as f32 * col_w + col_w * 0.5;
                let track_rect = Rect::from_center_size(
                    Pos2::new(x, content_rect.min.y + 70.0),
                    Vec2::new(6.0, track_h),
                );

                let resp = ui.allocate_rect(track_rect.expand(8.0), Sense::click_and_drag());
                if let Some(pos) = resp.interact_pointer_pos() {
                    let norm = 1.0 - ((pos.y - track_rect.min.y) / track_h).clamp(0.0, 1.0);
                    state.values.eq_gains[idx] = -12.0 + norm as f64 * 24.0;
                    changed = true;
                }

                ui.painter().rect_filled(
                    track_rect,
                    CornerRadius::same(3),
                    Color32::from_rgba_premultiplied(255, 255, 255, 30),
                );
                let g = state.values.eq_gains[idx];
                let norm_g = ((g + 12.0) / 24.0).clamp(0.0, 1.0) as f32;
                let thumb_y = track_rect.max.y - track_h * norm_g;
                ui.painter()
                    .circle_filled(Pos2::new(x, thumb_y), 6.0, theme.accent_amber);

                ui.painter().text(
                    Pos2::new(x, track_rect.max.y + 12.0),
                    Align2::CENTER_CENTER,
                    *freq,
                    egui::FontId::proportional(10.0),
                    theme.text_muted,
                );
            }

            // DSP Toggles
            let toggle_y = content_rect.min.y + 160.0;
            let toggles = [
                ("Loudness (dynaudnorm)", &mut state.values.dynaudnorm),
                ("Night Mode", &mut state.values.night_mode),
                ("Dialogue Boost", &mut state.values.dialogue_boost),
            ];

            for (idx, (label, val)) in toggles.into_iter().enumerate() {
                let rect = Rect::from_min_size(
                    Pos2::new(content_rect.min.x + idx as f32 * 165.0, toggle_y),
                    Vec2::new(155.0, 32.0),
                );
                if ui.allocate_rect(rect, Sense::click()).clicked() {
                    *val = !*val;
                    changed = true;
                }
                let bg = if *val {
                    theme.accent_amber
                } else {
                    Color32::from_rgba_premultiplied(255, 255, 255, 20)
                };
                ui.painter().rect_filled(rect, CornerRadius::same(6), bg);
                ui.painter().text(
                    rect.center(),
                    Align2::CENTER_CENTER,
                    label,
                    egui::FontId::proportional(11.0),
                    Color32::WHITE,
                );
            }
        }
        StudioTab::Hdr => {
            let algos = ["auto", "clip", "mobius", "reinhard", "hable", "bt.2390"];
            ui.painter().text(
                Pos2::new(content_rect.min.x, content_rect.min.y + 10.0),
                Align2::LEFT_TOP,
                "Select Tone Mapping Curve:",
                egui::FontId::proportional(13.0),
                Color32::WHITE,
            );

            for (idx, algo) in algos.iter().enumerate() {
                let rect = Rect::from_min_size(
                    Pos2::new(
                        content_rect.min.x + (idx % 3) as f32 * 165.0,
                        content_rect.min.y + 40.0 + (idx / 3) as f32 * 40.0,
                    ),
                    Vec2::new(155.0, 32.0),
                );
                let is_sel = state.values.tone_mapping == *algo;
                if ui.allocate_rect(rect, Sense::click()).clicked() {
                    state.values.tone_mapping = algo.to_string();
                    changed = true;
                }
                let bg = if is_sel {
                    theme.accent_amber
                } else {
                    Color32::from_rgba_premultiplied(255, 255, 255, 20)
                };
                ui.painter().rect_filled(rect, CornerRadius::same(6), bg);
                ui.painter().text(
                    rect.center(),
                    Align2::CENTER_CENTER,
                    algo.to_uppercase(),
                    egui::FontId::proportional(11.0),
                    Color32::WHITE,
                );
            }
        }
    }

    if changed {
        action = Some(StudioAction::ApplyValues);
    }

    // Bottom action bar
    let footer_rect = Rect::from_min_size(
        Pos2::new(win_rect.min.x + 20.0, win_rect.max.y - 48.0),
        Vec2::new(w - 40.0, 36.0),
    );

    let reset_rect = Rect::from_min_size(footer_rect.min, Vec2::new(140.0, 34.0));
    if ui.allocate_rect(reset_rect, Sense::click()).clicked() {
        state.values = VideoEnhancementValues::default();
        action = Some(StudioAction::ResetDefaults);
    }
    ui.painter().rect_filled(
        reset_rect,
        CornerRadius::same(8),
        Color32::from_rgba_premultiplied(255, 255, 255, 20),
    );
    ui.painter().text(
        reset_rect.center(),
        Align2::CENTER_CENTER,
        "Reset Defaults",
        egui::FontId::proportional(12.0),
        theme.text_muted,
    );

    let done_rect = Rect::from_min_size(
        Pos2::new(footer_rect.max.x - 120.0, footer_rect.min.y),
        Vec2::new(120.0, 34.0),
    );
    if ui.allocate_rect(done_rect, Sense::click()).clicked() {
        state.is_open = false;
        action = Some(StudioAction::Close);
    }
    ui.painter()
        .rect_filled(done_rect, CornerRadius::same(8), theme.accent_amber);
    ui.painter().text(
        done_rect.center(),
        Align2::CENTER_CENTER,
        "Done",
        egui::FontId::proportional(13.0),
        Color32::from_rgb(17, 24, 39),
    );

    action
}
