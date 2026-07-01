use super::*;
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
        name,
        ".git" | "node_modules" | "dist" | "build" | "target" | ".cache"
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
                children: Vec::new(),
            });
        } else if file_type.is_file() && is_text_file(&entry_path) {
            entries.push(WorkspaceEntry {
                name,
                path: relative_path,
                kind: "file".to_string(),
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
    let previous_key = normalize_key(previous_relative_path);
    for document in state.documents.values_mut() {
        if document.workspace_id.as_deref() != Some(workspace_id) {
            continue;
        }
        let Some(relative_path) = document.relative_path.clone() else {
            continue;
        };
        let normalized_relative_path = normalize_key(&relative_path);
        if normalized_relative_path != previous_key
            && !normalized_relative_path.starts_with(&format!("{previous_key}\\"))
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
    let next_relative_path =
        if let Some(index) = relative_path_to_string(&relative_path).rfind('\\') {
            format!(
                "{}\\{}",
                &relative_path_to_string(&relative_path)[..index],
                valid_name
            )
        } else {
            valid_name.clone()
        };
    fs::rename(&canonical_path, &next_path).map_err(|error| io_error("rename_path", error))?;
    update_registered_document_paths(
        &mut state,
        &workspace_id,
        &relative_path_to_string(&relative_path),
        &next_relative_path,
        &workspace.root_path,
    );
    Ok(next_relative_path)
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
