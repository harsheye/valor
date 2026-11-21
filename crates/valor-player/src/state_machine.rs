use crate::state::PlaybackState;
use parking_lot::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct SwitchToken(pub u64);

#[derive(Clone)]
pub struct PlaybackStateMachine {
    current_token: Arc<AtomicU64>,
    state: Arc<Mutex<PlaybackState>>,
}

impl PlaybackStateMachine {
    pub fn new(state: Arc<Mutex<PlaybackState>>) -> Self {
        Self {
            current_token: Arc::new(AtomicU64::new(1)),
            state,
        }
    }

    /// Advances the switch token atomically, releasing resources from previous track.
    pub fn begin_switch(&self) -> SwitchToken {
        let new_token = self.current_token.fetch_add(1, Ordering::SeqCst) + 1;
        let mut st = self.state.lock();
        st.position_secs = 0.0;
        st.duration_secs = 0.0;
        st.tracks.clear();
        SwitchToken(new_token)
    }

    /// Verifies if an event or property update belongs to the active playback token.
    pub fn is_token_valid(&self, token: SwitchToken) -> bool {
        token.0 == self.current_token.load(Ordering::SeqCst)
    }

    /// Applies a property update only if the switch token matches the active session.
    pub fn apply_update<F>(&self, token: SwitchToken, updater: F) -> bool
    where
        F: FnOnce(&mut PlaybackState),
    {
        if self.is_token_valid(token) {
            let mut st = self.state.lock();
            updater(&mut st);
            true
        } else {
            false // Stale event discarded
        }
    }

    pub fn current_token(&self) -> SwitchToken {
        SwitchToken(self.current_token.load(Ordering::SeqCst))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_switch_token_race_elimination() {
        let state = Arc::new(Mutex::new(PlaybackState::default()));
        let sm = PlaybackStateMachine::new(state.clone());

        let token_a = sm.begin_switch();
        let token_b = sm.begin_switch();
        let token_c = sm.begin_switch();

        assert_eq!(token_a.0, 2);
        assert_eq!(token_b.0, 3);
        assert_eq!(token_c.0, 4);

        // Stale event from Token A should be rejected
        let applied_a = sm.apply_update(token_a, |st| {
            st.position_secs = 99.0;
        });
        assert!(!applied_a);
        assert_eq!(state.lock().position_secs, 0.0);

        // Stale event from Token B should be rejected
        let applied_b = sm.apply_update(token_b, |st| {
            st.position_secs = 50.0;
        });
        assert!(!applied_b);
        assert_eq!(state.lock().position_secs, 0.0);

        // Active event from Token C must succeed
        let applied_c = sm.apply_update(token_c, |st| {
            st.position_secs = 12.5;
        });
        assert!(applied_c);
        assert_eq!(state.lock().position_secs, 12.5);
    }

    #[test]
    fn test_switch_token_concurrent_interleaved_seeks() {
        let state = Arc::new(Mutex::new(PlaybackState::default()));
        let sm = PlaybackStateMachine::new(state.clone());

        let t1 = sm.begin_switch();
        let t2 = sm.begin_switch();

        // Simulate async thread 1 finishing seek for t1
        let handle1 = {
            let sm_clone = sm.clone();
            std::thread::spawn(move || sm_clone.apply_update(t1, |s| s.position_secs = 500.0))
        };

        // Simulate async thread 2 finishing seek for t2
        let handle2 = {
            let sm_clone = sm.clone();
            std::thread::spawn(move || sm_clone.apply_update(t2, |s| s.position_secs = 42.0))
        };

        let res1 = handle1.join().unwrap();
        let res2 = handle2.join().unwrap();

        assert!(!res1, "Seek on stale token t1 must be rejected");
        assert!(res2, "Seek on active token t2 must succeed");
        assert_eq!(state.lock().position_secs, 42.0);
    }
}
