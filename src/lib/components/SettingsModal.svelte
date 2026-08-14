<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { showSettingsModal, uiBrightness } from '$lib/stores/settings';

    function close() {
        $showSettingsModal = false;
    }
    
    function resetBrightness() {
        $uiBrightness = 1.0;
    }
</script>

{#if $showSettingsModal}
    <div class="fixed inset-0 z-[9999] flex items-center justify-center p-4" transition:fade={{duration: 150}}>
        <!-- Backdrop -->
        <button aria-label="Close Settings" class="absolute inset-0 w-full h-full bg-[#050505]/98 border-none cursor-default" onclick={close}></button>
        
        <!-- Modal Body -->
        <div class="relative z-10 w-full max-w-[500px] bg-[#0c0c0c] border border-neutral-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden" transition:slide={{duration: 200, axis: 'y'}}>
            
            <div class="px-6 py-5 border-b border-neutral-800/80 flex items-center justify-between bg-[#111]">
                <div class="flex items-center gap-3">
                    <div class="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-700 flex items-center justify-center text-neutral-400">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
                    </div>
                    <div class="flex flex-col">
                        <h2 class="text-white font-black uppercase tracking-widest text-sm">System Parameters</h2>
                        <span class="text-[9px] text-neutral-500 uppercase tracking-widest font-mono">Environment Configuration</span>
                    </div>
                </div>
                <button onclick={close} class="text-neutral-500 hover:text-white transition-colors cursor-pointer w-8 h-8 flex items-center justify-center rounded-full hover:bg-[#222]">✕</button>
            </div>

            <div class="p-6 flex flex-col gap-8 max-h-[60vh] overflow-y-auto hide-scrollbar">
                
                <!-- Brightness Override -->
                <div class="flex flex-col gap-4">
                    <div class="flex items-center justify-between">
                        <div class="flex flex-col">
                            <span class="text-[10px] font-bold text-teal-500 uppercase tracking-widest">UI Exposure Override</span>
                            <span class="text-[9px] text-neutral-500 mt-0.5 max-w-[250px] leading-relaxed">Artificially boosts internal rendering brightness when physical monitors are dimmed.</span>
                        </div>
                        <span class="text-lg font-mono font-black { $uiBrightness > 1.0 ? 'text-teal-400' : 'text-neutral-600' }">
                            {($uiBrightness * 100).toFixed(0)}%
                        </span>
                    </div>

                    <div class="flex items-center gap-4 bg-[#111] p-4 rounded-xl border border-neutral-800 shadow-inner">
                        <span class="text-xs opacity-50">☾</span>
                        <input 
                            type="range" 
                            min="1.0" 
                            max="2.0" 
                            step="0.05" 
                            bind:value={$uiBrightness} 
                            class="flex-1 custom-slider"
                        />
                        <span class="text-xs text-amber-500">☼</span>
                    </div>

                    {#if $uiBrightness !== 1.0}
                        <div class="flex justify-end">
                            <button onclick={resetBrightness} class="text-[9px] font-bold text-neutral-500 hover:text-white uppercase tracking-widest transition-colors cursor-pointer border-b border-transparent hover:border-white">
                                Reset to Default (100%)
                            </button>
                        </div>
                    {/if}
                </div>

                <div class="h-px w-full bg-neutral-800/50"></div>

                <!-- Scaffold for future settings -->
                <div class="flex flex-col gap-4 opacity-50 pointer-events-none">
                    <div class="flex flex-col">
                        <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">RPC Node Target</span>
                        <span class="text-[9px] text-neutral-600 mt-0.5">Select the primary Kaspa node for UTXO fetching.</span>
                    </div>
                    <select class="w-full bg-[#111] border border-neutral-800 rounded-xl px-4 py-3 text-[11px] font-mono text-neutral-500 outline-none appearance-none">
                        <option>api.kaspa.org (Default)</option>
                        <option>Local Node (127.0.0.1:16110)</option>
                    </select>
                </div>

                <div class="flex flex-col gap-4 opacity-50 pointer-events-none">
                    <div class="flex flex-col">
                        <span class="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Default Silo Threshold</span>
                        <span class="text-[9px] text-neutral-600 mt-0.5">Initial execution limit for newly created sectors.</span>
                    </div>
                    <input type="text" value="50.00 KAS" disabled class="w-full bg-[#111] border border-neutral-800 rounded-xl px-4 py-3 text-[11px] font-mono text-neutral-500 outline-none" />
                </div>

            </div>
            
            <div class="p-4 bg-[#0a0a0a] border-t border-neutral-800 flex justify-end">
                <button onclick={close} class="px-6 py-2.5 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-700 hover:border-teal-500/50 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors cursor-pointer">
                    Apply & Close
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .custom-slider {
        -webkit-appearance: none;
        appearance: none;
        background: #1a1a1a;
        height: 6px;
        border-radius: 3px;
        outline: none;
        border: 1px solid #222;
    }
    
    .custom-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #111;
        cursor: pointer;
        border: 2px solid #14b8a6;
        box-shadow: 0 0 10px rgba(20, 184, 166, 0.4);
        transition: transform 0.1s, background 0.1s;
    }

    .custom-slider::-webkit-slider-thumb:hover { 
        transform: scale(1.15); 
        background: #14b8a6; 
    }
    
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>