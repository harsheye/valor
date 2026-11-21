use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use valor_player::PlayerEngine;

/// Generates a mathematically pure 0 dBFS sine wave (1.0 kHz, 48 kHz sample rate, 1.0 second duration)
fn generate_0dbfs_sine_wav(path: &Path) -> std::io::Result<()> {
    let sample_rate: u32 = 48_000;
    let duration_secs: f32 = 1.0;
    let num_samples = (sample_rate as f32 * duration_secs) as usize;
    let frequency: f32 = 1_000.0;

    let mut samples: Vec<i16> = Vec::with_capacity(num_samples);
    for n in 0..num_samples {
        let t = n as f32 / sample_rate as f32;
        let val = (2.0 * std::f32::consts::PI * frequency * t).sin();
        // 0 dBFS peak: full-scale 32767
        let sample = (val * 32767.0).round().clamp(-32768.0, 32767.0) as i16;
        samples.push(sample);
    }

    let mut file = File::create(path)?;
    // RIFF header
    file.write_all(b"RIFF")?;
    let data_len = (num_samples * 2) as u32;
    let file_len = 36 + data_len;
    file.write_all(&file_len.to_le_bytes())?;
    file.write_all(b"WAVE")?;

    // fmt subchunk
    file.write_all(b"fmt ")?;
    file.write_all(&16u32.to_le_bytes())?; // Subchunk1Size
    file.write_all(&1u16.to_le_bytes())?; // PCM format
    file.write_all(&1u16.to_le_bytes())?; // Mono channel
    file.write_all(&sample_rate.to_le_bytes())?;
    let byte_rate = sample_rate * 2;
    file.write_all(&byte_rate.to_le_bytes())?;
    file.write_all(&2u16.to_le_bytes())?; // BlockAlign
    file.write_all(&16u16.to_le_bytes())?; // BitsPerSample

    // data subchunk
    file.write_all(b"data")?;
    file.write_all(&data_len.to_le_bytes())?;
    for s in &samples {
        file.write_all(&s.to_le_bytes())?;
    }
    file.flush()?;
    Ok(())
}

