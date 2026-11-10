import React, { useState } from 'react';
import { Link2, Play, Radio, Sparkles } from 'lucide-react';
import { OnlineSearchTab } from '../components/OnlineSearchTab';

import type { VideoItem } from '../types/media';

interface OnlineStreamPageProps {
  onSelectMedia: (media: any) => void;
  onPlayVideo?: (video: any) => void;
  tmdbApiKey?: string;
  traktAccessToken?: string;
  videos?: VideoItem[];
}


export const OnlineStreamPage: React.FC<OnlineStreamPageProps> = ({
  onSelectMedia,
  onPlayVideo,
  tmdbApiKey,
  traktAccessToken,
  videos = []
}) => {
  const [streamUrl, setStreamUrl] = useState('');
  const [mobileMode, setMobileMode] = useState<'url' | 'tmdb'>('tmdb');

  const handleStreamSubmit = (e?: React.FormEvent, urlOverride?: string, titleOverride?: string) => {
    if (e) e.preventDefault();
    const finalUrl = (urlOverride || streamUrl).trim();
    if (!finalUrl) return;

    onSelectMedia({
      id: `stream-${Date.now()}`,
      title: titleOverride || finalUrl.split('/').pop()?.split('?')[0] || 'Online Stream',
      url: finalUrl,
      type: 'stream',
      currentTime: 0,
      duration: 0
    });
  };

  return (
    <div
      className="online-stream-page"
      style={{
        width: '100%',
        height: '100%',
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Mobile Stream View (<= 768px) */}
      <div className={`mobile-stream-container ${mobileMode === 'tmdb' ? 'mode-tmdb' : ''}`}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: mobileMode === 'tmdb' ? '8px 12px 6px 12px' : '0 0 14px 0',
          borderBottom: mobileMode === 'tmdb' ? '1px solid var(--border)' : 'none',
          background: 'var(--bg)',
          flexShrink: 0
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'var(--surface-2)',
            padding: '3px',
            borderRadius: '20px',
            border: '1px solid var(--border)'
          }}>
            <button
              type="button"
              onClick={() => setMobileMode('tmdb')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 13px',
                borderRadius: '16px',
                background: mobileMode === 'tmdb' ? 'var(--accent)' : 'transparent',
                color: mobileMode === 'tmdb' ? '#fff' : 'var(--text-3)',
                border: 'none',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Sparkles size={12} />
              <span>Explore TMDB</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileMode('url')}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '5px 13px',
                borderRadius: '16px',
                background: mobileMode === 'url' ? 'var(--accent)' : 'transparent',
                color: mobileMode === 'url' ? '#fff' : 'var(--text-3)',
                border: 'none',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
            >
              <Link2 size={12} />
              <span>Stream URL</span>
            </button>
          </div>
        </div>

        {mobileMode === 'url' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Stream URL Card */}
            <div
              style={{
                background: 'var(--s1, var(--surface-1))',
                border: '1px solid var(--ln, var(--border))',
                borderRadius: '16px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '10px',
                    background: 'var(--surface-3)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--ac, var(--accent))'
                  }}
                >
                  <Link2 size={18} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--tx, var(--text-1))' }}>
                    Enter Stream URL
                  </h3>
                  <span style={{ fontSize: '12px', color: 'var(--mut, var(--text-3))' }}>
                    Supports HLS (.m3u8), MP4, WebM
                  </span>
                </div>
              </div>

              <form onSubmit={handleStreamSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <input
                  type="url"
                  value={streamUrl}
                  onChange={(e) => setStreamUrl(e.target.value)}
                  placeholder="https://example.com/video.m3u8"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    background: 'var(--bg)',
                    border: '1px solid var(--ln, var(--border))',
                    borderRadius: '12px',
                    color: 'var(--tx, var(--text-1))',
                    fontSize: '14px',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                />
                <button
                  type="submit"
                  disabled={!streamUrl.trim()}
                  style={{
                    width: '100%',
                    padding: '12px',
                    background: streamUrl.trim() ? 'var(--ac, var(--accent))' : 'var(--surface-3)',
                    color: streamUrl.trim() ? 'var(--on, #fff)' : 'var(--mut, var(--text-3))',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '14px',
                    fontWeight: 700,
                    cursor: streamUrl.trim() ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <Radio size={16} />
                  <span>Stream</span>
                </button>
              </form>
            </div>
          </div>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            <OnlineSearchTab
              onSelectMedia={onSelectMedia}
              onPlayVideo={onPlayVideo}
              tmdbApiKey={tmdbApiKey}
              traktAccessToken={traktAccessToken}
              videos={videos}
            />
          </div>
        )}
      </div>

      {/* Desktop View (> 768px) */}
      <div className="desktop-stream-container">
        <OnlineSearchTab 
          onSelectMedia={onSelectMedia}
          onPlayVideo={onPlayVideo}
          tmdbApiKey={tmdbApiKey}
          traktAccessToken={traktAccessToken}
          videos={videos}
        />
      </div>

      <style>{`
        .mobile-stream-container {
          display: none;
          flex-direction: column;
          width: 100%;
          height: 100%;
          overflow-y: auto;
          padding: 10px 14px 80px 14px;
          box-sizing: border-box;
        }

        .mobile-stream-container.mode-tmdb {
          padding: 0 !important;
          overflow: hidden !important;
        }

        .desktop-stream-container {
          display: flex;
          flex-direction: column;
          width: 100%;
          height: 100%;
          min-height: 0;
          overflow: hidden;
        }

        @media (max-width: 768px) {
          .mobile-stream-container {
            display: flex;
          }
          .desktop-stream-container {
            display: none;
          }
        }
      `}</style>
    </div>
  );
};
