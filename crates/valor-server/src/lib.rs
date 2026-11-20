pub mod stream;
pub mod probe;
pub mod embed;
pub mod ws;

use std::net::SocketAddr;
use axum::{
    routing::get,
    Router, Json, extract::Query, http::StatusCode,
};
use serde::{Deserialize, Serialize};
use tower_http::cors::{Any, CorsLayer};
use valor_db::{Database, MediaRecord, BookmarkRecord};

#[derive(Clone)]
pub struct AppState {
    pub db: Database,
    pub ws: ws::WsState,
}

#[derive(Serialize)]
pub struct ServerStatus {
    pub name: &'static str,
    pub version: &'static str,
    pub uptime_secs: u64,
    pub status: &'static str,
}

static START_TIME: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();

pub fn create_router(db: Database) -> Router {
    START_TIME.get_or_init(std::time::Instant::now);

    let state = AppState {
        db,
        ws: ws::WsState::new(),
    };

    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    Router::new()
        .route("/api/status", get(handle_status))
        .route("/api/stream", get(stream::handle_stream))
        .route("/api/probe", get(probe::handle_probe))
        .route("/api/history", get(handle_get_history).post(handle_save_history))
        .route("/api/bookmarks", get(handle_get_bookmarks).post(handle_add_bookmark))
        .route("/embed", get(embed::handle_embed))
        .route("/api/ws", get(ws::handle_ws))
        .with_state(state.ws)
        .layer(axum::Extension(state.db))
        .layer(cors)
}

pub async fn start_server(addr: SocketAddr, db: Database) -> Result<(), Box<dyn std::error::Error>> {
    let app = create_router(db);
    let listener = tokio::net::TcpListener::bind(addr).await?;
    tracing::info!("Valor High-Performance Rust Server listening on http://{}", addr);
    axum::serve(listener, app).await?;
    Ok(())
}

async fn handle_status() -> Json<ServerStatus> {
    let uptime = START_TIME.get().map(|t| t.elapsed().as_secs()).unwrap_or(0);
    Json(ServerStatus {
        name: "Valor Unified Server",
        version: "0.1.0",
        uptime_secs: uptime,
        status: "online",
    })
}

#[derive(Deserialize)]
struct HistoryQuery {
    limit: Option<usize>,
}

async fn handle_get_history(
    axum::Extension(db): axum::Extension<Database>,
    Query(q): Query<HistoryQuery>,
) -> Result<Json<Vec<MediaRecord>>, (StatusCode, String)> {
    let limit = q.limit.unwrap_or(20);
    db.list_history(limit)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn handle_save_history(
    axum::Extension(db): axum::Extension<Database>,
    Json(record): Json<MediaRecord>,
) -> Result<StatusCode, (StatusCode, String)> {
    db.save_media(&record)
        .map(|_| StatusCode::CREATED)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

#[derive(Deserialize)]
struct BookmarkQuery {
    video_id: String,
}

async fn handle_get_bookmarks(
    axum::Extension(db): axum::Extension<Database>,
    Query(q): Query<BookmarkQuery>,
) -> Result<Json<Vec<BookmarkRecord>>, (StatusCode, String)> {
    db.list_bookmarks(&q.video_id)
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

async fn handle_add_bookmark(
    axum::Extension(db): axum::Extension<Database>,
    Json(bm): Json<BookmarkRecord>,
) -> Result<StatusCode, (StatusCode, String)> {
    db.add_bookmark(&bm)
        .map(|_| StatusCode::CREATED)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}
