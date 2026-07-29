// src/routes/api/utxos/+server.ts

import { json, type RequestEvent } from '@sveltejs/kit';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

export async function GET({ url }: RequestEvent) {
    const address = url.searchParams.get('address');
    if (!address) return json({ error: "Missing address parameter" }, { status: 400 });

    const nodeIp = process.env.UBUNTU_NODE_IP || '192.168.0.12';

    return new Promise((resolve) => {
        let isResolved = false; // ⚡ Immutable state lock
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
            console.log(`[+] Socket OPENED. Firing payload for ${address.substring(0, 15)}...`);
            const payload = { id: 1, method: "getUtxosByAddresses", params: { addresses: [address] } };
            ws.send(JSON.stringify(payload));
        });

        ws.on('message', (data: any) => {
            if (isResolved) return;
            isResolved = true; // Lock out the close/error handlers
            clearTimeout(timeout);
            console.log(`[+] Reply RECEIVED.`);
            
            try {
                const response = JSON.parse(data.toString());
                const entries = response.params?.entries || response.entries || [];
                console.log(`[+] Mapped ${entries.length} UTXOs.`);
                
                ws.terminate(); // Instantly destroy socket to prevent 1006 cascade
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