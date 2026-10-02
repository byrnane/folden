use super::*;

const MAX_SCAN_ENTRIES: usize = 100_000;
const MAX_SCAN_DEPTH: usize = 32;
const MAX_SEARCH_FILE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_SEARCH_MATCHES: usize = 5_000;
const SEARCH_BATCH_SIZE: usize = 100;

fn scan_key(workspace_id: &str, kind: &str) -> String {
    format!("{workspace_id}:{kind}")
}

fn begin_scan(
    state: &mut NativeAppState,
    request: &WorkspaceScanRequest,
    kind: &str,
) -> NativeResult<(PathBuf, Arc<AtomicBool>)> {
    let workspace = get_workspace(state, &request.workspace_id, kind)?.clone();
    for path in request.ignored_paths.iter().chain(&request.excluded_paths) {
        ensure_not_workspace_root(path, kind)?;
        ensure_relative_path(path, kind)?;
    }
    let key = scan_key(&request.workspace_id, kind);
    let token = Arc::new(AtomicBool::new(false));
    if let Some((_, old_token)) = state
        .workspace_scans
        .insert(key, (request.request_id.clone(), Arc::clone(&token)))
    {
        old_token.store(true, Ordering::Relaxed);
    }
    Ok((workspace.root_path, token))
}

fn finish_scan(state: &mut NativeAppState, request: &WorkspaceScanRequest, kind: &str) {
    let key = scan_key(&request.workspace_id, kind);
    if state
        .workspace_scans
        .get(&key)
        .map(|(id, _)| id == &request.request_id)
        .unwrap_or(false)
    {
        state.workspace_scans.remove(&key);
    }
}

fn scan_filters(request: &WorkspaceScanRequest) -> (HashSet<String>, Vec<String>) {
    (
        request
            .ignored_names
            .iter()
            .map(|name| name.to_lowercase())
            .collect(),
        request
            .ignored_paths
            .iter()
            .chain(&request.excluded_paths)
            .map(|path| normalize_key(path))
            .collect(),
    )
}

fn included_in_scan(
    root: &Path,
    path: &Path,
    ignored_names: &HashSet<String>,
    ignored_paths: &[String],
) -> bool {
    let Ok(relative_path) = path.strip_prefix(root) else {
        return false;
    };
    let key = normalize_key(&relative_path_to_string(relative_path));
    !relative_path.components().any(|component| {
        matches!(component, Component::Normal(name) if ignored_names.contains(&name.to_string_lossy().to_lowercase()))
    }) && !ignored_paths.iter().any(|ignored| {
        key == *ignored || key.starts_with(&format!("{ignored}/"))
    })
}

pub(crate) fn find_text_matches(
    content: &str,
    query: &str,
    case_sensitive: bool,
    relative_path: &str,
    fingerprint: &FileFingerprint,
    limit: usize,
    cancelled: &AtomicBool,
) -> Vec<WorkspaceSearchMatch> {
    if query.is_empty() || limit == 0 || cancelled.load(Ordering::Relaxed) {
        return Vec::new();
    }
    let haystack = if case_sensitive {
        content.to_string()
    } else {
        content.to_lowercase()
    };
    let needle = if case_sensitive {
        query.to_string()
    } else {
        query.to_lowercase()
    };
    // Lowercasing may expand a character. Keep original UTF-16 boundaries for IPC.
    let mut boundaries = Vec::with_capacity(content.chars().count() + 1);
    let mut folded_byte = 0usize;
    let mut utf16_offset = 0usize;
    let mut line_starts = vec![(0usize, 0usize, 0usize)];
    for (byte, character) in content.char_indices() {
        if boundaries.len() % 4096 == 0 && cancelled.load(Ordering::Relaxed) {
            return Vec::new();
        }
        boundaries.push((folded_byte, byte, utf16_offset));
        folded_byte += if case_sensitive {
            character.len_utf8()
        } else {
            character.to_lowercase().map(char::len_utf8).sum()
        };
        utf16_offset += character.len_utf16();
        if character == '\n' {
            line_starts.push((byte + 1, utf16_offset, boundaries.len()));
        }
    }
    boundaries.push((folded_byte, content.len(), utf16_offset));
    let mut matches = Vec::new();
    for (from, _) in haystack.match_indices(needle.as_str()) {
        if cancelled.load(Ordering::Relaxed) || matches.len() >= limit {
            break;
        }
        let start_index = boundaries
            .partition_point(|(offset, _, _)| *offset <= from)
            .saturating_sub(1);
        let end_index = boundaries.partition_point(|(offset, _, _)| *offset < from + needle.len());
        let (_, start_byte, start_utf16) = boundaries[start_index];
        let (_, end_byte, end_utf16) = boundaries[end_index];
        if matches
            .last()
            .map(|last: &WorkspaceSearchMatch| last.to > start_utf16)
            .unwrap_or(false)
        {
            continue;
        }
        let line_index = line_starts
            .partition_point(|(start, _, _)| *start <= start_byte)
            .saturating_sub(1);
        let (_, line_utf16, line_character) = line_starts[line_index];
        let line_end_character = line_starts
            .get(line_index + 1)
            .map(|(_, _, character)| *character)
            .unwrap_or(boundaries.len() - 1);
        let column = start_utf16 - line_utf16 + 1;
        let preview_start = start_index.saturating_sub(80).max(line_character);
        let preview_end = (preview_start + 240).min(line_end_character);
        let preview = content[boundaries[preview_start].1..boundaries[preview_end].1]
            .trim_end_matches(['\r', '\n'])
            .to_string();
        if end_byte < start_byte {
            continue;
        }
        matches.push(WorkspaceSearchMatch {
            path: relative_path.to_string(),
            from: start_utf16,
            to: end_utf16,
            line: line_index + 1,
            column,
            preview,
            fingerprint: fingerprint.clone(),
        });
    }
    matches
}

