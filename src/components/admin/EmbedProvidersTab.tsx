import React, { useState, useEffect } from 'react';
import { 
  Film, 
  Plus, 
  Trash2, 
  Check, 
  ExternalLink, 
  Code, 
  RotateCcw, 
  Save, 
  Sparkles, 
  SlidersHorizontal,
  Layers,
  HelpCircle
} from 'lucide-react';
import { 
  type EmbedProvider, 
  DEFAULT_EMBED_PROVIDERS, 
  getEmbedProviders, 
  saveEmbedProviders, 
  buildEmbedUrl, 
  parseIframeSnippet 
} from '../../services/embedProviders';

interface EmbedProvidersTabProps {
  onNotify?: (message: string, type?: 'success' | 'error' | 'info') => void;
  token?: string;
}

export const EmbedProvidersTab: React.FC<EmbedProvidersTabProps> = ({ onNotify, token }) => {
  const [providers, setProviders] = useState<EmbedProvider[]>(() => getEmbedProviders());
  const [selectedId, setSelectedId] = useState<string>(() => providers[0]?.id || 'videasy');
  const [iframeSnippet, setIframeSnippet] = useState<string>('');
  const [testTmdbId, setTestTmdbId] = useState<string>('533535');
  const [testSeason, setTestSeason] = useState<number>(1);
  const [testEpisode, setTestEpisode] = useState<number>(1);
  const [showLivePreview, setShowLivePreview] = useState<boolean>(false);
  const [isSaved, setIsSaved] = useState<boolean>(false);

  useEffect(() => {
    setProviders(getEmbedProviders());
  }, []);

  const activeProvider = providers.find(p => p.id === selectedId) || providers[0];

  const handleUpdateActive = (patch: Partial<EmbedProvider>) => {
    setIsSaved(false);
    setProviders(prev => prev.map(p => (p.id === selectedId ? { ...p, ...patch } : p)));
  };

  const handleAddCustomProvider = () => {
    const id = `provider_${Date.now()}`;
    const newP: EmbedProvider = {
      id,
      name: `Custom Source ${providers.length + 1}`,
      enabled: true,
      moviePattern: 'https://example.com/embed/movie/{id}{query}',
      tvPattern: 'https://example.com/embed/tv/{id}/{season}/{episode}{query}',
      animePattern: 'https://example.com/embed/anime/{id}/{episode}{query}',
      defaultParams: 'autoPlay=true',
      allowFullscreen: true
    };
    setProviders(prev => [...prev, newP]);
    setSelectedId(id);
    setIsSaved(false);
  };

  const handleDeleteProvider = (id: string) => {
    if (providers.length <= 1) {
      onNotify?.('At least one streaming provider must remain configured.', 'error');
      return;
    }
    const filtered = providers.filter(p => p.id !== id);
    setProviders(filtered);
    if (selectedId === id) {
      setSelectedId(filtered[0]?.id || '');
    }
    setIsSaved(false);
  };

  const handleApplySnippet = () => {
    if (!iframeSnippet.trim()) return;
    const parsed = parseIframeSnippet(iframeSnippet);
    if (!parsed) {
      onNotify?.('Could not extract a valid URL or iframe src from the snippet.', 'error');
      return;
    }
    handleUpdateActive({
      moviePattern: parsed.extractedMoviePattern || activeProvider.moviePattern,
      tvPattern: parsed.extractedTvPattern || activeProvider.tvPattern
    });
    setIframeSnippet('');
    onNotify?.('Iframe parameters and URI pattern auto-extracted!', 'success');
  };

  const handleSave = async () => {
    try {
      await saveEmbedProviders(providers, token);
      setIsSaved(true);
      onNotify?.('Online stream & iframe provider settings updated successfully!', 'success');
    } catch (e) {
      onNotify?.('Failed to save settings to server.', 'error');
    }
  };

  const handleResetDefaults = () => {
    setProviders(DEFAULT_EMBED_PROVIDERS);
    setSelectedId(DEFAULT_EMBED_PROVIDERS[0].id);
    saveEmbedProviders(DEFAULT_EMBED_PROVIDERS, token);
    setIsSaved(true);
    onNotify?.('Reset all providers to default configuration.', 'info');
  };

  const testVideo = {
    id: testTmdbId,
    tmdbId: testTmdbId,
    type: 'online_movie',
    season: testSeason,
    episode: testEpisode,
    currentTime: 0
  };

  const generatedMovieUrl = activeProvider
    ? buildEmbedUrl(activeProvider.id, testVideo, 0, testSeason, testEpisode)
    : '';

  const testTvVideo = {
    ...testVideo,
    type: 'online_tv'
  };

  const generatedTvUrl = activeProvider
    ? buildEmbedUrl(activeProvider.id, testTvVideo, 0, testSeason, testEpisode)
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Top Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(30, 36, 51, 0.7) 0%, rgba(18, 22, 33, 0.9) 100%)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            borderRadius: '12px',
            background: 'rgba(139, 92, 246, 0.15)',
            border: '1px solid rgba(139, 92, 246, 0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a78bfa'
          }}>
            <Film size={26} />
          </div>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#f3f4f6' }}>
              Online Stream & Embed Providers
            </h2>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: '#9ca3af' }}>
              Configure online stream server URLs, iframe templates, and parameters so provider domain changes update instantly across all players.
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={handleResetDefaults}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: '8px',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              color: '#d1d5db',
              fontSize: '0.85rem',
              fontWeight: 500,
              cursor: 'pointer'
            }}
          >
            <RotateCcw size={15} />
            Reset Defaults
          </button>
          <button
            onClick={handleSave}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 20px',
              borderRadius: '8px',
              background: '#8B5CF6',
              border: 'none',
              color: '#ffffff',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 4px 14px rgba(139, 92, 246, 0.4)'
            }}
          >
            <Save size={16} />
            Save Changes
          </button>
        </div>
      </div>

      {/* Main Grid: Left sidebar (list of sources) + Right details */}
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '24px' }}>
        {/* Source List Sidebar */}
        <div style={{
          background: 'rgba(18, 22, 33, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', color: '#6b7280', letterSpacing: '0.05em' }}>
              Streaming Sources
            </span>
            <button
              onClick={handleAddCustomProvider}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '4px 8px',
                borderRadius: '6px',
                background: 'rgba(139, 92, 246, 0.2)',
                border: '1px solid rgba(139, 92, 246, 0.4)',
                color: '#c4b5fd',
                fontSize: '0.75rem',
                cursor: 'pointer'
              }}
            >
              <Plus size={13} />
              Add
            </button>
          </div>

          {providers.map(p => {
            const isSelected = p.id === selectedId;
            return (
              <div
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '12px 14px',
                  borderRadius: '10px',
                  background: isSelected ? 'rgba(139, 92, 246, 0.18)' : 'rgba(255, 255, 255, 0.02)',
                  border: isSelected ? '1px solid rgba(139, 92, 246, 0.45)' : '1px solid rgba(255, 255, 255, 0.05)',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: p.enabled ? '#10b981' : '#6b7280'
                  }} />
                  <span style={{ fontSize: '0.88rem', fontWeight: isSelected ? 600 : 400, color: isSelected ? '#ffffff' : '#d1d5db' }}>
                    {p.name}
                  </span>
                </div>
                {providers.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProvider(p.id);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#6b7280',
                      cursor: 'pointer',
                      padding: '4px',
                      borderRadius: '4px'
                    }}
                    title="Delete source"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Selected Provider Details Editor */}
        {activeProvider && (
          <div style={{
            background: 'rgba(18, 22, 33, 0.65)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '14px',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '20px'
          }}>
            {/* Header with name and enable toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.07)', paddingBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, marginRight: '20px' }}>
                <input
                  type="text"
                  value={activeProvider.name}
                  onChange={(e) => handleUpdateActive({ name: e.target.value })}
                  style={{
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    borderRadius: '8px',
                    color: '#ffffff',
                    padding: '6px 12px',
                    width: '100%',
                    maxWidth: '320px'
                  }}
                />
                <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                  (ID: <code>{activeProvider.id}</code>)
                </span>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>Active Source</span>
                <input
                  type="checkbox"
                  checked={activeProvider.enabled}
                  onChange={(e) => handleUpdateActive({ enabled: e.target.checked })}
                  style={{ width: '18px', height: '18px', accentColor: '#8B5CF6' }}
                />
              </label>
            </div>

            {/* Quick Iframe Code Importer Card */}
            <div style={{
              background: 'rgba(23, 28, 42, 0.7)',
              border: '1px dashed rgba(139, 92, 246, 0.35)',
              borderRadius: '10px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Code size={16} style={{ color: '#a78bfa' }} />
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#e5e7eb' }}>
                  Quick Iframe Snippet Importer
                </span>
                <span style={{ fontSize: '0.78rem', color: '#9ca3af' }}>
                  — Paste any <code>&lt;iframe src="..."&gt;</code> code to auto-extract the server URL & parameters
                </span>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder='e.g. <iframe src="https://videasy.xyz/embed/movie/533535" width="100%" height="100%" frameborder="0" allowfullscreen></iframe>'
                  value={iframeSnippet}
                  onChange={(e) => setIframeSnippet(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'rgba(10, 13, 20, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.85rem',
                    color: '#ffffff'
                  }}
                />
                <button
                  type="button"
                  onClick={handleApplySnippet}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '8px',
                    background: 'rgba(139, 92, 246, 0.25)',
                    border: '1px solid rgba(139, 92, 246, 0.45)',
                    color: '#c4b5fd',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Auto-Detect
                </button>
              </div>
            </div>

            {/* Pattern Configuration Fields */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#9ca3af', marginBottom: '6px' }}>
                  Movie URL Template (Tokens: <code>{'{id}'}</code>, <code>{'{query}'}</code>)
                </label>
                <input
                  type="text"
                  value={activeProvider.moviePattern}
                  onChange={(e) => handleUpdateActive({ moviePattern: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'rgba(10, 13, 20, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.88rem',
                    color: '#ffffff',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#9ca3af', marginBottom: '6px' }}>
                  TV Show URL Template (Tokens: <code>{'{id}'}</code>, <code>{'{season}'}</code>, <code>{'{episode}'}</code>, <code>{'{query}'}</code>)
                </label>
                <input
                  type="text"
                  value={activeProvider.tvPattern}
                  onChange={(e) => handleUpdateActive({ tvPattern: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'rgba(10, 13, 20, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.88rem',
                    color: '#ffffff',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#9ca3af', marginBottom: '6px' }}>
                  Anime URL Template (Tokens: <code>{'{id}'}</code>, <code>{'{episode}'}</code>, <code>{'{query}'}</code>)
                </label>
                <input
                  type="text"
                  value={activeProvider.animePattern}
                  onChange={(e) => handleUpdateActive({ animePattern: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'rgba(10, 13, 20, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.88rem',
                    color: '#ffffff',
                    fontFamily: 'monospace'
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#9ca3af', marginBottom: '6px' }}>
                  Default Query Parameters (Appended automatically)
                </label>
                <input
                  type="text"
                  value={activeProvider.defaultParams}
                  onChange={(e) => handleUpdateActive({ defaultParams: e.target.value })}
                  style={{
                    width: '100%',
                    background: 'rgba(10, 13, 20, 0.7)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '8px 12px',
                    fontSize: '0.88rem',
                    color: '#ffffff',
                    fontFamily: 'monospace'
                  }}
                />
              </div>
            </div>

            {/* Live Testing & Verification Section */}
            <div style={{
              background: 'rgba(12, 15, 24, 0.85)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '0.88rem', fontWeight: 600, color: '#e5e7eb' }}>
                  Live URL Preview & Verification
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <label style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Sample TMDB ID:</label>
                  <input
                    type="text"
                    value={testTmdbId}
                    onChange={(e) => setTestTmdbId(e.target.value)}
                    style={{
                      width: '90px',
                      background: 'rgba(0, 0, 0, 0.4)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '6px',
                      padding: '4px 8px',
                      fontSize: '0.82rem',
                      color: '#ffffff',
                      textAlign: 'center'
                    }}
                  />
                  <button
                    onClick={() => setShowLivePreview(prev => !prev)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: '6px',
                      background: showLivePreview ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#d1d5db',
                      fontSize: '0.78rem',
                      cursor: 'pointer'
                    }}
                  >
                    {showLivePreview ? 'Hide Preview' : 'Show Iframe Preview'}
                  </button>
                </div>
              </div>

              {/* Generated URLs display */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0, 0, 0, 0.35)', padding: '8px 12px', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#a78bfa', fontWeight: 600 }}>Movie:</span>
                  <code style={{ fontSize: '0.82rem', color: '#d1d5db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                    {generatedMovieUrl}
                  </code>
                  <a
                    href={generatedMovieUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', textDecoration: 'none' }}
                  >
                    Test <ExternalLink size={12} />
                  </a>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0, 0, 0, 0.35)', padding: '8px 12px', borderRadius: '6px' }}>
                  <span style={{ fontSize: '0.8rem', color: '#a78bfa', fontWeight: 600 }}>TV (S{testSeason}E{testEpisode}):</span>
                  <code style={{ fontSize: '0.82rem', color: '#d1d5db', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '70%' }}>
                    {generatedTvUrl}
                  </code>
                  <a
                    href={generatedTvUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.78rem', textDecoration: 'none' }}
                  >
                    Test <ExternalLink size={12} />
                  </a>
                </div>
              </div>

              {showLivePreview && (
                <div style={{ marginTop: '8px', borderRadius: '8px', overflow: 'hidden', border: '1px solid rgba(255, 255, 255, 0.15)', height: '360px', background: '#000000' }}>
                  <iframe
                    src={generatedMovieUrl}
                    title="Live Stream Preview"
                    width="100%"
                    height="100%"
                    frameBorder="0"
                    allowFullScreen
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
