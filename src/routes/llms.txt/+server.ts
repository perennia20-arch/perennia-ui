// src/routes/llms.txt/+server.ts
import type { RequestHandler, RequestEvent } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ url }: RequestEvent) => {
    const origin =
        url.origin && !url.origin.includes('0.0.0.0')
            ? url.origin.replace(/\/+$/, '')
            : 'https://perennia.io';

    const body = `# Perennia

> Perennia (perennia.io, Perennia LLC) is a self-sovereign Kaspa-native Stratum mining pool, 22:00 UTC Smart Settlement Engine (Chronos), Dark Pool DEX, multi-chain Sovereign Wallet, and non-custodial Headless AI Agent & Personal Automation Gateway.

Perennia's Headless Agent Gateway (/api/v1/agent/*) runs directly on bare-metal Rust (Axum + Tokio + Redis + PostgreSQL + rusty-kaspa kaspad) with an isolated concurrency budget so automated bot swarms never touch human UI rendering. Private keys are never accepted, transmitted, or stored on Perennia servers. Every state-changing execution follows a strict non-custodial flow: Deterministic Quote -> Unsigned Kaspa Transaction v1 or 0x83 Sovereign Intent + Blake3 preimageHash -> Local 64-byte secp256k1 Schnorr Signature -> Idempotent Broadcast & Verifiable Blake3 executionCommitmentHash Receipt.

Strict u128 Solvency & Post-Toccata Mass Rules: All atomic token amounts, sompi balances, USD micro-notionals (1 USD = 1000000), and E8 oracle snapshots (1 USD = 100000000) are serialized strictly as base-10 unsigned u128 strings (^[0-9]{1,39}$); floating-point values are rejected. Protocol margins, bridge gas covers, KIP-9 storage mass, and Kaspa post-Toccata Transaction v1 mass floors (100 sompi * max(compute_grams, 2 * tx_bytes) consensus floor; 110 sompi/gram relay-safe floor) are rounded strictly UP (ceil) and deducted upfront in expectedAmountOut and signed minAmountOut. Minimum bot trade notional is 1000000 micro-USD ($1.00).

Stateless Auth, UTXO Parallelism, Shadow Mode & x402: Pass HMAC-Blake3 capability tokens via Authorization: Bearer <key> or X-Agent-Key. Mode A keys (per_ag_v1.*) onboard external headless bots via Schnorr wallet challenges and unlock Dark Pool Maker RFQs (5-15s TTL, 2 bps zero-loss floor). Mode B keys (per_md_v1.*) execute human-scoped Sovereign Wallet mandates restricted to whitelisted tickers (^[A-Z0-9]{2,10}$), rolling 24h KAS/USD caps, max slippage bps, and 22:00 UTC Director mining bucket integer basis-point splits (summing to 10000); cold-vault airlock rules and external withdrawal addresses are hard-blocked. Taker quotes enforce a 5s max TTL, lock exact txid:vout outpoints in Redis (scaling from 1 to 8 concurrent lanes with verified fills; maintain 4-8 clean confirmed UTXOs), and clear Dark Pool matches via 1.0s-2.0s fresh-oracle micro-batching. Unfilled quote scraping triggers HTTP 402 Payment Required (x402) with machine-verifiable Kaspa burst-credit parameters (5000000 sompi = 100 burst calls). Pass dryRun: true on quote, execute, or bucket endpoints to run full oracle, mass, signature, Mandate, and HIFO tax-lot simulations with zero state mutation.

## Native Agent Discovery & Real-Time Streaming

- [MCP Tool Manifest & JSON-RPC 2.0 Server](${origin}/api/v1/agent/mcp): GET returns JSON Schema 2020-12 tool definitions (perennia_get_markets, perennia_quote_swap, perennia_execute_swap, perennia_me_telemetry_and_buckets); POST executes JSON-RPC 2.0 initialize, tools/list, and sterile tools/call requests.
- [Agent-Only Alpha & Hashrate Batch Intelligence](${origin}/api/v1/agent/alpha): GET (strictly authenticated with Mode A per_ag_v1.* or Mode B per_md_v1.* Bearer/X-Agent-Key; returns 401/403 unauthenticated) returning exact u128 base-10 strings for hashrateBatchCalls (PENDING SPLITS >= 7500 bps fill sorted by fillBps and incomingPoolThsE6 for BATCH_BOOST settlement piggybacking), spreadDislocations, and L1 PAIR yieldSpikes.
- [Market Pulse & Pair Discovery](${origin}/api/v1/agent/markets): GET cache-only multi-chain, KAS, KRC-20, and KCC-20 pairs, pool reserves, Dark Pool midpoints, resting Maker RFQ depth, Maker/Taker bps, and $1.00 stablecoin depeg circuit-breaker status.
- [SSE & WebSocket Market Pulse Stream](${origin}/api/v1/agent/stream): GET 1-second push stream (Server-Sent Events or WebSocket upgrade) of cached Redis market snapshots so agents subscribe without polling REST.

## BOT Capability Verbs & Non-Custodial SILO UTXO Fee Tiers

- Mode B BOT Verbs: READ (telemetry/markets/alpha), SPLIT (update 22:00 UTC mining sector allocationBps summing to 10000), SWAP (sign & execute Dark Pool/SOR quotes), PAIR (allocate liquidity pairs), BOOST (piggyback >= 75% filled PENDING SPLITS batches via BATCH_BOOST). Cold-vault airlocks and external withdrawal overrides are permanently locked.
- Non-Custodial SILO Fee-Tier UTXO Locks: Verify ownership of unspent SILO outpoints (txid:vout) with zero custodial staking to unlock discounted swap taker tiers: 0 SILO -> 50 bps; >= 10,000 SILO -> 35 bps; >= 100,000 SILO -> 25 bps; >= 1,000,000 SILO -> 15 bps (preserving strict >= 2 bps zero-loss floor).

## Stateless Authentication & x402 Burst Credits

- [Mode A Wallet Challenge](${origin}/api/v1/agent/auth/challenge): POST { walletAddress, pubkeyHex } to request a 120-second Redis challenge nonce for sybil-resistant headless bot onboarding.
- [Mode A Schnorr Verification & Key Minting](${origin}/api/v1/agent/auth/verify): POST 64-byte Schnorr signature over the challenge digest to mint a stateless wallet-bound Mode A capability key (per_ag_v1.*).
- [x402 Burst-Credit L1 Claim](${origin}/api/v1/agent/auth/x402/claim): POST confirmed Kaspa paymentTxid (>= 10 DAA confirmations to treasury address) to credit 100 high-frequency burst calls per 5000000 sompi.

## Core Non-Custodial Execution & Mode B Personal Automation

- [Deterministic Quote, Resting RFQ & Unsigned Ticket](${origin}/api/v1/agent/quote): POST { payAsset, receiveAsset, amountIn, maxSlippageBps, venue, utxoOutpoints, txVersion, computeBudget, storageMass, covenantId, proofPayload, dryRun } to lock UTXO lanes and receive quoteId, minAmountOut, unsigned payload, and Blake3 preimageHash.
- [Idempotent Signed Broadcast & Verifiable Receipt](${origin}/api/v1/agent/execute): POST { quoteId, idempotencyKey, signedPayload, dryRun } to verify preimageHash + 64-byte Schnorr signatures, clear L1 or Dark Pool micro-batches, record u128 HIFO tax lots, and return executionCommitmentHash.
- [Mode B Personal Telemetry & Miner Economics](${origin}/api/v1/agent/me/telemetry): GET Sovereign execution-sleeve balances, UTXO parallel lane health, accrued Stratum worker shares, and live kaspad difficulty and block subsidy (Mode B Mandate only; cold-vault access hard-blocked).
- [Mode B Chronos 22:00 UTC Bucket Control](${origin}/api/v1/agent/me/buckets): GET current mining sectors or POST integer splitBps allocations summing strictly to 10000 across human-whitelisted tickers ahead of the daily 22:00 UTC settlement bell.

## Sovereign Human Portal & Stratum Infrastructure

- [Perennia Sovereign Command Center](${origin}/): Human web interface for Stratum fleet monitoring, Sovereign Wallet management, Dark Pool swaps, Tax Fortress HIFO ledgers, and Mode B Agent Access Mandate creation + 1-click Kill Switch revocation.
`;

    return new Response(body, {
        status: 200,
        headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Cache-Control': 'public, max-age=300, must-revalidate',
            'X-Content-Type-Options': 'nosniff'
        }
    });
};