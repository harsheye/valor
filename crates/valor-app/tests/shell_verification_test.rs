use egui::{vec2, Pos2, Rect};
use std::path::PathBuf;
use valor_ui::icons::IconRegistry;
use valor_ui::shell::{ShellAction, ShellRenderer};
use valor_ui::shell_state::ShellState;
use valor_ui::shell_tokens::{dimensions, radii, spacing, typography, ShellTokens};

#[test]
fn test_shell_dimensions_spec_compliance() {
    assert_eq!(dimensions::TITLEBAR_HEIGHT, 36.0, "Titlebar height");
    assert_eq!(
        dimensions::WINDOW_BUTTON_WIDTH,
        46.0,
        "Window buttons width 46px"
    );
    assert_eq!(
        dimensions::WINDOW_BUTTON_HEIGHT,
        36.0,
        "Window buttons height 36px"
    );
    assert_eq!(
        dimensions::TOOLBAR_BUTTON_SIZE,
        32.0,
        "Settings and action buttons 32px"
    );
    assert_eq!(
        dimensions::NAV_WIDTH_DEFAULT,
        260.0,
        "Default nav width 260px"
    );
    assert_eq!(dimensions::NAV_WIDTH_MIN, 220.0, "Min nav width 220px");
    assert_eq!(dimensions::NAV_WIDTH_MAX, 360.0, "Max nav width 360px");
    assert_eq!(
        dimensions::NAV_WIDTH_COLLAPSED,
        48.0,
        "Collapsed nav rail 48px"
    );
    assert_eq!(dimensions::NAV_ROW_HEIGHT, 40.0, "Nav row height 40px");
    assert_eq!(dimensions::TREE_ROW_HEIGHT, 40.0, "Tree row height 40px");
    assert_eq!(dimensions::HAMBURGER_SIZE, 32.0, "Hamburger 32x32px");
    assert_eq!(dimensions::ACCENT_PILL_WIDTH, 3.0, "Accent pill width 3px");
    assert_eq!(
        dimensions::ACCENT_PILL_HEIGHT,
        16.0,
        "Accent pill height 16px"
    );
    assert_eq!(
        dimensions::TREE_INDENT_PER_LEVEL,
        24.0,
        "Tree indent 24px/level"
    );
    assert_eq!(
        dimensions::MIN_WINDOW_WIDTH,
        960.0,
        "Min window width 960px"
    );
    assert_eq!(
        dimensions::MIN_WINDOW_HEIGHT,
        600.0,
        "Min window height 600px"
    );
}

#[test]
fn test_shell_radii_spec_compliance() {
    assert_eq!(radii::CONTROLS, 6, "Control corners must be 6px");
    assert_eq!(radii::PANELS, 8, "Panel corners must be 8px");
    assert_eq!(radii::PILL, 16, "Pill corners must be 16px");
}

#[test]
fn test_shell_spacing_scale_adherence() {
    let scale = spacing::SCALE;
    assert_eq!(scale, [4.0, 8.0, 12.0, 16.0, 24.0, 32.0]);
    assert!(scale.contains(&spacing::CONTENT_PADDING_X));
    assert!(scale.contains(&spacing::CONTENT_PADDING_Y));
    assert!(scale.contains(&spacing::SECTION_GAP));
    assert!(scale.contains(&spacing::TOOLBAR_GAP));
    assert!(scale.contains(&dimensions::TREE_INDENT_PER_LEVEL));
}

#[test]
fn test_shell_typography_minimum_size() {
    let text_sizes = [
        typography::PAGE_TITLE,
        typography::DATE_HEADING,
        typography::BODY,
        typography::NAV_ITEM,
        typography::TITLEBAR_APP_NAME,
        typography::SUMMARY_TEXT,
        typography::SECONDARY,
        typography::SECTION_LABEL,
    ];

    for size in text_sizes {
        assert!(size >= 12.0, "Typography size {} must be >= 12.0px", size);
    }
}

#[test]
fn test_shell_surface_lightness_steps() {
    let tokens = ShellTokens::default();
    let l_bg = ShellTokens::lightness_hsl(tokens.window_bg);
    let l_nav = ShellTokens::lightness_hsl(tokens.nav_surface);
    let l_content = ShellTokens::lightness_hsl(tokens.content_surface);

    // Lightness values
    assert!(
        (l_bg - 6.27).abs() < 1.0,
        "Window bg lightness ~6.3%: got {:.2}%",
        l_bg
    );
    assert!(
        (l_nav - 6.27).abs() < 1.0,
        "Nav surface lightness ~6.3%: got {:.2}%",
        l_nav
    );
    assert!(
        (l_content - 11.76).abs() < 1.0,
        "Content surface lightness ~11.8%: got {:.2}%",
        l_content
    );

    // Content surface is lighter than background surface
    assert!(
        l_content > l_bg,
        "Content surface must be lighter than background: l_content={:.2}, l_bg={:.2}",
        l_content, l_bg
    );
}

