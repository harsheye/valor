/*
 * Lucide Icons
 * ISC License
 *
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
 * All other portions Copyright (c) Lucide Contributors 2022.
 */

use egui::{Color32, ColorImage, Context, Pos2, Rect, TextureHandle, TextureOptions, Ui};
use std::collections::HashMap;
use std::sync::RwLock;
use tracing::{info, warn};

pub struct IconRegistry {
    svg_overrides: RwLock<HashMap<String, String>>,
    texture_cache: RwLock<HashMap<(String, u32, u32), TextureHandle>>,
}

impl Default for IconRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl IconRegistry {
    pub fn new() -> Self {
        Self {
            svg_overrides: RwLock::new(HashMap::new()),
            texture_cache: RwLock::new(HashMap::new()),
        }
    }

    /// Register or override an SVG by semantic ID (used by skins & icon packs).
    pub fn register_override(&self, semantic_id: &str, svg_content: &str) {
        let mut overrides = self.svg_overrides.write().unwrap();
        overrides.insert(semantic_id.to_string(), svg_content.to_string());
        let mut cache = self.texture_cache.write().unwrap();
        cache.retain(|(k, _, _), _| k != semantic_id);
    }

    /// Render and retrieve an icon texture by semantic ID and pixel size.
    pub fn get_icon(
        &self,
        ctx: &Context,
        semantic_id: &str,
        width: u32,
        height: u32,
    ) -> Option<TextureHandle> {
        let key = (semantic_id.to_string(), width, height);
        {
            let cache = self.texture_cache.read().unwrap();
            if let Some(tex) = cache.get(&key) {
                return Some(tex.clone());
            }
        }

        let svg_str = {
            let overrides = self.svg_overrides.read().unwrap();
            if let Some(custom) = overrides.get(semantic_id) {
                custom.clone()
            } else {
                match get_builtin_svg(semantic_id) {
                    Some(s) => s.to_string(),
                    None => {
                        warn!("Icon semantic ID '{}' not found in registry", semantic_id);
                        return None;
                    }
                }
            }
        };

        if let Ok(color_image) = render_svg_to_image(&svg_str, width, height) {
            let handle = ctx.load_texture(
                format!("icon_{}_{}x{}", semantic_id, width, height),
                color_image,
                TextureOptions::LINEAR,
            );
            let mut cache = self.texture_cache.write().unwrap();
            cache.insert(key, handle.clone());
            Some(handle)
        } else {
            None
        }
    }

    /// Helper to paint an icon directly into a given Rect with custom tint color.
    pub fn paint_icon(&self, ui: &mut Ui, semantic_id: &str, rect: Rect, tint: Color32) {
        let ppp = ui.ctx().pixels_per_point().max(1.0);
        let size = ((rect.width().max(rect.height()) * ppp * 3.0).round() as u32).clamp(64, 256);
        if let Some(tex) = self.get_icon(ui.ctx(), semantic_id, size, size) {
            ui.painter().image(
                tex.id(),
                rect,
                Rect::from_min_max(Pos2::new(0.0, 0.0), Pos2::new(1.0, 1.0)),
                tint,
            );
        }
    }

