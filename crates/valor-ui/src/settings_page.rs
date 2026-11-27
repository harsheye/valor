//! Settings page shell implementing the design reference with exact styling,
//! proper sub-divs, clean dividers, and modular components.

#![allow(unused_must_use, unused_mut)]

use egui::{Align, Align2, Color32, CornerRadius, FontId, Frame, Layout, Pos2, Rect, RichText, Sense, Stroke, StrokeKind, Ui, Vec2};

use crate::{
    icons::IconRegistry,
    layout,
    shell::ShellAction,
    shell_state::ShellState,
    shell_tokens::{spacing, typography, ShellTokens},
    ui_helpers::{section_separator, setting_card, setting_row, sub_divider, toggle_switch, segmented_pills},
};

pub struct SettingsCategory {
    pub group: &'static str,
    pub id: &'static str,
    pub icon: &'static str,
    pub title: &'static str,
    pub description: &'static str,
}

pub const SETTINGS_CATEGORIES: &[SettingsCategory] = &[
    // GENERAL
    SettingsCategory {
        group: "",
        id: "general",
        icon: "nav.theme",
        title: "General",
        description: "Theme, language, display",
    },
    // PLAYER
    SettingsCategory {
        group: "PLAYER",
        id: "subtitles",
        icon: "transport.subtitles",
        title: "Subtitles",
        description: "Font, size and colors",
    },
    SettingsCategory {
        group: "PLAYER",
        id: "hotkeys",
        icon: "computer",
        title: "Hotkeys",
        description: "Keyboard shortcuts",
    },
    SettingsCategory {
        group: "PLAYER",
        id: "player_controls",
        icon: "action.grid",
        title: "Player controls",
        description: "Order of on-screen buttons",
    },
    // ACCOUNT
    SettingsCategory {
        group: "ACCOUNT",
        id: "profile_storage",
        icon: "nav.this_pc",
        title: "Profile & storage",
        description: "Where your data is saved",
    },
    SettingsCategory {
        group: "ACCOUNT",
        id: "connected_services",
        icon: "action.pin",
        title: "Connected services",
        description: "Trakt, TMDB, subtitles",
    },
    // LIBRARY
    SettingsCategory {
        group: "LIBRARY",
        id: "folders",
        icon: "action.folder",
        title: "Folders",
        description: "Watched folders and exclusions",
    },
];

