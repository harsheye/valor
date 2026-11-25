//! Shared error definitions for the Valor workspace.

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error("The requested operation is not implemented.")]
    NotImplemented,
    #[error("Could not resolve the operating-system project directory.")]
    ProjectDirectoryUnavailable,
    #[error("An I/O operation failed: {0}")]
    Io(#[from] std::io::Error),
    #[error("A worker thread did not exit cleanly.")]
    WorkerThreadFailed,
    #[error("The native desktop window could not be started.")]
    WindowStartFailed,
}
