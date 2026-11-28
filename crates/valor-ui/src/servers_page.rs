use crate::shell::ShellAction;
use crate::shell_state::ShellState;
use crate::shell_tokens::ShellTokens;
use egui::{Align, Color32, CornerRadius, FontId, Layout, RichText, Stroke, Ui, Vec2};

pub fn render_servers_page(
    ui: &mut Ui,
    state: &mut ShellState,
    tokens: &ShellTokens,
    action: &mut ShellAction,
) {
    // Connect new Jellyfin / Plex Server card
    egui::Frame::NONE
        .fill(tokens.card_fill)
        .stroke(Stroke::new(1.0, tokens.divider))
        .corner_radius(CornerRadius::ZERO)
        .inner_margin(egui::Margin::symmetric(14, 12))
        .show(ui, |ui| {
            ui.horizontal(|ui| {
                ui.label(
                    RichText::new("Connect Media Server (Jellyfin / Plex)")
                        .size(14.5)
                        .strong()
                        .color(tokens.text_primary),
                );
                ui.add_space(12.0);
                for (kind, lbl) in [("jellyfin", "Jellyfin"), ("plex", "Plex")] {
                    let active = state.server_form_kind == kind;
                    if ui
                        .add(
                            egui::Button::new(
                                RichText::new(lbl)
                                    .size(12.0)
                                    .strong()
                                    .color(if active { Color32::WHITE } else { tokens.text_secondary }),
                            )
                            .fill(if active { tokens.accent } else { tokens.field_fill })
                            .stroke(Stroke::new(1.0, if active { tokens.accent } else { tokens.divider }))
                            .corner_radius(CornerRadius::ZERO),
                        )
                        .clicked()
                    {
                        state.server_form_kind = kind.to_string();
                    }
                }
            });
            ui.add_space(8.0);
            ui.horizontal_wrapped(|ui| {
                ui.spacing_mut().item_spacing = Vec2::new(8.0, 6.0);
                ui.add(
                    egui::TextEdit::singleline(&mut state.server_form_name)
                        .hint_text("Server name (optional)")
                        .desired_width(140.0),
                );
                ui.add(
                    egui::TextEdit::singleline(&mut state.server_form_url)
                        .hint_text("http://192.168.1.10:8096")
                        .desired_width(230.0),
                );
                if state.server_form_kind == "jellyfin" {
                    ui.add(
                        egui::TextEdit::singleline(&mut state.server_form_user)
                            .hint_text("Username")
                            .desired_width(120.0),
                    );
                    ui.add(
                        egui::TextEdit::singleline(&mut state.server_form_pass)
                            .password(true)
                            .hint_text("Password (or leave blank if token)")
                            .desired_width(150.0),
                    );
                }
                ui.add(
                    egui::TextEdit::singleline(&mut state.server_form_token)
                        .password(true)
                        .hint_text(if state.server_form_kind == "plex" {
                            "X-Plex-Token"
                        } else {
                            "API Token (optional)"
                        })
                        .desired_width(160.0),
                );
                if ui
                    .add(
                        egui::Button::new(
                            RichText::new("Connect & Save")
                                .size(12.5)
                                .strong()
                                .color(Color32::WHITE),
                        )
                        .fill(tokens.accent)
                        .stroke(Stroke::new(1.0, tokens.accent))
                        .corner_radius(CornerRadius::ZERO)
                        .min_size(Vec2::new(120.0, 28.0)),
                    )
                    .clicked()
                    && !state.server_form_url.trim().is_empty()
                {
                    *action = ShellAction::ConnectNewServer;
                }
            });
            if let Some(status) = state.server_status.as_deref() {
                ui.add_space(6.0);
                ui.label(
                    RichText::new(status)
                        .size(12.0)
                        .color(tokens.accent),
                );
            }
        });

    ui.add_space(12.0);

    if state.settings.media_servers.is_empty() {
        egui::Frame::NONE
            .fill(tokens.card_fill)
            .stroke(Stroke::new(1.0, tokens.divider))
            .corner_radius(CornerRadius::ZERO)
            .inner_margin(egui::Margin::symmetric(16, 16))
            .show(ui, |ui| {
                ui.label(
                    RichText::new("No Jellyfin or Plex servers saved yet. Enter your server URL and credentials above to browse and stream directly.")
                        .size(13.0)
                        .color(tokens.text_secondary),
                );
            });
        return;
    }

    let avail_w = ui.available_width();
    let left_w = (avail_w * 0.30).clamp(220.0, 300.0);

    ui.horizontal_top(|ui| {
        // Saved servers list
        ui.allocate_ui_with_layout(
            Vec2::new(left_w, ui.available_height()),
            Layout::top_down(Align::Min),
            |ui| {
                let servers = state.settings.media_servers.clone();
                for srv in servers {
                    let is_sel = state.active_server_id.as_deref() == Some(srv.id.as_str());
                    egui::Frame::NONE
                        .fill(if is_sel { tokens.selected_fill } else { tokens.card_fill })
                        .stroke(Stroke::new(1.0, if is_sel { tokens.accent } else { tokens.divider }))
                        .corner_radius(CornerRadius::ZERO)
                        .inner_margin(egui::Margin::symmetric(10, 8))
                        .show(ui, |ui| {
                            ui.set_width((left_w - 22.0).max(160.0));
                            ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                                if ui
                                    .add(
                                        egui::Button::new(
                                            RichText::new("Del")
                                                .size(11.0)
                                                .color(Color32::from_rgb(248, 113, 113)),
                                        )
                                        .fill(tokens.field_fill)
                                        .stroke(Stroke::new(1.0, tokens.divider))
                                        .corner_radius(CornerRadius::ZERO),
                                    )
                                    .clicked()
                                {
                                    *action = ShellAction::DeleteServer(srv.id.clone());
                                }
                                if ui
                                    .add(
                                        egui::Button::new(
                                            RichText::new("Browse")
                                                .size(11.0)
                                                .color(Color32::WHITE),
                                        )
                                        .fill(tokens.accent)
                                        .corner_radius(CornerRadius::ZERO),
                                    )
                                    .clicked()
                                {
                                    *action = ShellAction::BrowseServer(srv.id.clone());
                                }
                                ui.with_layout(Layout::top_down(Align::Min), |ui| {
                                    let kind_tag = if srv.kind == "plex" { "PLEX" } else { "JELLYFIN" };
                                    ui.label(
                                        RichText::new(format!("[{kind_tag}] {}", srv.name))
                                            .size(12.5)
                                            .strong()
                                            .color(tokens.text_primary),
                                    );
                                    ui.label(
                                        RichText::new(&srv.base_url)
                                            .size(11.0)
                                            .color(tokens.text_tertiary),
                                    );
                                });
                            });
                        });
                    ui.add_space(6.0);
                }
            },
        );

        ui.add_space(12.0);

        // Right panel: libraries + media items
        let right_w = (ui.available_width() - 4.0).max(240.0);
        ui.allocate_ui_with_layout(
            Vec2::new(right_w, ui.available_height()),
            Layout::top_down(Align::Min),
            |ui| {
                let Some(srv_id) = state.active_server_id.clone() else {
                    egui::Frame::NONE
                        .fill(tokens.card_fill)
                        .stroke(Stroke::new(1.0, tokens.divider))
                        .corner_radius(CornerRadius::ZERO)
                        .inner_margin(egui::Margin::symmetric(14, 14))
                        .show(ui, |ui| {
                            ui.label(
                                RichText::new("Select a server on the left and click \"Browse\" to load its libraries.")
                                    .size(13.0)
                                    .color(tokens.text_secondary),
                            );
                        });
                    return;
                };

                if !state.server_libraries.is_empty() {
                    ui.horizontal_wrapped(|ui| {
                        ui.spacing_mut().item_spacing = Vec2::new(6.0, 6.0);
                        for lib in state.server_libraries.clone() {
                            let active = state.active_server_lib_id.as_deref() == Some(lib.id.as_str());
                            if ui
                                .add(
                                    egui::Button::new(
                                        RichText::new(&lib.name)
                                            .size(12.0)
                                            .color(if active { Color32::WHITE } else { tokens.text_secondary }),
                                    )
                                    .fill(if active { tokens.accent } else { tokens.card_fill })
                                    .stroke(Stroke::new(1.0, if active { tokens.accent } else { tokens.divider }))
                                    .corner_radius(CornerRadius::ZERO),
                                )
                                .clicked()
                            {
                                *action = ShellAction::SelectServerLibrary {
                                    server_id: srv_id.clone(),
                                    lib_id: lib.id.clone(),
                                };
                            }
                        }
                    });
                    ui.add_space(8.0);
                }

                ui.add(
                    egui::TextEdit::singleline(&mut state.server_search)
                        .hint_text("Filter server titles...")
                        .desired_width(280.0),
                );
                ui.add_space(8.0);

                let q = state.server_search.trim().to_lowercase();
                for item in state.server_items.iter().filter(|it| {
                    q.is_empty() || it.title.to_lowercase().contains(&q)
                }) {
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
                                            RichText::new("▶ Play")
                                                .size(11.5)
                                                .color(Color32::WHITE),
                                        )
                                        .fill(tokens.accent)
                                        .corner_radius(CornerRadius::ZERO),
                                    )
                                    .clicked()
                                {
                                    *action = ShellAction::PlayServerStream {
                                        title: item.title.clone(),
                                        url: item.stream_url.clone(),
                                    };
                                }
                                ui.with_layout(Layout::left_to_right(Align::Center), |ui| {
                                    let year_s = item.year.map(|y| format!(" ({y})")).unwrap_or_default();
                                    ui.label(
                                        RichText::new(format!("{}{}", item.title, year_s))
                                            .size(13.0)
                                            .color(tokens.text_primary),
                                    );
                                    if item.duration_secs > 0.0 {
                                        ui.add_space(8.0);
                                        let mins = (item.duration_secs / 60.0).round() as u64;
                                        ui.label(
                                            RichText::new(format!("{mins} min"))
                                                .font(FontId::monospace(11.0))
                                                .color(tokens.text_tertiary),
                                        );
                                    }
                                });
                            });
                        });
                    ui.add_space(4.0);
                }
            },
        );
    });
}
