// src/routes/api/broadcast/+server.ts

import { json, type RequestEvent } from '@sveltejs/kit';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const WebSocket = require('ws');

export async function POST({ request }: RequestEvent) {
    const payload = await request.json();
    const nodeIp = process.env.UBUNTU_NODE_IP || '192.168.0.12';

    return new Promise((resolve) => {
        let isResolved = false; // ⚡ Immutable state lock
        console.log(`\n⏳ Chronos Engine: Opening raw CommonJS WebSocket to ws://${nodeIp}:18110...`);
        
        const ws = new WebSocket(`ws://${nodeIp}:18110`);
        
        const timeout = setTimeout(() => {
            if (isResolved) return;
            isResolved = true;
            ws.terminate();
            console.error("❌ [Perennia Proxy] Broadcast: wRPC connection timed out");
            resolve(json({ error: "wRPC connection timed out" }, { status: 500 }));
        }, 5000);

        ws.on('open', () => {
            console.log(`[+] Socket OPENED. Firing transaction payload...`);
            const rpcPayload = { id: 2, method: "submitTransaction", params: { transaction: payload, allowOrphan: false } };
            ws.send(JSON.stringify(rpcPayload));
        });

        ws.on('message', (data: any) => {
            if (isResolved) return;
            isResolved = true; // Lock out the close/error handlers
            clearTimeout(timeout);
            console.log(`[+] Reply RECEIVED.`);
            
            try {
                const response = JSON.parse(data.toString());
                if (response.error) {
                    console.error("❌ [Perennia Proxy] Broadcast Error:", response.error.message);
                    ws.terminate();
                    resolve(json({ error: response.error.message }, { status: 500 }));
                    return;
                }
                console.log("🟢 Payload Broadcasted:", response);
                const transactionId = response.params?.transactionId || response.transactionId;
                
                ws.terminate();
                resolve(json({ success: true, transactionId }, { status: 200 }));
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