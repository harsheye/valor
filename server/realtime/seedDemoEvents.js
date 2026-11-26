import { globalEventBus } from './eventBus.js';
import { alertEngine } from './alertEngine.js';
import { securityManager } from './securityManager.js';
import { outboundWebhookManager } from './outboundWebhooks.js';

/**
 * Realistic Demo Event Generator for Valor Real-Time Portal
 */
export function generateDemoEventBatch(count = 10) {
  const sampleIps = [
    { ip: '142.250.190.46', country: 'United States', code: 'US', city: 'Mountain View' },
    { ip: '185.199.108.153', country: 'Germany', code: 'DE', city: 'Frankfurt' },
    { ip: '151.101.1.140', country: 'United Kingdom', code: 'GB', city: 'London' },
    { ip: '13.232.44.190', country: 'India', code: 'IN', city: 'Mumbai' },
    { ip: '133.242.18.99', country: 'Japan', code: 'JP', city: 'Tokyo' }
  ];

  const sampleTitles = [
    'Arcane: League of Legends - S02E06',
    'Dune: Part Two (2024)',
    'Shogun (2024) - S01E09',
    'The Penguin - S01E04',
    'Severance - S02E01'
  ];

  const sampleEndpoints = [
    { method: 'GET', url: '/api/vlr/live/stream.m3u8', status: 200, category: 'stream' },
    { method: 'GET', url: '/api/proxy-media?chunk=8491.ts', status: 200, category: 'media' },
    { method: 'GET', url: '/api/tmdb-proxy/movie/popular', status: 200, category: 'tmdb' },
    { method: 'GET', url: '/api/embed/ping', status: 200, category: 'embed' },
    { method: 'POST', url: '/api/telemetry/heartbeat', status: 204, category: 'telemetry' }
  ];

  const generatedEvents = [];

  for (let i = 0; i < count; i++) {
    const geo = sampleIps[Math.floor(Math.random() * sampleIps.length)];
    const ep = sampleEndpoints[Math.floor(Math.random() * sampleEndpoints.length)];
    const roll = Math.random();

    // 70% chance of traffic request event
    if (roll < 0.7) {
      const isError = Math.random() < 0.08;
      const statusCode = isError ? (Math.random() < 0.5 ? 404 : 502) : ep.status;
      const latencyMs = isError ? Math.floor(Math.random() * 800 + 400) : Math.floor(Math.random() * 80 + 15);
      const bytes = Math.floor(Math.random() * 1024 * 1024 * 2 + 5000);

      const ev = globalEventBus.publish({
        type: 'request.logged',
        actor: `client:${geo.ip}`,
        subject: `endpoint:${ep.url}`,
        data: {
          id: `req_${Date.now()}_${i}`,
          method: ep.method,
          path: ep.url,
          status: statusCode,
          latencyMs,
          bytes,
          ip: geo.ip,
          country: geo.country,
          countryCode: geo.code,
          city: geo.city,
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/133.0',
          category: ep.category,
          timestamp: new Date().toISOString()
        }
      });
      if (ev) generatedEvents.push(ev);

      // Record in metrics window for alert checking
      alertEngine.recordMetric({
        statusCode,
        latencyMs,
        bytes,
        countryCode: geo.code
      });
    } 
    // 15% chance of playback quality / buffering event
    else if (roll < 0.85) {
      const title = sampleTitles[Math.floor(Math.random() * sampleTitles.length)];
      const ev = globalEventBus.publish({
        type: 'playback.quality',
        actor: `user:${geo.ip}`,
        subject: `title:${title.split(' ')[0]}`,
        data: {
          title,
          startupMs: Math.floor(Math.random() * 300 + 250),
          bitrateKbps: Math.floor(Math.random() * 10000 + 5000),
          bufferingPct: Number((Math.random() * 0.3).toFixed(2)),
          countryCode: geo.code,
          timestamp: new Date().toISOString()
        }
      });
      if (ev) generatedEvents.push(ev);
    }
    // 10% chance of visitor / session ping
    else if (roll < 0.95) {
      const ev = globalEventBus.publish({
        type: 'visitor.seen',
        actor: `visitor:${geo.ip}`,
        subject: `device:dev_${geo.code.toLowerCase()}_${i}`,
        data: {
          ip: geo.ip,
          country: geo.country,
          countryCode: geo.code,
          city: geo.city,
          device: 'Desktop',
          browser: 'Chrome 133',
          timestamp: new Date().toISOString()
        }
      });
      if (ev) generatedEvents.push(ev);
    }
    // 5% chance of warning or test alert
    else {
      const ev = alertEngine.triggerAlert({
        ruleId: 'rule_bandwidth_spike',
        ruleName: 'Demo Simulation Alert',
        severity: 'info',
        title: 'Demo Traffic Simulation Wave',
        message: `High concurrent viewer load detected across ${geo.country} nodes.`,
        data: { location: geo.city, simulated: true }
      });
      if (ev) generatedEvents.push(ev);
    }
  }

  return generatedEvents;
}
