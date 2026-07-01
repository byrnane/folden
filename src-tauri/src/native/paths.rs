use super::*;
pub(crate) fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
pub(crate) fn next_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let counter = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}-{nanos:x}-{counter:x}")
}
pub(crate) fn path_to_string(path: &Path) -> String {
    let value = path.to_string_lossy().to_string();
    if let Some(stripped) = value.strip_prefix(r"\\?\UNC\") {
        return format!(r"\\{stripped}");
    }
    value.strip_prefix(r"\\?\").unwrap_or(&value).to_string()
}
pub(crate) fn create_file_fingerprint(metadata: &fs::Metadata) -> NativeResult<FileFingerprint> {
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
pub(crate) fn detect_line_ending(content: &str) -> String {
    if content.contains("\r\n") {
        "crlf".to_string()
    } else {
        "lf".to_string()
    }
}
pub(crate) fn decode_text_file(
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
pub(crate) fn encode_text_content(content: &str, file_format: &TextFileFormat) -> Vec<u8> {
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
pub(crate) fn canonical_root(path: &Path, operation: &str) -> NativeResult<PathBuf> {
    fs::canonicalize(path).map_err(|error| io_error(operation, error))
}
pub(crate) fn ensure_inside_root(root: &Path, path: &Path, operation: &str) -> NativeResult<()> {
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
pub(crate) fn workspace_name_from_path(path: &Path) -> String {
    path.file_name()
        .and_then(|value| value.to_str())
        .map(|value| value.to_string())
        .unwrap_or_else(|| path_to_string(path))
}
pub(crate) fn relative_path_to_string(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(value) => value.to_str().map(|part| part.to_string()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("\\")
}
pub(crate) fn normalize_key(value: &str) -> String {
    value.replace('/', "\\").to_lowercase()
}
pub(crate) fn ensure_relative_path(path: &str, operation: &str) -> NativeResult<PathBuf> {
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
pub(crate) fn ensure_not_workspace_root(path: &str, operation: &str) -> NativeResult<()> {
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
pub(crate) fn invalid_windows_name(name: &str) -> bool {
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
pub(crate) fn validate_name(name: &str) -> NativeResult<String> {
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
pub(crate) fn replace_existing_path(
    target_path: &Path,
    replacement_path: &Path,
) -> std::io::Result<()> {
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
        let replace_error = std::io::Error::last_os_error();
        return replace_existing_path_via_backup(target_path, replacement_path)
            .map_err(|fallback_error| {
                std::io::Error::new(
                    fallback_error.kind(),
                    format!(
                        "ReplaceFileW failed: {replace_error}; fallback replace failed: {fallback_error}"
                    ),
                )
            });
    }
    Ok(())
}
#[cfg(windows)]
pub(crate) fn replace_existing_path_via_backup(
    target_path: &Path,
    replacement_path: &Path,
) -> std::io::Result<()> {
    if !replacement_path.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "replacement file is missing after failed atomic replace",
        ));
    }
    let parent = target_path.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "missing parent directory for target path",
        )
    })?;
    let backup_path = parent.join(format!(".folden-backup-{}.tmp", next_id("replace")));
    fs::rename(target_path, &backup_path)?;
    match fs::rename(replacement_path, target_path) {
        Ok(()) => {
            let _ = fs::remove_file(&backup_path);
            Ok(())
        }
        Err(replace_error) => {
            let restore_result = fs::rename(&backup_path, target_path);
            if let Err(restore_error) = restore_result {
                return Err(std::io::Error::other(format!(
                    "could not install replacement ({replace_error}) or restore backup ({restore_error})"
                )));
            }
            Err(replace_error)
        }
    }
}
#[cfg(not(windows))]
pub(crate) fn replace_existing_path(
    target_path: &Path,
    replacement_path: &Path,
) -> std::io::Result<()> {
    fs::rename(replacement_path, target_path)
}
pub(crate) fn write_atomic_bytes_with<F>(
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
pub(crate) fn write_atomic_text_file(
    target_path: &Path,
    bytes: &[u8],
    operation: &str,
) -> NativeResult<FileFingerprint> {
    write_atomic_bytes_with(target_path, bytes, replace_existing_path)
        .map_err(|error| io_error(operation, error))?;
    let metadata = fs::metadata(target_path).map_err(|error| io_error(operation, error))?;
    create_file_fingerprint(&metadata)
}
pub(crate) fn ensure_expected_fingerprint(
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
