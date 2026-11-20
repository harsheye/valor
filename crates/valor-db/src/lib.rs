use std::path::Path;
use std::sync::Arc;
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Serialization error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Item not found: {0}")]
    NotFound(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaRecord {
    pub id: String,
    pub title: String,
    pub file_path: String,
    pub duration: f64,
    pub current_time: f64,
    pub last_played_date: String,
    pub is_remote: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BookmarkRecord {
    pub id: String,
    pub video_id: String,
    pub time: f64,
    pub note: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,
    pub volume: f64,
    pub is_muted: bool,
    pub default_audio_lang: String,
    pub default_sub_lang: String,
    pub audio_boost: f64,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: "black_ops".to_string(),
            volume: 1.0,
            is_muted: false,
            default_audio_lang: "ENG".to_string(),
            default_sub_lang: "ENG".to_string(),
            audio_boost: 100.0,
        }
    }
}

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
}

impl Database {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, DbError> {
        let conn = Connection::open(path)?;
        
        // Performance PRAGMAs
        conn.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             PRAGMA foreign_keys = ON;
             PRAGMA cache_size = -32000;"
        )?;

        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_tables()?;
        Ok(db)
    }

    pub fn in_memory() -> Result<Self, DbError> {
        let conn = Connection::open_in_memory()?;
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
        };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> Result<(), DbError> {
        let conn = self.conn.lock();
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS media_history (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                file_path TEXT NOT NULL,
                duration REAL NOT NULL DEFAULT 0.0,
                current_time REAL NOT NULL DEFAULT 0.0,
                last_played_date TEXT NOT NULL,
                is_remote INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS bookmarks (
                id TEXT PRIMARY KEY,
                video_id TEXT NOT NULL,
                time REAL NOT NULL,
                note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY (video_id) REFERENCES media_history(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );"
        )?;
        Ok(())
    }

    // Media History Operations
    pub fn save_media(&self, item: &MediaRecord) -> Result<(), DbError> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO media_history (id, title, file_path, duration, current_time, last_played_date, is_remote)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                file_path = excluded.file_path,
                duration = excluded.duration,
                current_time = excluded.current_time,
                last_played_date = excluded.last_played_date,
                is_remote = excluded.is_remote;",
            params![
                item.id,
                item.title,
                item.file_path,
                item.duration,
                item.current_time,
                item.last_played_date,
                if item.is_remote { 1 } else { 0 },
            ],
        )?;
        Ok(())
    }

    pub fn update_timestamp(&self, id: &str, current_time: f64) -> Result<(), DbError> {
        let conn = self.conn.lock();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE media_history SET current_time = ?1, last_played_date = ?2 WHERE id = ?3;",
            params![current_time, now, id],
        )?;
        Ok(())
    }

    pub fn get_media(&self, id: &str) -> Result<Option<MediaRecord>, DbError> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, title, file_path, duration, current_time, last_played_date, is_remote
             FROM media_history WHERE id = ?1;",
        )?;
        let mut rows = stmt.query(params![id])?;

        if let Some(row) = rows.next()? {
            Ok(Some(MediaRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                duration: row.get(3)?,
                current_time: row.get(4)?,
                last_played_date: row.get(5)?,
                is_remote: row.get::<_, i64>(6)? != 0,
            }))
        } else {
            Ok(None)
        }
    }

    pub fn list_history(&self, limit: usize) -> Result<Vec<MediaRecord>, DbError> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, title, file_path, duration, current_time, last_played_date, is_remote
             FROM media_history ORDER BY last_played_date DESC LIMIT ?1;",
        )?;
        let rows = stmt.query_map(params![limit as i64], |row| {
            Ok(MediaRecord {
                id: row.get(0)?,
                title: row.get(1)?,
                file_path: row.get(2)?,
                duration: row.get(3)?,
                current_time: row.get(4)?,
                last_played_date: row.get(5)?,
                is_remote: row.get::<_, i64>(6)? != 0,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    // Bookmarks
    pub fn add_bookmark(&self, bm: &BookmarkRecord) -> Result<(), DbError> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO bookmarks (id, video_id, time, note, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(id) DO UPDATE SET time = excluded.time, note = excluded.note;",
            params![bm.id, bm.video_id, bm.time, bm.note, bm.created_at],
        )?;
        Ok(())
    }

    pub fn list_bookmarks(&self, video_id: &str) -> Result<Vec<BookmarkRecord>, DbError> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, video_id, time, note, created_at FROM bookmarks
             WHERE video_id = ?1 ORDER BY time ASC;",
        )?;
        let rows = stmt.query_map(params![video_id], |row| {
            Ok(BookmarkRecord {
                id: row.get(0)?,
                video_id: row.get(1)?,
                time: row.get(2)?,
                note: row.get(3)?,
                created_at: row.get(4)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    // Settings
    pub fn load_settings(&self) -> Result<AppSettings, DbError> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = 'app_settings';")?;
        let mut rows = stmt.query([])?;
        if let Some(row) = rows.next()? {
            let json_str: String = row.get(0)?;
            let settings: AppSettings = serde_json::from_str(&json_str)?;
            Ok(settings)
        } else {
            Ok(AppSettings::default())
        }
    }

    pub fn save_settings(&self, settings: &AppSettings) -> Result<(), DbError> {
        let conn = self.conn.lock();
        let json_str = serde_json::to_string(settings)?;
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('app_settings', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
            params![json_str],
        )?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_lifecycle() {
        let db = Database::in_memory().expect("in-memory db");
        let item = MediaRecord {
            id: "vid-1".into(),
            title: "Test Movie".into(),
            file_path: "C:/Videos/movie.mp4".into(),
            duration: 120.0,
            current_time: 45.5,
            last_played_date: "2026-11-21T00:00:00Z".into(),
            is_remote: false,
        };

        db.save_media(&item).unwrap();
        let fetched = db.get_media("vid-1").unwrap().expect("found");
        assert_eq!(fetched.title, "Test Movie");
        assert_eq!(fetched.current_time, 45.5);

        db.update_timestamp("vid-1", 60.0).unwrap();
        let updated = db.get_media("vid-1").unwrap().expect("found");
        assert_eq!(updated.current_time, 60.0);
    }
}
