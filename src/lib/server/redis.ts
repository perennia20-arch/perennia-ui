
// src/lib/server/redis.ts

import Redis from 'ioredis';

import { env } from '$env/dynamic/private';



if (!env.REDIS_URL) {

    throw new Error("CRITICAL: REDIS_URL is missing. Node refusing to boot.");

}



export const redis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 3 });



redis.on('connect', () => console.log(`🟢 SvelteKit successfully connected to Redis Cluster!`));

redis.on('error', (err) => console.error('🔴 SvelteKit Redis Network Error:', err));
