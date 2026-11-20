use std::io::SeekFrom;
use std::path::PathBuf;
use axum::body::Body;
use axum::extract::Query;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::Deserialize;
use tokio::fs::File;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

#[derive(Deserialize)]
pub struct StreamQuery {
    pub path: String,
}

pub async fn handle_stream(
    headers: HeaderMap,
    Query(query): Query<StreamQuery>,
) -> Result<Response, (StatusCode, String)> {
    let path = PathBuf::from(&query.path);

    // Basic path traversal and existence check
    if !path.exists() || !path.is_file() {
        return Err((StatusCode::NOT_FOUND, "Media file not found".to_string()));
    }

    let file_meta = tokio::fs::metadata(&path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    let total_size = file_meta.len();

    let content_type = mime_guess::from_path(&path)
        .first_or_octet_stream()
        .to_string();

    let mut file = File::open(&path)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    // Check Range header
    if let Some(range_header) = headers.get(header::RANGE).and_then(|h| h.to_str().ok()) {
        if let Some((start, end)) = parse_range_header(range_header, total_size) {
            let chunk_size = end - start + 1;
            file.seek(SeekFrom::Start(start))
                .await
                .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

            let limited_reader = file.take(chunk_size);
            let stream = ReaderStream::new(limited_reader);
            let body = Body::from_stream(stream);

            let content_range = format!("bytes {}-{}/{}", start, end, total_size);

            return Ok((
                StatusCode::PARTIAL_CONTENT,
                [
                    (header::CONTENT_RANGE, content_range),
                    (header::ACCEPT_RANGES, "bytes".to_string()),
                    (header::CONTENT_LENGTH, chunk_size.to_string()),
                    (header::CONTENT_TYPE, content_type),
                ],
                body,
            )
                .into_response());
        }
    }

    // Full file stream
    let stream = ReaderStream::new(file);
    let body = Body::from_stream(stream);

    Ok((
        StatusCode::OK,
        [
            (header::ACCEPT_RANGES, "bytes".to_string()),
            (header::CONTENT_LENGTH, total_size.to_string()),
            (header::CONTENT_TYPE, content_type),
        ],
        body,
    )
        .into_response())
}

fn parse_range_header(range: &str, total_size: u64) -> Option<(u64, u64)> {
    if !range.starts_with("bytes=") {
        return None;
    }

    let specs = &range["bytes=".len()..];
    let parts: Vec<&str> = specs.split('-').collect();
    if parts.len() != 2 {
        return None;
    }

    let start = parts[0].parse::<u64>().ok()?;
    let end = if parts[1].is_empty() {
        total_size.saturating_sub(1)
    } else {
        parts[1].parse::<u64>().ok()?.min(total_size.saturating_sub(1))
    };

    if start <= end && start < total_size {
        Some((start, end))
    } else {
        None
    }
}
