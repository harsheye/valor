//! Idle worker topology and orderly shutdown for Valor.

use crate::messages::WorkerSignal;
use crossbeam_channel::{unbounded, Sender};
use std::thread::{self, JoinHandle};
use valor_core::Error;

struct Worker {
    shutdown: Sender<WorkerSignal>,
    thread: JoinHandle<()>,
}

pub struct WorkerSet {
    workers: Vec<Worker>,
    stopped: bool,
}

impl WorkerSet {
    pub fn spawn() -> Result<Self, Error> {
        let mut workers = Vec::with_capacity(8);
        workers.push(spawn_worker("valor-mpv-events")?);
        workers.push(spawn_worker("valor-db-writer")?);
        for index in 0..2 {
            workers.push(spawn_worker(&format!("valor-db-reader-{index}"))?);
        }
        workers.push(spawn_worker("valor-scanner")?);
        workers.push(spawn_worker("valor-watcher")?);
        for index in 0..2 {
            workers.push(spawn_worker(&format!("valor-analysis-{index}"))?);
        }
        Ok(Self { workers, stopped: false })
    }

    pub fn worker_count(&self) -> usize {
        self.workers.len()
    }

    pub fn shutdown(&mut self) -> Result<(), Error> {
        if self.stopped {
            return Ok(());
        }
        self.stopped = true;
        for worker in &self.workers {
            let _ = worker.shutdown.send(WorkerSignal::Shutdown);
        }
        let mut failed = false;
        for worker in self.workers.drain(..) {
            failed |= worker.thread.join().is_err();
        }
        if failed {
            Err(Error::WorkerThreadFailed)
        } else {
            tracing::info!("All workers stopped");
            Ok(())
        }
    }
}

impl Drop for WorkerSet {
    fn drop(&mut self) {
        let _ = self.shutdown();
    }
}

fn spawn_worker(name: &str) -> Result<Worker, Error> {
    let (shutdown, receiver) = unbounded();
    let worker_name = name.to_owned();
    let thread = thread::Builder::new().name(worker_name.clone()).spawn(move || {
        tracing::info!(worker = %worker_name, "Worker started");
        while let Ok(signal) = receiver.recv() {
            if signal == WorkerSignal::Shutdown {
                break;
            }
        }
        tracing::info!(worker = %worker_name, "Worker stopped");
    })?;
    Ok(Worker { shutdown, thread })
}
