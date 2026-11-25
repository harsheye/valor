//! Start one borderless eframe window and stop idle workers on close.

use eframe::egui;
use std::fs::{create_dir_all, OpenOptions};
use valor_core::Error;
use valor_app::{workers::WorkerSet, ValorApp};

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
    }
}

fn run() -> Result<(), Error> {
    let log_dir = valor_core::paths::data_dir()?;
    create_dir_all(&log_dir)?;
    let log_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_dir.join("valor-run.log"))?;
    let _ = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(log_file)
        .try_init();
    tracing::info!("Valor window starting");
    let workers = WorkerSet::spawn()?;
    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Valor")
            .with_inner_size([1280.0, 800.0])
            .with_min_inner_size([960.0, 600.0])
            .with_decorations(false),
        renderer: eframe::Renderer::Glow,
        ..Default::default()
    };
    eframe::run_native(
        "Valor",
        options,
        Box::new(move |_creation_context| Ok(Box::new(ValorApp::new(workers)))),
    )
    .map_err(|_| Error::WindowStartFailed)?;
    tracing::info!("Valor window closed");
    Ok(())
}
