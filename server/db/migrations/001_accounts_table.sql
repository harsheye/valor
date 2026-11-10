-- ==============================================================================
-- Migration: 001_accounts_table.sql
-- PostgreSQL 16 Migration for Accounts Table
-- Hard Constraints:
--  - NO email column
--  - Credentials are username + password only
--  - Columns: id (UUID), profile_name, username, username_lower (unique), password_hash, created_at
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_name VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL,
    username_lower VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Drop email column if it was present in older schemas
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'email'
    ) THEN
        ALTER TABLE accounts DROP COLUMN email;
    END IF;
END $$;

-- Verify all required columns are present on existing tables
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'id'
    ) THEN
        ALTER TABLE accounts ADD COLUMN id UUID DEFAULT gen_random_uuid();
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'profile_name'
    ) THEN
        ALTER TABLE accounts ADD COLUMN profile_name VARCHAR(255) DEFAULT 'User';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'username_lower'
    ) THEN
        ALTER TABLE accounts ADD COLUMN username_lower VARCHAR(255);
        UPDATE accounts SET username_lower = LOWER(username) WHERE username_lower IS NULL;
        ALTER TABLE accounts ALTER COLUMN username_lower SET NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_username_lower ON accounts (username_lower);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'accounts' AND column_name = 'password_hash'
    ) THEN
        IF EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'accounts' AND column_name = 'password'
        ) THEN
            ALTER TABLE accounts RENAME COLUMN password TO password_hash;
        ELSE
            ALTER TABLE accounts ADD COLUMN password_hash VARCHAR(255) NOT NULL DEFAULT '';
        END IF;
    END IF;
END $$;
