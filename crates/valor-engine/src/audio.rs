use std::fs::File;
use std::path::{Path, PathBuf};
use std::sync::mpsc::{channel, Sender};
use std::thread;
use rodio::{Decoder, OutputStream, Sink};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AudioError {
    #[error("Audio thread channel closed")]
    ChannelClosed,
    #[error("I/O error: {0}")]
    Io(#[from] std::io::Error),
}

enum AudioCommand {
    Play(PathBuf),
    Pause,
    Resume,
    SetVolume(f32),
    SetSpeed(f32),
    Stop,
}

#[derive(Clone)]
pub struct AudioEngine {
    tx: Sender<AudioCommand>,
}

impl AudioEngine {
    pub fn new() -> Result<Self, AudioError> {
        let (tx, rx) = channel::<AudioCommand>();

        thread::Builder::new()
            .name("valor-audio-thread".to_string())
            .spawn(move || {
                let stream_res = OutputStream::try_default();
                if let Err(e) = stream_res {
                    tracing::error!("Failed to initialize default audio output stream: {}", e);
                    return;
                }
                let (_stream, stream_handle) = stream_res.unwrap();
                let mut current_sink: Option<Sink> = None;

                while let Ok(cmd) = rx.recv() {
                    match cmd {
                        AudioCommand::Play(path) => {
                            if let Some(ref sink) = current_sink {
                                sink.stop();
                            }
                            match File::open(&path) {
                                Ok(file) => match Decoder::new(file) {
                                    Ok(source) => match Sink::try_new(&stream_handle) {
                                        Ok(new_sink) => {
                                            new_sink.append(source);
                                            new_sink.play();
                                            current_sink = Some(new_sink);
                                            tracing::info!("Audio playback started for: {:?}", path);
                                        }
                                        Err(e) => tracing::error!("Failed to create sink: {}", e),
                                    },
                                    Err(e) => tracing::error!("Decoder error: {}", e),
                                },
                                Err(e) => tracing::error!("Failed to open audio file {:?}: {}", path, e),
                            }
                        }
                        AudioCommand::Pause => {
                            if let Some(ref sink) = current_sink {
                                sink.pause();
                            }
                        }
                        AudioCommand::Resume => {
                            if let Some(ref sink) = current_sink {
                                sink.play();
                            }
                        }
                        AudioCommand::SetVolume(vol) => {
                            if let Some(ref sink) = current_sink {
                                sink.set_volume(vol.clamp(0.0, 3.0));
                            }
                        }
                        AudioCommand::SetSpeed(spd) => {
                            if let Some(ref sink) = current_sink {
                                sink.set_speed(spd.clamp(0.25, 4.0));
                            }
                        }
                        AudioCommand::Stop => {
                            if let Some(ref sink) = current_sink {
                                sink.stop();
                            }
                            current_sink = None;
                        }
                    }
                }
            })
            .map_err(|e| AudioError::Io(e))?;

        Ok(Self { tx })
    }

    pub fn play_file<P: AsRef<Path>>(&self, path: P) -> Result<(), AudioError> {
        self.tx
            .send(AudioCommand::Play(path.as_ref().to_path_buf()))
            .map_err(|_| AudioError::ChannelClosed)
    }

    pub fn pause(&self) {
        let _ = self.tx.send(AudioCommand::Pause);
    }

    pub fn resume(&self) {
        let _ = self.tx.send(AudioCommand::Resume);
    }

    pub fn set_volume(&self, volume: f32) {
        let _ = self.tx.send(AudioCommand::SetVolume(volume));
    }

    pub fn set_speed(&self, speed: f32) {
        let _ = self.tx.send(AudioCommand::SetSpeed(speed));
    }

    pub fn stop(&self) {
        let _ = self.tx.send(AudioCommand::Stop);
    }
}
