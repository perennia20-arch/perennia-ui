# AGENTS.md — `perennia-frontend` (Sovereign L1 Frontend Sync)

SvelteKit 5 (`$state` / `$derived` / `$effect`) + Tailwind CSS v4 frontend and server-route proxy for `perennia-stratum-rs` (`:8002`) and non-custodial Kaspa L1 / multi-chain settlement.

- **Canonical Backend Contract**: [docs/api_contract_reference.md](docs/api_contract_reference.md)
- **Target Backend Branch**: `feat/sovereign-l1-settlement` on `:8002` (`RUST_BACKEND_URL`)

---

## 1. Execution & Safety Rules

1. **Batch Size Limit**: Modify or create **at most 5 production `src/` files per batch** (`tests/*.spec.ts` files are exempt from this count).
2. **Operational Guardrails**:
   - Never push to remote (`git push`) unless explicitly instructed by the user.
   - Never read `.env` or `.env*` files.
   - Never delete files unless explicitly requested.
   - Never start persistent live servers (`vite dev`, `vite preview`, etc.) unless asked.
3. **Verification Gate**: After every `src/` batch, run `npm run check` (`svelte-kit sync`) and `npm run build` (and relevant Playwright specs when applicable), fixing all errors before finishing.

---

## 2. Hard Invariants Across All Batches

### Invariant 1 — Strict Atomic Math (`BigInt` & `U128Str`)
- **Zero JS Float Math**: Never use JavaScript `Number` floating-point arithmetic (`parseFloat`, `* 1e8`, `/ 1e8`, float `feeRate`) for `sompi`, token atomic quantities, fees, reserves, thresholds, or transaction outputs.
- **Canonical Units**:
  - `1 KAS = 100_000_000n sompi` (`1e8`)
  - `1 USD = 1_000_000n usdMicros` (`1e6`)
  - `1 USD` oracle price = `100_000_000n E8` (`ORACLE_USD_E8_SCALE`)
  - Fee rates & sector splits use integer basis points (`bps`, `10_000 bps = 100%`).
- **Wire Serialization (`U128Str`)**: Serialize and parse `u128` atomic values (`amountInAtomic`, `protocolFeeAtomic`, `networkFeeSompi`, `estimatedOutputAtomic`, `minOutputAtomic`, `grossUsdMicros`, `netUsdMicros`, `payOracleUsdE8`, `receiveOracleUsdE8`, `kasOracleUsdE8`, `thresholdSompi`, `payoutSompi`, etc.) strictly as decimal unsigned integer strings matching `/^[0-9]{1,39}$/`.
- **Rounding**: Parse user decimal inputs with pure string-splitting fixed-point helpers into `BigInt`; round protocol margins, mass floors, and gas covers strictly **UP (`ceil`)**; convert `BigInt` back to decimal display strings only at UI render boundaries.
- **Post-Toccata `POST /v1/broadcast` Contract**:
  - All Kaspa L1 transactions MUST use **Post-Toccata Transaction v1** (`version: 1`).
  - Include integer/string `storageMass` (KIP-9 harmonic storage mass), KIP-21 `subnetworkId`, and **KIP-20 `covenant` output bindings** (`{ authorizingInput, covenantId }`) whenever present on outputs.
  - Serialize every output `amount` strictly as an integer/string `sompi` value; `POST /v1/broadcast` must **reject** floating-point amounts.

### Invariant 2 — Fail-Closed Oracles
- **Zero Hardcoded Fallbacks**: Remove and forbid all `0.15` KAS price fallbacks, hardcoded seed prices, and simulated/mock balances anywhere in `src/`.
- **503 Fail-Closed UX**: Whenever `:8002` or an oracle feed returns `503 SERVICE_UNAVAILABLE` (or spot price is missing / `<= 0n`), fail closed cleanly: disable swap, onramp, and settlement execution controls and display a plain-English **"Live pricing unavailable"** state.

### Invariant 3 — Non-Custodial L1 Only
- **Retire Custodial Ledgers**: Remove all `yield_reservoirs` UI views, PostgreSQL queries/mutations (`streaming_balance_kas`, `total_yield_kas`, `verified_onchain_credits_kas`, `computeReservoirHmac`), Redis custodial balance ledgers (`dev:sor:treasury:balances:*`), `AUTO_STAKE_SILO` / `LEDGER_KAS` custodial delivery modes, and synthetic `422` actions (`CLAIM_PENDING_SECTOR_KAS`, `STAKE_LP`, `WITHDRAW_LP`, `STAKE_SILO`, `CLAIM_UNSTAKED_SILO`, `SWEEP_TOKEN_TO_COLD_VAULT_NOW`, `SWEEP_TO_COLD_VAULT_NOW`, `WITHDRAW_SYNTHETIC_ASSET`, `DISPATCH_L1_PAYOUT`, `DISPATCH_OTC_UTXOS`).
- **Wire Sovereign L1 State Actions (`POST /v1/state/action`)**:
  - `GET_VAULT_LOCKS`
  - `REGISTER_VAULT_LOCK`
  - `BUILD_VAULT_CANCEL_PSKT`
  - `GET_THERMOSTAT_VALVES`
  - `UPSERT_THERMOSTAT_VALVES`
  - `GET_MATURE_ACCRUAL_AND_OUTBOX`
  - `GET_SETTLEMENT_RECEIPTS`
  - `GET_SOLVENCY_PROOF`
  - `UPDATE_SECTOR_ALLOCATION` with integer `allocationBps` (`0..=10_000`).
- **Wire Non-Custodial SOR (`POST /v1/sor/execute`)**: Support `L1_COW_ATOMIC_PSKT`, `CROSS_CHAIN_OPSHA256_HTLC`, `TIER3_CHANGENOW_SPLIT_PSKT`, and `CROSS_CHAIN_DEPOSIT_INTENT` with stringified `U128Str` fields and client-side signing.
- **Align Admin Table Allowlist (`GET /v1/admin/db/:table`)**: Remove `yield_reservoirs`; support `stratum_mature_accruals`, `epoch_payout_outbox`, `vault_locks`, `thermostat_valves`, `settlement_receipts`, and `solvency_circuit_events`.

### Invariant 4 — UI Discipline
- **Surface & Border System**: Use `#06080b` / `#0a0d12` surfaces, crisp `1px` borders, rounded corners, and subtle radial glows.
- **Forbidden Visual Patterns**: Zero `backdrop-blur*` classes or CSS filters; zero neon solid button fills.
- **Retail Copy Discipline**: Zero protocol jargon in retail-facing UI copy (do not expose terms like `PSKT`, `KIP-20`, `KIP-21`, `OpZkPrecompile`, `0x20`, `sompi`, `ORACLE_HALT`, or `DAA` to end users; translate to clear plain-English copy).

---

## 3. Upstream `:8002` Auth Guard Reference

- `internal_auth_guard` (`/v1/state/action`, `/v1/sor/execute`): `Authorization: Bearer <INTERNAL_ADMIN_TOKEN | PERENNIA_ADMIN_KEY>`
- `verify_internal_admin_headers` (`/v1/admin/*`): `Authorization: Bearer <INTERNAL_ADMIN_TOKEN | PERENNIA_ADMIN_KEY>`
- `internal_mandate_auth_guard` (`/v1/internal/agent/mandates`): `Authorization: Bearer <AGENT_INTERNAL_SERVICE_SECRET | INTERNAL_ADMIN_TOKEN>`
- `agent_edge_guard` (`/api/v1/agent/*`): `Authorization: Bearer agk_<key>` (or `X-Agent-Key`) plus single-use 60s `X-Agent-Nonce` on mutating Chronos endpoints.
