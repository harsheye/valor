use egui::{Color32, Pos2, Ui};
use std::f32::consts::PI;

/// Renders the signature Valor Ember/Fire-Ring particle loading spinner.
/// Inspired by cinematic embers swirling in an orbit with heat-based gradient coloring.
pub fn render_ember_spinner(ui: &mut Ui, center: Pos2, base_radius: f32, time_secs: f64) {
    let painter = ui.painter();
    let num_particles = 52;

    for i in 0..num_particles {
        let i_f = i as f32;
        let base_angle = (i_f / num_particles as f32) * 2.0 * PI;
        let rotation_speed = 1.6;
        let angle = base_angle + (time_secs as f32 * rotation_speed);

        // Deterministic pseudo-noise
        let noise = ((i_f * 12.9898 + 78.233).sin() * 43758.5453).fract();
        let noise2 = ((i_f * 39.346 + 11.135).cos() * 24634.63).fract();
        let pulse = ((time_secs as f32 * 3.5 + i_f * 0.45).sin() + 1.0) * 0.5;

        let r = base_radius + (noise - 0.5) * 10.0 + (pulse - 0.5) * 5.0;
        let px = center.x + r * angle.cos();
        let py = center.y + r * angle.sin();

        // Ember colors: heat gradient from bright core (gold/yellow) to fiery orange and crimson
        let color_mix = (noise2 + pulse * 0.35).fract();
        let (red, green, blue, alpha) = if color_mix < 0.35 {
            (255, 210, 60, (200.0 + noise * 55.0) as u8) // Radiant gold
        } else if color_mix < 0.70 {
            (245, 120, 20, (170.0 + noise * 80.0) as u8) // Intense orange
        } else {
            (225, 40, 25, (140.0 + noise * 90.0) as u8) // Crimson ember
        };

        let particle_size = 1.8 + noise * 2.0 + pulse * 1.2;
        let color = Color32::from_rgba_premultiplied(red, green, blue, alpha);

        // Soft outer glow halo
        painter.circle_filled(
            Pos2::new(px, py),
            particle_size * 2.0,
            Color32::from_rgba_premultiplied(red, green, blue, alpha / 4),
        );
        // Bright core particle
        painter.circle_filled(Pos2::new(px, py), particle_size, color);
    }
}
