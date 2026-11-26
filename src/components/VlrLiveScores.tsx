import React, { useState, useEffect } from 'react';
import { 
  Trophy, Radio, Zap, ExternalLink
} from 'lucide-react';

export interface VlrMatch {
  id: string;
  game?: 'valorant' | 'cs2' | 'lol';
  eventName: string;
  stageName: string;
  region: 'americas' | 'emea' | 'pacific' | 'china' | 'all';
  tier: 'vct' | 'vcl' | 'gc' | 't3';
  status: 'ongoing' | 'upcoming' | 'completed';
  teamA: {
    name: string;
    tag: string;
    logo?: string;
    score: number;
    color?: string;
  };
  teamB: {
    name: string;
    tag: string;
    logo?: string;
    score: number;
    color?: string;
  };
  bestOf: string;
  currentMapIndex?: number;
  currentMapName?: string;
  currentMapRoundScore?: {
    teamA: number;
    teamB: number;
    attackerSide?: 'teamA' | 'teamB';
  };
  maps: {
    name: string;
    pickedBy?: 'teamA' | 'teamB' | 'decider';
    scoreA: number;
    scoreB: number;
    status: 'completed' | 'ongoing' | 'upcoming';
  }[];
  streamUrl?: string;
  vlrUrl?: string;
  lastUpdated?: string;
}

const parseVlrHtml = (html: string): VlrMatch[] => {
  const matches: VlrMatch[] = [];
  const linkBlocks = html.split(/<a\s+/gi);

  for (let i = 1; i < linkBlocks.length; i++) {
    const block = linkBlocks[i];
    const endLinkIndex = block.indexOf('</a>');
    if (endLinkIndex === -1) continue;

    const cardHtml = block.substring(0, endLinkIndex);

    // Check if this card represents a match link
    const hrefMatch = cardHtml.match(/href="(\/(\d+)\/([^"]+))"/i);
    if (!hrefMatch) continue;

    const matchPath = hrefMatch[1];
    const matchId = hrefMatch[2];
    const isLive = cardHtml.includes('mod-live') || cardHtml.includes('LIVE') || cardHtml.includes('ml mod-live');
    if (!isLive) continue;

    // Extract team names
    const teamNames: string[] = [];
    const teamMatches = cardHtml.matchAll(/<div\s+class="match-item-vs-team-name"[^>]*>([\s\S]*?)<\/div>/gi);
    for (const tm of teamMatches) {
      const cleanName = tm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (cleanName) teamNames.push(cleanName);
    }

    // Extract scores
    const scores: string[] = [];
    const scoreMatches = cardHtml.matchAll(/<div\s+class="match-item-vs-team-score[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
    for (const sm of scoreMatches) {
      const cleanScore = sm[1].replace(/<[^>]+>/g, '').trim();
      if (cleanScore !== undefined && cleanScore !== '') scores.push(cleanScore);
    }

    // Extract event name
    const eventMatch = cardHtml.match(/<div\s+class="match-item-event[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    let eventName = 'VCT Match';
    if (eventMatch) {
      eventName = eventMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    }

    const teamA = teamNames[0] || 'Team A';
    const teamB = teamNames[1] || 'Team B';
    const scoreA = parseInt(scores[0] || '0', 10);
    const scoreB = parseInt(scores[1] || '0', 10);

    matches.push({
      id: `vlr-real-${matchId}`,
      game: 'valorant',
      eventName: eventName,
      stageName: 'Live Match',
      region: 'all',
      tier: 'vct',
      status: 'ongoing',
      bestOf: 'BO3',
      teamA: {
        name: teamA,
        tag: teamA.substring(0, 4).toUpperCase(),
        score: isNaN(scoreA) ? 0 : scoreA,
        color: '#e50914'
      },
      teamB: {
        name: teamB,
        tag: teamB.substring(0, 4).toUpperCase(),
        score: isNaN(scoreB) ? 0 : scoreB,
        color: '#3b82f6'
      },
      currentMapName: 'Live Series',
      currentMapRoundScore: {
        teamA: isNaN(scoreA) ? 0 : scoreA,
        teamB: isNaN(scoreB) ? 0 : scoreB
      },
      vlrUrl: `https://www.vlr.gg${matchPath}`,
      maps: []
    });
  }

  return matches;
};

