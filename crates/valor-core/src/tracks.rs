use crate::models::TrackItem;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Proper ISO 639 Language Entry mapping ISO 639-1, ISO 639-2/T (Terminology),
/// ISO 639-2/B (Bibliographic), English name, and common regional aliases.
#[derive(Debug, Clone, Copy)]
pub struct Iso639Language {
    pub canonical_iso639_2t: &'static str, // e.g. "jpn", "eng", "fra", "deu", "zho"
    pub iso639_2b: &'static str,           // e.g. "jpn", "eng", "fre", "ger", "chi"
    pub iso639_1: &'static str,            // e.g. "ja", "en", "fr", "de", "zh"
    pub english_name: &'static str,        // e.g. "Japanese", "English"
    pub aliases: &'static [&'static str],  // Common spoken/regional variants
}

pub const ISO_639_TABLE: &[Iso639Language] = &[
    Iso639Language {
        canonical_iso639_2t: "eng",
        iso639_2b: "eng",
        iso639_1: "en",
        english_name: "English",
        aliases: &[
            "en-us", "en-gb", "en-ca", "en-au", "en-nz", "en-ie", "en-za",
        ],
    },
    Iso639Language {
        canonical_iso639_2t: "jpn",
        iso639_2b: "jpn",
        iso639_1: "ja",
        english_name: "Japanese",
        aliases: &["jap", "japan", "nihongo"],
    },
    Iso639Language {
        canonical_iso639_2t: "fra",
        iso639_2b: "fre",
        iso639_1: "fr",
        english_name: "French",
        aliases: &["francais", "français"],
    },
    Iso639Language {
        canonical_iso639_2t: "deu",
        iso639_2b: "ger",
        iso639_1: "de",
        english_name: "German",
        aliases: &["deutsch"],
    },
    Iso639Language {
        canonical_iso639_2t: "zho",
        iso639_2b: "chi",
        iso639_1: "zh",
        english_name: "Chinese",
        aliases: &["mandarin", "cantonese"],
    },
    Iso639Language {
        canonical_iso639_2t: "spa",
        iso639_2b: "spa",
        iso639_1: "es",
        english_name: "Spanish",
        aliases: &["espanol", "español", "castilian"],
    },
    Iso639Language {
        canonical_iso639_2t: "ita",
        iso639_2b: "ita",
        iso639_1: "it",
        english_name: "Italian",
        aliases: &["italiano"],
    },
    Iso639Language {
        canonical_iso639_2t: "kor",
        iso639_2b: "kor",
        iso639_1: "ko",
        english_name: "Korean",
        aliases: &["korea", "hangul"],
    },
    Iso639Language {
        canonical_iso639_2t: "rus",
        iso639_2b: "rus",
        iso639_1: "ru",
        english_name: "Russian",
        aliases: &["russkiy"],
    },
    Iso639Language {
        canonical_iso639_2t: "por",
        iso639_2b: "por",
        iso639_1: "pt",
        english_name: "Portuguese",
        aliases: &["portugues", "português", "pt-br", "pt-pt"],
    },
    Iso639Language {
        canonical_iso639_2t: "hin",
        iso639_2b: "hin",
        iso639_1: "hi",
        english_name: "Hindi",
        aliases: &["hindustani"],
    },
];

