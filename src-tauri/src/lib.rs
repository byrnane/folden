use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

static NEXT_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
enum FileErrorCode {
    NotFound,
    PermissionDenied,
    OutsideWorkspace,
    InvalidName,
    AlreadyExists,
    EncodingUnsupported,
    BinaryFile,
    TooLarge,
    WorkspaceRootProtected,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeError {
    code: FileErrorCode,
    operation: String,
    user_message: String,
    technical_message: Option<String>,
    retryable: bool,
}

#[derive(Default)]
struct NativeAppState {
    workspaces: HashMap<String, AuthorizedWorkspace>,
    documents: HashMap<String, AuthorizedDocument>,
}

#[derive(Clone)]
struct AuthorizedWorkspace {
    root_path: PathBuf,
}

#[derive(Clone)]
struct AuthorizedDocument {
    path: PathBuf,
    display_path: String,
    workspace_id: Option<String>,
    relative_path: Option<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkspaceDescriptor {
    id: String,
    root_path: String,
    name: String,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OpenedDocument {
    id: String,
    path: String,
    content: String,
    workspace_id: Option<String>,
    relative_path: Option<String>,
}

#[derive(Clone, serde::Serialize)]
struct WorkspaceEntry {
    name: String,
    path: String,
    kind: String,
    children: Vec<WorkspaceEntry>,
}

type NativeResult<T> = Result<T, NativeError>;

fn next_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let counter = NEXT_ID.fetch_add(1, Ordering::Relaxed);

    format!("{prefix}-{nanos:x}-{counter:x}")
}

fn native_error(
    code: FileErrorCode,
    operation: &str,
    user_message: &str,
    technical_message: Option<String>,
    retryable: bool,
) -> NativeError {
    NativeError {
        code,
        operation: operation.to_string(),
        user_message: user_message.to_string(),
        technical_message,
        retryable,
    }
}

fn io_error(operation: &str, error: std::io::Error) -> NativeError {
    let (code, user_message, retryable) = match error.kind() {
        std::io::ErrorKind::NotFound => (FileErrorCode::NotFound, "Path was not found.", true),
        std::io::ErrorKind::PermissionDenied => {
            (FileErrorCode::PermissionDenied, "Permission denied.", true)
        }
        std::io::ErrorKind::AlreadyExists => (
            FileErrorCode::AlreadyExists,
            "Target already exists.",
            false,
        ),
        _ => (
            FileErrorCode::Unknown,
            "Native file operation failed.",
            true,
        ),
    };

    native_error(
        code,
        operation,
        user_message,
        Some(error.to_string()),
        retryable,
    )
}

fn path_to_string(path: &Path) -> String {
    let value = path.to_string_lossy().to_string();

    if let Some(stripped) = value.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{stripped}");
    }