    /// Startup verification that all semantic icons exist in the registry.
    pub fn verify_icons_integrity(&self) -> Result<(), Vec<String>> {
        let required_ids = [
            "logo.valor",
            "nav.select_media",
            "nav.this_pc",
            "nav.history",
            "nav.library",
            "nav.stream",
            "nav.engine",
            "nav.theme",
            "nav.settings",
            "hamburger",
            "chevron-right",
            "chevron-down",
            "chevron-left",
            "chevron-up",
            "folder",
            "folder-plus",
            "folder-open",
            "computer",
            "search",
            "settings",
            "sort",
            "filter",
            "view-grid",
            "view-list",
            "select",
            "more-horizontal",
            "minimize",
            "maximize",
            "restore",
            "close",
            "warning",
            "action.cloud_upload",
            "action.folder",
            "action.drive",
            "action.close",
            "action.back",
            "action.search",
            "action.chevron_right",
            "action.chevron_down",
            "action.chevron_left",
            "action.pin",
            "action.bookmark",
            "action.trash",
            "action.edit",
            "transport.play",
            "transport.pause",
            "transport.rewind_10",
            "transport.forward_10",
            "transport.forward_30",
            "transport.volume",
            "transport.volume_mute",
            "transport.fullscreen",
            "transport.pip",
            "transport.subtitles",
            "transport.audio",
            "transport.speed",
            "transport.boost",
            "transport.playlist",
            "dock.ambiance",
            "dock.hdr",
            "dock.layers",
            "dock.subtitles",
            "dock.autonext",
            "dock.timer",
            "dock.studio",
            "dock.boost",
            "dock.crop",
            "dock.speed",
            "dock.coffee",
            "dock.skip_intro",
            "dock.block_seek",
            "dock.fast_forward",
            "dock.lock",
            "dock.collapse",
        ];

        let mut missing = Vec::new();
        for id in required_ids {
            if get_builtin_svg(id).is_none() {
                missing.push(id.to_string());
            }
        }

        if missing.is_empty() {
            info!(
                "All {} required semantic icons verified present",
                required_ids.len()
            );
            Ok(())
        } else {
            warn!("Missing {} semantic icons: {:?}", missing.len(), missing);
            Err(missing)
        }
    }
}

fn render_svg_to_image(svg: &str, width: u32, height: u32) -> Result<ColorImage, String> {
    use resvg::tiny_skia;
    use resvg::usvg;

    let normalized_svg = svg.replace("currentColor", "white");
    let opt = usvg::Options::default();
    let tree = usvg::Tree::from_str(&normalized_svg, &opt).map_err(|e| e.to_string())?;

    let mut pixmap = tiny_skia::Pixmap::new(width, height)
        .ok_or_else(|| "Failed to allocate pixmap".to_string())?;

    let tree_size = tree.size();
    let sx = width as f32 / tree_size.width();
    let sy = height as f32 / tree_size.height();
    let transform = tiny_skia::Transform::from_scale(sx, sy);

    resvg::render(&tree, transform, &mut pixmap.as_mut());

    let pixels = pixmap.data();
    let color_image = ColorImage::from_rgba_unmultiplied([width as usize, height as usize], pixels);
    Ok(color_image)
}

/// Official Microsoft Segoe UI icons (E768, E769, E767, E740, E73F, ED3C, ED3D, E76B, E76C, E712, E7F0)
#[allow(dead_code)]
fn get_segoe_icon_rgba(semantic_id: &str) -> Option<&'static [u8; 4096]> {
    match semantic_id {
        "transport.play" | "play" => Some(include_bytes!("segoe_icons/play.bin")),
        "transport.pause" => Some(include_bytes!("segoe_icons/pause.bin")),
        "transport.volume" => Some(include_bytes!("segoe_icons/volume.bin")),
        "transport.fullscreen" => Some(include_bytes!("segoe_icons/fullscreen.bin")),
        "transport.exit_fullscreen" => Some(include_bytes!("segoe_icons/exit_fullscreen.bin")),
        "transport.rewind_10" => Some(include_bytes!("segoe_icons/rewind_10.bin")),
        "transport.forward_10" => Some(include_bytes!("segoe_icons/forward_10.bin")),
        "action.chevron_left" | "chevron-left" => Some(include_bytes!("segoe_icons/chevron_left.bin")),
        "action.chevron_right" | "chevron-right" => Some(include_bytes!("segoe_icons/chevron_right.bin")),
        "action.dots_vertical" | "more" => Some(include_bytes!("segoe_icons/more.bin")),
        "transport.subtitles" => Some(include_bytes!("segoe_icons/subtitles.bin")),
        _ => None,
    }
}

