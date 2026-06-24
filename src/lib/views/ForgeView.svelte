<script lang="ts">
    import { isWalletConnected } from '$lib/stores/wallet';
    import { type AssetClass } from '$lib/stores/app';

    let step = $state(1);
    let assetClass = $state<AssetClass | null>(null);
    let identifier = $state('');
</script>

<div class="flex flex-col items-center justify-center w-full h-full p-6 animate-[fade-in-up_0.3s_ease-out] overflow-y-auto">
    
    <div class="text-center mb-8">
        <h2 class="text-3xl md:text-5xl font-black uppercase tracking-[0.2em] text-transparent bg-clip-text bg-gradient-to-r from-teal-400 via-teal-200 to-white drop-shadow-[0_0_15px_rgba(20,184,166,0.5)] mb-2">The Forge</h2>
        <p class="text-[11px] text-neutral-400 font-bold uppercase tracking-widest mb-1">Asset Synthesis & Fractionalization</p>
        <p class="text-[9px] text-teal-500 font-mono tracking-widest">tokenize anything. liquidate everything.</p>
    </div>

    <div class="w-full max-w-2xl bg-[#0c0c0c] border border-neutral-800/80 rounded-[32px] p-8 shadow-2xl relative overflow-hidden">
        <div class="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-teal-900/10 via-transparent to-transparent pointer-events-none"></div>
        
        <div class="relative z-10">
            <div class="flex items-center justify-between mb-12 px-4">
                <div class="flex flex-col items-center gap-2"><div class="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border transition-colors {step >= 1 ? 'bg-teal-500 border-teal-400 text-black shadow-[0_0_15px_rgba(20,184,166,0.4)]' : 'bg-[#111] border-neutral-800 text-neutral-600'}">1</div></div>
                <div class="flex-1 h-px bg-neutral-800 mx-4"></div>
                <div class="flex flex-col items-center gap-2"><div class="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border transition-colors {step >= 2 ? 'bg-teal-500 border-teal-400 text-black shadow-[0_0_15px_rgba(20,184,166,0.4)]' : 'bg-[#111] border-neutral-800 text-neutral-600'}">2</div></div>
                <div class="flex-1 h-px bg-neutral-800 mx-4"></div>
                <div class="flex flex-col items-center gap-2"><div class="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border transition-colors {step >= 3 ? 'bg-teal-500 border-teal-400 text-black shadow-[0_0_15px_rgba(20,184,166,0.4)]' : 'bg-[#111] border-neutral-800 text-neutral-600'}">3</div></div>
                <div class="flex-1 h-px bg-neutral-800 mx-4"></div>
                <div class="flex flex-col items-center gap-2"><div class="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black border transition-colors {step >= 4 ? 'bg-teal-500 border-teal-400 text-black shadow-[0_0_15px_rgba(20,184,166,0.4)]' : 'bg-[#111] border-neutral-800 text-neutral-600'}">4</div></div>
            </div>

            <div class="animate-[fade-in-up_0.2s_ease-out]">
                {#if step === 1}
                    <h3 class="text-white font-bold tracking-widest text-sm uppercase mb-6">1. Asset Classification</h3>
                    <div class="grid grid-cols-2 gap-4 mb-6">
                        <button aria-label="Real Estate" onclick={() => assetClass = 'Real Estate'} class="py-4 px-4 bg-[#111] border rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer {assetClass === 'Real Estate' ? 'border-teal-500 text-teal-400 shadow-[0_0_10px_rgba(20,184,166,0.2)]' : 'border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-white'}">Real Estate</button>
                        <button aria-label="Commodities & Metals" onclick={() => assetClass = 'Commodities'} class="py-4 px-4 bg-[#111] border rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer {assetClass === 'Commodities' ? 'border-amber-500 text-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.2)]' : 'border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-white'}">Commodities & Metals</button>
                        <button aria-label="Corporate Equity" onclick={() => assetClass = 'Equities'} class="py-4 px-4 bg-[#111] border rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer {assetClass === 'Equities' ? 'border-rose-500 text-rose-400 shadow-[0_0_10px_rgba(244,63,94,0.2)]' : 'border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-white'}">Corporate Equity</button>
                        <button aria-label="Intellectual Property" onclick={() => assetClass = 'Energy'} class="py-4 px-4 bg-[#111] border rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer {assetClass === 'Energy' ? 'border-blue-500 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'border-neutral-800 text-neutral-500 hover:border-neutral-600 hover:text-white'}">Energy Protocol</button>
                    </div>
                    
                    <div class="flex flex-col gap-2 mb-8">
                        <label for="identifier" class="text-[9px] text-neutral-500 uppercase tracking-widest font-bold ml-1">Asset Identifier / Address</label>
                        <input id="identifier" type="text" bind:value={identifier} placeholder="e.g., 123 Aspen Property" class="w-full bg-[#111] border border-neutral-800 focus:border-teal-500/50 rounded-xl px-4 py-4 text-[11px] font-mono text-white outline-none transition-colors" spellcheck="false" />
                    </div>

                    <button onclick={() => { if(assetClass && identifier) step = 2; }} disabled={!$isWalletConnected || !assetClass || !identifier} class="w-full py-4 mt-4 bg-[#161616] border border-neutral-800 text-neutral-500 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:enabled:bg-teal-500 hover:enabled:border-teal-400 hover:enabled:text-black hover:enabled:shadow-[0_0_20px_rgba(20,184,166,0.3)]">
                        Confirm Classification →
                    </button>
                {:else}
                    <div class="flex flex-col items-center justify-center py-12 animate-[fade-in-up_0.3s_ease-out]">
                        <div class="w-16 h-16 rounded-full border-2 border-teal-500 border-t-transparent animate-spin mb-6"></div>
                        <h2 class="text-sm font-bold uppercase tracking-widest text-teal-400 mb-2">Awaiting Oracle Verification</h2>
                        <p class="text-[10px] font-mono text-neutral-500 uppercase text-center max-w-[80%]">Establishing secure bridge to legal consensus layer. Please stand by...</p>
                        
                        <button onclick={() => step = 1} class="mt-8 text-[9px] uppercase tracking-widest text-neutral-600 hover:text-white underline transition-colors cursor-pointer bg-transparent border-none">
                            Cancel Synthesis
                        </button>
                    </div>
                {/if}
            </div>
        </div>
    </div>
</div>

<style>
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
</style>