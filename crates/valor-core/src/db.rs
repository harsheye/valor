use crate::models::*;
use chrono::Utc;
use parking_lot::Mutex;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::Path;
use std::sync::Arc;
use thiserror::Error;
use tracing::info;

#[derive(Error, Debug)]
pub enum DbError {
    #[error("SQLite error: {0}")]
    Sqlite(#[from] rusqlite::Error),
    #[error("Item not found: {0}")]
    NotFound(String),
}

#[derive(Clone)]
pub struct Database {
    conn: Arc<Mutex<Connection>>,
    path: Option<std::path::PathBuf>,
}

impl Database {
    pub fn open<P: AsRef<Path>>(path: P) -> Result<Self, DbError> {
        let path_buf = path.as_ref().to_path_buf();
        let conn = Connection::open(&path_buf)?;
        let _ = conn.busy_timeout(std::time::Duration::from_millis(5000));
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        let _ = conn.pragma_update(None, "synchronous", "NORMAL");
        let _ = conn.pragma_update(None, "foreign_keys", "ON");
        let _ = conn.pragma_update(None, "cache_size", -64000);

        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
            path: Some(path_buf),
        };
        db.run_migrations()?;
        Ok(db)
    }

    pub fn in_memory() -> Result<Self, DbError> {
        let conn = Connection::open_in_memory()?;
        let _ = conn.busy_timeout(std::time::Duration::from_millis(5000));
        let _ = conn.pragma_update(None, "foreign_keys", "ON");
        let db = Self {
            conn: Arc::new(Mutex::new(conn)),
            path: None,
        };
        db.run_migrations()?;
        Ok(db)
    }

    /// Opens a separate read-only connection with busy_timeout configured (WAL concurrency).
    pub fn open_reader(&self) -> Result<Connection, DbError> {
        if let Some(ref path) = self.path {
            let conn = Connection::open_with_flags(
                path,
                rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
                    | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
            )?;
            conn.busy_timeout(std::time::Duration::from_millis(5000))?;
            let _ = conn.pragma_update(None, "query_only", "ON");
            Ok(conn)
        } else {
            let conn = Connection::open_in_memory()?;
            conn.busy_timeout(std::time::Duration::from_millis(5000))?;
            Ok(conn)
        }
    }

