use chrono::{Datelike, Local, NaiveDate, Utc};
use std::collections::{HashMap, HashSet};
use valor_core::models::{MediaItem, MetadataOverride, PlaybackPosition, WatchSession};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LibraryTab {
    Movies,
    Series,
    Videos,
    Playlists,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FilterPill {
    All,
    InProgress,
    Unwatched,
    Watched,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortOption {
    RecentlyAdded,
    TitleAsc,
    TitleDesc,
    YearDesc,
    YearAsc,
    DurationDesc,
    LastWatched,
    Progress,
    DateAddedDesc,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CodecFilter {
    All,
    H264,
    Hevc,
    Av1,
    Vp9,
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
pub struct MovieVersion {
    pub fingerprint: String,
    pub file_path: String,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub video_codec: Option<String>,
    pub size_bytes: u64,
    pub is_hdr: bool,
    pub duration: f64,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MovieCardViewModel {
    pub primary_fingerprint: String,
    pub primary_file_path: String,
    pub display_title: String,
    pub year: Option<u32>,
    pub duration_secs: f64,
    pub height: Option<u32>,
    pub is_hdr: bool,
    pub video_codec: Option<String>,
    pub is_new: bool,
    pub is_unidentified: bool,
    pub progress: Option<f32>,
    pub resume_pos_secs: Option<f64>,
    pub is_watched: bool,
    pub versions: Vec<MovieVersion>,
    pub created_at: chrono::DateTime<Utc>,
    pub last_watched_at: Option<chrono::DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct SeriesCardViewModel {
    pub series_key: String,
    pub title: String,
    pub year: Option<u32>,
    pub season_count: usize,
    pub episode_count: usize,
    pub watched_count: usize,
    pub is_completed: bool,
    pub is_new: bool,
    pub is_unidentified: bool,
    pub progress: f32, // watched_count / episode_count
    pub next_episode_text: Option<String>,
    pub next_episode_item: Option<MediaItem>,
    pub primary_fingerprint: String,
    pub primary_file_path: String,
    pub episodes: Vec<MediaItem>,
    pub created_at: chrono::DateTime<Utc>,
    pub last_watched_at: Option<chrono::DateTime<Utc>>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct EpisodeItemViewModel {
    pub item: Option<MediaItem>,
    pub season_number: u32,
    pub episode_number: u32,
    pub title: String,
    pub description: Option<String>,
    pub duration_secs: f64,
    pub is_watched: bool,
    pub in_progress_secs: Option<f64>,
    pub is_missing_gap: bool,
    pub is_missing_file: bool,
}

/// Detects low confidence titles, GUIDs, hashes, or only-symbol titles (e.g. "Ó ]" or "D90ddb61-0e83-414...").
pub fn is_unidentified_title(title: &str) -> bool {
    let t = title.trim();
    if t.is_empty() {
        return true;
    }
    // GUID pattern check (e.g. D90ddb61-0e83-414...)
    if t.len() >= 20 {
        let hex_and_hyphen = t.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
        if hex_and_hyphen && t.contains('-') {
            return true;
        }
        if hex_and_hyphen {
            return true;
        }
    }
    // Only symbols or garbled punctuation (<= 1 alphanumeric char)
    let alphanumeric_count = t.chars().filter(|c| c.is_alphanumeric()).count();
    alphanumeric_count <= 1
}

pub fn extract_stem_from_path(file_path: &str) -> String {
    let path = std::path::Path::new(file_path);
    path.file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| file_path.to_string())
}

pub fn normalize_series_key(title: &str, file_path: &str) -> String {
    let cleaned = clean_series_title(title).to_lowercase();
    let norm_title: String = cleaned
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect();
    let norm_title = norm_title.split_whitespace().collect::<Vec<_>>().join(" ");

    let parent = std::path::Path::new(file_path)
        .parent()
        .and_then(|p| p.file_name())
        .map(|f| f.to_string_lossy().to_string().to_lowercase())
        .unwrap_or_default();

    if !norm_title.is_empty() {
        norm_title
    } else if !parent.is_empty() {
        parent
    } else {
        "unknown_series".to_string()
    }
}

pub fn format_meta_line(year: Option<u32>, duration_secs: f64) -> String {
    let dur_str = if duration_secs > 0.0 {
        format_duration_short(duration_secs)
    } else {
        String::new()
    };
    match (year, !dur_str.is_empty()) {
        (Some(y), true) if y > 0 => format!("{} · {}", y, dur_str),
        (Some(y), false) if y > 0 => y.to_string(),
        (None, true) => dur_str,
        _ => String::new(),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MediaCategory {
    Movie,
    Series,
    OtherMedia,
}

pub fn contains_tv_pattern(text: &str) -> bool {
    let lower = text.to_lowercase();
    if lower.contains("season ") || lower.contains("specials") || lower.contains("episode ") || lower.contains("ep. ") || lower.contains("ep ") {
        return true;
    }
    let bytes = lower.as_bytes();
    let len = bytes.len();
    for i in 0..len {
        // s01e01 pattern
        if bytes[i] == b's' && i + 3 < len {
            let mut j = i + 1;
            while j < len && bytes[j].is_ascii_digit() {
                j += 1;
            }
            if j > i + 1 && j < len && bytes[j] == b'e' && j + 1 < len && bytes[j + 1].is_ascii_digit() {
                return true;
            }
        }
        // 1x02 pattern
        if bytes[i] == b'x' && i > 0 && i + 1 < len && bytes[i - 1].is_ascii_digit() && bytes[i + 1].is_ascii_digit() {
            return true;
        }
    }
    false
}

pub fn classify_media_item(item: &MediaItem) -> MediaCategory {
    // 1. Explicit Series metadata or TV filename patterns
    if item.series_id.is_some() || item.season_number.is_some() || item.episode_number.is_some() {
        return MediaCategory::Series;
    }
    let lower_path = item.file_path.to_lowercase();
    let file_name = std::path::Path::new(&item.file_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(&item.title)
        .to_lowercase();

    if contains_tv_pattern(&file_name) || contains_tv_pattern(&lower_path) {
        return MediaCategory::Series;
    }

    // 2. Movie check (at least 100 MB, release tags, release year, or long duration)
    if item.size_bytes < 100 * 1024 * 1024 {
        return MediaCategory::OtherMedia;
    }

    let has_year = parse_year_from_title(&item.title).is_some() || parse_year_from_title(&file_name).is_some();
    let has_quality_tags = file_name.contains("1080p")
        || file_name.contains("720p")
        || file_name.contains("2160p")
        || file_name.contains("4k")
        || file_name.contains("bluray")
        || file_name.contains("bdrip")
        || file_name.contains("brrip")
        || file_name.contains("web-dl")
        || file_name.contains("webrip")
        || file_name.contains("remux")
        || file_name.contains("dvdrip");
    let is_in_movie_folder = lower_path.contains("movie") || lower_path.contains("film");

    let is_generic_recording = file_name.starts_with("vid_")
        || file_name.starts_with("rec_")
        || file_name.starts_with("dsc_")
        || file_name.starts_with("img_")
        || file_name.starts_with("screen recording")
        || file_name.starts_with("zoom_")
        || file_name.starts_with("clip")
        || file_name.starts_with("untitled");

    if !is_generic_recording && (has_year || has_quality_tags || is_in_movie_folder || (item.size_bytes >= 250 * 1024 * 1024 && item.duration >= 2400.0)) {
        return MediaCategory::Movie;
    }

    MediaCategory::OtherMedia
}

pub fn build_movie_card_view_models_from_items(
    items: &[MediaItem],
    positions: &HashMap<String, PlaybackPosition>,
    overrides: &HashMap<String, MetadataOverride>,
) -> Vec<MovieCardViewModel> {
    // 1. Dedupe by fingerprint first
    let mut unique_items: Vec<MediaItem> = Vec::new();
    let mut seen_fingerprints = HashSet::new();
    for it in items {
        if seen_fingerprints.insert(it.fingerprint.clone()) {
            unique_items.push(it.clone());
        }
    }

    // 2. Group distinct files with the same parsed title+year
    let mut groups: HashMap<(String, Option<u32>), Vec<MediaItem>> = HashMap::new();

    for it in unique_items {
        let (display_title, is_unidentified, year) =
            if let Some(ov) = overrides.get(&it.fingerprint) {
                let t = ov
                    .title
                    .as_ref()
                    .cloned()
                    .unwrap_or_else(|| it.title.clone());
                let y = ov.year.or_else(|| parse_year_from_title(&it.title));
                (t, false, y)
            } else if is_unidentified_title(&it.title) {
                let stem = extract_stem_from_path(&it.file_path);
                (stem, true, parse_year_from_title(&it.title))
            } else {
                (it.title.clone(), false, parse_year_from_title(&it.title))
            };

        let lower_t = display_title.to_lowercase().trim().to_string();
        let is_generic = lower_t.is_empty()
            || lower_t == "video"
            || lower_t == "movie"
            || lower_t == "film"
            || lower_t == "track"
            || lower_t == "episode"
            || lower_t == "untitled";

        let key = if is_unidentified || is_generic || year.is_none() {
            (it.fingerprint.clone(), year)
        } else {
            (lower_t, year)
        };
        groups.entry(key).or_default().push(it);
    }

    let mut result = Vec::new();
    let now = Utc::now();

    for (_key, mut version_items) in groups {
        // Sort versions: highest resolution first, then size
        version_items.sort_by(|a, b| {
            let ha = a.height.unwrap_or(0);
            let hb = b.height.unwrap_or(0);
            hb.cmp(&ha)
                .then_with(|| b.size_bytes.cmp(&a.size_bytes))
                .then_with(|| a.file_path.cmp(&b.file_path))
                .then_with(|| a.fingerprint.cmp(&b.fingerprint))
        });

        let primary = version_items[0].clone();
        let (mut display_title, is_unidentified, year) =
            if let Some(ov) = overrides.get(&primary.fingerprint) {
                let t = ov
                    .title
                    .as_ref()
                    .cloned()
                    .unwrap_or_else(|| primary.title.clone());
                let y = ov.year.or_else(|| parse_year_from_title(&primary.title));
                (t, false, y)
            } else if is_unidentified_title(&primary.title) {
                let stem = extract_stem_from_path(&primary.file_path);
                (stem, true, parse_year_from_title(&primary.title))
            } else {
                (
                    primary.title.clone(),
                    false,
                    parse_year_from_title(&primary.title),
                )
            };

        if let (Some(s), Some(e)) = (primary.season_number, primary.episode_number) {
            let ep_tag = format!("S{:02}", s);
            if !display_title.contains(&ep_tag) {
                display_title = format!("{} S{:02}E{:02}", display_title, s, e);
            }
        }

        // Determine playback status across any of the versions (pick best progress)
        let mut best_pos: Option<&PlaybackPosition> = None;
        for v in &version_items {
            if let Some(pos) = positions.get(&v.fingerprint) {
                if best_pos.is_none() || pos.updated_at > best_pos.unwrap().updated_at {
                    best_pos = Some(pos);
                }
            }
        }

        let is_watched = best_pos
            .map(|p| p.completed || (p.position_secs / primary.duration.max(1.0)) >= 0.90)
            .unwrap_or(false);
        let progress = best_pos.and_then(|p| {
            let r = (p.position_secs / primary.duration.max(1.0)) as f32;
            if !p.completed && r > 0.01 && r < 0.90 {
                Some(r)
            } else {
                None
            }
        });
        let resume_pos_secs = best_pos.and_then(|p| {
            if !p.completed
                && p.position_secs > 5.0
                && (p.position_secs / primary.duration.max(1.0)) < 0.90
            {
                Some(p.position_secs)
            } else {
                None
            }
        });

        let has_been_played = best_pos.is_some();
        let is_new = !has_been_played && (now - primary.created_at).num_days() <= 7;

        let versions: Vec<MovieVersion> = version_items
            .into_iter()
            .map(|v| MovieVersion {
                fingerprint: v.fingerprint,
                file_path: v.file_path,
                width: v.width,
                height: v.height,
                video_codec: v.video_codec,
                size_bytes: v.size_bytes,
                is_hdr: v.is_hdr,
                duration: v.duration,
            })
            .collect();

        result.push(MovieCardViewModel {
            primary_fingerprint: primary.fingerprint,
            primary_file_path: primary.file_path,
            display_title,
            year,
            duration_secs: primary.duration,
            height: primary.height,
            is_hdr: primary.is_hdr,
            video_codec: primary.video_codec,
            is_new,
            is_unidentified,
            progress,
            resume_pos_secs,
            is_watched,
            versions,
            created_at: primary.created_at,
            last_watched_at: best_pos.map(|p| p.updated_at),
        });
    }

    // Deterministically sort to prevent items from shifting/shuffling between frames
    result.sort_by(|a, b| {
        a.display_title
            .to_lowercase()
            .cmp(&b.display_title.to_lowercase())
            .then_with(|| a.primary_fingerprint.cmp(&b.primary_fingerprint))
    });

    result
}

/// Builds deduplicated MovieCardViewModels specifically for genuine Movies (at least 100MB)
pub fn build_movie_card_view_models(
    items: &[MediaItem],
    positions: &HashMap<String, PlaybackPosition>,
    overrides: &HashMap<String, MetadataOverride>,
) -> Vec<MovieCardViewModel> {
    let movie_items: Vec<MediaItem> = items
        .iter()
        .filter(|it| it.size_bytes >= 100 * 1024 * 1024 && classify_media_item(it) == MediaCategory::Movie)
        .cloned()
        .collect();
    build_movie_card_view_models_from_items(&movie_items, positions, overrides)
}

/// Builds deduplicated MovieCardViewModels for Other Media / Videos (at least 100MB, not movie / not series)
pub fn build_other_media_card_view_models(
    items: &[MediaItem],
    positions: &HashMap<String, PlaybackPosition>,
    overrides: &HashMap<String, MetadataOverride>,
) -> Vec<MovieCardViewModel> {
    let other_items: Vec<MediaItem> = items
        .iter()
        .filter(|it| it.size_bytes >= 100 * 1024 * 1024 && classify_media_item(it) == MediaCategory::OtherMedia)
        .cloned()
        .collect();
    build_movie_card_view_models_from_items(&other_items, positions, overrides)
}

/// Builds deduplicated SeriesCardViewModels from raw items, grouping by normalized series key.
pub fn build_series_card_view_models(
    items: &[MediaItem],
    positions: &HashMap<String, PlaybackPosition>,
    overrides: &HashMap<String, MetadataOverride>,
) -> Vec<SeriesCardViewModel> {
    // 1. Dedupe episodes by fingerprint (classified as Series; skip tiny <1MB samples unless explicitly tagged)
    let mut unique_eps: Vec<MediaItem> = Vec::new();
    let mut seen = HashSet::new();
    for it in items {
        if classify_media_item(it) != MediaCategory::Series {
            continue;
        }
        if it.size_bytes > 0 && it.size_bytes < 1024 * 1024 && it.season_number.is_none() {
            continue;
        }
        if seen.insert(it.fingerprint.clone()) {
            unique_eps.push(it.clone());
        }
    }

    // 2. Group by normalized series key
    let mut groups: HashMap<String, Vec<MediaItem>> = HashMap::new();
    for it in unique_eps {
        let key = if let Some(ov) = overrides.get(&it.fingerprint) {
            if let Some(ref s_title) = ov.series_title {
                s_title.to_lowercase().trim().to_string()
            } else {
                normalize_series_key(&it.title, &it.file_path)
            }
        } else {
            normalize_series_key(&it.title, &it.file_path)
        };
        groups.entry(key).or_default().push(it);
    }

    let mut result = Vec::new();
    let now = Utc::now();

    for (series_key, mut eps) in groups {
        eps.sort_by(|a, b| {
            (a.season_number.unwrap_or(1), a.episode_number.unwrap_or(1))
                .cmp(&(b.season_number.unwrap_or(1), b.episode_number.unwrap_or(1)))
                .then_with(|| a.file_path.cmp(&b.file_path))
        });

        let first = eps[0].clone();
        let title = if let Some(ov) = overrides.get(&first.fingerprint) {
            ov.series_title
                .clone()
                .unwrap_or_else(|| clean_series_title(&first.title))
        } else {
            clean_series_title(&first.title)
        };

        let is_unid = is_unidentified_title(&title);
        let year = parse_year_from_title(&first.title);

        let mut seasons_set = HashSet::new();
        let mut watched_count = 0;
        let mut latest_watched_at: Option<chrono::DateTime<Utc>> = None;

        for e in &eps {
            if let Some(s) = e.season_number {
                seasons_set.insert(s);
            }
            if let Some(p) = positions.get(&e.fingerprint) {
                if latest_watched_at.is_none() || p.updated_at > latest_watched_at.unwrap() {
                    latest_watched_at = Some(p.updated_at);
                }
                if p.completed || (p.position_secs / e.duration.max(1.0)) >= 0.85 {
                    watched_count += 1;
                }
            }
        }

        let is_completed = watched_count == eps.len() && !eps.is_empty();
        let progress = watched_count as f32 / eps.len().max(1) as f32;

        // Resolve next episode to play: "Resume S01E02" or "Next: S01E01"
        let mut next_ep_item = None;
        let mut next_ep_text = None;

        if !is_completed {
            for ep in &eps {
                let s_num = ep.season_number.unwrap_or(1);
                let e_num = ep.episode_number.unwrap_or(1);
                if let Some(pos) = positions.get(&ep.fingerprint) {
                    if !pos.completed
                        && (pos.position_secs / ep.duration.max(1.0)) < 0.90
                        && pos.position_secs > 5.0
                    {
                        next_ep_text = Some(format!("Resume S{:02}E{:02}", s_num, e_num));
                        next_ep_item = Some(ep.clone());
                        break;
                    }
                } else {
                    next_ep_text = Some(format!("Next: S{:02}E{:02}", s_num, e_num));
                    next_ep_item = Some(ep.clone());
                    break;
                }
            }
            if next_ep_text.is_none() && !eps.is_empty() {
                let first_ep = &eps[0];
                next_ep_text = Some(format!(
                    "Next: S{:02}E{:02}",
                    first_ep.season_number.unwrap_or(1),
                    first_ep.episode_number.unwrap_or(1)
                ));
                next_ep_item = Some(first_ep.clone());
            }
        }

        let is_new = watched_count == 0 && (now - first.created_at).num_days() <= 7;

        result.push(SeriesCardViewModel {
            series_key,
            title,
            year,
            season_count: seasons_set.len().max(1),
            episode_count: eps.len(),
            watched_count,
            is_completed,
            is_new,
            is_unidentified: is_unid,
            progress,
            next_episode_text: next_ep_text,
            next_episode_item: next_ep_item,
            primary_fingerprint: first.fingerprint,
            primary_file_path: first.file_path,
            episodes: eps,
            created_at: first.created_at,
            last_watched_at: latest_watched_at,
        });
    }

    // Deterministically sort to prevent series cards from shifting between frames
    result.sort_by(|a, b| {
        a.title
            .to_lowercase()
            .cmp(&b.title.to_lowercase())
            .then_with(|| a.series_key.cmp(&b.series_key))
    });

    result
}

/// Builds the full episode list for a season including missing episode number gaps
/// and missing files on disk.
pub fn build_series_episodes_with_gaps(
    season_episodes: &[MediaItem],
    season_number: u32,
    positions: &HashMap<String, PlaybackPosition>,
) -> Vec<EpisodeItemViewModel> {
    if season_episodes.is_empty() {
        return Vec::new();
    }

    let mut map: HashMap<u32, MediaItem> = HashMap::new();
    let mut max_ep = 1;
    for ep in season_episodes {
        let n = ep.episode_number.unwrap_or(1);
        if n > max_ep {
            max_ep = n;
        }
        map.insert(n, ep.clone());
    }

    let mut result = Vec::new();
    for ep_num in 1..=max_ep {
        if let Some(item) = map.get(&ep_num) {
            let is_missing_file = item.is_missing;
            let (is_watched, in_progress_secs) = if let Some(p) = positions.get(&item.fingerprint) {
                let watched = p.completed || (p.position_secs / item.duration.max(1.0)) >= 0.85;
                let in_prog = if !watched && p.position_secs > 5.0 {
                    Some(p.position_secs)
                } else {
                    None
                };
                (watched, in_prog)
            } else {
                (false, None)
            };

            result.push(EpisodeItemViewModel {
                item: Some(item.clone()),
                season_number,
                episode_number: ep_num,
                title: item.title.clone(),
                description: None,
                duration_secs: item.duration,
                is_watched,
                in_progress_secs,
                is_missing_gap: false,
                is_missing_file,
            });
        } else {
            // Gap placeholder row: "E05 missing"
            result.push(EpisodeItemViewModel {
                item: None,
                season_number,
                episode_number: ep_num,
                title: format!("E{:02} missing", ep_num),
                description: None,
                duration_secs: 0.0,
                is_watched: false,
                in_progress_secs: None,
                is_missing_gap: true,
                is_missing_file: false,
            });
        }
    }

    result
}

#[allow(clippy::too_many_arguments)]
pub fn filter_and_sort_movie_cards(
    mut cards: Vec<MovieCardViewModel>,
    filter_pill: FilterPill,
    sort: SortOption,
    res: ResolutionFilter,
    hdr: HdrFilter,
    codec: CodecFilter,
    year_range: (Option<u32>, Option<u32>),
    search_query: &str,
) -> Vec<MovieCardViewModel> {
    let q = search_query.trim().to_lowercase();

    cards.retain(|c| {
        // Search query
        if !q.is_empty() && !c.display_title.to_lowercase().contains(&q) {
            return false;
        }

        // Year range
        if let Some(min_y) = year_range.0 {
            if c.year.unwrap_or(0) < min_y {
                return false;
            }
        }
        if let Some(max_y) = year_range.1 {
            if c.year.unwrap_or(u32::MAX) > max_y {
                return false;
            }
        }

        // Resolution filter
        if res != ResolutionFilter::All {
            let h = c.height.unwrap_or(0);
            match res {
                ResolutionFilter::Res4K if h < 2160 => return false,
                ResolutionFilter::Res1080p if !(1080..2160).contains(&h) => return false,
                ResolutionFilter::Res720p if !(720..1080).contains(&h) => return false,
                _ => {}
            }
        }

        // HDR filter
        if hdr == HdrFilter::HdrOnly && !c.is_hdr {
            return false;
        }
        if hdr == HdrFilter::SdrOnly && c.is_hdr {
            return false;
        }

        // Codec filter
        if codec != CodecFilter::All {
            let codec_str = c.video_codec.as_deref().unwrap_or("").to_lowercase();
            match codec {
                CodecFilter::H264 if !codec_str.contains("264") && !codec_str.contains("avc") => {
                    return false
                }
                CodecFilter::Hevc if !codec_str.contains("265") && !codec_str.contains("hevc") => {
                    return false
                }
                CodecFilter::Av1 if !codec_str.contains("av1") => return false,
                CodecFilter::Vp9 if !codec_str.contains("vp9") => return false,
                _ => {}
            }
        }

        // Filter pill
        match filter_pill {
            FilterPill::All => true,
            FilterPill::InProgress => c.progress.is_some() && !c.is_watched,
            FilterPill::Unwatched => !c.is_watched && c.progress.is_none(),
            FilterPill::Watched => c.is_watched,
        }
    });

    cards.sort_by(|a, b| match sort {
        SortOption::RecentlyAdded | SortOption::DateAddedDesc => b.created_at.cmp(&a.created_at),
        SortOption::TitleAsc => a
            .display_title
            .to_lowercase()
            .cmp(&b.display_title.to_lowercase()),
        SortOption::TitleDesc => b
            .display_title
            .to_lowercase()
            .cmp(&a.display_title.to_lowercase()),
        SortOption::YearDesc => b.year.cmp(&a.year),
        SortOption::YearAsc => a.year.cmp(&b.year),
        SortOption::DurationDesc => b
            .duration_secs
            .partial_cmp(&a.duration_secs)
            .unwrap_or(std::cmp::Ordering::Equal),
        SortOption::LastWatched => b.last_watched_at.cmp(&a.last_watched_at),
        SortOption::Progress => {
            let pa = a.progress.unwrap_or(0.0);
            let pb = b.progress.unwrap_or(0.0);
            pb.partial_cmp(&pa).unwrap_or(std::cmp::Ordering::Equal)
        }
    });

    cards
}

pub fn filter_and_sort_series_cards(
    mut cards: Vec<SeriesCardViewModel>,
    filter_pill: FilterPill,
    sort: SortOption,
    res: ResolutionFilter,
    hdr: HdrFilter,
    year_range: (Option<u32>, Option<u32>),
    search_query: &str,
) -> Vec<SeriesCardViewModel> {
    let q = search_query.trim().to_lowercase();

    cards.retain(|c| {
        if !q.is_empty() && !c.title.to_lowercase().contains(&q) {
            return false;
        }

        if let Some(min_y) = year_range.0 {
            if c.year.unwrap_or(0) < min_y {
                return false;
            }
        }
        if let Some(max_y) = year_range.1 {
            if c.year.unwrap_or(u32::MAX) > max_y {
                return false;
            }
        }

        // Resolution: check max height of episodes
        if res != ResolutionFilter::All {
            let max_h = c
                .episodes
                .iter()
                .filter_map(|e| e.height)
                .max()
                .unwrap_or(0);
            match res {
                ResolutionFilter::Res4K if max_h < 2160 => return false,
                ResolutionFilter::Res1080p if !(1080..2160).contains(&max_h) => return false,
                ResolutionFilter::Res720p if !(720..1080).contains(&max_h) => return false,
                _ => {}
            }
        }

        // HDR
        if hdr == HdrFilter::HdrOnly && !c.episodes.iter().any(|e| e.is_hdr) {
            return false;
        }
        if hdr == HdrFilter::SdrOnly && c.episodes.iter().any(|e| e.is_hdr) {
            return false;
        }

        // Filter pill
        match filter_pill {
            FilterPill::All => true,
            FilterPill::InProgress => c.watched_count > 0 && !c.is_completed,
            FilterPill::Unwatched => c.watched_count == 0,
            FilterPill::Watched => c.is_completed,
        }
    });

    cards.sort_by(|a, b| match sort {
        SortOption::RecentlyAdded | SortOption::DateAddedDesc => b.created_at.cmp(&a.created_at),
        SortOption::TitleAsc => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
        SortOption::TitleDesc => b.title.to_lowercase().cmp(&a.title.to_lowercase()),
        SortOption::YearDesc => b.year.cmp(&a.year),
        SortOption::YearAsc => a.year.cmp(&b.year),
        SortOption::DurationDesc => b.episode_count.cmp(&a.episode_count),
        SortOption::LastWatched => b.last_watched_at.cmp(&a.last_watched_at),
        SortOption::Progress => b
            .progress
            .partial_cmp(&a.progress)
            .unwrap_or(std::cmp::Ordering::Equal),
    });

    cards
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

    let total_rows = total_items.div_ceil(cols);
    let row_height_total = item_height + row_spacing;

    let overscan_rows = 2; // Render 2 buffer rows above and below viewport
    let first_visible_row =
        ((scroll_y / row_height_total).floor() as isize - overscan_rows as isize).max(0) as usize;
    let visible_rows_count =
        ((viewport_height / row_height_total).ceil() as usize) + (overscan_rows * 2);
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
    calculate_virtual_grid(
        total_items,
        1,
        item_height,
        row_spacing,
        scroll_y,
        viewport_height,
    )
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
                        !p.completed
                            && p.position_secs > 5.0
                            && (p.position_secs / item.duration.max(1.0)) < 0.90
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
                FilterPill::Watched => {
                    if let Some(p) = pos {
                        p.completed || (p.position_secs / item.duration.max(1.0)) >= 0.90
                    } else {
                        false
                    }
                }
            }
        })
        .cloned()
        .collect();

    // Sorting without allocations
    filtered.sort_by(|a, b| match sort {
        SortOption::RecentlyAdded | SortOption::DateAddedDesc => b.created_at.cmp(&a.created_at),
        SortOption::TitleAsc => a.title.cmp(&b.title),
        SortOption::TitleDesc => b.title.cmp(&a.title),
        SortOption::DurationDesc => b
            .duration
            .partial_cmp(&a.duration)
            .unwrap_or(std::cmp::Ordering::Equal),
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
        SortOption::LastWatched => {
            let pa = positions.get(&a.fingerprint).map(|p| p.updated_at);
            let pb = positions.get(&b.fingerprint).map(|p| p.updated_at);
            pb.cmp(&pa)
        }
        SortOption::Progress => {
            let ra = positions
                .get(&a.fingerprint)
                .map(|p| p.position_secs / a.duration.max(1.0))
                .unwrap_or(0.0);
            let rb = positions
                .get(&b.fingerprint)
                .map(|p| p.position_secs / b.duration.max(1.0))
                .unwrap_or(0.0);
            rb.partial_cmp(&ra).unwrap_or(std::cmp::Ordering::Equal)
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
                    !p.completed
                        && p.position_secs > 5.0
                        && (p.position_secs / item.duration.max(1.0)) < 0.90
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
            FilterPill::Watched => {
                let matches = if let Some(p) = pos {
                    p.completed || (p.position_secs / item.duration.max(1.0)) >= 0.90
                } else {
                    false
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
        SortOption::RecentlyAdded | SortOption::DateAddedDesc => {
            items[b].created_at.cmp(&items[a].created_at)
        }
        SortOption::TitleAsc => items[a].title.cmp(&items[b].title),
        SortOption::TitleDesc => items[b].title.cmp(&items[a].title),
        SortOption::DurationDesc => items[b]
            .duration
            .partial_cmp(&items[a].duration)
            .unwrap_or(std::cmp::Ordering::Equal),
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
        SortOption::LastWatched => {
            let pa = positions.get(&items[a].fingerprint).map(|p| p.updated_at);
            let pb = positions.get(&items[b].fingerprint).map(|p| p.updated_at);
            pb.cmp(&pa)
        }
        SortOption::Progress => {
            let ra = positions
                .get(&items[a].fingerprint)
                .map(|p| p.position_secs / items[a].duration.max(1.0))
                .unwrap_or(0.0);
            let rb = positions
                .get(&items[b].fingerprint)
                .map(|p| p.position_secs / items[b].duration.max(1.0))
                .unwrap_or(0.0);
            rb.partial_cmp(&ra).unwrap_or(std::cmp::Ordering::Equal)
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
        eps.sort_by(|a, b| {
            (a.season_number.unwrap_or(1), a.episode_number.unwrap_or(1))
                .cmp(&(b.season_number.unwrap_or(1), b.episode_number.unwrap_or(1)))
                .then_with(|| a.file_path.cmp(&b.file_path))
        });

        let title = eps
            .first()
            .map(|e| clean_series_title(&e.title))
            .unwrap_or_else(|| sid.clone());
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
            FilterPill::Watched => {
                if !is_completed {
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
        SortOption::RecentlyAdded | SortOption::DateAddedDesc => b
            .episodes
            .first()
            .map(|e| e.created_at)
            .cmp(&a.episodes.first().map(|e| e.created_at)),
        SortOption::TitleAsc => a.title.to_lowercase().cmp(&b.title.to_lowercase()),
        SortOption::TitleDesc => b.title.to_lowercase().cmp(&a.title.to_lowercase()),
        SortOption::YearDesc => b.year.cmp(&a.year),
        SortOption::YearAsc => a.year.cmp(&b.year),
        SortOption::DurationDesc => b.episode_count.cmp(&a.episode_count),
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

/// Groups watch sessions into date groups (e.g. "Today 21 Nov 2026", "Yesterday 20 Nov 2026", "DD Mon YYYY")
/// and computes aggregate session count and watch duration.
/// Merges sessions from the same local day (regression test for duplicate groups).
pub fn group_watch_sessions(sessions: &[WatchSession]) -> Vec<HistoryDateGroup> {
    group_watch_sessions_with_clock(sessions, Local::now())
}

/// Injected-clock variant for deterministic testing across DST, leap years, and day boundaries.
pub fn group_watch_sessions_with_clock(
    sessions: &[WatchSession],
    now_local: chrono::DateTime<Local>,
) -> Vec<HistoryDateGroup> {
    if sessions.is_empty() {
        return Vec::new();
    }

    // Sort sessions descending by start_time first
    let mut sorted_sessions = sessions.to_vec();
    sorted_sessions.sort_by_key(|session| std::cmp::Reverse(session.start_time));

    // Group strictly by local calendar date (NaiveDate) to guarantee no duplicate groups
    let mut groups_by_date: Vec<(NaiveDate, Vec<WatchSession>)> = Vec::new();
    let today = now_local.date_naive();
    let yesterday = today.pred_opt().unwrap_or(today);

    for session in sorted_sessions {
        let local_dt = session.start_time.with_timezone(&Local);
        let session_date = local_dt.date_naive();

        if let Some((_, list)) = groups_by_date.iter_mut().find(|(d, _)| *d == session_date) {
            list.push(session);
        } else {
            groups_by_date.push((session_date, vec![session]));
        }
    }

    groups_by_date
        .into_iter()
        .map(|(session_date, sess_list)| {
            let date_label = if session_date == today {
                format!("Today {}", session_date.format("%d %b %Y"))
            } else if session_date == yesterday {
                format!("Yesterday {}", session_date.format("%d %b %Y"))
            } else {
                session_date.format("%d %b %Y").to_string()
            };

            let total_dur: f64 = sess_list
                .iter()
                .map(|s| (s.end_pos_secs - s.start_pos_secs).abs().max(1.0))
                .sum();
            let count = sess_list.len();
            let aggregate_label = format!(
                "{} · {} sessions",
                format_duration_compact(total_dur),
                count
            );

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
    format_duration_compact(secs)
}

pub fn format_duration_clean(secs: f64) -> String {
    format_duration_compact(secs)
}

/// Compact duration formatter matching exact spec:
/// 45s, 1m, 59m, 1h 6m, 2h 19m, etc.
pub fn format_duration_compact(secs: f64) -> String {
    let total = secs.round().max(0.0) as u64;
    let h = total / 3600;
    let m = (total % 3600) / 60;
    let s = total % 60;

    if h > 0 {
        format!("{}h {}m", h, m)
    } else if m > 0 {
        format!("{}m", m)
    } else {
        format!("{}s", s)
    }
}

/// Formats the session watched label:
/// e.g. "1m / 1h 6m watched", "3m watched", "45s watched"
pub fn format_session_watched_label(watched_secs: f64, runtime_secs: Option<f64>) -> String {
    let watched_str = format_duration_compact(watched_secs);
    match runtime_secs {
        Some(rt) if rt > 0.0 => {
            format!("{} / {} watched", watched_str, format_duration_compact(rt))
        }
        _ => format!("{} watched", watched_str),
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HistoryFilterPill {
    All,
    Local,
    Remote,
    Online,
    StoppedEarly,
    Finished,
    NeedsTraktSync,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HistoryUndoState {
    pub removed_session: WatchSession,
    pub original_index: usize,
    pub timestamp: std::time::Instant,
}

pub fn remove_session_with_undo(
    sessions: &mut Vec<WatchSession>,
    id: &str,
) -> Option<HistoryUndoState> {
    if let Some(pos) = sessions.iter().position(|s| s.id == id) {
        let removed = sessions.remove(pos);
        Some(HistoryUndoState {
            removed_session: removed,
            original_index: pos,
            timestamp: std::time::Instant::now(),
        })
    } else {
        None
    }
}

pub fn restore_session_with_undo(sessions: &mut Vec<WatchSession>, undo_state: HistoryUndoState) {
    let idx = undo_state.original_index.min(sessions.len());
    sessions.insert(idx, undo_state.removed_session);
}

pub const HEATMAP_INTENSITY_THRESHOLDS_SECS: [f64; 4] = [0.0, 900.0, 2700.0, 5400.0];

pub fn calculate_heatmap_intensity(duration_secs: f64) -> u8 {
    if duration_secs <= 0.0 {
        0
    } else if duration_secs <= HEATMAP_INTENSITY_THRESHOLDS_SECS[1] {
        1
    } else if duration_secs <= HEATMAP_INTENSITY_THRESHOLDS_SECS[2] {
        2
    } else if duration_secs <= HEATMAP_INTENSITY_THRESHOLDS_SECS[3] {
        3
    } else {
        4
    }
}

pub fn month_short_name(m: u32) -> &'static str {
    match m {
        1 => "Jan",
        2 => "Feb",
        3 => "Mar",
        4 => "Apr",
        5 => "May",
        6 => "Jun",
        7 => "Jul",
        8 => "Aug",
        9 => "Sept",
        10 => "Oct",
        11 => "Nov",
        12 => "Dec",
        _ => "",
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct HeatmapDay {
    pub date: NaiveDate,
    pub session_count: usize,
    pub total_duration_secs: f64,
    pub intensity: u8,
    pub col_index: usize,
    pub row_index: usize, // 0 = Sun .. 6 = Sat
}

#[derive(Debug, Clone, PartialEq)]
pub struct HeatmapMonthLabel {
    pub col_index: usize,
    pub name: &'static str,
}

#[derive(Debug, Clone, PartialEq)]
pub struct HeatmapLayout {
    pub days: Vec<HeatmapDay>,
    pub month_labels: Vec<HeatmapMonthLabel>,
    pub total_sessions_365: usize,
    pub total_weeks: usize,
}

pub fn calculate_heatmap_layout(
    daily_aggregates: &[(NaiveDate, usize, f64)],
    end_date: NaiveDate,
) -> HeatmapLayout {
    let agg_map: HashMap<NaiveDate, (usize, f64)> = daily_aggregates
        .iter()
        .map(|&(d, count, dur)| (d, (count, dur)))
        .collect();

    let start_date = end_date - chrono::Duration::days(364);
    let first_sunday =
        start_date - chrono::Duration::days(start_date.weekday().num_days_from_sunday() as i64);

    let mut days = Vec::with_capacity(365);
    let mut month_labels = Vec::new();
    let mut total_sessions_365 = 0;
    let mut max_col = 0;
    let mut last_month = None;

    let mut curr_date = start_date;
    while curr_date <= end_date {
        let (count, dur) = agg_map.get(&curr_date).cloned().unwrap_or((0, 0.0));
        total_sessions_365 += count;

        let col_index = (curr_date.signed_duration_since(first_sunday).num_days() / 7) as usize;
        let row_index = curr_date.weekday().num_days_from_sunday() as usize;
        if col_index > max_col {
            max_col = col_index;
        }

        if last_month != Some(curr_date.month()) {
            last_month = Some(curr_date.month());
            if month_labels.is_empty()
                || col_index
                    > month_labels
                        .last()
                        .map(|m: &HeatmapMonthLabel| m.col_index)
                        .unwrap_or(0)
                        + 1
            {
                month_labels.push(HeatmapMonthLabel {
                    col_index,
                    name: month_short_name(curr_date.month()),
                });
            }
        }

        let intensity = calculate_heatmap_intensity(dur);
        days.push(HeatmapDay {
            date: curr_date,
            session_count: count,
            total_duration_secs: dur,
            intensity,
            col_index,
            row_index,
        });

        match curr_date.succ_opt() {
            Some(next) => curr_date = next,
            None => break,
        }
    }

    HeatmapLayout {
        days,
        month_labels,
        total_sessions_365,
        total_weeks: max_col + 1,
    }
}

pub fn filter_watch_sessions(
    sessions: &[WatchSession],
    pill: HistoryFilterPill,
    search: &str,
    day_filter: Option<NaiveDate>,
    trakt_connected: bool,
) -> Vec<WatchSession> {
    let search_lower = search.trim().to_lowercase();
    sessions
        .iter()
        .filter(|s| {
            // Day filter: session start day in local time
            if let Some(target_day) = day_filter {
                let local_day = s.start_time.with_timezone(&Local).date_naive();
                if local_day != target_day {
                    return false;
                }
            }

            // Pill filter
            match pill {
                HistoryFilterPill::All => {}
                HistoryFilterPill::Local | HistoryFilterPill::Remote | HistoryFilterPill::Online => {
                    // All sessions in Valor local library
                }
                HistoryFilterPill::StoppedEarly => {
                    if !s.stopped_early && s.completed {
                        return false;
                    }
                }
                HistoryFilterPill::Finished => {
                    if !s.completed {
                        return false;
                    }
                }
                HistoryFilterPill::NeedsTraktSync => {
                    if !trakt_connected {
                        return false;
                    }
                }
            }

            // Search filter
            search_lower.is_empty() || s.item_title.to_lowercase().contains(&search_lower)
        })
        .cloned()
        .collect()
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
        assert!(
            range_top.end_index <= 50,
            "Should only allocate visible slice"
        );
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
        let base_local = Local::now()
            .date_naive()
            .and_hms_opt(12, 0, 0)
            .unwrap()
            .and_local_timezone(Local)
            .unwrap();
        let now = base_local.with_timezone(&Utc);
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

        let groups = group_watch_sessions_with_clock(&sessions, base_local);
        assert_eq!(groups.len(), 1);
        assert!(groups[0].date_label.starts_with("Today"));
        assert_eq!(groups[0].sessions.len(), 2);
        assert!(groups[0].aggregate_label.contains("2 sessions"));
    }

    #[test]
    fn test_group_by_local_day_merges_same_day_regression_duplicate_today() {
        // Production screenshot bug: two separate "Today" groups shown.
        // This test proves that sessions on the same local calendar day are strictly merged into 1 group.
        let now_local = Local::now()
            .date_naive()
            .and_hms_opt(14, 0, 0)
            .unwrap()
            .and_local_timezone(Local)
            .unwrap();
        let s1 = WatchSession {
            id: "s1".into(),
            fingerprint: "fp1".into(),
            collection_id: Some("col1".into()),
            item_title: "The Perfect Lie".into(),
            start_time: now_local.with_timezone(&Utc),
            end_time: (now_local + chrono::Duration::minutes(1)).with_timezone(&Utc),
            start_pos_secs: 0.0,
            end_pos_secs: 60.0,
            completed: false,
            stopped_early: true,
        };
        let s2 = WatchSession {
            id: "s2".into(),
            fingerprint: "fp2".into(),
            collection_id: Some("col1".into()),
            item_title: "Video".into(),
            start_time: (now_local - chrono::Duration::minutes(30)).with_timezone(&Utc),
            end_time: (now_local - chrono::Duration::minutes(27)).with_timezone(&Utc),
            start_pos_secs: 0.0,
            end_pos_secs: 180.0,
            completed: false,
            stopped_early: true,
        };
        let s3 = WatchSession {
            id: "s3".into(),
            fingerprint: "fp3".into(),
            collection_id: Some("col2".into()),
            item_title: "Fight Club".into(),
            start_time: (now_local - chrono::Duration::hours(1)).with_timezone(&Utc),
            end_time: (now_local - chrono::Duration::minutes(56)).with_timezone(&Utc),
            start_pos_secs: 0.0,
            end_pos_secs: 240.0,
            completed: false,
            stopped_early: true,
        };

        let groups = group_watch_sessions_with_clock(&[s1, s2, s3], now_local);
        assert_eq!(
            groups.len(),
            1,
            "All sessions on the same day must be merged into exactly one group"
        );
        assert_eq!(groups[0].sessions.len(), 3);
        assert!(groups[0].date_label.starts_with("Today"));
    }

    #[test]
    fn test_session_crossing_midnight_belongs_to_start_day() {
        // A session starting at 23:45 on 20 Nov and ending at 00:30 on 21 Nov belongs to 20 Nov.
        let start =
            chrono::NaiveDateTime::parse_from_str("2026-11-20 23:45:00", "%Y-%m-%d %H:%M:%S")
                .unwrap()
                .and_local_timezone(Local)
                .unwrap();
        let end = chrono::NaiveDateTime::parse_from_str("2026-11-21 00:30:00", "%Y-%m-%d %H:%M:%S")
            .unwrap()
            .and_local_timezone(Local)
            .unwrap();

        let s = WatchSession {
            id: "midnight_sess".into(),
            fingerprint: "fp_mid".into(),
            collection_id: None,
            item_title: "Midnight Movie".into(),
            start_time: start.with_timezone(&Utc),
            end_time: end.with_timezone(&Utc),
            start_pos_secs: 0.0,
            end_pos_secs: 2700.0,
            completed: true,
            stopped_early: false,
        };

        // Reference clock: 21 Nov 2026 12:00:00 Local
        let clock =
            chrono::NaiveDateTime::parse_from_str("2026-11-21 12:00:00", "%Y-%m-%d %H:%M:%S")
                .unwrap()
                .and_local_timezone(Local)
                .unwrap();

        let groups = group_watch_sessions_with_clock(&[s], clock);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].date_label, "Yesterday 20 Nov 2026");
    }

    #[test]
    fn test_dst_change_days() {
        // In local timezones with DST (e.g. spring forward or fall back), calendar day grouping remains consistent.
        let d1 = chrono::NaiveDateTime::parse_from_str("2026-03-29 01:30:00", "%Y-%m-%d %H:%M:%S")
            .unwrap()
            .and_local_timezone(Local)
            .earliest()
            .unwrap();
        let d2 = chrono::NaiveDateTime::parse_from_str("2026-03-29 03:30:00", "%Y-%m-%d %H:%M:%S")
            .unwrap()
            .and_local_timezone(Local)
            .latest()
            .unwrap();

        let s1 = WatchSession {
            id: "dst1".into(),
            fingerprint: "fp1".into(),
            collection_id: None,
            item_title: "Before Transition".into(),
            start_time: d1.with_timezone(&Utc),
            end_time: (d1 + chrono::Duration::minutes(10)).with_timezone(&Utc),
            start_pos_secs: 0.0,
            end_pos_secs: 600.0,
            completed: false,
            stopped_early: true,
        };
        let s2 = WatchSession {
            id: "dst2".into(),
            fingerprint: "fp2".into(),
            collection_id: None,
            item_title: "After Transition".into(),
            start_time: d2.with_timezone(&Utc),
            end_time: (d2 + chrono::Duration::minutes(15)).with_timezone(&Utc),
            start_pos_secs: 0.0,
            end_pos_secs: 900.0,
            completed: false,
            stopped_early: true,
        };

        let clock =
            chrono::NaiveDateTime::parse_from_str("2026-03-30 12:00:00", "%Y-%m-%d %H:%M:%S")
                .unwrap()
                .and_local_timezone(Local)
                .unwrap();

        let groups = group_watch_sessions_with_clock(&[s1, s2], clock);
        assert_eq!(
            groups.len(),
            1,
            "DST change day sessions must be merged into one local date group"
        );
        assert_eq!(groups[0].date_label, "Yesterday 29 Mar 2026");
        assert_eq!(groups[0].sessions.len(), 2);
    }

    #[test]
    fn test_aggregate_duration_and_injected_clock() {
        let clock =
            chrono::NaiveDateTime::parse_from_str("2026-11-21 15:00:00", "%Y-%m-%d %H:%M:%S")
                .unwrap()
                .and_local_timezone(Local)
                .unwrap();

        let s1 = WatchSession {
            id: "s1".into(),
            fingerprint: "fp1".into(),
            collection_id: None,
            item_title: "Item 1".into(),
            start_time: (clock - chrono::Duration::minutes(10)).with_timezone(&Utc),
            end_time: clock.with_timezone(&Utc),
            start_pos_secs: 0.0,
            end_pos_secs: 60.0, // 1m
            completed: false,
            stopped_early: true,
        };
        let s2 = WatchSession {
            id: "s2".into(),
            fingerprint: "fp2".into(),
            collection_id: None,
            item_title: "Item 2".into(),
            start_time: (clock - chrono::Duration::minutes(20)).with_timezone(&Utc),
            end_time: (clock - chrono::Duration::minutes(10)).with_timezone(&Utc),
            start_pos_secs: 0.0,
            end_pos_secs: 120.0, // 2m
            completed: false,
            stopped_early: true,
        };

        let groups = group_watch_sessions_with_clock(&[s1, s2], clock);
        assert_eq!(groups.len(), 1);
        assert_eq!(groups[0].date_label, "Today 21 Nov 2026");
        assert_eq!(groups[0].aggregate_label, "3m · 2 sessions");
        assert_eq!(groups[0].total_duration_secs, 180.0);
    }

    #[test]
    fn test_heatmap_grid_layout_and_intensity() {
        // Intensity threshold verification
        assert_eq!(calculate_heatmap_intensity(0.0), 0);
        assert_eq!(calculate_heatmap_intensity(45.0), 1);
        assert_eq!(calculate_heatmap_intensity(900.0), 1);
        assert_eq!(calculate_heatmap_intensity(901.0), 2);
        assert_eq!(calculate_heatmap_intensity(2700.0), 2);
        assert_eq!(calculate_heatmap_intensity(2701.0), 3);
        assert_eq!(calculate_heatmap_intensity(5400.0), 3);
        assert_eq!(calculate_heatmap_intensity(5401.0), 4);
        assert_eq!(calculate_heatmap_intensity(10000.0), 4);

        // Layout over 365 days ending on 2026-11-21
        let end_date = NaiveDate::from_ymd_opt(2026, 11, 21).unwrap();
        let aggregates = vec![
            (end_date, 3, 180.0),
            (end_date - chrono::Duration::days(1), 1, 3600.0),
        ];

        let layout = calculate_heatmap_layout(&aggregates, end_date);
        assert_eq!(layout.days.len(), 365);
        assert_eq!(layout.total_sessions_365, 4);

        // Grid starts on Sunday (row 0)
        let last_day = layout.days.last().unwrap();
        assert_eq!(last_day.date, end_date);
        assert_eq!(last_day.session_count, 3);
        assert_eq!(last_day.intensity, 1);
        assert_eq!(
            last_day.row_index,
            end_date.weekday().num_days_from_sunday() as usize
        );

        // Month labels placement
        assert!(!layout.month_labels.is_empty());
        assert!(layout.month_labels.iter().any(|m| m.name == "Nov"));
        assert!(layout.month_labels.iter().any(|m| m.name == "Sept"));

        // Leap year handling: test leap year boundary 2024-02-29
        let leap_end = NaiveDate::from_ymd_opt(2024, 3, 1).unwrap();
        let leap_layout = calculate_heatmap_layout(&[], leap_end);
        assert_eq!(leap_layout.days.len(), 365);
        assert!(leap_layout
            .days
            .iter()
            .any(|d| d.date == NaiveDate::from_ymd_opt(2024, 2, 29).unwrap()));
    }

    #[test]
    fn test_history_filters_combined() {
        let base_dt =
            chrono::NaiveDateTime::parse_from_str("2026-11-21 14:00:00", "%Y-%m-%d %H:%M:%S")
                .unwrap()
                .and_local_timezone(Local)
                .unwrap();

        let s_stopped = WatchSession {
            id: "s1".into(),
            fingerprint: "fp1".into(),
            collection_id: Some("col1".into()),
            item_title: "The Perfect Lie".into(),
            start_time: base_dt.with_timezone(&Utc),
            end_time: (base_dt + chrono::Duration::minutes(5)).with_timezone(&Utc),
            start_pos_secs: 0.0,
            end_pos_secs: 60.0,
            completed: false,
            stopped_early: true,
        };
        let s_finished = WatchSession {
            id: "s2".into(),
            fingerprint: "fp2".into(),
            collection_id: Some("col1".into()),
            item_title: "Video Finished".into(),
            start_time: (base_dt - chrono::Duration::days(1)).with_timezone(&Utc),
            end_time: (base_dt - chrono::Duration::days(1) + chrono::Duration::hours(2))
                .with_timezone(&Utc),
            start_pos_secs: 0.0,
            end_pos_secs: 7200.0,
            completed: true,
            stopped_early: false,
        };

        let list = vec![s_stopped.clone(), s_finished.clone()];

        // Filter Stopped Early
        let filtered_stopped =
            filter_watch_sessions(&list, HistoryFilterPill::StoppedEarly, "", None, false);
        assert_eq!(filtered_stopped.len(), 1);
        assert_eq!(filtered_stopped[0].id, "s1");

        // Filter Finished
        let filtered_fin =
            filter_watch_sessions(&list, HistoryFilterPill::Finished, "", None, false);
        assert_eq!(filtered_fin.len(), 1);
        assert_eq!(filtered_fin[0].id, "s2");

        // Search combined
        let filtered_search =
            filter_watch_sessions(&list, HistoryFilterPill::All, "Lie", None, false);
        assert_eq!(filtered_search.len(), 1);
        assert_eq!(filtered_search[0].id, "s1");

        // Day filter combined
        let day_target = base_dt.date_naive();
        let filtered_day =
            filter_watch_sessions(&list, HistoryFilterPill::All, "", Some(day_target), false);
        assert_eq!(filtered_day.len(), 1);
        assert_eq!(filtered_day[0].id, "s1");
    }

    #[test]
    fn test_duration_formatting_exact_requirements() {
        // Spec requirements: 45s, 1m, 59m, 1h 6m, 2h 19m, 0 and null runtime
        assert_eq!(format_duration_compact(45.0), "45s");
        assert_eq!(format_duration_compact(60.0), "1m");
        assert_eq!(format_duration_compact(3540.0), "59m");
        assert_eq!(format_duration_compact(3960.0), "1h 6m");
        assert_eq!(format_duration_compact(8340.0), "2h 19m");

        // Null and 0 runtime
        assert_eq!(format_session_watched_label(0.0, None), "0s watched");
        assert_eq!(format_session_watched_label(45.0, None), "45s watched");
        assert_eq!(format_session_watched_label(60.0, Some(0.0)), "1m watched");
        assert_eq!(format_session_watched_label(60.0, None), "1m watched");

        // With runtime
        assert_eq!(
            format_session_watched_label(60.0, Some(3960.0)),
            "1m / 1h 6m watched"
        );
        assert_eq!(
            format_session_watched_label(240.0, Some(8340.0)),
            "4m / 2h 19m watched"
        );
    }

    #[test]
    fn test_remove_and_undo_restores_exact_row() {
        let mut sessions = vec![
            WatchSession {
                id: "s1".into(),
                fingerprint: "fp1".into(),
                collection_id: None,
                item_title: "Title 1".into(),
                start_time: Utc::now(),
                end_time: Utc::now(),
                start_pos_secs: 0.0,
                end_pos_secs: 100.0,
                completed: false,
                stopped_early: true,
            },
            WatchSession {
                id: "s2".into(),
                fingerprint: "fp2".into(),
                collection_id: None,
                item_title: "Title 2".into(),
                start_time: Utc::now(),
                end_time: Utc::now(),
                start_pos_secs: 0.0,
                end_pos_secs: 200.0,
                completed: false,
                stopped_early: true,
            },
            WatchSession {
                id: "s3".into(),
                fingerprint: "fp3".into(),
                collection_id: None,
                item_title: "Title 3".into(),
                start_time: Utc::now(),
                end_time: Utc::now(),
                start_pos_secs: 0.0,
                end_pos_secs: 300.0,
                completed: false,
                stopped_early: true,
            },
        ];

        // Remove row at index 1 ("s2")
        let undo_state = remove_session_with_undo(&mut sessions, "s2").expect("removed");
        assert_eq!(sessions.len(), 2);
        assert_eq!(sessions[0].id, "s1");
        assert_eq!(sessions[1].id, "s3");
        assert_eq!(undo_state.original_index, 1);
        assert_eq!(undo_state.removed_session.id, "s2");

        // Undo restore
        restore_session_with_undo(&mut sessions, undo_state);
        assert_eq!(sessions.len(), 3);
        assert_eq!(sessions[0].id, "s1");
        assert_eq!(sessions[1].id, "s2", "Must restore to the exact index");
        assert_eq!(sessions[2].id, "s3");
    }

    #[test]
    fn test_github_session_count_and_column_widths() {
        use crate::shell_state::ShellState;

        // Verify column widths default in ShellState
        let state = ShellState::new();
        assert_eq!(state.movie_list_col_widths.len(), 6);
        assert_eq!(state.series_list_col_widths.len(), 5);
        assert!(state.movie_list_col_widths[0] >= 200.0); // Name column has ample width

        // Verify genuine github style session count
        let end_date = chrono::NaiveDate::from_ymd_opt(2026, 11, 23).unwrap();
        let aggregates = vec![
            (end_date, 2, 1800.0),
            (end_date - chrono::Duration::days(10), 3, 3600.0),
            (end_date - chrono::Duration::days(50), 1, 900.0),
        ];
        let layout = calculate_heatmap_layout(&aggregates, end_date);
        assert_eq!(layout.total_sessions_365, 6, "Total sessions must accurately sum to 6");
    }
}
