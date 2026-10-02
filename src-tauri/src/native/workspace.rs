use super::*;

#[derive(Clone, Copy)]
#[allow(dead_code)]
pub(crate) struct WorkspaceTraversalOptions {
    pub(crate) max_entries: usize,
    pub(crate) max_depth: usize,
    pub(crate) batch_size: usize,
}

#[derive(Debug, PartialEq, Eq)]
#[allow(dead_code)]
pub(crate) enum WorkspaceTraversalStatus {
    Complete,
    LimitReached,
    Cancelled,
}

#[allow(dead_code)]
pub(crate) struct WorkspaceTraversalResult {
    pub(crate) batches: Vec<Vec<PathBuf>>,
    pub(crate) status: WorkspaceTraversalStatus,
}

#[allow(dead_code)]
pub(crate) fn begin_workspace_traversal(state: &mut NativeAppState) -> Arc<AtomicBool> {
    state
        .workspace_traversal_cancel
        .store(true, Ordering::Relaxed);
    let token = Arc::new(AtomicBool::new(false));
    state.workspace_traversal_cancel = Arc::clone(&token);
    token
}

#[allow(dead_code)]
pub(crate) fn traverse_workspace(
    root: &Path,
    options: WorkspaceTraversalOptions,
    cancelled: &AtomicBool,
    operation: &str,
) -> NativeResult<WorkspaceTraversalResult> {
    traverse_workspace_inner(root, options, cancelled, operation, |_| {})
}

#[cfg(test)]
pub(crate) fn traverse_workspace_with_hook<F>(
    root: &Path,
    options: WorkspaceTraversalOptions,
    cancelled: &AtomicBool,
    operation: &str,
    before_entry: F,
) -> NativeResult<WorkspaceTraversalResult>
where
    F: FnMut(usize),
{
    traverse_workspace_inner(root, options, cancelled, operation, before_entry)
}

fn traverse_workspace_inner<F>(
    root: &Path,
    options: WorkspaceTraversalOptions,
    cancelled: &AtomicBool,
    operation: &str,
    mut before_entry: F,
) -> NativeResult<WorkspaceTraversalResult>
where
    F: FnMut(usize),
{
    let mut batches = Vec::new();
    let mut batch = Vec::with_capacity(options.batch_size.max(1));
    let status = visit_workspace_entries(
        root,
        options,
        cancelled,
        operation,
        &mut before_entry,
        |_| true,
        |path, _| {
            batch.push(path.to_path_buf());
            if batch.len() >= options.batch_size.max(1) {
                batches.push(std::mem::take(&mut batch));
                batch = Vec::with_capacity(options.batch_size.max(1));
            }
            true
        },
    )?;
    if !batch.is_empty() {
        batches.push(batch);
    }
    Ok(WorkspaceTraversalResult { batches, status })
}

