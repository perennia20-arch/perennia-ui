import { json, type RequestEvent } from '@sveltejs/kit';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

const MASTER_ADMIN_ADDRESS = "kaspa:qrc3ezl770p2cjlfc3tjp6vqlldt6lgh3e80d6rm4rchtt0yrrpgzqave8579";
const DEV_ADMIN_BYPASS = false;

export async function GET({ url, cookies }: RequestEvent) {
    const rawCookie = cookies.get('perennia_session');
    if (!rawCookie) {
        return json({ error: 'UNAUTHORIZED_DAG_ACCESS' }, { status: 401 });
    }

    // ⚡ FIX: Decode cookie
    const sessionCookie = decodeURIComponent(rawCookie);
    const requestedAddress = url.searchParams.get('address');
    
    if (!requestedAddress) return json({ error: "Missing address parameter" }, { status: 400 });

    const isCorpAdmin = DEV_ADMIN_BYPASS || sessionCookie.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase();

    if (!isCorpAdmin && requestedAddress.toLowerCase() !== sessionCookie.toLowerCase()) {
        return json({ error: 'FORBIDDEN_ADDRESS_QUERY' }, { status: 403 });
    }

    const nodeIp = process.env.KASPA_NODE_IP || 'api.kaspa.org';

    return new Promise((resolve) => {
        let isResolved = false;
        console.log(`\n⏳ UTXO Engine: Opening raw CommonJS WebSocket to ws://${nodeIp}:18110...`);
        
        const ws = new WebSocket(`ws://${nodeIp}:18110`);
        
        const timeout = setTimeout(() => {
            if (isResolved) return;
            isResolved = true;
            ws.terminate();
            console.error("❌ [Perennia Proxy] UTXO Engine: wRPC connection timed out");
            resolve(json({ error: "wRPC connection timed out" }, { status: 500 }));
        }, 5000);

        ws.on('open', () => {
            console.log(`[+] Socket OPENED. Fetching unspent mass for ${requestedAddress.substring(0, 15)}...`);
            const payload = { id: 1, method: "getUtxosByAddresses", params: { addresses: [requestedAddress] } };
            ws.send(JSON.stringify(payload));
        });

        ws.on('message', (data: any) => {
            if (isResolved) return;
            isResolved = true; 
            clearTimeout(timeout);
            
            try {
                const response = JSON.parse(data.toString());
                const entries = response.params?.entries || response.entries || [];
                console.log(`[+] Mapped ${entries.length} UTXOs.`);
                
                ws.terminate();
                resolve(json({ entries }, { status: 200 }));
            } catch (e) {
                console.error("❌ [Perennia Proxy] Failed to parse wRPC response");
                ws.terminate();
                resolve(json({ error: "Failed to parse wRPC response" }, { status: 500 }));
            }
        });

        ws.on('close', (code: number) => {
            if (isResolved) return; 
            isResolved = true;
            clearTimeout(timeout);
            console.error(`❌ [Perennia Proxy] Node abruptly dropped connection. Code: ${code}`);
            resolve(json({ error: "Node connection rejected" }, { status: 500 }));
        });

        ws.on('error', (err: Error) => {
            if (isResolved) return;
            isResolved = true;
            clearTimeout(timeout);
            console.error("❌ [Perennia Proxy] Socket Error:", err.message);
            resolve(json({ error: err.message }, { status: 500 }));
        });
    });
}