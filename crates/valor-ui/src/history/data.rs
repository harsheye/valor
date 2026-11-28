//! History data model, snapshot builder, and pure path/text helpers.

use crate::shell_state::TmdbSeriesInfo;
use crate::ui_kit::tokens;
use chrono::{Datelike, Local, NaiveDate};
use egui::{Color32, Context, FontId, Galley};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use valor_core::models::{MediaItem, WatchSession};

const VIDEO_EXTENSIONS: &[&str] = &[
    "mkv", "mp4", "avi", "ts", "mov", "webm", "m4v", "wmv", "flv", "mpg", "mpeg",
];

#[derive(Debug, Clone)]
pub struct HistoryItem {
    pub id: u64,
    pub session_id: String,
    pub fingerprint: String,
    pub title: String,
    pub episode: Option<String>,
    pub plays: u32,
    pub watched_secs: u32,
    pub duration_secs: u32,
    pub paused_at_secs: u32,
    pub progress: f32,
    pub file_path: PathBuf,
    pub parent_folder_str: String,
    pub rating: Option<f32>,
    pub marked_done: bool,
    pub trakt_watched: bool,
    pub day: NaiveDate,
    pub imdb_id: Option<String>,
    pub tmdb_id: Option<u32>,
    pub season_number: Option<u32>,
    pub episode_number: Option<u32>,
}

#[derive(Debug, Clone)]
pub struct DayGroup {
    pub date: NaiveDate,
    pub total_secs: u32,
    pub sessions: u32,
    pub videos: u32,
    pub items: Vec<HistoryItem>,
}

#[derive(Debug, Clone)]
pub struct HistoryState {
    pub day_groups: Vec<DayGroup>,
    pub heatmap_counts: HashMap<NaiveDate, u32>,
    pub total_sessions_year: u32,
    pub total_watch_secs: u32,
    pub total_titles_logged: usize,
    pub selected_year: i32,
    pub trakt_connected: bool,
}

impl Default for HistoryState {
    fn default() -> Self {
        Self {
            day_groups: Vec::new(),
            heatmap_counts: HashMap::new(),
            total_sessions_year: 0,
            total_watch_secs: 0,
            total_titles_logged: 0,
            selected_year: Local::now().date_naive().year(),
            trakt_connected: false,
        }
    }
}

/// Returns the parent folder if `path` ends with a known video extension;
/// otherwise returns `path` as-is (directory, root, or UNC share).
pub fn parent_folder(path: &Path) -> PathBuf {
    let is_video_file = path
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|ext| VIDEO_EXTENSIONS.iter().any(|v| v.eq_ignore_ascii_case(ext)));
    if is_video_file {
        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                return parent.to_path_buf();
            }
        }
    }
    path.to_path_buf()
}

/// Elides `text` from the LEFT so the rightmost path segments remain visible (`…\Kdrama\stranger s1 2017`).
pub fn elide_left(
    ctx: &Context,
    text: &str,
    font: FontId,
    color: Color32,
    max_w: f32,
) -> Arc<Galley> {
    let measure = |s: &str| -> Arc<Galley> {
        let mut job = egui::text::LayoutJob::single_section(
            s.to_owned(),
            egui::text::TextFormat {
                font_id: font.clone(),
                color,
                ..Default::default()
            },
        );
        job.wrap.max_width = f32::INFINITY;
        job.wrap.max_rows = 1;
        ctx.fonts_mut(|f| f.layout_job(job))
    };

    let full = measure(text);
    if full.size().x <= max_w || max_w <= 8.0 {
        return full;
    }

    let chars: Vec<(usize, char)> = text.char_indices().collect();
    if chars.is_empty() {
        return full;
    }

    // Binary search for the smallest starting index `lo` whose `…<suffix>` fits within `max_w`.
    let mut lo = 1usize;
    let mut hi = chars.len();
    let mut best: Option<Arc<Galley>> = None;
    while lo < hi {
        let mid = (lo + hi) / 2;
        let byte_idx = chars[mid].0;
        let candidate = format!("…{}", &text[byte_idx..]);
        let g = measure(&candidate);
        if g.size().x <= max_w {
            best = Some(g);
            hi = mid;
        } else {
            lo = mid + 1;
        }
    }
    if let Some(g) = best {
        g
    } else if let Some((last_idx, _)) = chars.last() {
        measure(&format!("…{}", &text[*last_idx..]))
    } else {
        measure("…")
    }
}

/// Formats durations in the `4s` / `24s` / `8m` / `1h 25m` / `2h 0m` style.
pub fn format_duration_short(secs: u32) -> String {
    if secs < 60 {
        format!("{secs}s")
    } else if secs < 3600 {
        format!("{}m", secs / 60)
    } else {
        let h = secs / 3600;
        let m = (secs % 3600) / 60;
        format!("{h}h {m}m")
    }
}

