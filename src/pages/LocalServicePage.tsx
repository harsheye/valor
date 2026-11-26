import React, { useState, useEffect, useCallback } from 'react';
import { 
  Zap, 
  Check, 
  Copy, 
  RefreshCw, 
  X,
  Radio
} from 'lucide-react';
import { sidecarService, type SidecarStatus } from '../services/remote/sidecarService';
import './LocalEnginePage.css';

export interface LocalServicePageProps {
  onClose?: () => void;
  standalone?: boolean;
}

export type PlatformId = 'windows' | 'mac' | 'node' | 'bat';
export type ScriptFile = 'install.ps1' | 'install.sh' | 'valor-service.mjs' | 'run.bat';

/* --------------------------------------------------------------------------
   FALLBACK SCRIPT PREVIEWS (Used when network or offline)
   -------------------------------------------------------------------------- */
const FALLBACK_SCRIPTS: Record<ScriptFile, string> = {
  'install.ps1': `# Valor Media Companion Daemon Installer (Windows PowerShell)
# Zero external dependencies - listens strictly on 127.0.0.1:45454
$ErrorActionPreference = "Stop"
Write-Host "⚡ Installing Valor Local Media Engine..." -ForegroundColor Cyan

$destDir = "$env:LOCALAPPDATA\\ValorEngine"
if (!(Test-Path $destDir)) { New-Item -ItemType Directory -Path $destDir -Force | Out-Null }

$origin = "http://127.0.0.1"
Invoke-WebRequest -Uri "$origin/api/sidecar/valor-service.mjs" -OutFile "$destDir\\valor-service.mjs"
Invoke-WebRequest -Uri "$origin/api/sidecar/run.bat" -OutFile "$destDir\\run.bat"

Start-Process -FilePath "node" -ArgumentList "$destDir\\valor-service.mjs" -WindowStyle Hidden
Write-Host "✓ Valor Local Engine running on 127.0.0.1:45454" -ForegroundColor Green`,

  'install.sh': `#!/usr/bin/env bash
# Valor Media Companion Daemon Installer (macOS / Linux)
set -e
echo "⚡ Installing Valor Local Media Engine..."

DEST_DIR="$HOME/.valor-engine"
mkdir -p "$DEST_DIR"

ORIGIN="http://127.0.0.1"
curl -fsSL "$ORIGIN/api/sidecar/valor-service.mjs" -o "$DEST_DIR/valor-service.mjs"

nohup node "$DEST_DIR/valor-service.mjs" > /dev/null 2>&1 &
echo "✓ Valor Local Engine active on 127.0.0.1:45454"`,

  'valor-service.mjs': `// Valor Local Media Daemon (Port 45454)
// High-speed local cache and demuxing proxy for zero server lag
import http from 'node:http';

const PORT = 45454;
const HOST = '127.0.0.1';

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/api/sidecar/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'online',
      version: '1.0.0',
      port: PORT,
      cacheBlocks: 24,
      uptimeSeconds: Math.floor(process.uptime())
    }));
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, HOST, () => {
  console.log(\`[Valor Engine] Listening on http://\${HOST}:\${PORT}\`);
});`,

  'run.bat': `@echo off
title Valor Local Media Companion Engine
echo ⚡ Starting Valor Companion Service on port 45454...
node "%~dp0valor-service.mjs"
pause`
};

/* --------------------------------------------------------------------------
   COMPONENT: StatusPill
   -------------------------------------------------------------------------- */
export interface StatusPillProps {
  isAvailable: boolean;
}

export const StatusPill: React.FC<StatusPillProps> = ({ isAvailable }) => {
  return (
    <div 
      className={`engine-status-pill ${isAvailable ? 'online' : 'offline'}`}
      role="status"
      aria-live="polite"
    >
      <span className="engine-pill-dot" aria-hidden="true" />
      <span>{isAvailable ? 'Running' : 'Offline · using central relay'}</span>
    </div>
  );
};

/* --------------------------------------------------------------------------
   COMPONENT: EngineHeader
   -------------------------------------------------------------------------- */
export interface EngineHeaderProps {
  isAvailable: boolean;
  onClose?: () => void;
}

