//! Shared logical-pixel layout tokens for the Valor shell and its page headers.

pub const ROW_PITCH: f32 = 40.0;
pub const ROW_FILL_H: f32 = 36.0;
pub const ROW_FILL_V_MARGIN: f32 = 2.0;
pub const ROW_INSET_X: f32 = 8.0;
pub const ROW_PAD_X: f32 = 12.0;
pub const ICON_BOX: f32 = 20.0;
pub const ICON_GAP: f32 = 12.0;
pub const LABEL_X: f32 = ROW_INSET_X + ROW_PAD_X + ICON_BOX + ICON_GAP;
pub const TREE_INDENT: f32 = 24.0;
pub const PILL_W: f32 = 3.0;
pub const PILL_H: f32 = 16.0;
pub const PILL_LEFT: f32 = 4.0;
pub const GROUP_GAP: f32 = 12.0;
/// Standard vertical spacing between major UI sections.
pub const SECTION_SPACING: f32 = 12.0;
pub const PANE_TOP_PAD: f32 = 8.0;
pub const PANE_BOTTOM_PAD: f32 = 8.0;
pub const RAIL_W: f32 = 48.0;
pub const RAIL_ROW_INSET_X: f32 = 4.0;
pub const RAIL_PILL_LEFT: f32 = 2.0;
pub const EXPANDED_W: f32 = 260.0;
pub const PAGE_PAD_WIDE_THRESHOLD: f32 = 1100.0;
pub const PAGE_PAD_TOP: f32 = 32.0;
pub const PAGE_PAD_X_WIDE: f32 = 48.0;
pub const PAGE_PAD_X_NARROW: f32 = 32.0;
pub const TITLE_ICON_SIZE: f32 = 28.0;
pub const TITLE_SIZE: f32 = 28.0;
pub const SUMMARY_LINE_H: f32 = 17.0;
pub const TITLE_TO_SUMMARY: f32 = 8.0;
pub const SUMMARY_TO_FIRST_HEADING: f32 = 24.0;
pub const HEADING_TO_CONTENT: f32 = 12.0;
pub const HEADING_ABOVE: f32 = 32.0;
pub const TOOLBAR_GAP: f32 = 8.0;
pub const TOOLBAR_BTN_H: f32 = 32.0;
pub const TOOLBAR_DROPDOWN_PAD: f32 = 8.0;
pub const TOOLBAR_CHEVRON_SIZE: f32 = 12.0;
pub const TOOLBAR_DROPDOWN_W: f32 =
    TOOLBAR_DROPDOWN_PAD * 2.0 + ICON_BOX + TOOLBAR_GAP + TOOLBAR_CHEVRON_SIZE;
pub const TIMELINE_RESERVE_W: f32 = 56.0;
pub const TOOLBAR_BASE_W: f32 = 32.0 + TOOLBAR_DROPDOWN_W * 3.0 + 32.0 + 84.0 + TOOLBAR_GAP * 5.0;
pub const TILE_GAP: f32 = 4.0;
pub const DIVIDER_H: f32 = 1.0;
pub const DIVIDER_BLOCK_H: f32 = GROUP_GAP * 2.0 + DIVIDER_H;
pub const COUNT_CHIP_PAD_X: f32 = 8.0;
pub const COUNT_CHIP_H: f32 = 20.0;

pub const PLAYER_EDGE_PAD: f32 = 24.0;
pub const PLAYER_TOP_OVERLAY_H: f32 = 72.0;
pub const PLAYER_BOTTOM_HUD_H: f32 = 112.0;
pub const PLAYER_CONTROL_SIZE: f32 = 40.0;
pub const PLAYER_CONTROL_ICON: f32 = 24.0;
pub const PLAYER_CONTROL_GAP: f32 = 8.0;
pub const PLAYER_PANEL_WIDTH: f32 = 360.0;
pub const PLAYER_DOCK_WIDTH: f32 = 232.0;

/// Snap a logical coordinate to the nearest physical pixel boundary.
pub fn snap_to_pixel(value: f32, pixels_per_point: f32) -> f32 {
    let scale = pixels_per_point.max(1.0);
    (value * scale).round() / scale
}
