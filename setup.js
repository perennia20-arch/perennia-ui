import pg from 'pg';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const pool = new pg.Pool({
    user: 'postgres',
    host: process.env.UBUNTU_NODE_IP || '192.168.0.12',
    database: 'perennia',
    password: 'password',
    port: 5432
});

const schemaSql = `
-- 1. Sovereign tracking of bare-metal hardware identities
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS worker_profiles (
    worker_id VARCHAR(255) PRIMARY KEY,
    wallet_address VARCHAR(255) NOT NULL,
    device_profile VARCHAR(100) NOT NULL DEFAULT 'unknown',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Continuous Fluidity: Real-time balance streaming for active smart contract polling
CREATE TABLE IF NOT EXISTS yield_reservoirs (
    wallet_address VARCHAR(255) PRIMARY KEY,
    streaming_balance_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    total_yield_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. UNLOGGED WAL: Millions of sub-second micro-shares map directly here from the Redis Oracle
CREATE UNLOGGED TABLE IF NOT EXISTS micro_shares (
    share_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    worker_id VARCHAR(255) NOT NULL,
    difficulty_weight DOUBLE PRECISION NOT NULL,
    kas_value_delta DOUBLE PRECISION NOT NULL,
    network_diff DOUBLE PRECISION NOT NULL,
    is_settled BOOLEAN NOT NULL DEFAULT false,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. The L1 Block Ledger: Persistent tracking of global Kaspa network discoveries
CREATE TABLE IF NOT EXISTS network_blocks (
    block_hash VARCHAR(64) PRIMARY KEY,
    worker_id VARCHAR(255) NOT NULL,
    nonce BIGINT NOT NULL,
    network_diff DOUBLE PRECISION NOT NULL,
    is_orphaned BOOLEAN DEFAULT false,
    discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. SOVEREIGN COMMAND CENTER STATE 
CREATE TABLE IF NOT EXISTS user_command_centers (
    wallet_address VARCHAR(255) PRIMARY KEY,
    layout_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. COMPLIANCE & TAX FORTRESS LEDGER
CREATE TABLE IF NOT EXISTS entity_kyc (
    wallet_address VARCHAR(255) PRIMARY KEY,
    legal_name VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    tax_id_hash TEXT NOT NULL,
    business_address TEXT NOT NULL,
    verification_status VARCHAR(50) DEFAULT 'pending',
    verified_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS tax_ledger_events (
    event_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_address VARCHAR(255) NOT NULL,
    asset_ticker VARCHAR(20) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    gross_proceeds_usd DOUBLE PRECISION NOT NULL,
    amount_tokens DOUBLE PRECISION NOT NULL,
    spot_price_at_execution DOUBLE PRECISION NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. ZERO-TRUST PERIMETER: INVITATIONS & WHITELISTS
CREATE TABLE IF NOT EXISTS whitelisted_wallets (
    wallet_address VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS invite_codes (
    code VARCHAR(64) PRIMARY KEY,
    is_used BOOLEAN NOT NULL DEFAULT false,
    used_by_wallet VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- HIGH-PERFORMANCE INDEXING MATRIX
CREATE INDEX IF NOT EXISTS idx_micro_shares_worker ON micro_shares(worker_id);
CREATE INDEX IF NOT EXISTS idx_micro_shares_settlement ON micro_shares(is_settled);
CREATE INDEX IF NOT EXISTS idx_network_blocks_worker ON network_blocks(worker_id);
CREATE INDEX IF NOT EXISTS idx_network_blocks_time ON network_blocks(discovered_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_command_centers_updated ON user_command_centers(last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_tax_ledger_wallet ON tax_ledger_events(wallet_address, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_micro_shares_recorded_brin 
ON micro_shares USING brin (recorded_at) WITH (pages_per_range = 128);

CREATE UNLOGGED TABLE IF NOT EXISTS rwa_oracle_feeds (
    ticker VARCHAR(16) NOT NULL,
    asset_class VARCHAR(16) NOT NULL,
    price_usd NUMERIC(18, 8) NOT NULL,
    oracle_source VARCHAR(32) NOT NULL DEFAULT 'PYTH_HERMES',
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (ticker, updated_at)
);

CREATE INDEX IF NOT EXISTS idx_rwa_oracle_ticker_time ON rwa_oracle_feeds (ticker, updated_at DESC);

-- INJECT MASTER ADMIN INTO WHITELIST TO PREVENT LOCKOUT
INSERT INTO whitelisted_wallets (wallet_address) 
VALUES ('kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579') 
ON CONFLICT DO NOTHING;

-- GENERATE INITIAL JOSH BETA INVITE
INSERT INTO invite_codes (code) 
VALUES ('JOSH-BETA-2026') 
ON CONFLICT DO NOTHING;
`;

async function igniteMatrix() {
    try {
        console.log("⚡ Pushing tables to Ubuntu Postgres Node directly from memory...");
        await pool.query(schemaSql);
        
        console.log("✅ SUCCESS: Matrix Ignited & Perimeter Whitelist Armed!");
        console.log("🎟️ Generated Invite Code: JOSH-BETA-2026");
    } catch (err) {
        console.error("❌ FAILED to build tables:", err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

igniteMatrix();