/// Normalizes any language code, ISO alias, or track title into its canonical
/// lowercase 3-letter ISO 639-2/T code (e.g. "jpn", "eng", "fra", "deu", "zho").
/// "jpn" is returned for Japanese; "jap" is recognized as an alias but is NEVER canonical.
pub fn normalize_language_code(lang: Option<&str>, title: Option<&str>) -> String {
    let mut candidates = Vec::new();
    if let Some(l) = lang {
        candidates.push(l.trim().to_lowercase());
    }
    if let Some(t) = title {
        candidates.push(t.trim().to_lowercase());
    }

    for entry in ISO_639_TABLE {
        for cand in &candidates {
            // Direct matches on ISO 639-1, 639-2/T, 639-2/B, or English name
            if cand == entry.canonical_iso639_2t
                || cand == entry.iso639_2b
                || cand == entry.iso639_1
                || cand.eq_ignore_ascii_case(entry.english_name)
            {
                return entry.canonical_iso639_2t.to_string();
            }

            // Word-boundary token check
            let is_token = cand
                .split(|c: char| !c.is_alphanumeric() && c != '-')
                .any(|tok| {
                    tok == entry.canonical_iso639_2t
                        || tok == entry.iso639_2b
                        || tok == entry.iso639_1
                        || tok.eq_ignore_ascii_case(entry.english_name)
                        || entry.aliases.contains(&tok)
                });
            if is_token {
                return entry.canonical_iso639_2t.to_string();
            }
        }
    }

    // Fallback: if lang is a 3-letter code not equal to "und", return it lowercased
    if let Some(l) = lang {
        let clean = l.trim().to_lowercase();
        if clean.len() == 3 && clean != "und" {
            return clean;
        }
    }

    String::new()
}

/// Checks if a stream's language or title matches a requested target language.
pub fn is_language_match(
    target_lang: &str,
    stream_lang: Option<&str>,
    stream_title: Option<&str>,
) -> bool {
    let clean_target = target_lang.trim();
    if clean_target.is_empty()
        || clean_target.eq_ignore_ascii_case("Original")
        || clean_target.eq_ignore_ascii_case("Off")
    {
        return false;
    }

    let norm_target = normalize_language_code(Some(clean_target), None);
    let target_key = if !norm_target.is_empty() {
        norm_target
    } else {
        clean_target.to_lowercase()
    };

    let norm_stream = normalize_language_code(stream_lang, stream_title);
    if !norm_stream.is_empty() && norm_stream == target_key {
        return true;
    }

    // Direct token check against aliases
    if let Some(entry) = ISO_639_TABLE
        .iter()
        .find(|e| e.canonical_iso639_2t == target_key || e.iso639_2b == target_key)
    {
        let mut haystack = String::new();
        if let Some(l) = stream_lang {
            haystack.push_str(&l.to_lowercase());
            haystack.push(' ');
        }
        if let Some(t) = stream_title {
            haystack.push_str(&t.to_lowercase());
        }

        let is_match = haystack
            .split(|c: char| !c.is_alphanumeric() && c != '-')
            .any(|tok| {
                tok == entry.canonical_iso639_2t
                    || tok == entry.iso639_2b
                    || tok == entry.iso639_1
                    || tok.eq_ignore_ascii_case(entry.english_name)
                    || entry.aliases.contains(&tok)
            });
        if is_match {
            return true;
        }
    }

    false
}

/// Finds the best matching track of a given type based on user preferences.
pub fn find_preferred_track<'a>(
    tracks: &'a [TrackItem],
    target_lang: &str,
    track_type: &str,
) -> Option<&'a TrackItem> {
    tracks
        .iter()
        .filter(|t| t.track_type == track_type)
        .find(|t| is_language_match(target_lang, t.lang.as_deref(), t.title.as_deref()))
}

/// Determines if an item is considered completed based on playback position and total duration.
/// - Items > 5 minutes (300s): position >= duration - max(15.0, 0.02 * duration)
/// - Items <= 5 minutes: position >= duration * 0.95
pub fn is_playback_completed(position_secs: f64, duration_secs: f64) -> bool {
    if duration_secs <= 0.0 {
        return false;
    }
    if duration_secs > 300.0 {
        let margin = (duration_secs * 0.02).max(15.0);
        position_secs >= (duration_secs - margin)
    } else {
        position_secs >= (duration_secs * 0.95)
    }
}