/// Built-in semantic SVGs from Lucide (stroke: currentColor, 24x24 viewBox)
fn get_builtin_svg(id: &str) -> Option<&'static str> {
    match id {
        "logo.valor" => Some(
            r##"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="M4 4L12 20L20 4H15.5L12 13L8.5 4H4Z" fill="#EF4444"/></svg>"##,
        ),
        "nav.select_media" | "home" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>"#,
        ),
        "nav.this_pc" | "computer" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>"#,
        ),
        "hamburger" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>"#,
        ),
        "nav.settings" | "settings" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>"#,
        ),
        "action.folder" | "folder" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>"#,
        ),
        "action.folder_plus" | "folder-plus" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 10v6"/><path d="M9 13h6"/><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>"#,
        ),
        "folder-open" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>"#,
        ),
        "action.chevron_right" | "chevron-right" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 4 17 12 9 20"/></svg>"#,
        ),
        "action.chevron_down" | "chevron-down" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>"#,
        ),
        "action.chevron_left" | "chevron-left" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 4 7 12 15 20"/></svg>"#,
        ),
        "action.grid" | "view-grid" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>"#,
        ),
        "action.list" | "view-list" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>"#,
        ),
        "action.check" | "check" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>"#,
        ),
        "action.dots_horizontal" | "more-horizontal" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2.4"/><circle cx="12" cy="12" r="2.4"/><circle cx="19" cy="12" r="2.4"/></svg>"#,
        ),
        "sort" | "arrow-up-down" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>"#,
        ),
        "select" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><polyline points="9 11 12 14 22 4"/></svg>"#,
        ),
        "minimize" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" x2="19" y1="12" y2="12"/></svg>"#,
        ),
        "maximize" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/></svg>"#,
        ),
        "restore" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="7" y="3" rx="1"/><path d="M3 7v14h14"/></svg>"#,
        ),
        "action.close" | "x" | "close" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>"#,
        ),
        "warning" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" x2="12" y1="9" y2="13"/><line x1="12" x2="12.01" y1="17" y2="17"/></svg>"#,
        ),
        "nav.history" | "history" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><polyline points="12 7 12 12 15 15"/></svg>"#,
        ),
        "nav.library" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>"#,
        ),
        "nav.stream" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 3 20 12 6 21 6 3"/></svg>"#,
        ),
        "nav.engine" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>"#,
        ),
        "nav.theme" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>"#,
        ),
        "action.cloud_upload" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m16 16-4-4-4 4"/></svg>"#,
        ),
        "action.drive" | "hard-drive" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="8" x="2" y="14" rx="2"/><path d="M6 18h.01"/><path d="M10 18h.01"/></svg>"#,
        ),
        "action.back" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>"#,
        ),
        "action.plus" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>"#,
        ),
        "action.dots_vertical" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/></svg>"#,
        ),
        "action.chevron_up" | "chevron-up" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg>"#,
        ),
        "action.pin" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="17" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>"#,
        ),
        "action.bookmark" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4.75A1.75 1.75 0 0 1 7.75 3h8.5A1.75 1.75 0 0 1 18 4.75V21l-6-4-6 4z"/></svg>"#,
        ),
        "action.search" | "search" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>"#,
        ),
        "action.trash" | "trash" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>"#,
        ),
        "action.edit" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>"#,
        ),
        "transport.play" | "play" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><polygon points="7 4 19 12 7 20 7 4"/></svg>"#,
        ),
        "filter" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>"#,
        ),
        "calendar" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>"#,
        ),
        "transport.pause" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4" width="4.5" height="16" rx="0.8"/><rect x="14" y="4" width="4.5" height="16" rx="0.8"/></svg>"#,
        ),
        "transport.rewind_10" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 0 7.8 6.2" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><polygon points="12 0.5 12 7.5 7.5 4" fill="currentColor"/></svg>"#,
        ),
        "transport.forward_30" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 1-7.8 6.2" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><polygon points="12 0.5 12 7.5 16.5 4" fill="currentColor"/></svg>"#,
        ),
        "transport.forward_10" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 1-7.8 6.2" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><polygon points="12 0.5 12 7.5 16.5 4" fill="currentColor"/></svg>"#,
        ),
        "transport.volume" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M3.5 9v6h4l5.5 4.5V4.5L7.5 9h-4z" fill="currentColor"/><path d="M16 8.2a5 5 0 0 1 0 7.6M19 5a9 9 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>"#,
        ),
        "transport.volume_mute" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M3.5 9v6h4l5.5 4.5V4.5L7.5 9h-4z" fill="currentColor"/><line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/><line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" stroke-width="2.3" stroke-linecap="round"/></svg>"#,
        ),
        "transport.fullscreen" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>"#,
        ),
        "transport.exit_fullscreen" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>"#,
        ),
        "transport.pip" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><rect width="18" height="14" x="3" y="5" rx="1.5" fill="none" stroke="currentColor" stroke-width="2.2"/><rect width="7.5" height="5.5" x="11.5" y="11.5" rx="0.6" fill="currentColor"/></svg>"#,
        ),
        "transport.subtitles" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M20 4H4c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h3v3l4-3h9c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-1 12H5c-.55 0-1-.45-1-1V7c0-.55.45-1 1-1h14c.55 0 1 .45 1 1v8c0 .55-.45 1-1 1z" fill="currentColor"/><rect x="6" y="8" width="12" height="1.8" rx="0.5" fill="currentColor"/><rect x="6" y="12" width="7" height="1.8" rx="0.5" fill="currentColor"/></svg>"#,
        ),
        "transport.audio" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/></svg>"#,
        ),
        "transport.speed" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>"#,
        ),
        "transport.boost" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>"#,
        ),
        "transport.playlist" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="8" x2="21" y1="6" y2="6"/><line x1="8" x2="21" y1="12" y2="12"/><line x1="8" x2="21" y1="18" y2="18"/><line x1="3" x2="3.01" y1="6" y2="6"/><line x1="3" x2="3.01" y1="12" y2="12"/><line x1="3" x2="3.01" y1="18" y2="18"/></svg>"#,
        ),
        "dock.ambiance" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/></svg>"#,
        ),
        "dock.hdr" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>"#,
        ),
        "dock.layers" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/></svg>"#,
        ),
        "dock.subtitles" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" x2="15" y1="20" y2="20"/><line x1="12" x2="12" y1="4" y2="20"/></svg>"#,
        ),
        "dock.autonext" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2"/><polygon points="10 8 16 12 10 16 10 8"/></svg>"#,
        ),
        "dock.timer" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>"#,
        ),
        "dock.studio" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/></svg>"#,
        ),
        "dock.boost" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>"#,
        ),
        "dock.crop" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>"#,
        ),
        "dock.speed" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>"#,
        ),
        "dock.coffee" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v2"/><path d="M14 2v2"/><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h12Z"/><path d="M6 2v2"/><path d="M17 10h1a3 3 0 0 1 0 6h-1"/></svg>"#,
        ),
        "dock.skip_intro" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"/><line x1="19" x2="19" y1="5" y2="19"/></svg>"#,
        ),
        "dock.block_seek" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 14.14 14.14"/></svg>"#,
        ),
        "dock.fast_forward" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 19 22 12 13 5 13 19"/><polygon points="2 19 11 12 2 5 2 19"/></svg>"#,
        ),
        "dock.lock" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>"#,
        ),
        "dock.collapse" => Some(
            r#"<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>"#,
        ),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_icons_integrity() {
        let registry = IconRegistry::new();
        if let Err(missing) = registry.verify_icons_integrity() {
            panic!("Missing icons in registry: {:?}", missing);
        }
    }
}
