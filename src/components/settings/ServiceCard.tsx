import React, { useState } from 'react';
import { Eye, EyeOff, Copy, Check, RefreshCw } from 'lucide-react';
import { SettingsCard } from './SettingsCard';
import { SettingRow } from './SettingRow';
import { Switch } from './Switch';
import { Segmented } from './Segmented';

export interface ServiceCardProps {
  id: 'theintrodb' | 'trakt' | 'opensubtitles' | 'tmdb';
  name: string;
  description: string;
  isConnected: boolean;
  onTestConnection: () => Promise<boolean>;
  testSuccessMessage?: string;
  testErrorMessage?: string;

  // TheIntroDB props
  introDbMode?: 'fetch' | 'send_fetch';
  onIntroDbModeChange?: (mode: 'fetch' | 'send_fetch') => void;
  introDbApiKey?: string;
  onIntroDbApiKeyChange?: (key: string) => void;

  // Trakt props
  onConnectTrakt?: () => void;
  onUseDeviceCode?: () => void;
  onDisconnectTrakt?: () => void;
  traktSyncHistory?: boolean;
  onTraktSyncHistoryChange?: (val: boolean) => void;
  traktSyncBookmarks?: boolean;
  onTraktSyncBookmarksChange?: (val: boolean) => void;
  deviceCodeInfo?: { user_code: string; verification_url: string } | null;

  // API Key Props (OpenSubtitles & TMDB)
  apiKey?: string;
  onSaveApiKey?: (key: string) => void;
  onDisconnectApiKey?: () => void;
}

