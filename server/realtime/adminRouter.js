import { globalEventBus } from './eventBus.js';
import { inboundWebhooksManager } from './inboundWebhooks.js';
import { outboundWebhookManager } from './outboundWebhooks.js';
import { alertEngine } from './alertEngine.js';
import { auditLogger } from './auditLogger.js';
import { securityManager } from './securityManager.js';
import { analyticsAndAdminManager } from './playbackQuality.js';
import { generateDemoEventBatch } from './seedDemoEvents.js';

/**
 * Enterprise Admin Real-Time API Router
 */
export async function handleAdminRealtimeRoutes(req, res, pathname, parsedUrl, cleanClientIp, getJsonBody, isValidAdminToken, dataStore) {
  // Wire DataStore references once
  if (dataStore) {
    outboundWebhookManager.setDataStore(dataStore);
    securityManager.setDataStore(dataStore);
    auditLogger.setDataStore(dataStore);
  }

  // -------------------------------------------------------------
  // 1. INBOUND WEBHOOK ENDPOINT (HMAC-SHA256 signature verification)
  // -------------------------------------------------------------
  if ((pathname === '/api/webhooks/inbound' || pathname === '/api/admin/webhooks/inbound') && req.method === 'POST') {
    let rawBody = '';
    req.on('data', chunk => { rawBody += chunk; });
    req.on('end', async () => {
      try {
        const result = await inboundWebhooksManager.handleWebhookRequest(rawBody, req.headers, cleanClientIp);
        res.statusCode = result.status;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result.body));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return true;
  }

  // Helper: Extract Admin Token from Header, Cookie or Query
  const getAdminToken = () => {
    const authHeader = req.headers['authorization'] || '';
    const tokenFromAuth = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const tokenFromHeader = req.headers['x-admin-token'];
    const tokenFromQuery = parsedUrl.searchParams.get('token');

    // Parse cookie
    let tokenFromCookie = '';
    const cookieHeader = req.headers['cookie'] || '';
    const match = cookieHeader.match(/valor_admin_token=([^;]+)/);
    if (match) tokenFromCookie = decodeURIComponent(match[1]);

    return tokenFromHeader || tokenFromAuth || tokenFromCookie || tokenFromQuery;
  };

  // -------------------------------------------------------------
  // 2. ADMIN LIVE STREAM (SSE Channel with topics & resume)
  // Routes: /admin/stream, /api/admin/stream, /api/admin/live-stream
  // -------------------------------------------------------------
  if ((pathname === '/admin/stream' || pathname === '/api/admin/stream' || pathname === '/api/admin/live-stream') && req.method === 'GET') {
    const token = getAdminToken();
    const authorized = await isValidAdminToken(token);

    if (!authorized) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Unauthorized: Admin authentication required for SSE stream', code: 'UNAUTHORIZED' }));
      return true;
    }

    // Parse requested topics: ?topics=traffic,alerts,visitors
    const topicsParam = parsedUrl.searchParams.get('topics') || '*';
    const topics = new Set(topicsParam.split(',').map(t => t.trim()).filter(Boolean));
    if (topics.size === 0) topics.add('*');

    // Last-Event-ID support (Resume from ring buffer)
    const lastEventId = req.headers['last-event-id'] || parsedUrl.searchParams.get('lastEventId');

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': req.headers.origin || `http://${req.headers.host || '127.0.0.1'}`
    });

    const clientId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Initial connection message
    res.write(`event: connected\ndata: ${JSON.stringify({
      type: 'connected',
      clientId,
      adminIp: cleanClientIp,
      topics: Array.from(topics),
      timestamp: Date.now()
    })}\n\n`);

    const sub = globalEventBus.addSubscriber({
      id: clientId,
      res,
      topics,
      lastEventId
    });

    req.on('close', () => {
      globalEventBus.removeSubscriber(sub);
    });

    return true;
  }

  // -------------------------------------------------------------
  // GUARD: Check admin authorization for all /api/admin/* and /admin/* routes
  // -------------------------------------------------------------
  if (pathname.startsWith('/api/admin/') || pathname.startsWith('/admin/')) {
    // Exclude public auth routes
    if (pathname === '/api/admin/auth/login' || pathname === '/api/admin/auth/verify') {
      return false; // Handled by standard auth in start-app.js
    }

    const token = getAdminToken();
    const authorized = await isValidAdminToken(token);
    if (!authorized) {
      res.statusCode = 401;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Unauthorized: Admin authentication required', code: 'UNAUTHORIZED' }));
      return true;
    }

    // -----------------------------------------------------------
    // 3. ONE-SHOT SNAPSHOT ENDPOINT (/api/admin/snapshot)
    // -----------------------------------------------------------
    if (pathname === '/api/admin/snapshot' && req.method === 'GET') {
      try {
        const [overview, devicesData, trafficLogs] = await Promise.all([
          dataStore.getAdminOverview().catch(() => ({})),
          dataStore.getVisitorDevices({ limit: 50, adminIp: cleanClientIp }).catch(() => ({ devices: [] })),
          dataStore.getTrafficLogs({ limit: 100 }).catch(() => [])
        ]);

        const adminIp = cleanClientIp;
        const isLocalAdmin = !adminIp || ['127.0.0.1', '::1', 'localhost'].includes(adminIp);
        const activeUsers = (overview.activeUsers || []).map(u => {
          const userIp = (u.ip || '').replace(/^::ffff:/, '').trim();
          const isMyDev = Boolean(
            adminIp && (
              userIp === adminIp ||
              (isLocalAdmin && ['127.0.0.1', '::1', 'localhost'].includes(userIp))
            )
          );
          return { ...u, isMyDevice: isMyDev };
        });

        const snapshot = {
          timestamp: Date.now(),
          lastEventId: globalEventBus.ringBuffer.length > 0 ? globalEventBus.ringBuffer[globalEventBus.ringBuffer.length - 1].id : null,
          adminIp,
          overview: {
            ...overview,
            activeUsers
          },
          trafficLogs: trafficLogs || [],
          devicesList: devicesData.devices || [],
          openSessions: analyticsAndAdminManager.getOpenSessions(),
          webhooks: outboundWebhookManager.getEndpointsSummary(),
          webhookDeliveries: outboundWebhookManager.getRecentDeliveries(50),
          alertRules: alertEngine.getRules(),
          activeAlerts: alertEngine.getAlerts(50),
          unreadAlertsCount: alertEngine.getUnreadCount(),
          incidentTimeline: alertEngine.getIncidentTimeline(),
          blockList: securityManager.getBlockList(),
          autoBlockSuggestions: securityManager.getAutoBlockSuggestions(),
          adminSessions: securityManager.getAdminSessions(token),
          auditLogs: auditLogger.getLogs({ limit: 50 }),
          playbackQuality: analyticsAndAdminManager.getPlaybackQualityMetrics(),
          contentInsights: analyticsAndAdminManager.getContentInsights(),
          geoStats: analyticsAndAdminManager.getGeoStats(),
          errorGroups: analyticsAndAdminManager.getErrorGroups(),
          infra: analyticsAndAdminManager.getInfraStatus(),
          maintenance: analyticsAndAdminManager.getMaintenanceConfig(),
          announcements: analyticsAndAdminManager.getAnnouncements(),
          dataRetention: analyticsAndAdminManager.getDataRetentionConfig()
        };

        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(snapshot));
      } catch (err) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: err.message }));
      }
      return true;
    }

    // -----------------------------------------------------------
    // 4. DEMO EVENT SEEDING ENDPOINT (/api/admin/demo/seed)
    // -----------------------------------------------------------
    if (pathname === '/api/admin/demo/seed' && req.method === 'POST') {
      const count = parseInt(parsedUrl.searchParams.get('count') || '15', 10);
      const generated = generateDemoEventBatch(count);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        success: true,
        generatedCount: generated.length,
        ringBufferSize: globalEventBus.ringBuffer.length,
        events: generated
      }));
      return true;
    }

    // -----------------------------------------------------------
    // 5. ALERT RULES & NOTIFICATION CENTER ENDPOINTS
    // -----------------------------------------------------------
    if (pathname === '/api/admin/alerts/rules' && req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ rules: alertEngine.getRules() }));
      return true;
    }

    if (pathname === '/api/admin/alerts/rules' && req.method === 'POST') {
      const body = await getJsonBody(req);
      const saved = alertEngine.saveRule(body);
      auditLogger.logAction({
        actor: 'admin',
        action: 'SAVE_ALERT_RULE',
        subjectType: 'alert_rule',
        subjectId: saved.id,
        newValues: saved,
        ip: cleanClientIp
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, rule: saved }));
      return true;
    }

    if (pathname.startsWith('/api/admin/alerts/rules/') && req.method === 'DELETE') {
      const ruleId = decodeURIComponent(pathname.replace('/api/admin/alerts/rules/', '').trim());
      alertEngine.deleteRule(ruleId);
      auditLogger.logAction({
        actor: 'admin',
        action: 'DELETE_ALERT_RULE',
        subjectType: 'alert_rule',
        subjectId: ruleId,
        ip: cleanClientIp
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, ruleId }));
      return true;
    }

    if (pathname.startsWith('/api/admin/alerts/') && pathname.endsWith('/ack') && req.method === 'POST') {
      const alertId = decodeURIComponent(pathname.replace('/api/admin/alerts/', '').replace('/ack', '').trim());
      const result = alertEngine.acknowledgeAlert(alertId, 'admin');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: Boolean(result), alert: result }));
      return true;
    }

    if (pathname.startsWith('/api/admin/alerts/') && pathname.endsWith('/snooze') && req.method === 'POST') {
      const alertId = decodeURIComponent(pathname.replace('/api/admin/alerts/', '').replace('/snooze', '').trim());
      const body = await getJsonBody(req);
      const minutes = parseInt(body?.minutes || '60', 10);
      const result = alertEngine.snoozeAlert(alertId, minutes, 'admin');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: Boolean(result), alert: result }));
      return true;
    }

    if (pathname === '/api/admin/alerts/read-all' && req.method === 'POST') {
      const result = alertEngine.markAllAsRead('admin');
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      return true;
    }

    // -----------------------------------------------------------
    // 6. SECURITY & ACCESS CONTROL ENDPOINTS
    // -----------------------------------------------------------
    if (pathname === '/api/admin/security/block-list' && req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ blockList: securityManager.getBlockList() }));
      return true;
    }

    if (pathname === '/api/admin/security/block-list' && req.method === 'POST') {
      const body = await getJsonBody(req);
      const result = securityManager.blockTarget({
        type: body.type || 'ip',
        value: body.value || body.ip,
        reason: body.reason || 'Manual block',
        durationHours: body.durationHours || null,
        actor: 'admin',
        ip: cleanClientIp
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, blocked: result }));
      return true;
    }

    if (pathname.startsWith('/api/admin/security/block-list/') && req.method === 'DELETE') {
      const id = decodeURIComponent(pathname.replace('/api/admin/security/block-list/', '').trim());
      const success = securityManager.unblockTarget(id, 'admin', cleanClientIp);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success }));
      return true;
    }

    if (pathname === '/api/admin/security/suggestions' && req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ suggestions: securityManager.getAutoBlockSuggestions() }));
      return true;
    }

    if (pathname === '/api/admin/security/suggestions/dismiss' && req.method === 'POST') {
      const body = await getJsonBody(req);
      securityManager.dismissSuggestion(body.ip);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true }));
      return true;
    }

    if (pathname === '/api/admin/security/sessions' && req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ sessions: securityManager.getAdminSessions(token) }));
      return true;
    }

    if (pathname === '/api/admin/security/sessions/sign-out-everywhere' && req.method === 'POST') {
      const result = securityManager.signOutEverywhere('admin', cleanClientIp);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      return true;
    }

    // -----------------------------------------------------------
    // 7. SESSION CONTROL ENDPOINTS
    // -----------------------------------------------------------
    if (pathname.startsWith('/api/admin/sessions/') && pathname.endsWith('/message') && req.method === 'POST') {
      const sessionId = decodeURIComponent(pathname.replace('/api/admin/sessions/', '').replace('/message', '').trim());
      const body = await getJsonBody(req);
      const result = analyticsAndAdminManager.sendMessageToSession(sessionId, body.message, 'admin');
      auditLogger.logAction({
        actor: 'admin',
        action: 'SEND_SESSION_MESSAGE',
        subjectType: 'session',
        subjectId: sessionId,
        newValues: { message: body.message },
        ip: cleanClientIp
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      return true;
    }

    if (pathname.startsWith('/api/admin/sessions/') && pathname.endsWith('/terminate') && req.method === 'POST') {
      const sessionId = decodeURIComponent(pathname.replace('/api/admin/sessions/', '').replace('/terminate', '').trim());
      const body = await getJsonBody(req);
      const result = analyticsAndAdminManager.terminateSession(sessionId, body.reason, 'admin');
      auditLogger.logAction({
        actor: 'admin',
        action: 'TERMINATE_SESSION',
        subjectType: 'session',
        subjectId: sessionId,
        newValues: { reason: body.reason },
        ip: cleanClientIp
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      return true;
    }

    // -----------------------------------------------------------
    // 8. ERROR TRACKING ENDPOINTS
    // -----------------------------------------------------------
    if (pathname === '/api/admin/errors/groups' && req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ errorGroups: analyticsAndAdminManager.getErrorGroups() }));
      return true;
    }

    if (pathname === '/api/admin/errors/resolve' && req.method === 'POST') {
      const body = await getJsonBody(req);
      const resolved = analyticsAndAdminManager.resolveError(body.fingerprint);
      auditLogger.logAction({
        actor: 'admin',
        action: 'RESOLVE_ERROR',
        subjectType: 'error_fingerprint',
        subjectId: body.fingerprint,
        ip: cleanClientIp
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: Boolean(resolved), resolved }));
      return true;
    }

    // -----------------------------------------------------------
    // 9. AUDIT LOGS ENDPOINTS
    // -----------------------------------------------------------
    if (pathname === '/api/admin/audit-logs' && req.method === 'GET') {
      const search = parsedUrl.searchParams.get('search');
      const action = parsedUrl.searchParams.get('action');
      const logs = auditLogger.getLogs({ search, action, limit: 100 });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ logs }));
      return true;
    }

    if (pathname === '/api/admin/audit-logs/export' && req.method === 'GET') {
      const format = parsedUrl.searchParams.get('format') || 'csv';
      if (format === 'json') {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="valor_audit_logs.json"');
        res.end(JSON.stringify(auditLogger.logs, null, 2));
      } else {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="valor_audit_logs.csv"');
        res.end(auditLogger.exportCsv());
      }
      return true;
    }

    // -----------------------------------------------------------
    // 10. SYSTEM MAINTENANCE & DATA RETENTION ENDPOINTS
    // -----------------------------------------------------------
    if (pathname === '/api/admin/system/maintenance' && req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(analyticsAndAdminManager.getMaintenanceConfig()));
      return true;
    }

    if (pathname === '/api/admin/system/maintenance' && req.method === 'POST') {
      const body = await getJsonBody(req);
      const result = analyticsAndAdminManager.setMaintenanceMode({
        enabled: body.enabled,
        message: body.message,
        estimatedEndTime: body.estimatedEndTime,
        actor: 'admin'
      });
      auditLogger.logAction({
        actor: 'admin',
        action: 'UPDATE_MAINTENANCE_MODE',
        subjectType: 'system',
        subjectId: 'maintenance',
        newValues: result,
        ip: cleanClientIp
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, config: result }));
      return true;
    }

    if (pathname === '/api/admin/system/announcements' && req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ announcements: analyticsAndAdminManager.getAnnouncements() }));
      return true;
    }

    if (pathname === '/api/admin/system/announcements' && req.method === 'POST') {
      const body = await getJsonBody(req);
      const saved = analyticsAndAdminManager.saveAnnouncement(body, 'admin');
      auditLogger.logAction({
        actor: 'admin',
        action: 'SAVE_ANNOUNCEMENT',
        subjectType: 'announcement',
        subjectId: saved.id,
        newValues: saved,
        ip: cleanClientIp
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, announcement: saved }));
      return true;
    }

    if (pathname.startsWith('/api/admin/system/announcements/') && req.method === 'DELETE') {
      const id = decodeURIComponent(pathname.replace('/api/admin/system/announcements/', '').trim());
      const result = analyticsAndAdminManager.deleteAnnouncement(id);
      auditLogger.logAction({
        actor: 'admin',
        action: 'DELETE_ANNOUNCEMENT',
        subjectType: 'announcement',
        subjectId: id,
        ip: cleanClientIp
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(result));
      return true;
    }

    if (pathname === '/api/admin/system/retention' && req.method === 'GET') {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(analyticsAndAdminManager.getDataRetentionConfig()));
      return true;
    }

    if (pathname === '/api/admin/system/retention' && req.method === 'POST') {
      const body = await getJsonBody(req);
      const updated = analyticsAndAdminManager.updateDataRetentionConfig(body, 'admin');
      auditLogger.logAction({
        actor: 'admin',
        action: 'UPDATE_DATA_RETENTION',
        subjectType: 'system',
        subjectId: 'data_retention',
        newValues: updated,
        ip: cleanClientIp
      });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ success: true, config: updated }));
      return true;
    }

    // -----------------------------------------------------------
    // 11. OUTBOUND WEBHOOKS ADVANCED ENDPOINTS (Replay, Rotate, Format)
    // -----------------------------------------------------------
    if (pathname.startsWith('/api/admin/webhooks/') && pathname.endsWith('/rotate-secret') && req.method === 'POST') {
      const id = decodeURIComponent(pathname.replace('/api/admin/webhooks/', '').replace('/rotate-secret', '').trim());
      try {
        const result = await outboundWebhookManager.rotateSecret(id);
        auditLogger.logAction({
          actor: 'admin',
          action: 'ROTATE_WEBHOOK_SECRET',
          subjectType: 'webhook',
          subjectId: id,
          ip: cleanClientIp
        });
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, ...result }));
      } catch (e) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: e.message }));
      }
      return true;
    }

    if (pathname.startsWith('/api/admin/webhooks/deliveries/') && pathname.endsWith('/replay') && req.method === 'POST') {
      const deliveryId = decodeURIComponent(pathname.replace('/api/admin/webhooks/deliveries/', '').replace('/replay', '').trim());
      try {
        const result = await outboundWebhookManager.replayDelivery(deliveryId);
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ success: true, delivery: result }));
      } catch (e) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: e.message }));
      }
      return true;
    }
  }

  return false; // Not handled here; proceed down start-app.js
}
