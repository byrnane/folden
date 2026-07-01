use notify::{
    event::{ModifyKind, RenameMode},
    RecommendedWatcher, RecursiveMode, Watcher,
};
use std::collections::HashMap;
use std::fs;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager, Runtime};
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};

mod native {
    use super::*;

    pub(super) mod diagnostics;
    pub(super) mod documents;
    pub(super) mod errors;
    pub(super) mod paths;
    pub(super) mod persistence;
    pub(super) mod state;
    pub(super) mod types;
    pub(super) mod watcher;
    pub(super) mod workspace;

    #[allow(unused_imports)]
    pub(super) use diagnostics::*;
    pub(super) use documents::*;
    pub(super) use errors::*;
    pub(super) use paths::*;
    pub(super) use persistence::*;
    pub(super) use state::*;
    pub(super) use types::*;
    pub(super) use watcher::*;
    pub(super) use workspace::*;
}

#[allow(unused_imports)]
use native::diagnostics::*;
use native::documents::*;
#[cfg(test)]
use native::errors::*;
#[cfg(test)]
use native::paths::*;
use native::persistence::*;
use native::state::*;
#[cfg(test)]
use native::types::*;
#[cfg(test)]
use native::watcher::*;
use native::workspace::*;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(NativeAppState::default()))
        .setup(|app| {
            app.handle().plugin(
                tauri_plugin_log::Builder::new()
                    .clear_targets()
                    .target(Target::new(TargetKind::LogDir {
                        file_name: Some("folden".into()),
                    }))
                    .level(if cfg!(debug_assertions) {
                        log::LevelFilter::Debug
                    } else {
                        log::LevelFilter::Info
                    })
                    .rotation_strategy(RotationStrategy::KeepSome(5))
                    .max_file_size(256_000)
                    .build(),
            )?;

            std::panic::set_hook(Box::new(|panic_info| {
                log::error!(target: "panic", "{panic_info}");
            }));
            log::info!(
                target: "app",
                "Folden {} starting on {}-{}",
                env!("CARGO_PKG_VERSION"),
                std::env::consts::OS,
                std::env::consts::ARCH
            );

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_text_file,
            open_text_file_at_path,
            save_text_file,
            open_workspace_directory,
            restore_workspace_by_path,
            load_session_state,
            save_session_state,
            load_recovery_snapshots,
            save_recovery_snapshots,
            close_native_documents,
            log_frontend_event,
            open_logs_folder,
            export_diagnostics,
            list_directory,
            open_text_file_by_path,
            create_file,
            create_directory,
            rename_path,
            trash_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    struct TempWorkspace {
        path: PathBuf,
    }

    impl TempWorkspace {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!("folden-tests-{}", next_id("temp")));
            fs::create_dir_all(&path).expect("failed to create temp workspace");

            Self { path }
        }
    }

    impl Drop for TempWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn test_workspace() -> AuthorizedWorkspace {
        let temp = TempWorkspace::new();
        let path = temp.path.clone();
        std::mem::forget(temp);
        let canonical_root =
            fs::canonicalize(&path).expect("failed to canonicalize temp workspace");

        AuthorizedWorkspace {
            root_path: canonical_root,
        }
    }

    #[test]
    fn validate_name_rejects_invalid_windows_values() {
        assert_eq!(
            validate_name("   ").unwrap_err().code,
            FileErrorCode::InvalidName
        );
        assert_eq!(
            validate_name("nested/file.md").unwrap_err().code,
            FileErrorCode::InvalidName
        );
        assert_eq!(
            validate_name("CON").unwrap_err().code,
            FileErrorCode::InvalidName
        );
        assert!(validate_name("draft.md").is_ok());
    }

    #[test]
    fn relative_paths_reject_absolute_and_traversal_input() {
        assert_eq!(
            ensure_relative_path("..\\secret.txt", "test")
                .unwrap_err()
                .code,
            FileErrorCode::OutsideWorkspace
        );
        assert_eq!(
            ensure_relative_path("C:\\secret.txt", "test")
                .unwrap_err()
                .code,
            FileErrorCode::OutsideWorkspace
        );
        assert_eq!(
            ensure_not_workspace_root("", "trash_path")
                .unwrap_err()
                .code,
            FileErrorCode::WorkspaceRootProtected
        );
    }

    #[test]
    fn workspace_child_targets_stay_inside_root() {
        let workspace = test_workspace();
        let notes = workspace.root_path.join("notes");
        fs::create_dir_all(&notes).expect("failed to create notes directory");

        let (child, relative_path) =
            workspace_child_target(&workspace, "notes", "draft.md", "create_file")
                .expect("expected child path inside workspace");

        assert_eq!(
            path_to_string(&child),
            path_to_string(&notes.join("draft.md"))
        );
        assert_eq!(relative_path, "notes\\draft.md");
    }

    #[test]
    fn native_error_serializes_with_stable_shape() {
        let error = native_error(
            FileErrorCode::InvalidName,
            "create_file",
            "Name is invalid.",
            Some("control characters are not allowed".to_string()),
            false,
        );

        let payload = serde_json::to_value(error).expect("failed to serialize native error");

        assert_eq!(payload["code"], "invalid_name");
        assert_eq!(payload["operation"], "create_file");
        assert_eq!(payload["userMessage"], "Name is invalid.");
        assert_eq!(
            payload["technicalMessage"],
            "control characters are not allowed"
        );
        assert_eq!(payload["retryable"], false);
    }

    #[test]
    fn native_contracts_match_stable_fixture_shapes() {
        let fixture: serde_json::Value = serde_json::from_str(include_str!(
            "../../tests/contracts/native/stable-contracts.json"
        ))
        .expect("fixture should be valid json");

        let native_error = NativeError {
            code: FileErrorCode::FileChangedExternally,
            operation: "save_text_file".to_string(),
            user_message: "File changed outside Folden.".to_string(),
            technical_message: None,
            retryable: true,
        };
        assert_eq!(
            serde_json::to_value(native_error).expect("native error should serialize"),
            fixture["nativeError"]
        );

        let fingerprint = FileFingerprint {
            size: 42,
            modified_at_ms: 1_720_000_000_000,
        };
        assert_eq!(
            serde_json::to_value(&fingerprint).expect("fingerprint should serialize"),
            fixture["fileFingerprint"]
        );

        let file_format = TextFileFormat {
            line_ending: "crlf".to_string(),
            has_utf8_bom: true,
        };
        assert_eq!(
            serde_json::to_value(&file_format).expect("format should serialize"),
            fixture["textFileFormat"]
        );

        let workspace_descriptor = WorkspaceDescriptor {
            id: "workspace-1".to_string(),
            root_path: "C:\\Fixture".to_string(),
            name: "Fixture".to_string(),
        };
        assert_eq!(
            serde_json::to_value(workspace_descriptor).expect("workspace should serialize"),
            fixture["workspaceDescriptor"]
        );

        let workspace_entry = WorkspaceEntry {
            name: "notes".to_string(),
            path: "notes".to_string(),
            kind: "directory".to_string(),
            children: vec![WorkspaceEntry {
                name: "hello.md".to_string(),
                path: "notes\\hello.md".to_string(),
                kind: "file".to_string(),
                children: Vec::new(),
            }],
        };
        assert_eq!(
            serde_json::to_value(workspace_entry).expect("workspace entry should serialize"),
            fixture["workspaceEntry"]
        );

        let opened_document = OpenedDocument {
            id: "document-1".to_string(),
            path: "C:\\Fixture\\notes\\hello.md".to_string(),
            content: "# Hello".to_string(),
            workspace_id: Some("workspace-1".to_string()),
            relative_path: Some("notes\\hello.md".to_string()),
            file_format,
            fingerprint: Some(fingerprint),
        };
        assert_eq!(
            serde_json::to_value(opened_document).expect("opened document should serialize"),
            fixture["openedDocument"]
        );

        let session: PersistedSessionState =
            serde_json::from_value(fixture["persistedSessionState"].clone())
                .expect("session fixture should deserialize");
        assert_eq!(
            serde_json::to_value(session).expect("session should serialize"),
            fixture["persistedSessionState"]
        );

        let recovery: RecoverySnapshot =
            serde_json::from_value(fixture["recoverySnapshot"].clone())
                .expect("recovery fixture should deserialize");
        assert_eq!(
            serde_json::to_value(recovery).expect("recovery should serialize"),
            fixture["recoverySnapshot"]
        );

        let fs_event = NativeFsEvent {
            kind: "modify".to_string(),
            path: "C:\\Fixture\\notes\\hello.md".to_string(),
        };
        assert_eq!(
            serde_json::to_value(fs_event).expect("fs event should serialize"),
            fixture["nativeFsEvent"]
        );
    }

    #[test]
    fn decode_and_encode_preserve_utf8_bom_and_line_endings() {
        let temp = TempWorkspace::new();
        let path = temp.path.join("format.md");
        fs::write(&path, [0xEF, 0xBB, 0xBF, b'a', b'\r', b'\n', b'b'])
            .expect("failed to write test file");

        let (content, format, fingerprint) =
            decode_text_file(&path, "decode_text_file").expect("expected text file to decode");

        assert_eq!(content, "a\r\nb");
        assert_eq!(
            format,
            TextFileFormat {
                line_ending: "crlf".to_string(),
                has_utf8_bom: true,
            }
        );
        assert!(fingerprint.size > 0);
        assert_eq!(
            encode_text_content(&content, &format),
            vec![0xEF, 0xBB, 0xBF, b'a', b'\r', b'\n', b'b']
        );
    }

    #[test]
    fn stale_fingerprint_is_rejected() {
        let temp = TempWorkspace::new();
        let path = temp.path.join("draft.md");
        fs::write(&path, "first").expect("failed to write initial file");
        let stale_fingerprint = FileFingerprint {
            size: 999,
            modified_at_ms: 1,
        };

        let error = ensure_expected_fingerprint(&path, Some(&stale_fingerprint), "save_text_file")
            .expect_err("expected stale fingerprint conflict");

        assert_eq!(error.code, FileErrorCode::FileChangedExternally);
    }

    #[test]
    fn failed_atomic_replace_keeps_original_content() {
        let temp = TempWorkspace::new();
        let path = temp.path.join("draft.md");
        fs::write(&path, "original").expect("failed to write original file");

        let result = write_atomic_bytes_with(&path, b"updated", |_target, _replacement| {
            Err(std::io::Error::other("simulated replace failure"))
        });

        assert!(result.is_err());
        assert_eq!(
            fs::read_to_string(&path).expect("failed to read original file"),
            "original"
        );
    }

    #[test]
    fn atomic_text_write_replaces_existing_file() {
        let temp = TempWorkspace::new();
        let path = temp.path.join("draft.md");
        fs::write(&path, "original").expect("failed to write original file");

        write_atomic_text_file(&path, b"updated", "save_text_file")
            .expect("expected existing file to be replaced");

        assert_eq!(
            fs::read_to_string(&path).expect("failed to read updated file"),
            "updated"
        );
    }

    #[test]
    fn folden_temp_save_paths_are_ignored_by_watcher() {
        assert!(is_folden_temp_save_path(Path::new(
            ".folden-save-write-1.tmp"
        )));
        assert!(is_folden_temp_save_path(Path::new(
            "C:\\Docs\\.folden-save-write-1.tmp"
        )));
        assert!(is_folden_temp_save_path(Path::new(
            ".folden-backup-replace-1.tmp"
        )));
        assert!(is_folden_temp_save_path(Path::new(
            "C:\\Docs\\.folden-backup-replace-1.tmp"
        )));
        assert!(!is_folden_temp_save_path(Path::new("draft.md")));
    }

    #[test]
    fn diagnostic_report_redacts_paths_and_excludes_app_state_content() {
        let temp = TempWorkspace::new();
        let app_data_dir = temp.path.join("app-data");
        let log_dir = temp.path.join("logs");
        fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");
        fs::create_dir_all(&log_dir).expect("failed to create log dir");
        fs::write(
            log_dir.join("folden.log"),
            "opened C:\\Users\\Max\\Documents\\private.md\nsaved secret draft text\n",
        )
        .expect("failed to write log");
        fs::write(
            app_data_dir.join("recovery-snapshots.json"),
            r#"[{"content":"must not appear"}]"#,
        )
        .expect("failed to write recovery state");

        let report = build_diagnostic_report(&app_data_dir, &log_dir);

        assert!(report.contains("Folden Diagnostics"));
        assert!(report.contains("[path]"));
        assert!(!report.contains("C:\\Users\\Max\\Documents\\private.md"));
        assert!(!report.contains("must not appear"));
    }

    #[test]
    fn malformed_recovery_entries_are_skipped_without_crashing() {
        let temp = TempWorkspace::new();
        let path = temp.path.join("recovery-snapshots.json");
        fs::write(
            &path,
            r#"[
              {"key":"saved:a","kind":"saved","path":"C:\\Docs\\a.md","workspaceRootPath":null,"relativePath":null,"name":"a.md","content":"A","fileFormat":{"lineEnding":"lf","hasUtf8Bom":false},"fingerprint":null,"updatedAtMs":1},
              {"key":42}
            ]"#,
        )
        .expect("failed to write malformed recovery file");

        let result = load_recovery_snapshots_from_path(&path);

        assert_eq!(result.entries.len(), 1);
        assert_eq!(result.entries[0].key, "saved:a");
        assert_eq!(result.diagnostics.len(), 1);
    }

    #[test]
    fn invalid_recovery_root_returns_diagnostic() {
        let temp = TempWorkspace::new();
        let path = temp.path.join("recovery-snapshots.json");
        fs::write(&path, "{\"broken\":true}").expect("failed to write invalid recovery file");

        let result = load_recovery_snapshots_from_path(&path);

        assert!(result.entries.is_empty());
        assert_eq!(
            result.diagnostics,
            vec!["Recovery data must be a JSON array.".to_string()]
        );
    }
}
