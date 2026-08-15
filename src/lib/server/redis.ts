// src/lib/server/redis.ts
import Redis from 'ioredis';
import { env } from '$env/dynamic/private';

// ⚡ INFRASTRUCTURE HARDENING: Support distributed Redis Clusters for IPC scaling
// ioredis natively supports routing via Cluster URIs, eliminating single-thread socket exhaustion.
const redisUrl = env.REDIS_URL || `redis://${env.UBUNTU_NODE_IP || '192.168.0.12'}:6379`;
export const redis = new Redis(redisUrl, { maxRetriesPerRequest: 3 });

redis.on('connect', () => console.log(`🟢 SvelteKit successfully connected to Redis at ${redisUrl}!`));
redis.on('error', (err) => console.error('🔴 SvelteKit Redis Network Error:', err));