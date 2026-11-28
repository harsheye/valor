//! CnX-styled Settings page with top segmented tabs, unlocked HDR/Picture/Audio/Subtitles,
//! Library folder management (including grayed-out excluded folders), 3rd Party Integration,
//! and a Keyboard Shortcuts modal.

#![allow(unused_must_use)]

use egui::{
    Align, Align2, Color32, CornerRadius, FontId, Frame, Layout, Pos2, Rect, RichText, Sense,
    Stroke, StrokeKind, Ui, Vec2,
};

use crate::{
    icons::IconRegistry,
    shell::ShellAction,
    shell_state::ShellState,
    shell_tokens::ShellTokens,
    ui_helpers::{setting_card, setting_row, sub_divider, toggle_switch},
};

pub struct SettingsCategory {
    pub id: &'static str,
    pub title: &'static str,
    pub description: &'static str,
}

pub const SETTINGS_CATEGORIES: &[SettingsCategory] = &[
    SettingsCategory {
        id: "playback",
        title: "Playback",
        description: "How videos start, continue and move to the next one.",
    },
    SettingsCategory {
        id: "picture",
        title: "Picture",
        description: "Colour, 10-bit HDR tone-mapping and hardware decoding.",
    },
    SettingsCategory {
        id: "audio",
        title: "Audio",
        description: "Volume, boost and preferred audio language.",
    },
    SettingsCategory {
        id: "subtitles",
        title: "Subtitles",
        description: "How subtitles look and which language loads first.",
    },
    SettingsCategory {
        id: "library",
        title: "Library",
        description: "Watched folders, exclusions and library scanning.",
    },
    SettingsCategory {
        id: "integrations",
        title: "3rd Party Integration",
        description: "Trakt.tv, TMDB, TheIntroDB, OpenSubtitles and Discord.",
    },
    SettingsCategory {
        id: "general",
        title: "General",
        description: "Theme, display scaling, privacy and app info.",
    },
];

