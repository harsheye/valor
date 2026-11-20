/**
 * PlaylistPanel — slide-in panel from the right showing the current playlist.
 * Glass style matching the UI Settings panel. Closes when hold-G timeline view
 * is active. Does not let clicks pass through to the video.
 */

import React, { useRef, useCallback, useEffect, useState } from 'react';
import {
  X, Trash2, GripVertical, List, ChevronRight, AlertCircle,
  Play, CheckCircle, ChevronDown, Plus, Edit2, Check, Search, Folder, Lock
} from 'lucide-react';
import type { PlaylistItem, PlaylistState, RepeatMode } from '../hooks/usePlaylist';
import type { StoredPlaylist } from '../utils/indexedDB';
import { classifyVideoTitle } from '../utils/libraryClassifier';

interface PlaylistPanelProps {
  playlist: PlaylistState;
  allPlaylists?: StoredPlaylist[];
  currentFP?: string;          // fingerprint of the item currently playing
  isOpen: boolean;
  onClose: () => void;
  onPlayIndex: (i: number) => void;
  onRemoveItem: (fp: string) => void;
  onClearAll: () => void;
  onReorder: (from: number, to: number) => void;
  onSetRepeat: (r: RepeatMode) => void;
  onSetShuffle: (s: boolean) => void;
  onSwitchPlaylist?: (id: string) => void;
  onRenamePlaylist?: (newName: string, id?: string) => void;
  onDeletePlaylist?: (id: string) => void;
  onCreatePlaylist?: (name?: string) => void;
  onLocateFile?: (itemId: string) => void;
  formatTime?: (s: number) => string;
  isTimelineOnly?: boolean;    // close panel when timeline-only (hold-G) is active
  isPermissionExpired?: boolean;
  onContinueWhereLeftOff?: () => void;
}

