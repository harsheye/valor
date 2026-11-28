//! Trakt button state, optimistic watch-marking, and background sync types.

use crate::history::data::HistoryItem;
use std::collections::HashSet;

#[derive(Debug, Clone, PartialEq)]
pub struct TraktMarkPayload {
    pub fingerprint: String,
    pub title: String,
    pub season_number: Option<u32>,
    pub episode_number: Option<u32>,
    pub imdb_id: Option<String>,
    pub tmdb_id: Option<u32>,
}

#[derive(Debug, Clone)]
pub enum TraktSyncEvent {
    WatchedCacheUpdated(HashSet<String>),
    MarkSucceeded { fingerprint: String },
    MarkFailed { fingerprint: String },
}

#[derive(Debug, Default)]
pub struct TraktHistoryState {
    pub watched_keys: HashSet<String>,
    pub optimistically_done: HashSet<String>,
    pub last_cache_refresh: Option<std::time::Instant>,
    pub backoff_until: Option<std::time::Instant>,
}

impl TraktHistoryState {
    pub fn mark_optimistic(&mut self, fingerprint: &str) {
        self.optimistically_done.insert(fingerprint.to_string());
    }

    pub fn revert_optimistic(&mut self, fingerprint: &str) {
        self.optimistically_done.remove(fingerprint);
    }

    pub fn apply_event(&mut self, ev: TraktSyncEvent) -> Option<String> {
        match ev {
            TraktSyncEvent::WatchedCacheUpdated(keys) => {
                self.watched_keys = keys;
                self.last_cache_refresh = Some(std::time::Instant::now());
                None
            }
            TraktSyncEvent::MarkSucceeded { fingerprint } => {
                self.watched_keys.insert(fingerprint.clone());
                self.optimistically_done.insert(fingerprint);
                None
            }
            TraktSyncEvent::MarkFailed { fingerprint } => {
                self.revert_optimistic(&fingerprint);
                Some("Couldn't reach Trakt. Try again.".to_string())
            }
        }
    }

    pub fn needs_refresh(&self) -> bool {
        match self.last_cache_refresh {
            None => true,
            Some(t) => t.elapsed() >= std::time::Duration::from_secs(30 * 60),
        }
    }
}

/// Returns `true` when the Trakt button must be disabled:
/// `progress >= 0.90 || marked_done || trakt_watched`.
pub fn is_trakt_disabled(item: &HistoryItem) -> bool {
    item.progress >= 0.90 || item.marked_done || item.trakt_watched
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::NaiveDate;
    use std::path::PathBuf;

    fn sample_item(progress: f32, marked_done: bool, trakt_watched: bool) -> HistoryItem {
        HistoryItem {
            id: 1,
            session_id: "s1".into(),
            fingerprint: "fp1".into(),
            title: "Test".into(),
            episode: None,
            plays: 1,
            watched_secs: 60,
            duration_secs: 1000,
            paused_at_secs: 60,
            progress,
            file_path: PathBuf::from(r"F:\movies\Test.mkv"),
            parent_folder_str: r"F:\movies".into(),
            rating: None,
            marked_done,
            trakt_watched,
            day: NaiveDate::from_ymd_opt(2026, 11, 28).unwrap(),
            imdb_id: None,
            tmdb_id: None,
            season_number: None,
            episode_number: None,
        }
    }

    #[test]
    fn test_trakt_disabled_rules() {
        assert!(!is_trakt_disabled(&sample_item(0.5, false, false)));
        assert!(is_trakt_disabled(&sample_item(0.90, false, false)));
        assert!(is_trakt_disabled(&sample_item(0.2, true, false)));
        assert!(is_trakt_disabled(&sample_item(0.2, false, true)));
    }

    #[test]
    fn test_optimistic_revert_on_failure() {
        let mut st = TraktHistoryState::default();
        st.mark_optimistic("fp1");
        assert!(st.optimistically_done.contains("fp1"));
        let msg = st.apply_event(TraktSyncEvent::MarkFailed {
            fingerprint: "fp1".into(),
        });
        assert!(!st.optimistically_done.contains("fp1"));
        assert_eq!(msg.as_deref(), Some("Couldn't reach Trakt. Try again."));
    }
}
