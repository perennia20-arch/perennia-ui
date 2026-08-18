<script lang="ts">
    import { source } from 'sveltekit-sse';
    import { dispatchStateAction, workers, sectors, systemMode, adminModeActive, adminTargetWallet, coreTokenRegistry, ClassThemes, globalKasPrice, globalKasChange, globalNetworkHashrate, globalNodeStatus, walletInventory, type Worker, type Sector, type RouteMode, type SettlementConfig, type TokenAsset, type AssetClass } from '$lib/stores/app';
    import { isWalletConnected, walletAddress, walletBalance, DEV_ADMIN_BYPASS, MASTER_ADMIN_ADDRESS, sovereignKeys } from '$lib/stores/wallet';
    import { fade, slide, fly } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { get } from 'svelte/store';
    import { browser } from '$app/environment';

    type ViewSector = Sector & { width?: number; pendingKaspa?: number };

    let lastMutationTime = 0;
    function markMutation() { lastMutationTime = Date.now(); }

    const isCorporateAdmin = $derived(DEV_ADMIN_BYPASS || ($walletAddress && $walletAddress.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase()));
    const resolveTargetWallet = () => (isCorporateAdmin && $adminModeActive && $adminTargetWallet) ? $adminTargetWallet : $walletAddress;

    async function safeDispatch(action: string, payload: any) {
        markMutation();
        const tw = resolveTargetWallet();
        await dispatchStateAction(action, payload, tw ?? undefined);
        markMutation(); 
    }

    let syntheticBalances = $state<Record<string, number>>({});
    let displayedWorkers = $derived($workers);

    let activeWorkerMenu = $state<string | null>(null);

    let localHashrate = $derived(displayedWorkers.reduce((acc, w) => acc + (w.hashRate || 0), 0));
    let displayHashrate = $derived(localHashrate);
    let totalShares = $derived(displayedWorkers.reduce((acc, w) => acc + (w.sharesContributed || 0), 0));

    let allocatedPercentage = $derived($sectors.reduce((acc, s) => acc + (s.allocationPercentage || 0), 0));
    let unallocatedPercentage = $derived(Math.max(0, 100.0 - allocatedPercentage));

    let siloSectors = $derived($sectors.filter(s => s.routeMode !== 'auto-lp'));
    let plantSectors = $derived($sectors.filter(s => s.routeMode === 'auto-lp'));

    let dragSectorId = $state<string | null>(null);
    let dropTargetSectorId = $state<string | null>(null);

    // ============================================================================
    // MANUAL WORKER / RIG MANAGEMENT
    // ============================================================================
    async function createManualWorker() {
        if (!$isWalletConnected || !$walletAddress) {
            alert("Please connect your wallet to provision hardware.");
            return;
        }

        const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const defaultName = `RIG-${randomSuffix}`;

        const cleanWallet = $walletAddress.replace(/kaspa:/i, '').trim();
        const newWorker: Worker = {
            id: Math.random().toString(36).substring(2, 8).toUpperCase(),
            type: 'physical',
            name: defaultName,
            stratumUrl: 'stratum+tcp://pool.perennia.io:5552',
            walletWorker: `${cleanWallet}.${defaultName}`,
            hashRate: 0,
            isOnline: false,
            hardwareType: 'Awaiting Connection',
            sharesContributed: 0,
            blocksFound: 0
        };

        workers.update(w => [...w, newWorker]);
        await safeDispatch('ADD_WORKER', newWorker);
    }

    async function renameWorkerAction(worker: Worker) {
        activeWorkerMenu = null;
        const newName = prompt("Rename this worker (This updates the expected Stratum username):", worker.name);
        if (newName && newName.trim() !== '' && newName.trim() !== worker.name) {
            const cleanWallet = $walletAddress?.replace(/kaspa:/i, '').trim();
            const newWalletWorker = `${cleanWallet}.${newName.trim()}`;
            
            workers.update(arr => arr.map(w => 
                w.id === worker.id ? { ...w, name: newName.trim(), walletWorker: newWalletWorker } : w
            ));
            await safeDispatch('RENAME_WORKER', { id: worker.id, name: newName.trim(), walletWorker: newWalletWorker });
        }
    }

    async function deleteWorkerAction(id: string) {
        activeWorkerMenu = null;
        if (confirm("Remove this worker from tracking? It will reappear automatically if the physical hardware is still hashing.")) {
            workers.update(arr => arr.filter(w => w.id !== id));
            await safeDispatch('DELETE_WORKER', { id });
        }
    }

    function copyStratum(worker: Worker) {
        activeWorkerMenu = null;
        const cleanWallet = $walletAddress?.replace(/kaspa:/i, '').trim() || 'YOUR_WALLET';
        const connectionString = `URL: ${worker.stratumUrl}\nUser: kaspa:${cleanWallet}.${worker.name}\nPass: x`;
        navigator.clipboard.writeText(connectionString);
        alert("Stratum connection configuration copied to clipboard!");
    }


    // ============================================================================
    // SECTOR MANAGEMENT
    // ============================================================================
    function handleSectorDragStart(e: DragEvent, sector: Sector) {
        dragSectorId = sector.id;
        if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', sector.id);
        }
    }

    function handleSectorDragEnd() {
        dragSectorId = null;
        dropTargetSectorId = null;
    }

    function handleSectorDragOver(e: DragEvent, id: string) {
        e.preventDefault(); 
        dropTargetSectorId = id;
    }

    function handleSectorDragLeave() {
        dropTargetSectorId = null;
    }

    async function handleSectorDrop(e: DragEvent, targetId: string) {
        e.preventDefault();
        const sourceId = dragSectorId;
        dragSectorId = null;
        dropTargetSectorId = null;

        if (!sourceId || sourceId === targetId) return;

        let newArray = [...$sectors];
        const sourceIdx = newArray.findIndex(s => s.id === sourceId);
        const targetIdx = newArray.findIndex(s => s.id === targetId);

        if (sourceIdx !== -1 && targetIdx !== -1) {
            const [moved] = newArray.splice(sourceIdx, 1);
            newArray.splice(targetIdx, 0, moved);
            sectors.set(newArray);
            await safeDispatch('REORDER_SECTORS', newArray);
        }
    }

    async function toggleSectorWidth(id: string) { 
        sectors.update(arr => arr.map(s => { 
            if (s.id === id) { 
                const currentWidth = (s as any).width || 6;
                const newWidth = currentWidth === 6 ? 12 : 6; 
                return { ...s, width: newWidth }; 
            } 
            return s; 
        })); 
        await safeDispatch('REORDER_SECTORS', get(sectors)); 
    }

    let isSectorModalOpen = $state(false);
    let draftSectorName = $state('');
    let draftSectorPct = $state(0);
    let draftSectorMax = $state(0);
    let draftSectorType = $state<'silo' | 'plant'>('silo');
    let assetPickerTarget = $state<'create' | 'edit'>('create');
    let isAssetPickerOpen = $state(false);
    let assetSearchQuery = $state('');
    let dynamicTreasuryTokens = $state<TokenAsset[]>([]);

    const defaultSettlement: SettlementConfig = { 
        targetAsset: coreTokenRegistry[0], 
        payoutAddress: '', 
        autoPayout: true, 
        mode: 'stream', 
        threshold: 10.0, 
        streamMode: 'realtime', 
        streamValue: 1, 
        streamUnit: 'hours', 
        appointmentDate: '', 
        appointmentTime: '17:00' 
    };

    let draftSettlementConfig = $state<SettlementConfig>({ ...defaultSettlement });
    let settlementModalSilo = $state<Sector | null>(null);
    let editSectorName = $state('');
    let editSettlementParams = $state<SettlementConfig>({ ...defaultSettlement });

    function updateDraftPct(valStr: string) {
        let val = parseFloat(valStr);
        if (isNaN(val)) val = 0;
        if (val > draftSectorMax) val = draftSectorMax;
        draftSectorPct = parseFloat(val.toFixed(1));
    }

    function updateDraftHash(valStr: string) {
        let val = parseFloat(valStr);
        if (isNaN(val)) val = 0;
        const maxHash = displayHashrate * (draftSectorMax / 100);
        if (val > maxHash) val = maxHash;
        draftSectorPct = parseFloat(((val / (displayHashrate || 1)) * 100).toFixed(1));
    }

    function handleSectorInputPct(id: string, valStr: string) {
        markMutation(); 
        let val = parseFloat(valStr);
        if (isNaN(val)) val = 0;
        sectors.update(arr => arr.map(s => {
            if (s.id === id) {
                const max = s.allocationPercentage + unallocatedPercentage;
                const cleanVal = parseFloat(Math.min(val, max).toFixed(1));
                return { ...s, allocationPercentage: cleanVal };
            }
            return s;
        }));
    }

    function handleSectorInputHash(id: string, hashStr: string) {
        markMutation(); 
        let hashVal = parseFloat(hashStr);
        if (isNaN(hashVal)) hashVal = 0;
        sectors.update(arr => arr.map(s => {
            if (s.id === id) {
                const maxPct = s.allocationPercentage + unallocatedPercentage;
                const maxHash = displayHashrate * (maxPct / 100);
                const cleanHash = Math.min(hashVal, maxHash);
                const pct = parseFloat(((cleanHash / (displayHashrate || 1)) * 100).toFixed(1));
                return { ...s, allocationPercentage: pct };
            }
            return s;
        }));
    }

    function handleSectorSliderInput(id: string, e: Event) {
        markMutation(); 
        const input = e.target as HTMLInputElement;
        let val = parseFloat(input.value);
        if (isNaN(val)) val = 0;

        sectors.update(arr => {
            const currentSector = arr.find(s => s.id === id);
            if (!currentSector) return arr;

            const otherAllocated = arr.reduce((acc, s) => s.id === id ? acc : acc + s.allocationPercentage, 0);
            const absoluteMax = parseFloat((100.0 - otherAllocated).toFixed(1));

            let cleanVal = parseFloat(Math.min(val, absoluteMax).toFixed(1));

            if (val > absoluteMax) {
                input.value = cleanVal.toString();
            }

            return arr.map(s => s.id === id ? { ...s, allocationPercentage: cleanVal } : s);
        });
    }

    async function handleSectorSliderChange(id: string, e: Event) {
        commitSectorUpdate(id);
    }

    async function commitSectorUpdate(id: string) {
        const sector = $sectors.find(s => s.id === id);
        if (sector) {
            await safeDispatch('UPDATE_SECTOR_ALLOCATION', { id, allocationPercentage: sector.allocationPercentage });
        }
    }

    function syncTreasuryTokens() {
        if (!browser || !$walletAddress) return;
        try {
            const lsData = localStorage.getItem(`p_custom_tokens_${$walletAddress}`);
            if (lsData) {
                const parsed = JSON.parse(lsData);
                const customTokensObj = parsed.userCustomTokens || {};
                let extractedTokens: TokenAsset[] = [];

                for (const network in customTokensObj) {
                    const tokensArray = customTokensObj[network];
                    if (Array.isArray(tokensArray)) {
                        tokensArray.forEach((t: any) => {
                            extractedTokens.push({
                                ticker: t.symbol,
                                name: t.name || `${t.symbol} Token`,
                                assetClass: (t.badge || 'Ecosystem') as AssetClass,
                                priceUsd: t.price || 0,
                                imgUrl: t.imgUrl || (network === 'KAS' ? `https://storage.googleapis.com/kasfyi/token-icons/${t.symbol.toLowerCase()}.png` : undefined),
                                icon: t.icon,
                                theme: { hex: t.hex || ClassThemes['Ecosystem'].hex, pastel: ClassThemes['Ecosystem'].pastel }
                            });
                        });
                    }
                }
                
                dynamicTreasuryTokens = extractedTokens;
            }
        } catch (e) {
            console.error("Failed to sync tokens from Treasury storage:", e);
        }
    }

    let allSettlementAssets = $derived.by(() => {
        const map = new Map<string, TokenAsset>();
        for (const asset of coreTokenRegistry) {
            map.set(asset.ticker.toUpperCase(), asset);
        }
        for (const dyn of dynamicTreasuryTokens) {
            if (!map.has(dyn.ticker.toUpperCase())) {
                map.set(dyn.ticker.toUpperCase(), dyn);
            }
        }
        return Array.from(map.values());
    });

    let filteredAssets = $derived(
        allSettlementAssets.filter(a => 
            a.ticker.toLowerCase().includes(assetSearchQuery.toLowerCase()) || 
            a.name.toLowerCase().includes(assetSearchQuery.toLowerCase())
        )
    );

    function openSectorModal() {
        if (unallocatedPercentage <= 0) return;
        syncTreasuryTokens();
        draftSectorPct = parseFloat(unallocatedPercentage.toFixed(1));
        draftSectorMax = parseFloat(unallocatedPercentage.toFixed(1));
        draftSectorType = 'silo';
        const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
        draftSectorName = `SILO-${randomHex}`;
        draftSettlementConfig = {
            ...defaultSettlement,
            payoutAddress: $walletAddress || '',
            targetAsset: coreTokenRegistry.find(t => t.ticker === 'KAS') || coreTokenRegistry[0]
        };
        isSectorModalOpen = true;
    }

    async function createSector() {
        if (draftSectorPct <= 0 || draftSectorPct > draftSectorMax) return;

        const id = Math.random().toString(36).substring(2, 8).toUpperCase();
        const fallbackName = `${draftSectorType === 'plant' ? 'Plant' : 'Silo'}-${id.substring(0,4)}`;
        const finalName = draftSectorName.trim() || fallbackName;

        let routeMode: RouteMode = 'hold';
        if (draftSectorType === 'plant') {
            routeMode = 'auto-lp';
        } else {
            routeMode = draftSettlementConfig.targetAsset.ticker === 'KAS' ? 'hold' : 'swap';
        }

        const newSector: Sector = {
            id,
            name: finalName,
            allocationPercentage: draftSectorPct,
            routeMode,
            settlementConfig: JSON.parse(JSON.stringify(draftSettlementConfig)),
            pendingKaspa: 0,
            width: 6
        } as any;

        sectors.update(secs => [...secs, newSector]);
        await safeDispatch('ADD_SECTOR', newSector);
        isSectorModalOpen = false;
    }

    async function deleteSector(id: string) {
        sectors.update(secs => secs.filter(s => s.id !== id));
        await safeDispatch('DELETE_SECTOR', { id });
    }

    async function renameSector(id: string) {
        const sectorIndex = $sectors.findIndex(s => s.id === id);
        if (sectorIndex !== -1) {
            const currentName = $sectors[sectorIndex].name;
            const newName = prompt("Enter new Sector name:", currentName);
            if (newName && newName.trim() !== "") {
                sectors.update(arr => arr.map(s => s.id === id ? { ...s, name: newName.trim() } : s));
                await safeDispatch('RENAME_SECTOR', { id, name: newName.trim() });
            }
        }
    }

    function openSettlement(sector: Sector) { 
        syncTreasuryTokens();
        settlementModalSilo = sector; 
        editSectorName = sector.name;

        const safeConfig = sector.settlementConfig || { ...defaultSettlement, payoutAddress: $walletAddress || '' };
        if (!safeConfig.targetAsset) safeConfig.targetAsset = coreTokenRegistry[0]; 

        editSettlementParams = JSON.parse(JSON.stringify(safeConfig)); 
        assetPickerTarget = 'edit';
        isAssetPickerOpen = false; 
        assetSearchQuery = ''; 
    }

    let isSigningSettlement = $state(false);
    async function saveSettlementParams() { 
        if (settlementModalSilo) { 
            isSigningSettlement = true;
            try {
                const trimmedName = editSectorName.trim();
                const nameChanged = trimmedName !== '' && trimmedName !== settlementModalSilo.name;
                const activeSiloId = settlementModalSilo.id;

                const paramsChanged = JSON.stringify(editSettlementParams) !== JSON.stringify(settlementModalSilo.settlementConfig);

                if (paramsChanged) {
                    const savedType = typeof window !== 'undefined' ? sessionStorage.getItem('perennia_active_wallet_type') : null;
                    if (savedType === 'sovereign') {
                        const pass = prompt(`Sovereign Vault Locked.\nEnter local cipher to secure parameters for ${settlementModalSilo.name}:`);
                        if (!pass) throw new Error("Signature Denied");
                    }
                }

                sectors.update(secs => secs.map(s => { 
                    if (s.id === activeSiloId) {
                        const isLp = s.routeMode === 'auto-lp';
                        const newRouteMode = isLp 
                            ? 'auto-lp' 
                            : (editSettlementParams.targetAsset.ticker === 'KAS' ? 'hold' : 'swap');

                        return { 
                            ...s, 
                            name: nameChanged ? trimmedName : s.name,
                            settlementConfig: editSettlementParams,
                            routeMode: newRouteMode as RouteMode
                        }; 
                    }
                    return s; 
                }));

                if (nameChanged) {
                    await safeDispatch('RENAME_SECTOR', { id: activeSiloId, name: trimmedName });
                }

                if (paramsChanged) {
                    await safeDispatch('UPDATE_SETTLEMENT', { id: activeSiloId, config: editSettlementParams });
                }

            } catch (e) {
                alert("Signature Request Rejected. Parameters not saved.");
                return;
            } finally {
                isSigningSettlement = false;
                settlementModalSilo = null; 
                editSettlementParams = { ...defaultSettlement }; 
            }
        } 
    }

    let totalTreasuryValueUsd = $derived.by(() => {
        let kasBal = parseFloat($walletBalance) || 0;
        let kasPrice = $globalKasPrice || 0.025;
        let total = kasBal * kasPrice;

        for (const [ticker, bal] of Object.entries(syntheticBalances)) {
            if (ticker.toUpperCase() === 'KAS' || ticker.toUpperCase() === 'KASPA') continue;
            const asset = allSettlementAssets.find(t => t.ticker.toUpperCase() === ticker.toUpperCase());
            const price = asset ? asset.priceUsd : 0;
            total += (bal * price);
        }
        return total;
    });

    let effortData = $derived.by(() => {
        let segments: Array<{ id: string, name: string, pct: number, offset: number, hex: string }> = [];
        let totalHash = displayHashrate;

        if (totalHash > 0) {
            let currentOffset = 0;
            $sectors.forEach(sec => {
                if (sec.allocationPercentage > 0) {
                    const pct = sec.allocationPercentage;
                    const hex = sec.settlementConfig?.targetAsset?.theme?.hex || '#18C6A5';

                    segments.push({ id: sec.id, name: sec.name, pct, offset: currentOffset, hex });
                    currentOffset += pct;
                }
            });
        }
        return { segments, totalHash };
    });

    function formatHardwareName(rawType: string | undefined): string {
        if (!rawType) return 'PHYSICAL';
        if (rawType.includes('IceRiverMiner-v1.1')) return 'IceRiver KS0 Ultra';
        if (rawType.includes('IceRiverMiner-v7')) return 'IceRiver KS7 Lite';
        if (rawType.includes('IceRiver')) return rawType.replace('IceRiverMiner-', 'IceRiver KS');
        if (rawType.includes('Goldshell')) return rawType.replace('GoldshellMiner-', 'Goldshell KS');
        if (rawType === 'Awaiting Connection') return rawType;
        return rawType.replace('Miner-', ' ').substring(0, 18);
    }

    async function fetchSyntheticLedger() {
        if (!$isWalletConnected || !$walletAddress) return;
        try {
            const res = await fetch(`/api/user/ledger?wallet=${encodeURIComponent($walletAddress)}`);
            if (res.ok) syntheticBalances = await res.json() || {};
        } catch (e) {}
    }

    $effect(() => {
        if ($isWalletConnected && $walletAddress) fetchSyntheticLedger();
    });

    // We no longer rely exclusively on the generic loadStateFromServer, the SSE connection 
    // strictly updates the data from the reliable source.
    $effect(() => {
        if (browser && $isWalletConnected && $walletAddress) {
            const connection = source(`/api/telemetry?address=${encodeURIComponent($walletAddress)}`);
            const unsubscribe = connection.select('message').subscribe((rawData) => {
                if (!rawData) return;
                try {
                    const parsed = JSON.parse(rawData);
                    if (parsed.error) return;

                    const targetUserWallet = resolveTargetWallet();
                    
                    const cleanTarget = (targetUserWallet || '').replace(/kaspa:/i, '').toLowerCase().trim();
                    const incWallet = (parsed.wallet || '').replace(/kaspa:/i, '').toLowerCase().trim();

                    if (parsed.layout_state_update) {
                        if (Date.now() - lastMutationTime < 4000) return; 
                        if (incWallet === cleanTarget) {
                            workers.set(parsed.state.workers || []);
                            sectors.set(parsed.state.sectors || []);
                            if (parsed.state.systemMode) systemMode.set(parsed.state.systemMode);
                        }
                        return;
                    }

                    if (parsed.yield_update) {
                        if (incWallet === cleanTarget) {
                            sectors.update(currentSecs => {
                                let changed = false;
                                const newSecs = currentSecs.map(s => {
                                    const update = parsed.sectors?.find((u: any) => u.id === s.id);
                                    if (update && (s as any).pendingKaspa !== update.pendingKaspa) {
                                        changed = true;
                                        return { ...s, pendingKaspa: update.pendingKaspa } as Sector;
                                    }
                                    return s;
                                });
                                return changed ? newSecs : currentSecs;
                            });
                        }
                        return;
                    }

                    processTelemetryData(parsed);
                } catch(e) { 
                    console.error("Telemetry Parse/Stream Failed:", e);
                    globalNodeStatus.set('unreachable'); 
                }
            });

            return () => { unsubscribe(); connection.close(); };
        }
    });

    function processTelemetryData(data: any) {
        const isConnected = get(isWalletConnected);
        globalNetworkHashrate.set((data.pool?.totalHashrate || data.totalHashrate || 0) / 1e12);
        globalNodeStatus.set('online');

        if (!isConnected) return;

        workers.update(currentWorkers => {
            let nextWorkers = [...currentWorkers];
            let autoDiscovered = false;

            (data.workers || []).forEach((bw: any) => {
                const rawIdentity = bw.walletAddress || bw.fullIdentity || '';
                const bBase = rawIdentity.split('.')[0].replace(/kaspa:/i, '').toLowerCase().trim();
                const bName = bw.name || rawIdentity.split('.')[1] || 'Rig';

                const existingIdx = nextWorkers.findIndex(w => {
                    const wIdentity = w.walletWorker || '';
                    const wBase = wIdentity.split('.')[0].replace(/kaspa:/i, '').toLowerCase().trim();
                    return (wIdentity.toLowerCase() === (bw.fullIdentity || '').toLowerCase()) ||
                           (w.name?.toLowerCase() === bName.toLowerCase() && (wBase === bBase || wBase === 'pending' || wBase === ''));
                });

                const rawHash = bw.trackingRate || bw.hashrate || bw.hashRate || 0;

                if (existingIdx !== -1) {
                    nextWorkers[existingIdx] = { 
                        ...nextWorkers[existingIdx], 
                        hashRate: rawHash / 1e12,
                        sharesContributed: bw.sharesContributed || bw.shares || 0,
                        blocksFound: bw.blocksFound || bw.blocks || 0,
                        hardwareType: bw.hardwareType || nextWorkers[existingIdx].hardwareType || 'IceRiver KS',
                        isOnline: true 
                    } as any; 
                } else {
                    const newWorker: Worker = {
                        id: Math.random().toString(36).substring(2, 8).toUpperCase(),
                        type: 'physical',
                        name: bName,
                        stratumUrl: 'stratum+tcp://pool.perennia.io:5552',
                        walletWorker: bw.fullIdentity || `${bBase}.${bName}`,
                        hashRate: rawHash / 1e12,
                        isOnline: true,
                        hardwareType: bw.hardwareType || 'IceRiver KS',
                        sharesContributed: bw.sharesContributed || bw.shares || 0,
                        blocksFound: bw.blocksFound || bw.blocks || 0
                    };
                    nextWorkers.push(newWorker);
                    autoDiscovered = true;

                    setTimeout(() => safeDispatch('ADD_WORKER', newWorker), 100);
                }
            });

            return nextWorkers.map(w => {
                const wIdent = (w.walletWorker || '').toLowerCase();
                const isInTelemetry = (data.workers || []).some((b: any) => {
                    const bIdent = (b.fullIdentity || '').toLowerCase();
                    return bIdent === wIdent || (b.name && w.name && b.name.toLowerCase() === w.name.toLowerCase());
                });
                if (!isInTelemetry) return { ...w, hashRate: 0, isOnline: false };
                return w;
            });
        });
    }

    let displayHashHistory = $state<number[]>([]);
    let kasHistory = $state<number[]>([]);
    let unsubs: any[] = [];
    let omniChainInterval: ReturnType<typeof setInterval>;

    function handleTokenIconError(e: Event, symbol: string) {
        const target = e.currentTarget as HTMLImageElement;
        if (!target.dataset.triedJpg) {
            target.dataset.triedJpg = 'true';
            target.src = `https://storage.googleapis.com/kasfyi/token-icons/${symbol}.jpg`;
        } else {
            target.style.display = 'none';
            if (target.nextElementSibling) {
                (target.nextElementSibling as HTMLElement).style.display = 'inline';
            }
        }
    }

    async function fetchOmniChainInventory() {
        if (!$isWalletConnected || !$walletAddress) return;

        try {
            const params = new URLSearchParams({
                kas: $sovereignKeys?.kaspa?.address || $walletAddress,
                btc: $sovereignKeys?.bitcoin?.address || '',
                eth: $sovereignKeys?.ethereum?.address || '',
                sol: $sovereignKeys?.solana?.address || ''
            });

            const res = await fetch(`/api/treasury/corporate?${params.toString()}`);

            if (res.ok) {
                const estate = await res.json();

                walletInventory.update(currentInv => {
                    let newInv = [...currentInv];

                    estate.assets.forEach((onChainAsset: any) => {
                        const template = coreTokenRegistry.find(t => t.ticker === onChainAsset.symbol);

                        if (template && onChainAsset.balance !== undefined && onChainAsset.address !== 'Awaiting Decryption') {
                            const existingIdx = newInv.findIndex(i => i.asset.ticker === onChainAsset.symbol);
                            const usdValue = onChainAsset.balance * template.priceUsd;

                            const updatedItem = {
                                asset: template,
                                balance: onChainAsset.balance,
                                usdValue: usdValue
                            };

                            if (existingIdx !== -1) {
                                newInv[existingIdx] = updatedItem;
                            } else {
                                newInv.push(updatedItem);
                            }
                        }
                    });

                    return newInv;
                });
            }
        } catch (e) {
            console.error("Omni-Chain Matrix Fetch Fault:", e);
        }
    }

    onMount(() => { 
        syncTreasuryTokens();
        kasHistory = Array(30).fill(get(globalKasPrice));
        unsubs.push(globalKasPrice.subscribe(v => { kasHistory = [...kasHistory.slice(1), v]; }));
        
        fetchOmniChainInventory(); 
        omniChainInterval = setInterval(fetchOmniChainInventory, 15000); 
    });

    onDestroy(() => { 
        unsubs.forEach(u => u()); 
        if (omniChainInterval) clearInterval(omniChainInterval); 
    });

    $effect(() => {
        const timer = setInterval(() => {
            if (browser && $isWalletConnected) {
                displayHashHistory = [...displayHashHistory.slice(1), displayHashrate];
            }
        }, 1000);
        return () => clearInterval(timer);
    });

    function buildSvgPath(data: number[], width: number, height: number, groundZero: boolean = true): string {
        if (!data || data.length === 0) return '';
        const validData = data.filter(v => v !== 0);
        const max = validData.length > 0 ? Math.max(...validData) * 1.2 : 1; 
        const min = groundZero ? 0 : (validData.length > 0 ? Math.min(...validData) * 0.95 : 0);
        const range = max - min || 1;
        return data.map((d, i) => { const x = (i / (Math.max(1, data.length - 1))) * width; const y = d === 0 ? height : height - ((d - min) / range) * height; return `${i === 0 ? 'M' : 'L'} ${x},${y}`; }).join(' ');
    }

    let hashratePath = $derived(buildSvgPath(displayHashHistory, 200, 240, true)); 
    let pricePath = $derived(buildSvgPath(kasHistory, 200, 240, false)); 

