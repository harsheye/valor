use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct MediaItem {
    pub id: String,
    pub fingerprint: String,
    pub file_path: String,
    pub title: String,
    pub duration: f64,
    pub size_bytes: u64,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub is_hdr: bool,
    pub video_codec: Option<String>,
    pub audio_codec: Option<String>,
    pub series_id: Option<String>,
    pub season_number: Option<u32>,
    pub episode_number: Option<u32>,
    pub is_missing: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Collection {
    pub id: String,
    pub name: String,
    pub collection_type: String, // "single", "playlist", "series"
    pub item_ids: Vec<String>,
    pub current_index: usize,
    pub last_played_at: Option<DateTime<Utc>>,
    pub is_pinned: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlaybackPosition {
    pub fingerprint: String,
    pub position_secs: f64,
    pub duration_secs: f64,
    pub completed: bool,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct HistoryEntry {
    pub collection_id: String,
    pub collection_name: String,
    pub collection_type: String,
    pub total_items: usize,
    pub current_index: usize,
    pub current_item_title: String,
    pub current_item_fingerprint: String,
    pub position_secs: f64,
    pub duration_secs: f64,
    pub progress_ratio: f64,
    pub last_played_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct TrackItem {
    pub id: i64,
    pub track_type: String, // "audio" | "sub" | "video"
    pub title: Option<String>,
    pub lang: Option<String>,
    pub codec: Option<String>,
    pub channels: Option<i64>,
    pub is_default: bool,
    pub is_forced: bool,
    pub is_selected: bool,
    pub is_external: bool,
}

impl TrackItem {
    /// Formats a complete, informative track label displaying language, codec, channels, and flags.
    pub fn display_label(&self) -> String {
        let mut parts = Vec::new();
        if let Some(l) = &self.lang {
            parts.push(l.to_uppercase());
        }
        if let Some(t) = &self.title {
            parts.push(t.clone());
        }
        if let Some(c) = &self.codec {
            parts.push(c.to_uppercase());
        }
        if let Some(ch) = self.channels {
            let ch_str = match ch {
                1 => "Mono (1.0)".to_string(),
                2 => "Stereo (2.0)".to_string(),
                6 => "5.1 Surround".to_string(),
                8 => "7.1 Surround".to_string(),
                other => format!("{}ch", other),
            };
            parts.push(ch_str);
        }
        let mut flags = Vec::new();
        if self.is_default {
            flags.push("DEFAULT");
        }
        if self.is_forced {
            flags.push("FORCED");
        }
        if self.is_external {
            flags.push("EXTERNAL");
        }
        if !flags.is_empty() {
            parts.push(format!("[{}]", flags.join("|")));
        }

        if parts.is_empty() {
            format!("Track #{}", self.id)
        } else {
            parts.join(" · ")
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Bookmark {
    pub id: String,
    pub fingerprint: String,
    pub title: String,
    pub start_secs: f64,
    pub end_secs: Option<f64>,
    pub category: String, // "intro", "credits", "scene", "custom"
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChapterItem {
    pub index: i64,
    pub title: String,
    pub start_secs: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CachedFileInfo {
    pub size_bytes: u64,
    pub mtime_secs: i64,
    pub fingerprint: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum MigrationMatchKind {
    LegacyFingerprint,
    FilenameAndSize,
    FilenameOnly,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum MigrationMatchResult {
    Matched(Box<MediaItem>, MigrationMatchKind),
    Ambiguous(Vec<String>),
    Unmatched,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScannedFileRecord {
    pub id: String,
    pub path: String,
    pub size_bytes: u64,
    pub mtime_secs: i64,
    pub fingerprint: String,
    pub legacy_fingerprint: Option<String>,
    pub item: MediaItem,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnalysisTask {
    pub id: i64,
    pub file_id: String,
    pub fingerprint: String,
    pub path: String,
    pub priority: i32,
    pub status: String,
    pub retries: i32,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AnalysisQueueItem {
    pub file_id: String,
    pub fingerprint: String,
    pub path: String,
    pub priority: i32,
}