/// Mathematical "watched" rule (Y7):
/// Marked watched if: position >= 0.8 * duration OR remaining <= min(120 s, 20% of duration).
pub fn is_playback_scrobble_watched(position_secs: f64, duration_secs: f64) -> bool {
    if duration_secs <= 0.0 {
        return false;
    }
    let remaining = (duration_secs - position_secs).max(0.0);
    let remaining_threshold = 120.0_f64.min(0.20 * duration_secs);
    (position_secs >= 0.80 * duration_secs) || (remaining <= remaining_threshold)
}

/// Subtitle styling configuration ported from SubtitleOverlay.tsx and Phase 3 specifications.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SubtitleStyle {
    pub font_family: String,
    pub font_size: i64,
    pub text_color: String,
    pub outline_color: String,
    pub outline_width: f64,
    pub shadow_color: String,
    pub shadow_offset: f64,
    pub vertical_position: i64, // 0..100 (sub-pos)
    pub ass_override: bool,
}

impl Default for SubtitleStyle {
    fn default() -> Self {
        Self {
            font_family: "Sans".to_string(),
            font_size: 55,
            text_color: "#FFFFFF".to_string(),
            outline_color: "#000000".to_string(),
            outline_width: 2.0,
            shadow_color: "#000000".to_string(),
            shadow_offset: 1.0,
            vertical_position: 95,
            ass_override: false,
        }
    }
}

/// Carried track preferences across episode switches and playlists.
/// Ported from `trackPreferences.ts`.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct CarriedTrackPreferences {
    pub audio_lang: Option<String>,
    pub audio_title: Option<String>,
    pub sub_lang: Option<String>, // "eng", "jpn", or "off"
    pub sub_title: Option<String>,
    pub sub_offset_secs: f64,
    pub audio_offset_secs: f64,
    pub style: SubtitleStyle,
}

/// Per-series/collection track preferences manager.
#[derive(Debug, Clone, Default)]
pub struct TrackPreferencesManager {
    prefs_by_collection: HashMap<String, CarriedTrackPreferences>,
}

impl TrackPreferencesManager {
    pub fn new() -> Self {
        Self {
            prefs_by_collection: HashMap::new(),
        }
    }

    pub fn get(&self, collection_id: &str) -> CarriedTrackPreferences {
        self.prefs_by_collection
            .get(collection_id)
            .cloned()
            .unwrap_or_default()
    }

    pub fn update<F>(&mut self, collection_id: &str, update_fn: F)
    where
        F: FnOnce(&mut CarriedTrackPreferences),
    {
        let entry = self
            .prefs_by_collection
            .entry(collection_id.to_string())
            .or_default();
        update_fn(entry);
    }
}

