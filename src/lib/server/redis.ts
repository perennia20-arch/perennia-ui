import Redis from 'ioredis';

// ⚡ This tells Windows to cross the local network and read the Ubuntu Node
export const redis = new Redis('redis://192.168.0.12:6379');

redis.on('connect', () => console.log('🟢 SvelteKit successfully connected to Ubuntu Redis!'));
redis.on('error', (err) => console.error('🔴 SvelteKit Redis Network Error:', err));