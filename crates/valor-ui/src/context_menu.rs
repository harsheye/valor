use crate::theme::ValorTheme;
use egui::{Align2, Color32, CornerRadius, Pos2, Rect, Sense, Stroke, Ui, Vec2};

#[derive(Debug, Clone, PartialEq)]
pub enum ContextMenuAction {
    TogglePlay,
    SeekRelative(f64),
    SetSpeed(f64),
    SetAspectRatio(String),
    SetRotation(i64),
    SetAudioBoost(u32),
    SelectAudioTrack(i64),
    SelectSubtitleTrack(i64),
    SetToneMapping(String),
    ToggleSubtitles,
    SetSubtitleDelay(f64),
    SetAudioDelay(f64),
    ToggleEqualizer,
    ToggleDynaudnorm,
    ToggleNightMode,
    ToggleDialogueBoost,
    ToggleAmbiance,
    ToggleStats,
    ToggleFullscreen,
    OpenEnhancementStudio,
    OpenBookmarks,
    OpenPlaylist,
    OpenDashboard,
    TakeSnapshot,
    CopyTimestamp,
    CopyDebugInfo,
    OpenFile,
    OpenContainingFolder,
    Close,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SubMenuCategory {
    Media,
    Audio,
    Video,
    Subtitle,
    Playback,
    View,
    Tools,
}

pub struct ContextMenuState {
    pub position: Pos2,
    pub open_submenu: Option<SubMenuCategory>,
}

impl ContextMenuState {
    pub fn new(pos: Pos2) -> Self {
        Self {
            position: pos,
            open_submenu: None,
        }
    }
}

pub fn is_pointer_contained(root_rect: Rect, submenu_rect: Option<Rect>, pos: Pos2) -> bool {
    root_rect.contains(pos) || submenu_rect.is_some_and(|r| r.contains(pos))
}

pub fn render_context_menu(
    ui: &mut Ui,
    theme: &ValorTheme,
    screen_rect: Rect,
    state: &mut ContextMenuState,
) -> Option<ContextMenuAction> {
    let mut action = None;

    let item_height = 28.0;
    let menu_width = 170.0;
    let padding = 6.0;

    let root_items = [
        (SubMenuCategory::Media, "📁  Media"),
        (SubMenuCategory::Audio, "🔊  Audio"),
        (SubMenuCategory::Video, "🎬  Video"),
        (SubMenuCategory::Subtitle, "💬  Subtitle"),
        (SubMenuCategory::Playback, "▶   Playback"),
        (SubMenuCategory::View, "👁  View"),
        (SubMenuCategory::Tools, "🛠  Tools"),
    ];

    let root_height = root_items.len() as f32 * item_height + padding * 2.0;

    // Constrain position to screen
    let x = state.position.x.min(screen_rect.max.x - menu_width - 10.0);
    let y = state.position.y.min(screen_rect.max.y - root_height - 10.0);
    let root_rect = Rect::from_min_size(Pos2::new(x, y), Vec2::new(menu_width, root_height));

    // Calculate submenu rect if open
    let (submenu_rect, submenu_items) = if let Some(sub) = state.open_submenu {
        let items: Vec<(&str, ContextMenuAction)> = match sub {
            SubMenuCategory::Media => vec![
                ("Open File... (Ctrl+O)", ContextMenuAction::OpenFile),
                (
                    "Open Containing Folder",
                    ContextMenuAction::OpenContainingFolder,
                ),
                ("Take Snapshot (PNG)", ContextMenuAction::TakeSnapshot),
                ("Copy Timestamp", ContextMenuAction::CopyTimestamp),
                (
                    "Copy Debug Info (mpv stats)",
                    ContextMenuAction::CopyDebugInfo,
                ),
                ("Show Media Stats (I)", ContextMenuAction::ToggleStats),
                ("Back to Dashboard", ContextMenuAction::OpenDashboard),
            ],
            SubMenuCategory::Audio => vec![
                (
                    "Audio Boost: Off (100%)",
                    ContextMenuAction::SetAudioBoost(100),
                ),
                (
                    "Audio Boost: +6 dB (200%)",
                    ContextMenuAction::SetAudioBoost(200),
                ),
                (
                    "Audio Boost: +12 dB (400%)",
                    ContextMenuAction::SetAudioBoost(400),
                ),
                ("Audio Delay +100ms", ContextMenuAction::SetAudioDelay(0.1)),
                ("Audio Delay -100ms", ContextMenuAction::SetAudioDelay(-0.1)),
                ("Toggle 10-Band EQ", ContextMenuAction::ToggleEqualizer),
                ("Loudness Normalizer", ContextMenuAction::ToggleDynaudnorm),
                ("Night Mode Compressor", ContextMenuAction::ToggleNightMode),
                ("Dialogue Boost", ContextMenuAction::ToggleDialogueBoost),
            ],
            SubMenuCategory::Video => vec![
                (
                    "Aspect: Default",
                    ContextMenuAction::SetAspectRatio("no".into()),
                ),
                (
                    "Aspect: 16:9",
                    ContextMenuAction::SetAspectRatio("16:9".into()),
                ),
                (
                    "Aspect: 4:3",
                    ContextMenuAction::SetAspectRatio("4:3".into()),
                ),
                (
                    "Aspect: 2.35:1 (Cinema)",
                    ContextMenuAction::SetAspectRatio("2.35:1".into()),
                ),
                ("Rotate: 0°", ContextMenuAction::SetRotation(0)),
                ("Rotate: 90°", ContextMenuAction::SetRotation(90)),
                ("Rotate: 180°", ContextMenuAction::SetRotation(180)),
                ("Rotate: 270°", ContextMenuAction::SetRotation(270)),
                (
                    "Tone Map: Auto (BT.2390)",
                    ContextMenuAction::SetToneMapping("auto".into()),
                ),
                (
                    "Tone Map: Mobius",
                    ContextMenuAction::SetToneMapping("mobius".into()),
                ),
                (
                    "Tone Map: Reinhard",
                    ContextMenuAction::SetToneMapping("reinhard".into()),
                ),
            ],
            SubMenuCategory::Subtitle => vec![
                ("Toggle Subtitles", ContextMenuAction::ToggleSubtitles),
                (
                    "Subtitle Delay +100ms",
                    ContextMenuAction::SetSubtitleDelay(0.1),
                ),
                (
                    "Subtitle Delay -100ms",
                    ContextMenuAction::SetSubtitleDelay(-0.1),
                ),
            ],
            SubMenuCategory::Playback => vec![
                ("Play / Pause (Space)", ContextMenuAction::TogglePlay),
                (
                    "Seek -10s (Left Arrow / J)",
                    ContextMenuAction::SeekRelative(-10.0),
                ),
                (
                    "Seek +10s (Right Arrow / L)",
                    ContextMenuAction::SeekRelative(10.0),
                ),
                (
                    "Step Forward (E / .)",
                    ContextMenuAction::SeekRelative(0.04),
                ),
                (
                    "Step Backward (D / ,)",
                    ContextMenuAction::SeekRelative(-0.04),
                ),
                ("Speed: 0.5x", ContextMenuAction::SetSpeed(0.5)),
                ("Speed: 0.75x", ContextMenuAction::SetSpeed(0.75)),
                ("Speed: 1.0x (Normal)", ContextMenuAction::SetSpeed(1.0)),
                ("Speed: 1.25x", ContextMenuAction::SetSpeed(1.25)),
                ("Speed: 1.5x", ContextMenuAction::SetSpeed(1.5)),
                ("Speed: 2.0x", ContextMenuAction::SetSpeed(2.0)),
            ],
            SubMenuCategory::View => vec![
                ("Toggle Fullscreen (F)", ContextMenuAction::ToggleFullscreen),
                ("Toggle Ambiance Glow", ContextMenuAction::ToggleAmbiance),
                ("Show Playlist Drawer", ContextMenuAction::OpenPlaylist),
            ],
            SubMenuCategory::Tools => vec![
                (
                    "Video & Audio Studio",
                    ContextMenuAction::OpenEnhancementStudio,
                ),
                ("Manage Bookmarks", ContextMenuAction::OpenBookmarks),
            ],
        };

        let sub_w = 190.0;
        let sub_h = items.len() as f32 * item_height + padding * 2.0;

        // Position submenu to the right (or left if near right screen edge)
        let sub_x = if root_rect.max.x + sub_w > screen_rect.max.x {
            root_rect.min.x - sub_w
        } else {
            root_rect.max.x
        };

        let active_index = root_items.iter().position(|(c, _)| *c == sub).unwrap_or(0);
        let sub_y = (root_rect.min.y + active_index as f32 * item_height)
            .min(screen_rect.max.y - sub_h - 10.0);

        (
            Some(Rect::from_min_size(
                Pos2::new(sub_x, sub_y),
                Vec2::new(sub_w, sub_h),
            )),
            items,
        )
    } else {
        (None, Vec::new())
    };

    // Containment test: covers root menu and open submenu
    let pointer_pos = ui.input(|i| i.pointer.hover_pos());
    let pointer_clicked = ui.input(|i| i.pointer.any_click());

    if let (Some(click_pos), true) = (pointer_pos, pointer_clicked) {
        if !is_pointer_contained(root_rect, submenu_rect, click_pos) {
            // Click outside! Consume the click and close context menu
            return Some(ContextMenuAction::Close);
        }
    }

    // Paint root menu panel
    ui.painter()
        .rect_filled(root_rect, CornerRadius::same(8), theme.panel_bg);
    ui.painter().rect_stroke(
        root_rect,
        CornerRadius::same(8),
        Stroke::new(1.0, theme.panel_border),
        egui::StrokeKind::Inside,
    );

    for (idx, (cat, label)) in root_items.iter().enumerate() {
        let item_rect = Rect::from_min_size(
            Pos2::new(
                root_rect.min.x + padding,
                root_rect.min.y + padding + idx as f32 * item_height,
            ),
            Vec2::new(menu_width - padding * 2.0, item_height),
        );

        let is_hovered = pointer_pos.is_some_and(|p| item_rect.contains(p));
        let is_open = state.open_submenu == Some(*cat);

        if is_hovered {
            state.open_submenu = Some(*cat);
        }

        if is_hovered || is_open {
            ui.painter().rect_filled(
                item_rect,
                CornerRadius::same(4),
                Color32::from_rgba_premultiplied(59, 130, 246, 60),
            );
        }

        ui.painter().text(
            Pos2::new(item_rect.min.x + 8.0, item_rect.center().y),
            Align2::LEFT_CENTER,
            *label,
            egui::FontId::proportional(12.0),
            if is_hovered || is_open {
                Color32::WHITE
            } else {
                theme.text_primary
            },
        );

        // Arrow indicator
        ui.painter().text(
            Pos2::new(item_rect.max.x - 8.0, item_rect.center().y),
            Align2::RIGHT_CENTER,
            "›",
            egui::FontId::proportional(14.0),
            theme.text_muted,
        );
    }

    // Paint Submenu if present
    if let (Some(sub_rect), items) = (submenu_rect, submenu_items) {
        ui.painter()
            .rect_filled(sub_rect, CornerRadius::same(8), theme.panel_bg);
        ui.painter().rect_stroke(
            sub_rect,
            CornerRadius::same(8),
            Stroke::new(1.0, theme.panel_border),
            egui::StrokeKind::Inside,
        );

        for (idx, (label, act)) in items.into_iter().enumerate() {
            let item_rect = Rect::from_min_size(
                Pos2::new(
                    sub_rect.min.x + padding,
                    sub_rect.min.y + padding + idx as f32 * item_height,
                ),
                Vec2::new(sub_rect.width() - padding * 2.0, item_height),
            );

            let resp = ui.allocate_rect(item_rect, Sense::click());
            let is_hovered = resp.hovered();

            if is_hovered {
                ui.painter().rect_filled(
                    item_rect,
                    CornerRadius::same(4),
                    Color32::from_rgba_premultiplied(59, 130, 246, 70),
                );
            }

            if resp.clicked() {
                action = Some(act);
            }

            ui.painter().text(
                Pos2::new(item_rect.min.x + 8.0, item_rect.center().y),
                Align2::LEFT_CENTER,
                label,
                egui::FontId::proportional(12.0),
                if is_hovered {
                    theme.accent_amber
                } else {
                    Color32::WHITE
                },
            );
        }
    }

    action
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_context_menu_containment_logic() {
        let root = Rect::from_min_size(Pos2::new(100.0, 100.0), Vec2::new(150.0, 200.0));
        let submenu = Rect::from_min_size(Pos2::new(250.0, 120.0), Vec2::new(180.0, 150.0));

        // Inside root
        assert!(is_pointer_contained(
            root,
            Some(submenu),
            Pos2::new(120.0, 120.0)
        ));
        // Inside submenu
        assert!(is_pointer_contained(
            root,
            Some(submenu),
            Pos2::new(300.0, 150.0)
        ));
        // Outside both
        assert!(!is_pointer_contained(
            root,
            Some(submenu),
            Pos2::new(50.0, 50.0)
        ));
        assert!(!is_pointer_contained(
            root,
            Some(submenu),
            Pos2::new(500.0, 500.0)
        ));

        // Submenu closed
        assert!(is_pointer_contained(root, None, Pos2::new(150.0, 150.0)));
        assert!(!is_pointer_contained(root, None, Pos2::new(300.0, 150.0)));
    }

    #[test]
    fn test_context_menu_edge_flipping() {
        let screen_rect = Rect::from_min_size(Pos2::ZERO, Vec2::new(1920.0, 1080.0));
        let menu_width = 170.0;
        let sub_w = 190.0;
        let root_height = 200.0;

        // 1. Normal positioning (center of screen)
        let pos_normal = Pos2::new(500.0, 300.0);
        let root_normal = Rect::from_min_size(pos_normal, Vec2::new(menu_width, root_height));
        // Submenu should open to the right
        let sub_x_normal = if root_normal.max.x + sub_w > screen_rect.max.x {
            root_normal.min.x - sub_w
        } else {
            root_normal.max.x
        };
        assert_eq!(sub_x_normal, 670.0); // 500 + 170

        // 2. Near right edge (x = 1800.0, where 1800 + 170 + 190 > 1920)
        let pos_right = Pos2::new(1740.0, 300.0);
        let root_x_clamped = pos_right.x.min(screen_rect.max.x - menu_width - 10.0);
        let root_right = Rect::from_min_size(
            Pos2::new(root_x_clamped, 300.0),
            Vec2::new(menu_width, root_height),
        );
        // Submenu must flip to the LEFT of root
        let sub_x_flipped = if root_right.max.x + sub_w > screen_rect.max.x {
            root_right.min.x - sub_w
        } else {
            root_right.max.x
        };
        assert_eq!(sub_x_flipped, root_right.min.x - sub_w);
        assert!(sub_x_flipped >= 0.0);
        assert!(sub_x_flipped + sub_w <= root_right.min.x);

        // 3. Near bottom edge (y = 1000.0)
        let sub_h = 250.0;
        let sub_y = (root_right.min.y + 50.0).min(screen_rect.max.y - sub_h - 10.0);
        assert!(sub_y + sub_h <= screen_rect.max.y);
    }

    #[test]
    fn test_context_menu_outside_click_consumption() {
        let root = Rect::from_min_size(Pos2::new(200.0, 200.0), Vec2::new(170.0, 200.0));
        let submenu = Rect::from_min_size(Pos2::new(370.0, 200.0), Vec2::new(190.0, 200.0));

        // Click outside must be rejected by is_pointer_contained so caller closes menu
        let outside_click = Pos2::new(100.0, 100.0);
        assert!(!is_pointer_contained(root, Some(submenu), outside_click));

        // Click inside root or submenu must be retained
        let root_click = Pos2::new(250.0, 250.0);
        assert!(is_pointer_contained(root, Some(submenu), root_click));

        let submenu_click = Pos2::new(400.0, 250.0);
        assert!(is_pointer_contained(root, Some(submenu), submenu_click));
    }
}
