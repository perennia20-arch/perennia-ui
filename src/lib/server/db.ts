import pg from 'pg';
import { env } from '$env/dynamic/private';

const { Pool } = pg;
const nodeIp = env.UBUNTU_NODE_IP || '192.168.0.12';

// BARE-METAL POSTGRES CONNECTION
export const dbPool = new Pool({
    user: 'postgres',
    host: nodeIp,
    database: 'perennia',
    password: 'password', // Adjust to match bare-metal prod configuration
    port: 5432,
    max: 20, 
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
});

dbPool.on('error', (err) => {
    console.error('🔥 POSTGRESQL FAULT:', err);
});