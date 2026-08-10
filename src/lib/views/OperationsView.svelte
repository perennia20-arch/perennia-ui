<script lang="ts">
    import { source } from 'sveltekit-sse';
    import { workers, silos, plants, systemMode, adminGlobalView, tokenRegistry, globalKasPrice, globalKasChange, globalNetworkHashrate, globalNodeStatus, walletInventory, type Worker, type Silo, type Plant, type SettlementConfig, type TokenAsset, type AssetClass, type SiloWidth, type WalletInventoryItem } from '$lib/stores/app';
    import { isWalletConnected, walletAddress, walletBalance, showWalletModal, executeOmniChainSwap, DEV_ADMIN_BYPASS, MASTER_ADMIN_ADDRESS } from '$lib/stores/wallet';
    import { fade, slide } from 'svelte/transition';
    import { onMount, onDestroy } from 'svelte';
    import { get } from 'svelte/store';
    import { browser } from '$app/environment';

    // Context Menu State
    let contextMenuWorkerId = $state<string | null>(null);
    let contextMenuX = $state(0);
    let contextMenuY = $state(0);
    let deleteConfirmId = $state<string | null>(null);

    let activeSiloMenu = $state<string | null>(null);
    let activePlantMenu = $state<string | null>(null);
    let inlineRenameId = $state<string | null>(null);
    let inlineRenameValue = $state<string>('');
    let isSigningSettlement = $state(false);

    // Popup Modals State
    let stratumModalWorker = $state<Worker | null>(null);
    let tokenModalWorker = $state<{ worker: Worker, type: 'add' | 'sub' } | null>(null);
    let trayTokenAmount = $state<number | ''>('');

    let selectedSilosForSweep = $state<Record<string, boolean>>({});
    
    let totalPendingKAS = $derived($silos.reduce((acc, s) => acc + (s.pendingKaspa || 0), 0));
    let totalPendingUSD = $derived(totalPendingKAS * ($globalKasPrice || 0));

    let isCorporateAdmin = $derived(DEV_ADMIN_BYPASS || ($walletAddress && $walletAddress.toLowerCase() === MASTER_ADMIN_ADDRESS.toLowerCase()));
    
    let displayedWorkers = $derived(
        isCorporateAdmin && $adminGlobalView 
            ? $workers 
            : $workers.filter(worker => worker.walletWorker.toLowerCase().includes($walletAddress?.replace('kaspa:', '').toLowerCase() || 'pending'))
    );
    
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

    const defaultSettlement: SettlementConfig = { targetAsset: tokenRegistry[0], payoutAddress: '', autoPayout: true, mode: 'stream', threshold: 0.0005, streamMode: 'realtime', streamValue: 1, streamUnit: 'hours', appointmentDate: '', appointmentTime: '17:00' };
    let settlementModalSilo = $state<Silo | null>(null);
    let editSettlementParams = $state<SettlementConfig>({ ...defaultSettlement });

    let isAssetPickerOpen = $state(false);
    let assetPickerStep = $state<'class' | 'asset'>('class');
    let selectedAssetClass = $state<string | null>(null);
    let assetSearchQuery = $state('');
    
    let uniqueClasses = $derived(Array.from(new Set(tokenRegistry.map(t => t.assetClass))));
    let filteredAssets = $derived(tokenRegistry.filter(a => 
        (selectedAssetClass ? a.assetClass === selectedAssetClass : true) &&
        (a.ticker.toLowerCase().includes(assetSearchQuery.toLowerCase()) || a.name.toLowerCase().includes(assetSearchQuery.toLowerCase()))
    ));

    const assetColors: Record<string, { hex: string, pastel: string }> = {
        'Crypto': { hex: '#14b8a6', pastel: '#99f6e4' },     
        'Fiat': { hex: '#3b82f6', pastel: '#bfdbfe' },        
        'Commodities': { hex: '#eab308', pastel: '#fef08a' }, 
        'Energy': { hex: '#f97316', pastel: '#fdba74' }       
    };

    let hashHistory = $state<number[]>([]);
    let kasHistory = $state<number[]>([]);

    function buildSvgPath(data: number[], width: number, height: number): string {
        if (!data || data.length === 0) return '';
        const validData = data.filter(v => v !== 0);
        const max = validData.length > 0 ? Math.max(...validData) * 1.05 : 1; 
        const min = validData.length > 0 ? Math.min(...validData) * 0.95 : 0;
        const range = max - min || 1;
        return data.map((d, i) => { const x = (i / (Math.max(1, data.length - 1))) * width; const y = d === 0 ? height : height - ((d - min) / range) * height; return `${i === 0 ? 'M' : 'L'} ${x},${y}`; }).join(' ');
    }

    let hashratePath = $derived(buildSvgPath(hashHistory, 200, 240));
    let pricePath = $derived(buildSvgPath(kasHistory, 200, 240));

    let effortData = $derived.by(() => {
        let segments: { id: string, name: string, pct: number, offset: number, hex: string }[] = [];
        let totalHash = displayedWorkers.filter(w => w.isOnline && w.assignedSiloId).reduce((acc, w) => acc + w.hashRate, 0);
        
        if (totalHash > 0) {
            let currentOffset = 0;
            $silos.forEach(silo => {
                const siloHash = displayedWorkers.filter(w => w.assignedSiloId === silo.id && w.isOnline).reduce((acc, w) => acc + w.hashRate, 0);
                if (siloHash > 0) {
                    const pct = (siloHash / totalHash) * 100;
                    
                    const inPlant = silo.assignedPlantId !== null;
                    const classTheme = assetColors[silo.settlementConfig.targetAsset.assetClass as string] || { hex: '#a855f7', pastel: '#d8b4fe' };
                    
                    segments.push({ 
                        id: silo.id,
                        name: silo.name, 
                        pct, 
                        offset: currentOffset, 
                        hex: inPlant ? classTheme.pastel : classTheme.hex
                    });
                    currentOffset += pct;
                }
            });
        }
        return { segments, totalHash };
    });

    $effect(() => {
        $silos.forEach(s => {
            if (selectedSilosForSweep[s.id] === undefined) {
                selectedSilosForSweep[s.id] = true;
            }
        });
    });

    $effect(() => {
        if (browser && $isWalletConnected) {
            const hasSyncingCapital = $workers.some(w => w.type === 'capital' && w.isOnline && w.hashRate === 0);
            if (hasSyncingCapital) {
                const timer = setInterval(() => {
                    fetch(`/api/state`)
                        .then(r => r.json())
                        .then(data => {
                            if (data.workers) {
                                workers.update(current => {
                                    let stillSyncing = false;
                                    const next = current.map(w => {
                                        if (w.type === 'capital' && w.isOnline && w.hashRate === 0) {
                                            const backendWorker = data.workers.find((bw: any) => bw.id === w.id);
                                            if (backendWorker && backendWorker.hashRate > 0) {
                                                return { ...w, hashRate: backendWorker.hashRate, isOnline: backendWorker.isOnline, capitalTokens: backendWorker.capitalTokens };
                                            } else if (backendWorker && backendWorker.hashRate === 0 && !backendWorker.isOnline) {
                                                return { ...w, hashRate: 0, isOnline: false, capitalTokens: backendWorker.capitalTokens };
                                            } else {
                                                stillSyncing = true;
                                            }
                                        }
                                        return w;
                                    });
                                    if (!stillSyncing) clearInterval(timer);
                                    return next;
                                });
                            }
                        }).catch(() => {});
                }, 3000);
                return () => clearInterval(timer);
            }
        }
    });

    let floatingTexts = $state<{ id: number, x: number, y: number, text1: string, text2: string }[]>([]);
    let floatId = 0;

    function processTelemetryData(data: any) {
        const isConnected = get(isWalletConnected);

        globalNetworkHashrate.set((data.pool?.totalHashrate || data.totalHashrate || 0) / 1e12);
        globalNodeStatus.set('online');

        if (!isConnected) return;

        workers.update(currentWorkers => {
            let updated = currentWorkers.map(w => {
                if (w.type === 'physical') {
                    const bw = (data.workers || []).find((b: any) => 
                        b.fullIdentity === w.walletWorker || 
                        b.fullIdentity?.toLowerCase() === w.walletWorker.toLowerCase() ||
                        (b.name && w.name && b.name.toLowerCase() === w.name.toLowerCase())
                    );
                    
                    if (bw) {
                        const rawHash = bw.trackingRate || bw.hashrate || bw.hashRate || 0;
                        return { 
                            ...w, 
                            hashRate: rawHash / 1e12,
                            sharesContributed: bw.sharesContributed || bw.shares || 0,
                            blocksFound: bw.blocksFound || bw.blocks || 0,
                            hardwareType: bw.hardwareType || w.hardwareType || 'IceRiver KS',
                            isOnline: true 
                        } as any; 
                    }
                    return { ...w, hashRate: 0, isOnline: false };
                }
                return w; 
            });

            if (data.workers) {
                data.workers.forEach((bw: any) => {
                    if (!updated.find(w => w.walletWorker.toLowerCase() === bw.fullIdentity.toLowerCase() || w.name.toLowerCase() === (bw.name || '').toLowerCase())) {
                        const rawHash = bw.trackingRate || bw.hashrate || bw.hashRate || 0;
                        updated.push({
                            id: Math.random().toString(36).substring(2, 8).toUpperCase(),
                            type: 'physical',
                            name: bw.name || bw.fullIdentity.split('.')[1] || 'Worker',
                            stratumUrl: 'Multi-Tier Stratum Protocol',
                            walletWorker: bw.fullIdentity,
                            hashRate: rawHash / 1e12,
                            isOnline: true,
                            assignedSiloId: null, 
                            sharesContributed: bw.sharesContributed || bw.shares || 0,
                            blocksFound: bw.blocksFound || bw.blocks || 0,
                            hardwareType: bw.hardwareType || 'IceRiver KS'
                        } as any);
                    }
                });
            }

            const nameGroups: Record<string, any[]> = {};
            updated.forEach(w => {
                if (!nameGroups[w.name]) nameGroups[w.name] = [];
                nameGroups[w.name].push(w);
            });

            let finalWorkers: any[] = [];
            for (const [name, group] of Object.entries(nameGroups)) {
                if (group.length > 1) {
                    const bestWorker = group.reduce((prev, current) => {
                        if (current.hashRate > prev.hashRate) return current;
                        if (current.assignedSiloId && !prev.assignedSiloId) return current;
                        if (current.walletWorker.includes('pending') && !prev.walletWorker.includes('pending')) return current;
                        return prev;
                    });
                    finalWorkers.push(bestWorker);
                } else {
                    finalWorkers.push(group[0]);
                }
            }
            return finalWorkers;
        });
    }

    // ⚡ FIX: The Async Reconnection Engine
    // Automatically re-establishes SSE the moment the wallet address hydrates from local storage
    $effect(() => {
        if (browser && $isWalletConnected && $walletAddress) {
            const connection = source(`/api/telemetry?address=${encodeURIComponent($walletAddress)}`);
            
            const unsubscribe = connection.select('message').subscribe((rawData) => {
                if (!rawData) return;
                try {
                    const parsed = JSON.parse(rawData);
                    if (parsed.error) {
                        console.warn("SSE Rejected:", parsed.error);
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

    let unsubs: any[] = [];

    onMount(() => { 
        hashHistory = Array(30).fill(get(globalNetworkHashrate));
        kasHistory = Array(30).fill(get(globalKasPrice));
        unsubs.push(globalNetworkHashrate.subscribe(v => { hashHistory = [...hashHistory.slice(1), v]; }));
        unsubs.push(globalKasPrice.subscribe(v => { kasHistory = [...kasHistory.slice(1), v]; }));

        const capitalPoll = setInterval(() => {
            if (get(isWalletConnected) && get(walletAddress)) {
                fetch(`/api/state`).then(r => r.json()).then(parsed => {
                    if (parsed.workers) {
                        workers.update(wks => wks.map(w => {
                            if (w.type === 'capital') {
                                const dbWorker = parsed.workers.find((bw: any) => bw.id === w.id);
                                if (dbWorker) return { ...w, capitalTokens: dbWorker.capitalTokens, hashRate: dbWorker.hashRate, isOnline: dbWorker.isOnline };
                            }
                            return w;
                        }));
                    }
                }).catch(()=>{});
            }
        }, 15000);
        unsubs.push(() => clearInterval(capitalPoll));
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
    
    function handleDrop(e: DragEvent, dropType: 'field' | 'silo' | 'plant' | 'canvas', dropId: string | null) {
        e.preventDefault(); e.stopPropagation();
        const type = e.dataTransfer?.getData('type') || dragType;
        const id = e.dataTransfer?.getData('id') || draggedId;
        targetDropId = null; targetDropType = null;
        if (!type || !id) return;

        if (type === 'worker') {
            if (dropType === 'silo') { $workers = $workers.map(w => w.id === id ? { ...w, assignedSiloId: dropId } : w); } 
            else if (dropType === 'field') { $workers = $workers.map(w => w.id === id ? { ...w, assignedSiloId: null } : w); }
            
            if ($walletAddress) {
                fetch(`/api/state`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        workers: $workers,
                        silos: $silos,
                        plants: $plants,
                        systemMode: $systemMode
                    })
                }).catch(()=>{});
            }
        } else if (type === 'silo') {
            if (dropType === 'plant') {
                const plantSilos = $silos.filter(s => s.assignedPlantId === dropId);
                if (plantSilos.length >= 2 && !plantSilos.find(s => s.id === id)) { alert("Synthesis Failed: A Plant can only hold exactly 2 Silos."); } 
                else {
                    $silos = $silos.map(s => s.id === id ? { ...s, assignedPlantId: dropId } : s);
                    const updatedSilos = $silos.filter(s => s.assignedPlantId === dropId);
                    if (updatedSilos.length === 2) { 
                        const pairName = `${updatedSilos[0].settlementConfig.targetAsset.ticker}/${updatedSilos[1].settlementConfig.targetAsset.ticker} LP`;
                        $plants = $plants.map(p => p.id === dropId ? { ...p, liquidityDeposit: { isActive: true, pairName: pairName, totalLiquidityUsd: 12450.00 }, currentApr: 14.2 } : p); 
                    }
                }
            } else if (dropType === 'canvas') {
                const oldPlantId = $silos.find(s => s.id === id)?.assignedPlantId;
                $silos = $silos.map(s => s.id === id ? { ...s, assignedPlantId: null } : s);
                if (oldPlantId) { $plants = $plants.map(p => p.id === oldPlantId ? { ...p, liquidityDeposit: { isActive: false, pairName: 'Awaiting Pairs', totalLiquidityUsd: 0 }, currentApr: 0 } : p); }
            }
            
            if ($walletAddress) {
                fetch(`/api/state`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        workers: $workers,
                        silos: $silos,
                        plants: $plants,
                        systemMode: $systemMode
                    })
                }).catch(()=>{});
            }
        }
        handleDragEnd();
    }

    function handleTrayCopy(e: MouseEvent, textToCopy: string, floatText1: string, floatText2: string) {
        e.stopPropagation();
        navigator.clipboard.writeText(textToCopy).catch(err => console.error("Clipboard copy failed", err));
        
        const id = floatId++;
        floatingTexts = [...floatingTexts, { id, x: e.clientX, y: e.clientY, text1: floatText1, text2: floatText2 }];
        setTimeout(() => { floatingTexts = floatingTexts.filter(f => f.id !== id); }, 2000);
    }

    function saveInlineRename(workerId: string) {
        if (inlineRenameId === workerId && inlineRenameValue.trim() !== "") {
            const newName = inlineRenameValue.trim();
            workers.update(wks => wks.map(w => w.id === workerId ? { 
                ...w, name: newName, walletWorker: $walletAddress ? `kaspa:${$walletAddress.replace('kaspa:','')}.${newName}` : `kaspa:pending.${newName}`
            } : w));
            
            if ($walletAddress) {
                fetch(`/api/state`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workers: get(workers), silos: get(silos), plants: get(plants), systemMode: get(systemMode) })
                }).catch(()=>{});
            }
        }
        inlineRenameId = null;
    }

    function processTokenAction() {
        if (!tokenModalWorker || !trayTokenAmount) return;
        const amount = parseFloat(trayTokenAmount.toString());
        if (amount > 0) {
            workers.update(wks => wks.map(w => {
                if (w.id === tokenModalWorker!.worker.id) {
                    const currentTokens = w.capitalTokens || 0;
                    const newTokens = tokenModalWorker!.type === 'add' ? currentTokens + amount : Math.max(0, currentTokens - amount);
                    const isOnline = newTokens > 0;
                    
                    return { ...w, hashRate: isOnline ? 0 : 0, isOnline, capitalTokens: newTokens };
                }
                return w;
            }));

            if ($walletAddress) {
                fetch(`/api/state`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ workers: get(workers), silos: get(silos), plants: get(plants), systemMode: get(systemMode) })
                }).catch(()=>{});
            }
        }
        tokenModalWorker = null;
        trayTokenAmount = '';
    }

    function addSilo() { const id = Math.random().toString(36).substring(2, 8).toUpperCase(); const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); $silos = [...$silos, { id, name: `Sector Alpha-${id.substring(0,2)}`, width: 4, assignedPlantId: null, pendingKaspa: 0, settlementConfig: { ...defaultSettlement, payoutAddress: $walletAddress || '', appointmentDate: tomorrow.toISOString().split('T')[0] } }]; }
    function addPlant() { if ($silos.length < 2) return; const id = Math.random().toString(36).substring(2, 8).toUpperCase(); $plants = [...$plants, { id, name: `Synthesis Plant-${id.substring(0,2)}`, liquidityDeposit: { isActive: false, pairName: 'Awaiting Pairs', totalLiquidityUsd: 0 }, currentApr: 0, autoCompound: true }]; }
    function deleteSilo(id: string) { if(confirm("Permanently destroy this Silo? Workers will return to the field.")) { $workers = $workers.map(w => w.assignedSiloId === id ? { ...w, assignedSiloId: null } : w); $silos = $silos.filter(s => s.id !== id); activeSiloMenu = null; } }
    function deletePlant(id: string) { if(confirm("Dismantle this Plant? Sectors inside will safely return to standalone operation.")) { $silos = $silos.map(s => s.assignedPlantId === id ? { ...s, assignedPlantId: null } : s); $plants = $plants.filter(p => p.id !== id); activePlantMenu = null; } }
    function toggleSiloWidth(id: string) { $silos = $silos.map(s => { if (s.id === id) return { ...s, width: s.width === 4 ? 6 : s.width === 6 ? 12 : 4 as SiloWidth }; return s; }); }
    function renameSilo(id: string) { const siloIndex = $silos.findIndex(s => s.id === id); if (siloIndex !== -1) { const currentName = $silos[siloIndex].name; const newName = prompt("Enter new Sector name:", currentName); if (newName && newName.trim() !== "") { $silos = $silos.map(s => s.id === id ? { ...s, name: newName.trim() } : s); } } activeSiloMenu = null; }

    function sweepSilos(siloIds: string[]) {
        let totalSwept = 0;
        silos.update(currentSilos => {
            return currentSilos.map(s => {
                if (siloIds.includes(s.id) && s.pendingKaspa && s.pendingKaspa > 0) {
                    totalSwept += s.pendingKaspa;
                    return { ...s, pendingKaspa: 0 };
                }
                return s;
            });
        });

        if (totalSwept > 0 && get(isWalletConnected)) {
            walletBalance.update(b => (parseFloat(b) + totalSwept).toString());
            walletInventory.update(currentInv => {
                let newInv = [...currentInv];
                const kasItem = newInv.find(i => i.asset.ticker === 'KAS');
                if (kasItem) {
                    kasItem.balance += totalSwept;
                    kasItem.usdValue = kasItem.balance * get(globalKasPrice);
                }
                return newInv;
            });
        }
    }

    function openSettlement(silo: Silo) { settlementModalSilo = silo; if (!silo.settlementConfig) silo.settlementConfig = { ...defaultSettlement, payoutAddress: $walletAddress || '' }; if (!silo.settlementConfig.targetAsset) silo.settlementConfig.targetAsset = tokenRegistry[0]; editSettlementParams = JSON.parse(JSON.stringify(silo.settlementConfig)); activeSiloMenu = null; isAssetPickerOpen = false; assetPickerStep = 'class'; selectedAssetClass = null; assetSearchQuery = ''; }
    
    async function saveSettlementParams() { 
        if (settlementModalSilo) { 
            isSigningSettlement = true;
            try {
                if ($isWalletConnected && (window as any).kasware && (window as any).kasware.signMessage) {
                    const message = `Perennia Settlement Lock:\nSign to cryptographically secure parameters for [${settlementModalSilo.name}]\nAsset: ${editSettlementParams.targetAsset.ticker}\nMode: ${editSettlementParams.mode}`;
                    await (window as any).kasware.signMessage(message);
                } else if ($isWalletConnected) {
                    const pass = prompt(`Cryptographic Signature Required.\nType "CONFIRM" to securely sign the settlement intent for ${settlementModalSilo.name}:`);
                    if (pass !== 'CONFIRM') throw new Error("Signature Denied");
                }

                $silos = $silos.map(s => { 
                    if (s.id === settlementModalSilo!.id) return { ...s, settlementConfig: editSettlementParams }; 
                    return s; 
                }); 
                
                if ($walletAddress) {
                    fetch(`/api/state`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            workers: $workers,
                            silos: $silos,
                            plants: $plants,
                            systemMode: $systemMode
                        })
                    }).catch(()=>{});
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

    function addWorker(type: 'physical' | 'capital') { 
        const id = Math.random().toString(36).substring(2, 8).toUpperCase(); 
        const name = `${type === 'physical' ? 'Rig' : 'Cap'}-${id.substring(0,4)}`; 
        const newWorker: Worker = { 
            id, type, name, 
            stratumUrl: type === 'physical' ? 'Multi-Tier Stratum Protocol' : 'Virtual Capital Contract', 
            walletWorker: $walletAddress ? `kaspa:${$walletAddress.replace('kaspa:','')}.${name}` : `kaspa:pending.${name}`, 
            hashRate: 0.00,  
            isOnline: false, 
            assignedSiloId: null,
            capitalTokens: 0
        }; 
        $workers = [...$workers, newWorker]; 
    }

    function formatHardwareName(rawType: string | undefined): string {
        if (!rawType) return 'PHYSICAL';
        if (rawType.includes('IceRiverMiner-v1.1')) return 'IceRiver KS0 Ultra';
        if (rawType.includes('IceRiverMiner-v7')) return 'IceRiver KS7 Lite';
        if (rawType.includes('IceRiver')) return rawType.replace('IceRiverMiner-', 'IceRiver KS');
        if (rawType.includes('Goldshell')) return rawType.replace('GoldshellMiner-', 'Goldshell KS');
        return rawType.replace('Miner-', ' ').substring(0, 18);
    }

    function deleteWorker(id: string) { 
        $workers = $workers.filter(w => w.id !== id); 
        closeAllMenus(); 
    }
</script>

<svelte:window onclick={closeAllMenus} onscroll={closeAllMenus} oncontextmenu={closeAllMenus} />

{#if contextMenuWorkerId}
    {@const cWorker = $workers.find(w => w.id === contextMenuWorkerId)}
    {#if cWorker}
        <div class="fixed inset-0 z-[9998]" onclick={closeAllMenus} oncontextmenu={(e) => { e.preventDefault(); closeAllMenus(); }} role="presentation"></div>
        
        <div class="fixed z-[9999] w-48 bg-[#1a1a1a] border border-neutral-700 rounded-lg shadow-2xl flex flex-col overflow-hidden animate-[fade-in-up_0.1s_ease-out]"
             style="left: {contextMenuX}px; top: {contextMenuY}px;"
             onmousedown={(e) => e.stopPropagation()} onclick={(e) => e.stopPropagation()} oncontextmenu={(e) => {e.preventDefault(); e.stopPropagation();}}>
            
            <div class="px-3 py-2 border-b border-neutral-800/80 bg-[#111] flex justify-between items-center">
                <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest truncate pr-2">{cWorker.name}</span>
                <span class="text-[8px] font-mono uppercase px-1.5 py-0.5 rounded {cWorker.type === 'physical' ? 'bg-teal-500/20 text-teal-400 border border-teal-900/50' : 'bg-purple-500/20 text-purple-400 border border-purple-900/50'}">{cWorker.type.substring(0,4)}</span>
            </div>

            {#if !deleteConfirmId}
                <button onclick={(e) => { e.stopPropagation(); const w = cWorker; closeAllMenus(); inlineRenameId = w.id; inlineRenameValue = w.name; }} class="text-left px-3 py-2.5 text-[10px] font-bold text-white hover:bg-[#222] transition-colors border-b border-neutral-800/50 cursor-pointer w-full">Rename Worker</button>
                
                {#if cWorker.type === 'physical'}
                    <button onclick={(e) => { e.stopPropagation(); const w = cWorker; closeAllMenus(); stratumModalWorker = w; }} class="text-left px-3 py-2.5 text-[10px] font-bold text-teal-400 hover:bg-[#222] transition-colors cursor-pointer border-b border-neutral-800/50 w-full">Copy Stratum</button>
                    {#if cWorker.ipAddress}
                        <button aria-label="Open Miner Interface" onclick={() => { const ip = cWorker.ipAddress; closeAllMenus(); window.open(`http://${ip}`, '_blank'); }} class="text-left px-3 py-2.5 text-[10px] font-bold text-emerald-400 hover:bg-[#222] transition-colors cursor-pointer flex justify-between items-center group border-b border-neutral-800/50 w-full">
                            Open Interface 
                            <span class="text-[12px] font-black opacity-50 group-hover:opacity-100 transition-opacity">↗</span>
                        </button>
                    {/if}
                {:else}
                    <button onclick={(e) => { e.stopPropagation(); const w = cWorker; closeAllMenus(); tokenModalWorker = { worker: w, type: 'add' }; trayTokenAmount = ''; }} class="text-left px-3 py-2.5 text-[10px] font-bold text-purple-400 hover:bg-[#222] transition-colors cursor-pointer border-b border-neutral-800/50 flex justify-between items-center w-full">Add Tokens <span class="text-lg leading-none">+</span></button>
                    <button onclick={(e) => { e.stopPropagation(); const w = cWorker; closeAllMenus(); tokenModalWorker = { worker: w, type: 'sub' }; trayTokenAmount = ''; }} class="text-left px-3 py-2.5 text-[10px] font-bold text-purple-400 hover:bg-[#222] transition-colors cursor-pointer border-b border-neutral-800/50 flex justify-between items-center w-full">Remove Tokens <span class="text-lg leading-none">-</span></button>
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
<!--   STRATUM CONFIG MODAL  -->
<!-- ======================= -->
{#if stratumModalWorker}
    {@const dynamicWorkerName = $walletAddress ? `kaspa:${$walletAddress.replace('kaspa:','')}.${stratumModalWorker.name}` : `kaspa:pending.${stratumModalWorker.name}`}
    
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <button aria-label="Close Modal" class="absolute inset-0 w-full h-full bg-[#050505]/95 backdrop-blur-sm cursor-default border-none" onclick={() => stratumModalWorker = null}></button>
        <div class="relative z-10 w-full max-w-[450px] bg-[#0c0c0c] border border-teal-900/50 rounded-2xl shadow-2xl p-6 flex flex-col gap-5 animate-[fade-in-up_0.2s_ease-out]">
            <div class="flex items-center justify-between border-b border-neutral-800 pb-3">
                <div class="flex flex-col">
                    <h3 class="text-teal-400 font-bold uppercase tracking-widest text-sm flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"/></svg>
                        Stratum Configuration
                    </h3>
                    <span class="text-[9px] text-neutral-500 uppercase tracking-widest mt-1">Multi-Tier Connectivity</span>
                </div>
                <button onclick={() => stratumModalWorker = null} class="text-neutral-500 hover:text-white transition-colors cursor-pointer focus:outline-none mb-4">✕</button>
            </div>
            
            <div class="flex flex-col gap-4">
                <div class="flex flex-col gap-1.5">
                    <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">Tier 1: GPU / Mobile (Port 5551)</span>
                    <div class="flex items-center gap-2 bg-[#161616] border border-neutral-800 rounded-lg p-2.5">
                        <span class="flex-1 font-mono text-xs text-white truncate select-all">stratum+tcp://192.168.0.12:5551</span>
                        <button onclick={(e) => handleTrayCopy(e, 'stratum+tcp://192.168.0.12:5551', 'COPIED TIER 1 URL', '')} class="shrink-0 bg-[#1a1a1a] hover:bg-[#222] border border-neutral-700 hover:border-teal-500/50 text-neutral-400 hover:text-teal-400 px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-widest transition-colors cursor-pointer shadow-sm">Copy</button>
                    </div>
                </div>

                <div class="flex flex-col gap-1.5">
                    <span class="text-[9px] text-teal-500 uppercase tracking-widest font-bold">Tier 2: Home ASICs (Port 5552)</span>
                    <div class="flex items-center gap-2 bg-[#18C6A5]/10 border border-[#18C6A5]/30 rounded-lg p-2.5">
                        <span class="flex-1 font-mono text-xs text-teal-400 truncate select-all">stratum+tcp://192.168.0.12:5552</span>
                        <button onclick={(e) => handleTrayCopy(e, 'stratum+tcp://192.168.0.12:5552', 'COPIED TIER 2 URL', '')} class="shrink-0 bg-[#1a1a1a] hover:bg-[#222] border border-teal-700/50 hover:border-teal-500 text-teal-400 hover:text-white px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-widest transition-colors cursor-pointer shadow-sm">Copy</button>
                    </div>
                </div>

                <div class="flex flex-col gap-1.5">
                    <span class="text-[9px] text-amber-500 uppercase tracking-widest font-bold">Tier 3: Industrial ASICs (Port 5553)</span>
                    <div class="flex items-center gap-2 bg-[#f59e0b]/10 border border-[#f59e0b]/30 rounded-lg p-2.5">
                        <span class="flex-1 font-mono text-xs text-amber-400 truncate select-all">stratum+tcp://192.168.0.12:5553</span>
                        <button onclick={(e) => handleTrayCopy(e, 'stratum+tcp://192.168.0.12:5553', 'COPIED TIER 3 URL', '')} class="shrink-0 bg-[#1a1a1a] hover:bg-[#222] border border-amber-700/50 hover:border-amber-500 text-amber-400 hover:text-white px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-widest transition-colors cursor-pointer shadow-sm">Copy</button>
                    </div>
                </div>

                <div class="h-px bg-neutral-800 my-1"></div>

                <div class="flex flex-col gap-1.5">
                    <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">Wallet.WorkerName</span>
                    <div class="flex items-center gap-2 bg-[#161616] border border-neutral-800 rounded-lg p-3">
                        <span class="flex-1 font-mono text-xs text-white truncate select-all">{dynamicWorkerName}</span>
                        <button onclick={(e) => handleTrayCopy(e, dynamicWorkerName, 'COPIED WORKER ID', '')} class="shrink-0 bg-[#1a1a1a] hover:bg-[#222] border border-neutral-700 hover:border-white/50 text-neutral-400 hover:text-white px-3 py-1.5 rounded text-[9px] font-bold uppercase tracking-widest transition-colors cursor-pointer shadow-sm">Copy</button>
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}

<!-- ======================= -->
<!--   CAPITAL TOKEN MODAL   -->
<!-- ======================= -->
{#if tokenModalWorker}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <button aria-label="Close Modal" class="absolute inset-0 w-full h-full bg-[#050505]/95 backdrop-blur-sm cursor-default border-none" onclick={() => {tokenModalWorker = null; trayTokenAmount = '';}}></button>
        <div class="relative z-10 w-full max-w-[360px] bg-[#0c0c0c] border {tokenModalWorker.type === 'add' ? 'border-purple-900/50' : 'border-amber-900/50'} rounded-2xl shadow-2xl p-6 flex flex-col gap-5 animate-[fade-in-up_0.2s_ease-out]">
            <div class="flex items-center justify-between border-b border-neutral-800 pb-3">
                <h3 class="{tokenModalWorker.type === 'add' ? 'text-purple-400' : 'text-amber-400'} font-bold uppercase tracking-widest text-sm">
                    {tokenModalWorker.type === 'add' ? 'Inject PER Tokens' : 'Withdraw PER Tokens'}
                </h3>
                <button onclick={() => {tokenModalWorker = null; trayTokenAmount = '';}} class="text-neutral-500 hover:text-white transition-colors cursor-pointer focus:outline-none">✕</button>
            </div>
            <div class="flex flex-col gap-2">
                <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold">Amount to {tokenModalWorker.type === 'add' ? 'Stake' : 'Unstake'}</span>
                <div class="relative">
                    <input type="number" bind:value={trayTokenAmount} placeholder="0.00" class="w-full bg-[#161616] border border-neutral-800 {tokenModalWorker.type === 'add' ? 'focus:border-purple-500/50' : 'focus:border-amber-500/50'} rounded-lg px-4 py-3 text-lg font-mono text-white outline-none transition-colors" autofocus onkeydown={(e) => e.key === 'Enter' && processTokenAction()} min="0" />
                    <span class="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-600 font-bold text-xs pointer-events-none">PER</span>
                </div>
            </div>
            
            <div class="flex items-start gap-3 bg-[#111] rounded-xl p-3 border border-neutral-800 shadow-inner">
                <div class="mt-0.5 {tokenModalWorker.type === 'add' ? 'text-purple-500' : 'text-amber-500'}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                </div>
                <div class="flex flex-col w-full">
                    <span class="text-[9px] uppercase tracking-widest text-neutral-300 font-bold mb-0.5">Synthetic Hashrate Protocol</span>
                    <span class="text-[10px] font-mono {tokenModalWorker.type === 'add' ? 'text-purple-400' : 'text-amber-400'}">1,000 PER = 0.05 TH/s</span>
                    {#if trayTokenAmount && parseFloat(trayTokenAmount.toString()) > 0}
                        <span class="text-[10px] font-mono text-white mt-1 border-t border-neutral-800 pt-1 block w-full text-right">
                            Shift: {(parseFloat(trayTokenAmount.toString()) / 1000 * 0.05).toFixed(4)} TH/s <span class="text-neutral-500">(Awaiting Node Verification)</span>
                        </span>
                    {/if}
                </div>
            </div>

            <button onclick={processTokenAction} disabled={!trayTokenAmount || parseFloat(trayTokenAmount.toString()) <= 0} class="w-full py-3 {tokenModalWorker.type === 'add' ? 'bg-purple-600 hover:bg-purple-500 shadow-[0_0_15px_rgba(147,51,234,0.3)]' : 'bg-amber-600 hover:bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.3)]'} text-white font-black uppercase tracking-widest text-[10px] rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                Confirm {tokenModalWorker.type === 'add' ? 'Injection' : 'Withdrawal'}
            </button>
        </div>
    </div>
{/if}

{#snippet workerCard(worker: Worker)}
{@const isDeployed = worker.assignedSiloId !== null}
{@const assignedSilo = isDeployed ? $silos.find(s => s.id === worker.assignedSiloId) : null}
{@const siloColor = assignedSilo ? assetColors[assignedSilo.settlementConfig.targetAsset.assetClass as string]?.hex || '#ffffff' : null}

<div draggable={!isDeployed && !inlineRenameId ? "true" : "false"} 
     ondragstart={(e) => { if(!isDeployed && !inlineRenameId) handleDragStart(e, 'worker', worker.id) }} 
     ondragend={handleDragEnd} 
     oncontextmenu={(e) => handleContextMenu(e, worker.id)}
     class="relative border rounded-xl p-3 shadow-md group transition-colors flex flex-col {contextMenuWorkerId === worker.id ? 'z-50' : 'z-20'}
            {isDeployed ? 'bg-[#050505] border-neutral-900 opacity-60' : 'bg-[#0c0c0c] border-neutral-800/80 hover:border-neutral-600'} 
            {(!isDeployed && !inlineRenameId) ? 'cursor-grab active:cursor-grabbing' : ''}
            {dragType === 'worker' && draggedId === worker.id ? 'opacity-50 border-teal-500' : ''}">
    
    <div class="flex justify-between items-start mb-2 relative pointer-events-none">
        <div class="flex flex-col gap-0.5 min-w-0 flex-1 z-10 pointer-events-none">
            <div class="flex items-center gap-2 pointer-events-auto w-full pr-2">
                <div class="w-1.5 h-1.5 rounded-full shrink-0 {worker.isOnline ? (worker.type === 'physical' ? 'bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.8)]' : 'bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]') + ' animate-pulse' : 'bg-neutral-600'}"></div>
                
                {#if inlineRenameId === worker.id}
                    <input type="text" bind:value={inlineRenameValue} onblur={() => saveInlineRename(worker.id)} onkeydown={(e) => { if (e.key === 'Enter') saveInlineRename(worker.id); else if (e.key === 'Escape') inlineRenameId = null; }} onmousedown={(e) => e.stopPropagation()} onclick={(e) => e.stopPropagation()} class="text-xs font-bold text-white bg-[#1a1a1a] border {worker.type === 'physical' ? 'border-teal-500/50' : 'border-purple-500/50'} rounded px-1.5 py-0.5 outline-none w-[110px] shadow-inner" autofocus />
                {:else}
                    <span class="text-xs font-bold text-white truncate max-w-[80px] xl:max-w-[100px]" title={worker.name}>{worker.name}</span>
                {/if}
            </div>
            {#if worker.type === 'physical' && worker.hardwareType}
                <span class="text-[7px] font-mono text-teal-500/80 uppercase tracking-widest truncate max-w-[90px] ml-3.5" title={worker.hardwareType}>{formatHardwareName(worker.hardwareType)}</span>
            {:else if worker.type === 'capital'}
                <span class="text-[7px] font-mono text-purple-500/80 uppercase tracking-widest truncate max-w-[110px] ml-3.5 font-bold">{(worker.capitalTokens || 0).toLocaleString()} PER INFUSED</span>
            {/if}
        </div>
        
        <div class="relative pointer-events-auto shrink-0 z-20">
            <button aria-label="Menu" onmousedown={(e) => e.stopPropagation()} onclick={(e) => handleContextMenu(e, worker.id)} class="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-white rounded-full hover:bg-[#222] transition-colors cursor-pointer"><span class="font-bold pb-1 text-sm">⋮</span></button>
        </div>
    </div>
    
    <div class="flex justify-between items-end mt-1 pointer-events-none">
        <div class="flex flex-col gap-1 items-start">
            <span class="text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border {worker.type === 'physical' ? 'bg-teal-950/20 text-teal-400 border-teal-900/50' : 'bg-purple-950/20 text-purple-400 border-purple-900/50'}">{worker.type.substring(0,4)}</span>
            {#if worker.type === 'physical' && worker.ipAddress}
                <span class="text-[7px] font-mono text-neutral-600">{worker.ipAddress}</span>
            {/if}
        </div>
        
        <div class="flex flex-col items-end gap-1.5">
            <div class="flex flex-col items-end">
                <span class="text-[7px] uppercase tracking-widest text-neutral-500 font-bold font-mono">Live Hash</span>
                {#if worker.isOnline && worker.hashRate === 0}
                    <span class="text-[9px] font-mono font-bold {worker.type === 'physical' ? 'text-teal-500' : 'text-purple-500'} animate-pulse mt-0.5 tracking-widest">SYNCING...</span>
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
                        <span class="text-[11px] font-mono font-black {((worker as any).blocksFound || 0) > 0 ? 'text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.3)]' : 'text-neutral-600'} tabular-nums leading-none tracking-tight transition-all duration-75">{((worker as any).blocksFound || 0)}</span>
                    {/if}
                </div>
                <div class="flex flex-col items-end">
                    <span class="text-[7px] uppercase tracking-widest text-neutral-500 font-bold font-mono">Work Shares</span>
                    {#if worker.isOnline && worker.hashRate === 0}
                        <span class="text-[9px] font-mono font-bold text-amber-500 animate-pulse mt-0.5 tracking-widest">SYNC...</span>
                    {:else}
                        <span class="text-[11px] font-mono font-black {((worker as any).sharesContributed || 0) > 0 ? 'text-amber-400 drop-shadow-[0_0_8px_rgba(245,158,11,0.3)]' : 'text-neutral-600'} tabular-nums leading-none tracking-tight transition-all duration-75">{((worker as any).sharesContributed || 0).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                    {/if}
                </div>
            </div>
        </div>
    </div>

    {#if isDeployed && assignedSilo}
        <div class="mt-3 pt-2.5 border-t border-neutral-800/50 flex justify-between items-center pointer-events-none">
            <span class="text-[8px] uppercase tracking-widest font-bold text-neutral-500">Deployed To</span>
            <div class="flex items-center gap-1.5 bg-[#111] px-2 py-1 rounded border border-neutral-800 shadow-inner">
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
{@const assetClass = silo.settlementConfig.targetAsset.assetClass as string}
{@const assetTheme = assetColors[assetClass] || {hex: '#525252', pastel: '#a3a3a3'}}
{@const isGlowing = hashrate > 0 && !inPlant}
{@const spanClass = inPlant ? 'w-full h-full' : (silo.width === 4 ? 'col-span-12 lg:col-span-6 xl:col-span-4' : silo.width === 6 ? 'col-span-12 xl:col-span-6' : 'col-span-12')}
{@const isRealtime = silo.settlementConfig.mode === 'stream' && silo.settlementConfig.streamMode === 'realtime'}

<div draggable={!inPlant ? "true" : "false"} ondragstart={(e) => {if(!inPlant) handleDragStart(e, 'silo', silo.id)}} ondragend={handleDragEnd}
     ondragover={(e) => handleDragOver(e, silo.id, 'silo')} ondragleave={handleDragLeave} ondrop={(e) => handleDrop(e, 'silo', silo.id)}
     style={isGlowing ? `box-shadow: 0 0 20px ${assetTheme.hex}20; border-color: ${assetTheme.hex}50;` : ''}
     class="bg-[#111] border rounded-[20px] p-4 flex flex-col gap-3 min-h-[220px] transition-all duration-500 {spanClass}
            {!inPlant ? 'cursor-grab active:cursor-grabbing hover:border-neutral-500 border-neutral-800' : 'border-neutral-800 shadow-inner bg-[#0a0a0a]'} 
            {targetDropId === silo.id && dragType === 'worker' ? 'bg-[#161616] scale-[1.02]' : ''} 
            {dragType === 'silo' && draggedId === silo.id ? 'opacity-50 scale-95' : ''}">
    
    <div class="flex justify-between items-center border-b border-neutral-800/80 pb-3 mb-1 pointer-events-auto">
        <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-500 {hashrate > 0 ? 'animate-pulse' : 'bg-neutral-600'}" style={hashrate > 0 ? `background-color: ${assetTheme.hex}; box-shadow: 0 0 10px ${assetTheme.hex};` : ''}></div>
            <h3 class="text-white font-bold tracking-widest uppercase text-[11px] truncate">{silo.name}</h3>
        </div>
        
        <div class="flex items-center gap-1.5 shrink-0 relative">
            <div class="bg-[#050505] border border-neutral-800 px-2 py-1 rounded-lg pointer-events-none mr-1 flex flex-col items-end">
                <span class="font-mono font-black text-[11px] xl:text-[13px] leading-none transition-colors" style="color: {hashrate > 0 ? assetTheme.hex : '#737373'};">{hashrate.toFixed(2)} <span class="text-[8px] xl:text-[9px] font-normal ml-0.5" style="color: {hashrate > 0 ? assetTheme.hex : '#525252'}; opacity: 0.8;">TH/s</span></span>
            </div>
            {#if !inPlant}
                <div onmousedown={(e) => e.stopPropagation()}>
                    <button aria-label="Resize Sector" onclick={(e) => {e.stopPropagation(); toggleSiloWidth(silo.id);}} class="w-7 h-7 flex items-center justify-center text-neutral-500 hover:text-white rounded hover:bg-[#222] transition-colors cursor-pointer" title="Toggle Size"><span class="font-bold tracking-widest text-[12px]">[ ]</span></button>
                </div>
            {/if}
            <div class="relative">
                <div onmousedown={(e) => e.stopPropagation()}>
                    <button aria-label="Sector Menu" onclick={(e) => { e.stopPropagation(); closeAllMenus(); activeSiloMenu = activeSiloMenu === silo.id ? null : silo.id; }} class="w-7 h-7 flex items-center justify-center text-neutral-500 hover:text-white rounded-full hover:bg-[#222] transition-colors cursor-pointer z-30"><span class="font-bold pb-1 text-sm">⋮</span></button>
                </div>
                {#if activeSiloMenu === silo.id}
                    <div class="absolute top-10 right-0 w-48 bg-[#1a1a1a] border border-neutral-700 rounded-lg shadow-2xl z-40 flex flex-col overflow-hidden" onmousedown={(e) => e.stopPropagation()}>
                        <button aria-label="Rename Sector" onclick={(e) => {e.stopPropagation(); renameSilo(silo.id);}} class="text-left px-3 py-2.5 text-[10px] font-bold text-white hover:bg-[#222] transition-colors cursor-pointer">Rename Sector</button>
                        {#if !inPlant}
                            <button aria-label="Settlement Params" onclick={(e) => {e.stopPropagation(); openSettlement(silo);}} class="text-left px-3 py-2.5 text-[10px] font-bold text-amber-400 hover:bg-[#222] transition-colors cursor-pointer flex justify-between items-center">Settlement Params {#if !silo.settlementConfig?.autoPayout}<div class="w-1.5 h-1.5 rounded-full bg-teal-500" title="Treasury Hold"></div>{/if}</button>
                        {:else}
                            <button aria-label="Eject from Plant" onclick={(e) => {e.stopPropagation(); $silos = $silos.map(s => s.id === silo.id ? { ...s, assignedPlantId: null } : s); $plants = $plants.map(p => p.id === silo.assignedPlantId ? { ...p, liquidityDeposit: { isActive: false, pairName: 'Awaiting Pairs', totalLiquidityUsd: 0 }, currentApr: 0 } : p); activeSiloMenu = null;}} class="text-left px-3 py-2.5 text-[10px] font-bold text-emerald-400 hover:bg-[#222] transition-colors cursor-pointer">Eject from Plant</button>
                        {/if}
                        <div class="h-px bg-neutral-800"></div><button aria-label="Dismantle" onclick={(e) => {e.stopPropagation(); deleteSilo(silo.id);}} class="text-left px-3 py-2.5 text-[10px] font-bold text-red-500 hover:bg-[#222] transition-colors cursor-pointer">Dismantle</button>
                    </div>
                {/if}
            </div>
        </div>
    </div>

    {#if !inPlant}
        <div class="w-full border border-neutral-800/80 rounded p-2.5 my-1 flex flex-col gap-2 pointer-events-none relative overflow-hidden transition-colors duration-500 shadow-inner" style="background-color: {isRealtime && hashrate > 0 ? assetTheme.hex + '10' : '#0a0a0a'}; border-color: {isRealtime && hashrate > 0 ? assetTheme.hex + '40' : 'rgba(38,38,38,0.8)'};">
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
                        <div class="h-full transition-all duration-1000" style="width: {Math.min(100, ((silo.pendingKaspa || 0) / silo.settlementConfig.threshold) * 100)}%; background-color: {assetTheme.hex}; box-shadow: 0 0 8px {assetTheme.hex}80;"></div>
                    </div>
                    <div class="flex justify-between items-end">
                        <span class="text-[7px] font-mono text-neutral-500">Accumulating internally...</span>
                        <span class="text-[9px] font-mono font-bold text-amber-500">{(silo.pendingKaspa || 0).toFixed(6)} <span class="text-neutral-600">/ {silo.settlementConfig.threshold}</span></span>
                    </div>
                {/if}
            </div>
        </div>
    {/if}

    {#if inPlant}
        <div class="w-full bg-[#050505] border border-emerald-900/40 rounded p-2 my-1 flex flex-col gap-2 relative overflow-hidden pointer-events-none transition-colors duration-500">
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
                    <button aria-label="Dev Fire" 
                            onclick={() => executeOmniChainSwap('KAS', 'KAS', '1')}
                            class="text-[7px] font-black uppercase tracking-widest text-red-500/30 hover:text-red-500 transition-colors border border-red-500/10 hover:border-red-500/50 px-1.5 py-0.5 rounded cursor-pointer">
                        [DEV FIRE]
                    </button>
                    <span class="text-[9px] font-mono text-neutral-600">{displayedWorkers.filter(w => w.assignedSiloId === null).length} UNASSIGNED</span>
                </div>
            </div>
            
            <div class="flex flex-row gap-2 w-full">
                <button aria-label="Add Physical Worker" onclick={() => addWorker('physical')} disabled={!$isWalletConnected} class="flex-1 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-teal-500/50 text-white text-[9px] font-bold uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">+ PHYS</button>
                <button aria-label="Add Capital Worker" onclick={() => addWorker('capital')} disabled={!$isWalletConnected} class="flex-1 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-purple-500/50 text-white text-[9px] font-bold uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">+ CAP</button>
            </div>

            <div class="flex flex-col gap-2.5 min-h-[400px] pb-10 transition-colors duration-300 {targetDropType === 'field' && dragType === 'worker' ? 'border border-dashed border-teal-500/30 rounded-xl bg-teal-500/5 p-2 -mx-2' : ''}">
                {#if displayedWorkers.length === 0}
                    <div class="flex-1 border border-dashed border-neutral-800/50 rounded-xl flex items-center justify-center bg-[#050505] p-4 text-center pointer-events-none"><p class="text-[9px] uppercase tracking-widest text-neutral-600 font-bold leading-relaxed">{#if !$isWalletConnected} Connect wallet {:else} No hardware provisioned {/if}</p></div>
                {/if}
                
                {#each displayedWorkers.filter(w => w.assignedSiloId === null) as worker (worker.id)}
                    {@render workerCard(worker)}
                {/each}
            </div>
        </div>

        <div class="flex flex-col gap-4 lg:col-span-6 xl:col-span-8">
            
            {#if $isWalletConnected}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2 animate-[fade-in-up_0.5s_ease-out]">
                    
                    <div class="bg-[#0c0c0c] border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between h-[240px] shadow-inner relative overflow-hidden group">
                        <div class="flex justify-between items-start relative z-10 pointer-events-none">
                            <div class="flex flex-col">
                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5"><div class="w-1.5 h-1.5 rounded-full {$globalNodeStatus === 'online' ? 'bg-teal-500 animate-pulse' : 'bg-neutral-600'}"></div> Live Hash Power</span>
                                <span class="text-2xl font-mono font-light text-white tracking-tight">{$globalNetworkHashrate.toFixed(2)} <span class="text-xs text-neutral-500 font-bold">TH/s</span></span>
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

                    <div class="bg-[#0c0c0c] border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between h-[240px] shadow-inner relative overflow-hidden group">
                        <div class="flex justify-between items-start relative z-10 pointer-events-none">
                            <div class="flex flex-col">
                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5"><div class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div> KAS / USD Price</span>
                                <span class="text-2xl font-mono font-light text-white tracking-tight">${$globalKasPrice.toFixed(4)}</span>
                            </div>
                            <span class="text-[10px] font-bold font-mono px-2 py-1 rounded bg-[#111] border {$globalKasChange >= 0 ? 'text-emerald-400 border-emerald-900/30' : 'text-red-400 border-red-900/30'}">
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
                <button aria-label="Add Nexus" disabled class="flex-1 max-w-[200px] bg-[#0a0a0a] border border-neutral-900 text-neutral-700 text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl cursor-not-allowed">+ Nexus</button>
            </div>

            <div class="flex-1 border border-neutral-800/50 rounded-2xl bg-[#0a0a0a] p-4 md:p-6 min-h-[500px] relative shadow-inner w-full" style="background-image: linear-gradient(#14b8a608 1px, transparent 1px), linear-gradient(90deg, #14b8a608 1px, transparent 1px); background-size: 24px 24px;">
                
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
                                        {@const color1 = plantSilos[0] ? assetColors[plantSilos[0].settlementConfig.targetAsset.assetClass as string]?.pastel : '#a855f7'}
                                        {@const color2 = plantSilos[1] ? assetColors[plantSilos[1].settlementConfig.targetAsset.assetClass as string]?.pastel : '#a855f7'}
                                        
                                        <div ondragover={(e) => handleDragOver(e, plant.id, 'plant')} ondragleave={handleDragLeave} ondrop={(e) => handleDrop(e, 'plant', plant.id)}
                                             style="background-image: linear-gradient(to bottom right, #111, #0a0a0a); box-shadow: 0 0 40px {color1}15, inset 0 0 20px {color2}0a; border-color: {color1}40;"
                                             class="border rounded-[28px] p-6 transition-all duration-500 flex flex-col w-full {targetDropId === plant.id && dragType === 'silo' ? 'scale-[1.02] bg-[#161616]' : ''}">
                                            
                                            <div class="flex justify-between items-center mb-6 border-b border-neutral-800/80 pb-4 shrink-0">
                                                <div class="flex items-center gap-3 pointer-events-none">
                                                    <div class="w-3 h-3 rounded-full {plant.liquidityDeposit.isActive ? 'animate-pulse' : 'bg-neutral-600'}" style={plant.liquidityDeposit.isActive ? `background: linear-gradient(to right, ${color1}, ${color2}); box-shadow: 0 0 12px ${color1};` : ''}></div>
                                                    <h3 class="text-white font-black tracking-widest uppercase text-sm" style={plant.liquidityDeposit.isActive ? `color: ${color1}` : ''}>{plant.name}</h3>
                                                </div>
                                                <div class="flex items-center gap-3 relative">
                                                    <span class="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-lg border {plant.liquidityDeposit.isActive ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400' : 'bg-[#1a1a1a] border-neutral-800 text-neutral-500'}">
                                                        {plant.liquidityDeposit.isActive ? 'Liquidity Synthesized' : 'Awaiting Silos'}
                                                    </span>
                                                    <div class="relative pointer-events-auto">
                                                        <div onmousedown={(e) => e.stopPropagation()}>
                                                            <button aria-label="Plant Menu" onclick={(e) => { e.stopPropagation(); closeAllMenus(); activePlantMenu = activePlantMenu === plant.id ? null : plant.id; }} class="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-white rounded-full hover:bg-[#222] transition-colors cursor-pointer relative"><span class="font-bold pb-1 text-sm">⋮</span></button>
                                                        </div>
                                                        {#if activePlantMenu === plant.id}
                                                            <div class="absolute top-8 right-0 w-48 bg-[#1a1a1a] border border-neutral-700 rounded-lg shadow-2xl z-40 flex flex-col overflow-hidden" onmousedown={(e) => e.stopPropagation()}>
                                                                <button aria-label="Dismantle Plant" onclick={(e) => {e.stopPropagation(); deletePlant(plant.id);}} class="text-left px-3 py-2.5 text-[10px] font-bold text-red-500 hover:bg-[#222] transition-colors cursor-pointer">Dismantle Plant</button>
                                                            </div>
                                                        {/if}
                                                    </div>
                                                </div>
                                            </div>

                                            {#if plant.liquidityDeposit.isActive}
                                                <div class="mb-6 bg-[#0a0a0a] border border-white/10 rounded-xl p-4 flex items-center justify-between animate-[fade-in-up_0.3s_ease-out] relative z-10 shrink-0">
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
                                                            <span class="text-[8px] text-neutral-400 uppercase tracking-widest font-bold">Yield</span>
                                                            <span class="text-sm font-mono font-black" style="color: {color1}">{plant.currentApr}% APR</span>
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
                                 class="grid grid-cols-1 md:grid-cols-12 gap-6 relative z-10 content-start w-full min-h-[200px] transition-colors duration-300 {targetDropType === 'canvas' && dragType === 'silo' ? 'bg-teal-500/5 border border-dashed border-teal-500/30 rounded-3xl p-4 -m-4' : ''}">
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
                                <span class="text-2xl font-mono font-light text-white leading-none">{$globalNetworkHashrate.toFixed(2)}</span>
                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-600 mt-1">TH/s</span>
                            </div>
                        </div>

                        <div class="bg-gradient-to-br from-[#0c0c0c] to-[#111] border border-neutral-800 p-4 rounded-2xl shadow-xl flex flex-col items-center justify-center min-h-[90px] w-full mb-6 pointer-events-none">
                            <div class="text-[8px] font-bold uppercase tracking-widest text-neutral-500 text-center mb-1">
                                Total Treasury Value
                            </div>
                            <div class="text-xl xl:text-2xl font-mono font-light text-teal-400 drop-shadow-[0_0_12px_rgba(20,184,166,0.2)] tracking-tighter text-center tabular-nums transition-all truncate w-full px-2">${($walletInventory || []).reduce((acc: number, item: WalletInventoryItem) => acc + item.usdValue, 0).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
                        </div>
                        
                        <div class="w-full flex flex-col gap-2 pointer-events-auto">
                            <button aria-label="Sweep Selected" onclick={() => sweepSilos(Object.keys(selectedSilosForSweep).filter(id => selectedSilosForSweep[id]))} 
                                    disabled={totalPendingKAS === 0}
                                    class="w-full relative overflow-hidden bg-[#111] hover:bg-[#161616] border border-neutral-800 hover:border-teal-500/50 rounded-xl p-4 flex flex-col items-center justify-center transition-all cursor-pointer group disabled:opacity-50 disabled:cursor-not-allowed mb-2">
                                <div class="absolute inset-0 bg-gradient-to-t from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 mb-1 z-10">Sweep Selected</span>
                                <span class="text-2xl font-black font-mono text-teal-400 tracking-tight z-10">${totalPendingUSD.toFixed(2)}</span>
                            </button>
                            
                            <div class="flex flex-col gap-2 w-full max-h-[200px] overflow-y-auto pr-1 hide-scrollbar">
                                {#each effortData.segments as seg}
                                    {@const silo = $silos.find(s => s.id === seg.id)}
                                    {#if silo}
                                        {@const pendingUSD = (silo.pendingKaspa || 0) * $globalKasPrice}
                                        <div class="flex items-stretch gap-1.5 w-full group">
                                            <button aria-label="Toggle Selection" onclick={() => selectedSilosForSweep[silo.id] = !selectedSilosForSweep[silo.id]} 
                                                    class="w-8 bg-[#0c0c0c] border border-neutral-800 rounded-lg flex items-center justify-center cursor-pointer hover:bg-[#161616] transition-colors shrink-0">
                                                <div class="w-3.5 h-3.5 rounded border {selectedSilosForSweep[silo.id] ? 'bg-teal-500 border-teal-500 text-black' : 'border-neutral-700 bg-[#111]'} flex items-center justify-center transition-colors">
                                                    {#if selectedSilosForSweep[silo.id]}
                                                        <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="3"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/></svg>
                                                    {/if}
                                                </div>
                                            </button>
                                            
                                            <button aria-label="Sweep Sector" onclick={() => sweepSilos([silo.id])}
                                                    disabled={(silo.pendingKaspa || 0) === 0}
                                                    class="flex-1 bg-[#111] hover:bg-[#161616] border border-neutral-800 rounded-lg p-2.5 flex justify-between items-center transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                                                <div class="flex items-center gap-2">
                                                    <div class="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style="background-color: {seg.hex}; color: {seg.hex};"></div>
                                                    <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-300 truncate max-w-[60px]">{silo.name}</span>
                                                </div>
                                                <div class="flex flex-col items-end text-right">
                                                    <span class="text-[10px] font-bold font-mono text-white">${pendingUSD.toFixed(2)}</span>
                                                </div>
                                            </button>
                                        </div>
                                    {/if}
                                {/each}
                                {#if effortData.segments.length === 0}
                                    <div class="text-center text-[9px] font-mono text-neutral-600 uppercase tracking-widest py-4 border border-dashed border-neutral-800 rounded-lg">No Active Routes</div>
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

{#if settlementModalSilo && editSettlementParams}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <div class="absolute inset-0 w-full h-full bg-[#050505]/95 cursor-default border-none" onclick={() => {settlementModalSilo = null; isAssetPickerOpen = false; editSettlementParams = {...defaultSettlement}; isSigningSettlement = false;}}></div>
        
        {#if !isAssetPickerOpen}
            <div class="relative z-10 w-full max-w-[420px] bg-[#111] border border-neutral-800 rounded-[28px] shadow-2xl flex flex-col overflow-hidden transition-colors duration-500 border-t-4 {editSettlementParams.autoPayout ? (editSettlementParams.mode === 'stream' ? 'border-t-emerald-500' : editSettlementParams.mode === 'appointment' ? 'border-t-blue-500' : 'border-t-amber-500') : 'border-t-neutral-600'} animate-[fade-in-up_0.2s_ease-out]">
                <div class="px-6 pt-6 pb-4 border-b border-neutral-800/80">
                    <h3 class="text-white font-bold tracking-wide text-md mb-1 text-center truncate">{settlementModalSilo.name}</h3>
                    <span class="text-[9px] text-neutral-500 uppercase tracking-widest text-center block font-bold">Settlement Protocol</span>
                </div>
                <div class="p-6 flex flex-col gap-5">
                    
                    <div class="flex flex-col gap-1.5">
                        <span class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1 block">Target Asset Route</span>
                        <button aria-label="Target Asset Route" onclick={() => {isAssetPickerOpen = true; assetPickerStep = 'class'; selectedAssetClass = null; assetSearchQuery = '';}} class="w-full bg-[#0c0c0c] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-white/20 rounded-xl px-4 py-3 flex items-center justify-between transition-colors cursor-pointer group shadow-inner">
                            <div class="flex items-center gap-3">
                                <div class="w-7 h-7 rounded-full bg-[#111] border border-neutral-800 flex items-center justify-center text-[11px] font-black overflow-hidden" style="color: {assetColors[editSettlementParams.targetAsset.assetClass as string]?.hex || '#ffffff'};">
                                    {#if editSettlementParams.targetAsset.imgUrl}
                                        <img src={editSettlementParams.targetAsset.imgUrl} class="w-4 h-4 object-contain" alt="logo" />
                                    {:else}
                                        {editSettlementParams.targetAsset.ticker[0]}
                                    {/if}
                                </div>
                                <div class="flex flex-col items-start"><span class="text-[12px] font-bold text-white leading-none mb-0.5">{editSettlementParams.targetAsset.ticker}</span><span class="text-[9px] font-mono text-neutral-500 truncate max-w-[150px]">{editSettlementParams.targetAsset.name}</span></div>
                            </div>
                            <span class="text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded bg-[#1a1a1a] text-neutral-500 border border-neutral-800">{editSettlementParams.targetAsset.assetClass}</span>
                        </button>
                    </div>

                    <div class="flex flex-col gap-1.5">
                        <label for="destWallet" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">Destination Address / Wallet</label>
                        <input id="destWallet" type="text" bind:value={editSettlementParams.payoutAddress} placeholder="kaspa:..." spellcheck="false" class="w-full bg-[#0c0c0c] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[11px] font-mono text-amber-400 outline-none transition-colors" />
                    </div>
                    <div class="flex bg-[#0a0a0a] rounded-xl p-1 border border-neutral-800 {editSettlementParams.autoPayout ? '' : 'opacity-50 pointer-events-none'} transition-opacity shadow-inner">
                        <button aria-label="Threshold Mode" onclick={() => editSettlementParams.mode = 'threshold'} class="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all {editSettlementParams.mode === 'threshold' ? 'bg-[#1a1a1a] text-amber-400 shadow-md border border-neutral-800' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Limit</button>
                        <button aria-label="Stream Mode" onclick={() => editSettlementParams.mode = 'stream'} class="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all {editSettlementParams.mode === 'stream' ? 'bg-[#1a1a1a] text-teal-400 shadow-md border border-neutral-800' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Stream</button>
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
                                <button aria-label="Real Time Stream" onclick={() => editSettlementParams.streamMode = 'realtime'} class="py-2.5 rounded-lg border text-[9px] font-bold uppercase tracking-widest transition-all {editSettlementParams.streamMode === 'realtime' ? 'bg-teal-950/40 border-teal-500 text-teal-400' : 'bg-[#0c0c0c] border-neutral-800 text-neutral-500 hover:border-neutral-700 cursor-pointer'}">Real-Time</button>
                                <button aria-label="Interval Stream" onclick={() => editSettlementParams.streamMode = 'interval'} class="py-2.5 rounded-lg border text-[9px] font-bold uppercase tracking-widest transition-all {editSettlementParams.streamMode === 'interval' ? 'bg-teal-950/40 border-teal-500 text-teal-400' : 'bg-[#0c0c0c] border-neutral-800 text-neutral-500 hover:border-neutral-700 cursor-pointer'}">Interval</button>
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
            <div class="relative z-10 w-full max-w-[420px] bg-[#111] border border-neutral-800 rounded-[28px] shadow-2xl flex flex-col overflow-hidden h-[500px] animate-[fade-in-up_0.2s_ease-out]">
                
                {#if assetPickerStep === 'class'}
                    <div class="p-4 border-b border-neutral-800/80 flex items-center justify-between bg-[#0a0a0a]">
                        <button aria-label="Back" onclick={() => isAssetPickerOpen = false} class="w-8 h-8 rounded-full hover:bg-[#222] flex items-center justify-center text-neutral-400 transition-colors cursor-pointer">←</button>
                        <h3 class="text-white font-bold tracking-wide text-sm text-center uppercase">Sanctuary Registry</h3>
                        <div class="w-8"></div>
                    </div>
                    
                    <div class="flex-1 overflow-y-auto p-4 bg-[#111]">
                        <h4 class="text-[10px] uppercase tracking-widest text-neutral-500 font-bold mb-4 ml-1 text-center">1. Select Asset Class</h4>
                        <div class="grid grid-cols-2 gap-3">
                            {#each uniqueClasses as cls}
                                <button aria-label="Select {cls}" onclick={() => { selectedAssetClass = cls as string; assetPickerStep = 'asset'; assetSearchQuery = ''; }} class="bg-[#0c0c0c] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-white/20 rounded-xl p-4 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group shadow-sm h-28">
                                    <div class="w-10 h-10 rounded-full bg-[#111] border border-neutral-800 flex items-center justify-center transition-colors shadow-inner group-hover:bg-[#161616]" style="color: {assetColors[cls as string]?.hex || '#ffffff'}; border-color: {assetColors[cls as string]?.hex || '#ffffff'};">
                                        {#if (cls as string) === 'Crypto'} <span class="font-black text-lg">₿</span>
                                        {:else if (cls as string) === 'Fiat'} <span class="font-black text-lg">💵</span>
                                        {:else if (cls as string) === 'Commodities'} <span class="font-black text-lg">🥇</span>
                                        {:else if (cls as string) === 'Energy'} <span class="font-black text-lg">🛢️</span>
                                        {:else} <span class="font-black text-lg">⚡</span> {/if}
                                    </div>
                                    <span class="text-[10px] font-bold text-neutral-400 group-hover:text-white uppercase tracking-widest text-center">{cls}</span>
                                </button>
                            {/each}
                        </div>
                    </div>
                {:else}
                    {@const activeColor = selectedAssetClass && assetColors[selectedAssetClass] ? assetColors[selectedAssetClass].hex : '#ffffff'}
                    <div class="p-4 border-b border-neutral-800/80 flex items-center justify-between bg-[#0a0a0a]">
                        <button aria-label="Back to Classes" onclick={() => { assetPickerStep = 'class'; selectedAssetClass = null; }} class="w-8 h-8 rounded-full hover:bg-[#222] flex items-center justify-center text-neutral-400 transition-colors cursor-pointer">←</button>
                        <h3 class="font-bold tracking-wide text-sm text-center uppercase" style="color: {activeColor}; text-shadow: 0 0 8px {activeColor}40;">{selectedAssetClass} Index</h3>
                        <div class="w-8"></div>
                    </div>
                    <div class="p-4 border-b border-neutral-800/80 bg-[#0c0c0c]">
                        <div class="relative"><svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg><input aria-label="Asset Search" type="text" bind:value={assetSearchQuery} placeholder="Search ticker or address..." class="w-full bg-[#1a1a1a] border border-neutral-800 rounded-xl pl-9 pr-4 py-3 text-[11px] font-mono text-white outline-none transition-colors" style="border-color: {activeColor}50;" /></div>
                    </div>
                    <div class="flex-1 overflow-y-auto p-2 bg-[#111]">
                        <div class="flex flex-col gap-1">
                            {#each filteredAssets as asset}
                                <button aria-label="Select Asset" onclick={() => { editSettlementParams.targetAsset = asset; isAssetPickerOpen = false; assetPickerStep = 'class'; selectedAssetClass = null; }} class="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#1a1a1a] transition-colors cursor-pointer group border border-transparent hover:border-neutral-800">
                                    <div class="flex items-center gap-3 pointer-events-none">
                                        <div class="w-8 h-8 rounded-full bg-[#0c0c0c] border border-neutral-800 flex items-center justify-center text-[10px] font-black overflow-hidden" style="color: {assetColors[asset.assetClass as string]?.hex || '#ffffff'};">
                                            {#if asset.imgUrl}
                                                <img src={asset.imgUrl} class="w-4 h-4 object-contain" alt="logo" />
                                            {:else}
                                                {asset.ticker.substring(0,1)}
                                            {/if}
                                        </div>
                                        <div class="flex flex-col items-start"><span class="text-xs font-bold text-white tracking-widest">{asset.ticker}</span><span class="text-[10px] text-neutral-500">{asset.name}</span></div>
                                    </div>
                                    <span class="text-[8px] font-mono uppercase tracking-widest px-2 py-1 rounded bg-[#0c0c0c] text-neutral-500 border border-neutral-800 pointer-events-none">{asset.assetClass}</span>
                                </button>
                            {/each}
                            {#if filteredAssets.length === 0}
                                <div class="py-8 text-center text-[10px] font-mono text-neutral-500 uppercase tracking-widest">No assets found in registry</div>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>
        {/if}
    </div>
{/if}

<style>
    .custom-slider {
        -webkit-appearance: none;
        appearance: none;
        background: #1a1a1a;
        height: 8px;
        border-radius: 4px;
        outline: none;
        border: 1px solid #222;
    }
    
    .custom-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background: #111;
        cursor: pointer;
        border: 2px solid #14b8a6;
        box-shadow: 0 0 15px rgba(20, 184, 166, 0.4);
        transition: transform 0.1s;
    }

    .custom-slider::-webkit-slider-thumb:hover { transform: scale(1.15); background: #14b8a6; }

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