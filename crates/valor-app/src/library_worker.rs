use std::collections::HashMap;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::thread;
use tracing::info;

use valor_core::db::Database;
use valor_core::models::{MediaItem, MetadataOverride, PlaybackPosition};
use valor_ui::view_models::{
    build_movie_card_view_models, build_series_card_view_models, MovieCardViewModel,
    SeriesCardViewModel,
};

#[derive(Debug)]
pub enum LibraryWorkerRequest {
    Refresh,
    SearchFts5(String),
    ToggleWatched(String),
    SetHidden {
        series_key: Option<String>,
        fingerprint: Option<String>,
        hidden: bool,
    },
    Remove {
        series_key: Option<String>,
        fingerprint: Option<String>,
    },
    SaveOverride(MetadataOverride),
}

#[derive(Debug, Clone)]
pub struct LibraryWorkerData {
    pub movies: Vec<MovieCardViewModel>,
    pub series: Vec<SeriesCardViewModel>,
    pub raw_items: Vec<MediaItem>,
    pub positions: HashMap<String, PlaybackPosition>,
    pub overrides: HashMap<String, MetadataOverride>,
    pub movies_count: usize,
    pub series_count: usize,
    pub playlists_count: usize,
    pub is_loading: bool,
}

pub struct LibraryWorkerHandle {
    pub req_tx: Sender<LibraryWorkerRequest>,
    pub res_rx: Receiver<LibraryWorkerData>,
}

impl LibraryWorkerHandle {
    pub fn spawn(db: Database) -> Self {
        let (req_tx, req_rx) = channel::<LibraryWorkerRequest>();
        let (res_tx, res_rx) = channel::<LibraryWorkerData>();

        thread::Builder::new()
            .name("valor-library-worker".into())
            .spawn(move || {
                info!("Library worker thread started");

                let compute_and_send = |db: &Database, tx: &Sender<LibraryWorkerData>| {
                    // DB calls on worker thread:
                    // 1. get_all_items()
                    // 2. get_all_playback_positions()
                    // 3. get_metadata_overrides()
                    // 4. get_all_collections()
                    let raw_items = db.get_all_items().unwrap_or_default();
                    let positions = db.get_all_playback_positions().unwrap_or_default();
                    let overrides = db.get_metadata_overrides().unwrap_or_default();
                    let collections = db.get_all_collections().unwrap_or_default();

                    // Pure view-model deduplication and grouping
                    let movies = build_movie_card_view_models(&raw_items, &positions, &overrides);
                    let series = build_series_card_view_models(&raw_items, &positions, &overrides);

                    let movies_count = movies.len();
                    let series_count = series.len();
                    let playlists_count = collections.len();

                    let _ = tx.send(LibraryWorkerData {
                        movies,
                        series,
                        raw_items,
                        positions,
                        overrides,
                        movies_count,
                        series_count,
                        playlists_count,
                        is_loading: false,
                    });
                };

                // Initial load
                compute_and_send(&db, &res_tx);

                while let Ok(req) = req_rx.recv() {
                    match req {
                        LibraryWorkerRequest::Refresh => {
                            compute_and_send(&db, &res_tx);
                        }
                        LibraryWorkerRequest::SearchFts5(query) => {
                            if query.trim().is_empty() {
                                compute_and_send(&db, &res_tx);
                            } else {
                                // DB call on worker thread: search_items() using SQLite FTS5
                                let fts_items = db.search_items(&query).unwrap_or_default();
                                let positions = db.get_all_playback_positions().unwrap_or_default();
                                let overrides = db.get_metadata_overrides().unwrap_or_default();
                                let collections = db.get_all_collections().unwrap_or_default();

                                let movies = build_movie_card_view_models(&fts_items, &positions, &overrides);
                                let series = build_series_card_view_models(&fts_items, &positions, &overrides);

                                let _ = res_tx.send(LibraryWorkerData {
                                    movies,
                                    series,
                                    raw_items: fts_items,
                                    positions,
                                    overrides,
                                    movies_count: movies.len(),
                                    series_count: series.len(),
                                    playlists_count: collections.len(),
                                    is_loading: false,
                                });
                            }
                        }
                        LibraryWorkerRequest::ToggleWatched(fp) => {
                            let mut pos = db.get_playback_position(&fp).unwrap_or_default().unwrap_or_else(|| PlaybackPosition {
                                fingerprint: fp.clone(),
                                position_secs: 0.0,
                                duration_secs: 0.0,
                                completed: false,
                                updated_at: chrono::Utc::now(),
                            });
                            pos.completed = !pos.completed;
                            let _ = db.save_playback_position(&pos);
                            compute_and_send(&db, &res_tx);
                        }
                        LibraryWorkerRequest::SetHidden {
                            series_key,
                            fingerprint,
                            hidden,
                        } => {
                            if let Some(sk) = series_key {
                                let _ = db.set_series_hidden(&sk, hidden);
                            }
                            if let Some(fp) = fingerprint {
                                let _ = db.set_item_hidden(&fp, hidden);
                            }
                            compute_and_send(&db, &res_tx);
                        }
                        LibraryWorkerRequest::Remove {
                            series_key,
                            fingerprint,
                        } => {
                            if let Some(sk) = series_key {
                                let _ = db.delete_series(&sk);
                            }
                            if let Some(fp) = fingerprint {
                                let _ = db.delete_item_by_fingerprint(&fp);
                            }
                            compute_and_send(&db, &res_tx);
                        }
                        LibraryWorkerRequest::SaveOverride(ov) => {
                            let _ = db.save_metadata_override(&ov);
                            compute_and_send(&db, &res_tx);
                        }
                    }
                }
            })
            .expect("Failed to spawn library worker thread");

        LibraryWorkerHandle { req_tx, res_rx }
    }
}
