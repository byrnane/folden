use std::fs;
use std::path::{Path, PathBuf};

#[allow(dead_code)]
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
    Unknown,
}

#[allow(dead_code)]
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct NativeError {
    code: FileErrorCode,
    operation: String,
    user_message: String,
    technical_message: Option<String>,
    retryable: bool,
}

#[derive(serde::Serialize)]
struct OpenedDocument {
    path: String,
    content: String,
}

#[derive(serde::Serialize)]
struct WorkspaceEntry {
    name: String,
    path: String,
    kind: String,
    children: Vec<WorkspaceEntry>,
}

fn path_to_string(path: &Path) -> String {
    let value = path.to_string_lossy().to_string();

    if let Some(stripped) = value.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{stripped}");
    }

    value.strip_prefix(r"\\?\").unwrap_or(&value).to_string()
}

fn canonical_root(root: &str) -> Result<PathBuf, String> {
    fs::canonicalize(root).map_err(|error| format!("Failed to resolve workspace root: {error}"))
}

fn canonical_path(path: &str) -> Result<PathBuf, String> {
    fs::canonicalize(path).map_err(|error| format!("Failed to resolve path: {error}"))
}

fn ensure_inside_root(root: &Path, path: &Path) -> Result<(), String> {
    if path.starts_with(root) {
        return Ok(());
    }

    Err("Path is outside of the workspace".to_string())
}

fn validate_name(name: &str) -> Result<(), String> {
    let trimmed = name.trim();

    if trimmed.is_empty() {
        return Err("Name cannot be empty".to_string());
    }

    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("Name cannot contain path separators".to_string());
    }

    Ok(())
}

#[allow(dead_code)]
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

fn workspace_child_path(root: &str, parent_path: &str, name: &str) -> Result<PathBuf, String> {
    validate_name(name)?;

    let root = canonical_root(root)?;
    let parent = canonical_path(parent_path)?;
    ensure_inside_root(&root, &parent)?;

    Ok(parent.join(name.trim()))
}

