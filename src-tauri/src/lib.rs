use std::fs;

#[derive(serde::Serialize)]
struct OpenedDocument {
  path: String,
  content: String,
}

#[tauri::command]
fn open_text_file() -> Result<Option<OpenedDocument>, String> {
  let Some(path) = rfd::FileDialog::new()
    .add_filter("Text", &["txt", "md", "markdown", "json", "toml", "rs", "ts", "js", "vue", "css", "html"])
    .add_filter("All files", &["*"])
    .pick_file()
  else {
    return Ok(None);
  };

  let content =
    fs::read_to_string(&path).map_err(|error| format!("Failed to read file: {error}"))?;

  Ok(Some(OpenedDocument {
    path: path.to_string_lossy().to_string(),
    content,
  }))
}

#[tauri::command]
fn save_text_file(path: Option<String>, content: String) -> Result<Option<String>, String> {
  let path = match path {
    Some(path) => std::path::PathBuf::from(path),
    None => {
      let Some(path) = rfd::FileDialog::new()
        .add_filter("Markdown", &["md", "markdown"])
        .add_filter("Text", &["txt"])
        .add_filter("All files", &["*"])
        .save_file()
      else {
        return Ok(None);
      };

      path
    }
  };

  fs::write(&path, content).map_err(|error| format!("Failed to save file: {error}"))?;

  Ok(Some(path.to_string_lossy().to_string()))
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
    .invoke_handler(tauri::generate_handler![open_text_file, save_text_file])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
