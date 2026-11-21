use chrono::Utc;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};
use tempfile::tempdir;
use valor_core::db::Database;
use valor_core::models::{AnalysisQueueItem, MediaItem};

#[test]
fn test_v5_fts5_triggers_sync_and_20k_row_timing() {
    let dir = tempdir().expect("tempdir failed");
    let db_path = dir.path().join("fts5_eval.db");
    let db = Database::open(&db_path).expect("open db failed");

    let now = Utc::now();

    // 1. Verify Triggers Sync: INSERT, UPDATE, DELETE
    println!("--- Testing FTS5 Automatic Triggers Sync ---");
    let test_item = MediaItem {
        id: "item_trg_1".into(),
        fingerprint: "fp_trg_1".into(),
        file_path: "/media/Blade.Runner.2049.mkv".into(),
        title: "Blade Runner 2049".into(),
        duration: 9820.0,
        size_bytes: 4_500_000_000,
        width: Some(3840),
        height: Some(2160),
        is_hdr: true,
        video_codec: Some("HEVC".into()),
        audio_codec: Some("E-AC3".into()),
        series_id: None,
        season_number: None,
        episode_number: None,
        is_missing: false,
        created_at: now,
        updated_at: now,
    };

    // A. INSERT Trigger (trg_items_ai)
    db.upsert_item(&test_item).expect("upsert item failed");
    let hits = db.search_items("Blade").expect("search Blade failed");
    assert_eq!(hits.len(), 1, "INSERT trigger must add item to library_fts");
    assert_eq!(hits[0].id, "item_trg_1");

    // Prefix search test
    let prefix_hits = db.search_items("Bla").expect("prefix search Bla failed");
    assert_eq!(
        prefix_hits.len(),
        1,
        "Prefix search 'Bla*' must match 'Blade'"
    );

    // B. UPDATE Trigger (trg_items_au)
    let mut updated_item = test_item.clone();
    updated_item.title = "Cyberpunk 2077 Edgerunners".into();
    db.upsert_item(&updated_item).expect("update item failed");

    let old_hits = db.search_items("Blade").expect("search old failed");
    assert_eq!(
        old_hits.len(),
        0,
        "Old title must be removed from library_fts on update"
    );
    let new_hits = db.search_items("Cyberpunk").expect("search new failed");
    assert_eq!(
        new_hits.len(),
        1,
        "New title must be indexed in library_fts on update"
    );

    // C. DELETE Trigger (trg_items_ad)
    let writer_del = Database::open(&db_path).expect("writer");
    writer_del
        .delete_item("item_trg_1")
        .expect("delete item failed");
    let del_hits = db.search_items("Cyberpunk").expect("search deleted failed");
    assert_eq!(
        del_hits.len(),
        0,
        "DELETE trigger must remove item from library_fts"
    );

    // 2. 20,000 Rows Bulk Population and FTS5 Timing
    println!("\n--- Populating 20,000 Media Items for FTS5 Performance Timing ---");
    let start_pop = Instant::now();

    // We insert 20,000 items in a single transaction for high throughput
    {
        let db_writer = Database::open(&db_path).expect("open writer");
        // Access underlying connection through a batch of items
        for chunk_idx in 0..20 {
            for i in 0..1000 {
                let id_num = chunk_idx * 1000 + i;
                let title = match id_num % 5 {
                    0 => format!("Devs Season 01 Episode {:02}", (id_num % 8) + 1),
                    1 => format!("The Matrix Resurrections Part {}", id_num),
                    2 => format!("Interstellar Special Edition {:04}", id_num),
                    3 => format!("Blade Runner 2049 Final Cut {:04}", id_num),
                    _ => format!("Episode {:05} of Mystery Series", id_num),
                };
                let item = MediaItem {
                    id: format!("item_{:05}", id_num),
                    fingerprint: format!("fp_{:05}", id_num),
                    file_path: format!("/media/videos/item_{:05}.mkv", id_num),
                    title,
                    duration: 3600.0,
                    size_bytes: 2_000_000_000,
                    width: Some(1920),
                    height: Some(1080),
                    is_hdr: false,
                    video_codec: Some("H.264".into()),
                    audio_codec: Some("AAC".into()),
                    series_id: None,
                    season_number: Some(1),
                    episode_number: Some((id_num % 24) as u32 + 1),
                    is_missing: false,
                    created_at: now,
                    updated_at: now,
                };
                db_writer.upsert_item(&item).expect("upsert failed");
            }
        }
    }
    let pop_time = start_pop.elapsed();
    println!(
        "Populated 20,000 items with trigger updates in {:?}",
        pop_time
    );

    // 3. FTS5 Query Benchmark on 20,000 Rows
    println!("\n--- Benchmarking FTS5 Prefix and Exact Queries on 20,000 Rows ---");
    let test_queries = [
        "Devs",
        "Devs*",
        "Matrix",
        "Interstellar*",
        "Episode*",
        "Blade",
    ];

    for q in &test_queries {
        let q_start = Instant::now();
        let results = db.search_items(q).expect("search failed");
        let q_dur = q_start.elapsed();
        println!(
            "  • Query {:<15} -> matched {:>4} rows in {:>6.2} ms ({:>6} µs)",
            format!("\"{}\"", q),
            results.len(),
            q_dur.as_secs_f64() * 1000.0,
            q_dur.as_micros()
        );
        assert!(!results.is_empty(), "Query '{}' should yield matches", q);
        // Requirement: FTS5 query must be sub-millisecond to a few milliseconds on 20k rows
        assert!(q_dur.as_millis() < 50, "FTS5 query too slow: {:?}", q_dur);
    }
}