    fn run_migrations(&self) -> Result<(), DbError> {
        let conn = self.conn.lock();

        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL
            );",
        )?;

        let current_version: i64 = conn
            .query_row(
                "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if current_version < 1 {
            info!("Applying schema migration v1");
            conn.execute_batch(
                "
                -- Watched library folders
                CREATE TABLE IF NOT EXISTS folders (
                    id TEXT PRIMARY KEY,
                    path TEXT UNIQUE NOT NULL,
                    folder_type TEXT NOT NULL DEFAULT 'Other', -- 'Movies', 'Shows', 'Music', 'Other'
                    enabled INTEGER NOT NULL DEFAULT 1,
                    ignore_globs TEXT,
                    last_scanned_at TEXT,
                    created_at TEXT NOT NULL
                );

                -- Raw scanned files on disk
                CREATE TABLE IF NOT EXISTS media_files (
                    id TEXT PRIMARY KEY,
                    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
                    path TEXT UNIQUE NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    mtime_secs INTEGER NOT NULL,
                    fingerprint TEXT NOT NULL,
                    legacy_fingerprint TEXT,
                    is_missing INTEGER NOT NULL DEFAULT 0,
                    last_seen_at TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_media_files_fingerprint ON media_files(fingerprint);
                CREATE INDEX IF NOT EXISTS idx_media_files_legacy_fp ON media_files(legacy_fingerprint);
                CREATE INDEX IF NOT EXISTS idx_media_files_path ON media_files(path);

                -- TV Series metadata
                CREATE TABLE IF NOT EXISTS series (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    year INTEGER,
                    overview TEXT,
                    poster_path TEXT,
                    tmdb_id INTEGER,
                    created_at TEXT NOT NULL
                );

                -- Library items (movies, episodes, tracks)
                CREATE TABLE IF NOT EXISTS items (
                    id TEXT PRIMARY KEY,
                    file_id TEXT REFERENCES media_files(id) ON DELETE CASCADE,
                    fingerprint TEXT NOT NULL,
                    title TEXT NOT NULL,
                    duration REAL NOT NULL DEFAULT 0.0,
                    width INTEGER,
                    height INTEGER,
                    is_hdr INTEGER NOT NULL DEFAULT 0,
                    video_codec TEXT,
                    audio_codec TEXT,
                    series_id TEXT REFERENCES series(id) ON DELETE SET NULL,
                    season_number INTEGER,
                    episode_number INTEGER,
                    is_missing INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_items_fingerprint ON items(fingerprint);
                CREATE INDEX IF NOT EXISTS idx_items_series ON items(series_id, season_number, episode_number);

                -- Playlists and collections
                CREATE TABLE IF NOT EXISTS collections (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    collection_type TEXT NOT NULL DEFAULT 'playlist', -- 'single', 'playlist', 'series'
                    current_index INTEGER NOT NULL DEFAULT 0,
                    is_pinned INTEGER NOT NULL DEFAULT 0,
                    last_played_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS collection_items (
                    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
                    item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
                    position_order INTEGER NOT NULL,
                    PRIMARY KEY (collection_id, item_id)
                );
                CREATE INDEX IF NOT EXISTS idx_coll_items_order ON collection_items(collection_id, position_order);

                -- Playback resume positions (keyed strictly by fingerprint)
                CREATE TABLE IF NOT EXISTS playback_positions (
                    fingerprint TEXT PRIMARY KEY,
                    position_secs REAL NOT NULL,
                    duration_secs REAL NOT NULL,
                    completed INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL
                );

                -- Cached thumbnails
                CREATE TABLE IF NOT EXISTS thumbnails (
                    fingerprint TEXT PRIMARY KEY,
                    thumbnail_path TEXT NOT NULL,
                    width INTEGER NOT NULL,
                    height INTEGER NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    last_accessed_at TEXT NOT NULL
                );

                -- Scanner runs and errors
                CREATE TABLE IF NOT EXISTS scan_runs (
                    id TEXT PRIMARY KEY,
                    folder_id TEXT,
                    files_seen INTEGER NOT NULL DEFAULT 0,
                    files_new INTEGER NOT NULL DEFAULT 0,
                    files_updated INTEGER NOT NULL DEFAULT 0,
                    files_removed INTEGER NOT NULL DEFAULT 0,
                    errors_count INTEGER NOT NULL DEFAULT 0,
                    started_at TEXT NOT NULL,
                    finished_at TEXT
                );

                CREATE TABLE IF NOT EXISTS scan_errors (
                    id TEXT PRIMARY KEY,
                    scan_run_id TEXT REFERENCES scan_runs(id) ON DELETE CASCADE,
                    file_path TEXT NOT NULL,
                    error_message TEXT NOT NULL,
                    occurred_at TEXT NOT NULL
                );

                -- Generic settings key-value table
                CREATE TABLE IF NOT EXISTS settings_kv (
                    key TEXT PRIMARY KEY,
                    val TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                -- Installed skins registry
                CREATE TABLE IF NOT EXISTS skins_installed (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    version TEXT NOT NULL,
                    author TEXT,
                    is_active INTEGER NOT NULL DEFAULT 0,
                    folder_path TEXT NOT NULL,
                    installed_at TEXT NOT NULL
                );

                -- Full-Text Search (FTS5) table for instant search
                CREATE VIRTUAL TABLE IF NOT EXISTS library_fts USING fts5(
                    item_id UNINDEXED,
                    title,
                    series_title,
                    tokenize = 'porter unicode61'
                );

                INSERT INTO schema_migrations (version, applied_at) VALUES (1, datetime('now'));
                "
            )?;
        }

        if current_version < 2 {
            info!("Applying schema migration v2");
            conn.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS bookmarks (
                    id TEXT PRIMARY KEY,
                    fingerprint TEXT NOT NULL,
                    title TEXT NOT NULL,
                    start_secs REAL NOT NULL,
                    end_secs REAL,
                    category TEXT NOT NULL DEFAULT 'custom',
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_bookmarks_fingerprint ON bookmarks(fingerprint);

                INSERT INTO schema_migrations (version, applied_at) VALUES (2, datetime('now'));
                ",
            )?;
        }

        if current_version < 3 {
            info!("Applying schema migration v3");
            // Add legacy_fingerprint if missing (safe on SQLite >= 3.35)
            let _ =
                conn.execute_batch("ALTER TABLE media_files ADD COLUMN legacy_fingerprint TEXT;");
            let _ = conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_media_files_legacy_fp ON media_files(legacy_fingerprint);");

            // Unified history view: single entry per playlist/collection, joining active item & playback position
            conn.execute_batch(
                "
                CREATE VIEW IF NOT EXISTS history_view AS
                SELECT 
                    c.id AS collection_id,
                    c.name AS collection_name,
                    c.collection_type AS collection_type,
                    c.current_index AS current_index,
                    c.last_played_at AS last_played_at,
                    i.id AS active_item_id,
                    i.title AS active_item_title,
                    i.fingerprint AS active_fingerprint,
                    i.duration AS total_duration_secs,
                    COALESCE(p.position_secs, 0.0) AS position_secs,
                    COALESCE(p.completed, 0) AS completed,
                    COALESCE(p.updated_at, c.updated_at) AS position_updated_at
                FROM collections c
                LEFT JOIN collection_items ci 
                    ON ci.collection_id = c.id AND ci.position_order = c.current_index
                LEFT JOIN items i 
                    ON i.id = ci.item_id
                LEFT JOIN playback_positions p 
                    ON p.fingerprint = i.fingerprint
                WHERE c.last_played_at IS NOT NULL
                ORDER BY c.last_played_at DESC;

                INSERT INTO schema_migrations (version, applied_at) VALUES (3, datetime('now'));
                ",
            )?;
        }

        if current_version < 4 {
            info!("Applying schema migration v4");
            conn.execute_batch(
                "
                -- Persistent analysis queue (V2 requirement)
                CREATE TABLE IF NOT EXISTS analysis_queue (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_id TEXT NOT NULL,
                    fingerprint TEXT NOT NULL,
                    path TEXT NOT NULL,
                    priority INTEGER NOT NULL DEFAULT 0, -- 0 = background, 100 = visible/focused
                    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
                    retries INTEGER NOT NULL DEFAULT 0,
                    error_message TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_analysis_queue_status ON analysis_queue(status, priority DESC, id ASC);
                CREATE UNIQUE INDEX IF NOT EXISTS idx_analysis_queue_fp ON analysis_queue(fingerprint);

                -- FTS5 automatic synchronization triggers (V5 requirement)
                CREATE TRIGGER IF NOT EXISTS trg_items_ai AFTER INSERT ON items BEGIN
                    INSERT INTO library_fts (item_id, title, series_title)
                    VALUES (new.id, new.title, COALESCE((SELECT title FROM series WHERE id = new.series_id), ''));
                END;

                CREATE TRIGGER IF NOT EXISTS trg_items_ad AFTER DELETE ON items BEGIN
                    DELETE FROM library_fts WHERE item_id = old.id;
                END;

                CREATE TRIGGER IF NOT EXISTS trg_items_au AFTER UPDATE OF title, series_id ON items BEGIN
                    DELETE FROM library_fts WHERE item_id = old.id;
                    INSERT INTO library_fts (item_id, title, series_title)
                    VALUES (new.id, new.title, COALESCE((SELECT title FROM series WHERE id = new.series_id), ''));
                END;

                INSERT INTO schema_migrations (version, applied_at) VALUES (4, datetime('now'));
                ",
            )?;
        }

        Ok(())
    }

    /// Saves or updates a playback position for a given fingerprint.
    pub fn save_playback_position(&self, pos: &PlaybackPosition) -> Result<(), DbError> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO playback_positions (fingerprint, position_secs, duration_secs, completed, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(fingerprint) DO UPDATE SET
                position_secs = excluded.position_secs,
                duration_secs = excluded.duration_secs,
                completed = excluded.completed,
                updated_at = excluded.updated_at;",
            params![
                pos.fingerprint,
                pos.position_secs,
                pos.duration_secs,
                pos.completed as i32,
                pos.updated_at.to_rfc3339()
            ],
        )?;
        Ok(())
    }

    /// Gets a playback position by fingerprint.
    pub fn get_playback_position(
        &self,
        fingerprint: &str,
    ) -> Result<Option<PlaybackPosition>, DbError> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT fingerprint, position_secs, duration_secs, completed, updated_at
             FROM playback_positions WHERE fingerprint = ?1",
        )?;
        let pos = stmt
            .query_row(params![fingerprint], |row| {
                let updated_str: String = row.get(4)?;
                let updated_at = chrono::DateTime::parse_from_rfc3339(&updated_str)
                    .map(|dt| dt.with_timezone(&Utc))
                    .unwrap_or_else(|_| Utc::now());

                Ok(PlaybackPosition {
                    fingerprint: row.get(0)?,
                    position_secs: row.get(1)?,
                    duration_secs: row.get(2)?,
                    completed: row.get::<_, i32>(3)? != 0,
                    updated_at,
                })
            })
            .optional()?;

        Ok(pos)
    }

    /// Retrieves history cards: one entry per collection/playlist, sorted by last_played_at.
    pub fn get_history(&self, limit: usize) -> Result<Vec<HistoryEntry>, DbError> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT 
                c.id, c.name, c.collection_type, c.current_index, c.last_played_at,
                (SELECT COUNT(*) FROM collection_items ci WHERE ci.collection_id = c.id) as total_items,
                COALESCE(i.title, c.name) as current_title,
                COALESCE(i.fingerprint, '') as current_fingerprint,
                COALESCE(p.position_secs, 0.0) as pos_secs,
                COALESCE(p.duration_secs, 0.0) as dur_secs
             FROM collections c
             LEFT JOIN collection_items ci ON ci.collection_id = c.id AND ci.position_order = c.current_index
             LEFT JOIN items i ON i.id = ci.item_id
             LEFT JOIN playback_positions p ON p.fingerprint = i.fingerprint
             WHERE c.last_played_at IS NOT NULL
             ORDER BY c.last_played_at DESC
             LIMIT ?1"
        )?;

        let rows = stmt.query_map(params![limit as i64], |row| {
            let last_played_str: Option<String> = row.get(4)?;
            let last_played_at = last_played_str
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(Utc::now);

            let pos_secs: f64 = row.get(8)?;
            let dur_secs: f64 = row.get(9)?;
            let progress_ratio = if dur_secs > 0.0 {
                (pos_secs / dur_secs).clamp(0.0, 1.0)
            } else {
                0.0
            };

            Ok(HistoryEntry {
                collection_id: row.get(0)?,
                collection_name: row.get(1)?,
                collection_type: row.get(2)?,
                current_index: row.get::<_, i64>(3)? as usize,
                total_items: row.get::<_, i64>(5)? as usize,
                current_item_title: row.get(6)?,
                current_item_fingerprint: row.get(7)?,
                position_secs: pos_secs,
                duration_secs: dur_secs,
                progress_ratio,
                last_played_at,
            })
        })?;

        let mut history = Vec::new();
        for r in rows {
            history.push(r?);
        }
        Ok(history)
    }

    /// Saves or updates a bookmark
    pub fn save_bookmark(&self, b: &Bookmark) -> Result<(), DbError> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO bookmarks (id, fingerprint, title, start_secs, end_secs, category, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                start_secs = excluded.start_secs,
                end_secs = excluded.end_secs,
                category = excluded.category;",
            params![
                b.id,
                b.fingerprint,
                b.title,
                b.start_secs,
                b.end_secs,
                b.category,
                b.created_at.to_rfc3339()
            ],
        )?;
        Ok(())
    }

    /// Retrieves all bookmarks for a media item
    pub fn get_bookmarks(&self, fingerprint: &str) -> Result<Vec<Bookmark>, DbError> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, fingerprint, title, start_secs, end_secs, category, created_at
             FROM bookmarks WHERE fingerprint = ?1 ORDER BY start_secs ASC",
        )?;

        let rows = stmt.query_map(params![fingerprint], |row| {
            let created_str: String = row.get(6)?;
            let created_at = chrono::DateTime::parse_from_rfc3339(&created_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            Ok(Bookmark {
                id: row.get(0)?,
                fingerprint: row.get(1)?,
                title: row.get(2)?,
                start_secs: row.get(3)?,
                end_secs: row.get(4)?,
                category: row.get(5)?,
                created_at,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    /// Deletes a bookmark by ID
    pub fn delete_bookmark(&self, id: &str) -> Result<(), DbError> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM bookmarks WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// Queries all cached file records into an in-memory map for instantaneous incremental scanning
    pub fn get_all_cached_file_info(
        &self,
    ) -> Result<std::collections::HashMap<String, CachedFileInfo>, DbError> {
        let conn = self.conn.lock();
        let mut stmt =
            conn.prepare("SELECT path, size_bytes, mtime_secs, fingerprint FROM media_files")?;
        let mut map = std::collections::HashMap::new();
        let rows = stmt.query_map([], |row| {
            let path: String = row.get(0)?;
            let size_bytes: i64 = row.get(1)?;
            let mtime_secs: i64 = row.get(2)?;
            let fingerprint: String = row.get(3)?;
            Ok((
                path,
                CachedFileInfo {
                    size_bytes: size_bytes as u64,
                    mtime_secs,
                    fingerprint,
                },
            ))
        })?;
        for r in rows {
            let (path, info) = r?;
            map.insert(path, info);
        }
        Ok(map)
    }

    /// High-throughput batched upsert of scanned files, items, and FTS entries in a single transaction
    pub fn batch_upsert_scanned_files(&self, records: &[ScannedFileRecord]) -> Result<(), DbError> {
        if records.is_empty() {
            return Ok(());
        }

        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;

        {
            let mut stmt_file = tx.prepare(
                "INSERT INTO media_files (id, path, size_bytes, mtime_secs, fingerprint, legacy_fingerprint, is_missing, last_seen_at, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, ?7, ?8)
                 ON CONFLICT(path) DO UPDATE SET
                    size_bytes = excluded.size_bytes,
                    mtime_secs = excluded.mtime_secs,
                    fingerprint = excluded.fingerprint,
                    legacy_fingerprint = excluded.legacy_fingerprint,
                    is_missing = 0,
                    last_seen_at = excluded.last_seen_at;"
            )?;

            let mut stmt_item = tx.prepare(
                "INSERT INTO items (id, fingerprint, title, duration, width, height, is_hdr, video_codec, audio_codec, series_id, season_number, episode_number, is_missing, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
                 ON CONFLICT(id) DO UPDATE SET
                    title = excluded.title,
                    duration = excluded.duration,
                    width = excluded.width,
                    height = excluded.height,
                    is_hdr = excluded.is_hdr,
                    video_codec = excluded.video_codec,
                    audio_codec = excluded.audio_codec,
                    series_id = excluded.series_id,
                    season_number = excluded.season_number,
                    episode_number = excluded.episode_number,
                    is_missing = excluded.is_missing,
                    updated_at = excluded.updated_at;"
            )?;

            let mut stmt_fts_del = tx.prepare("DELETE FROM library_fts WHERE item_id = ?1")?;
            let mut stmt_fts_ins = tx.prepare(
                "INSERT INTO library_fts (item_id, title, series_title) VALUES (?1, ?2, ?3)",
            )?;
            let mut stmt_queue = tx.prepare(
                "INSERT INTO analysis_queue (file_id, fingerprint, path, priority, status, retries, created_at, updated_at)
                 VALUES (?1, ?2, ?3, 0, 'pending', 0, ?4, ?4)
                 ON CONFLICT(fingerprint) DO NOTHING;",
            )?;

            let now = Utc::now().to_rfc3339();

            for r in records {
                stmt_file.execute(params![
                    r.id,
                    r.path,
                    r.size_bytes as i64,
                    r.mtime_secs,
                    r.fingerprint,
                    r.legacy_fingerprint,
                    now,
                    now,
                ])?;

                stmt_item.execute(params![
                    r.item.id,
                    r.item.fingerprint,
                    r.item.title,
                    r.item.duration,
                    r.item.width,
                    r.item.height,
                    r.item.is_hdr as i32,
                    r.item.video_codec,
                    r.item.audio_codec,
                    r.item.series_id,
                    r.item.season_number,
                    r.item.episode_number,
                    r.item.is_missing as i32,
                    r.item.created_at.to_rfc3339(),
                    r.item.updated_at.to_rfc3339(),
                ])?;

                let _ = stmt_fts_del.execute(params![r.item.id]);
                let _ = stmt_fts_ins.execute(params![r.item.id, r.item.title, ""]);
                let _ = stmt_queue.execute(params![r.id, r.fingerprint, r.path, now]);
            }
        }

        tx.commit()?;
        Ok(())
    }

    /// Finds a media item for migration by legacy fingerprint or filename + size.
    /// If multiple candidate files match in different folders, returns MigrationMatchResult::Ambiguous and NEVER auto-picks.
    pub fn find_item_for_migration(
        &self,
        legacy_fp: Option<&str>,
        filename: &str,
        size_bytes: Option<u64>,
    ) -> Result<MigrationMatchResult, DbError> {
        let conn = self.conn.lock();

        // 1. Check legacy fingerprint in media_files
        if let Some(lfp) = legacy_fp {
            let mut stmt = conn.prepare(
                "SELECT i.id, i.fingerprint, mf.path, i.title, i.duration, mf.size_bytes,
                        i.width, i.height, i.is_hdr, i.video_codec, i.audio_codec, i.series_id,
                        i.season_number, i.episode_number, i.is_missing, i.created_at, i.updated_at
                 FROM media_files mf
                 JOIN items i ON i.fingerprint = mf.fingerprint
                 WHERE mf.legacy_fingerprint = ?1 OR mf.fingerprint = ?1
                 LIMIT 2",
            )?;
            let mut rows = stmt.query(params![lfp])?;
            let mut items = Vec::new();
            while let Some(row) = rows.next()? {
                items.push(self.row_to_item(row)?);
            }
            if items.len() == 1 {
                return Ok(MigrationMatchResult::Matched(
                    Box::new(items.remove(0)),
                    MigrationMatchKind::LegacyFingerprint,
                ));
            } else if items.len() > 1 {
                let paths = items.iter().map(|it| it.file_path.clone()).collect();
                return Ok(MigrationMatchResult::Ambiguous(paths));
            }
        }

        // 2. Check filename + size match (if ambiguous across multiple folders, NEVER auto-pick!)
        let pattern = format!("%{}", filename);
        if let Some(sz) = size_bytes {
            let mut stmt = conn.prepare(
                "SELECT i.id, i.fingerprint, mf.path, i.title, i.duration, mf.size_bytes,
                        i.width, i.height, i.is_hdr, i.video_codec, i.audio_codec, i.series_id,
                        i.season_number, i.episode_number, i.is_missing, i.created_at, i.updated_at
                 FROM media_files mf
                 JOIN items i ON i.fingerprint = mf.fingerprint
                 WHERE (mf.path LIKE ?1 OR mf.path = ?2) AND mf.size_bytes = ?3
                 LIMIT 5",
            )?;
            let mut rows = stmt.query(params![pattern, filename, sz as i64])?;
            let mut matches = Vec::new();
            while let Some(row) = rows.next()? {
                matches.push(self.row_to_item(row)?);
            }
            if matches.len() == 1 {
                return Ok(MigrationMatchResult::Matched(
                    Box::new(matches.remove(0)),
                    MigrationMatchKind::FilenameAndSize,
                ));
            } else if matches.len() > 1 {
                // Ambiguous match across folders! Report ambiguous paths, do NOT auto-pick!
                let paths = matches.into_iter().map(|it| it.file_path).collect();
                return Ok(MigrationMatchResult::Ambiguous(paths));
            }
        } else if !filename.is_empty() {
            // Filename only
            let mut stmt = conn.prepare(
                "SELECT i.id, i.fingerprint, mf.path, i.title, i.duration, mf.size_bytes,
                        i.width, i.height, i.is_hdr, i.video_codec, i.audio_codec, i.series_id,
                        i.season_number, i.episode_number, i.is_missing, i.created_at, i.updated_at
                 FROM media_files mf
                 JOIN items i ON i.fingerprint = mf.fingerprint
                 WHERE (mf.path LIKE ?1 OR mf.path = ?2)
                 LIMIT 5",
            )?;
            let mut rows = stmt.query(params![pattern, filename])?;
            let mut matches = Vec::new();
            while let Some(row) = rows.next()? {
                matches.push(self.row_to_item(row)?);
            }
            if matches.len() == 1 {
                return Ok(MigrationMatchResult::Matched(
                    Box::new(matches.remove(0)),
                    MigrationMatchKind::FilenameOnly,
                ));
            } else if matches.len() > 1 {
                let paths = matches.into_iter().map(|it| it.file_path).collect();
                return Ok(MigrationMatchResult::Ambiguous(paths));
            }
        }

        Ok(MigrationMatchResult::Unmatched)
    }

    fn row_to_item(&self, row: &rusqlite::Row) -> Result<MediaItem, DbError> {
        let created_str: String = row.get(15)?;
        let updated_str: String = row.get(16)?;
        let created_at = chrono::DateTime::parse_from_rfc3339(&created_str)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());
        let updated_at = chrono::DateTime::parse_from_rfc3339(&updated_str)
            .map(|dt| dt.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());
        let size_bytes: i64 = row.get(5)?;
        let is_hdr: i32 = row.get(8)?;
        let is_missing: i32 = row.get(14)?;

        Ok(MediaItem {
            id: row.get(0)?,
            fingerprint: row.get(1)?,
            file_path: row.get(2)?,
            title: row.get(3)?,
            duration: row.get(4)?,
            size_bytes: size_bytes as u64,
            width: row.get(6)?,
            height: row.get(7)?,
            is_hdr: is_hdr != 0,
            video_codec: row.get(9)?,
            audio_codec: row.get(10)?,
            series_id: row.get(11)?,
            season_number: row.get(12)?,
            episode_number: row.get(13)?,
            is_missing: is_missing != 0,
            created_at,
            updated_at,
        })
    }

    /// Upserts a media item and syncs with FTS5
    pub fn upsert_item(&self, item: &MediaItem) -> Result<(), DbError> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO items (id, fingerprint, title, duration, width, height, is_hdr, video_codec, audio_codec, series_id, season_number, episode_number, is_missing, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
             ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                duration = excluded.duration,
                width = excluded.width,
                height = excluded.height,
                is_hdr = excluded.is_hdr,
                video_codec = excluded.video_codec,
                audio_codec = excluded.audio_codec,
                series_id = excluded.series_id,
                season_number = excluded.season_number,
                episode_number = excluded.episode_number,
                is_missing = excluded.is_missing,
                updated_at = excluded.updated_at;",
            params![
                item.id,
                item.fingerprint,
                item.title,
                item.duration,
                item.width,
                item.height,
                item.is_hdr as i32,
                item.video_codec,
                item.audio_codec,
                item.series_id,
                item.season_number,
                item.episode_number,
                item.is_missing as i32,
                item.created_at.to_rfc3339(),
                item.updated_at.to_rfc3339(),
            ],
        )?;

        // Note: FTS5 library_fts is kept in sync via SQLite triggers (trg_items_ai, trg_items_au, trg_items_ad)

        Ok(())
    }

    /// Deletes a media item by ID (and triggers trg_items_ad to remove from library_fts).
    pub fn delete_item(&self, item_id: &str) -> Result<(), DbError> {
        let conn = self.conn.lock();
        conn.execute("DELETE FROM items WHERE id = ?1;", params![item_id])?;
        Ok(())
    }

    /// Marks a media file and its item as missing without permanently deleting them
    pub fn mark_file_missing(&self, path: &str) -> Result<(), DbError> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE media_files SET is_missing = 1 WHERE path = ?1;",
            params![path],
        )?;
        conn.execute(
            "UPDATE items SET is_missing = 1 WHERE fingerprint IN (SELECT fingerprint FROM media_files WHERE path = ?1);",
            params![path],
        )?;
        Ok(())
    }

    /// Finds a media item by exact BLAKE3 fingerprint
    pub fn find_item_by_fingerprint(
        &self,
        fingerprint: &str,
    ) -> Result<Option<MediaItem>, DbError> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT i.id, i.fingerprint, mf.path, i.title, i.duration, mf.size_bytes,
                    i.width, i.height, i.is_hdr, i.video_codec, i.audio_codec, i.series_id,
                    i.season_number, i.episode_number, i.is_missing, i.created_at, i.updated_at
             FROM media_files mf
             JOIN items i ON i.fingerprint = mf.fingerprint
             WHERE mf.fingerprint = ?1
             LIMIT 1;",
        )?;
        let mut rows = stmt.query(params![fingerprint])?;
        if let Some(row) = rows.next()? {
            return Ok(Some(self.row_to_item(row)?));
        }
        Ok(None)
    }

    /// Relinks a renamed or moved media file to its new path, clearing is_missing
    pub fn relink_file_path(
        &self,
        _old_path: &str,
        new_path: &str,
        fingerprint: &str,
    ) -> Result<(), DbError> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE media_files SET path = ?1, is_missing = 0, last_seen_at = datetime('now') WHERE fingerprint = ?2;",
            params![new_path, fingerprint],
        )?;
        conn.execute(
            "UPDATE items SET is_missing = 0, updated_at = datetime('now') WHERE fingerprint = ?1;",
            params![fingerprint],
        )?;
        Ok(())
    }

    /// Enqueues items into the persistent analysis queue using a single high-throughput transaction.
    pub fn enqueue_analysis(&self, items: &[AnalysisQueueItem]) -> Result<usize, DbError> {
        if items.is_empty() {
            return Ok(0);
        }
        let mut conn = self.conn.lock();
        let tx = conn.transaction()?;
        {
            let mut stmt = tx.prepare_cached(
                "INSERT INTO analysis_queue (file_id, fingerprint, path, priority, status, retries, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, 'pending', 0, datetime('now'), datetime('now'))
                 ON CONFLICT(fingerprint) DO UPDATE SET
                    priority = MAX(analysis_queue.priority, excluded.priority),
                    updated_at = datetime('now');",
            )?;
            for it in items {
                stmt.execute(params![it.file_id, it.fingerprint, it.path, it.priority])?;
            }
        }
        tx.commit()?;
        Ok(items.len())
    }

    /// Fetches the next pending analysis task with highest priority (visible items boosted to 100 first).
    /// Atomically marks it as 'processing'.
    pub fn fetch_next_analysis_task(&self) -> Result<Option<AnalysisTask>, DbError> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, file_id, fingerprint, path, priority, status, retries, error_message
             FROM analysis_queue
             WHERE status = 'pending'
             ORDER BY priority DESC, id ASC
             LIMIT 1;",
        )?;
        let mut task = stmt
            .query_row([], |row| {
                Ok(AnalysisTask {
                    id: row.get(0)?,
                    file_id: row.get(1)?,
                    fingerprint: row.get(2)?,
                    path: row.get(3)?,
                    priority: row.get(4)?,
                    status: row.get(5)?,
                    retries: row.get(6)?,
                    error_message: row.get(7)?,
                })
            })
            .optional()?;

        if let Some(ref mut t) = task {
            conn.execute(
                "UPDATE analysis_queue SET status = 'processing', updated_at = datetime('now') WHERE id = ?1;",
                params![t.id],
            )?;
            t.status = "processing".into();
        }
        Ok(task)
    }

    /// Updates status of an analysis queue item (completed, failed, etc.).
    pub fn update_analysis_status(
        &self,
        id: i64,
        status: &str,
        error: Option<&str>,
    ) -> Result<(), DbError> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE analysis_queue SET status = ?1, error_message = ?2, updated_at = datetime('now') WHERE id = ?3;",
            params![status, error, id],
        )?;
        Ok(())
    }

    /// Boosts analysis priority for a fingerprint (e.g. user scrolled item into viewport -> priority 100).
    pub fn boost_analysis_priority(&self, fingerprint: &str, priority: i32) -> Result<(), DbError> {
        let conn = self.conn.lock();
        conn.execute(
            "UPDATE analysis_queue SET priority = MAX(priority, ?1), updated_at = datetime('now') WHERE fingerprint = ?2;",
            params![priority, fingerprint],
        )?;
        Ok(())
    }

    /// Resets any tasks left in 'processing' when app shut down or crashed back to 'pending'.
    /// Ensures persistent queue survives restarts without losing work.
    pub fn reset_processing_tasks_to_pending(&self) -> Result<usize, DbError> {
        let conn = self.conn.lock();
        let affected = conn.execute(
            "UPDATE analysis_queue SET status = 'pending', updated_at = datetime('now') WHERE status = 'processing';",
            [],
        )?;
        Ok(affected)
    }

    /// Retrieves analysis queue counts: (pending, processing, completed, failed)
    pub fn get_analysis_queue_counts(&self) -> Result<(usize, usize, usize, usize), DbError> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT 
                COALESCE(SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END), 0),
                COALESCE(SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END), 0)
             FROM analysis_queue;",
        )?;
        let (p, pr, c, f): (i64, i64, i64, i64) = stmt.query_row([], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?))
        })?;
        Ok((p as usize, pr as usize, c as usize, f as usize))
    }

    /// Retrieves all items
    pub fn get_all_items(&self) -> Result<Vec<MediaItem>, DbError> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT i.id, i.fingerprint, COALESCE(mf.path, ''), i.title, i.duration, COALESCE(mf.size_bytes, 0),
                    i.width, i.height, i.is_hdr, i.video_codec, i.audio_codec, i.series_id,
                    i.season_number, i.episode_number, i.is_missing, i.created_at, i.updated_at
             FROM items i
             LEFT JOIN media_files mf ON mf.fingerprint = i.fingerprint
             ORDER BY i.title ASC",
        )?;

        let rows = stmt.query_map([], |row| {
            let created_str: String = row.get(15)?;
            let updated_str: String = row.get(16)?;
            let created_at = chrono::DateTime::parse_from_rfc3339(&created_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());
            let updated_at = chrono::DateTime::parse_from_rfc3339(&updated_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            Ok(MediaItem {
                id: row.get(0)?,
                fingerprint: row.get(1)?,
                file_path: row.get(2)?,
                title: row.get(3)?,
                duration: row.get(4)?,
                size_bytes: row.get::<_, i64>(5)? as u64,
                width: row.get(6)?,
                height: row.get(7)?,
                is_hdr: row.get::<_, i32>(8)? != 0,
                video_codec: row.get(9)?,
                audio_codec: row.get(10)?,
                series_id: row.get(11)?,
                season_number: row.get(12)?,
                episode_number: row.get(13)?,
                is_missing: row.get::<_, i32>(14)? != 0,
                created_at,
                updated_at,
            })
        })?;

        let mut items = Vec::new();
        for r in rows {
            items.push(r?);
        }
        Ok(items)
    }

    /// Performs FTS5 instant search over library items
    pub fn search_items(&self, query: &str) -> Result<Vec<MediaItem>, DbError> {
        let clean_query = query.trim().replace('"', "\"\"");
        if clean_query.is_empty() {
            return self.get_all_items();
        }
        let fts_query = format!("\"{}\"*", clean_query);

        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT i.id, i.fingerprint, COALESCE(mf.path, ''), i.title, i.duration, COALESCE(mf.size_bytes, 0),
                    i.width, i.height, i.is_hdr, i.video_codec, i.audio_codec, i.series_id,
                    i.season_number, i.episode_number, i.is_missing, i.created_at, i.updated_at
             FROM library_fts fts
             JOIN items i ON i.id = fts.item_id
             LEFT JOIN media_files mf ON mf.fingerprint = i.fingerprint
             WHERE library_fts MATCH ?1
             ORDER BY rank
             LIMIT 100",
        )?;

        let rows = stmt.query_map(params![fts_query], |row| {
            let created_str: String = row.get(15)?;
            let updated_str: String = row.get(16)?;
            let created_at = chrono::DateTime::parse_from_rfc3339(&created_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());
            let updated_at = chrono::DateTime::parse_from_rfc3339(&updated_str)
                .map(|dt| dt.with_timezone(&Utc))
                .unwrap_or_else(|_| Utc::now());

            Ok(MediaItem {
                id: row.get(0)?,
                fingerprint: row.get(1)?,
                file_path: row.get(2)?,
                title: row.get(3)?,
                duration: row.get(4)?,
                size_bytes: row.get::<_, i64>(5)? as u64,
                width: row.get(6)?,
                height: row.get(7)?,
                is_hdr: row.get::<_, i32>(8)? != 0,
                video_codec: row.get(9)?,
                audio_codec: row.get(10)?,
                series_id: row.get(11)?,
                season_number: row.get(12)?,
                episode_number: row.get(13)?,
                is_missing: row.get::<_, i32>(14)? != 0,
                created_at,
                updated_at,
            })
        })?;

        let mut items = Vec::new();
        for r in rows {
            items.push(r?);
        }
        Ok(items)
    }

    /// Saves or updates a Collection
    pub fn save_collection(&self, coll: &Collection) -> Result<(), DbError> {
        let conn = self.conn.lock();
        conn.execute(
            "INSERT INTO collections (id, name, collection_type, current_index, is_pinned, last_played_at, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, datetime('now'), datetime('now'))
             ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                collection_type = excluded.collection_type,
                current_index = excluded.current_index,
                is_pinned = excluded.is_pinned,
                last_played_at = excluded.last_played_at,
                updated_at = datetime('now');",
            params![
                coll.id,
                coll.name,
                coll.collection_type,
                coll.current_index as i64,
                coll.is_pinned as i32,
                coll.last_played_at.map(|d| d.to_rfc3339()),
            ],
        )?;

        // Re-sync collection items
        conn.execute(
            "DELETE FROM collection_items WHERE collection_id = ?1",
            params![coll.id],
        )?;
        let mut insert_item_stmt = conn.prepare(
            "INSERT INTO collection_items (collection_id, item_id, position_order) VALUES (?1, ?2, ?3)",
        )?;
        for (idx, item_id) in coll.item_ids.iter().enumerate() {
            let _ = insert_item_stmt.execute(params![coll.id, item_id, idx as i64]);
        }

        Ok(())
    }

    /// Retrieves all collections
    pub fn get_all_collections(&self) -> Result<Vec<Collection>, DbError> {
        let conn = self.conn.lock();
        let mut stmt = conn.prepare(
            "SELECT id, name, collection_type, current_index, is_pinned, last_played_at
             FROM collections ORDER BY is_pinned DESC, last_played_at DESC, name ASC",
        )?;

        let coll_rows = stmt.query_map([], |row| {
            let id: String = row.get(0)?;
            let name: String = row.get(1)?;
            let coll_type: String = row.get(2)?;
            let current_index: i64 = row.get(3)?;
            let is_pinned: i32 = row.get(4)?;
            let last_played_str: Option<String> = row.get(5)?;
            let last_played_at = last_played_str
                .and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
                .map(|dt| dt.with_timezone(&Utc));

            Ok((
                id,
                name,
                coll_type,
                current_index,
                is_pinned != 0,
                last_played_at,
            ))
        })?;

        let mut colls = Vec::new();
        for r in coll_rows {
            let (id, name, coll_type, current_index, is_pinned, last_played_at) = r?;
            // fetch item ids
            let mut item_stmt = conn.prepare(
                "SELECT item_id FROM collection_items WHERE collection_id = ?1 ORDER BY position_order ASC",
            )?;
            let item_ids = item_stmt
                .query_map(params![id], |row| row.get(0))?
                .filter_map(|res| res.ok())
                .collect();

            colls.push(Collection {
                id,
                name,
                collection_type: coll_type,
                item_ids,
                current_index: current_index as usize,
                last_played_at,
                is_pinned,
            });
        }

        Ok(colls)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_collections_and_history_one_entry_per_playlist() {
        let db = Database::in_memory().expect("in-memory db failed");
        let now = Utc::now();

        // 1. Create items (Episodes 1, 2, 3 of a series)
        for i in 1..=3 {
            let item = MediaItem {
                id: format!("ep_{}", i),
                fingerprint: format!("fp_{}", i),
                file_path: format!("/path/to/Devs.S01E0{}.mkv", i),
                title: format!("Episode {}", i),
                duration: 3000.0,
                size_bytes: 1_000_000_000,
                width: Some(1920),
                height: Some(1080),
                is_hdr: false,
                video_codec: Some("H.264".into()),
                audio_codec: Some("AAC".into()),
                series_id: None,
                season_number: Some(1),
                episode_number: Some(i),
                is_missing: false,
                created_at: now,
                updated_at: now,
            };
            db.upsert_item(&item).expect("upsert item failed");
        }

        // 2. Create playlist collection with 3 episodes
        let coll = Collection {
            id: "coll_devs".into(),
            name: "Devs".into(),
            collection_type: "playlist".into(),
            item_ids: vec!["ep_1".into(), "ep_2".into(), "ep_3".into()],
            current_index: 1, // Currently on Episode 2
            last_played_at: Some(now),
            is_pinned: true,
        };
        db.save_collection(&coll).expect("save collection failed");

        // 3. Save playback position for Episode 2
        let pos = PlaybackPosition {
            fingerprint: "fp_2".into(),
            position_secs: 140.0,
            duration_secs: 3000.0,
            completed: false,
            updated_at: now,
        };
        db.save_playback_position(&pos)
            .expect("save position failed");

        // 4. Query history: MUST return exactly ONE entry for the collection, not one per episode!
        let history = db.get_history(10).expect("get history failed");
        assert_eq!(
            history.len(),
            1,
            "History query must return one entry per playlist"
        );
        assert_eq!(history[0].collection_name, "Devs");
        assert_eq!(history[0].total_items, 3);
        assert_eq!(history[0].current_index, 1);
        assert_eq!(history[0].current_item_fingerprint, "fp_2");
        assert_eq!(history[0].position_secs, 140.0);

        // 5. Bookmarks test
        let bm1 = Bookmark {
            id: "bm_intro".into(),
            fingerprint: "fp_2".into(),
            title: "Intro".into(),
            start_secs: 90.0,
            end_secs: Some(120.0),
            category: "intro".into(),
            created_at: now,
        };
        let bm2 = Bookmark {
            id: "bm_credits".into(),
            fingerprint: "fp_2".into(),
            title: "Credits".into(),
            start_secs: 2900.0,
            end_secs: Some(3000.0),
            category: "credits".into(),
            created_at: now,
        };
        db.save_bookmark(&bm1).expect("save bookmark failed");
        db.save_bookmark(&bm2).expect("save bookmark failed");

        let bms = db.get_bookmarks("fp_2").expect("get bookmarks failed");
        assert_eq!(bms.len(), 2);
        assert_eq!(bms[0].title, "Intro");
        assert_eq!(bms[1].title, "Credits");

        db.delete_bookmark("bm_intro")
            .expect("delete bookmark failed");
        let remaining = db.get_bookmarks("fp_2").expect("get remaining failed");
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].title, "Credits");

        // 6. FTS5 Search
        let search_results = db.search_items("Episode").expect("fts search failed");
        assert_eq!(search_results.len(), 3);
    }
}