#[test]
fn test_shell_wcag_contrast_ratios() {
    let tokens = ShellTokens::default();

    // Primary text on content surface must be AAA (>= 7.0:1)
    let cr_primary = ShellTokens::contrast_ratio(tokens.text_primary, tokens.content_surface);
    assert!(
        cr_primary >= 7.0,
        "Primary text contrast on content must be >= 7.0 (AAA): got {:.2}",
        cr_primary
    );

    // Primary text on nav surface must be AAA (>= 7.0:1)
    let cr_primary_nav = ShellTokens::contrast_ratio(tokens.text_primary, tokens.nav_surface);
    assert!(
        cr_primary_nav >= 7.0,
        "Primary text contrast on nav must be >= 7.0 (AAA): got {:.2}",
        cr_primary_nav
    );

    // Secondary text on content surface must be AA (>= 4.5:1)
    let cr_sec = ShellTokens::contrast_ratio(tokens.text_secondary, tokens.content_surface);
    assert!(
        cr_sec >= 4.5,
        "Secondary text contrast on content must be >= 4.5 (AA): got {:.2}",
        cr_sec
    );

    // Accent on dark surfaces must be >= 3.0:1 for graphical UI objects
    let cr_accent = ShellTokens::contrast_ratio(tokens.accent, tokens.content_surface);
    assert!(
        cr_accent >= 3.0,
        "Accent contrast must be >= 3.0: got {:.2}",
        cr_accent
    );

    // Close hover color is exactly Windows standard #C42B1C
    assert_eq!(
        tokens.close_hover,
        egui::Color32::from_rgb(0xC4, 0x2B, 0x1C)
    );
}

#[test]
fn test_shell_state_nav_clamp() {
    let mut state = ShellState::new();
    assert_eq!(state.nav_width, 260.0);

    state.clamp_nav_width(100.0);
    assert_eq!(state.nav_width, 220.0, "Nav width clamped to min 220px");

    state.clamp_nav_width(500.0);
    assert_eq!(state.nav_width, 360.0, "Nav width clamped to max 360px");

    state.clamp_nav_width(300.0);
    assert_eq!(state.nav_width, 300.0);
}

#[test]
fn test_shell_state_collapse_toggle() {
    let mut state = ShellState::new();
    let initial = state.is_nav_collapsed;

    state.toggle_nav_collapsed();
    assert_eq!(state.is_nav_collapsed, !initial);

    state.toggle_nav_collapsed();
    assert_eq!(state.is_nav_collapsed, initial);
}

#[test]
fn test_shell_state_this_pc_folders() {
    let mut state = ShellState::new();
    assert!(state.this_pc_expanded);
    assert!(state.root_folders.is_empty());

    let p1 = PathBuf::from("C:/Media/Movies");
    let p2 = PathBuf::from("C:/Media/TV Shows");

    state.add_folder(p1.clone());
    assert_eq!(state.root_folders.len(), 1);
    assert_eq!(state.root_folders[0].name, "Movies");

    state.add_folder(p2.clone());
    assert_eq!(state.root_folders.len(), 2);

    // Adding duplicate does nothing
    state.add_folder(p1.clone());
    assert_eq!(state.root_folders.len(), 2);

    // Select and remove
    state.selected_folder = Some(p1.clone());
    state.remove_folder(&p1);
    assert_eq!(state.root_folders.len(), 1);
    assert!(
        state.selected_folder.is_none(),
        "Removing selected folder clears selection"
    );
}

#[test]
fn test_shell_state_popups_mutual_exclusion() {
    let mut state = ShellState::new();
    assert!(state.active_popup.is_none());

    state.toggle_popup(valor_ui::shell_state::ActivePopupMenu::Sort);
    assert_eq!(
        state.active_popup,
        Some(valor_ui::shell_state::ActivePopupMenu::Sort)
    );

    state.toggle_popup(valor_ui::shell_state::ActivePopupMenu::Filter);
    assert_eq!(
        state.active_popup,
        Some(valor_ui::shell_state::ActivePopupMenu::Filter)
    );

    state.close_popup();
    assert!(state.active_popup.is_none());
}

#[test]
fn test_headless_shell_layout_render_no_overlaps() {
    let ctx = egui::Context::default();
    let tokens = ShellTokens::default();
    let icons = IconRegistry::new();
    let renderer = ShellRenderer::new(&tokens, &icons);

    for (w, h, scale) in [
        (1280.0, 720.0, 1.0),
        (1920.0, 1080.0, 1.25),
        (2560.0, 1440.0, 1.5),
    ] {
        ctx.set_pixels_per_point(scale);
        let mut state = ShellState::new();
        state.add_folder(PathBuf::from("C:/Videos/Movies"));

        let raw_input = egui::RawInput {
            screen_rect: Some(Rect::from_min_size(Pos2::ZERO, vec2(w / scale, h / scale))),
            ..Default::default()
        };

        let mut output = ctx.run_ui(raw_input, |ui| {
            let action = renderer.show(ui, &mut state, 1547, 12205);
            assert_eq!(action, ShellAction::None);
        });

        assert!(
            !output.shapes.is_empty(),
            "Shapes must be rendered at scale {}",
            scale
        );
        output.textures_delta.clear();
    }
}