pub(crate) fn visit_workspace_entries<F, G, H>(
    root: &Path,
    options: WorkspaceTraversalOptions,
    cancelled: &AtomicBool,
    operation: &str,
    mut before_entry: F,
    mut include_path: G,
    mut visit: H,
) -> NativeResult<WorkspaceTraversalStatus>
where
    F: FnMut(usize),
    G: FnMut(&Path) -> bool,
    H: FnMut(&Path, &fs::FileType) -> bool,
{
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    let mut visited = 0usize;
    let mut limited_depth = false;
    while let Some((directory, depth)) = stack.pop() {
        for entry in fs::read_dir(&directory).map_err(|error| io_error(operation, error))? {
            before_entry(visited);
            if cancelled.load(Ordering::Relaxed) {
                return Ok(WorkspaceTraversalStatus::Cancelled);
            }
            if visited >= options.max_entries {
                return Ok(WorkspaceTraversalStatus::LimitReached);
            }
            visited += 1;
            let entry = entry.map_err(|error| io_error(operation, error))?;
            let path = entry.path();
            let metadata = entry
                .metadata()
                .map_err(|error| io_error(operation, error))?;
            let file_type = metadata.file_type();
            if file_type.is_symlink()
                || is_reparse_metadata(&metadata)
                || (file_type.is_dir() && should_skip_directory(&path))
                || !include_path(&path)
            {
                continue;
            }
            if !visit(&path, &file_type) {
                return Ok(WorkspaceTraversalStatus::LimitReached);
            }
            if file_type.is_dir() {
                if depth < options.max_depth {
                    stack.push((path, depth + 1));
                } else {
                    limited_depth = true;
                }
            }
        }
    }
    Ok(if limited_depth {
        WorkspaceTraversalStatus::LimitReached
    } else {
        WorkspaceTraversalStatus::Complete
    })
}
pub(crate) fn is_text_file(path: &Path) -> bool {
    let Some(extension) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };
    matches!(
        extension.to_ascii_lowercase().as_str(),
        "md" | "markdown"
            | "txt"
            | "json"
            | "toml"
            | "rs"
            | "ts"
            | "js"
            | "vue"
            | "css"
            | "html"
            | "yml"
            | "yaml"
    )
}
pub(crate) fn should_skip_directory(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    matches!(
        name.to_ascii_lowercase().as_str(),
        ".git" | ".folden" | "node_modules" | "dist" | "build" | "target" | ".cache"
    )
}
pub(crate) fn get_workspace<'a>(
    state: &'a NativeAppState,
    workspace_id: &str,
    operation: &str,
) -> NativeResult<&'a AuthorizedWorkspace> {
    state.workspaces.get(workspace_id).ok_or_else(|| {
        native_error(
            FileErrorCode::NotFound,
            operation,
            "Workspace is no longer authorized.",
            Some(workspace_id.to_string()),
            false,
        )
    })
}
pub(crate) fn resolve_workspace_path(
    workspace: &AuthorizedWorkspace,
    relative_path: &str,
    operation: &str,
) -> NativeResult<(PathBuf, PathBuf)> {
    let relative_path = ensure_relative_path(relative_path, operation)?;
    let target_path = workspace.root_path.join(&relative_path);
    let canonical_path =
        fs::canonicalize(&target_path).map_err(|error| io_error(operation, error))?;
    ensure_inside_root(&workspace.root_path, &canonical_path, operation)?;
    Ok((canonical_path, relative_path))
}
pub(crate) fn resolve_workspace_parent(
    workspace: &AuthorizedWorkspace,
    parent_path: &str,
    operation: &str,
) -> NativeResult<(PathBuf, PathBuf)> {
    let relative_parent = ensure_relative_path(parent_path, operation)?;
    let target_parent = workspace.root_path.join(&relative_parent);
    let canonical_parent =
        fs::canonicalize(&target_parent).map_err(|error| io_error(operation, error))?;
    ensure_inside_root(&workspace.root_path, &canonical_parent, operation)?;
    Ok((canonical_parent, relative_parent))
}
pub(crate) fn workspace_child_target(
    workspace: &AuthorizedWorkspace,
    parent_path: &str,
    name: &str,
    operation: &str,
) -> NativeResult<(PathBuf, String)> {
    let valid_name = validate_name(name)?;
    let (canonical_parent, relative_parent) =
        resolve_workspace_parent(workspace, parent_path, operation)?;
    let child_path = canonical_parent.join(&valid_name);
    let relative_path = if relative_parent.as_os_str().is_empty() {
        PathBuf::from(&valid_name)
    } else {
        relative_parent.join(&valid_name)
    };
    Ok((child_path, relative_path_to_string(&relative_path)))
}
pub(crate) fn register_workspace(state: &mut NativeAppState, path: PathBuf) -> WorkspaceDescriptor {
    let id = next_id("workspace");
    let descriptor = WorkspaceDescriptor {
        id: id.clone(),
        root_path: path_to_string(&path),
        name: workspace_name_from_path(&path),
    };
    state
        .workspaces
        .insert(id, AuthorizedWorkspace { root_path: path });
    descriptor
}
pub(crate) fn authorize_workspace_assets<R: Runtime>(
    app_handle: &tauri::AppHandle<R>,
    root_path: &Path,
    operation: &str,
) -> NativeResult<()> {
    app_handle
        .asset_protocol_scope()
        .allow_directory(root_path, true)
        .map_err(|error| {
            native_error(
                FileErrorCode::Unknown,
                operation,
                "Could not authorize workspace assets for preview.",
                Some(error.to_string()),
                true,
            )
        })
}
pub(crate) fn detect_workspace_membership(
    state: &NativeAppState,
    path: &Path,
) -> (Option<String>, Option<String>) {
    for (workspace_id, workspace) in &state.workspaces {
        if path.starts_with(&workspace.root_path) {
            let relative_path = path
                .strip_prefix(&workspace.root_path)
                .ok()
                .map(relative_path_to_string)
                .filter(|value| !value.is_empty());
            return (Some(workspace_id.clone()), relative_path);
        }
    }
    (None, None)
}
pub(crate) fn read_workspace_entries(
    root: &Path,
    path: &Path,
    operation: &str,
) -> NativeResult<Vec<WorkspaceEntry>> {
    let mut entries = Vec::new();
    for entry in fs::read_dir(path).map_err(|error| io_error(operation, error))? {
        let entry = entry.map_err(|error| io_error(operation, error))?;
        let entry_path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| io_error(operation, error))?;
        let name = entry.file_name().to_string_lossy().to_string();
        let relative_path = entry_path
            .strip_prefix(root)
            .map(relative_path_to_string)
            .map_err(|error| {
                native_error(
                    FileErrorCode::OutsideWorkspace,
                    operation,
                    "Path is outside the authorized workspace.",
                    Some(error.to_string()),
                    false,
                )
            })?;
        if file_type.is_dir() {
            if should_skip_directory(&entry_path) {
                continue;
            }
            entries.push(WorkspaceEntry {
                name,
                path: relative_path,
                kind: "directory".to_string(),
                openable_state: "unknown".to_string(),
                children: Vec::new(),
            });
        } else if file_type.is_file() && is_text_file(&entry_path) {
            entries.push(WorkspaceEntry {
                name,
                path: relative_path,
                kind: "file".to_string(),
                openable_state: "present".to_string(),
                children: Vec::new(),
            });
        }
    }
    entries.sort_by(|left, right| {
        let left_is_dir = left.kind == "directory";
        let right_is_dir = right.kind == "directory";
        right_is_dir
            .cmp(&left_is_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}
pub(crate) fn update_registered_document_paths(
    state: &mut NativeAppState,
    workspace_id: &str,
    previous_relative_path: &str,
    next_relative_path: &str,
    workspace_root: &Path,
) {
    let previous_relative_path = previous_relative_path.replace('\\', "/");
    let next_relative_path = next_relative_path.replace('\\', "/");
    let previous_key = normalize_key(&previous_relative_path);
    for document in state.documents.values_mut() {
        if document.workspace_id.as_deref() != Some(workspace_id) {
            continue;
        }
        let Some(relative_path) = document.relative_path.clone() else {
            continue;
        };
        let relative_path = relative_path.replace('\\', "/");
        let normalized_relative_path = normalize_key(&relative_path);
        if normalized_relative_path != previous_key
            && !normalized_relative_path.starts_with(&format!("{previous_key}/"))
        {
            continue;
        }
        let next_relative = if relative_path == previous_relative_path {
            next_relative_path.to_string()
        } else {
            format!(
                "{next_relative_path}{}",
                &relative_path[previous_relative_path.len()..]
            )
        };
        let next_path = workspace_root.join(&next_relative);
        document.path = next_path.clone();
        document.relative_path = Some(next_relative);
    }
    let previous_absolute = path_to_string(&workspace_root.join(&previous_relative_path));
    let next_absolute = path_to_string(&workspace_root.join(&next_relative_path));
    let previous_absolute_key = normalize_key(&previous_absolute);
    state.workspace_watch_paths = state
        .workspace_watch_paths
        .iter()
        .map(|path| {
            let key = normalize_key(path);
            if key == previous_absolute_key || key.starts_with(&format!("{previous_absolute_key}/"))
            {
                format!("{next_absolute}{}", &path[previous_absolute.len()..])
            } else {
                path.clone()
            }
        })
        .collect();
}
#[tauri::command]
pub(crate) fn open_workspace_directory(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
) -> NativeResult<Option<WorkspaceDescriptor>> {
    let Some(path) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
    };
    let canonical_path = canonical_root(&path, "open_workspace_directory")?;
    authorize_workspace_assets(&app_handle, &canonical_path, "open_workspace_directory")?;
    let mut state = state.lock().unwrap();
    let descriptor = register_workspace(&mut state, canonical_path);
    sync_native_watcher(&mut state, &app_handle)?;
    Ok(Some(descriptor))
}
#[tauri::command]
pub(crate) fn restore_workspace_by_path(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
    root_path: String,
) -> NativeResult<WorkspaceDescriptor> {
    let canonical_path = canonical_root(Path::new(&root_path), "restore_workspace_by_path")?;
    authorize_workspace_assets(&app_handle, &canonical_path, "restore_workspace_by_path")?;
    let mut state = state.lock().unwrap();
    let descriptor = register_workspace(&mut state, canonical_path);
    sync_native_watcher(&mut state, &app_handle)?;
    Ok(descriptor)
}
#[tauri::command]
pub(crate) fn list_directory(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    workspace_id: String,
    path: String,
) -> NativeResult<Vec<WorkspaceEntry>> {
    let state = state.lock().unwrap();
    let workspace = get_workspace(&state, &workspace_id, "list_directory")?;
    let (canonical_path, _) = if path.trim().is_empty() {
        (workspace.root_path.clone(), PathBuf::new())
    } else {
        resolve_workspace_path(workspace, &path, "list_directory")?
    };
    read_workspace_entries(&workspace.root_path, &canonical_path, "list_directory")
}

pub(crate) fn workspace_watch_scope_paths(
    workspace: &AuthorizedWorkspace,
    loaded_paths: &[String],
    settings: &WorkspaceSettings,
) -> NativeResult<HashSet<String>> {
    let ignored_paths = settings
        .ignored_paths
        .iter()
        .map(|path| ensure_relative_path(path, "sync_workspace_watch_scope"))
        .collect::<NativeResult<Vec<_>>>()?;
    let mut watch_paths = HashSet::from([path_to_string(&workspace.root_path)]);
    for relative_path in loaded_paths {
        if relative_path.trim().is_empty() {
            continue;
        }
        let normalized_path = ensure_relative_path(relative_path, "sync_workspace_watch_scope")?;
        if ignored_paths.iter().any(|ignored_path| {
            let path = normalize_key(&relative_path_to_string(&normalized_path));
            let ignored = normalize_key(&relative_path_to_string(ignored_path));
            path == ignored || path.starts_with(&format!("{ignored}/"))
        }) {
            continue;
        }
        let (path, _) =
            resolve_workspace_path(workspace, relative_path, "sync_workspace_watch_scope")?;
        if path.is_dir() {
            watch_paths.insert(path_to_string(&path));
        }
    }
    Ok(watch_paths)
}

#[tauri::command]
pub(crate) fn sync_workspace_watch_scope(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
    workspace_id: Option<String>,
    loaded_paths: Vec<String>,
) -> NativeResult<()> {
    let mut state = state.lock().unwrap();
    let mut watch_paths = HashSet::new();
    if let Some(workspace_id) = workspace_id {
        let workspace = get_workspace(&state, &workspace_id, "sync_workspace_watch_scope")?.clone();
        let settings = load_workspace_settings_from_path(&workspace_settings_path(&workspace))
            .map_err(|message| {
                native_error(
                    FileErrorCode::Unknown,
                    "sync_workspace_watch_scope",
                    "Workspace settings are invalid; watcher scope was not changed.",
                    Some(message),
                    false,
                )
            })?;
        watch_paths = workspace_watch_scope_paths(&workspace, &loaded_paths, &settings)?;
    }
    state.workspace_watch_paths = watch_paths;
    sync_native_watcher(&mut state, &app_handle)
}
fn workspace_settings_path(workspace: &AuthorizedWorkspace) -> PathBuf {
    workspace.root_path.join(".folden").join("workspace.json")
}
pub(crate) fn load_workspace_settings_from_path(path: &Path) -> Result<WorkspaceSettings, String> {
    if !path.exists() {
        return Ok(WorkspaceSettings {
            ignored_paths: Vec::new(),
        });
    }

    let content = fs::read_to_string(path).map_err(|error| error.to_string())?;
    let mut settings: WorkspaceSettings = serde_json::from_str(&content)
        .map_err(|error| format!("Workspace settings must be valid JSON: {error}"))?;

    if settings.ignored_paths.iter().any(|value| {
        value.trim().is_empty() || ensure_relative_path(value, "load_workspace_settings").is_err()
    }) {
        return Err("Workspace ignored paths must be relative paths.".to_string());
    }

    settings.ignored_paths = settings
        .ignored_paths
        .iter()
        .map(|value| value.replace('\\', "/"))
        .collect();

    Ok(settings)
}
#[tauri::command]
pub(crate) fn load_workspace_settings(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    workspace_id: String,
) -> NativeResult<WorkspaceSettings> {
    let state = state.lock().unwrap();
    let workspace = get_workspace(&state, &workspace_id, "load_workspace_settings")?;
    load_workspace_settings_from_path(&workspace_settings_path(workspace)).map_err(|message| {
        native_error(
            FileErrorCode::Unknown,
            "load_workspace_settings",
            "Workspace settings are invalid; Folden used empty workspace settings.",
            Some(message),
            false,
        )
    })
}
#[tauri::command]
pub(crate) fn save_workspace_settings(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    workspace_id: String,
    mut settings: WorkspaceSettings,
) -> NativeResult<()> {
    let state = state.lock().unwrap();
    let workspace = get_workspace(&state, &workspace_id, "save_workspace_settings")?;
    let settings_dir = workspace.root_path.join(".folden");
    fs::create_dir_all(&settings_dir)
        .map_err(|error| io_error("save_workspace_settings", error))?;

    for path in &settings.ignored_paths {
        ensure_not_workspace_root(path, "save_workspace_settings")?;
        ensure_relative_path(path, "save_workspace_settings")?;
    }
    settings.ignored_paths = settings
        .ignored_paths
        .iter()
        .map(|value| value.replace('\\', "/"))
        .collect();

    let content = serde_json::to_vec_pretty(&settings).map_err(|error| {
        native_error(
            FileErrorCode::Unknown,
            "save_workspace_settings",
            "Could not serialize workspace settings.",
            Some(error.to_string()),
            false,
        )
    })?;
    let canonical_settings_dir = fs::canonicalize(&settings_dir)
        .map_err(|error| io_error("save_workspace_settings", error))?;
    ensure_inside_root(
        &workspace.root_path,
        &canonical_settings_dir,
        "save_workspace_settings",
    )?;
    let target_path = canonical_settings_dir.join("workspace.json");
    if target_path.exists() {
        let canonical_target = fs::canonicalize(&target_path)
            .map_err(|error| io_error("save_workspace_settings", error))?;
        ensure_inside_root(
            &workspace.root_path,
            &canonical_target,
            "save_workspace_settings",
        )?;
    }
    write_atomic_text_file(&target_path, &content, "save_workspace_settings")?;
    Ok(())
}
#[tauri::command]
pub(crate) fn open_text_file_by_path(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
    workspace_id: String,
    path: String,
) -> NativeResult<OpenedDocument> {
    let mut state = state.lock().unwrap();
    let workspace = get_workspace(&state, &workspace_id, "open_text_file_by_path")?.clone();
    let (canonical_path, relative_path) =
        resolve_workspace_path(&workspace, &path, "open_text_file_by_path")?;
    let (content, file_format, fingerprint) =
        decode_text_file(&canonical_path, "open_text_file_by_path")?;
    let opened_document = register_document(
        &mut state,
        canonical_path,
        Some(workspace_id),
        Some(relative_path_to_string(&relative_path)),
        content,
        file_format,
        Some(fingerprint),
    );
    sync_native_watcher(&mut state, &app_handle)?;
    Ok(opened_document)
}
#[tauri::command]
pub(crate) fn create_file(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    workspace_id: String,
    parent_path: String,
    name: String,
) -> NativeResult<String> {
    let state = state.lock().unwrap();
    let workspace = get_workspace(&state, &workspace_id, "create_file")?;
    let (path, relative_path) =
        workspace_child_target(workspace, &parent_path, &name, "create_file")?;
    if path.exists() {
        return Err(native_error(
            FileErrorCode::AlreadyExists,
            "create_file",
            "File already exists.",
            Some(relative_path),
            false,
        ));
    }
    fs::write(&path, "").map_err(|error| io_error("create_file", error))?;
    Ok(relative_path)
}
#[tauri::command]
pub(crate) fn create_directory(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    workspace_id: String,
    parent_path: String,
    name: String,
) -> NativeResult<String> {
    let state = state.lock().unwrap();
    let workspace = get_workspace(&state, &workspace_id, "create_directory")?;
    let (path, relative_path) =
        workspace_child_target(workspace, &parent_path, &name, "create_directory")?;
    if path.exists() {
        return Err(native_error(
            FileErrorCode::AlreadyExists,
            "create_directory",
            "Directory already exists.",
            Some(relative_path),
            false,
        ));
    }
    fs::create_dir(&path).map_err(|error| io_error("create_directory", error))?;
    Ok(relative_path)
}
#[tauri::command]
pub(crate) fn rename_path(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
    workspace_id: String,
    path: String,
    new_name: String,
) -> NativeResult<String> {
    ensure_not_workspace_root(&path, "rename_path")?;
    let valid_name = validate_name(&new_name)?;
    let mut state = state.lock().unwrap();
    let workspace = get_workspace(&state, &workspace_id, "rename_path")?.clone();
    let (canonical_path, relative_path) = resolve_workspace_path(&workspace, &path, "rename_path")?;
    let parent = canonical_path.parent().ok_or_else(|| {
        native_error(
            FileErrorCode::Unknown,
            "rename_path",
            "Could not resolve the parent folder.",
            None,
            false,
        )
    })?;
    let next_path = parent.join(&valid_name);
    if next_path.exists() {
        return Err(native_error(
            FileErrorCode::AlreadyExists,
            "rename_path",
            "Target path already exists.",
            Some(path_to_string(&next_path)),
            false,
        ));
    }
    let next_relative_path = relative_path_to_string(
        &relative_path
            .parent()
            .unwrap_or(Path::new(""))
            .join(&valid_name),
    );
    move_without_overwrite(&canonical_path, &next_path)
        .map_err(|error| io_error("rename_path", error))?;
    update_registered_document_paths(
        &mut state,
        &workspace_id,
        &relative_path_to_string(&relative_path),
        &next_relative_path,
        &workspace.root_path,
    );
    sync_native_watcher(&mut state, &app_handle)?;
    Ok(next_relative_path)
}

pub(crate) fn move_workspace_path(
    state: &mut NativeAppState,
    workspace_id: &str,
    path: &str,
    target_parent: &str,
) -> NativeResult<String> {
    const OPERATION: &str = "move_path";
    ensure_not_workspace_root(path, OPERATION)?;
    let workspace = get_workspace(state, workspace_id, OPERATION)?.clone();
    let (source, relative) = resolve_workspace_path(&workspace, path, OPERATION)?;
    let (parent, relative_parent) = resolve_workspace_parent(&workspace, target_parent, OPERATION)?;
    if !parent.is_dir() || parent.starts_with(&source) {
        return Err(native_error(
            FileErrorCode::InvalidName,
            OPERATION,
            "Choose a folder outside the item being moved.",
            None,
            false,
        ));
    }
    if is_reparse_path(&workspace.root_path.join(&relative))
        || is_reparse_path(&workspace.root_path.join(&relative_parent))
    {
        return Err(native_error(
            FileErrorCode::OutsideWorkspace,
            OPERATION,
            "Linked paths cannot be moved.",
            None,
            false,
        ));
    }
    let name = relative.file_name().ok_or_else(|| {
        native_error(
            FileErrorCode::InvalidName,
            OPERATION,
            "Invalid source path.",
            None,
            false,
        )
    })?;
    let target = parent.join(name);
    let next_relative = relative_path_to_string(&relative_parent.join(name));
    if target == source {
        return Ok(relative_path_to_string(&relative));
    }
    let markdown_assets = if source.is_file()
        && source.extension().is_some_and(|extension| {
            extension.eq_ignore_ascii_case("md") || extension.eq_ignore_ascii_case("markdown")
        }) {
        let assets_name = format!("{}.assets", source.file_stem().unwrap().to_string_lossy());
        let source_assets = source.parent().unwrap().join(&assets_name);
        match fs::symlink_metadata(&source_assets) {
            Ok(metadata) => {
                if !metadata.is_dir() || is_reparse_metadata(&metadata) {
                    return Err(native_error(
                        FileErrorCode::OutsideWorkspace,
                        OPERATION,
                        "The document assets folder must be a regular folder.",
                        None,
                        false,
                    ));
                }
                let target_assets = parent.join(assets_name);
                match fs::symlink_metadata(&target_assets) {
                    Ok(_) => {
                        return Err(native_error(
                            FileErrorCode::AlreadyExists,
                            OPERATION,
                            "The target folder already contains assets for this document.",
                            Some(path_to_string(&target_assets)),
                            false,
                        ));
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                    Err(error) => return Err(io_error(OPERATION, error)),
                }
                Some((source_assets, target_assets))
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
            Err(error) => return Err(io_error(OPERATION, error)),
        }
    } else {
        None
    };
    move_without_overwrite(&source, &target).map_err(|error| io_error(OPERATION, error))?;
    if let Some((source_assets, target_assets)) = markdown_assets {
        if let Err(error) = move_without_overwrite(&source_assets, &target_assets) {
            if let Err(rollback_error) = move_without_overwrite(&target, &source) {
                update_registered_document_paths(
                    state,
                    workspace_id,
                    &relative_path_to_string(&relative),
                    &next_relative,
                    &workspace.root_path,
                );
                return Err(native_error(
                    FileErrorCode::Unknown,
                    OPERATION,
                    "The document moved, but its images could not move. Move the images folder beside the document manually.",
                    Some(format!("Document: {}; images: {}; image move: {error}; rollback: {rollback_error}", path_to_string(&target), path_to_string(&source_assets))),
                    false,
                ));
            }
            return Err(io_error(OPERATION, error));
        }
        update_registered_document_paths(
            state,
            workspace_id,
            &relative_path_to_string(source_assets.strip_prefix(&workspace.root_path).unwrap()),
            &relative_path_to_string(target_assets.strip_prefix(&workspace.root_path).unwrap()),
            &workspace.root_path,
        );
    }
    update_registered_document_paths(
        state,
        workspace_id,
        &relative_path_to_string(&relative),
        &next_relative,
        &workspace.root_path,
    );
    Ok(next_relative)
}

#[tauri::command]
pub(crate) fn move_path(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
    workspace_id: String,
    path: String,
    target_parent: String,
) -> NativeResult<String> {
    let mut state = state.lock().unwrap();
    let path = move_workspace_path(&mut state, &workspace_id, &path, &target_parent)?;
    let workspace = get_workspace(&state, &workspace_id, "move_path")?;
    let absolute_path = workspace.root_path.join(&path);
    if absolute_path.is_file() {
        super::images::authorize_document_image_assets(&app_handle, &absolute_path)?;
    }
    sync_native_watcher(&mut state, &app_handle)?;
    Ok(path)
}
#[tauri::command]
pub(crate) fn trash_path(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
    workspace_id: String,
    path: String,
) -> NativeResult<()> {
    ensure_not_workspace_root(&path, "trash_path")?;
    let mut state = state.lock().unwrap();
    let workspace = get_workspace(&state, &workspace_id, "trash_path")?.clone();
    let (canonical_path, relative_path) = resolve_workspace_path(&workspace, &path, "trash_path")?;
    trash::delete(&canonical_path).map_err(|error| {
        native_error(
            FileErrorCode::Unknown,
            "trash_path",
            "Failed to move path to trash.",
            Some(error.to_string()),
            true,
        )
    })?;
    remove_registered_documents(
        &mut state,
        &workspace_id,
        &relative_path_to_string(&relative_path),
    );
    sync_native_watcher(&mut state, &app_handle)?;
    Ok(())
}
