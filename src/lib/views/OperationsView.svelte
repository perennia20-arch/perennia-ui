<script lang="ts">
    import { workers, silos, plants, systemMode, tokenRegistry, type Worker, type Silo, type Plant, type SettlementConfig, type TokenAsset, type AssetClass, type SiloWidth } from '$lib/stores/app';
    import { isWalletConnected, walletAddress } from '$lib/stores/wallet';
    import { onMount, onDestroy } from 'svelte';

    let activeMenu = $state<string | null>(null);
    let activeSiloMenu = $state<string | null>(null);
    let activePlantMenu = $state<string | null>(null);
    let copyModalWorker = $state<Worker | null>(null);
    
    const defaultSettlement: SettlementConfig = { targetAsset: tokenRegistry[0], payoutAddress: '', autoPayout: true, mode: 'threshold', threshold: 100, streamMode: 'interval', streamValue: 1, streamUnit: 'hours', appointmentDate: '', appointmentTime: '17:00' };
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

    let networkHashrate = $state("0.00");
    let pendingTreasury = $state("0.0000");
    let nodeStatus = $state("offline");
    
    let hashHistory = $state<number[]>(Array(30).fill(0));
    let kasPrice = $state<number>(0.00);
    let kasChange = $state<number>(0);
    let kasHistory = $state<number[]>(Array(30).fill(0));

    let pollingInterval: ReturnType<typeof setInterval>;
    let kaspaInterval: ReturnType<typeof setInterval>;

    function buildSvgPath(data: number[], width: number, height: number): string {
        if (!data || data.length === 0) return '';
        const validData = data.filter(v => v !== 0);
        const max = validData.length > 0 ? Math.max(...validData) * 1.05 : 1; 
        const min = validData.length > 0 ? Math.min(...validData) * 0.95 : 0;
        const range = max - min || 1;
        return data.map((d, i) => {
            const x = (i / (Math.max(1, data.length - 1))) * width;
            const y = d === 0 ? height : height - ((d - min) / range) * height;
            return `${i === 0 ? 'M' : 'L'} ${x},${y}`;
        }).join(' ');
    }

    let hashratePath = $derived(buildSvgPath(hashHistory, 200, 40));
    let pricePath = $derived(buildSvgPath(kasHistory, 200, 40));

    async function fetchKaspaPrice() {
        try {
            const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=kaspa&vs_currencies=usd&include_24hr_change=true');
            const data = await res.json();
            if (data?.kaspa) {
                kasPrice = data.kaspa.usd;
                kasChange = data.kaspa.usd_24h_change || 0;
                kasHistory = [...kasHistory.slice(1), kasPrice];
            }
        } catch(e) {
            try {
                const res2 = await fetch('https://api.kaspa.org/info/price');
                const data2 = await res2.json();
                kasPrice = data2.price;
                kasHistory = [...kasHistory.slice(1), kasPrice];
            } catch (e2) { console.error("Price APIs failed"); }
        }
    }

    async function pingStratumNode() { 
        if (!$isWalletConnected || !$walletAddress) { nodeStatus = "offline"; networkHashrate = "0.00"; pendingTreasury = "0.0000"; return; } 
        try { 
            const response = await fetch('/api/telemetry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ walletAddress: $walletAddress, clientWorkers: $workers }) }); 
            const data = await response.json(); 
            if (data.success) { 
                nodeStatus = data.nodeStatus; 
                networkHashrate = parseFloat(data.networkPower || "0").toFixed(2); 
                pendingTreasury = data.pendingTreasury; 
                if (data.serverWorkers) { $workers = data.serverWorkers; }
                hashHistory = [...hashHistory.slice(1), parseFloat(data.networkPower || "0")];
            } 
        } catch (error) { nodeStatus = "offline"; } 
    }

    onMount(() => { 
        hashHistory = Array.from({length: 30}, () => Math.random() * 0.1);
        kasHistory = Array.from({length: 30}, () => 0.16 + (Math.random() * 0.01));
        pingStratumNode(); fetchKaspaPrice();
        kaspaInterval = setInterval(fetchKaspaPrice, 30000); 
        pollingInterval = setInterval(pingStratumNode, 3000); 
    });
    onDestroy(() => { clearInterval(pollingInterval); clearInterval(kaspaInterval); });

    let dragType = $state<'worker' | 'silo' | null>(null);
    let draggedId = $state<string | null>(null);
    let targetDropId = $state<string | null>(null);
    let targetDropType = $state<'field' | 'silo' | 'plant' | 'canvas' | null>(null);

    function handleDragStart(e: DragEvent, type: 'worker' | 'silo', id: string) { e.stopPropagation(); dragType = type; draggedId = id; if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('type', type); e.dataTransfer.setData('id', id); } }
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
        }
        handleDragEnd();
    }

    function addSilo() { const id = Math.random().toString(36).substring(2, 8).toUpperCase(); const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1); $silos = [...$silos, { id, name: `Sector Alpha-${id.substring(0,2)}`, width: 4, assignedPlantId: null, settlementConfig: { ...defaultSettlement, payoutAddress: $walletAddress || '', appointmentDate: tomorrow.toISOString().split('T')[0] } }]; }
    function addPlant() { if ($silos.length < 2) return; const id = Math.random().toString(36).substring(2, 8).toUpperCase(); $plants = [...$plants, { id, name: `Synthesis Plant-${id.substring(0,2)}`, liquidityDeposit: { isActive: false, pairName: 'Awaiting Pairs', totalLiquidityUsd: 0 }, currentApr: 0, autoCompound: true }]; }
    function deleteSilo(id: string) { if(confirm("Permanently destroy this Silo? Workers will return to the field.")) { $workers = $workers.map(w => w.assignedSiloId === id ? { ...w, assignedSiloId: null } : w); $silos = $silos.filter(s => s.id !== id); activeSiloMenu = null; } }
    function deletePlant(id: string) { if(confirm("Dismantle this Plant? Sectors inside will safely return to standalone operation.")) { $silos = $silos.map(s => s.assignedPlantId === id ? { ...s, assignedPlantId: null } : s); $plants = $plants.filter(p => p.id !== id); activePlantMenu = null; } }
    function toggleSiloWidth(id: string) { $silos = $silos.map(s => { if (s.id === id) return { ...s, width: s.width === 4 ? 6 : s.width === 6 ? 12 : 4 as SiloWidth }; return s; }); }
    
    function renameSilo(id: string) {
        const siloIndex = $silos.findIndex(s => s.id === id);
        if (siloIndex !== -1) {
            const currentName = $silos[siloIndex].name;
            const newName = prompt("Enter new Sector name:", currentName);
            if (newName && newName.trim() !== "") {
                $silos[siloIndex].name = newName.trim();
                $silos = [...$silos];
            }
        }
        activeSiloMenu = null;
    }

    function openSettlement(silo: Silo) { 
        settlementModalSilo = silo; 
        if (!silo.settlementConfig) silo.settlementConfig = { ...defaultSettlement, payoutAddress: $walletAddress || '' }; 
        if (!silo.settlementConfig.targetAsset) silo.settlementConfig.targetAsset = tokenRegistry[0]; 
        editSettlementParams = JSON.parse(JSON.stringify(silo.settlementConfig)); 
        activeSiloMenu = null; isAssetPickerOpen = false; assetPickerStep = 'class'; selectedAssetClass = null; assetSearchQuery = '';
    }
    function saveSettlementParams() { if (settlementModalSilo) { $silos = $silos.map(s => { if (s.id === settlementModalSilo!.id) return { ...s, settlementConfig: editSettlementParams }; return s; }); settlementModalSilo = null; editSettlementParams = { ...defaultSettlement }; } }

    function addWorker(type: 'physical' | 'capital') { const id = Math.random().toString(36).substring(2, 8).toUpperCase(); const name = `${type === 'physical' ? 'Rig' : 'Cap'}-${id.substring(0,4)}`; const newWorker: Worker = { id, type, name, stratumUrl: 'stratum+tcp://192.168.0.12:5555', walletWorker: $walletAddress ? `${$walletAddress}.${name}` : `kaspa:pending.${name}`, hashRate: 0.00, isOnline: false, assignedSiloId: null }; $workers = [...$workers, newWorker]; pingStratumNode(); }
    function renameWorker(id: string) { const workerIndex = $workers.findIndex(w => w.id === id); if (workerIndex !== -1) { const currentName = $workers[workerIndex].name; const newName = prompt("Enter exact hardware worker name:", currentName); if (newName && newName.trim() !== "") { const cleanedName = newName.trim(); $workers[workerIndex].name = cleanedName; $workers[workerIndex].walletWorker = $walletAddress ? `${$walletAddress}.${cleanedName}` : `kaspa:pending.${cleanedName}`; $workers = [...$workers]; pingStratumNode(); } } activeMenu = null; }
    function deleteWorker(id: string) { if(confirm("Permanently decommission this worker?")) { $workers = $workers.filter(w => w.id !== id); activeMenu = null; pingStratumNode(); } }
    function copyText(text: string) { navigator.clipboard.writeText(text); alert('Copied to clipboard!'); }

    let unassignedWorkers = $derived($workers.filter(w => w.assignedSiloId === null));
    let unassignedSilos = $derived($silos.filter(s => s.assignedPlantId === null));

    function getSiloTheme(silo: Silo, inPlant: boolean) {
        if (inPlant) return { border: 'bg-emerald-950/20 border-emerald-900/40', text: 'text-emerald-400', bg: 'bg-emerald-500', pulse: true };
        if (!silo.settlementConfig?.autoPayout) return { border: '', text: 'text-teal-500', bg: 'bg-teal-500', pulse: false };
        if (silo.settlementConfig.mode === 'stream') return { border: 'bg-emerald-950/20 border-emerald-900/40', text: 'text-emerald-400', bg: 'bg-emerald-500', pulse: true };
        if (silo.settlementConfig.mode === 'appointment') return { border: 'bg-blue-950/20 border-blue-900/40', text: 'text-blue-400', bg: 'bg-blue-500', pulse: false };
        return { border: '', text: 'text-amber-400', bg: 'bg-amber-500', pulse: false };
    }
