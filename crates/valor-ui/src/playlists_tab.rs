use crate::icons::IconRegistry;
use crate::shell::ShellAction;
use crate::shell_state::ShellState;
use crate::shell_tokens::ShellTokens;
use crate::texture_cache::LruTextureCache;
use crate::theme::ValorTheme;
use crate::view_models::{SortOption, ViewMode};
use egui::{Align, Align2, Color32, CornerRadius, FontId, Layout, Rect, RichText, Sense, Stroke, Ui, Vec2};
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

    let new_modal_id = ui.scope_id().with("pl_new_modal_open");
    let rename_id_key = ui.scope_id().with("pl_rename_id");
    let rename_buf_key = ui.scope_id().with("pl_rename_buf");
    let menu_id_key = ui.scope_id().with("pl_menu_open_id");
    let menu_rect_key = ui.scope_id().with("pl_menu_anchor_rect");

    let mut new_modal_open: bool = ui.data(|d| d.get_temp(new_modal_id)).unwrap_or(false);
    let mut rename_id: Option<String> = ui.data(|d| d.get_temp(rename_id_key)).flatten();
    let mut rename_buf: String = ui.data(|d| d.get_temp(rename_buf_key)).unwrap_or_default();
    let mut menu_open_id: Option<String> = ui.data(|d| d.get_temp(menu_id_key)).flatten();
    let mut menu_anchor: Rect = ui.data(|d| d.get_temp(menu_rect_key)).unwrap_or(Rect::NOTHING);

    let paint_tri = |painter: &egui::Painter, c: egui::Pos2, r: f32, col: Color32| {
        painter.add(egui::Shape::convex_polygon(
            vec![
                egui::pos2(c.x - r * 0.55, c.y - r * 0.85),
                egui::pos2(c.x + r * 0.95, c.y),
                egui::pos2(c.x - r * 0.55, c.y + r * 0.85),
            ],
            col,
            Stroke::NONE,
        ));
    };

    if let Some(sel_id) = state.selected_playlist_id.clone() {
        if let Some(pl) = playlists.iter().find(|p| p.id == sel_id).cloned() {
            // Opened Playlist Detail + Edit View
            ui.horizontal(|ui| {
                if ui
                    .add(
                        egui::Button::new(RichText::new("← Playlists").size(12.5).color(tokens.text_primary))
                            .fill(tokens.field_fill)
                            .stroke(Stroke::new(1.0, tokens.divider))
                            .corner_radius(CornerRadius::same(8))
                            .min_size(Vec2::new(96.0, 30.0)),
                    )
                    .clicked()
                {
                    state.selected_playlist_id = None;
                }
                ui.add_space(10.0);
                ui.vertical(|ui| {
                    ui.label(RichText::new(&pl.name).size(16.0).strong().color(tokens.text_primary));
                    let cnt = pl.item_ids.len();
                    ui.label(
                        RichText::new(if cnt == 0 {
                            "No videos".to_string()
                        } else if cnt == 1 {
                            "1 video".to_string()
                        } else {
                            format!("{cnt} videos")
                        })
                        .size(11.5)
                        .color(tokens.text_secondary),
                    );
                });
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if ui
                        .add(
                            egui::Button::new(RichText::new("Delete").size(12.0).color(Color32::WHITE))
                                .fill(Color32::from_rgb(0xC4, 0x2B, 0x1C))
                                .corner_radius(CornerRadius::same(8))
                                .min_size(Vec2::new(68.0, 30.0)),
                        )
                        .clicked()
                    {
                        *action = ShellAction::DeletePlaylist(pl.id.clone());
                        state.selected_playlist_id = None;
                    }
                    if ui
                        .add(
                            egui::Button::new(RichText::new("Rename").size(12.0).color(tokens.text_primary))
                                .fill(tokens.field_fill)
                                .stroke(Stroke::new(1.0, tokens.divider))
                                .corner_radius(CornerRadius::same(8))
                                .min_size(Vec2::new(72.0, 30.0)),
                        )
                        .clicked()
                    {
                        rename_id = Some(pl.id.clone());
                        rename_buf = pl.name.clone();
                    }
                    if !pl.item_ids.is_empty()
                        && ui
                            .add(
                                egui::Button::new(RichText::new("Play all").size(12.0).strong().color(Color32::WHITE))
                                    .fill(Color32::from_rgb(0xC4, 0x5F, 0x0C))
                                    .corner_radius(CornerRadius::same(8))
                                    .min_size(Vec2::new(84.0, 30.0)),
                            )
                            .clicked()
                    {
                        *action = ShellAction::PlayPlaylist(pl.id.clone());
                    }
                    if ui
                        .add(
                            egui::Button::new(RichText::new("+ Add videos").size(12.0).color(tokens.text_primary))
                                .fill(tokens.field_fill)
                                .stroke(Stroke::new(1.0, tokens.divider))
                                .corner_radius(CornerRadius::same(8))
                                .min_size(Vec2::new(98.0, 30.0)),
                        )
                        .clicked()
                    {
                        state.playlist_picker_open = !state.playlist_picker_open;
                    }
                });
            });

            ui.add_space(12.0);
            if pl.item_ids.is_empty() {
                egui::Frame::new()
                    .fill(tokens.field_fill)
                    .stroke(Stroke::new(1.0, tokens.divider))
                    .corner_radius(CornerRadius::same(12))
                    .inner_margin(egui::Margin::symmetric(16, 20))
                    .show(ui, |ui| {
                        ui.label(
                            RichText::new("This playlist has no videos yet. Click \"+ Add videos\" above or use \"More options\" on any video.")
                                .size(13.0)
                                .color(tokens.text_secondary),
                        );
                    });
            } else {
                for item_id in &pl.item_ids {
                    let media = items
                        .iter()
                        .find(|m| &m.id == item_id || &m.file_path == item_id || &m.fingerprint == item_id);
                    let title = media.map(|m| m.title.clone()).unwrap_or_else(|| {
                        std::path::Path::new(item_id)
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or(item_id)
                            .to_string()
                    });
                    let play_path = media.map(|m| m.file_path.clone()).unwrap_or_else(|| item_id.clone());

                    egui::Frame::new()
                        .fill(tokens.field_fill)
                        .stroke(Stroke::new(1.0, tokens.divider))
                        .corner_radius(CornerRadius::same(10))
                        .inner_margin(egui::Margin::symmetric(12, 8))
                        .show(ui, |ui| {
                            ui.horizontal(|ui| {
                                if ui
                                    .add(
                                        egui::Button::new(RichText::new("Play").size(11.5).color(Color32::WHITE))
                                            .fill(Color32::from_rgb(0xC4, 0x5F, 0x0C))
                                            .corner_radius(CornerRadius::same(6))
                                            .min_size(Vec2::new(48.0, 26.0)),
                                    )
                                    .clicked()
                                {
                                    *action = ShellAction::PlayMedia(PathBuf::from(&play_path));
                                }
                                ui.add_space(6.0);
                                ui.label(RichText::new(&title).size(13.0).color(tokens.text_primary));
                                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                    if ui
                                        .add(
                                            egui::Button::new(
                                                RichText::new("Remove").size(11.5).color(Color32::from_rgb(248, 113, 113)),
                                            )
                                            .fill(tokens.window_bg)
                                            .stroke(Stroke::new(1.0, tokens.divider))
                                            .corner_radius(CornerRadius::same(6))
                                            .min_size(Vec2::new(66.0, 26.0)),
                                        )
                                        .clicked()
                                    {
                                        *action = ShellAction::RemoveFromPlaylist {
                                            playlist_id: pl.id.clone(),
                                            item_id: item_id.clone(),
                                        };
                                    }
                                });
                            });
                        });
                    ui.add_space(6.0);
                }
            }

            if state.playlist_picker_open {
                let mut open = true;
                egui::Window::new("Add video to playlist")
                    .open(&mut open)
                    .collapsible(false)
                    .resizable(true)
                    .default_width(480.0)
                    .show(ui.ctx(), |ui| {
                        let search_id = egui::Id::new("pl_picker_search");
                        let mut search_str: String = ui.ctx().data(|d| d.get_temp(search_id)).unwrap_or_default();
                        ui.add(
                            egui::TextEdit::singleline(&mut search_str)
                                .hint_text("Search media files...")
                                .desired_width(f32::INFINITY),
                        );
                        ui.ctx().data_mut(|d| d.insert_temp(search_id, search_str.clone()));
                        ui.add_space(8.0);
                        let q = search_str.trim().to_lowercase();
                        egui::ScrollArea::vertical().max_height(320.0).show(ui, |ui| {
                            for item in items.iter().filter(|m| {
                                !m.is_missing
                                    && (q.is_empty()
                                        || m.title.to_lowercase().contains(&q)
                                        || m.file_path.to_lowercase().contains(&q))
                            }) {
                                let already = pl.item_ids.contains(&item.file_path) || pl.item_ids.contains(&item.id);
                                ui.horizontal(|ui| {
                                    ui.label(RichText::new(&item.title).size(12.5).color(tokens.text_primary));
                                    ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                        if !already && ui.button("+ Add").clicked() {
                                            *action = ShellAction::AddToPlaylist {
                                                playlist_id: pl.id.clone(),
                                                item_path: item.file_path.clone(),
                                            };
                                        } else if already {
                                            ui.label(RichText::new("Added").size(11.0).color(tokens.text_secondary));
                                        }
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
        } else {
            state.selected_playlist_id = None;
        }
    }

    if state.selected_playlist_id.is_none() {
        // Redesigned Playlist Card Grid (Playlists + "New playlist" card)
        let avail_w = ui.available_width().max(220.0);
        let gap = 16.0;
        let cols = (((avail_w + gap) / (216.0 + gap)).floor() as usize).max(1);
        let card_w = ((avail_w - gap * (cols - 1) as f32) / cols as f32).max(160.0);
        let card_h = 120.0;
        let total_cards = playlists.len() + 1;
        let rows = total_cards.div_ceil(cols);

        for row in 0..rows {
            let (row_r, _) = ui.allocate_exact_size(Vec2::new(avail_w, card_h + 48.0), Sense::hover());
            for c_idx in 0..cols {
                let idx = row * cols + c_idx;
                if idx >= total_cards {
                    break;
                }
                let x = row_r.min.x + c_idx as f32 * (card_w + gap);
                let y = row_r.min.y;
                let card_r = Rect::from_min_size(egui::pos2(x, y), Vec2::new(card_w, card_h));

                if idx < playlists.len() {
                    let pl = &playlists[idx];
                    let hit_r = Rect::from_min_size(egui::pos2(x, y), Vec2::new(card_w, card_h + 40.0));
                    let resp = ui.interact(hit_r, ui.scope_id().with(("pl_card", &pl.id)), Sense::click());
                    let dots_r = Rect::from_min_size(egui::pos2(card_r.right() - 32.0, card_r.top() + 8.0), Vec2::splat(24.0));
                    let dots_resp = ui.interact(dots_r, ui.scope_id().with(("pl_dots", &pl.id)), Sense::click());
                    if resp.hovered() || dots_resp.hovered() {
                        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                    }

                    let warm_bg = Color32::from_rgb(46, 33, 21);
                    ui.painter().rect(
                        card_r,
                        CornerRadius::same(12),
                        warm_bg,
                        Stroke::new(
                            if resp.hovered() { 1.5 } else { 1.0 },
                            if resp.hovered() { tokens.accent } else { tokens.divider },
                        ),
                        egui::StrokeKind::Inside,
                    );
                    let stack_back = Rect::from_center_size(card_r.center() - Vec2::new(14.0, 2.0), Vec2::new(42.0, 30.0));
                    let stack_front = Rect::from_center_size(card_r.center(), Vec2::new(48.0, 34.0));
                    ui.painter().rect_filled(stack_back, CornerRadius::same(6), Color32::from_white_alpha(18));
                    ui.painter().rect_filled(stack_front, CornerRadius::same(8), Color32::from_white_alpha(30));
                    ui.painter().circle_filled(card_r.center(), 12.0, tokens.accent);
                    paint_tri(ui.painter(), card_r.center(), 4.5, Color32::from_rgb(0x2A, 0x17, 0x04));

                    ui.painter().rect_filled(
                        dots_r,
                        CornerRadius::same(6),
                        if dots_resp.hovered() { tokens.hover_fill } else { Color32::from_black_alpha(120) },
                    );
                    for dx in [-4.5_f32, 0.0, 4.5] {
                        ui.painter().circle_filled(
                            egui::pos2(dots_r.center().x + dx, dots_r.center().y),
                            1.3,
                            tokens.text_primary,
                        );
                    }

                    ui.painter().text(
                        egui::pos2(x, card_r.bottom() + 14.0),
                        Align2::LEFT_CENTER,
                        &pl.name,
                        FontId::proportional(13.0),
                        if resp.hovered() { tokens.accent } else { tokens.text_primary },
                    );
                    let cnt = pl.item_ids.len();
                    ui.painter().text(
                        egui::pos2(x, card_r.bottom() + 30.0),
                        Align2::LEFT_CENTER,
                        if cnt == 0 {
                            "No videos".to_string()
                        } else if cnt == 1 {
                            "1 video".to_string()
                        } else {
                            format!("{cnt} videos")
                        },
                        FontId::proportional(11.5),
                        tokens.text_secondary,
                    );

                    if dots_resp.clicked() {
                        menu_open_id = Some(pl.id.clone());
                        menu_anchor = dots_r;
                    } else if resp.clicked() {
                        state.selected_playlist_id = Some(pl.id.clone());
                    }
                } else {
                    // "New playlist" card
                    let hit_r = Rect::from_min_size(egui::pos2(x, y), Vec2::new(card_w, card_h + 40.0));
                    let resp = ui.interact(hit_r, ui.scope_id().with("pl_new_card"), Sense::click());
                    if resp.hovered() {
                        ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                    }
                    ui.painter().rect(
                        card_r,
                        CornerRadius::same(12),
                        tokens.field_fill,
                        Stroke::new(
                            if resp.hovered() { 1.5 } else { 1.0 },
                            if resp.hovered() { tokens.accent } else { tokens.divider },
                        ),
                        egui::StrokeKind::Inside,
                    );
                    let c = card_r.center();
                    for dy in [-8.0_f32, 0.0, 8.0] {
                        ui.painter().line_segment(
                            [egui::pos2(c.x - 14.0, c.y + dy), egui::pos2(c.x + 2.0, c.y + dy)],
                            Stroke::new(2.5, Color32::from_rgb(0xF8, 0xAC, 0x64)),
                        );
                    }
                    ui.painter().circle_filled(egui::pos2(c.x + 12.0, c.y + 8.0), 10.0, Color32::from_rgb(0xC4, 0x5F, 0x0C));
                    ui.painter().text(
                        egui::pos2(c.x + 12.0, c.y + 8.0),
                        Align2::CENTER_CENTER,
                        "+",
                        FontId::proportional(14.0),
                        Color32::WHITE,
                    );
                    ui.painter().text(
                        egui::pos2(x, card_r.bottom() + 14.0),
                        Align2::LEFT_CENTER,
                        "New playlist",
                        FontId::proportional(13.0),
                        if resp.hovered() { tokens.accent } else { tokens.text_primary },
                    );
                    ui.painter().text(
                        egui::pos2(x, card_r.bottom() + 30.0),
                        Align2::LEFT_CENTER,
                        "Create a playlist, then add videos...",
                        FontId::proportional(11.5),
                        tokens.text_secondary,
                    );
                    if resp.clicked() {
                        new_modal_open = true;
                        state.new_playlist_name.clear();
                    }
                }
            }
        }
    }

    // Playlist "..." options popover
    if let Some(open_id) = menu_open_id.clone() {
        if let Some(pl) = playlists.iter().find(|p| p.id == open_id).cloned() {
            let pop_w = 196.0;
            let screen = ui.ctx().content_rect();
            let pop_pos = egui::pos2(
                (menu_anchor.right() - pop_w).clamp(screen.left() + 8.0, (screen.right() - pop_w - 8.0).max(8.0)),
                (menu_anchor.bottom() + 6.0).min((screen.bottom() - 210.0).max(8.0)),
            );
            let pop_area = egui::Area::new(ui.scope_id().with("pl_options_popover"))
                .order(egui::Order::Foreground)
                .fixed_pos(pop_pos)
                .show(ui.ctx(), |ui| {
                    egui::Frame::new()
                        .fill(tokens.window_bg)
                        .stroke(Stroke::new(1.0, tokens.divider))
                        .corner_radius(CornerRadius::same(14))
                        .inner_margin(12.0)
                        .show(ui, |ui| {
                            ui.set_width(pop_w - 24.0);
                            ui.label(RichText::new(&pl.name).size(13.0).strong().color(tokens.text_primary));
                            ui.label(
                                RichText::new(if pl.item_ids.is_empty() {
                                    "No videos".to_string()
                                } else {
                                    format!("{} videos", pl.item_ids.len())
                                })
                                .size(11.0)
                                .color(tokens.text_secondary),
                            );
                            ui.add_space(8.0);
                            for (idx, (lbl, col)) in [
                                ("Open", tokens.text_primary),
                                ("Play all", tokens.text_primary),
                                ("Shuffle play", tokens.text_primary),
                                ("Rename", tokens.text_primary),
                                ("Delete", Color32::from_rgb(248, 113, 113)),
                            ]
                            .into_iter()
                            .enumerate()
                            {
                                let (rr, r_resp) = ui.allocate_exact_size(Vec2::new(pop_w - 24.0, 28.0), Sense::click());
                                if r_resp.hovered() {
                                    ui.ctx().set_cursor_icon(egui::CursorIcon::PointingHand);
                                    ui.painter().rect_filled(rr, CornerRadius::same(7), tokens.hover_fill);
                                }
                                ui.painter().text(
                                    egui::pos2(rr.left() + 8.0, rr.center().y),
                                    Align2::LEFT_CENTER,
                                    lbl,
                                    FontId::proportional(12.5),
                                    col,
                                );
                                if r_resp.clicked() {
                                    match idx {
                                        0 => state.selected_playlist_id = Some(pl.id.clone()),
                                        1 | 2 => *action = ShellAction::PlayPlaylist(pl.id.clone()),
                                        3 => {
                                            rename_id = Some(pl.id.clone());
                                            rename_buf = pl.name.clone();
                                        }
                                        _ => *action = ShellAction::DeletePlaylist(pl.id.clone()),
                                    }
                                    menu_open_id = None;
                                }
                            }
                        });
                });
            if ui.input(|i| i.pointer.any_pressed())
                && !pop_area.response.hovered()
                && !menu_anchor.contains(ui.input(|i| i.pointer.interact_pos().unwrap_or_default()))
            {
                menu_open_id = None;
            }
        } else {
            menu_open_id = None;
        }
    }

    // Create Playlist Modal
    if new_modal_open {
        let mut open = true;
        egui::Window::new("New playlist")
            .open(&mut open)
            .collapsible(false)
            .resizable(false)
            .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
            .show(ui.ctx(), |ui| {
                ui.set_width(300.0);
                ui.add(
                    egui::TextEdit::singleline(&mut state.new_playlist_name)
                        .hint_text("Playlist name...")
                        .desired_width(290.0),
                );
                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    if ui.button("Cancel").clicked() {
                        new_modal_open = false;
                    }
                    if ui
                        .add(
                            egui::Button::new(RichText::new("Create").color(Color32::WHITE))
                                .fill(Color32::from_rgb(0xC4, 0x5F, 0x0C)),
                        )
                        .clicked()
                        && !state.new_playlist_name.trim().is_empty()
                    {
                        *action = ShellAction::CreatePlaylist(state.new_playlist_name.trim().to_string());
                        state.new_playlist_name.clear();
                        new_modal_open = false;
                    }
                });
            });
        if !open {
            new_modal_open = false;
        }
    }

    // Rename Playlist Modal
    if let Some(rid) = rename_id.clone() {
        let mut open = true;
        egui::Window::new("Rename playlist")
            .open(&mut open)
            .collapsible(false)
            .resizable(false)
            .anchor(egui::Align2::CENTER_CENTER, [0.0, 0.0])
            .show(ui.ctx(), |ui| {
                ui.set_width(300.0);
                ui.add(
                    egui::TextEdit::singleline(&mut rename_buf)
                        .hint_text("Playlist name...")
                        .desired_width(290.0),
                );
                ui.add_space(10.0);
                ui.horizontal(|ui| {
                    if ui.button("Cancel").clicked() {
                        rename_id = None;
                    }
                    if ui
                        .add(
                            egui::Button::new(RichText::new("Save").color(Color32::WHITE))
                                .fill(Color32::from_rgb(0xC4, 0x5F, 0x0C)),
                        )
                        .clicked()
                        && !rename_buf.trim().is_empty()
                    {
                        *action = ShellAction::RenamePlaylist {
                            playlist_id: rid.clone(),
                            name: rename_buf.trim().to_string(),
                        };
                        rename_id = None;
                    }
                });
            });
        if !open {
            rename_id = None;
        }
    }

    ui.data_mut(|d| {
        d.insert_temp(new_modal_id, new_modal_open);
        d.insert_temp(rename_id_key, rename_id);
        d.insert_temp(rename_buf_key, rename_buf);
        d.insert_temp(menu_id_key, menu_open_id);
        d.insert_temp(menu_rect_key, menu_anchor);
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
                .corner_radius(CornerRadius::same(12))
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
                            .corner_radius(CornerRadius::same(8))
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
                        .fill(Color32::from_rgb(0xC4, 0x5F, 0x0C))
                        .corner_radius(CornerRadius::same(8)),
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
