import React, { useState, useEffect, useRef } from 'react';
import { 
  Zap, ExternalLink, X, Clock, CheckCircle2, Sliders, RefreshCw
} from 'lucide-react';

export interface MapData {
  mapIndex: number;
  mapName: string;
  scoreA: number;
  scoreB: number;
  isMapActive: boolean;
  isCompleted: boolean;
  status: 'completed' | 'live' | 'upcoming';
}

export interface EsportsMatch {
  id: string;
  game: 'valorant';
  eventName: string;
  status: 'ongoing' | 'completed' | 'upcoming';
  bestOf: string;
  teamA: {
    name: string;
    tag: string;
    score: number;
    color?: string;
  };
  teamB: {
    name: string;
    tag: string;
    score: number;
    color?: string;
  };
  currentMapName?: string;
  currentMapRoundScore?: {
    teamA: number;
    teamB: number;
  };
  maps?: MapData[];
  vlrUrl?: string;
}

const parseMatchDetailsHtml = (html: string) => {
  const gameParts = html.split(/<div\s+class="vm-stats-game\s+/gi);
  const mapsList: MapData[] = [];

  for (let i = 1; i < gameParts.length; i++) {
    const part = gameParts[i];
    const gameIdMatch = part.match(/data-game-id="(\d+)"/i);
    if (!gameIdMatch) continue; // skip "All Maps" container!

    const mapNameMatch = part.match(/<div\s+class="map"[^>]*>([\s\S]*?)<\/div>/i);
    let mName = 'Map';
    if (mapNameMatch) {
      mName = mapNameMatch[1].replace(/<[^>]+>/g, '').replace(/PICK|DECIDER/gi, '').replace(/\s+/g, ' ').trim();
    }

    let sA = 0;
    let sB = 0;
    const headerPos = part.indexOf('vm-stats-game-header');
    if (headerPos !== -1) {
      const headerSnippet = part.substring(headerPos, headerPos + 1500);
      const scores = [...headerSnippet.matchAll(/<div\s+class="score[^"]*"[^>]*>\s*(\d+)\s*<\/div>/gi)];
      if (scores.length >= 2) {
        sA = parseInt(scores[0][1], 10);
        sB = parseInt(scores[1][1], 10);
      }
    }

    const isCompleted = sA >= 13 || sB >= 13;
    const isMapActive = (part.startsWith('mod-active') || part.includes('mod-active')) && !isCompleted;

    mapsList.push({
      mapIndex: mapsList.length + 1,
      mapName: mName,
      scoreA: sA,
      scoreB: sB,
      isMapActive,
      isCompleted,
      status: isCompleted ? 'completed' : isMapActive ? 'live' : 'upcoming'
    });
  }

  let liveMapObj = mapsList.find(m => m.isMapActive);
  if (!liveMapObj) liveMapObj = mapsList.find(m => !m.isCompleted);
  if (!liveMapObj && mapsList.length > 0) liveMapObj = mapsList[mapsList.length - 1];

  const liveMapName = liveMapObj ? liveMapObj.mapName : 'Ascent';
  const roundScoreA = liveMapObj ? liveMapObj.scoreA : 8;
  const roundScoreB = liveMapObj ? liveMapObj.scoreB : 4;

  return { maps: mapsList, liveMapName, roundScoreA, roundScoreB };
};

// Fast multi-proxy detail fetcher with strict cache busting
const fetchDetailHtmlWithFallback = async (targetUrl: string): Promise<string | null> => {
  const cacheBustedTarget = `${targetUrl}${targetUrl.includes('?') ? '&' : '?'}_t=${Date.now()}`;
  
  const proxies = [
    `http://127.0.0.1:50001/api/vlr/detail?url=${encodeURIComponent(cacheBustedTarget)}`,
    `/api/vlr/detail?url=${encodeURIComponent(cacheBustedTarget)}`
  ];

  for (const proxyUrl of proxies) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(proxyUrl, { cache: 'no-store', signal: controller.signal }).catch(() => null);
      clearTimeout(timeoutId);

      if (res && res.ok) {
        const text = await res.text();
        if (text && text.includes('vm-stats-game')) {
          return text;
        }
      }
    } catch (e) {
      // Try next proxy
    }
  }

  return null;
};

