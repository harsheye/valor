use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "snake_case")]
pub enum PlaybackStatus {
    #[default]
    Idle,
    Loading,
    Playing,
    Paused,
    Completed,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TrackItem {
    pub id: i64,
    pub track_type: String, // "audio", "sub", "video"
    pub title: Option<String>,
    pub lang: Option<String>,
    pub codec: Option<String>,
    pub selected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaybackState {
    pub status: PlaybackStatus,
    pub current_fingerprint: Option<String>,
    pub current_file_path: Option<String>,
    pub position_secs: f64,
    pub duration_secs: f64,
    pub buffered_secs: f64,
    pub volume: f64,
    pub is_muted: bool,
    pub speed: f64,
    pub fps: f64,
    pub estimated_frame_count: i64,
    pub is_hdr: bool,
    pub width: u32,
    pub height: u32,
    pub rotation: i64,
    pub audio_boost_tier: u32,
    pub switch_token: u64,
    pub tracks: Vec<TrackItem>,
}

impl Default for PlaybackState {
    fn default() -> Self {
        Self {
            status: PlaybackStatus::Idle,
            current_fingerprint: None,
            current_file_path: None,
            position_secs: 0.0,
            duration_secs: 0.0,
            buffered_secs: 0.0,
            volume: 1.0,
            is_muted: false,
            speed: 1.0,
            fps: 0.0,
            estimated_frame_count: 0,
            is_hdr: false,
            width: 0,
            height: 0,
            rotation: 0,
            audio_boost_tier: 100,
            switch_token: 0,
            tracks: Vec::new(),
        }
    }
}
