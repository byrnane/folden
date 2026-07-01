use super::*;
pub(crate) fn app_data_directory<R: Runtime>(
    app_handle: &tauri::AppHandle<R>,
    operation: &str,
) -> NativeResult<PathBuf> {
    let directory = app_handle.path().app_data_dir().map_err(|error| {
        native_error(
            FileErrorCode::Unknown,
            operation,
            "Could not access the Folden app data directory.",
            Some(error.to_string()),
            true,
        )
    })?;
    fs::create_dir_all(&directory).map_err(|error| io_error(operation, error))?;
    Ok(directory)
}
pub(crate) fn app_data_file_path<R: Runtime>(
    app_handle: &tauri::AppHandle<R>,
    operation: &str,
    file_name: &str,
) -> NativeResult<PathBuf> {
    Ok(app_data_directory(app_handle, operation)?.join(file_name))
}
pub(crate) fn remove_data_file_if_exists(path: &Path, operation: &str) -> NativeResult<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(io_error(operation, error)),
    }
}
pub(crate) fn save_json_file<T: serde::Serialize>(
    path: &Path,
    value: &T,
    operation: &str,
) -> NativeResult<()> {
    let bytes = serde_json::to_vec_pretty(value).map_err(|error| {
        native_error(
            FileErrorCode::Unknown,
            operation,
            "Could not serialize app data.",
            Some(error.to_string()),
            false,
        )
    })?;
    write_atomic_text_file(path, &bytes, operation)?;
    Ok(())
}
pub(crate) fn load_session_state_from_path(path: &Path) -> Option<PersistedSessionState> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}
pub(crate) fn load_recovery_snapshots_from_path(path: &Path) -> RecoveryLoadResult {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return RecoveryLoadResult {
                entries: Vec::new(),
                diagnostics: Vec::new(),
            }
        }
        Err(error) => {
            return RecoveryLoadResult {
                entries: Vec::new(),
                diagnostics: vec![format!("Could not read recovery data: {error}")],
            }
        }
    };
    let json: serde_json::Value = match serde_json::from_slice(&bytes) {
        Ok(json) => json,
        Err(error) => {
            return RecoveryLoadResult {
                entries: Vec::new(),
                diagnostics: vec![format!("Recovery data is malformed: {error}")],
            }
        }
    };
    let Some(items) = json.as_array() else {
        return RecoveryLoadResult {
            entries: Vec::new(),
            diagnostics: vec!["Recovery data must be a JSON array.".to_string()],
        };
    };
    let mut entries = Vec::new();
    let mut diagnostics = Vec::new();
    for (index, item) in items.iter().enumerate() {
        match serde_json::from_value::<RecoverySnapshot>(item.clone()) {
            Ok(entry) => entries.push(entry),
            Err(error) => {
                diagnostics.push(format!("Skipped recovery entry {}: {}", index + 1, error))
            }
        }
    }
    RecoveryLoadResult {
        entries,
        diagnostics,
    }
}
#[tauri::command]
pub(crate) fn load_session_state<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
) -> NativeResult<Option<PersistedSessionState>> {
    let path = app_data_file_path(&app_handle, "load_session_state", "session-state.json")?;
    Ok(load_session_state_from_path(&path))
}
#[tauri::command]
pub(crate) fn save_session_state<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
    session: Option<PersistedSessionState>,
) -> NativeResult<()> {
    let path = app_data_file_path(&app_handle, "save_session_state", "session-state.json")?;
    if let Some(session) = session {
        save_json_file(&path, &session, "save_session_state")?;
    } else {
        remove_data_file_if_exists(&path, "save_session_state")?;
    }
    Ok(())
}
#[tauri::command]
pub(crate) fn load_recovery_snapshots<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
) -> NativeResult<RecoveryLoadResult> {
    let path = app_data_file_path(
        &app_handle,
        "load_recovery_snapshots",
        "recovery-snapshots.json",
    )?;
    Ok(load_recovery_snapshots_from_path(&path))
}
#[tauri::command]
pub(crate) fn save_recovery_snapshots<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
    entries: Vec<RecoverySnapshot>,
) -> NativeResult<()> {
    let path = app_data_file_path(
        &app_handle,
        "save_recovery_snapshots",
        "recovery-snapshots.json",
    )?;
    if entries.is_empty() {
        remove_data_file_if_exists(&path, "save_recovery_snapshots")?;
    } else {
        save_json_file(&path, &entries, "save_recovery_snapshots")?;
    }
    Ok(())
}