export const VlrLiveScores: React.FC = () => {
  const [matches, setMatches] = useState<VlrMatch[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedGame, setSelectedGame] = useState<'all' | 'valorant' | 'cs2' | 'lol'>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  const fetchLiveScores = async () => {
    try {
      let liveData: VlrMatch[] = [];

      // 1. Try local node endpoint
      const cacheBustUrl = `http://127.0.0.1:50001/api/vlr/live?_t=${Date.now()}`;
      const res = await fetch(cacheBustUrl, { cache: 'no-store' }).catch(() => null);
      
      if (res && res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          // Reject any old hardcoded mock IDs (e.g. match-276501 SEN vs FNC)
          liveData = data.filter((d: any) => !String(d.id).startsWith('match-27650') && !String(d.id).startsWith('match-res-'));
        }
      }

      // 2. If no valid live matches from local node API, fetch directly from official vlr.gg via CORS proxy
      if (liveData.length === 0) {
        const directRes = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent('https://www.vlr.gg/matches')}`, { cache: 'no-store' }).catch(() => null);
        if (directRes && directRes.ok) {
          const html = await directRes.text();
          liveData = parseVlrHtml(html);
        }
      }

      setMatches(liveData);
      if (liveData.length > 0 && !selectedMatchId) {
        setSelectedMatchId(liveData[0].id);
      }
    } catch (e) {
      setMatches([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveScores();
    // Silent auto-refresh every 30 seconds
    const timer = setInterval(fetchLiveScores, 30000);
    return () => clearInterval(timer);
  }, []);

  const filteredMatches = matches.filter((m) => {
    if (selectedGame !== 'all' && (m.game || 'valorant') !== selectedGame) return false;
    if (selectedStatus !== 'all' && m.status !== selectedStatus) return false;
    return true;
  });

  const activeMatch = matches.find((m) => m.id === selectedMatchId) || (filteredMatches.length > 0 ? filteredMatches[0] : null);

  return (
    <div className="workspace-panel-wrapper" style={{ minHeight: '100%' }}>
      <div className="glass-panel workspace-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', width: '100%', boxSizing: 'border-box', padding: '1.5rem' }}>
        
        {/* Sleek Game & Status Filter Bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem', background: 'rgba(255,255,255,0.02)', padding: '0.85rem 1.25rem', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.06)' }}>
          
          {/* Game Selector Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700, marginRight: '4px' }}>Game:</span>
            {[
              { id: 'all', label: 'All Games' },
              { id: 'valorant', label: 'VALORANT (VLR)' },
              { id: 'cs2', label: 'CS2 (HLTV 5★)' },
              { id: 'lol', label: 'League of Legends (LoL)' }
            ].map((g) => (
              <button
                key={g.id}
                onClick={() => setSelectedGame(g.id as any)}
                style={{
                  background: selectedGame === g.id ? '#e50914' : 'rgba(255,255,255,0.04)',
                  border: selectedGame === g.id ? '1px solid #ff4d4d' : '1px solid rgba(255,255,255,0.08)',
                  color: '#fff',
                  padding: '6px 14px',
                  borderRadius: '10px',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: selectedGame === g.id ? '0 4px 14px rgba(229,9,20,0.3)' : 'none'
                }}
              >
                {g.label}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.3)', padding: '3px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.06)' }}>
            {['all', 'ongoing', 'upcoming'].map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatus(st)}
                style={{
                  background: selectedStatus === st ? '#e50914' : 'transparent',
                  border: 'none',
                  color: selectedStatus === st ? '#fff' : 'rgba(255,255,255,0.5)',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  textTransform: 'capitalize'
                }}
              >
                {st === 'ongoing' ? 'Live Matches' : st}
              </button>
            ))}
          </div>
        </div>

        {/* Real Live Matches Grid or Real Empty State */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '4rem 0', color: 'rgba(255,255,255,0.5)', fontSize: '0.9rem' }}>
            Checking official vlr.gg live matches...
          </div>
        ) : filteredMatches.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.015)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '54px', height: '54px', borderRadius: '50%', background: 'rgba(229,9,20,0.1)', border: '1px solid rgba(229,9,20,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e50914' }}>
              <Radio size={24} className="pulsing" />
            </div>
            <h3 style={{ margin: '4px 0 0 0', fontSize: '1.25rem', fontWeight: 800, color: '#fff' }}>No Matches Found</h3>
            <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)', maxWidth: '400px' }}>
              Match feeds will automatically update when tournament matches are active.
            </p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.25rem' }}>
            {filteredMatches.map((m) => {
              const isSelected = activeMatch?.id === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedMatchId(m.id)}
                  className="glass-panel"
                  style={{
                    background: isSelected ? 'rgba(229, 9, 20, 0.06)' : 'rgba(255,255,255,0.02)',
                    border: isSelected ? '1px solid rgba(229, 9, 20, 0.4)' : '1px solid rgba(255,255,255,0.06)',
                    borderRadius: '14px',
                    padding: '1.25rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    boxShadow: isSelected ? '0 8px 24px rgba(229,9,20,0.15)' : 'none'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.eventName} • {m.stageName}
                    </span>
                    {m.status === 'ongoing' ? (
                      <span style={{ background: '#e50914', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 800 }}>
                        LIVE {m.bestOf}
                      </span>
                    ) : (
                      <span style={{ background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.65rem', fontWeight: 700 }}>
                        UPCOMING
                      </span>
                    )}
                  </div>

                  {/* Teams & Series Score Row */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.5rem 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: m.teamA.color || '#e50914', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: '0.85rem' }}>
                        {m.teamA.tag}
                      </div>
                      <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{m.teamA.name}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.4)', padding: '6px 16px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                      <span style={{ fontSize: '1.4rem', fontWeight: 900, color: m.teamA.score > m.teamB.score ? '#e50914' : '#fff' }}>
                        {m.teamA.score}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700 }}>:</span>
                      <span style={{ fontSize: '1.4rem', fontWeight: 900, color: m.teamB.score > m.teamA.score ? '#e50914' : '#fff' }}>
                        {m.teamB.score}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, justifyContent: 'flex-end' }}>
                      <span style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{m.teamB.name}</span>
                      <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: m.teamB.color || '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: '0.85rem' }}>
                        {m.teamB.tag}
                      </div>
                    </div>
                  </div>

                  {/* Current Map & Live Round Score */}
                  {m.status === 'ongoing' && m.currentMapRoundScore && (
                    <div style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', padding: '0.65rem 0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', color: '#3b82f6', fontWeight: 700 }}>
                        <Zap size={14} />
                        <span>Map: {m.currentMapName}</span>
                      </div>
                      <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#fff' }}>
                        Live Score: <span style={{ color: '#2ecc71' }}>{m.currentMapRoundScore.teamA}</span> - <span style={{ color: '#e74c3c' }}>{m.currentMapRoundScore.teamB}</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Detailed Selected Match Breakdown */}
        {activeMatch && (
          <div className="glass-panel" style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)', borderRadius: '16px', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '0.85rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 700 }}>Detailed Match Breakdown</span>
                <h3 style={{ margin: '2px 0 0 0', fontSize: '1.2rem', fontWeight: 800, color: '#fff' }}>
                  {activeMatch.teamA.name} vs {activeMatch.teamB.name} ({activeMatch.bestOf})
                </h3>
              </div>

              <a 
                href={activeMatch.vlrUrl || 'https://vlr.gg'} 
                target="_blank" 
                rel="noopener noreferrer" 
                style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.8)', border: '1px solid rgba(255,255,255,0.1)', padding: '5px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, textDecoration: 'none' }}
              >
                <span>View Match Feed</span>
                <ExternalLink size={13} />
              </a>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Official Match Feed Link</h4>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'rgba(255,255,255,0.5)' }}>
                Live scores are synced in real-time directly from official vlr.gg match feeds.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
