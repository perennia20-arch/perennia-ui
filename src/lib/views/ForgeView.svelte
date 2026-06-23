<script lang="ts">
    import { isWalletConnected } from '$lib/stores/wallet';

    let step = $state(1);

    // Step 1 State
    let selectedCategory = $state('');
    let assetIdentifier = $state('');
    const categories = ['Real Estate', 'Commodities & Metals', 'Corporate Equity', 'Intellectual Property'];

    // Step 2 State
    let fileUploaded = $state(false);

    // Step 3 State
    let valuation = $state<number | undefined>(undefined);
    let units = $state<number | undefined>(undefined);
    let ticker = $state('');

    let genesisPrice = $derived(
        valuation && units && units > 0 ? (valuation / units).toFixed(4) : '0.0000'
    );

    function nextStep() { if (step < 4) step++; }
    function prevStep() { if (step > 1) step--; }
    
    function resetForge() {
        step = 1; selectedCategory = ''; assetIdentifier = ''; 
        fileUploaded = false; valuation = undefined; units = undefined; ticker = '';
    }
</script>

<div class="w-full h-full flex flex-col items-center justify-start pt-12 pb-24 px-4 overflow-y-auto">
    
    <div class="text-center mb-10 animate-[fade-in-up_0.5s_ease-out]">
        <h1 class="text-4xl md:text-5xl font-black text-white tracking-widest mb-3 uppercase flex items-center justify-center gap-3">
            THE <span class="text-purple-400 drop-shadow-[0_0_15px_rgba(168,85,247,0.6)]">FORGE</span>
        </h1>
        <h2 class="text-slate-400 text-sm md:text-base tracking-widest font-medium">Asset Synthesis & Fractionalization</h2>
        <p class="text-purple-400/80 italic font-serif tracking-widest text-xs mt-2 drop-shadow-md">tokenize anything, liquidate everything.</p>
    </div>

    {#if !$isWalletConnected}
        <div class="w-full max-w-2xl border border-dashed border-slate-700 rounded-3xl p-12 bg-slate-900/50 flex flex-col items-center justify-center text-center shadow-lg backdrop-blur-sm">
            <svg class="w-12 h-12 text-slate-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>
            <p class="text-sm uppercase tracking-widest text-slate-500 font-bold">Connect Wallet to Access<br>The Asset Registry</p>
        </div>
    {:else}
        <div class="w-full max-w-2xl bg-slate-900 border border-slate-800/80 rounded-[28px] p-8 md:p-12 shadow-[0_0_40px_rgba(0,0,0,0.4)] relative z-10 animate-[fade-in-up_0.7s_ease-out]">
            
            <div class="relative mb-12 px-4">
                <div class="absolute left-8 right-8 top-1/2 -translate-y-1/2 h-[2px] bg-slate-800 -z-10"></div>
                <div class="flex items-center justify-between z-10">
                    {#each [1, 2, 3, 4] as s}
                        <div class="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all duration-500
                            {step > s ? 'bg-emerald-400 text-slate-900 shadow-[0_0_15px_rgba(52,211,153,0.5)] border-none' : 
                             step === s ? 'bg-purple-400 text-slate-900 shadow-[0_0_20px_rgba(192,132,252,0.6)] scale-110 border-none' : 
                             'bg-slate-900 text-slate-500 border-2 border-slate-700'}">
                            {#if step > s}
                                <svg class="w-5 h-5 font-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                            {:else}
                                {s}
                            {/if}
                        </div>
                    {/each}
                </div>
            </div>

            {#if step === 1}
                <div class="animate-[fade-in_0.3s_ease-out]">
                    <h3 class="text-xl font-bold text-white uppercase tracking-widest mb-6">1. Asset Classification</h3>
                    
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                        {#each categories as cat}
                            <button onclick={() => selectedCategory = cat} class="py-5 px-6 rounded-xl border-2 text-xs font-bold transition-all cursor-pointer
                                {selectedCategory === cat ? 'bg-purple-900/30 border-purple-500/80 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-600 hover:text-white'}">
                                {cat}
                            </button>
                        {/each}
                    </div>

                    <div class="flex flex-col gap-3 mb-8">
                        <label for="assetId" class="text-slate-500 text-sm font-medium px-1">Asset Identifier / Address</label>
                        <input id="assetId" type="text" bind:value={assetIdentifier} placeholder="e.g., 123 Aspen Property" spellcheck="false" 
                               class="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/60 rounded-xl px-5 py-4 text-white font-mono text-sm outline-none transition-colors placeholder-slate-700 shadow-inner" />
                    </div>

                    <button onclick={nextStep} disabled={!selectedCategory || !assetIdentifier} class="w-full py-5 bg-[#7e57c2] hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer shadow-[0_0_20px_rgba(126,34,206,0.4)] disabled:shadow-none text-sm">
                        CONFIRM CLASSIFICATION &rarr;
                    </button>
                </div>
            {/if}

            {#if step === 2}
                <div class="animate-[fade-in_0.3s_ease-out]">
                    <h3 class="text-xl font-bold text-white uppercase tracking-widest mb-4">2. Registry Verification</h3>
                    
                    <p class="text-slate-400 text-sm leading-relaxed mb-8">
                        Upload legal documentation, titles, or physical vault receipts. All assets must be verified and 1:1 backed in the Sanctuary Registry before token generation.
                    </p>

                    <button aria-label="Upload document" onclick={() => fileUploaded = !fileUploaded} class="w-full h-48 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center transition-all duration-300 mb-8 cursor-pointer group
                        {fileUploaded ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-slate-700 bg-slate-950 hover:border-purple-500/50 hover:bg-slate-900'}">
                        {#if fileUploaded}
                            <svg class="w-10 h-10 text-slate-100 bg-emerald-500 p-2 rounded-sm mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        {:else}
                            <svg class="w-10 h-10 text-slate-100 bg-blue-300 p-2 rounded-sm opacity-80 mb-4 group-hover:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2.5L18.5 9H13V4.5zM6 20V4h6v6h6v10H6z"/></svg>
                            <span class="text-sm text-slate-400 group-hover:text-white transition-colors tracking-wide">Click or drag to drop legal verification</span>
                        {/if}
                    </button>

                    <div class="flex gap-4">
                        <button onclick={prevStep} class="px-8 py-5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-bold uppercase tracking-widest text-sm rounded-xl transition-colors cursor-pointer">
                            &larr; BACK
                        </button>
                        <button onclick={nextStep} disabled={!fileUploaded} class="flex-1 py-5 bg-[#7e57c2] hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black uppercase tracking-widest text-sm rounded-xl transition-all cursor-pointer shadow-[0_0_20px_rgba(126,34,206,0.4)] disabled:shadow-none">
                            VERIFY & CONTINUE &rarr;
                        </button>
                    </div>
                </div>
            {/if}

            {#if step === 3}
                <div class="animate-[fade-in_0.3s_ease-out]">
                    <h3 class="text-xl font-bold text-white uppercase tracking-widest mb-6">3. Fractional Synthesis</h3>
                    
                    <div class="flex flex-col gap-3 mb-6">
                        <label for="valUSD" class="text-slate-400 text-sm font-medium px-1">Total Audited Valuation (USD)</label>
                        <div class="relative flex items-center">
                            <span class="absolute left-5 text-slate-500 font-mono text-xl font-bold">$</span>
                            <input id="valUSD" type="number" bind:value={valuation} placeholder="0.00" class="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl pl-10 pr-5 py-4 text-white font-mono text-lg outline-none transition-colors appearance-none shadow-inner" />
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4 mb-8">
                        <div class="flex flex-col gap-3">
                            <label for="mintUnits" class="text-slate-400 text-sm font-medium px-1">Sovereign Units to Mint</label>
                            <input id="mintUnits" type="number" bind:value={units} placeholder="0" class="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-5 py-4 text-white font-mono text-lg outline-none transition-colors appearance-none shadow-inner" />
                        </div>
                        <div class="flex flex-col gap-3">
                            <label for="mintTicker" class="text-slate-400 text-sm font-medium px-1">Ticker</label>
                            <input id="mintTicker" type="text" bind:value={ticker} placeholder="E.G. ASPN" class="w-full bg-slate-950 border border-slate-800 focus:border-purple-500/50 rounded-xl px-5 py-4 text-white font-mono uppercase text-lg outline-none transition-colors shadow-inner" />
                        </div>
                    </div>

                    <div class="bg-slate-950 border border-slate-800/80 rounded-xl p-5 mb-8 shadow-inner">
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-sm font-medium text-slate-400">Asset Backing</span>
                            <span class="text-sm font-black text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.3)]">1:1 Verified</span>
                        </div>
                        <div class="flex justify-between items-center pt-1">
                            <span class="text-sm font-medium text-slate-400">Initial Genesis Price</span>
                            <span class="text-xl font-mono font-bold text-purple-300 drop-shadow-[0_0_8px_rgba(216,180,254,0.3)]">${genesisPrice} <span class="text-slate-500 text-sm font-sans font-bold ml-1 uppercase">/ {ticker || 'AAA'}</span></span>
                        </div>
                    </div>

                    <div class="flex gap-4">
                        <button onclick={prevStep} class="px-8 py-5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-white font-bold uppercase tracking-widest text-sm rounded-xl transition-colors cursor-pointer">
                            &larr; BACK
                        </button>
                        <button onclick={nextStep} disabled={!valuation || !units || !ticker} class="flex-1 py-5 bg-[#7e57c2] hover:bg-purple-500 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black uppercase tracking-widest text-sm rounded-xl transition-all cursor-pointer shadow-[0_0_20px_rgba(126,34,206,0.4)] disabled:shadow-none">
                            LIQUIDATE TO REGISTRY &rarr;
                        </button>
                    </div>
                </div>
            {/if}

            {#if step === 4}
                <div class="flex flex-col items-center text-center animate-[fade-in_0.4s_ease-out] py-6">
                    
                    <div class="w-24 h-24 rounded-full border-2 border-emerald-500 flex items-center justify-center mb-8 animate-[scale-in_0.4s_ease-out]">
                        <svg class="w-10 h-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7"/></svg>
                    </div>

                    <h3 class="text-3xl font-bold text-white mb-4">Synthesis Complete</h3>
                    <p class="text-slate-400 text-sm mb-10 leading-relaxed max-w-md">
                        <span class="text-white font-bold">{assetIdentifier || 'Asset'}</span> has been successfully tokenized and anchored to the Sanctuary Registry.
                    </p>

                    <div class="w-full bg-slate-950 border border-slate-800 rounded-xl p-6 mb-10 text-left shadow-inner">
                        <div class="flex justify-between items-center border-b border-slate-800/80 pb-4 mb-4">
                            <span class="text-sm text-slate-400">Total Issuance</span>
                            <span class="text-base font-bold text-white font-mono">{units} {ticker.toUpperCase()}</span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-sm text-slate-400">Registry Status</span>
                            <span class="text-sm font-bold text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.4)]">Live on DEX</span>
                        </div>
                    </div>

                    <button onclick={resetForge} class="w-full py-5 bg-[#c084fc] hover:bg-purple-400 text-black font-black uppercase tracking-widest text-sm rounded-xl transition-colors cursor-pointer shadow-[0_0_20px_rgba(192,132,252,0.5)]">
                        FORGE ANOTHER ASSET
                    </button>
                </div>
            {/if}

        </div>
    {/if}
</div>

<style>
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(15px); } 100% { opacity: 1; transform: translateY(0); } }
    @keyframes fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
    @keyframes scale-in { 0% { transform: scale(0.8); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
    
    input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
    input[type=number] { appearance: textfield; -moz-appearance: textfield; }
</style>