/// Extract clean title and optional `S01E08` episode tag from a session/item.
fn parse_title_and_episode(raw_title: &str, item: Option<&MediaItem>) -> (String, Option<String>) {
    if let Some(m) = item {
        if let (Some(s), Some(e)) = (m.season_number, m.episode_number) {
            let ep = format!("S{s:02}E{e:02}");
            let clean = raw_title
                .replace(&ep, "")
                .replace(&ep.to_lowercase(), "")
                .trim()
                .to_string();
            return (
                if clean.is_empty() {
                    m.title.clone()
                } else {
                    clean
                },
                Some(ep),
            );
        }
    }
    // Fallback: detect SxxEyy in title
    let upper = raw_title.to_uppercase();
    if let Some(pos) = upper.find('S') {
        let bytes = upper.as_bytes();
        if pos + 5 < bytes.len()
            && bytes[pos + 1].is_ascii_digit()
            && bytes[pos + 2].is_ascii_digit()
            && bytes[pos + 3] == b'E'
            && bytes[pos + 4].is_ascii_digit()
            && bytes[pos + 5].is_ascii_digit()
        {
            let ep = upper[pos..pos + 6].to_string();
            let clean = format!("{}{}", &raw_title[..pos], &raw_title[pos + 6..])
                .trim()
                .to_string();
            return (
                if clean.is_empty() {
                    raw_title.to_string()
                } else {
                    clean
                },
                Some(ep),
            );
        }
    }
    (raw_title.trim().to_string(), None)
}

