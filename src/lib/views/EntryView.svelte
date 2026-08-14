<script lang="ts">
    import { activeInviteCode } from '$lib/stores/app';
    import { showWalletModal } from '$lib/stores/wallet';

    let { enterNexus } = $props<{ enterNexus: () => void }>();

    let inviteInput = $state('');
    let isVerifying = $state(false);
    let verifyError = $state('');

    async function validateAndEnter() {
        if (!inviteInput.trim()) {
            enterNexus();
            return;
        }
        
        isVerifying = true;
        verifyError = '';

        try {
            const res = await fetch('/api/auth/invite/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: inviteInput.trim() })
            });

            if (res.ok) {
                $activeInviteCode = inviteInput.trim();
                enterNexus();
                $showWalletModal = true;
            } else {
                const data = await res.json().catch(() => ({}));
                verifyError = data.error || 'INVALID PROTOCOL CODE';
            }
        } catch (e) {
            verifyError = 'NETWORK ROUTING FAILED';
        } finally {
            isVerifying = false;
        }
    }

    function directEnter() {
        $activeInviteCode = '';
        enterNexus();
        $showWalletModal = true;
    }
</script>

<div class="w-full min-h-[100dvh] bg-[#000000] flex flex-col items-center justify-center relative overflow-hidden animate-[fade-in_1.5s_ease-out]">
    
    <!-- Title with Step 1 Subliminal Creep -->
    <h1 class="subliminal-text text-4xl md:text-6xl lg:text-7xl font-black tracking-[0.25em] text-white uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.1)] mb-4 text-center">
        Welcome to Perennia
    </h1>
    
    <!-- Subtitle -->
    <p class="text-teal-500/80 tracking-[0.4em] uppercase text-[10px] md:text-xs mb-12 text-center drop-shadow-[0_0_10px_rgba(20,184,166,0.5)]">
        Tokenize Anything. Liquidate Everything.
    </p>

    <!-- Entry Control Module -->
    <div class="flex flex-col items-center gap-4 z-10 max-w-sm w-full px-6">
        <input 
            type="text" 
            bind:value={inviteInput} 
            placeholder="[ ACCESS CODE (OPTIONAL) ]" 
            disabled={isVerifying}
            onkeydown={(e) => e.key === 'Enter' && validateAndEnter()}
            class="w-full bg-[#111] border border-neutral-800 focus:border-teal-500 rounded-xl px-6 py-3.5 text-xs font-mono text-teal-400 outline-none transition-colors shadow-inner text-center uppercase tracking-widest disabled:opacity-50 placeholder:text-neutral-600"
        />

        {#if verifyError}
            <span class="text-[10px] text-red-500 font-bold uppercase tracking-widest bg-red-950/20 px-3 py-1 rounded-md border border-red-900/50 animate-[fade-in_0.2s_ease-out]">{verifyError}</span>
        {/if}

        <button 
            type="button"
            onclick={validateAndEnter} 
            disabled={isVerifying}
            class="w-full relative px-12 py-4 bg-[#0a0a0a] border border-neutral-800 rounded-xl overflow-hidden transition-all duration-500 hover:border-teal-500 hover:shadow-[0_0_30px_rgba(20,184,166,0.2)] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
        >
            <div class="absolute inset-0 bg-teal-500/10 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-500 ease-out pointer-events-none"></div>
            <span class="relative z-10 text-neutral-500 group-hover:text-teal-400 font-bold tracking-[0.3em] uppercase text-xs transition-colors duration-500 pointer-events-none flex items-center justify-center gap-2">
                {#if isVerifying}
                    <div class="w-3.5 h-3.5 border-2 border-teal-500/20 border-t-teal-500 rounded-full animate-spin"></div> VERIFYING...
                {:else}
                    Enter Nexus
                {/if}
            </span>
        </button>

        <button onclick={directEnter} class="mt-4 text-[9px] text-neutral-600 hover:text-neutral-400 uppercase tracking-widest font-bold transition-colors border-b border-transparent hover:border-neutral-600 pb-0.5 cursor-pointer">
            Returning User Bypass
        </button>
    </div>

    <!-- Guest Mode Helper Text -->
    <div class="absolute bottom-10 opacity-50 flex flex-col items-center gap-2 pointer-events-none">
        <p class="text-neutral-600 text-[9px] uppercase tracking-widest font-mono">
            Sovereign Matrix Subsystem
        </p>
        <div class="w-px h-8 bg-gradient-to-b from-neutral-700 to-transparent"></div>
    </div>
</div>

<style>
    @keyframes fade-in { 
        0% { opacity: 0; transform: scale(0.98); } 
        100% { opacity: 1; transform: scale(1); } 
    }

    .subliminal-text {
        animation: subliminal-creep 60s linear forwards;
        will-change: transform; 
    }

    @keyframes subliminal-creep {
        0% {
            transform: scale(1);
        }
        100% {
            transform: scale(1.15);
        }
    }
</style>