import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Terminal, 
  Check, 
  Copy, 
  RefreshCw, 
  ShieldCheck, 
  Server, 
  Cpu, 
  Wifi, 
  HardDrive, 
  ExternalLink, 
  CheckCircle2, 
  AlertCircle,
  Clock,
  ArrowRight,
  Code,
  Layers,
  ArrowLeft
} from 'lucide-react';
import { sidecarService, type SidecarStatus } from '../services/remote/sidecarService';

interface LocalServicePageProps {
  onClose?: () => void;
  standalone?: boolean;
}

export const LocalServicePage: React.FC<LocalServicePageProps> = ({ onClose, standalone = false }) => {
  const [status, setStatus] = useState<SidecarStatus>(sidecarService.getStatus());
  const [activeOs, setActiveOs] = useState<'windows' | 'mac' | 'node'>('windows');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheClearMessage, setCacheClearMessage] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{ loading: boolean; data: any; latency?: number; error?: string } | null>(null);

  useEffect(() => {
    const unsub = sidecarService.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    sidecarService.checkHealth();
    return () => unsub();
  }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:80';

  const commands = {
    windowsPowerShell: `irm ${origin}/api/sidecar/install.ps1 | iex`,
    macBash: `curl -fsSL ${origin}/api/sidecar/install.sh | bash`,
    nodeDirect: `curl -fsSL ${origin}/api/sidecar/valor-service.mjs -o valor-service.mjs && node valor-service.mjs`,
    windowsBat: `${origin}/api/sidecar/run.bat`,
    checkCurl: `curl -s http://127.0.0.1:45454/api/sidecar/status`,
    checkPowershell: `Invoke-RestMethod http://127.0.0.1:45454/api/sidecar/status`
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleTestConnection = async () => {
    setPingResult({ loading: true, data: null });
    const t0 = performance.now();
    try {
      const res = await fetch(`http://127.0.0.1:${status.port}/api/sidecar/status`, {
        signal: AbortSignal.timeout(2000)
      });
      const latency = Math.round(performance.now() - t0);
      if (res.ok) {
        const json = await res.json();
        setPingResult({ loading: false, data: json, latency });
      } else {
        setPingResult({ loading: false, data: null, error: `HTTP ${res.status} ${res.statusText}` });
      }
    } catch (e: any) {
      setPingResult({ loading: false, data: null, error: e?.message || 'Connection refused (service not running)' });
    }
    await sidecarService.checkHealth();
  };

  const handleClearCache = async () => {
    if (!status.isAvailable) return;
    setIsClearingCache(true);
    setCacheClearMessage(null);
    try {
      const res = await fetch(`http://127.0.0.1:${status.port}/api/sidecar/clear-cache`, { method: 'POST' });
      if (res.ok) {
        setCacheClearMessage('Cache flushed successfully!');
        await sidecarService.checkHealth();
      } else {
        setCacheClearMessage('Failed to flush cache');
      }
    } catch {
      setCacheClearMessage('Could not connect to service');
    } finally {
      setIsClearingCache(false);
      setTimeout(() => setCacheClearMessage(null), 3000);
    }
  };

  return (
    <div className="local-service-page-container" style={{
      maxWidth: '1120px',
      margin: '0 auto',
      padding: standalone ? '40px 24px 80px 24px' : '24px 20px 60px 20px',
      color: '#e2e8f0',
      minHeight: '100vh',
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif'
    }}>
      {/* Standalone navigation bar */}
      {standalone && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '32px',
          paddingBottom: '20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <a
            href="/"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              color: '#94a3b8',
              textDecoration: 'none',
              fontSize: '0.9rem',
              fontWeight: 500,
              padding: '8px 14px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              transition: 'all 0.2s'
            }}
          >
            <ArrowLeft size={16} /> Back to Valor Player
          </a>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              display: 'inline-block',
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: status.isAvailable ? '#10b981' : '#64748b',
              boxShadow: status.isAvailable ? '0 0 10px #10b981' : 'none'
            }} />
            <span style={{ fontSize: '0.85rem', color: status.isAvailable ? '#34d399' : '#94a3b8', fontWeight: 600 }}>
              {status.isAvailable ? 'Service Online (127.0.0.1:45454)' : 'Service Offline'}
            </span>
          </div>
        </div>
      )}

      {/* Main Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(6, 182, 212, 0.25))',
            border: '1px solid rgba(16, 185, 129, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 25px rgba(16, 185, 129, 0.25)',
            flexShrink: 0
          }}>
            <Zap size={28} color="#34d399" />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.9rem', fontWeight: 700, letterSpacing: '-0.02em', color: '#f8fafc' }}>
              Valor Local Companion Engine
            </h1>
            <p style={{ margin: '6px 0 0 0', fontSize: '0.95rem', color: '#94a3b8' }}>
              Download and stream 4K/1080p remote media through your own machine with 0% server bandwidth load.
            </p>
          </div>
        </div>

        {onClose && (
          <button 
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '8px',
              padding: '8px 16px',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontSize: '0.875rem'
            }}
          >
            Close
          </button>
        )}
      </div>

      {/* Live Status Card */}
      <div style={{
        background: status.isAvailable 
          ? 'linear-gradient(135deg, rgba(6, 78, 59, 0.5), rgba(15, 23, 42, 0.9))'
          : 'linear-gradient(135deg, rgba(30, 41, 59, 0.75), rgba(15, 23, 42, 0.95))',
        border: `1px solid ${status.isAvailable ? 'rgba(16, 185, 129, 0.45)' : 'rgba(148, 163, 184, 0.2)'}`,
        borderRadius: '16px',
        padding: '26px',
        marginBottom: '32px',
        boxShadow: status.isAvailable ? '0 12px 36px -10px rgba(16, 185, 129, 0.35)' : '0 10px 30px rgba(0, 0, 0, 0.3)',
        backdropFilter: 'blur(12px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{
              display: 'inline-block',
              width: '16px',
              height: '16px',
              borderRadius: '50%',
              backgroundColor: status.isAvailable ? '#10b981' : '#ef4444',
              boxShadow: status.isAvailable ? '0 0 16px #10b981' : '0 0 10px rgba(239, 68, 68, 0.6)'
            }} />
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc' }}>
                  {status.isAvailable ? 'Companion Engine Active & Running' : 'Companion Engine Offline'}
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  backgroundColor: status.isAvailable ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.15)',
                  color: status.isAvailable ? '#34d399' : '#f87171',
                  border: `1px solid ${status.isAvailable ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  fontWeight: 600
                }}>
                  {status.isAvailable ? 'Direct Local Route (Port 45454)' : 'Fallback: Central Server Relay'}
                </span>
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.875rem', color: status.isAvailable ? '#a7f3d0' : '#94a3b8' }}>
                {status.isAvailable 
                  ? 'Your streams and chunk cache are running directly on your machine. Central server bandwidth load: 0%.'
                  : 'Streams are currently relaying through the central server. Follow the instructions below to install or start your local engine.'}
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleTestConnection}
              disabled={status.checking}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                padding: '9px 16px',
                borderRadius: '8px',
                color: '#e2e8f0',
                fontSize: '0.85rem',
                cursor: 'pointer',
                fontWeight: 500,
                transition: 'all 0.2s'
              }}
            >
              <RefreshCw size={14} className={status.checking ? 'animate-spin' : ''} />
              {status.checking ? 'Testing...' : 'Check Status'}
            </button>

            {status.isAvailable && (
              <button
                onClick={handleClearCache}
                disabled={isClearingCache}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  padding: '9px 16px',
                  borderRadius: '8px',
                  color: '#fca5a5',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  fontWeight: 500,
                  transition: 'all 0.2s'
                }}
              >
                <HardDrive size={14} />
                {isClearingCache ? 'Flushing...' : 'Flush Cache'}
              </button>
            )}
          </div>
        </div>

        {cacheClearMessage && (
          <div style={{ marginTop: '14px', fontSize: '0.85rem', color: '#34d399' }}>
            ✓ {cacheClearMessage}
          </div>
        )}

        {/* Live Metrics Grid if available */}
        {status.isAvailable && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '14px',
            marginTop: '22px',
            paddingTop: '20px',
            borderTop: '1px solid rgba(16, 185, 129, 0.2)'
          }}>
            <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '14px 18px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Response Latency</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>
                {status.latencyMs ?? 1} ms
              </div>
            </div>
            <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '14px 18px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Block Cache</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
                {status.cacheBlocks ?? 0} blocks ({status.cacheSizeBytes ? (status.cacheSizeBytes / (1024 * 1024)).toFixed(1) : 0} MB)
              </div>
            </div>
            <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '14px 18px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Engine Version</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>
                v{status.version || '1.0.0'}
              </div>
            </div>
            <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '14px 18px', borderRadius: '10px' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Local Port</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, color: '#a78bfa', marginTop: '4px' }}>
                45454
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 1: How to Install and Run */}
      <div style={{
        backgroundColor: '#111827',
        border: '1px solid #1f2937',
        borderRadius: '16px',
        padding: '28px',
        marginBottom: '32px'
      }}>
        <div style={{ marginBottom: '22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            <Terminal size={16} /> Step 1: Installation & Launch
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 6px 0', color: '#f8fafc' }}>
            Choose Your Operating System
          </h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
            Run the 1-click command below. It downloads the self-contained daemon and runs it automatically on your device.
          </p>
        </div>

        {/* OS Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #374151', paddingBottom: '12px', marginBottom: '22px' }}>
          <button
            onClick={() => setActiveOs('windows')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              backgroundColor: activeOs === 'windows' ? '#2563eb' : 'transparent',
              color: activeOs === 'windows' ? '#fff' : '#94a3b8',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            Windows (PowerShell)
          </button>
          <button
            onClick={() => setActiveOs('mac')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              backgroundColor: activeOs === 'mac' ? '#2563eb' : 'transparent',
              color: activeOs === 'mac' ? '#fff' : '#94a3b8',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            macOS / Linux (Bash)
          </button>
          <button
            onClick={() => setActiveOs('node')}
            style={{
              padding: '8px 18px',
              borderRadius: '8px',
              backgroundColor: activeOs === 'node' ? '#2563eb' : 'transparent',
              color: activeOs === 'node' ? '#fff' : '#94a3b8',
              border: 'none',
              fontWeight: 600,
              fontSize: '0.875rem',
              cursor: 'pointer',
              transition: 'all 0.15s'
            }}
          >
            Manual / Node.js
          </button>
        </div>

        {/* Tab 1: Windows */}
        {activeOs === 'windows' && (
          <div>
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '8px' }}>
                Option A: 1-Click PowerShell Command (Recommended)
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 10px 0' }}>
                Press <kbd style={{ background: '#374151', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', color: '#fff' }}>Win + X</kbd>, select <b>Terminal</b> or <b>PowerShell</b>, and paste:
              </p>
              
              <div style={{
                position: 'relative',
                backgroundColor: '#030712',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '16px 54px 16px 18px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: '0.9rem',
                color: '#38bdf8',
                wordBreak: 'break-all'
              }}>
                {commands.windowsPowerShell}
                <button
                  onClick={() => copyToClipboard(commands.windowsPowerShell, 'win-ps')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: copiedKey === 'win-ps' ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    transition: 'all 0.2s'
                  }}
                  title="Copy command"
                >
                  {copiedKey === 'win-ps' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === 'win-ps' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div style={{ marginTop: '22px', paddingTop: '18px', borderTop: '1px solid #1f2937' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '8px' }}>
                Option B: Download Executable Batch Launcher
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 12px 0' }}>
                Download <code>run.bat</code> and double-click to start anytime:
              </p>
              <a
                href={`${origin}/api/sidecar/run.bat`}
                download="run.bat"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.4)',
                  padding: '9px 18px',
                  borderRadius: '8px',
                  color: '#60a5fa',
                  fontSize: '0.85rem',
                  textDecoration: 'none',
                  fontWeight: 600
                }}
              >
                <Terminal size={15} /> Download run.bat
              </a>
            </div>
          </div>
        )}

        {/* Tab 2: Mac / Linux */}
        {activeOs === 'mac' && (
          <div>
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '8px' }}>
                1-Click Bash Command
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 10px 0' }}>
                Open your terminal and paste the command:
              </p>

              <div style={{
                position: 'relative',
                backgroundColor: '#030712',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '16px 54px 16px 18px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: '0.9rem',
                color: '#34d399',
                wordBreak: 'break-all'
              }}>
                {commands.macBash}
                <button
                  onClick={() => copyToClipboard(commands.macBash, 'mac-bash')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: copiedKey === 'mac-bash' ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    transition: 'all 0.2s'
                  }}
                  title="Copy command"
                >
                  {copiedKey === 'mac-bash' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === 'mac-bash' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: Node direct */}
        {activeOs === 'node' && (
          <div>
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#f1f5f9', marginBottom: '8px' }}>
                Direct Node.js Execution (Zero npm Dependencies)
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '0 0 10px 0' }}>
                Requires Node.js 18+. Does NOT require npm install or any external packages:
              </p>

              <div style={{
                position: 'relative',
                backgroundColor: '#030712',
                border: '1px solid #1e293b',
                borderRadius: '10px',
                padding: '16px 54px 16px 18px',
                fontFamily: 'Consolas, Monaco, "Courier New", monospace',
                fontSize: '0.85rem',
                color: '#fbbf24',
                wordBreak: 'break-all'
              }}>
                {commands.nodeDirect}
                <button
                  onClick={() => copyToClipboard(commands.nodeDirect, 'node-direct')}
                  style={{
                    position: 'absolute',
                    right: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: copiedKey === 'node-direct' ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    transition: 'all 0.2s'
                  }}
                  title="Copy command"
                >
                  {copiedKey === 'node-direct' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === 'node-direct' ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: How to Check and Verify */}
      <div style={{
        backgroundColor: '#111827',
        border: '1px solid #1f2937',
        borderRadius: '16px',
        padding: '28px',
        marginBottom: '32px'
      }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            <CheckCircle2 size={16} /> Step 2: How to Check & Verify
          </div>
          <h2 style={{ fontSize: '1.35rem', fontWeight: 700, margin: '0 0 6px 0', color: '#f8fafc' }}>
            Verification & Diagnostics
          </h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#94a3b8' }}>
            Verify that your companion engine is listening and ready to accelerate media.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '18px' }}>
          {/* Method A: In Browser */}
          <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
              1. Direct Browser Test
            </div>
            <p style={{ fontSize: '0.825rem', color: '#94a3b8', margin: '0 0 12px 0' }}>
              Click to open the service health check directly in your browser:
            </p>
            <a
              href="http://127.0.0.1:45454/api/sidecar/status"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                color: '#38bdf8',
                fontSize: '0.85rem',
                textDecoration: 'underline'
              }}
            >
              http://127.0.0.1:45454/api/sidecar/status <ExternalLink size={13} />
            </a>
            <div style={{ marginTop: '10px', fontSize: '0.75rem', color: '#64748b' }}>
              Expected response: <code>&#123;"status": "ok", "version": "1.0.0"&#125;</code>
            </div>
          </div>

          {/* Method B: Terminal Curl */}
          <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
              2. Terminal Curl Check
            </div>
            <p style={{ fontSize: '0.825rem', color: '#94a3b8', margin: '0 0 10px 0' }}>
              Run in any command prompt:
            </p>
            <div style={{
              position: 'relative',
              background: '#030712',
              padding: '10px 42px 10px 12px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              color: '#34d399',
              fontFamily: 'monospace'
            }}>
              {commands.checkCurl}
              <button
                onClick={() => copyToClipboard(commands.checkCurl, 'chk-curl')}
                style={{
                  position: 'absolute',
                  right: '8px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer'
                }}
                title="Copy"
              >
                {copiedKey === 'chk-curl' ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              </button>
            </div>
          </div>

          {/* Method C: In-Player Indicator */}
          <div style={{ background: '#0a0f1d', border: '1px solid #1e293b', borderRadius: '12px', padding: '18px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '6px' }}>
              3. In-Player Badge
            </div>
            <p style={{ fontSize: '0.825rem', color: '#94a3b8', margin: '0 0 12px 0' }}>
              When playing any video in Valor, check the top bar:
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '16px',
                fontSize: '0.75rem',
                fontWeight: 600,
                backgroundColor: 'rgba(16, 185, 129, 0.2)',
                color: '#34d399',
                border: '1px solid rgba(16, 185, 129, 0.4)'
              }}>
                <Zap size={12} /> Local Engine
              </span>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>= Zero server load active</span>
            </div>
          </div>
        </div>

        {/* Live Diagnostics Ping Tester */}
        <div style={{ marginTop: '20px', paddingTop: '18px', borderTop: '1px solid #1f2937' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#cbd5e1' }}>
              Interactive Live Health Ping
            </span>
            <button
              onClick={handleTestConnection}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: '6px',
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={12} className={pingResult?.loading ? 'animate-spin' : ''} />
              Ping Local Service Now
            </button>
          </div>

          {pingResult && (
            <div style={{
              backgroundColor: '#030712',
              border: `1px solid ${pingResult.error ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
              borderRadius: '8px',
              padding: '14px 18px',
              fontSize: '0.85rem',
              fontFamily: 'monospace'
            }}>
              {pingResult.loading && <span style={{ color: '#94a3b8' }}>Pinging http://127.0.0.1:45454/api/sidecar/status...</span>}
              {pingResult.error && (
                <div style={{ color: '#f87171' }}>
                  ✗ Error: {pingResult.error}
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
                    Make sure you have started the service using the command in Step 1.
                  </div>
                </div>
              )}
              {pingResult.data && (
                <div>
                  <div style={{ color: '#34d399', marginBottom: '6px' }}>
                    ✓ 200 OK — Ping successful ({pingResult.latency} ms latency)
                  </div>
                  <pre style={{ margin: 0, color: '#38bdf8', fontSize: '0.8rem', overflowX: 'auto' }}>
                    {JSON.stringify(pingResult.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* SECTION 3: Architecture & Benefits */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px',
        marginBottom: '32px'
      }}>
        <div style={{
          backgroundColor: '#111827',
          border: '1px solid #1f2937',
          borderRadius: '14px',
          padding: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <Server size={22} color="#f59e0b" />
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#f8fafc' }}>
              Server Relay Mode (Default)
            </h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 16px 0' }}>
            When the companion is not running, the central Valor server downloads all high-bitrate media blocks, stores them in temporary RAM, and forwards them to your browser.
          </p>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.825rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            <li>May cause buffering during high server traffic</li>
            <li>Limited by central server egress bandwidth</li>
            <li>Increases server hosting costs & CPU usage</li>
          </ul>
        </div>

        <div style={{
          backgroundColor: '#111827',
          border: '1px solid rgba(16, 185, 129, 0.35)',
          borderRadius: '14px',
          padding: '24px',
          background: 'linear-gradient(180deg, rgba(16, 185, 129, 0.06), #111827)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <Zap size={22} color="#10b981" />
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#34d399' }}>
              Companion Engine Mode (Supercharged)
            </h3>
          </div>
          <p style={{ fontSize: '0.85rem', color: '#94a3b8', lineHeight: 1.5, margin: '0 0 16px 0' }}>
            Your device directly connects to the media provider, caches 2MB chunk blocks in local memory, and streams straight into the player with zero intermediaries.
          </p>
          <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.825rem', color: '#cbd5e1', lineHeight: 1.6 }}>
            <li><b style={{ color: '#34d399' }}>0% Server Load</b>: The central server bandwidth usage is zero.</li>
            <li><b style={{ color: '#34d399' }}>Instant Seek</b>: 2MB sliding chunk cache gives instant timeline jumps.</li>
            <li><b style={{ color: '#34d399' }}>Local Subtitles</b>: Extracts embedded WebVTT subtitles directly on your CPU.</li>
          </ul>
        </div>
      </div>

      {/* SECTION 4: Security & FAQ */}
      <div style={{
        backgroundColor: '#0f172a',
        border: '1px solid #1e293b',
        borderRadius: '14px',
        padding: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
          <ShieldCheck size={22} color="#38bdf8" />
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#f8fafc' }}>
            Privacy, Security & FAQ
          </h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>
              Is the companion safe to run?
            </div>
            <p style={{ fontSize: '0.825rem', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
              Yes. The companion is 100% open-source and zero-dependency. It binds exclusively to <code>127.0.0.1</code> (localhost), so nobody on your network or the internet can access it.
            </p>
          </div>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#e2e8f0', marginBottom: '4px' }}>
              What happens if I close the companion window?
            </div>
            <p style={{ fontSize: '0.825rem', color: '#94a3b8', margin: 0, lineHeight: 1.5 }}>
              Valor will automatically detect that the service is offline and seamlessly route your playback back through the central server without interrupting your video.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
