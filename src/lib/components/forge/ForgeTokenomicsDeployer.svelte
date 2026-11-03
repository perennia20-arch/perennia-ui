<script lang="ts">
    import { fade, slide } from 'svelte/transition';
    import { browser } from '$app/environment';
    import { identity } from '$lib/stores/identity.svelte';
    import { DEFAULT_ECOSYSTEM_TICKER } from '$lib/stores/treasury.svelte';
    import {
        KASPA_UNSPENDABLE_BURN_ADDRESS,
        validateKaspaBech32mAddress,
        parseCapTableCsv,
        deriveDeterministicKaspaAddress,
        compileSilverScriptProofOfLockVault,
        type CapTableEntry,
        type ForgeTokenStandard,
        type KasplexProtocolInfo
    } from '$lib/stores/transaction.svelte';

    let {
        kasplexInfo,
        isForging = false,
        forgeStatusMessage = '',
        onInspectExistingTicker = (_ticker: string, _token: any) => {},
        onExecuteDeploy = async (_config: any) => {}
    }: {
        kasplexInfo: KasplexProtocolInfo;
        isForging: boolean;
        forgeStatusMessage: string;
        onInspectExistingTicker?: (ticker: string, token: any) => void;
        onExecuteDeploy: (config: any) => Promise<void>;
    } = $props();

    // Token Standard Selector: Standard KRC-20 vs. KCC-20 + SilverScript Covenant
    let tokenStandard = $state<ForgeTokenStandard>('KRC-20');

    // Core KRC-20 / KCC-20 Deploy Parameters (Defaults to SILO for baseline verification)
    let deployTicker = $state(DEFAULT_ECOSYSTEM_TICKER);
    let deployMaxSupply = $state(21_000_000);
    let deployMintLimit = $state(1_000);
    let deployDecimals = $state(8);
    let deployPreAllocation = $state(0);
    let isCheckingTicker = $state(false);
    let tickerAvailability = $state<{
        checkedTicker: string;
        available: boolean;
        existingToken: any | null;
        error?: string;
    } | null>(null);

    // Unlimited Multi-Wallet Genesis Cap Table & Proof-of-Lock SilverScript Covenants
    let capTable = $state<CapTableEntry[]>([]);
    let expandedSilDrawers = $state<Record<string, boolean>>({});
    let showCsvImportDrawer = $state(false);
    let csvRawText = $state('');
    let csvImportFeedback = $state<{ type: 'success' | 'error'; message: string } | null>(null);
    let csvFileInputRef = $state<HTMLInputElement | null>(null);

    let enableMonetaryCharter = $state(true);
    let burnRateBps = $state(50);
    let emissionScheduleType = $state<'CHROMATIC_HALVING' | 'PERIODIC_HALVING' | 'FLAT_TAIL'>(
        'CHROMATIC_HALVING'
    );
    let dailyEmissionRate = $state(5_000);
    let halvingIntervalDays = $state(365);
    let reserveLockedTokens = $state(2_100_000);
    let enableZeroRugLp = $state(true);
    let zeroRugLpPct = $state(85);
    let zeroRugInitialKas = $state(500);
    let zeroRugInitialTokens = $state(1_050_000);
    let enableMineableVault = $state(false);
    let mineableVaultLabel = $state('Perennia Proof-of-Hashrate Mining Vault');
    let mineableFundedTokens = $state(3_150_000);
    let mineableDailyEmission = $state(8_630);
    let mineableMinHashrateThs = $state(0.1);
    let syndicateSectorEnabled = $state(true);
    let charterSha256 = $state('');

    let totalCapTableTokens = $derived(
        capTable.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
    );
    let totalCapTablePct = $derived(
        deployMaxSupply > 0 ? (totalCapTableTokens / deployMaxSupply) * 100 : 0
    );
    let lockedCovenantTokens = $derived(
        capTable
            .filter((r) => r.cliffDays > 0 || r.linearDays > 0)
            .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)
    );
    let allCapRowsValid = $derived(
        capTable.every((r) => r.checksumValid && r.amount > 0)
    );

    function enrichCapRowWithSilverScript(row: CapTableEntry): CapTableEntry {
        const cleanTicker = deployTicker.trim().toUpperCase() || DEFAULT_ECOSYSTEM_TICKER;
        const chk = validateKaspaBech32mAddress(row.address);
        const valid = chk.valid && row.amount > 0;
        const cliff = Math.max(0, Math.floor(Number(row.cliffDays) || 0));
        const linear = Math.max(0, Math.floor(Number(row.linearDays) || 0));

        if (!valid) {
            return {
                ...row,
                cliffDays: cliff,
                linearDays: linear,
                checksumValid: false,
                checksumError: chk.valid ? 'Amount must be > 0' : chk.error,
                tokenStandard
            };
        }

        const compiled = compileSilverScriptProofOfLockVault({
            ticker: cleanTicker,
            tokenStandard,
            label: row.label,
            beneficiaryAddress: chk.normalized,
            totalAllocation: row.amount,
            decimals: deployDecimals,
            cliffDays: cliff,
            linearDays: linear,
            charterSha256Hex: charterSha256 || undefined
        });

        return {
            ...row,
            address: chk.normalized,
            cliffDays: cliff,
            linearDays: linear,
            checksumValid: true,
            checksumError: undefined,
            covenantAddress: compiled.covenantAddress,
            silverscriptSource: compiled.silverscriptSource,
            redeemScriptHex: compiled.redeemScriptHex,
            kcc20StateCommitment: compiled.kcc20State.stateRootHex,
            vprogStateRoot: compiled.kcc20State.stateRootHex,
            tokenStandard
        };
    }

    function setTokenStandard(nextStandard: ForgeTokenStandard) {
        tokenStandard = nextStandard;
        if (capTable.length > 0) {
            capTable = capTable.map((r) => enrichCapRowWithSilverScript(r));
        }
    }

    function toggleSilDrawer(rowId: string) {
        expandedSilDrawers = {
            ...expandedSilDrawers,
            [rowId]: !expandedSilDrawers[rowId]
        };
    }

    // Synchronize deployPreAllocation with Cap Table + Reserve + Mining Vault
    $effect(() => {
        const capSum = totalCapTableTokens;
        const vaultSum = enableMineableVault ? Number(mineableFundedTokens || 0) : 0;
        if (capSum > 0 || vaultSum > 0) {
            deployPreAllocation = Math.min(deployMaxSupply, Math.round(capSum + vaultSum));
        }
    });

    // Compute live SHA-256 Monetary Policy Charter digest
    $effect(() => {
        const canonical = JSON.stringify({
            standard: tokenStandard,
            ticker: deployTicker.trim().toUpperCase() || DEFAULT_ECOSYSTEM_TICKER,
            maxSupply: deployMaxSupply,
            capTable: capTable.map((r) => ({
                address: r.address,
                covenantAddress: r.covenantAddress,
                amount: r.amount,
                label: r.label,
                cliffDays: r.cliffDays,
                linearDays: r.linearDays
            })),
            burnRateBps: enableMonetaryCharter ? burnRateBps : 0,
            burnAddress: KASPA_UNSPENDABLE_BURN_ADDRESS,
            emissionScheduleType,
            dailyEmissionRate: enableMonetaryCharter ? dailyEmissionRate : 0,
            halvingIntervalDays,
            reserveLockedTokens: enableMonetaryCharter ? reserveLockedTokens : 0,
            zeroRugLpPct: enableZeroRugLp ? zeroRugLpPct : 0,
            mineableVaultTokens: enableMineableVault ? mineableFundedTokens : 0
        });
        if (browser && window.crypto?.subtle) {
            window.crypto.subtle
                .digest('SHA-256', new TextEncoder().encode(canonical))
                .then((buf) => {
                    const hex = Array.from(new Uint8Array(buf))
                        .map((b) => b.toString(16).padStart(2, '0'))
                        .join('');
                    charterSha256 = hex;
                })
                .catch(() => {});
        }
    });

    // Interactive 5-Year (60-Month) Supply Curve SVG Coordinates
    let supplyCurveTelemetry = $derived.by(() => {
        const width = 520;
        const height = 160;
        const months = 60;
        const maxSup = Math.max(1, Number(deployMaxSupply || 21_000_000));
        const initialUnlocked = Math.max(
            0,
            totalCapTableTokens - lockedCovenantTokens + (enableZeroRugLp ? zeroRugInitialTokens : 0)
        );
        const dailyVestingSum = capTable.reduce((acc, r) => {
            if (r.cliffDays > 0 || r.linearDays > 0) {
                const lin = Math.max(1, r.linearDays);
                return acc + r.amount / lin;
            }
            return acc;
        }, 0);
        const circulatingPoints: string[] = [];
        const emissionPoints: string[] = [];
        const burnedPoints: string[] = [];
        let cumulativeEmitted = 0;
        let cumulativeBurned = 0;
        let cumulativeVested = 0;
        for (let m = 0; m <= months; m++) {
            const day = m * 30.4375;
            if (m > 0) {
                const daysInStep = 30.4375;
                const vestStep = Math.min(
                    Math.max(0, lockedCovenantTokens - cumulativeVested),
                    dailyVestingSum * daysInStep
                );
                cumulativeVested += vestStep;
                if (enableMonetaryCharter && reserveLockedTokens > cumulativeEmitted) {
                    const decay =
                        emissionScheduleType === 'CHROMATIC_HALVING'
                            ? Math.pow(0.5, day / Math.max(30, halvingIntervalDays))
                            : emissionScheduleType === 'PERIODIC_HALVING'
                              ? Math.pow(0.5, Math.floor(day / Math.max(30, halvingIntervalDays)))
                              : 1.0;
                    const emitStep = Math.min(
                        reserveLockedTokens - cumulativeEmitted,
                        dailyEmissionRate * decay * daysInStep
                    );
                    cumulativeEmitted += emitStep;
                }
                if (enableMineableVault && mineableDailyEmission > 0) {
                    const mineStep = Math.min(
                        Math.max(0, mineableFundedTokens - cumulativeEmitted * 0.25),
                        mineableDailyEmission * daysInStep
                    );
                    cumulativeEmitted += mineStep * 0.5;
                }
                if (enableMonetaryCharter && burnRateBps > 0) {
                    const dailyBurn = maxSup * (burnRateBps / 10_000) * 0.0012;
                    cumulativeBurned = Math.min(
                        maxSup * 0.35,
                        cumulativeBurned + dailyBurn * daysInStep
                    );
                }
            }
            const netCirculating = Math.min(
                maxSup,
                Math.max(0, initialUnlocked + cumulativeVested + cumulativeEmitted - cumulativeBurned)
            );
            const x = (m / months) * width;
            const yCirc = height - Math.min(1, netCirculating / maxSup) * (height - 18) - 8;
            const yEmit =
                height -
                Math.min(1, (initialUnlocked + cumulativeVested + cumulativeEmitted) / maxSup) *
                    (height - 18) -
                8;
            const yBurn = height - Math.min(1, cumulativeBurned / maxSup) * (height - 18) - 8;
            circulatingPoints.push(`${x.toFixed(1)},${yCirc.toFixed(1)}`);
            emissionPoints.push(`${x.toFixed(1)},${yEmit.toFixed(1)}`);
            burnedPoints.push(`${x.toFixed(1)},${yBurn.toFixed(1)}`);
        }
        return {
            circulatingPath: `M ${circulatingPoints.join(' L ')}`,
            emissionPath: `M ${emissionPoints.join(' L ')}`,
            burnedPath: `M ${burnedPoints.join(' L ')}`,
            year5Burned: Math.round(cumulativeBurned),
            year5Emitted: Math.round(cumulativeEmitted)
        };
    });

    function formatTokenBaseUnits(humanAmount: number, decimals: number): string {
        const cleanAmount = Math.max(0, Math.floor(Number(humanAmount) || 0));
        const clampedDec = Math.max(0, Math.min(18, Math.floor(Number(decimals) || 0)));
        const multiplier = 10n ** BigInt(clampedDec);
        return (BigInt(cleanAmount) * multiplier).toString();
    }

    function parseKasplexUnits(rawStr: string | number | undefined, dec = 8): number {
        if (rawStr === undefined || rawStr === null) return 0;
        const n = Number(rawStr);
        if (isNaN(n) || n <= 0) return 0;
        return n / Math.pow(10, dec);
    }

    async function fetchKasplexTokenTelemetry(rawTicker: string) {
        const clean = rawTicker.trim().toUpperCase();
        if (!clean) return null;
        const res = await fetch(
            `https://api.kasplex.org/v1/krc20/token/${encodeURIComponent(clean)}`,
            {
                headers: { accept: 'application/json' },
                signal: AbortSignal.timeout(5000)
            }
        );
        if (!res.ok) {
            throw new Error(`Kasplex API returned HTTP ${res.status}`);
        }
        const data = await res.json();
        const entry = Array.isArray(data?.result) ? data.result[0] : data?.result;
        if (!entry || !entry.tick) return null;
        const rawState = String(entry.state || '').trim().toLowerCase();
        const rawMax = String(entry.max || '0').trim();
        if (
            rawState === 'unused' ||
            rawState === 'not_found' ||
            (rawMax === '0' && !entry.hashRev && !entry.deployHash)
        ) {
            return null;
        }
        return {
            tick: String(entry.tick || clean).toUpperCase(),
            max: String(entry.max || '0'),
            lim: String(entry.lim || '0'),
            pre: String(entry.pre || '0'),
            dec: Number(entry.dec ?? 8),
            minted: String(entry.minted || '0'),
            state: String(entry.state || 'deployed'),
            hashRev: String(entry.hashRev || entry.deployHash || ''),
            holderTotal: Number(entry.holderTotal ?? entry.holders ?? 0),
            transferTotal: Number(entry.transferTotal ?? 0),
            mintTotal: Number(entry.mintTotal ?? 0)
        };
    }

    async function checkDeployTickerAvailability() {
        const clean = deployTicker.trim().toUpperCase().replace(/[^A-Z]/g, '');
        deployTicker = clean;
        if (clean.length < 4 || clean.length > 6) {
            tickerAvailability = {
                checkedTicker: clean,
                available: false,
                existingToken: null,
                error: 'KRC-20 / KCC-20 tickers must be 4 to 6 alphabetic characters (A–Z).'
            };
            return;
        }
        isCheckingTicker = true;
        try {
            const existing = await fetchKasplexTokenTelemetry(clean);
            if (existing) {
                tickerAvailability = {
                    checkedTicker: clean,
                    available: false,
                    existingToken: existing
                };
            } else {
                tickerAvailability = {
                    checkedTicker: clean,
                    available: true,
                    existingToken: null
                };
            }
        } catch (err: any) {
            tickerAvailability = {
                checkedTicker: clean,
                available: false,
                existingToken: null,
                error: err.message || 'Kasplex indexer check failed.'
            };
        } finally {
            isCheckingTicker = false;
        }
    }

    function addCapTableRow(preset?: Partial<CapTableEntry>) {
        const defaultAddr =
            preset?.address ||
            deriveDeterministicKaspaAddress(`tranche_${capTable.length + 1}`);
        const check = validateKaspaBech32mAddress(defaultAddr);
        const amount = preset?.amount ?? Math.round(deployMaxSupply * 0.05);
        const pct = deployMaxSupply > 0 ? Number(((amount / deployMaxSupply) * 100).toFixed(2)) : 5;
        const baseRow: CapTableEntry = {
            id: `cap_${Date.now()}_${capTable.length}`,
            label: preset?.label || `Tranche #${capTable.length + 1}`,
            address: check.normalized || defaultAddr,
            amount,
            pctOfSupply: pct,
            cliffDays: preset?.cliffDays ?? 90,
            linearDays: preset?.linearDays ?? 365,
            checksumValid: check.valid && amount > 0,
            checksumError: check.error,
            tokenStandard
        };
        capTable = [...capTable, enrichCapRowWithSilverScript(baseRow)];
    }

    function loadInstitutionalCapTableTemplate() {
        const foundersAddr = deriveDeterministicKaspaAddress('perennia_founders_vault');
        const treasuryAddr =
            identity.activeAddress && validateKaspaBech32mAddress(identity.activeAddress).valid
                ? identity.activeAddress
                : deriveDeterministicKaspaAddress('perennia_treasury_vault');
        const investorsAddr = deriveDeterministicKaspaAddress('perennia_early_investors');
        const lpReserveAddr = deriveDeterministicKaspaAddress('perennia_lp_reserve');
        const templates = [
            {
                label: 'Founders & Core Architects',
                address: foundersAddr,
                pct: 15,
                cliffDays: 180,
                linearDays: 730
            },
            {
                label: 'Protocol Treasury Reserve',
                address: treasuryAddr,
                pct: 20,
                cliffDays: 90,
                linearDays: 365
            },
            {
                label: 'Early Syndicate Investors',
                address: investorsAddr,
                pct: 10,
                cliffDays: 30,
                linearDays: 180
            },
            {
                label: 'DEX Zero-Rug LP Vault',
                address: lpReserveAddr,
                pct: 25,
                cliffDays: 365,
                linearDays: 365
            }
        ];
        capTable = templates.map((t, idx) => {
            const amt = Math.round(deployMaxSupply * (t.pct / 100));
            const chk = validateKaspaBech32mAddress(t.address);
            return enrichCapRowWithSilverScript({
                id: `cap_tpl_${idx}`,
                label: t.label,
                address: chk.normalized,
                amount: amt,
                pctOfSupply: t.pct,
                cliffDays: t.cliffDays,
                linearDays: t.linearDays,
                checksumValid: chk.valid,
                checksumError: chk.error,
                tokenStandard
            });
        });
    }

    function removeCapTableRow(id: string) {
        capTable = capTable.filter((r) => r.id !== id);
    }

    function updateCapRowAddress(idx: number, rawAddr: string) {
        capTable = capTable.map((row, i) =>
            i === idx
                ? enrichCapRowWithSilverScript({
                      ...row,
                      address: rawAddr.trim().toLowerCase()
                  })
                : row
        );
    }

    function updateCapRowAmount(idx: number, rawAmtStr: string) {
        const amt = Math.max(0, parseFloat(rawAmtStr) || 0);
        const pct =
            deployMaxSupply > 0 ? Number(((amt / deployMaxSupply) * 100).toFixed(4)) : 0;
        capTable = capTable.map((row, i) => {
            if (i !== idx) return row;
            return enrichCapRowWithSilverScript({
                ...row,
                amount: amt,
                pctOfSupply: pct
            });
        });
    }

    function updateCapRowPct(idx: number, rawPctStr: string) {
        const pct = Math.max(0, Math.min(100, parseFloat(rawPctStr) || 0));
        const amt = Math.round(deployMaxSupply * (pct / 100));
        capTable = capTable.map((row, i) => {
            if (i !== idx) return row;
            return enrichCapRowWithSilverScript({
                ...row,
                pctOfSupply: pct,
                amount: amt
            });
        });
    }

    function updateCapRowLockSchedule(idx: number, nextCliff: number, nextLinear: number) {
        capTable = capTable.map((row, i) => {
            if (i !== idx) return row;
            return enrichCapRowWithSilverScript({
                ...row,
                cliffDays: Math.max(0, Math.floor(nextCliff || 0)),
                linearDays: Math.max(0, Math.floor(nextLinear || 0))
            });
        });
    }

    function handleImportCsvText() {
        csvImportFeedback = null;
        if (!csvRawText.trim()) {
            const addr1 = deriveDeterministicKaspaAddress('csv_founders_1');
            const addr2 = deriveDeterministicKaspaAddress('csv_treasury_2');
            csvRawText = `address,amount,label,cliff_days,linear_days\n${addr1},2100000,Founders Vault,180,365\n${addr2},1050000,Ecosystem Grants,90,180`;
        }
        const parsed = parseCapTableCsv(
            csvRawText,
            deployMaxSupply,
            deployTicker.trim().toUpperCase() || DEFAULT_ECOSYSTEM_TICKER,
            tokenStandard
        );
        if (parsed.entries.length > 0) {
            capTable = parsed.entries.map((r) => enrichCapRowWithSilverScript(r));
        }
        if (parsed.invalidCount > 0) {
            csvImportFeedback = {
                type: 'error',
                message: `Imported ${parsed.validCount} valid rows, ${parsed.invalidCount} failed Bech32m checksum: ${parsed.errors[0]}`
            };
        } else {
            csvImportFeedback = {
                type: 'success',
                message: `✓ Verified & imported ${parsed.validCount} Bech32m Cap Table rows (${parsed.totalAllocatedTokens.toLocaleString()} ${deployTicker}) with SilverScript P2SH vaults.`
            };
        }
    }

    async function handleCsvFileUpload(e: Event) {
        const input = e.currentTarget as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        csvRawText = await file.text();
        showCsvImportDrawer = true;
        handleImportCsvText();
        input.value = '';
    }

    async function submitTokenomicsDeploy() {
        const enrichedCapTable = capTable.map((r) => enrichCapRowWithSilverScript(r));
        capTable = enrichedCapTable;
        await onExecuteDeploy({
            tokenStandard,
            ticker: deployTicker.trim().toUpperCase(),
            maxSupply: deployMaxSupply,
            mintLimit: deployMintLimit,
            decimals: deployDecimals,
            preAllocation: deployPreAllocation,
            capTable: enrichedCapTable,
            monetaryPolicy: enableMonetaryCharter
                ? {
                      burnRateBps,
                      burnAddress: KASPA_UNSPENDABLE_BURN_ADDRESS,
                      emissionScheduleType,
                      dailyEmissionRate,
                      halvingIntervalDays,
                      reserveLockedTokens,
                      zeroRugLpPct: enableZeroRugLp ? zeroRugLpPct : 0,
                      zeroRugLockDays: 365,
                      zeroRugInitialKas: enableZeroRugLp ? zeroRugInitialKas : 0,
                      zeroRugInitialTokens: enableZeroRugLp ? zeroRugInitialTokens : 0,
                      charterSha256
                  }
                : null,
            mineableVault: enableMineableVault
                ? {
                      enabled: true,
                      vaultLabel: mineableVaultLabel,
                      totalFundedTokens: mineableFundedTokens,
                      dailyEmissionTokens: mineableDailyEmission,
                      minHashrateThs: mineableMinHashrateThs,
                      syndicateSectorEnabled
                  }
                : null,
            charterSha256
        });
    }