    value.strip_prefix(r"\\?\").unwrap_or(&value).to_string()
}

fn canonical_root(path: &Path, operation: &str) -> NativeResult<PathBuf> {
    fs::canonicalize(path).map_err(|error| io_error(operation, error))
}

fn ensure_inside_root(root: &Path, path: &Path, operation: &str) -> NativeResult<()> {
    if path.starts_with(root) {
        return Ok(());
    }

    Err(native_error(
        FileErrorCode::OutsideWorkspace,
        operation,
        "Path is outside the authorized workspace.",
        Some(path_to_string(path)),
        false,
    ))
}

fn workspace_name_from_path(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| path_to_string(path))
}

fn relative_path_to_string(path: &Path) -> String {
    if path.as_os_str().is_empty() {
        return String::new();
    }

    path_to_string(path)
}

fn normalize_key(value: &str) -> String {
    value.replace('/', "\\").to_lowercase()
}

fn ensure_relative_path(path: &str, operation: &str) -> NativeResult<PathBuf> {
    if path.trim().is_empty() {
        return Ok(PathBuf::new());
    }

    let relative_path = Path::new(path);

    if relative_path.is_absolute() {
        return Err(native_error(
            FileErrorCode::OutsideWorkspace,
            operation,
            "Absolute paths are not allowed for workspace operations.",
            Some(path.to_string()),
            false,
        ));
    }

    for component in relative_path.components() {
        match component {
            Component::Normal(_) => {}
            _ => {
                return Err(native_error(
                    FileErrorCode::OutsideWorkspace,
                    operation,
                    "Invalid relative path.",
                    Some(path.to_string()),
                    false,
                ))
            }
        }
    }

    Ok(relative_path.to_path_buf())
}

fn ensure_not_workspace_root(path: &str, operation: &str) -> NativeResult<()> {
    if path.trim().is_empty() {
        return Err(native_error(
            FileErrorCode::WorkspaceRootProtected,
            operation,
            "The workspace root cannot be modified by this action.",
            None,
            false,
        ));
    }

    Ok(())
}

fn invalid_windows_name(name: &str) -> bool {
    let upper = name.to_ascii_uppercase();
    let stem = upper.split('.').next().unwrap_or(&upper);

    matches!(
        stem,
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

fn validate_name(name: &str) -> NativeResult<String> {
    let trimmed = name.trim();

    if trimmed.is_empty() {
        return Err(native_error(
            FileErrorCode::InvalidName,
            "validate_name",
            "Name cannot be empty.",
            None,
            false,
        ));
    }

    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(native_error(
            FileErrorCode::InvalidName,
            "validate_name",
            "Name cannot contain path separators.",
            Some(trimmed.to_string()),
            false,
        ));
    }

    if trimmed.chars().any(|character| character.is_control()) {
        return Err(native_error(
            FileErrorCode::InvalidName,
            "validate_name",
            "Name cannot contain control characters.",
            Some(trimmed.to_string()),
            false,
        ));
    }

    if trimmed.ends_with(' ') || trimmed.ends_with('.') {
        return Err(native_error(
            FileErrorCode::InvalidName,
            "validate_name",
            "Name cannot end with a space or dot on Windows.",
            Some(trimmed.to_string()),
            false,
        ));
    }

    if invalid_windows_name(trimmed) {
        return Err(native_error(
            FileErrorCode::InvalidName,
            "validate_name",
            "Name is reserved by Windows.",
            Some(trimmed.to_string()),
            false,
        ));
    }

    Ok(trimmed.to_string())
}

fn is_text_file(path: &Path) -> bool {
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

fn should_skip_directory(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };

    matches!(
        name,
        ".git" | "node_modules" | "dist" | "build" | "target" | ".cache"
    )
}

fn get_workspace<'a>(
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

fn resolve_workspace_path(
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

fn resolve_workspace_parent(
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

fn workspace_child_target(
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

fn register_workspace(state: &mut NativeAppState, path: PathBuf) -> WorkspaceDescriptor {
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

fn detect_workspace_membership(
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

fn find_existing_document_id(state: &NativeAppState, path: &Path) -> Option<String> {
    state.documents.iter().find_map(|(document_id, document)| {
        if document.path == path {
            Some(document_id.clone())
        } else {
            None
        }
    })
}

fn register_document(
    state: &mut NativeAppState,
    path: PathBuf,
    workspace_id: Option<String>,
    relative_path: Option<String>,
    content: String,
) -> OpenedDocument {
    let document_id =
        find_existing_document_id(state, &path).unwrap_or_else(|| next_id("document"));
    let display_path = path_to_string(&path);

    state.documents.insert(
        document_id.clone(),
        AuthorizedDocument {
            path,
            display_path: display_path.clone(),
            workspace_id: workspace_id.clone(),
            relative_path: relative_path.clone(),
        },
    );

    OpenedDocument {
        id: document_id,
        path: display_path,
        content,
        workspace_id,
        relative_path,
    }
}

fn read_workspace_entries(
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
                children: read_workspace_entries(root, &entry_path, operation)?,
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

fn update_registered_document_paths(
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
        document.display_path = path_to_string(&next_path);
        document.relative_path = Some(next_relative);
    }
}

fn remove_registered_documents(
    state: &mut NativeAppState,
    workspace_id: &str,
    relative_path: &str,
) {
    let prefix = normalize_key(relative_path);
    let document_ids = state
        .documents
        .iter()
        .filter_map(|(document_id, document)| {
            let matches_workspace = document.workspace_id.as_deref() == Some(workspace_id);
            let relative = document.relative_path.as_ref()?;
            let normalized_relative = normalize_key(relative);

            if matches_workspace
                && (normalized_relative == prefix
                    || normalized_relative.starts_with(&format!("{prefix}\\")))
            {
                Some(document_id.clone())
            } else {
                None
            }
        })
        .collect::<Vec<_>>();

    for document_id in document_ids {
        state.documents.remove(&document_id);
    }
}

#[tauri::command]
fn open_text_file(
    state: tauri::State<'_, Mutex<NativeAppState>>,
) -> NativeResult<Option<OpenedDocument>> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter(
            "Text",
            &[
                "txt", "md", "markdown", "json", "toml", "rs", "ts", "js", "vue", "css", "html",
            ],
        )
        .add_filter("All files", &["*"])
        .pick_file()
    else {
        return Ok(None);
    };

    let canonical_path = canonical_root(&path, "open_text_file")?;
    let content =
        fs::read_to_string(&canonical_path).map_err(|error| io_error("open_text_file", error))?;
    let mut state = state.lock().unwrap();
    let (workspace_id, relative_path) = detect_workspace_membership(&state, &canonical_path);

    Ok(Some(register_document(
        &mut state,
        canonical_path,
        workspace_id,
        relative_path,
        content,
    )))
}

#[tauri::command]
fn save_text_file(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    document_id: Option<String>,
    content: String,
    suggested_file_name: Option<String>,
) -> NativeResult<Option<OpenedDocument>> {
    let mut state = state.lock().unwrap();

    let path = if let Some(document_id) = document_id {
        let document = state.documents.get(&document_id).cloned().ok_or_else(|| {
            native_error(
                FileErrorCode::NotFound,
                "save_text_file",
                "Document is no longer authorized.",
                None,
                false,
            )
        })?;

        fs::write(&document.path, &content).map_err(|error| io_error("save_text_file", error))?;
        document.path
    } else {
        let mut dialog = rfd::FileDialog::new()
            .add_filter("Markdown", &["md", "markdown"])
            .add_filter("Text", &["txt"])
            .add_filter("All files", &["*"]);

        if let Some(file_name) = suggested_file_name.filter(|value| !value.trim().is_empty()) {
            dialog = dialog.set_file_name(file_name);
        }

        let Some(path) = dialog.save_file() else {
            return Ok(None);
        };
        let canonical_parent = path
            .parent()
            .ok_or_else(|| {
                native_error(
                    FileErrorCode::Unknown,
                    "save_text_file",
                    "Could not resolve the target folder.",
                    None,
                    false,
                )
            })
            .and_then(|parent| canonical_root(parent, "save_text_file"))?;
        let file_name = path
            .file_name()
            .and_then(|value| value.to_str())
            .ok_or_else(|| {
                native_error(
                    FileErrorCode::InvalidName,
                    "save_text_file",
                    "Invalid save file name.",
                    None,
                    false,
                )
            })?;

        let target_path = canonical_parent.join(validate_name(file_name)?);
        fs::write(&target_path, &content).map_err(|error| io_error("save_text_file", error))?;
        target_path
    };

    let canonical_path = canonical_root(&path, "save_text_file")?;
    let (workspace_id, relative_path) = detect_workspace_membership(&state, &canonical_path);

    Ok(Some(register_document(
        &mut state,
        canonical_path,
        workspace_id,
        relative_path,
        content,
    )))
}

#[tauri::command]
fn open_workspace_directory(
    state: tauri::State<'_, Mutex<NativeAppState>>,
) -> NativeResult<Option<WorkspaceDescriptor>> {
    let Some(path) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
    };

    let canonical_path = canonical_root(&path, "open_workspace_directory")?;
    let mut state = state.lock().unwrap();

    Ok(Some(register_workspace(&mut state, canonical_path)))
}

#[tauri::command]
fn restore_workspace_by_path(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    root_path: String,
) -> NativeResult<WorkspaceDescriptor> {
    let canonical_path = canonical_root(Path::new(&root_path), "restore_workspace_by_path")?;
    let mut state = state.lock().unwrap();

    Ok(register_workspace(&mut state, canonical_path))
}

#[tauri::command]
fn list_directory(
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
fn open_text_file_by_path(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    workspace_id: String,
    path: String,
) -> NativeResult<OpenedDocument> {
    let mut state = state.lock().unwrap();
    let workspace = get_workspace(&state, &workspace_id, "open_text_file_by_path")?.clone();
    let (canonical_path, relative_path) =
        resolve_workspace_path(&workspace, &path, "open_text_file_by_path")?;
    let content = fs::read_to_string(&canonical_path)
        .map_err(|error| io_error("open_text_file_by_path", error))?;

    Ok(register_document(
        &mut state,
        canonical_path,
        Some(workspace_id),
        Some(relative_path_to_string(&relative_path)),
        content,
    ))
}

#[tauri::command]
fn create_file(
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
fn create_directory(
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
fn rename_path(
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
fn trash_path(
    state: tauri::State<'_, Mutex<NativeAppState>>,
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

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(Mutex::new(NativeAppState::default()))
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_text_file,
            save_text_file,
            open_workspace_directory,
            restore_workspace_by_path,
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
}
