import React, { useState } from 'react';
import { 
  Share2, 
  Plus, 
  Trash2, 
  Edit3, 
  Zap, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Send, 
  Copy, 
  Check, 
  ExternalLink, 
  RefreshCw,
  Code,
  Lock,
  Eye,
  X,
  Radio,
  Activity
} from 'lucide-react';

export interface Webhook {
  id: string;
  name: string;
  url: string;
  secret?: string;
  events: string[];
  enabled: boolean;
  createdAt: string;
  lastTriggered?: string | null;
  totalDeliveries: number;
  failedDeliveries: number;
}

export interface WebhookDelivery {
  id: string;
  webhookId: string;
  webhookName: string;
  event: string;
  status: 'success' | 'failed';
  statusCode: number;
  latencyMs: number;
  payload: string;
  responseBody?: string;
  createdAt: string;
}

interface WebhooksTabProps {
  webhooks: Webhook[];
  deliveries: WebhookDelivery[];
  onCreateWebhook: (data: { name: string; url: string; secret?: string; events: string[]; enabled: boolean }) => Promise<void>;
  onUpdateWebhook: (id: string, data: any) => Promise<void>;
  onDeleteWebhook: (id: string) => Promise<void>;
  onTestWebhook: (id: string) => Promise<any>;
  onRefresh: () => void;
  refreshing: boolean;
  copiedId: string | null;
  onCopy: (text: string, id: string) => void;
}

const AVAILABLE_EVENTS = [
  { id: 'visitor.new', label: 'visitor.new', desc: 'Triggered when a new visitor device is first detected' },
  { id: 'visitor.session_start', label: 'visitor.session_start', desc: 'Triggered when any visitor session starts' },
  { id: 'traffic.alert', label: 'traffic.alert', desc: 'Triggered on 5xx HTTP server errors or rate anomalies' },
  { id: 'embed.stream_started', label: 'embed.stream_started', desc: 'Triggered when an external site streams media' },
  { id: 'admin.login', label: 'admin.login', desc: 'Triggered on admin console authentication' },
  { id: 'security.ip_blocked', label: 'security.ip_blocked', desc: 'Triggered when an IP address is blocked' }
];

