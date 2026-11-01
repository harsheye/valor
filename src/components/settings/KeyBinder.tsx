import React, { useState, useEffect } from 'react';
import { RotateCcw, AlertCircle } from 'lucide-react';
import { SettingRow } from './SettingRow';

export interface KeyActionItem {
  id: string;
  name: string;
  defaultKey: string;
}

export const HOTKEY_ACTIONS: KeyActionItem[] = [
  { id: 'playPause', name: 'Play/pause', defaultKey: ' ' },
  { id: 'rewind', name: 'Rewind 10s', defaultKey: 'ArrowLeft' },
  { id: 'forward', name: 'Forward 10s', defaultKey: 'ArrowRight' },
  { id: 'fullscreen', name: 'Fullscreen', defaultKey: 'f' },
  { id: 'exit', name: 'Exit player', defaultKey: 'Escape' },
  { id: 'nextSubtitle', name: 'Cycle subtitles', defaultKey: 'b' },
  { id: 'nextAudio', name: 'Cycle audio', defaultKey: 'v' },
  { id: 'lockControls', name: 'Lock controls', defaultKey: 'w' },
  { id: 'openSettings', name: 'Open player settings', defaultKey: 'Delete' },
  { id: 'addBookmark', name: 'Create bookmark', defaultKey: 't' },
  { id: 'toggleMute', name: 'Mute', defaultKey: 'm' },
  { id: 'audioBoost', name: 'Volume boost', defaultKey: 'n' },
  { id: 'screenshot', name: 'Capture screenshot', defaultKey: 's' },
];

export const formatKeyDisplay = (key: string): string => {
  if (!key) return 'None';
  if (key === ' ') return 'Space';
  if (key === 'ArrowLeft') return '←';
  if (key === 'ArrowRight') return '→';
  if (key === 'ArrowUp') return '↑';
  if (key === 'ArrowDown') return '↓';
  if (key === 'Escape') return 'Esc';
  if (key.length === 1) return key.toUpperCase();
  return key;
};

export interface KeyBinderProps {
  keybinds: Record<string, string>;
  onKeybindChange: (actionId: string, newKey: string) => void;
  onResetKeybinds: () => void;
  onConflict?: (message: string) => void;
}

export const KeyBinder: React.FC<KeyBinderProps> = ({
  keybinds,
  onKeybindChange,
  onResetKeybinds,
  onConflict,
}) => {
  const [listeningFor, setListeningFor] = useState<string | null>(null);
  const [conflictMessage, setConflictMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!listeningFor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      // Esc cancels
      if (e.key === 'Escape') {
        setListeningFor(null);
        setConflictMessage(null);
        return;
      }

      const pressedKey = e.key;

      // Check if key is already in use by another action
      const conflictingEntry = Object.entries(keybinds).find(
        ([actionId, key]) => actionId !== listeningFor && key.toLowerCase() === pressedKey.toLowerCase()
      );

      if (conflictingEntry) {
        const [conflictActionId] = conflictingEntry;
        const conflictingAction = HOTKEY_ACTIONS.find((a) => a.id === conflictActionId);
        const actionLabel = conflictingAction ? conflictingAction.name : conflictActionId;
        const msg = `Key '${formatKeyDisplay(pressedKey)}' is already in use for ${actionLabel}.`;
        setConflictMessage(msg);
        if (onConflict) onConflict(msg);
        setListeningFor(null);
        return;
      }

      // Valid new key
      setConflictMessage(null);
      onKeybindChange(listeningFor, pressedKey);
      setListeningFor(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [listeningFor, keybinds, onKeybindChange, onConflict]);

  return (
    <div className="settings-hotkeys-wrapper">
      {conflictMessage && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            marginBottom: 'var(--space-2)',
            background: 'color-mix(in srgb, var(--danger) 15%, var(--surface-2))',
            border: '1px solid var(--danger)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--danger)',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          <AlertCircle size={16} />
          <span>{conflictMessage}</span>
        </div>
      )}

      <div className="settings-hotkey-rows">
        {HOTKEY_ACTIONS.map((action) => {
          const currentKey = keybinds[action.id] ?? action.defaultKey;
          const isListening = listeningFor === action.id;

          return (
            <SettingRow
              key={action.id}
              title={action.name}
              control={
                <button
                  type="button"
                  aria-label={`Rebind hotkey for ${action.name}. Current key: ${formatKeyDisplay(currentKey)}`}
                  className={`settings-key-btn keybind-capture-btn ${isListening ? 'listening' : ''}`}
                  onClick={() => {
                    setConflictMessage(null);
                    setListeningFor(isListening ? null : action.id);
                  }}
                >
                  {isListening ? 'Press key...' : formatKeyDisplay(currentKey)}
                </button>
              }
            />
          );
        })}
      </div>

      <div className="settings-hotkeys-footer">
        <button
          type="button"
          onClick={() => {
            setConflictMessage(null);
            setListeningFor(null);
            onResetKeybinds();
          }}
          className="settings-btn-secondary"
          aria-label="Reset hotkeys to default"
        >
          <RotateCcw size={14} />
          <span>Reset hotkeys</span>
        </button>
      </div>
    </div>
  );
};