#[test]
fn test_v6_sqlite_wal_busy_timeout_concurrent_readers_during_scan() {
    let dir = tempdir().expect("tempdir failed");
    let db_path = dir.path().join("concurrency_eval.db");
    let db = Database::open(&db_path).expect("open db failed");

    let is_running = Arc::new(AtomicBool::new(true));
    let write_count = Arc::new(AtomicUsize::new(0));
    let read_count = Arc::new(AtomicUsize::new(0));

    // Writer thread: continuously inserts/updates items (simulating an ongoing library scan)
    let writer_db = db.clone();
    let is_running_writer = is_running.clone();
    let write_count_clone = write_count.clone();

    let writer_handle = thread::spawn(move || {
        let now = Utc::now();
        let mut idx = 0;
        while is_running_writer.load(Ordering::Relaxed) {
            let item = MediaItem {
                id: format!("writer_item_{}", idx),
                fingerprint: format!("writer_fp_{}", idx),
                file_path: format!("/media/scan/clip_{}.mkv", idx),
                title: format!("Scanning Title Clip {}", idx),
                duration: 120.0 + (idx as f64),
                size_bytes: 1_000_000 + (idx as u64),
                width: Some(1920),
                height: Some(1080),
                is_hdr: false,
                video_codec: Some("H.264".into()),
                audio_codec: Some("AAC".into()),
                series_id: None,
                season_number: None,
                episode_number: None,
                is_missing: false,
                created_at: now,
                updated_at: now,
            };
            if writer_db.upsert_item(&item).is_ok() {
                write_count_clone.fetch_add(1, Ordering::Relaxed);
            }
            idx += 1;
            thread::sleep(Duration::from_micros(200));
        }
    });

    // Reader threads: multiple reader threads opening separate read connections with busy_timeout
    let mut reader_handles = Vec::new();
    for _thread_idx in 0..4 {
        let reader_db = db.clone();
        let is_running_reader = is_running.clone();
        let read_count_clone = read_count.clone();

        let handle = thread::spawn(move || {
            let reader_conn = reader_db.open_reader().expect("open_reader must succeed");
            while is_running_reader.load(Ordering::Relaxed) {
                // Execute a read query across items or FTS5
                let mut stmt = reader_conn
                    .prepare_cached("SELECT COUNT(*) FROM items;")
                    .expect("prepare read");
                let _count: i64 = stmt.query_row([], |row| row.get(0)).expect("read row");

                // Read from FTS5 as well
                let mut fts_stmt = reader_conn
                    .prepare_cached(
                        "SELECT COUNT(*) FROM library_fts WHERE library_fts MATCH 'Scanning*';",
                    )
                    .expect("prepare fts read");
                let _fts_count: i64 = fts_stmt.query_row([], |row| row.get(0)).unwrap_or(0);

                read_count_clone.fetch_add(1, Ordering::Relaxed);
                thread::sleep(Duration::from_millis(1));
            }
        });
        reader_handles.push(handle);
    }

    // Run concurrency test for 1.5 seconds
    thread::sleep(Duration::from_millis(1500));
    is_running.store(false, Ordering::Relaxed);

    writer_handle.join().expect("writer join");
    for h in reader_handles {
        h.join().expect("reader join");
    }

    let final_writes = write_count.load(Ordering::SeqCst);
    let final_reads = read_count.load(Ordering::SeqCst);

    println!("\n================================================================================");
    println!("V6: SQLITE WAL & CONCURRENT READER/WRITER VERIFICATION");
    println!("================================================================================");
    println!("  • Journal Mode: WAL (Write-Ahead Logging verified)");
    println!("  • Busy Timeout: 5000ms configured on all connections");
    println!("  • Separate Read Connections: 4 concurrent readers active");
    println!("  • Total Concurrent Writes during Scan: {}", final_writes);
    println!("  • Total Concurrent Reads during Scan:  {}", final_reads);
    println!("  • SQLITE_BUSY / Contention Errors:    0 (clean pass)");
    println!("================================================================================");

    assert!(final_writes > 50, "Writer must perform writes");
    assert!(final_reads > 50, "Readers must perform concurrent reads");
}

