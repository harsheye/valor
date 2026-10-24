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
  Cpu,
  Download,
  Code2,
  FileCode,
  X,
  Eye,
  Activity
} from 'lucide-react';
import { sidecarService, type SidecarStatus } from '../services/remote/sidecarService';

interface LocalServicePageProps {
  onClose?: () => void;
  standalone?: boolean;
}

type ScriptType = 'install.ps1' | 'install.sh' | 'valor-service.mjs' | 'run.bat';

export const LocalServicePage: React.FC<LocalServicePageProps> = ({ onClose, standalone = false }) => {
  const [status, setStatus] = useState<SidecarStatus>(sidecarService.getStatus());
  const [activeTab, setActiveTab] = useState<'windows' | 'mac' | 'node' | 'bat'>('windows');
  const [activeSection, setActiveSection] = useState<'overview' | 'install' | 'inspect' | 'verify' | 'features'>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isClearingCache, setIsClearingCache] = useState(false);
  const [cacheClearMessage, setCacheClearMessage] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{ loading: boolean; data: any; latency?: number; error?: string } | null>(null);

  // Script Inspector State
  const [inspectScript, setInspectScript] = useState<ScriptType>('install.ps1');
  const [scriptContent, setScriptContent] = useState<string>('');
  const [isLoadingScript, setIsLoadingScript] = useState<boolean>(false);
  const [isScriptModalOpen, setIsScriptModalOpen] = useState<boolean>(false);

  const installRef = useRef<HTMLDivElement>(null);
  const verifyRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const inspectRef = useRef<HTMLDivElement>(null);

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

  // Load script content when inspector tab changes
  useEffect(() => {
    let isMounted = true;
    setIsLoadingScript(true);
    fetch(`${origin}/api/sidecar/${inspectScript}`)
      .then(res => res.text())
      .then(text => {
        if (isMounted) {
          setScriptContent(text);
          setIsLoadingScript(false);
        }
      })
      .catch(err => {
        if (isMounted) {
          setScriptContent(`// Could not load script: ${err.message}`);
          setIsLoadingScript(false);
        }
      });
    return () => { isMounted = false; };
  }, [inspectScript, origin]);

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
      setPingResult({ loading: false, data: null, error: e?.message || 'Connection refused (daemon not running on 127.0.0.1:45454)' });
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

  const scrollToSection = (ref: React.RefObject<HTMLDivElement | null>, sec: 'overview' | 'install' | 'inspect' | 'verify' | 'features') => {
    setActiveSection(sec);
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const openScriptModal = (script: ScriptType) => {
    setInspectScript(script);
    setIsScriptModalOpen(true);
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#0a0b10',
      backgroundImage: 'radial-gradient(circle at 50% -10%, rgba(229, 9, 20, 0.16) 0%, transparent 60%), radial-gradient(circle at 90% 40%, rgba(16, 185, 129, 0.08) 0%, transparent 45%)',
      color: '#f3f4f6',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      letterSpacing: '-0.015em',
      overflowX: 'hidden'
    }}>
      {/* Top Header Navbar (Valor Brand Theme) */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backgroundColor: 'rgba(10, 11, 16, 0.85)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0 24px',
          height: '68px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #e50914, #b20710)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: 900,
                fontSize: '1rem',
                boxShadow: '0 2px 10px rgba(229, 9, 20, 0.4)'
              }}>V</div>
              <span style={{ fontWeight: 800, fontSize: '1.2rem', color: '#ffffff', letterSpacing: '-0.02em' }}>
                Valor <span style={{ color: '#e50914', fontWeight: 600, fontSize: '0.9rem', marginLeft: '2px' }}>Engine</span>
              </span>
            </a>
          </div>

          {/* Center Navigation Links (Matching Valor's Red Accent Theme) */}
          <nav style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {[
              { id: 'overview', label: 'Overview', onClick: () => { setActiveSection('overview'); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
              { id: 'install', label: 'Install', onClick: () => scrollToSection(installRef, 'install') },
              { id: 'inspect', label: 'Inspect Scripts', onClick: () => scrollToSection(inspectRef, 'inspect') },
              { id: 'verify', label: 'Diagnostics', onClick: () => scrollToSection(verifyRef, 'verify') },
              { id: 'features', label: 'Features', onClick: () => scrollToSection(featuresRef, 'features') }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={tab.onClick}
                style={{
                  background: activeSection === tab.id ? 'rgba(229, 9, 20, 0.12)' : 'transparent',
                  border: activeSection === tab.id ? '1px solid rgba(229, 9, 20, 0.3)' : '1px solid transparent',
                  color: activeSection === tab.id ? '#ffffff' : '#9ca3af',
                  fontWeight: activeSection === tab.id ? 600 : 500,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  padding: '6px 14px',
                  borderRadius: '20px',
                  transition: 'all 0.15s ease'
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          {/* Right Status Pill + Back/Close button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div 
              onClick={() => scrollToSection(verifyRef, 'verify')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '5px 12px',
                borderRadius: '20px',
                backgroundColor: status.isAvailable ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
                border: `1px solid ${status.isAvailable ? 'rgba(16, 185, 129, 0.35)' : 'rgba(239, 68, 68, 0.35)'}`,
                fontSize: '0.78rem',
                fontWeight: 600,
                color: status.isAvailable ? '#34d399' : '#f87171',
                cursor: 'pointer'
              }}
              title="Click to check engine status"
            >
              <span style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: status.isAvailable ? '#10b981' : '#ef4444',
                boxShadow: status.isAvailable ? '0 0 10px #10b981' : 'none'
              }} />
              <span>{status.isAvailable ? 'Engine Online (:45454)' : 'Engine Offline'}</span>
            </div>

            {standalone ? (
              <a
                href="/"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#e50914',
                  color: '#ffffff',
                  padding: '7px 16px',
                  borderRadius: '20px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  boxShadow: '0 2px 12px rgba(229, 9, 20, 0.35)',
                  transition: 'all 0.15s ease'
                }}
              >
                Open Player <ArrowRight size={14} />
              </a>
            ) : onClose ? (
              <button
                onClick={onClose}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '20px',
                  padding: '6px 14px',
                  color: '#ffffff',
                  fontSize: '0.825rem',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section style={{
        maxWidth: '1080px',
        margin: '0 auto',
        padding: '70px 24px 50px 24px',
        textAlign: 'center'
      }}>
        {/* Eyebrow Badge */}
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 16px',
          borderRadius: '20px',
          backgroundColor: 'rgba(229, 9, 20, 0.12)',
          border: '1px solid rgba(229, 9, 20, 0.3)',
          color: '#ff4d4d',
          fontSize: '0.8rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: '22px'
        }}>
          <Zap size={14} color="#e50914" />
          Valor Companion Daemon
        </div>

        {/* Hero Title */}
        <h1 style={{
          fontSize: 'clamp(2.3rem, 5.5vw, 4.2rem)',
          fontWeight: 900,
          lineHeight: 1.1,
          letterSpacing: '-0.035em',
          margin: '0 auto 20px auto',
          maxWidth: '920px',
          color: '#ffffff'
        }}>
          Stream remote media directly from your device
        </h1>

        {/* Subtitle */}
        <p style={{
          fontSize: 'clamp(1rem, 1.8vw, 1.2rem)',
          lineHeight: 1.6,
          color: '#9ca3af',
          maxWidth: '720px',
          margin: '0 auto 36px auto',
          fontWeight: 400
        }}>
          Bypass server bandwidth bottlenecks. Stream 4K/1080p remote MKVs and MP4s with 
          smart 2MB chunk caching, local subtitle decoding, and 0% central server load.
        </p>

        {/* Hero Action Buttons */}
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
              backgroundColor: '#e50914',
              color: '#ffffff',
              padding: '12px 28px',
              borderRadius: '9999px',
              fontWeight: 700,
              fontSize: '0.95rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(229, 9, 20, 0.4)',
              transition: 'transform 0.15s, opacity 0.15s'
            }}
          >
            Install Companion <ArrowRight size={16} />
          </button>

          <button
            onClick={() => openScriptModal('install.ps1')}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
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
            <Eye size={16} color="#38bdf8" /> Inspect Source Code
          </button>

          <button
            onClick={handleTestPing}
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
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
            <Activity size={16} color={status.isAvailable ? '#10b981' : '#f59e0b'} /> 
            {status.isAvailable ? 'Online (1ms)' : 'Offline (Click to Test)'}
          </button>
        </div>

        {/* Hero Terminal Window (Clean, Beautiful, Zero Overlap) */}
        <div style={{
          maxWidth: '860px',
          margin: '0 auto',
          textAlign: 'left',
          borderRadius: '16px',
          backgroundColor: '#0c0e17',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(229, 9, 20, 0.08)',
          overflow: 'hidden'
        }}>
          {/* Terminal Title Bar */}
          <div style={{
            backgroundColor: '#080910',
            padding: '12px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#ff5f56' }} />
              <span style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
              <span style={{ width: '11px', height: '11px', borderRadius: '50%', backgroundColor: '#27c93f' }} />
              <span style={{ marginLeft: '12px', fontSize: '0.8rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                valor-service &mdash; http://127.0.0.1:45454
              </span>
            </div>

            {/* Terminal OS Switcher */}
            <div style={{ display: 'flex', gap: '4px' }}>
              {[
                { id: 'windows', label: 'powershell' },
                { id: 'mac', label: 'bash' },
                { id: 'node', label: 'node' }
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as any)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: '6px',
                    background: activeTab === t.id ? 'rgba(229, 9, 20, 0.2)' : 'transparent',
                    border: activeTab === t.id ? '1px solid rgba(229, 9, 20, 0.4)' : '1px solid transparent',
                    color: activeTab === t.id ? '#ffffff' : '#94a3b8',
                    fontSize: '0.75rem',
                    fontFamily: 'monospace',
                    cursor: 'pointer',
                    fontWeight: activeTab === t.id ? 600 : 400
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Terminal Code Content */}
          <div style={{
            padding: '20px 24px',
            fontFamily: '"SF Mono", "Cascadia Code", Consolas, Menlo, monospace',
            fontSize: '0.875rem',
            lineHeight: 1.6,
            color: '#e2e8f0'
          }}>
            {/* Command Header Box with Separate Action Buttons (Solves all overlapping bugs) */}
            <div style={{
              backgroundColor: '#05060a',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '14px 18px',
              marginBottom: '20px'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '10px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                paddingBottom: '8px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.75rem' }}>
                  <Terminal size={14} color="#e50914" />
                  <span>
                    {activeTab === 'windows' && 'PowerShell 1-Click Install & Run'}
                    {activeTab === 'mac' && 'Terminal Bash 1-Click Install & Run'}
                    {activeTab === 'node' && 'Node.js Direct Launcher'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <button
                    onClick={() => openScriptModal(activeTab === 'windows' ? 'install.ps1' : activeTab === 'mac' ? 'install.sh' : 'valor-service.mjs')}
                    style={{
                      background: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      color: '#38bdf8',
                      fontSize: '0.75rem',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <Code2 size={13} />
                    <span>View Script</span>
                  </button>

                  <button
                    onClick={() => copyToClipboard(
                      activeTab === 'windows' ? commands.windows : activeTab === 'mac' ? commands.mac : commands.node,
                      'hero-box'
                    )}
                    style={{
                      background: copiedKey === 'hero-box' ? '#10b981' : '#e50914',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '4px 12px',
                      color: '#ffffff',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    {copiedKey === 'hero-box' ? <Check size={13} /> : <Copy size={13} />}
                    <span>{copiedKey === 'hero-box' ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>

              {/* Exact command with clean pre-wrap formatting */}
              <div style={{
                color: activeTab === 'windows' ? '#38bdf8' : activeTab === 'mac' ? '#34d399' : '#fbbf24',
                fontWeight: 600,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
                fontSize: '0.9rem',
                lineHeight: 1.5
              }}>
                <span style={{ color: '#64748b', marginRight: '8px', userSelect: 'none' }}>&gt;</span>
                {activeTab === 'windows' && commands.windows}
                {activeTab === 'mac' && commands.mac}
                {activeTab === 'node' && commands.node}
              </div>
            </div>

            {/* ASCII Output Box */}
            <div style={{
              color: '#94a3b8',
              backgroundColor: '#05060a',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '10px',
              padding: '16px 20px',
              marginBottom: '16px'
            }}>
              <div style={{ color: '#ffffff', fontWeight: 700, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={15} color="#e50914" />
                <span>Valor Companion Engine v1.0.0</span>
                <span style={{
                  fontSize: '0.7rem',
                  padding: '2px 8px',
                  borderRadius: '10px',
                  backgroundColor: status.isAvailable ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: status.isAvailable ? '#34d399' : '#f87171',
                  marginLeft: 'auto'
                }}>
                  {status.isAvailable ? 'LISTENING ON PORT 45454' : 'AWAITING INSTALLATION'}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px', fontSize: '0.8rem', marginTop: '10px' }}>
                <div><span style={{ color: '#64748b' }}>Status:</span> <span style={{ color: status.isAvailable ? '#34d399' : '#f87171' }}>{status.isAvailable ? 'Active' : 'Offline'}</span></div>
                <div><span style={{ color: '#64748b' }}>Roundtrip:</span> <span style={{ color: '#38bdf8' }}>{status.latencyMs ?? (status.isAvailable ? 1 : 0)} ms</span></div>
                <div><span style={{ color: '#64748b' }}>Chunk Cache:</span> <span style={{ color: '#fbbf24' }}>{status.cacheBlocks ?? 0} blocks</span></div>
                <div><span style={{ color: '#64748b' }}>Server Load:</span> <span style={{ color: '#34d399' }}>0% Bandwidth</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION: Install (Command Banners without any collision) */}
      <section ref={installRef} style={{
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '70px 24px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#ffffff', margin: '0 0 10px 0' }}>
            Choose Your Platform
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '1rem', margin: 0 }}>
            Run the single copyable command in your terminal to download and launch the engine.
          </p>
        </div>

        {/* OS Tabs */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
          {[
            { id: 'windows', label: 'Windows (PowerShell)' },
            { id: 'mac', label: 'macOS & Linux (Bash)' },
            { id: 'node', label: 'Node.js (Cross-Platform)' },
            { id: 'bat', label: 'Windows Batch (.bat)' }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id as any)}
              style={{
                padding: '9px 20px',
                borderRadius: '9999px',
                backgroundColor: activeTab === t.id ? '#e50914' : 'rgba(255, 255, 255, 0.06)',
                color: '#ffffff',
                border: activeTab === t.id ? '1px solid #e50914' : '1px solid rgba(255, 255, 255, 0.1)',
                fontWeight: 600,
                fontSize: '0.85rem',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Clean Command Box with dedicated top bar */}
        <div style={{
          backgroundColor: '#0c0e17',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '14px',
          overflow: 'hidden',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6)'
        }}>
          {/* Box Header */}
          <div style={{
            backgroundColor: '#080910',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <span style={{ fontSize: '0.825rem', color: '#94a3b8', fontWeight: 600 }}>
              {activeTab === 'windows' && 'Windows PowerShell Prompt'}
              {activeTab === 'mac' && 'macOS / Linux Terminal'}
              {activeTab === 'node' && 'Node.js (Node 18+)'}
              {activeTab === 'bat' && 'Windows Batch File'}
            </span>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => openScriptModal(activeTab === 'windows' ? 'install.ps1' : activeTab === 'mac' ? 'install.sh' : activeTab === 'node' ? 'valor-service.mjs' : 'run.bat')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  color: '#38bdf8',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                <Code2 size={13} /> View Script
              </button>

              <button
                onClick={() => copyToClipboard(
                  activeTab === 'windows' ? commands.windows : activeTab === 'mac' ? commands.mac : activeTab === 'node' ? commands.node : commands.bat,
                  'install-copy'
                )}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: copiedKey === 'install-copy' ? '#10b981' : '#e50914',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '5px 14px',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                {copiedKey === 'install-copy' ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedKey === 'install-copy' ? 'Copied' : 'Copy Command'}</span>
              </button>
            </div>
          </div>

          {/* Code Text (Never breaks mid-word, clean padding, scrollable if needed) */}
          <div style={{
            padding: '18px 22px',
            fontFamily: '"SF Mono", "Cascadia Code", Consolas, monospace',
            fontSize: '0.95rem',
            color: activeTab === 'windows' ? '#38bdf8' : activeTab === 'mac' ? '#34d399' : '#fbbf24',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowWrap: 'anywhere',
            lineHeight: 1.6
          }}>
            {activeTab === 'windows' && commands.windows}
            {activeTab === 'mac' && commands.mac}
            {activeTab === 'node' && commands.node}
            {activeTab === 'bat' && commands.bat}
          </div>
        </div>

        {activeTab === 'bat' && (
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <a
              href={`${origin}/api/sidecar/run.bat`}
              download="run.bat"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                color: '#38bdf8',
                fontSize: '0.9rem',
                textDecoration: 'none',
                fontWeight: 600
              }}
            >
              <Download size={16} /> Direct Download: run.bat
            </a>
          </div>
        )}
      </section>

      {/* SECTION: Script Source Inspector (User Requested) */}
      <section ref={inspectRef} style={{
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '70px 24px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#38bdf8', fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', marginBottom: '8px' }}>
            <Code2 size={16} /> Full Source Code Transparency
          </div>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#ffffff', margin: '0 0 10px 0' }}>
            Inspect the Scripts
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '1rem', margin: 0 }}>
            Review every line of code before running anything on your device. Zero hidden dependencies.
          </p>
        </div>

        {/* Script Selector Tabs */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {[
            { id: 'install.ps1', label: 'install.ps1 (PowerShell)', lang: 'PowerShell' },
            { id: 'install.sh', label: 'install.sh (Bash)', lang: 'Bash' },
            { id: 'valor-service.mjs', label: 'valor-service.mjs (Daemon)', lang: 'Node.js' },
            { id: 'run.bat', label: 'run.bat (Batch)', lang: 'Batch' }
          ].map(s => (
            <button
              key={s.id}
              onClick={() => setInspectScript(s.id as any)}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                backgroundColor: inspectScript === s.id ? 'rgba(229, 9, 20, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                color: inspectScript === s.id ? '#ffffff' : '#9ca3af',
                border: inspectScript === s.id ? '1px solid rgba(229, 9, 20, 0.5)' : '1px solid rgba(255, 255, 255, 0.08)',
                fontWeight: 600,
                fontSize: '0.825rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <FileCode size={14} color={inspectScript === s.id ? '#e50914' : '#64748b'} />
              <span>{s.label}</span>
            </button>
          ))}
        </div>

        {/* Script Viewer Box */}
        <div style={{
          backgroundColor: '#07080e',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '14px',
          overflow: 'hidden'
        }}>
          {/* Header */}
          <div style={{
            backgroundColor: '#040508',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#94a3b8', fontSize: '0.8rem', fontFamily: 'monospace' }}>
              <span>{inspectScript}</span>
              <span>&bull;</span>
              <span>{scriptContent ? `${scriptContent.split('\n').length} lines` : 'Loading...'}</span>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => copyToClipboard(scriptContent, 'script-source')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: copiedKey === 'script-source' ? '#10b981' : 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  color: '#ffffff',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                {copiedKey === 'script-source' ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedKey === 'script-source' ? 'Copied Full Code' : 'Copy Raw Code'}</span>
              </button>

              <a
                href={`${origin}/api/sidecar/${inspectScript}`}
                download={inspectScript}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(229, 9, 20, 0.15)',
                  border: '1px solid rgba(229, 9, 20, 0.35)',
                  borderRadius: '6px',
                  padding: '5px 12px',
                  color: '#ff4d4d',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  textDecoration: 'none'
                }}
              >
                <Download size={13} /> Download File
              </a>
            </div>
          </div>

          {/* Script Code Body */}
          <div style={{
            maxHeight: '440px',
            overflowY: 'auto',
            padding: '16px 20px',
            fontFamily: '"SF Mono", Consolas, "Cascadia Code", monospace',
            fontSize: '0.825rem',
            lineHeight: 1.6,
            color: '#cbd5e1',
            backgroundColor: '#05060b'
          }}>
            {isLoadingScript ? (
              <div style={{ color: '#64748b', padding: '20px 0', textAlign: 'center' }}>Loading script content...</div>
            ) : (
              <pre style={{ margin: 0, whiteSpace: 'pre', overflowX: 'auto' }}>
                {scriptContent}
              </pre>
            )}
          </div>
        </div>
      </section>

      {/* SECTION: Diagnostics & Status Sandbox */}
      <section ref={verifyRef} style={{
        maxWidth: '1000px',
        margin: '0 auto',
        padding: '70px 24px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '36px' }}>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#ffffff', margin: '0 0 10px 0' }}>
            Live Diagnostics
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '1rem', margin: 0 }}>
            Test your local port 45454 socket connection in real-time.
          </p>
        </div>

        <div style={{
          backgroundColor: '#0c0e17',
          border: '1px solid rgba(255, 255, 255, 0.1)',
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
                <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ffffff' }}>
                  {status.isAvailable ? 'Engine Online & Communicating' : 'Engine Offline'}
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  padding: '3px 10px',
                  borderRadius: '20px',
                  backgroundColor: status.isAvailable ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                  color: status.isAvailable ? '#34d399' : '#f87171',
                  fontWeight: 600
                }}>
                  Port 45454
                </span>
              </div>
              <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: '#9ca3af' }}>
                {status.isAvailable 
                  ? 'All remote streams will download through your machine with zero server lag.' 
                  : 'Start the service with the command above to activate local streaming.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleTestPing}
                style={{
                  backgroundColor: '#e50914',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '9px 18px',
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  boxShadow: '0 2px 10px rgba(229, 9, 20, 0.3)'
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
                    padding: '9px 16px',
                    color: '#fca5a5',
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    fontWeight: 600
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

          {/* Interactive Ping Response Box */}
          {pingResult && (
            <div style={{
              backgroundColor: '#05060a',
              border: `1px solid ${pingResult.error ? 'rgba(239, 68, 68, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`,
              borderRadius: '10px',
              padding: '16px 20px',
              fontFamily: '"SF Mono", Consolas, monospace',
              fontSize: '0.825rem',
              marginTop: '12px'
            }}>
              {pingResult.loading && <span style={{ color: '#9ca3af' }}>Pinging http://127.0.0.1:45454/api/sidecar/status...</span>}
              {pingResult.error && (
                <div style={{ color: '#f87171' }}>
                  ✗ Connection Refused: {pingResult.error}
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                    Run the command in Step 1 to start the service.
                  </div>
                </div>
              )}
              {pingResult.data && (
                <div>
                  <div style={{ color: '#34d399', marginBottom: '8px', fontWeight: 600 }}>
                    ✓ HTTP 200 OK — {pingResult.latency} ms roundtrip
                  </div>
                  <pre style={{ margin: 0, color: '#38bdf8', overflowX: 'auto', whiteSpace: 'pre' }}>
                    {JSON.stringify(pingResult.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* SECTION: Features */}
      <section ref={featuresRef} style={{
        maxWidth: '1080px',
        margin: '0 auto',
        padding: '70px 24px 100px 24px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '48px' }}>
          <h2 style={{ fontSize: '2.2rem', fontWeight: 800, color: '#ffffff', margin: '0 0 10px 0' }}>
            Engine Capabilities
          </h2>
          <p style={{ color: '#9ca3af', fontSize: '1rem', margin: 0 }}>
            Built specifically to solve remote MKV buffering and server overload.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px'
        }}>
          <div style={{ backgroundColor: '#0c0e17', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '26px' }}>
            <div style={{ color: '#e50914', marginBottom: '14px' }}><Zap size={24} /></div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', margin: '0 0 8px 0' }}>Zero Server Bandwidth</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', lineHeight: 1.6, margin: 0 }}>
              Your device directly connects to the provider server. Central server CPU and egress bandwidth drop to zero.
            </p>
          </div>

          <div style={{ backgroundColor: '#0c0e17', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '26px' }}>
            <div style={{ color: '#38bdf8', marginBottom: '14px' }}><HardDrive size={24} /></div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', margin: '0 0 8px 0' }}>2MB Chunk Caching</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', lineHeight: 1.6, margin: 0 }}>
              Slices remote video into 2MB blocks stored in local RAM, giving instant seek and loop replay with zero buffering.
            </p>
          </div>

          <div style={{ backgroundColor: '#0c0e17', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '26px' }}>
            <div style={{ color: '#34d399', marginBottom: '14px' }}><Cpu size={24} /></div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', margin: '0 0 8px 0' }}>Embedded Subtitle Slicing</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', lineHeight: 1.6, margin: 0 }}>
              Extracts WebVTT subtitle streams directly on your CPU without stressing the central server.
            </p>
          </div>

          <div style={{ backgroundColor: '#0c0e17', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '14px', padding: '26px' }}>
            <div style={{ color: '#fbbf24', marginBottom: '14px' }}><ShieldCheck size={24} /></div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: '#ffffff', margin: '0 0 8px 0' }}>Zero Dependencies</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', lineHeight: 1.6, margin: 0 }}>
              100% standard Node.js library. No npm modules, no telemetry, and binds only to localhost 127.0.0.1.
            </p>
          </div>
        </div>
      </section>

      {/* Script Source Code Modal (if triggered via View Script button) */}
      {isScriptModalOpen && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(12px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px'
          }}
          onClick={() => setIsScriptModalOpen(false)}
        >
          <div 
            style={{
              width: '100%',
              maxWidth: '880px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#0a0d15',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              borderRadius: '16px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px rgba(0, 0, 0, 0.8)'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{
              backgroundColor: '#05070c',
              padding: '16px 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <FileCode size={18} color="#e50914" />
                <span style={{ fontWeight: 700, fontSize: '0.95rem', color: '#ffffff' }}>
                  {inspectScript}
                </span>
                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  ({scriptContent ? scriptContent.split('\n').length : 0} lines)
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button
                  onClick={() => copyToClipboard(scriptContent, 'modal-copy')}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    backgroundColor: copiedKey === 'modal-copy' ? '#10b981' : '#e50914',
                    border: 'none',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    color: '#ffffff',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {copiedKey === 'modal-copy' ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedKey === 'modal-copy' ? 'Copied' : 'Copy Code'}</span>
                </button>

                <button
                  onClick={() => setIsScriptModalOpen(false)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    padding: '4px'
                  }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Modal Code Body */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '20px 24px',
              backgroundColor: '#06070b',
              fontFamily: '"SF Mono", Consolas, monospace',
              fontSize: '0.85rem',
              lineHeight: 1.6,
              color: '#cbd5e1'
            }}>
              {isLoadingScript ? (
                <div style={{ color: '#64748b', textAlign: 'center', padding: '40px 0' }}>Loading script...</div>
              ) : (
                <pre style={{ margin: 0, whiteSpace: 'pre', overflowX: 'auto' }}>
                  {scriptContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '30px 24px',
        textAlign: 'center',
        color: '#64748b',
        fontSize: '0.85rem'
      }}>
        Valor Media Companion Engine &bull; Pure Node.js Standard Library &bull; 0% Central Server Load
      </footer>
    </div>
  );
};
