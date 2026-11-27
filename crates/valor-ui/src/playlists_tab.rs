use crate::icons::IconRegistry;
use crate::shell::ShellAction;
use crate::shell_state::ShellState;
use crate::shell_tokens::ShellTokens;
use crate::texture_cache::LruTextureCache;
use crate::theme::ValorTheme;
use crate::view_models::{SortOption, ViewMode};
use egui::{Align, Color32, CornerRadius, FontId, Layout, Rect, RichText, Stroke, Ui, Vec2};
use std::path::PathBuf;
use valor_core::models::MediaItem;

pub struct LibraryCtx<'a> {
    pub theme: &'a ValorTheme,
    pub icons: &'a IconRegistry,
    pub texture_cache: &'a mut LruTextureCache,
    pub search_query: &'a str,
    pub sort_option: SortOption,
    pub view_mode: ViewMode,
    pub playlists_count: usize,
    pub content_rect: Rect,
}

pub fn render(_ui: &mut Ui, _ctx: &mut LibraryCtx) {}

pub fn render_playlists_view(
    ui: &mut Ui,
    state: &mut ShellState,
    items: &[MediaItem],
    tokens: &ShellTokens,
    action: &mut ShellAction,
) {
    let playlists: Vec<_> = state
        .playlists
        .iter()
        .filter(|c| c.collection_type == "playlist")
        .cloned()
        .collect();

    if state.selected_playlist_id.is_none() {
        if let Some(first) = playlists.first() {
            state.selected_playlist_id = Some(first.id.clone());
        }
    }

    // Create playlist bar
    egui::Frame::NONE
        .fill(tokens.card_fill)
        .stroke(Stroke::new(1.0, tokens.divider))
        .corner_radius(CornerRadius::ZERO)
        .inner_margin(egui::Margin::symmetric(12, 10))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new("Playlists")
                        .size(15.0)
                        .strong()
                        .color(tokens.text_primary),
                );
                ui.add_space(12.0);
                let te = ui.add(
                    egui::TextEdit::singleline(&mut state.new_playlist_name)
                        .hint_text("New playlist name...")
                        .desired_width(240.0),
                );
                let enter_pressed =
                    te.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter));
                let create_btn = ui.add(
                    egui::Button::new(
                        RichText::new("+ Create Playlist")
                            .size(12.5)
                            .strong()
                            .color(Color32::WHITE),
                    )
                    .fill(tokens.accent)
                    .stroke(Stroke::new(1.0, tokens.accent))
                    .corner_radius(CornerRadius::ZERO)
                    .min_size(Vec2::new(130.0, 28.0)),
                );
                if (create_btn.clicked() || enter_pressed)
                    && !state.new_playlist_name.trim().is_empty()
                {
                    *action = ShellAction::CreatePlaylist(state.new_playlist_name.trim().to_string());
                    state.new_playlist_name.clear();
                }
            });
        });

    ui.add_space(12.0);

    if playlists.is_empty() {
        egui::Frame::NONE
            .fill(tokens.card_fill)
            .stroke(Stroke::new(1.0, tokens.divider))
            .corner_radius(CornerRadius::ZERO)
            .inner_margin(egui::Margin::symmetric(16, 18))
            .show(ui, |ui| {
                ui.label(
                    RichText::new("No playlists yet. Create one above, or right-click any media item and choose \"Add to Playlist...\".")
                        .size(13.0)
                        .color(tokens.text_secondary),
                );
            });
        return;
    }

    let avail_w = ui.available_width();
    let left_w = (avail_w * 0.34).clamp(240.0, 340.0);

    ui.horizontal_top(|ui| {
        // Left column: playlist list
        ui.allocate_ui_with_layout(
            Vec2::new(left_w, ui.available_height()),
            Layout::top_down(Align::Min),
            |ui| {
                for pl in &playlists {
                    let is_sel = state.selected_playlist_id.as_deref() == Some(pl.id.as_str());
                    let fill = if is_sel {
                        tokens.selected_fill
                    } else {
                        tokens.card_fill
                    };
                    let stroke_col = if is_sel { tokens.accent } else { tokens.divider };
                    let resp = egui::Frame::NONE
                        .fill(fill)
                        .stroke(Stroke::new(1.0, stroke_col))
                        .corner_radius(CornerRadius::ZERO)
                        .inner_margin(egui::Margin::symmetric(10, 8))
                        .show(ui, |ui| {
                            ui.set_width((left_w - 22.0).max(160.0));
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                if ui
                                    .add(
                                        egui::Button::new(
                                            RichText::new("Delete")
                                                .size(11.0)
                                                .color(Color32::from_rgb(248, 113, 113)),
                                        )
                                        .fill(tokens.field_fill)
                                        .stroke(Stroke::new(1.0, tokens.divider))
                                        .corner_radius(CornerRadius::ZERO),
                                    )
                                    .clicked()
                                {
                                    *action = ShellAction::DeletePlaylist(pl.id.clone());
                                }
                                if !pl.item_ids.is_empty()
                                    && ui
                                        .add(
                                            egui::Button::new(
                                                RichText::new("▶ Play")
                                                    .size(11.0)
                                                    .color(Color32::WHITE),
                                            )
                                            .fill(tokens.accent)
                                            .stroke(Stroke::new(1.0, tokens.accent))
                                            .corner_radius(CornerRadius::ZERO),
                                        )
                                        .clicked()
                                {
                                    *action = ShellAction::PlayPlaylist(pl.id.clone());
                                }
                                ui.with_layout(Layout::top_down(Align::Min), |ui| {
                                    ui.label(
                                        RichText::new(&pl.name)
                                            .size(13.5)
                                            .strong()
                                            .color(if is_sel {
                                                Color32::WHITE
                                            } else {
                                                tokens.text_primary
                                            }),
                                    );
                                    ui.label(
                                        RichText::new(format!("{} items", pl.item_ids.len()))
                                            .size(11.5)
                                            .color(tokens.text_tertiary),
                                    );
                                });
                            });
                        })
                        .response;
                    if resp.interact(egui::Sense::click()).clicked() {
                        state.selected_playlist_id = Some(pl.id.clone());
                    }
                    ui.add_space(6.0);
                }
            },
        );

        ui.add_space(12.0);

        // Right column: selected playlist items
        let right_w = (ui.available_width() - 4.0).max(220.0);
        ui.allocate_ui_with_layout(
            Vec2::new(right_w, ui.available_height()),
            Layout::top_down(Align::Min),
            |ui| {
                let selected = playlists
                    .iter()
                    .find(|p| state.selected_playlist_id.as_deref() == Some(p.id.as_str()))
                    .or_else(|| playlists.first());
                let Some(pl) = selected else {
                    return;
                };

                egui::Frame::NONE
                    .fill(tokens.card_fill)
                    .stroke(Stroke::new(1.0, tokens.divider))
                    .corner_radius(CornerRadius::ZERO)
                    .inner_margin(egui::Margin::symmetric(14, 12))
                    .show(ui, |ui| {
                        ui.set_width((right_w - 28.0).max(180.0));
                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                            if ui
                                .add(
                                    egui::Button::new(
                                        RichText::new("Delete Playlist")
                                            .size(12.0)
                                            .color(Color32::from_rgb(248, 113, 113)),
                                    )
                                    .fill(tokens.field_fill)
                                    .stroke(Stroke::new(1.0, tokens.divider))
                                    .corner_radius(CornerRadius::ZERO)
                                    .min_size(Vec2::new(108.0, 28.0)),
                                )
                                .clicked()
                            {
                                *action = ShellAction::DeletePlaylist(pl.id.clone());
                            }
                            if ui
                                .add(
                                    egui::Button::new(
                                        RichText::new("+ Add Media")
                                            .size(12.0)
                                            .strong()
                                            .color(Color32::WHITE),
                                    )
                                    .fill(tokens.field_fill)
                                    .stroke(Stroke::new(1.0, tokens.accent))
                                    .corner_radius(CornerRadius::ZERO)
                                    .min_size(Vec2::new(96.0, 28.0)),
                                )
                                .clicked()
                            {
                                state.playlist_picker_open = true;
                            }
                            if !pl.item_ids.is_empty()
                                && ui
                                    .add(
                                        egui::Button::new(
                                            RichText::new("▶ Play All")
                                                .size(12.0)
                                                .strong()
                                                .color(Color32::WHITE),
                                        )
                                        .fill(tokens.accent)
                                        .stroke(Stroke::new(1.0, tokens.accent))
                                        .corner_radius(CornerRadius::ZERO)
                                        .min_size(Vec2::new(88.0, 28.0)),
                                    )
                                    .clicked()
                            {
                                *action = ShellAction::PlayPlaylist(pl.id.clone());
                            }
                            ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                                ui.label(
                                    RichText::new(&pl.name)
                                        .size(16.0)
                                        .strong()
                                        .color(tokens.text_primary),
                                );
                                ui.add_space(6.0);
                                ui.label(
                                    RichText::new(format!("({} items)", pl.item_ids.len()))
                                        .size(12.5)
                                        .color(tokens.text_tertiary),
                                );
                            });
                        });
                        ui.add_space(10.0);
                        ui.separator();
                        ui.add_space(8.0);

                        if pl.item_ids.is_empty() {
                            ui.label(
                                RichText::new("This playlist is empty. Click \"+ Add Media\" above or right-click any item in Home / Library.")
                                    .size(12.5)
                                    .color(tokens.text_secondary),
                            );
                        } else {
                            for (idx, item_key) in pl.item_ids.iter().enumerate() {
                                let matched = items.iter().find(|it| {
                                    it.id == *item_key
                                        || it.fingerprint == *item_key
                                        || it.file_path.eq_ignore_ascii_case(item_key)
                                });
                                let title = matched
                                    .map(|m| m.title.clone())
                                    .unwrap_or_else(|| {
                                        PathBuf::from(item_key)
                                            .file_name()
                                            .map(|s| s.to_string_lossy().to_string())
                                            .unwrap_or_else(|| item_key.clone())
                                    });
                                let play_path = matched
                                    .map(|m| m.file_path.clone())
                                    .unwrap_or_else(|| item_key.clone());

                                egui::Frame::NONE
                                    .fill(tokens.field_fill)
                                    .stroke(Stroke::new(1.0, tokens.divider))
                                    .corner_radius(CornerRadius::ZERO)
                                    .inner_margin(egui::Margin::symmetric(10, 7))
                                    .show(ui, |ui| {
                                        ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                            if ui
                                                .add(
                                                    egui::Button::new(
                                                        RichText::new("Remove")
                                                            .size(11.5)
                                                            .color(Color32::from_rgb(248, 113, 113)),
                                                    )
                                                    .fill(tokens.card_fill)
                                                    .stroke(Stroke::new(1.0, tokens.divider))
                                                    .corner_radius(CornerRadius::ZERO),
                                                )
                                                .clicked()
                                            {
                                                *action = ShellAction::RemoveFromPlaylist {
                                                    playlist_id: pl.id.clone(),
                                                    item_id: item_key.clone(),
                                                };
                                            }
                                            if ui
                                                .add(
                                                    egui::Button::new(
                                                        RichText::new("▶ Play")
                                                            .size(11.5)
                                                            .color(Color32::WHITE),
                                                    )
                                                    .fill(tokens.accent)
                                                    .stroke(Stroke::new(1.0, tokens.accent))
                                                    .corner_radius(CornerRadius::ZERO),
                                                )
                                                .clicked()
                                            {
                                                *action = ShellAction::PlayMedia(
                                                    PathBuf::from(&play_path),
                                                );
                                            }
                                            ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                                                ui.label(
                                                    RichText::new(format!("{}.", idx + 1))
                                                        .font(FontId::monospace(12.0))
                                                        .color(tokens.text_tertiary),
                                                );
                                                ui.label(
                                                    RichText::new(&title)
                                                        .size(13.0)
                                                        .color(tokens.text_primary),
                                                );
                                            });
                                        });
                                    });
                                ui.add_space(4.0);
                            }
                        }
                    });

                // Picker modal to add media directly from the library
                if state.playlist_picker_open {
                    let mut open = true;
                    egui::Window::new(format!("Add Media to \"{}\"", pl.name))
                        .open(&mut open)
                        .collapsible(false)
                        .resizable(true)
                        .default_size([480.0, 420.0])
                        .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
                        .frame(
                            egui::Frame::NONE
                                .fill(tokens.card_fill)
                                .stroke(Stroke::new(1.0, tokens.divider))
                                .corner_radius(CornerRadius::ZERO)
                                .inner_margin(egui::Margin::same(14)),
                        )
                        .show(ui.ctx(), |ui| {
                            ui.add(
                                egui::TextEdit::singleline(&mut state.playlist_picker_query)
                                    .hint_text("Search media to add...")
                                    .desired_width(f32::INFINITY),
                            );
                            ui.add_space(8.0);
                            let q = state.playlist_picker_query.trim().to_lowercase();
                            egui::ScrollArea::vertical()
                                .max_height(340.0)
                                .show(ui, |ui| {
                                    for item in items.iter().filter(|i| {
                                        !i.is_missing
                                            && i.size_bytes >= 100 * 1024 * 1024
                                            && (q.is_empty()
                                                || i.title.to_lowercase().contains(&q)
                                                || i.file_path.to_lowercase().contains(&q))
                                    }) {
                                        let already = pl.item_ids.iter().any(|k| {
                                            k == &item.id
                                                || k == &item.fingerprint
                                                || k.eq_ignore_ascii_case(&item.file_path)
                                        });
                                        ui.horizontal(|ui| {
                                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                                let lbl = if already { "Added" } else { "+ Add" };
                                                if ui
                                                    .add_enabled(
                                                        !already,
                                                        egui::Button::new(
                                                            RichText::new(lbl)
                                                                .size(11.5)
                                                                .color(Color32::WHITE),
                                                        )
                                                        .fill(if already {
                                                            tokens.field_fill
                                                        } else {
                                                            tokens.accent
                                                        })
                                                        .corner_radius(CornerRadius::ZERO),
                                                    )
                                                    .clicked()
                                                {
                                                    *action = ShellAction::AddToPlaylist {
                                                        playlist_id: pl.id.clone(),
                                                        item_path: item.file_path.clone(),
                                                    };
                                                }
                                                ui.with_layout(
                                                    Layout::left_to_right(Align::Center),
                                                    |ui| {
                                                        ui.label(
                                                            RichText::new(&item.title)
                                                                .size(12.5)
                                                                .color(tokens.text_primary),
                                                        );
                                                    },
                                                );
                                            });
                                        });
                                        ui.add_space(3.0);
                                    }
                                });
                        });
                    if !open {
                        state.playlist_picker_open = false;
                    }
                }
            },
        );
    });
}