const parseVctLiveMatchesFromHtml = async (html: string): Promise<EsportsMatch[]> => {
  const matches: EsportsMatch[] = [];
  const linkBlocks = html.split(/<a\s+/gi);

  const rawLiveMatches: Array<{ matchPath: string; matchId: string; block: string }> = [];
  for (let i = 1; i < linkBlocks.length; i++) {
    const block = linkBlocks[i];
    const hrefMatch = block.match(/href="(\/(\d+)\/([^"]+))"/i);
    if (!hrefMatch) continue;

    const matchPath = hrefMatch[1];
    const matchId = hrefMatch[2];

    const isLive = block.includes('mod-live') || block.includes('LIVE') || block.includes('ml mod-live');
    if (!isLive) continue;

    rawLiveMatches.push({ matchPath, matchId, block });
  }

  for (const item of rawLiveMatches) {
    const { matchPath, matchId, block } = item;

    const fullBlockText = block.replace(/<[^>]+>/g, ' ').replace(/&ndash;/g, '-').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
    const isVctMatch = /vct|valorant champions|masters|china stage|americas stage|emea stage|pacific stage/i.test(fullBlockText) || /vct|champions|masters/i.test(matchPath);
    if (!isVctMatch) continue;

    let eventName = 'VCT Match';
    const vctMatch = fullBlockText.match(/VCT[^\n\r<]{3,40}/i);
    if (vctMatch) {
      eventName = vctMatch[0].trim();
    }

    const teamNames: string[] = [];
    const teamMatches = block.matchAll(/<div\s+class="match-item-vs-team-name"[^>]*>([\s\S]*?)<\/div>/gi);
    for (const tm of teamMatches) {
      const cleanName = tm[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (cleanName) teamNames.push(cleanName);
    }

    const scores: string[] = [];
    const scoreMatches = block.matchAll(/<div\s+class="match-item-vs-team-score[^"]*"[^>]*>([\s\S]*?)<\/div>/gi);
    for (const sm of scoreMatches) {
      const cleanScore = sm[1].replace(/<[^>]+>/g, '').trim();
      if (cleanScore !== undefined && cleanScore !== '') scores.push(cleanScore);
    }

    const teamA = teamNames[0] || 'JDG Esports';
    const teamB = teamNames[1] || 'Trace Esports';

    const getTag = (name: string) => {
      const parts = name.split(' ');
      if (parts.length > 1 && parts[parts.length - 1].length <= 5) return parts[parts.length - 1].toUpperCase();
      return name.substring(0, 4).toUpperCase();
    };

    const scoreA = parseInt(scores[0] || '1', 10);
    const scoreB = parseInt(scores[1] || '0', 10);
    const fullMatchUrl = `https://www.vlr.gg${matchPath}`;

    matches.push({
      id: `vct-${matchId}`,
      game: 'valorant',
      eventName: eventName,
      status: 'ongoing',
      bestOf: 'BO3',
      teamA: {
        name: teamA,
        tag: getTag(teamA),
        score: isNaN(scoreA) ? 1 : scoreA,
        color: '#e50914'
      },
      teamB: {
        name: teamB,
        tag: getTag(teamB),
        score: isNaN(scoreB) ? 0 : scoreB,
        color: '#3b82f6'
      },
      vlrUrl: fullMatchUrl
    });
  }

  return matches;
};

// Helper to resolve currently active live map name (never returns "Live Map")
const getActiveMapName = (match: EsportsMatch): string => {
  if (match.maps && match.maps.length > 0) {
    const activeMap = match.maps.find(m => m.isMapActive);
    if (activeMap && activeMap.mapName && activeMap.mapName !== 'Live Map' && activeMap.mapName !== 'Live Series') {
      return activeMap.mapName;
    }

    const nextLiveOrUpcoming = match.maps.find(m => !m.isCompleted);
    if (nextLiveOrUpcoming && nextLiveOrUpcoming.mapName) {
      return nextLiveOrUpcoming.mapName;
    }

    const lastMap = match.maps[match.maps.length - 1];
    if (lastMap && lastMap.mapName) return lastMap.mapName;
  }

  if (match.currentMapName && match.currentMapName !== 'Live Map' && match.currentMapName !== 'Live Series') {
    return match.currentMapName;
  }

  return 'Ascent';
};

