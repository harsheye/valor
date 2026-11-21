use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SavedUiSnapshot {
    pub controls_visible: bool,
    pub dock_open: bool,
    pub drawer_open: bool,
}

pub struct HoldGStateMachine {
    press_start: Option<Instant>,
    is_peeking: bool,
    threshold: Duration,
    saved_snapshot: Option<SavedUiSnapshot>,
}

impl Default for HoldGStateMachine {
    fn default() -> Self {
        Self::new()
    }
}

impl HoldGStateMachine {
    pub fn new() -> Self {
        Self {
            press_start: None,
            is_peeking: false,
            threshold: Duration::from_millis(120),
            saved_snapshot: None,
        }
    }

    pub fn with_threshold(threshold: Duration) -> Self {
        Self {
            press_start: None,
            is_peeking: false,
            threshold,
            saved_snapshot: None,
        }
    }

    pub fn is_peeking(&self) -> bool {
        self.is_peeking
    }

    pub fn on_key_down(&mut self, now: Instant, current_ui: SavedUiSnapshot) {
        if self.press_start.is_none() {
            self.press_start = Some(now);
            self.saved_snapshot = Some(current_ui);
        }
    }

    pub fn update(&mut self, now: Instant) -> bool {
        if let Some(start) = self.press_start {
            if !self.is_peeking && now.duration_since(start) >= self.threshold {
                self.is_peeking = true;
            }
        }
        self.is_peeking
    }

    pub fn on_key_up(&mut self, _now: Instant) -> Option<SavedUiSnapshot> {
        self.press_start = None;
        if self.is_peeking {
            self.is_peeking = false;
            self.saved_snapshot.take()
        } else {
            self.saved_snapshot = None;
            None
        }
    }

    pub fn on_focus_lost(&mut self, _now: Instant) -> Option<SavedUiSnapshot> {
        self.press_start = None;
        if self.is_peeking {
            self.is_peeking = false;
            self.saved_snapshot.take()
        } else {
            self.saved_snapshot = None;
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hold_g_threshold_under_120ms_does_not_peek() {
        let mut sm = HoldGStateMachine::new();
        let start = Instant::now();
        let ui = SavedUiSnapshot {
            controls_visible: true,
            dock_open: false,
            drawer_open: false,
        };

        sm.on_key_down(start, ui.clone());
        assert!(!sm.is_peeking());

        // Update at 50ms (< 120ms)
        let t_50ms = start + Duration::from_millis(50);
        assert!(!sm.update(t_50ms));
        assert!(!sm.is_peeking());

        // Release at 100ms (< 120ms)
        let t_100ms = start + Duration::from_millis(100);
        let restored = sm.on_key_up(t_100ms);
        assert!(!sm.is_peeking());
        assert_eq!(restored, None);
    }

    #[test]
    fn test_hold_g_threshold_over_120ms_enters_peek() {
        let mut sm = HoldGStateMachine::new();
        let start = Instant::now();
        let ui = SavedUiSnapshot {
            controls_visible: true,
            dock_open: true,
            drawer_open: false,
        };

        sm.on_key_down(start, ui);
        assert!(!sm.is_peeking());

        // Update at 125ms (>= 120ms)
        let t_125ms = start + Duration::from_millis(125);
        assert!(sm.update(t_125ms));
        assert!(sm.is_peeking());
    }

    #[test]
    fn test_hold_g_release_restores_exact_ui() {
        let mut sm = HoldGStateMachine::new();
        let start = Instant::now();
        let ui = SavedUiSnapshot {
            controls_visible: false,
            dock_open: true,
            drawer_open: true,
        };

        sm.on_key_down(start, ui.clone());
        let t_150ms = start + Duration::from_millis(150);
        sm.update(t_150ms);
        assert!(sm.is_peeking());

        // Release G key
        let t_500ms = start + Duration::from_millis(500);
        let restored = sm.on_key_up(t_500ms);
        assert!(!sm.is_peeking());
        assert_eq!(restored, Some(ui));
    }

    #[test]
    fn test_hold_g_focus_loss_restores_exact_ui() {
        let mut sm = HoldGStateMachine::new();
        let start = Instant::now();
        let ui = SavedUiSnapshot {
            controls_visible: true,
            dock_open: false,
            drawer_open: true,
        };

        sm.on_key_down(start, ui.clone());
        let t_200ms = start + Duration::from_millis(200);
        sm.update(t_200ms);
        assert!(sm.is_peeking());

        // Focus lost while peeking
        let t_300ms = start + Duration::from_millis(300);
        let restored = sm.on_focus_lost(t_300ms);
        assert!(!sm.is_peeking());
        assert_eq!(restored, Some(ui));
    }
}
