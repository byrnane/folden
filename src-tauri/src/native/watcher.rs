use super::*;
pub(crate) fn create_native_watcher<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
    self_write_suppressions: Arc<Mutex<HashMap<String, u64>>>,
) -> notify::Result<RecommendedWatcher> {
    RecommendedWatcher::new(
        move |result: Result<notify::Event, notify::Error>| {
            let event = match result {
                Ok(event) => event,
                Err(error) => {
                    let _ = app_handle.emit(
                        "folden://watcher-warning",
                        format!("Filesystem watcher error: {error}"),
                    );
                    return;
                }
            };
            let emit_event = |kind: &str, path: &Path| {
                if is_folden_temp_save_path(path) {
                    return;
                }
                let path_string = path_to_string(path);
                let normalized_path = normalize_key(&path_string);
                let current_time = now_ms();
                let mut suppressions = self_write_suppressions.lock().unwrap();
                suppressions.retain(|_, expires_at_ms| *expires_at_ms > current_time);
                if suppressions.contains_key(&normalized_path) {
                    return;
                }
                let _ = app_handle.emit(
                    "folden://fs-event",
                    NativeFsEvent {
                        kind: kind.to_string(),
                        path: path_string,
                    },
                );
            };
            match event.kind {
                notify::EventKind::Create(_) => {
                    for path in &event.paths {
                        emit_event("create", path);
                    }
                }
                notify::EventKind::Modify(ModifyKind::Name(RenameMode::From)) => {
                    for path in &event.paths {
                        emit_event("remove", path);
                    }
                }
                notify::EventKind::Modify(ModifyKind::Name(RenameMode::To)) => {
                    for path in &event.paths {
                        emit_event("create", path);
                    }
                }
                notify::EventKind::Modify(ModifyKind::Name(_)) => {
                    if let Some(path) = event.paths.first() {
                        emit_event("remove", path);
                    }
                    if let Some(path) = event.paths.get(1) {
                        emit_event("create", path);
                    }
                }
                notify::EventKind::Modify(_) => {
                    for path in &event.paths {
                        emit_event("modify", path);
                    }
                }
                notify::EventKind::Remove(_) => {
                    for path in &event.paths {
                        emit_event("remove", path);
                    }
                }
                _ => {}
            }
        },
        notify::Config::default(),
    )
}
pub(crate) fn is_folden_temp_save_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|name| {
            name.ends_with(".tmp")
                && (name.starts_with(".folden-save-") || name.starts_with(".folden-backup-"))
        })
        .unwrap_or(false)
}
pub(crate) fn register_self_write_suppression(state: &NativeAppState, path: &Path) {
    let expires_at_ms = now_ms() + 1_500;
    let normalized_path = normalize_key(&path_to_string(path));
    let mut suppressions = state.self_write_suppressions.lock().unwrap();
    suppressions.insert(normalized_path, expires_at_ms);
}
pub(crate) fn desired_watch_paths(state: &NativeAppState) -> HashMap<String, WatchPathMode> {
    let mut desired_paths = HashMap::new();
    for path in &state.workspace_watch_paths {
        desired_paths.insert(path.clone(), WatchPathMode::NonRecursive);
    }
    for document in state.documents.values() {
        let parent_is_watched = document
            .path
            .parent()
            .map(path_to_string)
            .map(|parent| state.workspace_watch_paths.contains(&parent))
            .unwrap_or(false);
        if parent_is_watched {
            continue;
        }
        desired_paths
            .entry(path_to_string(&document.path))
            .or_insert(WatchPathMode::NonRecursive);
    }
    desired_paths
}
pub(crate) fn sync_native_watcher<R: Runtime>(
    state: &mut NativeAppState,
    app_handle: &tauri::AppHandle<R>,
) -> NativeResult<()> {
    let desired_paths = desired_watch_paths(state);
    if desired_paths.is_empty() {
        if let Some(watcher) = state.watcher.as_mut() {
            for path in state.watched_paths.keys() {
                let _ = watcher.unwatch(Path::new(path));
            }
        }
        state.watcher = None;
        state.watched_paths.clear();
        return Ok(());
    }
    if state.watcher.is_none() {
        state.watcher = Some(
            create_native_watcher(app_handle.clone(), state.self_write_suppressions.clone())
                .map_err(|error| {
                    native_error(
                        FileErrorCode::Unknown,
                        "sync_native_watcher",
                        "Could not start the filesystem watcher.",
                        Some(error.to_string()),
                        true,
                    )
                })?,
        );
    }
    let watcher = state.watcher.as_mut().unwrap();
    let current_paths = state.watched_paths.clone();
    for path in current_paths.keys() {
        if desired_paths.contains_key(path) {
            continue;
        }
        watcher.unwatch(Path::new(path)).map_err(|error| {
            native_error(
                FileErrorCode::Unknown,
                "sync_native_watcher",
                "Could not stop watching a filesystem path.",
                Some(error.to_string()),
                true,
            )
        })?;
        state.watched_paths.remove(path);
    }
    for (path, mode) in desired_paths {
        let should_rewatch = state
            .watched_paths
            .get(&path)
            .map(|current_mode| current_mode != &mode)
            .unwrap_or(true);
        if !should_rewatch {
            continue;
        }
        if state.watched_paths.contains_key(&path) {
            watcher.unwatch(Path::new(&path)).map_err(|error| {
                native_error(
                    FileErrorCode::Unknown,
                    "sync_native_watcher",
                    "Could not update a watched filesystem path.",
                    Some(error.to_string()),
                    true,
                )
            })?;
        }
        watcher
            .watch(Path::new(&path), mode.recursive_mode())
            .map_err(|error| {
                native_error(
                    FileErrorCode::Unknown,
                    "sync_native_watcher",
                    "Could not watch a filesystem path.",
                    Some(format!("{path}: {error}")),
                    true,
                )
            })?;
        state.watched_paths.insert(path, mode);
    }
    let _ = app_handle.emit("folden://watcher-warning", Option::<String>::None);
    Ok(())
}
