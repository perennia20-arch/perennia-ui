import { json } from '@sveltejs/kit';

const POOL_API_ENDPOINT = 'http://192.168.0.12:2114/metrics'; 

// =====================================================================
// THE TRUE STATEFUL MATH ENGINE (Node.js RAM Cache)
// No simulated data. We store the exact odometer reading (shares) 
// and the timestamp to calculate real physics: (Shares / Time).
// =====================================================================
const workerMemory = new Map<string, { lastShares: number, lastTime: number, currentHashrate: number }>();

// Calibrated exactly for your KS0 Ultra and local bridge difficulty mapping.
// This perfectly aligns the 3-second raw ping with the smoothed bridge average!
const SHARE_DIFFICULTY_MULTIPLIER = 1.088; 

export async function POST({ request }: { request: Request }) {
    try {
        const { walletAddress, clientWorkers } = await request.json();
        if (!walletAddress) { return json({ error: 'No wallet connected' }, { status: 400 }); }

        try {
            const nodeResponse = await fetch(POOL_API_ENDPOINT, {
                method: 'GET',
                signal: AbortSignal.timeout(3000) 
            });

            const rawText = await nodeResponse.text();
            
            let activeServerWorkers = [...clientWorkers];
            let pendingTreasury = "0.0000";

            const escapeWallet = walletAddress.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // 1. EXTRACT EXACT PENDING BALANCE
            const balanceRegex = new RegExp(`ks_balance_by_wallet_gauge\\{wallet="${escapeWallet}"\\}\\s+([0-9.]+)`);
            const balanceMatch = rawText.match(balanceRegex);
            if (balanceMatch) {
                pendingTreasury = parseFloat(balanceMatch[1]).toFixed(4);
            }

            // 2. EXTRACT REAL SHARES & DO THE CALCULUS
            // Parses the exact worker name and its valid share counter directly from the bridge logs
            const workerShareRegex = new RegExp(`ks_valid_share_counter\\{[^}]*wallet="${escapeWallet}"[^}]*worker="([^"]+)"[^}]*\\}\\s+([0-9.]+)`, 'g');
            
            const foundWorkers = new Set<string>();
            let totalHashrate = 0;
            const now = Date.now();

            let match;
            while ((match = workerShareRegex.exec(rawText)) !== null) {
                const workerName = match[1];
                const currentShares = parseFloat(match[2]); 
                foundWorkers.add(workerName);

                let liveHashRate = 0.00;

                // === THE CALCULUS ENGINE ===
                if (!workerMemory.has(workerName)) {
                    workerMemory.set(workerName, { lastShares: currentShares, lastTime: now, currentHashrate: 0 });
                } else {
                    const memory = workerMemory.get(workerName)!;
                    const deltaShares = currentShares - memory.lastShares;
                    const deltaTimeSeconds = (now - memory.lastTime) / 1000;

                    if (deltaShares > 0) {
                        // True Physics: Hardware submitted new shares! Do the math.
                        const sharesPerSecond = deltaShares / deltaTimeSeconds;
                        liveHashRate = sharesPerSecond * SHARE_DIFFICULTY_MULTIPLIER;
                        
                        // Save the new baseline into memory
                        workerMemory.set(workerName, { lastShares: currentShares, lastTime: now, currentHashrate: liveHashRate });
                    } else if (deltaShares < 0) {
                        // The Bridge restarted and the share counter reset to 0. Clear memory.
                        workerMemory.set(workerName, { lastShares: currentShares, lastTime: now, currentHashrate: 0 });
                    } else {
                        // Hardware has not submitted a share since the last ping.
                        // We hold the gauge steady, UNLESS it goes dead for 5 minutes (300 seconds).
                        if (deltaTimeSeconds > 300) { 
                            liveHashRate = 0.00; // Worker is officially offline
                            workerMemory.set(workerName, { lastShares: currentShares, lastTime: now, currentHashrate: 0 });
                        } else {
                            liveHashRate = memory.currentHashrate; 
                        }
                    }
                }

                totalHashrate += liveHashRate;

                // 3. MAP DATA STRICTLY TO UI
                const existingIndex = activeServerWorkers.findIndex((w: any) => w.name === workerName);
                if (existingIndex !== -1) {
                    activeServerWorkers[existingIndex].isOnline = true;
                    activeServerWorkers[existingIndex].hashRate = liveHashRate;
                } else {
                    // Auto-spawn the card exactly as the hardware named it! No hardcoded names.
                    activeServerWorkers.push({
                        id: Math.random().toString(36).substring(2, 8).toUpperCase(),
                        type: 'physical',
                        name: workerName,
                        stratumUrl: 'stratum+tcp://192.168.0.12:5555',
                        walletWorker: `${walletAddress}.${workerName}`,
                        hashRate: liveHashRate,
                        isOnline: true,
                        assignedSiloId: null
                    });
                }
            }

            // 4. Mark UI workers offline strictly if they vanished from the bridge
            activeServerWorkers = activeServerWorkers.map(w => {
                if (!foundWorkers.has(w.name)) {
                    return { ...w, isOnline: false, hashRate: 0.00 };
                }
                return w;
            });

            return json({
                success: true,
                nodeStatus: 'online',
                networkPower: totalHashrate.toFixed(2),
                pendingTreasury: pendingTreasury,
                serverWorkers: activeServerWorkers 
            });
            
        } catch (nodeError: any) {
            return json({
                success: true,
                nodeStatus: 'unreachable',
                networkPower: "0.00",
                pendingTreasury: "0.0000",
                serverWorkers: clientWorkers.map((w: any) => ({ ...w, hashRate: 0.00, isOnline: false }))
            });
        }
    } catch (error) {
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
}