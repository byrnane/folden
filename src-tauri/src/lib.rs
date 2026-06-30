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
    FileChangedExternally,
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

struct NativeAppState {
    workspaces: HashMap<String, AuthorizedWorkspace>,
    documents: HashMap<String, AuthorizedDocument>,
    watcher: Option<RecommendedWatcher>,
    watched_paths: HashMap<String, WatchPathMode>,
    self_write_suppressions: Arc<Mutex<HashMap<String, u64>>>,
}

#[derive(Clone)]
struct AuthorizedWorkspace {
    root_path: PathBuf,
}

#[derive(Clone)]
struct AuthorizedDocument {
    path: PathBuf,
    workspace_id: Option<String>,
    relative_path: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum WatchPathMode {
    Recursive,
    NonRecursive,
}

impl WatchPathMode {
    fn recursive_mode(self) -> RecursiveMode {
        match self {
            Self::Recursive => RecursiveMode::Recursive,
            Self::NonRecursive => RecursiveMode::NonRecursive,
        }
    }
}

impl Default for NativeAppState {
    fn default() -> Self {
        Self {
            workspaces: HashMap::new(),
            documents: HashMap::new(),
            watcher: None,
            watched_paths: HashMap::new(),
            self_write_suppressions: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileFingerprint {
    size: u64,
    modified_at_ms: u64,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct TextFileFormat {
    line_ending: String,
    has_utf8_bom: bool,
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
    file_format: TextFileFormat,
    fingerprint: Option<FileFingerprint>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSessionDocument {
    key: String,
    kind: String,
    path: Option<String>,
    workspace_root_path: Option<String>,
    relative_path: Option<String>,
    name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSessionPane {
    id: String,
    document_keys: Vec<String>,
    active_document_key: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedPaneMode {
    pane_id: String,
    document_key: String,
    mode: String,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedSessionState {
    workspace_root_path: Option<String>,
    split_enabled: bool,
    active_pane_id: String,
    panes: Vec<PersistedSessionPane>,
    documents: Vec<PersistedSessionDocument>,
    pane_modes: Vec<PersistedPaneMode>,
}

#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct RecoverySnapshot {
    key: String,
    kind: String,
    path: Option<String>,
    workspace_root_path: Option<String>,
    relative_path: Option<String>,
    name: String,
    content: String,
    file_format: TextFileFormat,
    fingerprint: Option<FileFingerprint>,
    updated_at_ms: u64,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryLoadResult {
    entries: Vec<RecoverySnapshot>,
    diagnostics: Vec<String>,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct NativeFsEvent {
    kind: String,
    path: String,
}

#[derive(Clone, serde::Serialize)]
struct WorkspaceEntry {
    name: String,
    path: String,
    kind: String,
    children: Vec<WorkspaceEntry>,
}

type NativeResult<T> = Result<T, NativeError>;

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

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

fn create_file_fingerprint(metadata: &fs::Metadata) -> NativeResult<FileFingerprint> {
    let modified_at_ms = metadata
        .modified()
        .map_err(|error| io_error("read_metadata", error))?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    Ok(FileFingerprint {
        size: metadata.len(),
        modified_at_ms,
    })
}

fn detect_line_ending(content: &str) -> String {
    if content.contains("\r\n") {
        "crlf".to_string()
    } else {
        "lf".to_string()
    }
}

fn decode_text_file(
    path: &Path,
    operation: &str,
) -> NativeResult<(String, TextFileFormat, FileFingerprint)> {
    let bytes = fs::read(path).map_err(|error| io_error(operation, error))?;
    let metadata = fs::metadata(path).map_err(|error| io_error(operation, error))?;
    let has_utf8_bom = bytes.starts_with(&[0xEF, 0xBB, 0xBF]);
    let text_bytes = if has_utf8_bom {
        &bytes[3..]
    } else {
        &bytes[..]
    };

    if text_bytes.contains(&0) {
        return Err(native_error(
            FileErrorCode::BinaryFile,
            operation,
            "Binary files are not supported.",
            Some(path_to_string(path)),
            false,
        ));
    }

    let content = String::from_utf8(text_bytes.to_vec()).map_err(|error| {
        native_error(
            FileErrorCode::EncodingUnsupported,
            operation,
            "This file encoding is not supported yet.",
            Some(error.to_string()),
            false,
        )
    })?;
    let file_format = TextFileFormat {
        line_ending: detect_line_ending(&content),
        has_utf8_bom,
    };
    let fingerprint = create_file_fingerprint(&metadata)?;

    Ok((content, file_format, fingerprint))
}

fn encode_text_content(content: &str, file_format: &TextFileFormat) -> Vec<u8> {
    let normalized = content.replace("\r\n", "\n").replace('\r', "\n");
    let line_ending = if file_format.line_ending == "crlf" {
        "\r\n"
    } else {
        "\n"
    };
    let text = normalized.replace('\n', line_ending);
    let mut bytes = Vec::new();

    if file_format.has_utf8_bom {
        bytes.extend_from_slice(&[0xEF, 0xBB, 0xBF]);
    }

    bytes.extend_from_slice(text.as_bytes());
    bytes
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

fn create_native_watcher<R: Runtime>(
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

fn is_folden_temp_save_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|name| name.starts_with(".folden-save-") && name.ends_with(".tmp"))
        .unwrap_or(false)
}

fn register_self_write_suppression(state: &NativeAppState, path: &Path) {
    let expires_at_ms = now_ms() + 1_500;
    let normalized_path = normalize_key(&path_to_string(path));
    let mut suppressions = state.self_write_suppressions.lock().unwrap();
    suppressions.insert(normalized_path, expires_at_ms);
}

fn desired_watch_paths(state: &NativeAppState) -> HashMap<String, WatchPathMode> {
    let mut desired_paths = HashMap::new();

    for workspace in state.workspaces.values() {
        desired_paths.insert(
            path_to_string(&workspace.root_path),
            WatchPathMode::Recursive,
        );
    }

    for document in state.documents.values() {
        let is_inside_workspace = state
            .workspaces
            .values()
            .any(|workspace| document.path.starts_with(&workspace.root_path));

        if is_inside_workspace {
            continue;
        }

        desired_paths
            .entry(path_to_string(&document.path))
            .or_insert(WatchPathMode::NonRecursive);
    }

    desired_paths
}

fn sync_native_watcher<R: Runtime>(
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

#[cfg(windows)]
fn replace_existing_path(target_path: &Path, replacement_path: &Path) -> std::io::Result<()> {
    use std::iter::once;
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        ReplaceFileW, REPLACEFILE_IGNORE_ACL_ERRORS, REPLACEFILE_IGNORE_MERGE_ERRORS,
    };

    let target_wide = target_path
        .as_os_str()
        .encode_wide()
        .chain(once(0))
        .collect::<Vec<_>>();
    let replacement_wide = replacement_path
        .as_os_str()
        .encode_wide()
        .chain(once(0))
        .collect::<Vec<_>>();

    let result = unsafe {
        ReplaceFileW(
            target_wide.as_ptr(),
            replacement_wide.as_ptr(),
            std::ptr::null(),
            REPLACEFILE_IGNORE_MERGE_ERRORS | REPLACEFILE_IGNORE_ACL_ERRORS,
            std::ptr::null(),
            std::ptr::null(),
        )
    };

    if result == 0 {
        return Err(std::io::Error::last_os_error());
    }

    Ok(())
}

#[cfg(not(windows))]
fn replace_existing_path(target_path: &Path, replacement_path: &Path) -> std::io::Result<()> {
    fs::rename(replacement_path, target_path)
}

fn write_atomic_bytes_with<F>(
    target_path: &Path,
    bytes: &[u8],
    replace_fn: F,
) -> std::io::Result<()>
where
    F: Fn(&Path, &Path) -> std::io::Result<()>,
{
    let parent = target_path.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "missing parent directory for target path",
        )
    })?;
    let temp_path = parent.join(format!(".folden-save-{}.tmp", next_id("write")));

    let write_result = (|| -> std::io::Result<()> {
        let mut file = fs::File::create(&temp_path)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);

        if target_path.exists() {
            replace_fn(target_path, &temp_path)?;
        } else {
            fs::rename(&temp_path, target_path)?;
        }

        Ok(())
    })();

    if write_result.is_err() && temp_path.exists() {
        let _ = fs::remove_file(&temp_path);
    }

    write_result
}

fn write_atomic_text_file(
    target_path: &Path,
    bytes: &[u8],
    operation: &str,
) -> NativeResult<FileFingerprint> {
    write_atomic_bytes_with(target_path, bytes, replace_existing_path)
        .map_err(|error| io_error(operation, error))?;
    let metadata = fs::metadata(target_path).map_err(|error| io_error(operation, error))?;

    create_file_fingerprint(&metadata)
}

fn app_data_directory<R: Runtime>(
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

fn app_data_file_path<R: Runtime>(
    app_handle: &tauri::AppHandle<R>,
    operation: &str,
    file_name: &str,
) -> NativeResult<PathBuf> {
    Ok(app_data_directory(app_handle, operation)?.join(file_name))
}

fn remove_data_file_if_exists(path: &Path, operation: &str) -> NativeResult<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(io_error(operation, error)),
    }
}

fn sanitize_log_message(message: &str) -> String {
    message
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(500)
        .collect()
}

fn open_directory_in_file_manager(path: &Path) -> std::io::Result<()> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer").arg(path).spawn()?;
        Ok(())
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open").arg(path).spawn()?;
        Ok(())
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open").arg(path).spawn()?;
        Ok(())
    }
}

fn replace_known_path(value: String, path: &Path, label: &str) -> String {
    let display_path = path_to_string(path);
    value
        .replace(&display_path, label)
        .replace(&display_path.replace('\\', "/"), label)
}

fn redact_absolute_paths(value: &str) -> String {
    let chars = value.chars().collect::<Vec<_>>();
    let mut redacted = String::new();
    let mut index = 0;

    while index < chars.len() {
        let is_drive_path = index + 2 < chars.len()
            && chars[index].is_ascii_alphabetic()
            && chars[index + 1] == ':'
            && (chars[index + 2] == '\\' || chars[index + 2] == '/');
        let is_unc_path =
            index + 1 < chars.len() && chars[index] == '\\' && chars[index + 1] == '\\';

        if !is_drive_path && !is_unc_path {
            redacted.push(chars[index]);
            index += 1;
            continue;
        }

        while index < chars.len()
            && !matches!(
                chars[index],
                '"' | '\'' | '`' | '<' | '>' | '|' | '\n' | '\r' | '\t'
            )
        {
            index += 1;
        }

        redacted.push_str("[path]");
    }

    redacted
}

fn redact_diagnostic_message(value: &str, app_data_dir: &Path, log_dir: &Path) -> String {
    let without_app_data = replace_known_path(value.to_string(), app_data_dir, "[app-data]");
    let without_log_dir = replace_known_path(without_app_data, log_dir, "[logs]");
    redact_absolute_paths(&without_log_dir)
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
}

fn read_redacted_logs(log_dir: &Path, app_data_dir: &Path) -> Vec<String> {
    let mut logs = Vec::new();
    let Ok(entries) = fs::read_dir(log_dir) else {
        return logs;
    };

    for entry in entries.flatten() {
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };

        if !name.starts_with("folden") {
            continue;
        }

        let Ok(content) = fs::read_to_string(&path) else {
            continue;
        };

        logs.push(format!(
            "## Log: {name}\n{}",
            redact_diagnostic_message(&content, app_data_dir, log_dir)
        ));
    }

    logs.sort();
    logs
}

fn build_diagnostic_report(app_data_dir: &Path, log_dir: &Path) -> String {
    let mut sections = vec![
        "# Folden Diagnostics".to_string(),
        format!("version: {}", env!("CARGO_PKG_VERSION")),
        format!("os: {}", std::env::consts::OS),
        format!("arch: {}", std::env::consts::ARCH),
        format!("createdAtMs: {}", now_ms()),
        "privacy: document content, session state, recovery snapshots, and full user paths are excluded.".to_string(),
        String::new(),
        "## Logs".to_string(),
    ];
    let logs = read_redacted_logs(log_dir, app_data_dir);

    if logs.is_empty() {
        sections.push("No Folden log files were available.".to_string());
    } else {
        sections.extend(logs);
    }

    sections.join("\n")
}

fn save_json_file<T: serde::Serialize>(
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

fn load_session_state_from_path(path: &Path) -> Option<PersistedSessionState> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn load_recovery_snapshots_from_path(path: &Path) -> RecoveryLoadResult {
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

fn ensure_expected_fingerprint(
    path: &Path,
    expected_fingerprint: Option<&FileFingerprint>,
    operation: &str,
) -> NativeResult<Option<FileFingerprint>> {
    let metadata = fs::metadata(path).map_err(|error| io_error(operation, error))?;
    let actual_fingerprint = create_file_fingerprint(&metadata)?;

    if let Some(expected_fingerprint) = expected_fingerprint {
        if actual_fingerprint != *expected_fingerprint {
            return Err(native_error(
                FileErrorCode::FileChangedExternally,
                operation,
                "The file changed on disk before Folden could save it.",
                Some(path_to_string(path)),
                true,
            ));
        }
    }

    Ok(Some(actual_fingerprint))
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

fn authorize_workspace_assets<R: Runtime>(
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
    file_format: TextFileFormat,
    fingerprint: Option<FileFingerprint>,
) -> OpenedDocument {
    let document_id =
        find_existing_document_id(state, &path).unwrap_or_else(|| next_id("document"));
    let display_path = path_to_string(&path);

    state.documents.insert(
        document_id.clone(),
        AuthorizedDocument {
            path,
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
        file_format,
        fingerprint,
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
    app_handle: tauri::AppHandle,
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
    let (content, file_format, fingerprint) = decode_text_file(&canonical_path, "open_text_file")?;
    let mut state = state.lock().unwrap();
    let (workspace_id, relative_path) = detect_workspace_membership(&state, &canonical_path);
    let opened_document = register_document(
        &mut state,
        canonical_path,
        workspace_id,
        relative_path,
        content,
        file_format,
        Some(fingerprint),
    );
    sync_native_watcher(&mut state, &app_handle)?;

    Ok(Some(opened_document))
}

#[tauri::command]
fn open_text_file_at_path(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
    path: String,
) -> NativeResult<OpenedDocument> {
    let canonical_path = canonical_root(Path::new(&path), "open_text_file_at_path")?;
    let (content, file_format, fingerprint) =
        decode_text_file(&canonical_path, "open_text_file_at_path")?;
    let mut state = state.lock().unwrap();
    let (workspace_id, relative_path) = detect_workspace_membership(&state, &canonical_path);
    let opened_document = register_document(
        &mut state,
        canonical_path,
        workspace_id,
        relative_path,
        content,
        file_format,
        Some(fingerprint),
    );
    sync_native_watcher(&mut state, &app_handle)?;

    Ok(opened_document)
}

#[tauri::command]
fn save_text_file(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
    document_id: Option<String>,
    content: String,
    expected_fingerprint: Option<FileFingerprint>,
    file_format: TextFileFormat,
    suggested_file_name: Option<String>,
) -> NativeResult<Option<OpenedDocument>> {
    let mut state = state.lock().unwrap();
    let bytes = encode_text_content(&content, &file_format);

    let (path, workspace_id, relative_path, fingerprint) = if let Some(document_id) = document_id {
        let document = state.documents.get(&document_id).cloned().ok_or_else(|| {
            native_error(
                FileErrorCode::NotFound,
                "save_text_file",
                "Document is no longer authorized.",
                None,
                false,
            )
        })?;

        ensure_expected_fingerprint(
            &document.path,
            expected_fingerprint.as_ref(),
            "save_text_file",
        )?;
        register_self_write_suppression(&state, &document.path);
        let fingerprint = write_atomic_text_file(&document.path, &bytes, "save_text_file")?;
        register_self_write_suppression(&state, &document.path);

        (
            document.path,
            document.workspace_id,
            document.relative_path,
            Some(fingerprint),
        )
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
        let fingerprint = if target_path.exists() {
            ensure_expected_fingerprint(
                &target_path,
                expected_fingerprint.as_ref(),
                "save_text_file",
            )?;
            register_self_write_suppression(&state, &target_path);
            let fingerprint = write_atomic_text_file(&target_path, &bytes, "save_text_file")?;
            register_self_write_suppression(&state, &target_path);
            fingerprint
        } else {
            register_self_write_suppression(&state, &target_path);
            let fingerprint = write_atomic_text_file(&target_path, &bytes, "save_text_file")?;
            register_self_write_suppression(&state, &target_path);
            fingerprint
        };
        let canonical_path = canonical_root(&target_path, "save_text_file")?;
        let (workspace_id, relative_path) = detect_workspace_membership(&state, &canonical_path);

        (
            canonical_path,
            workspace_id,
            relative_path,
            Some(fingerprint),
        )
    };

    let saved_document = register_document(
        &mut state,
        path,
        workspace_id,
        relative_path,
        content,
        file_format,
        fingerprint,
    );
    sync_native_watcher(&mut state, &app_handle)?;

    Ok(Some(saved_document))
}

#[tauri::command]
fn open_workspace_directory(
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
fn restore_workspace_by_path(
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
fn load_session_state<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
) -> NativeResult<Option<PersistedSessionState>> {
    let path = app_data_file_path(&app_handle, "load_session_state", "session-state.json")?;
    Ok(load_session_state_from_path(&path))
}

#[tauri::command]
fn save_session_state<R: Runtime>(
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
fn load_recovery_snapshots<R: Runtime>(
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
fn close_native_documents(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
    document_ids: Vec<String>,
) -> NativeResult<()> {
    if document_ids.is_empty() {
        return Ok(());
    }

    let mut state = state.lock().unwrap();

    for document_id in document_ids {
        state.documents.remove(&document_id);
    }

    sync_native_watcher(&mut state, &app_handle)?;
    Ok(())
}

#[tauri::command]
fn log_frontend_event(level: String, message: String) -> NativeResult<()> {
    let sanitized_message = sanitize_log_message(&message);

    match level.as_str() {
        "info" => log::info!(target: "frontend", "{sanitized_message}"),
        "warn" => log::warn!(target: "frontend", "{sanitized_message}"),
        _ => log::error!(target: "frontend", "{sanitized_message}"),
    }

    Ok(())
}

#[tauri::command]
fn open_logs_folder<R: Runtime>(app_handle: tauri::AppHandle<R>) -> NativeResult<()> {
    let log_directory = app_handle.path().app_log_dir().map_err(|error| {
        native_error(
            FileErrorCode::Unknown,
            "open_logs_folder",
            "Could not resolve the logs folder.",
            Some(error.to_string()),
            true,
        )
    })?;
    fs::create_dir_all(&log_directory).map_err(|error| io_error("open_logs_folder", error))?;
    open_directory_in_file_manager(&log_directory)
        .map_err(|error| io_error("open_logs_folder", error))?;
    Ok(())
}

#[tauri::command]
fn export_diagnostics<R: Runtime>(app_handle: tauri::AppHandle<R>) -> NativeResult<String> {
    let app_data_dir = app_data_directory(&app_handle, "export_diagnostics")?;
    let log_dir = app_handle.path().app_log_dir().map_err(|error| {
        native_error(
            FileErrorCode::Unknown,
            "export_diagnostics",
            "Could not resolve the logs folder.",
            Some(error.to_string()),
            true,
        )
    })?;
    fs::create_dir_all(&log_dir).map_err(|error| io_error("export_diagnostics", error))?;

    let report = build_diagnostic_report(&app_data_dir, &log_dir);
    let report_path = app_data_dir.join("folden-diagnostics.txt");
    fs::write(&report_path, report).map_err(|error| io_error("export_diagnostics", error))?;

    Ok(path_to_string(&report_path))
}

#[tauri::command]
fn save_recovery_snapshots<R: Runtime>(
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
    fn folden_temp_save_paths_are_ignored_by_watcher() {
        assert!(is_folden_temp_save_path(Path::new(
            ".folden-save-write-1.tmp"
        )));
        assert!(is_folden_temp_save_path(Path::new(
            "C:\\Docs\\.folden-save-write-1.tmp"
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