fn workspace_existing_path(root: &str, path: &str) -> Result<PathBuf, String> {
    let root = canonical_root(root)?;
    let path = canonical_path(path)?;
    ensure_inside_root(&root, &path)?;

    Ok(path)
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

fn read_workspace_entries(path: &Path) -> Result<Vec<WorkspaceEntry>, String> {
    let mut entries = Vec::new();

    for entry in fs::read_dir(path).map_err(|error| format!("Failed to read directory: {error}"))? {
        let entry = entry.map_err(|error| format!("Failed to read directory entry: {error}"))?;
        let entry_path = entry.path();
        let file_type = entry
            .file_type()
            .map_err(|error| format!("Failed to read file type: {error}"))?;
        let name = entry.file_name().to_string_lossy().to_string();

        if file_type.is_dir() {
            if should_skip_directory(&entry_path) {
                continue;
            }

            entries.push(WorkspaceEntry {
                name,
                path: path_to_string(&entry_path),
                kind: "directory".to_string(),
                children: read_workspace_entries(&entry_path)?,
            });
        } else if file_type.is_file() && is_text_file(&entry_path) {
            entries.push(WorkspaceEntry {
                name,
                path: path_to_string(&entry_path),
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

#[tauri::command]
fn open_text_file() -> Result<Option<OpenedDocument>, String> {
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

    let content =
        fs::read_to_string(&path).map_err(|error| format!("Failed to read file: {error}"))?;

    Ok(Some(OpenedDocument {
        path: path_to_string(&path),
        content,
    }))
}

#[tauri::command]
fn save_text_file(
    path: Option<String>,
    content: String,
    suggested_file_name: Option<String>,
) -> Result<Option<String>, String> {
    let path = match path {
        Some(path) => std::path::PathBuf::from(path),
        None => {
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

            path
        }
    };

    fs::write(&path, content).map_err(|error| format!("Failed to save file: {error}"))?;

    Ok(Some(path_to_string(&path)))
}

#[tauri::command]
fn open_workspace_directory() -> Result<Option<String>, String> {
    let Some(path) = rfd::FileDialog::new().pick_folder() else {
        return Ok(None);
    };

    Ok(Some(path_to_string(&path)))
}

#[tauri::command]
fn list_directory(root: String, path: String) -> Result<Vec<WorkspaceEntry>, String> {
    let root = canonical_root(&root)?;
    let path = canonical_path(&path)?;
    ensure_inside_root(&root, &path)?;

    read_workspace_entries(&path)
}

#[tauri::command]
fn open_text_file_by_path(root: String, path: String) -> Result<OpenedDocument, String> {
    let path = workspace_existing_path(&root, &path)?;
    let content =
        fs::read_to_string(&path).map_err(|error| format!("Failed to read file: {error}"))?;

    Ok(OpenedDocument {
        path: path_to_string(&path),
        content,
    })
}

#[tauri::command]
fn create_file(root: String, parent_path: String, name: String) -> Result<String, String> {
    let path = workspace_child_path(&root, &parent_path, &name)?;

    if path.exists() {
        return Err("File already exists".to_string());
    }

    fs::write(&path, "").map_err(|error| format!("Failed to create file: {error}"))?;

    Ok(path_to_string(&path))
}

#[tauri::command]
fn create_directory(root: String, parent_path: String, name: String) -> Result<String, String> {
    let path = workspace_child_path(&root, &parent_path, &name)?;

    if path.exists() {
        return Err("Directory already exists".to_string());
    }

    fs::create_dir(&path).map_err(|error| format!("Failed to create directory: {error}"))?;

    Ok(path_to_string(&path))
}

#[tauri::command]
fn rename_path(root: String, path: String, new_name: String) -> Result<String, String> {
    validate_name(&new_name)?;

    let path = workspace_existing_path(&root, &path)?;
    let parent = path
        .parent()
        .ok_or_else(|| "Cannot rename this path".to_string())?;
    let next_path = parent.join(new_name.trim());

    let root = canonical_root(&root)?;
    ensure_inside_root(&root, &next_path)?;

    if next_path.exists() {
        return Err("Target path already exists".to_string());
    }

    fs::rename(&path, &next_path).map_err(|error| format!("Failed to rename path: {error}"))?;

    Ok(path_to_string(&next_path))
}

#[tauri::command]
fn trash_path(root: String, path: String) -> Result<(), String> {
    let path = workspace_existing_path(&root, &path)?;

    trash::delete(&path).map_err(|error| format!("Failed to move path to trash: {error}"))?;

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TempWorkspace {
        path: PathBuf,
    }

    impl TempWorkspace {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time before unix epoch")
                .as_nanos();
            let path = std::env::temp_dir().join(format!("folden-tests-{unique}"));

            fs::create_dir_all(&path).expect("failed to create temp workspace");

            Self { path }
        }

        fn child(&self, name: &str) -> PathBuf {
            self.path.join(name)
        }
    }

    impl Drop for TempWorkspace {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn validate_name_rejects_empty_and_separators() {
        assert_eq!(
            validate_name("   "),
            Err("Name cannot be empty".to_string())
        );
        assert_eq!(
            validate_name("nested/file.md"),
            Err("Name cannot contain path separators".to_string())
        );
        assert!(validate_name("draft.md").is_ok());
    }

    #[test]
    fn workspace_helpers_keep_paths_inside_temp_root() {
        let workspace = TempWorkspace::new();
        let root = workspace.path.to_string_lossy().to_string();
        let notes = workspace.child("notes");
        fs::create_dir_all(&notes).expect("failed to create notes directory");

        let child = workspace_child_path(&root, &notes.to_string_lossy(), "draft.md")
            .expect("expected child path inside workspace");

        assert_eq!(
            path_to_string(&child),
            path_to_string(&notes.join("draft.md"))
        );

        let outside_file = workspace
            .path
            .parent()
            .expect("temp dir must have parent")
            .join("outside.md");
        fs::write(&outside_file, "").expect("failed to create outside file");

        let result = workspace_existing_path(&root, &outside_file.to_string_lossy());
        assert_eq!(result, Err("Path is outside of the workspace".to_string()));

        let _ = fs::remove_file(outside_file);
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
