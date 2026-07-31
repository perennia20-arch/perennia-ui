<script lang="ts">
    let { enterNexus } = $props<{ enterNexus: () => void }>();
</script>

<!-- Changed to min-h-[100dvh] and added strict bg-[#050505] for pure blackness -->
<div class="w-full min-h-[100dvh] bg-[#050505] flex flex-col items-center justify-center relative overflow-hidden animate-[fade-in_1.5s_ease-out]">
    
    <!-- Ambient Background Glow Removed: Replaced with Brutalist Outline -->
    <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] border border-teal-500/10 rounded-full pointer-events-none -z-10 opacity-30"></div>
    
    <!-- Title -->
    <h1 class="text-4xl md:text-6xl lg:text-7xl font-black tracking-[0.25em] text-white uppercase drop-shadow-2xl mb-4 text-center">
        Welcome to Perennia
    </h1>
    
    <!-- Subtitle -->
    <p class="text-teal-500/80 tracking-[0.4em] uppercase text-[10px] md:text-xs mb-16 text-center drop-shadow-[0_0_10px_rgba(20,184,166,0.5)]">
        Tokenize Anything. Liquidate Everything.
    </p>
    
    <!-- Cinematic Enter Button -->
    <button 
        type="button"
        onclick={enterNexus} 
        class="group relative px-12 py-4 bg-[#0a0a0a] border border-neutral-800 rounded overflow-hidden transition-all duration-500 hover:border-teal-500 hover:shadow-[0_0_30px_rgba(20,184,166,0.2)] cursor-pointer"
    >
        <div class="absolute inset-0 bg-teal-500/10 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-500 ease-out pointer-events-none"></div>
        <span class="relative z-10 text-neutral-500 group-hover:text-teal-400 font-bold tracking-[0.3em] uppercase text-xs transition-colors duration-500 pointer-events-none">
            Enter Nexus
        </span>
    </button>

    <!-- Guest Mode Helper Text -->
    <div class="absolute bottom-10 opacity-50 flex flex-col items-center gap-2 pointer-events-none">
        <p class="text-neutral-600 text-[9px] uppercase tracking-widest font-mono">
            System running in Guest Mode
        </p>
        <div class="w-px h-8 bg-gradient-to-b from-neutral-700 to-transparent"></div>
    </div>
</div>

<style>
    @keyframes fade-in { 
        0% { opacity: 0; transform: scale(0.98); } 
        100% { opacity: 1; transform: scale(1); } 
    }
</style>