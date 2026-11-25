use crate::icons::IconRegistry;
use crate::texture_cache::LruTextureCache;
use crate::theme::ValorTheme;
use crate::view_models::{SortOption, ViewMode};
use egui::{Align2, FontId, Rect, Ui};

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

pub fn render(ui: &mut Ui, ctx: &mut LibraryCtx) {
    let center = ctx.content_rect.center();
    ui.painter().text(
        center,
        Align2::CENTER_CENTER,
        "Playlists: not built yet",
        FontId::proportional(18.0),
        ctx.theme.text_muted,
    );
}
