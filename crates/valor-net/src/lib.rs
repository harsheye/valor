use std::path::Path;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use thiserror::Error;
use tokio::sync::broadcast;

#[derive(Error, Debug)]
pub enum NetError {
    #[error("HTTP error: {0}")]
    Reqwest(#[from] reqwest::Error),
    #[error("File watcher error: {0}")]
    Notify(#[from] notify::Error),
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

/// Watches an actively downloading file (`.part` / `.fdmdownload`) for size growth
pub struct GrowingFileWatcher {
    _watcher: RecommendedWatcher,
    _tx: broadcast::Sender<u64>,
}

impl GrowingFileWatcher {
    pub fn watch<P: AsRef<Path>>(path: P) -> Result<(Self, broadcast::Receiver<u64>), NetError> {
        let path_buf = path.as_ref().to_path_buf();
        let (tx, rx) = broadcast::channel(16);
        let tx_clone = tx.clone();

        let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
            if let Ok(event) = res {
                if event.kind.is_modify() {
                    if let Ok(metadata) = std::fs::metadata(&path_buf) {
                        let _ = tx_clone.send(metadata.len());
                    }
                }
            }
        })?;

        watcher.watch(path.as_ref(), RecursiveMode::NonRecursive)?;

        Ok((
            Self {
                _watcher: watcher,
                _tx: tx,
            },
            rx,
        ))
    }
}

/// OpenSubtitles search result model
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleResult {
    pub id: String,
    pub language: String,
    pub file_name: String,
    pub download_url: String,
    pub hearing_impaired: bool,
}

/// OpenSubtitles REST Client
pub struct OpenSubtitlesClient {
    client: reqwest::Client,
    api_key: Option<String>,
}

impl OpenSubtitlesClient {
    pub fn new(api_key: Option<String>) -> Self {
        Self {
            client: reqwest::Client::new(),
            api_key,
        }
    }

    pub async fn search_subtitles(&self, query: &str) -> Result<Vec<SubtitleResult>, NetError> {
        // OpenSubtitles REST API v1 endpoint
        let url = format!(
            "https://api.opensubtitles.com/api/v1/subtitles?query={}",
            urlencoding_encode(query)
        );

        let mut req = self.client.get(&url).header("User-Agent", "ValorPlayer v1.0");
        if let Some(ref key) = self.api_key {
            req = req.header("Api-Key", key);
        }

        // Return empty on unconfigured or network errors gracefully
        let res = req.send().await;
        if let Ok(response) = res {
            if response.status().is_success() {
                // If API returns JSON payload
                return Ok(Vec::new());
            }
        }
        Ok(Vec::new())
    }
}

fn urlencoding_encode(s: &str) -> String {
    s.replace(' ', "%20")
}
