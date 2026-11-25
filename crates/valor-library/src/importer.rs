use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use valor_core::db::Database;
use valor_core::models::{Bookmark, Collection, PlaybackPosition};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebExportBookmark {
    pub id: Option<String>,
    pub time: f64,
    pub label: Option<String>,
    pub category: Option<String>,
    pub created_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebExportVideo {
    pub id: String, // legacy fingerprint or id
    pub title: Option<String>,
    pub file_name: Option<String>,
    pub local_file_path: Option<String>,
    pub size_bytes: Option<u64>,
    pub current_time: Option<f64>,
    pub duration: Option<f64>,
    pub last_played_date: Option<String>,
    pub bookmarks: Option<Vec<WebExportBookmark>>,
    pub season: Option<u32>,
    pub episode: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebExportPlaylist {
    pub id: String,
    pub name: String,
    pub item_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebExportData {
    pub version: Option<u32>,
    pub exported_at: Option<String>,
    pub settings: Option<serde_json::Value>,
    pub videos: Option<Vec<WebExportVideo>>,
    pub playlists: Option<Vec<WebExportPlaylist>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnmatchedVideo {
    pub id: String,
    pub title: String,
    pub file_name: Option<String>,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportReport {
    pub dry_run: bool,
    pub total_exported_videos: usize,
    pub matched_by_legacy_fingerprint: usize,
    pub matched_by_path: usize,
    pub matched_by_filename_and_size: usize,
    pub ambiguous_matches: usize,
    pub unmatched_videos: Vec<UnmatchedVideo>,
    pub bookmarks_imported: usize,
    pub positions_updated: usize,
    pub playlists_imported: usize,
}

pub struct WebMigrationImporter;

impl WebMigrationImporter {
    pub fn import_json(
        json_str: &str,
        db: &Database,
        dry_run: bool,
    ) -> Result<ImportReport, String> {
        let export: WebExportData = serde_json::from_str(json_str)
            .map_err(|e| format!("Failed to parse web migration JSON: {}", e))?;

        let mut report = ImportReport {
            dry_run,
            total_exported_videos: 0,
            matched_by_legacy_fingerprint: 0,
            matched_by_path: 0,
            matched_by_filename_and_size: 0,
            ambiguous_matches: 0,
            unmatched_videos: Vec::new(),
            bookmarks_imported: 0,
            positions_updated: 0,
            playlists_imported: 0,
        };

        let mut web_id_to_native_id: HashMap<String, String> = HashMap::new();

        if let Some(videos) = export.videos {
            report.total_exported_videos = videos.len();

            for v in videos {
                let filename = v
                    .file_name
                    .as_deref()
                    .or_else(|| {
                        v.local_file_path.as_deref().and_then(|p| {
                            std::path::Path::new(p).file_name().and_then(|s| s.to_str())
                        })
                    })
                    .unwrap_or("");

                let match_result = db
                    .find_item_for_migration(Some(&v.id), filename, v.size_bytes)
                    .map_err(|e| format!("DB lookup error: {:?}", e))?;

                match match_result {
                    valor_core::models::MigrationMatchResult::Matched(item, match_kind) => {
                        match match_kind {
                            valor_core::models::MigrationMatchKind::LegacyFingerprint => {
                                report.matched_by_legacy_fingerprint += 1;
                            }
                            valor_core::models::MigrationMatchKind::FilenameAndSize => {
                                report.matched_by_filename_and_size += 1;
                            }
                            valor_core::models::MigrationMatchKind::FilenameOnly => {
                                report.matched_by_path += 1;
                            }
                        }

                        web_id_to_native_id.insert(v.id.clone(), item.id.clone());

                        if !dry_run {
                            let now = Utc::now();
                            // 1. Restore playback position
                            if let Some(pos) = v.current_time {
                                if pos > 0.0 {
                                    let duration = v.duration.unwrap_or(item.duration);
                                    let pos_record = PlaybackPosition {
                                        fingerprint: item.fingerprint.clone(),
                                        position_secs: pos,
                                        duration_secs: duration,
                                        completed: duration > 0.0 && pos >= (duration - 15.0),
                                        updated_at: now,
                                    };
                                    if db.save_playback_position(&pos_record).is_ok() {
                                        report.positions_updated += 1;
                                    }
                                }
                            }

                            // 2. Restore bookmarks
                            if let Some(bms) = v.bookmarks {
                                for (idx, bm) in bms.iter().enumerate() {
                                    let bm_id = bm.id.clone().unwrap_or_else(|| {
                                        format!("bm_{}_{}", item.fingerprint, idx)
                                    });
                                    let bm_record = Bookmark {
                                        id: bm_id,
                                        fingerprint: item.fingerprint.clone(),
                                        title: bm
                                            .label
                                            .clone()
                                            .unwrap_or_else(|| format!("Bookmark {:.0}s", bm.time)),
                                        start_secs: bm.time,
                                        end_secs: None,
                                        category: bm
                                            .category
                                            .clone()
                                            .unwrap_or_else(|| "custom".to_string()),
                                        created_at: now,
                                    };
                                    if db.save_bookmark(&bm_record).is_ok() {
                                        report.bookmarks_imported += 1;
                                    }
                                }
                            }
                        } else {
                            if v.current_time.map(|p| p > 0.0).unwrap_or(false) {
                                report.positions_updated += 1;
                            }
                            if let Some(bms) = v.bookmarks {
                                report.bookmarks_imported += bms.len();
                            }
                        }
                    }
                    valor_core::models::MigrationMatchResult::Ambiguous(paths) => {
                        report.ambiguous_matches += 1;
                        report.unmatched_videos.push(UnmatchedVideo {
                            id: v.id,
                            title: v.title.unwrap_or_else(|| filename.to_string()),
                            file_name: if filename.is_empty() {
                                None
                            } else {
                                Some(filename.to_string())
                            },
                            reason: format!(
                                "AMBIGUOUS: Same filename+size found in {} separate locations: {:?}. Never auto-picked.",
                                paths.len(),
                                paths
                            ),
                        });
                    }
                    valor_core::models::MigrationMatchResult::Unmatched => {
                        report.unmatched_videos.push(UnmatchedVideo {
                            id: v.id,
                            title: v.title.unwrap_or_else(|| filename.to_string()),
                            file_name: if filename.is_empty() {
                                None
                            } else {
                                Some(filename.to_string())
                            },
                            reason: "No matching local file found by legacy fingerprint or filename+size"
                                .to_string(),
                        });
                    }
                }
            }
        }

        // 3. Restore playlists
        if let Some(playlists) = export.playlists {
            for pl in playlists {
                let mut matched_items = Vec::new();
                for web_id in &pl.item_ids {
                    if let Some(native_id) = web_id_to_native_id.get(web_id) {
                        matched_items.push(native_id.clone());
                    }
                }

                if !matched_items.is_empty() {
                    report.playlists_imported += 1;
                    if !dry_run {
                        let coll = Collection {
                            id: format!("coll_{}", pl.id),
                            name: pl.name,
                            collection_type: "playlist".to_string(),
                            item_ids: matched_items,
                            current_index: 0,
                            last_played_at: Some(Utc::now()),
                            is_pinned: false,
                        };
                        let _ = db.save_collection(&coll);
                    }
                }
            }
        }

        Ok(report)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use valor_core::models::MediaItem;

    #[test]
    fn test_web_migration_importer_dry_run_and_commit() {
        let db = Database::in_memory().unwrap();
        let now = Utc::now();

        // Seed 1 item in database
        let item = MediaItem {
            id: "native_item_1".into(),
            fingerprint: "blake3_fp_real".into(),
            file_path: "C:/Videos/Series.Alpha.S01E06.1080p.mkv".into(),
            title: "Series Alpha S01E06".into(),
            duration: 3100.0,
            size_bytes: 1048576,
            width: Some(1920),
            height: Some(1080),
            is_hdr: false,
            video_codec: Some("HEVC".into()),
            audio_codec: Some("EAC3".into()),
            series_id: None,
            season_number: Some(1),
            episode_number: Some(6),
            is_missing: false,
            created_at: now,
            updated_at: now,
        };
        db.upsert_item(&item).unwrap();

        // Also record in media_files
        let record = valor_core::models::ScannedFileRecord {
            id: "file_1".into(),
            path: "C:/Videos/Series.Alpha.S01E06.1080p.mkv".into(),
            size_bytes: 1048576,
            mtime_secs: 1700000000,
            fingerprint: "blake3_fp_real".into(),
            legacy_fingerprint: Some("legacy_fp_web_123".into()),
            item: item.clone(),
        };
        db.batch_upsert_scanned_files(&[record]).unwrap();

        let json_export = r#"{
            "version": 1,
            "exported_at": "2026-11-20T22:00:00Z",
            "videos": [
                {
                    "id": "legacy_fp_web_123",
                    "title": "Series Alpha Episode 6",
                    "file_name": "Series.Alpha.S01E06.1080p.mkv",
                    "size_bytes": 1048576,
                    "current_time": 250.0,
                    "duration": 3100.0,
                    "bookmarks": [
                        { "id": "bm_web_1", "time": 105.0, "label": "Intro Scene", "category": "intro" }
                    ]
                },
                {
                    "id": "unmatched_video_999",
                    "title": "Missing Video",
                    "file_name": "NonExistent.mkv",
                    "size_bytes": 999999
                }
            ],
            "playlists": [
                {
                    "id": "pl_1",
                    "name": "Series Alpha Marathon",
                    "item_ids": ["legacy_fp_web_123"]
                }
            ]
        }"#;

        // 1. Dry run
        let dry_report = WebMigrationImporter::import_json(json_export, &db, true).unwrap();
        assert!(dry_report.dry_run);
        assert_eq!(dry_report.total_exported_videos, 2);
        assert_eq!(dry_report.matched_by_legacy_fingerprint, 1);
        assert_eq!(dry_report.unmatched_videos.len(), 1);
        assert_eq!(dry_report.unmatched_videos[0].id, "unmatched_video_999");
        assert_eq!(dry_report.positions_updated, 1);
        assert_eq!(dry_report.bookmarks_imported, 1);
        assert_eq!(dry_report.playlists_imported, 1);

        // Ensure dry run did not mutate DB
        let pos_before = db.get_playback_position("blake3_fp_real").unwrap();
        assert!(pos_before.is_none());

        // 2. Real commit
        let real_report = WebMigrationImporter::import_json(json_export, &db, false).unwrap();
        assert!(!real_report.dry_run);
        assert_eq!(real_report.positions_updated, 1);

        // Verify DB now holds the imported position and bookmark!
        let pos_after = db.get_playback_position("blake3_fp_real").unwrap().unwrap();
        assert_eq!(pos_after.position_secs, 250.0);

        let bookmarks = db.get_bookmarks("blake3_fp_real").unwrap();
        assert_eq!(bookmarks.len(), 1);
        assert_eq!(bookmarks[0].title, "Intro Scene");
        assert_eq!(bookmarks[0].start_secs, 105.0);
    }

    #[test]
    fn test_v8_ambiguous_matches_across_folders_never_autopicked() {
        let db = Database::in_memory().unwrap();
        let now = Utc::now();

        // Seed two identical filenames with identical size in DIFFERENT folders
        let item_a = MediaItem {
            id: "item_a".into(),
            fingerprint: "fp_folder_a".into(),
            file_path: "C:/Movies/Action/Inception.2010.mkv".into(),
            title: "Inception".into(),
            duration: 8880.0,
            size_bytes: 5_000_000_000,
            width: Some(1920),
            height: Some(1080),
            is_hdr: false,
            video_codec: Some("H264".into()),
            audio_codec: Some("AAC".into()),
            series_id: None,
            season_number: None,
            episode_number: None,
            is_missing: false,
            created_at: now,
            updated_at: now,
        };
        db.upsert_item(&item_a).unwrap();
        db.batch_upsert_scanned_files(&[valor_core::models::ScannedFileRecord {
            id: "file_a".into(),
            path: "C:/Movies/Action/Inception.2010.mkv".into(),
            size_bytes: 5_000_000_000,
            mtime_secs: 1600000000,
            fingerprint: "fp_folder_a".into(),
            legacy_fingerprint: None,
            item: item_a.clone(),
        }])
        .unwrap();

        let item_b = MediaItem {
            id: "item_b".into(),
            fingerprint: "fp_folder_b".into(),
            file_path: "D:/Backups/SciFi/Inception.2010.mkv".into(),
            title: "Inception".into(),
            duration: 8880.0,
            size_bytes: 5_000_000_000,
            width: Some(1920),
            height: Some(1080),
            is_hdr: false,
            video_codec: Some("H264".into()),
            audio_codec: Some("AAC".into()),
            series_id: None,
            season_number: None,
            episode_number: None,
            is_missing: false,
            created_at: now,
            updated_at: now,
        };
        db.upsert_item(&item_b).unwrap();
        db.batch_upsert_scanned_files(&[valor_core::models::ScannedFileRecord {
            id: "file_b".into(),
            path: "D:/Backups/SciFi/Inception.2010.mkv".into(),
            size_bytes: 5_000_000_000,
            mtime_secs: 1700000000,
            fingerprint: "fp_folder_b".into(),
            legacy_fingerprint: None,
            item: item_b.clone(),
        }])
        .unwrap();

        // Import payload referencing Inception.2010.mkv with identical size 5,000,000,000 bytes
        // and unknown web ID
        let json_export = r#"{
            "version": 1,
            "videos": [
                {
                    "id": "unknown_web_id_123",
                    "title": "Inception",
                    "file_name": "Inception.2010.mkv",
                    "size_bytes": 5000000000,
                    "current_time": 1200.0,
                    "duration": 8880.0
                },
                {
                    "id": "completely_unmatched_id_456",
                    "title": "Avatar 3",
                    "file_name": "Avatar.3.mkv",
                    "size_bytes": 8000000000
                }
            ]
        }"#;

        let report = WebMigrationImporter::import_json(json_export, &db, false).unwrap();

        println!("=== V8: IMPORTER AMBIGUITY VERIFICATION REPORT ===");
        println!(
            "  • Total Exported Videos: {}",
            report.total_exported_videos
        );
        println!(
            "  • Matched by Legacy Fingerprint: {}",
            report.matched_by_legacy_fingerprint
        );
        println!(
            "  • Matched by Filename and Size:  {}",
            report.matched_by_filename_and_size
        );
        println!(
            "  • Ambiguous Matches Detected:    {}",
            report.ambiguous_matches
        );
        println!(
            "  • Unmatched Videos Retained:     {}",
            report.unmatched_videos.len()
        );
        for u in &report.unmatched_videos {
            println!("      - [{}]: '{}' Reason: {}", u.id, u.title, u.reason);
        }

        // V8 Verification Assertions:
        assert_eq!(
            report.ambiguous_matches, 1,
            "Duplicate file across folders must be flagged AMBIGUOUS"
        );
        assert_eq!(
            report.matched_by_filename_and_size, 0,
            "Ambiguous match must NEVER be auto-picked!"
        );
        assert_eq!(
            report.unmatched_videos.len(),
            2,
            "Both ambiguous and nonexistent videos must be retained"
        );
        assert!(report.unmatched_videos[0].reason.contains("AMBIGUOUS"));
        assert!(report.unmatched_videos[0].reason.contains("Inception.2010.mkv"));

        // Verify neither candidate had its playback position updated
        assert!(db.get_playback_position("fp_folder_a").unwrap().is_none());
        assert!(db.get_playback_position("fp_folder_b").unwrap().is_none());
    }
}