</script>

{#snippet workerCard(worker: Worker)}
<div draggable="true" ondragstart={(e) => handleDragStart(e, 'worker', worker.id)} ondragend={handleDragEnd} class="relative bg-[#0c0c0c] border border-neutral-800/80 rounded-xl p-3 shadow-md group cursor-grab active:cursor-grabbing hover:border-teal-500/50 transition-colors z-20 {dragType === 'worker' && draggedId === worker.id ? 'opacity-50 border-teal-500' : ''}">
    <div class="flex justify-between items-start mb-2 pointer-events-none">
        <div class="flex items-center gap-2 min-w-0">
            <div class="w-1.5 h-1.5 rounded-full shrink-0 {worker.isOnline ? 'bg-teal-500 animate-pulse shadow-[0_0_8px_rgba(20,184,166,0.8)]' : 'bg-neutral-600'}"></div>
            <span class="text-xs font-bold text-white truncate max-w-[80px] xl:max-w-[100px]" title={worker.name}>{worker.name}</span>
        </div>
        <div class="relative pointer-events-auto">
            <button aria-label="Menu" onmousedown={(e) => e.stopPropagation()} onclick={(e) => {e.stopPropagation(); activeSiloMenu = null; activePlantMenu = null; activeMenu = activeMenu === worker.id ? null : worker.id}} class="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-white rounded-full hover:bg-[#222] transition-colors cursor-pointer shrink-0"><span class="font-bold pb-1 text-sm">⋮</span></button>
            {#if activeMenu === worker.id}
                <div class="absolute top-8 left-2 w-[calc(100%-16px)] bg-[#1a1a1a] border border-neutral-700 rounded-lg shadow-2xl z-40 flex flex-col overflow-hidden pointer-events-auto" onmousedown={(e) => e.stopPropagation()}>
                    <button aria-label="Rename Config" onclick={() => renameWorker(worker.id)} class="text-left px-3 py-2.5 text-[10px] font-bold text-white hover:bg-[#222] transition-colors cursor-pointer">Rename Config</button>
                    {#if worker.type === 'physical'}<button aria-label="Copy Stratum" onclick={() => {copyModalWorker = worker; activeMenu = null;}} class="text-left px-3 py-2.5 text-[10px] font-bold text-teal-400 hover:bg-[#222] transition-colors cursor-pointer">Copy Stratum</button>{:else}<button aria-label="Add Tokens" class="text-left px-3 py-2.5 text-[10px] font-bold text-purple-400 hover:bg-[#222] transition-colors cursor-pointer">Add Tokens</button>{/if}
                    <div class="h-px bg-neutral-800"></div><button aria-label="Decommission" onclick={() => deleteWorker(worker.id)} class="text-left px-3 py-2.5 text-[10px] font-bold text-red-500 hover:bg-[#222] transition-colors cursor-pointer">Decommission</button>
                </div>
            {/if}
        </div>
    </div>
    <div class="flex justify-between items-end mt-1 pointer-events-none">
        <span class="text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded border {worker.type === 'physical' ? 'bg-teal-950/20 text-teal-400 border-teal-900/50' : 'bg-purple-950/20 text-purple-400 border-purple-900/50'}">{worker.type.substring(0,4)}</span>
        <div class="flex flex-col items-end">
            <span class="text-[7px] uppercase tracking-widest text-neutral-500 font-bold font-mono">Live Hash</span>
            <span class="text-sm font-mono font-black {worker.hashRate > 0 ? 'text-white' : 'text-neutral-600'} tabular-nums leading-none tracking-tight transition-colors duration-500">{worker.hashRate.toFixed(2)} <span class="text-[8px] text-neutral-500 font-normal">TH</span></span>
        </div>
    </div>
</div>
{/snippet}

{#snippet siloCard(silo: Silo, inPlant: boolean)}
{@const siloWorkers = $workers.filter(w => w.assignedSiloId === silo.id)}
{@const theme = getSiloTheme(silo, inPlant)}
{@const spanClass = inPlant ? 'w-full h-full' : (silo.width === 4 ? 'col-span-12 lg:col-span-6 xl:col-span-4' : silo.width === 6 ? 'col-span-12 xl:col-span-6' : 'col-span-12')}

<div draggable={!inPlant ? "true" : "false"} ondragstart={(e) => {if(!inPlant) handleDragStart(e, 'silo', silo.id)}} ondragend={handleDragEnd}
     ondragover={(e) => handleDragOver(e, silo.id, 'silo')} ondragleave={handleDragLeave} ondrop={(e) => handleDrop(e, 'silo', silo.id)}
     class="bg-[#111]/80 backdrop-blur-md border border-neutral-800 rounded-[20px] p-4 flex flex-col gap-3 min-h-[220px] shadow-lg transition-all duration-300 {spanClass}
            {!inPlant ? 'cursor-grab active:cursor-grabbing hover:border-neutral-700' : 'border-emerald-900/50 shadow-inner bg-black/40'} 
            {targetDropId === silo.id && dragType === 'worker' ? 'border-teal-500/50 bg-[#161616]' : ''} 
            {dragType === 'silo' && draggedId === silo.id ? 'opacity-50 border-purple-500/50 scale-95' : ''}">
    
    <div class="flex justify-between items-center border-b border-neutral-800/80 pb-3 mb-1 pointer-events-auto">
        <div class="flex items-center gap-2.5 min-w-0">
            <div class="w-2.5 h-2.5 rounded-full shrink-0 transition-colors duration-500 {theme.bg} {theme.pulse ? 'shadow-[0_0_12px_rgba(52,211,153,0.8)] animate-pulse' : 'shadow-[0_0_10px_rgba(0,0,0,0.5)]'}"></div>
            <h3 class="text-white font-bold tracking-widest uppercase text-[11px] truncate">{silo.name}</h3>
        </div>
        
        <div class="flex items-center gap-1.5 shrink-0 relative">
            <div class="bg-black border border-neutral-800 px-2 py-1 rounded-lg pointer-events-none mr-1 flex flex-col items-end">
                <span class="{siloWorkers.length > 0 ? 'text-teal-400' : 'text-neutral-500'} font-mono font-black text-[11px] xl:text-[13px] leading-none transition-colors">{siloWorkers.reduce((sum, w) => sum + w.hashRate, 0).toFixed(2)} <span class="text-[8px] xl:text-[9px] {siloWorkers.length > 0 ? 'text-teal-700' : 'text-neutral-600'} font-normal ml-0.5">TH/s</span></span>
            </div>
            {#if !inPlant}
                <button aria-label="Resize Sector" onmousedown={(e) => e.stopPropagation()} onclick={(e) => {e.stopPropagation(); toggleSiloWidth(silo.id);}} class="w-7 h-7 flex items-center justify-center text-neutral-500 hover:text-white rounded hover:bg-[#222] transition-colors cursor-pointer" title="Toggle Size"><span class="font-bold tracking-widest text-[12px]">[ ]</span></button>
            {/if}
            <div class="relative">
                <button aria-label="Sector Menu" onmousedown={(e) => e.stopPropagation()} onclick={(e) => { e.stopPropagation(); activeMenu = null; activePlantMenu = null; activeSiloMenu = activeSiloMenu === silo.id ? null : silo.id; }} class="w-7 h-7 flex items-center justify-center text-neutral-500 hover:text-white rounded-full hover:bg-[#222] transition-colors cursor-pointer z-30"><span class="font-bold pb-1 text-sm">⋮</span></button>
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

    {#if $systemMode === 'overclocked'}
        {#if inPlant}
            <div class="w-full bg-emerald-950/20 border border-emerald-900/40 rounded p-2 my-1 flex flex-col gap-2 relative overflow-hidden pointer-events-none transition-colors duration-500 {theme.border}">
                <div class="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(52,211,153,0.05)_50%,transparent_75%,transparent_100%)] bg-[length:10px_10px] animate-[slide_1s_linear_infinite]"></div>
                <div class="flex items-center justify-between z-10 w-full">
                    <span class="text-[8px] {theme.text} uppercase tracking-widest font-bold flex items-center gap-1.5"><div class="w-1 h-1 {theme.bg} rounded-full animate-ping"></div> Liquidity Protocol</span>
                    <span class="text-[8px] font-mono font-bold {theme.text} flex items-center gap-1">AUTO-STAKING LP</span>
                </div>
                <div class="flex items-center justify-between z-10 w-full px-1">
                     <span class="text-[7px] font-mono text-neutral-500 truncate max-w-[120px]">INTERCEPTED BY PLANT</span>
                     <span class="text-[7px] font-bold uppercase tracking-widest text-emerald-500">ACTIVE</span>
                </div>
            </div>
        {:else}
            <div class="w-full bg-teal-950/20 border border-teal-900/30 rounded p-2 my-1 flex flex-col gap-2 pointer-events-none relative overflow-hidden transition-colors duration-500 {theme.border}">
                <div class="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(20,184,166,0.05)_50%,transparent_75%,transparent_100%)] bg-[length:10px_10px] animate-[slide_1s_linear_infinite]"></div>
                <div class="flex items-center justify-between z-10 w-full">
                    <span class="text-[8px] {theme.text} uppercase tracking-widest font-bold flex items-center gap-1.5"><div class="w-1 h-1 {theme.bg} rounded-full animate-ping"></div> Asset Route</span>
                    <span class="text-[8px] font-mono font-bold {silo.settlementConfig?.targetAsset?.color || 'text-teal-600'} flex items-center gap-1">
                        <span class="text-white bg-black/50 px-1 rounded border border-neutral-700">{silo.settlementConfig?.targetAsset?.ticker || 'KAS'}</span>
                        <span class="{silo.settlementConfig?.autoPayout ? '' : 'line-through opacity-50'}">
                            {#if silo.settlementConfig?.mode === 'stream'} STREAM {:else if silo.settlementConfig?.mode === 'appointment'} APPT {:else} LIMIT {/if}
                        </span>
                    </span>
                </div>
                <div class="flex items-center justify-between z-10 w-full px-1">
                     <span class="text-[7px] font-mono text-neutral-500 truncate max-w-[120px]">{silo.settlementConfig?.payoutAddress || 'NO ADDRESS'}</span>
                     <span class="text-[7px] font-bold uppercase tracking-widest {silo.settlementConfig?.autoPayout ? 'text-amber-500' : 'text-neutral-500'}">{silo.settlementConfig?.autoPayout ? 'ACTIVE' : 'HOLD'}</span>
                </div>
            </div>
        {/if}
    {/if}

    <div class="grid grid-cols-1 {!inPlant && silo.width === 12 ? 'xl:grid-cols-3' : (!inPlant && silo.width === 6) ? 'xl:grid-cols-2' : 'xl:grid-cols-1'} gap-3 flex-1 relative content-start mt-1 z-10 min-h-[50px]">
        {#if siloWorkers.length === 0} <div class="absolute inset-0 flex items-center justify-center border border-dashed border-neutral-800/50 rounded-xl bg-black/20 pointer-events-none -z-10"><span class="text-[9px] uppercase tracking-widest text-neutral-600 font-bold">Drag Workers Here</span></div> {/if}
        {#each siloWorkers as worker (worker.id)} {@render workerCard(worker)} {/each}
    </div>
</div>
{/snippet}

<div class="w-full h-full p-3 md:p-6 overflow-y-auto" onclick={() => {activeMenu = null; activeSiloMenu = null; activePlantMenu = null;}}>
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-6 max-w-[2000px] mx-auto pb-24">
        
        <div class="flex flex-col gap-3 lg:col-span-3 xl:col-span-2" ondragover={(e) => handleDragOver(e, 'field', 'field')} ondragleave={handleDragLeave} ondrop={(e) => handleDrop(e, 'field', null)}>
            <div class="flex items-center justify-between border-b border-neutral-800/80 pb-2">
                <h2 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">The Field</h2><span class="text-[9px] font-mono text-neutral-600">{unassignedWorkers.length} UNASSIGNED</span>
            </div>
            <div class="flex flex-col xl:flex-row gap-2">
                <button aria-label="Add Physical Worker" onclick={() => addWorker('physical')} disabled={!$isWalletConnected} class="flex-1 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-teal-500/50 text-white text-[9px] font-bold uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">+ PHYS</button>
                <button aria-label="Add Capital Worker" onclick={() => addWorker('capital')} disabled={!$isWalletConnected} class="flex-1 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-teal-500/50 text-white text-[9px] font-bold uppercase tracking-widest py-2.5 rounded-lg transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">+ CAP</button>
            </div>
            <div class="flex flex-col gap-2.5 min-h-[400px] pb-10 transition-colors duration-300 {targetDropType === 'field' && dragType === 'worker' ? 'border border-dashed border-teal-500/30 rounded-xl bg-teal-500/5 p-2 -mx-2' : ''}">
                {#if unassignedWorkers.length === 0}
                    <div class="flex-1 border border-dashed border-neutral-800/50 rounded-xl flex items-center justify-center bg-black/20 p-4 text-center pointer-events-none"><p class="text-[9px] uppercase tracking-widest text-neutral-600 font-bold leading-relaxed">{#if !$isWalletConnected} Connect wallet {:else} All Assigned {/if}</p></div>
                {/if}
                {#each unassignedWorkers as worker (worker.id)}{@render workerCard(worker)}{/each}
            </div>
        </div>

        <div class="flex flex-col gap-4 lg:col-span-6 xl:col-span-8">
            
            {#if $isWalletConnected}
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2 animate-[fade-in-up_0.5s_ease-out]">
                    <div class="bg-[#0c0c0c] border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between h-[120px] shadow-inner relative overflow-hidden group">
                        <div class="flex justify-between items-start relative z-10 pointer-events-none">
                            <div class="flex flex-col">
                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5"><div class="w-1.5 h-1.5 rounded-full {nodeStatus === 'online' ? 'bg-teal-500 animate-pulse' : 'bg-neutral-600'}"></div> Live Hash Power</span>
                                <span class="text-2xl font-mono font-light text-white tracking-tight">{networkHashrate} <span class="text-xs text-neutral-500 font-bold">TH/s</span></span>
                            </div>
                        </div>
                        <div class="absolute bottom-0 left-0 w-full h-[60px] opacity-40 group-hover:opacity-80 transition-opacity duration-700">
                            <svg class="w-full h-full" preserveAspectRatio="none" viewBox="0 0 200 40">
                                <path d="{hashratePath} L 200,40 L 0,40 Z" fill="url(#hashGradient)" opacity="0.3"/>
                                <path d={hashratePath} fill="none" stroke="#14b8a6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drop-shadow-[0_0_5px_rgba(20,184,166,0.5)]"/>
                                <defs><linearGradient id="hashGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#14b8a6"/><stop offset="100%" stop-color="transparent"/></linearGradient></defs>
                            </svg>
                        </div>
                    </div>

                    <div class="bg-[#0c0c0c] border border-neutral-800 rounded-2xl p-4 flex flex-col justify-between h-[120px] shadow-inner relative overflow-hidden group">
                        <div class="flex justify-between items-start relative z-10 pointer-events-none">
                            <div class="flex flex-col">
                                <span class="text-[9px] font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5"><div class="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></div> KAS / USD Oracle</span>
                                <span class="text-2xl font-mono font-light text-white tracking-tight">${kasPrice.toFixed(4)}</span>
                            </div>
                            <span class="text-[10px] font-bold font-mono px-2 py-1 rounded bg-[#111] border {kasChange >= 0 ? 'text-emerald-400 border-emerald-900/30' : 'text-red-400 border-red-900/30'}">
                                {kasChange > 0 ? '+' : ''}{kasChange.toFixed(2)}%
                            </span>
                        </div>
                        <div class="absolute bottom-0 left-0 w-full h-[60px] opacity-40 group-hover:opacity-80 transition-opacity duration-700">
                            <svg class="w-full h-full" preserveAspectRatio="none" viewBox="0 0 200 40">
                                <path d="{pricePath} L 200,40 L 0,40 Z" fill="url(#kasGradient)" opacity="0.3"/>
                                <path d={pricePath} fill="none" stroke={kasChange >= 0 ? "#10b981" : "#ef4444"} stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="drop-shadow-[0_0_5px_rgba(112,199,186,0.5)]"/>
                                <defs><linearGradient id="kasGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color={kasChange >= 0 ? "#10b981" : "#ef4444"}/><stop offset="100%" stop-color="transparent"/></linearGradient></defs>
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
                <button aria-label="Add Plant" onclick={addPlant} disabled={!$isWalletConnected || $silos.length < 2} title={$silos.length < 2 ? 'Requires 2 active Silos to synthesize a Plant' : ''} class="flex-1 max-w-[200px] bg-[#111] hover:bg-purple-950/40 border border-neutral-800 hover:border-purple-500/50 text-purple-400 hover:text-purple-300 text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:bg-[#0a0a0a] disabled:border-neutral-900 disabled:text-neutral-700 disabled:cursor-not-allowed">+ Plant</button>
                <button aria-label="Add Nexus" disabled class="flex-1 max-w-[200px] bg-[#0a0a0a] border border-neutral-900 text-neutral-700 text-[10px] font-bold uppercase tracking-widest py-3 rounded-xl cursor-not-allowed">+ Nexus</button>
            </div>

            <div class="flex-1 border border-neutral-800/50 rounded-2xl bg-[#0a0a0a] p-4 md:p-6 min-h-[400px] xl:min-h-[600px] relative overflow-y-auto shadow-inner" style="background-image: linear-gradient(#14b8a608 1px, transparent 1px), linear-gradient(90deg, #14b8a608 1px, transparent 1px); background-size: 24px 24px;">
                
                {#if !$isWalletConnected}
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6 z-20">
                        <div class="w-full max-w-3xl text-center">
                            <h2 class="text-3xl md:text-5xl lg:text-6xl font-black uppercase tracking-[0.1em] text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-white to-amber-500 mb-6 drop-shadow-2xl">Tokenize Anything.<br>Liquidate Everything.</h2>
                            <p class="text-[12px] md:text-sm font-mono text-neutral-400 uppercase tracking-widest leading-relaxed">Connect your Web3 Wallet to initialize the Command Center.</p>
                        </div>
                    </div>
                {:else if $silos.length === 0 && $plants.length === 0}
                    <div class="absolute inset-0 flex flex-col items-center justify-center pointer-events-none p-6">
                        <h2 class="text-2xl md:text-4xl font-black uppercase tracking-[0.1em] text-white/80 mb-8 drop-shadow-lg text-center">Tokenize Anything.<br><span class="text-teal-500">Liquidate Everything.</span></h2>
                        <div class="relative w-24 h-24 rounded-full bg-teal-500/5 border border-teal-500/20 flex items-center justify-center mb-6 shadow-lg"><svg class="text-teal-500/30 w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg></div>
                        <p class="text-[12px] uppercase tracking-widest text-neutral-500 font-bold text-center leading-relaxed">Workspace Canvas Initialized<br><span class="text-[10px] font-mono text-neutral-600 font-normal mt-2 block">Deploy Sectors to Begin Mining</span></p>
                    </div>
                {:else}
                    <div class="flex flex-col gap-10 relative z-10 w-full pb-10">
                        
                        {#if $plants.length > 0}
                            <div class="flex flex-col gap-4">
                                <h2 class="text-[10px] font-bold uppercase tracking-widest text-purple-500/80 mb-2 border-b border-purple-900/30 pb-2">Synthesis Plants</h2>
                                <div class="grid grid-cols-1 xl:grid-cols-2 gap-6 relative z-10">
                                    {#each $plants as plant (plant.id)}
                                        {@const plantSilos = $silos.filter(s => s.assignedPlantId === plant.id)}
                                        <div ondragover={(e) => handleDragOver(e, plant.id, 'plant')} ondragleave={handleDragLeave} ondrop={(e) => handleDrop(e, 'plant', plant.id)}
                                             class="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-neutral-800 rounded-[28px] p-6 shadow-2xl transition-all duration-300 {targetDropId === plant.id && dragType === 'silo' ? 'border-purple-500/80 bg-[#161616] shadow-[0_0_30px_rgba(168,85,247,0.15)] scale-[1.02]' : 'hover:border-purple-900/50'}">
                                            
                                            <div class="flex justify-between items-center mb-6 border-b border-neutral-800/80 pb-4">
                                                <div class="flex items-center gap-3 pointer-events-none">
                                                    <div class="w-3 h-3 rounded-full {plant.liquidityDeposit.isActive ? 'bg-purple-500 shadow-[0_0_12px_rgba(168,85,247,0.8)] animate-pulse' : 'bg-neutral-600'}"></div>
                                                    <h3 class="text-white font-black tracking-widest uppercase text-sm">{plant.name}</h3>
                                                </div>
                                                <div class="flex items-center gap-3 relative">
                                                    <span class="px-3 py-1 text-[10px] font-bold uppercase tracking-widest rounded-lg border {plant.liquidityDeposit.isActive ? 'bg-emerald-950/30 border-emerald-900/50 text-emerald-400' : 'bg-[#1a1a1a] border-neutral-800 text-neutral-500'}">
                                                        {plant.liquidityDeposit.isActive ? 'Liquidity Synthesized' : 'Awaiting Silos'}
                                                    </span>
                                                    <div class="relative">
                                                        <button aria-label="Plant Menu" onmousedown={(e) => e.stopPropagation()} onclick={(e) => { e.stopPropagation(); activeSiloMenu = null; activePlantMenu = activePlantMenu === plant.id ? null : plant.id; }} class="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-white rounded-full hover:bg-[#222] transition-colors cursor-pointer relative"><span class="font-bold pb-1 text-sm">⋮</span></button>
                                                        {#if activePlantMenu === plant.id}
                                                            <div class="absolute top-8 right-0 w-48 bg-[#1a1a1a] border border-neutral-700 rounded-lg shadow-2xl z-40 flex flex-col overflow-hidden" onmousedown={(e) => e.stopPropagation()}>
                                                                <button aria-label="Dismantle Plant" onclick={(e) => {e.stopPropagation(); deletePlant(plant.id);}} class="text-left px-3 py-2.5 text-[10px] font-bold text-red-500 hover:bg-[#222] transition-colors cursor-pointer">Dismantle Plant</button>
                                                            </div>
                                                        {/if}
                                                    </div>
                                                </div>
                                            </div>

                                            {#if plant.liquidityDeposit.isActive}
                                                <div class="mb-6 bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-4 flex items-center justify-between animate-[fade-in-up_0.3s_ease-out]">
                                                    <div class="flex items-center gap-3">
                                                        <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]"></div>
                                                        <span class="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Liquidity Deposit Auto-Paired</span>
                                                    </div>
                                                    <div class="flex gap-6">
                                                        <div class="flex flex-col items-end">
                                                            <span class="text-[8px] text-neutral-500 uppercase tracking-widest font-bold">Pairing</span>
                                                            <span class="text-sm font-mono font-black text-white">{plant.liquidityDeposit.pairName}</span>
                                                        </div>
                                                        <div class="flex flex-col items-end">
                                                            <span class="text-[8px] text-neutral-500 uppercase tracking-widest font-bold">Yield</span>
                                                            <span class="text-sm font-mono font-black text-emerald-400">{plant.currentApr}% APR</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            {/if}

                                            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[220px]">
                                                {#each plantSilos as silo} {@render siloCard(silo, true)} {/each}
                                                {#each Array(2 - plantSilos.length) as _}
                                                    <div class="border-2 border-dashed rounded-[20px] flex flex-col items-center justify-center min-h-[220px] transition-colors pointer-events-none {targetDropId === plant.id ? 'bg-purple-900/10 border-purple-500/50' : 'border-neutral-800/80 bg-black/20'}">
                                                        <svg class="w-8 h-8 text-neutral-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/></svg>
                                                        <span class="text-neutral-500 font-bold uppercase tracking-widest text-[10px]">Drop Silo Here</span>
                                                    </div>
                                                {/each}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                            {#if unassignedSilos.length > 0} <div class="w-full h-px bg-neutral-800/50 my-2"></div> {/if}
                        {/if}

                        <div class="flex flex-col gap-4">
                            {#if $plants.length > 0 && unassignedSilos.length > 0} <h2 class="text-[10px] font-bold uppercase tracking-widest text-teal-500/80 mb-2 border-b border-teal-900/30 pb-2">Standalone Sectors</h2> {/if}
                            <div ondragover={(e) => handleDragOver(e, 'canvas', 'canvas')} ondragleave={handleDragLeave} ondrop={(e) => handleDrop(e, 'canvas', null)}
                                 class="grid grid-cols-1 md:grid-cols-12 gap-6 relative z-10 content-start w-full min-h-[200px] transition-colors duration-300 {targetDropType === 'canvas' && dragType === 'silo' ? 'bg-teal-500/5 border border-dashed border-teal-500/30 rounded-3xl p-4 -m-4' : ''}">
                                {#each unassignedSilos as silo (silo.id)} {@render siloCard(silo, false)} {/each}
                            </div>
                        </div>
                        
                    </div>
                {/if}
            </div>
        </div>

        <div class="flex flex-col gap-3 lg:col-span-3 xl:col-span-2 min-w-0 pointer-events-none">
            <div class="flex items-center justify-between border-b border-neutral-800/80 pb-2 mt-[270px]"><h2 class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Node Sync</h2><span class="text-[8px] xl:text-[9px] font-mono flex items-center gap-1.5 {nodeStatus === 'online' ? 'text-teal-500' : nodeStatus === 'unreachable' ? 'text-amber-500' : 'text-neutral-600'} transition-colors"><div class="w-1.5 h-1.5 rounded-full {nodeStatus === 'online' ? 'bg-teal-500 animate-pulse' : nodeStatus === 'unreachable' ? 'bg-amber-500' : 'bg-neutral-600'}"></div>{nodeStatus === 'online' ? 'Node Live' : nodeStatus === 'unreachable' ? 'Node Pending' : 'Offline'}</span></div>
            <div class="bg-gradient-to-br from-[#0c0c0c] to-[#111] border border-neutral-800 p-4 rounded-xl shadow-lg flex flex-col items-center justify-center min-h-[100px]"><div class="text-[8px] font-bold uppercase tracking-widest text-neutral-500 text-center mb-2">Pending Local Treasury</div><div class="text-lg xl:text-2xl font-mono font-light text-teal-400 drop-shadow-[0_0_8px_rgba(20,184,166,0.2)] tracking-tighter text-center tabular-nums transition-all">{pendingTreasury} <span class="text-[10px] font-sans font-bold uppercase text-neutral-600">KAS</span></div></div>
        </div>
    </div>
</div>

{#if settlementModalSilo && editSettlementParams}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <button aria-label="Close Modal" class="absolute inset-0 w-full h-full bg-black/80 backdrop-blur-sm cursor-default border-none" onclick={() => {settlementModalSilo = null; isAssetPickerOpen = false; editSettlementParams = {...defaultSettlement};}}></button>
        
        {#if !isAssetPickerOpen}
            <div class="relative z-10 w-full max-w-[420px] bg-[#111] border border-neutral-800 rounded-[28px] shadow-2xl flex flex-col overflow-hidden transition-colors duration-500 border-t-4 {editSettlementParams.autoPayout ? (editSettlementParams.mode === 'stream' ? 'border-t-emerald-500' : editSettlementParams.mode === 'appointment' ? 'border-t-blue-500' : 'border-t-amber-500') : 'border-t-neutral-600'} animate-[fade-in-up_0.2s_ease-out]">
                <div class="px-6 pt-6 pb-4 border-b border-neutral-800/80">
                    <h3 class="text-white font-bold tracking-wide text-md mb-1 text-center truncate">{settlementModalSilo.name}</h3>
                    <span class="text-[9px] text-neutral-500 uppercase tracking-widest text-center block font-bold">Settlement Protocol</span>
                </div>
                <div class="p-6 flex flex-col gap-5">
                    
                    <div class="flex flex-col gap-1.5">
                        <span class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1 block">Target Asset Route</span>
                        <button aria-label="Target Asset Route" onclick={() => {isAssetPickerOpen = true; assetPickerStep = 'class'; selectedAssetClass = null; assetSearchQuery = '';}} class="w-full bg-[#0c0c0c] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-teal-500/50 rounded-xl px-4 py-3 flex items-center justify-between transition-colors cursor-pointer group shadow-inner">
                            <div class="flex items-center gap-3">
                                <div class="w-7 h-7 rounded-full bg-[#111] border border-neutral-800 flex items-center justify-center">
                                    <span class="font-black text-[11px] {editSettlementParams.targetAsset.color}">{editSettlementParams.targetAsset.ticker[0]}</span>
                                </div>
                                <div class="flex flex-col items-start">
                                    <span class="text-[12px] font-bold text-white leading-none mb-0.5">{editSettlementParams.targetAsset.ticker}</span>
                                    <span class="text-[9px] font-mono text-neutral-500 truncate max-w-[150px]">{editSettlementParams.targetAsset.name}</span>
                                </div>
                            </div>
                            <div class="flex items-center gap-2">
                                <span class="text-[8px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded bg-[#1a1a1a] text-neutral-500 border border-neutral-800">{editSettlementParams.targetAsset.assetClass}</span>
                            </div>
                        </button>
                    </div>

                    <div class="flex flex-col gap-1.5">
                        <label for="destWallet" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">Destination Address / Wallet</label>
                        <input id="destWallet" type="text" bind:value={editSettlementParams.payoutAddress} placeholder="kaspa:..." spellcheck="false" class="w-full bg-[#0c0c0c] border border-neutral-800 focus:border-amber-500/50 rounded-xl px-4 py-3 text-[11px] font-mono text-amber-400 outline-none transition-colors" />
                    </div>
                    <div class="flex bg-[#0a0a0a] rounded-xl p-1 border border-neutral-800 {editSettlementParams.autoPayout ? '' : 'opacity-50 pointer-events-none'} transition-opacity shadow-inner">
                        <button onclick={() => editSettlementParams.mode = 'threshold'} class="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all {editSettlementParams.mode === 'threshold' ? 'bg-[#1a1a1a] text-amber-400 shadow-md border border-neutral-800' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Limit</button>
                        <button onclick={() => editSettlementParams.mode = 'stream'} class="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all {editSettlementParams.mode === 'stream' ? 'bg-[#1a1a1a] text-emerald-400 shadow-md border border-neutral-800' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Stream</button>
                        <button onclick={() => editSettlementParams.mode = 'appointment'} class="flex-1 py-2 text-[9px] font-bold uppercase tracking-widest rounded-lg transition-all {editSettlementParams.mode === 'appointment' ? 'bg-[#1a1a1a] text-blue-400 shadow-md border border-neutral-800' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Appt.</button>
                    </div>

                    {#if editSettlementParams.mode === 'threshold'}
                        <div class="flex flex-col gap-1.5 animate-[fade-in-up_0.2s_ease-out] {editSettlementParams.autoPayout ? '' : 'opacity-50 pointer-events-none'}">
                            <label for="threshLimit" class="text-[9px] text-neutral-400 uppercase tracking-widest font-bold ml-1">Payout Limit</label>
                            <div class="relative flex items-center">
                                <input id="threshLimit" type="number" min="10" step="10" bind:value={editSettlementParams.threshold} class="w-full bg-[#0c0c0c] border border-neutral-800 focus:border-amber-500/50 rounded-xl pl-4 pr-16 py-3 text-[13px] font-mono font-bold text-white outline-none transition-colors appearance-none" />
                                <span class="absolute right-4 text-[10px] font-bold text-neutral-600 pointer-events-none uppercase">{editSettlementParams.targetAsset.ticker}</span>
                            </div>
                            <input aria-label="Threshold Range" type="range" bind:value={editSettlementParams.threshold} min="10" max="10000" step="10" class="w-full mt-2 accent-amber-500 cursor-pointer h-1 bg-neutral-800 rounded-lg appearance-none" />
                        </div>
                    {:else if editSettlementParams.mode === 'stream'}
                        <div class="flex flex-col gap-3 animate-[fade-in-up_0.2s_ease-out] {editSettlementParams.autoPayout ? '' : 'opacity-50 pointer-events-none'}">
                            <div class="grid grid-cols-2 gap-2">
                                <button aria-label="Real Time Stream" onclick={() => editSettlementParams.streamMode = 'realtime'} class="py-2.5 rounded-lg border text-[9px] font-bold uppercase tracking-widest transition-all {editSettlementParams.streamMode === 'realtime' ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400' : 'bg-[#0c0c0c] border-neutral-800 text-neutral-500 hover:border-neutral-700 cursor-pointer'}">Real-Time</button>
                                <button aria-label="Interval Stream" onclick={() => editSettlementParams.streamMode = 'interval'} class="py-2.5 rounded-lg border text-[9px] font-bold uppercase tracking-widest transition-all {editSettlementParams.streamMode === 'interval' ? 'bg-emerald-950/40 border-emerald-500 text-emerald-400' : 'bg-[#0c0c0c] border-neutral-800 text-neutral-500 hover:border-neutral-700 cursor-pointer'}">Interval</button>
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
                    <button aria-label="Cancel" onclick={() => {settlementModalSilo = null; isAssetPickerOpen = false; editSettlementParams = {...defaultSettlement};}} class="flex-1 py-3 bg-[#161616] hover:bg-[#222] border border-neutral-800 text-neutral-400 hover:text-white font-bold uppercase tracking-widest text-[10px] rounded-xl transition-colors cursor-pointer">Cancel</button>
                    <button aria-label="Save" onclick={saveSettlementParams} class="flex-[2] py-3 text-black font-black uppercase tracking-widest text-[10px] rounded-xl transition-colors cursor-pointer {editSettlementParams.autoPayout ? (editSettlementParams.mode === 'stream' ? 'bg-emerald-500 hover:bg-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]' : editSettlementParams.mode === 'appointment' ? 'bg-blue-500 hover:bg-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.3)]' : 'bg-amber-500 hover:bg-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]') : 'bg-teal-500 hover:bg-teal-400 shadow-[0_0_15px_rgba(20,184,166,0.2)]'}">Update Protocol</button>
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
                                <button aria-label="Select {cls}" onclick={() => { selectedAssetClass = cls; assetPickerStep = 'asset'; assetSearchQuery = ''; }} class="bg-[#0c0c0c] hover:bg-[#1a1a1a] border border-neutral-800 hover:border-teal-500/50 rounded-xl p-4 flex flex-col items-center justify-center gap-3 transition-colors cursor-pointer group shadow-sm h-28">
                                    <div class="w-10 h-10 rounded-full bg-[#111] border border-neutral-800 flex items-center justify-center group-hover:border-teal-500/50 transition-colors">
                                        {#if cls === 'Crypto'} <span class="text-teal-400 font-black text-lg">₿</span>
                                        {:else if cls === 'Real Estate'} <span class="text-blue-400 font-black text-lg">🏢</span>
                                        {:else if cls === 'Commodities'} <span class="text-yellow-400 font-black text-lg">⚒</span>
                                        {:else if cls === 'Equities'} <span class="text-rose-400 font-black text-lg">📈</span>
                                        {:else} <span class="text-amber-500 font-black text-lg">⚡</span> {/if}
                                    </div>
                                    <span class="text-[10px] font-bold text-neutral-400 group-hover:text-white uppercase tracking-widest text-center">{cls}</span>
                                </button>
                            {/each}
                        </div>
                    </div>
                {:else}
                    <div class="p-4 border-b border-neutral-800/80 flex items-center justify-between bg-[#0a0a0a]">
                        <button aria-label="Back to Classes" onclick={() => { assetPickerStep = 'class'; selectedAssetClass = null; }} class="w-8 h-8 rounded-full hover:bg-[#222] flex items-center justify-center text-neutral-400 transition-colors cursor-pointer">←</button>
                        <h3 class="text-teal-400 font-bold tracking-wide text-sm text-center uppercase drop-shadow-[0_0_8px_rgba(20,184,166,0.3)]">{selectedAssetClass} Index</h3>
                        <div class="w-8"></div>
                    </div>
                    
                    <div class="p-4 border-b border-neutral-800/80 bg-[#0c0c0c]">
                        <div class="relative">
                            <label for="assetSearch" class="sr-only">Search</label>
                            <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
                            <input id="assetSearch" type="text" bind:value={assetSearchQuery} placeholder="Search ticker or address..." class="w-full bg-[#1a1a1a] border border-neutral-800 focus:border-teal-500/50 rounded-xl pl-9 pr-4 py-3 text-[11px] font-mono text-white outline-none transition-colors" />
                        </div>
                    </div>

                    <div class="flex-1 overflow-y-auto p-2 bg-[#111]">
                        <div class="flex flex-col gap-1">
                            {#each filteredAssets as asset}
                                <button aria-label="Select Asset" onclick={() => { editSettlementParams.targetAsset = asset; isAssetPickerOpen = false; assetPickerStep = 'class'; selectedAssetClass = null; }} class="w-full flex items-center justify-between p-3 rounded-xl hover:bg-[#1a1a1a] transition-colors cursor-pointer group border border-transparent hover:border-neutral-800">
                                    <div class="flex items-center gap-3 pointer-events-none">
                                        <div class="w-8 h-8 rounded-full bg-[#0c0c0c] border border-neutral-800 flex items-center justify-center text-[10px] font-black {asset.color} group-hover:border-teal-500/30 transition-colors">{asset.ticker.substring(0,1)}</div>
                                        <div class="flex flex-col items-start">
                                            <span class="text-xs font-bold text-white tracking-widest">{asset.ticker}</span>
                                            <span class="text-[10px] text-neutral-500">{asset.name}</span>
                                        </div>
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

{#if copyModalWorker}
    <div class="fixed inset-0 z-[100] flex items-center justify-center p-4">
        <button aria-label="Close Modal" class="absolute inset-0 w-full h-full bg-black/80 backdrop-blur-sm cursor-default border-none" onclick={() => copyModalWorker = null}></button>
        <div class="relative z-10 w-full max-w-sm bg-[#111] border border-neutral-800 rounded-[24px] shadow-2xl flex flex-col p-5 animate-[fade-in-up_0.2s_ease-out]">
            <h3 class="text-white font-bold tracking-wide text-md mb-4 text-center">Hardware Config</h3>
            <div class="flex flex-col gap-3">
                <div class="bg-[#0c0c0c] border border-neutral-800 rounded-lg p-3">
                    <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold block mb-1.5">Stratum URL</span>
                    <div class="flex justify-between items-center gap-2">
                        <code class="text-teal-400 font-mono text-[10px] truncate select-all">{copyModalWorker?.stratumUrl || ''}</code>
                        <button aria-label="Copy Stratum" onclick={() => copyText(copyModalWorker?.stratumUrl || '')} class="px-3 py-1.5 bg-[#222] hover:bg-[#2a2a2a] text-white text-[10px] font-bold uppercase rounded cursor-pointer transition-colors">Copy</button>
                    </div>
                </div>
                <div class="bg-[#0c0c0c] border border-neutral-800 rounded-lg p-3">
                    <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold block mb-1.5">Wallet.Worker Name</span>
                    <div class="flex justify-between items-center gap-2">
                        <code class="text-teal-400 font-mono text-[10px] truncate select-all">{copyModalWorker?.walletWorker || ''}</code>
                        <button aria-label="Copy Wallet Worker" onclick={() => copyText(copyModalWorker?.walletWorker || '')} class="px-3 py-1.5 bg-[#222] hover:bg-[#2a2a2a] text-white text-[10px] font-bold uppercase rounded cursor-pointer transition-colors">Copy</button>
                    </div>
                </div>
            </div>
            <button aria-label="Close" onclick={() => copyModalWorker = null} class="mt-4 w-full py-2.5 bg-[#1a1a1a] hover:bg-[#222] border border-neutral-800 text-white font-bold uppercase tracking-widest text-[9px] rounded-lg transition-colors cursor-pointer">Close</button>
        </div>
    </div>
{/if}

<style>
    @keyframes slide { 0% { background-position: 0 0; } 100% { background-position: 10px 10px; } }
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(5px); } 100% { opacity: 1; transform: translateY(0); } }
    input[type="time"]::-webkit-calendar-picker-indicator, input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(1); cursor: pointer; opacity: 0.5; }
    input[type="time"]::-webkit-calendar-picker-indicator:hover, input[type="date"]::-webkit-calendar-picker-indicator:hover { opacity: 1; }
</style>