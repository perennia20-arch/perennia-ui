import { json, type RequestEvent } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false;

export async function GET({ url, cookies }: RequestEvent) {
    const rawCookie = cookies.get('perennia_session');
    
    if (!rawCookie) {
        return json({ workers: [], silos: [], plants: [], systemMode: 'base' }, { status: 200 });
    }

    const sessionWallet = decodeURIComponent(rawCookie);
    const cleanWallet = sessionWallet.toLowerCase().replace('kaspa:', '').trim();
    const stateKey = `state:${cleanWallet}`;
    
    const isCorpAdmin = DEV_ADMIN_BYPASS || sessionWallet.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase();
    const reqGlobal = url.searchParams.get('global') === 'true';

    // ⚡ OVERRIDE: Fetch Global State if Admin Tool is Toggled On
    if (isCorpAdmin && reqGlobal) {
        try {
            const keys = await redis.keys('state:*');
            let allWorkers: any[] = [];
            let allSilos: any[] = [];
            let allPlants: any[] = [];
            
            for (const k of keys) {
                const s = await redis.get(k);
                if (s) {
                    const parsed = JSON.parse(s);
                    if (parsed.workers) allWorkers.push(...parsed.workers);
                    if (parsed.silos) allSilos.push(...parsed.silos);
                    if (parsed.plants) allPlants.push(...parsed.plants);
                }
            }
            return json({ workers: allWorkers, silos: allSilos, plants: allPlants, systemMode: 'overclocked' }, { status: 200 });
        } catch (e) {
            console.error("Global State Fetch Fault:", e);
        }
    }

    // Standard Local Fetch
    try {
        const rawState = await redis.get(stateKey);
        if (rawState) {
            return json(JSON.parse(rawState), { status: 200 });
        }
    } catch (e) {
        console.error("🔴 State Fetch Fault:", e);
    }

    return json({ workers: [], silos: [], plants: [], systemMode: 'base' }, { status: 200 });
}

export async function POST({ request, cookies }: RequestEvent) {
    const rawCookie = cookies.get('perennia_session');
    
    if (!rawCookie) {
        return json({ error: 'UNAUTHORIZED_STATE_WRITE' }, { status: 401 });
    }

    try {
        const payload = await request.json();
        
        const sessionWallet = decodeURIComponent(rawCookie);
        const cleanWallet = sessionWallet.toLowerCase().replace('kaspa:', '').trim();
        const stateKey = `state:${cleanWallet}`;

        await redis.set(stateKey, JSON.stringify(payload));
        return json({ success: true }, { status: 200 });
    } catch (e) {
        console.error("🔴 State Save Fault:", e);
        return json({ error: 'Failed to persist state' }, { status: 500 });
    }
}