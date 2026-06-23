<script lang="ts">
    import { hasEntered } from '$lib/stores/app';
</script>

<div class="h-screen w-screen bg-[#020202] flex flex-col items-center justify-center relative overflow-hidden cursor-default selection:bg-transparent z-[100]">
    <div class="flex flex-col items-center justify-center z-10 w-full px-4 wrapper-anim">
        
        <h1 class="text-3xl md:text-4xl lg:text-5xl font-black uppercase tracking-[0.25em] text-white/90 drop-shadow-2xl text-center mb-2 title-anim">
            Welcome to Perennia
        </h1>
        
        <p class="text-sm md:text-base lg:text-lg font-mono text-neutral-400 uppercase tracking-[0.4em] text-center mb-6 slogan-anim">
            Tokenize Anything. Liquidate Everything.
        </p>

        <div class="button-anim pointer-events-auto">
            <button onclick={() => $hasEntered = true} class="px-12 py-3 bg-transparent border border-white/10 hover:border-white/50 text-white/50 hover:text-white hover:bg-white/5 uppercase tracking-[0.3em] text-[11px] font-bold transition-all duration-700 cursor-pointer rounded z-10 hover:shadow-[0_0_20px_rgba(255,255,255,0.1)]">
                Enter
            </button>
        </div>

    </div>
</div>

<style>
    .wrapper-anim { animation: creep-forward 15s linear forwards; }
    .title-anim { opacity: 0; animation: fade-grow 2s ease-out 0.5s forwards; }
    .slogan-anim { opacity: 0; animation: fade-grow 2s ease-out 2.5s forwards; }
    .button-anim { opacity: 0; animation: fade-grow 2s ease-out 4.5s forwards; }

    @keyframes creep-forward {
        0% { transform: scale(1); }
        100% { transform: scale(1.15); }
    }
    @keyframes fade-grow {
        0% { opacity: 0; transform: scale(0.90); }
        100% { opacity: 1; transform: scale(1); }
    }
</style>