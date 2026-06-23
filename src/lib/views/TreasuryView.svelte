<script lang="ts">
    import { silos } from '$lib/stores/app';
    import { isWalletConnected } from '$lib/stores/wallet';

    let totalAccumulated = $state("12,450.88");
    let totalSettled = $state("145,900.21");

    // Mock ledger to visualize what the Node.js backend will eventually execute
    const ledger = [
        { id: 'tx_a9f8...', time: '2 mins ago', type: 'Stream', amount: '12.50', dest: 'kaspa:qz2sehqz...1', status: 'Confirmed' },
        { id: 'tx_b4c2...', time: '1 hour ago', type: 'Limit', amount: '500.00', dest: 'kaspa:qz8jf...', status: 'Confirmed' },
        { id: 'tx_e7d9...', time: '5 hours ago', type: 'Appointment', amount: '1250.00', dest: 'kaspa:qxp43...', status: 'Confirmed' }
    ];
</script>

<div class="w-full h-full p-4 md:p-8 overflow-y-auto">
    <div class="max-w-[2000px] mx-auto pb-24">
        
        <div class="flex items-end justify-between mb-8 border-b border-neutral-800/80 pb-4">
            <div>
                <h1 class="text-3xl font-black uppercase tracking-widest text-white drop-shadow-md">Treasury Engine</h1>
                <p class="text-[11px] font-mono text-neutral-500 uppercase tracking-widest mt-2">Tri-Modal Liquidity Routing Protocol</p>
            </div>
            
            <div class="flex items-center gap-2 bg-[#111] border border-neutral-800 rounded-xl px-4 py-2">
                <div class="w-2 h-2 rounded-full {$isWalletConnected ? 'bg-teal-500 animate-pulse' : 'bg-neutral-600'}"></div>
                <span class="text-[10px] font-bold uppercase tracking-widest {$isWalletConnected ? 'text-teal-400' : 'text-neutral-500'}">
                    {$isWalletConnected ? 'Engine Online' : 'Engine Offline'}
                </span>
            </div>
        </div>

        {#if !$isWalletConnected}
            <div class="w-full min-h-[400px] flex items-center justify-center border border-dashed border-neutral-800/50 rounded-2xl bg-black/20">
                <p class="text-[11px] uppercase tracking-widest text-neutral-600 font-bold">Connect Wallet to Access Settlement Protocols</p>
            </div>
        {:else}
            <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div class="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-neutral-800 rounded-2xl p-6 shadow-xl">
                    <span class="text-[10px] text-neutral-500 uppercase tracking-widest font-bold block mb-2">Total Pool Treasury</span>
                    <div class="text-4xl font-mono font-light text-white tracking-tighter tabular-nums">{totalAccumulated} <span class="text-sm text-neutral-600">KAS</span></div>
                </div>
                <div class="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-neutral-800 rounded-2xl p-6 shadow-xl">
                    <span class="text-[10px] text-neutral-500 uppercase tracking-widest font-bold block mb-2">Total Lifetime Settled</span>
                    <div class="text-4xl font-mono font-light text-teal-400 drop-shadow-[0_0_12px_rgba(20,184,166,0.2)] tracking-tighter tabular-nums">{totalSettled} <span class="text-sm text-teal-900">KAS</span></div>
                </div>
                <div class="bg-gradient-to-br from-[#111] to-[#0a0a0a] border border-neutral-800 rounded-2xl p-6 shadow-xl">
                    <span class="text-[10px] text-neutral-500 uppercase tracking-widest font-bold block mb-2">Active Routing Protocols</span>
                    <div class="text-4xl font-mono font-light text-amber-500 tracking-tighter tabular-nums">{$silos.length} <span class="text-sm text-amber-900">SILOS</span></div>
                </div>
            </div>

            <div class="grid grid-cols-1 xl:grid-cols-3 gap-8">
                
                <div class="xl:col-span-2 flex flex-col gap-4">
                    <h2 class="text-[11px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Active Sector Routes</h2>
                    
                    {#if $silos.length === 0}
                        <div class="w-full p-8 border border-dashed border-neutral-800/50 rounded-2xl bg-[#0a0a0a] flex items-center justify-center">
                            <span class="text-[10px] font-mono text-neutral-600">No Sectors Deployed in the Forge.</span>
                        </div>
                    {/if}

                    {#each $silos as silo}
                        <div class="bg-[#0c0c0c] border border-neutral-800 rounded-2xl p-5 shadow-lg flex flex-col gap-4 hover:border-neutral-700 transition-colors">
                            <div class="flex items-center justify-between">
                                <div class="flex items-center gap-3">
                                    <div class="w-3 h-3 rounded-full {silo.settlementConfig?.autoPayout ? (silo.settlementConfig?.mode === 'stream' ? 'bg-emerald-400 animate-pulse shadow-[0_0_8px_rgba(52,211,153,0.8)]' : silo.settlementConfig?.mode === 'appointment' ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.8)]') : 'bg-neutral-600'}"></div>
                                    <h3 class="text-white font-bold tracking-widest uppercase text-sm">{silo.name}</h3>
                                </div>
                                <span class="text-[9px] font-mono px-2 py-1 rounded bg-[#1a1a1a] text-neutral-400 border border-neutral-800">
                                    {silo.settlementConfig?.payoutAddress ? silo.settlementConfig.payoutAddress.substring(0, 16) + '...' : 'NO ADDRESS'}
                                </span>
                            </div>

                            {#if !silo.settlementConfig?.autoPayout}
                                <div class="w-full bg-neutral-900/50 border border-neutral-800 rounded-xl p-4 flex items-center justify-center">
                                    <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-500">Route Suspended (Treasury Hold)</span>
                                </div>
                            {:else if silo.settlementConfig?.mode === 'threshold'}
                                <div class="flex flex-col gap-2">
                                    <div class="flex justify-between text-[10px] font-bold uppercase tracking-widest">
                                        <span class="text-amber-500">Limit Progress</span>
                                        <span class="text-neutral-500">Target: {silo.settlementConfig.threshold} KAS</span>
                                    </div>
                                    <div class="w-full h-2 bg-[#111] rounded-full overflow-hidden border border-neutral-800">
                                        <div class="h-full bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.5)] w-[45%]"></div>
                                    </div>
                                </div>
                            {:else if silo.settlementConfig?.mode === 'stream'}
                                <div class="w-full bg-emerald-950/20 border border-emerald-900/30 rounded-xl p-4 flex items-center justify-between">
                                    <span class="text-[10px] font-bold uppercase tracking-widest text-emerald-500 flex items-center gap-2">
                                        <svg class="w-4 h-4 animate-[spin_3s_linear_infinite]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                                        Active Stream
                                    </span>
                                    <span class="text-[10px] font-mono text-emerald-400/80">
                                        {silo.settlementConfig.streamMode === 'realtime' ? 'BLOCK-BY-BLOCK' : `EVERY ${silo.settlementConfig.streamValue} ${silo.settlementConfig.streamUnit.toUpperCase()}`}
                                    </span>
                                </div>
                            {:else if silo.settlementConfig?.mode === 'appointment'}
                                <div class="w-full bg-blue-950/20 border border-blue-900/30 rounded-xl p-4 flex items-center justify-between">
                                    <span class="text-[10px] font-bold uppercase tracking-widest text-blue-500 flex items-center gap-2">
                                        🗓️ Chronos Appointment
                                    </span>
                                    <span class="text-[10px] font-mono text-blue-400/80">
                                        {silo.settlementConfig.appointmentDate} @ {silo.settlementConfig.appointmentTime}
                                    </span>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>

                <div class="xl:col-span-1 flex flex-col gap-4">
                    <h2 class="text-[11px] font-bold uppercase tracking-widest text-neutral-400 mb-2">Execution Ledger</h2>
                    
                    <div class="bg-[#0c0c0c] border border-neutral-800 rounded-2xl flex flex-col overflow-hidden shadow-xl">
                        {#each ledger as tx}
                            <div class="p-4 border-b border-neutral-800/50 flex flex-col gap-2 hover:bg-[#111] transition-colors cursor-pointer">
                                <div class="flex justify-between items-center">
                                    <span class="text-[9px] font-mono text-teal-500">{tx.id}</span>
                                    <span class="text-[9px] uppercase tracking-widest text-neutral-500 font-bold">{tx.time}</span>
                                </div>
                                <div class="flex justify-between items-end">
                                    <div class="flex flex-col">
                                        <span class="text-[10px] uppercase tracking-widest font-bold {tx.type === 'Stream' ? 'text-emerald-500' : tx.type === 'Appointment' ? 'text-blue-500' : 'text-amber-500'}">{tx.type} Route</span>
                                        <span class="text-[9px] font-mono text-neutral-600 mt-1">{tx.dest}</span>
                                    </div>
                                    <span class="text-sm font-mono font-black text-white">{tx.amount} <span class="text-[9px] text-neutral-500 font-normal">KAS</span></span>
                                </div>
                            </div>
                        {/each}
                        <button class="w-full py-4 text-[10px] font-bold uppercase tracking-widest text-neutral-500 hover:text-white hover:bg-[#1a1a1a] transition-colors cursor-pointer">
                            View Full Ledger ->
                        </button>
                    </div>
                </div>

            </div>
        {/if}
    </div>
</div>