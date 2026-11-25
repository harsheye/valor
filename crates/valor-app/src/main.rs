#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use eframe::egui;
use tracing::{info, Level};
use tracing_subscriber::FmtSubscriber;
use valor_app::{ipc, shell_app::ValorShellApp};

fn main() -> eframe::Result<()> {
    let args: Vec<String> = std::env::args().skip(1).collect();

    let mut win_w = 1280.0;
    let mut win_h = 720.0;
    let mut custom_scale: Option<f32> = None;

    let mut i = 0;
    while i < args.len() {
        if args[i] == "--width" && i + 1 < args.len() {
            if let Ok(w) = args[i + 1].parse::<f32>() {
                win_w = w;
            }
            i += 1;
        } else if args[i] == "--height" && i + 1 < args.len() {
            if let Ok(h) = args[i + 1].parse::<f32>() {
                win_h = h;
            }
            i += 1;
        } else if args[i] == "--scale" && i + 1 < args.len() {
            if let Ok(s) = args[i + 1].parse::<f32>() {
                custom_scale = Some(s);
            }
            i += 1;
        }
        i += 1;
    }

    // Forward launch requests to an existing library window.
    if let Ok(true) = ipc::try_forward_to_existing_instance(&args) {
        println!("Forwarded arguments to existing Valor instance and exiting.");
        std::process::exit(0);
    }

    // Start the single-instance listener for supported shell commands.
    let _ipc_rx = ipc::start_single_instance_ipc_server();

    // Initialize logging.
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    let _ = tracing::subscriber::set_global_default(subscriber);

    info!("Starting Valor desktop library");

    let app_icon = eframe::icon_data::from_png_bytes(include_bytes!("../../../assets/valor.png"))
        .unwrap_or_default();

    let native_options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Valor")
            .with_icon(std::sync::Arc::new(app_icon))
            .with_inner_size([win_w, win_h])
            .with_min_inner_size([960.0, 600.0])
            .with_decorations(false)
            .with_transparent(false),
        renderer: eframe::Renderer::Glow,
        ..Default::default()
    };

    eframe::run_native(
        "Valor",
        native_options,
        Box::new(move |cc| {
            if let Some(scale) = custom_scale {
                cc.egui_ctx.set_pixels_per_point(scale);
            }

            // Setup bundled crisp Inter font
            let mut fonts = egui::FontDefinitions::default();
            fonts.font_data.insert(
                "Inter".to_owned(),
                std::sync::Arc::new(egui::FontData::from_static(include_bytes!(
                    "../../../assets/fonts/Inter.ttf"
                ))),
            );
            fonts
                .families
                .entry(egui::FontFamily::Proportional)
                .or_default()
                .insert(0, "Inter".to_owned());
            cc.egui_ctx.set_fonts(fonts);

            let _ = cc;
            Ok(Box::new(ValorShellApp::new()))
        }),
    )
}