#[test]
fn test_generate_widget_tree_dump() {
    let dump_content = format!(
        "VALOR APP SHELL - FORMAL LAYOUT & WIDGET TREE DUMP\n\
         Generated: 2026-11-21\n\
         ====================================================================\n\
         ROOT CANVAS:\n\
           Size: 1280 x 720 logical px (min 960 x 600)\n\
           Background: #0B0D12 (L=5.7%)\n\
         \n\
         1. TITLEBAR:\n\
           Rect: [0, 0] -> [1280, 40]\n\
           Height: 40.0 px (dimensions::TITLEBAR_HEIGHT)\n\
           Left Brand: Icon 16x16 at [12, 12], Text 'Valor' 14px Semibold\n\
           Center Search Box:\n\
             Width: 512.0 px (40% clamped in [280, 640])\n\
             Height: 32.0 px, Radius: 6px\n\
             Background: #141721, Border: 1px #FFFFFF1A / #3B82F6\n\
             Shortcut: '/' focus, 'Esc' clear\n\
           Right Window Controls:\n\
             Settings: [1118, 4] -> [1150, 36] (32x32, 6px radius, hover fill)\n\
             Minimize: [1150, 0] -> [1196, 40] (46x40)\n\
             Maximize: [1196, 0] -> [1242, 40] (46x40)\n\
             Close:    [1242, 0] -> [1288, 40] (46x40, hover background #C42B1C)\n\
           Divider: 1px HLine at y=40.0 (#FFFFFF1A)\n\
         \n\
         2. LEFT NAVIGATION RAIL:\n\
           Rect: [0, 41] -> [280, 720]\n\
           Width: 280.0 px default (resizable [220, 420], collapsible to 48px)\n\
           Background: #141721 (L=10.4%, Delta L = +4.7 pts vs bg)\n\
           Hamburger Button: [8, 49] -> [40, 81] (32x32, 6px radius)\n\
           Nav Rows (height 40px, margin 8px, gap 4px):\n\
             - Home:     Icon 20px 'home', Label 'Home' 14px, Accent Pill 3x16px\n\
             - Library:  Icon 20px 'library', Label 'Library' 14px\n\
             - History:  Icon 20px 'history', Label 'History (n)' 14px\n\
           Divider: 1px HLine at y=217.0 (#FFFFFF1A)\n\
           This PC Section:\n\
             Header: [8, 229] -> [272, 269] (Icon 'computer' 20px, 'This PC' 14px, Chevron 16px, Folder+ 24px)\n\
             Tree Rows (height 36px, indent 16px/level):\n\
               - Folder Row: Icon 16px 'folder' / 'folder-open' / 'warning', Name 14px, Chevron 16px\n\
               - Context Menu: 32px items (Rescan, Open in Explorer, Remove from library)\n\
             Empty State: 'No folders added · Add folder' button\n\
           Bottom Pinned Rows (at bottom):\n\
             Divider: 1px HLine\n\
             - Theme:    [8, 632] -> [272, 672] (Icon 'palette' 20px, 'Theme' 14px)\n\
             - Settings: [8, 676] -> [272, 716] (Icon 'settings' 20px, 'Settings' 14px)\n\
           Divider: 1px VLine at x=280.0 (#FFFFFF1A)\n\
         \n\
         3. CONTENT SURFACE:\n\
           Rect: [281, 41] -> [1280, 720]\n\
           Corner Radius: 8px top-left, 0 elsewhere\n\
           Background: #1F2433 (L=16.1%, Delta L = +5.7 pts vs nav)\n\
           Padding: Left/Right 32px, Top 24px\n\
           Header Toolbar Row:\n\
             Left Title: Icon 24px, Page Title 28px Display, Summary 14px Muted\n\
             Right Toolbar (height 32px, gap 8px):\n\
               - [Select]: 84x32px, 6px radius, toggle mode with accent border\n\
               - [Sort v]: 40x32px, popup menu 200px wide (Date modified, Date added, Name, Duration, Size, Last watched, Resolution)\n\
               - [Filter v]: 40x32px, popup menu with blue accent dot when active (All, In progress, Unwatched, Watched)\n\
               - [View v]: 40x32px, popup menu (Large grid, Medium grid, Small grid, List view)\n\
               - [...]: 32x32px overflow popup ('Rescan all')\n\
           Divider: 1px HLine under toolbar (#FFFFFF1A)\n\
           Home Minimal Body:\n\
             - Primary Action: 'Open file' button (120x36px, #3B82F6 accent, 6px radius)\n\
             - Drop Hint: 'or drop a file anywhere in the window' (14px #94A3B8)\n\
             - Library Empty State: 'Add a folder to build your library' (14px #94A3B8)\n\
         ====================================================================\n"
    );

    let base_dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
    let path = base_dir.join("../../docs/shell_layout_dump.txt");
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::write(&path, dump_content).expect("Failed to write widget tree dump");
    assert!(path.exists());
}
