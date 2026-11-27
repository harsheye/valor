//! Provides DB-free queue traversal and mutation for playback items.

use serde::{Deserialize, Serialize};
use std::path::PathBuf;

/// Represents one playable item in a queue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct QueueItem {
    pub id: String,
    pub fingerprint: String,
    pub path: PathBuf,
    pub title: String,
    pub duration_secs: Option<u64>,
}

/// Selects how the queue advances at its end.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub enum RepeatMode {
    #[default]
    Off,
    One,
    All,
}

/// Stores queue entries and the stable current item identity.
#[derive(Debug, Clone, Default)]
pub struct PlaybackQueue {
    pub items: Vec<QueueItem>,
    pub current_id: Option<String>,
    pub repeat: RepeatMode,
    pub shuffle: bool,
    pub shuffle_order: Vec<usize>,
    cursor: usize,
}

impl PlaybackQueue {
    /// Replaces queue entries and selects the requested starting position.
    pub fn replace(&mut self, items: Vec<QueueItem>, start_index: usize) {
        self.items = items;
        self.shuffle_order = (0..self.items.len()).collect();
        self.cursor = start_index.min(self.items.len().saturating_sub(1));
        self.current_id = self.items.get(self.cursor).map(|item| item.id.clone());
    }

    /// Returns the active queue item, if one is selected.
    pub fn current(&self) -> Option<&QueueItem> {
        self.current_id
            .as_ref()
            .and_then(|id| self.items.iter().find(|item| &item.id == id))
    }

    /// Advances to the next item and returns its path.
    pub fn advance_next(&mut self) -> Option<PathBuf> {
        if self.items.is_empty() {
            return None;
        }
        if self.repeat == RepeatMode::One {
            return self.current().map(|item| item.path.clone());
        }
        let next = self.cursor.saturating_add(1);
        if next >= self.items.len() {
            if self.repeat != RepeatMode::All {
                return None;
            }
            self.cursor = 0;
        } else {
            self.cursor = next;
        }
        self.set_current_from_cursor();
        self.current().map(|item| item.path.clone())
    }

    /// Moves to the previous item, wrapping only when repeat-all is active.
    pub fn advance_previous(&mut self) -> Option<PathBuf> {
        if self.items.is_empty() {
            return None;
        }
        if self.cursor == 0 {
            if self.repeat != RepeatMode::All {
                return None;
            }
            self.cursor = self.items.len() - 1;
        } else {
            self.cursor -= 1;
        }
        self.set_current_from_cursor();
        self.current().map(|item| item.path.clone())
    }

    /// Selects an item by its current display index.
    pub fn jump_to(&mut self, index: usize) -> Option<PathBuf> {
        if index >= self.items.len() {
            return None;
        }
        self.cursor = self
            .shuffle_order
            .iter()
            .position(|entry| *entry == index)
            .unwrap_or(index);
        self.set_current_from_cursor();
        self.current().map(|item| item.path.clone())
    }

    pub fn move_to(&mut self, from: usize, to: usize) -> bool {
        if from >= self.items.len() || to >= self.items.len() || from == to {
            return false;
        }
        let item = self.items.remove(from);
        self.items.insert(to, item);
        self.shuffle_order = (0..self.items.len()).collect();
        self.cursor = self
            .current_id
            .as_ref()
            .and_then(|current| self.items.iter().position(|entry| &entry.id == current))
            .unwrap_or(0);
        true
    }

    pub fn set_shuffle(&mut self, enabled: bool) {
        if self.shuffle == enabled {
            return;
        }
        self.shuffle = enabled;
        if enabled && self.items.len() > 2 {
            let current = self
                .current_id
                .as_ref()
                .and_then(|id| self.items.iter().position(|item| &item.id == id));
            let mut seed = self.items.len() as u64 ^ 0x9E37_79B9;
            for index in (1..self.shuffle_order.len()).rev() {
                seed ^= seed << 13;
                seed ^= seed >> 7;
                seed ^= seed << 17;
                self.shuffle_order
                    .swap(index, (seed as usize) % (index + 1));
            }
            if let Some(current) = current {
                self.shuffle_order.retain(|index| *index != current);
                self.shuffle_order.insert(0, current);
            }
            self.cursor = 0;
        } else {
            self.shuffle_order = (0..self.items.len()).collect();
            self.cursor = self
                .current_id
                .as_ref()
                .and_then(|id| self.items.iter().position(|item| &item.id == id))
                .unwrap_or(0);
        }
    }

    /// Appends an item to the end of the queue without interrupting playback.
    pub fn enqueue(&mut self, item: QueueItem) {
        let new_index = self.items.len();
        let was_empty = self.items.is_empty();
        self.items.push(item);
        self.shuffle_order.push(new_index);
        if was_empty {
            self.cursor = 0;
            self.set_current_from_cursor();
        }
    }

    /// Removes all items except the currently playing one.
    pub fn clear_upcoming(&mut self) {
        if let Some(current) = self.current().cloned() {
            self.items = vec![current];
            self.shuffle_order = vec![0];
            self.cursor = 0;
        } else {
            self.items.clear();
            self.shuffle_order.clear();
            self.cursor = 0;
            self.current_id = None;
        }
    }

    /// Inserts an item immediately after the active queue item.
    pub fn queue_next(&mut self, item: QueueItem) {
        let index = self
            .current_id
            .as_ref()
            .and_then(|id| self.items.iter().position(|entry| &entry.id == id))
            .map_or(0, |i| i + 1);
        self.items.insert(index, item);
        self.shuffle_order = (0..self.items.len()).collect();
    }

    /// Removes an item while preserving the selected identity when possible.
    pub fn remove(&mut self, id: &str) -> Option<PathBuf> {
        let index = self.items.iter().position(|item| item.id == id)?;
        let was_current = self.current_id.as_deref() == Some(id);
        self.items.remove(index);
        self.shuffle_order.retain(|entry| *entry != index);
        for entry in &mut self.shuffle_order {
            if *entry > index {
                *entry -= 1;
            }
        }
        if was_current {
            self.cursor = index.min(self.items.len().saturating_sub(1));
            self.set_current_from_cursor();
            return self.current().map(|item| item.path.clone());
        }
        self.cursor = self
            .current_id
            .as_ref()
            .and_then(|current| {
                self.shuffle_order
                    .iter()
                    .position(|entry| self.items.get(*entry).is_some_and(|i| &i.id == current))
            })
            .unwrap_or(0);
        None
    }

    fn set_current_from_cursor(&mut self) {
        self.current_id = self
            .shuffle_order
            .get(self.cursor)
            .and_then(|index| self.items.get(*index))
            .map(|item| item.id.clone());
    }
}
