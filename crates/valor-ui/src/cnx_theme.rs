//! CnX Player design tokens: colors, typography, radii, spacing, and shadows.
//! Measurements target a 1264x792 logical px reference window at 1x scale.

use egui::{self, Color32, CornerRadius, FontData, FontDefinitions, FontFamily, FontId};

const fn rgba(r: u8, g: u8, b: u8, a: u8) -> Color32 {
    Color32::from_rgba_premultiplied(
        ((r as u16 * a as u16) / 255) as u8,
        ((g as u16 * a as u16) / 255) as u8,
        ((b as u16 * a as u16) / 255) as u8,
        a,
    )
}

pub const BG_WINDOW: Color32 = Color32::from_rgb(0, 0, 0);
pub const SURFACE_PANEL: Color32 = rgba(0x1A, 0x16, 0x13, 245); // #1A1613 @ 96%
pub const SURFACE_RAISED: Color32 = rgba(255, 255, 255, 13); // 0.05
pub const SURFACE_HOVER: Color32 = rgba(255, 255, 255, 23); // 0.09
pub const SURFACE_PRESSED: Color32 = rgba(255, 255, 255, 33); // 0.13
pub const BORDER_HAIRLINE: Color32 = rgba(255, 255, 255, 15); // 0.06

pub const TEXT_PRIMARY: Color32 = Color32::from_rgb(0xF2, 0xED, 0xE8);
pub const TEXT_SECONDARY: Color32 = Color32::from_rgb(0xA3, 0x9B, 0x93);
pub const TEXT_DISABLED: Color32 = Color32::from_rgb(0x6B, 0x64, 0x5E);

pub const ACCENT: Color32 = Color32::from_rgb(0xEB, 0x8C, 0x34);
pub const ACCENT_CONTAINER: Color32 = Color32::from_rgb(0xF8, 0xAC, 0x64);
pub const ACCENT_CONTAINER_TEXT: Color32 = Color32::from_rgb(0x2A, 0x17, 0x04);
pub const ACCENT_STRONG: Color32 = Color32::from_rgb(0xD9, 0x73, 0x1A);
pub const ACCENT_BUTTON: Color32 = Color32::from_rgb(0xC4, 0x5F, 0x0C);
pub const ACCENT_TINT: Color32 = rgba(0xEB, 0x8C, 0x34, 51); // 0.20

pub const PILL_BG: Color32 = rgba(0, 0, 0, 89); // 0.35
pub const PILL_BG_SOLID: Color32 = rgba(20, 16, 13, 140); // 0.55
pub const CLOSE_HOVER_BG: Color32 = Color32::from_rgb(0xC4, 0x2B, 0x1C);

pub const TRACK_INACTIVE: Color32 = rgba(255, 255, 255, 77); // 0.30
pub const TRACK_INACTIVE_SMALL: Color32 = rgba(255, 255, 255, 46); // 0.18
pub const TRACK_LOCKED: Color32 = rgba(255, 255, 255, 26); // 0.10
pub const BUFFERED_FILL: Color32 = rgba(255, 255, 255, 115); // 0.45

pub const THUMB_BG: Color32 = Color32::from_rgb(0x8E, 0x87, 0x80);
pub const THUMB_LOCKED: Color32 = Color32::from_rgb(0x5A, 0x54, 0x4F);
pub const SCROLLBAR_THUMB: Color32 = rgba(255, 255, 255, 64); // 0.25

// Radii
pub const R_WINDOW: u8 = 12;
pub const R_PANEL: u8 = 20;
pub const R_DIALOG: u8 = 24;
pub const R_POPOVER: u8 = 16;
pub const R_SEG_TRACK: u8 = 10;
pub const R_SEG: u8 = 8;
pub const R_CHIP: u8 = 8;
pub const R_BTN: u8 = 8;
pub const R_INPUT: u8 = 8;
pub const R_ROW: u8 = 10;

// Spacing
pub const S4: f32 = 4.0;
pub const S8: f32 = 8.0;
pub const S12: f32 = 12.0;
pub const S16: f32 = 16.0;
pub const S18: f32 = 18.0;
pub const S20: f32 = 20.0;
pub const S24: f32 = 24.0;

pub fn panel_shadow() -> egui::Shadow {
    egui::Shadow::NONE
}

