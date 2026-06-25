<script lang="ts">
    import { isWalletConnected } from '$lib/stores/wallet';
</script>

<div class="w-full h-full p-6 overflow-y-auto flex items-center justify-center -translate-y-[5vh]">
    <div class="w-full max-w-6xl flex flex-col items-center justify-center animate-[fade-in-up_0.5s_ease-out]">
        
        <div class="text-center mb-12">
            <h1 class="text-4xl md:text-5xl font-black uppercase tracking-[0.2em] text-white drop-shadow-2xl mb-4">The Forge</h1>
            <p class="text-sm font-mono text-neutral-400 uppercase tracking-widest max-w-2xl mx-auto leading-relaxed">
                Legally digitize, fractionalize, and tokenize physical assets into 1:1 on-chain smart contracts.
            </p>
        </div>

        <div class="w-full grid grid-cols-1 md:grid-cols-3 gap-8">
            <div class="bg-[#0c0c0c] border border-neutral-800 rounded-[32px] p-8 flex flex-col items-center justify-center text-center shadow-inner hover:border-teal-500/30 transition-colors group">
                <div class="w-24 h-24 rounded-full bg-[#111] border border-neutral-800 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(20,184,166,0.1)]">
                    <span class="text-4xl">🏢</span>
                </div>
                <h3 class="text-white font-black tracking-widest uppercase mb-3 text-lg">Real Estate</h3>
                <p class="text-xs font-mono text-neutral-500 mb-8 leading-relaxed">Tokenize property deeds, commercial structures, and land rights.</p>
                <button class="px-8 py-3 bg-[#1a1a1a] text-neutral-400 font-bold text-[11px] uppercase tracking-widest rounded-xl border border-neutral-800 cursor-not-allowed w-full">Awaiting Protocol</button>
            </div>

            <div class="bg-[#111] border border-teal-500/30 rounded-[32px] p-8 flex flex-col items-center justify-center text-center shadow-[0_0_40px_rgba(20,184,166,0.05)] relative overflow-hidden group">
                <div class="absolute inset-0 bg-gradient-to-b from-teal-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <div class="absolute top-6 right-6 flex items-center gap-2 px-3 py-1.5 bg-teal-500/10 border border-teal-500/30 rounded text-[9px] font-black uppercase tracking-widest text-teal-400">
                    <div class="w-2 h-2 bg-teal-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(20,184,166,0.8)]"></div> Live
                </div>
                <div class="w-24 h-24 rounded-full bg-black border border-teal-500/30 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform z-10 shadow-[0_0_30px_rgba(20,184,166,0.2)]">
                    <span class="text-4xl text-teal-400 font-black">P</span>
                </div>
                <h3 class="text-white font-black tracking-widest uppercase mb-3 text-lg z-10">Perennia Generator</h3>
                <p class="text-xs font-mono text-neutral-400 mb-8 leading-relaxed z-10">Mint PER tokens backed by true physical kHeavyHash power and renewable energy grids.</p>
                {#if $isWalletConnected}
                    <button class="px-8 py-3 bg-teal-500 hover:bg-teal-400 text-black font-black text-[11px] uppercase tracking-widest rounded-xl shadow-[0_0_15px_rgba(20,184,166,0.3)] transition-colors cursor-pointer z-10 w-full">Mint PER Asset</button>
                {:else}
                    <button class="px-8 py-3 bg-[#1a1a1a] text-neutral-500 font-black text-[11px] uppercase tracking-widest rounded-xl border border-neutral-800 cursor-not-allowed z-10 w-full">Wallet Required</button>
                {/if}
            </div>

            <div class="bg-[#0c0c0c] border border-neutral-800 rounded-[32px] p-8 flex flex-col items-center justify-center text-center shadow-inner hover:border-amber-500/30 transition-colors group">
                <div class="w-24 h-24 rounded-full bg-[#111] border border-neutral-800 flex items-center justify-center mb-8 group-hover:scale-110 transition-transform shadow-[0_0_20px_rgba(245,158,11,0.1)]">
                    <span class="text-4xl">⚒</span>
                </div>
                <h3 class="text-white font-black tracking-widest uppercase mb-3 text-lg">Commodities</h3>
                <p class="text-xs font-mono text-neutral-500 mb-8 leading-relaxed">Fractionalize precious metals, oil, and agricultural resources.</p>
                <button class="px-8 py-3 bg-[#1a1a1a] text-neutral-400 font-bold text-[11px] uppercase tracking-widest rounded-xl border border-neutral-800 cursor-not-allowed w-full">Awaiting Protocol</button>
            </div>
        </div>
    </div>
</div>

<style>
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(0vh); } 100% { opacity: 1; transform: translateY(-5vh); } }
</style>