pub(crate) fn search_workspace_with_batches<F>(
    root: &Path,
    request: &WorkspaceSearchRequest,
    cancelled: &AtomicBool,
    mut emit_batch: F,
) -> NativeResult<WorkspaceSearchResult>
where
    F: FnMut(Vec<WorkspaceSearchMatch>),
{
    let mut result = WorkspaceSearchResult {
        matches: Vec::new(),
        partial: false,
        skipped: 0,
        cancelled: false,
    };
    if request.query.is_empty() {
        return Ok(result);
    }
    if request.query.len() > 4096 {
        return Err(native_error(
            FileErrorCode::TooLarge,
            "start_workspace_search",
            "Search text is too long.",
            None,
            false,
        ));
    }
    let mut emitted = 0usize;
    let (ignored_names, ignored_paths) = scan_filters(&request.scan);
    let status = visit_workspace_entries(
        root,
        WorkspaceTraversalOptions {
            max_entries: MAX_SCAN_ENTRIES,
            max_depth: MAX_SCAN_DEPTH,
            batch_size: SEARCH_BATCH_SIZE,
        },
        cancelled,
        "start_workspace_search",
        |_| {},
        |path| included_in_scan(root, path, &ignored_names, &ignored_paths),
        |path, file_type| {
            if !file_type.is_file() || !is_text_file(path) {
                return true;
            }
            let metadata = match fs::metadata(path) {
                Ok(metadata) if metadata.len() <= MAX_SEARCH_FILE_BYTES => metadata,
                _ => {
                    result.skipped += 1;
                    return true;
                }
            };
            let canonical = match fs::canonicalize(path) {
                Ok(path) if path.starts_with(root) => path,
                _ => {
                    result.skipped += 1;
                    return true;
                }
            };
            let (content, _, fingerprint) = match decode_text_file_with_limit(
                &canonical,
                Some(MAX_SEARCH_FILE_BYTES),
                "start_workspace_search",
            ) {
                Ok(value) if value.2.size <= MAX_SEARCH_FILE_BYTES => value,
                _ => {
                    result.skipped += 1;
                    return true;
                }
            };
            if metadata.len() != fingerprint.size {
                result.skipped += 1;
                return true;
            }
            let relative = relative_path_to_string(
                path.strip_prefix(root)
                    .expect("traversal path stays inside root"),
            );
            let matches = find_text_matches(
                &content,
                &request.query,
                request.case_sensitive,
                &relative,
                &fingerprint,
                MAX_SEARCH_MATCHES - result.matches.len(),
                cancelled,
            );
            result.matches.extend(matches);
            while result.matches.len() - emitted >= SEARCH_BATCH_SIZE {
                emit_batch(result.matches[emitted..emitted + SEARCH_BATCH_SIZE].to_vec());
                emitted += SEARCH_BATCH_SIZE;
            }
            result.matches.len() < MAX_SEARCH_MATCHES
        },
    )?;
    if emitted < result.matches.len() {
        emit_batch(result.matches[emitted..].to_vec());
    }
    result.cancelled =
        status == WorkspaceTraversalStatus::Cancelled || cancelled.load(Ordering::Relaxed);
    result.partial = status == WorkspaceTraversalStatus::LimitReached;
    Ok(result)
}