</script>

<input
    bind:this={csvFileInputRef}
    type="file"
    accept=".csv,text/csv"
    class="hidden"
    onchange={handleCsvFileUpload}
/>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start" in:fade={{ duration: 150 }}>
    <!-- LEFT COLUMN: KRC-20 / KCC-20 DEPLOYER, MULTI-WALLET CAP TABLE & SILVERSCRIPT PROOF-OF-LOCK -->
    <div
        class="lg:col-span-7 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col gap-6"
        style="background-image: radial-gradient(ellipse at top left, rgba(24, 198, 165, 0.12), transparent 65%);"
    >
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
            <div class="flex flex-col">
                <h2 class="text-sm md:text-base font-black uppercase tracking-widest text-white">
                    Mode 01 • KRC-20 Deploy &amp; Tokenomics Studio
                </h2>
                <span class="text-[10px] text-neutral-400 mt-0.5">
                    Configure genesis supply, multi-wallet allocations, SilverScript `.sil` Proof-of-Lock vesting covenants, and deflationary burn sinks.
                </span>
            </div>
            <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/35 text-[#18C6A5] text-[9px] font-bold uppercase">
                KAS-ONLY FEE FIREWALL
            </span>
        </div>

        <!-- TOKEN STANDARD SELECTOR: KRC-20 VS KCC-20 SILVERSCRIPT COVENANT -->
        <div class="flex flex-col gap-2">
            <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-300">
                L1 Token &amp; Covenant Standard
            </span>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 bg-[#11161f] p-1.5 rounded-2xl border border-white/10">
                <button
                    type="button"
                    data-testid="token-standard-krc20-btn"
                    onclick={() => setTokenStandard('KRC-20')}
                    class="p-3 rounded-xl text-left transition-all cursor-pointer flex flex-col gap-0.5 border {tokenStandard === 'KRC-20' ? 'bg-[#161d29] border-[#18C6A5]/45 text-white shadow-md' : 'bg-[#0a0d12]/60 border-white/5 text-neutral-400 hover:text-white'}"
                >
                    <div class="flex items-center justify-between">
                        <span class="text-[10px] font-black uppercase tracking-wider text-white">
                            Standard KRC-20 Inscription
                        </span>
                        <span class="text-[8px] font-mono px-1.5 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/35 text-[#18C6A5]">
                            KASPLEX L1
                        </span>
                    </div>
                    <span class="text-[9px] text-neutral-400">
                        Kasplex envelope + Proof-of-Lock P2SH vault routing
                    </span>
                </button>
                <button
                    type="button"
                    data-testid="token-standard-kcc20-btn"
                    onclick={() => setTokenStandard('KCC-20')}
                    class="p-3 rounded-xl text-left transition-all cursor-pointer flex flex-col gap-0.5 border {tokenStandard === 'KCC-20' ? 'bg-[#161d29] border-blue-500/45 text-white shadow-md' : 'bg-[#0a0d12]/60 border-white/5 text-neutral-400 hover:text-white'}"
                >
                    <div class="flex items-center justify-between">
                        <span class="text-[10px] font-black uppercase tracking-wider text-white">
                            KCC-20 + SilverScript Covenant
                        </span>
                        <span class="text-[8px] font-mono px-1.5 py-0.5 rounded bg-[#0a0d12] border border-blue-500/40 text-blue-400">
                            SILVERSCRIPT v1
                        </span>
                    </div>
                    <span class="text-[9px] text-neutral-400">
                        Fixed-width KCC20State commitment + `kaspa:p...` P2SH vaults
                    </span>
                </button>
            </div>
        </div>

        <!-- TICKER & AVAILABILITY VERIFIER -->
        <div class="flex flex-col gap-2">
            <label
                for="krc20DeployTicker"
                class="text-[10px] font-bold uppercase tracking-widest text-neutral-300"
            >
                Token Ticker Symbol (4 to 6 Letters)
            </label>
            <div class="flex flex-col sm:flex-row gap-2.5">
                <input
                    id="krc20DeployTicker"
                    data-testid="krc20-deploy-ticker-input"
                    type="text"
                    maxlength="6"
                    bind:value={deployTicker}
                    oninput={() => {
                        deployTicker = deployTicker.toUpperCase().replace(/[^A-Z]/g, '');
                        if (capTable.length > 0) {
                            capTable = capTable.map((r) => enrichCapRowWithSilverScript(r));
                        }
                    }}
                    placeholder="SILO"
                    class="flex-1 bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-base font-mono font-black text-white uppercase tracking-widest outline-none"
                />
                <button
                    type="button"
                    data-testid="krc20-check-ticker-btn"
                    onclick={checkDeployTickerAvailability}
                    disabled={isCheckingTicker || !deployTicker.trim()}
                    class="tactile-btn px-5 py-3 rounded-xl border-[#18C6A5]/40 text-[#18C6A5] text-[10px] font-black uppercase tracking-widest cursor-pointer disabled:opacity-40 shrink-0"
                >
                    {isCheckingTicker ? 'Checking Kasplex...' : 'Verify Ticker Availability'}
                </button>
            </div>
            {#if tickerAvailability}
                <div
                    data-testid="krc20-ticker-status-badge"
                    class="mt-1 p-3.5 rounded-xl border text-[10px] font-mono flex flex-col gap-1.5 {tickerAvailability.error ? 'bg-red-950/25 border-red-500/40 text-red-400' : tickerAvailability.available ? 'bg-[#11161f] border-[#18C6A5]/45 text-[#18C6A5]' : 'bg-amber-950/20 border-amber-500/45 text-amber-400'}"
                >
                    {#if tickerAvailability.error}
                        <span class="font-bold">✕ {tickerAvailability.error}</span>
                    {:else if tickerAvailability.available}
                        <div class="flex items-center justify-between">
                            <span class="font-black uppercase tracking-wider">
                                ✓ TICKER "{tickerAvailability.checkedTicker}" IS AVAILABLE FOR DEPLOYMENT
                            </span>
                            <span class="text-[8px] px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/40">
                                UNCLAIMED ON DAG
                            </span>
                        </div>
                    {:else if tickerAvailability.existingToken}
                        <div class="flex items-center justify-between">
                            <span class="font-black uppercase tracking-wider">
                                ⚠ TICKER "{tickerAvailability.checkedTicker}" IS ALREADY DEPLOYED
                            </span>
                            <button
                                type="button"
                                onclick={() =>
                                    onInspectExistingTicker(
                                        tickerAvailability?.checkedTicker || '',
                                        tickerAvailability?.existingToken
                                    )}
                                class="tactile-btn px-2.5 py-1 rounded text-[8px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer"
                            >
                                [Inspect / Upgrade in Mode 02 →]
                            </button>
                        </div>
                        <span class="text-[9px] text-neutral-300">
                            State: {tickerAvailability.existingToken.state.toUpperCase()} • Holders: {tickerAvailability.existingToken.holderTotal.toLocaleString()} • Max Supply: {parseKasplexUnits(tickerAvailability.existingToken.max, tickerAvailability.existingToken.dec).toLocaleString()}
                        </span>
                    {/if}
                </div>
            {/if}
        </div>

        <!-- CORE SUPPLY MATRIX -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="flex flex-col gap-1.5">
                <label
                    for="deployMaxSupply"
                    class="text-[10px] font-bold uppercase tracking-widest text-neutral-300"
                >
                    Max Token Supply (Whole Tokens)
                </label>
                <input
                    id="deployMaxSupply"
                    data-testid="krc20-deploy-max-input"
                    type="number"
                    min="1"
                    bind:value={deployMaxSupply}
                    class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-sm font-mono font-bold text-white outline-none"
                />
            </div>
            <div class="flex flex-col gap-1.5">
                <label
                    for="deployMintLimit"
                    class="text-[10px] font-bold uppercase tracking-widest text-neutral-300"
                >
                    Per-Mint Limit (Tokens per TX)
                </label>
                <input
                    id="deployMintLimit"
                    data-testid="krc20-deploy-lim-input"
                    type="number"
                    min="1"
                    bind:value={deployMintLimit}
                    class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-sm font-mono font-bold text-white outline-none"
                />
            </div>
            <div class="flex flex-col gap-1.5">
                <label
                    for="deployDecimals"
                    class="text-[10px] font-bold uppercase tracking-widest text-neutral-300"
                >
                    Decimals (Default 8)
                </label>
                <input
                    id="deployDecimals"
                    type="number"
                    min="0"
                    max="18"
                    bind:value={deployDecimals}
                    class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-sm font-mono font-bold text-white outline-none"
                />
            </div>
            <div class="flex flex-col gap-1.5">
                <label
                    for="deployPreAlloc"
                    class="text-[10px] font-bold uppercase tracking-widest text-neutral-300"
                >
                    Genesis Pre-Allocation (Cap Table + Vaults)
                </label>
                <input
                    id="deployPreAlloc"
                    type="number"
                    min="0"
                    bind:value={deployPreAllocation}
                    class="w-full bg-[#11161f] border border-white/10 focus:border-[#18C6A5]/50 rounded-xl px-4 py-3 text-sm font-mono font-bold text-[#18C6A5] outline-none"
                />
            </div>
        </div>

        <!-- UNLIMITED MULTI-WALLET GENESIS CAP TABLE & SILVERSCRIPT PROOF-OF-LOCK -->
        <div
            class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-4"
            data-testid="genesis-cap-table-builder"
        >
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3">
                <div class="flex flex-col">
                    <span class="text-xs font-black uppercase tracking-widest text-white">
                        Genesis Multi-Wallet Cap Table &amp; SilverScript Covenants
                    </span>
                    <span class="text-[9px] text-neutral-400">
                        Automated `kaspa:p...` P2SH vault derivation with 22:00 UTC linear vesting unlocks &amp; inspectable `.sil` source
                    </span>
                </div>
                <div class="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        data-testid="cap-table-load-template-btn"
                        onclick={loadInstitutionalCapTableTemplate}
                        class="tactile-btn px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase text-amber-400 border-amber-500/40 cursor-pointer"
                    >
                        [⚡ Load 4-Tranche Template]
                    </button>
                    <button
                        type="button"
                        data-testid="cap-table-toggle-csv-btn"
                        onclick={() => (showCsvImportDrawer = !showCsvImportDrawer)}
                        class="tactile-btn px-2.5 py-1.5 rounded-lg text-[8px] font-black uppercase text-blue-400 border-blue-500/40 cursor-pointer"
                    >
                        [1-Click .CSV Import]
                    </button>
                    <button
                        type="button"
                        data-testid="cap-table-add-row-btn"
                        onclick={() => addCapTableRow()}
                        class="tactile-btn px-3 py-1.5 rounded-lg text-[8px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/45 cursor-pointer"
                    >
                        [+ Add Recipient Row]
                    </button>
                </div>
            </div>

            {#if showCsvImportDrawer}
                <div
                    transition:slide={{ duration: 150 }}
                    class="bg-[#0a0d12] border border-blue-500/35 rounded-xl p-3.5 flex flex-col gap-2.5"
                >
                    <div class="flex items-center justify-between">
                        <span class="text-[9px] font-bold uppercase tracking-widest text-blue-400">
                            CSV Cap Table Format: `address,amount,label,cliff_days,linear_days`
                        </span>
                        <button
                            type="button"
                            onclick={() => csvFileInputRef?.click()}
                            class="text-[8px] font-mono text-[#18C6A5] hover:underline uppercase cursor-pointer"
                        >
                            [Upload .CSV File ↑]
                        </button>
                    </div>
                    <textarea
                        rows="3"
                        data-testid="cap-table-csv-textarea"
                        bind:value={csvRawText}
                        placeholder="kaspa:qp...,2100000,Founders Vault,180,365"
                        class="w-full bg-[#11161f] border border-white/10 focus:border-blue-500/50 rounded-lg p-2.5 text-[10px] font-mono text-white outline-none resize-none"
                    ></textarea>
                    {#if csvImportFeedback}
                        <div
                            data-testid="cap-table-csv-feedback"
                            class="p-2 rounded-lg border text-[9px] font-mono {csvImportFeedback.type === 'success' ? 'border-[#18C6A5]/40 text-[#18C6A5] bg-[#11161f]' : 'border-red-500/40 text-red-400 bg-red-950/20'}"
                        >
                            {csvImportFeedback.message}
                        </div>
                    {/if}
                    <div class="flex justify-end gap-2">
                        <button
                            type="button"
                            data-testid="cap-table-csv-import-btn"
                            onclick={handleImportCsvText}
                            class="tactile-btn px-4 py-1.5 rounded-lg text-[9px] font-black uppercase text-[#18C6A5] border-[#18C6A5]/40 cursor-pointer"
                        >
                            Validate Bech32m Checksums &amp; Import CSV →
                        </button>
                    </div>
                </div>
            {/if}

            {#if capTable.length === 0}
                <div class="py-6 text-center border border-dashed border-white/10 rounded-xl bg-[#0a0d12]/60 flex flex-col items-center gap-1.5">
                    <span class="text-[10px] font-bold uppercase tracking-widest text-neutral-400">
                        0 Pre-Allocation Cap Table Rows (100% Public Fair Launch)
                    </span>
                    <span class="text-[9px] text-neutral-500">
                        Click [+ Add Recipient Row] or [⚡ Load 4-Tranche Template] to configure multi-wallet allocations &amp; SilverScript Proof-of-Lock vesting covenants.
                    </span>
                </div>
            {:else}
                <div class="flex flex-col gap-2.5 max-h-[420px] overflow-y-auto pr-1 hide-scrollbar">
                    {#each capTable as row, idx (row.id)}
                        {@const isTimelockedRow = row.cliffDays > 0 || row.linearDays > 0}
                        {@const isSilOpen = Boolean(expandedSilDrawers[row.id])}
                        <div
                            data-testid="cap-table-row-{idx}"
                            class="bg-[#0a0d12] border {row.checksumValid ? 'border-white/10' : 'border-red-500/50'} rounded-xl p-3 flex flex-col gap-2"
                        >
                            <div class="flex flex-wrap items-center justify-between gap-2">
                                <input
                                    type="text"
                                    bind:value={row.label}
                                    oninput={() => {
                                        capTable = capTable.map((r, i) =>
                                            i === idx ? enrichCapRowWithSilverScript(r) : r
                                        );
                                    }}
                                    placeholder="Tranche Label (e.g. Founders / Treasury)"
                                    class="bg-transparent text-xs font-bold text-white outline-none border-b border-transparent focus:border-[#18C6A5]/50 w-48"
                                />
                                <div class="flex flex-wrap items-center gap-1.5">
                                    {#if row.checksumValid && (isTimelockedRow || tokenStandard === 'KCC-20')}
                                        <button
                                            type="button"
                                            data-testid="toggle-sil-drawer-{idx}"
                                            onclick={() => toggleSilDrawer(row.id)}
                                            class="tactile-btn px-2 py-0.5 rounded text-[8px] font-mono font-black uppercase border border-blue-500/40 text-blue-400 cursor-pointer"
                                        >
                                            {isSilOpen
                                                ? '[Hide .sil Contract ▴]'
                                                : '[View Compiled .sil Contract]'}
                                        </button>
                                    {/if}
                                    <span
                                        data-testid="cap-table-checksum-badge-{idx}"
                                        class="px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase border {row.checksumValid ? 'border-[#18C6A5]/40 text-[#18C6A5] bg-[#11161f]' : 'border-red-500/40 text-red-400 bg-red-950/20'}"
                                    >
                                        {row.checksumValid
                                            ? isTimelockedRow
                                                ? `PROOF-OF-LOCK (${row.cliffDays}D CLIFF / ${row.linearDays}D LIN)`
                                                : 'BECH32M VALID • INSTANT'
                                            : row.checksumError || 'INVALID BECH32M'}
                                    </span>
                                    <button
                                        type="button"
                                        onclick={() => removeCapTableRow(row.id)}
                                        class="text-neutral-500 hover:text-red-400 text-xs cursor-pointer"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                                <div class="sm:col-span-5">
                                    <input
                                        type="text"
                                        data-testid="cap-table-address-input-{idx}"
                                        value={row.address}
                                        oninput={(e) =>
                                            updateCapRowAddress(
                                                idx,
                                                (e.currentTarget as HTMLInputElement).value
                                            )}
                                        placeholder="kaspa:qp... or kaspa:p..."
                                        spellcheck="false"
                                        class="w-full bg-[#11161f] border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-white outline-none"
                                    />
                                </div>
                                <div class="sm:col-span-3 flex items-center gap-1 bg-[#11161f] border border-white/10 rounded-lg px-2 py-1.5">
                                    <input
                                        type="number"
                                        data-testid="cap-table-amount-input-{idx}"
                                        value={row.amount}
                                        oninput={(e) =>
                                            updateCapRowAmount(
                                                idx,
                                                (e.currentTarget as HTMLInputElement).value
                                            )}
                                        class="w-full bg-transparent text-[10px] font-mono font-bold text-white outline-none"
                                    />
                                    <span class="text-[8px] text-neutral-400">{deployTicker}</span>
                                </div>
                                <div class="sm:col-span-2 flex items-center gap-0.5 bg-[#11161f] border border-white/10 rounded-lg px-2 py-1.5">
                                    <input
                                        type="number"
                                        step="0.5"
                                        data-testid="cap-table-pct-input-{idx}"
                                        value={row.pctOfSupply}
                                        oninput={(e) =>
                                            updateCapRowPct(
                                                idx,
                                                (e.currentTarget as HTMLInputElement).value
                                            )}
                                        class="w-full bg-transparent text-[10px] font-mono text-[#18C6A5] font-bold outline-none"
                                    />
                                    <span class="text-[8px] text-neutral-400">%</span>
                                </div>
                                <div class="sm:col-span-1 flex items-center gap-0.5 bg-[#11161f] border border-white/10 rounded-lg px-1.5 py-1.5" title="Cliff Days">
                                    <input
                                        type="number"
                                        min="0"
                                        data-testid="cap-table-cliff-input-{idx}"
                                        value={row.cliffDays}
                                        oninput={(e) =>
                                            updateCapRowLockSchedule(
                                                idx,
                                                parseInt((e.currentTarget as HTMLInputElement).value || '0', 10),
                                                row.linearDays
                                            )}
                                        class="w-full bg-transparent text-[9px] font-mono text-amber-400 outline-none text-center"
                                    />
                                    <span class="text-[7px] text-neutral-500">CLF</span>
                                </div>
                                <div class="sm:col-span-1 flex items-center gap-0.5 bg-[#11161f] border border-white/10 rounded-lg px-1.5 py-1.5" title="Linear Vesting Days">
                                    <input
                                        type="number"
                                        min="0"
                                        data-testid="cap-table-linear-input-{idx}"
                                        value={row.linearDays}
                                        oninput={(e) =>
                                            updateCapRowLockSchedule(
                                                idx,
                                                row.cliffDays,
                                                parseInt((e.currentTarget as HTMLInputElement).value || '0', 10)
                                            )}
                                        class="w-full bg-transparent text-[9px] font-mono text-blue-400 outline-none text-center"
                                    />
                                    <span class="text-[7px] text-neutral-500">LIN</span>
                                </div>
                            </div>

                            {#if row.checksumValid && (isTimelockedRow || tokenStandard === 'KCC-20') && row.covenantAddress}
                                <div
                                    data-testid="cap-table-covenant-vault-{idx}"
                                    class="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-white/5 text-[8px] font-mono"
                                >
                                    <span class="text-neutral-400 truncate max-w-[330px]">
                                        SilverScript P2SH Vault: <strong class="text-[#18C6A5] select-all">{row.covenantAddress}</strong>
                                    </span>
                                    <span class="text-blue-400 truncate max-w-[200px]">
                                        KCC-20 Root: {String(row.kcc20StateCommitment || '').slice(0, 14)}...
                                    </span>
                                </div>
                            {/if}

                            {#if isSilOpen && row.silverscriptSource}
                                <div
                                    data-testid="sil-contract-drawer-{idx}"
                                    transition:slide={{ duration: 150 }}
                                    class="mt-1 bg-[#11161f] border border-blue-500/35 rounded-xl p-3 flex flex-col gap-2"
                                >
                                    <div class="flex flex-wrap items-center justify-between gap-2 text-[8px] font-mono">
                                        <span class="text-blue-400 font-bold uppercase tracking-wider">
                                            Compiled SilverScript v1 Contract (`ProofOfLockVault.sil`)
                                        </span>
                                        <span class="text-neutral-400">
                                            P2SH SPK: `a9{String(row.redeemScriptHex || '').slice(0, 12)}...87`
                                        </span>
                                    </div>
                                    <pre
                                        data-testid="sil-contract-source-{idx}"
                                        class="bg-[#0a0d12] border border-white/10 rounded-lg p-2.5 text-[9px] font-mono text-[#18C6A5] overflow-x-auto leading-relaxed select-all"
                                    >{row.silverscriptSource}</pre>
                                </div>
                            {/if}
                        </div>
                    {/each}
                </div>
                <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10 text-[9px] font-mono">
                    <span class="text-neutral-400">
                        Cap Table Total: <strong class="text-white">{totalCapTableTokens.toLocaleString()} {deployTicker}</strong> ({totalCapTablePct.toFixed(2)}% of Max Supply)
                    </span>
                    <span class="text-[#18C6A5]">
                        Locked in SilverScript Vaults: <strong>{lockedCovenantTokens.toLocaleString()} {deployTicker}</strong>
                    </span>
                </div>
            {/if}
        </div>

        <button
            type="button"
            data-testid="krc20-deploy-submit-btn"
            onclick={submitTokenomicsDeploy}
            disabled={isForging || !deployTicker.trim() || deployTicker.trim().length < 4 || !allCapRowsValid}
            class="tactile-btn w-full py-4 rounded-2xl border-[#18C6A5]/45 text-[#18C6A5] text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-40"
            style="background-image: radial-gradient(ellipse at center, rgba(24, 198, 165, 0.2), transparent 70%);"
        >
            {#if isForging}
                {forgeStatusMessage || `Signing ${tokenStandard} Deploy & Cap-Table Fan-Out...`}
            {:else if capTable.length > 0}
                Sign &amp; Deploy {deployTicker || tokenStandard} ({tokenStandard}) + Fan-Out {capTable.length} Cap Table Wallets Locally →
            {:else}
                Sign &amp; Deploy {deployTicker || tokenStandard} ({tokenStandard}) Inscription Locally →
            {/if}
        </button>
    </div>

    <div
        class="lg:col-span-5 bg-[#0a0d12] border border-white/10 rounded-[28px] p-6 md:p-8 shadow-2xl flex flex-col gap-5"
        style="background-image: radial-gradient(ellipse at bottom right, rgba(24, 198, 165, 0.08), transparent 65%);"
    >
        <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3.5">
            <div class="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div class="flex flex-col">
                    <span class="text-xs font-black uppercase tracking-widest text-white">
                        Immutable Monetary Policy Charter
                    </span>
                    <span class="text-[8px] font-mono text-neutral-400">
                        22:00 UTC Auto-Burn Sink &amp; Chromatic Halving Emissions
                    </span>
                </div>
                <button
                    type="button"
                    onclick={() => (enableMonetaryCharter = !enableMonetaryCharter)}
                    class="px-2.5 py-1 rounded-lg text-[8px] font-mono font-black uppercase border cursor-pointer {enableMonetaryCharter ? 'border-[#18C6A5]/45 text-[#18C6A5] bg-[#0a0d12]' : 'border-white/10 text-neutral-500 bg-[#0a0d12]'}"
                >
                    {enableMonetaryCharter ? '✓ CHARTER ARMED' : 'DISABLED'}
                </button>
            </div>
            {#if enableMonetaryCharter}
                <div class="grid grid-cols-2 gap-3 text-[10px]">
                    <div class="flex flex-col gap-1">
                        <label for="burnRateBpsInput" class="text-[8px] font-bold uppercase text-amber-400">
                            22:00 UTC Auto-Burn Sink (bps)
                        </label>
                        <input
                            id="burnRateBpsInput"
                            data-testid="monetary-burn-bps-input"
                            type="number"
                            min="0"
                            max="1000"
                            step="5"
                            bind:value={burnRateBps}
                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white outline-none"
                        />
                        <span class="text-[8px] text-neutral-500">
                            {(burnRateBps / 100).toFixed(2)}% burned to `...kx9awp4e`
                        </span>
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="emissionTypeSelect" class="text-[8px] font-bold uppercase text-blue-400">
                            Emission Decay Curve
                        </label>
                        <select
                            id="emissionTypeSelect"
                            data-testid="monetary-emission-type-select"
                            bind:value={emissionScheduleType}
                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-2.5 py-2 text-[10px] font-mono font-bold text-white outline-none cursor-pointer"
                        >
                            <option value="CHROMATIC_HALVING">Chromatic Halving</option>
                            <option value="PERIODIC_HALVING">Periodic Step Halving</option>
                            <option value="FLAT_TAIL">Flat Daily Tail-Emission</option>
                        </select>
                        <span class="text-[8px] text-neutral-500">
                            Halving Cycle: {halvingIntervalDays} Days
                        </span>
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="dailyEmitInput" class="text-[8px] font-bold uppercase text-neutral-400">
                            Daily 22:00 UTC Emission ({deployTicker})
                        </label>
                        <input
                            id="dailyEmitInput"
                            data-testid="monetary-daily-emission-input"
                            type="number"
                            min="0"
                            bind:value={dailyEmissionRate}
                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="reserveLockInput" class="text-[8px] font-bold uppercase text-neutral-400">
                            Chronos Emission Vault ({deployTicker})
                        </label>
                        <input
                            id="reserveLockInput"
                            data-testid="monetary-reserve-locked-input"
                            type="number"
                            min="0"
                            bind:value={reserveLockedTokens}
                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white outline-none"
                        />
                    </div>
                </div>
                <div class="bg-[#0a0d12] border border-white/10 rounded-xl p-3 flex flex-col gap-2">
                    <div class="flex items-center justify-between text-[8px] font-mono">
                        <span class="text-neutral-300 font-bold uppercase">
                            Interactive 5-Year Supply &amp; Deflationary Burn Curve
                        </span>
                        <div class="flex items-center gap-2">
                            <span class="text-[#18C6A5]">● Net Circulating</span>
                            <span class="text-blue-400">● Gross Emitted</span>
                            <span class="text-amber-400">● Burned</span>
                        </div>
                    </div>
                    <svg
                        data-testid="supply-curve-svg"
                        viewBox="0 0 520 160"
                        class="w-full h-32 bg-[#11161f]/60 rounded-lg border border-white/5 overflow-visible"
                    >
                        <line x1="0" y1="40" x2="520" y2="40" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3 3" />
                        <line x1="0" y1="80" x2="520" y2="80" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3 3" />
                        <line x1="0" y1="120" x2="520" y2="120" stroke="rgba(255,255,255,0.05)" stroke-dasharray="3 3" />
                        <path
                            d={supplyCurveTelemetry.emissionPath}
                            fill="none"
                            stroke="#3B82F6"
                            stroke-width="1.5"
                            stroke-dasharray="4 2"
                        />
                        <path
                            d={supplyCurveTelemetry.circulatingPath}
                            fill="none"
                            stroke="#18C6A5"
                            stroke-width="2.2"
                        />
                        <path
                            d={supplyCurveTelemetry.burnedPath}
                            fill="none"
                            stroke="#F59E0B"
                            stroke-width="1.8"
                        />
                    </svg>
                    <div class="flex justify-between text-[8px] font-mono text-neutral-400">
                        <span>5Y Projected Emitted: +{supplyCurveTelemetry.year5Emitted.toLocaleString()} {deployTicker}</span>
                        <span class="text-amber-400">5Y Provably Burned: -{supplyCurveTelemetry.year5Burned.toLocaleString()} {deployTicker}</span>
                    </div>
                </div>
            {/if}
        </div>

        <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
            <div class="flex items-center justify-between">
                <div class="flex flex-col">
                    <span class="text-xs font-black uppercase tracking-widest text-white">
                        Zero-Rug 365-Day (2.5x) LP Bootstrapper
                    </span>
                    <span class="text-[8px] font-mono text-neutral-400">
                        Auto-locks 80%–100% of public mint KAS into a 365D `KAS / {deployTicker || 'TOKEN'}` Liquidity Plant
                    </span>
                </div>
                <span
                    data-testid="zero-rug-lp-badge"
                    class="px-2 py-0.5 rounded bg-[#0a0d12] border border-[#18C6A5]/40 text-[#18C6A5] text-[8px] font-mono font-black"
                >
                    {zeroRugLpPct}% KAS → 365D 2.5x LP
                </span>
            </div>
            <input
                type="range"
                min="80"
                max="100"
                step="5"
                data-testid="zero-rug-lp-pct-slider"
                bind:value={zeroRugLpPct}
                class="w-full custom-range-slider cursor-pointer"
            />
            <div class="flex justify-between text-[8px] font-mono text-neutral-400">
                <span>80% Mint KAS Floor</span>
                <span>90% Balanced</span>
                <span>100% Full Zero-Rug Lock</span>
            </div>
        </div>

        <div class="bg-[#11161f] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
            <div class="flex items-center justify-between">
                <div class="flex flex-col">
                    <span class="text-xs font-black uppercase tracking-widest text-white">
                        Proof-of-Hashrate Mineable KRC-20 Vault
                    </span>
                    <span class="text-[8px] font-mono text-neutral-400">
                        Allow ASIC miners on `:3332–:3334` to mine `{deployTicker || 'TOKEN'}` pro-rata at the 22:00 UTC Global Settlement
                    </span>
                </div>
                <button
                    type="button"
                    data-testid="mineable-vault-toggle"
                    onclick={() => (enableMineableVault = !enableMineableVault)}
                    class="px-2.5 py-1 rounded-lg text-[8px] font-mono font-black uppercase border cursor-pointer {enableMineableVault ? 'border-[#18C6A5]/45 text-[#18C6A5] bg-[#0a0d12]' : 'border-white/10 text-neutral-400 bg-[#0a0d12]'}"
                >
                    {enableMineableVault ? '✓ MINING VAULT ACTIVE' : '[Enable Mining Vault]'}
                </button>
            </div>
            {#if enableMineableVault}
                <div class="grid grid-cols-2 gap-3 pt-1">
                    <div class="flex flex-col gap-1">
                        <label for="mineVaultFunded" class="text-[8px] font-bold uppercase text-neutral-400">
                            Vault Reserve ({deployTicker})
                        </label>
                        <input
                            id="mineVaultFunded"
                            data-testid="mineable-vault-funded-input"
                            type="number"
                            min="1"
                            bind:value={mineableFundedTokens}
                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono font-bold text-white outline-none"
                        />
                    </div>
                    <div class="flex flex-col gap-1">
                        <label for="mineVaultDaily" class="text-[8px] font-bold uppercase text-neutral-400">
                            Daily 22:00 UTC Miner Payout
                        </label>
                        <input
                            id="mineVaultDaily"
                            data-testid="mineable-vault-daily-input"
                            type="number"
                            min="1"
                            bind:value={mineableDailyEmission}
                            class="bg-[#0a0d12] border border-white/10 rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#18C6A5] outline-none"
                        />
                    </div>
                </div>
            {/if}
        </div>

        <div class="flex flex-col gap-1.5">
            <div class="flex items-center justify-between text-[9px] font-mono">
                <span class="font-bold uppercase tracking-widest text-neutral-400">
                    Canonical L1 Deploy &amp; Charter Hash ({tokenStandard})
                </span>
                <span
                    data-testid="charter-sha256-badge"
                    class="text-[#18C6A5] truncate max-w-[210px]"
                    title={charterSha256}
                >
                    SHA-256: {charterSha256 ? `${charterSha256.slice(0, 16)}...` : 'Computing...'}
                </span>
            </div>
            <pre class="bg-[#11161f] border border-white/10 rounded-2xl p-3.5 text-[10px] text-[#18C6A5] overflow-x-auto">{JSON.stringify(
                {
                    p: tokenStandard === 'KCC-20' ? 'kcc-20' : 'krc-20',
                    op: 'deploy',
                    tick: deployTicker.trim().toUpperCase() || DEFAULT_ECOSYSTEM_TICKER,
                    max: formatTokenBaseUnits(deployMaxSupply, deployDecimals),
                    lim: formatTokenBaseUnits(deployMintLimit, deployDecimals),
                    ...(deployDecimals !== 8 ? { dec: String(deployDecimals) } : {}),
                    ...(deployPreAllocation > 0
                        ? { pre: formatTokenBaseUnits(deployPreAllocation, deployDecimals) }
                        : {}),
                    ...(tokenStandard === 'KCC-20' ? { cov: 'silverscript-v1' } : {}),
                    ...(charterSha256 ? { charter: charterSha256.slice(0, 32) } : {})
                },
                null,
                2
            )}</pre>
        </div>
    </div>
</div>