export const WebhooksTab: React.FC<WebhooksTabProps> = ({
  webhooks,
  deliveries,
  onCreateWebhook,
  onUpdateWebhook,
  onDeleteWebhook,
  onTestWebhook,
  onRefresh,
  refreshing,
  copiedId,
  onCopy
}) => {
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    url: string;
    secret: string;
    events: string[];
    enabled: boolean;
  }>({
    name: '',
    url: '',
    secret: '',
    events: ['visitor.new', 'traffic.alert'],
    enabled: true
  });

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [selectedPayloadModal, setSelectedPayloadModal] = useState<WebhookDelivery | null>(null);

  const totalDeliveries = webhooks.reduce((acc, w) => acc + (w.totalDeliveries || 0), 0);
  const failedDeliveries = webhooks.reduce((acc, w) => acc + (w.failedDeliveries || 0), 0);
  const successRate = totalDeliveries > 0 ? Math.round(((totalDeliveries - failedDeliveries) / totalDeliveries) * 100) : 100;

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({
      name: '',
      url: '',
      secret: '',
      events: ['visitor.new', 'traffic.alert', 'embed.stream_started'],
      enabled: true
    });
    setModalOpen(true);
  };

  const openEditModal = (wh: Webhook) => {
    setEditingId(wh.id);
    setFormData({
      name: wh.name,
      url: wh.url,
      secret: wh.secret || '',
      events: wh.events || ['*'],
      enabled: wh.enabled
    });
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.url.trim()) return;

    if (editingId) {
      await onUpdateWebhook(editingId, formData);
    } else {
      await onCreateWebhook(formData);
    }
    setModalOpen(false);
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setTestResult(null);
    try {
      const res = await onTestWebhook(id);
      setTestResult({ id, ...res });
    } catch (e: any) {
      setTestResult({ id, status: 'failed', responseBody: e.message });
    } finally {
      setTestingId(null);
    }
  };

  const toggleEvent = (eventId: string) => {
    if (formData.events.includes(eventId)) {
      setFormData({ ...formData, events: formData.events.filter(e => e !== eventId) });
    } else {
      setFormData({ ...formData, events: [...formData.events, eventId] });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      
      {/* KPI Ribbon */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '0.85rem'
      }}>
        {/* Total Webhooks */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '1.15rem 1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Configured Webhooks
            </span>
            <Share2 size={16} color="#38bdf8" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f8fafc', margin: '6px 0 2px' }}>
            {webhooks.length} <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#94a3b8' }}>endpoints</span>
          </div>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
            {webhooks.filter(w => w.enabled).length} active event dispatchers
          </span>
        </div>

        {/* Deliveries */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '1.15rem 1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Total Event Deliveries
            </span>
            <Send size={16} color="#4ade80" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#4ade80', margin: '6px 0 2px' }}>
            {totalDeliveries.toLocaleString()}
          </div>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
            HTTP POST dispatches sent
          </span>
        </div>

        {/* Success Rate */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '1.15rem 1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Delivery Success Rate
            </span>
            <CheckCircle2 size={16} color="#facc15" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#facc15', margin: '6px 0 2px' }}>
            {successRate}%
          </div>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
            {failedDeliveries} failed attempts
          </span>
        </div>

        {/* Real-time Subscriptions */}
        <div style={{
          backgroundColor: 'var(--surface, #1e293b)',
          border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
          borderRadius: '12px',
          padding: '1.15rem 1.25rem'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Supported Topics
            </span>
            <Zap size={16} color="#c084fc" />
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#c084fc', margin: '6px 0 2px' }}>
            6 Events
          </div>
          <span style={{ fontSize: '0.74rem', color: '#64748b' }}>
            HMAC-SHA256 authenticated
          </span>
        </div>
      </div>

      {/* Main Webhooks List Card */}
      <div style={{
        backgroundColor: 'var(--surface, #1e293b)',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
        borderRadius: '14px',
        overflow: 'hidden'
      }}>
        
        {/* Header */}
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#f8fafc' }}>
              Webhooks & Event Notifications
            </h3>
            <p style={{ margin: '3px 0 0', color: '#94a3b8', fontSize: '0.78rem' }}>
              Broadcast events to Discord, Slack, Zapier, or your backend whenever visitors arrive, stream video, or errors occur.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={openCreateModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                backgroundColor: '#0284c7',
                color: '#ffffff',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Plus size={15} />
              Add Webhook
            </button>

            <button
              onClick={onRefresh}
              disabled={refreshing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '7px 12px',
                borderRadius: '8px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                color: '#cbd5e1',
                fontSize: '0.8rem',
                cursor: 'pointer'
              }}
            >
              <RefreshCw size={14} className={refreshing ? 'spinning' : ''} />
            </button>
          </div>
        </div>

        {/* Test Result Toast Banner if any */}
        {testResult && (
          <div style={{
            margin: '1rem 1.5rem 0',
            padding: '10px 14px',
            borderRadius: '8px',
            backgroundColor: testResult.status === 'success' ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${testResult.status === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {testResult.status === 'success' ? <CheckCircle2 size={16} color="#4ade80" /> : <AlertTriangle size={16} color="#f87171" />}
              <span style={{ fontSize: '0.82rem', color: testResult.status === 'success' ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                {testResult.status === 'success' ? `Ping Delivered Successfully (HTTP ${testResult.statusCode}) in ${testResult.latencyMs}ms!` : `Ping Delivery Failed: ${testResult.responseBody || 'Endpoint unreachable'}`}
              </span>
            </div>
            <button
              onClick={() => setTestResult(null)}
              style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Webhooks List */}
        {webhooks.length === 0 ? (
          <div style={{
            padding: '4rem 2rem',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Share2 size={44} color="#64748b" />
            <h4 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc' }}>
              No Webhooks Configured
            </h4>
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.82rem', maxWidth: '380px' }}>
              Create your first webhook to receive instant notifications in Slack, Discord, or your application whenever visitors access the dashboard or video streams.
            </p>
            <button
              onClick={openCreateModal}
              style={{
                marginTop: '8px',
                padding: '8px 16px',
                borderRadius: '8px',
                backgroundColor: '#0284c7',
                border: 'none',
                color: '#fff',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              Create First Webhook
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {webhooks.map((wh) => {
              const isTesting = testingId === wh.id;
              return (
                <div
                  key={wh.id}
                  style={{
                    padding: '1.25rem 1.5rem',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px'
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '36px',
                        height: '36px',
                        borderRadius: '8px',
                        backgroundColor: wh.enabled ? 'rgba(34, 197, 94, 0.12)' : 'rgba(148, 163, 184, 0.1)',
                        border: wh.enabled ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid rgba(148, 163, 184, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: wh.enabled ? '#4ade80' : '#94a3b8'
                      }}>
                        <Zap size={18} />
                      </div>

                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.94rem', fontWeight: 600, color: '#f8fafc' }}>
                            {wh.name}
                          </span>
                          <span style={{
                            padding: '1px 7px',
                            borderRadius: '10px',
                            fontSize: '0.68rem',
                            fontWeight: 600,
                            backgroundColor: wh.enabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                            color: wh.enabled ? '#4ade80' : '#94a3b8'
                          }}>
                            {wh.enabled ? 'Active' : 'Disabled'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
                          <span style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: '#94a3b8' }}>
                            {wh.url}
                          </span>
                          <button
                            onClick={() => onCopy(wh.url, `wh-url-${wh.id}`)}
                            style={{ background: 'none', border: 'none', color: copiedId === `wh-url-${wh.id}` ? '#4ade80' : '#64748b', cursor: 'pointer', padding: 0 }}
                          >
                            {copiedId === `wh-url-${wh.id}` ? <Check size={12} /> : <Copy size={12} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Quick Stats & Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{ textAlign: 'right', marginRight: '6px' }}>
                        <div style={{ fontSize: '0.68rem', color: '#64748b', textTransform: 'uppercase' }}>Deliveries</div>
                        <div style={{ fontSize: '0.86rem', fontWeight: 600, color: '#f1f5f9' }}>
                          {wh.totalDeliveries || 0} sent ({wh.failedDeliveries || 0} failed)
                        </div>
                      </div>

                      {/* Test Ping Button */}
                      <button
                        onClick={() => handleTest(wh.id)}
                        disabled={isTesting}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          padding: '6px 12px',
                          borderRadius: '8px',
                          border: '1px solid rgba(56, 189, 248, 0.3)',
                          backgroundColor: 'rgba(56, 189, 248, 0.12)',
                          color: '#38bdf8',
                          fontSize: '0.76rem',
                          fontWeight: 600,
                          cursor: isTesting ? 'not-allowed' : 'pointer'
                        }}
                      >
                        <Zap size={13} className={isTesting ? 'spinning' : ''} />
                        {isTesting ? 'Sending Ping...' : 'Test Ping'}
                      </button>

                      {/* Edit Button */}
                      <button
                        onClick={() => openEditModal(wh)}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          backgroundColor: 'rgba(255, 255, 255, 0.04)',
                          color: '#cbd5e1',
                          fontSize: '0.76rem',
                          cursor: 'pointer'
                        }}
                        title="Edit Webhook"
                      >
                        <Edit3 size={13} />
                      </button>

                      {/* Delete Button */}
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete webhook "${wh.name}"?`)) {
                            onDeleteWebhook(wh.id);
                          }
                        }}
                        style={{
                          padding: '6px 10px',
                          borderRadius: '8px',
                          border: '1px solid rgba(239, 68, 68, 0.25)',
                          backgroundColor: 'rgba(239, 68, 68, 0.08)',
                          color: '#f87171',
                          fontSize: '0.76rem',
                          cursor: 'pointer'
                        }}
                        title="Delete Webhook"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {/* Subscribed Events Pills */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Subscribed to:</span>
                    {(wh.events || []).map((ev, i) => (
                      <span key={i} style={{
                        padding: '2px 7px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(56, 189, 248, 0.1)',
                        border: '1px solid rgba(56, 189, 248, 0.2)',
                        color: '#38bdf8',
                        fontFamily: 'monospace',
                        fontSize: '0.72rem'
                      }}>
                        {ev}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Deliveries History Card */}
      <div style={{
        backgroundColor: 'var(--surface, #1e293b)',
        border: '1px solid var(--border-color, rgba(255, 255, 255, 0.08))',
        borderRadius: '14px',
        overflow: 'hidden'
      }}>
        <div style={{
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#f8fafc' }}>
              Recent Webhook Deliveries & Status Logs
            </h4>
            <p style={{ margin: '2px 0 0', color: '#94a3b8', fontSize: '0.76rem' }}>
              Delivery audits with HTTP status codes and latency.
            </p>
          </div>
        </div>

        {deliveries.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b', fontSize: '0.82rem' }}>
            No webhook deliveries recorded yet. Trigger a "Test Ping" above to inspect execution.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.8rem' }}>
              <thead>
                <tr style={{
                  color: '#64748b',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
                  fontSize: '0.7rem',
                  textTransform: 'uppercase'
                }}>
                  <th style={{ padding: '10px 14px' }}>Time</th>
                  <th style={{ padding: '10px 14px' }}>Status</th>
                  <th style={{ padding: '10px 14px' }}>Webhook Name</th>
                  <th style={{ padding: '10px 14px' }}>Event</th>
                  <th style={{ padding: '10px 14px' }}>Latency</th>
                  <th style={{ padding: '10px 14px', textAlign: 'right' }}>Payload Preview</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((del) => (
                  <tr key={del.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                    <td style={{ padding: '10px 14px', color: '#94a3b8', fontSize: '0.76rem' }}>
                      {new Date(del.createdAt).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{
                        padding: '2px 7px',
                        borderRadius: '6px',
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        backgroundColor: del.status === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: del.status === 'success' ? '#4ade80' : '#f87171'
                      }}>
                        {del.status === 'success' ? `${del.statusCode || 200} OK` : `${del.statusCode || 'Failed'}`}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontWeight: 600, color: '#f8fafc' }}>
                      {del.webhookName || 'Webhook'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontFamily: 'monospace', fontSize: '0.74rem', color: '#38bdf8' }}>
                        {del.event}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', color: '#94a3b8' }}>
                      {del.latencyMs}ms
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedPayloadModal(del)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: '6px',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          color: '#cbd5e1',
                          fontSize: '0.74rem',
                          cursor: 'pointer'
                        }}
                      >
                        Inspect Payload
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Webhook Modal */}
      {modalOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '540px',
            backgroundColor: '#0f172a',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '16px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1.25rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', fontWeight: 600 }}>
                {editingId ? 'Edit Webhook Endpoint' : 'Create New Webhook Endpoint'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Webhook Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Discord Visitor Alerts, Slack Security Bot"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    color: '#f8fafc',
                    fontSize: '0.84rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Target Endpoint URL (HTTPS)
                </label>
                <input
                  type="url"
                  required
                  placeholder="https://discord.com/api/webhooks/... or https://hooks.slack.com/..."
                  value={formData.url}
                  onChange={e => setFormData({ ...formData, url: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    color: '#f8fafc',
                    fontSize: '0.84rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '4px' }}>
                  Secret Key (Optional - Signs payload with HMAC-SHA256)
                </label>
                <input
                  type="text"
                  placeholder="Leave empty or enter signing secret"
                  value={formData.secret}
                  onChange={e => setFormData({ ...formData, secret: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    color: '#f8fafc',
                    fontSize: '0.84rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.78rem', color: '#94a3b8', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                  Events to Subscribe
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {AVAILABLE_EVENTS.map(ev => {
                    const isChecked = formData.events.includes('*') || formData.events.includes(ev.id);
                    return (
                      <label 
                        key={ev.id}
                        style={{
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: '8px',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          backgroundColor: isChecked ? 'rgba(56, 189, 248, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                          border: `1px solid ${isChecked ? 'rgba(56, 189, 248, 0.25)' : 'rgba(255, 255, 255, 0.05)'}`,
                          cursor: 'pointer'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleEvent(ev.id)}
                          style={{ marginTop: '3px' }}
                        />
                        <div>
                          <div style={{ fontFamily: 'monospace', fontSize: '0.78rem', color: isChecked ? '#38bdf8' : '#f1f5f9', fontWeight: 600 }}>
                            {ev.label}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            {ev.desc}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="checkbox"
                  id="whEnabled"
                  checked={formData.enabled}
                  onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                />
                <label htmlFor="whEnabled" style={{ fontSize: '0.8rem', color: '#f1f5f9', cursor: 'pointer' }}>
                  Enable this webhook immediately
                </label>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: '#f1f5f9',
                    fontSize: '0.8rem',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '8px 18px',
                    borderRadius: '8px',
                    backgroundColor: '#0284c7',
                    border: 'none',
                    color: '#fff',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  {editingId ? 'Save Changes' : 'Create Webhook'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payload Inspection Modal */}
      {selectedPayloadModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(5px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          padding: '1rem'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '600px',
            maxHeight: '80vh',
            backgroundColor: '#0f172a',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '16px',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1rem', color: '#f8fafc', fontWeight: 600 }}>
                Webhook Delivery Payload
              </h3>
              <button
                onClick={() => setSelectedPayloadModal(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1 }}>
              <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>HTTP POST Body:</div>
              <pre style={{
                backgroundColor: 'rgba(0, 0, 0, 0.4)',
                padding: '12px',
                borderRadius: '8px',
                fontFamily: 'monospace',
                fontSize: '0.74rem',
                color: '#38bdf8',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                margin: 0
              }}>
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(selectedPayloadModal.payload), null, 2);
                  } catch {
                    return selectedPayloadModal.payload;
                  }
                })()}
              </pre>

              {selectedPayloadModal.responseBody && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ fontSize: '0.74rem', color: '#94a3b8', marginBottom: '4px' }}>Receiver Response Body:</div>
                  <pre style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.4)',
                    padding: '12px',
                    borderRadius: '8px',
                    fontFamily: 'monospace',
                    fontSize: '0.74rem',
                    color: '#94a3b8',
                    overflowX: 'auto',
                    whiteSpace: 'pre-wrap',
                    margin: 0
                  }}>
                    {selectedPayloadModal.responseBody}
                  </pre>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setSelectedPayloadModal(null)}
                style={{
                  padding: '7px 16px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: '#fff',
                  fontSize: '0.8rem',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
