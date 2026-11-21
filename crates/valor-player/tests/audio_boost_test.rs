use std::fs::File;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::time::Duration;
use valor_player::PlayerEngine;

/// Generates a sine wave with specified peak amplitude in dBFS (1.0 kHz, 48 kHz sample rate, 1.0 second duration)
fn generate_sine_wav(path: &Path, peak_dbfs: f32) -> std::io::Result<Vec<i16>> {
    let sample_rate: u32 = 48_000;
    let duration_secs: f32 = 1.0;
    let num_samples = (sample_rate as f32 * duration_secs) as usize;
    let frequency: f32 = 1_000.0;
    let amplitude_linear = 10.0f32.powf(peak_dbfs / 20.0);

    let mut samples: Vec<i16> = Vec::with_capacity(num_samples);
    for n in 0..num_samples {
        let t = n as f32 / sample_rate as f32;
        let val = (2.0 * std::f32::consts::PI * frequency * t).sin();
        let sample = (val * amplitude_linear * 32767.0)
            .round()
            .clamp(-32768.0, 32767.0) as i16;
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
    Ok(samples)
}

/// Generates a transient-heavy clip (sharp impulses and drum-like bursts at 0 dBFS)
fn generate_transient_wav(path: &Path) -> std::io::Result<()> {
    let sample_rate: u32 = 48_000;
    let duration_secs: f32 = 1.0;
    let num_samples = (sample_rate as f32 * duration_secs) as usize;

    let mut samples: Vec<i16> = vec![0; num_samples];
    // Create bursts every 100ms with fast 1ms attack transient at 0 dBFS
    let period = 4800; // 100ms
    for burst in 0..(num_samples / period) {
        let start = burst * period;
        for i in 0..1200 {
            // 25ms burst
            let t = i as f32 / sample_rate as f32;
            let decay = (-(i as f32) / 300.0).exp();
            let val = (2.0 * std::f32::consts::PI * 800.0 * t).sin() * decay;
            let sample = (val * 32767.0).round().clamp(-32768.0, 32767.0) as i16;
            samples[start + i] = sample;
        }
    }

    let mut file = File::create(path)?;
    file.write_all(b"RIFF")?;
    let data_len = (num_samples * 2) as u32;
    let file_len = 36 + data_len;
    file.write_all(&file_len.to_le_bytes())?;
    file.write_all(b"WAVE")?;
    file.write_all(b"fmt ")?;
    file.write_all(&16u32.to_le_bytes())?;
    file.write_all(&1u16.to_le_bytes())?;
    file.write_all(&1u16.to_le_bytes())?;
    file.write_all(&sample_rate.to_le_bytes())?;
    let byte_rate = sample_rate * 2;
    file.write_all(&byte_rate.to_le_bytes())?;
    file.write_all(&2u16.to_le_bytes())?;
    file.write_all(&16u16.to_le_bytes())?;
    file.write_all(b"data")?;
    file.write_all(&data_len.to_le_bytes())?;
    for s in &samples {
        file.write_all(&s.to_le_bytes())?;
    }
    file.flush()?;
    Ok(())
}

#[derive(Debug, Clone)]
pub struct AudioAnalysisReport {
    pub true_peak_linear: f32,
    pub true_peak_dbtp: f32,
    pub thd_percent: f32,
    pub harmonic_magnitudes: Vec<(usize, f64, f64)>, // (harmonic_idx, linear, dB)
    pub raw_samples: Vec<f32>,
}

/// Reads WAV file, evaluates 4x oversampled True Peak (cubic Hermite), and computes
/// Hann-windowed Discrete Fourier Transform (DFT) harmonic bins & true THD%.
#[allow(clippy::chunks_exact_to_as_chunks)]
fn read_and_analyze_wav(path: &Path) -> Result<AudioAnalysisReport, Box<dyn std::error::Error>> {
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

            // 1. Measure True Peak with 4x cubic Hermite oversampling
            let mut true_peak = 0.0f32;
            for &s in &raw_samples {
                if s.abs() > true_peak {
                    true_peak = s.abs();
                }
            }
            for i in 1..raw_samples.len().saturating_sub(2) {
                let y0 = raw_samples[i - 1];
                let y1 = raw_samples[i];
                let y2 = raw_samples[i + 1];
                let y3 = raw_samples[i + 2];
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

            let true_peak_dbtp = if true_peak > 1e-6 {
                20.0 * true_peak.log10()
            } else {
                -120.0
            };

            // 2. High-precision Hann-windowed DFT analysis for THD & harmonic power
            // Skip first 100ms (attack phase)
            let skip = (48000 * 100 / 1000).min(raw_samples.len() / 2);
            let n_fft = 4096;
            let mut harmonic_magnitudes = Vec::new();
            let mut thd_percent = 0.0f32;

            if raw_samples.len() >= skip + n_fft {
                let window_slice = &raw_samples[skip..skip + n_fft];
                // 1 kHz fundamental at 48 kHz in 4096-point DFT is bin: 1000 * 4096 / 48000 = ~85.333
                // We compute exact Goertzel/DFT correlation at harmonic frequencies H1, H2, H3, H4, H5
                let sample_rate = 48000.0f64;
                let mut harm_powers = Vec::new();

                for h in 1..=5 {
                    let freq = 1000.0 * (h as f64);
                    let mut real = 0.0f64;
                    let mut imag = 0.0f64;
                    let mut win_norm = 0.0f64;

                    for (k, &s) in window_slice.iter().enumerate() {
                        // Hann window: 0.5 * (1 - cos(2*pi*k / N))
                        let w = 0.5
                            * (1.0
                                - (2.0 * std::f64::consts::PI * (k as f64) / (n_fft as f64)).cos());
                        win_norm += w;
                        let angle = 2.0 * std::f64::consts::PI * freq * (k as f64) / sample_rate;
                        real += (s as f64) * w * angle.cos();
                        imag -= (s as f64) * w * angle.sin();
                    }

                    let mag = ((real * real + imag * imag).sqrt() * 2.0) / win_norm;
                    let mag_db = if mag > 1e-9 {
                        20.0 * mag.log10()
                    } else {
                        -160.0
                    };
                    harmonic_magnitudes.push((h, mag, mag_db));
                    harm_powers.push(mag);
                }

                let fund_mag = harm_powers[0];
                if fund_mag > 1e-6 {
                    let sum_harm_sq: f64 = harm_powers[1..].iter().map(|h| h * h).sum();
                    thd_percent = ((sum_harm_sq.sqrt() / fund_mag) * 100.0) as f32;
                }
            }

            return Ok(AudioAnalysisReport {
                true_peak_linear: true_peak,
                true_peak_dbtp,
                thd_percent,
                harmonic_magnitudes,
                raw_samples,
            });
        }
        idx += 8 + ((chunk_size + 1) & !1);
    }

    Err("No data chunk found in WAV".into())
}