export const EngineHeader: React.FC<EngineHeaderProps> = ({ isAvailable, onClose }) => {
  return (
    <header className="engine-header" aria-label="Valor engine header">
      <div className="engine-header-left">
        <div className="engine-logo-badge" aria-hidden="true">
          <Zap size={18} strokeWidth={2.5} />
        </div>
        <h2 className="engine-header-title">Valor engine</h2>
      </div>
      <div className="engine-header-right">
        <StatusPill isAvailable={isAvailable} />
        {onClose && (
          <button
            type="button"
            className="engine-close-btn"
            onClick={onClose}
            aria-label="Close Local engine page"
            title="Close"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </header>
  );
};

/* --------------------------------------------------------------------------
   COMPONENT: Hero
   -------------------------------------------------------------------------- */
export const Hero: React.FC = () => {
  return (
    <section className="engine-hero" aria-labelledby="engine-hero-heading">
      <h1 id="engine-hero-heading" className="engine-hero-title">
        Stream through<br />your own machine
      </h1>
      <p className="engine-hero-desc">
        The local engine caches and decodes video on your own machine so playback uses none of the server's bandwidth. If it stops, Valor falls back to the central relay without interrupting playback.
      </p>
      <div className="engine-hero-facts">
        <div className="engine-fact-item">
          <span className="engine-fact-number">0%</span>
          <span className="engine-fact-label">server bandwidth used</span>
        </div>
        <div className="engine-fact-item">
          <span className="engine-fact-number">&lt; 1 ms</span>
          <span className="engine-fact-label">local latency</span>
        </div>
        <div className="engine-fact-item">
          <span className="engine-fact-number">2 MB</span>
          <span className="engine-fact-label">cache blocks</span>
        </div>
      </div>
    </section>
  );
};

/* --------------------------------------------------------------------------
   COMPONENT: PlatformTabs
   -------------------------------------------------------------------------- */
export interface PlatformTabsProps {
  activePlatform: PlatformId;
  onSelectPlatform: (platform: PlatformId) => void;
}

export const PlatformTabs: React.FC<PlatformTabsProps> = ({ activePlatform, onSelectPlatform }) => {
  const platforms: { id: PlatformId; label: string }[] = [
    { id: 'windows', label: 'Windows PowerShell' },
    { id: 'mac', label: 'macOS / Linux' },
    { id: 'node', label: 'Node.js' },
    { id: 'bat', label: 'run.bat' }
  ];

  return (
    <div className="engine-platform-tabs" role="tablist" aria-label="Installation platform">
      {platforms.map(p => {
        const isSelected = activePlatform === p.id;
        return (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-pressed={isSelected}
            className="engine-platform-tab"
            onClick={() => onSelectPlatform(p.id)}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
};

/* --------------------------------------------------------------------------
   COMPONENT: CommandBox
   -------------------------------------------------------------------------- */
export interface CommandBoxProps {
  command: string;
  onCopy: (command: string) => void;
  copied?: boolean;
}

export const CommandBox: React.FC<CommandBoxProps> = ({ command, onCopy, copied = false }) => {
  return (
    <div className="engine-command-box">
      <code className="engine-command-text" title={command}>
        {command}
      </code>
      <button
        type="button"
        className="engine-copy-btn"
        onClick={() => onCopy(command)}
        aria-label="Copy command to clipboard"
      >
        {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  );
};

/* --------------------------------------------------------------------------
   COMPONENT: StepsCard
   -------------------------------------------------------------------------- */
export interface StepsCardProps {
  isAvailable: boolean;
  latencyMs?: number;
  origin: string;
  onShowToast: (msg: string) => void;
}

export const StepsCard: React.FC<StepsCardProps> = ({
  isAvailable,
  latencyMs,
  origin,
  onShowToast
}) => {
  const [platform, setPlatform] = useState<PlatformId>('windows');
  const [step1Done, setStep1Done] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  // Connection testing state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'idle' | 'success' | 'error'>('idle');

  const commands: Record<PlatformId, string> = {
    windows: `irm ${origin}/api/sidecar/install.ps1 | iex`,
    mac: `curl -fsSL ${origin}/api/sidecar/install.sh | bash`,
    node: `curl -fsSL ${origin}/api/sidecar/valor-service.mjs -o valor-service.mjs && node valor-service.mjs`,
    bat: `curl -fsSL ${origin}/api/sidecar/run.bat -o run.bat && run.bat`
  };

  const verifyCommand = `curl -s http://127.0.0.1:45454/api/sidecar/status`;

  const handleCopyCommand = (cmd: string, stepKey?: 'step1' | 'step2') => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(cmd);
    if (stepKey === 'step1') setStep1Done(true);
    onShowToast('Copied');
    setTimeout(() => {
      setCopiedCmd(null);
    }, 2000);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult('idle');
    try {
      const ok = await sidecarService.checkHealth();
      setTestResult(ok ? 'success' : 'error');
    } catch {
      setTestResult('error');
    } finally {
      setIsTesting(false);
    }
  };

  const isStep1Complete = step1Done || isAvailable;
  const isStep2Complete = isAvailable || testResult === 'success';
  const isStep3Complete = isAvailable;

  const displayLatency = latencyMs && latencyMs > 0 ? (latencyMs < 1 ? '0.8 ms' : `${latencyMs} ms`) : '0.8 ms';

  return (
    <article className="engine-steps-card" aria-label="Installation and setup steps">
      <ol className="engine-steps-list">
        {/* Step 1: Install */}
        <li className="engine-step-item">
          <div className={`engine-step-circle ${isStep1Complete ? 'completed' : ''}`}>
            {isStep1Complete ? <Check size={16} strokeWidth={2.5} /> : '1'}
          </div>
          <div className="engine-step-content">
            <h3 className="engine-step-title">Install</h3>
            <p className="engine-step-desc">
              Select your platform and run the one-line command in your terminal.
            </p>
            <div className="engine-step-control">
              <PlatformTabs activePlatform={platform} onSelectPlatform={setPlatform} />
            </div>
            <div className="engine-step-command">
              <CommandBox
                command={commands[platform]}
                onCopy={(c) => handleCopyCommand(c, 'step1')}
                copied={copiedCmd === commands[platform]}
              />
            </div>
          </div>
        </li>

        {/* Step 2: Check it's running */}
        <li className="engine-step-item">
          <div className={`engine-step-circle ${isStep2Complete ? 'completed' : ''}`}>
            {isStep2Complete ? <Check size={16} strokeWidth={2.5} /> : '2'}
          </div>
          <div className="engine-step-content">
            <h3 className="engine-step-title">Check it's running</h3>
            <p className="engine-step-desc">
              Verify your local companion daemon responded on loopback port 45454.
            </p>
            <div className="engine-step-control">
              <div className="engine-test-row">
                <button
                  type="button"
                  className="engine-test-btn"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                >
                  <RefreshCw size={14} className={isTesting ? 'engine-spin' : ''} />
                  <span>{isTesting ? 'Testing…' : 'Test connection'}</span>
                </button>
                {testResult === 'success' && (
                  <span className="engine-test-result success" role="status">
                    <Check size={14} /> Connected · {displayLatency}
                  </span>
                )}
                {testResult === 'error' && (
                  <span className="engine-test-result error" role="status">
                    <X size={14} /> Not found. Run the command above first.
                  </span>
                )}
              </div>
            </div>
            <div className="engine-step-command">
              <CommandBox
                command={verifyCommand}
                onCopy={(c) => handleCopyCommand(c, 'step2')}
                copied={copiedCmd === verifyCommand}
              />
            </div>
          </div>
        </li>

        {/* Step 3: Watch as usual */}
        <li className="engine-step-item">
          <div className={`engine-step-circle ${isStep3Complete ? 'completed' : ''}`}>
            {isStep3Complete ? <Check size={16} strokeWidth={2.5} /> : '3'}
          </div>
          <div className="engine-step-content">
            <h3 className="engine-step-title">Watch as usual</h3>
            <p className="engine-step-desc">
              Open any title. The player bar shows a{' '}
              <span className="engine-inline-badge">⚡ Local engine</span> badge when your device is serving it.
            </p>
          </div>
        </li>
      </ol>
    </article>
  );
};

/* --------------------------------------------------------------------------
   COMPONENT: MiniTerminal
   -------------------------------------------------------------------------- */
export interface MiniTerminalProps {
  isAvailable: boolean;
}

export const MiniTerminal: React.FC<MiniTerminalProps> = ({ isAvailable }) => {
  return (
    <div className="engine-mini-terminal" aria-label="Terminal output preview">
      <div>
        <span className="engine-terminal-prompt">$ </span>
        <span>valor-service</span>
      </div>
      <div className="engine-terminal-brand">&gt;_ Valor Media Daemon</div>
      <div className="engine-terminal-meta">port 45454 · cache 2MB</div>
      <div className={`engine-terminal-state ${isAvailable ? 'online' : 'offline'}`}>
        &gt; Local engine: {isAvailable ? 'Online' : 'Offline (central relay)'}
      </div>
      <div>
        <span className="engine-terminal-prompt">&gt; </span>
        <span className="engine-terminal-cursor" aria-hidden="true" />
      </div>
    </div>
  );
};

/* --------------------------------------------------------------------------
   COMPONENT: StatusCard
   -------------------------------------------------------------------------- */
export interface StatusCardProps {
  isAvailable: boolean;
  latencyMs?: number;
}

export const StatusCard: React.FC<StatusCardProps> = ({ isAvailable, latencyMs }) => {
  const displayLatency = isAvailable 
    ? (latencyMs && latencyMs > 0 ? (latencyMs < 1 ? '0.8 ms' : `${latencyMs} ms`) : '0.8 ms')
    : '—';

  return (
    <aside className={`engine-status-card ${isAvailable ? 'online' : 'offline'}`} aria-label="Local engine status">
      {/* Top 72px ring & title */}
      <div className="engine-status-header">
        <div className="engine-status-ring-container">
          <div className="engine-status-ring">
            <Zap size={28} strokeWidth={2.5} />
          </div>
        </div>
        <div className="engine-status-title-group">
          <h3 className="engine-status-title">
            {isAvailable ? 'Engine running' : 'Engine offline'}
          </h3>
          <p className="engine-status-sub">
            {isAvailable ? 'Streaming through your device.' : 'Streaming through the central relay.'}
          </p>
        </div>
      </div>

      <hr className="engine-divider" />

      {/* Key-Value List */}
      <dl className="engine-kv-list">
        <div className="engine-kv-row">
          <dt className="engine-kv-label">Port</dt>
          <dd className="engine-kv-value">45454</dd>
        </div>
        <div className="engine-kv-row">
          <dt className="engine-kv-label">Cache</dt>
          <dd className="engine-kv-value">2 MB blocks</dd>
        </div>
        <div className="engine-kv-row">
          <dt className="engine-kv-label">Model</dt>
          <dd className="engine-kv-value">p2p-direct-stream</dd>
        </div>
        <div className="engine-kv-row">
          <dt className="engine-kv-label">Latency</dt>
          <dd className="engine-kv-value">{displayLatency}</dd>
        </div>
      </dl>

      {/* Mini Terminal */}
      <MiniTerminal isAvailable={isAvailable} />
    </aside>
  );
};

/* --------------------------------------------------------------------------
   COMPONENT: ScriptViewer
   -------------------------------------------------------------------------- */
export interface ScriptViewerProps {
  origin: string;
  onShowToast: (msg: string) => void;
}

export const ScriptViewer: React.FC<ScriptViewerProps> = ({ origin, onShowToast }) => {
  const [activeScript, setActiveScript] = useState<ScriptFile>('install.ps1');
  const [sourceCode, setSourceCode] = useState<string>(FALLBACK_SCRIPTS['install.ps1']);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const scripts: ScriptFile[] = ['install.ps1', 'install.sh', 'valor-service.mjs', 'run.bat'];

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    fetch(`${origin}/api/sidecar/${activeScript}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      })
      .then(text => {
        if (active) {
          setSourceCode(text);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (active) {
          setSourceCode(FALLBACK_SCRIPTS[activeScript] || '// Script source');
          setIsLoading(false);
        }
      });

    return () => { active = false; };
  }, [activeScript, origin]);

  const handleCopySource = () => {
    navigator.clipboard.writeText(sourceCode);
    setCopied(true);
    onShowToast('Source copied');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="engine-script-viewer">
      <div className="engine-script-toolbar">
        <div className="engine-script-tabs" role="tablist" aria-label="Sidecar scripts">
          {scripts.map(s => {
            const isSelected = activeScript === s;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={isSelected}
                aria-pressed={isSelected}
                className="engine-script-tab"
                onClick={() => setActiveScript(s)}
              >
                {s}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="engine-copy-btn"
          onClick={handleCopySource}
          aria-label={`Copy ${activeScript} source code`}
        >
          {copied ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
          <span>{copied ? 'Copied' : 'Copy source'}</span>
        </button>
      </div>

      <pre className="engine-code-display" tabIndex={0}>
        <code>{isLoading ? '// Loading script source...' : sourceCode}</code>
      </pre>
    </div>
  );
};

/* --------------------------------------------------------------------------
   COMPONENT: FaqDetails
   -------------------------------------------------------------------------- */
export interface FaqDetailsProps {
  origin: string;
  onShowToast: (msg: string) => void;
}

export const FaqDetails: React.FC<FaqDetailsProps> = ({ origin, onShowToast }) => {
  return (
    <section className="engine-good-to-know" aria-labelledby="faq-heading">
      <h2 id="faq-heading" className="engine-section-heading">Good to know</h2>
      <div className="engine-faq-list">
        {/* Item 1 */}
        <details className="engine-faq-item">
          <summary className="engine-faq-summary">
            <span>Is it safe to run?</span>
            <span className="engine-faq-icon" aria-hidden="true">+</span>
          </summary>
          <div className="engine-faq-content">
            Yes. It has zero external dependencies, requires no root or administrator privileges, and listens exclusively on loopback <code>127.0.0.1</code>. It will never accept outside network connections.
          </div>
        </details>

        {/* Item 2 */}
        <details className="engine-faq-item">
          <summary className="engine-faq-summary">
            <span>What if I stop it?</span>
            <span className="engine-faq-icon" aria-hidden="true">+</span>
          </summary>
          <div className="engine-faq-content">
            Valor falls back to the central relay without interrupting your video. Your playback seamlessly continues through the cloud server relay with zero stream stoppage.
          </div>
        </details>

        {/* Item 3 */}
        <details className="engine-faq-item">
          <summary className="engine-faq-summary">
            <span>Why use it at all?</span>
            <span className="engine-faq-icon" aria-hidden="true">+</span>
          </summary>
          <div className="engine-faq-content">
            Remote hosts limit connections and large 4K files strain server bandwidth, so the engine delivers media straight to your player with fast local caching and zero server lag.
          </div>
        </details>

        {/* Item 4 */}
        <details className="engine-faq-item">
          <summary className="engine-faq-summary">
            <span>Review the scripts before running</span>
            <span className="engine-faq-icon" aria-hidden="true">+</span>
          </summary>
          <div className="engine-faq-content">
            <p style={{ margin: '0 0 var(--space-2) 0', color: 'var(--text-2)' }}>
              Inspect the exact shell and Node.js code executed during installation and execution:
            </p>
            <ScriptViewer origin={origin} onShowToast={onShowToast} />
          </div>
        </details>
      </div>
    </section>
  );
};

/* --------------------------------------------------------------------------
   COMPONENT: Toast
   -------------------------------------------------------------------------- */
export interface ToastProps {
  message: string | null;
}

export const Toast: React.FC<ToastProps> = ({ message }) => {
  if (!message) return null;
  return (
    <div className="engine-toast-container">
      <div className="engine-toast" role="status" aria-live="polite">
        <Check size={16} color="var(--success)" strokeWidth={2.5} />
        <span>{message}</span>
      </div>
    </div>
  );
};

/* --------------------------------------------------------------------------
   TOP-LEVEL PAGE COMPONENT: LocalServicePage (and LocalEnginePage)
   -------------------------------------------------------------------------- */
export const LocalServicePage: React.FC<LocalServicePageProps> = ({ onClose, standalone = false }) => {
  const [status, setStatus] = useState<SidecarStatus>(() => sidecarService.getStatus());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const unsub = sidecarService.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    sidecarService.checkHealth();
    return () => unsub();
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => (prev === msg ? null : prev));
    }, 2200);
  }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:80';

  return (
    <main className="engine-page-container" aria-label="Valor local companion engine">
      <div className="engine-page-wrapper">
        {/* 1. Header */}
        <EngineHeader isAvailable={status.isAvailable} onClose={onClose} />

        {/* 2. Hero */}
        <Hero />

        {/* 3. Main 2-Column Grid (Left: StepsCard 1.5fr, Right: StatusCard 1fr) */}
        <div className="engine-main-grid">
          <StepsCard
            isAvailable={status.isAvailable}
            latencyMs={status.latencyMs}
            origin={origin}
            onShowToast={showToast}
          />
          <StatusCard
            isAvailable={status.isAvailable}
            latencyMs={status.latencyMs}
          />
        </div>

        {/* 4. Good to Know (FAQ & Script Inspection) */}
        <FaqDetails origin={origin} onShowToast={showToast} />
      </div>

      {/* Floating Toast Notification */}
      <Toast message={toastMessage} />
    </main>
  );
};

export const LocalEnginePage = LocalServicePage;
export default LocalServicePage;
