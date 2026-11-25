use std::sync::mpsc::{Receiver, Sender};
use std::sync::Arc;
use valor_core::db::Database;
use valor_core::models::{HistoryEntry, WatchSession};

#[derive(Debug, Clone)]
pub enum HistoryWorkerRequest {
    LoadInitial,
    QuerySessions {
        search: Option<String>,
        pill: String,
        day: Option<String>,
        offset: usize,
        limit: usize,
    },
    DeleteSession(String),
    RestoreSession(Box<WatchSession>),
    ClearHistory {
        reset_positions: bool,
    },
}

#[derive(Debug, Clone)]
pub enum HistoryWorkerResponse {
    InitialLoaded {
        heatmap: Vec<(String, usize, f64)>,
        total_count: usize,
        sessions: Vec<WatchSession>,
        resume_entries: Vec<HistoryEntry>,
    },
    SessionsLoaded {
        sessions: Vec<WatchSession>,
        total_count: usize,
    },
    SessionDeleted(String),
    SessionRestored(Box<WatchSession>),
    HistoryCleared,
}

pub struct HistoryDbWorker {
    pub req_tx: Sender<HistoryWorkerRequest>,
    pub res_rx: Receiver<HistoryWorkerResponse>,
}

impl HistoryDbWorker {
    pub fn spawn(db: Arc<Database>) -> Self {
        let (req_tx, req_rx) = std::sync::mpsc::channel::<HistoryWorkerRequest>();
        let (res_tx, res_rx) = std::sync::mpsc::channel::<HistoryWorkerResponse>();

        std::thread::Builder::new()
            .name("valor-history-worker".into())
            .spawn(move || {
                while let Ok(req) = req_rx.recv() {
                    match req {
                        HistoryWorkerRequest::LoadInitial => {
                            let heatmap = db.get_watch_sessions_heatmap().unwrap_or_default();
                            let total_count = db.get_watch_sessions_count().unwrap_or(0);
                            let sessions = db.get_watch_sessions(50).unwrap_or_default();
                            let resume_entries = db.get_history(10).unwrap_or_default();
                            let _ = res_tx.send(HistoryWorkerResponse::InitialLoaded {
                                heatmap,
                                total_count,
                                sessions,
                                resume_entries,
                            });
                        }
                        HistoryWorkerRequest::QuerySessions {
                            search,
                            pill,
                            day,
                            offset,
                            limit,
                        } => {
                            let (sessions, total_count) = db
                                .get_watch_sessions_filtered(
                                    search.as_deref(),
                                    &pill,
                                    day.as_deref(),
                                    offset,
                                    limit,
                                )
                                .unwrap_or_default();
                            let _ = res_tx.send(HistoryWorkerResponse::SessionsLoaded {
                                sessions,
                                total_count,
                            });
                        }
                        HistoryWorkerRequest::DeleteSession(id) => {
                            let _ = db.delete_watch_session(&id);
                            let _ = res_tx.send(HistoryWorkerResponse::SessionDeleted(id));
                        }
                        HistoryWorkerRequest::RestoreSession(session) => {
                            let _ = db.record_watch_session(&session);
                            let _ = res_tx.send(HistoryWorkerResponse::SessionRestored(session));
                        }
                        HistoryWorkerRequest::ClearHistory { reset_positions } => {
                            let _ = db.clear_watch_sessions(reset_positions);
                            let _ = res_tx.send(HistoryWorkerResponse::HistoryCleared);
                        }
                    }
                }
            })
            .expect("Failed to spawn valor-history-worker thread");

        Self { req_tx, res_rx }
    }
}
