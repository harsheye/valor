use chrono::Local;
use std::collections::HashMap;
use valor_core::models::{MediaItem, PlaybackPosition, WatchSession};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LibraryTab {
    Movies,
    Series,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FilterPill {
    All,
    InProgress,
    Unwatched,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortOption {
    TitleAsc,
    TitleDesc,
    YearDesc,
    YearAsc,
    DurationDesc,
    DateAddedDesc,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ResolutionFilter {
    All,
    Res4K,
    Res1080p,
    Res720p,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HdrFilter {
    All,
    HdrOnly,
    SdrOnly,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ViewMode {
    Grid,
    List,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SeriesSummary {
    pub series_id: String,
    pub title: String,
    pub season_count: usize,
    pub episode_count: usize,
    pub episodes: Vec<MediaItem>,
    pub watched_count: usize,
    pub is_completed: bool,
    pub year: Option<u32>,
    pub is_hdr: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub struct VirtualRange {
    pub start_index: usize,
    pub end_index: usize,
    pub top_spacer_height: f32,
    pub bottom_spacer_height: f32,
}

/// Calculates virtualized visible slice for 50,000+ items in a grid.
/// Allocates only visible items, eliminating DOM/egui allocation overhead.
pub fn calculate_virtual_grid(
    total_items: usize,
    cols: usize,
    item_height: f32,
    row_spacing: f32,
    scroll_y: f32,
    viewport_height: f32,
) -> VirtualRange {
    if total_items == 0 || cols == 0 {
        return VirtualRange {
            start_index: 0,
            end_index: 0,
            top_spacer_height: 0.0,
            bottom_spacer_height: 0.0,
        };
    }

    let total_rows = (total_items + cols - 1) / cols;
    let row_height_total = item_height + row_spacing;

    let overscan_rows = 2; // Render 2 buffer rows above and below viewport
    let first_visible_row = ((scroll_y / row_height_total).floor() as isize - overscan_rows as isize)
        .max(0) as usize;
    let visible_rows_count = ((viewport_height / row_height_total).ceil() as usize) + (overscan_rows * 2);
    let last_visible_row = (first_visible_row + visible_rows_count).min(total_rows);

    let start_index = (first_visible_row * cols).min(total_items);
    let end_index = (last_visible_row * cols).min(total_items);

    let top_spacer_height = first_visible_row as f32 * row_height_total;
    let remaining_rows = total_rows.saturating_sub(last_visible_row);
    let bottom_spacer_height = remaining_rows as f32 * row_height_total;

    VirtualRange {
        start_index,
        end_index,
        top_spacer_height,
        bottom_spacer_height,
    }
}

/// Calculates virtualized visible slice for a vertical list.
pub fn calculate_virtual_list(
    total_items: usize,
    item_height: f32,
    row_spacing: f32,
    scroll_y: f32,
    viewport_height: f32,
) -> VirtualRange {
    calculate_virtual_grid(total_items, 1, item_height, row_spacing, scroll_y, viewport_height)
}

/// Filters and sorts movies (items without series_id).
pub fn filter_and_sort_movies(
    items: &[MediaItem],
    positions: &HashMap<String, PlaybackPosition>,
    filter_pill: FilterPill,
    sort: SortOption,
    res: ResolutionFilter,
    hdr: HdrFilter,
    search_query: &str,
) -> Vec<MediaItem> {
    let q = search_query.trim().to_lowercase();

    let mut filtered: Vec<MediaItem> = items
        .iter()
        .filter(|item| item.series_id.is_none())
        .filter(|item| {
            if !q.is_empty() && !item.title.to_lowercase().contains(&q) {
                return false;
            }

            // Resolution filter
            if res != ResolutionFilter::All {
                let h = item.height.unwrap_or(0);
                match res {
                    ResolutionFilter::Res4K if h < 2160 => return false,
                    ResolutionFilter::Res1080p if !(1080..2160).contains(&h) => return false,
                    ResolutionFilter::Res720p if !(720..1080).contains(&h) => return false,
                    _ => {}
                }
            }

            // HDR filter
            if hdr == HdrFilter::HdrOnly && !item.is_hdr {
                return false;
            }
            if hdr == HdrFilter::SdrOnly && item.is_hdr {
                return false;
            }

            // Progress pill filter
            let pos = positions.get(&item.fingerprint);
            match filter_pill {
                FilterPill::All => true,
                FilterPill::InProgress => {
                    if let Some(p) = pos {
                        !p.completed && p.position_secs > 5.0 && (p.position_secs / item.duration.max(1.0)) < 0.90
                    } else {
                        false
                    }
                }
                FilterPill::Unwatched => {
                    if let Some(p) = pos {
                        !p.completed && p.position_secs <= 5.0
                    } else {
                        true
                    }
                }
            }
        })
        .cloned()
        .collect();

    // Sorting without allocations
    filtered.sort_by(|a, b| match sort {
        SortOption::TitleAsc => a.title.cmp(&b.title),
        SortOption::TitleDesc => b.title.cmp(&a.title),
        SortOption::DurationDesc => b.duration.partial_cmp(&a.duration).unwrap_or(std::cmp::Ordering::Equal),
        SortOption::DateAddedDesc => b.created_at.cmp(&a.created_at),
        SortOption::YearDesc => {
            let ya = parse_year_from_title(&a.title);
            let yb = parse_year_from_title(&b.title);
            yb.cmp(&ya)
        }
        SortOption::YearAsc => {
            let ya = parse_year_from_title(&a.title);
            let yb = parse_year_from_title(&b.title);
            ya.cmp(&yb)
        }
    });

    filtered
}

/// Zero-clone index filter and sort for 50,000+ items.
/// Returns indices into `items`, avoiding cloning thousands of MediaItem structs.
pub fn filter_and_sort_movie_indices(
    items: &[MediaItem],
    positions: &HashMap<String, PlaybackPosition>,
    filter_pill: FilterPill,
    sort: SortOption,
    res: ResolutionFilter,
    hdr: HdrFilter,
    search_query: &str,
) -> Vec<usize> {
    let q = search_query.trim().to_lowercase();
    let mut indices: Vec<usize> = Vec::with_capacity(items.len());

    for (idx, item) in items.iter().enumerate() {
        if item.series_id.is_some() {
            continue;
        }
        if !q.is_empty() && !item.title.to_lowercase().contains(&q) {
            continue;
        }

        // Resolution filter
        if res != ResolutionFilter::All {
            let h = item.height.unwrap_or(0);
            match res {
                ResolutionFilter::Res4K if h < 2160 => continue,
                ResolutionFilter::Res1080p if !(1080..2160).contains(&h) => continue,
                ResolutionFilter::Res720p if !(720..1080).contains(&h) => continue,
                _ => {}
            }
        }

        // HDR filter
        if hdr == HdrFilter::HdrOnly && !item.is_hdr {
            continue;
        }
        if hdr == HdrFilter::SdrOnly && item.is_hdr {
            continue;
        }

        // Progress pill filter
        let pos = positions.get(&item.fingerprint);
        match filter_pill {
            FilterPill::All => {}
            FilterPill::InProgress => {
                let matches = if let Some(p) = pos {
                    !p.completed && p.position_secs > 5.0 && (p.position_secs / item.duration.max(1.0)) < 0.90
                } else {
                    false
                };
                if !matches {
                    continue;
                }
            }
            FilterPill::Unwatched => {
                let matches = if let Some(p) = pos {
                    !p.completed && p.position_secs <= 5.0
                } else {
                    true
                };
                if !matches {
                    continue;
                }
            }
        }

        indices.push(idx);
    }

    // Sort indices directly
    indices.sort_by(|&a, &b| match sort {
        SortOption::TitleAsc => items[a].title.cmp(&items[b].title),
        SortOption::TitleDesc => items[b].title.cmp(&items[a].title),
        SortOption::DurationDesc => items[b].duration.partial_cmp(&items[a].duration).unwrap_or(std::cmp::Ordering::Equal),
        SortOption::DateAddedDesc => items[b].created_at.cmp(&items[a].created_at),
        SortOption::YearDesc => {
            let ya = parse_year_from_title(&items[a].title);
            let yb = parse_year_from_title(&items[b].title);
            yb.cmp(&ya)
        }
        SortOption::YearAsc => {
            let ya = parse_year_from_title(&items[a].title);
            let yb = parse_year_from_title(&items[b].title);
            ya.cmp(&yb)
        }
    });

    indices
}

/// Groups items with series_id into SeriesSummary objects, applying filters.
pub fn group_and_filter_series(
    items: &[MediaItem],
    positions: &HashMap<String, PlaybackPosition>,
    filter_pill: FilterPill,
    sort: SortOption,
    res: ResolutionFilter,
    hdr: HdrFilter,
    search_query: &str,
) -> Vec<SeriesSummary> {
    let q = search_query.trim().to_lowercase();
    let mut map: HashMap<String, Vec<MediaItem>> = HashMap::new();

    for item in items {
        if let Some(ref sid) = item.series_id {
            map.entry(sid.clone()).or_default().push(item.clone());
        }
    }

    let mut summaries = Vec::new();
    for (sid, mut eps) in map {
        eps.sort_by_key(|e| (e.season_number.unwrap_or(1), e.episode_number.unwrap_or(1)));

        let title = eps.first().map(|e| clean_series_title(&e.title)).unwrap_or_else(|| sid.clone());
        if !q.is_empty() && !title.to_lowercase().contains(&q) {
            continue;
        }

        let mut seasons_set = std::collections::BTreeSet::new();
        let mut watched_count = 0;
        let mut has_hdr = false;
        let mut highest_h = 0;

        for e in &eps {
            if let Some(s) = e.season_number {
                seasons_set.insert(s);
            }
            if e.is_hdr {
                has_hdr = true;
            }
            if let Some(h) = e.height {
                if h > highest_h {
                    highest_h = h;
                }
            }
            if let Some(p) = positions.get(&e.fingerprint) {
                if p.completed || (p.position_secs / e.duration.max(1.0)) >= 0.85 {
                    watched_count += 1;
                }
            }
        }

        // Resolution filter
        if res != ResolutionFilter::All {
            match res {
                ResolutionFilter::Res4K if highest_h < 2160 => continue,
                ResolutionFilter::Res1080p if !(1080..2160).contains(&highest_h) => continue,
                ResolutionFilter::Res720p if !(720..1080).contains(&highest_h) => continue,
                _ => {}
            }
        }

        // HDR filter
        if hdr == HdrFilter::HdrOnly && !has_hdr {
            continue;
        }
        if hdr == HdrFilter::SdrOnly && has_hdr {
            continue;
        }

        let is_completed = watched_count == eps.len() && !eps.is_empty();
        let is_in_progress = watched_count > 0 && !is_completed;
        let is_unwatched = watched_count == 0;

        match filter_pill {
            FilterPill::All => {}
            FilterPill::InProgress => {
                if !is_in_progress {
                    continue;
                }
            }
            FilterPill::Unwatched => {
                if !is_unwatched {
                    continue;
                }
            }
        }

        let year = eps.first().and_then(|e| parse_year_from_title(&e.title));

        summaries.push(SeriesSummary {
            series_id: sid,
            title,
            season_count: seasons_set.len().max(1),
            episode_count: eps.len(),
            episodes: eps,
            watched_count,
            is_completed,
            year,
            is_hdr: has_hdr,
        });
    }

    summaries.sort_by(|a, b| match sort {
        SortOption::TitleAsc => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
        SortOption::TitleDesc => b.title.to_lowercase().cmp(&a.title.to_lowercase()),
        SortOption::YearDesc => b.year.cmp(&a.year),
        SortOption::YearAsc => a.year.cmp(&b.year),
        _ => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
    });

    summaries
}

/// Resolves the next episode to play for a series:
/// First episode that is in progress or unwatched, ordered by season and episode number.
pub fn resolve_next_episode_to_play(
    series: &SeriesSummary,
    positions: &HashMap<String, PlaybackPosition>,
) -> Option<MediaItem> {
    for ep in &series.episodes {
        if let Some(pos) = positions.get(&ep.fingerprint) {
            if !pos.completed && (pos.position_secs / ep.duration.max(1.0)) < 0.90 {
                return Some(ep.clone()); // In progress episode!
            }
        } else {
            return Some(ep.clone()); // Unwatched episode!
        }
    }
    series.episodes.first().cloned()
}

#[derive(Debug, Clone, PartialEq)]
pub struct HistoryDateGroup {
    pub date_label: String,
    pub aggregate_label: String,
    pub total_duration_secs: f64,
    pub sessions: Vec<WatchSession>,
}

/// Groups watch sessions into date groups (e.g. "Today 20 Nov 2026", "Yesterday", etc.)
/// and computes aggregate session count and watch duration.
pub fn group_watch_sessions(sessions: &[WatchSession]) -> Vec<HistoryDateGroup> {
    if sessions.is_empty() {
        return Vec::new();
    }

    let mut groups_map: Vec<(String, Vec<WatchSession>)> = Vec::new();
    let now = Local::now().date_naive();

    for session in sessions {
        let local_dt = session.start_time.with_timezone(&Local);
        let session_date = local_dt.date_naive();

        let label = if session_date == now {
            format!("Today {}", session_date.format("%d %b %Y"))
        } else if session_date == now.pred_opt().unwrap_or(now) {
            format!("Yesterday {}", session_date.format("%d %b %Y"))
        } else {
            session_date.format("%A, %d %b %Y").to_string()
        };

        if let Some(g) = groups_map.iter_mut().find(|(l, _)| l == &label) {
            g.1.push(session.clone());
        } else {
            groups_map.push((label, vec![session.clone()]));
        }
    }

    groups_map
        .into_iter()
        .map(|(date_label, sess_list)| {
            let total_dur: f64 = sess_list
                .iter()
                .map(|s| (s.end_pos_secs - s.start_pos_secs).abs().max(1.0))
                .sum();
            let count = sess_list.len();
            let aggregate_label = format!("{} · {} sessions", format_duration_short(total_dur), count);

            HistoryDateGroup {
                date_label,
                aggregate_label,
                total_duration_secs: total_dur,
                sessions: sess_list,
            }
        })
        .collect()
}

pub fn format_duration_short(secs: f64) -> String {
    let total = secs.round() as u64;
    let h = total / 3600;
    let m = (total % 3600) / 60;
    if h > 0 {
        format!("{}h {}m", h, m)
    } else {
        format!("{}m", m.max(1))
    }
}

fn parse_year_from_title(title: &str) -> Option<u32> {
    let chars: Vec<char> = title.chars().collect();
    for i in 0..chars.len().saturating_sub(3) {
        if chars[i].is_ascii_digit()
            && chars[i + 1].is_ascii_digit()
            && chars[i + 2].is_ascii_digit()
            && chars[i + 3].is_ascii_digit()
        {
            let s: String = chars[i..i + 4].iter().collect();
            if let Ok(y) = s.parse::<u32>() {
                if (1900..=2099).contains(&y) {
                    return Some(y);
                }
            }
        }
    }
    None
}

fn clean_series_title(title: &str) -> String {
    if let Some(idx) = title.find(" - S0") {
        return title[..idx].trim().to_string();
    }
    if let Some(idx) = title.find(".S0") {
        return title[..idx].replace('.', " ").trim().to_string();
    }
    if let Some(idx) = title.find(" S0") {
        return title[..idx].trim().to_string();
    }
    title.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    #[test]
    fn test_virtualization_grid_calculation() {
        // 50,000 items in a 5-column grid with 200px item height
        let total = 50_000;
        let cols = 5;
        let item_h = 200.0;
        let spacing = 16.0;
        let viewport_h = 800.0;

        // At scroll = 0
        let range_top = calculate_virtual_grid(total, cols, item_h, spacing, 0.0, viewport_h);
        assert_eq!(range_top.start_index, 0);
        assert!(range_top.end_index <= 50, "Should only allocate visible slice");
        assert_eq!(range_top.top_spacer_height, 0.0);
        assert!(range_top.bottom_spacer_height > 1_000_000.0);

        // At scroll = 10,000px down
        let range_mid = calculate_virtual_grid(total, cols, item_h, spacing, 10_000.0, viewport_h);
        assert!(range_mid.start_index > 0);
        assert!(range_mid.end_index > range_mid.start_index);
        assert!(range_mid.end_index - range_mid.start_index <= 50);
        assert!(range_mid.top_spacer_height > 0.0);
    }

    #[test]
    fn test_filter_and_sort_movies() {
        let now = Utc::now();
        let m1 = MediaItem {
            id: "1".into(),
            fingerprint: "fp1".into(),
            file_path: "/test/Alpha.2024.1080p.mkv".into(),
            title: "Alpha 2024".into(),
            duration: 7200.0,
            size_bytes: 1_000_000,
            width: Some(1920),
            height: Some(1080),
            is_hdr: false,
            video_codec: None,
            audio_codec: None,
            series_id: None,
            season_number: None,
            episode_number: None,
            is_missing: false,
            created_at: now,
            updated_at: now,
        };
        let m2 = MediaItem {
            id: "2".into(),
            fingerprint: "fp2".into(),
            file_path: "/test/Beta.2022.2160p.mkv".into(),
            title: "Beta 2022".into(),
            duration: 5400.0,
            size_bytes: 2_000_000,
            width: Some(3840),
            height: Some(2160),
            is_hdr: true,
            video_codec: None,
            audio_codec: None,
            series_id: None,
            season_number: None,
            episode_number: None,
            is_missing: false,
            created_at: now,
            updated_at: now,
        };

        let items = vec![m1.clone(), m2.clone()];
        let mut positions = HashMap::new();
        positions.insert(
            "fp1".into(),
            PlaybackPosition {
                fingerprint: "fp1".into(),
                position_secs: 1200.0,
                duration_secs: 7200.0,
                completed: false,
                updated_at: now,
            },
        );

        // Filter In Progress
        let in_prog = filter_and_sort_movies(
            &items,
            &positions,
            FilterPill::InProgress,
            SortOption::TitleAsc,
            ResolutionFilter::All,
            HdrFilter::All,
            "",
        );
        assert_eq!(in_prog.len(), 1);
        assert_eq!(in_prog[0].title, "Alpha 2024");

        // Filter 4K only
        let res_4k = filter_and_sort_movies(
            &items,
            &positions,
            FilterPill::All,
            SortOption::TitleAsc,
            ResolutionFilter::Res4K,
            HdrFilter::All,
            "",
        );
        assert_eq!(res_4k.len(), 1);
        assert_eq!(res_4k[0].title, "Beta 2022");
    }

    #[test]
    fn test_series_grouping_and_next_episode_resolution() {
        let now = Utc::now();
        let ep1 = MediaItem {
            id: "ep1".into(),
            fingerprint: "fp_ep1".into(),
            file_path: "/path/Show.S01E01.mkv".into(),
            title: "Show - S01E01 - Pilot".into(),
            duration: 3000.0,
            size_bytes: 500_000,
            width: Some(1920),
            height: Some(1080),
            is_hdr: false,
            video_codec: None,
            audio_codec: None,
            series_id: Some("series_show".into()),
            season_number: Some(1),
            episode_number: Some(1),
            is_missing: false,
            created_at: now,
            updated_at: now,
        };
        let ep2 = MediaItem {
            id: "ep2".into(),
            fingerprint: "fp_ep2".into(),
            file_path: "/path/Show.S01E02.mkv".into(),
            title: "Show - S01E02 - Second".into(),
            duration: 3000.0,
            size_bytes: 500_000,
            width: Some(1920),
            height: Some(1080),
            is_hdr: false,
            video_codec: None,
            audio_codec: None,
            series_id: Some("series_show".into()),
            season_number: Some(1),
            episode_number: Some(2),
            is_missing: false,
            created_at: now,
            updated_at: now,
        };

        let items = vec![ep1.clone(), ep2.clone()];
        let mut positions = HashMap::new();
        // Mark Episode 1 as completed
        positions.insert(
            "fp_ep1".into(),
            PlaybackPosition {
                fingerprint: "fp_ep1".into(),
                position_secs: 2950.0,
                duration_secs: 3000.0,
                completed: true,
                updated_at: now,
            },
        );

        let series_list = group_and_filter_series(
            &items,
            &positions,
            FilterPill::All,
            SortOption::TitleAsc,
            ResolutionFilter::All,
            HdrFilter::All,
            "",
        );
        assert_eq!(series_list.len(), 1);
        let s = &series_list[0];
        assert_eq!(s.episode_count, 2);
        assert_eq!(s.watched_count, 1);

        // Next episode to play MUST be Episode 2
        let next_ep = resolve_next_episode_to_play(s, &positions).expect("next ep");
        assert_eq!(next_ep.id, "ep2");
    }

    #[test]
    fn test_history_date_grouping() {
        let now = Utc::now();
        let sessions = vec![
            WatchSession {
                id: "s1".into(),
                fingerprint: "fp1".into(),
                collection_id: Some("coll1".into()),
                item_title: "Devs S1E4".into(),
                start_time: now,
                end_time: now + chrono::Duration::minutes(3),
                start_pos_secs: 0.0,
                end_pos_secs: 180.0,
                completed: false,
                stopped_early: true,
            },
            WatchSession {
                id: "s2".into(),
                fingerprint: "fp2".into(),
                collection_id: Some("coll1".into()),
                item_title: "Devs S1E3".into(),
                start_time: now - chrono::Duration::hours(1),
                end_time: now - chrono::Duration::minutes(17),
                start_pos_secs: 0.0,
                end_pos_secs: 2580.0,
                completed: false,
                stopped_early: true,
            },
        ];

        let groups = group_watch_sessions(&sessions);
        assert_eq!(groups.len(), 1);
        assert!(groups[0].date_label.starts_with("Today"));
        assert_eq!(groups[0].sessions.len(), 2);
        assert!(groups[0].aggregate_label.contains("2 sessions"));
    }
}
