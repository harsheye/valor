use std::path::PathBuf;
use axum::extract::Query;
use axum::http::StatusCode;
use axum::response::Json;
use serde::Deserialize;
use valor_engine::{probe_media, MediaMetadata};

#[derive(Deserialize)]
pub struct ProbeQuery {
    pub path: String,
}

pub async fn handle_probe(
    Query(query): Query<ProbeQuery>,
) -> Result<Json<MediaMetadata>, (StatusCode, String)> {
    let path = PathBuf::from(&query.path);

    if !path.exists() {
        return Err((StatusCode::NOT_FOUND, "File does not exist".to_string()));
    }

    match probe_media(&path) {
        Ok(meta) => Ok(Json(meta)),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, e.to_string())),
    }
}
