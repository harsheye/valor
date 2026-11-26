/**
 * WasmGate.tsx
 *
 * Pre-flight WebAssembly support check shown before the app mounts.
 * - Detects WebAssembly support using the existing wasmCheck utility.
 * - If unsupported, shows a full-screen modal with per-browser enable instructions.
 * - Pressing ✕ dismisses the modal and continues into the app in HTML5-only mode
 *   (no WASM parsing, no FFmpeg — raw <video> element only).
 * - `onContinueHtml5` callback sets a session flag that downstream consumers can
 *   read to skip any WASM-dependent codepath.
 */

import { useState, useEffect } from 'react';
import { isWasmSupported } from '../utils/wasmCheck';

// Session-storage key consumed by services that need to know we're in html5-only mode
export const WASM_DISABLED_FLAG = 'valor_wasm_disabled';

/** Returns true when the user chose to continue without WASM this session. */
export const isHtml5OnlyMode = (): boolean => {
  try {
    return sessionStorage.getItem(WASM_DISABLED_FLAG) === '1';
  } catch {
    return false;
  }
};

// ─── Browser detection helpers ────────────────────────────────────────────────

type BrowserId = 'chrome' | 'firefox' | 'safari' | 'edge' | 'opera' | 'unknown';

function detectBrowser(): BrowserId {
  const ua = navigator.userAgent;
  if (/OPR|Opera/i.test(ua)) return 'opera';
  if (/Edg\//i.test(ua)) return 'edge';
  if (/Chrome/i.test(ua) && !/Chromium/i.test(ua)) return 'chrome';
  if (/Firefox/i.test(ua)) return 'firefox';
  if (/Safari/i.test(ua) && !/Chrome/i.test(ua)) return 'safari';
  return 'unknown';
}

// ─── Per-browser instructions ─────────────────────────────────────────────────

interface BrowserInstructions {
  name: string;
  icon: string;
  steps: string[];
  note?: string;
}

const INSTRUCTIONS: Record<BrowserId, BrowserInstructions> = {
  chrome: {
    name: 'Google Chrome',
    icon: '🌐',
    steps: [
      'Open a new tab and navigate to chrome://flags',
      'Search for "WebAssembly" in the search bar',
      'Set "WebAssembly" to Enabled',
      'Click "Relaunch" at the bottom of the page',
      'Return to Valor — it will work now',
    ],
    note: 'WebAssembly is enabled by default in Chrome 57+. If you are running an older version, please update Chrome.',
  },
  edge: {
    name: 'Microsoft Edge',
    icon: '🔵',
    steps: [
      'Open a new tab and navigate to edge://flags',
      'Search for "WebAssembly" in the search bar',
      'Set "WebAssembly" to Enabled',
      'Click "Restart" at the bottom of the page',
      'Return to Valor — it will work now',
    ],
    note: 'WebAssembly is enabled by default in modern Edge. Updating Edge is the simplest fix.',
  },
  firefox: {
    name: 'Mozilla Firefox',
    icon: '🦊',
    steps: [
      'Open a new tab and navigate to about:config',
      'Accept the risk warning',
      'Search for javascript.options.wasm',
      'Double-click the preference to set it to true',
      'Restart Firefox, then return to Valor',
    ],
  },
  safari: {
    name: 'Safari',
    icon: '🧭',
    steps: [
      'Open Safari Preferences → Advanced',
      'Enable "Show Develop menu in menu bar"',
      'Open the Develop menu → Experimental Features',
      'Ensure "WebAssembly" is checked',
      'Reload this page',
    ],
    note: 'Safari 14+ supports WebAssembly by default. Consider updating to the latest version of macOS/iOS for best compatibility.',
  },
  opera: {
    name: 'Opera',
    icon: '🎭',
    steps: [
      'Open a new tab and navigate to opera://flags',
      'Search for "WebAssembly"',
      'Set it to Enabled',
      'Click "Relaunch" and return to Valor',
    ],
  },
  unknown: {
    name: 'Your Browser',
    icon: '🌍',
    steps: [
      'Open your browser\'s advanced or experimental settings',
      'Look for a "WebAssembly" or "Wasm" toggle and enable it',
      'Restart your browser and return to Valor',
      'If the issue persists, try using Chrome, Firefox, or Edge',
    ],
    note: 'For the best experience, use the latest version of Chrome, Firefox, or Edge — all support WebAssembly out of the box.',
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

interface WasmGateProps {
  children: React.ReactNode;
}

export function WasmGate({ children }: WasmGateProps) {
  const [wasmOk, setWasmOk] = useState<boolean | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [browser, setBrowser] = useState<BrowserId>('unknown');

  useEffect(() => {
    // If the user already dismissed this session, don't re-show it
    if (isHtml5OnlyMode()) {
      setDismissed(true);
      setWasmOk(false);
      return;
    }
    const supported = isWasmSupported();
    setWasmOk(supported);
    setBrowser(detectBrowser());
  }, []);

  // Still checking — render nothing (avoids flash)
  if (wasmOk === null) return null;

  // WASM is supported → render the full app immediately
  if (wasmOk) return <>{children}</>;

  // User already chose HTML5 fallback → go straight into app
  if (dismissed) return <>{children}</>;

  // ── Show the warning gate ──────────────────────────────────────────────────
  const info = INSTRUCTIONS[browser];

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(WASM_DISABLED_FLAG, '1');
    } catch { /* storage might be unavailable */ }
    setDismissed(true);
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {/* Close / continue button */}
        <button
          style={styles.closeBtn}
          onClick={handleDismiss}
          title="Continue without WebAssembly (HTML5 video only)"
          aria-label="Dismiss and continue in HTML5 mode"
        >
          ✕
        </button>

        {/* Header */}
        <div style={styles.header}>
          <div style={styles.iconWrap}>
            <span style={styles.wasmIcon}>⚠️</span>
          </div>
          <h1 style={styles.title}>WebAssembly Not Available</h1>
          <p style={styles.subtitle}>
            Valor uses WebAssembly to decode audio tracks, extract subtitles, and parse
            advanced video containers. Your browser doesn't support it right now.
          </p>
        </div>

        {/* Browser-specific instructions */}
        <div style={styles.section}>
          <div style={styles.browserBadge}>
            <span style={{ fontSize: '1.4rem' }}>{info.icon}</span>
            <span style={styles.browserName}>Instructions for {info.name}</span>
          </div>

          <ol style={styles.stepList}>
            {info.steps.map((step, i) => (
              <li key={i} style={styles.stepItem}>
                <span style={styles.stepNum}>{i + 1}</span>
                <span style={styles.stepText}>{step}</span>
              </li>
            ))}
          </ol>

          {info.note && (
            <p style={styles.noteText}>
              <span style={{ marginRight: '0.4rem' }}>💡</span>
              {info.note}
            </p>
          )}
        </div>

        {/* Divider */}
        <div style={styles.divider} />

        {/* Fallback action */}
        <div style={styles.footer}>
          <p style={styles.fallbackHint}>
            Or press <strong>✕</strong> above to continue in <strong>HTML5-only mode</strong> — video
            playback will work but multi-track audio, embedded subtitles, and
            advanced container parsing will be unavailable.
          </p>
          <button style={styles.continueBtn} onClick={handleDismiss}>
            Continue in HTML5 Mode
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 99999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(0, 0, 0, 0.92)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    padding: '1rem',
    fontFamily: 'Outfit, Inter, system-ui, sans-serif',
  },
  card: {
    position: 'relative',
    background: 'linear-gradient(145deg, #12151c, #0d1017)',
    border: '1px solid rgba(255, 165, 0, 0.25)',
    borderRadius: '20px',
    boxShadow: '0 0 60px rgba(255, 140, 0, 0.1), 0 24px 64px rgba(0,0,0,0.6)',
    maxWidth: '540px',
    width: '100%',
    padding: '2rem 2rem 1.75rem',
    maxHeight: '90vh',
    overflowY: 'auto',
    scrollbarWidth: 'none',
  },
  closeBtn: {
    position: 'absolute',
    top: '1rem',
    right: '1rem',
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: '1px solid rgba(255,255,255,0.15)',
    background: 'rgba(255,255,255,0.07)',
    color: 'rgba(255,255,255,0.7)',
    fontSize: '0.9rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.2s, color 0.2s',
    lineHeight: 1,
  },
  header: {
    textAlign: 'center',
    marginBottom: '1.5rem',
  },
  iconWrap: {
    marginBottom: '0.75rem',
  },
  wasmIcon: {
    fontSize: '2.8rem',
    lineHeight: 1,
  },
  title: {
    margin: '0 0 0.5rem',
    fontSize: '1.35rem',
    fontWeight: 700,
    color: '#ffa500',
    letterSpacing: '-0.01em',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 1.6,
  },
  section: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: '12px',
    padding: '1.1rem 1.25rem',
    marginBottom: '1.25rem',
  },
  browserBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  browserName: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.8)',
  },
  stepList: {
    margin: 0,
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  stepItem: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.65rem',
  },
  stepNum: {
    flexShrink: 0,
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    background: 'rgba(255, 165, 0, 0.18)',
    border: '1px solid rgba(255, 165, 0, 0.35)',
    color: '#ffa500',
    fontSize: '0.7rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: '1px',
  },
  stepText: {
    fontSize: '0.83rem',
    color: 'rgba(255,255,255,0.72)',
    lineHeight: 1.5,
  },
  noteText: {
    marginTop: '0.9rem',
    marginBottom: 0,
    fontSize: '0.78rem',
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 1.5,
    display: 'flex',
    alignItems: 'flex-start',
  },
  divider: {
    height: '1px',
    background: 'rgba(255,255,255,0.07)',
    margin: '0 0 1.1rem',
  },
  footer: {
    textAlign: 'center',
  },
  fallbackHint: {
    margin: '0 0 1rem',
    fontSize: '0.8rem',
    color: 'rgba(255,255,255,0.4)',
    lineHeight: 1.6,
  },
  continueBtn: {
    padding: '0.6rem 1.4rem',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.06)',
    color: 'rgba(255,255,255,0.65)',
    fontSize: '0.82rem',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.2s, color 0.2s',
    letterSpacing: '0.01em',
  },
};
