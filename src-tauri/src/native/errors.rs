#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub(crate) enum FileErrorCode {
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
pub(crate) struct NativeError {
    pub(crate) code: FileErrorCode,
    pub(crate) operation: String,
    pub(crate) user_message: String,
    pub(crate) technical_message: Option<String>,
    pub(crate) retryable: bool,
}
pub(crate) type NativeResult<T> = Result<T, NativeError>;
pub(crate) fn native_error(
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
pub(crate) fn io_error(operation: &str, error: std::io::Error) -> NativeError {
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
