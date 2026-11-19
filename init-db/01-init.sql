-- ==============================================================================
-- Valor Stack - PostgreSQL Initialization Script
-- Executed on container first run
-- ==============================================================================

-- Enable pgcrypto extension for UUID generation and cryptographic functions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
