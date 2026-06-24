import { json, type RequestEvent } from '@sveltejs/kit';

const UBUNTU_METRICS_URL = 'http://192.168.0.12:2114/metrics';

// ========================================================
// 🧠 TRUE PROTOCOL MEMORY (The "Kaspa-Pool" Engine)
// Maintains a 5-minute rolling window of cryptographic shares
// to calculate a perfectly smoothed true hardware hashrate.
// ========================================================
interface SharePoint { t: number; d: number; }
interface WorkerMemory { history: SharePoint[]; smoothedHashrate: number; }
const nodeMemory = new Map<string, WorkerMemory>();

export async function POST({ request }: RequestEvent) {
    try {
        const body = await request.json();
        const walletAddress = body.walletAddress;
        const clientWorkers = body.clientWorkers || [];

        if (!walletAddress) { return json({ success: false, error: 'Missing wallet address' }, { status: 400 }); }
        
        let authenticatedWorkers: any[] = [];
        let ubuntuNodeStatus = 'offline';
        let rawMetricsText = '';
        let livePoolBalance: number | undefined = undefined;

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const nodeResponse = await fetch(UBUNTU_METRICS_URL, { method: 'GET', signal: controller.signal });
            clearTimeout(timeoutId);

            if (nodeResponse.ok) {
                rawMetricsText = await nodeResponse.text();
                ubuntuNodeStatus = 'online';
            }
        } catch (err: any) { ubuntuNodeStatus = 'unreachable'; }

        // 💰 PARSE GLOBAL WALLET BALANCE
        if (ubuntuNodeStatus === 'online' && rawMetricsText) {
            const lines = rawMetricsText.split('\n');
            for (const line of lines) {
                if (line.startsWith('ks_balance_by_wallet_gauge') && line.includes(`wallet="${walletAddress}"`)) {
                    const parts = line.trim().split(/\s+/);
                    const parsedBalance = parseFloat(parts[parts.length - 1]);
                    if (!isNaN(parsedBalance)) { livePoolBalance = parsedBalance; }
                }
            }
        }

        for (const cw of clientWorkers) {
            if (cw.type === 'physical') {
                let verifiedHashrate = 0.00;
                let isActuallyOnline = false;
                let workerIp = '';
                let hardwareType = '';

                // 🧮 EXACT POOL HASHRATE CALCULUS
                if (ubuntuNodeStatus === 'online' && rawMetricsText && cw.name) {
                    const lines = rawMetricsText.split('\n');
                    
                    for (const line of lines) {
                        if (line.includes(`worker="${cw.name}"`) && line.includes(`wallet="${walletAddress}"`)) {
                            isActuallyOnline = true;
                            const ipMatch = line.match(/ip="([^"]+)"/);
                            if (ipMatch) workerIp = ipMatch[1];
                            const minerMatch = line.match(/miner="([^"]+)"/);
                            if (minerMatch) hardwareType = minerMatch[1];
                        }

                        // Track the exact difficulty of valid shares submitted
                        if (line.startsWith('ks_valid_share_diff_counter') && line.includes(`worker="${cw.name}"`) && line.includes(`wallet="${walletAddress}"`)) {
                            const parts = line.trim().split(/\s+/);
                            const currentDiff = parseFloat(parts[parts.length - 1]);
                            const currentTime = Date.now() / 1000;

                            let memory = nodeMemory.get(cw.id);
                            if (!memory) {
                                memory = { history: [], smoothedHashrate: 0 };
                                nodeMemory.set(cw.id, memory);
                            }

                            // If miner restarts, diff resets to 0. Wipe memory.
                            if (memory.history.length > 0 && currentDiff < memory.history[memory.history.length - 1].d) {
                                memory.history = [];
                            }

                            // Prevent duplicate entries in the exact same second
                            if (memory.history.length === 0 || memory.history[memory.history.length - 1].t !== currentTime) {
                                memory.history.push({ t: currentTime, d: currentDiff });
                            }

                            // PERFECT SMOOTHING: Keep only the last 5 minutes (300s) of data
                            memory.history = memory.history.filter(p => currentTime - p.t <= 300);

                            if (memory.history.length > 1) {
                                const oldest = memory.history[0];
                                const newest = memory.history[memory.history.length - 1];
                                
                                const diffDelta = newest.d - oldest.d;
                                const timeDelta = newest.t - oldest.t;

                                if (timeDelta > 0 && diffDelta >= 0) {
                                    // Math.max forces a 5-minute ramp up. This completely crushes the 0.96 TH/s jitter spike!
                                    const effectiveTimeDelta = Math.max(timeDelta, 300); 
                                    const windowHashrateTH = (diffDelta / effectiveTimeDelta) * 0.002147483648;
                                    
                                    memory.smoothedHashrate = windowHashrateTH;
                                    verifiedHashrate = windowHashrateTH;
                                } else {
                                    verifiedHashrate = memory.smoothedHashrate;
                                }
                            } else {
                                // Not enough data points to draw a slope yet. Dispay "SYNCING..."
                                verifiedHashrate = 0;
                            }
                        }
                    }
                }

                if (!isActuallyOnline) { nodeMemory.delete(cw.id); }

                // STRICT RULE ENFORCEMENT: No fake fallback values here.
                authenticatedWorkers.push({ id: cw.id, name: cw.name, hashRate: verifiedHashrate, isOnline: isActuallyOnline, ipAddress: workerIp, hardwareType: hardwareType });
            } else {
                authenticatedWorkers.push(cw); 
            }
        }

        return json({ success: true, nodeStatus: ubuntuNodeStatus, serverWorkers: authenticatedWorkers, livePoolBalance: livePoolBalance });
    } catch (error: any) {
        return json({ success: false, error: 'Internal Server Error' }, { status: 500 });
    }
}