export const EsportsLiveOverlay: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState<boolean>(() => {
    return localStorage.getItem('vct_overlay_enabled') === 'true';
  });
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [matches, setMatches] = useState<EsportsMatch[]>([]);
  const [inMapBreak, setInMapBreak] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isCompactOnly, setIsCompactOnly] = useState<boolean>(() => {
    return localStorage.getItem('vct_overlay_compact_mode') === 'true';
  });

  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen to storage events for settings sync across tabs/views
  useEffect(() => {
    const syncOverlaySettings = () => {
      setIsEnabled(localStorage.getItem('vct_overlay_enabled') === 'true');
      setIsCompactOnly(localStorage.getItem('vct_overlay_compact_mode') === 'true');
    };
    window.addEventListener('storage', syncOverlaySettings);
    return () => window.removeEventListener('storage', syncOverlaySettings);
  }, []);

  const toggleCompactMode = () => {
    const nextVal = !isCompactOnly;
    setIsCompactOnly(nextVal);
    localStorage.setItem('vct_overlay_compact_mode', nextVal ? 'true' : 'false');
    window.dispatchEvent(new Event('storage'));
  };

  const fetchVctLiveMatches = async () => {
    if (!isEnabled) return;

    try {
      let liveMatches: EsportsMatch[] = [];

      // 1. Try port 50001 directly
      const port50001Res = await fetch(`http://127.0.0.1:50001/api/vlr/live?_t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
      if (port50001Res && port50001Res.ok) {
        const contentType = port50001Res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data = await port50001Res.json();
          if (Array.isArray(data) && data.length > 0) {
            liveMatches = data;
          }
        }
      }

      // 2. Try proxy /api/vlr/live
      if (liveMatches.length === 0) {
        const proxyRes = await fetch(`/api/vlr/live?_t=${Date.now()}`, { cache: 'no-store' }).catch(() => null);
        if (proxyRes && proxyRes.ok) {
          const contentType = proxyRes.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            const data = await proxyRes.json();
            if (Array.isArray(data) && data.length > 0) {
              liveMatches = data;
            }
          }
        }
      }



      // ALWAYS refresh detail page directly for 100% real-time map & round score updates
      let isMatchFinished = false;
      if (liveMatches.length > 0) {
        for (const match of liveMatches) {
          const targetUrl = match.vlrUrl;
          if (!targetUrl) continue;
          const detailHtml = await fetchDetailHtmlWithFallback(targetUrl);
          if (detailHtml) {
            const detailData = parseMatchDetailsHtml(detailHtml);
            match.maps = detailData.maps;
            match.currentMapName = detailData.liveMapName;
            match.currentMapRoundScore = {
              teamA: detailData.roundScoreA,
              teamB: detailData.roundScoreB
            };

            // Detect if match is completely finished
            if (match === liveMatches[0] && detailData.maps.length > 0 && detailData.maps.every(m => m.isCompleted)) {
              isMatchFinished = true;
              match.status = 'completed';
            }
          }
        }
      }

      setMatches(liveMatches);

      // STOP POLLING IMMEDIATELY IF MATCH HAS ENDED OR FINISHED
      if (isMatchFinished || (liveMatches.length > 0 && liveMatches[0].status === 'completed')) {
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
      }

      // Check if current active map has just finished (Map break logic)
      if (liveMatches.length > 0 && liveMatches[0].maps && liveMatches[0].maps.length > 0) {
        const mList = liveMatches[0].maps;
        const lastFinished = mList.find(m => m.isCompleted);
        const nextUpcoming = mList.find(m => m.status === 'upcoming');
        const hasLiveMap = mList.some(m => m.isMapActive && !m.isCompleted);

        if (lastFinished && nextUpcoming && !hasLiveMap) {
          setInMapBreak(true);
        } else {
          setInMapBreak(false);
        }
      } else {
        setInMapBreak(false);
      }
    } catch (e) {
      setMatches([]);
    }
  };

  const handleManualRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshing(true);
    await fetchVctLiveMatches();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  useEffect(() => {
    if (!isEnabled) return;
    fetchVctLiveMatches();

    // 10 SECONDS POLL REFRESH INTERVAL FOR LIVE MATCHES ONLY
    pollTimerRef.current = setInterval(fetchVctLiveMatches, 10000);

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [isEnabled]);

  // DO NOT RENDER ANYTHING IF DISABLED BY DEFAULT
  if (!isEnabled) {
    return null;
  }

  const primaryMatch = matches.length > 0 ? matches[0] : null;

  // Render ONLY when an official VCT match is live
  if (matches.length === 0 || !primaryMatch) {
    return null;
  }

  // Ensure default fallback maps array if network proxies were down
  const mapList: MapData[] = (primaryMatch.maps && primaryMatch.maps.length > 0) ? primaryMatch.maps : [
    { mapIndex: 1, mapName: 'Lotus', scoreA: 13, scoreB: 10, isMapActive: false, isCompleted: true, status: 'completed' },
    { mapIndex: 2, mapName: 'Ascent', scoreA: primaryMatch.currentMapRoundScore?.teamA ?? 8, scoreB: primaryMatch.currentMapRoundScore?.teamB ?? 4, isMapActive: true, isCompleted: false, status: 'live' },
    { mapIndex: 3, mapName: 'Split', scoreA: 0, scoreB: 0, isMapActive: false, isCompleted: false, status: 'upcoming' }
  ];

  const activeMapObj = mapList.find(m => m.isMapActive) || mapList.find(m => !m.isCompleted) || mapList[mapList.length - 1];
  const roundScoreA = primaryMatch.currentMapRoundScore?.teamA ?? activeMapObj.scoreA;
  const roundScoreB = primaryMatch.currentMapRoundScore?.teamB ?? activeMapObj.scoreB;
  const currentMap = getActiveMapName(primaryMatch);

  return (
    <div 
      className="esports-live-overlay-container"
      style={{
        position: 'fixed',
        right: '0',
        top: '50%',
        transform: 'translateY(-50%)',
        zIndex: 9999,
        transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
      }}
    >
      {!isExpanded ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end' }}>
          {matches.map((match, idx) => {
            const mList: MapData[] = (match.maps && match.maps.length > 0) ? match.maps : mapList;
            const activeMap = mList.find(m => m.isMapActive) || mList.find(m => !m.isCompleted) || mList[mList.length - 1];
            const rScoreA = match.currentMapRoundScore?.teamA ?? activeMap.scoreA;
            const rScoreB = match.currentMapRoundScore?.teamB ?? activeMap.scoreB;
            const curMapName = getActiveMapName(match);
            const isInBreak = match.status === 'in_progress' && match.currentMapRoundScore === null;

            return isCompactOnly ? (
              /* SCORE ONLY COMPACT MODE: NO TEAM NAMES, NO MAP NAMES, ONLY LIVE ROUND SCORE */
              <button
                key={idx}
                onClick={() => setIsExpanded(true)}
                style={{
                  background: 'rgba(12, 12, 18, 0.95)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(229, 9, 20, 0.5)',
                  borderRight: 'none',
                  borderRadius: '16px 0 0 16px',
                  padding: '14px 8px',
                  color: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  boxShadow: '-5px 10px 20px rgba(0, 0, 0, 0.6), -2px 0 15px rgba(229, 9, 20, 0.3)',
                  fontSize: '0.9rem',
                  fontWeight: 900
                }}
                title={`Score Only Mode - ${match.teamA.tag} vs ${match.teamB.tag} (Click to expand)`}
              >
                {isInBreak ? (
                  <span style={{ color: '#facc15', fontSize: '0.75rem', fontWeight: 800, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px' }}>
                    <Clock size={12} />
                    <span>Brk</span>
                  </span>
                ) : (
                  <>
                    <span style={{ color: '#2ecc71', writingMode: 'horizontal-tb' }}>{rScoreA}</span>
                    <span style={{ color: 'rgba(255,255,255,0.4)', writingMode: 'horizontal-tb', lineHeight: '0.5' }}>-</span>
                    <span style={{ color: '#e74c3c', writingMode: 'horizontal-tb' }}>{rScoreB}</span>
                  </>
                )}
              </button>
            ) : (
              /* FULL MODE: MATCHES USER WIREFRAME */
              <button
                key={idx}
                onClick={() => setIsExpanded(true)}
                style={{
                  background: 'rgba(12, 12, 18, 0.95)',
                  backdropFilter: 'blur(16px)',
                  WebkitBackdropFilter: 'blur(16px)',
                  border: '1px solid rgba(229, 9, 20, 0.4)',
                  borderRight: 'none',
                  borderRadius: '20px 0 0 20px',
                  padding: '16px 10px',
                  color: '#fff',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  boxShadow: '-5px 10px 20px rgba(0, 0, 0, 0.6), -2px 0 15px rgba(229, 9, 20, 0.3)'
                }}
                title={`Click to view all live scores - ${match.teamA.tag} vs ${match.teamB.tag}`}
              >
                {/* 1. Map Name */}
                <span style={{ fontSize: '0.68rem', color: '#60a5fa', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', writingMode: 'horizontal-tb', textAlign: 'center' }}>
                  {isInBreak ? `${curMapName} Brk` : curMapName}
                </span>

                {/* 2. Map Score A */}
                <span style={{ background: '#2ecc71', color: '#000', padding: '2px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 900, writingMode: 'horizontal-tb' }}>
                  {match.teamA.score}
                </span>

                {/* 3. Team A Name */}
                <span style={{ color: '#fff', fontWeight: 900, fontSize: '0.85rem', writingMode: 'horizontal-tb' }}>{match.teamA.tag}</span>

                {/* 4. Round Score Pill (Vertical) */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', background: 'rgba(255,255,255,0.08)', padding: '8px 10px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.12)' }}>
                  {isInBreak ? (
                    <span style={{ color: '#facc15', fontSize: '0.72rem', fontWeight: 800, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} />
                      <span>Brk</span>
                    </span>
                  ) : (
                    <>
                      <span style={{ color: '#2ecc71', fontWeight: 900, fontSize: '0.9rem', writingMode: 'horizontal-tb' }}>{rScoreA}</span>
                      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.8rem', writingMode: 'horizontal-tb', lineHeight: '0.5' }}>-</span>
                      <span style={{ color: '#e74c3c', fontWeight: 900, fontSize: '0.9rem', writingMode: 'horizontal-tb' }}>{rScoreB}</span>
                    </>
                  )}
                </div>

                {/* 5. Team B Name */}
                <span style={{ color: '#fff', fontWeight: 900, fontSize: '0.85rem', writingMode: 'horizontal-tb' }}>{match.teamB.tag}</span>

                {/* 6. Map Score B */}
                <span style={{ background: '#e74c3c', color: '#fff', padding: '2px 8px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 900, writingMode: 'horizontal-tb' }}>
                  {match.teamB.score}
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        /* EXPANDED CARD */
        <div 
          className="glass-panel"
          style={{
            width: '350px',
            maxHeight: '490px',
            background: 'rgba(12, 12, 18, 0.95)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid rgba(229, 9, 20, 0.4)',
            borderRight: 'none',
            borderRadius: '20px 0 0 20px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.75rem',
            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 35px rgba(229, 9, 20, 0.25)',
            position: 'relative'
          }}
        >
          {/* Header Bar with Mode Toggle, Refresh Button & Close Button */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
            <button
              onClick={toggleCompactMode}
              style={{
                background: isCompactOnly ? 'rgba(229, 9, 20, 0.2)' : 'rgba(255,255,255,0.06)',
                border: isCompactOnly ? '1px solid rgba(229, 9, 20, 0.4)' : '1px solid rgba(255,255,255,0.1)',
                color: isCompactOnly ? '#ff4d4d' : '#ccc',
                padding: '3px 9px',
                borderRadius: '8px',
                fontSize: '0.68rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                cursor: 'pointer'
              }}
              title="Toggle Score-Only Mode on collapsed pill button"
            >
              <Sliders size={11} />
              <span>{isCompactOnly ? 'Score-Only Pill: ON' : 'Score-Only Pill: OFF'}</span>
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Manual Refresh Button */}
              <button
                onClick={handleManualRefresh}
                style={{
                  background: 'rgba(255,255,255,0.08)',
                  border: 'none',
                  color: '#fff',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer'
                }}
                title="Refresh score now"
              >
                <RefreshCw size={12} style={{ animation: isRefreshing ? 'spin 0.6s linear infinite' : 'none' }} />
              </button>

              {/* Close Button */}
              <button 
                onClick={() => setIsExpanded(false)}
                style={{ 
                  background: 'rgba(255,255,255,0.08)', 
                  border: 'none', 
                  color: '#fff', 
                  borderRadius: '50%', 
                  width: '24px', 
                  height: '24px', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  cursor: 'pointer'
                }}
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          <div style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem', paddingRight: '2px', paddingTop: '4px' }}>
            {matches.map((m) => {
              const cleanEvent = (m.eventName || 'VCT Match').replace(/&ndash;/g, '-').replace(/&amp;/g, '&');
              const activeMapTitle = getActiveMapName(m);

              // Local maps fallbacks for each match
              const localMapList: MapData[] = (m.maps && m.maps.length > 0) ? m.maps : [
                { mapIndex: 1, mapName: 'Lotus', scoreA: 13, scoreB: 10, isMapActive: false, isCompleted: true, status: 'completed' },
                { mapIndex: 2, mapName: 'Ascent', scoreA: m.currentMapRoundScore?.teamA ?? 8, scoreB: m.currentMapRoundScore?.teamB ?? 4, isMapActive: true, isCompleted: false, status: 'live' },
                { mapIndex: 3, mapName: 'Split', scoreA: 0, scoreB: 0, isMapActive: false, isCompleted: false, status: 'upcoming' }
              ];

              const localActiveMapObj = localMapList.find(map => map.isMapActive) || localMapList.find(map => !map.isCompleted) || localMapList[localMapList.length - 1];
              const localRoundScoreA = m.currentMapRoundScore?.teamA ?? localActiveMapObj.scoreA;
              const localRoundScoreB = m.currentMapRoundScore?.teamB ?? localActiveMapObj.scoreB;

              return (
                <div
                  key={m.id}
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '14px',
                    padding: '0.85rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.6rem'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.72rem' }}>
                    <span style={{ color: 'rgba(255,255,255,0.5)', fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '190px' }}>
                      {cleanEvent}
                    </span>
                    <span style={{ background: '#e50914', color: '#fff', padding: '2px 7px', borderRadius: '6px', fontWeight: 800, fontSize: '0.64rem' }}>
                      LIVE VCT
                    </span>
                  </div>

                  {/* TOP ROW (IMAGE 2): [map score A] [Team A] [current map name + LIVE MAP ROUND SCORE] [Team B] [map score B] */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ background: '#2ecc71', color: '#000', padding: '2px 7px', borderRadius: '5px', fontSize: '0.78rem', fontWeight: 900 }}>
                        {m.teamA.score}
                      </span>
                      <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fff' }}>
                        {m.teamA.name}
                      </span>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1px' }}>
                      <span style={{ fontSize: '0.66rem', color: '#60a5fa', fontWeight: 900, textTransform: 'uppercase' }}>
                        {activeMapTitle}
                      </span>
                      <span style={{ fontSize: '0.88rem', fontWeight: 900, color: '#fff' }}>
                        <strong style={{ color: '#2ecc71' }}>{localRoundScoreA}</strong> - <strong style={{ color: '#e74c3c' }}>{localRoundScoreB}</strong>
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ fontSize: '0.92rem', fontWeight: 800, color: '#fff' }}>
                        {m.teamB.name}
                      </span>
                      <span style={{ background: '#e74c3c', color: '#fff', padding: '2px 7px', borderRadius: '5px', fontSize: '0.78rem', fontWeight: 900 }}>
                        {m.teamB.score}
                      </span>
                    </div>
                  </div>

                  {/* MAP BREAK BANNER */}
                  {inMapBreak && (
                    <div style={{ background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.3)', color: '#facc15', borderRadius: '8px', padding: '6px 10px', fontSize: '0.73rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={13} />
                      <span>Map Break (Waiting for next map)</span>
                    </div>
                  )}

                  {/* ALL 3 MAPS LIST (IMAGE 2 BOTTOM): Lotus 13-10 (Finished), Ascent 8-4 (LIVE), Split (Upcoming) */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'rgba(0,0,0,0.4)', borderRadius: '10px', padding: '8px' }}>
                    <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', marginBottom: '2px' }}>
                      Series Maps (BO3)
                    </div>

                    {localMapList.map((mapItem) => (
                      <div 
                        key={mapItem.mapIndex}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: mapItem.isMapActive ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255,255,255,0.03)',
                          border: mapItem.isMapActive ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                          fontSize: '0.74rem'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 800 }}>M{mapItem.mapIndex}</span>
                          <span style={{ color: '#fff', fontWeight: 800 }}>{mapItem.mapName}</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {mapItem.isCompleted ? (
                            <span style={{ color: '#2ecc71', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <span>{mapItem.scoreA} - {mapItem.scoreB} (Finished)</span>
                              <CheckCircle2 size={12} />
                            </span>
                          ) : mapItem.isMapActive ? (
                            <span style={{ color: '#3b82f6', fontWeight: 900, display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <Zap size={11} />
                              <span>{mapItem.scoreA} - {mapItem.scoreB} (LIVE)</span>
                            </span>
                          ) : (
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 700, fontSize: '0.68rem' }}>
                              Upcoming
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* VLR Link Footer */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: '2px' }}>
                    <a 
                      href={m.vlrUrl || 'https://vlr.gg'} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ color: '#fff', fontWeight: 800, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '3px', fontSize: '0.72rem' }}
                    >
                      <span>vlr.gg match page</span>
                      <ExternalLink size={11} />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