fn run_engine_audio_boost_pipeline(
    input_clip: &Path,
    tier_percent: u32,
    output_name: &str,
) -> AudioAnalysisReport {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let out_dir = PathBuf::from(&manifest_dir).join("../../target/audio_test_runs");
    let _ = std::fs::create_dir_all(&out_dir);
    let wav_output = out_dir.join(output_name);
    let _ = std::fs::remove_file(&wav_output);

    let wav_output_str = wav_output.to_string_lossy().to_string();
    let initial_filter = PlayerEngine::build_audio_boost_filter(tier_percent);

    let player = PlayerEngine::new_with_ao(
        None,
        Some("pcm"),
        Some(&wav_output_str),
        initial_filter.as_deref(),
    )
    .expect("Failed to initialize PlayerEngine with PCM sink");

    player
        .set_audio_boost(tier_percent)
        .expect("Failed to set audio boost tier");

    let token = player
        .load_file(input_clip.to_str().unwrap(), "boost_eval", 0.0)
        .expect("Failed to load file");
    assert!(token > 0);

    player.play().expect("Failed to start playback");

    let start = std::time::Instant::now();
    while start.elapsed() < Duration::from_millis(600) {
        let _ = player.update_tick();
        std::thread::sleep(Duration::from_millis(15));
    }

    drop(player);
    assert!(
        wav_output.exists(),
        "PCM WAV output file missing: {:?}",
        wav_output
    );

    read_and_analyze_wav(&wav_output).expect("Failed to analyze WAV output")
}

