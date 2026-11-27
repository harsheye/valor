//! Owns native playback commands, state snapshots, and queue behavior.

pub mod audio_graph;
pub mod queue;
pub mod service;
pub use service::PlayerService;

use serde::{Deserialize, Serialize};
use std::{path::PathBuf, sync::Arc};

/// Describes the current playback state exposed to the application.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum PlaybackState {
    #[default]
    Idle,
    Loading,
    Playing,
    Paused,
    Seeking,
    Buffering,
    Ending,
    Countdown,
    Finished,
    Error,
}

/// Contains the current player values without exposing the mpv handle.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlayerSnapshot {
    pub token: u64,
    pub state: PlaybackState,
    pub path: Option<PathBuf>,
    pub title: Option<String>,
    pub position_secs: f64,
    pub duration_secs: f64,
    pub volume: f64,
    pub muted: bool,
    pub speed: f64,
    pub queue: Vec<PlayerQueueEntry>,
    pub queue_index: usize,
    pub shuffle: bool,
    pub repeat: queue::RepeatMode,
    pub tracks: Vec<PlayerTrack>,
    pub chapters: Vec<PlayerChapter>,
    pub zoom_to_fill: bool,
    pub is_hdr: bool,
    pub hdr_boost: bool,
    pub is_10bit: bool,
    pub pixel_format: Option<String>,
    pub hwdec_current: Option<String>,
}

/// One chapter marker reported by mpv.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlayerChapter {
    pub title: String,
    pub start_secs: f64,
}

/// One audio or subtitle stream reported by mpv.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlayerTrack {
    pub id: i64,
    pub kind: String,
    pub title: Option<String>,
    pub language: Option<String>,
    pub codec: Option<String>,
    pub channels: Option<String>,
    pub selected: bool,
    pub is_default: bool,
    pub external: bool,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PlayerQueueEntry {
    pub path: PathBuf,
    pub title: String,
    pub duration_secs: Option<u64>,
}

/// Identifies where an open request originated for collection selection.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct OpenOrigin {
    pub collection_id: Option<String>,
}

/// Carries playback operations to the sole mpv owner thread.
#[derive(Debug, Clone)]
pub enum PlayerCommand {
    Open {
        paths: Vec<PathBuf>,
        start_index: usize,
        start_position_secs: f64,
        origin: OpenOrigin,
    },
    Play {
        token: u64,
    },
    Pause {
        token: u64,
    },
    Toggle {
        token: u64,
    },
    Stop {
        token: u64,
    },
    Next {
        token: u64,
    },
    Prev {
        token: u64,
    },
    JumpTo {
        token: u64,
        index: usize,
    },
    Seek {
        token: u64,
        seconds: f64,
        exact: bool,
    },
    SeekRel {
        token: u64,
        seconds: f64,
    },
    FrameStep {
        token: u64,
    },
    FrameBack {
        token: u64,
    },
    SetSpeed {
        token: u64,
        speed: f64,
    },
    SetVolume {
        token: u64,
        volume: f64,
    },
    SetMute {
        token: u64,
        muted: bool,
    },
    SelectTrack {
        token: u64,
        id: i64,
    },
    DisableSubtitles {
        token: u64,
    },
    LoadSubtitle {
        token: u64,
        path: PathBuf,
    },
    SetBoostTier {
        token: u64,
        tier: u8,
    },
    SetAudioOnly {
        token: u64,
        enabled: bool,
    },
    JumpToQueue {
        token: u64,
        index: usize,
    },
    Enqueue {
        token: u64,
        paths: Vec<PathBuf>,
    },
    ClearQueue {
        token: u64,
    },
    RemoveQueueItem {
        token: u64,
        index: usize,
    },
    MoveQueueItem {
        token: u64,
        from: usize,
        to: usize,
    },
    SetShuffle {
        token: u64,
        enabled: bool,
    },
    SetRepeat {
        token: u64,
        mode: queue::RepeatMode,
    },
    SetZoomToFill {
        token: u64,
        enabled: bool,
    },
    SetHdrBoost {
        token: u64,
        enabled: bool,
    },
    SetPictureControls {
        token: u64,
        enabled: bool,
        lighting: i32,
        shadows: i32,
        contrast: i32,
        sharpness: i32,
        vibrance: i32,
        hue: i32,
        deband: bool,
        hdr_boost: i32,
    },
    Shutdown,
}

/// Reports playback state and backend failures to the application.
#[derive(Debug, Clone)]
pub enum PlayerEvent {
    StateChanged {
        token: u64,
        state: PlaybackState,
    },
    ItemChanged {
        token: u64,
        path: PathBuf,
        title: String,
    },
    Position {
        token: u64,
        position_secs: f64,
        duration_secs: f64,
    },
    EndOfItem {
        token: u64,
        path: PathBuf,
        position_secs: f64,
        duration_secs: f64,
    },
    EndOfQueue {
        token: u64,
    },
    LoadFailed {
        token: u64,
        path: PathBuf,
        reason: String,
        recoverable: bool,
    },
    PropertyUnsupported {
        token: u64,
        name: String,
    },
    Toast(String),
    Fatal(String),
    ShutdownComplete,
}

/// Shares a read-only player snapshot with the UI layer.
pub type SharedSnapshot = Arc<parking_lot::RwLock<PlayerSnapshot>>;
