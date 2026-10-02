use super::*;
pub(crate) fn find_existing_document_id(state: &NativeAppState, path: &Path) -> Option<String> {
    state.documents.iter().find_map(|(document_id, document)| {
        if document.path == path {
            Some(document_id.clone())
        } else {
            None
        }
    })
}
pub(crate) fn register_document(
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
pub(crate) fn remove_registered_documents(
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
                    || normalized_relative.starts_with(&format!("{prefix}/")))
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
pub(crate) fn open_text_file(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
) -> NativeResult<Option<OpenedDocument>> {
    let Some(path) = rfd::FileDialog::new()
        .add_filter(
            "Markdown / TXT",
            &[
                "txt", "md", "markdown", "json", "toml", "rs", "ts", "js", "vue", "css", "html",
            ],
        )
        .add_filter("*", &["*"])
        .pick_file()
    else {
        return Ok(None);
    };
    let canonical_path = canonical_root(&path, "open_text_file")?;
    super::images::authorize_document_image_assets(&app_handle, &canonical_path)?;
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
pub(crate) fn open_text_file_at_path(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
    path: String,
) -> NativeResult<OpenedDocument> {
    let canonical_path = canonical_root(Path::new(&path), "open_text_file_at_path")?;
    super::images::authorize_document_image_assets(&app_handle, &canonical_path)?;
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
pub(crate) fn save_text_file(
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
            .add_filter("TXT", &["txt"])
            .add_filter("*", &["*"]);
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
    super::images::authorize_document_image_assets(&app_handle, &path)?;
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
pub(crate) fn close_native_documents(
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
