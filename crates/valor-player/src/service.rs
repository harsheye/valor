//! Main-thread libmpv owner with an egui Glow render-context bridge.

use crate::{
    queue::{PlaybackQueue, QueueItem},
    PlaybackState, PlayerCommand, PlayerEvent, PlayerQueueEntry, PlayerSnapshot, SharedSnapshot,
};
use crossbeam_channel::{unbounded, Receiver, Sender};
use libmpv2::{events::Event, Format, Mpv};
use libmpv2_sys as mpv_sys;
use parking_lot::{Mutex, RwLock};
use std::{
    ffi::{c_void, CString},
    path::PathBuf,
    ptr::NonNull,
    sync::{Arc, OnceLock},
    time::Instant,
};

/// Owns every libmpv call on the app's UI/render thread.
pub struct PlayerService {
    core: Arc<Mutex<PlayerCore>>,
    events: Receiver<PlayerEvent>,
    snapshot: SharedSnapshot,
}

/// Cloneable bridge used only by the egui Glow paint callback.
#[derive(Clone)]
pub struct RenderBridge {
    core: Arc<Mutex<PlayerCore>>,
}

struct PlayerCore {
    mpv: Option<Mpv>,
    render_context: Option<NonNull<mpv_sys::mpv_render_context>>,
    snapshot: SharedSnapshot,
    event_tx: Sender<PlayerEvent>,
    queue: PlaybackQueue,
    active_path: Option<PathBuf>,
    token: u64,
    pending_seek_secs: f64,
    last_snapshot: Instant,
    last_tracks: Instant,
    last_picture: (i32, i32, i32, i32, i32, i32),
}

// The only cross-thread visibility is through the Glow callback wrapper. egui_glow
// invokes callbacks synchronously on the same UI/render thread that owns PlayerCore.
unsafe impl Send for PlayerCore {}

impl PlayerService {
    /// Initializes libmpv; render context creation waits until the first GL paint.
    pub fn spawn(_repaint: Option<Sender<()>>) -> Self {
        let (event_tx, events) = unbounded();
        let snapshot = Arc::new(RwLock::new(PlayerSnapshot::default()));
        let mpv = Mpv::with_initializer(|init| {
            init.set_option("vo", "libmpv")?;
            init.set_option("terminal", false)?;
            init.set_option("keep-open", "yes")?;
            let _ = init.set_option("hwdec", "auto-safe");
            let _ = init.set_option("demuxer-max-bytes", "300MiB");
            let _ = init.set_option("demuxer-max-back-bytes", "100MiB");
            let _ = init.set_option("vd-lavc-dr", "no");
            let _ = init.set_option("tone-mapping", "auto");
            let _ = init.set_option("target-prim", "auto");
            let _ = init.set_option("slang", "en,eng,English,ko,kor");
            let _ = init.set_option("sub-auto", "fuzzy");
            let _ = init.set_option("subs-fallback", "yes");
            let _ = init.set_option("subs-with-matching-audio", "yes");
            let _ = init.set_option("sub-visibility", "yes");
            let _ = init.set_option("embeddedfonts", "yes");
            let _ = init.set_option("sub-font-provider", "auto");
            Ok(())
        });
        let mpv = match mpv {
            Ok(mpv) => {
                let _ = mpv.observe_property("time-pos", Format::Double, 1);
                let _ = mpv.observe_property("duration", Format::Double, 2);
                Some(mpv)
            }
            Err(error) => {
                let _ = event_tx.send(PlayerEvent::Fatal(format!(
                    "libmpv initialization failed: {error}"
                )));
                None
            }
        };
        let core = PlayerCore {
            mpv,
            render_context: None,
            snapshot: Arc::clone(&snapshot),
            event_tx,
            queue: PlaybackQueue::default(),
            active_path: None,
            token: 0,
            pending_seek_secs: 0.0,
            last_snapshot: Instant::now(),
            last_tracks: Instant::now(),
            last_picture: (0, 0, 0, 0, 0, 0),
        };
        Self {
            core: Arc::new(Mutex::new(core)),
            events,
            snapshot,
        }
    }

    pub fn send(&self, command: PlayerCommand) -> Result<(), String> {
        self.core.lock().handle_command(command)
    }

    /// Advances libmpv's nonblocking event queue and refreshes the UI snapshot.
    pub fn pump(&self) {
        self.core.lock().pump();
    }

    pub fn events(&self) -> &Receiver<PlayerEvent> {
        &self.events
    }

    pub fn snapshot(&self) -> SharedSnapshot {
        Arc::clone(&self.snapshot)
    }

    /// Save the currently decoded video frame for the library poster cache.
    pub fn save_video_thumbnail(&self, path: &std::path::Path) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut core = self.core.lock();
        core.mpv().and_then(|mpv| {
            mpv.command("screenshot-to-file", &[&path.to_string_lossy(), "video"])
                .map_err(|error| error.to_string())
        })
    }

    pub fn render_bridge(&self) -> RenderBridge {
        RenderBridge {
            core: Arc::clone(&self.core),
        }
    }

    /// Eagerly creates the mpv GL render context if an OpenGL context is active on this thread.
    pub fn ensure_render_context(&self) -> Result<(), String> {
        self.core.lock().ensure_render_context()
    }

    pub fn shutdown(&mut self, _timeout: std::time::Duration) {
        self.core.lock().shutdown();
    }
}

