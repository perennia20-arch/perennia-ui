import WebSocket from 'ws';

const payloads = [
    { name: "camelCase + Object", data: { id: 1, method: "getUtxosByAddresses", params: { addresses: ["kaspa:qz2sehqzx8xetzkhz2ycqflwf8dhusyxhj0myv4ez72k0n6vdaj827jexnyzz"] } } },
    { name: "PascalCase + Object", data: { id: 2, method: "GetUtxosByAddresses", params: { addresses: ["kaspa:qz2sehqzx8xetzkhz2ycqflwf8dhusyxhj0myv4ez72k0n6vdaj827jexnyzz"] } } },
    { name: "camelCase + Array", data: { id: 3, method: "getUtxosByAddresses", params: [{ addresses: ["kaspa:qz2sehqzx8xetzkhz2ycqflwf8dhusyxhj0myv4ez72k0n6vdaj827jexnyzz"] }] } },
    { name: "PascalCase + Array", data: { id: 4, method: "GetUtxosByAddresses", params: [{ addresses: ["kaspa:qz2sehqzx8xetzkhz2ycqflwf8dhusyxhj0myv4ez72k0n6vdaj827jexnyzz"] }] } }
];

async function testPayload(payload) {
    return new Promise((resolve) => {
        const ws = new WebSocket('ws://192.168.0.12:18110');
        
        ws.on('open', () => {
            console.log(`\nTesting: ${payload.name}`);
            ws.send(JSON.stringify(payload.data));
        });

        ws.on('message', (m) => {
            console.log(`✅ SUCCESS! Node accepted ${payload.name}.`);
            console.log(`Reply:`, m.toString());
            ws.close();
            resolve(true);
        });

        ws.on('close', (code) => {
            if (code === 1006) {
                console.log(`❌ FAILED: Node dropped connection (Code 1006). Syntax rejected.`);
            }
            resolve(false);
        });
        
        ws.on('error', () => {
            resolve(false);
        });
    });
}

async function run() {
    for (const p of payloads) {
        const success = await testPayload(p);
        if (success) {
            console.log("\n🎉 SYNTAX CRACKED. Use this format in your SvelteKit proxy.");
            process.exit(0);
        }
    }
    console.log("\n💀 All formats rejected.");
}

run();