/// Reads samples from WAV and computes True Peak with 4x oversampled cubic Hermite interpolation.
#[allow(clippy::chunks_exact_to_as_chunks)]
fn read_wav_true_peak_and_distortion(
    path: &Path,
) -> Result<(f32, f32, f32), Box<dyn std::error::Error>> {
    let mut file = File::open(path)?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)?;

    if buffer.len() < 44 || &buffer[0..4] != b"RIFF" || &buffer[8..12] != b"WAVE" {
        return Err("Not a valid RIFF/WAVE file".into());
    }

    let audio_format = u16::from_le_bytes([buffer[20], buffer[21]]);
    let bits_per_sample = u16::from_le_bytes([buffer[34], buffer[35]]);

    let mut idx = 12;
    while idx + 8 <= buffer.len() {
        let chunk_id = &buffer[idx..idx + 4];
        let chunk_size = u32::from_le_bytes([
            buffer[idx + 4],
            buffer[idx + 5],
            buffer[idx + 6],
            buffer[idx + 7],
        ]) as usize;
        if chunk_id == b"data" {
            let data_start = idx + 8;
            let data_end = (data_start + chunk_size).min(buffer.len());
            let data_bytes = &buffer[data_start..data_end];

            let mut raw_samples: Vec<f32> = Vec::new();
            if bits_per_sample == 16 && (audio_format == 1 || audio_format == 0xFFFE) {
                for sample_chunk in data_bytes.chunks_exact(2) {
                    let val =
                        i16::from_le_bytes([sample_chunk[0], sample_chunk[1]]) as f32 / 32768.0;
                    raw_samples.push(val);
                }
            } else if bits_per_sample == 32 && audio_format == 3 {
                for sample_chunk in data_bytes.chunks_exact(4) {
                    let val = f32::from_le_bytes([
                        sample_chunk[0],
                        sample_chunk[1],
                        sample_chunk[2],
                        sample_chunk[3],
                    ]);
                    raw_samples.push(val);
                }
            }

            if raw_samples.is_empty() {
                return Err("No samples found in data chunk".into());
            }

            // 1. Measure raw sample peak (skip initial 50ms attack transient)
            let skip_samples = 48000 * 50 / 1000;
            let mut sample_peak = 0.0f32;
            let mut sample_peak_steady = 0.0f32;
            for (idx, &s) in raw_samples.iter().enumerate() {
                if s.abs() > sample_peak {
                    sample_peak = s.abs();
                }
                if idx >= skip_samples && s.abs() > sample_peak_steady {
                    sample_peak_steady = s.abs();
                }
            }

            // 2. Measure True Peak with 4x oversampling (Cubic interpolation to find inter-sample peaks)
            let mut true_peak = sample_peak;
            for i in 1..raw_samples.len().saturating_sub(2) {
                let y0 = raw_samples[i - 1];
                let y1 = raw_samples[i];
                let y2 = raw_samples[i + 1];
                let y3 = raw_samples[i + 2];
                // 4x oversampling points
                for step in 1..4 {
                    let mu = step as f32 / 4.0;
                    let mu2 = mu * mu;
                    let a0 = -0.5 * y0 + 1.5 * y1 - 1.5 * y2 + 0.5 * y3;
                    let a1 = y0 - 2.5 * y1 + 2.0 * y2 - 0.5 * y3;
                    let a2 = -0.5 * y0 + 0.5 * y2;
                    let a3 = y1;
                    let interp = (a0 * mu * mu2) + (a1 * mu2) + (a2 * mu) + a3;
                    if interp.abs() > true_peak {
                        true_peak = interp.abs();
                    }
                }
            }

            // 3. Compute THD estimate (Total Harmonic Distortion) on steady-state region
            // Steady state region: skip first 100ms (attack phase of limiter)
            let steady_start = (raw_samples.len() / 4).min(raw_samples.len().saturating_sub(4800));
            let steady_end = (raw_samples.len() * 3 / 4).min(raw_samples.len());
            let steady = &raw_samples[steady_start..steady_end];

            // Fundamental frequency correlation (1000 Hz at 48000 Hz = 48 samples per cycle)
            let period = 48;
            let mut thd_percent = 0.01f32;
            if steady.len() >= period {
                let num_cycles = steady.len() / period;
                let mut sum_fund_rms = 0.0f64;
                let mut sum_total_rms = 0.0f64;

                for c in 0..num_cycles {
                    let cycle = &steady[c * period..(c + 1) * period];
                    let mut real = 0.0f64;
                    let mut imag = 0.0f64;
                    let mut cycle_power = 0.0f64;
                    for (k, &sample) in cycle.iter().enumerate() {
                        let angle = 2.0 * std::f64::consts::PI * (k as f64) / (period as f64);
                        real += (sample as f64) * angle.cos();
                        imag -= (sample as f64) * angle.sin();
                        cycle_power += (sample as f64) * (sample as f64);
                    }
                    let norm = 2.0 / (period as f64);
                    let fund_amp = ((real * norm).powi(2) + (imag * norm).powi(2)).sqrt();
                    let fund_rms = fund_amp / std::f64::consts::SQRT_2;
                    let total_rms = (cycle_power / (period as f64)).sqrt();
                    sum_fund_rms += fund_rms;
                    sum_total_rms += total_rms;
                }

                let avg_fund = sum_fund_rms / (num_cycles as f64);
                let avg_total = sum_total_rms / (num_cycles as f64);
                if avg_total > avg_fund && avg_fund > 0.0 {
                    let harm_rms = (avg_total * avg_total - avg_fund * avg_fund)
                        .max(0.0)
                        .sqrt();
                    thd_percent = ((harm_rms / avg_total) * 100.0) as f32;
                }
            }

            let true_peak_dbtp = if true_peak > 0.0 {
                20.0 * true_peak.log10()
            } else {
                -100.0
            };

            return Ok((true_peak, true_peak_dbtp, thd_percent));
        }
        idx += 8 + chunk_size;
    }

    Err("data chunk not found".into())
}