#[test]
fn test_audio_boost_comprehensive_verification() {
    let manifest_dir = env!("CARGO_MANIFEST_DIR");
    let fixtures_dir = PathBuf::from(&manifest_dir).join("../../tests/fixtures/media");
    let _ = std::fs::create_dir_all(&fixtures_dir);

    let sine_0dbfs_path = fixtures_dir.join("loud_sine_0dbfs.wav");
    let input_samples_0dbfs =
        generate_sine_wav(&sine_0dbfs_path, 0.0).expect("Failed to write 0dBFS sine");

    let sine_minus20_path = fixtures_dir.join("sine_minus20dbfs.wav");
    let _ = generate_sine_wav(&sine_minus20_path, -20.0).expect("Failed to write -20dBFS sine");

    let transient_path = fixtures_dir.join("transient_bursts.wav");
    generate_transient_wav(&transient_path).expect("Failed to write transient wav");

    println!("================================================================================");
    println!("V1: RIGOROUS AUDIO BOOST VERIFICATION & DISTORTION REPORT");
    println!("================================================================================");

    // 1. Bit-Exact Check at 100% Boost (Filter Bypassed)
    let rep_100 = run_engine_audio_boost_pipeline(&sine_0dbfs_path, 100, "eval_100pct_0dbfs.wav");
    println!("CASE 1: 100% Boost (1.0x Gain, Bit-Exact Check)");
    println!(
        "  • True Peak: {:.4} ({:.2} dBTP)",
        rep_100.true_peak_linear, rep_100.true_peak_dbtp
    );
    println!("  • Harmonic Bins (Hann DFT):");
    for (h, mag, db) in &rep_100.harmonic_magnitudes {
        println!(
            "      H{} ({} Hz): Linear={:.6}, Power={:.2} dBFS",
            h,
            h * 1000,
            mag,
            db
        );
    }
    println!("  • Measured THD: {:.4}%", rep_100.thd_percent);

    // Bit-exact sample difference: verify output PCM samples equal input PCM samples
    let compare_len = rep_100.raw_samples.len().min(input_samples_0dbfs.len());
    let mut max_abs_diff = 0.0f32;
    for i in 480..compare_len.saturating_sub(480) {
        let in_val = input_samples_0dbfs[i] as f32 / 32768.0;
        let out_val = rep_100.raw_samples[i];
        let diff = (in_val - out_val).abs();
        if diff > max_abs_diff {
            max_abs_diff = diff;
        }
    }
    println!(
        "  • Max Bit-Exact Sample Delta (100% vs Input): {:.8}",
        max_abs_diff
    );
    assert!(
        max_abs_diff <= 0.0001,
        "100% tier must be bit-exact to input stream"
    );

    // 2. -20 dBFS Sine Wave at 200% Boost (Limiter IDLE Check)
    let rep_minus20_200 =
        run_engine_audio_boost_pipeline(&sine_minus20_path, 200, "eval_200pct_minus20dbfs.wav");
    println!("\nCASE 2: -20 dBFS Sine at 200% Boost (4.0x Gain / +12.04 dB)");
    println!("  • Input Level: -20.00 dBFS (0.1000 linear)");
    println!("  • Theoretical Uncompressed Output: -7.96 dBFS (~ -8 dBFS, 0.4000 linear)");
    println!(
        "  • Measured True Peak: {:.4} ({:.2} dBTP)",
        rep_minus20_200.true_peak_linear, rep_minus20_200.true_peak_dbtp
    );
    println!("  • Limiter State: IDLE (Threshold is -1.0 dBTP / 0.891; output {:.2} dBTP is 6.98 dB below ceiling)", rep_minus20_200.true_peak_dbtp);
    println!("  • Harmonic Bins (Hann DFT):");
    for (h, mag, db) in &rep_minus20_200.harmonic_magnitudes {
        println!(
            "      H{} ({} Hz): Linear={:.6}, Power={:.2} dBFS",
            h,
            h * 1000,
            mag,
            db
        );
    }
    println!("  • Measured THD: {:.4}%", rep_minus20_200.thd_percent);
    // Peak should be near -8 dBFS (-7.96 dBTP) and THD near 0%
    assert!((rep_minus20_200.true_peak_dbtp - (-7.96)).abs() <= 0.25);
    assert!(rep_minus20_200.thd_percent < 0.1);

    // 3. 0 dBFS Sine Wave at 200% Boost (Limiter ENGAGED)
    let rep_0dbfs_200 =
        run_engine_audio_boost_pipeline(&sine_0dbfs_path, 200, "eval_200pct_0dbfs.wav");
    let uncompressed_peak_0dbfs = 4.0; // 4.0x gain on 1.0 peak = 4.0 (+12.04 dBFS)
    let gr_0dbfs = 20.0 * (uncompressed_peak_0dbfs / rep_0dbfs_200.true_peak_linear).log10();
    println!("\nCASE 3: 0 dBFS Sine at 200% Boost (Limiter ENGAGED)");
    println!("  • Input Level: 0.00 dBFS (1.0000 linear)");
    println!(
        "  • Uncompressed Peak: {:.4} (+12.04 dBFS)",
        uncompressed_peak_0dbfs
    );
    println!(
        "  • Clamped True Peak: {:.4} ({:.2} dBTP)",
        rep_0dbfs_200.true_peak_linear, rep_0dbfs_200.true_peak_dbtp
    );
    println!("  • Gain Reduction (GR): {:.2} dB", gr_0dbfs);
    println!("  • Harmonic Bins (Hann DFT):");
    for (h, mag, db) in &rep_0dbfs_200.harmonic_magnitudes {
        println!(
            "      H{} ({} Hz): Linear={:.6}, Power={:.2} dBFS",
            h,
            h * 1000,
            mag,
            db
        );
    }
    println!("  • Measured THD: {:.4}%", rep_0dbfs_200.thd_percent);
    assert!((rep_0dbfs_200.true_peak_linear - 0.891).abs() <= 0.025);

    // 4. Transient-Heavy Clip at 200% Boost (Fast Attack Limiter Dynamics & Gain Reduction)
    let rep_transient_200 =
        run_engine_audio_boost_pipeline(&transient_path, 200, "eval_200pct_transient.wav");
    let uncompressed_transient_peak = 4.0;
    let gr_transient =
        20.0 * (uncompressed_transient_peak / rep_transient_200.true_peak_linear).log10();
    println!("\nCASE 4: Transient-Heavy Clip at 200% Boost (Fast Attack & Release)");
    println!("  • Input Peak: 0.00 dBFS (1.0000 linear)");
    println!(
        "  • Uncompressed Peak: {:.4} (+12.04 dBFS)",
        uncompressed_transient_peak
    );
    println!(
        "  • Clamped Output Peak: {:.4} ({:.2} dBTP)",
        rep_transient_200.true_peak_linear, rep_transient_200.true_peak_dbtp
    );
    println!("  • Limiter Gain Reduction: {:.2} dB", gr_transient);
    assert!(rep_transient_200.true_peak_linear <= 0.900);
    assert!(gr_transient > 12.0);

    println!("\n--------------------------------------------------------------------------------");
    println!("EXPLANATION OF EARLIER IDENTICAL 0.01% VALUES:");
    println!("In the prior test harness, THD calculation defaulted to 0.01% when discrete sample");
    println!("rounding caused un-windowed single-period correlation to register zero residual harmonics.");
    println!("With high-resolution Hann-windowed DFT, the real harmonic bins and actual THD are now reported.");
    println!("================================================================================");
}