function fmtSavedTime(s?: number): string {
  if (!s || s <= 0) return '';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function RepeatIcon({ mode }: { mode: RepeatMode }) {
  if (mode === 'one') {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
        <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
        <text x="10" y="15" fontSize="7" fontWeight="bold" fill="currentColor" stroke="none">1</text>
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function ShuffleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8" /><line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" /><line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}

export const PlaylistPanel: React.FC<PlaylistPanelProps> = ({
  playlist,
  allPlaylists = [],
  currentFP,
  isOpen,
  onClose,
  onPlayIndex,
  onRemoveItem,
  onClearAll,
  onReorder,
  onSetRepeat,
  onSetShuffle,
  onSwitchPlaylist,
  onRenamePlaylist,
  onDeletePlaylist,
  onCreatePlaylist,
  onLocateFile,
  formatTime,
  isTimelineOnly,
  isPermissionExpired = false,
  onContinueWhereLeftOff,
}) => {
  const dragSrcRef = useRef<number | null>(null);
  const listRef    = useRef<HTMLDivElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(playlist.name || 'Playlist');

  const hasFSA = typeof window !== 'undefined' && 'showOpenFilePicker' in window;

  useEffect(() => {
    setEditedName(playlist.name || 'Playlist');
  }, [playlist.name]);

  // Close when timeline-only (hold-G) activates
  useEffect(() => {
    if (isTimelineOnly && isOpen) onClose();
  }, [isTimelineOnly, isOpen, onClose]);

  const cycleRepeat = () => {
    const next: RepeatMode = playlist.repeat === 'off' ? 'all'
      : playlist.repeat === 'all' ? 'one' : 'off';
    onSetRepeat(next);
  };

  const handleDragStart = useCallback((e: React.DragEvent, idx: number) => {
    dragSrcRef.current = idx;
    e.dataTransfer.effectAllowed = 'move';
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragSrcRef.current === null || dragSrcRef.current === idx) return;
    onReorder(dragSrcRef.current, idx);
    dragSrcRef.current = null;
  }, [onReorder]);

  const handleSaveName = () => {
    const trimmed = editedName.trim();
    if (trimmed && onRenamePlaylist) {
      onRenamePlaylist(trimmed, playlist.id);
    }
    setIsEditingName(false);
  };

  if (!isOpen) return null;

  const { items, shuffle, repeat } = playlist;
  const repeatActive  = repeat !== 'off';
  const accentColor   = 'var(--accent-color, #e50914)';
  const dimColor      = 'rgba(255,255,255,0.45)';

  // Filter items by search query if > 15 items
  const isSearchable = items.length > 15;
  const filteredItems = isSearchable && searchQuery.trim()
    ? items
        .map((item, originalIndex) => ({ item, originalIndex }))
        .filter(({ item }) =>
          (item.title || item.name || item.fileName || '')
            .toLowerCase()
            .includes(searchQuery.trim().toLowerCase())
        )
    : items.map((item, originalIndex) => ({ item, originalIndex }));

  return (
    <>
      {/* Click-blocker overlay – stops clicks reaching the video */}
      <div
        className="playlist-panel-backdrop"
        onClick={onClose}
        onWheel={e => e.stopPropagation()}
        style={{
          position: 'fixed', inset: 0,
          zIndex: 7998,
          background: 'transparent',
          cursor: 'default',
          pointerEvents: 'auto',
        }}
      />

      {/* Panel */}
      <div
        className="playlist-panel-container"
        onWheel={e => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: 0, right: 0, bottom: 0,
          width: 'clamp(320px, 32vw, 450px)',
          zIndex: 7999,
          display: 'flex',
          flexDirection: 'column',
          background: 'rgba(10, 12, 20, 0.90)',
          backdropFilter: 'blur(28px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '-20px 0 60px rgba(0,0,0,0.6)',
          fontFamily: 'Outfit, sans-serif',
          animation: 'slideInRight 0.25s cubic-bezier(0.16,1,0.3,1)',
          pointerEvents: 'auto',
        }}
        onClick={e => {
          e.stopPropagation();
          setShowDropdown(false);
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px 12px 18px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          flexShrink: 0,
          position: 'relative',
        }}>
          {/* Playlist selector dropdown & rename */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1, marginRight: 8 }}>
            <List size={16} style={{ color: accentColor, flexShrink: 0 }} />

            {isEditingName ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
                <input
                  type="text"
                  value={editedName}
                  onChange={e => setEditedName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  autoFocus
                  style={{
                    background: 'rgba(255,255,255,0.12)',
                    border: '1px solid rgba(255,255,255,0.25)',
                    borderRadius: 4,
                    color: '#fff',
                    padding: '2px 6px',
                    fontSize: '0.85rem',
                    outline: 'none',
                    width: '100%',
                  }}
                />
                <button
                  onClick={handleSaveName}
                  style={{ background: 'none', border: 'none', color: '#4ade80', cursor: 'pointer', padding: 2 }}
                >
                  <Check size={14} />
                </button>
                <button
                  onClick={() => setIsEditingName(false)}
                  style={{ background: 'none', border: 'none', color: dimColor, cursor: 'pointer', padding: 2 }}
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDropdown(prev => !prev);
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: 'transparent', border: 'none',
                    color: '#fff', fontSize: '0.92rem', fontWeight: 700,
                    cursor: 'pointer', padding: 0, maxWidth: 160,
                    textAlign: 'left',
                  }}
                  title="Switch playlist"
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {playlist.name || 'Playlist'}
                  </span>
                  <ChevronDown size={14} style={{ color: dimColor, flexShrink: 0 }} />
                </button>

                {onRenamePlaylist && (
                  <button
                    onClick={() => {
                      setEditedName(playlist.name || 'Playlist');
                      setIsEditingName(true);
                    }}
                    title="Rename playlist"
                    style={{
                      background: 'transparent', border: 'none',
                      color: 'rgba(255,255,255,0.3)', cursor: 'pointer',
                      padding: 2, display: 'flex', alignItems: 'center',
                    }}
                  >
                    <Edit2 size={12} />
                  </button>
                )}

                <span style={{
                  fontSize: '0.72rem', color: dimColor,
                  background: 'rgba(255,255,255,0.08)',
                  borderRadius: 100, padding: '1px 6px',
                  flexShrink: 0,
                }}>
                  {items.length}
                </span>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Shuffle */}
            <button
              title="Shuffle"
              onClick={() => onSetShuffle(!shuffle)}
              style={{
                background: shuffle ? 'rgba(229,9,20,0.15)' : 'transparent',
                border: shuffle ? '1px solid rgba(229,9,20,0.3)' : '1px solid transparent',
                borderRadius: 6, padding: '5px 7px', cursor: 'pointer',
                color: shuffle ? accentColor : dimColor,
                display: 'flex', alignItems: 'center',
                transition: 'all 0.15s',
              }}
            >
              <ShuffleIcon />
            </button>
            {/* Repeat */}
            <button
              title={`Repeat: ${repeat}`}
              onClick={cycleRepeat}
              style={{
                background: repeatActive ? 'rgba(229,9,20,0.15)' : 'transparent',
                border: repeatActive ? '1px solid rgba(229,9,20,0.3)' : '1px solid transparent',
                borderRadius: 6, padding: '5px 7px', cursor: 'pointer',
                color: repeatActive ? accentColor : dimColor,
                display: 'flex', alignItems: 'center',
                transition: 'all 0.15s',
              }}
            >
              <RepeatIcon mode={repeat} />
            </button>
            {/* Close */}
            <button
              onClick={onClose}
              style={{
                background: 'transparent', border: 'none',
                color: dimColor, cursor: 'pointer', padding: '4px',
                display: 'flex', alignItems: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
              onMouseLeave={e => (e.currentTarget.style.color = dimColor)}
            >
              <X size={18} />
            </button>
          </div>

          {/* Saved Playlists Dropdown Menu */}
          {showDropdown && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                left: 16,
                width: 240,
                background: 'rgba(18, 20, 32, 0.98)',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8,
                boxShadow: '0 10px 30px rgba(0,0,0,0.7)',
                zIndex: 8010,
                padding: '6px 0',
                display: 'flex',
                flexDirection: 'column',
              }}
              onClick={e => e.stopPropagation()}
            >
              <div style={{
                fontSize: '0.68rem', fontWeight: 600, color: dimColor,
                padding: '4px 12px 6px', textTransform: 'uppercase', letterSpacing: 0.5,
              }}>
                Saved Playlists
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                {allPlaylists.map(p => {
                  const isCur = p.id === playlist.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => {
                        setShowDropdown(false);
                        if (onSwitchPlaylist && !isCur) onSwitchPlaylist(p.id);
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        background: isCur ? 'rgba(229,9,20,0.15)' : 'transparent',
                        color: isCur ? '#fff' : 'rgba(255,255,255,0.8)',
                        fontSize: '0.82rem',
                        fontWeight: isCur ? 600 : 400,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                      onMouseEnter={e => {
                        if (!isCur) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)';
                      }}
                      onMouseLeave={e => {
                        if (!isCur) (e.currentTarget as HTMLElement).style.background = 'transparent';
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.name}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: dimColor }}>
                        {p.items?.length ?? 0}
                      </span>
                    </div>
                  );
                })}
              </div>

              {onCreatePlaylist && (
                <div
                  onClick={() => {
                    setShowDropdown(false);
                    onCreatePlaylist();
                  }}
                  style={{
                    borderTop: '1px solid rgba(255,255,255,0.08)',
                    padding: '8px 12px',
                    cursor: 'pointer',
                    color: accentColor,
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                  onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)')}
                  onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = 'transparent')}
                >
                  <Plus size={14} />
                  <span>New Playlist</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search bar when > 15 items */}
        {isSearchable && (
          <div style={{
            padding: '8px 14px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(0,0,0,0.18)',
          }}>
            <Search size={14} style={{ color: dimColor, flexShrink: 0 }} />
            <input
              type="text"
              placeholder={`Search ${items.length} items...`}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '0.78rem',
                outline: 'none',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', color: dimColor, cursor: 'pointer', padding: 2 }}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* Access Expired Banner */}
        {isPermissionExpired && (
          <div
            className="permission-expired-banner"
            style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(245, 158, 11, 0.12)',
              borderBottom: '1px solid rgba(245, 158, 11, 0.28)',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={16} color="#f59e0b" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#fef3c7' }}>
                  Access to your files expired
                </div>
                <div style={{ fontSize: '0.72rem', color: 'rgba(255, 255, 255, 0.72)', marginTop: 1 }}>
                  Browser file permissions reset on reload.
                </div>
              </div>
            </div>
            {onContinueWhereLeftOff && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onContinueWhereLeftOff();
                }}
                style={{
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  border: 'none',
                  color: '#000000',
                  padding: '7px 14px',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 8px rgba(245, 158, 11, 0.35)',
                  transition: 'opacity 0.15s ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
              >
                <Play size={13} fill="currentColor" />
                <span>Continue where you left off</span>
              </button>
            )}
          </div>
        )}

        {/* Item list */}
        <div
          ref={listRef}
          style={{
            flex: 1, overflowY: 'auto',
            padding: '8px 0',
          }}
        >
          {items.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '100%',
              color: dimColor, gap: 10, padding: 24, textAlign: 'center',
            }}>
              <List size={32} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                No files in playlist.<br />Open files or a folder to add them.
              </span>
            </div>
          ) : filteredItems.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', height: '60%',
              color: dimColor, gap: 8, padding: 24, textAlign: 'center',
            }}>
              <Search size={28} style={{ opacity: 0.3 }} />
              <span style={{ fontSize: '0.8rem' }}>No matching items found</span>
            </div>
          ) : (
            filteredItems.map(({ item, originalIndex }) => {
              const isActive = (item.id || item.fingerprint) === currentFP;
              const durSec = item.durationSec || (item.duration
                ? item.duration.split(':').reduce((acc, v, i, arr) =>
                    acc + parseFloat(v) * Math.pow(60, arr.length - 1 - i), 0)
                : 0);

              const progress = item.savedTime && durSec > 0
                ? Math.min(1, item.savedTime / durSec)
                : 0;

              const isWatched = item.isWatched || progress >= 0.90;

              return (
                <div
                  key={item.id || item.fingerprint}
                  draggable
                  onDragStart={e => handleDragStart(e, originalIndex)}
                  onDragOver={e => handleDragOver(e, originalIndex)}
                  onDrop={e => handleDrop(e, originalIndex)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px 8px 10px',
                    background: isActive
                      ? 'rgba(229,9,20,0.10)'
                      : item.error
                        ? 'rgba(239, 68, 68, 0.06)'
                        : 'transparent',
                    borderLeft: isActive
                      ? `3px solid ${accentColor}`
                      : item.error
                        ? '3px solid #ef4444'
                        : '3px solid transparent',
                    cursor: 'pointer',
                    transition: 'background 0.15s',
                    position: 'relative',
                  }}
                  onMouseEnter={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                  }}
                  onMouseLeave={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.background = item.error ? 'rgba(239, 68, 68, 0.06)' : 'transparent';
                  }}
                  onClick={() => {
                    if (isPermissionExpired && onContinueWhereLeftOff) {
                      onContinueWhereLeftOff();
                      return;
                    }
                    if (!item.error) onPlayIndex(originalIndex);
                  }}
                >
                  {/* Drag handle */}
                  <div style={{ color: 'rgba(255,255,255,0.2)', cursor: 'grab', flexShrink: 0 }}>
                    <GripVertical size={14} />
                  </div>

                  {/* Index number / Play icon / Watched icon / Locked icon */}
                  <div style={{
                    width: 22, textAlign: 'right', flexShrink: 0,
                    fontSize: '0.72rem', color: isPermissionExpired ? '#f59e0b' : (isActive ? accentColor : dimColor),
                    fontWeight: isActive ? 700 : 400,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isPermissionExpired ? (
                      <Lock size={12} style={{ color: '#f59e0b' }} />
                    ) : isActive ? (
                      <Play size={12} style={{ color: accentColor }} />
                    ) : isWatched ? (
                      <CheckCircle size={12} style={{ color: '#4ade80' }} />
                    ) : (
                      originalIndex + 1
                    )}
                  </div>

                  {/* Title + meta + error state */}
                  {(() => {
                    const fullName = item.title || item.name || item.fileName || 'Untitled';
                    const classified = classifyVideoTitle(fullName);

                    let displayTitle = fullName;
                    let episodeBadge = '';

                    if (classified.type === 'series' && (classified.episode !== undefined || classified.season !== undefined)) {
                      const epNum = classified.episode !== undefined ? `Episode ${classified.episode}` : '';
                      const sNum = classified.season !== undefined ? `S${classified.season}` : '';
                      displayTitle = classified.episodeTitle 
                        ? `${epNum ? epNum + ': ' : ''}${classified.episodeTitle}`
                        : (epNum || (sNum ? `${sNum} Episode` : fullName));
                      episodeBadge = sNum && epNum ? `${sNum}E${String(classified.episode).padStart(2, '0')}` : (sNum || epNum);
                    }

                    return (
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div 
                          title={fullName}
                          style={{
                            fontSize: '0.82rem',
                            color: item.error ? '#ef4444' : (isActive ? '#fff' : 'rgba(255,255,255,0.92)'),
                            fontWeight: isActive ? 600 : 400,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            display: 'flex', alignItems: 'center', gap: 6,
                          }}
                        >
                          {item.error && <AlertCircle size={12} style={{ color: '#ef4444', flexShrink: 0 }} />}
                          {isPermissionExpired && (
                            <span style={{
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              background: 'rgba(245, 158, 11, 0.16)',
                              color: '#fbbf24',
                              border: '1px solid rgba(245, 158, 11, 0.3)',
                              padding: '1px 5px',
                              borderRadius: 4,
                              flexShrink: 0,
                            }}>
                              Locked
                            </span>
                          )}
                          {episodeBadge && (
                            <span style={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              background: isActive ? accentColor : 'rgba(255,255,255,0.12)',
                              color: '#fff',
                              padding: '1px 5px',
                              borderRadius: 4,
                              flexShrink: 0,
                              letterSpacing: '0.5px'
                            }}>
                              {episodeBadge}
                            </span>
                          )}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {displayTitle}
                          </span>
                        </div>

                        {/* Secondary line allowing reading original full name */}
                        {displayTitle !== fullName && (
                          <div 
                            title={fullName}
                            style={{
                              fontSize: '0.67rem',
                              color: dimColor,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              marginTop: 1,
                            }}
                          >
                            {fullName}
                          </div>
                        )}

                        {item.error ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                        <span style={{ fontSize: '0.68rem', color: '#f87171' }}>
                          File missing or moved
                        </span>
                        {onLocateFile && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              onLocateFile(item.id || item.fingerprint);
                            }}
                            style={{
                              background: 'rgba(239,68,68,0.2)',
                              border: '1px solid rgba(239,68,68,0.4)',
                              borderRadius: 4,
                              color: '#fff',
                              fontSize: '0.65rem',
                              fontWeight: 600,
                              padding: '1px 6px',
                              cursor: 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 3,
                            }}
                          >
                            <Folder size={10} /> Locate file
                          </button>
                        )}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        {item.savedTime && item.savedTime > 0 && (
                          <span style={{ fontSize: '0.68rem', color: dimColor }}>
                            {fmtSavedTime(item.savedTime)}
                            {item.duration && ` / ${item.duration}`}
                          </span>
                        )}
                        {/* Progress bar */}
                        {progress > 0 && (
                          <div style={{
                            flex: 1, height: 2,
                            background: 'rgba(255,255,255,0.1)',
                            borderRadius: 2, overflow: 'hidden',
                          }}>
                            <div style={{
                              width: `${progress * 100}%`,
                              height: '100%',
                              background: isWatched ? '#4ade80' : (isActive ? accentColor : 'rgba(255,255,255,0.3)'),
                            }} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

                  {/* Remove button */}
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      onRemoveItem(item.id || item.fingerprint);
                    }}
                    title="Remove from playlist"
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'rgba(255,255,255,0.2)', padding: '3px',
                      display: 'flex', alignItems: 'center',
                      flexShrink: 0,
                      transition: 'color 0.15s',
                      opacity: 0,
                    }}
                    className="playlist-remove-btn"
                    onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.2)')}
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Inline styles for hover reveal and animation */}
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to   { transform: translateX(0); }
        }
        .playlist-remove-btn { opacity: 0 !important; }
        div:hover > .playlist-remove-btn { opacity: 1 !important; }
      `}</style>
    </>
  );
};
