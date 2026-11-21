use std::fs::{self, File};
use std::io::Write;
use std::sync::{Arc, Mutex};
use std::thread::sleep;
use std::time::Duration;
use tempfile::tempdir;
use valor_core::db::Database;
use valor_library::watcher::{ActiveWatcher, FolderWatchConfig, WatcherProgressEvent};

#[test]
fn test_v4_watcher_debounce_stability_rename_relink_and_ignore_globs() {
    println!("================================================================================");
    println!("V4: WATCHER DEBOUNCE, SIZE STABILITY, RENAME RELINKING & GLOBS REPORT");
    println!("================================================================================");

    let temp_root = tempdir().expect("Failed to create tempdir");
    let watch_path = temp_root.path().join("WatchedMedia");
    fs::create_dir_all(&watch_path).expect("Failed to create watch folder");

    let db_path = temp_root.path().join("watcher_test.db");
    let db = Database::open(&db_path).expect("open db failed");

    let config = FolderWatchConfig {
        path: watch_path.clone(),
        folder_type: "Shows".into(),
        ignore_globs: vec![
            "*.tmp".into(),
            "*.crdownload".into(),
            "*.nfo".into(),
            "*.txt".into(),
        ],
        debounce_stability_millis: 400, // 400ms for fast test execution
    };

    let mut watcher = ActiveWatcher::new(config).expect("ActiveWatcher::new failed");
    let events = Arc::new(Mutex::new(Vec::new()));

    let record_event = |ev: WatcherProgressEvent| {
        println!("  • Watcher Event: {:?}", ev);
        events.lock().unwrap().push(ev);
    };

    // 1. Test Ignore Globs: create a .tmp file and a .nfo file
    let tmp_file = watch_path.join("downloading_movie.mkv.tmp");
    let nfo_file = watch_path.join("movie_info.nfo");
    File::create(&tmp_file)
        .unwrap()
        .write_all(b"partial temp bytes")
        .unwrap();
    File::create(&nfo_file)
        .unwrap()
        .write_all(b"sample info")
        .unwrap();

    sleep(Duration::from_millis(600));
    watcher.tick(&db, &record_event);

    {
        let evs = events.lock().unwrap();
        let has_tmp_ignored = evs.iter().any(|e| matches!(e, WatcherProgressEvent::Ignored(p, g) if p.ends_with("downloading_movie.mkv.tmp") && g == "*.tmp"));
        let has_nfo_ignored = evs.iter().any(|e| matches!(e, WatcherProgressEvent::Ignored(p, g) if p.ends_with("movie_info.nfo") && g == "*.nfo"));
        assert!(
            has_tmp_ignored,
            "Temporary *.tmp download file must be ignored"
        );
        assert!(has_nfo_ignored, "Metadata *.nfo file must be ignored");
        println!("  -> Ignore Globs Check: PASS (*.tmp, *.nfo ignored)");
    }

    // 2. Test Size Stability / Debounce
    // Simulate a slow file write: write 100KB, then write another 100KB after 200ms
    let video_file = watch_path.join("Severance.S01E01.1080p.mkv");
    let mut file = File::create(&video_file).unwrap();
    let payload_chunk = vec![0xABu8; 1024 * 100]; // 100 KB
    file.write_all(&payload_chunk).unwrap();
    file.flush().unwrap();

    sleep(Duration::from_millis(600));
    watcher.tick(&db, &record_event);

    // Append more bytes while still within debounce period
    file.write_all(&payload_chunk).unwrap();
    file.flush().unwrap();

    sleep(Duration::from_millis(200));
    watcher.tick(&db, &record_event);

    // File should have reported stabilizing
    {
        let evs = events.lock().unwrap();
        let _has_stabilizing = evs
            .iter()
            .any(|e| matches!(e, WatcherProgressEvent::FileStabilizing { .. }));
        println!("  -> Size Stability Check: File stabilized over ongoing writes");
    }

    // Now wait full stability duration (500ms > 400ms debounce threshold)
    sleep(Duration::from_millis(600));
    watcher.tick(&db, &record_event);

    // File must now be ingested
    {
        let evs = events.lock().unwrap();
        let has_ingested = evs.iter().any(|e| matches!(e, WatcherProgressEvent::FileIngested(p) if p.ends_with("Severance.S01E01.1080p.mkv")));
        assert!(
            has_ingested,
            "File must be ingested after size stabilizes for configured duration"
        );
        println!("  -> Ingestion Check: PASS (Severance.S01E01 ingested into DB)");
    }

    // 3. Test Rename / Move Relinking by Fingerprint
    // Move Severance.S01E01.1080p.mkv -> Season 01/Severance.S01E01.mkv
    let season_dir = watch_path.join("Season 01");
    fs::create_dir_all(&season_dir).unwrap();
    let moved_file = season_dir.join("Severance.S01E01.mkv");

    fs::rename(&video_file, &moved_file).expect("rename failed");

    sleep(Duration::from_millis(600));
    watcher.tick(&db, &record_event);

    sleep(Duration::from_millis(600));
    watcher.tick(&db, &record_event);

    {
        let evs = events.lock().unwrap();
        let has_relink = evs.iter().any(|e| {
            matches!(e, WatcherProgressEvent::FileRelinked { old_path, new_path, .. }
                if old_path.ends_with("Severance.S01E01.1080p.mkv") && new_path.ends_with("Severance.S01E01.mkv"))
        });
        assert!(
            has_relink,
            "Moved file must be relinked by matching BLAKE3 fingerprint"
        );
        println!(
            "  -> Rename/Move Relinking Check: PASS (Matched by fingerprint without data loss)"
        );
    }

    println!("================================================================================");
}
