//! Serializable media and library records owned by the core crate.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct MediaItem {
    pub id: String,
    pub title: String,
    pub path: PathBuf,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PlaybackPosition {
    pub media_id: String,
    pub seconds: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LibrarySource {
    pub path: PathBuf,
}
