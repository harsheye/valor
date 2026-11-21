use crate::models::TrackItem;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// Language mapping table ported directly from production reference `languageMatcher.ts`.
const LANG_MAP: &[(&str, &[&str])] = &[
    (
        "ENG",
        &[
            "eng", "en", "english", "en-us", "en-gb", "en-ca", "en-au", "en-nz", "en-ie", "en-za",
        ],
    ),
    ("HIN", &["hin", "hi", "hindi"]),
    ("JAP", &["jpn", "ja", "japanese", "japan"]),
    (
        "CHN",
        &["chi", "zho", "zh", "chinese", "mandarin", "cantonese"],
    ),
    ("SPA", &["spa", "es", "spanish", "espanol"]),
    ("FRE", &["fra", "fre", "fr", "french"]),
    ("GER", &["ger", "deu", "de", "german"]),
    ("ITA", &["ita", "it", "italian"]),
    ("KOR", &["kor", "ko", "korean"]),
    ("RUS", &["rus", "ru", "russian"]),
    ("POR", &["por", "pt", "portuguese"]),
];

/// Normalizes a language code or track title to a 3-letter canonical key (e.g. "ENG", "HIN").
pub fn normalize_language_code(lang: Option<&str>, title: Option<&str>) -> String {
    let mut candidates = Vec::new();
    if let Some(l) = lang {
        candidates.push(l.to_lowercase());
    }
    if let Some(t) = title {
        candidates.push(t.to_lowercase());
    }

    for (canonical, aliases) in LANG_MAP {
        for cand in &candidates {
            for alias in *aliases {
                // Check exact equality or word boundary match
                if cand == alias {
                    return (*canonical).to_string();
                }
                // Token check: e.g. "English (5.1)", "Japanese [Original]"
                if cand.contains(alias) {
                    let is_token = cand
                        .split(|c: char| !c.is_alphanumeric())
                        .any(|token| token == *alias);
                    if is_token {
                        return (*canonical).to_string();
                    }
                }
            }
        }
    }

    if let Some(l) = lang {
        let clean = l.trim().to_lowercase();
        if clean.len() == 3 && clean != "und" {
            return clean.to_uppercase();
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
        clean_target.to_uppercase()
    };

    let norm_stream = normalize_language_code(stream_lang, stream_title);
    if !norm_stream.is_empty() && norm_stream == target_key {
        return true;
    }

    // Direct token check against aliases of the target key
    if let Some((_, aliases)) = LANG_MAP.iter().find(|(k, _)| *k == target_key.as_str()) {
        let mut haystack = String::new();
        if let Some(l) = stream_lang {
            haystack.push_str(&l.to_lowercase());
            haystack.push(' ');
        }
        if let Some(t) = stream_title {
            haystack.push_str(&t.to_lowercase());
        }

        for alias in *aliases {
            let matches = haystack
                .split(|c: char| !c.is_alphanumeric())
                .any(|token| token == *alias);
            if matches {
                return true;
            }
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

/// Subtitle styling configuration ported from SubtitleOverlay.tsx.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SubtitleStyle {
    pub font_family: String,
    pub font_size: i64,
    pub text_color: String,
    pub outline_color: String,
    pub outline_width: f64,
    pub bottom_margin_percent: f64,
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
            bottom_margin_percent: 5.0,
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
    fn test_normalize_and_match_languages() {
        assert_eq!(normalize_language_code(Some("eng"), None), "ENG");
        assert_eq!(normalize_language_code(Some("en-US"), None), "ENG");
        assert_eq!(
            normalize_language_code(None, Some("English [Stereo]")),
            "ENG"
        );
        assert_eq!(normalize_language_code(Some("jpn"), None), "JAP");
        assert_eq!(normalize_language_code(None, Some("Japanese (5.1)")), "JAP");
        assert_eq!(normalize_language_code(Some("hi"), None), "HIN");

        assert!(is_language_match("eng", Some("en"), None));
        assert!(is_language_match("ENG", None, Some("English Audio Track")));
        assert!(is_language_match("japanese", Some("jpn"), None));
        assert!(!is_language_match("Off", Some("eng"), None));
        assert!(!is_language_match("Original", Some("eng"), None));
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

        let pref_sub = find_preferred_track(&tracks, "ENG", "sub");
        assert!(pref_sub.is_some());
        assert_eq!(pref_sub.unwrap().id, 3);
    }
}
