
// src/lib/server/db.ts

import pkg from 'pg';

import { env } from '$env/dynamic/private';



const { Pool } = pkg;



if (!env.DATABASE_URL) {

    throw new Error("CRITICAL: DATABASE_URL is missing. Node refusing to boot.");

}



export const dbPool = new Pool({

    connectionString: env.DATABASE_URL,

    max: 20, 

    idleTimeoutMillis: 30000,

    connectionTimeoutMillis: 3000,

});



dbPool.on('error', (err) => {

    console.error('🔥 POSTGRESQL FAULT:', err);

});