pub fn big_play_shadow() -> egui::Shadow {
    egui::Shadow::NONE
}

pub fn font_outfit_regular(size: f32) -> FontId {
    FontId::new(size, FontFamily::Name("OutfitRegular".into()))
}

pub fn font_outfit_medium(size: f32) -> FontId {
    FontId::new(size, FontFamily::Name("OutfitMedium".into()))
}

pub fn font_outfit_semibold(size: f32) -> FontId {
    FontId::new(size, FontFamily::Name("OutfitSemiBold".into()))
}

pub fn font_mono(size: f32) -> FontId {
    FontId::new(size, FontFamily::Name("JetBrainsMono".into()))
}

/// Installs embedded Outfit and JetBrains Mono fonts into `ctx` once.
pub fn install_cnx_fonts(ctx: &egui::Context) {
    let flag_id = egui::Id::new("cnx_fonts_installed_v1");
    if ctx.data(|d| d.get_temp::<bool>(flag_id)).unwrap_or(false) {
        return;
    }
    ctx.data_mut(|d| d.insert_temp(flag_id, true));

    let mut defs = FontDefinitions::default();
    defs.font_data.insert(
        "OutfitRegular".to_owned(),
        FontData::from_static(include_bytes!("../assets/fonts/Outfit-Regular.ttf")).into(),
    );
    defs.font_data.insert(
        "OutfitMedium".to_owned(),
        FontData::from_static(include_bytes!("../assets/fonts/Outfit-Medium.ttf")).into(),
    );
    defs.font_data.insert(
        "OutfitSemiBold".to_owned(),
        FontData::from_static(include_bytes!("../assets/fonts/Outfit-SemiBold.ttf")).into(),
    );
    defs.font_data.insert(
        "JetBrainsMono".to_owned(),
        FontData::from_static(include_bytes!("../assets/fonts/JetBrainsMono-Regular.ttf")).into(),
    );

    let fallback: Vec<String> = defs
        .families
        .get(&FontFamily::Proportional)
        .cloned()
        .unwrap_or_default();

    let with_fallback = |primary: &str| -> Vec<String> {
        let mut v = Vec::with_capacity(1 + fallback.len());
        v.push(primary.to_owned());
        v.extend(fallback.iter().cloned());
        v
    };

    defs.families.insert(
        FontFamily::Name("OutfitRegular".into()),
        with_fallback("OutfitRegular"),
    );
    defs.families.insert(
        FontFamily::Name("OutfitMedium".into()),
        with_fallback("OutfitMedium"),
    );
    defs.families.insert(
        FontFamily::Name("OutfitSemiBold".into()),
        with_fallback("OutfitSemiBold"),
    );
    defs.families.insert(
        FontFamily::Name("JetBrainsMono".into()),
        with_fallback("JetBrainsMono"),
    );

    ctx.set_fonts(defs);
}

/// Applies clean, zero-default-Material visuals inside a CnX overlay scope.
pub fn apply_cnx_visuals(ui: &mut egui::Ui) {
    let v = ui.visuals_mut();
    v.dark_mode = true;
    v.window_fill = SURFACE_PANEL;
    v.panel_fill = SURFACE_PANEL;
    v.window_stroke = egui::Stroke::new(1.0, BORDER_HAIRLINE);
    v.window_corner_radius = CornerRadius::same(R_PANEL);
    v.selection.bg_fill = ACCENT_TINT;
    v.selection.stroke = egui::Stroke::new(1.0, ACCENT);
    v.widgets.noninteractive.bg_fill = Color32::TRANSPARENT;
    v.widgets.noninteractive.fg_stroke = egui::Stroke::new(1.0, TEXT_PRIMARY);
    v.widgets.noninteractive.bg_stroke = egui::Stroke::NONE;
}

pub fn round_px(ui: &egui::Ui, v: f32) -> f32 {
    let ppp = ui.ctx().pixels_per_point();
    (v * ppp).round() / ppp
}

pub fn round_rect_px(ui: &egui::Ui, r: egui::Rect) -> egui::Rect {
    egui::Rect::from_min_max(
        egui::pos2(round_px(ui, r.min.x), round_px(ui, r.min.y)),
        egui::pos2(round_px(ui, r.max.x), round_px(ui, r.max.y)),
    )
}
