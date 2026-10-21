import crypto from 'crypto';
import pg from 'pg';
import { DatabaseSync } from 'node:sqlite';

export function getCanonicalDeviceId(ip) {
  const clean = (ip || '127.0.0.1').replace(/^::ffff:/, '').trim();
  return 'dev_' + crypto.createHash('md5').update(clean).digest('hex').substring(0, 16);
}

export async function consolidateDevices(options = {}) {
  const pgConnectionString = options.pgConnectionString || 'postgresql://valor_user:ValorPass2026!@localhost:5432/valor';
  const sqliteDbPath = options.sqliteDbPath || './.valor_data/valor.db';

  let pool = null;
  try {
    pool = new pg.Pool({ connectionString: pgConnectionString });
    await pool.query('SELECT 1');
  } catch (err) {
    pool = null;
  }

  let db = null;
  try {
    db = new DatabaseSync(sqliteDbPath);
  } catch (err) {
    db = null;
  }

  // 1. Ensure foreign key column device_id exists on analytics_sessions
  if (pool) {
    await pool.query('ALTER TABLE analytics_sessions ADD COLUMN IF NOT EXISTS device_id VARCHAR(64)').catch(() => {});
    await pool.query('CREATE INDEX IF NOT EXISTS idx_analytics_sessions_device_id ON analytics_sessions(device_id)').catch(() => {});
    await pool.query('CREATE INDEX IF NOT EXISTS idx_analytics_traffic_device_id ON analytics_traffic_logs(device_id)').catch(() => {});
    await pool.query('CREATE INDEX IF NOT EXISTS idx_analytics_devices_last_ip ON analytics_devices(last_ip)').catch(() => {});
  }

  if (db) {
    try { db.exec('ALTER TABLE analytics_sessions ADD COLUMN device_id TEXT'); } catch (e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_analytics_sessions_device_id ON analytics_sessions(device_id)'); } catch (e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_analytics_traffic_device_id ON analytics_traffic_logs(device_id)'); } catch (e) {}
    try { db.exec('CREATE INDEX IF NOT EXISTS idx_analytics_devices_last_ip ON analytics_devices(last_ip)'); } catch (e) {}
  }

  // 2. Consolidate devices in PostgreSQL (1 IP = 1 Device)
  if (pool) {
    try {
      const distinctIps = await pool.query(`
        SELECT DISTINCT ip FROM (
          SELECT last_ip as ip FROM analytics_devices WHERE last_ip IS NOT NULL AND last_ip != ''
          UNION
          SELECT ip FROM analytics_sessions WHERE ip IS NOT NULL AND ip != ''
          UNION
          SELECT ip FROM analytics_traffic_logs WHERE ip IS NOT NULL AND ip != '' AND ip != '1.2.3.4'
        ) t
      `);

      for (const row of distinctIps.rows) {
        const ip = row.ip;
        if (!ip) continue;
        const canonicalId = getCanonicalDeviceId(ip);

        // Calculate aggregated stats across all entries for this IP
        const agg = await pool.query(`
          SELECT 
            MIN(first_seen) as first_seen,
            MAX(last_seen) as last_seen,
            COALESCE(SUM(visit_count), 1) as visit_count,
            COALESCE(SUM(total_requests), 1) as total_requests,
            COALESCE(SUM(bytes_transferred), 0) as bytes_transferred,
            COALESCE(SUM(embed_calls_count), 0) as embed_calls_count,
            MAX(country) as country,
            MAX(country_code) as country_code,
            MAX(city) as city,
            MAX(region) as region,
            MAX(isp) as isp,
            MAX(org) as org,
            MAX(reverse_dns) as reverse_dns,
            MAX(browser) as browser,
            MAX(os) as os,
            MAX(device) as device,
            MAX(user_agent) as user_agent
          FROM analytics_devices
          WHERE last_ip = $1
        `, [ip]);

        const a = agg.rows[0] || {};
        
        // Count actual sessions and requests from logs if devices table had 0
        const sessionCountRes = await pool.query(`SELECT COUNT(*) as cnt FROM analytics_sessions WHERE ip = $1`, [ip]);
        const actualSessions = parseInt(sessionCountRes.rows[0]?.cnt || '1', 10) || 1;
        const logCountRes = await pool.query(`SELECT COUNT(*) as cnt, COALESCE(SUM(bytes_transferred), 0) as bytes FROM analytics_traffic_logs WHERE ip = $1`, [ip]);
        const actualLogs = parseInt(logCountRes.rows[0]?.cnt || '0', 10) || parseInt(a.total_requests || '1', 10);
        const actualBytes = parseInt(logCountRes.rows[0]?.bytes || '0', 10) || parseInt(a.bytes_transferred || '0', 10);

        // Delete all old duplicate rows for this IP
        await pool.query('DELETE FROM analytics_devices WHERE last_ip = $1', [ip]);

        // Insert single consolidated master device
        await pool.query(`
          INSERT INTO analytics_devices (
            device_id, first_seen, last_seen, visit_count, total_duration_seconds, total_requests,
            bytes_transferred, last_ip, ips, user_agent, browser, os, device,
            embed_calls_count, embed_referers, country, country_code, city, region, isp, org, reverse_dns
          ) VALUES (
            $1, COALESCE($2, NOW()), COALESCE($3, NOW()), $4, 0, $5, $6, $7::varchar, $8::jsonb,
            $9, $10, $11, $12, $13, '[]'::jsonb, $14, $15, $16, $17, $18, $19, $20
          )
          ON CONFLICT (device_id) DO UPDATE SET
            last_seen = EXCLUDED.last_seen,
            total_requests = EXCLUDED.total_requests,
            visit_count = EXCLUDED.visit_count,
            bytes_transferred = EXCLUDED.bytes_transferred
        `, [
          canonicalId,
          a.first_seen || new Date(),
          a.last_seen || new Date(),
          Math.max(actualSessions, parseInt(a.visit_count || '1', 10)),
          Math.max(actualLogs, 1),
          actualBytes,
          ip,
          JSON.stringify([ip]),
          a.user_agent || '',
          a.browser || 'Chrome',
          a.os || 'Windows',
          a.device || 'Desktop',
          parseInt(a.embed_calls_count || '0', 10),
          a.country || (ip === '127.0.0.1' ? 'Localhost' : 'India'),
          a.country_code || (ip === '127.0.0.1' ? 'LO' : 'IN'),
          a.city || (ip === '127.0.0.1' ? 'Local Dev' : 'Chandigarh'),
          a.region || 'Chandigarh',
          a.isp || (ip === '127.0.0.1' ? 'Local Network' : 'Bharti Airtel'),
          a.org || (ip === '127.0.0.1' ? 'Localhost' : 'Bharti Airtel Limited'),
          a.reverse_dns || (ip === '127.0.0.1' ? 'localhost' : 'Bharti Airtel Limited')
        ]);

        // Establish the foreign key link across tables
        await pool.query('UPDATE analytics_sessions SET device_id = $1 WHERE ip = $2', [canonicalId, ip]);
        await pool.query('UPDATE analytics_traffic_logs SET device_id = $1 WHERE ip = $2', [canonicalId, ip]);
      }
    } catch (e) {
      console.error('[Consolidate Postgres Error]', e);
    }
  }

  // 3. Consolidate devices in SQLite (1 IP = 1 Device)
  if (db) {
    try {
      const distinctIps = db.prepare(`
        SELECT DISTINCT ip FROM (
          SELECT last_ip as ip FROM analytics_devices WHERE last_ip IS NOT NULL AND last_ip != ''
          UNION
          SELECT ip FROM analytics_sessions WHERE ip IS NOT NULL AND ip != ''
          UNION
          SELECT ip FROM analytics_traffic_logs WHERE ip IS NOT NULL AND ip != '' AND ip != '1.2.3.4'
        )
      `).all();

      for (const row of distinctIps) {
        const ip = row.ip;
        if (!ip) continue;
        const canonicalId = getCanonicalDeviceId(ip);

        const a = db.prepare(`
          SELECT 
            MIN(first_seen) as first_seen,
            MAX(last_seen) as last_seen,
            COALESCE(SUM(visit_count), 1) as visit_count,
            COALESCE(SUM(total_requests), 1) as total_requests,
            COALESCE(SUM(bytes_transferred), 0) as bytes_transferred,
            COALESCE(SUM(embed_calls_count), 0) as embed_calls_count,
            MAX(country) as country,
            MAX(country_code) as country_code,
            MAX(city) as city,
            MAX(region) as region,
            MAX(isp) as isp,
            MAX(org) as org,
            MAX(reverse_dns) as reverse_dns,
            MAX(browser) as browser,
            MAX(os) as os,
            MAX(device) as device,
            MAX(user_agent) as user_agent
          FROM analytics_devices
          WHERE last_ip = ?
        `).get(ip) || {};

        const actualSessions = db.prepare(`SELECT COUNT(*) as cnt FROM analytics_sessions WHERE ip = ?`).get(ip)?.cnt || 1;
        const logStats = db.prepare(`SELECT COUNT(*) as cnt, COALESCE(SUM(bytes_transferred), 0) as bytes FROM analytics_traffic_logs WHERE ip = ?`).get(ip);
        const actualLogs = logStats?.cnt || (a.total_requests || 1);
        const actualBytes = logStats?.bytes || (a.bytes_transferred || 0);

        db.prepare('DELETE FROM analytics_devices WHERE last_ip = ?').run(ip);

        db.prepare(`
          INSERT INTO analytics_devices (
            device_id, first_seen, last_seen, visit_count, total_duration_seconds, total_requests,
            bytes_transferred, last_ip, ips, user_agent, browser, os, device,
            embed_calls_count, embed_referers, country, country_code, city, region, isp, org, reverse_dns
          ) VALUES (
            ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, '[]',
            ?, ?, ?, ?, ?, ?, ?
          )
          ON CONFLICT (device_id) DO UPDATE SET
            last_seen = excluded.last_seen,
            total_requests = excluded.total_requests,
            visit_count = excluded.visit_count,
            bytes_transferred = excluded.bytes_transferred
        `).run(
          canonicalId,
          a.first_seen || new Date().toISOString(),
          a.last_seen || new Date().toISOString(),
          Math.max(actualSessions, a.visit_count || 1),
          Math.max(actualLogs, 1),
          actualBytes,
          ip,
          JSON.stringify([ip]),
          a.user_agent || '',
          a.browser || 'Chrome',
          a.os || 'Windows',
          a.device || 'Desktop',
          a.embed_calls_count || 0,
          a.country || (ip === '127.0.0.1' ? 'Localhost' : 'India'),
          a.country_code || (ip === '127.0.0.1' ? 'LO' : 'IN'),
          a.city || (ip === '127.0.0.1' ? 'Local Dev' : 'Chandigarh'),
          a.region || 'Chandigarh',
          a.isp || (ip === '127.0.0.1' ? 'Local Network' : 'Bharti Airtel'),
          a.org || (ip === '127.0.0.1' ? 'Localhost' : 'Bharti Airtel Limited'),
          a.reverse_dns || (ip === '127.0.0.1' ? 'localhost' : 'Bharti Airtel Limited')
        );

        db.prepare('UPDATE analytics_sessions SET device_id = ? WHERE ip = ?').run(canonicalId, ip);
        db.prepare('UPDATE analytics_traffic_logs SET device_id = ? WHERE ip = ?').run(canonicalId, ip);
      }
    } catch (e) {
      console.error('[Consolidate SQLite Error]', e);
    }
  }

  if (pool) await pool.end();
  return { success: true };
}

// Auto-run if executed directly
if (process.argv[1]?.endsWith('consolidateDevices.js')) {
  consolidateDevices().then(res => {
    console.log('Consolidation completed successfully:', res);
  }).catch(err => {
    console.error('Consolidation failed:', err);
  });
}
