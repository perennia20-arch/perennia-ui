import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => {
    const stream = new ReadableStream({
        start(controller) {
            const ws = new WebSocket('ws://192.168.0.12:17210');
            const WALLET_ADDRESS = 'kaspatest:qqktt4fyd3t8hg0d2mxzcle69cx33wnzd59v4zguc5ywc2lfvtq6cvcwlwzus';

            ws.onopen = () => {
                // 1. Initial State Checks
                ws.send(JSON.stringify({ type: "getInfoRequest", payload: {} }));
                ws.send(JSON.stringify({
                    type: "getBalancesByAddressesRequest",
                    payload: { addresses: [WALLET_ADDRESS] }
                }));

                // 2. Subscribe to Live Network Events
                ws.send(JSON.stringify({ type: "notifyBlockAddedRequest", payload: {} }));
                ws.send(JSON.stringify({
                    type: "notifyUtxosChangedRequest",
                    payload: { addresses: [WALLET_ADDRESS] }
                }));
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);

                // 3. Auto-fetch new balance if UTXOs change
                if (data.utxosChangedNotification) {
                    ws.send(JSON.stringify({
                        type: "getBalancesByAddressesRequest",
                        payload: { addresses: [WALLET_ADDRESS] }
                    }));
                }

                // 4. Forward all data down the SSE stream
                controller.enqueue(`data: ${event.data}\n\n`);
            };

            ws.onerror = (err) => {
                controller.enqueue(`event: error\ndata: ${JSON.stringify(err)}\n\n`);
            };

            request.signal.addEventListener('abort', () => {
                ws.close();
                controller.close();
            });
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        }
    });
};