#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileFingerprint {
    pub(crate) size: u64,
    pub(crate) modified_at_ms: u64,
}
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TextFileFormat {
    pub(crate) line_ending: String,
    pub(crate) has_utf8_bom: bool,
}
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceDescriptor {
    pub(crate) id: String,
    pub(crate) root_path: String,
    pub(crate) name: String,
}
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenedDocument {
    pub(crate) id: String,
    pub(crate) path: String,
    pub(crate) content: String,
    pub(crate) workspace_id: Option<String>,
    pub(crate) relative_path: Option<String>,
    pub(crate) file_format: TextFileFormat,
    pub(crate) fingerprint: Option<FileFingerprint>,
}
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistedSessionDocument {
    pub(crate) key: String,
    pub(crate) kind: String,
    pub(crate) path: Option<String>,
    pub(crate) workspace_root_path: Option<String>,
    pub(crate) relative_path: Option<String>,
    pub(crate) name: String,
}
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistedSessionPane {
    pub(crate) id: String,
    pub(crate) document_keys: Vec<String>,
    pub(crate) active_document_key: Option<String>,
}
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistedPaneMode {
    pub(crate) pane_id: String,
    pub(crate) document_key: String,
    pub(crate) mode: String,
}
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PersistedSessionState {
    pub(crate) workspace_root_path: Option<String>,
    pub(crate) split_enabled: bool,
    pub(crate) active_pane_id: String,
    pub(crate) panes: Vec<PersistedSessionPane>,
    pub(crate) documents: Vec<PersistedSessionDocument>,
    pub(crate) pane_modes: Vec<PersistedPaneMode>,
}
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecoverySnapshot {
    pub(crate) key: String,
    pub(crate) kind: String,
    pub(crate) path: Option<String>,
    pub(crate) workspace_root_path: Option<String>,
    pub(crate) relative_path: Option<String>,
    pub(crate) name: String,
    pub(crate) content: String,
    pub(crate) file_format: TextFileFormat,
    pub(crate) fingerprint: Option<FileFingerprint>,
    pub(crate) updated_at_ms: u64,
}
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RecoveryLoadResult {
    pub(crate) entries: Vec<RecoverySnapshot>,
    pub(crate) diagnostics: Vec<String>,
}
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NativeFsEvent {
    pub(crate) kind: String,
    pub(crate) path: String,
}
#[derive(Clone, serde::Serialize)]
pub(crate) struct WorkspaceEntry {
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) kind: String,
    pub(crate) has_openable_descendants: bool,
    pub(crate) children: Vec<WorkspaceEntry>,
}
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceSettings {
    pub(crate) ignored_paths: Vec<String>,
}
