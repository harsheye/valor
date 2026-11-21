use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct KeyActionItem {
    pub id: String,
    pub name: String,
    pub default_key: String,
}

pub fn get_default_hotkey_actions() -> Vec<KeyActionItem> {
    vec![
        KeyActionItem {
            id: "playPause".into(),
            name: "Play/pause".into(),
            default_key: "Space".into(),
        },
        KeyActionItem {
            id: "rewind".into(),
            name: "Rewind 10s".into(),
            default_key: "Left".into(),
        },
        KeyActionItem {
            id: "forward".into(),
            name: "Forward 10s".into(),
            default_key: "Right".into(),
        },
        KeyActionItem {
            id: "fullscreen".into(),
            name: "Fullscreen".into(),
            default_key: "F".into(),
        },
        KeyActionItem {
            id: "exit".into(),
            name: "Exit player".into(),
            default_key: "Escape".into(),
        },
        KeyActionItem {
            id: "nextSubtitle".into(),
            name: "Cycle subtitles".into(),
            default_key: "B".into(),
        },
        KeyActionItem {
            id: "nextAudio".into(),
            name: "Cycle audio".into(),
            default_key: "V".into(),
        },
        KeyActionItem {
            id: "lockControls".into(),
            name: "Lock controls".into(),
            default_key: "W".into(),
        },
        KeyActionItem {
            id: "openSettings".into(),
            name: "Open player settings".into(),
            default_key: "Delete".into(),
        },
        KeyActionItem {
            id: "addBookmark".into(),
            name: "Create bookmark".into(),
            default_key: "T".into(),
        },
        KeyActionItem {
            id: "toggleMute".into(),
            name: "Mute".into(),
            default_key: "M".into(),
        },
        KeyActionItem {
            id: "audioBoost".into(),
            name: "Volume boost".into(),
            default_key: "N".into(),
        },
        KeyActionItem {
            id: "screenshot".into(),
            name: "Capture screenshot".into(),
            default_key: "S".into(),
        },
    ]
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeymapManager {
    pub bindings: HashMap<String, String>, // action_id -> key_name
}

impl Default for KeymapManager {
    fn default() -> Self {
        Self::new()
    }
}

impl KeymapManager {
    pub fn new() -> Self {
        let mut bindings = HashMap::new();
        for action in get_default_hotkey_actions() {
            bindings.insert(action.id, action.default_key);
        }
        Self { bindings }
    }

    /// Checks if a key conflicts with an existing action.
    /// Returns Some(conflicting_action_id) if conflicting, or None if safe.
    pub fn detect_conflict(&self, target_action_id: &str, candidate_key: &str) -> Option<String> {
        let normalized = candidate_key.trim().to_uppercase();
        for (action_id, key) in &self.bindings {
            if action_id != target_action_id && key.trim().to_uppercase() == normalized {
                return Some(action_id.clone());
            }
        }
        None
    }

    /// Rebinds an action to a new key.
    /// If there is a conflict, returns Err(conflicting_action_id).
    pub fn rebind(&mut self, action_id: &str, new_key: &str) -> Result<(), String> {
        if let Some(conflict) = self.detect_conflict(action_id, new_key) {
            Err(conflict)
        } else {
            self.bindings
                .insert(action_id.to_string(), new_key.to_string());
            Ok(())
        }
    }

    /// Force rebinds an action, removing the conflicting key from the previous action.
    pub fn force_rebind(&mut self, action_id: &str, new_key: &str) {
        let normalized = new_key.trim().to_uppercase();
        self.bindings
            .retain(|k, v| k == action_id || v.trim().to_uppercase() != normalized);
        self.bindings
            .insert(action_id.to_string(), new_key.to_string());
    }

    pub fn get_key_for_action(&self, action_id: &str) -> Option<&str> {
        self.bindings.get(action_id).map(|s| s.as_str())
    }

    pub fn reset_defaults(&mut self) {
        *self = Self::new();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shortcut_conflict_detection() {
        let mut km = KeymapManager::new();

        // Space is bound to playPause by default
        assert_eq!(km.get_key_for_action("playPause"), Some("Space"));

        // Attempting to bind rewind to Space must report conflict with playPause
        let conflict = km.detect_conflict("rewind", "Space");
        assert_eq!(conflict, Some("playPause".to_string()));

        let res = km.rebind("rewind", "Space");
        assert!(res.is_err());
        assert_eq!(res.unwrap_err(), "playPause");

        // Binding to an unused key (e.g. "K") must succeed
        let conflict_k = km.detect_conflict("rewind", "K");
        assert_eq!(conflict_k, None);
        assert!(km.rebind("rewind", "K").is_ok());
        assert_eq!(km.get_key_for_action("rewind"), Some("K"));

        // Force rebind steals key from previous holder
        km.force_rebind("forward", "K");
        assert_eq!(km.get_key_for_action("forward"), Some("K"));
        assert_eq!(km.get_key_for_action("rewind"), None);

        // Case-insensitivity & whitespace tolerance
        let conflict_lower = km.detect_conflict("addBookmark", "  space  ");
        assert_eq!(conflict_lower, Some("playPause".to_string()));

        // Self-rebinding to own existing key is NOT a conflict
        let self_conflict = km.detect_conflict("playPause", "Space");
        assert_eq!(self_conflict, None);
        assert!(km.rebind("playPause", "Space").is_ok());
    }
}
