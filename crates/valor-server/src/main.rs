use std::net::SocketAddr;
use std::path::PathBuf;
use valor_db::Database;
use valor_server::start_server;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt::init();

    let port: u16 = std::env::var("VALOR_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));

    let db_path = std::env::current_dir()
        .map(|p| p.join(".valor_data").join("valor.db"))
        .unwrap_or_else(|_| PathBuf::from("valor.db"));

    if let Some(parent) = db_path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }

    let db = match Database::open(&db_path) {
        Ok(db) => db,
        Err(e) => {
            tracing::warn!("Fallback to in-memory database: {}", e);
            Database::in_memory()?
        }
    };

    tracing::info!("Starting Valor High-Performance Rust Server on port {}", port);
    start_server(addr, db).await?;
    Ok(())
}