pub fn render_add_to_playlist_modal(
    ctx: &egui::Context,
    state: &mut ShellState,
    tokens: &ShellTokens,
    action: &mut ShellAction,
) {
    let Some(target_path) = state.add_to_playlist_target.clone() else {
        return;
    };
    let mut open = true;
    egui::Window::new("Add to Playlist")
        .open(&mut open)
        .collapsible(false)
        .resizable(false)
        .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
        .frame(
            egui::Frame::NONE
                .fill(tokens.card_fill)
                .stroke(Stroke::new(1.0, tokens.divider))
                .corner_radius(CornerRadius::ZERO)
                .inner_margin(egui::Margin::same(16)),
        )
        .show(ctx, |ui| {
            ui.set_min_width(320.0);
            let fname = PathBuf::from(&target_path)
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_else(|| target_path.clone());
            ui.label(
                RichText::new(fname)
                    .size(12.5)
                    .color(tokens.text_secondary),
            );
            ui.add_space(10.0);

            let playlists: Vec<_> = state
                .playlists
                .iter()
                .filter(|c| c.collection_type == "playlist")
                .cloned()
                .collect();
            if playlists.is_empty() {
                ui.label(
                    RichText::new("No playlists yet. Create one below:")
                        .size(12.5)
                        .color(tokens.text_tertiary),
                );
            } else {
                for pl in &playlists {
                    if ui
                        .add(
                            egui::Button::new(
                                RichText::new(format!("{}  ({} items)", pl.name, pl.item_ids.len()))
                                    .size(13.0)
                                    .color(tokens.text_primary),
                            )
                            .fill(tokens.field_fill)
                            .stroke(Stroke::new(1.0, tokens.divider))
                            .corner_radius(CornerRadius::ZERO)
                            .min_size(Vec2::new(300.0, 30.0)),
                        )
                        .clicked()
                    {
                        *action = ShellAction::AddToPlaylist {
                            playlist_id: pl.id.clone(),
                            item_path: target_path.clone(),
                        };
                        state.add_to_playlist_target = None;
                    }
                    ui.add_space(4.0);
                }
            }

            ui.add_space(10.0);
            ui.separator();
            ui.add_space(8.0);
            ui.horizontal(|ui| {
                ui.add(
                    egui::TextEdit::singleline(&mut state.new_playlist_name)
                        .hint_text("New playlist name...")
                        .desired_width(190.0),
                );
                if ui
                    .add(
                        egui::Button::new(
                            RichText::new("Create & Add")
                                .size(12.0)
                                .strong()
                                .color(Color32::WHITE),
                        )
                        .fill(tokens.accent)
                        .stroke(Stroke::new(1.0, tokens.accent))
                        .corner_radius(CornerRadius::ZERO),
                    )
                    .clicked()
                    && !state.new_playlist_name.trim().is_empty()
                {
                    let name = state.new_playlist_name.trim().to_string();
                    state.new_playlist_name.clear();
                    *action = ShellAction::CreatePlaylist(name);
                }
            });
        });
    if !open {
        state.add_to_playlist_target = None;
    }
}
