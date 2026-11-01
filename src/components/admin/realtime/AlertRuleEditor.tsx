import React, { useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, AlertTriangle, Bell, Clock, Shield } from 'lucide-react';

export interface AlertRule {
  id: string;
  name: string;
  conditionType: string;
  threshold: number;
  operator: string;
  severity: 'info' | 'warning' | 'critical';
  cooldownMinutes: number;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  channels: string[];
  enabled: boolean;
  lastTriggeredAt?: string | null;
}

interface AlertRuleEditorProps {
  rules: AlertRule[];
  onSaveRule: (rule: Partial<AlertRule>) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
}

export const AlertRuleEditor: React.FC<AlertRuleEditorProps> = ({
  rules,
  onSaveRule,
  onDeleteRule
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Partial<AlertRule> | null>(null);

  const conditionOptions = [
    { type: 'error_rate', label: 'Error Rate exceeds %', defaultThreshold: 5, operator: '>' },
    { type: 'p95_latency', label: 'P95 Latency exceeds ms', defaultThreshold: 800, operator: '>' },
    { type: 'bandwidth_spike', label: 'Bandwidth Spike exceeds MB/s', defaultThreshold: 50, operator: '>' },
    { type: 'new_country', label: 'New / Unusual Country Code', defaultThreshold: 1, operator: '==' },
    { type: 'new_admin_login', label: 'New Admin Login Detected', defaultThreshold: 1, operator: '==' },
    { type: 'third_party_failing', label: '3rd-Party API Provider Down', defaultThreshold: 1, operator: '==' },
    { type: 'infra_down', label: 'PostgreSQL or Redis Outage', defaultThreshold: 1, operator: '==' }
  ];

  const handleOpenAdd = () => {
    setEditingRule({
      name: '',
      conditionType: 'error_rate',
      threshold: 5,
      operator: '>',
      severity: 'warning',
      cooldownMinutes: 15,
      quietHoursStart: '',
      quietHoursEnd: '',
      channels: ['in_app'],
      enabled: true
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (rule: AlertRule) => {
    setEditingRule({ ...rule });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule || !editingRule.name) return;
    await onSaveRule(editingRule);
    setIsModalOpen(false);
    setEditingRule(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-1, #E4E8EE)', fontFamily: 'var(--font-display, Outfit)' }}>
            Alert Rules Engine
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: 'var(--text-3, #8F99AA)' }}>
            Configure real-time monitoring thresholds, notification channels, cooldown periods, and quiet hours.
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'var(--accent, #8CA9EE)',
            color: 'var(--on-accent, #0C1424)',
            border: 'none',
            borderRadius: 'var(--radius-sm, 8px)',
            padding: '7px 14px',
            fontSize: '0.82rem',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          <Plus size={15} />
          <span>New Alert Rule</span>
        </button>
      </div>

      {/* Rules Table */}
      <div style={{
        background: 'var(--surface-1, #151A21)',
        border: '1px solid var(--border, #262D39)',
        borderRadius: 'var(--radius-md, 12px)',
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ background: 'var(--surface-2, #1B212A)', borderBottom: '1px solid var(--border, #262D39)', color: 'var(--text-2, #A9B2C0)' }}>
              <th style={{ padding: '10px 14px' }}>Rule Name</th>
              <th style={{ padding: '10px 14px' }}>Condition & Threshold</th>
              <th style={{ padding: '10px 14px' }}>Severity</th>
              <th style={{ padding: '10px 14px' }}>Cooldown / Quiet Hours</th>
              <th style={{ padding: '10px 14px' }}>Channels</th>
              <th style={{ padding: '10px 14px' }}>Status</th>
              <th style={{ padding: '10px 14px', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rules.map(r => {
              const isCrit = r.severity === 'critical';
              const isWarn = r.severity === 'warning';
              const sevColor = isCrit ? 'var(--danger, #EC8F95)' : (isWarn ? 'var(--warning, #E3BD7A)' : 'var(--accent, #8CA9EE)');

              return (
                <tr key={r.id} style={{ borderBottom: '1px solid var(--border, #262D39)' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: 'var(--text-1, #E4E8EE)' }}>
                    {r.name}
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-2, #A9B2C0)' }}>
                    <code style={{ background: 'var(--surface-2, #1B212A)', padding: '2px 6px', borderRadius: '4px' }}>
                      {r.conditionType} {r.operator} {r.threshold}
                    </code>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      display: 'inline-block',
                      color: sevColor,
                      border: `1px solid ${sevColor}`,
                      borderRadius: '4px',
                      padding: '1px 6px',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      textTransform: 'uppercase'
                    }}>
                      {r.severity}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', color: 'var(--text-2, #A9B2C0)' }}>
                    <div>Cooldown: {r.cooldownMinutes}m</div>
                    {r.quietHoursStart && r.quietHoursEnd && (
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-3, #8F99AA)' }}>
                        Quiet: {r.quietHoursStart} - {r.quietHoursEnd}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {(r.channels || []).map(ch => (
                        <span key={ch} style={{
                          background: 'var(--surface-3, #232B36)',
                          color: 'var(--text-2, #A9B2C0)',
                          fontSize: '0.7rem',
                          padding: '1px 5px',
                          borderRadius: '3px'
                        }}>
                          {ch}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{
                      color: r.enabled ? 'var(--success, #86CDA6)' : 'var(--text-3, #8F99AA)',
                      fontWeight: 600
                    }}>
                      {r.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px' }}>
                      <button
                        onClick={() => handleOpenEdit(r)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-2, #A9B2C0)', cursor: 'pointer' }}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => onDeleteRule(r.id)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--danger, #EC8F95)', cursor: 'pointer' }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Modal */}
      {isModalOpen && editingRule && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--scrim, rgba(15, 18, 23, 0.75))',
          backdropFilter: 'blur(4px)',
          zIndex: 1500,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <form
            onSubmit={handleSave}
            style={{
              width: '480px',
              maxWidth: '92vw',
              background: 'var(--surface-1, #151A21)',
              border: '1px solid var(--border, #262D39)',
              borderRadius: 'var(--radius-md, 12px)',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: 'var(--text-1, #E4E8EE)' }}>
                {editingRule.id ? 'Edit Alert Rule' : 'Create New Alert Rule'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-3, #8F99AA)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
              Rule Name:
              <input
                type="text"
                required
                value={editingRule.name || ''}
                onChange={e => setEditingRule({ ...editingRule, name: e.target.value })}
                placeholder="e.g. High P95 Latency Spike"
                style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  color: 'var(--text-1, #E4E8EE)',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm, 6px)'
                }}
              />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
              Condition Type:
              <select
                value={editingRule.conditionType || 'error_rate'}
                onChange={e => {
                  const opt = conditionOptions.find(o => o.type === e.target.value);
                  setEditingRule({
                    ...editingRule,
                    conditionType: e.target.value,
                    threshold: opt ? opt.defaultThreshold : 0,
                    operator: opt ? opt.operator : '>'
                  });
                }}
                style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  color: 'var(--text-1, #E4E8EE)',
                  padding: '8px 10px',
                  borderRadius: 'var(--radius-sm, 6px)'
                }}
              >
                {conditionOptions.map(o => (
                  <option key={o.type} value={o.type}>{o.label}</option>
                ))}
              </select>
            </label>

            <div style={{ display: 'flex', gap: '10px' }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
                Threshold:
                <input
                  type="number"
                  value={editingRule.threshold ?? 5}
                  onChange={e => setEditingRule({ ...editingRule, threshold: Number(e.target.value) })}
                  style={{
                    background: 'var(--surface-2, #1B212A)',
                    border: '1px solid var(--border, #262D39)',
                    color: 'var(--text-1, #E4E8EE)',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm, 6px)'
                  }}
                />
              </label>

              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
                Severity:
                <select
                  value={editingRule.severity || 'warning'}
                  onChange={e => setEditingRule({ ...editingRule, severity: e.target.value as any })}
                  style={{
                    background: 'var(--surface-2, #1B212A)',
                    border: '1px solid var(--border, #262D39)',
                    color: 'var(--text-1, #E4E8EE)',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm, 6px)'
                  }}
                >
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="critical">Critical</option>
                </select>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
                Cooldown (Minutes):
                <input
                  type="number"
                  value={editingRule.cooldownMinutes ?? 15}
                  onChange={e => setEditingRule({ ...editingRule, cooldownMinutes: Number(e.target.value) })}
                  style={{
                    background: 'var(--surface-2, #1B212A)',
                    border: '1px solid var(--border, #262D39)',
                    color: 'var(--text-1, #E4E8EE)',
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm, 6px)'
                  }}
                />
              </label>

              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)' }}>
                Quiet Hours (Start - End):
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    type="time"
                    value={editingRule.quietHoursStart || ''}
                    onChange={e => setEditingRule({ ...editingRule, quietHoursStart: e.target.value })}
                    style={{
                      background: 'var(--surface-2, #1B212A)',
                      border: '1px solid var(--border, #262D39)',
                      color: 'var(--text-1, #E4E8EE)',
                      padding: '8px',
                      borderRadius: 'var(--radius-sm, 6px)',
                      flex: 1
                    }}
                  />
                  <input
                    type="time"
                    value={editingRule.quietHoursEnd || ''}
                    onChange={e => setEditingRule({ ...editingRule, quietHoursEnd: e.target.value })}
                    style={{
                      background: 'var(--surface-2, #1B212A)',
                      border: '1px solid var(--border, #262D39)',
                      color: 'var(--text-1, #E4E8EE)',
                      padding: '8px',
                      borderRadius: 'var(--radius-sm, 6px)',
                      flex: 1
                    }}
                  />
                </div>
              </label>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                style={{
                  background: 'var(--surface-2, #1B212A)',
                  border: '1px solid var(--border, #262D39)',
                  color: 'var(--text-2, #A9B2C0)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  padding: '8px 14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={{
                  background: 'var(--accent, #8CA9EE)',
                  border: 'none',
                  color: 'var(--on-accent, #0C1424)',
                  borderRadius: 'var(--radius-sm, 6px)',
                  padding: '8px 16px',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Save Rule
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
