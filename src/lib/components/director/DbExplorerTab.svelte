<script lang="ts">
    import { fade } from 'svelte/transition';

    const CORE_TABLES = [
        'user_command_centers',
        'yield_reservoirs',
        'worker_profiles',
        'network_blocks',
        'liquidity_providers',
        'silo_staking_positions',
        'l1_payout_queue',
        'idempotent_payout_batches',
        'fiat_onramp_orders',
        'fiat_payout_queue',
        'fiat_bank_rails',
        'tax_ledger_events',
        'hifo_tax_lots',
        'hifo_disposal_matches',
        'rwa_oracle_feeds',
        'client_cold_vault_registry',
        'treasury_airlock_sweeps',
        'forge_monetary_policies',
        'forge_mineable_vaults',
        'forge_vesting_schedules',
        'p2p_orders',
        'whitelisted_wallets',
        'entity_kyc'
    ] as const;

    let {
        selectedTable = $bindable('yield_reservoirs'),
        tableRows = [],
        isLoadingTable = false,
        tableSearchFilter = $bindable(''),
        onLoadTable = async (_tableName: string) => {}
    }: {
        selectedTable: string;
        tableRows: any[];
        isLoadingTable: boolean;
        tableSearchFilter: string;
        onLoadTable: (tableName: string) => Promise<void>;
    } = $props();

    let filteredRows = $derived.by(() => {
        const q = tableSearchFilter.trim().toLowerCase();
        if (!q) return tableRows;
        return tableRows.filter((row) =>
            JSON.stringify(row).toLowerCase().includes(q)
        );
    });

    let columnKeys = $derived.by(() => {
        if (!filteredRows || filteredRows.length === 0) return [];
        const keys = new Set<string>();
        for (const r of filteredRows.slice(0, 10)) {
            if (r && typeof r === 'object') {
                for (const k of Object.keys(r)) keys.add(k);
            }
        }
        return Array.from(keys);
    });

    function formatCellValue(val: any): string {
        if (val === null || val === undefined) return '—';
        if (typeof val === 'object') return JSON.stringify(val);
        return String(val);
    }
</script>

<div
    data-testid="director-db-explorer-tab"
    class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start"
    in:fade={{ duration: 150 }}
>
    <div class="lg:col-span-3 bg-[#0a0d12] border border-white/10 rounded-[24px] p-4 flex flex-col gap-2 shadow-2xl">
        <div class="flex items-center justify-between border-b border-white/10 pb-2.5 px-1">
            <span class="text-[10px] font-black uppercase tracking-widest text-[#18C6A5]">
                PostgreSQL Schema
            </span>
            <span class="text-[9px] font-mono text-neutral-400">
                {CORE_TABLES.length} Tables
            </span>
        </div>
        <div class="flex flex-col gap-1 max-h-[540px] overflow-y-auto pr-0.5">
            {#each CORE_TABLES as tbl (tbl)}
                {@const isActive = selectedTable === tbl}
                <button
                    type="button"
                    data-testid="director-table-btn-{tbl}"
                    onclick={() => {
                        selectedTable = tbl;
                        onLoadTable(tbl);
                    }}
                    class="w-full text-left px-3 py-2 rounded-xl text-[10px] font-mono font-bold transition-colors cursor-pointer flex items-center justify-between border {isActive ? 'bg-[#161d29] text-[#18C6A5] border-[#18C6A5]/45' : 'bg-[#11161f]/60 text-neutral-300 hover:text-white border-white/5'}"
                >
                    <span class="truncate">{tbl}</span>
                    {#if isActive}
                        <span class="w-1.5 h-1.5 rounded-full bg-[#18C6A5] shrink-0"></span>
                    {/if}
                </button>
            {/each}
        </div>
    </div>

    <div class="lg:col-span-9 bg-[#0a0d12] border border-white/10 rounded-[24px] p-5 flex flex-col gap-4 shadow-2xl min-h-[580px]">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3.5">
            <div class="flex items-center gap-2.5">
                <span class="px-2.5 py-1 rounded-lg bg-[#11161f] border border-[#18C6A5]/40 text-xs font-mono font-black text-[#18C6A5]">
                    public.{selectedTable}
                </span>
                <span class="text-[10px] font-mono text-neutral-400">
                    {filteredRows.length} Row{filteredRows.length === 1 ? '' : 's'}
                </span>
            </div>
            <div class="flex items-center gap-2">
                <input
                    type="text"
                    bind:value={tableSearchFilter}
                    placeholder="Filter rows by wallet, txid, ticker..."
                    class="bg-[#11161f] border border-white/15 rounded-xl px-3.5 py-1.5 text-xs font-mono text-white outline-none w-64"
                />
                <button
                    type="button"
                    onclick={() => onLoadTable(selectedTable)}
                    disabled={isLoadingTable}
                    class="tactile-btn px-3.5 py-1.5 rounded-xl text-[10px] font-mono font-bold uppercase text-neutral-200 hover:text-white cursor-pointer"
                >
                    {isLoadingTable ? 'Querying...' : 'Refresh ↻'}
                </button>
            </div>
        </div>

        {#if isLoadingTable}
            <div class="flex-1 flex items-center justify-center text-xs font-mono text-[#18C6A5] animate-pulse uppercase tracking-widest">
                Querying PostgreSQL Table public.{selectedTable}...
            </div>
        {:else if filteredRows.length === 0}
            <div class="flex-1 flex items-center justify-center text-xs font-mono text-neutral-500 uppercase tracking-widest border border-dashed border-white/10 rounded-2xl">
                0 matching rows in public.{selectedTable}
            </div>
        {:else}
            <div class="overflow-x-auto max-h-[500px] border border-white/10 rounded-2xl bg-[#11161f]/40">
                <table class="w-full text-left border-collapse text-[11px] font-mono">
                    <thead class="sticky top-0 bg-[#11161f] border-b border-white/10 z-10">
                        <tr>
                            {#each columnKeys as col (col)}
                                <th class="py-2.5 px-3 text-[9px] font-black uppercase tracking-wider text-neutral-400 whitespace-nowrap">
                                    {col}
                                </th>
                            {/each}
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-white/5">
                        {#each filteredRows as row, rIdx (rIdx)}
                            <tr class="hover:bg-[#161d29]/70 transition-colors">
                                {#each columnKeys as col (col)}
                                    <td class="py-2.5 px-3 text-neutral-200 max-w-[260px] truncate" title={formatCellValue(row[col])}>
                                        {formatCellValue(row[col])}
                                    </td>
                                {/each}
                            </tr>
                        {/each}
                    </tbody>
                </table>
            </div>
        {/if}
    </div>
</div>