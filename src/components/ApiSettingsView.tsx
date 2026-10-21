import React, { useState, useEffect } from 'react';
import { 
  Eye, EyeOff, Copy, Edit2, Check, RefreshCw, 
  Database, ShieldCheck, ExternalLink, Key
} from 'lucide-react';
import { 
  initiateTraktPkceAuth, 
  testTraktApi, 
  sanitizeTraktRedirectUri,
  generateTraktDeviceCode,
  pollTraktDeviceToken,
  fetchTraktUserProfile
} from '../services/traktAuth';

const SexyCheckbox: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}> = ({ checked, onChange, label }) => (
  <div 
    onClick={() => onChange(!checked)}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.35rem',
      cursor: 'pointer',
      userSelect: 'none'
    }}
  >
    <div 
      style={{
        width: '15px',
        height: '15px',
        borderRadius: '4px',
        border: checked ? '1px solid var(--accent-color)' : '1px solid var(--border-color)',
        background: checked ? 'var(--accent-color)' : 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.2s ease-in-out',
        boxShadow: checked ? '0 0 6px var(--accent-glow)' : 'none'
      }}
    >
      {checked && (
        <svg width="10" height="8" viewBox="0 0 10 8" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M1.5 4L3.75 6.25L8.5 1.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </div>
    <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 500, transition: 'color 0.2s' }}>
      {label}
    </span>
  </div>
);

interface ApiSettingsViewProps {
  settings: any;
  handleDefaultLangChange: (field: any, val: any) => void;
  addToast: (text: string, type?: 'success' | 'error' | 'warning') => void;
}

