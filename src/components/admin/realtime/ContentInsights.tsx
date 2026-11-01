import React from 'react';
import { Film, TrendingUp, Users, Clock, Award, CheckCircle } from 'lucide-react';

interface ContentInsightsProps {
  insights: {
    topTitles: any[];
    topEpisodes: any[];
    audienceBreakdown: {
      newVisitorsPct: number;
      returningVisitorsPct: number;
      avgDailyWatchTimeMinutes: number;
    };
    retentionCohorts: any[];
  };
}

export const ContentInsights: React.FC<ContentInsightsProps> = ({ insights }) => {
  const { topTitles, topEpisodes, audienceBreakdown, retentionCohorts } = insights;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Audience Breakdown Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '14px'
      }}>
        <div style={{
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-3, #8F99AA)', fontWeight: 600 }}>Audience Loyalty</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent, #8CA9EE)', fontFamily: 'var(--font-display, Outfit)' }}>
              {audienceBreakdown.returningVisitorsPct}%
            </span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-2, #A9B2C0)' }}>Returning Viewers</span>
          </div>
          <div style={{ width: '100%', height: '6px', background: 'var(--surface-3, #232B36)', borderRadius: '3px', overflow: 'hidden', display: 'flex' }}>
            <div style={{ width: `${audienceBreakdown.returningVisitorsPct}%`, background: 'var(--accent, #8CA9EE)' }} />
            <div style={{ width: `${audienceBreakdown.newVisitorsPct}%`, background: 'var(--success, #86CDA6)' }} />
          </div>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-3, #8F99AA)' }}>
            {audienceBreakdown.newVisitorsPct}% New Visitors
          </span>
        </div>

        <div style={{
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px'
        }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--text-3, #8F99AA)', fontWeight: 600 }}>Avg Daily Watch Time</span>
          <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
            {audienceBreakdown.avgDailyWatchTimeMinutes} minutes
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--success, #86CDA6)' }}>
            ▲ +14% week-over-week engagement
          </span>
        </div>
      </div>

      {/* Top Titles Table */}
      <div style={{
        background: 'var(--surface-1, #151A21)',
        border: '1px solid var(--border, #262D39)',
        borderRadius: 'var(--radius-md, 12px)',
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
          Top Streaming Titles & Completion Rates
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border, #262D39)', color: 'var(--text-2, #A9B2C0)' }}>
              <th style={{ padding: '8px 10px' }}>Rank & Title</th>
              <th style={{ padding: '8px 10px' }}>Total Watch Time</th>
              <th style={{ padding: '8px 10px' }}>Unique Viewers</th>
              <th style={{ padding: '8px 10px', textAlign: 'right' }}>Completion Rate</th>
            </tr>
          </thead>
          <tbody>
            {topTitles.map((t, idx) => (
              <tr key={idx} style={{ borderBottom: '1px solid var(--border, #262D39)' }}>
                <td style={{ padding: '10px', fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>
                  <span style={{ color: 'var(--accent, #8CA9EE)', marginRight: '8px' }}>#{idx + 1}</span>
                  {t.title}
                </td>
                <td style={{ padding: '10px', color: 'var(--text-2, #A9B2C0)' }}>
                  {t.watchTimeHours.toLocaleString()} hrs
                </td>
                <td style={{ padding: '10px', color: 'var(--text-2, #A9B2C0)' }}>
                  {t.uniqueViewers.toLocaleString()}
                </td>
                <td style={{ padding: '10px', textAlign: 'right' }}>
                  <span style={{
                    color: t.completionRatePct > 85 ? 'var(--success, #86CDA6)' : 'var(--accent, #8CA9EE)',
                    fontWeight: 700
                  }}>
                    {t.completionRatePct}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Retention Cohort Table */}
      <div style={{
        background: 'var(--surface-1, #151A21)',
        border: '1px solid var(--border, #262D39)',
        borderRadius: 'var(--radius-md, 12px)',
        padding: '18px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
      }}>
        <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
          Viewer Retention Cohorts
        </h3>
        <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-3, #8F99AA)' }}>
          Percentage of weekly signup cohorts who return to stream on Days 1, 3, 7, 14, and 30.
        </p>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center', fontSize: '0.8rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border, #262D39)', color: 'var(--text-2, #A9B2C0)' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Cohort</th>
                <th style={{ padding: '8px 12px' }}>Day 0</th>
                <th style={{ padding: '8px 12px' }}>Day 1</th>
                <th style={{ padding: '8px 12px' }}>Day 3</th>
                <th style={{ padding: '8px 12px' }}>Day 7</th>
                <th style={{ padding: '8px 12px' }}>Day 14</th>
                <th style={{ padding: '8px 12px' }}>Day 30</th>
              </tr>
            </thead>
            <tbody>
              {retentionCohorts.map(c => {
                const getCellColor = (val: number | null) => {
                  if (val === null) return 'transparent';
                  if (val >= 60) return 'rgba(134, 205, 166, 0.3)';
                  if (val >= 40) return 'rgba(140, 169, 238, 0.25)';
                  return 'rgba(140, 169, 238, 0.12)';
                };

                return (
                  <tr key={c.cohort} style={{ borderBottom: '1px solid var(--border, #262D39)' }}>
                    <td style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>
                      {c.cohort}
                    </td>
                    {[c.d0, c.d1, c.d3, c.d7, c.d14, c.d30].map((val, i) => (
                      <td
                        key={i}
                        style={{
                          padding: '10px 12px',
                          background: getCellColor(val),
                          color: val !== null ? 'var(--text-1, #E4E8EE)' : 'var(--text-3, #8F99AA)',
                          fontWeight: val !== null ? 600 : 400
                        }}
                      >
                        {val !== null ? `${val}%` : '—'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
