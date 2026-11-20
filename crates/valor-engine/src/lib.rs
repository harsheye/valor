use std::fs::File;
use std::path::Path;
use serde::{Deserialize, Serialize};
use symphonia::core::formats::FormatOptions;
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;
use symphonia::core::probe::Hint;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum EngineError {
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Symphonia probe error: {0}")]
    Symphonia(#[from] symphonia::core::errors::Error),
    #[error("Format error: {0}")]
    Format(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StreamInfo {
    pub index: usize,
    pub codec: String,
    pub stream_type: StreamType,
    pub language: Option<String>,
    pub title: Option<String>,
    pub channels: Option<usize>,
    pub sample_rate: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum StreamType {
    Video,
    Audio,
    Subtitle,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaMetadata {
    pub file_name: String,
    pub file_size: u64,
    pub duration_seconds: Option<f64>,
    pub format_name: String,
    pub streams: Vec<StreamInfo>,
}

/// Fast metadata probing via Symphonia demuxer
pub fn probe_media<P: AsRef<Path>>(path: P) -> Result<MediaMetadata, EngineError> {
    let path_ref = path.as_ref();
    let file = File::open(path_ref)?;
    let file_size = file.metadata()?.len();
    let file_name = path_ref
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let mss = MediaSourceStream::new(Box::new(file), Default::default());

    let mut hint = Hint::new();
    if let Some(ext) = path_ref.extension().and_then(|s| s.to_str()) {
        hint.with_extension(ext);
    }

    let meta_opts: MetadataOptions = Default::default();
    let fmt_opts: FormatOptions = Default::default();

    let probed = symphonia::default::get_probe().format(&hint, mss, &fmt_opts, &meta_opts)?;
    let format = probed.format;

    let mut streams = Vec::new();
    let mut duration_seconds = None;

    for (idx, stream) in format.tracks().iter().enumerate() {
        let codec_params = &stream.codec_params;
        let codec_str = format!("{:?}", codec_params.codec);

        let stream_type = match codec_params.codec {
            symphonia::core::codecs::CODEC_TYPE_NULL => StreamType::Subtitle,
            _ => StreamType::Audio,
        };

        if let Some(n_frames) = codec_params.n_frames {
            if let Some(tb) = codec_params.time_base {
                let time = tb.calc_time(n_frames);
                let dur = time.seconds as f64 + time.frac;
                if dur > 0.0 {
                    duration_seconds = Some(dur);
                }
            }
        }

        streams.push(StreamInfo {
            index: idx,
            codec: codec_str,
            stream_type,
            language: None,
            title: None,
            channels: codec_params.channels.map(|c| c.count()),
            sample_rate: codec_params.sample_rate,
        });
    }

    Ok(MediaMetadata {
        file_name,
        file_size,
        duration_seconds,
        format_name: "Container".to_string(),
        streams,
    })
}

/// Timestamped subtitle cue
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleCue {
    pub start_time: f64,
    pub end_time: f64,
    pub text: String,
}

/// Lightweight parser for SRT and WebVTT subtitle text
pub fn parse_subtitles(content: &str) -> Vec<SubtitleCue> {
    let mut cues = Vec::new();
    let lines: Vec<&str> = content.lines().map(|l| l.trim()).collect();
    let mut i = 0;

    while i < lines.len() {
        let line = lines[i];
        if line.is_empty() || line.starts_with("WEBVTT") || line.starts_with("NOTE") {
            i += 1;
            continue;
        }

        // Check if line is numeric sequence (SRT counter)
        if line.chars().all(|c| c.is_ascii_digit()) && i + 1 < lines.len() && lines[i + 1].contains("-->") {
            i += 1;
        }

        if i < lines.len() && lines[i].contains("-->") {
            let parts: Vec<&str> = lines[i].split("-->").collect();
            if parts.len() == 2 {
                if let (Some(start), Some(end)) = (parse_sub_timestamp(parts[0]), parse_sub_timestamp(parts[1])) {
                    i += 1;
                    let mut text_lines = Vec::new();
                    while i < lines.len() && !lines[i].is_empty() {
                        text_lines.push(lines[i]);
                        i += 1;
                    }
                    cues.push(SubtitleCue {
                        start_time: start,
                        end_time: end,
                        text: text_lines.join("\n"),
                    });
                }
            }
        }
        i += 1;
    }

    cues
}

fn parse_sub_timestamp(raw: &str) -> Option<f64> {
    let clean = raw.trim().split_whitespace().next()?.replace(',', ".");
    let parts: Vec<&str> = clean.split(':').collect();

    match parts.len() {
        2 => {
            let m: f64 = parts[0].parse().ok()?;
            let s: f64 = parts[1].parse().ok()?;
            Some(m * 60.0 + s)
        }
        3 => {
            let h: f64 = parts[0].parse().ok()?;
            let m: f64 = parts[1].parse().ok()?;
            let s: f64 = parts[2].parse().ok()?;
            Some(h * 3600.0 + m * 60.0 + s)
        }
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_srt() {
        let srt = "1\n00:00:01,000 --> 00:00:04,500\nHello, welcome to Valor!\n\n2\n00:00:05,200 --> 00:00:08,000\nEnjoy the movie.";
        let cues = parse_subtitles(srt);
        assert_eq!(cues.len(), 2);
        assert_eq!(cues[0].start_time, 1.0);
        assert_eq!(cues[0].end_time, 4.5);
        assert_eq!(cues[0].text, "Hello, welcome to Valor!");
    }
}