pub(crate) fn list_workspace_files_from_root(
    root: &Path,
    request: &WorkspaceScanRequest,
    cancelled: &AtomicBool,
) -> NativeResult<WorkspaceFilesResult> {
    let mut files = Vec::new();
    let (ignored_names, ignored_paths) = scan_filters(request);
    let status = visit_workspace_entries(
        root,
        WorkspaceTraversalOptions {
            max_entries: MAX_SCAN_ENTRIES,
            max_depth: MAX_SCAN_DEPTH,
            batch_size: SEARCH_BATCH_SIZE,
        },
        cancelled,
        "list_workspace_files",
        |_| {},
        |path| included_in_scan(root, path, &ignored_names, &ignored_paths),
        |path, file_type| {
            if file_type.is_file() && is_text_file(path) {
                files.push(relative_path_to_string(
                    path.strip_prefix(root)
                        .expect("traversal stays inside root"),
                ));
            }
            true
        },
    )?;
    files.sort_by_cached_key(|path| path.to_lowercase());
    Ok(WorkspaceFilesResult {
        files,
        partial: status == WorkspaceTraversalStatus::LimitReached,
        skipped: 0,
        cancelled: status == WorkspaceTraversalStatus::Cancelled,
    })
}

#[tauri::command]
pub(crate) async fn start_workspace_search(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    app_handle: tauri::AppHandle,
    request: WorkspaceSearchRequest,
) -> NativeResult<WorkspaceSearchResult> {
    let (root, token) = begin_scan(&mut state.lock().unwrap(), &request.scan, "search")?;
    let work_request = request.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        search_workspace_with_batches(&root, &work_request, &token, |matches| {
            if !token.load(Ordering::Relaxed) {
                let _ = app_handle.emit(
                    "folden://workspace-search-batch",
                    WorkspaceSearchBatch {
                        workspace_id: work_request.scan.workspace_id.clone(),
                        request_id: work_request.scan.request_id.clone(),
                        matches,
                    },
                );
            }
        })
    })
    .await
    .map_err(|error| {
        native_error(
            FileErrorCode::Unknown,
            "start_workspace_search",
            "Workspace search failed.",
            Some(error.to_string()),
            true,
        )
    });
    finish_scan(&mut state.lock().unwrap(), &request.scan, "search");
    result?
}

#[tauri::command]
pub(crate) async fn list_workspace_files(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    request: WorkspaceScanRequest,
) -> NativeResult<WorkspaceFilesResult> {
    let (root, token) = begin_scan(&mut state.lock().unwrap(), &request, "files")?;
    let work_request = request.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        list_workspace_files_from_root(&root, &work_request, &token)
    })
    .await
    .map_err(|error| {
        native_error(
            FileErrorCode::Unknown,
            "list_workspace_files",
            "Could not list workspace files.",
            Some(error.to_string()),
            true,
        )
    });
    finish_scan(&mut state.lock().unwrap(), &request, "files");
    result?
}

#[tauri::command]
pub(crate) fn cancel_workspace_search(
    state: tauri::State<'_, Mutex<NativeAppState>>,
    workspace_id: String,
    request_id: String,
) -> NativeResult<()> {
    let state = state.lock().unwrap();
    get_workspace(&state, &workspace_id, "cancel_workspace_search")?;
    cancel_scan_request(&state, &workspace_id, &request_id);
    Ok(())
}

pub(crate) fn cancel_scan_request(state: &NativeAppState, workspace_id: &str, request_id: &str) {
    for kind in ["search", "files"] {
        if let Some((id, token)) = state.workspace_scans.get(&scan_key(workspace_id, kind)) {
            if id == request_id {
                token.store(true, Ordering::Relaxed);
            }
        }
    }
}
