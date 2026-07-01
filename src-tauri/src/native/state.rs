use super::*;
pub(crate) struct NativeAppState {
    pub(crate) workspaces: HashMap<String, AuthorizedWorkspace>,
    pub(crate) documents: HashMap<String, AuthorizedDocument>,
    pub(crate) watcher: Option<RecommendedWatcher>,
    pub(crate) watched_paths: HashMap<String, WatchPathMode>,
    pub(crate) self_write_suppressions: Arc<Mutex<HashMap<String, u64>>>,
}
#[derive(Clone)]
pub(crate) struct AuthorizedWorkspace {
    pub(crate) root_path: PathBuf,
}
#[derive(Clone)]
pub(crate) struct AuthorizedDocument {
    pub(crate) path: PathBuf,
    pub(crate) workspace_id: Option<String>,
    pub(crate) relative_path: Option<String>,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum WatchPathMode {
    Recursive,
    NonRecursive,
}
impl WatchPathMode {
    pub(crate) fn recursive_mode(self) -> RecursiveMode {
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
