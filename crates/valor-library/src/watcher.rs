use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc::{channel, Receiver, Sender};
use std::time::Duration;
use tracing::info;

pub struct LibraryWatcher {
    _watcher: RecommendedWatcher,
    pub rx: Receiver<notify::Result<Event>>,
}

impl LibraryWatcher {
    pub fn new() -> Result<(Self, Sender<notify::Result<Event>>), notify::Error> {
        let (tx, rx) = channel();
        let tx_clone = tx.clone();

        let config = Config::default().with_poll_interval(Duration::from_secs(2));
        let watcher = RecommendedWatcher::new(
            move |res| {
                let _ = tx_clone.send(res);
            },
            config,
        )?;

        Ok((
            Self {
                _watcher: watcher,
                rx,
            },
            tx,
        ))
    }

    pub fn watch_folder<P: AsRef<Path>>(&mut self, path: P) -> Result<(), notify::Error> {
        info!("Watching folder: {:?}", path.as_ref());
        self._watcher.watch(path.as_ref(), RecursiveMode::Recursive)
    }

    pub fn unwatch_folder<P: AsRef<Path>>(&mut self, path: P) -> Result<(), notify::Error> {
        info!("Unwatching folder: {:?}", path.as_ref());
        self._watcher.unwatch(path.as_ref())
    }
}
