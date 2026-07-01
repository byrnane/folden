use super::*;
pub(crate) fn sanitize_log_message(message: &str) -> String {
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
pub(crate) fn open_directory_in_file_manager(path: &Path) -> std::io::Result<()> {
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
pub(crate) fn replace_known_path(value: String, path: &Path, label: &str) -> String {
    let display_path = path_to_string(path);
    value
        .replace(&display_path, label)
        .replace(&display_path.replace('\\', "/"), label)
}
pub(crate) fn redact_absolute_paths(value: &str) -> String {
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
pub(crate) fn redact_diagnostic_message(
    value: &str,
    app_data_dir: &Path,
    log_dir: &Path,
) -> String {
    let without_app_data = replace_known_path(value.to_string(), app_data_dir, "[app-data]");
    let without_log_dir = replace_known_path(without_app_data, log_dir, "[logs]");
    redact_absolute_paths(&without_log_dir)
        .lines()
        .map(str::trim_end)
        .collect::<Vec<_>>()
        .join("\n")
}
pub(crate) fn read_redacted_logs(log_dir: &Path, app_data_dir: &Path) -> Vec<String> {
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
pub(crate) fn build_diagnostic_report(app_data_dir: &Path, log_dir: &Path) -> String {
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
#[tauri::command]
pub(crate) fn log_frontend_event(level: String, message: String) -> NativeResult<()> {
    let sanitized_message = sanitize_log_message(&message);
    match level.as_str() {
        "info" => log::info!(target: "frontend", "{sanitized_message}"),
        "warn" => log::warn!(target: "frontend", "{sanitized_message}"),
        _ => log::error!(target: "frontend", "{sanitized_message}"),
    }
    Ok(())
}
#[tauri::command]
pub(crate) fn open_logs_folder<R: Runtime>(app_handle: tauri::AppHandle<R>) -> NativeResult<()> {
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
pub(crate) fn export_diagnostics<R: Runtime>(
    app_handle: tauri::AppHandle<R>,
) -> NativeResult<String> {
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
