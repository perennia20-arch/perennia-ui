import { json, type RequestEvent } from '@sveltejs/kit';

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false;

export async function GET({ url, cookies }: RequestEvent) {
    // 1. Session Validation
    const rawCookie = cookies.get('perennia_session');
    if (!rawCookie) {
        return json({ error: 'UNAUTHORIZED_DAG_ACCESS' }, { status: 401 });
    }

    // ⚡ FIX: Decode cookie
    const sessionCookie = decodeURIComponent(rawCookie);
    const requestedAddress = url.searchParams.get('address');
    
    if (!requestedAddress) {
        return json({ error: "Missing address parameter" }, { status: 400 });
    }

    // 2. Authorization / Global Admin Override
    const isCorpAdmin = DEV_ADMIN_BYPASS || sessionCookie.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase();

    if (!isCorpAdmin && requestedAddress.toLowerCase() !== sessionCookie.toLowerCase()) {
        return json({ error: 'FORBIDDEN_ADDRESS_QUERY' }, { status: 403 });
    }

    // 3. Stateless REST Fetch (Replaces WebSocket)
    try {
        console.log(`\n⏳ UTXO Engine: Fetching unspent mass for ${requestedAddress.substring(0, 15)}...`);
        
        const response = await fetch(`https://api.kaspa.org/addresses/${requestedAddress}/utxos`);
        
        if (!response.ok) {
            throw new Error(`Mainnet REST API rejected request: Status ${response.status}`);
        }

        const utxos = await response.json();
        
        console.log(`[+] Mapped ${utxos.length || 0} UTXOs via REST.`);

        // Wrap it in the "entries" object so it perfectly matches 
        // the schema expected by the sor.rs engine
        return json({ entries: utxos }, { status: 200 });

    } catch (error: any) {
        console.error("❌ [Perennia Proxy] UTXO Engine Fault:", error.message);
        return json({ error: 'Failed to fetch UTXOs from Mainnet DAG', details: error.message }, { status: 500 });
    }
}