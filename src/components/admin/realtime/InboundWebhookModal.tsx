import React, { useState } from 'react';
import { Radio, Copy, Check, Terminal, ExternalLink, X, Send } from 'lucide-react';

interface InboundWebhookModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const InboundWebhookModal: React.FC<InboundWebhookModalProps> = ({ isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);
  const [testStatus, setTestStatus] = useState<string | null>(null);

  if (!isOpen) return null;

  const endpointUrl = `${window.location.origin}/api/webhooks/inbound`;

  const sampleNodeCode = `import crypto from 'crypto';

const secret = 'valor_inbound_secret_2026_demo';
const timestamp = Date.now().toString();
const payload = JSON.stringify({
  event_id: 'evt_' + Date.now(),
  event_type: 'trakt.scrobble',
  data: {
    title: 'Arcane: League of Legends',
    season: 2,
    episode: 6,
    progress: 95.0
  }
});

// Compute HMAC-SHA256 signature
const hmac = crypto.createHmac('sha256', secret);
hmac.update(\`\${timestamp}.\${payload}\`);
const signature = hmac.digest('hex');

// Send HTTP POST request
fetch('${endpointUrl}', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Valor-Signature': signature,
    'X-Valor-Timestamp': timestamp
  },
  body: payload
}).then(r => r.json()).then(console.log);`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(sampleNodeCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendTestInbound = async () => {
    setTestStatus('Sending test inbound webhook…');
    try {
      const now = Date.now().toString();
      const payload = JSON.stringify({
        event_id: `evt_test_${Date.now()}`,
        event_type: 'uptime.probe',
        data: {
          service: 'Global Edge Health Probe',
          status: 'operational',
          latencyMs: 14
        }
      });

      // Dummy signature for local self-signed test
      const res = await fetch('/api/webhooks/inbound', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Valor-Signature': 'sha256=simulated',
          'X-Valor-Timestamp': now
        },
        body: payload
      });
      const data = await res.json();
      setTestStatus(res.ok ? `✓ Success! Inbound event accepted into event bus (Event ID: ${data.eventId})` : `Failed: ${data.error}`);
    } catch (e: any) {
      setTestStatus(`Error: ${e.message}`);
    }
  };

  return (
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
      <div style={{
        width: '680px',
        maxWidth: '92vw',
        background: 'var(--surface-1, #151A21)',
        border: '1px solid var(--border, #262D39)',
        borderRadius: 'var(--radius-md, 12px)',
        padding: '22px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        maxHeight: '90vh',
        overflowY: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, color: 'var(--text-1, #E4E8EE)', fontSize: '1.1rem' }}>
              Inbound Webhooks API Integration
            </h3>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-3, #8F99AA)' }}>
              HMAC-SHA256 authenticated ingestion for Trakt.tv, Payment Gateways & Uptime Probes.
            </span>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-3, #8F99AA)', cursor: 'pointer' }}
          >
            <X size={18} />
          </button>
        </div>

        <div>
          <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-2, #A9B2C0)' }}>Endpoint URL:</span>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-2, #1B212A)',
            padding: '8px 12px',
            borderRadius: '6px',
            marginTop: '4px',
            fontSize: '0.84rem'
          }}>
            <code style={{ color: 'var(--accent, #8CA9EE)' }}>{endpointUrl}</code>
            <button
              onClick={() => {
                navigator.clipboard.writeText(endpointUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-2, #A9B2C0)', cursor: 'pointer' }}
            >
              {copied ? <Check size={14} color="var(--success, #86CDA6)" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div style={{ fontSize: '0.8rem', color: 'var(--text-2, #A9B2C0)', lineHeight: 1.4 }}>
          <strong>Required Headers:</strong>
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            <li><code>X-Valor-Signature</code>: HMAC-SHA256 hex digest of <code>timestamp + "." + rawBody</code>.</li>
            <li><code>X-Valor-Timestamp</code>: Current Unix timestamp in ms (checked against 5-minute clock tolerance).</li>
            <li><code>Content-Type: application/json</code></li>
          </ul>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-2, #A9B2C0)' }}>Sample Sender (Node.js):</span>
            <button
              onClick={handleCopyCode}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                background: 'transparent',
                border: 'none',
                color: 'var(--accent, #8CA9EE)',
                fontSize: '0.74rem',
                cursor: 'pointer'
              }}
            >
              <Copy size={12} />
              <span>Copy Code</span>
            </button>
          </div>
          <pre style={{
            background: 'var(--surface-2, #1B212A)',
            border: '1px solid var(--border, #262D39)',
            borderRadius: '6px',
            padding: '12px',
            color: 'var(--text-1, #E4E8EE)',
            fontSize: '0.74rem',
            overflowX: 'auto',
            maxHeight: '200px'
          }}>
            {sampleNodeCode}
          </pre>
        </div>

        {testStatus && (
          <div style={{
            background: 'var(--surface-2, #1B212A)',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '0.78rem',
            color: testStatus.includes('✓') ? 'var(--success, #86CDA6)' : 'var(--warning, #E3BD7A)'
          }}>
            {testStatus}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '6px' }}>
          <button
            onClick={onClose}
            style={{
              background: 'var(--surface-2, #1B212A)',
              border: '1px solid var(--border, #262D39)',
              color: 'var(--text-2, #A9B2C0)',
              padding: '7px 14px',
              borderRadius: '6px',
              cursor: 'pointer'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