impl Drop for PlayerService {
    fn drop(&mut self) {
        self.core.lock().shutdown();
    }
}

impl RenderBridge {
    /// Draws a frame into egui's currently bound framebuffer. Called from Glow paint only.
    pub fn render_frame(&self, fbo: i32, width: i32, height: i32) -> Result<(), String> {
        if width <= 0 || height <= 0 {
            return Ok(());
        }
        self.core.lock().render_frame(fbo, width, height)
    }
}

impl PlayerCore {
    fn mpv(&mut self) -> Result<&mut Mpv, String> {
        self.mpv
            .as_mut()
            .ok_or_else(|| "libmpv is unavailable".to_owned())
    }

    fn handle_command(&mut self, command: PlayerCommand) -> Result<(), String> {
        if matches!(command, PlayerCommand::Shutdown) {
            self.shutdown();
            return Ok(());
        }
        let active_token = self.snapshot.read().token;
        match command {
            PlayerCommand::Open {
                paths,
                start_index,
                start_position_secs,
                origin: _,
            } => {
                let Some(path) = paths.get(start_index).cloned() else {
                    return Err("Open request contains no playable path".into());
                };
                self.token = self.token.saturating_add(1);
                let _ = self.ensure_render_context();
                let queue_items = paths
                    .into_iter()
                    .enumerate()
                    .map(|(index, path)| {
                        let title = path
                            .file_name()
                            .map(|name| name.to_string_lossy().into_owned())
                            .unwrap_or_default();
                        QueueItem {
                            id: format!("{}:{index}", self.token),
                            fingerprint: String::new(),
                            path,
                            title,
                            duration_secs: None,
                        }
                    })
                    .collect();
                self.queue.replace(queue_items, start_index);
                if !path.is_file() {
                    self.active_path = Some(path.clone());
                    let title = path
                        .file_name()
                        .map(|name| name.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    *self.snapshot.write() = PlayerSnapshot {
                        token: self.token,
                        state: PlaybackState::Error,
                        path: Some(path.clone()),
                        title: Some(title),
                        ..PlayerSnapshot::default()
                    };
                    let _ = self.event_tx.send(PlayerEvent::LoadFailed {
                        token: self.token,
                        path,
                        reason: "File not found".into(),
                        recoverable: true,
                    });
                } else {
                    self.pending_seek_secs = start_position_secs.max(0.0);
                    let PlayerCore {
                        mpv,
                        active_path,
                        snapshot,
                        event_tx,
                        ..
                    } = self;
                    let load_result = match mpv.as_mut() {
                        Some(mpv) => load_path(
                            mpv,
                            active_path,
                            snapshot,
                            event_tx,
                            self.token,
                            path.clone(),
                        ),
                        None => Err("libmpv is unavailable".to_owned()),
                    };
                    if let Err(reason) = load_result {
                        let title = path
                            .file_name()
                            .map(|name| name.to_string_lossy().into_owned())
                            .unwrap_or_default();
                        self.active_path = Some(path.clone());
                        *self.snapshot.write() = PlayerSnapshot {
                            token: self.token,
                            state: PlaybackState::Error,
                            path: Some(path.clone()),
                            title: Some(title),
                            ..PlayerSnapshot::default()
                        };
                        let _ = self.event_tx.send(PlayerEvent::LoadFailed {
                            token: self.token,
                            path,
                            reason,
                            recoverable: true,
                        });
                    }
                }
            }
            PlayerCommand::Play { token } if token == active_token => {
                let mpv = self.mpv()?;
                mpv.set_property("pause", false).map_err(|e| e.to_string())?;
                self.snapshot.write().state = PlaybackState::Playing;
                let _ = self.event_tx.send(PlayerEvent::StateChanged {
                    token,
                    state: PlaybackState::Playing,
                });
            }
            PlayerCommand::Pause { token } if token == active_token => {
                let mpv = self.mpv()?;
                mpv.set_property("pause", true).map_err(|e| e.to_string())?;
                self.snapshot.write().state = PlaybackState::Paused;
                let _ = self.event_tx.send(PlayerEvent::StateChanged {
                    token,
                    state: PlaybackState::Paused,
                });
            }
            PlayerCommand::Toggle { token } if token == active_token => {
                let mpv = self.mpv()?;
                let is_paused = mpv.get_property::<bool>("pause").unwrap_or(false);
                let new_paused = !is_paused;
                let _ = mpv.set_property("pause", new_paused);
                let new_state = if new_paused {
                    PlaybackState::Paused
                } else {
                    PlaybackState::Playing
                };
                self.snapshot.write().state = new_state;
                let _ = self.event_tx.send(PlayerEvent::StateChanged {
                    token,
                    state: new_state,
                });
            }
            PlayerCommand::Stop { token } if token == active_token => {
                self.mpv()?
                    .command("stop", &[])
                    .map_err(|e| e.to_string())?;
                self.queue = PlaybackQueue::default();
                *self.snapshot.write() = PlayerSnapshot::default();
                self.active_path = None;
            }
            PlayerCommand::Seek {
                token,
                seconds,
                exact,
            } if token == active_token => {
                self.snapshot.write().position_secs = seconds.max(0.0);
                self.mpv()?
                    .command(
                        "seek",
                        &[
                            &seconds.to_string(),
                            if exact { "absolute+exact" } else { "absolute" },
                        ],
                    )
                    .map_err(|e| e.to_string())?;
            }
            PlayerCommand::SeekRel { token, seconds } if token == active_token => {
                {
                    let mut snap = self.snapshot.write();
                    let dur = snap.duration_secs.max(0.0);
                    let target = (snap.position_secs + seconds).max(0.0);
                    snap.position_secs = if dur > 0.0 { target.min(dur) } else { target };
                }
                self.mpv()?
                    .command("seek", &[&seconds.to_string(), "relative+exact"])
                    .map_err(|e| e.to_string())?;
            }
            PlayerCommand::FrameStep { token } if token == active_token => self
                .mpv()?
                .command("frame-step", &[])
                .map_err(|e| e.to_string())?,
            PlayerCommand::FrameBack { token } if token == active_token => self
                .mpv()?
                .command("frame-back-step", &[])
                .map_err(|e| e.to_string())?,
            PlayerCommand::SetSpeed { token, speed } if token == active_token => self
                .mpv()?
                .set_property("speed", speed.clamp(0.1, 4.0))
                .map_err(|e| e.to_string())?,
            PlayerCommand::SetVolume { token, volume } if token == active_token => self
                .mpv()?
                .set_property("volume", volume.clamp(0.0, 100.0))
                .map_err(|e| e.to_string())?,
            PlayerCommand::SetMute { token, muted } if token == active_token => self
                .mpv()?
                .set_property("mute", muted)
                .map_err(|e| e.to_string())?,
            PlayerCommand::SetAudioOnly { token, enabled } if token == active_token => self
                .mpv()?
                .set_property("vid", if enabled { "no" } else { "auto" })
                .map_err(|e| e.to_string())?,
            PlayerCommand::SelectTrack { token, id } if token == active_token => {
                let kind = self
                    .snapshot
                    .read()
                    .tracks
                    .iter()
                    .find(|track| track.id == id)
                    .map(|track| track.kind.clone())
                    .unwrap_or_default();
                let property = match kind.as_str() {
                    "audio" => "aid",
                    "sub" => "sid",
                    _ => return Ok(()),
                };
                let mpv = self.mpv()?;
                if property == "sid" {
                    let _ = mpv.set_property("sub-visibility", true);
                }
                let _ = mpv
                    .set_property(property, id as i64)
                    .or_else(|_| mpv.set_property(property, id.to_string()));
            }
            PlayerCommand::DisableSubtitles { token } if token == active_token => self
                .mpv()?
                .set_property("sid", "no")
                .map_err(|e| e.to_string())?,
            PlayerCommand::LoadSubtitle { token, path } if token == active_token => self
                .mpv()?
                .command("sub-add", &[&path.to_string_lossy(), "select"])
                .map_err(|e| e.to_string())?,
            PlayerCommand::SetZoomToFill { token, enabled } if token == active_token => {
                let panscan = if enabled { 1.0 } else { 0.0 };
                let _ = self.mpv()?.set_property("panscan", panscan);
                self.snapshot.write().zoom_to_fill = enabled;
            }
            PlayerCommand::SetHdrBoost { token, enabled } if token == active_token => {
                if let Ok(mpv) = self.mpv() {
                    if enabled {
                        let _ = mpv.set_property("tone-mapping", "bt.2446a");
                        let _ = mpv.set_property("hdr-compute-peak", "yes");
                        let _ = mpv.set_property("target-peak", 400.0_f64);
                    } else {
                        let _ = mpv.set_property("tone-mapping", "auto");
                        let _ = mpv.set_property("hdr-compute-peak", "auto");
                        let _ = mpv.set_property("target-peak", "auto");
                    }
                }
                self.snapshot.write().hdr_boost = enabled;
            }
            PlayerCommand::SetPictureControls {
                token,
                enabled,
                lighting,
                shadows,
                contrast,
                sharpness,
                vibrance,
                hdr_boost,
            } if token == active_token => {
                let next = if enabled {
                    (lighting, shadows, contrast, sharpness, vibrance, hdr_boost)
                } else {
                    (0, 0, 0, 0, 0, 0)
                };
                let prev = self.last_picture;
                if let Ok(mpv) = self.mpv() {
                    if next.0 != prev.0 {
                        let _ = mpv.set_property("brightness", next.0 as i64);
                    }
                    if next.1 != prev.1 {
                        let _ = mpv.set_property("gamma", next.1 as i64);
                    }
                    if next.2 != prev.2 {
                        let _ = mpv.set_property("contrast", next.2 as i64);
                    }
                    if next.3 != prev.3 {
                        let _ = mpv.set_property("sharpen", (next.3 as f64) / 25.0);
                    }
                    if next.4 != prev.4 {
                        let _ = mpv.set_property("saturation", next.4 as i64);
                    }
                    if (next.5 > 0) != (prev.5 > 0) {
                        if next.5 > 0 {
                            let _ = mpv.set_property("tone-mapping", "bt.2446a");
                            let _ = mpv.set_property("hdr-compute-peak", "yes");
                            let _ = mpv.set_property(
                                "target-peak",
                                200.0_f64 + (next.5 as f64) * 3.0,
                            );
                        } else {
                            let _ = mpv.set_property("tone-mapping", "auto");
                            let _ = mpv.set_property("hdr-compute-peak", "auto");
                            let _ = mpv.set_property("target-peak", "auto");
                        }
                    } else if next.5 > 0 && next.5 != prev.5 {
                        let _ = mpv.set_property(
                            "target-peak",
                            200.0_f64 + (next.5 as f64) * 3.0,
                        );
                    }
                }
                self.last_picture = next;
                self.snapshot.write().hdr_boost = next.5 > 0;
            }
            PlayerCommand::SetBoostTier { token, tier } if token == active_token => {
                let chain = crate::audio_graph::boost_chain(tier)
                    .map(|(_, chain)| chain)
                    .unwrap_or_default();
                self.mpv()?
                    .command("af", &["set", &chain])
                    .map_err(|e| e.to_string())?;
            }
            PlayerCommand::SetZoomToFill { token, enabled } if token == active_token => {
                let panscan: f64 = if enabled { 1.0 } else { 0.0 };
                let _ = self.mpv()?.set_property("panscan", panscan);
                self.snapshot.write().zoom_to_fill = enabled;
            }
            PlayerCommand::Next { token } if token == active_token => {
                let path = self.queue.advance_next();
                self.play_queue_path(path, token)?
            }
            PlayerCommand::Prev { token } if token == active_token => {
                let path = self.queue.advance_previous();
                self.play_queue_path(path, token)?
            }
            PlayerCommand::JumpTo { token, index }
            | PlayerCommand::JumpToQueue { token, index }
                if token == active_token =>
            {
                let path = self.queue.jump_to(index);
                self.play_queue_path(path, token)?
            }
            PlayerCommand::RemoveQueueItem { token, index } if token == active_token => {
                if let Some(item) = self.queue.items.get(index).cloned() {
                    let was_current = self.queue.current_id.as_deref() == Some(item.id.as_str());
                    let next_path = self.queue.remove(&item.id);
                    if was_current {
                        if let Some(path) = next_path {
                            self.play_queue_path(Some(path), token)?;
                        } else {
                            self.mpv()?
                                .command("stop", &[])
                                .map_err(|e| e.to_string())?;
                            *self.snapshot.write() = PlayerSnapshot::default();
                        }
                    }
                }
            }
            PlayerCommand::MoveQueueItem { token, from, to } if token == active_token => {
                self.queue.move_to(from, to);
            }
            PlayerCommand::Enqueue { token, paths } if token == active_token => {
                for path in paths {
                    let next_idx = self.queue.items.len();
                    let title = path
                        .file_name()
                        .map(|name| name.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    let ts = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .map(|d| d.as_micros())
                        .unwrap_or(0);
                    self.queue.enqueue(QueueItem {
                        id: format!("{token}:q:{next_idx}:{ts}"),
                        fingerprint: String::new(),
                        path,
                        title,
                        duration_secs: None,
                    });
                }
            }
            PlayerCommand::ClearQueue { token } if token == active_token => {
                self.queue.clear_upcoming();
            }
            PlayerCommand::SetShuffle { token, enabled } if token == active_token => {
                self.queue.set_shuffle(enabled)
            }
            PlayerCommand::SetRepeat { token, mode } if token == active_token => {
                self.queue.repeat = mode
            }
            PlayerCommand::Play { .. }
            | PlayerCommand::Pause { .. }
            | PlayerCommand::Toggle { .. }
            | PlayerCommand::Stop { .. }
            | PlayerCommand::Seek { .. }
            | PlayerCommand::SeekRel { .. }
            | PlayerCommand::FrameStep { .. }
            | PlayerCommand::FrameBack { .. }
            | PlayerCommand::SetSpeed { .. }
            | PlayerCommand::SetVolume { .. }
            | PlayerCommand::SetMute { .. }
            | PlayerCommand::SelectTrack { .. }
            | PlayerCommand::DisableSubtitles { .. }
            | PlayerCommand::LoadSubtitle { .. }
            | PlayerCommand::SetBoostTier { .. }
            | PlayerCommand::SetAudioOnly { .. }
            | PlayerCommand::Next { .. }
            | PlayerCommand::Prev { .. }
            | PlayerCommand::JumpTo { .. }
            | PlayerCommand::JumpToQueue { .. }
            | PlayerCommand::Enqueue { .. }
            | PlayerCommand::ClearQueue { .. }
            | PlayerCommand::RemoveQueueItem { .. }
            | PlayerCommand::MoveQueueItem { .. }
            | PlayerCommand::SetShuffle { .. }
            | PlayerCommand::SetRepeat { .. }
            | PlayerCommand::SetZoomToFill { .. }
            | PlayerCommand::SetHdrBoost { .. }
            | PlayerCommand::SetPictureControls { .. } => {}
            PlayerCommand::Shutdown => {}
        }
        self.publish_queue();
        Ok(())
    }

    fn play_queue_path(&mut self, path: Option<PathBuf>, token: u64) -> Result<(), String> {
        if let Some(path) = path {
            let _ = self.ensure_render_context();
            self.pending_seek_secs = 0.0;
            let PlayerCore {
                mpv,
                active_path,
                snapshot,
                event_tx,
                ..
            } = self;
            load_path(
                mpv.as_mut()
                    .ok_or_else(|| "libmpv is unavailable".to_owned())?,
                active_path,
                snapshot,
                event_tx,
                token,
                path,
            )?;
        } else {
            *self.snapshot.write() = PlayerSnapshot {
                state: PlaybackState::Finished,
                token,
                ..PlayerSnapshot::default()
            };
            let _ = self.event_tx.send(PlayerEvent::EndOfQueue { token });
        }
        Ok(())
    }

    fn publish_queue(&self) {
        let mut snapshot = self.snapshot.write();
        snapshot.queue = self
            .queue
            .items
            .iter()
            .map(|item| PlayerQueueEntry {
                path: item.path.clone(),
                title: item.title.clone(),
                duration_secs: item.duration_secs,
            })
            .collect();
        snapshot.queue_index = self
            .queue
            .current_id
            .as_ref()
            .and_then(|id| self.queue.items.iter().position(|item| &item.id == id))
            .unwrap_or(0);
        snapshot.shuffle = self.queue.shuffle;
        snapshot.repeat = self.queue.repeat;
    }

    fn pump(&mut self) {
        if self.mpv.is_none() {
            return;
        }
        loop {
            let event = match self.mpv.as_mut().and_then(|mpv| mpv.wait_event(0.0)) {
                Some(Ok(event)) => event,
                Some(Err(error)) => {
                    let _ = self.event_tx.send(PlayerEvent::Fatal(error.to_string()));
                    break;
                }
                None => break,
            };
            match event {
                Event::FileLoaded => {
                    if let Some(mpv) = self.mpv.as_mut() {
                        let _ = mpv.set_property("vo", "libmpv");
                        let _ = mpv.set_property("vid", "auto");
                    }
                    if self.pending_seek_secs > 0.0 {
                        if let Some(mpv) = self.mpv.as_mut() {
                            let _ = mpv.command(
                                "seek",
                                &[&self.pending_seek_secs.to_string(), "absolute+exact"],
                            );
                        }
                        self.pending_seek_secs = 0.0;
                    }
                    if let Some(mpv) = self.mpv.as_mut() {
                        if let Err(error) = mpv.set_property("pause", false) {
                            let _ = self.event_tx.send(PlayerEvent::Fatal(format!(
                                "Could not start playback: {error}"
                            )));
                        }
                    }
                    let chapters = self
                        .mpv
                        .as_ref()
                        .map(read_chapters)
                        .unwrap_or_default();
                    let mut snapshot = self.snapshot.write();
                    snapshot.state = PlaybackState::Playing;
                    snapshot.token = self.token;
                    snapshot.chapters = chapters;
                    let _ = self.event_tx.send(PlayerEvent::StateChanged {
                        token: self.token,
                        state: PlaybackState::Playing,
                    });
                }
                Event::PlaybackRestart => {
                    self.snapshot.write().state = PlaybackState::Playing;
                    let _ = self.event_tx.send(PlayerEvent::StateChanged {
                        token: self.token,
                        state: PlaybackState::Playing,
                    });
                }
                Event::EndFile(0) => {
                    if let Some(path) = self.active_path.clone() {
                        let state = self.snapshot.read().clone();
                        let _ = self.event_tx.send(PlayerEvent::EndOfItem {
                            token: self.token,
                            path,
                            position_secs: state.position_secs,
                            duration_secs: state.duration_secs,
                        });
                    }
                    let next = self.queue.advance_next();
                    let _ = self.play_queue_path(next, self.token);
                    self.publish_queue();
                }
                Event::EndFile(_) => {}
                Event::StartFile => self.snapshot.write().state = PlaybackState::Loading,
                _ => {}
            }
        }
        if self.last_snapshot.elapsed().as_millis() >= 34 {
            if let Some(mpv) = self.mpv.as_mut() {
                if let Ok(value) = mpv.get_property::<f64>("time-pos") {
                    self.snapshot.write().position_secs = value;
                }
                if let Ok(value) = mpv.get_property::<f64>("duration") {
                    self.snapshot.write().duration_secs = value;
                }
                if let Ok(gamma) = mpv.get_property::<String>("video-params/gamma") {
                    let is_hdr = matches!(gamma.as_str(), "pq" | "hlg" | "st2084" | "arib-std-b67");
                    self.snapshot.write().is_hdr = is_hdr;
                }
                if let Ok(value) = mpv.get_property::<f64>("volume") {
                    self.snapshot.write().volume = value;
                }
                if let Ok(value) = mpv.get_property::<f64>("speed") {
                    self.snapshot.write().speed = value;
                }
                if let Ok(value) = mpv.get_property::<bool>("mute") {
                    self.snapshot.write().muted = value;
                }
                if let Ok(paused) = mpv.get_property::<bool>("pause") {
                    let mut snap = self.snapshot.write();
                    if snap.state == PlaybackState::Playing && paused {
                        snap.state = PlaybackState::Paused;
                    } else if snap.state == PlaybackState::Paused && !paused {
                        snap.state = PlaybackState::Playing;
                    }
                }
                if self.last_tracks.elapsed().as_millis() >= 250 {
                    let mut tracks = read_tracks(mpv);
                    let sub_tracks: Vec<_> = tracks.iter().filter(|t| t.kind == "sub").cloned().collect();
                    if !sub_tracks.is_empty() && !sub_tracks.iter().any(|t| t.selected) {
                        // Auto-select preferred subtitle (English / default or first available)
                        let pick = sub_tracks
                            .iter()
                            .find(|t| {
                                t.is_default
                                    || t.language.as_deref().is_some_and(|l| {
                                        let lower = l.to_lowercase();
                                        lower.contains("en") || lower.contains("eng")
                                    })
                            })
                            .or_else(|| sub_tracks.first())
                            .map(|t| t.id);
                        if let Some(target_id) = pick {
                            let _ = mpv.set_property("sid", target_id.to_string());
                            for t in &mut tracks {
                                if t.kind == "sub" {
                                    t.selected = t.id == target_id;
                                }
                            }
                        }
                    }
                    self.snapshot.write().tracks = tracks;
                    self.last_tracks = Instant::now();
                }
            }
            let state = self.snapshot.read().clone();
            let _ = self.event_tx.send(PlayerEvent::Position {
                token: state.token,
                position_secs: state.position_secs,
                duration_secs: state.duration_secs,
            });
            self.last_snapshot = Instant::now();
        }
    }

    fn ensure_render_context(&mut self) -> Result<(), String> {
        if self.render_context.is_some() {
            return Ok(());
        }
        let mpv = self
            .mpv
            .as_ref()
            .ok_or_else(|| "libmpv is unavailable".to_owned())?;
        let api_type = mpv_sys::MPV_RENDER_API_TYPE_OPENGL.as_ptr() as *mut c_void;
        let mut init_params = mpv_sys::mpv_opengl_init_params {
            get_proc_address: Some(mpv_get_gl_proc),
            get_proc_address_ctx: std::ptr::null_mut(),
        };
        let mut advanced_control: std::os::raw::c_int = 1;
        let mut params = [
            mpv_sys::mpv_render_param {
                type_: mpv_sys::mpv_render_param_type_MPV_RENDER_PARAM_API_TYPE,
                data: api_type,
            },
            mpv_sys::mpv_render_param {
                type_: mpv_sys::mpv_render_param_type_MPV_RENDER_PARAM_OPENGL_INIT_PARAMS,
                data: (&mut init_params as *mut mpv_sys::mpv_opengl_init_params).cast(),
            },
            mpv_sys::mpv_render_param {
                type_: mpv_sys::mpv_render_param_type_MPV_RENDER_PARAM_ADVANCED_CONTROL,
                data: (&mut advanced_control as *mut std::os::raw::c_int).cast(),
            },
            mpv_sys::mpv_render_param {
                type_: 0,
                data: std::ptr::null_mut(),
            },
        ];
        let mut context = std::ptr::null_mut();
        let result = unsafe {
            mpv_sys::mpv_render_context_create(
                &mut context,
                mpv.ctx.as_ptr(),
                params.as_mut_ptr(),
            )
        };
        if result < 0 {
            return Err(format!(
                "Could not initialize video render context (mpv error {result})"
            ));
        }
        unsafe {
            mpv_sys::mpv_render_context_set_update_callback(
                context,
                Some(on_mpv_update),
                std::ptr::null_mut(),
            );
        }
        let _ = mpv.set_property("vo", "libmpv");
        let _ = mpv.set_property("vid", "auto");
        let _ = mpv.set_property("hr-seek", "yes");
        let _ = mpv.set_property("hr-seek-framedrop", "yes");
        let _ = mpv.set_property("cache", "yes");
        let _ = mpv.set_property("demuxer-max-bytes", "150MiB");
        let _ = mpv.set_property("demuxer-max-back-bytes", "75MiB");
        self.render_context = NonNull::new(context);
        Ok(())
    }

    fn render_frame(&mut self, fbo: i32, width: i32, height: i32) -> Result<(), String> {
        if self.mpv.is_none() {
            return Ok(());
        }
        self.ensure_render_context()?;
        let context = self
            .render_context
            .as_ref()
            .ok_or_else(|| "video render context unavailable".to_owned())?;
        unsafe {
            mpv_sys::mpv_render_context_update(context.as_ptr());
        }
        let mut target = mpv_sys::mpv_opengl_fbo {
            fbo,
            w: width,
            h: height,
            internal_format: 0,
        };
        let mut flip_y = 1;
        let mut params = [
            mpv_sys::mpv_render_param {
                type_: mpv_sys::mpv_render_param_type_MPV_RENDER_PARAM_OPENGL_FBO,
                data: (&mut target as *mut mpv_sys::mpv_opengl_fbo).cast(),
            },
            mpv_sys::mpv_render_param {
                type_: mpv_sys::mpv_render_param_type_MPV_RENDER_PARAM_FLIP_Y,
                data: (&mut flip_y as *mut i32).cast(),
            },
            mpv_sys::mpv_render_param {
                type_: 0,
                data: std::ptr::null_mut(),
            },
        ];
        let result =
            unsafe { mpv_sys::mpv_render_context_render(context.as_ptr(), params.as_mut_ptr()) };
        if result < 0 {
            return Err(format!("Video frame render failed (mpv error {result})"));
        }
        unsafe { mpv_sys::mpv_render_context_report_swap(context.as_ptr()) };
        Ok(())
    }

    fn shutdown(&mut self) {
        if let Some(context) = self.render_context.take() {
            unsafe { mpv_sys::mpv_render_context_free(context.as_ptr()) };
        }
        if let Some(mpv) = self.mpv.take() {
            let _ = mpv.command("quit", &[]);
        }
        self.snapshot.write().state = PlaybackState::Idle;
    }
}

fn read_tracks(mpv: &Mpv) -> Vec<crate::PlayerTrack> {
    let Ok(name) = CString::new("track-list") else {
        return Vec::new();
    };
    let mut node: mpv_sys::mpv_node = unsafe { std::mem::zeroed() };
    let result = unsafe {
        mpv_sys::mpv_get_property(
            mpv.ctx.as_ptr(),
            name.as_ptr(),
            mpv_sys::mpv_format_MPV_FORMAT_NODE,
            &mut node as *mut _ as *mut c_void,
        )
    };
    if result < 0 {
        return Vec::new();
    }
    let tracks = if node.format == mpv_sys::mpv_format_MPV_FORMAT_NODE_ARRAY {
        unsafe {
            let list = node.u.list;
            if list.is_null() || (*list).num <= 0 || (*list).num > 4096 {
                Vec::new()
            } else {
                (0..(*list).num as usize)
                    .filter_map(|index| {
                        let item = &*(*list).values.add(index);
                        if item.format != mpv_sys::mpv_format_MPV_FORMAT_NODE_MAP {
                            return None;
                        }
                        let fields = (*item.u.list).num;
                        if fields <= 0 || fields > 128 {
                            return None;
                        }
                        let mut track = crate::PlayerTrack::default();
                        for field in 0..fields as usize {
                            let key = *(*item.u.list).keys.add(field);
                            if key.is_null() {
                                continue;
                            }
                            let key = std::ffi::CStr::from_ptr(key).to_string_lossy();
                            let value = &*(*item.u.list).values.add(field);
                            match key.as_ref() {
                                "id" if value.format == mpv_sys::mpv_format_MPV_FORMAT_INT64 => {
                                    track.id = value.u.int64
                                }
                                "type" => track.kind = node_string(value).unwrap_or_default(),
                                "title" => track.title = node_string(value),
                                "lang" => track.language = node_string(value),
                                "codec" => track.codec = node_string(value),
                                "demux-channel-count" => track.channels = node_string(value),
                                "selected"
                                    if value.format == mpv_sys::mpv_format_MPV_FORMAT_FLAG =>
                                {
                                    track.selected = value.u.flag != 0
                                }
                                "default"
                                    if value.format == mpv_sys::mpv_format_MPV_FORMAT_FLAG =>
                                {
                                    track.is_default = value.u.flag != 0
                                }
                                "external"
                                    if value.format == mpv_sys::mpv_format_MPV_FORMAT_FLAG =>
                                {
                                    track.external = value.u.flag != 0
                                }
                                _ => {}
                            }
                        }
                        matches!(track.kind.as_str(), "audio" | "sub").then_some(track)
                    })
                    .collect()
            }
        }
    } else {
        Vec::new()
    };
    unsafe {
        mpv_sys::mpv_free_node_contents(&mut node);
    }
    tracks
}

fn read_chapters(mpv: &Mpv) -> Vec<crate::PlayerChapter> {
    let Ok(name) = CString::new("chapter-list") else {
        return Vec::new();
    };
    let mut node: mpv_sys::mpv_node = unsafe { std::mem::zeroed() };
    let result = unsafe {
        mpv_sys::mpv_get_property(
            mpv.ctx.as_ptr(),
            name.as_ptr(),
            mpv_sys::mpv_format_MPV_FORMAT_NODE,
            &mut node as *mut _ as *mut c_void,
        )
    };
    if result < 0 {
        return Vec::new();
    }
    let chapters = if node.format == mpv_sys::mpv_format_MPV_FORMAT_NODE_ARRAY {
        unsafe {
            let list = node.u.list;
            if list.is_null() || (*list).num <= 0 || (*list).num > 1024 {
                Vec::new()
            } else {
                (0..(*list).num as usize)
                    .filter_map(|index| {
                        let item = &*(*list).values.add(index);
                        if item.format != mpv_sys::mpv_format_MPV_FORMAT_NODE_MAP {
                            return None;
                        }
                        let fields = (*item.u.list).num;
                        if fields <= 0 || fields > 64 {
                            return None;
                        }
                        let mut title = String::new();
                        let mut start_secs = None;
                        for field in 0..fields as usize {
                            let key = *(*item.u.list).keys.add(field);
                            if key.is_null() {
                                continue;
                            }
                            let key = std::ffi::CStr::from_ptr(key).to_string_lossy();
                            let value = &*(*item.u.list).values.add(field);
                            match key.as_ref() {
                                "title" => {
                                    if let Some(t) = node_string(value) {
                                        title = t;
                                    }
                                }
                                "time" => {
                                    if value.format == mpv_sys::mpv_format_MPV_FORMAT_DOUBLE {
                                        start_secs = Some(value.u.double_);
                                    } else if value.format == mpv_sys::mpv_format_MPV_FORMAT_INT64 {
                                        start_secs = Some(value.u.int64 as f64);
                                    }
                                }
                                _ => {}
                            }
                        }
                        let start = start_secs?;
                        if title.trim().is_empty() {
                            title = format!("Chapter {}", index + 1);
                        }
                        Some(crate::PlayerChapter {
                            title,
                            start_secs: start,
                        })
                    })
                    .collect()
            }
        }
    } else {
        Vec::new()
    };
    unsafe {
        mpv_sys::mpv_free_node_contents(&mut node);
    }
    chapters
}

unsafe fn node_string(node: &mpv_sys::mpv_node) -> Option<String> {
    if node.format != mpv_sys::mpv_format_MPV_FORMAT_STRING || node.u.string.is_null() {
        return None;
    }
    Some(
        std::ffi::CStr::from_ptr(node.u.string)
            .to_string_lossy()
            .into_owned(),
    )
}

unsafe extern "C" fn on_mpv_update(_context: *mut c_void) {}

unsafe extern "C" fn mpv_get_gl_proc(
    _context: *mut c_void,
    name: *const std::os::raw::c_char,
) -> *mut c_void {
    if name.is_null() {
        return std::ptr::null_mut();
    }
    #[cfg(windows)]
    {
        use std::os::raw::c_char;
        #[link(name = "opengl32")]
        unsafe extern "system" {
            fn wglGetProcAddress(name: *const c_char) -> *mut c_void;
        }
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn GetModuleHandleA(name: *const c_char) -> *mut c_void;
            fn GetProcAddress(module: *mut c_void, name: *const c_char) -> *mut c_void;
        }

        let address = unsafe { wglGetProcAddress(name) };
        let addr_val = address as usize;
        if addr_val > 3 && (address as isize) != -1 {
            return address;
        }

        static OPENGL: OnceLock<usize> = OnceLock::new();
        let module = *OPENGL.get_or_init(|| unsafe {
            GetModuleHandleA(c"opengl32.dll".as_ptr()) as usize
        });
        if module != 0 {
            let address = unsafe { GetProcAddress(module as *mut c_void, name) };
            if !address.is_null() {
                return address;
            }
        }
        return std::ptr::null_mut();
    }
    #[cfg(unix)]
    {
        let Ok(name_str) = (unsafe { std::ffi::CStr::from_ptr(name) }).to_str() else {
            return std::ptr::null_mut();
        };
        native_gl_proc(&(), name_str)
    }
}

impl Drop for PlayerCore {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn load_path(
    mpv: &mut Mpv,
    active_path: &mut Option<PathBuf>,
    snapshot: &SharedSnapshot,
    events: &Sender<PlayerEvent>,
    token: u64,
    path: PathBuf,
) -> Result<(), String> {
    let title = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_default();
    *active_path = Some(path.clone());
    let _ = mpv.set_property("vo", "libmpv");
    let _ = mpv.set_property("vid", "auto");
    let _ = mpv.set_property("sub-auto", "fuzzy");
    let _ = mpv.set_property("sub-visibility", true);
    let _ = mpv.set_property("sid", "auto");
    mpv.command("loadfile", &[&path.to_string_lossy(), "replace"])
        .map_err(|error| error.to_string())?;
    let mut state = snapshot.write();
    state.token = token;
    state.state = PlaybackState::Loading;
    state.path = Some(path.clone());
    state.title = Some(title.clone());
    state.position_secs = 0.0;
    state.duration_secs = 0.0;
    let _ = events.send(PlayerEvent::StateChanged {
        token,
        state: PlaybackState::Loading,
    });
    let _ = events.send(PlayerEvent::ItemChanged { token, path, title });
    Ok(())
}

#[cfg(windows)]
#[allow(dead_code)]
fn native_gl_proc(_: &(), _name: &str) -> *mut c_void {
    std::ptr::null_mut()
}

#[cfg(unix)]
fn native_gl_proc(_: &(), name: &str) -> *mut c_void {
    let Ok(name) = CString::new(name) else {
        return std::ptr::null_mut();
    };
    #[cfg(target_os = "linux")]
    {
        type GlxGetProc = unsafe extern "C" fn(*const u8) -> *mut c_void;
        static GL: OnceLock<usize> = OnceLock::new();
        let module = *GL.get_or_init(|| unsafe {
            libc::dlopen(b"libGL.so.1\0".as_ptr().cast(), libc::RTLD_NOW) as usize
        });
        if module == 0 {
            return std::ptr::null_mut();
        }
        let glx = unsafe {
            libc::dlsym(
                module as *mut c_void,
                b"glXGetProcAddressARB\0".as_ptr().cast(),
            )
        };
        if !glx.is_null() {
            let get_proc: GlxGetProc = unsafe { std::mem::transmute(glx) };
            let result = unsafe { get_proc(name.as_bytes_with_nul().as_ptr()) };
            if !result.is_null() {
                return result;
            }
        }
        unsafe { libc::dlsym(module as *mut c_void, name.as_ptr()) }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = name.as_bytes();
        std::ptr::null_mut()
    }
}

#[cfg(not(any(windows, unix)))]
fn native_gl_proc(_: &(), _: &str) -> *mut c_void {
    std::ptr::null_mut()
}
