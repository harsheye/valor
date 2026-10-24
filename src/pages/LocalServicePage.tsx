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
  Activity,
  Monitor,
  Globe,
  Database,
  Layers,
  ChevronRight,
  HelpCircle
} from 'lucide-react';
import { sidecarService, type SidecarStatus } from '../services/remote/sidecarService';

interface LocalServicePageProps {
  onClose?: () => void;
  standalone?: boolean;
}

type OsTab = 'mac' | 'windows' | 'node' | 'bat';
type ScriptType = 'install.ps1' | 'install.sh' | 'valor-service.mjs' | 'run.bat';
type SidebarItem = 'quickstart' | 'use-companion' | 'architecture' | 'install-windows' | 'install-mac' | 'install-node' | 'verify' | 'inspect-scripts' | 'faq';

export const LocalServicePage: React.FC<LocalServicePageProps> = ({ onClose, standalone = false }) => {
  const [status, setStatus] = useState<SidecarStatus>(sidecarService.getStatus());
  const [activeOs, setActiveOs] = useState<OsTab>('windows');
  const [activeSidebar, setActiveSidebar] = useState<SidebarItem>('quickstart');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [pingResult, setPingResult] = useState<{ loading: boolean; data: any; latency?: number; error?: string } | null>(null);

  // Script Inspector State
  const [inspectScript, setInspectScript] = useState<ScriptType>('install.ps1');
  const [scriptContent, setScriptContent] = useState<string>('');
  const [isLoadingScript, setIsLoadingScript] = useState<boolean>(false);
  const [isScriptModalOpen, setIsScriptModalOpen] = useState<boolean>(false);

  const quickstartRef = useRef<HTMLDivElement>(null);
  const verifyRef = useRef<HTMLDivElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const scriptsRef = useRef<HTMLDivElement>(null);
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
    windowsUpdate: `irm ${origin}/api/sidecar/install.ps1 | iex`,
    mac: `curl -fsSL ${origin}/api/sidecar/install.sh | bash`,
    macUpdate: `curl -fsSL ${origin}/api/sidecar/install.sh | bash`,
    node: `curl -fsSL ${origin}/api/sidecar/valor-service.mjs -o valor-service.mjs && node valor-service.mjs`,
    bat: `curl -fsSL ${origin}/api/sidecar/run.bat -o run.bat && run.bat`,
    statusCurl: `curl -s http://127.0.0.1:45454/api/sidecar/status`
  };

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

  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>, sidebarKey?: SidebarItem) => {
    if (sidebarKey) setActiveSidebar(sidebarKey);
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="codex-docs-page" style={{
      minHeight: '100vh',
      backgroundColor: '#000000',
      color: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      letterSpacing: '-0.012em',
      overflowX: 'clip'
    }}>
      <style>{`
        /* Codex Theme Exact CSS */
        .codex-nav-btn {
          background: transparent;
          border: none;
          color: #8e8ea0;
          font-size: 0.875rem;
          font-weight: 500;
          padding: 8px 0;
          cursor: pointer;
          position: relative;
          transition: color 0.15s ease;
        }
        .codex-nav-btn:hover {
          color: #ffffff;
        }
        .codex-nav-btn.active {
          color: #ffffff;
          font-weight: 600;
        }
        .codex-nav-btn.active::after {
          content: '';
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          height: 2px;
          background-color: #ffffff;
        }
        .codex-sidebar-link {
          display: flex;
          align-items: center;
          width: 100%;
          text-align: left;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.8125rem;
          color: #8e8ea0;
          background: transparent;
          border: none;
          cursor: pointer;
          transition: background 0.12s ease, color 0.12s ease;
        }
        .codex-sidebar-link:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.04);
        }
        .codex-sidebar-link.active {
          color: #ffffff;
          background: #1c1c1f;
          font-weight: 600;
        }
        .codex-pill-tab {
          padding: 5px 14px;
          border-radius: 9999px;
          font-size: 0.8125rem;
          font-weight: 500;
          border: none;
          cursor: pointer;
          background: transparent;
          color: #8e8ea0;
          transition: all 0.12s ease;
        }
        .codex-pill-tab:hover {
          color: #ffffff;
        }
        .codex-pill-tab.active {
          background: #25262b;
          color: #ffffff;
          font-weight: 600;
        }
        .codex-cmd-box {
          background-color: #070709;
          border: 1px solid #1f2024;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px 10px 16px;
          font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
          font-size: 0.85rem;
          color: #d1d5db;
        }
        .codex-copy-btn {
          background: transparent;
          border: none;
          color: #8e8ea0;
          display: flex;
          align-items: center;
          gap: 5px;
          font-size: 0.75rem;
          cursor: pointer;
          padding: 4px 8px;
          border-radius: 4px;
          transition: color 0.15s, background 0.15s;
          flex-shrink: 0;
        }
        .codex-copy-btn:hover {
          color: #ffffff;
          background: rgba(255, 255, 255, 0.08);
        }
        .codex-card {
          background: #131417;
          border: 1px solid #232429;
          border-radius: 12px;
          padding: 22px;
          transition: border-color 0.15s ease;
        }
        .codex-card:hover {
          border-color: #383a42;
        }
        .step-circle {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: #202126;
          border: 1px solid #32343d;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 0.8rem;
          font-weight: 700;
          color: #ffffff;
          flex-shrink: 0;
        }
      `}</style>

      {/* ────────────────────────────────────────────────────────── */}
      {/* 1. TOP HEADER (Exact OpenAI Docs Header - Clean Single Tier) */}
      {/* ────────────────────────────────────────────────────────── */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 60,
        backgroundColor: '#000000',
        borderBottom: '1px solid #1c1c1f'
      }}>
        <div style={{
          padding: '0 28px',
          height: '56px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          {/* Left: OpenAI glyph + Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <a href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px', textDecoration: 'none', color: '#fff' }}>
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                border: '1.5px solid #ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '11px',
                fontWeight: 800
              }}>
                ✦
              </div>
              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>Valor Engine</span>
            </a>
          </div>

          {/* Center Top: Home | Docs | Features | Scripts | Resources */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
            <a href="/" style={{ color: '#8e8ea0', textDecoration: 'none', fontSize: '0.85rem', fontWeight: 500 }}>Home</a>
            <span style={{ color: '#ffffff', fontSize: '0.85rem', fontWeight: 600 }}>Docs</span>
            <button onClick={() => scrollTo(featuresRef)} style={{ background: 'none', border: 'none', color: '#8e8ea0', fontSize: '0.85rem', cursor: 'pointer' }}>Features</button>
            <button onClick={() => scrollTo(scriptsRef)} style={{ background: 'none', border: 'none', color: '#8e8ea0', fontSize: '0.85rem', cursor: 'pointer' }}>Scripts</button>
            <button onClick={() => scrollTo(faqRef)} style={{ background: 'none', border: 'none', color: '#8e8ea0', fontSize: '0.85rem', cursor: 'pointer' }}>Resources</button>
          </div>

          {/* Right Top: CTA Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {standalone ? (
              <a
                href="/"
                style={{
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px'
                }}
              >
                Launch Valor <ArrowRight size={13} />
              </a>
            ) : onClose ? (
              <button
                onClick={onClose}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  padding: '6px 14px',
                  borderRadius: '9999px',
                  fontSize: '0.825rem',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {/* ────────────────────────────────────────────────────────── */}
      {/* 2. BODY LAYOUT: Fixed Sticky Sidebar (Left) + Content (Right) */}
      {/* ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', maxWidth: '1440px', margin: '0 auto', minHeight: 'calc(100vh - 56px)' }}>
        
        {/* Left Sidebar (Pinned Fixed / Sticky) */}
        <aside style={{
          width: '260px',
          flexShrink: 0,
          borderRight: '1px solid #18181b',
          padding: '28px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          position: 'sticky',
          top: '56px',
          height: 'calc(100vh - 56px)',
          alignSelf: 'flex-start',
          overflowY: 'auto'
        }}>
          {/* Group 1: Get started */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555660', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 12px', marginBottom: '8px' }}>
              Get started
            </div>
            <button 
              className={`codex-sidebar-link ${activeSidebar === 'quickstart' ? 'active' : ''}`}
              onClick={() => scrollTo(quickstartRef, 'quickstart')}
            >
              Quickstart
            </button>
            <button 
              className={`codex-sidebar-link ${activeSidebar === 'use-companion' ? 'active' : ''}`}
              onClick={() => scrollTo(quickstartRef, 'use-companion')}
            >
              Use Companion
            </button>
            <button 
              className={`codex-sidebar-link ${activeSidebar === 'architecture' ? 'active' : ''}`}
              onClick={() => scrollTo(featuresRef, 'architecture')}
            >
              Zero-Load Architecture
            </button>
          </div>

          {/* Group 2: Foundations */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555660', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 12px', marginBottom: '8px' }}>
              Platform Installers
            </div>
            <button 
              className={`codex-sidebar-link ${activeSidebar === 'install-windows' ? 'active' : ''}`}
              onClick={() => { setActiveOs('windows'); scrollTo(quickstartRef, 'install-windows'); }}
            >
              Windows (PowerShell)
            </button>
            <button 
              className={`codex-sidebar-link ${activeSidebar === 'install-mac' ? 'active' : ''}`}
              onClick={() => { setActiveOs('mac'); scrollTo(quickstartRef, 'install-mac'); }}
            >
              macOS / Linux (Bash)
            </button>
            <button 
              className={`codex-sidebar-link ${activeSidebar === 'install-node' ? 'active' : ''}`}
              onClick={() => { setActiveOs('node'); scrollTo(quickstartRef, 'install-node'); }}
            >
              Node.js Standard Lib
            </button>
          </div>

          {/* Group 3: Available on (Codex CLI highlighted pill from image) */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555660', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 12px', marginBottom: '8px' }}>
              Available on
            </div>
            <div style={{
              backgroundColor: '#18191d',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <span>Valor Engine CLI</span>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: status.isAvailable ? '#10b981' : '#f59e0b' }} />
            </div>
            <button 
              className={`codex-sidebar-link ${activeSidebar === 'verify' ? 'active' : ''}`}
              onClick={() => scrollTo(verifyRef, 'verify')}
              style={{ marginTop: '4px' }}
            >
              Diagnostics & Ping
            </button>
            <button 
              className={`codex-sidebar-link ${activeSidebar === 'inspect-scripts' ? 'active' : ''}`}
              onClick={() => scrollTo(scriptsRef, 'inspect-scripts')}
            >
              Inspect Source Code
            </button>
          </div>

          {/* Group 4: Releases & FAQ */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#555660', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 12px', marginBottom: '8px' }}>
              Releases
            </div>
            <button 
              className={`codex-sidebar-link ${activeSidebar === 'faq' ? 'active' : ''}`}
              onClick={() => scrollTo(faqRef, 'faq')}
            >
              Engine v1.0.0 (Port 45454)
            </button>
            <button 
              className={`codex-sidebar-link`}
              onClick={() => scrollTo(faqRef, 'faq')}
            >
              Security & Privacy FAQ
            </button>
          </div>
        </aside>

        {/* Main Content Pane */}
        <main style={{ flex: 1, padding: '40px 48px 80px 48px', maxWidth: '1040px' }}>
          
          {/* ────────────────────────────────────────────────────────── */}
          {/* HERO SECTION (Pixel-Perfect to Image 1)                     */}
          {/* ────────────────────────────────────────────────────────── */}
          <section style={{ textAlign: 'center', marginBottom: '64px', paddingTop: '16px' }}>
            {/* Centered Eyebrow: Codex CLI */}
            <div style={{
              fontSize: '0.85rem',
              fontWeight: 500,
              color: '#8e8ea0',
              marginBottom: '16px'
            }}>
              Valor Engine CLI
            </div>

            {/* Massive Display Title (Exact typography from Image 1) */}
            <h1 style={{
              fontSize: 'clamp(2.4rem, 5.2vw, 4.2rem)',
              fontWeight: 800,
              lineHeight: 1.1,
              letterSpacing: '-0.035em',
              margin: '0 auto 20px auto',
              maxWidth: '820px',
              color: '#ffffff'
            }}>
              Inspect, edit, and run code<br />from your terminal
            </h1>

            {/* Subtitle */}
            <p style={{
              fontSize: '1.05rem',
              lineHeight: 1.6,
              color: '#8e8ea0',
              maxWidth: '620px',
              margin: '0 auto 32px auto',
              fontWeight: 400
            }}>
              Stream remote media, cache 2MB blocks, and decode subtitles directly on your machine without pushing the central server.
            </p>

            {/* Two Pill Buttons: Install Codex (White) & CLI reference (Translucent) */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '12px',
              marginBottom: '48px'
            }}>
              <button
                onClick={() => scrollTo(quickstartRef)}
                style={{
                  backgroundColor: '#ffffff',
                  color: '#000000',
                  padding: '10px 20px',
                  borderRadius: '9999px',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: 'none',
                  cursor: 'pointer'
                }}
              >
                Install Engine <ArrowRight size={14} />
              </button>

              <button
                onClick={() => scrollTo(verifyRef)}
                style={{
                  backgroundColor: '#1b1b1f',
                  color: '#ffffff',
                  padding: '10px 20px',
                  borderRadius: '9999px',
                  fontWeight: 500,
                  fontSize: '0.875rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  border: '1px solid #2b2b32',
                  cursor: 'pointer'
                }}
              >
                Engine status <ArrowRight size={14} />
              </button>
            </div>

            {/* Hero Terminal Window (Image 1 Style) */}
            <div style={{
              maxWidth: '740px',
              margin: '0 auto',
              textAlign: 'left',
              borderRadius: '12px',
              backgroundColor: '#0a0d16',
              border: '1px solid #1c2130',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.7)',
              overflow: 'hidden'
            }}>
              {/* Traffic Light Dots */}
              <div style={{
                padding: '14px 18px 10px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ff5f56' }} />
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: '#27c93f' }} />
              </div>

              {/* Terminal Text Area */}
              <div style={{
                padding: '8px 22px 24px 22px',
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                fontSize: '0.85rem',
                lineHeight: 1.6,
                color: '#cbd5e1'
              }}>
                <div style={{ color: '#38bdf8', marginBottom: '14px' }}>
                  $ valor-service
                </div>

                {/* ASCII Box (Exact structure from Image 1) */}
                <div style={{
                  border: '1px dashed #242c3f',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  marginBottom: '18px',
                  backgroundColor: '#060810'
                }}>
                  <div style={{ color: '#ffffff', fontWeight: 600 }}>&gt;_ Valor Media Daemon</div>
                  <div style={{ display: 'flex', gap: '20px', marginTop: '6px', color: '#94a3b8', fontSize: '0.8rem' }}>
                    <div>model: <span style={{ color: '#ffffff', fontWeight: 600 }}>p2p-direct-stream</span></div>
                    <div>port: <span style={{ color: '#38bdf8' }}>45454</span></div>
                    <div>cache: <span style={{ color: '#34d399' }}>2MB Blocks</span></div>
                  </div>
                </div>

                <div style={{ color: '#888888', fontSize: '0.8125rem', marginBottom: '18px', lineHeight: 1.7 }}>
                  To get started, run the installer command below:<br />
                  <span style={{ color: '#cbd5e1', fontWeight: 600 }}>/status</span> - check local session socket on port 45454<br />
                  <span style={{ color: '#cbd5e1', fontWeight: 600 }}>/cache</span> - view sliding window chunk memory<br />
                  <span style={{ color: '#cbd5e1', fontWeight: 600 }}>/subs</span> - extract embedded MKV WebVTT subtitles<br />
                  <span style={{ color: '#cbd5e1', fontWeight: 600 }}>/stream</span> - download remote video with 0% server bandwidth
                </div>

                <div style={{ color: '#94a3b8', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#38bdf8' }}>&gt;</span>
                  <span>Streaming remote video via local engine: <b style={{ color: status.isAvailable ? '#10b981' : '#f59e0b' }}>{status.isAvailable ? 'Online (0% server load)' : 'Offline (Central Relay)'}</b></span>
                  <span style={{ display: 'inline-block', width: '7px', height: '14px', backgroundColor: '#38bdf8', animation: 'pulse 1s infinite' }} />
                </div>

                <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #161a26', fontSize: '0.75rem', color: '#64748b' }}>
                  100% server bandwidth saved &bull; &lt;1ms local latency
                </div>
              </div>
            </div>
          </section>

          {/* ────────────────────────────────────────────────────────── */}
          {/* QUICKSTART CARD (Pixel-Perfect to Image 2)                  */}
          {/* ────────────────────────────────────────────────────────── */}
          <section ref={quickstartRef} style={{ marginBottom: '60px' }}>
            <div className="codex-card" style={{ padding: '36px' }}>
              
              {/* Eyebrow & Title */}
              <div style={{ marginBottom: '28px' }}>
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: '#8e8ea0', marginBottom: '6px' }}>
                  Quickstart
                </div>
                <h2 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0 0 8px 0', color: '#ffffff' }}>
                  Get started with Valor Engine CLI
                </h2>
                <p style={{ margin: 0, fontSize: '0.925rem', color: '#8e8ea0' }}>
                  Install the engine, run it in the background, and play remote media with zero server load.
                </p>
              </div>

              {/* Step 1: Install Codex (Exact Image 2 Layout) */}
              <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
                <div className="step-circle">1</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', marginBottom: '14px' }}>
                    Install Companion
                  </div>

                  {/* OS Pill Tabs: macOS/Linux, Windows, Node.js, run.bat */}
                  <div style={{ display: 'flex', gap: '6px', marginBottom: '16px' }}>
                    <button 
                      className={`codex-pill-tab ${activeOs === 'windows' ? 'active' : ''}`}
                      onClick={() => setActiveOs('windows')}
                    >
                      Windows (PowerShell)
                    </button>
                    <button 
                      className={`codex-pill-tab ${activeOs === 'mac' ? 'active' : ''}`}
                      onClick={() => setActiveOs('mac')}
                    >
                      macOS/Linux
                    </button>
                    <button 
                      className={`codex-pill-tab ${activeOs === 'node' ? 'active' : ''}`}
                      onClick={() => setActiveOs('node')}
                    >
                      Node.js
                    </button>
                    <button 
                      className={`codex-pill-tab ${activeOs === 'bat' ? 'active' : ''}`}
                      onClick={() => setActiveOs('bat')}
                    >
                      run.bat
                    </button>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: '#8e8ea0', margin: '0 0 14px 0' }}>
                    {activeOs === 'windows' && 'Install and launch the engine with the standalone installer for Windows PowerShell.'}
                    {activeOs === 'mac' && 'Install and launch the engine with the standalone installer for macOS and Linux.'}
                    {activeOs === 'node' && 'Direct Node.js execution. Requires Node 18+, zero npm packages needed.'}
                    {activeOs === 'bat' && 'Downloadable Windows batch file. Double-click to start anytime.'}
                  </p>

                  {/* Code Box 1: Install command */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '0.75rem', color: '#8e8ea0', marginBottom: '6px', fontWeight: 500 }}>
                      Install Engine
                    </div>
                    <div className="codex-cmd-box">
                      <span style={{ overflowX: 'auto', whiteSpace: 'nowrap', marginRight: '16px' }}>
                        {activeOs === 'windows' && commands.windows}
                        {activeOs === 'mac' && commands.mac}
                        {activeOs === 'node' && commands.node}
                        {activeOs === 'bat' && commands.bat}
                      </span>
                      <button 
                        className="codex-copy-btn"
                        onClick={() => copyToClipboard(
                          activeOs === 'windows' ? commands.windows : activeOs === 'mac' ? commands.mac : activeOs === 'node' ? commands.node : commands.bat,
                          'step1-install'
                        )}
                      >
                        {copiedKey === 'step1-install' ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                        <span>{copiedKey === 'step1-install' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Code Box 2: Check Status command */}
                  <div>
                    <div style={{ fontSize: '0.75rem', color: '#8e8ea0', marginBottom: '6px', fontWeight: 500 }}>
                      Verify Status
                    </div>
                    <div className="codex-cmd-box">
                      <span style={{ overflowX: 'auto', whiteSpace: 'nowrap', marginRight: '16px', color: '#9ca3af' }}>
                        {commands.statusCurl}
                      </span>
                      <button 
                        className="codex-copy-btn"
                        onClick={() => copyToClipboard(commands.statusCurl, 'step1-check')}
                      >
                        {copiedKey === 'step1-check' ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                        <span>{copiedKey === 'step1-check' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Run and Verify Socket */}
              <div style={{ display: 'flex', gap: '16px', marginBottom: '32px' }}>
                <div className="step-circle">2</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                    Run engine and check socket
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#8e8ea0', margin: '0 0 14px 0' }}>
                    Keep the terminal window open while playing media. Valor will automatically connect to <code style={{ color: '#ffffff', background: '#222', padding: '2px 6px', borderRadius: '4px' }}>http://127.0.0.1:45454</code>.
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      onClick={handleTestPing}
                      style={{
                        backgroundColor: '#25262c',
                        border: '1px solid #363740',
                        color: '#ffffff',
                        padding: '7px 16px',
                        borderRadius: '6px',
                        fontSize: '0.825rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <RefreshCw size={13} className={pingResult?.loading ? 'animate-spin' : ''} />
                      Test Local Ping Now
                    </button>

                    <span style={{ fontSize: '0.825rem', color: status.isAvailable ? '#34d399' : '#f87171' }}>
                      {status.isAvailable ? '✓ Connected to port 45454' : '✗ Service offline (run command above)'}
                    </span>
                  </div>

                  {pingResult && (
                    <div style={{
                      backgroundColor: '#070709',
                      border: '1px solid #1f2024',
                      borderRadius: '8px',
                      padding: '12px 16px',
                      marginTop: '12px',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem'
                    }}>
                      {pingResult.loading && <span style={{ color: '#8e8ea0' }}>Pinging 127.0.0.1:45454...</span>}
                      {pingResult.error && <span style={{ color: '#f87171' }}>Error: {pingResult.error}</span>}
                      {pingResult.data && (
                        <div>
                          <div style={{ color: '#34d399', marginBottom: '4px' }}>✓ 200 OK — {pingResult.latency} ms roundtrip</div>
                          <pre style={{ margin: 0, color: '#38bdf8', overflowX: 'auto' }}>
                            {JSON.stringify(pingResult.data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3: Stream in Valor */}
              <div style={{ display: 'flex', gap: '16px' }}>
                <div className="step-circle">3</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                    Stream in Valor Player
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#8e8ea0', margin: '0 0 10px 0' }}>
                    Open any movie or show in Valor. The top bar will display the green <span style={{ color: '#34d399', fontWeight: 600 }}>[ ⚡ Local Engine ]</span> badge, routing all data through your device.
                  </p>
                </div>
              </div>

            </div>
          </section>

          {/* ────────────────────────────────────────────────────────── */}
          {/* OTHER SURFACES GRID (Pixel-Perfect to Image 3)              */}
          {/* ────────────────────────────────────────────────────────── */}
          <section ref={featuresRef} style={{ marginBottom: '64px' }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', marginBottom: '18px' }}>
              Other Valor and Companion surfaces
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
              gap: '16px'
            }}>
              {/* Card 1: Web Player */}
              <div className="codex-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: '#ffffff', marginBottom: '14px' }}>
                    <Monitor size={20} />
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                    Web Player
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: '#8e8ea0', lineHeight: 1.5, margin: 0 }}>
                    Custom HTML5 streaming player with audio-sync, WebVTT, and Trakt.
                  </p>
                </div>
                <div style={{ textAlign: 'right', marginTop: '16px', color: '#8e8ea0' }}>
                  <ArrowRight size={14} />
                </div>
              </div>

              {/* Card 2: Companion Daemon */}
              <div className="codex-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: '#ffffff', marginBottom: '14px' }}>
                    <Terminal size={20} />
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                    Companion Daemon
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: '#8e8ea0', lineHeight: 1.5, margin: 0 }}>
                    Local proxy service running on port 45454 with zero central server load.
                  </p>
                </div>
                <div style={{ textAlign: 'right', marginTop: '16px', color: '#8e8ea0' }}>
                  <ArrowRight size={14} />
                </div>
              </div>

              {/* Card 3: 2MB Block Cache */}
              <div className="codex-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: '#ffffff', marginBottom: '14px' }}>
                    <HardDrive size={20} />
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                    Sliding Cache
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: '#8e8ea0', lineHeight: 1.5, margin: 0 }}>
                    2MB chunk memory & disk cache for instant seeking and loop replay.
                  </p>
                </div>
                <div style={{ textAlign: 'right', marginTop: '16px', color: '#8e8ea0' }}>
                  <ArrowRight size={14} />
                </div>
              </div>

              {/* Card 4: Embedded Decoder */}
              <div className="codex-card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ color: '#ffffff', marginBottom: '14px' }}>
                    <Database size={20} />
                  </div>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: '#ffffff', marginBottom: '6px' }}>
                    Local Decoders
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: '#8e8ea0', lineHeight: 1.5, margin: 0 }}>
                    Demux embedded subtitles and audio tracks locally on your CPU.
                  </p>
                </div>
                <div style={{ textAlign: 'right', marginTop: '16px', color: '#8e8ea0' }}>
                  <ArrowRight size={14} />
                </div>
              </div>
            </div>
          </section>

          {/* ────────────────────────────────────────────────────────── */}
          {/* INSPECT SOURCE CODE SECTION                                */}
          {/* ────────────────────────────────────────────────────────── */}
          <section ref={scriptsRef} style={{ marginBottom: '64px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div>
                <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff' }}>
                  Inspect Script Source Code
                </div>
                <p style={{ fontSize: '0.85rem', color: '#8e8ea0', margin: '4px 0 0 0' }}>
                  Review the full code of any companion script before running it.
                </p>
              </div>

              <a
                href={`${origin}/api/sidecar/${inspectScript}`}
                download={inspectScript}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: '#1b1b1f',
                  border: '1px solid #2b2b32',
                  borderRadius: '6px',
                  padding: '6px 12px',
                  color: '#ffffff',
                  fontSize: '0.8rem',
                  textDecoration: 'none',
                  fontWeight: 500
                }}
              >
                <Download size={13} /> Download File
              </a>
            </div>

            {/* Script Tabs */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px' }}>
              {[
                { id: 'install.ps1', label: 'install.ps1' },
                { id: 'install.sh', label: 'install.sh' },
                { id: 'valor-service.mjs', label: 'valor-service.mjs' },
                { id: 'run.bat', label: 'run.bat' }
              ].map(s => (
                <button
                  key={s.id}
                  className={`codex-pill-tab ${inspectScript === s.id ? 'active' : ''}`}
                  onClick={() => setInspectScript(s.id as any)}
                >
                  {s.label}
                </button>
              ))}
            </div>

            {/* Code Box with Line Numbers */}
            <div style={{
              backgroundColor: '#070709',
              border: '1px solid #1f2024',
              borderRadius: '10px',
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '8px 16px',
                borderBottom: '1px solid #16171a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: '#64748b',
                fontFamily: 'monospace'
              }}>
                <span>{inspectScript} &bull; {scriptContent ? `${scriptContent.split('\n').length} lines` : 'Loading...'}</span>
                <button
                  className="codex-copy-btn"
                  onClick={() => copyToClipboard(scriptContent, 'inspect-raw')}
                >
                  {copiedKey === 'inspect-raw' ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
                  <span>{copiedKey === 'inspect-raw' ? 'Copied' : 'Copy Source'}</span>
                </button>
              </div>

              <div style={{
                maxHeight: '400px',
                overflowY: 'auto',
                padding: '16px',
                fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
                fontSize: '0.8rem',
                lineHeight: 1.6,
                color: '#cbd5e1'
              }}>
                {isLoadingScript ? (
                  <div style={{ color: '#64748b', textAlign: 'center', padding: '30px 0' }}>Loading script...</div>
                ) : (
                  <pre style={{ margin: 0, whiteSpace: 'pre', overflowX: 'auto' }}>
                    {scriptContent}
                  </pre>
                )}
              </div>
            </div>
          </section>

          {/* ────────────────────────────────────────────────────────── */}
          {/* FAQ SECTION                                                */}
          {/* ────────────────────────────────────────────────────────── */}
          <section ref={faqRef} style={{ marginBottom: '40px' }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#ffffff', marginBottom: '18px' }}>
              Security, privacy, and administration
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div className="codex-card">
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>
                  Why run a local companion engine?
                </div>
                <p style={{ fontSize: '0.8125rem', color: '#8e8ea0', lineHeight: 1.6, margin: 0 }}>
                  Remote media hosts limit connection slots and streaming large 4K files through a central server stresses bandwidth. The companion acts as a lightweight local proxy, delivering media directly to your player.
                </p>
              </div>

              <div className="codex-card">
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>
                  Is this safe to run on my system?
                </div>
                <p style={{ fontSize: '0.8125rem', color: '#8e8ea0', lineHeight: 1.6, margin: 0 }}>
                  Yes. The companion service is zero-dependency, open-source, and binds exclusively to <code>127.0.0.1</code> (localhost). No external devices on your Wi-Fi or internet can connect to it.
                </p>
              </div>

              <div className="codex-card">
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#ffffff', marginBottom: '4px' }}>
                  What happens if I stop the service?
                </div>
                <p style={{ fontSize: '0.8125rem', color: '#8e8ea0', lineHeight: 1.6, margin: 0 }}>
                  Valor continuously detects engine availability. If the engine is stopped, Valor automatically falls back to central server relay mode without stopping your video.
                </p>
              </div>
            </div>
          </section>

        </main>
      </div>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid #1c1c1f',
        padding: '28px',
        textAlign: 'center',
        color: '#555660',
        fontSize: '0.8rem'
      }}>
        Valor Engine Docs &bull; Pure Node.js Standard Library &bull; Zero Server Load Streaming
      </footer>
    </div>
  );
};
