use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
pub enum RepeatMode {
    #[default]
    Off,
    One,
    All,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CollectionItem {
    pub id: String,
    pub path: String,
    pub title: String,
    pub duration_secs: f64,
    pub fingerprint: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlaylistCollection {
    pub id: String,
    pub name: String,
    pub items: Vec<CollectionItem>,
    pub current_index: usize,
    pub repeat_mode: RepeatMode,
    pub is_shuffled: bool,
    pub shuffled_order: Vec<usize>,
    pub shuffle_cursor: usize,
}

impl Default for PlaylistCollection {
    fn default() -> Self {
        Self::new("Default Playlist")
    }
}

impl PlaylistCollection {
    pub fn new(name: &str) -> Self {
        Self {
            id: format!("coll_{}", fast_rand()),
            name: name.to_string(),
            items: Vec::new(),
            current_index: 0,
            repeat_mode: RepeatMode::Off,
            is_shuffled: false,
            shuffled_order: Vec::new(),
            shuffle_cursor: 0,
        }
    }

    pub fn single_file(path: &str, title: &str, fingerprint: &str) -> Self {
        let mut coll = Self::new(title);
        coll.items.push(CollectionItem {
            id: format!("item_{}", fast_rand()),
            path: path.to_string(),
            title: title.to_string(),
            duration_secs: 0.0,
            fingerprint: fingerprint.to_string(),
        });
        coll
    }

    pub fn current_item(&self) -> Option<&CollectionItem> {
        self.items.get(self.current_index)
    }

    pub fn len(&self) -> usize {
        self.items.len()
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    pub fn enqueue(&mut self, item: CollectionItem) {
        self.items.push(item);
        if self.is_shuffled {
            self.recompute_shuffle();
        }
    }

    pub fn remove(&mut self, index: usize) -> Option<CollectionItem> {
        if index < self.items.len() {
            let removed = self.items.remove(index);
            if self.is_shuffled {
                self.recompute_shuffle();
            }
            if self.current_index >= self.items.len() && !self.items.is_empty() {
                self.current_index = self.items.len() - 1;
            }
            Some(removed)
        } else {
            None
        }
    }

    pub fn natural_sort(&mut self) {
        let current_path = self.current_item().map(|i| i.path.clone());
        self.items.sort_by(|a, b| natural_cmp(&a.title, &b.title));
        if let Some(path) = current_path {
            if let Some(new_idx) = self.items.iter().position(|i| i.path == path) {
                self.current_index = new_idx;
            }
        }
        if self.is_shuffled {
            self.recompute_shuffle();
        }
    }

    pub fn set_shuffle(&mut self, shuffle: bool) {
        self.is_shuffled = shuffle;
        if shuffle {
            self.recompute_shuffle();
        } else {
            self.shuffled_order.clear();
            self.shuffle_cursor = 0;
        }
    }

    pub fn set_repeat(&mut self, mode: RepeatMode) {
        self.repeat_mode = mode;
    }

    pub fn next_index(&mut self) -> Option<usize> {
        if self.items.is_empty() {
            return None;
        }

        if self.repeat_mode == RepeatMode::One {
            return Some(self.current_index);
        }

        if self.is_shuffled && !self.shuffled_order.is_empty() {
            if self.shuffle_cursor + 1 < self.shuffled_order.len() {
                self.shuffle_cursor += 1;
                let next_idx = self.shuffled_order[self.shuffle_cursor];
                self.current_index = next_idx;
                return Some(next_idx);
            } else if self.repeat_mode == RepeatMode::All {
                self.recompute_shuffle();
                self.shuffle_cursor = 0;
                let next_idx = self.shuffled_order[0];
                self.current_index = next_idx;
                return Some(next_idx);
            } else {
                return None; // End of shuffled playlist
            }
        }

        if self.current_index + 1 < self.items.len() {
            self.current_index += 1;
            Some(self.current_index)
        } else if self.repeat_mode == RepeatMode::All {
            self.current_index = 0;
            Some(0)
        } else {
            None // End of playlist
        }
    }

    pub fn prev_index(&mut self) -> Option<usize> {
        if self.items.is_empty() {
            return None;
        }

        if self.repeat_mode == RepeatMode::One {
            return Some(self.current_index);
        }

        if self.is_shuffled && !self.shuffled_order.is_empty() {
            if self.shuffle_cursor > 0 {
                self.shuffle_cursor -= 1;
                let prev_idx = self.shuffled_order[self.shuffle_cursor];
                self.current_index = prev_idx;
                return Some(prev_idx);
            } else {
                // Return same first item in shuffle history
                return Some(self.shuffled_order[0]);
            }
        }

        if self.current_index > 0 {
            self.current_index -= 1;
            Some(self.current_index)
        } else if self.repeat_mode == RepeatMode::All {
            self.current_index = self.items.len() - 1;
            Some(self.current_index)
        } else {
            Some(0)
        }
    }

    fn recompute_shuffle(&mut self) {
        let count = self.items.len();
        if count == 0 {
            self.shuffled_order.clear();
            self.shuffle_cursor = 0;
            return;
        }

        let mut indices: Vec<usize> = (0..count).collect();
        // Fisher-Yates shuffle
        for i in (1..count).rev() {
            let j = (fast_rand() as usize) % (i + 1);
            indices.swap(i, j);
        }

        // Put current item first so playback flow is continuous
        if let Some(pos) = indices.iter().position(|&idx| idx == self.current_index) {
            indices.swap(0, pos);
        }

        self.shuffled_order = indices;
        self.shuffle_cursor = 0;
    }
}

pub fn natural_cmp(a: &str, b: &str) -> std::cmp::Ordering {
    let mut a_chars = a.chars().peekable();
    let mut b_chars = b.chars().peekable();

    while let (Some(&ac), Some(&bc)) = (a_chars.peek(), b_chars.peek()) {
        if ac.is_ascii_digit() && bc.is_ascii_digit() {
            let mut a_num = 0u64;
            while let Some(&d) = a_chars.peek() {
                if let Some(digit) = d.to_digit(10) {
                    a_num = a_num.saturating_mul(10).saturating_add(digit as u64);
                    a_chars.next();
                } else {
                    break;
                }
            }

            let mut b_num = 0u64;
            while let Some(&d) = b_chars.peek() {
                if let Some(digit) = d.to_digit(10) {
                    b_num = b_num.saturating_mul(10).saturating_add(digit as u64);
                    b_chars.next();
                } else {
                    break;
                }
            }

            match a_num.cmp(&b_num) {
                std::cmp::Ordering::Equal => continue,
                other => return other,
            }
        } else {
            let ac_lower = ac.to_ascii_lowercase();
            let bc_lower = bc.to_ascii_lowercase();
            match ac_lower.cmp(&bc_lower) {
                std::cmp::Ordering::Equal => {
                    a_chars.next();
                    b_chars.next();
                }
                other => return other,
            }
        }
    }

    a.len().cmp(&b.len())
}

static RAND_SEED: std::sync::atomic::AtomicU64 =
    std::sync::atomic::AtomicU64::new(0x123456789abcdef0);

fn fast_rand() -> u64 {
    use std::sync::atomic::Ordering;
    let mut current = RAND_SEED.load(Ordering::Relaxed);
    loop {
        // xorshift64
        let mut x = current ^ (current << 13);
        x ^= x >> 7;
        x ^= x << 17;
        if RAND_SEED
            .compare_exchange_weak(current, x, Ordering::Relaxed, Ordering::Relaxed)
            .is_ok()
        {
            return x;
        }
        current = RAND_SEED.load(Ordering::Relaxed);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_natural_sort() {
        let mut coll = PlaylistCollection::new("Test");
        let titles = ["Episode 10", "Episode 1", "Episode 2", "Episode 20"];
        for t in titles {
            coll.enqueue(CollectionItem {
                id: t.to_string(),
                path: t.to_string(),
                title: t.to_string(),
                duration_secs: 100.0,
                fingerprint: t.to_string(),
            });
        }
        coll.natural_sort();
        let sorted: Vec<_> = coll.items.iter().map(|i| i.title.as_str()).collect();
        assert_eq!(
            sorted,
            vec!["Episode 1", "Episode 2", "Episode 10", "Episode 20"]
        );
    }

    #[test]
    fn test_shuffle_retracing() {
        let mut coll = PlaylistCollection::new("Test");
        for i in 1..=5 {
            coll.enqueue(CollectionItem {
                id: format!("{}", i),
                path: format!("{}", i),
                title: format!("Item {}", i),
                duration_secs: 100.0,
                fingerprint: format!("{}", i),
            });
        }
        coll.set_shuffle(true);
        assert_eq!(coll.shuffled_order.len(), 5);

        // Next forward through shuffle
        let first = coll.shuffled_order[0];
        let second = coll.next_index().unwrap();
        let _third = coll.next_index().unwrap();

        // Prev backward retraces exact shuffle path
        let prev_second = coll.prev_index().unwrap();
        assert_eq!(prev_second, second);
        let prev_first = coll.prev_index().unwrap();
        assert_eq!(prev_first, first);
    }

    #[test]
    fn test_repeat_modes() {
        let mut coll = PlaylistCollection::new("Test");
        for i in 1..=3 {
            coll.enqueue(CollectionItem {
                id: format!("{}", i),
                path: format!("{}", i),
                title: format!("Item {}", i),
                duration_secs: 100.0,
                fingerprint: format!("{}", i),
            });
        }

        // Repeat Off -> returns None at end
        coll.current_index = 2;
        coll.set_repeat(RepeatMode::Off);
        assert_eq!(coll.next_index(), None);

        // Repeat All -> wraps to 0
        coll.set_repeat(RepeatMode::All);
        assert_eq!(coll.next_index(), Some(0));

        // Repeat One -> stays on same index
        coll.set_repeat(RepeatMode::One);
        assert_eq!(coll.next_index(), Some(0));
    }
}
