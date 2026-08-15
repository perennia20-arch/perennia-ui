// src/lib/server/db.ts
import pkg from 'pg';
import { env } from '$env/dynamic/private';

const { Pool } = pkg;

// ⚡ INFRASTRUCTURE HARDENING: Environment-driven Postgres connection
// Enables seamless routing to Managed HA Clusters (AWS RDS / Cloud SQL) while falling back to local.
const connectionString = env.DATABASE_URL || `postgresql://postgres:password@${env.UBUNTU_NODE_IP || '192.168.0.12'}:5432/perennia`;

export const dbPool = new Pool({
    connectionString,
    max: 20, 
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
});

dbPool.on('error', (err) => {
    console.error('🔥 POSTGRESQL FAULT:', err);
});