/// Builds an `Arc<HistoryState>` snapshot from sessions, media items, and caches.
#[allow(clippy::too_many_arguments)]
pub fn build_history_snapshot(
    sessions: &[WatchSession],
    items: &[MediaItem],
    tmdb_cache: &HashMap<String, TmdbSeriesInfo>,
    trakt_watched_keys: &HashSet<String>,
    optimistically_done: &HashSet<String>,
    removed_session_ids: &HashSet<String>,
    selected_year: i32,
    trakt_connected: bool,
) -> Arc<HistoryState> {
    let mut item_by_fp: HashMap<&str, &MediaItem> = HashMap::with_capacity(items.len());
    for item in items {
        item_by_fp.insert(item.fingerprint.as_str(), item);
    }

    let mut active_sessions: Vec<&WatchSession> = sessions
        .iter()
        .filter(|s| {
            if removed_session_ids.contains(&s.id) {
                return false;
            }
            let low = s.item_title.to_lowercase();
            !low.contains("$recycle.bin") && !low.starts_with("$r")
        })
        .collect();

    // Newest first
    active_sessions.sort_by(|a, b| b.start_time.cmp(&a.start_time));

    // Also index media by lowercase title as fallback when fingerprint differs
    let mut item_by_title: HashMap<String, &MediaItem> = HashMap::with_capacity(items.len());
    for it in items {
        item_by_title.entry(it.title.to_lowercase()).or_insert(it);
    }

    // Heatmap counts computed once per year (Jan 1..today for current year)
    let mut heatmap_counts: HashMap<NaiveDate, u32> = HashMap::new();
    let today = Local::now().date_naive();
    let is_current_year = selected_year == today.year();
    let jan1 = NaiveDate::from_ymd_opt(selected_year, 1, 1).unwrap_or(today);
    let mut total_sessions_year: u32 = 0;

    for s in &active_sessions {
        let d = s.start_time.with_timezone(&Local).date_naive();
        let in_range = if is_current_year {
            d >= jan1 && d <= today
        } else {
            d.year() == selected_year
        };
        if in_range {
            *heatmap_counts.entry(d).or_insert(0) += 1;
            total_sessions_year += 1;
        }
    }

    // Group sessions by (day, fingerprint) so multiple sessions for the same video on the same day collapse into 1 row with ×N
    let mut groups_map: HashMap<NaiveDate, Vec<HistoryItem>> = HashMap::new();
    let mut day_fp_index: HashMap<(NaiveDate, String), usize> = HashMap::new();
    let mut total_watch_secs: u32 = 0;

    for (idx, s) in active_sessions.iter().enumerate() {
        let day = s.start_time.with_timezone(&Local).date_naive();
        let media = item_by_fp
            .get(s.fingerprint.as_str())
            .copied()
            .or_else(|| {
                let (t, _) = parse_title_and_episode(&s.item_title, None);
                item_by_title.get(&t.to_lowercase()).copied()
            });
        let (title, episode) = parse_title_and_episode(&s.item_title, media);
        let watched = (s.end_pos_secs - s.start_pos_secs).abs().round() as u32;
        total_watch_secs = total_watch_secs.saturating_add(watched);

        let duration = media
            .map(|m| m.duration.max(0.0).round() as u32)
            .unwrap_or(0)
            .max(s.end_pos_secs.max(0.0).round() as u32)
            .max(1);
        let paused = s.end_pos_secs.max(0.0).round() as u32;
        let progress = (paused as f32 / duration as f32).clamp(0.0, 1.0);

        let day_items = groups_map.entry(day).or_default();
        let key = (day, s.fingerprint.clone());
        if let Some(&existing_idx) = day_fp_index.get(&key) {
            let existing = &mut day_items[existing_idx];
            existing.watched_secs = existing.watched_secs.saturating_add(watched);
            existing.plays = existing.plays.saturating_add(1);
            existing.duration_secs = existing.duration_secs.max(duration);
            if paused > existing.paused_at_secs {
                existing.paused_at_secs = paused;
            }
            existing.progress = (existing.paused_at_secs as f32 / existing.duration_secs.max(1) as f32).clamp(0.0, 1.0);
            existing.marked_done = existing.marked_done || existing.progress >= 0.90;
            continue;
        }

        let file_path = media
            .map(|m| PathBuf::from(&m.file_path))
            .unwrap_or_default();
        let parent_folder_str = if file_path.as_os_str().is_empty() {
            String::new()
        } else {
            parent_folder(&file_path).to_string_lossy().to_string()
        };

        let rating = tmdb_cache
            .get(&title.to_lowercase())
            .map(|info| info.vote_average)
            .filter(|r| *r > 0.0);

        let marked_done = optimistically_done.contains(&s.fingerprint) || progress >= 0.90;
        let trakt_watched = trakt_watched_keys.contains(&s.fingerprint)
            || trakt_watched_keys.contains(&title.to_lowercase());

        let item = HistoryItem {
            id: idx as u64 + 1,
            session_id: s.id.clone(),
            fingerprint: s.fingerprint.clone(),
            title,
            episode,
            plays: 1,
            watched_secs: watched,
            duration_secs: duration,
            paused_at_secs: paused,
            progress,
            file_path,
            parent_folder_str,
            rating,
            marked_done,
            trakt_watched,
            day,
            imdb_id: None,
            tmdb_id: None,
            season_number: media.and_then(|m| m.season_number),
            episode_number: media.and_then(|m| m.episode_number),
        };
        day_fp_index.insert(key, day_items.len());
        day_items.push(item);
    }

    let mut day_groups: Vec<DayGroup> = groups_map
        .into_iter()
        .map(|(date, items)| {
            let total_secs: u32 = items.iter().map(|i| i.watched_secs).sum();
            let sessions: u32 = items.iter().map(|i| i.plays).sum();
            let videos = items.len() as u32;
            DayGroup {
                date,
                total_secs,
                sessions,
                videos,
                items,
            }
        })
        .collect();

    day_groups.sort_by(|a, b| b.date.cmp(&a.date));

    let _ = tokens::ACCENT; // keep token module linked
    Arc::new(HistoryState {
        day_groups,
        heatmap_counts,
        total_sessions_year,
        total_watch_secs,
        total_titles_logged: active_sessions.len(),
        selected_year,
        trakt_connected,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use egui::{Context, RawInput};

    #[test]
    fn test_parent_folder_variants() {
        // File path with video extension
        let f = Path::new(r"F:\Presumed.Innocent.S01.Com\Presumed.Innocent.S01E01.mkv");
        assert_eq!(parent_folder(f), PathBuf::from(r"F:\Presumed.Innocent.S01.Com"));

        // Already a directory path
        let d = Path::new(r"F:\movies\Kdrama\stranger s1 2017");
        assert_eq!(parent_folder(d), PathBuf::from(r"F:\movies\Kdrama\stranger s1 2017"));

        // Root path
        let r = Path::new("/");
        assert_eq!(parent_folder(r), PathBuf::from("/"));

        // UNC path
        let unc = Path::new(r"\\NAS\Media\Movie.mp4");
        assert_eq!(parent_folder(unc), PathBuf::from(r"\\NAS\Media"));

        // Very long name with no spaces
        let long_name = "a".repeat(100);
        let long_path = PathBuf::from(format!(r"F:\{long_name}\video.mkv"));
        assert_eq!(parent_folder(&long_path), PathBuf::from(format!(r"F:\{long_name}")));
    }

    #[test]
    fn test_elide_left_keeps_rightmost_segments() {
        let ctx = Context::default();
        ctx.begin_pass(RawInput::default());
        let font = FontId::monospace(11.5);
        let long_path = r"F:\Presumed.Innocent.S01.2160p.ATVP.WEB-DL\Kdrama\stranger s1 2017";
        let g = elide_left(&ctx, long_path, font, Color32::WHITE, 180.0);
        assert!(g.size().x <= 185.0);
        let rendered: String = g.rows.iter().map(|r| r.text()).collect();
        assert!(rendered.starts_with('…'));
        assert!(rendered.contains("2017"));
        let mut out = ctx.end_pass();
        out.textures_delta.clear();
    }

    #[test]
    fn test_format_duration_short() {
        assert_eq!(format_duration_short(4), "4s");
        assert_eq!(format_duration_short(24), "24s");
        assert_eq!(format_duration_short(480), "8m");
        assert_eq!(format_duration_short(5100), "1h 25m");
        assert_eq!(format_duration_short(7200), "2h 0m");
    }
}