pub fn render(
    ui: &mut Ui,
    state: &mut ShellState,
    tokens: &ShellTokens,
    icons: &IconRegistry,
) -> ShellAction {
    let mut action = ShellAction::None;

    let available = ui.max_rect();
    let pad_x = if available.width() >= 1200.0 { 36.0 } else { 20.0 };
    let content_rect = Rect::from_min_max(
        egui::pos2(available.min.x + pad_x, available.min.y + 16.0),
        egui::pos2(available.max.x - pad_x, available.max.y - 12.0),
    );
    let mut page = ui.new_child(egui::UiBuilder::new().max_rect(content_rect));
    page.set_clip_rect(content_rect);

    let max_w = content_rect.width().min(960.0);
    let current = state.settings_section.min(SETTINGS_CATEGORIES.len() - 1);

    let accent_container = tokens.accent;
    let on_accent_container = crate::ui_kit::contrast_on_accent(tokens.accent);
    let accent_button = tokens.accent;

    let shortcuts_open_id = page.scope_id().with("settings_shortcuts_modal");
    let mut shortcuts_open: bool = page.data(|d| d.get_temp(shortcuts_open_id)).unwrap_or(false);

    // Top Segmented Tabs
    page.horizontal_wrapped(|ui| {
        Frame::new()
            .fill(tokens.field_fill)
            .stroke(Stroke::new(1.0, tokens.divider))
            .corner_radius(CornerRadius::same(10))
            .inner_margin(egui::Margin::same(3))
            .show(ui, |ui| {
                ui.spacing_mut().item_spacing.x = 2.0;
                for (idx, cat) in SETTINGS_CATEGORIES.iter().enumerate() {
                    let active = current == idx;
                    let text_col = if active {
                        on_accent_container
                    } else {
                        tokens.text_secondary
                    };
                    let w = (cat.title.len() as f32 * 7.6 + 24.0).max(76.0);
                    let (r, resp) = ui.allocate_exact_size(Vec2::new(w, 28.0), Sense::click());
                    if resp.hovered() {
                        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                    }
                    if active {
                        ui.painter().rect_filled(r, CornerRadius::same(8), accent_container);
                    } else if resp.hovered() {
                        ui.painter().rect_filled(r, CornerRadius::same(8), tokens.hover_fill);
                    }
                    ui.painter().text(
                        r.center(),
                        Align2::CENTER_CENTER,
                        cat.title,
                        FontId::proportional(12.5),
                        text_col,
                    );
                    if resp.clicked() {
                        state.settings_section = idx;
                    }
                }
            });
    });

    page.add_space(10.0);
    let cat = &SETTINGS_CATEGORIES[current];

    let mouse_on_window = page.ctx().input(|i| i.pointer.latest_pos().is_some());
    page.style_mut().spacing.scroll = egui::style::ScrollStyle::floating();

    egui::ScrollArea::vertical()
        .id_salt("settings_main_scroll")
        .auto_shrink([false; 2])
        .scroll_bar_visibility(if mouse_on_window {
            egui::scroll_area::ScrollBarVisibility::VisibleWhenNeeded
        } else {
            egui::scroll_area::ScrollBarVisibility::AlwaysHidden
        })
        .show(&mut page, |ui| {
            ui.set_width(max_w);
            match cat.id {
                "playback" => {
                    setting_card(ui, tokens, "Playback defaults", "", |ui| {
                        setting_row(
                            ui,
                            tokens,
                            "Playback starts",
                            "Where a video opens — from the start or where you left off",
                            |ui| {
                                segmented_choice(
                                    ui,
                                    tokens,
                                    &[("Start over", false), ("Resume", true)],
                                    &mut state.settings.pause_info_card,
                                );
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "When a video ends",
                            "Applied to new sessions",
                            |ui| {
                                let opts = [
                                    ("home", "Play next"),
                                    ("replay", "Repeat"),
                                    ("stay", "Stop"),
                                ];
                                segmented_str(ui, tokens, &opts, &mut state.settings.end_of_collection_action);
                                state.settings.auto_next =
                                    state.settings.end_of_collection_action == "home";
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "Skip step",
                            "Seconds jumped on forward / backward skip",
                            |ui| {
                                let opts = [(5u32, "5s"), (10, "10s"), (15, "15s"), (30, "30s")];
                                segmented_u32(ui, tokens, &opts, &mut state.settings.skip_secs);
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "Auto-skip intro & outro",
                            "Automatically skip detected intro and credits segments",
                            |ui| {
                                let mut both = state.settings.auto_skip_intro;
                                if toggle_switch(ui, &mut both, tokens).changed() {
                                    state.settings.auto_skip_intro = both;
                                    state.settings.auto_skip_outro = both;
                                }
                            },
                        );
                    });

                    ui.add_space(12.0);
                    setting_card(ui, tokens, "Mouse and keyboard", "", |ui| {
                        setting_row(
                            ui,
                            tokens,
                            "Media keys",
                            "Control playback with keyboard media keys",
                            |ui| {
                                toggle_switch(ui, &mut state.settings.system_media_controls, tokens);
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "Confirm quit while playing",
                            "Ask before closing while a video is active",
                            |ui| {
                                toggle_switch(ui, &mut state.settings.confirm_quit_while_playing, tokens);
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "Keyboard shortcuts",
                            "Press ? anywhere in the player to see them",
                            |ui| {
                                if pill_btn(ui, tokens, "View", false).clicked() {
                                    shortcuts_open = true;
                                }
                            },
                        );
                    });
                }

                "picture" => {
                    setting_card(ui, tokens, "Picture and decoding", "", |ui| {
                        setting_row(
                            ui,
                            tokens,
                            "HDR tone-mapping (10-bit HDR)",
                            "Algorithm used to map 10-bit HDR onto an SDR display",
                            |ui| {
                                let opts = [
                                    ("auto", "Auto"),
                                    ("bt.2446a", "BT.2446a"),
                                    ("mobius", "Mobius"),
                                    ("hable", "Hable"),
                                    ("clip", "Clip"),
                                ];
                                segmented_str(ui, tokens, &opts, &mut state.settings.tone_mapping_mode);
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "Hardware decode",
                            "Use the GPU to decode video, or fall back to CPU",
                            |ui| {
                                let opts = [
                                    ("auto-safe", "Auto"),
                                    ("d3d11va", "D3D11VA"),
                                    ("nvdec", "NVDEC"),
                                    ("software", "Software"),
                                ];
                                segmented_str(ui, tokens, &opts, &mut state.settings.decoding_mode);
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "Timeline peek thumbnails",
                            "Show frame previews when hovering the seek bar",
                            |ui| {
                                toggle_switch(ui, &mut state.settings.timeline_peek, tokens);
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "Ambiance glow",
                            "Subtle warm frame glow around the video surface",
                            |ui| {
                                toggle_switch(ui, &mut state.settings.ambiance_glow, tokens);
                            },
                        );
                    });
                }

                "audio" => {
                    setting_card(ui, tokens, "Sound", "", |ui| {
                        setting_row(
                            ui,
                            tokens,
                            "Default volume",
                            "Starting audio level for new playback sessions",
                            |ui| {
                                ui.horizontal(|ui| {
                                    let mut pct = (state.settings.volume * 100.0).round() as i32;
                                    if ui
                                        .add(egui::Slider::new(&mut pct, 0..=100).show_value(false))
                                        .changed()
                                    {
                                        state.settings.volume = (pct as f64) / 100.0;
                                    }
                                    ui.label(
                                        RichText::new(format!("{pct}%"))
                                            .size(12.0)
                                            .color(tokens.accent),
                                    );
                                });
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "Start muted",
                            "Begin playback with audio muted",
                            |ui| {
                                toggle_switch(ui, &mut state.settings.is_muted, tokens);
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "Preferred audio language",
                            "Auto-select this track when a file offers it",
                            |ui| {
                                let opts = [
                                    ("eng", "English"),
                                    ("jpn", "Japanese"),
                                    ("kor", "Korean"),
                                    ("spa", "Spanish"),
                                ];
                                segmented_str(ui, tokens, &opts, &mut state.settings.default_audio_lang);
                            },
                        );
                    });
                }

                "subtitles" => {
                    let font_id_key = ui.scope_id().with("sub_font_family");
                    let scale_id_key = ui.scope_id().with("sub_scale_pct");
                    let fg_id_key = ui.scope_id().with("sub_fg_idx");
                    let bg_id_key = ui.scope_id().with("sub_bg_idx");

                    let mut font_name: String = ui
                        .data(|d| d.get_temp(font_id_key))
                        .unwrap_or_else(|| "Outfit".to_string());
                    let mut scale_pct: i32 = ui.data(|d| d.get_temp(scale_id_key)).unwrap_or(100);
                    let mut fg_idx: usize = ui.data(|d| d.get_temp(fg_id_key)).unwrap_or(0);
                    let mut bg_idx: usize = ui.data(|d| d.get_temp(bg_id_key)).unwrap_or(0);

                    let fg_colors = [
                        ("White", Color32::WHITE),
                        ("Yellow", Color32::from_rgb(253, 224, 71)),
                        ("Green", Color32::from_rgb(134, 239, 172)),
                        ("Blue", Color32::from_rgb(147, 197, 253)),
                        ("Red", Color32::from_rgb(252, 165, 165)),
                    ];
                    let bg_options = [
                        ("Box", Color32::from_black_alpha(185)),
                        ("Dim", Color32::from_black_alpha(110)),
                        ("Clear", Color32::TRANSPARENT),
                    ];

                    // Live Subtitle Preview Banner
                    Frame::new()
                        .fill(Color32::from_rgb(18, 28, 38))
                        .corner_radius(CornerRadius::same(12))
                        .stroke(Stroke::new(1.0, tokens.divider))
                        .inner_margin(egui::Margin::symmetric(20, 34))
                        .show(ui, |ui| {
                            ui.vertical_centered(|ui| {
                                let preview_size = 14.0 * (scale_pct as f32 / 100.0);
                                let fg_col = fg_colors[fg_idx].1;
                                let bg_col = bg_options[bg_idx].1;
                                let family = if font_name == "Mono" {
                                    egui::FontFamily::Monospace
                                } else {
                                    egui::FontFamily::Proportional
                                };
                                Frame::new()
                                    .fill(bg_col)
                                    .corner_radius(CornerRadius::same(6))
                                    .inner_margin(egui::Margin::symmetric(14, 6))
                                    .show(ui, |ui| {
                                        ui.label(
                                            RichText::new("This is how your subtitles will look.")
                                                .font(FontId::new(preview_size, family))
                                                .strong()
                                                .color(fg_col),
                                        );
                                    });
                            });
                        });

                    ui.add_space(12.0);
                    setting_card(ui, tokens, "Subtitles", "", |ui| {
                        setting_row(
                            ui,
                            tokens,
                            "Show subtitles",
                            "Show subtitles when a video starts",
                            |ui| {
                                toggle_switch(ui, &mut state.settings.subtitles_overlay, tokens);
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "Subtitle language",
                            "Preferred subtitle track language",
                            |ui| {
                                let opts = [
                                    ("eng", "English"),
                                    ("jpn", "Japanese"),
                                    ("spa", "Spanish"),
                                    ("off", "Off"),
                                ];
                                segmented_str(ui, tokens, &opts, &mut state.settings.default_sub_lang);
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "Text size",
                            "Subtitle scale (75%–150%)",
                            |ui| {
                                ui.horizontal(|ui| {
                                    for (pct, lbl) in [(80, "S"), (100, "M"), (125, "L"), (150, "XL")] {
                                        if pill_btn(ui, tokens, lbl, scale_pct == pct).clicked() {
                                            scale_pct = pct;
                                        }
                                    }
                                });
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "Text colour",
                            "Colour for subtitle lettering",
                            |ui| {
                                ui.horizontal(|ui| {
                                    for (idx, (name, col)) in fg_colors.iter().enumerate() {
                                        let (r, resp) = ui.allocate_exact_size(Vec2::splat(24.0), Sense::click());
                                        if resp.hovered() {
                                            ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                        }
                                        ui.painter().rect_filled(r, CornerRadius::same(12), *col);
                                        ui.painter().rect_stroke(
                                            r,
                                            CornerRadius::same(12),
                                            Stroke::new(
                                                if fg_idx == idx { 2.0 } else { 1.0 },
                                                if fg_idx == idx {
                                                    tokens.accent
                                                } else {
                                                    tokens.divider
                                                },
                                            ),
                                            StrokeKind::Inside,
                                        );
                                        if resp.clicked() {
                                            fg_idx = idx;
                                        }
                                        resp.on_hover_text(*name);
                                    }
                                });
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "Text style",
                            "Backdrop box or clear outline",
                            |ui| {
                                ui.horizontal(|ui| {
                                    for (idx, (lbl, _)) in bg_options.iter().enumerate() {
                                        if pill_btn(ui, tokens, lbl, bg_idx == idx).clicked() {
                                            bg_idx = idx;
                                        }
                                    }
                                });
                            },
                        );
                        sub_divider(ui, tokens);
                        setting_row(
                            ui,
                            tokens,
                            "Font",
                            "Typeface for rendered subtitles",
                            |ui| {
                                ui.horizontal(|ui| {
                                    for f in ["Outfit", "Segoe UI", "Mono"] {
                                        if pill_btn(ui, tokens, f, font_name == f).clicked() {
                                            font_name = f.to_string();
                                        }
                                    }
                                });
                            },
                        );
                    });

                    ui.data_mut(|d| {
                        d.insert_temp(font_id_key, font_name);
                        d.insert_temp(scale_id_key, scale_pct);
                        d.insert_temp(fg_id_key, fg_idx);
                        d.insert_temp(bg_id_key, bg_idx);
                    });
                }

                "library" => {
                    setting_card(ui, tokens, "Library folders", "Watched folders and excluded subfolders.", |ui| {
                        ui.horizontal(|ui| {
                            ui.spacing_mut().item_spacing.x = 8.0;
                            let add_btn = egui::Button::new(
                                RichText::new("+ Add a folder...")
                                    .size(12.5)
                                    .strong()
                                    .color(Color32::WHITE),
                            )
                            .fill(accent_button)
                            .corner_radius(CornerRadius::same(8))
                            .min_size(Vec2::new(132.0, 32.0));
                            if ui.add(add_btn).clicked() {
                                action = ShellAction::AddFolderPicker;
                            }
                            if action_pill_btn(ui, tokens, "Rescan all").clicked() {
                                action = ShellAction::ScanAllFolders;
                            }
                            if action_pill_btn(ui, tokens, "Exclude subfolder...").clicked() {
                                action = ShellAction::ExcludeSubfolderPicker;
                            }
                        });
                        ui.add_space(10.0);

                        if state.root_folders.is_empty() {
                            ui.label(
                                RichText::new("No folders added yet.")
                                    .size(12.5)
                                    .color(tokens.text_secondary),
                            );
                        }
                        for folder in &state.root_folders {
                            Frame::new()
                                .fill(tokens.field_fill)
                                .stroke(Stroke::new(1.0, tokens.divider))
                                .corner_radius(CornerRadius::same(10))
                                .inner_margin(12.0)
                                .show(ui, |ui| {
                                    ui.horizontal(|ui| {
                                        icons.paint_icon(
                                            ui,
                                            "folder",
                                            Rect::from_min_size(ui.cursor().min, Vec2::splat(18.0)),
                                            tokens.accent,
                                        );
                                        ui.add_space(24.0);
                                        ui.vertical(|ui| {
                                            ui.label(
                                                RichText::new(&folder.name)
                                                    .size(13.0)
                                                    .strong()
                                                    .color(tokens.text_primary),
                                            );
                                            ui.label(
                                                RichText::new(folder.path.display().to_string())
                                                    .size(11.5)
                                                    .color(tokens.text_secondary),
                                            );
                                        });
                                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                            if pill_btn(ui, tokens, "Remove", false).clicked() {
                                                action = ShellAction::RemoveFolder(folder.path.clone());
                                            }
                                            if pill_btn(ui, tokens, "Rescan", false).clicked() {
                                                action = ShellAction::ScanFolder(folder.path.clone());
                                            }
                                        });
                                    });
                                });
                            ui.add_space(6.0);
                        }

                        // Excluded folders shown inline in gray/disabled style
                        if !state.excluded_paths.is_empty() {
                            ui.add_space(8.0);
                            ui.label(
                                RichText::new("Excluded folders (disabled)")
                                    .size(12.5)
                                    .color(tokens.text_tertiary),
                            );
                            ui.add_space(6.0);
                            for excluded in &state.excluded_paths {
                                let ex_name = excluded
                                    .file_name()
                                    .map(|s| s.to_string_lossy().into_owned())
                                    .unwrap_or_else(|| excluded.display().to_string());
                                Frame::new()
                                    .fill(Color32::from_white_alpha(6))
                                    .stroke(Stroke::new(1.0, tokens.divider))
                                    .corner_radius(CornerRadius::same(10))
                                    .inner_margin(10.0)
                                    .show(ui, |ui| {
                                        ui.horizontal(|ui| {
                                            icons.paint_icon(
                                                ui,
                                                "folder",
                                                Rect::from_min_size(ui.cursor().min, Vec2::splat(16.0)),
                                                tokens.text_tertiary,
                                            );
                                            ui.add_space(22.0);
                                            ui.vertical(|ui| {
                                                ui.label(
                                                    RichText::new(format!("{ex_name}  (Excluded)"))
                                                        .size(12.5)
                                                        .color(tokens.text_tertiary),
                                                );
                                                ui.label(
                                                    RichText::new(excluded.display().to_string())
                                                        .size(11.0)
                                                        .color(tokens.text_tertiary),
                                                );
                                            });
                                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                                if pill_btn(ui, tokens, "Restore", false).clicked() {
                                                    action = ShellAction::IncludeSubfolder(excluded.clone());
                                                }
                                            });
                                        });
                                    });
                                ui.add_space(5.0);
                            }
                        }
                    });
                }

                "integrations" => {
                    setting_card(ui, tokens, "Trakt.tv", "Sync playback progress, scrobble watched items, and sync ratings.", |ui| {
                        setting_row(ui, tokens, "Scrobble watched items", "Automatically mark movies & episodes watched on Trakt", |ui| {
                            toggle_switch(ui, &mut state.settings.trakt_scrobble, tokens);
                        });
                        sub_divider(ui, tokens);
                        setting_row(ui, tokens, "Sync ratings", "Keep ratings in sync with your Trakt account", |ui| {
                            toggle_switch(ui, &mut state.settings.trakt_sync_ratings, tokens);
                        });
                        sub_divider(ui, tokens);
                        setting_row(ui, tokens, "Trakt username", "Connected Trakt profile", |ui| {
                            ui.add_sized(
                                [220.0, 28.0],
                                egui::TextEdit::singleline(&mut state.settings.trakt_username)
                                    .hint_text("Username (optional)"),
                            );
                        });
                    });

                    ui.add_space(12.0);
                    setting_card(ui, tokens, "The Movie Database (TMDB)", "Enrich local media with posters, backdrops, and episode counts.", |ui| {
                        setting_row(ui, tokens, "Enable TMDB metadata", "Fetch artwork and episode metadata automatically", |ui| {
                            toggle_switch(ui, &mut state.settings.tmdb_enabled, tokens);
                        });
                        sub_divider(ui, tokens);
                        setting_row(ui, tokens, "TMDB API Key", "Your v3 API key", |ui| {
                            ui.add_sized(
                                [260.0, 28.0],
                                egui::TextEdit::singleline(&mut state.settings.tmdb_api_key)
                                    .password(true)
                                    .hint_text("Enter TMDB API key..."),
                            );
                        });
                    });

                    ui.add_space(12.0);
                    setting_card(ui, tokens, "TheIntroDB", "Skip intro and outro timestamps from community databases.", |ui| {
                        setting_row(ui, tokens, "TheIntroDB API Key", "Optional API key for intro/outro timestamps", |ui| {
                            ui.add_sized(
                                [260.0, 28.0],
                                egui::TextEdit::singleline(&mut state.settings.theintrodb_api_key)
                                    .password(true)
                                    .hint_text("Enter TheIntroDB key..."),
                            );
                        });
                    });

                    ui.add_space(12.0);
                    let osub_key_id = ui.scope_id().with("osub_api_key");
                    let osub_lang_id = ui.scope_id().with("osub_lang");
                    let osub_auto_id = ui.scope_id().with("osub_auto_dl");
                    let osub_hash_id = ui.scope_id().with("osub_hash");
                    let discord_id = ui.scope_id().with("discord_rpc");

                    let mut osub_key: String = ui.data(|d| d.get_temp(osub_key_id)).unwrap_or_default();
                    let mut osub_lang: String = ui
                        .data(|d| d.get_temp(osub_lang_id))
                        .unwrap_or_else(|| "English (en)".to_string());
                    let mut osub_auto_dl: bool = ui.data(|d| d.get_temp(osub_auto_id)).unwrap_or(true);
                    let mut osub_hash: bool = ui.data(|d| d.get_temp(osub_hash_id)).unwrap_or(true);
                    let mut discord_rpc: bool = ui.data(|d| d.get_temp(discord_id)).unwrap_or(false);

                    setting_card(ui, tokens, "OpenSubtitles.com", "Automatic multi-language subtitle search, hash matching, and downloading.", |ui| {
                        setting_row(ui, tokens, "API Key", "Your OpenSubtitles.com REST API key", |ui| {
                            ui.add_sized(
                                [260.0, 28.0],
                                egui::TextEdit::singleline(&mut osub_key)
                                    .password(true)
                                    .hint_text("Enter OpenSubtitles API key..."),
                            );
                        });
                        sub_divider(ui, tokens);
                        setting_row(ui, tokens, "Preferred language", "Default subtitle download language", |ui| {
                            let langs = [("English (en)", "English"), ("Japanese (ja)", "Japanese"), ("Spanish (es)", "Spanish")];
                            egui::Frame::new()
                                .fill(tokens.field_fill)
                                .stroke(Stroke::new(1.0, tokens.divider))
                                .corner_radius(CornerRadius::same(8))
                                .inner_margin(egui::Margin::same(2))
                                .show(ui, |ui| {
                                    ui.spacing_mut().item_spacing.x = 2.0;
                                    for &(val, lbl) in &langs {
                                        if pill_btn(ui, tokens, lbl, osub_lang == val).clicked() {
                                            osub_lang = val.to_string();
                                        }
                                    }
                                });
                        });
                        sub_divider(ui, tokens);
                        setting_row(ui, tokens, "Auto-download subtitles", "Automatically fetch missing subtitles on playback", |ui| {
                            toggle_switch(ui, &mut osub_auto_dl, tokens);
                        });
                        sub_divider(ui, tokens);
                        setting_row(ui, tokens, "Hash matching", "Prefer exact file-hash subtitle matches", |ui| {
                            toggle_switch(ui, &mut osub_hash, tokens);
                        });
                    });

                    ui.add_space(12.0);
                    setting_card(ui, tokens, "Discord & Presence Tools", "Share currently playing media and elapsed time in Discord.", |ui| {
                        setting_row(ui, tokens, "Discord Rich Presence", "Show active movie or episode in your Discord status", |ui| {
                            toggle_switch(ui, &mut discord_rpc, tokens);
                        });
                    });

                    ui.data_mut(|d| {
                        d.insert_temp(osub_key_id, osub_key);
                        d.insert_temp(osub_lang_id, osub_lang);
                        d.insert_temp(osub_auto_id, osub_auto_dl);
                        d.insert_temp(osub_hash_id, osub_hash);
                        d.insert_temp(discord_id, discord_rpc);
                    });
                }

                "general" => {
                    setting_card(ui, tokens, "Appearance", "Choose a theme and display scaling.", |ui| {
                        let themes = [
                            ("cnx", "CnX", Color32::from_rgb(26, 22, 19), Color32::from_rgb(235, 140, 52)),
                            ("cloudflare-docs", "Cloudflare Docs", Color32::from_rgb(13, 17, 23), Color32::from_rgb(47, 129, 247)),
                            ("oled-black", "OLED Black", Color32::BLACK, Color32::from_rgb(246, 130, 31)),
                            ("vlc", "VLC Classic", Color32::from_rgb(37, 37, 38), Color32::from_rgb(255, 136, 0)),
                            ("netflix", "Netflix", Color32::from_rgb(20, 20, 20), Color32::from_rgb(229, 9, 20)),
                            ("youtube", "YouTube", Color32::from_rgb(15, 15, 15), Color32::from_rgb(62, 166, 255)),
                            ("valor-purple", "Obsidian Violet", Color32::from_rgb(16, 16, 16), Color32::from_rgb(168, 85, 247)),
                            ("github-midnight", "GitHub Midnight", Color32::from_rgb(13, 17, 23), Color32::from_rgb(31, 111, 235)),
                        ];
                        ui.horizontal_wrapped(|ui| {
                            ui.spacing_mut().item_spacing = Vec2::new(8.0, 8.0);
                            for (id, label, bg_col, accent_col) in themes {
                                let active = state.settings.skin_id == id;
                                let (r, resp) = ui.allocate_exact_size(Vec2::new(142.0, 44.0), Sense::click());
                                if resp.hovered() {
                                    ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                }
                                ui.painter().rect(
                                    r,
                                    CornerRadius::same(10),
                                    bg_col,
                                    Stroke::new(
                                        if active { 1.5 } else { 1.0 },
                                        if active { accent_col } else { tokens.divider },
                                    ),
                                    StrokeKind::Inside,
                                );
                                ui.painter().circle_filled(Pos2::new(r.left() + 16.0, r.center().y), 6.0, accent_col);
                                ui.painter().text(
                                    Pos2::new(r.left() + 30.0, r.center().y),
                                    Align2::LEFT_CENTER,
                                    label,
                                    FontId::proportional(12.5),
                                    if active { Color32::WHITE } else { tokens.text_secondary },
                                );
                                if resp.clicked() {
                                    state.settings.skin_id = id.to_string();
                                    state.settings.custom_skin_path.clear();
                                }
                            }
                        });
                        sub_divider(ui, tokens);
                        setting_row(ui, tokens, "Text size", "Interface font scaling", |ui| {
                            let opts = [(90u8, "90%"), (100, "100%"), (110, "110%"), (120, "120%")];
                            segmented_u8(ui, tokens, &opts, &mut state.settings.text_scale_pct);
                        });
                    });

                    ui.add_space(12.0);
                    setting_card(ui, tokens, "Privacy", "", |ui| {
                        setting_row(ui, tokens, "Clear watch history", "Removes resume points and recents", |ui| {
                            if danger_btn(ui, "Clear").clicked() {
                                action = ShellAction::ClearHistory { reset_positions: false };
                            }
                        });
                        sub_divider(ui, tokens);
                        setting_row(ui, tokens, "Clear all resume positions", "Reset every video to start from the beginning", |ui| {
                            if danger_btn(ui, "Clear").clicked() {
                                action = ShellAction::ClearHistory { reset_positions: true };
                            }
                        });
                    });

                    ui.add_space(12.0);
                    setting_card(ui, tokens, "About", "", |ui| {
                        setting_row(ui, tokens, "Valor", "Version 0.1.0", |ui| {
                            if danger_btn(ui, "Reset defaults").clicked() {
                                state.settings = valor_core::settings::Settings::default();
                            }
                        });
                    });
                }

                _ => {}
            }
        });

    if shortcuts_open {
        let screen = page.ctx().content_rect();
        let modal_w = 660.0_f32.min(screen.width() - 32.0);
        let modal_h = 430.0_f32.min(screen.height() - 32.0);
        let modal_r = Rect::from_center_size(screen.center(), Vec2::new(modal_w, modal_h));
        let mut close_req = false;
        egui::Area::new(egui::Id::new("cnx_shortcuts_modal"))
            .order(egui::Order::Foreground)
            .fixed_pos(modal_r.min)
            .show(page.ctx(), |ui| {
                Frame::new()
                    .fill(tokens.window_bg)
                    .stroke(Stroke::new(1.0, tokens.divider))
                    .corner_radius(CornerRadius::same(16))
                    .inner_margin(20.0)
                    .show(ui, |ui| {
                        ui.set_width(modal_w - 40.0);
                        ui.horizontal(|ui| {
                            ui.vertical(|ui| {
                                ui.label(RichText::new("Keyboard shortcuts").size(16.0).strong().color(tokens.text_primary));
                                ui.label(RichText::new("Press ? anywhere in the player to open this list.").size(12.0).color(tokens.text_secondary));
                            });
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                if pill_btn(ui, tokens, "✕", false).clicked() {
                                    close_req = true;
                                }
                            });
                        });
                        ui.add_space(14.0);
                        ui.columns(2, |cols| {
                            shortcut_group(
                                &mut cols[0],
                                tokens,
                                "Playing",
                                &[
                                    ("Play / pause", &["Space"]),
                                    ("Seek", &["←", "→"]),
                                    ("Slower / faster", &["[", "]"]),
                                    ("Normal speed", &["="]),
                                    ("Next / previous", &["N", "P"]),
                                    ("Next / prev chapter", &["PgUp", "PgDn"]),
                                    ("A-B loop", &["L"]),
                                ],
                            );
                            shortcut_group(
                                &mut cols[1],
                                tokens,
                                "Sound and subtitles",
                                &[
                                    ("Volume", &["↑", "↓"]),
                                    ("Mute / unmute", &["M"]),
                                    ("Audio track", &["A", "B"]),
                                    ("Subtitle track", &["J", "V"]),
                                ],
                            );
                            cols[1].add_space(12.0);
                            shortcut_group(
                                &mut cols[1],
                                tokens,
                                "Picture and window",
                                &[
                                    ("Fullscreen", &["F"]),
                                    ("Exit fullscreen", &["Esc"]),
                                    ("Picture-in-picture", &["Ctrl", "Shift", "P"]),
                                    ("Reset view", &["R"]),
                                    ("Snapshot", &["S"]),
                                ],
                            );
                        });
                    });
            });
        if close_req || page.ctx().input(|i| i.key_pressed(egui::Key::Escape)) {
            shortcuts_open = false;
        }
    }
    page.data_mut(|d| d.insert_temp(shortcuts_open_id, shortcuts_open));
    action
}

fn pill_btn(ui: &mut Ui, tokens: &ShellTokens, label: &str, active: bool) -> egui::Response {
    let accent_container = tokens.accent;
    let on_accent_container = crate::ui_kit::contrast_on_accent(tokens.accent);
    let btn = egui::Button::new(
        RichText::new(label)
            .size(12.0)
            .color(if active { on_accent_container } else { tokens.text_primary }),
    )
    .fill(if active { accent_container } else { tokens.field_fill })
    .stroke(Stroke::new(1.0, if active { accent_container } else { tokens.divider }))
    .corner_radius(CornerRadius::same(8))
    .min_size(Vec2::new(48.0, 28.0));
    let resp = ui.add(btn);
    if resp.hovered() {
        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
    }
    resp
}

fn action_pill_btn(ui: &mut Ui, tokens: &ShellTokens, label: &str) -> egui::Response {
    let w = (label.len() as f32 * 7.2 + 24.0).max(88.0);
    let btn = egui::Button::new(
        RichText::new(label)
            .size(12.5)
            .color(tokens.text_primary),
    )
    .fill(tokens.hover_fill)
    .stroke(Stroke::new(1.0, tokens.divider_strong))
    .corner_radius(CornerRadius::same(8))
    .min_size(Vec2::new(w, 32.0));
    let resp = ui.add(btn);
    if resp.hovered() {
        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
    }
    resp
}

fn danger_btn(ui: &mut Ui, label: &str) -> egui::Response {
    let w = (label.len() as f32 * 7.2 + 24.0).max(74.0);
    let btn = egui::Button::new(
        RichText::new(label)
            .size(12.0)
            .strong()
            .color(Color32::WHITE),
    )
    .fill(Color32::from_rgb(0xC4, 0x2B, 0x1C))
    .stroke(Stroke::new(1.0, Color32::from_rgb(0xE0, 0x43, 0x33)))
    .corner_radius(CornerRadius::same(8))
    .min_size(Vec2::new(w, 28.0));
    let resp = ui.add(btn);
    if resp.hovered() {
        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
    }
    resp
}

fn segmented_choice(ui: &mut Ui, tokens: &ShellTokens, opts: &[(&str, bool)], val: &mut bool) {
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 6.0;
        for &(lbl, v) in opts {
            if pill_btn(ui, tokens, lbl, *val == v).clicked() {
                *val = v;
            }
        }
    });
}

fn segmented_str(ui: &mut Ui, tokens: &ShellTokens, opts: &[(&str, &str)], val: &mut String) {
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 6.0;
        for &(k, lbl) in opts {
            if pill_btn(ui, tokens, lbl, val == k).clicked() {
                *val = k.to_string();
            }
        }
    });
}

fn segmented_u32(ui: &mut Ui, tokens: &ShellTokens, opts: &[(u32, &str)], val: &mut u32) {
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 6.0;
        for &(k, lbl) in opts {
            if pill_btn(ui, tokens, lbl, *val == k).clicked() {
                *val = k;
            }
        }
    });
}

fn segmented_u8(ui: &mut Ui, tokens: &ShellTokens, opts: &[(u8, &str)], val: &mut u8) {
    ui.horizontal(|ui| {
        ui.spacing_mut().item_spacing.x = 6.0;
        for &(k, lbl) in opts {
            if pill_btn(ui, tokens, lbl, *val == k).clicked() {
                *val = k;
            }
        }
    });
}

fn shortcut_group(ui: &mut Ui, tokens: &ShellTokens, title: &str, rows: &[(&str, &[&str])]) {
    ui.label(RichText::new(title).size(13.0).strong().color(tokens.accent));
    ui.add_space(6.0);
    for &(label, keys) in rows {
        ui.horizontal(|ui| {
            ui.label(RichText::new(label).size(12.5).color(tokens.text_primary));
            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                ui.spacing_mut().item_spacing.x = 4.0;
                for &k in keys.iter().rev() {
                    Frame::new()
                        .fill(tokens.field_fill)
                        .stroke(Stroke::new(1.0, tokens.divider))
                        .corner_radius(CornerRadius::same(6))
                        .inner_margin(egui::Margin::symmetric(8, 3))
                        .show(ui, |ui| {
                            ui.label(RichText::new(k).size(11.0).monospace().color(tokens.text_primary));
                        });
                }
            });
        });
        ui.add_space(4.0);
    }
}
