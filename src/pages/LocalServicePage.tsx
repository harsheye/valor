import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, 
  Terminal, 
  Check, 
  Copy, 
  RefreshCw, 
  ShieldCheck, 
  Server, 
  HardDrive, 
  ExternalLink, 
  CheckCircle2, 
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  Play,
  Cpu,
  Download
} from 'lucide-react';
import { sidecarService, type SidecarStatus } from '../services/remote/sidecarService';

interface LocalServicePageProps {
  onClose?: () => void;
  standalone?: boolean;
}

export const LocalServicePage: React.FC<LocalServicePageProps> = ({ onClose, standalone = false }) => {
  const [status, setStatus] = useState<SidecarStatus>(sidecarService.getStatus());
  const [activeTab, setActiveTab] = useState<'windows' | 'mac' | 'node' | 'bat'>('windows');
  const [activeSection, setActiveSection] = useState<'overview' | 'install' | 'verify' | 'features' | 'faq'>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheClearMessage, setCacheClearMessage] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{ loading: boolean; data: any; latency?: number; error?: string } | null>(null);

  const installRef = useRef<HTMLDivElement>(null);
  const verifyRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const faqRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = sidecarService.subscribe((newStatus) => {
      setStatus(newStatus);
    });
    sidecarService.checkHealth();
    return () => unsub();
  }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:80';

  const commands = {
    windows: `irm ${origin}/api/sidecar/install.ps1 | iex`,
    mac: `curl -fsSL ${origin}/api/sidecar/install.sh | bash`,
    node: `curl -fsSL ${origin}/api/sidecar/valor-service.mjs -o valor-service.mjs && node valor-service.mjs`,
    bat: `curl -fsSL ${origin}/api/sidecar/run.bat -o run.bat && run.bat`,
    statusCurl: `curl -s http://127.0.0.1:45454/api/sidecar/status`
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const handleTestPing = async () => {
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
      setPingResult({ loading: false, data: null, error: e?.message || 'Connection refused (service offline)' });
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
        setCacheClearMessage('Cache flushed successfully');
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

  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>, sec: 'overview' | 'install' | 'verify' | 'features' | 'faq') => {
    setActiveSection(sec);
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#000000',
      color: '#ededed',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      letterSpacing: '-0.01em',
      overflowX: 'hidden'
    }}>
      {/* Top Navigation Bar (Codex Style) */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{
          maxWidth: '1180px',
          margin: '0 auto',
          padding: '0 24px',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {standalone ? (
              <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ffffff', textDecoration: 'none', fontWeight: 700, fontSize: '1.1rem' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#000',
                  fontWeight: 900
                }}>V</div>
                <span>Valor Engine</span>
              </a>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, fontSize: '1.1rem' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '6px',
                  background: 'linear-gradient(135deg, #10b981, #06b6d4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#000',
                  fontWeight: 900
                }}>V</div>
                <span>Valor Engine</span>
              </div>
            )}
          </div>

          {/* Center Nav Links (Codex style with white underline on active) */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '28px' }} className="service-nav-links">
            <button
              onClick={() => { setActiveSection('overview'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
              style={{
                background: 'none',
                border: 'none',
                color: activeSection === 'overview' ? '#ffffff' : '#888888',
                fontWeight: activeSection === 'overview' ? 600 : 400,
                fontSize: '0.875rem',
                cursor: 'pointer',
                padding: '6px 0',
                position: 'relative'
              }}
            >
              Overview
              {activeSection === 'overview' && (
                <span style={{ position: 'absolute', bottom: -12, left: 0, right: 0, height: '2px', backgroundColor: '#ffffff' }} />
              )}
            </button>
            <button
              onClick={() => scrollToSection(installRef, 'install')}
              style={{
                background: 'none',
                border: 'none',
                color: activeSection === 'install' ? '#ffffff' : '#888888',
                fontWeight: activeSection === 'install' ? 600 : 400,
                fontSize: '0.875rem',
                cursor: 'pointer',
                padding: '6px 0',
                position: 'relative'
              }}
            >
              Install
              {activeSection === 'install' && (
                <span style={{ position: 'absolute', bottom: -12, left: 0, right: 0, height: '2px', backgroundColor: '#ffffff' }} />
              )}
            </button>
            <button
              onClick={() => scrollToSection(verifyRef, 'verify')}
              style={{
                background: 'none',
                border: 'none',
                color: activeSection === 'verify' ? '#ffffff' : '#888888',
                fontWeight: activeSection === 'verify' ? 600 : 400,
                fontSize: '0.875rem',
                cursor: 'pointer',
                padding: '6px 0',
                position: 'relative'
              }}
            >
              Verification
              {activeSection === 'verify' && (
                <span style={{ position: 'absolute', bottom: -12, left: 0, right: 0, height: '2px', backgroundColor: '#ffffff' }} />
              )}
            </button>
            <button
              onClick={() => scrollToSection(featuresRef, 'features')}
              style={{
                background: 'none',
                border: 'none',
                color: activeSection === 'features' ? '#ffffff' : '#888888',
                fontWeight: activeSection === 'features' ? 600 : 400,
                fontSize: '0.875rem',
                cursor: 'pointer',
                padding: '6px 0',
                position: 'relative'
              }}
            >
              Features
              {activeSection === 'features' && (
                <span style={{ position: 'absolute', bottom: -12, left: 0, right: 0, height: '2px', backgroundColor: '#ffffff' }} />
              )}
            </button>
            <button
              onClick={() => scrollToSection(faqRef, 'faq')}
              style={{
                background: 'none',
                border: 'none',
                color: activeSection === 'faq' ? '#ffffff' : '#888888',
                fontWeight: activeSection === 'faq' ? 600 : 400,
                fontSize: '0.875rem',
                cursor: 'pointer',
                padding: '6px 0',
                position: 'relative'
              }}
            >
              FAQ
              {activeSection === 'faq' && (
                <span style={{ position: 'absolute', bottom: -12, left: 0, right: 0, height: '2px', backgroundColor: '#ffffff' }} />
              )}
            </button>
          </nav>

          {/* Right Status Pill + Back button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 12px',
              borderRadius: '20px',
              backgroundColor: status.isAvailable ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
              border: `1px solid ${status.isAvailable ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              fontSize: '0.75rem',
              fontWeight: 600,
              color: status.isAvailable ? '#34d399' : '#f87171'
            }}>
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: status.isAvailable ? '#10b981' : '#ef4444',
                boxShadow: status.isAvailable ? '0 0 8px #10b981' : 'none'
              }} />
              <span>{status.isAvailable ? `Online (:45454)` : `Offline`}</span>
            </div>

            {standalone ? (
              <a
                href="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  transition: 'opacity 0.15s'
                }}
              >
                Launch Player <ArrowRight size={13} />
              </a>
            ) : onClose ? (
              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {/* Hero Section (OpenAI Codex / Homebrew Hero) */}
      <section style={{
        maxWidth: '1040px',
        margin: '0 auto',
        padding: '72px 24px 48px 24px',
        textAlign: 'center'
      }}>
        {/* Eyebrow */}
        <div style={{
          display: 'inline-block',
          fontSize: '0.825rem',
          fontWeight: 600,
          color: '#888888',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: '18px'
        }}>
          Valor Companion Service
        </div>

        {/* Big Bold Headline */}
        <h1 style={{
          fontSize: 'clamp(2.4rem, 6vw, 4.4rem)',
          fontWeight: 800,
          lineHeight: 1.08,
          letterSpacing: '-0.04em',
          margin: '0 auto 24px auto',
          maxWidth: '880px',
          color: '#ffffff'
        }}>
          Stream, cache, and play media from your device
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 'clamp(1rem, 2vw, 1.25rem)',
          lineHeight: 1.5,
          color: '#8e8e93',
          maxWidth: '680px',
          margin: '0 auto 36px auto',
          fontWeight: 400
        }}>
          Download high-bitrate 4K & 1080p remote media blocks directly to your machine. 
          Zero server bandwidth load, sub-millisecond timeline seeking, and automatic embedded subtitles.
        </p>

        {/* Action Buttons (Codex style pill buttons) */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
          flexWrap: 'wrap',
          marginBottom: '54px'
        }}>
          <button
            onClick={() => scrollToSection(installRef, 'install')}
            style={{
              backgroundColor: '#ffffff',
              color: '#000000',
              padding: '12px 24px',
              borderRadius: '9999px',
              fontWeight: 600,
              fontSize: '0.95rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              border: 'none',
              cursor: 'pointer',
              transition: 'transform 0.15s, opacity 0.15s'
            }}
          >
            Install Engine <ArrowRight size={16} />
          </button>

          <button
            onClick={() => scrollToSection(verifyRef, 'verify')}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              color: '#ffffff',
              padding: '12px 24px',
              borderRadius: '9999px',
              fontWeight: 600,
              fontSize: '0.95rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              cursor: 'pointer',
              transition: 'background 0.15s'
            }}
          >
            Check Status <Zap size={15} color={status.isAvailable ? '#10b981' : '#f59e0b'} />
          </button>
        </div>

        {/* macOS Terminal Window (Exactly like screenshot) */}
        <div style={{
          maxWidth: '820px',
          margin: '0 auto',
          textAlign: 'left',
          borderRadius: '14px',
          backgroundColor: '#0a0d14',
          border: '1px solid #1a2234',
          boxShadow: '0 25px 65px -15px rgba(0, 0, 0, 0.8), 0 0 30px rgba(6, 182, 212, 0.06)',
          overflow: 'hidden'
        }}>
          {/* Terminal Title Bar */}
          <div style={{
            backgroundColor: '#06090f',
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #161e2e'
          }}>
            {/* macOS Three Dots */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ff5f56' }} />
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
              <span style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#27c93f' }} />
              <span style={{ marginLeft: '12px', fontSize: '0.75rem', color: '#64748b', fontFamily: 'monospace' }}>
                valor-service — port 45454
              </span>
            </div>

            {/* Terminal Tab Switcher */}
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setActiveTab('windows')}
                style={{
                  padding: '3px 10px',
                  borderRadius: '5px',
                  background: activeTab === 'windows' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                  border: 'none',
                  color: activeTab === 'windows' ? '#fff' : '#64748b',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer'
                }}
              >
                powershell
              </button>
              <button
                onClick={() => setActiveTab('mac')}
                style={{
                  padding: '3px 10px',
                  borderRadius: '5px',
                  background: activeTab === 'mac' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                  border: 'none',
                  color: activeTab === 'mac' ? '#fff' : '#64748b',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer'
                }}
              >
                bash
              </button>
              <button
                onClick={() => setActiveTab('node')}
                style={{
                  padding: '3px 10px',
                  borderRadius: '5px',
                  background: activeTab === 'node' ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                  border: 'none',
                  color: activeTab === 'node' ? '#fff' : '#64748b',
                  fontSize: '0.75rem',
                  fontFamily: 'monospace',
                  cursor: 'pointer'
                }}
              >
                node
              </button>
            </div>
          </div>

          {/* Terminal Body */}
          <div style={{
            padding: '24px 28px',
            fontFamily: '"SF Mono", "Monaco", "Cascadia Code", "Menlo", monospace',
            fontSize: '0.875rem',
            lineHeight: 1.6,
            color: '#cbd5e1'
          }}>
            {/* Command Line with Prompt */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <span style={{ color: '#38bdf8' }}>$</span>
                <span style={{ color: activeTab === 'windows' ? '#38bdf8' : activeTab === 'mac' ? '#34d399' : '#fbbf24', fontWeight: 600 }}>
                  {activeTab === 'windows' && commands.windows}
                  {activeTab === 'mac' && commands.mac}
                  {activeTab === 'node' && commands.node}
                  {activeTab === 'bat' && commands.bat}
                </span>
              </div>
              <button
                onClick={() => copyToClipboard(
                  activeTab === 'windows' ? commands.windows : activeTab === 'mac' ? commands.mac : commands.node,
                  'hero-cmd'
                )}
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  background: copiedKey === 'hero-cmd' ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  color: '#fff',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s'
                }}
              >
                {copiedKey === 'hero-cmd' ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedKey === 'hero-cmd' ? 'Copied' : 'Copy'}</span>
              </button>
            </div>

            {/* ASCII Box Status Display */}
            <div style={{
              color: '#64748b',
              marginBottom: '20px',
              border: '1px dashed #1e293b',
              borderRadius: '8px',
              padding: '14px 18px',
              backgroundColor: '#050811'
            }}>
              <div style={{ color: '#e2e8f0', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span>&gt;_ Valor Companion Daemon</span>
                <span style={{
                  fontSize: '0.7rem',
                  color: status.isAvailable ? '#34d399' : '#f87171',
                  backgroundColor: status.isAvailable ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}>
                  {status.isAvailable ? 'RUNNING' : 'STOPPED'}
                </span>
              </div>
              <div style={{ marginTop: '8px', fontSize: '0.8rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px' }}>
                <div><span style={{ color: '#64748b' }}>listen:</span> <span style={{ color: '#38bdf8' }}>http://127.0.0.1:45454</span></div>
                <div><span style={{ color: '#64748b' }}>latency:</span> <span style={{ color: '#34d399' }}>{status.latencyMs ?? (status.isAvailable ? 1 : 0)} ms</span></div>
                <div><span style={{ color: '#64748b' }}>cache:</span> <span style={{ color: '#fbbf24' }}>{status.cacheBlocks ?? 0} blocks ({status.cacheSizeBytes ? (status.cacheSizeBytes / (1024 * 1024)).toFixed(1) : 0} MB)</span></div>
                <div><span style={{ color: '#64748b' }}>mode:</span> <span style={{ color: '#a78bfa' }}>Zero Server Bandwidth</span></div>
              </div>
            </div>

            {/* Terminal Instructions / Sub-lines */}
            <div style={{ color: '#94a3b8', fontSize: '0.825rem', lineHeight: 1.8 }}>
              <div><span style={{ color: '#e2e8f0' }}>/check</span> &nbsp;&nbsp;&nbsp;&nbsp;Pings local health check at http://127.0.0.1:45454/api/sidecar/status</div>
              <div><span style={{ color: '#e2e8f0' }}>/cache</span> &nbsp;&nbsp;&nbsp;&nbsp;2MB sliding chunk cache keeps seeks instant with 0 re-downloads</div>
              <div><span style={{ color: '#e2e8f0' }}>/subs</span> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Embedded WebVTT tracks decoded locally by your CPU</div>
            </div>

            {/* Live Interactive Prompt */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: '1px solid #161e2e',
              color: '#64748b',
              fontSize: '0.8rem'
            }}>
              <span style={{ color: '#34d399' }}>&gt;</span>
              <span>Local Service status: <b style={{ color: status.isAvailable ? '#34d399' : '#f87171' }}>{status.isAvailable ? 'Connected & Active' : 'Offline (Awaiting Installation)'}</b></span>
              <span style={{ marginLeft: 'auto' }}>
                <button
                  onClick={handleTestPing}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38bdf8',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    textDecoration: 'underline'
                  }}
                >
                  Run /check now
                </button>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION: Install (Homebrew Style Large Copy Banner) */}
      <section ref={installRef} style={{
        maxWidth: '980px',
        margin: '0 auto',
        padding: '60px 24px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', margin: '0 0 10px 0' }}>
            Install Valor Companion
          </h2>
          <p style={{ color: '#8e8e93', fontSize: '1rem', margin: 0 }}>
            Paste the command in your macOS Terminal, Linux shell, or Windows PowerShell prompt.
          </p>
        </div>

        {/* Tab selection for installer */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '20px' }}>
          {[
            { id: 'windows', label: 'Windows (PowerShell)' },
            { id: 'mac', label: 'macOS & Linux (Bash)' },
            { id: 'node', label: 'Node.js (Cross-Platform)' },
            { id: 'bat', label: 'Direct .bat File' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              style={{
                padding: '8px 18px',
                borderRadius: '9999px',
                backgroundColor: activeTab === t.id ? '#ffffff' : 'rgba(255, 255, 255, 0.06)',
                color: activeTab === t.id ? '#000000' : '#8e8e93',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.15s'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Big Homebrew Style Command Box */}
        <div style={{
          position: 'relative',
          backgroundColor: '#0a0d14',
          border: '1px solid #1a2234',
          borderRadius: '12px',
          padding: '20px 60px 20px 24px',
          fontFamily: '"SF Mono", Monaco, "Cascadia Code", monospace',
          fontSize: '1rem',
          color: activeTab === 'windows' ? '#38bdf8' : activeTab === 'mac' ? '#34d399' : '#fbbf24',
          wordBreak: 'break-all',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
        }}>
          {activeTab === 'windows' && commands.windows}
          {activeTab === 'mac' && commands.mac}
          {activeTab === 'node' && commands.node}
          {activeTab === 'bat' && commands.bat}

          <button
            onClick={() => copyToClipboard(
              activeTab === 'windows' ? commands.windows : activeTab === 'mac' ? commands.mac : activeTab === 'node' ? commands.node : commands.bat,
              'main-install-btn'
            )}
            style={{
              position: 'absolute',
              right: '16px',
              top: '50%',
              transform: 'translateY(-50%)',
              backgroundColor: copiedKey === 'main-install-btn' ? '#10b981' : 'rgba(255, 255, 255, 0.12)',
              border: 'none',
              borderRadius: '8px',
              padding: '8px 14px',
              cursor: 'pointer',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '0.8rem',
              fontWeight: 600,
              transition: 'all 0.2s'
            }}
          >
            {copiedKey === 'main-install-btn' ? <Check size={15} /> : <Copy size={15} />}
            <span>{copiedKey === 'main-install-btn' ? 'Copied' : 'Copy'}</span>
          </button>
        </div>

        {activeTab === 'bat' && (
          <div style={{ marginTop: '16px', textAlign: 'center' }}>
            <a
              href={`${origin}/api/sidecar/run.bat`}
              download="run.bat"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                color: '#38bdf8',
                fontSize: '0.875rem',
                textDecoration: 'none',
                fontWeight: 600
              }}
            >
              <Download size={15} /> Click here to directly download run.bat launcher
            </a>
          </div>
        )}
      </section>

      {/* SECTION: Features / Honeybrew Grid */}
      <section ref={featuresRef} style={{
        maxWidth: '1040px',
        margin: '0 auto',
        padding: '60px 24px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', margin: '0 0 10px 0' }}>
            What does Valor Companion do?
          </h2>
          <p style={{ color: '#8e8e93', fontSize: '1rem', margin: 0 }}>
            Architected for maximum playback speed with zero server dependency.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: '24px'
        }}>
          {/* Card 1 */}
          <div style={{
            backgroundColor: '#0a0d14',
            border: '1px solid #1a2234',
            borderRadius: '14px',
            padding: '28px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'rgba(16, 185, 129, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10b981',
              marginBottom: '18px'
            }}>
              <Zap size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', margin: '0 0 8px 0' }}>
              0% Server Bandwidth Load
            </h3>
            <p style={{ color: '#8e8e93', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
              Instead of the central server having to download and forward gigabytes of video packets to each user, your machine downloads the stream directly from the source host.
            </p>
          </div>

          {/* Card 2 */}
          <div style={{
            backgroundColor: '#0a0d14',
            border: '1px solid #1a2234',
            borderRadius: '14px',
            padding: '28px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'rgba(56, 189, 248, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#38bdf8',
              marginBottom: '18px'
            }}>
              <HardDrive size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', margin: '0 0 8px 0' }}>
              2MB Sliding Block Cache
            </h3>
            <p style={{ color: '#8e8e93', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
              Smart sliding window memory cache downloads chunks in 2MB blocks. When seeking or rewinding, cached chunks serve with &lt;1ms latency straight from memory.
            </p>
          </div>

          {/* Card 3 */}
          <div style={{
            backgroundColor: '#0a0d14',
            border: '1px solid #1a2234',
            borderRadius: '14px',
            padding: '28px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'rgba(167, 139, 250, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#a78bfa',
              marginBottom: '18px'
            }}>
              <Cpu size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', margin: '0 0 8px 0' }}>
              Local WebVTT Subtitle Slicing
            </h3>
            <p style={{ color: '#8e8e93', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
              Embedded MKV subtitles and timed cues are extracted and decoded on your own CPU. Multi-language subtitles load instantaneously.
            </p>
          </div>

          {/* Card 4 */}
          <div style={{
            backgroundColor: '#0a0d14',
            border: '1px solid #1a2234',
            borderRadius: '14px',
            padding: '28px'
          }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              backgroundColor: 'rgba(251, 191, 36, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fbbf24',
              marginBottom: '18px'
            }}>
              <ShieldCheck size={22} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', margin: '0 0 8px 0' }}>
              Zero Dependencies & 100% Private
            </h3>
            <p style={{ color: '#8e8e93', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
              Pure Node.js standard library script. Requires no npm packages, no telemetry, and binds exclusively to <code>127.0.0.1</code> (localhost).
            </p>
          </div>
        </div>
      </section>

      {/* SECTION: Verify & Diagnostics */}
      <section ref={verifyRef} style={{
        maxWidth: '980px',
        margin: '0 auto',
        padding: '60px 24px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', margin: '0 0 10px 0' }}>
            Verification & Health Check
          </h2>
          <p style={{ color: '#8e8e93', fontSize: '1rem', margin: 0 }}>
            Ensure your companion engine is communicating with Valor.
          </p>
        </div>

        <div style={{
          backgroundColor: '#0a0d14',
          border: '1px solid #1a2234',
          borderRadius: '16px',
          padding: '28px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px', marginBottom: '24px' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{
                  width: '12px',
                  height: '12px',
                  borderRadius: '50%',
                  backgroundColor: status.isAvailable ? '#10b981' : '#ef4444',
                  boxShadow: status.isAvailable ? '0 0 12px #10b981' : 'none'
                }} />
                <span style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ffffff' }}>
                  {status.isAvailable ? 'Engine Online & Active' : 'Engine Offline'}
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: status.isAvailable ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: status.isAvailable ? '#34d399' : '#f87171'
                }}>
                  Port 45454
                </span>
              </div>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#8e8e93' }}>
                {status.isAvailable 
                  ? `Valor is actively routing remote playback through 127.0.0.1:45454.` 
                  : `Currently using central server fallback. Start the companion above to activate local streaming.`}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleTestPing}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '8px 16px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <RefreshCw size={14} className={pingResult?.loading ? 'animate-spin' : ''} />
                Ping Engine
              </button>

              {status.isAvailable && (
                <button
                  onClick={handleClearCache}
                  disabled={isClearingCache}
                  style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    padding: '8px 16px',
                    color: '#fca5a5',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  {isClearingCache ? 'Flushing...' : 'Flush Cache'}
                </button>
              )}
            </div>
          </div>

          {cacheClearMessage && (
            <div style={{ marginBottom: '16px', color: '#34d399', fontSize: '0.85rem' }}>
              ✓ {cacheClearMessage}
            </div>
          )}

          {/* Ping JSON Terminal Inspector */}
          {pingResult && (
            <div style={{
              backgroundColor: '#030712',
              border: `1px solid ${pingResult.error ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
              borderRadius: '8px',
              padding: '16px',
              fontFamily: 'monospace',
              fontSize: '0.825rem',
              marginTop: '12px'
            }}>
              {pingResult.loading && <span style={{ color: '#888888' }}>Pinging http://127.0.0.1:45454/api/sidecar/status...</span>}
              {pingResult.error && (
                <div style={{ color: '#f87171' }}>
                  ✗ Connection Refused: {pingResult.error}
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                    Run the install command above to launch the daemon.
                  </div>
                </div>
              )}
              {pingResult.data && (
                <div>
                  <div style={{ color: '#34d399', marginBottom: '6px', fontWeight: 600 }}>
                    ✓ HTTP 200 OK — {pingResult.latency} ms roundtrip
                  </div>
                  <pre style={{ margin: 0, color: '#38bdf8', overflowX: 'auto' }}>
                    {JSON.stringify(pingResult.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* SECTION: FAQ */}
      <section ref={faqRef} style={{
        maxWidth: '820px',
        margin: '0 auto',
        padding: '60px 24px 100px 24px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, color: '#ffffff', margin: '0 0 10px 0' }}>
            Frequently Asked Questions
          </h2>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', margin: '0 0 6px 0' }}>
              Why should I use the companion service?
            </h3>
            <p style={{ color: '#8e8e93', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
              Central servers have bandwidth caps and can choke when multiple people watch 1080p or 4K videos simultaneously. Running the companion turns your computer into its own download proxy, eliminating buffering and reducing server load to zero.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', margin: '0 0 6px 0' }}>
              Is it safe to run?
            </h3>
            <p style={{ color: '#8e8e93', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
              Yes. The companion is 100% open-source and zero-dependency. It binds strictly to <code>127.0.0.1</code> (localhost), meaning nobody outside your computer can access it.
            </p>
          </div>

          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', margin: '0 0 6px 0' }}>
              What happens if I stop the service?
            </h3>
            <p style={{ color: '#8e8e93', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>
              Valor automatically detects that the service is offline and seamlessly falls back to central server relay mode without breaking your playback.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '32px 24px',
        textAlign: 'center',
        color: '#64748b',
        fontSize: '0.85rem'
      }}>
        <div>Valor Media Engine • Zero-Server-Load Streaming Architecture</div>
      </footer>
    </div>
  );
};
