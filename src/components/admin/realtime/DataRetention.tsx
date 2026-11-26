import React, { useState } from 'react';
import { Database, HardDrive, Clock, Check, Save } from 'lucide-react';

interface DataRetentionConfig {
  rawLogsRetentionDays: number;
  aggregatesRetentionDays: number;
  autoPruneEnabled: boolean;
  estimatedStorageMb: number;
}

interface DataRetentionProps {
  config: DataRetentionConfig;
  onUpdateConfig: (config: Partial<DataRetentionConfig>) => Promise<void>;
}

export const DataRetention: React.FC<DataRetentionProps> = ({ config, onUpdateConfig }) => {
  const [rawDays, setRawDays] = useState(config.rawLogsRetentionDays);
  const [aggDays, setAggDays] = useState(config.aggregatesRetentionDays);
  const [autoPrune, setAutoPrune] = useState(config.autoPruneEnabled);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Approximate storage calculation
  const calculatedStorageMb = (rawDays * 4.2 + aggDays * 0.15).toFixed(1);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateConfig({
      rawLogsRetentionDays: Number(rawDays),
      aggregatesRetentionDays: Number(aggDays),
      autoPruneEnabled: Boolean(autoPrune)
    });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
          Data Retention & Storage Management
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-3, #8F99AA)' }}>
          Control telemetry persistence, automated table pruning schedules, and projected database disk footprint.
        </p>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
        gap: '20px'
      }}>
        {/* Retention Settings Form */}
        <form
          onSubmit={handleSubmit}
          style={{
            background: 'var(--surface-1, #151A21)',
            border: '1px solid var(--border, #262D39)',
            borderRadius: 'var(--radius-md, 12px)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px'
          }}
        >
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-1, #E4E8EE)' }}>
            Retention Policies
          </h3>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem', color: 'var(--text-2, #A9B2C0)' }}>
            Raw HTTP Traffic Logs Retention:
            <select
              value={rawDays}
              onChange={e => setRawDays(Number(e.target.value))}
              style={{
                background: 'var(--surface-2, #1B212A)',
                border: '1px solid var(--border, #262D39)',
                color: 'var(--text-1, #E4E8EE)',
                padding: '8px 10px',
                borderRadius: '6px'
              }}
            >
              <option value={7}>7 Days (Aggressive cleanup, ~30 MB)</option>
              <option value={14}>14 Days (~60 MB)</option>
              <option value={30}>30 Days (Standard SLA, ~126 MB)</option>
              <option value={90}>90 Days (Enterprise audit, ~380 MB)</option>
              <option value={180}>180 Days (~760 MB)</option>
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.82rem', color: 'var(--text-2, #A9B2C0)' }}>
            Aggregated Analytics Rollups Retention:
            <select
              value={aggDays}
              onChange={e => setAggDays(Number(e.target.value))}
              style={{
                background: 'var(--surface-2, #1B212A)',
                border: '1px solid var(--border, #262D39)',
                color: 'var(--text-1, #E4E8EE)',
                padding: '8px 10px',
                borderRadius: '6px'
              }}
            >
              <option value={90}>90 Days</option>
              <option value={180}>180 Days</option>
              <option value={365}>365 Days (1 Year Standard)</option>
              <option value={730}>730 Days (2 Years Compliance)</option>
            </select>
          </label>

          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', fontSize: '0.82rem', color: 'var(--text-1, #E4E8EE)' }}>
            <input
              type="checkbox"
              checked={autoPrune}
              onChange={e => setAutoPrune(e.target.checked)}
              style={{ width: '16px', height: '16px', accentColor: 'var(--accent, #8CA9EE)' }}
            />
            <span>Enable Automated Nightly Partition & Row Pruning</span>
          </label>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
            {savedSuccess ? (
              <span style={{ fontSize: '0.78rem', color: 'var(--success, #86CDA6)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <Check size={14} /> Saved policy successfully!
              </span>
            ) : <span />}

            <button
              type="submit"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--accent, #8CA9EE)',
                color: 'var(--on-accent, #0C1424)',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '6px',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer'
              }}
            >
              <Save size={14} />
              <span>Save Retention Policy</span>
            </button>
          </div>
        </form>

        {/* Disk & Storage Estimates */}
        <div style={{
          background: 'var(--surface-1, #151A21)',
          border: '1px solid var(--border, #262D39)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: 'var(--text-1, #E4E8EE)' }}>
            Storage Breakdown & Estimates
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
              <span>Projected DB Storage Footprint:</span>
              <strong style={{ color: 'var(--accent, #8CA9EE)' }}>{calculatedStorageMb} MB</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
              <span>Daily Ingestion Estimate:</span>
              <span>~4.2 MB / day</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
              <span>Nightly Vacuum Cron:</span>
              <span>03:00 UTC (Daily)</span>
            </div>
          </div>

          <div style={{
            background: 'var(--surface-2, #1B212A)',
            padding: '12px',
            borderRadius: 'var(--radius-sm, 6px)',
            fontSize: '0.76rem',
            color: 'var(--text-3, #8F99AA)',
            lineHeight: 1.4
          }}>
            Indexes and compressed audit records are automatically maintained by PostgreSQL VACUUM ANALYZE and SQLite incremental vacuum.
          </div>
        </div>
      </div>
    </div>
  );
};
