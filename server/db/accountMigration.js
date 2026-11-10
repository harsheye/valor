// ==============================================================================
// Migration Runner for accounts table (PostgreSQL 16 + SQLite Fallback)
// ==============================================================================

import crypto from 'crypto';

export async function runAccountMigrations(pgPool, sqliteDb) {
  // 1. PostgreSQL 16 Migration
  if (pgPool) {
    try {
      await pgPool.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

      await pgPool.query(`
        CREATE TABLE IF NOT EXISTS accounts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          profile_name VARCHAR(255) NOT NULL,
          username VARCHAR(255) NOT NULL,
          username_lower VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Check existing columns to handle migrations cleanly
      const colRes = await pgPool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'accounts';
      `);
      const existingCols = colRes.rows.map(r => r.column_name.toLowerCase());

      // Drop email column if it existed (Hard constraint: NO email anywhere)
      if (existingCols.includes('email')) {
        await pgPool.query(`ALTER TABLE accounts DROP COLUMN IF EXISTS email;`);
      }

      if (!existingCols.includes('id')) {
        await pgPool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid();`);
      }

      if (!existingCols.includes('profile_name')) {
        await pgPool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS profile_name VARCHAR(255) DEFAULT 'User';`);
      }

      if (!existingCols.includes('username_lower')) {
        await pgPool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS username_lower VARCHAR(255);`);
        await pgPool.query(`UPDATE accounts SET username_lower = LOWER(username) WHERE username_lower IS NULL;`);
        await pgPool.query(`ALTER TABLE accounts ALTER COLUMN username_lower SET NOT NULL;`);
        await pgPool.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_username_lower ON accounts (username_lower);`);
      }

      if (!existingCols.includes('password_hash')) {
        if (existingCols.includes('password')) {
          await pgPool.query(`ALTER TABLE accounts RENAME COLUMN password TO password_hash;`);
        } else {
          await pgPool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) NOT NULL DEFAULT '';`);
        }
      }

      console.log('[Database] PostgreSQL 16 accounts table verified & migrated.');
    } catch (err) {
      console.warn('[PostgreSQL Migration Error]', err.message);
    }
  }

  // 2. SQLite Fallback Migration
  if (sqliteDb) {
    try {
      sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY,
          profile_name TEXT NOT NULL,
          username TEXT NOT NULL,
          username_lower TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now'))
        );
      `);

      const tableInfo = sqliteDb.prepare("PRAGMA table_info(accounts)").all();
      const colNames = tableInfo.map(c => c.name.toLowerCase());

      if (!colNames.includes('id')) {
        try { sqliteDb.exec("ALTER TABLE accounts ADD COLUMN id TEXT;"); } catch {}
      }
      if (!colNames.includes('profile_name')) {
        try { sqliteDb.exec("ALTER TABLE accounts ADD COLUMN profile_name TEXT DEFAULT 'User';"); } catch {}
      }
      if (!colNames.includes('username_lower')) {
        try { 
          sqliteDb.exec("ALTER TABLE accounts ADD COLUMN username_lower TEXT;"); 
          sqliteDb.exec("UPDATE accounts SET username_lower = LOWER(username) WHERE username_lower IS NULL;");
          sqliteDb.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_username_lower ON accounts(username_lower);");
        } catch {}
      }
      if (!colNames.includes('password_hash')) {
        if (colNames.includes('password')) {
          try { sqliteDb.exec("ALTER TABLE accounts RENAME COLUMN password TO password_hash;"); } catch {}
        } else {
          try { sqliteDb.exec("ALTER TABLE accounts ADD COLUMN password_hash TEXT DEFAULT '';"); } catch {}
        }
      }

      console.log('[Database] SQLite accounts table verified & migrated.');
    } catch (err) {
      console.warn('[SQLite Migration Error]', err.message);
    }
  }
}
