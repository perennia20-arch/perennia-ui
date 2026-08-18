<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { settingsStore } from '$lib/stores/settings.svelte';

    $effect(() => {
        settingsStore.save();
    });

    function close() {
        settingsStore.showSettingsModal = false;
    }

    function resetDefaults() {
        settingsStore.uiBrightness = 1.0;
        settingsStore.theme = 'dark';
        settingsStore.bgIntensity = 0;
        settingsStore.fiatDecimals = 2;
        settingsStore.tokenDecimals = 8;
        settingsStore.save();
    }
</script>

{#if settingsStore.showSettingsModal}
    <div class="fixed inset-0 z-[9999] flex items-center justify-center p-4" transition:fade={{duration: 150}}>
        <button aria-label="Close Settings" class="absolute inset-0 w-full h-full bg-[#050505]/98 border-none cursor-default" onclick={close}></button>

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

                <!-- Theme Mode Toggle -->
                <div class="flex flex-col gap-5">
                    <div class="flex items-center justify-between">
                        <div class="flex flex-col">
                            <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">Base Theme Mode</span>
                            <span class="text-[9px] text-neutral-500 mt-0.5 max-w-[250px] leading-relaxed">Toggle between Monochrome Dark and Stark Light.</span>
                        </div>
                        <div class="flex bg-[#111] p-1 rounded-xl border border-neutral-800">
                            <button 
                                onclick={() => { settingsStore.theme = 'dark'; settingsStore.save(); }}
                                class="px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer {settingsStore.theme === 'dark' ? 'bg-[#18C6A5] text-black shadow-md' : 'text-neutral-500 hover:text-white'}"
                            >
                                Dark
                            </button>
                            <button 
                                onclick={() => { settingsStore.theme = 'light'; settingsStore.save(); }}
                                class="px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer {settingsStore.theme === 'light' ? 'bg-[#18C6A5] text-black shadow-md' : 'text-neutral-500 hover:text-white'}"
                            >
                                Light
                            </button>
                        </div>
                    </div>

                    <!-- Background Shading / Intensity Slider -->
                    <div class="flex flex-col gap-2">
                        <div class="flex items-center justify-between">
                            <div class="flex flex-col">
                                <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">Background Shading / Intensity</span>
                                <span class="text-[9px] text-neutral-500">
                                    {settingsStore.theme === 'dark' ? '0% = Deep Space (#000000) • 100% = Soft Charcoal' : '0% = Stark White (#FFFFFF) • 100% = Soft Off-White'}
                                </span>
                            </div>
                            <span class="text-[10px] font-mono text-neutral-400 font-bold">{settingsStore.bgIntensity}%</span>
                        </div>
                        <input type="range" min="0" max="100" bind:value={settingsStore.bgIntensity} class="custom-slider w-full" />
                    </div>
                </div>

                <div class="h-px w-full bg-neutral-800/50"></div>

                <!-- Precision Controls -->
                <div class="flex flex-col gap-5">
                    <div class="flex flex-col gap-2">
                        <div class="flex items-center justify-between">
                            <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">Fiat Precision (Decimals)</span>
                            <span class="text-[10px] font-mono text-neutral-400 font-bold">{settingsStore.fiatDecimals}</span>
                        </div>
                        <input type="range" min="0" max="8" bind:value={settingsStore.fiatDecimals} class="custom-slider w-full" />
                    </div>
                    
                    <div class="flex flex-col gap-2">
                        <div class="flex items-center justify-between">
                            <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">Token Precision (Decimals)</span>
                            <span class="text-[10px] font-mono text-neutral-400 font-bold">{settingsStore.tokenDecimals}</span>
                        </div>
                        <input type="range" min="0" max="18" bind:value={settingsStore.tokenDecimals} class="custom-slider w-full" />
                    </div>
                </div>

                <div class="h-px w-full bg-neutral-800/50"></div>

                <!-- Brightness Override -->
                <div class="flex flex-col gap-4">
                    <div class="flex items-center justify-between">
                        <div class="flex flex-col">
                            <span class="text-[10px] font-bold text-[#18C6A5] uppercase tracking-widest">UI Exposure Override</span>
                        </div>
                        <span class="text-lg font-mono font-black { settingsStore.uiBrightness > 1.0 ? 'text-[#18C6A5]' : 'text-neutral-600' }">
                            {(settingsStore.uiBrightness * 100).toFixed(0)}%
                        </span>
                    </div>

                    <div class="flex items-center gap-4 bg-[#111] p-4 rounded-xl border border-neutral-800 shadow-inner">
                        <span class="text-xs opacity-50">☾</span>
                        <input type="range" min="1.0" max="2.0" step="0.05" bind:value={settingsStore.uiBrightness} class="flex-1 custom-slider" />
                        <span class="text-xs text-amber-500">☼</span>
                    </div>
                </div>

            </div>

            <div class="p-4 bg-[#0a0a0a] border-t border-neutral-800 flex justify-between items-center">
                <button onclick={resetDefaults} class="text-[9px] font-bold text-neutral-500 hover:text-white uppercase tracking-widest transition-colors cursor-pointer border-b border-transparent hover:border-white">
                    Reset Defaults
                </button>
                <button onclick={close} class="px-6 py-2.5 bg-[#111] hover:bg-[#1a1a1a] border border-neutral-700 hover:border-[#18C6A5]/50 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors cursor-pointer shadow-sm">
                    Apply & Close
                </button>
            </div>
        </div>
    </div>
{/if}

<style>
    .custom-slider {
        -webkit-appearance: none; appearance: none; background: #1a1a1a; height: 6px; border-radius: 3px; outline: none; border: 1px solid #222;
    }
    .custom-slider::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none; width: 18px; height: 18px; border-radius: 50%; background: #111; cursor: pointer; border: 2px solid #18C6A5; box-shadow: 0 0 10px rgba(24, 198, 165, 0.4); transition: transform 0.1s, background 0.1s;
    }
    .custom-slider::-webkit-slider-thumb:hover { transform: scale(1.15); background: #18C6A5; }
    .hide-scrollbar::-webkit-scrollbar { display: none; }
    .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
</style>