/// Auto-discovers external sidecar subtitles (.srt, .ass, .vtt, .sub) in the same directory.
pub fn find_sidecar_subtitles<P: AsRef<Path>>(media_path: P) -> Vec<PathBuf> {
    let p = media_path.as_ref();
    let parent = match p.parent() {
        Some(dir) => dir,
        None => return Vec::new(),
    };

    let stem = match p.file_stem().and_then(|s| s.to_str()) {
        Some(s) => s.to_lowercase(),
        None => return Vec::new(),
    };

    let valid_extensions = ["srt", "ass", "vtt", "sub", "ssa"];
    let mut found = Vec::new();

    if let Ok(entries) = std::fs::read_dir(parent) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }

            if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                if valid_extensions.contains(&ext_lower.as_str()) {
                    if let Some(fstem) = path.file_stem().and_then(|s| s.to_str()) {
                        let fstem_lower = fstem.to_lowercase();
                        // Matches exact stem, stem + .lang, or stem prefix
                        if fstem_lower == stem
                            || fstem_lower.starts_with(&format!("{}.", stem))
                            || fstem_lower.starts_with(&format!("{}_", stem))
                            || fstem_lower.starts_with(&format!("{}-", stem))
                        {
                            found.push(path);
                        }
                    }
                }
            }
        }
    }

    found.sort();
    found
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_w5_iso_639_table_and_canonical_codes() {
        // Japanese: "jpn" must work, "jap" must not be the canonical form
        assert_eq!(normalize_language_code(Some("jpn"), None), "jpn");
        assert_eq!(normalize_language_code(Some("ja"), None), "jpn");
        assert_eq!(normalize_language_code(None, Some("Japanese (5.1)")), "jpn");
        assert_eq!(normalize_language_code(Some("jap"), None), "jpn");
        assert_ne!(
            normalize_language_code(Some("jap"), None),
            "jap",
            "'jap' must not be canonical"
        );

        // English: eng / en / English
        assert_eq!(normalize_language_code(Some("eng"), None), "eng");
        assert_eq!(normalize_language_code(Some("en"), None), "eng");
        assert_eq!(normalize_language_code(None, Some("English Audio")), "eng");

        // French: fre / fra / fr / French
        assert_eq!(normalize_language_code(Some("fre"), None), "fra");
        assert_eq!(normalize_language_code(Some("fra"), None), "fra");
        assert_eq!(normalize_language_code(Some("fr"), None), "fra");
        assert_eq!(
            normalize_language_code(None, Some("French Dialogue")),
            "fra"
        );

        // German: ger / deu / de / German
        assert_eq!(normalize_language_code(Some("ger"), None), "deu");
        assert_eq!(normalize_language_code(Some("deu"), None), "deu");
        assert_eq!(normalize_language_code(Some("de"), None), "deu");
        assert_eq!(
            normalize_language_code(None, Some("German [Stereo]")),
            "deu"
        );

        // Chinese: chi / zho / zh / Chinese
        assert_eq!(normalize_language_code(Some("chi"), None), "zho");
        assert_eq!(normalize_language_code(Some("zho"), None), "zho");
        assert_eq!(normalize_language_code(Some("zh"), None), "zho");
        assert_eq!(
            normalize_language_code(None, Some("Chinese (Mandarin)")),
            "zho"
        );

        // Matching checks
        assert!(is_language_match("eng", Some("en"), None));
        assert!(is_language_match("fra", Some("fre"), None));
        assert!(is_language_match("deu", Some("ger"), None));
        assert!(is_language_match("jpn", Some("ja"), None));
        assert!(is_language_match("zho", Some("chi"), None));
    }

    #[test]
    fn test_w4_completion_rule_for_various_durations() {
        // Case 1: 20 s item (<= 5 min -> 95% threshold = 19.0s)
        assert!(!is_playback_completed(18.9, 20.0));
        assert!(is_playback_completed(19.0, 20.0));
        assert!(is_playback_completed(19.8, 20.0));

        // Case 2: 3 min (180 s, <= 5 min -> 95% threshold = 171.0s)
        assert!(!is_playback_completed(170.0, 180.0));
        assert!(is_playback_completed(171.0, 180.0));
        assert!(is_playback_completed(179.0, 180.0));

        // Case 3: 45 min (2700 s, > 5 min -> margin = max(15s, 2% of 2700s = 54s) = 54s. Threshold = 2700 - 54 = 2646s)
        assert!(!is_playback_completed(2645.0, 2700.0));
        assert!(is_playback_completed(2646.0, 2700.0));
        assert!(is_playback_completed(2690.0, 2700.0));

        // Case 4: 3 hours (10800 s, > 5 min -> margin = max(15s, 2% of 10800s = 216s) = 216s. Threshold = 10800 - 216 = 10584s)
        assert!(!is_playback_completed(10583.0, 10800.0));
        assert!(is_playback_completed(10584.0, 10800.0));
        assert!(is_playback_completed(10750.0, 10800.0));

        // Separate watched scrobbling threshold (80% or remaining < 2 min)
        assert!(!is_playback_scrobble_watched(1000.0, 2700.0)); // 37%
        assert!(is_playback_scrobble_watched(2160.0, 2700.0)); // 80%
        assert!(is_playback_scrobble_watched(2600.0, 2700.0)); // Remaining 100s < 120s
    }

    #[test]
    fn test_y7_watched_rule_mathematical_definition() {
        // Rule: position >= 0.8 * duration || remaining <= min(120 s, 20% of duration)

        // Case 1: 90 seconds item
        // 0.8 * 90 = 72s. min(120, 0.20 * 90 = 18s) = 18s.
        assert!(!is_playback_scrobble_watched(71.0, 90.0), "90s at 71s (remaining 19s > 18s) must not be watched");
        assert!(is_playback_scrobble_watched(72.0, 90.0), "90s at 72s (80%, remaining 18s) must be watched");
        assert!(is_playback_scrobble_watched(85.0, 90.0), "90s at 85s must be watched");

        // Case 2: 2 minutes (120 seconds) item
        // 0.8 * 120 = 96s. min(120, 0.20 * 120 = 24s) = 24s.
        assert!(!is_playback_scrobble_watched(95.0, 120.0), "120s at 95s (remaining 25s > 24s) must not be watched");
        assert!(is_playback_scrobble_watched(96.0, 120.0), "120s at 96s (80%, remaining 24s) must be watched");
        assert!(is_playback_scrobble_watched(110.0, 120.0), "120s at 110s must be watched");

        // Case 3: 25 minutes (1500 seconds) item
        // 0.8 * 1500 = 1200s (20 min). min(120, 0.20 * 1500 = 300s) = 120s (2 min).
        assert!(!is_playback_scrobble_watched(1199.0, 1500.0), "1500s at 1199s (remaining 301s > 120s) must not be watched");
        assert!(is_playback_scrobble_watched(1200.0, 1500.0), "1500s at 1200s (80% threshold) must be watched");
        assert!(is_playback_scrobble_watched(1380.0, 1500.0), "1500s at 1380s (remaining 120s <= 120s) must be watched");
        assert!(is_playback_scrobble_watched(1490.0, 1500.0), "1500s at 1490s must be watched");

        // Case 4: 3 hours (10800 seconds) item
        // 0.8 * 10800 = 8640s (2h 24m). min(120, 0.20 * 10800 = 2160s) = 120s (2 min).
        assert!(!is_playback_scrobble_watched(8639.0, 10800.0), "10800s at 8639s must not be watched");
        assert!(is_playback_scrobble_watched(8640.0, 10800.0), "10800s at 8640s (80% threshold) must be watched");
        assert!(is_playback_scrobble_watched(10680.0, 10800.0), "10800s at 10680s (remaining 120s <= 120s) must be watched");
    }

    #[test]
    fn test_find_preferred_track() {
        let tracks = vec![
            TrackItem {
                id: 1,
                track_type: "audio".into(),
                title: Some("Japanese [Original]".into()),
                lang: Some("jpn".into()),
                codec: Some("aac".into()),
                channels: Some(2),
                is_default: true,
                is_forced: false,
                is_selected: true,
                is_external: false,
            },
            TrackItem {
                id: 2,
                track_type: "audio".into(),
                title: Some("English Dub".into()),
                lang: Some("eng".into()),
                codec: Some("ac3".into()),
                channels: Some(6),
                is_default: false,
                is_forced: false,
                is_selected: false,
                is_external: false,
            },
            TrackItem {
                id: 3,
                track_type: "sub".into(),
                title: Some("English Full".into()),
                lang: Some("eng".into()),
                codec: Some("subrip".into()),
                channels: None,
                is_default: true,
                is_forced: false,
                is_selected: false,
                is_external: false,
            },
        ];

        let pref_audio = find_preferred_track(&tracks, "eng", "audio");
        assert!(pref_audio.is_some());
        assert_eq!(pref_audio.unwrap().id, 2);

        let pref_sub = find_preferred_track(&tracks, "Japanese", "audio");
        assert!(pref_sub.is_some());
        assert_eq!(pref_sub.unwrap().id, 1);
    }
}