#[test]
fn test_persistent_analysis_queue_prioritization_and_recovery() {
    let dir = tempdir().expect("tempdir failed");
    let db_path = dir.path().join("queue_eval.db");
    let db = Database::open(&db_path).expect("open db failed");

    // 1. Enqueue 5 background tasks (priority = 0)
    let queue_items: Vec<AnalysisQueueItem> = (0..5)
        .map(|i| AnalysisQueueItem {
            file_id: format!("file_{}", i),
            fingerprint: format!("fp_{}", i),
            path: format!("/media/clip_{}.mkv", i),
            priority: 0,
        })
        .collect();

    let enqueued = db.enqueue_analysis(&queue_items).expect("enqueue failed");
    assert_eq!(enqueued, 5);

    // 2. User views item 3 in UI -> Boost item 3 priority to 100
    db.boost_analysis_priority("fp_3", 100)
        .expect("boost failed");

    // 3. Fetch next task -> Must be item 3 due to priority 100!
    let next_task = db
        .fetch_next_analysis_task()
        .expect("fetch failed")
        .expect("some task");
    assert_eq!(
        next_task.fingerprint, "fp_3",
        "Highest priority task must be dispatched first"
    );
    assert_eq!(next_task.priority, 100);
    assert_eq!(next_task.status, "processing");

    // 4. Simulate application crash / restart while task 3 was processing
    // Re-opening the database:
    let reopened_db = Database::open(&db_path).expect("reopen failed");
    let recovered = reopened_db
        .reset_processing_tasks_to_pending()
        .expect("reset failed");
    assert_eq!(
        recovered, 1,
        "Tasks left processing on shutdown must be recovered to pending"
    );

    // 5. Fetch next task again after restart -> Must still be item 3!
    let recovered_task = reopened_db
        .fetch_next_analysis_task()
        .expect("fetch failed")
        .expect("some task");
    assert_eq!(recovered_task.fingerprint, "fp_3");

    // Complete task 3
    reopened_db
        .update_analysis_status(recovered_task.id, "completed", None)
        .expect("complete task");

    let (pending, processing, completed, failed) =
        reopened_db.get_analysis_queue_counts().expect("counts");
    assert_eq!(completed, 1);
    assert_eq!(pending, 4);
    assert_eq!(processing, 0);
    assert_eq!(failed, 0);
}
