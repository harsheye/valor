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

const SAMPLE_STREAMS = [
  {
    title: 'Big Buck Bunny',
    type: 'HLS · 1080p test',
    url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    initial: 'B',
    bg: '#7a1b26',
    color: '#ff8a95'
  },
  {
    title: 'Tears of Steel',
    type: 'MP4 · 4K test',
    url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4',
    initial: 'T',
    bg: '#1a365d',
    color: '#90cdf4'
  }
];

export const OnlineStreamPage: React.FC<OnlineStreamPageProps> = ({
  onSelectMedia,
  onPlayVideo,
  tmdbApiKey,
  traktAccessToken,
  videos = []
}) => {
  const [streamUrl, setStreamUrl] = useState('');
  const [mobileMode, setMobileMode] = useState<'url' | 'tmdb'>('url');

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
      <div className="mobile-stream-container">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 700, margin: 0, color: 'var(--tx, var(--text-1))', letterSpacing: '-0.02em' }}>
            Online Stream
          </h1>
          {/* Toggle between URL streamer and TMDB explore on mobile */}
          <button
            type="button"
            onClick={() => setMobileMode(m => m === 'url' ? 'tmdb' : 'url')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '20px',
              background: 'var(--s1, var(--surface-1))',
              border: '1px solid var(--ln, var(--border))',
              color: 'var(--ac, var(--accent))',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            <Sparkles size={13} />
            <span>{mobileMode === 'url' ? 'Explore TMDB' : 'Stream URL'}</span>
          </button>
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

            {/* Sample Streams Section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <span style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '0.05em', color: 'var(--mut, var(--text-3))', textTransform: 'uppercase' }}>
                Sample Streams
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {SAMPLE_STREAMS.map((sample) => (
                  <div
                    key={sample.title}
                    onClick={() => {
                      setStreamUrl(sample.url);
                      handleStreamSubmit(undefined, sample.url, sample.title);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      background: 'var(--s1, var(--surface-1))',
                      border: '1px solid var(--ln, var(--border))',
                      borderRadius: '16px',
                      padding: '12px 14px',
                      cursor: 'pointer',
                      transition: 'background 0.15s ease'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                      <div
                        style={{
                          width: '42px',
                          height: '42px',
                          borderRadius: '12px',
                          background: sample.bg,
                          color: sample.color,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '17px',
                          fontWeight: 700,
                          flexShrink: 0
                        }}
                      >
                        {sample.initial}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--tx, var(--text-1))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sample.title}
                        </span>
                        <span style={{ fontSize: '12px', color: 'var(--mut, var(--text-3))' }}>
                          {sample.type}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '50%',
                        background: 'var(--ac, var(--accent))',
                        color: 'var(--on, #fff)',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        cursor: 'pointer'
                      }}
                    >
                      <Play size={16} fill="currentColor" />
                    </button>
                  </div>
                ))}
              </div>
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