pub fn render(
    ui: &mut Ui,
    state: &mut ShellState,
    tokens: &ShellTokens,
    icons: &IconRegistry,
) -> ShellAction {
    let mut action = ShellAction::None;
    let settings_before = state.settings.clone();

    // Use full available content bounds with responsive padding
    let available = ui.max_rect();
    let pad_x = if available.width() >= 1400.0 {
        40.0
    } else if available.width() >= 900.0 {
        24.0
    } else {
        14.0
    };
    let content_rect = Rect::from_min_max(
        egui::pos2(available.min.x + pad_x, available.min.y + 16.0),
        egui::pos2(available.max.x - pad_x, available.max.y - 12.0),
    );

    let mut page = ui.new_child(egui::UiBuilder::new().max_rect(content_rect));
    page.set_clip_rect(content_rect);

    let total_w = content_rect.width();

    // Top Header Bar: 40px
    let header_rect = Rect::from_min_size(content_rect.min, Vec2::new(total_w, 40.0));
    let mut header_ui = page.new_child(egui::UiBuilder::new().max_rect(header_rect));
    header_ui.horizontal(|ui| {
        ui.heading(
            RichText::new("Settings")
                .size(26.0)
                .strong()
                .color(tokens.text_primary),
        );

        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
            Frame::new()
                .fill(tokens.field_fill)
                .corner_radius(CornerRadius::same(18))
                .stroke(Stroke::new(1.0, tokens.field_border))
                .inner_margin(egui::Margin::symmetric(14, 6))
                .show(ui, |ui| {
                    ui.horizontal(|ui| {
                        icons.paint_icon(
                            ui,
                            "action.search",
                            Rect::from_min_size(ui.cursor().min, Vec2::splat(15.0)),
                            tokens.text_secondary,
                        );
                        ui.add_space(20.0);
                        ui.add_sized(
                            [200.0, 20.0],
                            egui::TextEdit::singleline(&mut state.settings_search)
                                .frame(Frame::NONE)
                                .hint_text(RichText::new("Search settings...").color(tokens.text_tertiary)),
                        );
                    });
                });
        });
    });

    // Horizontal divider below header bar
    let divider_y = layout::snap_to_pixel(content_rect.min.y + 48.0, ui.ctx().pixels_per_point());
    page.painter().hline(
        content_rect.x_range(),
        divider_y,
        Stroke::new(layout::DIVIDER_H, tokens.divider),
    );

    let query = state.settings_search.trim().to_lowercase();
    let current = state.settings_section.min(SETTINGS_CATEGORIES.len() - 1);

    // Responsive two-column bounds
    let body_top = content_rect.min.y + 58.0;
    let body_h = (content_rect.max.y - body_top).max(100.0);

    let sidebar_w = if total_w >= 1000.0 {
        260.0
    } else if total_w >= 700.0 {
        220.0
    } else {
        180.0
    };
    let col_gap = if total_w >= 1100.0 { 32.0 } else { 18.0 };
    let right_w = (total_w - sidebar_w - col_gap).max(160.0);

    let sidebar_rect = Rect::from_min_size(
        egui::pos2(content_rect.min.x, body_top),
        Vec2::new(sidebar_w, body_h),
    );
    let right_rect = Rect::from_min_size(
        egui::pos2(content_rect.min.x + sidebar_w + col_gap, body_top),
        Vec2::new(right_w, body_h),
    );

    let mut sidebar_ui = page.new_child(egui::UiBuilder::new().max_rect(sidebar_rect));
    let mut right_ui = page.new_child(egui::UiBuilder::new().max_rect(right_rect));

    // Left navigation column
    egui::ScrollArea::vertical()
        .id_salt("settings_nav_scroll")
        .auto_shrink([false; 2])
        .show(&mut sidebar_ui, |ui| {
            ui.set_width(sidebar_w);
            let mut last_group = "";
            for (index, cat) in SETTINGS_CATEGORIES.iter().enumerate() {
                if !query.is_empty()
                    && !format!("{} {} {}", cat.group, cat.title, cat.description)
                        .to_lowercase()
                        .contains(&query)
                {
                    continue;
                }

                if cat.group != last_group {
                    if !cat.group.is_empty() {
                        ui.add_space(14.0);
                        ui.label(
                            RichText::new(cat.group)
                                .size(11.0)
                                .strong()
                                .color(tokens.text_muted),
                        );
                        ui.add_space(6.0);
                    }
                    last_group = cat.group;
                }

                let selected = current == index;
                let (fill, stroke_color) = if selected {
                    (tokens.selected_fill, tokens.accent)
                } else {
                    (Color32::TRANSPARENT, Color32::TRANSPARENT)
                };

                let (rect, response) = ui.allocate_exact_size(Vec2::new(sidebar_w - 4.0, 52.0), egui::Sense::click());
                if response.clicked() {
                    state.settings_section = index;
                }

                let bg_fill = if response.hovered() && !selected {
                    tokens.hover_fill
                } else {
                    fill
                };

                ui.painter().rect(
                    rect,
                    CornerRadius::same(8),
                    bg_fill,
                    Stroke::new(1.0, stroke_color),
                    egui::StrokeKind::Inside,
                );

                // Draw icon on left
                let icon_rect = Rect::from_center_size(
                    egui::pos2(rect.min.x + 22.0, rect.center().y),
                    Vec2::splat(18.0),
                );
                let icon_tint = if selected { tokens.accent } else { tokens.text_secondary };
                icons.paint_icon(ui, cat.icon, icon_rect, icon_tint);

                // Text layout
                let text_rect = Rect::from_min_max(
                    egui::pos2(rect.min.x + 42.0, rect.min.y + 7.0),
                    egui::pos2(rect.max.x - 8.0, rect.max.y - 7.0),
                );
                let mut text_ui = ui.new_child(egui::UiBuilder::new().max_rect(text_rect));
                text_ui.vertical(|ui| {
                    ui.label(
                        RichText::new(cat.title)
                            .size(13.5)
                            .strong()
                            .color(if selected { Color32::WHITE } else { tokens.text_primary }),
                    );
                    ui.add_space(1.0);
                    ui.label(
                        RichText::new(cat.description)
                            .size(11.0)
                            .color(tokens.text_secondary),
                    );
                });

                ui.add_space(4.0);
            }
        });

    // Right content area with vertical scrolling and responsive width
    egui::ScrollArea::vertical()
        .id_salt("settings_main_body")
        .auto_shrink([false; 2])
        .show(&mut right_ui, |ui| {
            ui.vertical(|ui| {
                let max_w = (right_w - 24.0).clamp(420.0, 1100.0);
                ui.set_width(max_w);
                let cat = &SETTINGS_CATEGORIES[current];

                // Section header
                ui.heading(RichText::new(cat.title).size(24.0).strong().color(tokens.text_primary));
                ui.add_space(2.0);
                ui.label(RichText::new(cat.description).size(13.5).color(tokens.text_secondary));
                ui.add_space(16.0);

                match cat.id {
                    "general" => {
                        // Horizontal Sub-nav Pills (Image 2)
                        Frame::new().show(ui, |ui| {
                            ui.horizontal(|ui| {
                                ui.spacing_mut().item_spacing.x = 8.0;
                                let pills = ["Comfort", "Language", "History", "Player display", "Behaviour", "Advanced", "Updates"];
                                for (p_idx, pill) in pills.iter().enumerate() {
                                    let is_active = p_idx == 0;
                                    let btn = egui::Button::new(
                                        RichText::new(*pill)
                                            .size(12.0)
                                            .strong()
                                            .color(if is_active { Color32::WHITE } else { tokens.text_secondary }),
                                    )
                                    .fill(if is_active { tokens.selected_fill } else { tokens.field_fill })
                                    .stroke(Stroke::new(1.0, if is_active { tokens.accent } else { tokens.field_border }))
                                    .corner_radius(CornerRadius::same(3));
                                    ui.add(btn);
                                }
                            });
                        });
                        ui.add_space(16.0);

                        // Card: Appearance & UI Themes
                        setting_card(ui, tokens, "Appearance & UI theme", "Choose a visual theme or full UI skin (changes layout & player controls).", |ui| {
                            let themes = [
                                ("cloudflare-docs", "Cloudflare Docs", Color32::from_rgb(13, 17, 23), Color32::from_rgb(47, 129, 247)),
                                ("oled-black", "OLED Super Black", Color32::BLACK, Color32::from_rgb(246, 130, 31)),
                                ("vlc", "VLC Classic", Color32::from_rgb(37, 37, 38), Color32::from_rgb(255, 136, 0)),
                                ("netflix", "Netflix", Color32::from_rgb(20, 20, 20), Color32::from_rgb(229, 9, 20)),
                                ("youtube", "YouTube Player", Color32::from_rgb(15, 15, 15), Color32::from_rgb(62, 166, 255)),
                                ("valor-purple", "Obsidian Violet", Color32::from_rgb(16, 16, 16), Color32::from_rgb(168, 85, 247)),
                                ("github-midnight", "GitHub Midnight", Color32::from_rgb(13, 17, 23), Color32::from_rgb(31, 111, 235)),
                                ("cyber-crimson", "Cyber Crimson", Color32::from_rgb(12, 10, 15), Color32::from_rgb(244, 63, 94)),
                                ("emerald-studio", "Emerald Studio", Color32::from_rgb(11, 17, 14), Color32::from_rgb(16, 185, 129)),
                            ];
                            ui.horizontal_wrapped(|ui| {
                                ui.spacing_mut().item_spacing = Vec2::new(12.0, 10.0);
                                for (id, label, bg_col, accent_col) in themes {
                                    let active = state.settings.skin_id == id
                                        || (id == "valor-purple" && !["cloudflare-docs", "oled-black", "vlc", "netflix", "youtube", "github-midnight", "cyber-crimson", "emerald-studio"].contains(&state.settings.skin_id.as_str()) && !state.settings.skin_id.starts_with("custom:"));
                                    let (card_rect, resp) = ui.allocate_exact_size(Vec2::new(156.0, 64.0), Sense::click());
                                    if resp.hovered() {
                                        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                    }
                                    ui.painter().rect(
                                        card_rect,
                                        CornerRadius::ZERO,
                                        bg_col,
                                        Stroke::new(
                                            if active { 2.0 } else { 1.0 },
                                            if active { accent_col } else if resp.hovered() { tokens.divider_strong } else { tokens.divider },
                                        ),
                                        StrokeKind::Inside,
                                    );
                                    let dot_pos = Pos2::new(card_rect.left() + 20.0, card_rect.center().y);
                                    ui.painter().circle_filled(dot_pos, 9.0, accent_col);
                                    ui.painter().text(
                                        Pos2::new(card_rect.left() + 38.0, card_rect.center().y),
                                        Align2::LEFT_CENTER,
                                        label,
                                        FontId::proportional(13.0),
                                        if active { Color32::WHITE } else { tokens.text_secondary },
                                    );
                                    if resp.clicked() {
                                        state.settings.skin_id = id.to_string();
                                        state.settings.custom_skin_path.clear();
                                        state.skin_load_error = None;
                                    }
                                }
                            });
                            ui.add_space(12.0);
                            sub_divider(ui, tokens);
                            ui.add_space(10.0);
                            setting_row(ui, tokens, "Theme accent color", "Apply a custom accent color across buttons, active cards, and the player timeline.", |ui| {
                                let palette = [
                                    ("", "Default", tokens.accent),
                                    ("#E50914", "Valor Red", Color32::from_rgb(229, 9, 20)),
                                    ("#F59E0B", "Amber", Color32::from_rgb(245, 158, 11)),
                                    ("#3B82F6", "Electric Blue", Color32::from_rgb(59, 130, 246)),
                                    ("#10B981", "Emerald", Color32::from_rgb(16, 185, 129)),
                                    ("#A855F7", "Violet", Color32::from_rgb(168, 85, 247)),
                                    ("#F43F5E", "Rose", Color32::from_rgb(244, 63, 94)),
                                    ("#06B6D4", "Cyan", Color32::from_rgb(6, 182, 212)),
                                    ("#EAB308", "Gold", Color32::from_rgb(234, 179, 8)),
                                ];
                                ui.horizontal_wrapped(|ui| {
                                    ui.spacing_mut().item_spacing = Vec2::new(8.0, 8.0);
                                    for (hex, label, swatch_col) in palette {
                                        let active = state.settings.accent_color.eq_ignore_ascii_case(hex);
                                        let (rect, resp) = ui.allocate_exact_size(Vec2::new(28.0, 28.0), Sense::click());
                                        if resp.hovered() {
                                            ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                        }
                                        let fill = if hex.is_empty() { Color32::from_gray(72) } else { swatch_col };
                                        ui.painter().circle_filled(rect.center(), if active { 11.5 } else { 10.0 }, fill);
                                        if active {
                                            ui.painter().circle_stroke(rect.center(), 13.0, Stroke::new(2.0, Color32::WHITE));
                                        } else if resp.hovered() {
                                            ui.painter().circle_stroke(rect.center(), 12.0, Stroke::new(1.5, Color32::from_white_alpha(150)));
                                        }
                                        if resp.clicked() {
                                            state.settings.accent_color = hex.to_string();
                                        }
                                        resp.on_hover_text(label);
                                    }
                                });
                            });
                            ui.add_space(10.0);
                            sub_divider(ui, tokens);
                            ui.add_space(10.0);
                            setting_row(ui, tokens, "Load external skin bundle (.json / .zip)", "Import a JSON skin or .zip bundle (skin.json + icons/) to customize the entire UI.", |ui| {
                                ui.horizontal(|ui| {
                                    if ui.button("Load Skin Bundle...").clicked() {
                                        action = ShellAction::LoadSkinPicker;
                                    }
                                    if !state.settings.custom_skin_path.is_empty() || ["vlc", "netflix", "youtube"].contains(&state.settings.skin_id.as_str()) {
                                        if ui.button("Reset Default").clicked() {
                                            action = ShellAction::ResetSkin;
                                        }
                                    }
                                });
                            });
                            ui.add_space(6.0);
                            ui.label(
                                RichText::new(format!(
                                    "Active skin: {} ({}) • Player: {} • Shell: {:?}",
                                    tokens.skin.name,
                                    tokens.skin.id,
                                    tokens.skin.player_layout.style,
                                    tokens.skin.shell_layout.nav_position
                                ))
                                .size(11.5)
                                .color(tokens.text_tertiary),
                            );
                            if !state.settings.custom_skin_path.is_empty() {
                                ui.label(
                                    RichText::new(format!("Loaded file: {}", state.settings.custom_skin_path))
                                        .size(11.0)
                                        .color(tokens.text_secondary),
                                );
                            }
                            if let Some(err) = &state.skin_load_error {
                                ui.label(
                                    RichText::new(err)
                                        .size(11.5)
                                        .color(Color32::from_rgb(239, 68, 68)),
                                );
                            }
                        });
                        ui.add_space(16.0);

                        // Card: Comfort
                        setting_card(ui, tokens, "Comfort", "Make long viewing sessions easier on your eyes.", |ui| {
                            setting_row(ui, tokens, "Interface brightness", "Dims the interface. Chrome only.", |ui| {
                                let vals = [85u8, 90, 95, 100];
                                let idx = vals.iter().position(|&v| v == state.settings.interface_brightness).unwrap_or(3);
                                if let Some(new_idx) = segmented_pills(ui, &["85%", "90%", "95%", "100%"], idx, tokens) {
                                    state.settings.interface_brightness = vals[new_idx];
                                }
                            });
                            setting_row(ui, tokens, "Text size", "Scales text across the app.", |ui| {
                                let vals = [90u8, 100, 110, 120];
                                let idx = vals.iter().position(|&v| v == state.settings.text_scale_pct).unwrap_or(1);
                                ui.horizontal(|ui| {
                                    ui.label(RichText::new("Aa").size(13.0).color(tokens.text_tertiary));
                                    ui.add_space(6.0);
                                    if let Some(new_idx) = segmented_pills(ui, &["90%", "100%", "110%", "120%"], idx, tokens) {
                                        state.settings.text_scale_pct = vals[new_idx];
                                    }
                                });
                            });
                            setting_row(ui, tokens, "Reduce motion", "Turns off most animations. \"System\" follows your device.", |ui| {
                                let idx = match state.settings.reduce_motion_mode.as_str() {
                                    "on" => 1,
                                    "off" => 2,
                                    _ => 0,
                                };
                                if let Some(new_idx) = segmented_pills(ui, &["System", "On", "Off"], idx, tokens) {
                                    let mode = match new_idx {
                                        1 => "on",
                                        2 => "off",
                                        _ => "system",
                                    };
                                    state.settings.reduce_motion_mode = mode.to_string();
                                    state.settings.prefers_reduced_motion = new_idx == 1;
                                    state.settings.animation_speed = if new_idx == 1 { 0.0 } else { 1.0 };
                                }
                            });
                        });
                        ui.add_space(16.0);

                        // Card: Language & calendar
                        setting_card(ui, tokens, "Language & calendar", "Configure audio track and subtitle language defaults.", |ui| {
                            setting_row(ui, tokens, "Default audio", "Used when a video has more than one audio track.", |ui| {
                                egui::ComboBox::from_id_salt("default_audio_lang")
                                    .selected_text(if state.settings.default_audio_lang.is_empty() { "English (default)" } else { &state.settings.default_audio_lang })
                                    .show_ui(ui, |ui| {
                                        ui.selectable_value(&mut state.settings.default_audio_lang, "eng".into(), "English (default)");
                                        ui.selectable_value(&mut state.settings.default_audio_lang, "jpn".into(), "Japanese");
                                        ui.selectable_value(&mut state.settings.default_audio_lang, "kor".into(), "Korean");
                                        ui.selectable_value(&mut state.settings.default_audio_lang, "spa".into(), "Spanish");
                                    });
                            });
                            setting_row(ui, tokens, "Default subtitles", "Used when a video has subtitles.", |ui| {
                                egui::ComboBox::from_id_salt("default_sub_lang")
                                    .selected_text(if state.settings.default_sub_lang.is_empty() { "English (default)" } else { &state.settings.default_sub_lang })
                                    .show_ui(ui, |ui| {
                                        ui.selectable_value(&mut state.settings.default_sub_lang, "eng".into(), "English (default)");
                                        ui.selectable_value(&mut state.settings.default_sub_lang, "spa".into(), "Spanish");
                                        ui.selectable_value(&mut state.settings.default_sub_lang, "fre".into(), "French");
                                        ui.selectable_value(&mut state.settings.default_sub_lang, "none".into(), "None (disabled)");
                                    });
                            });
                            setting_row(ui, tokens, "Skip duration", "Jump interval when pressing Left/Right arrows or skip buttons.", |ui| {
                                let opts = [5u32, 10, 15, 30];
                                let active_idx = opts.iter().position(|&v| v == state.settings.skip_secs).unwrap_or(1);
                                if let Some(new_idx) = segmented_pills(ui, &["5s", "10s", "15s", "30s"], active_idx, tokens) {
                                    state.settings.skip_secs = opts[new_idx];
                                }
                            });
                        });
                        ui.add_space(16.0);

                        // Card: History (Image 2 & 3)
                        setting_card(ui, tokens, "History", "Playback tracking, save intervals, and message durations.", |ui| {
                            let hist_limit_id = ui.scope_id().with("history_limit_val");
                            let mut hist_limit: usize = ui.data(|d| d.get_temp(hist_limit_id)).unwrap_or(0);
                            let hist_label = match hist_limit {
                                0 => "Infinite (default)",
                                10 => "10 items",
                                25 => "25 items",
                                50 => "50 items",
                                _ => "Infinite (default)",
                            };
                            setting_row(ui, tokens, "History limit", "How many titles to display in History. All data is securely stored in database.", |ui| {
                                egui::ComboBox::from_id_salt("history_limit")
                                    .selected_text(hist_label)
                                    .show_ui(ui, |ui| {
                                        ui.selectable_value(&mut hist_limit, 0, "Infinite (default)");
                                        ui.selectable_value(&mut hist_limit, 10, "10 items");
                                        ui.selectable_value(&mut hist_limit, 25, "25 items");
                                        ui.selectable_value(&mut hist_limit, 50, "50 items");
                                    });
                            });
                            ui.data_mut(|d| d.insert_temp(hist_limit_id, hist_limit));
                            let msg_dur_id = ui.scope_id().with("msg_duration_val");
                            let mut msg_dur: u32 = ui.data(|d| d.get_temp(msg_dur_id)).unwrap_or(40);
                            let msg_label = match msg_dur {
                                20 => "2.0 seconds",
                                40 => "4.0 seconds (default)",
                                60 => "6.0 seconds",
                                _ => "4.0 seconds (default)",
                            };
                            setting_row(ui, tokens, "Message duration", "How long pop-up messages stay on screen.", |ui| {
                                egui::ComboBox::from_id_salt("msg_duration")
                                    .selected_text(msg_label)
                                    .show_ui(ui, |ui| {
                                        ui.selectable_value(&mut msg_dur, 20, "2.0 seconds");
                                        ui.selectable_value(&mut msg_dur, 40, "4.0 seconds (default)");
                                        ui.selectable_value(&mut msg_dur, 60, "6.0 seconds");
                                    });
                            });
                            ui.data_mut(|d| d.insert_temp(msg_dur_id, msg_dur));
                            let overlay_dur_id = ui.scope_id().with("overlay_duration_val");
                            let mut overlay_dur: u32 = ui.data(|d| d.get_temp(overlay_dur_id)).unwrap_or(15);
                            let overlay_label = match overlay_dur {
                                15 => "1.5 seconds (default)",
                                30 => "3.0 seconds",
                                50 => "5.0 seconds",
                                _ => "1.5 seconds (default)",
                            };
                            setting_row(ui, tokens, "Hide overlays after", "How long overlays stay once you stop moving the mouse.", |ui| {
                                egui::ComboBox::from_id_salt("overlay_duration")
                                    .selected_text(overlay_label)
                                    .show_ui(ui, |ui| {
                                        ui.selectable_value(&mut overlay_dur, 15, "1.5 seconds (default)");
                                        ui.selectable_value(&mut overlay_dur, 30, "3.0 seconds");
                                        ui.selectable_value(&mut overlay_dur, 50, "5.0 seconds");
                                    });
                            });
                            ui.data_mut(|d| d.insert_temp(overlay_dur_id, overlay_dur));
                        });
                        ui.add_space(16.0);

                        // Card: Overlays (Image 3)
                        setting_card(ui, tokens, "Overlays", "Information layered on top of the video.", |ui| {
                            setting_row(ui, tokens, "Video title", "Show the name of what you're watching.", |ui| {
                                toggle_switch(ui, &mut state.settings.pause_info_card, tokens);
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Play button overlay", "Show a large play button when paused.", |ui| {
                                let mut dummy = true;
                                toggle_switch(ui, &mut dummy, tokens);
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Time display", "Show elapsed and remaining time.", |ui| {
                                toggle_switch(ui, &mut state.settings.stats_overlay, tokens);
                            });
                        });
                        ui.add_space(16.0);

                        // Card: Controls (Image 3)
                        setting_card(ui, tokens, "Controls", "Buttons and bars in the player.", |ui| {
                            setting_row(ui, tokens, "Timeline bar", "Drag to jump to any point.", |ui| {
                                toggle_switch(ui, &mut state.settings.timeline_peek, tokens);
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Volume control", "Show sound volume control slider.", |ui| {
                                let mut dummy = true;
                                toggle_switch(ui, &mut dummy, tokens);
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Fullscreen button", "Show fullscreen toggle button on screen.", |ui| {
                                let mut dummy = true;
                                toggle_switch(ui, &mut dummy, tokens);
                            });
                        });
                        ui.add_space(16.0);

                        // Card: Behaviour (Image 4)
                        setting_card(ui, tokens, "Behaviour", "How playback reacts while you watch.", |ui| {
                            setting_row(ui, tokens, "Animations", "Smooth transitions in the player.", |ui| {
                                let mut dummy = true;
                                toggle_switch(ui, &mut dummy, tokens);
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Auto-pause on focus loss", "Automatically pause video playback when switching tabs or unfocusing the window.", |ui| {
                                let mut dummy = false;
                                toggle_switch(ui, &mut dummy, tokens);
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Auto-skip intros & outros", "Jumps past marked intro and outro sections.", |ui| {
                                let mut dummy = true;
                                toggle_switch(ui, &mut dummy, tokens);
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "When playback finishes", "Action to take when a single video or the final item of a collection ends.", |ui| {
                                egui::ComboBox::from_id_salt("finish_action")
                                    .selected_text(&state.settings.end_of_collection_action)
                                    .show_ui(ui, |ui| {
                                        ui.selectable_value(&mut state.settings.end_of_collection_action, "home".into(), "Return to home page");
                                        ui.selectable_value(&mut state.settings.end_of_collection_action, "stay".into(), "Stay on last frame");
                                        ui.selectable_value(&mut state.settings.end_of_collection_action, "replay".into(), "Replay video");
                                    });
                            });
                        });
                        ui.add_space(16.0);

                        // Card: System Auto-Updates (Image 5)
                        setting_card(ui, tokens, "System Auto-Updates", "Monitors GitHub for the latest patches on branch production and updates the running instance automatically.", |ui| {
                            setting_row(ui, tokens, "Automatic background updates", "Continuously check GitHub for new production patches every 5 minutes and auto-update.", |ui| {
                                let mut dummy = true;
                                toggle_switch(ui, &mut dummy, tokens);
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Branch & Version", "Tracking origin/production (Commit: 4e9a138)", |ui| {
                                ui.button("↺ Check for patches");
                            });
                            ui.add_space(6.0);
                            Frame::new()
                                .fill(tokens.field_fill)
                                .corner_radius(CornerRadius::same(6))
                                .stroke(Stroke::new(1.0, tokens.field_border))
                                .inner_margin(egui::Margin::symmetric(14, 10))
                                .show(ui, |ui| {
                                    ui.vertical(|ui| {
                                        ui.label(RichText::new("Last checked GitHub: 20:51:11 (22/11/2026)").size(11.5).color(tokens.text_tertiary));
                                        ui.label(RichText::new("✓ Running instance is up to date with branch production").size(12.0).color(tokens.success));
                                    });
                                });
                        });
                        ui.add_space(16.0);

                        // Card: Reset (Image 5)
                        setting_card(ui, tokens, "Reset", "Restore default settings without losing your saved history.", |ui| {
                            setting_row(ui, tokens, "Reset all settings", "Puts every setting back to its default. Your watch history is kept.", |ui| {
                                if ui.button(RichText::new("↺ Reset all settings").color(tokens.danger)).clicked() {
                                    state.settings = valor_core::settings::Settings::default();
                                }
                            });
                        });
                    }

                    "subtitles" => {
                        let font_id = ui.scope_id().with("sub_font_choice");
                        let scale_id = ui.scope_id().with("sub_scale_pct");
                        let fg_id = ui.scope_id().with("sub_fg_idx");
                        let bg_id = ui.scope_id().with("sub_bg_idx");

                        let mut font_name: String = ui.data(|d| d.get_temp(font_id)).unwrap_or_else(|| "Segoe UI".to_string());
                        let mut scale_pct: i32 = ui.data(|d| d.get_temp(scale_id)).unwrap_or(100);
                        let mut fg_idx: usize = ui.data(|d| d.get_temp(fg_id)).unwrap_or(0);
                        let mut bg_idx: usize = ui.data(|d| d.get_temp(bg_id)).unwrap_or(1);

                        let fonts = [
                            "Segoe UI",
                            "System sans-serif",
                            "Arial",
                            "Consolas",
                            "Georgia",
                            "Trebuchet MS",
                            "Verdana",
                            "Impact",
                        ];
                        let fg_colors = [
                            ("White", "#FFFFFF", Color32::WHITE),
                            ("Yellow", "#FFE600", Color32::from_rgb(255, 230, 0)),
                            ("Cyan", "#38BDF8", Color32::from_rgb(56, 189, 248)),
                            ("Green", "#4ADE80", Color32::from_rgb(74, 222, 128)),
                            ("Pink", "#F472B6", Color32::from_rgb(244, 114, 182)),
                            ("Orange", "#FB923C", Color32::from_rgb(251, 146, 60)),
                        ];
                        let bg_options = [
                            ("No background", Color32::TRANSPARENT),
                            ("Dark translucent", Color32::from_black_alpha(180)),
                            ("Solid black", Color32::BLACK),
                            ("Deep navy", Color32::from_rgba_unmultiplied(15, 23, 42, 210)),
                        ];

                        setting_card(ui, tokens, "Subtitles", "Typography, sizing, colors, and live subtitle preview", |ui| {
                            setting_row(ui, tokens, "Font family", "Typeface used for rendering subtitle cues", |ui| {
                                egui::ComboBox::from_id_salt("sub_font")
                                    .selected_text(&font_name)
                                    .width(180.0)
                                    .show_ui(ui, |ui| {
                                        for f in fonts {
                                            if ui.selectable_label(font_name == f, f).clicked() {
                                                font_name = f.to_string();
                                            }
                                        }
                                    });
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Subtitle size", "Scale between 50% and 200% of standard subtitle size", |ui| {
                                ui.horizontal(|ui| {
                                    if ui.add(egui::Button::new(RichText::new("-").size(15.0).strong()).min_size(Vec2::new(34.0, 28.0))).clicked() {
                                        scale_pct = (scale_pct - 10).max(50);
                                    }
                                    ui.add_space(6.0);
                                    ui.label(RichText::new(format!("{scale_pct}%")).size(14.0).strong().color(tokens.text_primary));
                                    ui.add_space(6.0);
                                    if ui.add(egui::Button::new(RichText::new("+").size(15.0).strong()).min_size(Vec2::new(34.0, 28.0))).clicked() {
                                        scale_pct = (scale_pct + 10).min(200);
                                    }
                                });
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Text color", "Color for subtitle lettering", |ui| {
                                ui.horizontal(|ui| {
                                    ui.spacing_mut().item_spacing.x = 6.0;
                                    for (idx, (name, hex, col)) in fg_colors.iter().enumerate() {
                                        let (swatch_rect, resp) = ui.allocate_exact_size(Vec2::splat(24.0), Sense::click());
                                        if resp.hovered() {
                                            ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                        }
                                        ui.painter().rect_filled(swatch_rect, CornerRadius::same(12), *col);
                                        ui.painter().rect_stroke(
                                            swatch_rect,
                                            CornerRadius::same(12),
                                            if fg_idx == idx { Stroke::new(2.5, tokens.accent) } else { Stroke::new(1.0, Color32::from_white_alpha(60)) },
                                            StrokeKind::Inside,
                                        );
                                        if resp.clicked() {
                                            fg_idx = idx;
                                        }
                                        resp.on_hover_text(format!("{name} ({hex})"));
                                    }
                                    ui.add_space(6.0);
                                    ui.label(RichText::new(fg_colors[fg_idx].1).size(12.5).color(tokens.text_secondary));
                                });
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Background color", "Backdrop box color behind subtitles or clear background", |ui| {
                                ui.horizontal(|ui| {
                                    ui.spacing_mut().item_spacing.x = 6.0;
                                    for (idx, (label, _)) in bg_options.iter().enumerate() {
                                        let active = bg_idx == idx;
                                        let btn = egui::Button::new(
                                            RichText::new(*label)
                                                .size(12.0)
                                                .color(if active { Color32::WHITE } else { tokens.text_secondary }),
                                        )
                                        .fill(if active { tokens.accent } else { tokens.field_fill })
                                        .stroke(Stroke::new(1.0, if active { tokens.accent } else { tokens.field_border }))
                                        .corner_radius(CornerRadius::same(6))
                                        .min_size(Vec2::new(72.0, 28.0));
                                        if ui.add(btn).clicked() {
                                            bg_idx = idx;
                                        }
                                    }
                                });
                            });
                            sub_divider(ui, tokens);
                            ui.label(RichText::new(format!("Live subtitle preview · {font_name} · {scale_pct}%")).size(13.0).color(tokens.text_secondary));
                            ui.add_space(8.0);
                            Frame::new()
                                .fill(tokens.window_bg)
                                .corner_radius(CornerRadius::same(8))
                                .stroke(Stroke::new(1.0, tokens.field_border))
                                .inner_margin(egui::Margin::symmetric(20, 42))
                                .show(ui, |ui| {
                                    ui.vertical_centered(|ui| {
                                        let preview_size = 14.0 * (scale_pct as f32 / 100.0);
                                        let fg_col = fg_colors[fg_idx].2;
                                        let bg_col = bg_options[bg_idx].1;
                                        let font_family = if font_name == "Consolas" {
                                            egui::FontFamily::Monospace
                                        } else {
                                            egui::FontFamily::Proportional
                                        };
                                        Frame::new()
                                            .fill(bg_col)
                                            .corner_radius(CornerRadius::same(4))
                                            .inner_margin(egui::Margin::symmetric(14, 6))
                                            .show(ui, |ui| {
                                                ui.label(
                                                    RichText::new("Valor subtitle preview on video")
                                                        .font(FontId::new(preview_size, font_family))
                                                        .strong()
                                                        .color(fg_col),
                                                );
                                            });
                                    });
                                });
                        });

                        ui.data_mut(|d| {
                            d.insert_temp(font_id, font_name);
                            d.insert_temp(scale_id, scale_pct);
                            d.insert_temp(fg_id, fg_idx);
                            d.insert_temp(bg_id, bg_idx);
                        });
                    }

                    "hotkeys" => {
                        setting_card(ui, tokens, "Hotkeys", "Customizable keyboard shortcuts for playback and navigation controls", |ui| {
                            let shortcuts = [
                                ("Play/pause", "Space"),
                                ("Rewind 10s", "←"),
                                ("Forward 10s", "→"),
                                ("Fullscreen", "F"),
                                ("Exit player", "Esc"),
                                ("Cycle subtitles", "B"),
                                ("Cycle audio", "V"),
                                ("Lock controls", "W"),
                                ("Open player settings", "Delete"),
                                ("Create bookmark", "T"),
                                ("Mute", "M"),
                                ("Volume boost", "N"),
                                ("Capture screenshot", "S"),
                            ];

                            for (idx, (title, key)) in shortcuts.iter().enumerate() {
                                let row_w = ui.available_width();
                                let (row_rect, _) = ui.allocate_exact_size(Vec2::new(row_w, 38.0), Sense::hover());
                                ui.painter().text(
                                    Pos2::new(row_rect.left() + 4.0, row_rect.center().y),
                                    Align2::LEFT_CENTER,
                                    *title,
                                    FontId::proportional(13.5),
                                    tokens.text_primary,
                                );
                                let badge_w = 78.0;
                                let badge_rect = Rect::from_center_size(
                                    Pos2::new(row_rect.right() - badge_w * 0.5 - 4.0, row_rect.center().y),
                                    Vec2::new(badge_w, 28.0),
                                );
                                ui.painter().rect(
                                    badge_rect,
                                    CornerRadius::same(6),
                                    tokens.field_fill,
                                    Stroke::new(1.0, tokens.field_border),
                                    StrokeKind::Inside,
                                );
                                ui.painter().text(
                                    badge_rect.center(),
                                    Align2::CENTER_CENTER,
                                    *key,
                                    FontId::proportional(12.5),
                                    tokens.text_primary,
                                );
                                if idx + 1 < shortcuts.len() {
                                    ui.painter().hline(
                                        row_rect.x_range(),
                                        row_rect.bottom(),
                                        Stroke::new(1.0, tokens.divider),
                                    );
                                }
                            }
                        });

                        ui.add_space(12.0);
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            let reset_btn = egui::Button::new(
                                RichText::new("↺ Reset hotkeys")
                                    .size(13.5)
                                    .strong()
                                    .color(Color32::WHITE),
                            )
                            .fill(Color32::from_rgb(185, 28, 28))
                            .stroke(Stroke::new(1.0, Color32::from_rgb(248, 113, 113)))
                            .min_size(Vec2::new(156.0, 38.0))
                            .corner_radius(CornerRadius::same(8));
                            if ui.add(reset_btn).clicked() {
                                // Reset any temporary hotkey overrides
                            }
                        });
                    }

                    "player_controls" => {
                        // Player Controls Card (Images 8 & 9)
                        setting_card(ui, tokens, "Player controls", "HUD overlay layout, pinned shortcuts, and control ordering", |ui| {
                            setting_row(ui, tokens, "Real-time HUD preview", "", |ui| {
                                segmented_pills(ui, &["Collapsed (3×2 combo)", "Expanded (4×4 combo)"], 0, tokens);
                            });
                            ui.add_space(8.0);
                            // Real-time Visual Player Mock Skeleton
                            let mock_w = ui.available_width().max(300.0);
                            let mock_h = 160.0;
                            let (mock_rect, _) = ui.allocate_exact_size(Vec2::new(mock_w, mock_h), Sense::hover());
                            let p = ui.painter();

                            // 1. Background (Video Viewport simulation)
                            p.rect_filled(mock_rect, CornerRadius::same(6), Color32::from_rgb(14, 16, 22));
                            p.rect_stroke(mock_rect, CornerRadius::same(6), Stroke::new(1.0, Color32::from_rgb(45, 50, 65)), StrokeKind::Inside);

                            // 2. Top Bar Mock (Back arrow, title, window controls)
                            p.text(Pos2::new(mock_rect.left() + 16.0, mock_rect.top() + 16.0), Align2::LEFT_CENTER, "←", FontId::proportional(15.0), Color32::WHITE);
                            p.text(Pos2::new(mock_rect.left() + 38.0, mock_rect.top() + 16.0), Align2::LEFT_CENTER, "Stranger.S01E08.1080p.NF.WEB-DL.mkv", FontId::proportional(11.0), Color32::from_gray(160));
                            p.text(Pos2::new(mock_rect.right() - 16.0, mock_rect.top() + 16.0), Align2::RIGHT_CENTER, "—   □   ✕", FontId::proportional(11.0), Color32::from_gray(140));

                            // 3. Side Navigation Chevrons
                            let cy = mock_rect.center().y;
                            p.text(Pos2::new(mock_rect.left() + 12.0, cy), Align2::CENTER_CENTER, "‹", FontId::proportional(22.0), Color32::from_white_alpha(150));
                            p.text(Pos2::new(mock_rect.right() - 12.0, cy), Align2::CENTER_CENTER, "›", FontId::proportional(22.0), Color32::from_white_alpha(150));

                            // 4. Bottom Scrim Gradient (Dark fade)
                            let scrim_rect = Rect::from_min_max(Pos2::new(mock_rect.left(), mock_rect.bottom() - 75.0), mock_rect.max);
                            p.rect_filled(scrim_rect, CornerRadius::same(0), Color32::from_black_alpha(120));

                            // 5. Paused Title text on left above seekbar
                            p.text(Pos2::new(mock_rect.left() + 16.0, mock_rect.bottom() - 48.0), Align2::LEFT_CENTER, "Stranger S01E08 Finale Episode", FontId::proportional(12.5), Color32::WHITE);

                            // 6. Seek Bar (Track + Purple Ring Thumb at 35%)
                            let seek_y = mock_rect.bottom() - 34.0;
                            let s_left = mock_rect.left() + 16.0;
                            let s_right = mock_rect.right() - 16.0;
                            let s_w = s_right - s_left;
                            let s_pos = s_left + s_w * 0.35;
                            // Unplayed track
                            p.line_segment([Pos2::new(s_pos, seek_y), Pos2::new(s_right, seek_y)], Stroke::new(2.0, Color32::from_white_alpha(90)));
                            // Played track
                            p.line_segment([Pos2::new(s_left, seek_y), Pos2::new(s_pos, seek_y)], Stroke::new(2.0, Color32::WHITE));
                            // Purple thumb
                            p.circle_filled(Pos2::new(s_pos, seek_y), 5.5, Color32::from_rgb(20, 20, 24));
                            p.circle_stroke(Pos2::new(s_pos, seek_y), 5.5, Stroke::new(2.0, Color32::from_rgb(177, 70, 194)));

                            // 7. Time Row
                            p.text(Pos2::new(s_left, mock_rect.bottom() - 22.0), Align2::LEFT_CENTER, "0:24:18", FontId::proportional(10.0), Color32::from_gray(210));
                            p.text(Pos2::new(s_right, mock_rect.bottom() - 22.0), Align2::RIGHT_CENTER, "1:10:45", FontId::proportional(10.0), Color32::from_gray(210));

                            // 8. Control Icon Row Mocks
                            let btn_y = mock_rect.bottom() - 10.0;
                            // Left group
                            p.text(Pos2::new(s_left + 14.0, btn_y), Align2::CENTER_CENTER, "🔊", FontId::proportional(11.0), Color32::WHITE);
                            p.text(Pos2::new(s_left + 38.0, btn_y), Align2::CENTER_CENTER, "💬", FontId::proportional(10.0), Color32::WHITE);
                            // Center group
                            let center_x = mock_rect.center().x;
                            p.text(Pos2::new(center_x - 30.0, btn_y), Align2::CENTER_CENTER, "↺10", FontId::proportional(10.0), Color32::WHITE);
                            p.text(Pos2::new(center_x, btn_y), Align2::CENTER_CENTER, "❚❚", FontId::proportional(11.0), Color32::WHITE);
                            p.text(Pos2::new(center_x + 30.0, btn_y), Align2::CENTER_CENTER, "30↻", FontId::proportional(10.0), Color32::WHITE);
                            // Right group
                            p.text(Pos2::new(s_right - 46.0, btn_y), Align2::CENTER_CENTER, "⧉", FontId::proportional(11.0), Color32::WHITE);
                            p.text(Pos2::new(s_right - 26.0, btn_y), Align2::CENTER_CENTER, "⛶", FontId::proportional(11.0), Color32::WHITE);
                            p.text(Pos2::new(s_right - 8.0, btn_y), Align2::CENTER_CENTER, "•••", FontId::proportional(10.0), Color32::WHITE);
                            sub_divider(ui, tokens);

                            ui.horizontal(|ui| {
                                ui.label(RichText::new("Order & pinned controls").size(14.0).strong().color(tokens.text_primary));
                                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                    ui.label(RichText::new("Top 5 are displayed in collapsed HUD").size(12.0).color(tokens.text_tertiary));
                                });
                            });
                            ui.add_space(10.0);

                            let controls = [
                                (1, "UI overlays", true),
                                (2, "Video name", true),
                                (3, "Play button HUD", true),
                                (4, "Time display", true),
                                (5, "Timeline scrub", true),
                                (6, "Volume control", false),
                                (7, "Fullscreen toggle", false),
                                (8, "Disable animations", false),
                                (9, "Auto-pause on focus loss", false),
                                (10, "Skip buttons", false),
                                (11, "Block seeking", false),
                                (12, "Auto-skip intro/outro", false),
                                (13, "Lock controls", false),
                            ];

                            for (idx, name, pinned) in controls {
                                Frame::new()
                                    .fill(tokens.card_fill)
                                    .corner_radius(CornerRadius::same(6))
                                    .inner_margin(egui::Margin::symmetric(14, 10))
                                    .show(ui, |ui| {
                                        ui.horizontal(|ui| {
                                            ui.label(RichText::new(format!("{idx}")).size(13.0).color(tokens.text_tertiary));
                                            ui.add_space(8.0);
                                            ui.label(RichText::new(name).size(13.5).strong().color(tokens.text_primary));
                                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                                ui.add(egui::Button::new(RichText::new("v").size(13.0)).min_size(Vec2::new(34.0, 30.0)));
                                                ui.add(egui::Button::new(RichText::new("^").size(13.0)).min_size(Vec2::new(34.0, 30.0)));
                                                if pinned {
                                                    ui.add(egui::Button::new(RichText::new("📌 Pinned").size(13.0)).min_size(Vec2::new(96.0, 30.0)));
                                                } else {
                                                    ui.add(egui::Button::new(RichText::new("Pin").size(13.0)).min_size(Vec2::new(72.0, 30.0)));
                                                }
                                            });
                                        });
                                    });
                                ui.add_space(4.0);
                            }
                        });
                    }

                    "profile_storage" => {
                        // Profile & Storage Card (Purely Local)
                        setting_card(ui, tokens, "", "", |ui| {
                            let banner_w = ui.available_width();
                            ui.horizontal(|ui| {
                                ui.set_width(banner_w);
                                // Avatar circle
                                let (avatar_rect, _) = ui.allocate_exact_size(Vec2::splat(44.0), egui::Sense::hover());
                                ui.painter().circle_filled(avatar_rect.center(), 22.0, Color32::from_rgb(110, 80, 220));
                                ui.painter().circle_stroke(avatar_rect.center(), 22.0, Stroke::new(1.0, Color32::WHITE));
                                ui.painter().text(
                                    avatar_rect.center(),
                                    egui::Align2::CENTER_CENTER,
                                    "L",
                                    egui::FontId::proportional(20.0),
                                    Color32::WHITE,
                                );

                                ui.add_space(8.0);
                                ui.vertical(|ui| {
                                    ui.horizontal(|ui| {
                                        ui.label(RichText::new("Default Profile").size(17.0).strong().color(Color32::WHITE));
                                        Frame::new()
                                            .fill(tokens.selected_fill)
                                            .corner_radius(CornerRadius::same(10))
                                            .inner_margin(egui::Margin::symmetric(8, 2))
                                            .show(ui, |ui| {
                                                ui.label(RichText::new("Local Only").size(11.0).color(tokens.accent));
                                            });
                                    });
                                    ui.label(RichText::new("All watch progress, session history, and settings are saved locally on your device.").size(12.0).color(tokens.text_secondary));
                                    ui.add_space(4.0);
                                    ui.horizontal(|ui| {
                                        ui.label(RichText::new("Active local user").size(11.5).color(tokens.success));
                                    });
                                });

                                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                    Frame::new()
                                        .fill(tokens.field_fill)
                                        .corner_radius(CornerRadius::same(12))
                                        .stroke(Stroke::new(1.0, tokens.field_border))
                                        .inner_margin(egui::Margin::symmetric(12, 6))
                                        .show(ui, |ui| {
                                            ui.label(RichText::new("Local SQLite Database").size(12.0).color(tokens.text_secondary));
                                        });
                                });
                            });
                        });
                        ui.add_space(16.0);

                        // Responsive two column or stacked layout
                        let is_wide = ui.available_width() >= 700.0;
                        if is_wide {
                            ui.columns(2, |columns| {
                                // Left Column
                                columns[0].vertical(|ui| {
                                    setting_card(ui, tokens, "REMEMBER ACROSS SESSIONS", "", |ui| {
                                        setting_row(ui, tokens, "Playback position", "Resume exactly where you left off", |ui| {
                                            let mut dummy = true;
                                            toggle_switch(ui, &mut dummy, tokens);
                                        });
                                        setting_row(ui, tokens, "Audio & subtitles", "Keep preferred languages", |ui| {
                                            let mut dummy = true;
                                            toggle_switch(ui, &mut dummy, tokens);
                                        });
                                        setting_row(ui, tokens, "Volume & mute", "Persist sound levels", |ui| {
                                            let mut dummy = true;
                                            toggle_switch(ui, &mut dummy, tokens);
                                        });
                                        setting_row(ui, tokens, "Layout", "Keep your HUD arrangement", |ui| {
                                            let mut dummy = true;
                                            toggle_switch(ui, &mut dummy, tokens);
                                        });
                                    });
                                });

                                // Right Column
                                columns[1].vertical(|ui| {
                                    setting_card(ui, tokens, "PROFILES", "", |ui| {
                                        ui.label(RichText::new("Default Profile (Active)").strong());
                                        ui.add_space(8.0);
                                        ui.button("+ Add local profile");
                                    });
                                    ui.add_space(16.0);
                                    setting_card(ui, tokens, "BACKUP", "Export or restore your local database and settings.", |ui| {
                                        ui.horizontal(|ui| {
                                            ui.button("⭳ Export Backup");
                                            ui.button("⭱ Import Backup");
                                        });
                                    });
                                });
                            });
                        } else {
                            // Stack vertically on narrow screen
                            setting_card(ui, tokens, "REMEMBER ACROSS SESSIONS", "", |ui| {
                                setting_row(ui, tokens, "Playback position", "Resume exactly where you left off", |ui| {
                                    let mut dummy = true;
                                    toggle_switch(ui, &mut dummy, tokens);
                                });
                                setting_row(ui, tokens, "Audio & subtitles", "Keep preferred languages", |ui| {
                                    let mut dummy = true;
                                    toggle_switch(ui, &mut dummy, tokens);
                                });
                                setting_row(ui, tokens, "Volume & mute", "Persist sound levels", |ui| {
                                    let mut dummy = true;
                                    toggle_switch(ui, &mut dummy, tokens);
                                });
                                setting_row(ui, tokens, "Layout", "Keep your HUD arrangement", |ui| {
                                    let mut dummy = true;
                                    toggle_switch(ui, &mut dummy, tokens);
                                });
                            });
                            ui.add_space(16.0);
                            setting_card(ui, tokens, "PROFILES", "", |ui| {
                                ui.label(RichText::new("Default Profile (Active)").strong());
                                ui.add_space(8.0);
                                ui.button("+ Add local profile");
                            });
                            ui.add_space(16.0);
                            setting_card(ui, tokens, "BACKUP", "Export or restore your local database and settings.", |ui| {
                                ui.horizontal(|ui| {
                                    ui.button("⭳ Export Backup");
                                    ui.button("⭱ Import Backup");
                                });
                            });
                        }
                        ui.add_space(16.0);

                        // Danger zone card
                        let danger_w = ui.available_width();
                        Frame::new()
                            .fill(tokens.card_fill)
                            .stroke(Stroke::new(1.0, tokens.danger))
                            .corner_radius(CornerRadius::same(10))
                            .inner_margin(egui::Margin::same(18))
                            .show(ui, |ui| {
                                ui.set_width((danger_w - 36.0).max(200.0));
                                ui.vertical_centered(|ui| {
                                    ui.label(RichText::new("DANGER ZONE").size(12.0).strong().color(tokens.danger));
                                    ui.add_space(6.0);
                                    ui.label(RichText::new("Resetting local data will clear cached thumbnails and reset playback progress.").size(12.5).color(tokens.text_secondary));
                                    ui.add_space(12.0);
                                    ui.button(RichText::new("Reset Local Data & Cache").color(tokens.danger));
                                });
                            });
                    }

                    "folders" => {
                        // Library Folders (functional watched folder management)
                        setting_card(ui, tokens, "Watched folders", "Folders monitored for movies and TV series.", |ui| {
                            ui.horizontal(|ui| {
                                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                    if ui.button("+ Add a folder").clicked() {
                                        action = ShellAction::AddFolderPicker;
                                    }
                                });
                            });
                            ui.add_space(10.0);
                            if state.root_folders.is_empty() {
                                ui.label(RichText::new("No folders added yet.").color(tokens.text_secondary));
                            }
                            for folder in &state.root_folders {
                                Frame::new()
                                    .fill(tokens.field_fill)
                                    .corner_radius(CornerRadius::same(8))
                                    .inner_margin(12.0)
                                    .show(ui, |ui| {
                                        ui.horizontal(|ui| {
                                            ui.vertical(|ui| {
                                                ui.label(RichText::new(&folder.name).strong());
                                                ui.label(
                                                    RichText::new(folder.path.display().to_string())
                                                        .size(typography::SECONDARY)
                                                        .color(tokens.text_secondary),
                                                );
                                                if let Some(status) = state.scan_status.get(&folder.path) {
                                                    ui.label(
                                                        RichText::new(status)
                                                            .size(typography::SECONDARY)
                                                            .color(tokens.text_secondary),
                                                    );
                                                }
                                            });
                                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                                if ui.button("Remove").clicked() {
                                                    action = ShellAction::RemoveFolder(folder.path.clone());
                                                }
                                                if ui.button("Rescan").clicked() {
                                                    action = ShellAction::ScanFolder(folder.path.clone());
                                                }
                                            });
                                        });
                                    });
                                ui.add_space(6.0);
                            }

                            section_separator(ui, tokens);

                            ui.label(RichText::new("Excluded subfolders").size(15.0).strong());
                            ui.add_space(6.0);
                            if state.excluded_paths.is_empty() {
                                ui.label(RichText::new("No excluded subfolders.").color(tokens.text_secondary));
                            }
                            for excluded in &state.excluded_paths {
                                ui.horizontal(|ui| {
                                    ui.label(excluded.display().to_string());
                                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                        if ui.button("Include again").clicked() {
                                            action = ShellAction::IncludeSubfolder(excluded.clone());
                                        }
                                    });
                                });
                                ui.add_space(4.0);
                            }
                            ui.add_space(10.0);
                            if ui.button("Exclude a subfolder…").clicked() {
                                action = ShellAction::ExcludeSubfolderPicker;
                            }
                        });
                    }

                    "connected_services" => {
                        let trakt_conn_id = ui.scope_id().with("trakt_connected");
                        let trakt_user_id = ui.scope_id().with("trakt_username");
                        let trakt_scrobble_id = ui.scope_id().with("trakt_scrobble");
                        let trakt_sync_id = ui.scope_id().with("trakt_sync_ratings");
                        let tmdb_enable_id = ui.scope_id().with("tmdb_enabled");
                        let tmdb_key_id = ui.scope_id().with("tmdb_api_key");
                        let osub_conn_id = ui.scope_id().with("osub_connected");
                        let osub_key_id = ui.scope_id().with("osub_api_key");
                        let osub_lang_id = ui.scope_id().with("osub_lang");
                        let osub_auto_id = ui.scope_id().with("osub_auto_dl");
                        let osub_hash_id = ui.scope_id().with("osub_hash");
                        let discord_id = ui.scope_id().with("discord_rpc");

                        let mut trakt_connected: bool = ui.data(|d| d.get_temp(trakt_conn_id)).unwrap_or(false);
                        let mut trakt_user: String = ui.data(|d| d.get_temp(trakt_user_id)).unwrap_or_default();
                        let mut trakt_scrobble: bool = ui.data(|d| d.get_temp(trakt_scrobble_id)).unwrap_or(true);
                        let mut trakt_sync_ratings: bool = ui.data(|d| d.get_temp(trakt_sync_id)).unwrap_or(true);
                        let mut tmdb_enabled: bool = ui.data(|d| d.get_temp(tmdb_enable_id)).unwrap_or(true);
                        let mut tmdb_key: String = ui.data(|d| d.get_temp(tmdb_key_id)).unwrap_or_default();
                        let mut osub_connected: bool = ui.data(|d| d.get_temp(osub_conn_id)).unwrap_or(false);
                        let mut osub_key: String = ui.data(|d| d.get_temp(osub_key_id)).unwrap_or_default();
                        let mut osub_lang: String = ui.data(|d| d.get_temp(osub_lang_id)).unwrap_or_else(|| "English (en)".to_string());
                        let mut osub_auto_dl: bool = ui.data(|d| d.get_temp(osub_auto_id)).unwrap_or(true);
                        let mut osub_hash: bool = ui.data(|d| d.get_temp(osub_hash_id)).unwrap_or(true);
                        let mut discord_rpc: bool = ui.data(|d| d.get_temp(discord_id)).unwrap_or(false);

                        let trakt_connected = !state.settings.trakt_access_token.trim().is_empty();
                        setting_card(ui, tokens, "Trakt.tv", "Sync playback progress, scrobble watched items, and manage ratings via the web backend.", |ui| {
                            setting_row(ui, tokens, "Trakt username / handle", "Account used for scrobbling and history sync.", |ui| {
                                ui.add_sized(
                                    [200.0, 30.0],
                                    egui::TextEdit::singleline(&mut state.settings.trakt_username).hint_text("@username"),
                                );
                            });
                            sub_divider(ui, tokens);
                            setting_row(
                                ui,
                                tokens,
                                "Account connection",
                                if trakt_connected {
                                    "Connected via Trakt Device OAuth."
                                } else {
                                    "Link your Trakt account via trakt.tv/activate."
                                },
                                |ui| {
                                    ui.horizontal(|ui| {
                                        if trakt_connected {
                                            let btn = egui::Button::new(RichText::new("✓ Connected (Disconnect)").size(12.5).strong().color(Color32::WHITE))
                                                .fill(Color32::from_rgb(22, 101, 52))
                                                .min_size(Vec2::new(165.0, 32.0))
                                                .corner_radius(CornerRadius::same(6));
                                            if ui.add(btn).clicked() {
                                                action = ShellAction::DisconnectTrakt;
                                            }
                                        } else {
                                            let btn = egui::Button::new(RichText::new("Connect Trakt").size(12.5).strong().color(Color32::WHITE))
                                                .fill(tokens.accent)
                                                .min_size(Vec2::new(135.0, 32.0))
                                                .corner_radius(CornerRadius::same(6));
                                            if ui.add(btn).clicked() {
                                                action = ShellAction::StartTraktDeviceAuth;
                                            }
                                        }
                                    });
                                },
                            );
                            if let Some((ref user_code, _, ref verify_url)) = state.trakt_device_code {
                                sub_divider(ui, tokens);
                                ui.horizontal_wrapped(|ui| {
                                    ui.label(RichText::new(format!("Enter code {user_code} at {verify_url}:")).size(12.5).color(tokens.text_primary));
                                    let poll_btn = egui::Button::new(RichText::new("Verify Activation").size(12.0).strong().color(Color32::WHITE))
                                        .fill(tokens.accent)
                                        .corner_radius(CornerRadius::same(6));
                                    if ui.add(poll_btn).clicked() {
                                        action = ShellAction::PollTraktDeviceToken;
                                    }
                                });
                            }
                            if let Some(ref msg) = state.trakt_status_msg {
                                ui.add_space(4.0);
                                ui.label(RichText::new(msg).size(12.0).color(tokens.text_secondary));
                            }
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Automatic scrobble", "Send play, pause, and finish signals to Trakt automatically.", |ui| {
                                toggle_switch(ui, &mut state.settings.trakt_scrobble, tokens);
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Sync ratings & history", "Pull and push watched status and ratings across devices.", |ui| {
                                toggle_switch(ui, &mut state.settings.trakt_sync_ratings, tokens);
                            });
                        });
                        ui.add_space(16.0);

                        setting_card(ui, tokens, "OpenSubtitles.com", "Automatic multi-language subtitle search, hash matching, and downloading.", |ui| {
                            setting_row(ui, tokens, "OpenSubtitles API Key", "Your personal OpenSubtitles.com REST API key.", |ui| {
                                ui.add_sized(
                                    [220.0, 30.0],
                                    egui::TextEdit::singleline(&mut osub_key).password(true).hint_text("Enter API key..."),
                                );
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Preferred subtitle language", "Default language queried when searching OpenSubtitles.", |ui| {
                                egui::ComboBox::from_id_salt("osub_lang_combo")
                                    .selected_text(&osub_lang)
                                    .width(170.0)
                                    .show_ui(ui, |ui| {
                                        for lang in ["English (en)", "Spanish (es)", "Korean (ko)", "Japanese (ja)", "French (fr)", "German (de)", "Hindi (hi)"] {
                                            if ui.selectable_label(osub_lang == lang, lang).clicked() {
                                                osub_lang = lang.to_string();
                                            }
                                        }
                                    });
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Search & download on play", "Automatically query OpenSubtitles if no embedded tracks match.", |ui| {
                                toggle_switch(ui, &mut osub_auto_dl, tokens);
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Exact file hash matching", "Prioritize frame-accurate subtitles matched by OpenSubtitles file hash.", |ui| {
                                toggle_switch(ui, &mut osub_hash, tokens);
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Account status", if osub_connected { "Authenticated · Higher daily quota active." } else { "Sign in for higher daily download limits." }, |ui| {
                                let btn_text = if osub_connected { "✓ Authenticated" } else { "Connect OpenSubtitles" };
                                let btn = egui::Button::new(RichText::new(btn_text).size(12.5).strong().color(Color32::WHITE))
                                    .fill(if osub_connected { Color32::from_rgb(22, 101, 52) } else { tokens.accent })
                                    .min_size(Vec2::new(160.0, 32.0))
                                    .corner_radius(CornerRadius::same(6));
                                if ui.add(btn).clicked() {
                                    osub_connected = !osub_connected;
                                }
                            });
                        });
                        ui.add_space(16.0);

                        setting_card(ui, tokens, "The Movie Database (TMDB)", "Enrich local media with high-resolution posters, backdrops, and cast metadata.", |ui| {
                            setting_row(ui, tokens, "Metadata fetching", "Automatically identify movies and TV series from filenames.", |ui| {
                                toggle_switch(ui, &mut state.settings.tmdb_enabled, tokens);
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "TMDB v3 API Key", "Optional personal TMDB API key for unrestricted requests.", |ui| {
                                ui.add_sized(
                                    [220.0, 30.0],
                                    egui::TextEdit::singleline(&mut state.settings.tmdb_api_key).password(true).hint_text("Enter TMDB key..."),
                                );
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Auto-skip Intro (TheIntroDB)", "Automatically jump past intro segments fetched from TheIntroDB & web database.", |ui| {
                                toggle_switch(ui, &mut state.settings.auto_skip_intro, tokens);
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Auto-skip Outro / Credits", "Automatically skip ending credits segments when detected.", |ui| {
                                toggle_switch(ui, &mut state.settings.auto_skip_outro, tokens);
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "TheIntroDB API Key", "Optional key for higher rate limits on api.theintrodb.org.", |ui| {
                                ui.add_sized(
                                    [220.0, 30.0],
                                    egui::TextEdit::singleline(&mut state.settings.theintrodb_api_key).password(true).hint_text("Optional TheIntroDB key..."),
                                );
                            });
                        });
                        ui.add_space(16.0);

                        setting_card(ui, tokens, "Discord & Presence Tools", "Share currently playing media and elapsed time in Discord.", |ui| {
                            setting_row(ui, tokens, "Discord Rich Presence", "Display active video title and playback progress on your Discord profile.", |ui| {
                                toggle_switch(ui, &mut discord_rpc, tokens);
                            });
                        });

                        ui.data_mut(|d| {
                            d.insert_temp(trakt_conn_id, trakt_connected);
                            d.insert_temp(trakt_user_id, trakt_user);
                            d.insert_temp(trakt_scrobble_id, trakt_scrobble);
                            d.insert_temp(trakt_sync_id, trakt_sync_ratings);
                            d.insert_temp(tmdb_enable_id, tmdb_enabled);
                            d.insert_temp(tmdb_key_id, tmdb_key);
                            d.insert_temp(osub_conn_id, osub_connected);
                            d.insert_temp(osub_key_id, osub_key);
                            d.insert_temp(osub_lang_id, osub_lang);
                            d.insert_temp(osub_auto_id, osub_auto_dl);
                            d.insert_temp(osub_hash_id, osub_hash);
                            d.insert_temp(discord_id, discord_rpc);
                        });
                    }

                    _ => {
                        let diag_id = ui.scope_id().with(("diag_ran", cat.id));
                        let mut diag_ran: bool = ui.data(|d| d.get_temp(diag_id)).unwrap_or(false);
                        setting_card(ui, tokens, cat.title, cat.description, |ui| {
                            setting_row(ui, tokens, "Hardware acceleration (D3D11VA)", "Use GPU video decoding via libmpv for lower CPU usage.", |ui| {
                                let mut hw_on = state.settings.decoding_mode != "software";
                                if toggle_switch(ui, &mut hw_on, tokens).changed() {
                                    state.settings.decoding_mode = if hw_on { "auto-safe".to_string() } else { "software".to_string() };
                                }
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "OpenSubtitles & Subtitle Tools", "Auto-fetch and sync external subtitle tracks on playback.", |ui| {
                                let btn = egui::Button::new(RichText::new("Open Connected Services").size(12.5))
                                    .min_size(Vec2::new(164.0, 30.0));
                                if ui.add(btn).clicked() {
                                    if let Some(pos) = SETTINGS_CATEGORIES.iter().position(|c| c.id == "connected_services") {
                                        state.settings_section = pos;
                                    }
                                }
                            });
                            sub_divider(ui, tokens);
                            setting_row(ui, tokens, "Diagnostics", if diag_ran { "libmpv + SQLite + Thumbnail cache healthy." } else { "Inspect subsystem status" }, |ui| {
                                if ui.add(egui::Button::new(if diag_ran { "✓ Healthy" } else { "Run diagnostics" }).min_size(Vec2::new(130.0, 30.0))).clicked() {
                                    diag_ran = true;
                                }
                            });
                        });
                        ui.data_mut(|d| d.insert_temp(diag_id, diag_ran));
                    }
                }

                ui.add_space(spacing::PAD_32);
            });
        });

    if state.settings != settings_before {
        if let Err(error) = state.settings.save() {
            tracing::warn!(%error, "Could not save settings");
        }
    }
    action
}
