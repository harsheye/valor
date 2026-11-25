//! Typed message vocabulary for the app-to-worker boundaries.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkerSignal {
    Shutdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PlayerMessage {
    Shutdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DatabaseMessage {
    Shutdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ScannerMessage {
    Shutdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WatcherMessage {
    Shutdown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnalysisMessage {
    Shutdown,
}
