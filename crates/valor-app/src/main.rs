#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod app;
mod bench;
mod ipc;
mod power;
mod render;

use eframe::egui;
use std::path::PathBuf;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;

use app::ValorNativeApp;

fn main() -> eframe::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();

    // 1. Run Benchmark Suite if requested
    if args.iter().any(|a| a == "--bench") {
        bench::run_benchmark();
        return Ok(());
    }

    // 2. Single-Instance Forwarding via secure Named Pipe (Windows) / Unix Socket (Unix)
    if let Ok(true) = ipc::try_forward_to_existing_instance(&args) {
        println!("Forwarded arguments to existing Valor instance and exiting.");
        std::process::exit(0);
    }

    // 3. Start Single-Instance IPC listener
    let ipc_rx = ipc::start_single_instance_ipc_server();

    // 4. Check for blur disable flag
    let disable_blur = args.iter().any(|a| a == "--disable-blur");

    // 5. Initialize Logging
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    let _ = tracing::subscriber::set_global_default(subscriber);

    info!("Starting Valor Native Production Desktop Media Player");

    let native_options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Valor Native Player")
            .with_inner_size([1280.0, 720.0])
            .with_min_inner_size([800.0, 500.0])
            .with_transparent(false),
        renderer: eframe::Renderer::Glow,
        ..Default::default()
    };

    // Forward any initial CLI file arguments to the new instance
    let initial_paths: Vec<PathBuf> = args
        .iter()
        .filter(|a| !a.starts_with("--"))
        .filter_map(|a| ipc::validate_and_canonicalize_path(a).ok())
        .collect();

    eframe::run_native(
        "Valor Native Player",
        native_options,
        Box::new(move |cc| {
            let mut app = ValorNativeApp::new(cc, Some(ipc_rx), disable_blur);
            if !initial_paths.is_empty() {
                app.enqueue_paths(&initial_paths);
            }
            Ok(Box::new(app))
        }),
    )
}
