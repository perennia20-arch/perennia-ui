<script lang="ts">
    import { source } from 'sveltekit-sse';
    import { dispatchStateAction, workers, silos, plants, systemMode, adminModeActive, adminTargetWallet, coreTokenRegistry, ClassThemes, globalKasPrice, globalKasChange, globalNetworkHashrate, globalNodeStatus, walletInventory, type Worker, type Silo, type Plant, type SettlementConfig, type TokenAsset, type SiloWidth, type AssetClass } from '$lib/stores/app';
    import { isWalletConnected, walletAddress, walletBalance, DEV_ADMIN_BYPASS, MASTER_ADMIN_ADDRESS } from '$lib/stores/wallet';
    import { fade, slide } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { get } from 'svelte/store';
    import { browser } from '$app/environment';

    // ⚡ TELEMETRY DEBOUNCER: Eliminates SSE Race Conditions during Optimistic Execution
    let lastMutationTime = 0;
    function markMutation() { lastMutationTime = Date.now(); }

    const isCorporateAdmin = $derived(DEV_ADMIN_BYPASS || ($walletAddress && $walletAddress.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase()));
    
    // ⚡ SURGICAL ROUTER: Forces API mutations & SSE filters to target the exact impersonated DB row
    const resolveTargetWallet = () => (isCorporateAdmin && $adminModeActive && $adminTargetWallet) ? $adminTargetWallet : $walletAddress;

    // ⚡ OPTIMISTIC QUEUE DISPATCH
    async function safeDispatch(action: string, payload: any) {
        markMutation();
        const tw = resolveTargetWallet();
        await dispatchStateAction(action, payload, tw ?? undefined);
        markMutation(); // Reset timer after DB physically confirms row lock
    }

    let contextMenuWorkerId = $state<string | null>(null);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);
    let deleteConfirmId = $state<string | null>(null);

    let activeSiloMenu = $state<string | null>(null);
    let activePlantMenu = $state<string | null>(null);
    let inlineRenameId = $state<string | null>(null);
    let inlineRenameValue = $state<string>('');
    let isSigningSettlement = $state(false);

    let stratumModalWorker = $state<Worker | null>(null);

    let syntheticBalances = $state<Record<string, number>>({});

    let totalPendingKAS = $derived($silos.reduce((acc, s) => acc + (s.pendingKaspa || 0), 0));
    let totalPendingUSD = $derived(totalPendingKAS * ($globalKasPrice || 0));

    let displayedWorkers = $derived($workers);

    let localHashrate = $derived(displayedWorkers.reduce((acc, w) => acc + w.hashRate, 0));
    let displayHashrate = $derived((isCorporateAdmin && $adminModeActive && !$adminTargetWallet) ? $globalNetworkHashrate : localHashrate);

    let totalTreasuryValueUsd = $derived.by(() => {
        let kasBal = parseFloat($walletBalance) || 0;
        let kasPrice = $globalKasPrice || 0.16;
        let total = kasBal * kasPrice;

        for (const [ticker, bal] of Object.entries(syntheticBalances)) {
            const asset = coreTokenRegistry.find(t => t.ticker === ticker);
            const price = asset ? asset.priceUsd : 0;
            total += (bal * price);
        }
        return total;
    });

    function handleContextMenu(e: MouseEvent, workerId: string) {
        e.preventDefault();
        e.stopPropagation();
        closeAllMenus();
        contextMenuWorkerId = workerId;
        deleteConfirmId = null;
        
        const menuW = 192;
        const menuH = 180;
        contextMenuX = Math.min(e.clientX, window.innerWidth - menuW - 10);
        contextMenuY = Math.min(e.clientY, window.innerHeight - menuH - 10);
    }

    function closeAllMenus() { 
        contextMenuWorkerId = null; 
        activeSiloMenu = null; 
        activePlantMenu = null; 
        deleteConfirmId = null;
        if (inlineRenameId) saveInlineRename(inlineRenameId); 
    }

    const defaultSettlement: SettlementConfig = { targetAsset: coreTokenRegistry[0], payoutAddress: '', autoPayout: true, mode: 'stream', threshold: 10.0, streamMode: 'realtime', streamValue: 1, streamUnit: 'hours', appointmentDate: '', appointmentTime: '17:00' };
    let settlementModalSilo = $state<Silo | null>(null);
    let editSettlementParams = $state<SettlementConfig>({ ...defaultSettlement });

    let plantModalPlant = $state<Plant | null>(null);
    let editPlantParams = $state<{ lockDays: number, multiplier: number, autoCompound: boolean }>({ lockDays: 0, multiplier: 1.0, autoCompound: true });
    let plantLockDurationIndex = $state(0);
    
    const lockOptions = [
        { label: 'Flexible', days: 0, multiplier: 1.0 },
        { label: '30 Days', days: 30, multiplier: 1.2 },
        { label: '90 Days', days: 90, multiplier: 1.5 },
        { label: '365 Days', days: 365, multiplier: 2.5 }
    ];

    function openPlantConfig(plant: Plant) {
        plantModalPlant = plant;
        const idx = lockOptions.findIndex(o => o.days === plant.liquidityDeposit.lockDays);
        plantLockDurationIndex = idx !== -1 ? idx : 0;
        editPlantParams = {
            lockDays: plant.liquidityDeposit.lockDays || 0,
            multiplier: plant.liquidityDeposit.multiplier || 1.0,
            autoCompound: plant.autoCompound
        };
        activePlantMenu = null;
    }

    async function savePlantParams() {
        if (plantModalPlant) {
            const selectedLock = lockOptions[plantLockDurationIndex];
            
            $plants = $plants.map(p => {
                if (p.id === plantModalPlant!.id) {
                    return { 
                        ...p, 
                        autoCompound: editPlantParams.autoCompound,
                        liquidityDeposit: { 
                            ...p.liquidityDeposit, 
                            lockDays: selectedLock.days, 
                            multiplier: selectedLock.multiplier 
                        },
                        currentApr: 14.2 * selectedLock.multiplier
                    };
                }
                return p;
            });
            await safeDispatch('UPDATE_PLANT_PARAMS', { 
                id: plantModalPlant!.id, 
                autoCompound: editPlantParams.autoCompound,
                liquidityDeposit: { lockDays: selectedLock.days, multiplier: selectedLock.multiplier },
                currentApr: 14.2 * selectedLock.multiplier
            });
            plantModalPlant = null;
        }
    }

    // ⚡ REAL-TIME SYNTHESIS ENGINE
    async function updatePlantSynthesis(plantId: string) {
        const plantSilos = $silos.filter(s => s.assignedPlantId === plantId);
        const plant = $plants.find(p => p.id === plantId);
        if (!plant) return;

        let isActive = false;
        let pairName = 'Awaiting Pairs';

        if (plantSilos.length === 2) {
            isActive = true;
            const t1 = plantSilos[0].settlementConfig.targetAsset.ticker;
            const t2 = plantSilos[1].settlementConfig.targetAsset.ticker;
            pairName = `${t1}/${t2} LP`;
        }

        if (plant.liquidityDeposit.isActive !== isActive || plant.liquidityDeposit.pairName !== pairName) {
            $plants = $plants.map(p => p.id === plantId ? {
                ...p,
                liquidityDeposit: { ...p.liquidityDeposit, isActive, pairName }
            } : p);
            
            await safeDispatch('UPDATE_PLANT_PARAMS', {
                id: plantId,
                liquidityDeposit: { ...plant.liquidityDeposit, isActive, pairName }
            });
        }
    }

    let isAssetPickerOpen = $state(false);
    let assetSearchQuery = $state('');
    let dynamicTreasuryTokens = $state<TokenAsset[]>([]);

    $effect(() => {
        if (browser && isAssetPickerOpen) {
            try {
                const lsData = localStorage.getItem('p_kas_a_v3');
                if (lsData) {
                    const parsed = JSON.parse(lsData);
                    dynamicTreasuryTokens = parsed.map((t: any) => ({
                        ticker: t.symbol,
                        name: t.name,
                        assetClass: 'Ecosystem' as AssetClass,
                        priceUsd: t.price || 0,
                        imgUrl: t.imgUrl,
                        icon: t.icon,
                        theme: { hex: t.hex || ClassThemes['Ecosystem'].hex, pastel: ClassThemes['Ecosystem'].pastel }
                    }));
                }
            } catch (e) {
                console.error(e);
            }
        }
    });
    
    let allSettlementAssets = $derived([...coreTokenRegistry, ...dynamicTreasuryTokens]);
    
    let filteredAssets = $derived(allSettlementAssets.filter(a => 
        a.ticker.toLowerCase().includes(assetSearchQuery.toLowerCase()) || 
        a.name.toLowerCase().includes(assetSearchQuery.toLowerCase())
    ));

    let displayHashHistory = $state<number[]>([]);
    let kasHistory = $state<number[]>([]);

    $effect(() => {
        if (displayHashHistory.length === 0) {
            displayHashHistory = Array(30).fill(displayHashrate);
        }
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

    let effortData = $derived.by(() => {
        let segments: { id: string, name: string, pct: number, offset: number, hex: string }[] = [];
        let totalHash = displayHashrate;
        
        if (totalHash > 0) {
            let currentOffset = 0;
            $silos.forEach(silo => {
                const siloHash = displayedWorkers.filter(w => w.assignedSiloId === silo.id && w.isOnline).reduce((acc, w) => acc + w.hashRate, 0);
                if (siloHash > 0) {
                    const pct = (siloHash / totalHash) * 100;
                    const inPlant = silo.assignedPlantId !== null;
                    const siloTheme = silo.settlementConfig.targetAsset.theme || ClassThemes['Native L1'];
                    
                    segments.push({ 
                        id: silo.id,
                        name: silo.name, 
                        pct, 
                        offset: currentOffset, 
                        hex: inPlant ? siloTheme.pastel : siloTheme.hex
                    });
                    currentOffset += pct;
                }
            });
        }
        return { segments, totalHash };
    });

    async function fetchSyntheticLedger() {
        if (!$isWalletConnected || !$walletAddress) return;
        try {
            const res = await fetch(`/api/user/ledger?wallet=${encodeURIComponent($walletAddress)}`);
            if (res.ok) {
                const data = await res.json();
                syntheticBalances = data || {};
            }
        } catch (e) {
            console.error("Operations Ledger Hydration Failed:", e);
        }
    }

    $effect(() => {
        if ($isWalletConnected && $walletAddress) {
            fetchSyntheticLedger();
        }
    });

    let floatingTexts = $state<{ id: number, x: number, y: number, text1: string, text2: string }[]>([]);
    let floatId = 0;

    $effect(() => {
        if (browser && $isWalletConnected && $walletAddress) {
            const connection = source(`/api/telemetry?address=${encodeURIComponent($walletAddress)}`);
            const unsubscribe = connection.select('message').subscribe((rawData) => {
                if (!rawData) return;
                try {
                    const parsed = JSON.parse(rawData);
                    if (parsed.error) return;

                    const targetUserWallet = resolveTargetWallet();
                    const cleanTarget = targetUserWallet?.replace('kaspa:', '').toLowerCase().trim();
                    const incWallet = parsed.wallet?.replace('kaspa:', '').toLowerCase().trim();

                    if (parsed.layout_state_update) {
                        // ⚡ 4-SECOND DEBOUNCE: Blocks SSE rubber-banding while DB locks and syncs
                        if (Date.now() - lastMutationTime < 4000) return; 
                        
                        // ⚡ STRICT PAYLOAD ISOLATION: Reject states that don't belong to the viewed dashboard
                        if (incWallet === cleanTarget) {
                            workers.set(parsed.state.workers || []);
                            silos.set(parsed.state.silos || []);
                            plants.set(parsed.state.plants || []);
                            if (parsed.state.systemMode) systemMode.set(parsed.state.systemMode);
                        }
                        return;
                    }
                    
                    if (parsed.yield_update) {
                        // ⚡ STRICT PAYLOAD ISOLATION for Auto-Compounding
                        if (incWallet === cleanTarget) {
                            silos.update(currentSilos => {
                                let changed = false;
                                const newSilos = currentSilos.map(s => {
                                    const update = parsed.silos.find((u: any) => u.id === s.id);
                                    if (update && s.pendingKaspa !== update.pendingKaspa) {
                                        changed = true;
                                        return { ...s, pendingKaspa: update.pendingKaspa };
                                    }
                                    return s;
                                });
                                return changed ? newSilos : currentSilos;
                            });
                        }
                        return;
                    }
                    
                    processTelemetryData(parsed);
                } catch(e) {
                    globalNodeStatus.set('unreachable');
                }
            });

            return () => {
                unsubscribe();
                connection.close();
            };
        }
    });

    function processTelemetryData(data: any) {
        const isConnected = get(isWalletConnected);
        globalNetworkHashrate.set((data.pool?.totalHashrate || data.totalHashrate || 0) / 1e12);
        globalNodeStatus.set('online');

        if (!isConnected) return;

        workers.update(currentWorkers => {
            let updated = currentWorkers.map(w => {
                const wBase = w.walletWorker.split('.')[0].replace('kaspa:', '').toLowerCase();
                
                const bw = (data.workers || []).find((b: any) => {
                    const bBase = b.fullIdentity.split('.')[0].replace('kaspa:', '').toLowerCase();
                    return b.fullIdentity?.toLowerCase() === w.walletWorker.toLowerCase() ||
                           (b.name && w.name && b.name.toLowerCase() === w.name.toLowerCase() && 
                           (wBase === bBase || wBase === 'pending'));
                });
                
                if (bw) {
                    const rawHash = bw.trackingRate || bw.hashrate || bw.hashRate || 0;
                    const newShares = bw.sharesContributed || bw.shares || 0;

                    return { 
                        ...w, 
                        hashRate: rawHash / 1e12,
                        sharesContributed: newShares,
                        blocksFound: bw.blocksFound || bw.blocks || 0,
                        hardwareType: bw.hardwareType || w.hardwareType || 'IceRiver KS',
                        isOnline: true 
                    } as any; 
                }
                return { ...w, hashRate: 0, isOnline: false };
            });

            return updated;
        });
    }

    let unsubs: any[] = [];

    onMount(() => { 
        kasHistory = Array(30).fill(get(globalKasPrice));
        unsubs.push(globalKasPrice.subscribe(v => { kasHistory = [...kasHistory.slice(1), v]; }));
    });

    $effect(() => {
        const timer = setInterval(() => {
            if (browser && $isWalletConnected) {
                displayHashHistory = [...displayHashHistory.slice(1), displayHashrate];
            }
        }, 1000);
        return () => clearInterval(timer);
    });

    onDestroy(() => { 
        unsubs.forEach(u => u()); 
    });

    let dragType = $state<'worker' | 'silo' | null>(null);
    let draggedId = $state<string | null>(null);
    let targetDropId = $state<string | null>(null);
    let targetDropType = $state<'field' | 'silo' | 'plant' | 'canvas' | null>(null);

    function handleDragStart(e: DragEvent, type: 'worker' | 'silo', id: string) { closeAllMenus(); e.stopPropagation(); dragType = type; draggedId = id; if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('type', type); e.dataTransfer.setData('id', id); } }
    function handleDragEnd() { dragType = null; draggedId = null; targetDropId = null; targetDropType = null; }
    function handleDragOver(e: DragEvent, dropId: string | null, expectedType: 'field' | 'silo' | 'plant' | 'canvas') { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer) { e.dataTransfer.dropEffect = 'move'; } if (dragType === 'worker' && (expectedType === 'plant' || expectedType === 'canvas')) return; if (dragType === 'silo' && (expectedType === 'silo' || expectedType === 'field')) return; targetDropId = dropId; targetDropType = expectedType; }
    function handleDragLeave() { targetDropId = null; targetDropType = null; }
    
    async function handleDrop(e: DragEvent, dropType: 'field' | 'silo' | 'plant' | 'canvas', dropId: string | null) {
        e.preventDefault(); e.stopPropagation();
        const type = e.dataTransfer?.getData('type') || dragType;
        const id = e.dataTransfer?.getData('id') || draggedId;
        targetDropId = null; targetDropType = null;
        if (!type || !id) return;

        try {
            if (type === 'worker') {
                if (dropType === 'silo') { 
                    $workers = $workers.map(w => w.id === id ? { ...w, assignedSiloId: dropId } : w); 
                    await safeDispatch('ASSIGN_WORKER_TO_SILO', { workerId: id, siloId: dropId });
                } 
                else if (dropType === 'field') { 
                    $workers = $workers.map(w => w.id === id ? { ...w, assignedSiloId: null } : w); 
                    await safeDispatch('ASSIGN_WORKER_TO_SILO', { workerId: id, siloId: null });
                }
            } else if (type === 'silo') {
                if (dropType === 'plant') {
                    const plantSilos = $silos.filter(s => s.assignedPlantId === dropId);
                    if (plantSilos.length >= 2 && !plantSilos.find(s => s.id === id)) { 
                        alert("Synthesis Failed: A Plant can only hold exactly 2 Silos."); 
                    } 
                    else {
                        $silos = $silos.map(s => s.id === id ? { ...s, assignedPlantId: dropId } : s);
                        await safeDispatch('ASSIGN_SILO_TO_PLANT', { siloId: id, plantId: dropId });
                        // ⚡ Instantly update the pairing and liquidity state
                        if (dropId) await updatePlantSynthesis(dropId);
                    }
                } else if (dropType === 'canvas') {
                    const oldPlantId = $silos.find(s => s.id === id)?.assignedPlantId;
                    $silos = $silos.map(s => s.id === id ? { ...s, assignedPlantId: null } : s);
                    await safeDispatch('ASSIGN_SILO_TO_PLANT', { siloId: id, plantId: null });
                    // ⚡ Instantly dismantle the pairing
                    if (oldPlantId) await updatePlantSynthesis(oldPlantId);
                }
            }
        } catch (err) {
            console.error("Action synchronization failed:", err);
        } finally {
            handleDragEnd();
        }
    }

    function handleTrayCopy(e: MouseEvent, textToCopy: string, floatText1: string, floatText2: string) {
        e.stopPropagation();
        navigator.clipboard.writeText(textToCopy).catch(err => console.error("Clipboard copy failed", err));
        
        const id = floatId++;
        floatingTexts = [...floatingTexts, { id, x: e.clientX, y: e.clientY, text1: floatText1, text2: floatText2 }];
        setTimeout(() => { floatingTexts = floatingTexts.filter(f => f.id !== id); }, 2000);
    }

    async function saveInlineRename(workerId: string) {
        if (inlineRenameId === workerId && inlineRenameValue.trim() !== "") {
            const newName = inlineRenameValue.trim();
            const walletWorker = $walletAddress ? `kaspa:${$walletAddress.replace('kaspa:','')}.${newName}` : `kaspa:pending.${newName}`;
            workers.update(wks => wks.map(w => w.id === workerId ? { 
                ...w, name: newName, walletWorker
            } : w));
            await safeDispatch('RENAME_WORKER', { id: workerId, name: newName, walletWorker });
        }
        inlineRenameId = null;
    }

    async function addWorker() { 
        const id = Math.random().toString(36).substring(2, 8).toUpperCase(); 
        const name = `Rig-${id.substring(0,4)}`; 
        const newWorker: Worker = { 
            id, type: 'physical', name, 
            stratumUrl: 'Multi-Tier Stratum Protocol', 
            walletWorker: $walletAddress ? `kaspa:${$walletAddress.replace('kaspa:','')}.${name}` : `kaspa:pending.${name}`, 
            hashRate: 0.00,  
            isOnline: false, 
            assignedSiloId: null
        }; 
        $workers = [...$workers, newWorker]; 
        await safeDispatch('ADD_WORKER', newWorker);
    }

    async function deleteWorker(id: string) { 
        $workers = $workers.filter(w => w.id !== id); 
        closeAllMenus(); 
        await safeDispatch('DELETE_WORKER', { id, workerId: id });
    }

    async function addSilo() { 
        const id = Math.random().toString(36).substring(2, 8).toUpperCase(); 
        const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); 
        const newSilo = { id, name: `Sector Alpha-${id.substring(0,2)}`, width: 4 as SiloWidth, assignedPlantId: null, pendingKaspa: 0, settlementConfig: { ...defaultSettlement, payoutAddress: $walletAddress || '', appointmentDate: tomorrow.toISOString().split('T')[0] } };
        $silos = [...$silos, newSilo]; 
        await safeDispatch('ADD_SILO', newSilo); 
    }
    
    async function addPlant() { 
        if ($silos.length < 2) return; 
        const id = Math.random().toString(36).substring(2, 8).toUpperCase(); 
        const newPlant = { id, name: `Synthesis Plant-${id.substring(0,2)}`, liquidityDeposit: { isActive: false, pairName: 'Awaiting Pairs', totalLiquidityUsd: 0, lockDays: 0, multiplier: 1.0 }, currentApr: 0, autoCompound: true };
        $plants = [...$plants, newPlant]; 
        await safeDispatch('ADD_PLANT', newPlant); 
    }
    
    async function deleteSilo(id: string) { 
        if(confirm("Permanently destroy this Silo? Workers will return to the field.")) { 
            const oldPlantId = $silos.find(s => s.id === id)?.assignedPlantId;
            $workers = $workers.map(w => w.assignedSiloId === id ? { ...w, assignedSiloId: null } : w); 
            $silos = $silos.filter(s => s.id !== id); 
            activeSiloMenu = null; 
            
            try {
                await safeDispatch('DELETE_SILO', { id, siloId: id }); 
                if (oldPlantId) await updatePlantSynthesis(oldPlantId);
            } catch (err) {
                console.error("Action synchronization failed:", err);
            }
        } 
    }
    
    async function deletePlant(id: string) { 
        if(confirm("Dismantle this Plant? Sectors inside will safely return to standalone operation.")) { 
            $silos = $silos.map(s => s.assignedPlantId === id ? { ...s, assignedPlantId: null } : s); 
            $plants = $plants.filter(p => p.id !== id); 
            activePlantMenu = null; 
            
            try {
                await safeDispatch('DELETE_PLANT', { id, plantId: id }); 
            } catch (err) {
                console.error("Action synchronization failed:", err);
            }
        } 
    }
    
    async function toggleSiloWidth(id: string) { 
        let newWidth = 4;
        $silos = $silos.map(s => { 
            if (s.id === id) { newWidth = s.width === 4 ? 6 : s.width === 6 ? 12 : 4; return { ...s, width: newWidth as SiloWidth }; } 
            return s; 
        }); 
        await safeDispatch('RESIZE_SILO', { id, width: newWidth }); 
    }
    
    async function renameSilo(id: string) { 
        const siloIndex = $silos.findIndex(s => s.id === id); 
        if (siloIndex !== -1) { 
            const currentName = $silos[siloIndex].name; 
            const newName = prompt("Enter new Sector name:", currentName); 
            if (newName && newName.trim() !== "") { 
                $silos = $silos.map(s => s.id === id ? { ...s, name: newName.trim() } : s); 
                await safeDispatch('RENAME_SILO', { id, name: newName.trim() }); 
            } 
        } 
        activeSiloMenu = null; 
    }

    function openSettlement(silo: Silo) { 
        settlementModalSilo = silo; 
        if (!silo.settlementConfig) silo.settlementConfig = { ...defaultSettlement, payoutAddress: $walletAddress || '' }; 
        if (!silo.settlementConfig.targetAsset) silo.settlementConfig.targetAsset = coreTokenRegistry[0]; 
        editSettlementParams = JSON.parse(JSON.stringify(silo.settlementConfig)); 
        activeSiloMenu = null; 
        isAssetPickerOpen = false; 
        assetSearchQuery = ''; 
    }
    
    async function saveSettlementParams() { 
        if (settlementModalSilo) { 
            isSigningSettlement = true;
            try {
                const savedType = typeof window !== 'undefined' ? sessionStorage.getItem('perennia_active_wallet_type') : null;
                if (savedType === 'sovereign') {
                    const pass = prompt(`Sovereign Vault Locked.\nEnter local cipher to secure parameters for ${settlementModalSilo.name}:`);
                    if (!pass) throw new Error("Signature Denied");
                }

                $silos = $silos.map(s => { 
                    if (s.id === settlementModalSilo!.id) return { ...s, settlementConfig: editSettlementParams }; 
                    return s; 
                }); 
                await safeDispatch('UPDATE_SETTLEMENT', { id: settlementModalSilo!.id, config: editSettlementParams });
                
                // ⚡ Re-evaluate Plant Synthesis based on new targets
                if (settlementModalSilo.assignedPlantId) {
                    await updatePlantSynthesis(settlementModalSilo.assignedPlantId);
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

    function formatHardwareName(rawType: string | undefined): string {
        if (!rawType) return 'PHYSICAL';
        if (rawType.includes('IceRiverMiner-v1.1')) return 'IceRiver KS0 Ultra';
        if (rawType.includes('IceRiverMiner-v7')) return 'IceRiver KS7 Lite';
        if (rawType.includes('IceRiver')) return rawType.replace('IceRiverMiner-', 'IceRiver KS');
        if (rawType.includes('Goldshell')) return rawType.replace('GoldshellMiner-', 'Goldshell KS');
        return rawType.replace('Miner-', ' ').substring(0, 18);
    }

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
</script>

<svelte:window onclick={closeAllMenus} onscroll={closeAllMenus} oncontextmenu={closeAllMenus} />

{#if contextMenuWorkerId}
    {@const cWorker = $workers.find(w => w.id === contextMenuWorkerId)}
    {#if cWorker}
        <div class="fixed inset-0 z-[9998]" onclick={closeAllMenus} oncontextmenu={(e) => { e.preventDefault(); closeAllMenus(); }} role="presentation"></div>
        
        <div class="fixed z-[9999] w-48 bg-[#1a1a1a] border border-neutral-700 rounded-xl shadow-2xl flex flex-col overflow-hidden animate-[fade-in-up_0.1s_ease-out]"
             style="left: {contextMenuX}px; top: {contextMenuY}px;"
             onmousedown={(e) => e.stopPropagation()} onclick={(e) => e.stopPropagation()} oncontextmenu={(e) => {e.preventDefault(); e.stopPropagation();}}>
            
            <div class="px-3 py-2 border-b border-neutral-800/80 bg-[#111] flex justify-between items-center">
                <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest truncate pr-2">{cWorker.name}</span>
                <span class="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded-md bg-teal-500/20 text-teal-400 border border-teal-900/50">{cWorker.type.substring(0,4)}</span>
            </div>

            {#if !deleteConfirmId}
                <button onclick={(e) => { e.stopPropagation(); const w = cWorker; closeAllMenus(); inlineRenameId = w.id; inlineRenameValue = w.name; }} class="text-left px-3 py-2.5 text-[10px] font-bold text-white hover:bg-[#222] transition-colors border-b border-neutral-800/50 cursor-pointer w-full">Rename Worker</button>
                
                <button onclick={(e) => { e.stopPropagation(); const w = cWorker; closeAllMenus(); stratumModalWorker = w; }} class="text-left px-3 py-2.5 text-[10px] font-bold text-teal-400 hover:bg-[#222] transition-colors cursor-pointer border-b border-neutral-800/50 w-full">Copy Stratum</button>
                {#if cWorker.ipAddress}
                    <button aria-label="Open Miner Interface" onclick={() => { const ip = cWorker.ipAddress; closeAllMenus(); window.open(`http://${ip}`, '_blank'); }} class="text-left px-3 py-2.5 text-[10px] font-bold text-emerald-400 hover:bg-[#222] transition-colors cursor-pointer flex justify-between items-center group border-b border-neutral-800/50 w-full">
                        Open Interface 
                        <span class="text-[12px] font-black opacity-50 group-hover:opacity-100 transition-opacity">↗</span>
                    </button>
                {/if}
                
                <button onclick={(e) => { e.stopPropagation(); deleteConfirmId = cWorker.id; }} class="text-left px-3 py-2.5 text-[10px] font-bold text-red-500 hover:bg-red-950/30 transition-colors cursor-pointer w-full">Delete Worker</button>
            {:else}
                <div class="px-3 py-2 text-[10px] font-bold text-neutral-400 border-b border-neutral-800/50 bg-[#111]">Are you sure?</div>
                <button onclick={() => { const id = cWorker.id; closeAllMenus(); deleteWorker(id); }} class="text-left px-3 py-2.5 text-[10px] font-bold text-white bg-red-600 hover:bg-red-500 transition-colors cursor-pointer border-b border-red-700/50 w-full">Yes, Delete</button>
                <button onclick={(e) => { e.stopPropagation(); deleteConfirmId = null; }} class="text-left px-3 py-2.5 text-[10px] font-bold text-neutral-400 hover:bg-[#222] hover:text-white transition-colors cursor-pointer w-full">Cancel</button>
            {/if}
        </div>
    {/if}
{/if}

{#each floatingTexts as float (float.id)}
    <div class="fixed z-[100000] pointer-events-none flex flex-col items-center gap-1.5"
         style="left: {float.x}px; top: {float.y - 40}px; transform: translateX(-50%);">
        <div class="bg-[#111] text-teal-400 border border-teal-500/50 px-3 py-2 rounded-lg shadow-lg text-[10px] font-mono font-bold animate-float-1 whitespace-nowrap drop-shadow-[0_0_8px_rgba(20,184,166,0.6)]">
            {float.text1}
        </div>
        {#if float.text2}
            <div class="bg-[#111] text-amber-400 border border-amber-500/50 px-3 py-2 rounded-lg shadow-lg text-[10px] font-mono font-bold animate-float-2 whitespace-nowrap drop-shadow-[0_0_8px_rgba(245,158,11,0.6)]">
                {float.text2}
            </div>
        {/if}
    </div>
{/each}

<!-- ======================= -->
<!--  STRATUM CONFIG MODAL   -->
<!-- ======================= -->
{#if stratumModalWorker}
    {@const dynamicWorkerName = $walletAddress ? `kaspa:${$walletAddress.replace('kaspa:','')}.${stratumModalWorker.name}` : `kaspa:pending.${stratumModalWorker.name}`}
    
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <button aria-label="Close Modal" class="absolute inset-0 w-full h-full bg-[#050505]/98 cursor-default border-none" onclick={() => stratumModalWorker = null}></button>
        <div class="relative z-10 w-full max-w-[450px] bg-[#0c0c0c] border border-teal-900/50 rounded-[32px] shadow-2xl p-6 flex flex-col gap-5 animate-[fade-in-up_0.2s_ease-out]">
            <div class="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div class="flex flex-col">
                    <h3 class="text-teal-400 font-bold uppercase tracking-widest text-sm flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                        Stratum Configuration
                    </h3>
                    <span class="text-[9px] text-neutral-500 uppercase tracking-widest mt-1">Multi-Tier Connectivity</span>
                </div>
                <button onclick={() => stratumModalWorker = null} class="text-neutral-500 hover:text-white transition-colors cursor-pointer focus:outline-none mb-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#222]">✕</button>
            </div>
            
            <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-1.5">
                    <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">Tier 1: GPU / Mobile (Port 5551)</span>
                    <div class="flex items-center gap-2 bg-[#161616] border border-neutral-800 rounded-xl p-2.5">
                        <span class="flex-1 font-mono text-xs text-white truncate select-all">stratum+tcp://192.168.0.12:5551</span>
                        <button onclick={(e) => handleTrayCopy(e, 'stratum+tcp://192.168.0.12:5551', 'COPIED TIER 1 URL', '')} class="shrink-0 bg-[#1a1a1a] hover:bg-[#222] border border-neutral-700 hover:border-teal-500/50 text-neutral-400 hover:text-teal-400 px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-colors cursor-pointer shadow-sm">Copy</button>
                    </div>
                </div>

                <div class="flex flex-col gap-1.5">
                    <span class="text-[9px] text-teal-500 uppercase tracking-widest font-bold">Tier 2: Home ASICs (Port 5552)</span>
                    <div class="flex items-center gap-2 bg-[#18C6A5]/10 border border-[#18C6A5]/30 rounded-xl p-2.5">
                        <span class="flex-1 font-mono text-xs text-teal-400 truncate select-all">stratum+tcp://192.168.0.12:5552</span>
                        <button onclick={(e) => handleTrayCopy(e, 'stratum+tcp://192.168.0.12:5552', 'COPIED TIER 2 URL', '')} class="shrink-0 bg-[#1a1a1a] hover:bg-[#222] border border-teal-700/50 hover:border-teal-500 text-teal-400 hover:text-white px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-colors cursor-pointer shadow-sm">Copy</button>
                    </div>
                </div>

                <div class="flex flex-col gap-1.5">
                    <span class="text-[9px] text-amber-500 uppercase tracking-widest font-bold">Tier 3: Industrial ASICs (Port 5553)</span>
                    <div class="flex items-center gap-2 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-xl p-2.5">
                        <span class="flex-1 font-mono text-xs text-amber-400 truncate select-all">stratum+tcp://192.168.0.12:5553</span>
                        <button onclick={(e) => handleTrayCopy(e, 'stratum+tcp://192.168.0.12:5553', 'COPIED TIER 3 URL', '')} class="shrink-0 bg-[#1a1a1a] hover:bg-[#222] border border-amber-700/50 hover:border-amber-500 text-amber-400 hover:text-white px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-colors cursor-pointer shadow-sm">Copy</button>
                    </div>
                </div>

                <div class="h-px bg-neutral-800 my-1"></div>

                <div class="flex flex-col gap-1.5">
                    <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">Wallet.WorkerName</span>
                    <div class="flex items-center gap-2 bg-[#161616] border border-neutral-800 rounded-xl p-3">
                        <span class="flex-1 font-mono text-xs text-white truncate select-all">{dynamicWorkerName}</span>
                        <button onclick={(e) => handleTrayCopy(e, dynamicWorkerName, 'COPIED WORKER ID', '')} class="shrink-0 bg-[#1a1a1a] hover:bg-[#222] border border-neutral-700 hover:border-white/50 text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-colors cursor-pointer shadow-sm">Copy</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}

{#snippet workerCard(worker: Worker)}
{@const isDeployed = worker.assignedSiloId !== null}
{@const assignedSilo = isDeployed ? $silos.find(s => s.id === worker.assignedSiloId) : null}
{@const siloColor = assignedSilo ? (assignedSilo.settlementConfig.targetAsset.theme?.hex || '#18C6A5') : null}

<div draggable={!isDeployed && !inlineRenameId ? "true" : "false"} 
     ondragstart={(e) => { if(!isDeployed && !inlineRenameId) handleDragStart(e, 'worker', worker.id) }} 
     ondragend={handleDragEnd} 
     oncontextmenu={(e) => handleContextMenu(e, worker.id)}
     class="relative border rounded-2xl p-3 shadow-md group transition-colors flex flex-col {contextMenuWorkerId === worker.id ? 'z-50' : 'z-20'}
            {isDeployed ? 'bg-[#050505] border-neutral-900 opacity-60' : 'bg-[#0c0c0c] border-neutral-800/80 hover:border-neutral-600'} 
            {(!isDeployed && !inlineRenameId) ? 'cursor-grab active:cursor-grabbing' : ''}
            {dragType === 'worker' && draggedId === worker.id ? 'opacity-50 border-teal-500' : ''}">
    
    <div class="flex justify-between items-start mb-2 relative pointer-events-none">
        <div class="flex flex-col gap-0.5 min-w-0 flex-1 z-10 pointer-events-none">
            <div class="flex items-center gap-2 pointer-events-auto w-full pr-2">
                <div class="w-2 h-2 rounded-full shrink-0 {worker.isOnline ? 'bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.8)] animate-pulse' : 'bg-neutral-600'}"></div>
                
                {#if inlineRenameId === worker.id}
                    <input type="text" bind:value={inlineRenameValue} onblur={() => saveInlineRename(worker.id)} onkeydown={(e) => { if (e.key === 'Enter') saveInlineRename(worker.id); else if (e.key === 'Escape') inlineRenameId = null; }} onmousedown={(e) => e.stopPropagation()} onclick={(e) => e.stopPropagation()} class="text-xs font-bold text-white bg-[#1a1a1a] border border-teal-500/50 rounded-md px-1.5 py-0.5 outline-none w-[110px] shadow-inner" autofocus />
                {:else}
                    <span class="text-xs font-bold text-white truncate max-w-[80px] xl:max-w-[100px]" title={worker.name}>{worker.name}</span>
                {/if}
            </div>
            {#if worker.hardwareType}
                <span class="text-[7px] font-mono text-teal-500/80 uppercase tracking-widest truncate max-w-[90px] ml-3.5" title={worker.hardwareType}>{formatHardwareName(worker.hardwareType)}</span>
            {/if}
        </div>
        
        <div class="relative pointer-events-auto shrink-0 z-20">
            <button aria-label="Menu" onmousedown={(e) => e.stopPropagation()} onclick={(e) => handleContextMenu(e, worker.id)} class="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-white rounded-full hover:bg-[#222] transition-colors cursor-pointer"><span class="font-bold pb-1 text-sm">⋮</span></button>
        </div>
    </div>
    
    <div class="flex justify-between items-end mt-1 pointer-events-none">
        <div class="flex flex-col gap-1 items-start">
            <span class="text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-md border bg-teal-950/20 text-teal-400 border-teal-900/50">{worker.type.substring(0,4)}</span>
            {#if worker.ipAddress}
                <span class="text-[7px] font-mono text-neutral-600">{worker.ipAddress}</span>
            {/if}
        </div>
        
        <div class="flex flex-col items-end gap-1.5">
            <div class="flex flex-col items-end">
                <span class="text-[7px] uppercase tracking-widest text-neutral-500 font-bold font-mono">Live Hash</span>
                {#if worker.isOnline && worker.hashRate === 0}
                    <span class="text-[9px] font-mono font-bold text-teal-500 animate-pulse mt-0.5 tracking-widest">SYNCING...</span>
                {:else}
                    <span class="text-[11px] font-mono font-black {worker.hashRate > 0 ? 'text-white' : 'text-neutral-600'} tabular-nums leading-none tracking-tight">{worker.hashRate.toFixed(2)} <span class="text-[8px] text-neutral-500 font-normal">TH/s</span></span>
                {/if}
            </div>
            
            <div class="flex gap-3">
                <div class="flex flex-col items-end">
                    <span class="text-[7px] uppercase tracking-widest text-neutral-500 font-bold font-mono">Blocks</span>
                    {#if worker.isOnline && worker.hashRate === 0}
                        <span class="text-[9px] font-mono font-bold text-blue-500 animate-pulse mt-0.5 tracking-widest">SYNC...</span>
                    {:else}
                        <span class="text-[11px] font-mono font-black {(worker.blocksFound || 0) > 0 ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.3)]' : 'text-neutral-600'} tabular-nums leading-none tracking-tight transition-all duration-75">{(worker.blocksFound || 0)}</span>
                    {/if}
                </div>
                <div class="flex flex-col items-end">
                    <span class="text-[7px] uppercase tracking-widest text-neutral-500 font-bold font-mono">Work Shares</span>
                    {#if worker.isOnline && worker.hashRate === 0}
                        <span class="text-[9px] font-mono font-bold text-amber-500 animate-pulse mt-0.5 tracking-widest">SYNC...</span>
                    {:else}
                        <span class="text-[11px] font-mono font-black {(worker.sharesContributed || 0) > 0 ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]' : 'text-neutral-600'} tabular-nums leading-none tracking-tight transition-all duration-75">{(worker.sharesContributed || 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                    {/if}
                </div>
            </div>
        </div>
    </div>

    {#if isDeployed && assignedSilo}
        <div class="mt-3 pt-2.5 border-t border-neutral-800/50 flex justify-between items-center pointer-events-none">
            <span class="text-[8px] uppercase tracking-widest font-bold text-neutral-500">Deployed To</span>
            <div class="flex items-center gap-1.5 bg-[#111] px-2 py-1 rounded-md border border-neutral-800 shadow-inner">
                <div class="w-1.5 h-1.5 rounded-full" style="background-color: {siloColor}"></div>
                <span class="text-[8px] font-bold truncate max-w-[80px]" style="color: {siloColor}">{assignedSilo.name}</span>
            </div>
        </div>
    {:else}
        <div class="mt-3 pt-2.5 border-t border-neutral-800/50 flex justify-between items-center pointer-events-none"></div>
    {/if}
</div>
{/snippet}

{#snippet siloCard(silo: Silo, inPlant: boolean)}
{@const siloWorkers = displayedWorkers.filter(w => w.assignedSiloId === silo.id)}
{@const hashrate = siloWorkers.reduce((sum, w) => sum + w.hashRate, 0)}
{@const targetAsset = silo.settlementConfig.targetAsset}
{@const assetTheme = targetAsset.theme || ClassThemes['Native L1']}
{@const isGlowing = hashrate > 0 && !inPlant}
{@const spanClass = inPlant ? 'w-full h-full' : (silo.width === 4 ? 'col-span-12 lg:col-span-6 xl:col-span-4' : silo.width === 6 ? 'col-span-12 xl:col-span-6' : 'col-span-12')}
{@const isRealtime = silo.settlementConfig.mode === 'stream' && silo.settlementConfig.streamMode === 'realtime'}

<div draggable={!inPlant ? "true" : "false"} ondragstart={(e) => {if(!inPlant) handleDragStart(e, 'silo', silo.id)}} ondragend={handleDragEnd}
     ondragover={(e) => handleDragOver(e, silo.id, 'silo')} ondragleave={handleDragLeave} ondrop={(e) => handleDrop(e, 'silo', silo.id)}
     style={isGlowing ? `box-shadow: 0 0 20px ${assetTheme.hex}20; border-color: ${assetTheme.hex}50;` : ''}
     class="bg-[#111] border rounded-[24px] p-4 flex flex-col gap-3 min-h-[220px] transition-all duration-500 {spanClass}
            {!inPlant ? 'cursor-grab active:cursor-grabbing hover:border-neutral-500 border-neutral-800' : 'border-neutral-800 shadow-inner bg-[#0a0a0a]'} 
            {targetDropId === silo.id && dragType === 'worker' ? 'bg-[#161616] scale-[1.02]' : ''} 
            {dragType === 'silo' && draggedId === silo.id ? 'opacity-50 scale-95' : ''}">
    
    <div class="flex justify-between items-center border-b border-neutral-800/80 pb-3 mb-1 pointer-events-auto">
        <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-500 {hashrate > 0 ? 'animate-pulse' : 'bg-neutral-600'}" style={hashrate > 0 ? `background-color: ${assetTheme.hex}; box-shadow: 0 0 10px ${assetTheme.hex};` : ''}></div>
            <h3 class="text-white font-bold tracking-widest uppercase text-[11px] truncate">{silo.name}</h3>
        </div>
        
        <div class="flex items-center gap-1.5 shrink-0 relative">
            <div class="bg-[#050505] border border-neutral-800 px-2 py-1 rounded-xl pointer-events-none mr-1 flex flex-col items-end">
                <span class="font-mono font-black text-[11px] xl:text-[13px] leading-none transition-colors" style="color: {hashrate > 0 ? assetTheme.hex : '#737373'};">{hashrate.toFixed(2)} <span class="text-[8px] xl:text-[9px] font-normal ml-0.5" style="color: {hashrate > 0 ? assetTheme.hex : '#525252'}; opacity: 0.8;">TH/s</span></span>
            </div>
            {#if !inPlant}
                <div onmousedown={(e) => e.stopPropagation()}>
                    <button aria-label="Resize Sector" onclick={(e) => {e.stopPropagation(); toggleSiloWidth(silo.id);}} class="w-7 h-7 flex items-center justify-center text-neutral-500 hover:text-white rounded-lg hover:bg-[#222] transition-colors cursor-pointer" title="Toggle Size"><span class="font-bold tracking-widest text-[12px]">[ ]</span></button>
                </div>
            {/if}
            <div class="relative">
                <div onmousedown={(e) => e.stopPropagation()}>
                    <button aria-label="Sector Menu" onclick={(e) => { e.stopPropagation(); closeAllMenus(); activeSiloMenu = activeSiloMenu === silo.id ? null : silo.id; }} class="w-7 h-7 flex items-center justify-center text-neutral-500 hover:text-white rounded-full hover:bg-[#222] transition-colors cursor-pointer z-30"><span class="font-bold pb-1 text-sm">⋮</span></button>
                </div>
                {#if activeSiloMenu === silo.id}
                    <div class="absolute top-10 right-0 w-48 bg-[#1a1a1a] border border-neutral-700 rounded-xl shadow-2xl z-40 flex flex-col overflow-hidden" onmousedown={(e) => e.stopPropagation()}>
                        <button aria-label="Rename Sector" onclick={(e) => {e.stopPropagation(); renameSilo(silo.id);}} class="text-left px-3 py-2.5 text-[10px] font-bold text-white hover:bg-[#222] transition-colors cursor-pointer">Rename Sector</button>
                        
                        <!-- ⚡ ALWAYS UNLOCKED: Params menu openable anywhere, including inside Plants -->
                        <button aria-label="Settlement Params" onclick={(e) => {e.stopPropagation(); openSettlement(silo);}} class="text-left px-3 py-2.5 text-[10px] font-bold text-amber-400 hover:bg-[#222] transition-colors cursor-pointer flex justify-between items-center">Settlement Params {#if !silo.settlementConfig?.autoPayout}<div class="w-1.5 h-1.5 rounded-full bg-teal-500" title="Treasury Hold"></div>{/if}</button>
                        
                        {#if inPlant}
                            <button aria-label="Eject from Plant" onclick={async (e) => {
                                e.stopPropagation();
                                markMutation();
                                const oldPlantId = silo.assignedPlantId;
                                $silos = $silos.map(s => s.id === silo.id ? { ...s, assignedPlantId: null } : s); 
                                activeSiloMenu = null; 
                                try { 
                                    await safeDispatch('ASSIGN_SILO_TO_PLANT', { siloId: silo.id, plantId: null }); 
                                    if (oldPlantId) await updatePlantSynthesis(oldPlantId);
                                } catch(err) { console.error(err); }
                            }} class="text-left px-3 py-2.5 text-[10px] font-bold text-emerald-400 hover:bg-[#222] transition-colors cursor-pointer">Eject from Plant</button>
                        {/if}
                        <div class="h-px bg-neutral-800"></div><button aria-label="Dismantle" onclick={(e) => {e.stopPropagation(); deleteSilo(silo.id);}} class="text-left px-3 py-2.5 text-[10px] font-bold text-red-500 hover:bg-[#222] transition-colors cursor-pointer">Dismantle</button>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    {#if !inPlant}
        <div class="w-full border border-neutral-800/80 rounded-xl p-2.5 my-1 flex flex-col gap-2 pointer-events-none relative overflow-hidden transition-colors duration-500 shadow-inner" style="background-color: {isRealtime && hashrate > 0 ? assetTheme.hex + '10' : '#0a0a0a'}; border-color: {isRealtime && hashrate > 0 ? assetTheme.hex + '40' : 'rgba(38,38,38,0.8)'};">
            {#if isRealtime && hashrate > 0}
                <div class="absolute inset-0 bg-[length:10px_10px] animate-[slide_1s_linear_infinite]" style="background-image: linear-gradient(45deg, transparent 25%, {assetTheme.hex}15 50%, transparent 75%, transparent 100%);"></div>
            {/if}
            
            <div class="flex items-center justify-between z-10 w-full">
                <span class="text-[8px] uppercase tracking-widest font-bold flex items-center gap-1.5" style="color: {assetTheme.hex};"><div class="w-1 h-1 rounded-full {isRealtime && hashrate > 0 ? 'animate-ping' : ''}" style="background-color: {assetTheme.hex};"></div> {silo.settlementConfig.targetAsset.ticker} Router</span>
                {#if silo.settlementConfig.autoPayout}
                    <span class="text-[8px] font-mono font-bold flex items-center gap-1" style="color: {isRealtime ? assetTheme.hex : '#f59e0b'};">
                        {#if isRealtime} <svg class="w-2.5 h-2.5 {hashrate > 0 ? 'animate-pulse' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg> STREAM ACTIVE {:else} LIMIT PROTOCOL {/if}
                    </span>
                {:else} <span class="text-[8px] font-mono font-bold text-neutral-500 line-through">PAUSED</span> {/if}
            </div>
            
            <div class="flex flex-col z-10 w-full px-1">
                {#if isRealtime}
                    <div class="flex justify-between items-end">
                        <span class="text-[7px] font-mono text-neutral-500">Streaming to Treasury</span>
                        <span class="text-[10px] font-mono font-black {hashrate > 0 ? 'drop-shadow-md' : 'text-neutral-600'}" style="{hashrate > 0 ? `color: ${assetTheme.hex}` : ''}">
                            +{(hashrate > 0 ? ((hashrate / 350000) * 104) : 0).toFixed(6)} <span class="text-[7px] font-bold opacity-75">KAS /sec</span>
                        </span>
                    </div>
                {:else}
                    <div class="w-full bg-neutral-900 rounded-full h-1 mb-1 overflow-hidden border border-neutral-800">
                        <div class="h-full rounded-full transition-all duration-1000" style="width: {Math.min(100, ((silo.pendingKaspa || 0) / Math.max(silo.settlementConfig?.threshold || 10.0, 0.0001)) * 100)}%; background-color: {assetTheme.hex}; box-shadow: 0 0 8px {assetTheme.hex}80;"></div>
                    </div>
                    <div class="flex justify-between items-end">
                        <span class="text-[7px] font-mono text-neutral-500">Accumulating internally...</span>
                        <span class="text-[9px] font-mono font-bold text-amber-500">{(silo.pendingKaspa || 0).toFixed(6)} <span class="text-neutral-600">/ {(silo.settlementConfig?.threshold ?? 10.0).toFixed(4)} KAS</span></span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    {#if inPlant}
        <div class="w-full bg-[#050505] border border-emerald-900/40 rounded-xl p-2 my-1 flex flex-col gap-2 relative overflow-hidden pointer-events-none transition-colors duration-500">
            <div class="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(52,211,153,0.05)_50%,transparent_75%,transparent_100%)] bg-[length:10px_10px] animate-[slide_1s_linear_infinite]"></div>
            <div class="flex items-center justify-between z-10 w-full">
                <span class="text-[8px] text-emerald-400 uppercase tracking-widest font-bold flex items-center gap-1.5"><div class="w-1 h-1 bg-emerald-500 rounded-full animate-ping"></div> Liquidity Protocol</span>
                <span class="text-[8px] font-mono font-bold text-emerald-400 flex items-center gap-1">AUTO-STAKING LP</span>
            </div>
            <div class="flex items-center justify-between z-10 w-full px-1">
                 <span class="text-[7px] font-mono text-neutral-500 truncate max-w-[120px]">INTERCEPTED BY PLANT</span>
                 <span class="text-[7px] font-bold uppercase tracking-widest text-emerald-500">ACTIVE</span>
            </div>
        </div>
    {/if}

    <div class="grid grid-cols-1 {!inPlant && silo.width === 12 ? 'xl:grid-cols-3' : (!inPlant && silo.width === 6) ? 'xl:grid-cols-2' : 'xl:grid-cols-1'} gap-3 flex-1 relative content-start mt-1 z-10 min-h-[50px]">
        {#if siloWorkers.length === 0} <div class="absolute inset-0 flex items-center justify-center border border-dashed border-neutral-800/50 rounded-xl bg-[#050505] pointer-events-none -z-10"><span class="text-[9px] uppercase tracking-widest text-neutral-600 font-bold">Drag Workers Here</span></div> {/if}
        {#each siloWorkers as worker (worker.id)} {@render workerCard(worker)} {/each}
    </div>
</div>
{/snippet}

<div class="w-full h-full p-4 md:p-6 lg:p-10 overflow-y-auto bg-[#030303]" onclick={closeAllMenus} role="presentation">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-6 w-full max-w-[1600px] mx-auto pb-24 items-start">
        
        <div class="flex flex-col gap-3 lg:col-span-3 xl:col-span-2" ondragover={(e) => handleDragOver(e, 'field', 'field')} ondragleave={handleDragLeave} ondrop={(e) => handleDrop(e, 'field', null)}>
            
            <div class="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                <h2 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">The Field</h2>
                <div class="flex items-center gap-3">
                    <span class="text-[9px] font-mono text-neutral-600">{displayedWorkers.filter(w => w.assignedSiloId === null).length} UNASSIGNED</span>
                </div>
            </div>
            
            <div class="flex flex-row gap-2 w-full">
                <button aria-label="Add Physical Worker" onclick={addWorker} disabled={!$isWalletConnected} class="w-full bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-teal-500/50 text-white text-[9px] font-bold uppercase tracking-widest py-2.5 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">+ ADD HARDWARE RIG</button>
            </div>

            <div class="flex flex-col gap-2.5 min-h-[400px] pb-10 transition-colors duration-300 {targetDropType === 'field' && dragType === 'worker' ? 'border border-dashed border-teal-500/30 rounded-2xl bg-teal-500/5 p-2 -mx-2' : ''}">
                {#if displayedWorkers.length === 0}
                    <div class="flex-1 border border-dashed border-neutral-800/50 rounded-2xl flex items-center justify-center bg-[#050505] p-4 text-center pointer-events-none"><p class="text-[9px] uppercase tracking-widest text-neutral-600 font-bold leading-relaxed">{#if !$isWalletConnected} Connect wallet {:else} No hardware provisioned {/if}</p></div>
                {/if}
                
                {#each displayedWorkers.filter(w => w.assignedSiloId === null) as worker (worker.id)}
                    {@render workerCard(worker)}
                {/each}
            </div>
        </div>

        <div class="flex flex-col gap-4 lg:col-span-6 xl:col-span-8">
            
            {#if $isWalletConnected}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2 animate-[fade-in-up_0.5s_ease-out]">
                    
                    <div class="bg-[#0c0c0c] border border-neutral-800 rounded-[24px] p-4 flex flex-col justify-between h-[240px] shadow-inner relative overflow-hidden group">
                        <div class="flex justify-between items-start relative z-10 pointer-events-none">
                            <div class="flex flex-col">
                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5"><div class="w-1.5 h-1.5 rounded-full {$globalNodeStatus === 'online' ? 'bg-teal-500 animate-pulse' : 'bg-neutral-600'}"></div> Live Hash Power</span>
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
                                <path d={hashratePath} fill="none" stroke="#14b8a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drop-shadow-[0_0_5px_rgba(20,184,166,0.5)]"/>
                                <defs><linearGradient id="hashGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#14b8a6"/><stop offset="100%" stop-color="transparent"/></linearGradient></defs>
                            </svg>
                        </div>
                    </div>

                    <div class="bg-[#0c0c0c] border border-neutral-800 rounded-[24px] p-4 flex flex-col justify-between h-[240px] shadow-inner relative overflow-hidden group">
                        <div class="flex justify-between items-start relative z-10 pointer-events-none">
                            <div class="flex flex-col">
                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5"><div class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div> KAS / USD Price</span>
                                <span class="text-2xl font-mono font-light text-white tracking-tight">${$globalKasPrice.toFixed(4)}</span>
                            </div>
                            <span class="text-[10px] font-bold font-mono px-2 py-1 rounded-lg bg-[#111] border {$globalKasChange >= 0 ? 'text-emerald-400 border-emerald-900/30' : 'text-red-400 border-red-900/30'}">
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
                                <defs><linearGradient id="kasGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color={$globalKasChange >= 0 ? "#10b981" : "#ef4444"}/><stop offset="100%" stop-color="transparent"/></linearGradient></defs>
                            </svg>
                        </div>
                    </div>
                </div>
            {/if}

            <div class="flex items-center justify-between border-b border-neutral-800/80 pb-2 mt-2">
                <h2 class="text-[11px] font-bold uppercase tracking-widest text-teal-500 drop-shadow-[0_0_8px_rgba(20,184,166,0.3)]">Sectors & Synthesis</h2>
                <span class="text-[10px] font-mono text-neutral-600">{$silos.length} SILOS | {$plants.length} PLANTS</span>
            </div>
            <div class="flex gap-3">
                <button aria-label="Add Silo" onclick={addSilo} disabled={!$isWalletConnected} class="flex-1 max-w-[200px] bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-teal-500/50 text-white text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">+ Add Silo</button>
                <button aria-label="Add Plant" onclick={addPlant} disabled={!$isWalletConnected || $silos.length < 2} title={$silos.length < 2 ? 'Requires 2 active Silos to synthesize a Plant' : ''} class="flex-1 max-w-[200px] bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-purple-500/50 text-purple-400 hover:text-purple-300 text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:bg-[#0a0a0a] disabled:border-neutral-900 disabled:text-neutral-700 disabled:cursor-not-allowed">+ Plant</button>
                <button aria-label="Add Nexus" disabled class="flex-1 max-w-[200px] bg-[#0a0a0a] border border-neutral-900 text-neutral-700 text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl cursor-not-allowed hidden" style="display: none;">+ Nexus</button>
            </div>

            <div class="flex-1 border border-neutral-800/50 rounded-[32px] bg-[#0a0a0a] p-4 md:p-6 min-h-[500px] relative shadow-inner w-full" style="background-image: linear-gradient(#14b8a608 1px, transparent 1px), linear-gradient(90deg, #14b8a608 1px, transparent 1px); background-size: 24px 24px;">
                
                {#if !$isWalletConnected}
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 z-20">
                        <div class="w-full max-w-3xl text-center">
                            <h2 class="text-3xl md:text-5xl lg:text-6xl font-light uppercase tracking-[0.1em] text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-white to-amber-500 mb-6 drop-shadow-2xl">Tokenize Anything.<br>Liquidate Everything.</h2>
                            <p class="text-[12px] md:text-sm font-mono text-neutral-400 uppercase tracking-widest leading-relaxed">Connect your Web3 Wallet to initialize the Command Center.</p>
                        </div>
                    </div>
                {:else if $silos.length === 0 && $plants.length === 0}
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6">
                        <h2 class="text-2xl md:text-4xl font-light uppercase tracking-[0.1em] text-white/80 mb-8 drop-shadow-lg text-center">Tokenize Anything.<br><span class="text-teal-500">Liquidate Everything.</span></h2>
                        <div class="relative w-24 h-24 rounded-full bg-teal-500/5 border border-teal-500/20 flex items-center justify-center mb-6 shadow-lg"><svg class="text-teal-500/30 w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg></div>
                        <p class="text-[12px] uppercase tracking-widest text-neutral-500 font-bold text-center leading-relaxed">Workspace Canvas Initialized<br><span class="text-[10px] font-mono text-neutral-600 font-normal mt-2 block">Deploy Sectors to Begin Mining</span></p>
                    </div>
                {:else}
                    <div class="flex flex-col gap-10 relative z-10 w-full h-full">
                        
                        {#if $plants.length > 0}
                            <div class="flex flex-col gap-4 w-full">
                                <h2 class="text-[10px] font-bold uppercase tracking-widest text-purple-500/80 mb-2 border-b border-purple-900/30 pb-2">Synthesis Plants</h2>
                                <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 relative z-10 w-full">
                                    {#each $plants as plant (plant.id)}
                                        {@const plantSilos = $silos.filter(s => s.assignedPlantId === plant.id)}
                                        {@const color1 = plantSilos[0] ? (plantSilos[0].settlementConfig.targetAsset.theme?.pastel || '#18C6A5') : '#a855f7'}
                                        {@const color2 = plantSilos[1] ? (plantSilos[1].settlementConfig.targetAsset.theme?.pastel || '#18C6A5') : '#a855f7'}
                                        
                                        <div ondragover={(e) => handleDragOver(e, plant.id, 'plant')} ondragleave={handleDragLeave} ondrop={(e) => handleDrop(e, 'plant', plant.id)}
                                             style="background-image: linear-gradient(to bottom right, #111, #0a0a0a); box-shadow: 0 0 40px {color1}15, inset 0 0 20px {color2}0a; border-color: {color1}40;"
                                             class="border rounded-[32px] p-6 transition-all duration-500 flex flex-col w-full {targetDropId === plant.id && dragType === 'silo' ? 'scale-[1.02] bg-[#161616]' : ''}">
                                            
                                            <div class="flex justify-between items-center mb-6 border-b border-neutral-800/80 pb-4 shrink-0">
                                                <div class="flex items-center gap-3 pointer-events-none">
                                                    <div class="w-3 h-3 rounded-full {plant.liquidityDeposit.isActive ? 'animate-pulse' : 'bg-neutral-600'}" style={plant.liquidityDeposit.isActive ? `background: linear-gradient(to right, ${color1}, ${color2}); box-shadow: 0 0 12px ${color1};` : ''}></div>
                                                    <h3 class="text-white font-black tracking-widest uppercase text-sm" style={plant.liquidityDeposit.isActive ? `color: ${color1}` : ''}>{plant.name}</h3>
                                                </div>
                                                <div class="flex items-center gap-3 relative">
                                                    <span class="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-xl border {plant.liquidityDeposit.isActive ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400' : 'bg-[#1a1a1a] border-neutral-800 text-neutral-500'}">
                                                        {plant.liquidityDeposit.isActive ? 'Liquidity Synthesized' : 'Awaiting Silos'}
                                                    </span>
                                                    <div class="relative pointer-events-auto">
                                                        <div onmousedown={(e) => e.stopPropagation()}>
                                                            <button aria-label="Plant Menu" onclick={(e) => { e.stopPropagation(); closeAllMenus(); activePlantMenu = activePlantMenu === plant.id ? null : plant.id; }} class="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-white rounded-full hover:bg-[#222] transition-colors cursor-pointer relative"><span class="font-bold pb-1 text-sm">⋮</span></button>
                                                        </div>
                                                        {#if activePlantMenu === plant.id}
                                                            <div class="absolute top-8 right-0 w-48 bg-[#1a1a1a] border border-neutral-700 rounded-xl shadow-2xl z-40 flex flex-col overflow-hidden" onmousedown={(e) => e.stopPropagation()}>
                                                                <button aria-label="Liquidity Params" onclick={(e) => {e.stopPropagation(); openPlantConfig(plant);}} class="text-left px-3 py-2.5 text-[10px] font-bold text-amber-400 hover:bg-[#222] transition-colors cursor-pointer flex justify-between items-center">Liquidity Params</button>
                                                                <div class="h-px bg-neutral-800"></div>
                                                                <button aria-label="Dismantle Plant" onclick={(e) => {e.stopPropagation(); deletePlant(plant.id);}} class="text-left px-3 py-2.5 text-[10px] font-bold text-red-500 hover:bg-[#222] transition-colors cursor-pointer">Dismantle Plant</button>
                                                            </div>
                                                        {/if}
                                                    </div>
                                                </div>
                                            </div>

                                            {#if plant.liquidityDeposit.isActive}
                                                {@const p1 = plantSilos[0]?.pendingKaspa || 0}
                                                {@const p2 = plantSilos[1]?.pendingKaspa || 0}
                                                {@const totalPending = p1 + p2}
                                                {@const target = 0.001} 
                                                {@const pct = Math.min(100, (totalPending / target) * 100)}
                                                
                                                <div class="mb-6 bg-[#0a0a0a] border border-white/10 rounded-2xl p-4 flex flex-col items-center justify-between animate-[fade-in-up_0.3s_ease-out] relative z-10 shrink-0">
                                                    <div class="flex items-center justify-between w-full">
                                                        <div class="flex items-center gap-3">
                                                            <div class="w-2 h-2 rounded-full animate-pulse shadow-md" style="background-color: {color1};"></div>
                                                            <span class="text-[10px] font-bold uppercase tracking-widest text-white">Deposit Auto-Paired</span>
                                                        </div>
                                                        <div class="flex gap-6">
                                                            <div class="flex flex-col items-end">
                                                                <span class="text-[8px] text-neutral-400 uppercase tracking-widest font-bold">Pairing</span>
                                                                <span class="text-sm font-mono font-black text-white">{plant.liquidityDeposit.pairName}</span>
                                                            </div>
                                                            <div class="flex flex-col items-end">
                                                                <span class="text-[8px] text-neutral-400 uppercase tracking-widest font-bold">Total Liquidity</span>
                                                                <span class="text-sm font-mono font-black" style="color: {color1}">${plant.liquidityDeposit.totalLiquidityUsd.toFixed(2)}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div class="w-full mt-3">
                                                        <div class="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden border border-neutral-800">
                                                            <div class="h-full rounded-full transition-all duration-1000" style="width: {pct}%; background: linear-gradient(to right, {color1}, {color2}); box-shadow: 0 0 8px {color1}80;"></div>
                                                        </div>
                                                        <div class="flex justify-between items-end mt-1.5">
                                                            <span class="text-[7px] font-mono text-neutral-500 uppercase tracking-widest">Synthesizing LP Batch...</span>
                                                            <span class="text-[9px] font-mono font-bold text-white">{totalPending.toFixed(5)} <span class="text-neutral-500">/ 0.001 KAS</span></span>
                                                        </div>
                                                    </div>
                                                </div>
                                            {/if}

                                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1 min-h-[220px]">
                                                {#each plantSilos as silo} {@render siloCard(silo, true)} {/each}
                                                {#each Array(2 - plantSilos.length) as _}
                                                    <div class="border-2 border-dashed rounded-[20px] flex flex-col items-center justify-center min-h-[220px] transition-colors pointer-events-none border-white/20 bg-[#050505]">
                                                        <svg class="w-8 h-8 text-neutral-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                                                        <span class="text-neutral-500 font-bold uppercase tracking-widest text-[10px]">Drop Silo Here</span>
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                            {#if $silos.filter(s => s.assignedPlantId === null).length > 0} <div class="w-full h-px bg-neutral-800/50 my-2"></div> {/if}
                        {/if}

                        <div class="flex flex-col gap-4 w-full">
                            {#if $plants.length > 0 && $silos.filter(s => s.assignedPlantId === null).length > 0} <h2 class="text-[10px] font-bold uppercase tracking-widest text-teal-500/80 mb-2 border-b border-teal-900/30 pb-2">Standalone Sectors</h2> {/if}
                            <div ondragover={(e) => handleDragOver(e, 'canvas', 'canvas')} ondragleave={handleDragLeave} ondrop={(e) => handleDrop(e, 'canvas', null)}
                                 class="grid grid-cols-1 md:grid-cols-12 gap-6 relative z-10 content-start w-full min-h-[200px] transition-colors duration-300 {targetDropType === 'canvas' && dragType === 'silo' ? 'bg-teal-500/5 border border-dashed border-teal-500/30 rounded-[32px] p-4 -m-4' : ''}">
                                {#each $silos.filter(s => s.assignedPlantId === null) as silo (silo.id)} 
                                    {@render siloCard(silo, false)} 
                                {/each}
                            </div>
                        </div>
                        
                    </div>
                {/if}
            </div>
        </div>

        <div class="flex flex-col gap-4 lg:col-span-3 xl:col-span-2 min-w-0 bg-[#0a0a0a] border border-neutral-800/50 rounded-[32px] p-5 shadow-2xl h-full pb-20 w-full">
            
            {#if $isWalletConnected}
                <div class="animate-[fade-in-up_0.5s_ease-out] mb-4 w-full flex flex-col">
                    <div class="flex items-center justify-between border-b border-neutral-800/80 pb-3 mb-5 pointer-events-none">
                        <h2 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Hashrate Dist</h2>
                    </div>
                    
                    <div class="flex flex-col items-center pointer-events-auto">
                        <div class="relative w-36 h-36 mb-6 drop-shadow-[0_0_15px_rgba(0,0,0,0.5)] pointer-events-none">
                            <svg viewBox="0 0 100 100" class="w-full h-full transform -rotate-90">
                                <circle cx="50" cy="50" r="40" fill="transparent" stroke="#161616" stroke-width="14"></circle>
                                {#if effortData.segments.length === 0}
                                    <circle cx="50" cy="50" r="40" fill="transparent" stroke="#525252" stroke-width="14" stroke-dasharray="251.327 0"></circle>
                                {/if}
                                {#each effortData.segments as seg}
                                    <circle cx="50" cy="50" r="40" fill="transparent" stroke={seg.hex} stroke-width="14" stroke-dasharray="{seg.pct * 2.51327} {251.327 - (seg.pct * 2.51327)}" stroke-dashoffset={-(seg.offset * 2.51327)} class="transition-all duration-1000 ease-out" stroke-linecap="round"></circle>
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
                            <div class="text-xl xl:text-2xl font-mono font-light text-teal-400 drop-shadow-[0_0_12px_rgba(20,184,166,0.2)] tracking-tighter text-center tabular-nums transition-all truncate w-full px-2">
                                ${totalTreasuryValueUsd.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            </div>
                        </div>
                        
                        <div class="w-full flex flex-col gap-2 pointer-events-auto">
                            
                            <div class="flex flex-col gap-2 w-full max-h-[200px] overflow-y-auto pr-1 hide-scrollbar">
                                {#each effortData.segments as seg}
                                    {@const silo = $silos.find(s => s.id === seg.id)}
                                    {#if silo}
                                        {@const pendingUSD = (silo.pendingKaspa || 0) * $globalKasPrice}
                                        <div class="flex items-stretch gap-1.5 w-full group">
                                            
                                            <div class="flex-1 bg-[#111] hover:bg-[#161616] border border-neutral-800 rounded-lg p-2.5 flex justify-between items-center transition-colors">
                                                <div class="flex items-center gap-2">
                                                    <div class="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style="background-color: {seg.hex}; color: {seg.hex};"></div>
                                                    <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-300 truncate max-w-[60px]">{silo.name}</span>
                                                </div>
                                                <div class="flex flex-col items-end text-right">
                                                    <span class="text-[10px] font-bold font-mono text-white">${pendingUSD.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    {/if}
                                {/each}
                                {#if effortData.segments.length === 0}
                                    <div class="text-center text-[9px] font-mono text-neutral-600 uppercase tracking-widest py-4 border border-dashed border-neutral-800 rounded-xl">No Active Routes</div>
                                {/if}
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <div class="mt-auto pointer-events-none flex flex-col gap-4 w-full">
                <div class="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                    <h2 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">NODE SYNC</h2>
                    <span class="text-[8px] font-mono flex items-center gap-1.5 {$globalNodeStatus === 'online' ? 'text-teal-500' : $globalNodeStatus === 'unreachable' ? 'text-amber-500' : 'text-neutral-600'} transition-colors"><div class="w-1.5 h-1.5 rounded-full {$globalNodeStatus === 'online' ? 'bg-teal-500 animate-pulse' : $globalNodeStatus === 'unreachable' ? 'bg-amber-500' : 'bg-neutral-600'}"></div>{$globalNodeStatus === 'online' ? 'ONLINE' : 'OFFLINE'}</span>
                </div>
            </div>

        </div>
    </div>
</div>

<!-- ========================================== -->
<!-- ⚡ PLANT LIQUIDITY PARAMS MODAL (ADDED)   -->
<!-- ========================================== -->
{#if plantModalPlant}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div class="absolute inset-0 w-full h-full bg-[#050505]/98 cursor-default border-none" onclick={() => plantModalPlant = null}></div>
        
        <div class="relative z-10 w-full max-w-[420px] bg-[#111] border border-purple-900/50 rounded-[28px] shadow-2xl flex flex-col overflow-hidden transition-colors duration-500 border-t-4 border-t-purple-500 animate-[fade-in-up_0.2s_ease-out]">
            <div class="px-6 pt-6 pb-4 border-b border-neutral-800/80">
                <h3 class="text-white font-bold tracking-wide text-md mb-1 text-center truncate">{plantModalPlant.name}</h3>
                <span class="text-[9px] text-purple-400 uppercase tracking-widest text-center block font-bold">Plant Liquidity Parameters</span>
            </div>

            <div class="p-6 flex flex-col gap-5">
                <!-- Current Pair Status -->
                <div class="bg-[#0c0c0c] border border-neutral-800 rounded-xl p-4 flex justify-between items-center shadow-inner">
                    <div class="flex flex-col">
                        <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">Synthesized Pair</span>
                        <span class="text-xs font-bold text-white font-mono">{plantModalPlant.liquidityDeposit.pairName}</span>
                    </div>
                    <div class="flex flex-col items-end">
                        <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">Status</span>
                        <span class="text-[10px] font-mono font-bold {plantModalPlant.liquidityDeposit.isActive ? 'text-emerald-400' : 'text-neutral-500'}">
                            {plantModalPlant.liquidityDeposit.isActive ? 'Active Yielding' : 'Awaiting 2 Silos'}
                        </span>
                    </div>
                </div>

                <!-- Stake Duration / Multiplier Slider -->
                <div class="flex flex-col gap-3 bg-[#0a0a0a] border border-neutral-800 rounded-xl p-4 shadow-inner">
                    <div class="flex justify-between items-center">
                        <span class="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Stake Lock Duration</span>
                        <span class="text-xs font-mono font-black text-purple-400">{lockOptions[plantLockDurationIndex].label} ({lockOptions[plantLockDurationIndex].multiplier}x APR)</span>
                    </div>
                    <input type="range" min="0" max="3" step="1" bind:value={plantLockDurationIndex} class="myst-slider-teal w-full" />
                    <div class="flex justify-between text-[9px] font-bold uppercase tracking-widest text-neutral-500 mt-1">
                        <span>Flex (1.0x)</span>
                        <span>30D (1.2x)</span>
                        <span>90D (1.5x)</span>
                        <span>1YR (2.5x)</span>
                    </div>
                </div>

                <!-- Auto-Compound Switch -->
                <div class="flex items-center justify-between bg-[#0c0c0c] border border-neutral-800 rounded-xl p-4">
                    <div class="flex flex-col">
                        <span class="text-[10px] uppercase tracking-widest text-neutral-300 font-bold">Auto-Compounding APR</span>
                        <span class="text-[9px] text-neutral-600 leading-tight mt-0.5">Reinvest yield back into liquidity pool.</span>
                    </div>
                    <button aria-label="Toggle Auto-Compound" onclick={() => editPlantParams.autoCompound = !editPlantParams.autoCompound} class="w-10 h-5 rounded-full border transition-colors duration-300 relative {editPlantParams.autoCompound ? 'bg-purple-500/20 border-purple-500/50' : 'bg-neutral-900 border-neutral-700'} cursor-pointer focus:outline-none">
                        <div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all duration-300 shadow-sm {editPlantParams.autoCompound ? 'bg-purple-500 left-[22px]' : 'bg-neutral-500 left-1'}"></div>
                    </button>
                </div>
            </div>

            <div class="flex gap-3 px-6 pb-6 pt-2 bg-[#111]">
                <button aria-label="Cancel" onclick={() => plantModalPlant = null} class="flex-1 py-3 bg-[#161616] hover:bg-[#222] border border-neutral-800 text-neutral-400 hover:text-white font-bold uppercase tracking-widest text-[10px] rounded-xl transition-colors cursor-pointer">Cancel</button>
                <button aria-label="Save" onclick={savePlantParams} class="flex-[2] py-3 bg-purple-600 hover:bg-purple-500 text-white font-black uppercase tracking-widest text-[10px] rounded-xl transition-colors cursor-pointer shadow-[0_0_15px_rgba(168,85,247,0.3)]">
                    Save Parameters
                </button>
            </div>
        </div>
    </div>
{/if}

{#if settlementModalSilo && editSettlementParams}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div class="absolute inset-0 w-full h-full bg-[#050505]/98 cursor-default border-none" onclick={() => {settlementModalSilo = null; isAssetPickerOpen = false; editSettlementParams = {...defaultSettlement}; isSigningSettlement = false;}}></div>
        
        {#if !isAssetPickerOpen}
            <div class="relative z-10 w-full max-w-[420px] bg-[#111] border border-neutral-800 rounded-[28px] shadow-2xl flex flex-col overflow-hidden transition-colors duration-500 border-t-4 {editSettlementParams.autoPayout ? (editSettlementParams.mode === 'stream' ? 'border-t-emerald-500' : editSettlementParams.mode === 'appointment' ? 'border-t-blue-500' : 'border-t-amber-500') : 'border-t-neutral-600'} animate-[fade-in-up_0.2s_ease-out]">
                <div class="px-6 pt-6 pb-4 border-b border-neutral-800/80">
                    <h3 class="text-white font-bold tracking-wide text-md mb-1 text-center truncate">{settlementModalSilo.name}</h3>
                    <span class="text-[9px] text-neutral-500 uppercase tracking-widest text-center block font-bold">Settlement Protocol</span>
                </div>
                <div class="p-6 flex flex-col gap-5">
                    
                    <div class="flex flex-col gap-1.5">
                        <span class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1 block">Target Asset Route</span>
                        
                        <button aria-label="Target Asset Route" onclick={() => {isAssetPickerOpen = true; assetSearchQuery = '';}} class="w-full bg-[#0c0c0c] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-white/20 rounded-xl px-4 py-3 flex items-center justify-between transition-colors cursor-pointer group shadow-inner">
                            <div class="flex items-center gap-3">
                                <div class="w-7 h-7 rounded-full bg-[#111] border border-neutral-800 flex items-center justify-center text-[11px] font-black overflow-hidden" style="color: {editSettlementParams.targetAsset.theme?.hex || '#ffffff'};">
                                    {#if editSettlementParams.targetAsset.imgUrl}
                                        <img src={editSettlementParams.targetAsset.imgUrl} class="w-4 h-4 object-contain" alt="logo" onerror={(e) => handleTokenIconError(e, editSettlementParams!.targetAsset.ticker)} />
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
                    <div class="flex bg-[#0a0a0a] rounded-xl p-1 border border-neutral-800 {editSettlementParams.autoPayout ? '' : 'opacity-50 pointer-events-none'} transition-opacity shadow-inner">
                        <button aria-label="Threshold Mode" onclick={() => editSettlementParams!.mode = 'threshold'} class="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all {editSettlementParams.mode === 'threshold' ? 'bg-[#1a1a1a] text-amber-400 shadow-md border border-neutral-800' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Limit</button>
                        <button aria-label="Stream Mode" onclick={() => editSettlementParams!.mode = 'stream'} class="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all {editSettlementParams.mode === 'stream' ? 'bg-[#1a1a1a] text-teal-400 shadow-md border border-neutral-800' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Stream</button>
                        <button aria-label="Appointment Mode" onclick={() => editSettlementParams!.mode = 'appointment'} class="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all {editSettlementParams.mode === 'appointment' ? 'bg-[#1a1a1a] text-blue-400 shadow-md border border-neutral-800' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Appt.</button>
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
                                <button aria-label="Real Time Stream" onclick={() => editSettlementParams!.streamMode = 'realtime'} class="py-2.5 rounded-lg border text-[9px] font-bold uppercase tracking-widest transition-all {editSettlementParams.streamMode === 'realtime' ? 'bg-teal-950/40 border-teal-500 text-teal-400' : 'bg-[#0c0c0c] border-neutral-800 text-neutral-500 hover:border-neutral-700 cursor-pointer'}">Real-Time</button>
                                <button aria-label="Interval Stream" onclick={() => editSettlementParams!.streamMode = 'interval'} class="py-2.5 rounded-lg border text-[9px] font-bold uppercase tracking-widest transition-all {editSettlementParams.streamMode === 'interval' ? 'bg-teal-950/40 border-teal-500 text-teal-400' : 'bg-[#0c0c0c] border-neutral-800 text-neutral-500 hover:border-neutral-700 cursor-pointer'}">Interval</button>
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

                    <div class="flex items-center justify-between bg-[#0c0c0c] border border-neutral-800 rounded-xl p-4 mt-2">
                        <div class="flex flex-col"><span class="text-[10px] uppercase tracking-widest text-neutral-300 font-bold">Auto-Settlement Pipeline</span><span class="text-[9px] text-neutral-600 leading-tight mt-0.5">Route yields actively to wallet.</span></div>
                        <button aria-label="Toggle Auto Payout" onclick={() => editSettlementParams!.autoPayout = !editSettlementParams!.autoPayout} class="w-10 h-5 rounded-full border transition-colors duration-300 relative {editSettlementParams.autoPayout ? 'bg-amber-500/20 border-amber-500/50' : 'bg-neutral-900 border-neutral-700'} cursor-pointer focus:outline-none"><div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all duration-300 shadow-sm {editSettlementParams.autoPayout ? 'bg-amber-500 left-[22px]' : 'bg-neutral-500 left-1'}"></div></button>
                    </div>
                </div>

                <div class="flex gap-3 px-6 pb-6 pt-2 bg-[#111]">
                    <button aria-label="Cancel" onclick={() => {settlementModalSilo = null; isAssetPickerOpen = false; editSettlementParams = {...defaultSettlement}; isSigningSettlement = false;}} class="flex-1 py-3 bg-[#161616] hover:bg-[#222] border border-neutral-800 text-neutral-400 hover:text-white font-bold uppercase tracking-widest text-[10px] rounded-xl transition-colors cursor-pointer">Cancel</button>
                    <button aria-label="Save" onclick={saveSettlementParams} disabled={isSigningSettlement} class="flex-[2] py-3 text-black font-black uppercase tracking-widest text-[10px] rounded-xl transition-colors cursor-pointer disabled:opacity-50 {editSettlementParams.autoPayout ? (editSettlementParams.mode === 'stream' ? 'bg-teal-500 hover:bg-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.3)]' : editSettlementParams.mode === 'appointment' ? 'bg-blue-500 hover:bg-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-amber-500 hover:bg-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]') : 'bg-teal-500 hover:bg-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.2)]'}">
                        {#if isSigningSettlement}
                            Awaiting Signature...
                        {:else}
                            Update Protocol
                        {/if}
                    </button>
                </div>
            </div>

        {:else}
            <!-- ⚡ UNIFIED ON-CHAIN ASSET SEARCH MODAL -->
            <div class="relative z-10 w-full max-w-[420px] bg-[#111] border border-neutral-800 rounded-[28px] shadow-2xl flex flex-col overflow-hidden h-[500px] animate-[fade-in-up_0.2s_ease-out]">
                
                <div class="p-4 border-b border-neutral-800/80 flex items-center justify-between bg-[#0a0a0a]">
                    <button aria-label="Back" onclick={() => { isAssetPickerOpen = false; assetSearchQuery = ''; }} class="w-8 h-8 rounded-full hover:bg-[#222] flex items-center justify-center text-neutral-400 transition-colors cursor-pointer">←</button>
                    <h3 class="font-bold tracking-wide text-sm text-center uppercase text-white">Target Asset Matrix</h3>
                    <div class="w-8"></div>
                </div>
                
                <div class="p-4 border-b border-neutral-800/80 bg-[#0c0c0c]">
                    <div class="relative">
                        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                        <input aria-label="Asset Search" type="text" bind:value={assetSearchQuery} placeholder="Search ticker or address..." class="w-full bg-[#1a1a1a] border border-neutral-800 focus:border-[#18C6A5]/50 rounded-xl pl-9 pr-4 py-3 text-[11px] font-mono text-white outline-none transition-colors" />
                    </div>
                </div>
                
                <div class="flex-1 overflow-y-auto p-2 bg-[#111]">
                    <div class="flex flex-col gap-1">
                        {#each filteredAssets as asset}
                            <button aria-label="Select Asset" onclick={() => { editSettlementParams!.targetAsset = asset; isAssetPickerOpen = false; assetSearchQuery = ''; }} class="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#1a1a1a] transition-colors cursor-pointer group border border-transparent hover:border-neutral-800">
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
        {/if}
    </div>
{/if}

<style>
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
    @keyframes fade-in-down { 0% { opacity: 0; transform: translateY(-10px); } 100% { opacity: 1; transform: translateY(0); } }

    @keyframes float-up-1 {
        0% { opacity: 0; transform: translateY(10px) scale(0.9); }
        15% { opacity: 1; transform: translateY(0px) scale(1); }
        85% { opacity: 1; transform: translateY(-20px) scale(1); }
        100% { opacity: 0; transform: translateY(-30px) scale(0.9); }
    }
    
    @keyframes float-up-2 {
        0% { opacity: 0; transform: translateY(20px) scale(0.9); }
        15% { opacity: 0; transform: translateY(20px) scale(0.9); }
        30% { opacity: 1; transform: translateY(0px) scale(1); }
        85% { opacity: 1; transform: translateY(-20px) scale(1); }
        100% { opacity: 0; transform: translateY(-30px) scale(0.9); }
    }
    
    :global(.animate-float-1) { animation: float-up-1 2s ease-out forwards; }
    :global(.animate-float-2) { animation: float-up-2 2s ease-out forwards; }
    
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>