</script>

{#if activeWorkerMenu !== null}
    <div role="button" tabindex="0" aria-label="Close menu" class="fixed inset-0 z-40 cursor-default border-none" onclick={() => activeWorkerMenu = null} onkeydown={(e) => e.key === 'Escape' && (activeWorkerMenu = null)}></div>
{/if}

{#snippet sectorCard(sector: ViewSector)}
    {@const isLp = sector.routeMode === 'auto-lp'}
    {@const hex = sector.settlementConfig?.targetAsset?.theme?.hex || '#18C6A5'}
    {@const mappedHash = displayHashrate * (sector.allocationPercentage / 100)}
    {@const isDragged = dragSectorId === sector.id}
    {@const isDropTarget = dropTargetSectorId === sector.id}
    {@const spanClass = (sector.width || 6) === 12 ? 'md:col-span-12' : 'md:col-span-6'}

    <div draggable="true"
         ondragstart={(e) => handleSectorDragStart(e, sector)}
         ondragend={handleSectorDragEnd}
         ondragover={(e) => handleSectorDragOver(e, sector.id)}
         ondragleave={handleSectorDragLeave}
         ondrop={(e) => handleSectorDrop(e, sector.id)}
         class="bg-[#0c0c0c] rounded-[20px] p-5 flex flex-col gap-4 relative transition-all duration-300 cursor-grab active:cursor-grabbing {spanClass} {isDragged ? 'opacity-50 scale-95' : ''} {isDropTarget ? 'scale-[1.02] brightness-125' : ''}"
         style="border: 1px solid {hex}40; box-shadow: 0 8px 32px -8px {hex}30, inset 0 0 16px -8px {hex}20;">

        <div class="flex justify-between items-start">
            <div class="flex flex-col">
                <span class="text-[9px] uppercase tracking-widest font-bold text-neutral-500 mb-0.5">
                    {sector.routeMode === 'auto-lp' ? 'Liquidity Plant (Auto-LP)' : 'Settlement Silo'}
                </span>
                <button onmousedown={(e) => e.stopPropagation()} onclick={() => renameSector(sector.id)} class="text-lg font-bold uppercase text-neutral-200 tracking-widest truncate max-w-[150px] text-left hover:text-white transition-colors cursor-text" title="Rename Sector">
                    {sector.name}
                </button>
            </div>
            <div class="flex flex-col items-end">
                <div class="flex items-center gap-1 mb-1">
                    <button onmousedown={(e) => e.stopPropagation()} onclick={() => toggleSectorWidth(sector.id)} class="text-neutral-400 hover:text-white transition-colors cursor-pointer w-6 h-6 flex items-center justify-center bg-[#111] hover:bg-[#222] border border-neutral-800 hover:border-neutral-600 rounded-lg" title="Toggle Size">
                        <span class="font-bold tracking-widest text-[10px]">[ ]</span>
                    </button>
                    <button onmousedown={(e) => e.stopPropagation()} onclick={() => openSettlement(sector)} class="text-neutral-400 hover:text-white transition-colors cursor-pointer w-6 h-6 flex items-center justify-center bg-[#111] hover:bg-[#222] border border-neutral-800 hover:border-neutral-600 rounded-full" title="Configure Parameters">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c-.94-1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    </button>
                    <button onmousedown={(e) => e.stopPropagation()} onclick={() => deleteSector(sector.id)} class="text-neutral-600 hover:text-red-500 transition-colors cursor-pointer w-6 h-6 flex items-center justify-center bg-[#111] hover:bg-red-950/30 border border-neutral-800 hover:border-red-900/50 rounded-full" title="Dismantle Sector">✕</button>
                </div>
                <span class="text-[10px] font-mono text-amber-500 font-bold mt-1">{(sector.pendingKaspa || 0).toFixed(4)} KAS</span>
            </div>
        </div>

        <div class="flex items-center justify-between bg-[#111] p-3 rounded-xl border border-neutral-800 shadow-inner">
            <div class="flex items-center gap-3">
                {#if isLp}
                    <div class="flex -space-x-2">
                        <div class="w-6 h-6 rounded-full border border-neutral-800 bg-[#050505] flex items-center justify-center text-[8px] font-black text-[#18C6A5]">K</div>
                        <div class="w-6 h-6 rounded-full border border-neutral-800 bg-[#050505] flex items-center justify-center text-[8px] font-black text-blue-400">{sector.settlementConfig?.targetAsset?.ticker?.[0] || 'U'}</div>
                    </div>
                    <span class="text-xs font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#18C6A5] to-[#3B82F6] tracking-widest">KAS / {sector.settlementConfig?.targetAsset?.ticker || 'USDC'}</span>
                {:else}
                    <div class="w-6 h-6 rounded-full border border-neutral-800 bg-[#050505] flex items-center justify-center text-[10px] font-black overflow-hidden" style={`color: ${hex};`}>
                        {#if sector.settlementConfig?.targetAsset?.imgUrl}
                            <img src={sector.settlementConfig.targetAsset.imgUrl} class="w-4 h-4 object-contain" alt="logo" onerror={(e) => handleTokenIconError(e, sector.settlementConfig.targetAsset.ticker)} />
                            <span style="display:none;" class="text-xs font-black">{sector.settlementConfig.targetAsset.ticker[0]}</span>
                        {:else}
                            {sector.settlementConfig?.targetAsset?.ticker?.[0] || 'K'}
                        {/if}
                    </div>
                    <span class="text-xs font-bold tracking-widest" style={`color: ${hex};`}>{sector.settlementConfig?.targetAsset?.ticker || 'KAS'}</span>
                {/if}
            </div>
            <div class="flex flex-col items-end">
                <span class="text-[8px] uppercase tracking-widest font-bold text-neutral-500">Mode</span>
                <span class="text-[10px] font-mono font-bold uppercase" style={`color: ${hex};`}>
                    {sector.settlementConfig?.mode || 'stream'}
                </span>
            </div>
        </div>

        <div class="mt-2 flex flex-col gap-2"
             draggable="true"
             ondragstart={(e) => { e.preventDefault(); e.stopPropagation(); }}
             onmousedown={(e) => e.stopPropagation()}>

            <div class="flex justify-between text-[11px] font-mono font-bold items-center">
                <div class="flex items-center gap-1 bg-[#161616] border border-neutral-800 rounded px-1.5 py-0.5">
                    <input type="number" 
                           value={sector.allocationPercentage} 
                           oninput={(e) => handleSectorInputPct(sector.id, e.currentTarget.value)}
                           onchange={() => commitSectorUpdate(sector.id)}
                           class="w-12 bg-transparent text-white outline-none text-right" />
                    <span class="text-neutral-500">%</span>
                </div>
                <div class="flex items-center gap-1 bg-[#161616] border border-neutral-800 rounded px-1.5 py-0.5">
                    <input type="number" 
                           value={mappedHash.toFixed(2)} 
                           oninput={(e) => handleSectorInputHash(sector.id, e.currentTarget.value)}
                           onchange={() => commitSectorUpdate(sector.id)}
                           class="w-14 bg-transparent text-neutral-400 outline-none text-right focus:text-white" />
                    <span class="text-neutral-600">TH/s (Equiv)</span>
                </div>
            </div>

            <input type="range" 
                   min="0" 
                   max="100" 
                   step="0.1" 
                   value={sector.allocationPercentage} 
                   oninput={(e) => handleSectorSliderInput(sector.id, e)}
                   onchange={(e) => handleSectorSliderChange(sector.id, e)}
                   class="w-full custom-range-slider cursor-grab active:cursor-grabbing" />
        </div>
    </div>
{/snippet}

<div class="w-full h-full p-4 md:p-6 lg:p-10 overflow-y-auto bg-transparent" role="presentation">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-6 w-full max-w-[1600px] mx-auto pb-24 items-start">

        <div class="flex flex-col gap-4 lg:col-span-3 xl:col-span-2">

            <div class="bg-[#0c0c0c] border border-neutral-800 rounded-2xl p-5 shadow-inner flex flex-col gap-3">
                <h2 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Master Pool Telemetry</h2>
                <div class="flex justify-between items-end">
                    <span class="text-3xl font-mono font-light text-white leading-none">{displayHashrate.toFixed(2)} <span class="text-[11px] text-neutral-500 font-bold">TH/s</span></span>
                    <div class="flex flex-col items-end">
                        <span class="text-[8px] uppercase tracking-widest text-neutral-500 font-bold font-mono">Verified Shares</span>
                        <span class="text-sm font-mono font-black text-amber-400 leading-none">{totalShares.toLocaleString()}</span>
                    </div>
                </div>

                <div class="w-full bg-neutral-900 rounded-full h-2 mt-2 overflow-hidden border border-neutral-800">
                    <div class="h-full bg-[#18C6A5] transition-all duration-500" style="width: {unallocatedPercentage}%; box-shadow: 0 0 10px rgba(24,198,165,0.8);"></div>
                </div>

                <div class="flex justify-between items-center">
                    <span class="text-[10px] font-mono text-[#18C6A5] font-bold">{unallocatedPercentage.toFixed(1)}% Reserve</span>
                    <span class="text-[10px] font-mono text-neutral-600 font-bold">{allocatedPercentage.toFixed(1)}% Routed</span>
                </div>
            </div>

            <button onclick={createManualWorker} disabled={!$isWalletConnected} class="w-full bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-[#18C6A5]/50 text-white text-[11px] font-bold uppercase tracking-widest py-4 rounded-2xl transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                + Add Worker
            </button>

            <button onclick={openSectorModal} disabled={!$isWalletConnected || unallocatedPercentage <= 0} class="w-full bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-[#18C6A5]/50 text-white text-[11px] font-bold uppercase tracking-widest py-4 rounded-2xl transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed mt-2">
                + Break Off Sector
            </button>

            <div class="flex flex-col gap-2 mt-4">
                {#if displayedWorkers.length === 0}
                    <div class="flex-1 border border-dashed border-neutral-800/50 rounded-2xl flex items-center justify-center bg-[#050505] p-6 text-center pointer-events-none min-h-[150px]">
                        <p class="text-[9px] uppercase tracking-widest text-neutral-600 font-bold leading-relaxed">
                            {#if !$isWalletConnected} Connect wallet {:else} No hardware provisioned {/if}
                        </p>
                    </div>
                {/if}

                {#each displayedWorkers as worker (worker.id)}
                    <div class="bg-[#0a0a0a] border border-neutral-800/80 rounded-xl p-3 flex flex-col gap-2 relative shadow-sm">
                        <div class="flex justify-between items-center relative">
                            <div class="flex items-center gap-2">
                                <div class="w-2 h-2 rounded-full {worker.isOnline ? 'bg-[#18C6A5] shadow-[0_0_8px_rgba(24,198,165,0.8)] animate-pulse' : 'bg-neutral-600'} shrink-0"></div>
                                <span class="text-xs font-bold text-white truncate max-w-[120px]">{worker.name}</span>
                            </div>
                            <div class="flex items-center gap-3">
                                <span class="text-[8px] font-mono text-[#18C6A5]/80 uppercase tracking-widest truncate">{formatHardwareName(worker.hardwareType)}</span>
                                <div class="relative">
                                    <button aria-label="Worker Options" onclick={(e) => { e.stopPropagation(); activeWorkerMenu = activeWorkerMenu === worker.id ? null : worker.id; }} class="text-neutral-500 hover:text-white cursor-pointer px-1">
                                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"/></svg>
                                    </button>
                                    {#if activeWorkerMenu === worker.id}
                                        <div class="absolute right-0 top-6 w-36 bg-[#111] border border-neutral-700 rounded-lg shadow-xl py-1 z-50 flex flex-col">
                                            <button onclick={() => renameWorkerAction(worker)} class="text-left px-4 py-2 text-[10px] uppercase tracking-widest font-bold text-neutral-300 hover:text-white hover:bg-[#1a1a1a] transition-colors cursor-pointer">Rename</button>
                                            <button onclick={() => copyStratum(worker)} class="text-left px-4 py-2 text-[10px] uppercase tracking-widest font-bold text-[#18C6A5] hover:text-[#15a88c] hover:bg-[#1a1a1a] transition-colors cursor-pointer">Copy Stratum</button>
                                            <div class="h-px w-full bg-neutral-800 my-1"></div>
                                            <button onclick={() => deleteWorkerAction(worker.id)} class="text-left px-4 py-2 text-[10px] uppercase tracking-widest font-bold text-red-500 hover:text-red-400 hover:bg-[#1a1a1a] transition-colors cursor-pointer">Delete</button>
                                        </div>
                                    {/if}
                                </div>
                            </div>
                        </div>
                        <div class="flex justify-between items-end border-t border-neutral-800/50 pt-2 mt-1">
                            <div class="flex flex-col">
                                <span class="text-[7px] uppercase tracking-widest text-neutral-500 font-bold font-mono">Live Hash</span>
                                <span class="text-[11px] font-mono font-black {worker.hashRate > 0 ? 'text-white' : 'text-neutral-600'}">{worker.hashRate.toFixed(2)} <span class="text-[8px] text-neutral-500 font-normal">TH/s</span></span>
                            </div>
                            <div class="flex gap-4">
                                <div class="flex flex-col items-end">
                                    <span class="text-[7px] uppercase tracking-widest text-neutral-500 font-bold font-mono">Blocks</span>
                                    <span class="text-[11px] font-mono font-black {worker.blocksFound && worker.blocksFound > 0 ? 'text-blue-400 drop-shadow-[0_0_5px_rgba(96,165,250,0.5)]' : 'text-neutral-600'}">{(worker.blocksFound || 0)}</span>
                                </div>
                                <div class="flex flex-col items-end">
                                    <span class="text-[7px] uppercase tracking-widest text-neutral-500 font-bold font-mono">Shares</span>
                                    <span class="text-[11px] font-mono font-black {worker.sharesContributed && worker.sharesContributed > 0 ? 'text-amber-400 drop-shadow-[0_0_5px_rgba(245,158,11,0.5)]' : 'text-neutral-600'}">{(worker.sharesContributed || 0).toLocaleString()}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                {/each}
            </div>
        </div>

        <div class="flex flex-col gap-4 lg:col-span-6 xl:col-span-8">

            {#if $isWalletConnected}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 animate-[fade-in-up_0.5s_ease-out]">

                    <div class="bg-[#0c0c0c] border border-neutral-800 rounded-[24px] p-4 flex flex-col justify-between h-[240px] shadow-inner relative overflow-hidden group">
                        <div class="flex justify-between items-start relative z-10 pointer-events-none">
                            <div class="flex flex-col">
                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
                                    <div class="w-1.5 h-1.5 rounded-full {$globalNodeStatus === 'online' ? 'bg-[#18C6A5] animate-pulse' : 'bg-neutral-600'}"></div> 
                                    Live Hash Power
                                </span>
                                <span class="text-2xl font-mono font-light text-white tracking-tight">{displayHashrate.toFixed(2)} <span class="text-xs text-neutral-500 font-bold">TH/s</span></span>
                            </div>
                        </div>
                        <div class="absolute inset-0 pointer-events-none p-4 z-0">
                            <div class="w-full h-full border-l border-b border-neutral-800/40 relative">
                                <span class="absolute -left-3 top-4 -rotate-90 origin-left text-[7px] tracking-widest uppercase font-mono text-neutral-600">TH/s</span>
                                <span class="absolute bottom-1 right-2 text-[7px] tracking-widest uppercase font-mono text-neutral-600">Time →</span>
                            </div>
                        </div>
                        <div class="absolute bottom-0 left-0 w-full h-[180px] opacity-40 group-hover:opacity-80 transition-opacity duration-700 ml-4 mb-4">
                            <svg class="w-[calc(100%-16px)] h-full" preserveAspectRatio="none" viewBox="0 0 200 240">
                                <path d="{hashratePath} L 200,240 L 0,240 Z" fill="url(#hashGradient)" opacity="0.3"/>
                                <path d={hashratePath} fill="none" stroke="#18C6A5" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drop-shadow-[0_0_5px_rgba(24,198,165,0.5)]"/>
                                <defs>
                                    <linearGradient id="hashGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stop-color="#18C6A5"/>
                                        <stop offset="100%" stop-color="transparent"/>
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </div>

                    <div class="bg-[#0c0c0c] border border-neutral-800 rounded-[24px] p-4 flex flex-col justify-between h-[240px] shadow-inner relative overflow-hidden group">
                        <div class="flex justify-between items-start relative z-10 pointer-events-none">
                            <div class="flex flex-col">
                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
                                    <div class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div> 
                                    KAS / USD Price
                                </span>
                                <span class="text-2xl font-mono font-light text-white tracking-tight">${$globalKasPrice.toFixed(4)}</span>
                            </div>
                            <span class="text-[10px] font-bold font-mono px-2 py-1 rounded-lg bg-[#111] border {$globalKasChange >= 0 ? 'text-[#10b981] border-emerald-900/30' : 'text-[#ef4444] border-red-900/30'}">
                                {$globalKasChange > 0 ? '+' : ''}{$globalKasChange.toFixed(2)}%
                            </span>
                        </div>
                        <div class="absolute inset-0 pointer-events-none p-4 z-0">
                            <div class="w-full h-full border-l border-b border-neutral-800/40 relative">
                                <span class="absolute -left-3 top-4 -rotate-90 origin-left text-[7px] tracking-widest uppercase font-mono text-neutral-600">USD</span>
                                <span class="absolute bottom-1 right-2 text-[7px] tracking-widest uppercase font-mono text-neutral-600">Time →</span>
                            </div>
                        </div>
                        <div class="absolute bottom-0 left-0 w-full h-[180px] opacity-40 group-hover:opacity-80 transition-opacity duration-700 ml-4 mb-4">
                            <svg class="w-[calc(100%-16px)] h-full" preserveAspectRatio="none" viewBox="0 0 200 240">
                                <path d="{pricePath} L 200,240 L 0,240 Z" fill="url(#kasGradient)" opacity="0.3"/>
                                <path d={pricePath} fill="none" stroke={$globalKasChange >= 0 ? "#10b981" : "#ef4444"} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drop-shadow-[0_0_5px_rgba(112,199,186,0.5)]"/>
                                <defs>
                                    <linearGradient id="kasGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stop-color={$globalKasChange >= 0 ? "#10b981" : "#ef4444"}/>
                                        <stop offset="100%" stop-color="transparent"/>
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>
                    </div>
                </div>
            {/if}

            <div class="flex flex-col gap-4 flex-1 border border-neutral-800/80 rounded-[32px] bg-[#050505] p-6 min-h-[500px] shadow-2xl relative overflow-hidden" style="background-image: linear-gradient(#18C6A505 1px, transparent 1px), linear-gradient(90deg, #18C6A505 1px, transparent 1px); background-size: 30px 30px;">

                <div class="flex items-center justify-between border-b border-neutral-800/80 pb-3 relative z-10">
                    <h2 class="text-[11px] font-bold uppercase tracking-widest text-white drop-shadow-md">Sector Matrix</h2>
                    <span class="text-[10px] font-mono text-neutral-500 font-bold">{$sectors.length} ACTIVE CONTRACTS</span>
                </div>

                {#if $sectors.length === 0}
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 z-0">
                        <h2 class="text-3xl md:text-5xl font-light uppercase tracking-[0.1em] text-white/30 mb-8 drop-shadow-lg text-center">Single-Sided<br><span class="text-[#18C6A5]/50">Liquidity Routing</span></h2>
                        <div class="relative w-24 h-24 rounded-full bg-[#18C6A5]/5 border border-[#18C6A5]/20 flex items-center justify-center mb-6 shadow-inner"><svg class="text-[#18C6A5]/30 w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg></div>
                        <p class="text-[10px] uppercase tracking-widest text-neutral-500 font-bold text-center leading-relaxed">Matrix Idle<br><span class="text-[9px] font-mono text-neutral-600 font-normal mt-2 block">Break off a sector to deploy smart routing</span></p>
                    </div>
                {:else}
                    <div class="flex flex-col gap-6 relative z-10 content-start pb-10">

                        {#if siloSectors.length > 0}
                            <div class="flex flex-col gap-3">
                                <h3 class="text-[10px] font-bold uppercase tracking-widest text-[#18C6A5]/80 border-b border-[#18C6A5]/30 pb-2">Settlement Silos</h3>
                                <div class="grid grid-cols-1 md:grid-cols-12 gap-5">
                                    {#each siloSectors as sector (sector.id)}
                                        {@render sectorCard(sector)}
                                    {/each}
                                </div>
                            </div>
                        {/if}

                        {#if plantSectors.length > 0}
                            <div class="flex flex-col gap-3 mt-2">
                                <h3 class="text-[10px] font-bold uppercase tracking-widest text-blue-500/80 border-b border-blue-900/30 pb-2">Liquidity Plants</h3>
                                <div class="grid grid-cols-1 md:grid-cols-12 gap-5">
                                    {#each plantSectors as sector (sector.id)}
                                        {@render sectorCard(sector)}
                                    {/each}
                                </div>
                            </div>
                        {/if}

                    </div>
                {/if}
            </div>
        </div>

        <div class="flex flex-col gap-4 lg:col-span-3 xl:col-span-2 min-w-0 bg-[#0a0a0a] border border-neutral-800/50 rounded-[32px] p-5 shadow-2xl h-full pb-20 w-full">

            {#if $isWalletConnected}
                <div class="animate-[fade-in-up_0.5s_ease-out] mb-4 w-full flex flex-col">
                    <div class="flex items-center justify-between border-b border-neutral-800/80 pb-3 mb-5 pointer-events-none">
                        <h2 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Pool Distribution</h2>
                    </div>

                    <div class="flex flex-col items-center pointer-events-auto">
                        <div class="relative w-36 h-36 mb-6 pointer-events-none">
                            <svg viewBox="0 0 100 100" class="w-full h-full transform -rotate-90">
                                <circle cx="50" cy="50" r="42" fill="transparent" stroke="#161616" stroke-width="6"></circle>
                                {#if effortData.segments.length === 0}
                                    <circle cx="50" cy="50" r="42" fill="transparent" stroke="#262626" stroke-width="6" stroke-dasharray="263.89 0"></circle>
                                {/if}
                                {#each effortData.segments as seg}
                                    <circle cx="50" cy="50" r="42" fill="transparent" stroke="{seg.hex}60" stroke-width="6" stroke-dasharray="{seg.pct * 2.6389} {263.89 - (seg.pct * 2.6389)}" stroke-dashoffset={-(seg.offset * 2.6389)} class="transition-all duration-1000 ease-out" stroke-linecap="round" style="filter: drop-shadow(0 0 8px {seg.hex}40);"></circle>
                                {/each}
                            </svg>
                            <div class="absolute inset-0 flex flex-col items-center justify-center">
                                <span class="text-2xl font-mono font-light text-white leading-none">{displayHashrate.toFixed(2)}</span>
                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-600 mt-1">TH/s</span>
                            </div>
                        </div>

                        <div class="bg-gradient-to-br from-[#0c0c0c] to-[#111] border border-neutral-800 p-4 rounded-2xl shadow-xl flex flex-col items-center justify-center min-h-[90px] w-full mb-6 pointer-events-none">
                            <div class="text-[8px] font-bold uppercase tracking-widest text-neutral-500 text-center mb-1">
                                Total Treasury Value
                            </div>
                            <div class="text-xl xl:text-2xl font-mono font-light text-[#18C6A5] drop-shadow-[0_0_12px_rgba(24,198,165,0.2)] tracking-tighter text-center tabular-nums transition-all truncate w-full px-2">
                                ${totalTreasuryValueUsd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </div>
                        </div>

                        <div class="w-full flex flex-col gap-2 pointer-events-auto">
                            <div class="flex flex-col gap-2 w-full max-h-[200px] overflow-y-auto pr-1 hide-scrollbar">
                                {#each effortData.segments as seg}
                                    <div class="flex items-stretch gap-1.5 w-full group">
                                        <div class="flex-1 bg-[#111] hover:bg-[#161616] border border-neutral-800 rounded-lg p-2.5 flex justify-between items-center transition-colors">
                                            <div class="flex items-center gap-2">
                                                <div class="w-2 h-2 rounded-full" style="background-color: {seg.hex}60; box-shadow: 0 0 6px {seg.hex}40;"></div>
                                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-300 truncate max-w-[60px]">{seg.name}</span>
                                            </div>
                                            <div class="flex flex-col items-end text-right">
                                                <span class="text-[10px] font-bold font-mono text-white">{seg.pct.toFixed(1)}%</span>
                                            </div>
                                        </div>
                                    </div>
                                {/each}
                                {#if effortData.segments.length === 0}
                                    <div class="text-center text-[9px] font-mono text-neutral-600 uppercase tracking-widest py-4 border border-dashed border-neutral-800 rounded-xl">No Active Sectors</div>
                                {/if}
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <div class="mt-auto pointer-events-none flex flex-col gap-4 w-full">
                <div class="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                    <h2 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">NODE SYNC</h2>
                    <span class="text-[8px] font-mono flex items-center gap-1.5 {$globalNodeStatus === 'online' ? 'text-[#18C6A5]' : $globalNodeStatus === 'unreachable' ? 'text-amber-500' : 'text-neutral-600'} transition-colors"><div class="w-1.5 h-1.5 rounded-full {$globalNodeStatus === 'online' ? 'bg-[#18C6A5] animate-pulse' : $globalNodeStatus === 'unreachable' ? 'bg-amber-500' : 'bg-neutral-600'}"></div>{$globalNodeStatus === 'online' ? 'ONLINE' : 'OFFLINE'}</span>
                </div>
            </div>

        </div>
    </div>
</div>

{#if isSectorModalOpen}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-[#050505]/95" transition:fade={{ duration: 150 }}>
        <div class="absolute inset-0 w-full h-full cursor-default border-none"></div>

        <div class="relative z-10 w-full max-w-[480px] bg-[#0c0c0c] border border-neutral-700 rounded-[28px] overflow-hidden shadow-[0_0_50px_rgba(255,255,255,0.05)] flex flex-col animate-[fade-in-up_0.2s_ease-out]">

            <div class="p-6 border-b border-neutral-800 bg-[#111] flex justify-between items-center shrink-0">
                <div class="flex flex-col">
                    <h2 class="text-white font-black uppercase tracking-widest text-lg leading-none">Deploy Sector</h2>
                    <span class="text-[10px] text-[#18C6A5] font-bold uppercase tracking-widest mt-1">Single-Sided Liquidity Matrix</span>
                </div>
                <button onclick={() => isSectorModalOpen = false} class="w-8 h-8 rounded-full bg-[#1a1a1a] hover:bg-[#222] border border-neutral-800 flex items-center justify-center text-neutral-500 hover:text-white transition-colors cursor-pointer">✕</button>
            </div>

            <div class="p-6 flex flex-col gap-6 max-h-[60vh] overflow-y-auto hide-scrollbar">

                <div class="flex flex-col gap-1.5">
                    <label for="draftSectorNameInput" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">Sector Identifier</label>
                    <input id="draftSectorNameInput" 
                           type="text" 
                           bind:value={draftSectorName} 
                           placeholder="Sector Name" 
                           spellcheck="false" 
                           class="w-full bg-[#0c0c0c] border border-neutral-800 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-xs font-bold text-white uppercase tracking-wider outline-none transition-colors" />
                </div>

                <div class="flex flex-col gap-4">
                    <div class="flex justify-between items-end">
                        <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Work Share Allocation</span>
                        <div class="flex items-center gap-2">
                            <div class="flex items-center gap-1 bg-[#161616] border border-neutral-800 rounded-lg px-2 py-1 shadow-inner">
                                <input type="number" 
                                       value={draftSectorPct} 
                                       oninput={(e) => updateDraftPct(e.currentTarget.value)}
                                       class="w-16 bg-transparent text-white text-lg font-black font-mono outline-none text-right" />
                                <span class="text-neutral-500 font-bold">%</span>
                            </div>
                            <div class="flex items-center gap-1 bg-[#161616] border border-neutral-800 rounded-lg px-2 py-1 shadow-inner">
                                <input type="number" 
                                       value={(displayHashrate * (draftSectorPct / 100)).toFixed(2)} 
                                       oninput={(e) => updateDraftHash(e.currentTarget.value)}
                                       class="w-16 bg-transparent text-neutral-400 text-sm font-mono font-bold outline-none text-right focus:text-white" />
                                <span class="text-neutral-600 font-bold text-xs">TH/s</span>
                            </div>
                        </div>
                    </div>

                    <input type="range" min="0.1" max={draftSectorMax} step="0.1" bind:value={draftSectorPct} class="w-full custom-range-slider" />

                    <div class="grid grid-cols-4 gap-2 mt-1">
                        {#each [25, 50, 75, 100] as pct}
                            <button onclick={() => draftSectorPct = parseFloat(Math.min(draftSectorMax, (draftSectorMax * pct) / 100).toFixed(1))} class="py-2 rounded-lg bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 text-[10px] font-mono font-bold text-neutral-400 hover:text-white transition-colors cursor-pointer">{pct}%</button>
                        {/each}
                    </div>
                </div>

                <div class="flex flex-col gap-3">
                    <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Sector Architecture</span>
                    <div class="flex gap-3">
                        <button onclick={() => { draftSectorType = 'silo'; draftSettlementConfig.targetAsset = coreTokenRegistry.find(t=>t.ticker==='KAS') || coreTokenRegistry[0]; }} class="flex-1 p-4 rounded-xl border transition-colors text-left cursor-pointer {draftSectorType === 'silo' ? 'bg-[#18C6A5]/10 border-[#18C6A5]' : 'bg-[#111] border-neutral-800 hover:border-neutral-600'}">
                            <span class="text-xs font-bold text-white uppercase tracking-widest block mb-1">Settlement Silo</span>
                            <span class="text-[9px] font-mono text-neutral-500">Single-Asset Routing</span>
                        </button>
                        <button onclick={() => { draftSectorType = 'plant'; draftSettlementConfig.targetAsset = coreTokenRegistry.find(t=>t.ticker==='USDC') || coreTokenRegistry[11]; }} class="flex-1 p-4 rounded-xl border transition-colors text-left cursor-pointer {draftSectorType === 'plant' ? 'bg-[#3B82F6]/10 border-[#3B82F6]' : 'bg-[#111] border-neutral-800 hover:border-neutral-600'}">
                            <span class="text-xs font-bold text-white uppercase tracking-widest block mb-1">Liquidity Plant</span>
                            <span class="text-[9px] font-mono text-neutral-500">Auto-Split Pair LP</span>
                        </button>
                    </div>
                </div>

                <div class="h-px bg-neutral-800/80 w-full"></div>

                <div class="flex flex-col gap-4">
                    <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Protocol Parameters</span>

                    <div class="flex flex-col gap-1.5">
                        <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold ml-1 block">
                            {draftSectorType === 'plant' ? 'Liquidity Pair (KAS + Target)' : 'Target Asset Route'}
                        </span>
                        <button onclick={() => { assetPickerTarget = 'create'; isAssetPickerOpen = true; assetSearchQuery = ''; }} class="w-full bg-[#0c0c0c] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-white/20 rounded-xl px-4 py-3 flex items-center justify-between transition-colors cursor-pointer group shadow-inner">
                            <div class="flex items-center gap-3">
                                <div class="w-7 h-7 rounded-full bg-[#111] border border-neutral-800 flex items-center justify-center text-[11px] font-black overflow-hidden" style="color: {draftSettlementConfig.targetAsset.theme?.hex || '#ffffff'};">
                                    {#if draftSettlementConfig.targetAsset.imgUrl}
                                        <img src={draftSettlementConfig.targetAsset.imgUrl} class="w-4 h-4 object-contain" alt="logo" onerror={(e) => handleTokenIconError(e, draftSettlementConfig.targetAsset.ticker)} />
                                        <span style="display:none;" class="text-xs font-black">{draftSettlementConfig.targetAsset.ticker[0]}</span>
                                    {:else}
                                        {draftSettlementConfig.targetAsset.ticker[0]}
                                    {/if}
                                </div>
                                <div class="flex flex-col items-start"><span class="text-[12px] font-bold text-white leading-none mb-0.5">{draftSettlementConfig.targetAsset.ticker}</span><span class="text-[9px] font-mono text-neutral-500 truncate max-w-[150px]">{draftSettlementConfig.targetAsset.name}</span></div>
                            </div>
                            <span class="text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-lg bg-[#1a1a1a] text-neutral-500 border border-neutral-800">{draftSettlementConfig.targetAsset.assetClass}</span>
                        </button>
                    </div>

                    <div class="flex flex-col gap-1.5">
                        <label for="draftDestWallet" class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold ml-1">Destination Address / Wallet</label>
                        <input id="draftDestWallet" type="text" bind:value={draftSettlementConfig.payoutAddress} placeholder="kaspa:..." spellcheck="false" class="w-full bg-[#0c0c0c] border border-neutral-800 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-[11px] font-mono text-[#18C6A5] outline-none transition-colors" />
                    </div>

                    <div class="flex items-center justify-between bg-[#0c0c0c] border border-neutral-800 rounded-xl p-4 mt-2">
                        <div class="flex flex-col"><span class="text-[10px] uppercase tracking-widest text-neutral-300 font-bold">Auto-Settlement Pipeline</span><span class="text-[9px] text-neutral-600 leading-tight mt-0.5">Route yields actively to wallet.</span></div>
                        <button aria-label="Toggle Auto Payout" onclick={() => draftSettlementConfig.autoPayout = !draftSettlementConfig.autoPayout} class="w-10 h-5 rounded-full border transition-colors duration-300 relative {draftSettlementConfig.autoPayout ? 'bg-amber-500/20 border-amber-500/50' : 'bg-neutral-900 border-neutral-700'} cursor-pointer focus:outline-none"><div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all duration-300 shadow-sm {draftSettlementConfig.autoPayout ? 'bg-amber-500 left-[22px]' : 'bg-neutral-500 left-1'}"></div></button>
                    </div>

                    <div class="flex bg-[#0a0a0a] rounded-xl p-1 border border-neutral-800 {draftSettlementConfig.autoPayout ? '' : 'opacity-50 pointer-events-none'} transition-opacity shadow-inner">
                        <button onclick={() => draftSettlementConfig.mode = 'threshold'} class="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all {draftSettlementConfig.mode === 'threshold' ? 'bg-[#1a1a1a] text-amber-400 shadow-md border border-neutral-800' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Limit</button>
                        <button onclick={() => draftSettlementConfig.mode = 'stream'} class="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all {draftSettlementConfig.mode === 'stream' ? 'bg-[#1a1a1a] text-[#18C6A5] shadow-md border border-neutral-800' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Stream</button>
                        <button onclick={() => draftSettlementConfig.mode = 'appointment'} class="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all {draftSettlementConfig.mode === 'appointment' ? 'bg-[#1a1a1a] text-blue-400 shadow-md border border-neutral-800' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Appt.</button>
                    </div>

                    {#if draftSettlementConfig.mode === 'threshold'}
                        <div class="flex flex-col gap-1.5 animate-[fade-in-up_0.2s_ease-out] {draftSettlementConfig.autoPayout ? '' : 'opacity-50 pointer-events-none'}">
                            <label for="draftThreshLimit" class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold ml-1">Payout Limit (KAS Generated)</label>
                            <div class="relative flex items-center">
                                <input id="draftThreshLimit" type="number" min="0.0001" step="0.0001" bind:value={draftSettlementConfig.threshold} class="w-full bg-[#0c0c0c] border border-neutral-800 focus:border-amber-500/50 rounded-xl pl-4 pr-16 py-3 text-[13px] font-mono font-bold text-white outline-none transition-colors appearance-none" />
                                <span class="absolute right-4 text-[10px] font-bold text-neutral-600 pointer-events-none uppercase">KAS</span>
                            </div>
                        </div>
                    {:else if draftSettlementConfig.mode === 'stream'}
                        <div class="flex flex-col gap-3 animate-[fade-in-up_0.2s_ease-out] {draftSettlementConfig.autoPayout ? '' : 'opacity-50 pointer-events-none'}">
                            <div class="grid grid-cols-2 gap-2">
                                <button onclick={() => draftSettlementConfig.streamMode = 'realtime'} class="py-2.5 rounded-lg border text-[9px] font-bold uppercase tracking-widest transition-all {draftSettlementConfig.streamMode === 'realtime' ? 'bg-[#18C6A5]/10 border-[#18C6A5] text-[#18C6A5]' : 'bg-[#0c0c0c] border-neutral-800 text-neutral-500 hover:border-neutral-700 cursor-pointer'}">Real-Time</button>
                                <button onclick={() => draftSettlementConfig.streamMode = 'interval'} class="py-2.5 rounded-lg border text-[9px] font-bold uppercase tracking-widest transition-all {draftSettlementConfig.streamMode === 'interval' ? 'bg-[#18C6A5]/10 border-[#18C6A5] text-[#18C6A5]' : 'bg-[#0c0c0c] border-neutral-800 text-neutral-500 hover:border-neutral-700 cursor-pointer'}">Interval</button>
                            </div>
                            {#if draftSettlementConfig.streamMode === 'interval'}
                                <div class="flex flex-col gap-1.5 mt-1">
                                    <label for="draftStreamVal" class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold ml-1">Time Increment</label>
                                    <div class="flex gap-2">
                                        <input id="draftStreamVal" type="number" min="1" bind:value={draftSettlementConfig.streamValue} class="w-1/3 bg-[#0c0c0c] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[13px] font-mono font-bold text-white outline-none transition-colors appearance-none text-center" />
                                        <select bind:value={draftSettlementConfig.streamUnit} class="w-2/3 bg-[#0c0c0c] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[11px] font-bold text-white outline-none cursor-pointer appearance-none"><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select>
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {:else if draftSettlementConfig.mode === 'appointment'}
                        <div class="flex flex-col gap-3 animate-[fade-in-up_0.2s_ease-out] {draftSettlementConfig.autoPayout ? '' : 'opacity-50 pointer-events-none'}">
                            <span class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1 block">Chronos Scheduling</span>
                            <div class="grid grid-cols-2 gap-3">
                                <input type="date" bind:value={draftSettlementConfig.appointmentDate} class="w-full bg-[#0c0c0c] border border-neutral-800 focus:border-blue-500/50 rounded-xl px-3 py-3 text-[11px] font-mono text-white outline-none transition-colors [color-scheme:dark]" />
                                <input type="time" bind:value={draftSettlementConfig.appointmentTime} class="w-full bg-[#0c0c0c] border border-neutral-800 focus:border-blue-500/50 rounded-xl px-3 py-3 text-[13px] font-mono text-white outline-none transition-colors [color-scheme:dark]" />
                            </div>
                        </div>
                    {/if}
                </div>

            </div>

            <div class="flex gap-3 px-6 pb-6 pt-4 bg-[#111] border-t border-neutral-800 shrink-0">
                <button onclick={() => isSectorModalOpen = false} class="flex-1 py-3.5 bg-[#161616] hover:bg-[#222] border border-neutral-800 text-neutral-400 hover:text-white font-bold uppercase tracking-widest text-[11px] rounded-xl transition-colors cursor-pointer">Cancel</button>
                <button onclick={createSector} disabled={draftSectorPct <= 0} class="flex-[2] py-3.5 bg-[#18C6A5] hover:bg-[#15a88c] text-black font-black uppercase tracking-widest text-[11px] rounded-xl transition-colors cursor-pointer shadow-[0_0_15px_rgba(24,198,165,0.3)] disabled:opacity-50 disabled:cursor-not-allowed">Initialize Sector</button>
            </div>

        </div>
    </div>
{/if}

{#if settlementModalSilo && editSettlementParams}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div class="absolute inset-0 w-full h-full bg-[#050505]/98 cursor-default border-none"></div>

        <div class="relative z-10 w-full max-w-[420px] bg-[#111] border border-neutral-800 rounded-[28px] shadow-2xl flex flex-col overflow-hidden transition-colors duration-500 border-t-4 {editSettlementParams.autoPayout ? (editSettlementParams.mode === 'stream' ? 'border-t-emerald-500' : editSettlementParams.mode === 'appointment' ? 'border-t-blue-500' : 'border-t-amber-500') : 'border-t-neutral-600'} animate-[fade-in-up_0.2s_ease-out]">
            <div class="px-6 pt-6 pb-4 border-b border-neutral-800/80 shrink-0">
                <h3 class="text-white font-bold tracking-wide text-md mb-1 text-center truncate">{settlementModalSilo.name}</h3>
                <span class="text-[9px] text-neutral-500 uppercase tracking-widest text-center block font-bold">Settlement Protocol</span>
            </div>

            <div class="p-6 flex flex-col gap-5 max-h-[60vh] overflow-y-auto hide-scrollbar">

                <div class="flex flex-col gap-1.5">
                    <label for="editSectorNameInput" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">Sector Identifier</label>
                    <input id="editSectorNameInput" 
                           type="text" 
                           bind:value={editSectorName} 
                           placeholder="Sector Name" 
                           spellcheck="false" 
                           class="w-full bg-[#0c0c0c] border border-neutral-800 focus:border-[#18C6A5]/50 rounded-xl px-4 py-2.5 text-xs font-bold text-white uppercase tracking-wider outline-none transition-colors" />
                </div>

                <div class="flex flex-col gap-1.5">
                    <span class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1 block">Target Asset Route</span>

                    <button aria-label="Target Asset Route" onclick={() => { assetPickerTarget = 'edit'; isAssetPickerOpen = true; assetSearchQuery = ''; }} class="w-full bg-[#0c0c0c] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-white/20 rounded-xl px-4 py-3 flex items-center justify-between transition-colors cursor-pointer group shadow-inner">
                        <div class="flex items-center gap-3">
                            <div class="w-7 h-7 rounded-full bg-[#111] border border-neutral-800 flex items-center justify-center text-[11px] font-black overflow-hidden" style="color: {editSettlementParams.targetAsset.theme?.hex || '#ffffff'};">
                                {#if editSettlementParams.targetAsset.imgUrl}
                                    <img src={editSettlementParams.targetAsset.imgUrl} class="w-4 h-4 object-contain" alt="logo" onerror={(e) => handleTokenIconError(e, editSettlementParams.targetAsset.ticker)} />
                                    <span style="display:none;" class="text-xs font-black">{editSettlementParams.targetAsset.ticker[0]}</span>
                                {:else}
                                    {editSettlementParams.targetAsset.ticker[0]}
                                {/if}
                            </div>
                            <div class="flex flex-col items-start"><span class="text-[12px] font-bold text-white leading-none mb-0.5">{editSettlementParams.targetAsset.ticker}</span><span class="text-[9px] font-mono text-neutral-500 truncate max-w-[150px]">{editSettlementParams.targetAsset.name}</span></div>
                        </div>
                        <span class="text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded-lg bg-[#1a1a1a] text-neutral-500 border border-neutral-800">{editSettlementParams.targetAsset.assetClass}</span>
                    </button>
                </div>

                <div class="flex flex-col gap-1.5">
                    <label for="destWallet" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">Destination Address / Wallet</label>
                    <input id="destWallet" type="text" bind:value={editSettlementParams.payoutAddress} placeholder="kaspa:..." spellcheck="false" class="w-full bg-[#0c0c0c] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[11px] font-mono text-amber-400 outline-none transition-colors" />
                </div>

                <div class="flex items-center justify-between bg-[#0c0c0c] border border-neutral-800 rounded-xl p-4 mt-2">
                    <div class="flex flex-col"><span class="text-[10px] uppercase tracking-widest text-neutral-300 font-bold">Auto-Settlement Pipeline</span><span class="text-[9px] text-neutral-600 leading-tight mt-0.5">Route yields actively to wallet.</span></div>
                    <button aria-label="Toggle Auto Payout" onclick={() => editSettlementParams.autoPayout = !editSettlementParams.autoPayout} class="w-10 h-5 rounded-full border transition-colors duration-300 relative {editSettlementParams.autoPayout ? 'bg-amber-500/20 border-amber-500/50' : 'bg-neutral-900 border-neutral-700'} cursor-pointer focus:outline-none"><div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all duration-300 shadow-sm {editSettlementParams.autoPayout ? 'bg-amber-500 left-[22px]' : 'bg-neutral-500 left-1'}"></div></button>
                </div>

                <div class="flex bg-[#0a0a0a] rounded-xl p-1 border border-neutral-800 {editSettlementParams.autoPayout ? '' : 'opacity-50 pointer-events-none'} transition-opacity shadow-inner">
                    <button aria-label="Threshold Mode" onclick={() => editSettlementParams.mode = 'threshold'} class="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all {editSettlementParams.mode === 'threshold' ? 'bg-[#1a1a1a] text-amber-400 shadow-md border border-neutral-800' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Limit</button>
                    <button aria-label="Stream Mode" onclick={() => editSettlementParams.mode = 'stream'} class="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all {editSettlementParams.mode === 'stream' ? 'bg-[#1a1a1a] text-[#18C6A5] shadow-md border border-neutral-800' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Stream</button>
                    <button aria-label="Appointment Mode" onclick={() => editSettlementParams.mode = 'appointment'} class="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all {editSettlementParams.mode === 'appointment' ? 'bg-[#1a1a1a] text-blue-400 shadow-md border border-neutral-800' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Appt.</button>
                </div>

                {#if editSettlementParams.mode === 'threshold'}
                    <div class="flex flex-col gap-1.5 animate-[fade-in-up_0.2s_ease-out] {editSettlementParams.autoPayout ? '' : 'opacity-50 pointer-events-none'}">
                        <label for="threshLimit" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">Payout Limit (KAS Generated)</label>
                        <div class="relative flex items-center">
                            <input id="threshLimit" type="number" min="0.0001" step="0.0001" bind:value={editSettlementParams.threshold} class="w-full bg-[#0c0c0c] border border-neutral-800 focus:border-amber-500/50 rounded-xl pl-4 pr-16 py-3 text-[13px] font-mono font-bold text-white outline-none transition-colors appearance-none" />
                            <span class="absolute right-4 text-[10px] font-bold text-neutral-600 pointer-events-none uppercase">KAS</span>
                        </div>
                    </div>
                {:else if editSettlementParams.mode === 'stream'}
                    <div class="flex flex-col gap-3 animate-[fade-in-up_0.2s_ease-out] {editSettlementParams.autoPayout ? '' : 'opacity-50 pointer-events-none'}">
                        <div class="grid grid-cols-2 gap-2">
                            <button aria-label="Real Time Stream" onclick={() => editSettlementParams.streamMode = 'realtime'} class="py-2.5 rounded-lg border text-[9px] font-bold uppercase tracking-widest transition-all {editSettlementParams.streamMode === 'realtime' ? 'bg-[#18C6A5]/10 border-[#18C6A5] text-[#18C6A5]' : 'bg-[#0c0c0c] border-neutral-800 text-neutral-500 hover:border-neutral-700 cursor-pointer'}">Real-Time</button>
                            <button aria-label="Interval Stream" onclick={() => editSettlementParams.streamMode = 'interval'} class="py-2.5 rounded-lg border text-[9px] font-bold uppercase tracking-widest transition-all {editSettlementParams.streamMode === 'interval' ? 'bg-[#18C6A5]/10 border-[#18C6A5] text-[#18C6A5]' : 'bg-[#0c0c0c] border-neutral-800 text-neutral-500 hover:border-neutral-700 cursor-pointer'}">Interval</button>
                        </div>
                        {#if editSettlementParams.streamMode === 'interval'}
                            <div class="flex flex-col gap-1.5 mt-1">
                                <label for="streamVal" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">Time Increment</label>
                                <div class="flex gap-2">
                                    <input id="streamVal" type="number" min="1" bind:value={editSettlementParams.streamValue} class="w-1/3 bg-[#0c0c0c] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[13px] font-mono font-bold text-white outline-none transition-colors appearance-none text-center" />
                                    <select aria-label="Time Unit" bind:value={editSettlementParams.streamUnit} class="w-2/3 bg-[#0c0c0c] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[11px] font-bold text-white outline-none cursor-pointer appearance-none"><option value="minutes">Minutes</option><option value="hours">Hours</option><option value="days">Days</option></select>
                                </div>
                            </div>
                        {/if}
                    </div>
                {:else if editSettlementParams.mode === 'appointment'}
                    <div class="flex flex-col gap-3 animate-[fade-in-up_0.2s_ease-out] {editSettlementParams.autoPayout ? '' : 'opacity-50 pointer-events-none'}">
                        <span class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1 block">Chronos Scheduling</span>
                        <div class="grid grid-cols-2 gap-3">
                            <input aria-label="Appointment Date" type="date" bind:value={editSettlementParams.appointmentDate} class="w-full bg-[#0c0c0c] border border-neutral-800 focus:border-blue-500/50 rounded-xl px-3 py-3 text-[11px] font-mono text-white outline-none transition-colors [color-scheme:dark]" />
                            <input aria-label="Appointment Time" type="time" bind:value={editSettlementParams.appointmentTime} class="w-full bg-[#0c0c0c] border border-neutral-800 focus:border-blue-500/50 rounded-xl px-3 py-3 text-[13px] font-mono text-white outline-none transition-colors [color-scheme:dark]" />
                        </div>
                    </div>
                {/if}
            </div>

            <div class="flex gap-3 px-6 pb-6 pt-4 bg-[#111] border-t border-neutral-800 shrink-0">
                <button aria-label="Cancel" onclick={() => {settlementModalSilo = null; isAssetPickerOpen = false; editSettlementParams = {...defaultSettlement}; isSigningSettlement = false;}} class="flex-1 py-3 bg-[#161616] hover:bg-[#222] border border-neutral-800 text-neutral-400 hover:text-white font-bold uppercase tracking-widest text-[10px] rounded-xl transition-colors cursor-pointer">Cancel</button>
                <button aria-label="Save" onclick={saveSettlementParams} disabled={isSigningSettlement} class="flex-[2] py-3 text-black font-black uppercase tracking-widest text-[10px] rounded-xl transition-colors cursor-pointer disabled:opacity-50 {editSettlementParams.autoPayout ? (editSettlementParams.mode === 'stream' ? 'bg-[#18C6A5] hover:bg-[#15a88c] shadow-[0_0_15px_rgba(24,198,165,0.3)]' : editSettlementParams.mode === 'appointment' ? 'bg-blue-500 hover:bg-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-amber-500 hover:bg-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]') : 'bg-[#18C6A5] hover:bg-[#15a88c] shadow-[0_0_15px_rgba(24,198,165,0.2)]'}">
                    {#if isSigningSettlement}
                        Awaiting Signature...
                    {:else}
                        Update Protocol
                    {/if}
                </button>
            </div>
        </div>
    </div>
{/if}

{#if isAssetPickerOpen}
    <div class="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-[#050505]/95" transition:fade={{ duration: 150 }}>
        <div class="absolute inset-0 w-full h-full cursor-default border-none bg-transparent"></div>

        <div class="relative z-10 w-full max-w-[420px] bg-[#111] border border-neutral-700 rounded-[28px] shadow-2xl flex flex-col overflow-hidden h-[540px] animate-[fade-in-up_0.2s_ease-out]">

            <div class="p-4 border-b border-neutral-800/80 flex items-center justify-between bg-[#0a0a0a]">
                <button aria-label="Back" onclick={() => { isAssetPickerOpen = false; assetSearchQuery = ''; }} class="w-8 h-8 rounded-full hover:bg-[#222] flex items-center justify-center text-neutral-400 transition-colors cursor-pointer">✕</button>
                <h3 class="font-bold tracking-wide text-sm text-center uppercase text-white">Target Asset Matrix</h3>
                <div class="w-8"></div>
            </div>

            <div class="p-4 border-b border-neutral-800/80 bg-[#0c0c0c]">
                <div class="relative">
                    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                    <input aria-label="Asset Search" type="text" bind:value={assetSearchQuery} placeholder="Search ticker or network..." class="w-full bg-[#1a1a1a] border border-neutral-800 focus:border-[#18C6A5]/50 rounded-xl pl-9 pr-4 py-3 text-[11px] font-mono text-white outline-none transition-colors" />
                </div>
            </div>

            <div class="flex-1 overflow-y-auto p-2 bg-[#111] hide-scrollbar">
                <div class="flex flex-col gap-1">
                    {#each filteredAssets as asset}
                        <button aria-label="Select Asset" onclick={() => { 
                            if (assetPickerTarget === 'create') {
                                draftSettlementConfig.targetAsset = asset;
                            } else {
                                editSettlementParams.targetAsset = asset;
                            }
                            isAssetPickerOpen = false; 
                            assetSearchQuery = ''; 
                        }} class="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#1a1a1a] transition-colors cursor-pointer group border border-transparent hover:border-neutral-800">
                            <div class="flex items-center gap-3 pointer-events-none">
                                <div class="w-8 h-8 rounded-full bg-[#0c0c0c] border border-neutral-800 flex items-center justify-center text-[10px] font-black overflow-hidden" style="color: {asset.theme?.hex || '#ffffff'};">
                                    {#if asset.imgUrl}
                                        <img src={asset.imgUrl} class="w-4 h-4 object-contain" alt="logo" onerror={(e) => handleTokenIconError(e, asset.ticker)} />
                                        <span style="display:none;" class="text-xs font-black">{asset.ticker[0]}</span>
                                    {:else}
                                        {asset.ticker[0]}
                                    {/if}
                                </div>
                                <div class="flex flex-col items-start"><span class="text-xs font-bold text-white tracking-widest">{asset.ticker}</span><span class="text-[10px] text-neutral-500">{asset.name}</span></div>
                            </div>
                            <span class="text-[8px] font-mono uppercase tracking-widest px-2 py-1 rounded-lg bg-[#0c0c0c] text-neutral-500 border border-neutral-800 pointer-events-none">{asset.assetClass}</span>
                        </button>
                    {/each}
                    {#if filteredAssets.length === 0}
                        <div class="py-8 text-center text-[10px] font-mono text-neutral-500 uppercase tracking-widest">No assets match criteria</div>
                    {/if}
                </div>
            </div>
        </div>
    </div>
{/if}

<style>
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }

    .custom-range-slider {
        -webkit-appearance: none;
        appearance: none;
        height: 6px;
        background: #1a1a1a;
        border-radius: 4px;
        border: 1px solid #222;
        outline: none;
    }

    .custom-range-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        height: 18px;
        width: 18px;
        border-radius: 50%;
        background: #fff;
        cursor: pointer;
        box-shadow: 0 0 10px rgba(0,0,0,0.5);
    }
</style>