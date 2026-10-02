use super::*;

const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;

pub(crate) fn authorize_document_image_assets<R: Runtime>(
    app_handle: &tauri::AppHandle<R>,
    document_path: &Path,
) -> NativeResult<()> {
    let Some(parent) = document_path.parent() else {
        return Ok(());
    };
    let Some(stem) = document_path.file_stem().and_then(|stem| stem.to_str()) else {
        return Ok(());
    };
    let folder = parent.join(format!("{stem}.assets"));
    if !folder.is_dir() || is_reparse_path(&folder) {
        return Ok(());
    }
    let folder = fs::canonicalize(&folder).map_err(|error| io_error("image_assets", error))?;
    ensure_inside_root(parent, &folder, "image_assets")?;
    app_handle
        .asset_protocol_scope()
        .allow_directory(&folder, true)
        .map_err(|error| {
            native_error(
                FileErrorCode::Unknown,
                "image_assets",
                "Could not authorize document images for preview.",
                Some(error.to_string()),
                true,
            )
        })
}

fn image_extension(bytes: &[u8]) -> Option<(&'static str, &'static str)> {
    if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Some(("png", "image/png"));
    }
    if bytes.starts_with(&[0xff, 0xd8, 0xff]) {
        return Some(("jpg", "image/jpeg"));
    }
    if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        return Some(("gif", "image/gif"));
    }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some(("webp", "image/webp"));
    }
    None
}

fn image_error(message: &str) -> NativeError {
    native_error(
        FileErrorCode::EncodingUnsupported,
        "import_image_data",
        message,
        None,
        false,
    )
}

fn url_segment(value: &str) -> String {
    let mut result = String::new();
    for byte in value.bytes() {
        if byte.is_ascii_alphanumeric() || b"-._~".contains(&byte) {
            result.push(char::from(byte));
        } else {
            result.push_str(&format!("%{byte:02X}"));
        }
    }
    result
}

pub(crate) fn import_image_at_document(
    document_path: &Path,
    bytes: &[u8],
    mime: Option<&str>,
    name: Option<&str>,
) -> NativeResult<String> {
    const OPERATION: &str = "import_image_data";
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(native_error(
            FileErrorCode::TooLarge,
            OPERATION,
            "Images must be 20 MiB or smaller.",
            None,
            false,
        ));
    }
    let (extension, detected_mime) = image_extension(bytes)
        .ok_or_else(|| image_error("Choose a PNG, JPEG, GIF, or WebP image."))?;
    if mime.is_some_and(|mime| mime != detected_mime) {
        return Err(image_error("Image bytes do not match their declared type."));
    }
    if !document_path.is_file() {
        return Err(native_error(
            FileErrorCode::NotFound,
            OPERATION,
            "Save the document before importing an image.",
            None,
            false,
        ));
    }
    let parent = document_path
        .parent()
        .ok_or_else(|| image_error("Document has no parent folder."))?;
    let parent = fs::canonicalize(parent).map_err(|error| io_error(OPERATION, error))?;
    let document_stem = document_path
        .file_stem()
        .and_then(|name| name.to_str())
        .ok_or_else(|| image_error("Document has an invalid file name."))?;
    let assets_name = validate_name(&format!("{document_stem}.assets"))?;
    let assets_path = parent.join(&assets_name);
    match fs::create_dir(&assets_path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
        Err(error) => return Err(io_error(OPERATION, error)),
    }
    if is_reparse_path(&assets_path) || !assets_path.is_dir() {
        return Err(native_error(
            FileErrorCode::OutsideWorkspace,
            OPERATION,
            "The document assets folder must be a regular folder.",
            None,
            false,
        ));
    }
    let canonical_assets =
        fs::canonicalize(&assets_path).map_err(|error| io_error(OPERATION, error))?;
    ensure_inside_root(&parent, &canonical_assets, OPERATION)?;
    let stem = if let Some(name) = name.filter(|name| !name.is_empty()) {
        let valid_name = validate_name(name)?;
        validate_name(
            Path::new(&valid_name)
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("image"),
        )?
    } else {
        "image".to_string()
    };
    for suffix in 1..=10_000 {
        let file_name = if suffix == 1 {
            format!("{stem}.{extension}")
        } else {
            format!("{stem}-{suffix}.{extension}")
        };
        let target = canonical_assets.join(&file_name);
        let mut file = match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
        {
            Ok(file) => file,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(io_error(OPERATION, error)),
        };
        if let Err(error) = file.write_all(bytes).and_then(|_| file.sync_all()) {
            drop(file);
            let _ = fs::remove_file(&target);
            return Err(io_error(OPERATION, error));
        }
        return Ok(format!(
            "{}/{}",
            url_segment(&assets_name),
            url_segment(&file_name)
        ));
    }
    Err(native_error(
        FileErrorCode::AlreadyExists,
        OPERATION,
        "Too many images with this name. Choose another name.",
        None,
        false,
    ))
}

fn document_image_path(state: &NativeAppState, document_id: &str) -> NativeResult<PathBuf> {
    state
        .documents
        .get(document_id)
        .map(|document| document.path.clone())
        .ok_or_else(|| {
            native_error(
                FileErrorCode::NotFound,
                "import_image_data",
                "Save the document before importing an image.",
                None,
                false,
            )
        })
}

#[tauri::command]
pub(crate) async fn import_image_from_picker(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
    document_id: String,
) -> NativeResult<Option<String>> {
    document_image_path(&state.lock().unwrap(), &document_id)?;
    let image = tauri::async_runtime::spawn_blocking(
        || -> NativeResult<Option<(Vec<u8>, Option<String>)>> {
            use std::io::Read;
            let Some(path) = rfd::FileDialog::new()
                .add_filter(
                    "PNG / JPEG / GIF / WebP",
                    &["png", "jpg", "jpeg", "gif", "webp"],
                )
                .pick_file()
            else {
                return Ok(None);
            };
            let mut bytes = Vec::new();
            fs::File::open(&path)
                .map_err(|error| io_error("import_image_from_picker", error))?
                .take(MAX_IMAGE_BYTES as u64 + 1)
                .read_to_end(&mut bytes)
                .map_err(|error| io_error("import_image_from_picker", error))?;
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .map(str::to_string);
            Ok(Some((bytes, name)))
        },
    )
    .await
    .map_err(|error| {
        native_error(
            FileErrorCode::Unknown,
            "import_image_from_picker",
            "Could not import the image.",
            Some(error.to_string()),
            true,
        )
    })??;
    let Some((bytes, name)) = image else {
        return Ok(None);
    };
    let document_path = document_image_path(&state.lock().unwrap(), &document_id)?;
    let relative = import_image_at_document(&document_path, &bytes, None, name.as_deref())?;
    authorize_document_image_assets(&app_handle, &document_path)?;
    Ok(Some(relative))
}

#[tauri::command]
pub(crate) fn import_image_data(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
    document_id: String,
    bytes: Vec<u8>,
    mime: String,
    name: Option<String>,
) -> NativeResult<String> {
    let state = state.lock().unwrap();
    let path = document_image_path(&state, &document_id)?;
    let relative = import_image_at_document(&path, &bytes, Some(&mime), name.as_deref())?;
    authorize_document_image_assets(&app_handle, &path)?;
    Ok(relative)
}