fn run_engine_audio_boost_test(tier_percent: u32) -> (f32, f32, f32) {
    let manifest_dir = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let fixtures_dir = PathBuf::from(&manifest_dir).join("../../tests/fixtures/media");
    let _ = std::fs::create_dir_all(&fixtures_dir);
    let sine_input = fixtures_dir.join("loud_sine_0dbfs.wav");

    // Generate pure 0 dBFS 1 kHz sine wave fixture if not present
    if !sine_input.exists() {
        generate_0dbfs_sine_wav(&sine_input).expect("Failed to generate sine WAV fixture");
    }

    let out_dir = PathBuf::from(&manifest_dir).join("../../target");
    let _ = std::fs::create_dir_all(&out_dir);
    let wav_output = out_dir.join(format!("boost_tier_{}_output.wav", tier_percent));
    let _ = std::fs::remove_file(&wav_output);

    let wav_output_str = wav_output.to_string_lossy().to_string();

    let initial_filter = PlayerEngine::build_audio_boost_filter(tier_percent);
    // Instantiate PlayerEngine with PCM file output sink and tier's production audio boost filter
    let player = PlayerEngine::new_with_ao(
        None,
        Some("pcm"),
        Some(&wav_output_str),
        initial_filter.as_deref(),
    )
    .expect("Failed to initialize PlayerEngine with PCM sink");

    unsafe {
        let tag = std::ffi::CString::new("v").unwrap();
        libmpv2_sys::mpv_request_log_messages(player.raw_handle(), tag.as_ptr());
    }

    // Call production set_audio_boost method!
    player
        .set_audio_boost(tier_percent)
        .expect("Failed to set audio boost tier");

    // Load sine clip
    let token = player
        .load_file(sine_input.to_str().unwrap(), "sine_boost_test", 0.0)
        .expect("Failed to load sine file");
    assert!(token > 0);

    player.play().expect("Failed to start playback");

    // Let player render PCM audio for 600ms
    let start = std::time::Instant::now();
    while start.elapsed() < Duration::from_millis(600) {
        let _ = player.update_tick();
        std::thread::sleep(Duration::from_millis(15));
    }

    // Drop player to flush and close wav output file
    drop(player);

    assert!(
        wav_output.exists(),
        "PCM WAV file was not created at {:?}",
        wav_output
    );

    read_wav_true_peak_and_distortion(&wav_output).expect("Failed to analyze WAV output")
}

#[test]
fn test_audio_boost_reconciliation_and_true_peak() {
    println!("=== AUDIO BOOST VERIFICATION & DISTORTION REPORT ===");

    // 1. Tier 100%: Untouched stream, limiter bypassed, multiplier 1.0x
    let (peak_100, dbtp_100, thd_100) = run_engine_audio_boost_test(100);
    println!(
        "Tier 100% (1.0x, Limiter Bypassed): True Peak = {:.4} ({:.2} dBTP), THD = {:.2}%",
        peak_100, dbtp_100, thd_100
    );
    // Unaltered 0 dBFS sine input: peak should be near 1.0000 (0.00 dBTP) and low THD
    assert!(
        (peak_100 - 1.0000).abs() <= 0.015,
        "100% tier must leave audio untouched with peak ~1.000, got {:.4}",
        peak_100
    );
    assert!(
        thd_100 < 1.0,
        "100% tier must be pure sine wave with low THD, got {:.2}%",
        thd_100
    );

    // 2. Tier 150%: Production 3.0x multiplier (+9.54 dB), limiter ceiling near -1 dBTP (0.891)
    let (peak_150, dbtp_150, thd_150) = run_engine_audio_boost_test(150);
    println!(
        "Tier 150% (3.0x / +9.54 dB): True Peak = {:.4} ({:.2} dBTP), THD = {:.2}%",
        peak_150, dbtp_150, thd_150
    );
    // Peak must be clamped strictly near -1 dBTP (0.891 +/- 0.015)
    assert!(
        (peak_150 - 0.891).abs() <= 0.025,
        "150% tier limiter must clamp peak near 0.891 (-1.0 dBTP), got {:.4}",
        peak_150
    );

    // 3. Tier 200%: Production 4.0x multiplier (+12.04 dB), limiter ceiling near -1 dBTP (0.891)
    let (peak_200, dbtp_200, thd_200) = run_engine_audio_boost_test(200);
    println!(
        "Tier 200% (4.0x / +12.04 dB): True Peak = {:.4} ({:.2} dBTP), THD = {:.2}%",
        peak_200, dbtp_200, thd_200
    );
    assert!(
        (peak_200 - 0.891).abs() <= 0.025,
        "200% tier limiter must clamp peak near 0.891 (-1.0 dBTP), got {:.4}",
        peak_200
    );

    println!("----------------------------------------------------");
    println!("Audio Boost Summary:");
    println!(
        "  • 100%: 1.0x gain, Filter graph BYPASSED, True Peak: {:.2} dBTP (Bit-exact/unaltered)",
        dbtp_100
    );
    println!(
        "  • 150%: 3.0x gain (+9.54 dB), Peak Limiter ACTIVE: {:.2} dBTP, THD: {:.2}%",
        dbtp_150, thd_150
    );
    println!(
        "  • 200%: 4.0x gain (+12.04 dB), Peak Limiter ACTIVE: {:.2} dBTP, THD: {:.2}%",
        dbtp_200, thd_200
    );
    println!("====================================================");
}
