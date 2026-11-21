use std::fs::{self, File};
use std::io::Write;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Instant;
use tempfile::tempdir;
use valor_core::db::Database;
use valor_library::scanner::scan_directory;

#[test]
fn test_scanner_20000_files_benchmark_and_incremental_speed() {
    let temp_root = tempdir().expect("Failed to create tempdir");
    let root_path = temp_root.path();

    println!("============================================================");
    println!("GENERATING 20,000 FILES TEST TREE...");
    let gen_start = Instant::now();

    // 100 directories x 200 media files = 20,000 files
    let dummy_payload = b"RIFF\x24\x00\x00\x00WEBPVP8 \x18\x00\x00\x00Dummy media payload content for scanner benchmark 20000 files";
    for d in 0..100 {
        let sub_dir = root_path.join(format!("Season_{:03}", d));
        fs::create_dir(&sub_dir).expect("Failed to create sub dir");
        for f in 0..200 {
            let file_path = sub_dir.join(format!("Show.S{:02}E{:03}.1080p.mkv", d, f));
            let mut file = File::create(&file_path).expect("Failed to create file");
            file.write_all(dummy_payload)
                .expect("Failed to write dummy content");
        }
    }

    println!(
        "Generated 20,000 media files in {:.2}s",
        gen_start.elapsed().as_secs_f64()
    );
    println!("============================================================");

    let db_path = root_path.join("scanner_bench.db");
    let db = Database::open(&db_path).expect("Failed to open SQLite database");

    let cancel_flag = Arc::new(AtomicBool::new(false));
    let pause_flag = Arc::new(AtomicBool::new(false));

    // =========================================================================
    // 1. COLD SCAN (Full Fingerprinting, Tag Parsing & Batched SQLite Inserts)
    // =========================================================================
    println!("RUNNING COLD SCAN (20,000 files)...");
    let cold_start = Instant::now();

    let cold_progress = scan_directory(
        root_path,
        &db,
        cancel_flag.clone(),
        pause_flag.clone(),
        |_p| {},
    )
    .expect("Cold scan failed");

    let cold_duration = cold_start.elapsed().as_secs_f64();
    let cold_throughput = (cold_progress.files_seen as f64) / cold_duration;

    println!("COLD SCAN RESULTS:");
    println!("  • Files Seen: {}", cold_progress.files_seen);
    println!("  • Files Ingested: {}", cold_progress.files_new);
    println!("  • Errors: {}", cold_progress.errors_count);
    println!("  • Total Time: {:.3} s", cold_duration);
    println!("  • Throughput: {:.1} files / second", cold_throughput);
    println!("============================================================");

    assert_eq!(cold_progress.files_seen, 20_000);
    assert_eq!(cold_progress.files_new, 20_000);
    assert_eq!(cold_progress.errors_count, 0);

    // =========================================================================
    // 2. INCREMENTAL WARM SCAN (Zero Fingerprinting, Size + Mtime SQLite Cache)
    // =========================================================================
    println!("RUNNING INCREMENTAL WARM SCAN (20,000 unchanged files)...");
    let warm_start = Instant::now();

    let warm_progress = scan_directory(
        root_path,
        &db,
        cancel_flag.clone(),
        pause_flag.clone(),
        |_p| {},
    )
    .expect("Warm scan failed");

    let warm_duration = warm_start.elapsed().as_secs_f64();
    let warm_throughput = (warm_progress.files_seen as f64) / warm_duration;

    println!("INCREMENTAL WARM SCAN RESULTS:");
    println!("  • Files Seen: {}", warm_progress.files_seen);
    println!(
        "  • Files Skipped (Unchanged): {}",
        warm_progress.files_skipped
    );
    println!("  • Files Ingested: {}", warm_progress.files_new);
    println!("  • Errors: {}", warm_progress.errors_count);
    println!("  • Total Time: {:.3} s", warm_duration);
    println!("  • Throughput: {:.1} files / second", warm_throughput);
    println!("============================================================");

    assert_eq!(warm_progress.files_seen, 20_000);
    assert_eq!(warm_progress.files_skipped, 20_000);
    assert_eq!(warm_progress.files_new, 0);
    assert_eq!(warm_progress.errors_count, 0);

    // =========================================================================
    // 3. CANCELLATION TEST
    // =========================================================================
    println!("TESTING CANCELLATION...");
    let cancel_flag_test = Arc::new(AtomicBool::new(false));
    let cancel_flag_clone = cancel_flag_test.clone();

    // Trigger cancel after starting
    let cancel_handle = std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(50));
        cancel_flag_clone.store(true, Ordering::Relaxed);
    });

    let cancel_progress = scan_directory(
        root_path,
        &db,
        cancel_flag_test,
        pause_flag.clone(),
        |_p| {},
    )
    .expect("Scan with cancel failed");

    cancel_handle.join().unwrap();
    println!(
        "Cancellation verified: Stopped after seeing {} of 20,000 files",
        cancel_progress.files_seen
    );
    assert!(cancel_progress.files_seen < 20_000);

    // =========================================================================
    // 4. PAUSE & RESUME TEST
    // =========================================================================
    println!("TESTING PAUSE AND RESUME...");
    let pause_flag_test = Arc::new(AtomicBool::new(false));
    let pause_flag_clone = pause_flag_test.clone();
    let cancel_dummy = Arc::new(AtomicBool::new(false));

    let pause_handle = std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(30));
        pause_flag_clone.store(true, Ordering::Relaxed);
        std::thread::sleep(std::time::Duration::from_millis(100));
        pause_flag_clone.store(false, Ordering::Relaxed);
    });

    let pause_progress = scan_directory(root_path, &db, cancel_dummy, pause_flag_test, |_p| {})
        .expect("Scan with pause failed");

    pause_handle.join().unwrap();
    println!(
        "Pause/Resume verified: Completed scanning all {} files",
        pause_progress.files_seen
    );
    assert_eq!(pause_progress.files_seen, 20_000);
}
