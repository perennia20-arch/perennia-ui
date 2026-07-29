// src/lib/server/redis.ts

import Redis from 'ioredis';
import { env } from '$env/dynamic/private';

// ⚡ This tells Windows to cross the local network and read the Ubuntu Node
const nodeIp = env.UBUNTU_NODE_IP || '192.168.0.12';
export const redis = new Redis(`redis://${nodeIp}:6379`);

redis.on('connect', () => console.log(`🟢 SvelteKit successfully connected to Ubuntu Redis at ${nodeIp}!`));
redis.on('error', (err) => console.error('🔴 SvelteKit Redis Network Error:', err));