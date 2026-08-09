import WebSocket from 'ws';

const payloads = [
    { name: "camelCase + Object", data: { id: 1, method: "getUtxosByAddresses", params: { addresses: ["kaspa:qpd3r7z43r1x0pn3y26k2yp4r7z43r1x0pn3y26k2yp4r7z0q5qqp2"] } } },
    { name: "PascalCase + Object", data: { id: 2, method: "GetUtxosByAddresses", params: { addresses: ["kaspa:qpd3r7z43r1x0pn3y26k2yp4r7z43r1x0pn3y26k2yp4r7z0q5qqp2"] } } },
    { name: "camelCase + Array", data: { id: 3, method: "getUtxosByAddresses", params: [{ addresses: ["kaspa:qpd3r7z43r1x0pn3y26k2yp4r7z43r1x0pn3y26k2yp4r7z0q5qqp2"] }] } },
    { name: "PascalCase + Array", data: { id: 4, method: "GetUtxosByAddresses", params: [{ addresses: ["kaspa:qpd3r7z43r1x0pn3y26k2yp4r7z43r1x0pn3y26k2yp4r7z0q5qqp2"] }] } }
];

async function testPayload(payload) {
    return new Promise((resolve) => {
        const ws = new WebSocket('ws://api.kaspa.org:18110');
        
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