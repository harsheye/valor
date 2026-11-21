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
    pub is_selected: bool,
    pub is_external: bool,
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
