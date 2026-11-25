//! Native application shell and empty egui window lifecycle.

pub mod messages;
pub mod workers;

use eframe::egui;
use workers::WorkerSet;

pub struct ValorApp {
    workers: WorkerSet,
    _player: Option<valor_player::Player>,
}

impl ValorApp {
    pub fn new(workers: WorkerSet) -> Self {
        Self { workers, _player: None }
    }
}

impl eframe::App for ValorApp {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let context = ui.ctx();
        valor_ui::configure(context);
        if context.input(|input| input.key_pressed(egui::Key::Escape)) {
            context.send_viewport_cmd(egui::ViewportCommand::Close);
        }
        if context.input(|input| input.viewport().close_requested()) {
            if let Err(error) = self.workers.shutdown() {
                tracing::error!(%error, "Worker shutdown failed");
            }
        }
    }
}