export const ServiceCard: React.FC<ServiceCardProps> = ({
  id,
  name,
  description,
  isConnected,
  onTestConnection,
  testSuccessMessage = 'Connection verified successfully.',
  testErrorMessage = 'Connection test failed. Check settings.',

  introDbMode = 'fetch',
  onIntroDbModeChange,
  introDbApiKey = '',
  onIntroDbApiKeyChange,

  onConnectTrakt,
  onUseDeviceCode,
  onDisconnectTrakt,
  traktSyncHistory = true,
  onTraktSyncHistoryChange,
  traktSyncBookmarks = true,
  onTraktSyncBookmarksChange,
  deviceCodeInfo,

  apiKey = '',
  onSaveApiKey,
  onDisconnectApiKey,
}) => {
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Key visibility & editing
  const [showKey, setShowKey] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [inputVal, setInputVal] = useState<string>('');

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const ok = await onTestConnection();
      setTestResult({
        success: ok,
        message: ok ? testSuccessMessage : testErrorMessage,
      });
    } catch {
      setTestResult({
        success: false,
        message: testErrorMessage,
      });
    } finally {
      setTesting(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <SettingsCard
      title={name}
      description={description}
      badge={
        <span className="service-status-pill">
          {isConnected ? 'Connected' : 'Not connected'}
        </span>
      }
      headerAction={
        <button
          type="button"
          onClick={handleTest}
          disabled={testing}
          className="settings-btn-secondary"
          style={{ padding: '4px 10px', fontSize: '0.75rem' }}
          aria-label={`Test connection for ${name}`}
        >
          <RefreshCw size={12} className={testing ? 'animate-spin' : ''} />
          <span>{testing ? 'Testing...' : 'Test connection'}</span>
        </button>
      }
    >
      {/* Test feedback */}
      {testResult && (
        <div
          role="status"
          style={{
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-sm)',
            fontSize: '0.8rem',
            background: testResult.success
              ? 'color-mix(in srgb, var(--success) 15%, var(--surface-2))'
              : 'color-mix(in srgb, var(--danger) 15%, var(--surface-2))',
            color: testResult.success ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${testResult.success ? 'var(--success)' : 'var(--danger)'}`,
          }}
        >
          {testResult.message}
        </div>
      )}

      {/* TheIntroDB Specifics */}
      {id === 'theintrodb' && (
        <>
          <SettingRow
            title="Operation mode"
            description="Choose how intro data is processed"
            control={
              <Segmented
                value={introDbMode}
                onChange={(val) => onIntroDbModeChange && onIntroDbModeChange(val)}
                options={[
                  { value: 'fetch', label: 'Fetch only' },
                  { value: 'send_fetch', label: 'Fetch & send' },
                ]}
              />
            }
          />

          <div
            style={{
              padding: 'var(--space-2) var(--space-3)',
              background: 'var(--surface-2)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.775rem',
              color: 'var(--text-3)',
              border: '1px solid var(--border)',
            }}
          >
            {introDbMode === 'fetch'
              ? 'No API key is needed for fetch-only mode.'
              : 'Submitting chapter points helps the community and requires a contributor key.'}
          </div>

          {introDbMode === 'send_fetch' && (
            <SettingRow
              title="Contributor API key"
              description="Your personal TheIntroDB token"
              control={
                <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                  <input
                    type="password"
                    value={introDbApiKey}
                    onChange={(e) => onIntroDbApiKeyChange && onIntroDbApiKeyChange(e.target.value)}
                    placeholder="Enter API key"
                    style={{
                      width: '200px',
                      padding: '7px 12px',
                      fontSize: '0.825rem',
                      background: 'var(--surface-2)',
                      border: '1px solid var(--control-border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-1)',
                      outline: 'none',
                    }}
                  />
                </div>
              }
            />
          )}
        </>
      )}

      {/* Trakt.tv Specifics */}
      {id === 'trakt' && (
        <>
          {!isConnected ? (
            <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={onConnectTrakt}
                className="settings-btn-primary"
              >
                Connect with Trakt
              </button>
              <button
                type="button"
                onClick={onUseDeviceCode}
                className="settings-btn-secondary"
              >
                Use device code
              </button>
            </div>
          ) : (
            <>
              <SettingRow
                title="Sync history"
                description="Automatically record watched media to your Trakt account"
                control={
                  <Switch
                    checked={traktSyncHistory}
                    onChange={(v) => onTraktSyncHistoryChange && onTraktSyncHistoryChange(v)}
                    aria-label="Sync history with Trakt"
                  />
                }
              />
              <SettingRow
                title="Sync bookmarks"
                description="Synchronize playback bookmarks and favorites"
                control={
                  <Switch
                    checked={traktSyncBookmarks}
                    onChange={(v) => onTraktSyncBookmarksChange && onTraktSyncBookmarksChange(v)}
                    aria-label="Sync bookmarks with Trakt"
                  />
                }
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
                <button
                  type="button"
                  onClick={onDisconnectTrakt}
                  className="settings-btn-destructive"
                  style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                >
                  Disconnect Trakt
                </button>
              </div>
            </>
          )}

          {deviceCodeInfo && (
            <div
              style={{
                padding: 'var(--space-3)',
                background: 'var(--surface-2)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-2)',
              }}
            >
              <span style={{ fontSize: '0.825rem', color: 'var(--text-1)', fontWeight: 600 }}>
                Device authorization code:
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <span
                  style={{
                    fontSize: '1.2rem',
                    fontWeight: 700,
                    letterSpacing: '2px',
                    fontFamily: 'monospace',
                    color: 'var(--accent)',
                  }}
                >
                  {deviceCodeInfo.user_code}
                </span>
                <button
                  type="button"
                  className="settings-btn-secondary"
                  style={{ padding: '4px 8px', fontSize: '0.75rem' }}
                  onClick={() => handleCopy(deviceCodeInfo.user_code)}
                >
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-3)' }}>
                Visit{' '}
                <a
                  href={deviceCodeInfo.verification_url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--accent)' }}
                >
                  {deviceCodeInfo.verification_url}
                </a>{' '}
                to enter the code and authorize Valor.
              </span>
            </div>
          )}
        </>
      )}

      {/* OpenSubtitles & TMDB Specifics */}
      {(id === 'opensubtitles' || id === 'tmdb') && (
        <>
          {isConnected ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <SettingRow
                title="Configured API key"
                description="Securely saved on this device"
                control={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={apiKey}
                      readOnly
                      aria-label="Masked API key"
                      style={{
                        width: '180px',
                        padding: '7px 12px',
                        fontSize: '0.825rem',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--control-border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-1)',
                        cursor: 'default',
                      }}
                    />
                    <button
                      type="button"
                      aria-label={showKey ? 'Hide key' : 'Show key'}
                      className="settings-btn-secondary"
                      style={{ padding: '6px 8px' }}
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      type="button"
                      aria-label="Copy key"
                      className="settings-btn-secondary"
                      style={{ padding: '6px 8px' }}
                      onClick={() => handleCopy(apiKey)}
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                  </div>
                }
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={onDisconnectApiKey}
                  className="settings-btn-destructive"
                  style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                >
                  Disconnect key
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <SettingRow
                title="Enter API key"
                description={`Paste your ${name} API key below`}
                control={
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <input
                      type="text"
                      value={inputVal}
                      onChange={(e) => setInputVal(e.target.value)}
                      placeholder="Paste API key"
                      aria-label={`${name} API key input`}
                      style={{
                        width: '200px',
                        padding: '7px 12px',
                        fontSize: '0.825rem',
                        background: 'var(--surface-2)',
                        border: '1px solid var(--control-border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-1)',
                        outline: 'none',
                      }}
                    />
                    <button
                      type="button"
                      disabled={!inputVal.trim()}
                      onClick={() => {
                        if (inputVal.trim() && onSaveApiKey) {
                          onSaveApiKey(inputVal.trim());
                          setInputVal('');
                        }
                      }}
                      className="settings-btn-primary"
                      style={{ padding: '6px 14px' }}
                    >
                      Connect
                    </button>
                  </div>
                }
              />
            </div>
          )}
        </>
      )}
    </SettingsCard>
  );
};
