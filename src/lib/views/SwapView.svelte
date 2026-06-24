<script lang="ts">
    import { walletInventory, globalKasPrice } from '$lib/stores/app';
    import { isWalletConnected } from '$lib/stores/wallet';

    let mode = $state<'swap' | 'pool'>('swap');
    let payAmount = $state<number | ''>('');
    let receiveAmount = $derived(typeof payAmount === 'number' ? (payAmount * 10).toFixed(2) : '');

    // Strictly reads true balance from Node Telemetry Store
    let kasBalance = $derived($walletInventory.find(i => i.asset.ticker === 'KAS')?.balance || 0);
    let perBalance = $derived($walletInventory.find(i => i.asset.ticker === 'PER')?.balance || 0);
</script>

<div class="flex items-center justify-center h-full w-full p-4 animate-[fade-in-up_0.3s_ease-out]">
    <div class="w-full max-w-[420px] bg-[#0c0c0c] border border-neutral-800 rounded-[28px] p-4 shadow-2xl relative">
        
        <div class="flex bg-[#111] rounded-xl p-1 mb-4 border border-neutral-800/80 shadow-inner">
            <button aria-label="Swap Mode" onclick={() => mode = 'swap'} class="flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all {mode === 'swap' ? 'bg-[#1a1a1a] text-white shadow-md border border-neutral-700' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Swap</button>
            <button aria-label="Pool Mode" onclick={() => mode = 'pool'} class="flex-1 py-2 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all {mode === 'pool' ? 'bg-[#1a1a1a] text-white shadow-md border border-neutral-700' : 'text-neutral-500 hover:text-white cursor-pointer border border-transparent'}">Pool</button>
        </div>

        <div class="bg-[#111] border border-neutral-800 rounded-2xl p-4 mb-2 hover:border-neutral-700 transition-colors">
            <div class="flex justify-between items-center mb-3">
                <span class="text-[9px] uppercase tracking-widest font-bold text-neutral-500">You Pay</span>
                <span class="text-[9px] font-mono text-neutral-500">BALANCE: <span class="text-white ml-1">{kasBalance.toLocaleString(undefined, {maximumFractionDigits: 2})}</span></span>
            </div>
            <div class="flex items-center justify-between gap-4">
                <input type="number" bind:value={payAmount} placeholder="0" class="w-full bg-transparent text-3xl font-mono text-white outline-none placeholder-neutral-700" />
                <div class="flex items-center gap-2 bg-[#1a1a1a] border border-neutral-800 rounded-xl py-1.5 px-3 shrink-0 shadow-inner">
                    <div class="w-5 h-5 rounded-full bg-teal-500/20 border border-teal-500 flex items-center justify-center text-teal-400 font-black text-[10px]">K</div>
                    <span class="text-xs font-bold text-white tracking-widest">KAS</span>
                </div>
            </div>
        </div>

        <div class="absolute left-1/2 -translate-x-1/2 top-[170px] z-10 w-10 h-10 bg-[#0c0c0c] border border-neutral-800 rounded-xl flex items-center justify-center shadow-lg hover:border-neutral-600 transition-colors cursor-pointer group">
            <svg class="w-4 h-4 text-neutral-500 group-hover:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"/></svg>
        </div>

        <div class="bg-[#111] border border-neutral-800 rounded-2xl p-4 mb-4 hover:border-neutral-700 transition-colors">
            <div class="flex justify-between items-center mb-3">
                <span class="text-[9px] uppercase tracking-widest font-bold text-neutral-500">You Receive</span>
                <span class="text-[9px] font-mono text-neutral-500">BALANCE: <span class="text-white ml-1">{perBalance.toLocaleString(undefined, {maximumFractionDigits: 2})}</span></span>
            </div>
            <div class="flex items-center justify-between gap-4">
                <input type="text" readonly value={receiveAmount} placeholder="0" class="w-full bg-transparent text-3xl font-mono text-neutral-400 outline-none placeholder-neutral-700 cursor-not-allowed" />
                <div class="flex items-center gap-2 bg-[#1a1a1a] border border-neutral-800 rounded-xl py-1.5 px-3 shrink-0 shadow-inner">
                    <div class="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500 flex items-center justify-center text-amber-500 font-black text-[10px]">P</div>
                    <span class="text-xs font-bold text-white tracking-widest">PER</span>
                </div>
            </div>
        </div>

        <div class="flex items-center justify-between px-2 mb-4">
            <span class="text-[9px] font-mono text-neutral-500">1 KAS ≈ 10.00 PER</span>
            <span class="text-[9px] font-bold text-teal-500 uppercase tracking-widest">Network Free</span>
        </div>

        <button disabled={!$isWalletConnected || typeof payAmount !== 'number'} class="w-full py-4 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-[#111] disabled:text-neutral-600 disabled:border-neutral-800 bg-[#1a1a1a] hover:bg-[#222] border border-neutral-700 hover:border-teal-500 text-white shadow-lg">
            {!$isWalletConnected ? 'Connect Wallet' : typeof payAmount !== 'number' ? 'Enter Amount' : 'Execute Swap'}
        </button>
    </div>
</div>

<style>
    @keyframes fade-in-up { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: translateY(0); } }
    input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
</style>