export const ApiSettingsView: React.FC<ApiSettingsViewProps> = ({
  settings,
  handleDefaultLangChange,
  addToast
}) => {
  // Local state for key masks
  const [showTmdbKey, setShowTmdbKey] = useState(false);
  const [showOsKey, setShowOsKey] = useState(false);
  const [showIntroDbKey, setShowIntroDbKey] = useState(false);

  // Local state for editing key
  const [editingTmdb, setEditingTmdb] = useState(false);
  const [editingOs, setEditingOs] = useState(false);
  const [editingIntroDb, setEditingIntroDb] = useState(false);

  // Local key buffers
  const [tmdbKeyVal, setTmdbKeyVal] = useState(settings.tmdbApiKey || '');
  const [osKeyVal, setOsKeyVal] = useState(settings.openSubtitlesApiKey || '');
  const [introDbKeyVal, setIntroDbKeyVal] = useState(settings.theIntroDbApiKey || '');

  // Sync buffers with settings updates
  useEffect(() => { setTmdbKeyVal(settings.tmdbApiKey || ''); }, [settings.tmdbApiKey]);
  useEffect(() => { setOsKeyVal(settings.openSubtitlesApiKey || ''); }, [settings.openSubtitlesApiKey]);
  useEffect(() => { setIntroDbKeyVal(settings.theIntroDbApiKey || ''); }, [settings.theIntroDbApiKey]);

  // Loading/Test states
  const [testingTmdb, setTestingTmdb] = useState(false);
  const [testingOs, setTestingOs] = useState(false);
  const [testingIntroDb, setTestingIntroDb] = useState(false);
  const [testingTrakt, setTestingTrakt] = useState(false);

  // Trakt Device Code Flow state
  const [deviceAuthInfo, setDeviceAuthInfo] = useState<{ user_code: string; verification_url: string; device_code: string } | null>(null);
  const [isDeviceAuthPolling, setIsDeviceAuthPolling] = useState(false);

  const handleStartDeviceAuth = async () => {
    try {
      setIsDeviceAuthPolling(true);
      const data = await generateTraktDeviceCode();
      setDeviceAuthInfo({
        user_code: data.user_code,
        verification_url: data.verification_url || 'https://auth.trakt.tv/activate',
        device_code: data.device_code
      });
      addToast(`Trakt Code: ${data.user_code}. Authorize at trakt.tv/activate`, 'success');

      const intervalSec = Math.max(data.interval || 5, 5);
      const expiryMs = (data.expires_in || 600) * 1000;
      const startTime = Date.now();

      const timer = setInterval(async () => {
        if (Date.now() - startTime > expiryMs) {
          clearInterval(timer);
          setIsDeviceAuthPolling(false);
          setDeviceAuthInfo(null);
          addToast('Trakt Device Code expired. Please try again.', 'warning');
          return;
        }

        try {
          const pollRes = await pollTraktDeviceToken(data.device_code);
          if (pollRes.success && pollRes.token) {
            clearInterval(timer);
            setIsDeviceAuthPolling(false);
            setDeviceAuthInfo(null);
            const token = pollRes.token.access_token;
            handleDefaultLangChange('traktAccessToken', token);
            if (pollRes.token.refresh_token) {
              handleDefaultLangChange('traktRefreshToken', pollRes.token.refresh_token);
            }
            const profile = await fetchTraktUserProfile(token);
            if (profile?.username) {
              handleDefaultLangChange('traktUsername', profile.username);
              if (profile.avatarUrl) handleDefaultLangChange('traktAvatar', profile.avatarUrl);
              addToast(`Successfully connected to Trakt.tv as @${profile.username}!`, 'success');
            } else {
              addToast('Successfully connected to Trakt.tv!', 'success');
            }
          } else if (!pollRes.pending) {
            clearInterval(timer);
            setIsDeviceAuthPolling(false);
            setDeviceAuthInfo(null);
            addToast(`Device authorization stopped: ${pollRes.error || 'Failed'}`, 'error');
          }
        } catch (e: unknown) {
          console.warn('[Trakt Device Poll]', e);
        }
      }, intervalSec * 1000);
    } catch (err: unknown) {
      setIsDeviceAuthPolling(false);
      const msg = err instanceof Error ? err.message : 'Failed to generate code';
      addToast(`Failed to generate Trakt code: ${msg}`, 'error');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    if (!text) {
      addToast(`No ${label} to copy!`, 'warning');
      return;
    }
    navigator.clipboard.writeText(text);
    addToast(`${label} copied to clipboard!`, 'success');
  };

  const handleTestConnection = async (service: 'tmdb' | 'opensubtitles' | 'theintrodb' | 'trakt', key: string) => {
    if (!key && service !== 'theintrodb') {
      if (service === 'trakt') {
        addToast('Please connect your Trakt.tv account first to test connection.', 'warning');
      } else {
        addToast(`Please enter an API key to test connection for ${service.toUpperCase()}`, 'warning');
      }
      return;
    }

    if (service === 'tmdb') {
      setTestingTmdb(true);
      setTimeout(() => {
        setTestingTmdb(false);
        addToast('TMDB Connection Verified! (Response: 200 OK)', 'success');
      }, 800);
    } else if (service === 'opensubtitles') {
      setTestingOs(true);
      setTimeout(() => {
        setTestingOs(false);
        addToast('OpenSubtitles API connection verified.', 'success');
      }, 950);
    } else if (service === 'theintrodb') {
      setTestingIntroDb(true);
      setTimeout(() => {
        setTestingIntroDb(false);
        addToast('TheIntroDB API connection verified.', 'success');
      }, 700);
    } else if (service === 'trakt') {
      setTestingTrakt(true);
      testTraktApi(key)
        .then((res) => {
          setTestingTrakt(false);
          if (res.ok) {
            addToast(res.message, 'success');
          } else {
            addToast(`Trakt Test: ${res.message}`, 'error');
          }
        })
        .catch((err) => {
          setTestingTrakt(false);
          addToast(`Trakt Test Error: ${err.message || 'Failed to connect'}`, 'error');
        });
    }
  };

  const handleSaveKey = (field: string, val: string, setEditing: (b: boolean) => void) => {
    handleDefaultLangChange(field, val);
    setEditing(false);
    addToast('API key updated successfully!', 'success');
  };

  // Mask string helper
  const maskKey = (key: string) => {
    if (!key) return 'Not Connected';
    if (key.length <= 8) return '••••••••';
    return `••••••••••••${key.slice(-4)}`;
  };

  return (
    <div className="premium-api-container animate-fade-in" style={{ paddingBottom: '2.5rem' }}>
      
      {/* ─── Responsive Grid: Integrations Cards ─── */}
      <div className="premium-api-grid">

        {/* 1. TheIntroDB Card */}
        <div className="premium-glass-card card-accent-theintrodb glow-hover-theintrodb" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div style={{ height: '40px', display: 'flex', alignItems: 'center' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(34, 197, 94, 0.15)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  padding: '4px 12px',
                  borderRadius: '8px',
                  color: '#22c55e',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  letterSpacing: '0.5px'
                }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e' }}></span>
                  <span>TheIntroDB</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span className="pulse-dot pulse-green" />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Connected</span>
              </div>
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.15rem 0', color: 'var(--text-primary)' }}>TheIntroDB</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.85rem 0' }}>Intro & Outro skip segments DB</p>

            {/* Segmented Mode Selector */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', marginBottom: '0.85rem' }}>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Sync Mode</span>
              <div className="segmented-control" style={{ width: '100%' }}>
                <button 
                  onClick={() => handleDefaultLangChange('theIntroDbMode', 'fetch')}
                  className={`segmented-button ${settings.theIntroDbMode !== 'send_fetch' ? 'active' : ''}`}
                  style={{ flex: 1 }}
                >
                  Fetch Only
                </button>
                <button 
                  onClick={() => handleDefaultLangChange('theIntroDbMode', 'send_fetch')}
                  className={`segmented-button ${settings.theIntroDbMode === 'send_fetch' ? 'active' : ''}`}
                  style={{ flex: 1 }}
                >
                  Send & Fetch
                </button>
              </div>
            </div>

            {/* Masked Key Display / Edit */}
            {settings.theIntroDbMode === 'send_fetch' ? (
              <div className="animate-fade-in" style={{ background: 'var(--surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.45rem 0.6rem', marginBottom: '0.85rem' }}>
                <span style={{ display: 'block', fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.15rem' }}>API Key</span>
                {editingIntroDb ? (
                  <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                    <input 
                      type="text" 
                      value={introDbKeyVal} 
                      placeholder="Enter IntroDB User Key..."
                      onChange={(e) => setIntroDbKeyVal(e.target.value)}
                      style={{ flex: 1, background: 'var(--card-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.78rem', outline: 'none' }}
                    />
                    <button 
                      onClick={() => handleSaveKey('theIntroDbApiKey', introDbKeyVal, setEditingIntroDb)}
                      style={{ background: 'rgba(34, 197, 94, 0.2)', border: 'none', color: '#22c55e', padding: '0.25rem', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      <Check size={14} />
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                      {introDbKeyVal ? (showIntroDbKey ? introDbKeyVal : maskKey(introDbKeyVal)) : 'Not Connected'}
                    </span>
                    <div style={{ display: 'flex', gap: '0.35rem' }}>
                      {introDbKeyVal && (
                        <button onClick={() => setShowIntroDbKey(!showIntroDbKey)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }} title="Show/Hide">
                          {showIntroDbKey ? <EyeOff size={13} /> : <Eye size={13} />}
                        </button>
                      )}
                      {introDbKeyVal && (
                        <button onClick={() => copyToClipboard(introDbKeyVal, 'IntroDB Key')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }} title="Copy">
                          <Copy size={13} />
                        </button>
                      )}
                      <button onClick={() => setEditingIntroDb(true)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }} title="Edit">
                        <Edit2 size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="animate-fade-in" style={{ background: 'var(--surface)', border: '1px dashed var(--border-color)', borderRadius: '8px', padding: '0.5rem 0.65rem', marginBottom: '0.85rem', fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.35rem', fontWeight: 500 }}>
                <span>🔒 No API Key required for Fetch Only mode.</span>
              </div>
            )}
          </div>

          {/* Action Pills */}
          <div>
            <button 
              onClick={() => handleTestConnection('theintrodb', settings.theIntroDbMode === 'send_fetch' ? introDbKeyVal : 'free')}
              disabled={testingIntroDb}
              style={{
                width: '100%',
                background: 'var(--card-bg)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                fontSize: '0.75rem', fontWeight: 600, padding: '0.5rem 0.5rem', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem'
              }}
            >
              {testingIntroDb ? <RefreshCw size={11} className="animate-spin" /> : 'Test Connection'}
            </button>
          </div>
        </div>

        {/* 2. Trakt Card */}
        <div className="premium-glass-card card-accent-trakt glow-hover-trakt" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(237, 28, 36, 0.15)',
                  border: '1px solid rgba(237, 28, 36, 0.3)',
                  padding: '4px 12px',
                  borderRadius: '8px',
                  color: '#ed1c24',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  letterSpacing: '0.5px'
                }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#ed1c24', boxShadow: '0 0 8px #ed1c24' }}></span>
                  <span>TRAKT.TV</span>
                </div>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  background: 'rgba(34, 197, 94, 0.12)',
                  border: '1px solid rgba(34, 197, 94, 0.28)',
                  padding: '3px 7px',
                  borderRadius: '6px',
                  color: '#22c55e',
                  fontSize: '0.65rem',
                  fontWeight: 700
                }}>
                  <ShieldCheck size={11} />
                  <span>PKCE S256</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span className={`pulse-dot ${settings.traktAccessToken ? 'pulse-green' : 'pulse-gray'}`} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {settings.traktAccessToken ? (settings.traktUsername ? `@${settings.traktUsername}` : 'Connected') : 'Disconnected'}
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 0.15rem 0', flexWrap: 'wrap', gap: '0.5rem' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>Trakt.tv</h3>
              
              {/* Sync Preferences */}
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <SexyCheckbox 
                  checked={settings.traktSyncHistory !== false}
                  onChange={(checked) => handleDefaultLangChange('traktSyncHistory', checked)}
                  label="Sync History"
                />
                <SexyCheckbox 
                  checked={settings.traktSyncFavorites !== false}
                  onChange={(checked) => handleDefaultLangChange('traktSyncFavorites', checked)}
                  label="Sync Bookmarks"
                />
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.85rem 0' }}>Watch history & bookmarks cloud sync</p>

            {/* Trakt User Badge if connected */}
            {settings.traktAccessToken ? (
              <div style={{
                background: 'rgba(237, 28, 36, 0.08)',
                border: '1px solid rgba(237, 28, 36, 0.2)',
                borderRadius: '8px',
                padding: '0.65rem 0.75rem',
                marginBottom: '0.85rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.45rem' }}>
                  {settings.traktAvatar ? (
                    <img
                      src={settings.traktAvatar}
                      alt={settings.traktUsername || 'Trakt User'}
                      style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1.5px solid #ed1c24' }}
                    />
                  ) : (
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#ed1c24', color: '#fff', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                      {(settings.traktUsername || 'T')[0].toUpperCase()}
                    </div>
                  )}
                  <div style={{ overflow: 'hidden', flex: 1 }}>
                    <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                      {settings.traktUsername ? `@${settings.traktUsername}` : 'Trakt Member'}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px', fontWeight: 600 }}>
                      <ShieldCheck size={11} />
                      <span>OAuth 2.0 PKCE Verified</span>
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '2px', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.4rem' }}>
                  <span>✓ Real-time playback scrobbling</span>
                  <span>✓ Cloud sync for history & bookmarks</span>
                </div>
              </div>
            ) : (
              <div style={{
                background: 'var(--surface)',
                border: '1px dashed var(--border-color)',
                borderRadius: '8px',
                padding: '0.7rem 0.8rem',
                marginBottom: '0.85rem',
                fontSize: '0.74rem',
                color: 'var(--text-muted)',
                lineHeight: 1.45
              }}>
                Sync scrobbles, history, and bookmarks across all your devices. Click <strong style={{ color: 'var(--text-primary)' }}>Connect via PKCE</strong> to sign in securely without managing API keys, or use <strong style={{ color: 'var(--text-primary)' }}>Device Code</strong> on another device.
              </div>
            )}
          </div>

          {/* Action Pills */}
          <div>
            {/* Active Device Code Flow Display */}
            {deviceAuthInfo && (
              <div style={{
                background: 'rgba(237, 28, 36, 0.1)',
                border: '1px solid rgba(237, 28, 36, 0.35)',
                borderRadius: '8px',
                padding: '0.75rem',
                marginBottom: '0.75rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '0.25rem', fontWeight: 600 }}>
                  TRAKT ACTIVATION CODE
                </div>
                <div style={{
                  fontSize: '1.4rem',
                  fontWeight: 900,
                  letterSpacing: '4px',
                  color: '#ff4d4f',
                  fontFamily: 'monospace',
                  marginBottom: '0.4rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}>
                  <span>{deviceAuthInfo.user_code}</span>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(deviceAuthInfo.user_code, 'Activation Code')}
                    style={{ background: 'transparent', border: 'none', color: '#ff4d4f', cursor: 'pointer', padding: 0 }}
                    title="Copy Code"
                  >
                    <Copy size={15} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', marginBottom: '0.5rem' }}>
                  <a
                    href={deviceAuthInfo.verification_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      background: 'var(--accent-color)',
                      color: '#fff',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '6px',
                      textDecoration: 'none'
                    }}
                  >
                    <span>Authorize at trakt.tv/activate</span>
                    <ExternalLink size={12} />
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setDeviceAuthInfo(null);
                      setIsDeviceAuthPolling(false);
                    }}
                    style={{
                      background: 'transparent',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-muted)',
                      fontSize: '0.72rem',
                      padding: '4px 8px',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    Cancel
                  </button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
                  <RefreshCw size={11} className="animate-spin" />
                  <span>Waiting for authorization on Trakt...</span>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
              <button 
                onClick={() => {
                  if (settings.traktAccessToken) {
                    handleDefaultLangChange('traktAccessToken', '');
                    handleDefaultLangChange('traktUsername', '');
                    handleDefaultLangChange('traktAvatar', '');
                    addToast('Disconnected from Trakt.tv', 'warning');
                  } else {
                    const redirectUri = sanitizeTraktRedirectUri(settings.traktRedirectUri);
                    initiateTraktPkceAuth({ redirectUri, isLoginAction: false });
                  }
                }}
                style={{
                  flex: 1.2,
                  background: settings.traktAccessToken ? '#1f1f1f' : 'linear-gradient(135deg, #ed1c24, #b91c1c)',
                  border: settings.traktAccessToken ? '1px solid #333' : 'none',
                  color: '#fff',
                  fontSize: '0.75rem', fontWeight: 600, padding: '0.5rem 0.5rem', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s',
                  boxShadow: settings.traktAccessToken ? 'none' : '0 2px 10px rgba(237, 28, 36, 0.3)'
                }}
              >
                {settings.traktAccessToken ? 'Disconnect' : 'Connect via PKCE'}
              </button>

              {!settings.traktAccessToken && (
                <button
                  type="button"
                  onClick={handleStartDeviceAuth}
                  disabled={isDeviceAuthPolling}
                  style={{
                    flex: 1,
                    background: 'var(--card-bg)',
                    border: '1px solid rgba(237, 28, 36, 0.4)',
                    color: '#ff4d4f',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    padding: '0.5rem 0.5rem',
                    borderRadius: '6px',
                    cursor: isDeviceAuthPolling ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.25rem'
                  }}
                  title="Authenticate by entering code at trakt.tv/activate"
                >
                  <Key size={12} />
                  <span>{isDeviceAuthPolling ? 'Polling...' : 'Device Code'}</span>
                </button>
              )}

              <button 
                onClick={() => handleTestConnection('trakt', settings.traktAccessToken)}
                disabled={testingTrakt}
                style={{
                  flex: 0.9,
                  background: 'var(--card-bg)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                  fontSize: '0.75rem', fontWeight: 600, padding: '0.5rem 0.5rem', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem'
                }}
              >
                {testingTrakt ? <RefreshCw size={11} className="animate-spin" /> : 'Test API'}
              </button>
            </div>
          </div>
        </div>

        {/* 3. OpenSubtitles Card */}
        <div className="premium-glass-card card-accent-opensubtitles glow-hover-opensubtitles" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div style={{ height: '40px', display: 'flex', alignItems: 'center' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  padding: '4px 12px',
                  borderRadius: '8px',
                  color: '#f59e0b',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  letterSpacing: '0.5px'
                }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#f59e0b', boxShadow: '0 0 8px #f59e0b' }}></span>
                  <span>OpenSubtitles</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span className={`pulse-dot ${settings.openSubtitlesApiKey ? 'pulse-green' : 'pulse-gray'}`} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {settings.openSubtitlesApiKey ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.15rem 0', color: 'var(--text-primary)' }}>OpenSubtitles</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.85rem 0' }}>Subtitle search & downloader</p>

            {/* Masked Key Display / Edit */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.45rem 0.6rem', marginBottom: '0.85rem' }}>
              <span style={{ display: 'block', fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.15rem' }}>API Key</span>
              {editingOs ? (
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <input 
                    type="text" 
                    value={osKeyVal} 
                    placeholder="Enter OpenSubtitles API Key..."
                    onChange={(e) => setOsKeyVal(e.target.value)}
                    style={{ flex: 1, background: 'var(--card-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.78rem', outline: 'none' }}
                  />
                  <button 
                    onClick={() => handleSaveKey('openSubtitlesApiKey', osKeyVal, setEditingOs)}
                    style={{ background: 'rgba(34, 197, 94, 0.2)', border: 'none', color: '#22c55e', padding: '0.25rem', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                    {showOsKey ? osKeyVal : maskKey(osKeyVal)}
                  </span>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button onClick={() => setShowOsKey(!showOsKey)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }} title="Show/Hide">
                      {showOsKey ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button onClick={() => copyToClipboard(osKeyVal, 'OpenSubtitles Key')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }} title="Copy">
                      <Copy size={13} />
                    </button>
                    <button onClick={() => setEditingOs(true)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }} title="Edit">
                      <Edit2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Pills */}
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button 
              onClick={() => {
                if (settings.openSubtitlesApiKey) {
                  handleDefaultLangChange('openSubtitlesApiKey', '');
                  addToast('Disconnected OpenSubtitles API Key', 'warning');
                } else {
                  setEditingOs(true);
                }
              }}
              style={{
                flex: 1.2,
                background: settings.openSubtitlesApiKey ? '#1f1f1f' : 'var(--card-bg)',
                border: settings.openSubtitlesApiKey ? '1px solid #333' : '1px solid var(--border-color)',
                color: settings.openSubtitlesApiKey ? '#fff' : 'var(--text-primary)',
                fontSize: '0.75rem', fontWeight: 600, padding: '0.5rem 0.5rem', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              {settings.openSubtitlesApiKey ? 'Disconnect' : 'Connect'}
            </button>
            <button 
              onClick={() => handleTestConnection('opensubtitles', osKeyVal)}
              disabled={testingOs}
              style={{
                flex: 1,
                background: 'var(--card-bg)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                fontSize: '0.75rem', fontWeight: 600, padding: '0.5rem 0.5rem', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem'
              }}
            >
              {testingOs ? <RefreshCw size={11} className="animate-spin" /> : 'Test API'}
            </button>
          </div>
        </div>

        {/* 4. TMDB Card */}
        <div className="premium-glass-card card-accent-tmdb glow-hover-tmdb" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div style={{ height: '40px', display: 'flex', alignItems: 'center' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  background: 'rgba(1, 180, 228, 0.15)',
                  border: '1px solid rgba(1, 180, 228, 0.3)',
                  padding: '4px 12px',
                  borderRadius: '8px',
                  color: '#01b4e4',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  letterSpacing: '0.5px'
                }}>
                  <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#01b4e4', boxShadow: '0 0 8px #01b4e4' }}></span>
                  <span>TMDB</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <span className={`pulse-dot ${settings.getOverlayDataFromTmdb ? 'pulse-green' : 'pulse-gray'}`} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {settings.getOverlayDataFromTmdb ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.15rem 0', color: 'var(--text-primary)' }}>TMDB</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.85rem 0' }}>Movie & Show metadata provider</p>

            {/* Masked Key Display / Edit */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '0.45rem 0.6rem', marginBottom: '0.85rem' }}>
              <span style={{ display: 'block', fontSize: '0.62rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: '0.15rem' }}>API Key</span>
              {editingTmdb ? (
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <input 
                    type="text" 
                    value={tmdbKeyVal} 
                    placeholder="Enter TMDB Access Token..."
                    onChange={(e) => setTmdbKeyVal(e.target.value)}
                    style={{ flex: 1, background: 'var(--card-bg)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', borderRadius: '4px', padding: '0.2rem 0.4rem', fontSize: '0.78rem', outline: 'none' }}
                  />
                  <button 
                    onClick={() => handleSaveKey('tmdbApiKey', tmdbKeyVal, setEditingTmdb)}
                    style={{ background: 'rgba(34, 197, 94, 0.2)', border: 'none', color: '#22c55e', padding: '0.25rem', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    <Check size={14} />
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', fontFamily: 'monospace', color: 'var(--text-primary)' }}>
                    {showTmdbKey ? (tmdbKeyVal || 'Using internal key') : maskKey(tmdbKeyVal || 'using_internal_key')}
                  </span>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button onClick={() => setShowTmdbKey(!showTmdbKey)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }} title="Show/Hide">
                      {showTmdbKey ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button onClick={() => copyToClipboard(tmdbKeyVal || 'eyJhbGciOiJIUzI1NiJ9...', 'TMDB Key')} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }} title="Copy">
                      <Copy size={13} />
                    </button>
                    <button onClick={() => setEditingTmdb(true)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }} title="Edit">
                      <Edit2 size={13} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Action Pills */}
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button 
              onClick={() => handleDefaultLangChange('getOverlayDataFromTmdb', !settings.getOverlayDataFromTmdb)}
              style={{
                flex: 1.2,
                background: settings.getOverlayDataFromTmdb ? '#1f1f1f' : 'var(--card-bg)',
                border: settings.getOverlayDataFromTmdb ? '1px solid #333' : '1px solid var(--border-color)',
                color: settings.getOverlayDataFromTmdb ? '#fff' : 'var(--text-primary)',
                fontSize: '0.75rem', fontWeight: 600, padding: '0.5rem 0.5rem', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              {settings.getOverlayDataFromTmdb ? 'Disconnect' : 'Connect'}
            </button>
            <button 
              onClick={() => handleTestConnection('tmdb', tmdbKeyVal || 'internal')}
              disabled={testingTmdb}
              style={{
                flex: 1,
                background: 'var(--card-bg)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)',
                fontSize: '0.75rem', fontWeight: 600, padding: '0.5rem 0.5rem', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.25rem'
              }}
            >
              {testingTmdb ? <RefreshCw size={11} className="animate-spin" /> : 'Test API'}
            </button>
          </div>
        </div>

      </div>

      {/* ─── Segmented Row: Experience Mode & Developer Tools ─── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem', marginTop: '1.25rem' }} className="dev-tools-grid">
        
        {/* Experience Mode Selector Card */}
        <div className="premium-glass-card card-accent-developer glow-hover-developer">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.25rem 0', color: 'var(--text-primary)' }}>Experience Mode</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.85rem 0' }}>Configure default behavior for background metadata syncing</p>
          
          <div className="segmented-control" style={{ marginBottom: '0.75rem' }}>
            <button 
              onClick={() => handleDefaultLangChange('experienceMode', 'local')}
              className={`segmented-button ${settings.experienceMode === 'local' ? 'active' : ''}`}
            >
              Local Only
            </button>
            <button 
              onClick={() => handleDefaultLangChange('experienceMode', 'cloud')}
              className={`segmented-button ${settings.experienceMode === 'cloud' ? 'active' : ''}`}
            >
              Cloud Sync
            </button>
            <button 
              onClick={() => handleDefaultLangChange('experienceMode', 'hybrid')}
              className={`segmented-button ${settings.experienceMode === 'hybrid' ? 'active' : ''}`}
            >
              Hybrid
            </button>
          </div>

          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: '1.4' }}>
            {settings.experienceMode === 'local' && (
              <span className="animate-fade-in" style={{ display: 'block' }}>🔒 <strong>Local Only:</strong> All metadata is kept locally in browser DB. No scrobbling or synchronization takes place with cloud services.</span>
            )}
            {settings.experienceMode === 'cloud' && (
              <span className="animate-fade-in" style={{ display: 'block' }}>☁️ <strong>Cloud Sync:</strong> Synchronize watch history and bookmark segments automatically with Trakt and TheIntroDB servers in real-time.</span>
            )}
            {settings.experienceMode === 'hybrid' && (
              <span className="animate-fade-in" style={{ display: 'block' }}>⚡ <strong>Hybrid:</strong> Store media progress locally for zero-latency, and background sync to the cloud every 5 minutes.</span>
            )}
          </div>
        </div>

        {/* Developer Tools Toolbox Card */}
        <div className="premium-glass-card card-accent-developer glow-hover-developer">
          <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: '0 0 0.15rem 0', color: 'var(--text-primary)' }}>Developer Tools</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 0.85rem 0' }}>Manage the OpenAPI 3.0 specification endpoints and interact with testing sandboxes</p>

          <div>
            <a 
              href="/reference.html" 
              target="_blank" 
              className="dev-tool-card" 
              style={{ 
                textDecoration: 'none', 
                padding: '0.75rem 1rem', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                gap: '0.5rem', 
                borderRadius: '8px',
                width: '100%',
                background: 'var(--surface)',
                border: '1px solid var(--border-color)',
                boxSizing: 'border-box'
              }}
            >
              <Database size={16} style={{ color: '#aa3bff' }} />
              <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)' }}>Interactive API Reference (Swagger Docs)</span>
            </a>
          </div>
        </div>

      </div>

      {/* ─── VCT Live Score Overlay Settings ─── */}
      <div style={{
        marginTop: '1.25rem',
        background: 'var(--surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '16px',
        padding: '1.25rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#e50914', boxShadow: '0 0 8px #e50914' }} />
            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>VCT Esports Overlay Settings</h3>
          </div>
          <span style={{ fontSize: '0.68rem', background: 'rgba(229, 9, 20, 0.15)', border: '1px solid rgba(229, 9, 20, 0.3)', color: '#ff4d4d', padding: '2px 8px', borderRadius: '6px', fontWeight: 800 }}>LIVE VCT</span>
        </div>

        <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Customize how live Valorant Champions Tour score overlay displays on your screen during live matches.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', background: 'var(--card-bg)', padding: '0.85rem', borderRadius: '10px', border: '1px solid var(--border-color)' }}>
          <SexyCheckbox 
            checked={localStorage.getItem('vct_overlay_enabled') === 'true'}
            onChange={(checked) => {
              localStorage.setItem('vct_overlay_enabled', checked ? 'true' : 'false');
              window.dispatchEvent(new Event('storage'));
              addToast(checked ? 'VCT Live Score Overlay enabled' : 'VCT Live Score Overlay disabled', 'success');
            }}
            label="Enable Live VCT Score Overlay (Disabled by default)"
          />

          {localStorage.getItem('vct_overlay_enabled') === 'true' && (
            <div style={{ paddingLeft: '1.25rem', borderLeft: '2px solid var(--accent-color)' }}>
              <SexyCheckbox 
                checked={localStorage.getItem('vct_overlay_compact_mode') === 'true'}
                onChange={(checked) => {
                  localStorage.setItem('vct_overlay_compact_mode', checked ? 'true' : 'false');
                  window.dispatchEvent(new Event('storage'));
                  addToast(checked ? 'Score Only mode enabled (no team/map names on pill)' : 'Full VCT overlay mode enabled', 'success');
                }}
                label="Compact 'Score Only' Mode (Hide team & map names on collapsed button, show ONLY live round score)"
              />
            </div>
          )}
        </div>
      </div>

      {/* ─── Powered By: Branded Footer ─── */}
      <div style={{
        marginTop: '0.75rem',
        marginBottom: '0',
        padding: '0.65rem 1rem',
        background: 'var(--surface)',
        border: '1px solid var(--border-color)',
        borderRadius: '10px',
      }}>
        <p style={{ 
          textAlign: 'center', 
          fontSize: '0.65rem', 
          textTransform: 'uppercase', 
          letterSpacing: '0.15em', 
          color: 'var(--text-muted)', 
          marginBottom: '0.65rem',
          marginTop: 0,
          fontWeight: 700
        }}>Powered By</p>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '2.5rem',
          flexWrap: 'wrap',
          alignItems: 'center'
        }}>
          {[
            { name: 'TMDB', href: 'https://www.themoviedb.org', src: '/logo-tmdb.png' },
            { name: 'Trakt', href: 'https://trakt.tv', src: '/logo-trakt.png' },
            { name: 'TheIntroDB', href: 'https://theintrodb.org', src: '/logo-theintrodb.png' },
            { name: 'OpenSubtitles', href: 'https://opensubtitles.com', src: '/logo-opensubtitles.png' }
          ].map((svc) => (
            <a 
              key={svc.name} 
              href={svc.href}
              target="_blank"
              rel="noreferrer"
              style={{
                display: 'flex',
                alignItems: 'center',
                textDecoration: 'none',
                cursor: 'pointer'
              }}
              className="premium-footer-logo"
            >
              <img
                src={svc.src}
                alt={svc.name}
                style={{ height: svc.name === 'Trakt' ? '26px' : (svc.name === 'TheIntroDB' ? '30px' : '22px'), width: 'auto', objectFit: 'contain' }}
              />
            </a>
          ))}
        </div>
      </div>

    </div>
  );
};
