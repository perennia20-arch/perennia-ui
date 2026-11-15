This file is a merged representation of a subset of the codebase, containing files not matching ignore patterns, combined into a single document by Repomix.
The content has been processed where empty lines have been removed.

# File Summary

## Purpose
This file contains a packed representation of a subset of the repository's contents that is considered the most important context.
It is designed to be easily consumable by AI systems for analysis, code review,
or other automated processes.

## File Format
The content is organized as follows:
1. This summary section
2. Repository information
3. Directory structure
4. Repository files (if enabled)
5. Multiple file entries, each consisting of:
  a. A header with the file path (## File: path/to/file)
  b. The full contents of the file in a code block

## Usage Guidelines
- This file should be treated as read-only. Any changes should be made to the
  original repository files, not this packed version.
- When processing this file, use the file path to distinguish
  between different files in the repository.
- Be aware that this file may contain sensitive information. Handle it with
  the same level of security as you would the original repository.

## Notes
- Some files may have been excluded based on .gitignore rules and Repomix's configuration
- Binary files are not included in this packed representation. Please refer to the Repository Structure section for a complete list of file paths, including binary files
- Files matching these patterns are excluded: proto/**, tests/**, target/**, Cargo.lock, repomix*, *.xml, *.md, .env*
- Files matching patterns in .gitignore are excluded
- Files matching default ignore patterns are excluded
- Empty lines have been removed from all files
- Files are sorted by Git change count (files with more changes are at the bottom)

# Directory Structure
```
src/
  chronos/
    daemons.rs
    forge_bell.rs
    netting.rs
  diff_engine/
    mod.rs
  job_manager/
    mod.rs
  kaspad_client/
    mod.rs
  stratum_tcp/
    mod.rs
  telemetry/
    mod.rs
  admin_api.rs
  chronos.rs
  config.rs
  fiat_rails.rs
  forge_queries.rs
  hifo.rs
  kaspa_tx.rs
  l1_dispatcher.rs
  main.rs
  oracle.rs
  schema.rs
  silverscript.rs
  sor.rs
  state_api.rs
test-results/
  .last-run.json
.gitignore
.repomixignore
build.rs
Cargo.toml
config.yaml
docker-compose.yml
haproxy.cfg
live-db-schema.sql
```

# Files

## File: test-results/.last-run.json
```json
{
  "status": "failed",
  "failedTests": []
}
```

## File: live-db-schema.sql
```sql
--
-- PostgreSQL database dump
--
\restrict 8YVUE0WcyxgFhabxGMcToQD5zUOIBRjQGfwuv0MyqeBR9aeUjLUIOmF3HoqH0GF
-- Dumped from database version 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)
-- Dumped by pg_dump version 18.6 (Ubuntu 18.6-0ubuntu0.26.04.1)
SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;
--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;
--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: -
--
COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';
SET default_tablespace = '';
SET default_table_access_method = heap;
--
-- Name: client_cold_vault_registry; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.client_cold_vault_registry (
    wallet_address character varying(255) NOT NULL,
    cold_kaspa_address character varying(255) NOT NULL,
    card_public_key_hex character varying(128) DEFAULT ''::character varying NOT NULL,
    card_label character varying(128) DEFAULT 'Air-Gapped Hardware Vault'::character varying NOT NULL,
    signer_mode character varying(40) DEFAULT 'WEB_QR_AIRLOCK'::character varying NOT NULL,
    overflow_threshold_kas double precision DEFAULT 500.0 NOT NULL,
    auto_sweep_enabled boolean DEFAULT true NOT NULL,
    last_sweep_txid character varying(128),
    last_sweep_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: corporate_expense_vouchers; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.corporate_expense_vouchers (
    voucher_id character varying(80) NOT NULL,
    wallet_address character varying(255) NOT NULL,
    vendor_name character varying(255) DEFAULT 'Perennia LLC'::character varying NOT NULL,
    category character varying(64) DEFAULT 'HARDWARE_ASIC'::character varying NOT NULL,
    irc_section character varying(128) DEFAULT 'IRC §162 / §179 Business Expense'::character varying NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    amount_usd double precision DEFAULT 0.0 NOT NULL,
    amount_kas double precision DEFAULT 0.0 NOT NULL,
    spot_price_usd double precision DEFAULT 0.0 NOT NULL,
    tx_hash character varying(255),
    tax_year integer DEFAULT 2026 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: corporate_outflow_ledger; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.corporate_outflow_ledger (
    outflow_id character varying(80) NOT NULL,
    admin_wallet character varying(255) NOT NULL,
    outflow_category character varying(64) NOT NULL,
    source_asset character varying(32) DEFAULT 'USDC'::character varying NOT NULL,
    amount_crypto double precision DEFAULT 0.0 NOT NULL,
    spot_price_usd double precision DEFAULT 1.0 NOT NULL,
    gross_usd double precision DEFAULT 0.0 NOT NULL,
    cost_basis_usd double precision DEFAULT 0.0 NOT NULL,
    realized_gain_loss_usd double precision DEFAULT 0.0 NOT NULL,
    vendor_or_beneficiary character varying(255) DEFAULT 'Perennia Holdings, LLC'::character varying NOT NULL,
    invoice_or_memo character varying(255) DEFAULT ''::character varying NOT NULL,
    liquidation_address character varying(255) DEFAULT ''::character varying NOT NULL,
    bridge_transfer_id character varying(128),
    tx_hash character varying(255),
    status character varying(48) DEFAULT 'COMPLETED'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: corporate_owner_draws; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.corporate_owner_draws (
    draw_id character varying(80) NOT NULL,
    wallet_address character varying(255) NOT NULL,
    beneficiary_entity character varying(255) DEFAULT 'Perennia LLC'::character varying NOT NULL,
    destination_rail character varying(64) DEFAULT 'MERCURY_COMMERCIAL_ACH'::character varying NOT NULL,
    bank_last4 character varying(16) DEFAULT '0000'::character varying NOT NULL,
    amount_usd double precision DEFAULT 0.0 NOT NULL,
    amount_kas double precision DEFAULT 0.0 NOT NULL,
    spot_price_usd double precision DEFAULT 0.0 NOT NULL,
    bridge_transfer_id character varying(128),
    trace_id character varying(128),
    memo text DEFAULT 'Perennia LLC Commercial Operating Draw'::text NOT NULL,
    status character varying(48) DEFAULT 'DISPATCHED'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: director_audit_log; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.director_audit_log (
    audit_id bigint NOT NULL,
    director_wallet character varying(255) NOT NULL,
    zone character varying(64) DEFAULT 'ZONE_5'::character varying NOT NULL,
    action_type character varying(96) NOT NULL,
    target_entity character varying(255) DEFAULT ''::character varying NOT NULL,
    details_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: director_audit_log_audit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--
CREATE SEQUENCE public.director_audit_log_audit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;
--
-- Name: director_audit_log_audit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--
ALTER SEQUENCE public.director_audit_log_audit_id_seq OWNED BY public.director_audit_log.audit_id;
--
-- Name: entity_kyc; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.entity_kyc (
    wallet_address character varying(255) NOT NULL,
    legal_name character varying(255) DEFAULT 'Perennia LLC'::character varying NOT NULL,
    entity_type character varying(50) NOT NULL,
    tax_id_hash text NOT NULL,
    business_address text NOT NULL,
    verification_status character varying(50) DEFAULT 'pending'::character varying,
    verified_at timestamp with time zone,
    country_code character varying(16) DEFAULT 'US'::character varying NOT NULL,
    state_region character varying(64) DEFAULT 'TX'::character varying NOT NULL,
    filing_status character varying(64) DEFAULT 'SINGLE'::character varying NOT NULL,
    effective_tax_rate double precision DEFAULT 15.0 NOT NULL,
    bank_data_hash text
);
--
-- Name: epoch_staging_buffers; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.epoch_staging_buffers (
    buffer_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    wallet_address character varying(255) NOT NULL,
    target_asset character varying(20) NOT NULL,
    raw_kas_accumulated double precision DEFAULT 0.0 NOT NULL,
    is_staged_for_clearing boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    staged_at timestamp with time zone,
    last_updated timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: fba_epoch_clearing_history; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.fba_epoch_clearing_history (
    epoch_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    clearing_price_usd double precision NOT NULL,
    total_kas_crossed_internally double precision CONSTRAINT fba_epoch_clearing_history_total_kas_crossed_internall_not_null NOT NULL,
    total_residual_routed_externally double precision CONSTRAINT fba_epoch_clearing_history_total_residual_routed_exter_not_null NOT NULL,
    protocol_revenue_usd double precision NOT NULL,
    executed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: fiat_bank_rails; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.fiat_bank_rails (
    wallet_address character varying(255) NOT NULL,
    bank_label character varying(128) DEFAULT 'Primary Operating Account'::character varying NOT NULL,
    account_type character varying(32) DEFAULT 'CHECKING'::character varying NOT NULL,
    payout_method character varying(20) DEFAULT 'ACH'::character varying NOT NULL,
    bank_last4 character varying(10) NOT NULL,
    encrypted_rail_payload text NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: fiat_float_ledger; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.fiat_float_ledger (
    ledger_id character varying(64) NOT NULL,
    local_kas_reserve_usd double precision DEFAULT 500.0 NOT NULL,
    local_kas_target_cap_usd double precision DEFAULT 500.0 NOT NULL,
    wholesale_api_working_usd double precision DEFAULT 400.0 NOT NULL,
    wholesale_api_target_cap_usd double precision DEFAULT 400.0 NOT NULL,
    ratchet_target_cap_usd double precision DEFAULT 5000.0 NOT NULL,
    commercial_checking_cleared_usd double precision DEFAULT 1500.0 NOT NULL,
    llc_tax_escrow_reserve_usd double precision DEFAULT 0.0 NOT NULL,
    dark_pool_lp_vault_usd double precision DEFAULT 0.0 NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    master_treasury_usdc_reserve double precision DEFAULT 0.0 NOT NULL,
    phase2_ach_target_usd double precision DEFAULT 250000.0 NOT NULL
);
--
-- Name: fiat_onramp_orders; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.fiat_onramp_orders (
    order_id character varying(80) NOT NULL,
    wallet_address character varying(255) NOT NULL,
    payment_rail character varying(64) DEFAULT 'SOVEREIGN_WIRE_ACH'::character varying NOT NULL,
    settlement_target character varying(64) DEFAULT 'LEDGER_KAS'::character varying NOT NULL,
    fiat_amount_usd double precision NOT NULL,
    fee_usd double precision NOT NULL,
    net_usd_converted double precision NOT NULL,
    locked_spot_price double precision NOT NULL,
    estimated_kas double precision NOT NULL,
    delivered_kas double precision DEFAULT 0.0 NOT NULL,
    wire_memo character varying(80) NOT NULL,
    tx_hash character varying(255),
    status character varying(64) DEFAULT 'AWAITING_WIRE_RECEIPT'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    target_asset character varying(32) DEFAULT 'KAS'::character varying NOT NULL,
    target_spot_price double precision DEFAULT 0.0 NOT NULL,
    estimated_tokens double precision DEFAULT 0.0 NOT NULL,
    auto_stake_silo boolean DEFAULT false NOT NULL,
    hard_cost_usd double precision DEFAULT 0.0 NOT NULL,
    guaranteed_profit_usd double precision DEFAULT 0.0 NOT NULL,
    competitor_fee_usd double precision DEFAULT 0.0 NOT NULL,
    guest_savings_usd double precision DEFAULT 0.0 NOT NULL,
    routing_topology character varying(128),
    wholesale_order_id character varying(96),
    wholesale_withdraw_id character varying(96),
    post_trade_sweep_json jsonb DEFAULT '{}'::jsonb,
    changenow_exchange_id character varying(128),
    payin_address character varying(255),
    stripe_payment_intent_id character varying(128),
    bank_last4 character varying(10),
    stripe_onramp_session_id character varying(128),
    bridge_virtual_account_id character varying(128),
    bridge_wire_routing character varying(64),
    bridge_wire_account character varying(64),
    master_treasury_fee_usdc double precision DEFAULT 0.0 NOT NULL,
    payment_method character varying(32) DEFAULT 'ach'::character varying NOT NULL,
    tier_name character varying(32) DEFAULT 'RETAIL'::character varying NOT NULL,
    tier_bps integer DEFAULT 85 NOT NULL,
    quoted_principal_cents bigint DEFAULT 0 NOT NULL,
    perennia_fee_cents bigint DEFAULT 250 NOT NULL,
    stripe_gateway_fee_cents bigint DEFAULT 0 NOT NULL,
    gross_charge_cents bigint DEFAULT 0 NOT NULL,
    settled_net_cents bigint,
    fulfilled_principal_cents bigint,
    quarantine_reason text
);
--
-- Name: fiat_payout_queue; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.fiat_payout_queue (
    payout_id character varying(80) NOT NULL,
    wallet_address character varying(255) NOT NULL,
    source_type character varying(64) NOT NULL,
    source_asset character varying(20) NOT NULL,
    amount_crypto double precision NOT NULL,
    gross_usd double precision NOT NULL,
    fee_usd double precision NOT NULL,
    net_fiat_usd double precision NOT NULL,
    payout_method character varying(20) NOT NULL,
    bank_last4 character varying(10) NOT NULL,
    tx_id character varying(255),
    status character varying(40) DEFAULT 'QUEUED_FOR_TREASURY_DISPATCH'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    trace_id character varying(128),
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    hard_cost_usd double precision DEFAULT 0.0 NOT NULL,
    guaranteed_profit_usd double precision DEFAULT 0.0 NOT NULL,
    competitor_fee_usd double precision DEFAULT 0.0 NOT NULL,
    guest_savings_usd double precision DEFAULT 0.0 NOT NULL,
    deposit_address character varying(255),
    routing_topology character varying(128),
    confirmations_required integer DEFAULT 6 NOT NULL,
    confirmations_current integer DEFAULT 0 NOT NULL,
    changenow_exchange_id character varying(128),
    bridge_transfer_id character varying(128),
    bridge_liquidation_address character varying(255),
    external_cost_basis_usd double precision,
    master_treasury_fee_usdc double precision DEFAULT 0.0 NOT NULL
);
--
-- Name: fiat_post_trade_sweeps; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.fiat_post_trade_sweeps (
    sweep_id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_id character varying(80) NOT NULL,
    direction character varying(24) DEFAULT 'ONRAMP'::character varying NOT NULL,
    asset_ticker character varying(32) DEFAULT 'KAS'::character varying NOT NULL,
    gross_usd double precision DEFAULT 0.0 NOT NULL,
    wholesale_api_float_sweep_usd double precision DEFAULT 0.0 NOT NULL,
    chronos_miner_settlement_usd double precision DEFAULT 0.0 NOT NULL,
    llc_tax_and_rail_reserve_usd double precision DEFAULT 0.0 NOT NULL,
    net_profit_and_ratchet_usd double precision DEFAULT 0.0 NOT NULL,
    float_ratchet_reinvest_usd double precision DEFAULT 0.0 NOT NULL,
    dark_pool_lp_and_owner_draw_usd double precision DEFAULT 0.0 NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: forge_mineable_vaults; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.forge_mineable_vaults (
    vault_id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_ticker character varying(32) NOT NULL,
    creator_address character varying(255) NOT NULL,
    vault_label character varying(128) DEFAULT 'Proof-of-Hashrate Mining Vault'::character varying NOT NULL,
    total_funded_tokens double precision DEFAULT 0.0 NOT NULL,
    remaining_vault_tokens double precision DEFAULT 0.0 NOT NULL,
    daily_emission_tokens double precision DEFAULT 0.0 NOT NULL,
    distributed_tokens double precision DEFAULT 0.0 NOT NULL,
    min_hashrate_ths double precision DEFAULT 0.1 NOT NULL,
    syndicate_sector_enabled boolean DEFAULT true NOT NULL,
    active_miners_count integer DEFAULT 0 NOT NULL,
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    funding_tx_hash character varying(255),
    last_bell_distributed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: forge_monetary_policies; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.forge_monetary_policies (
    policy_id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_ticker character varying(32) NOT NULL,
    creator_address character varying(255) NOT NULL,
    max_supply double precision DEFAULT 0.0 NOT NULL,
    burn_rate_bps integer DEFAULT 0 NOT NULL,
    burn_address character varying(255) DEFAULT 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e'::character varying NOT NULL,
    total_burned_tokens double precision DEFAULT 0.0 NOT NULL,
    emission_schedule_type character varying(48) DEFAULT 'CHROMATIC_HALVING'::character varying NOT NULL,
    daily_emission_rate double precision DEFAULT 0.0 NOT NULL,
    halving_interval_days integer DEFAULT 365 NOT NULL,
    reserve_locked_tokens double precision DEFAULT 0.0 NOT NULL,
    reserve_emitted_tokens double precision DEFAULT 0.0 NOT NULL,
    zero_rug_lp_pct double precision DEFAULT 0.0 NOT NULL,
    zero_rug_lock_days integer DEFAULT 365 NOT NULL,
    is_retroactive_upgrade boolean DEFAULT false NOT NULL,
    charter_sha256 character varying(128) DEFAULT ''::character varying NOT NULL,
    anchor_tx_hash character varying(255),
    last_bell_processed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    token_standard character varying(32) DEFAULT 'KRC-20'::character varying NOT NULL,
    kcc20_covenant_id character varying(128) DEFAULT ''::character varying NOT NULL,
    kcc20_state_root character varying(128) DEFAULT ''::character varying NOT NULL,
    silverscript_charter_source text DEFAULT ''::text NOT NULL,
    covenant_vault_address character varying(255) DEFAULT ''::character varying NOT NULL
);
--
-- Name: forge_vesting_schedules; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.forge_vesting_schedules (
    vesting_id uuid DEFAULT gen_random_uuid() NOT NULL,
    token_ticker character varying(32) NOT NULL,
    beneficiary_address character varying(255) NOT NULL,
    creator_address character varying(255) NOT NULL,
    label character varying(128) DEFAULT 'Genesis Tranche'::character varying NOT NULL,
    total_allocated double precision DEFAULT 0.0 NOT NULL,
    unlocked_amount double precision DEFAULT 0.0 NOT NULL,
    claimed_amount double precision DEFAULT 0.0 NOT NULL,
    cliff_days integer DEFAULT 0 NOT NULL,
    linear_days integer DEFAULT 365 NOT NULL,
    cliff_unlock_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    full_unlock_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    daily_unlock_rate double precision DEFAULT 0.0 NOT NULL,
    covenant_rule character varying(64) DEFAULT 'TIMELOCK_ESCROW_COVENANT'::character varying NOT NULL,
    vprog_state_root character varying(128) DEFAULT ''::character varying NOT NULL,
    lock_tx_hash character varying(255),
    status character varying(32) DEFAULT 'LOCKED'::character varying NOT NULL,
    last_bell_unlocked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    covenant_address character varying(255) DEFAULT ''::character varying NOT NULL,
    silverscript_source text DEFAULT ''::text NOT NULL,
    redeem_script_hex text DEFAULT ''::text NOT NULL,
    kcc20_state_commitment character varying(128) DEFAULT ''::character varying NOT NULL,
    token_standard character varying(32) DEFAULT 'KRC-20'::character varying NOT NULL
);
--
-- Name: hifo_disposal_matches; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.hifo_disposal_matches (
    match_id uuid DEFAULT gen_random_uuid() NOT NULL,
    disposal_event_id uuid,
    lot_id uuid NOT NULL,
    wallet_address character varying(255) NOT NULL,
    asset_ticker character varying(32) DEFAULT 'KAS'::character varying NOT NULL,
    disposed_sompi bigint DEFAULT 0 NOT NULL,
    disposed_tokens double precision DEFAULT 0.0 NOT NULL,
    acquired_at timestamp with time zone NOT NULL,
    disposed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    holding_period_days integer DEFAULT 0 NOT NULL,
    is_long_term boolean DEFAULT false NOT NULL,
    cost_basis_usd double precision DEFAULT 0.0 NOT NULL,
    gross_proceeds_usd double precision DEFAULT 0.0 NOT NULL,
    realized_gain_loss_usd double precision DEFAULT 0.0 NOT NULL,
    disposal_tx_hash character varying(255)
);
--
-- Name: hifo_tax_lots; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.hifo_tax_lots (
    lot_id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_address character varying(255) NOT NULL,
    asset_ticker character varying(32) DEFAULT 'KAS'::character varying NOT NULL,
    acquired_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    kas_sompi bigint DEFAULT 0 NOT NULL,
    initial_tokens double precision DEFAULT 0.0 NOT NULL,
    remaining_sompi bigint DEFAULT 0 NOT NULL,
    remaining_tokens double precision DEFAULT 0.0 NOT NULL,
    fmv_usd_per_token double precision DEFAULT 0.0 NOT NULL,
    total_cost_basis_usd double precision DEFAULT 0.0 NOT NULL,
    source_event_type character varying(64) DEFAULT 'YIELD'::character varying NOT NULL,
    source_tx_hash character varying(255),
    status character varying(32) DEFAULT 'OPEN'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: idempotent_payout_batches; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.idempotent_payout_batches (
    batch_id character varying(96) NOT NULL,
    idempotency_key character varying(128) NOT NULL,
    deterministic_txid character varying(128),
    signed_tx_json jsonb,
    total_sompi bigint DEFAULT 0 NOT NULL,
    recipient_manifest jsonb DEFAULT '[]'::jsonb NOT NULL,
    state character varying(48) DEFAULT 'QUEUED'::character varying NOT NULL,
    daa_score bigint,
    retry_count integer DEFAULT 0 NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: invite_codes; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.invite_codes (
    code character varying(64) NOT NULL,
    is_used boolean DEFAULT false NOT NULL,
    used_by_wallet character varying(255),
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: l1_payout_queue; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.l1_payout_queue (
    payout_id character varying(80) NOT NULL,
    wallet_address character varying(255) NOT NULL,
    destination_address character varying(255) NOT NULL,
    asset_ticker character varying(32) NOT NULL,
    network character varying(32) NOT NULL,
    amount_tokens double precision NOT NULL,
    gross_usd double precision DEFAULT 0.0 NOT NULL,
    spot_price double precision DEFAULT 0.0 NOT NULL,
    source_type character varying(40) DEFAULT 'ledger_withdrawal'::character varying NOT NULL,
    tx_hash character varying(255),
    explorer_url text,
    queue_reason text,
    status character varying(40) DEFAULT 'QUEUED_FOR_L1_DISPATCH'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: liquidity_providers; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.liquidity_providers (
    lp_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    wallet_address character varying(255) NOT NULL,
    pool_pair character varying(120) NOT NULL,
    staked_asset_a double precision DEFAULT 0.0 NOT NULL,
    staked_asset_b double precision DEFAULT 0.0 NOT NULL,
    lock_duration_days integer DEFAULT 0 NOT NULL,
    unlock_date timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    last_yield_distribution timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    weights_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    reserves_json jsonb DEFAULT '{}'::jsonb NOT NULL
);
--
-- Name: micro_shares; Type: TABLE; Schema: public; Owner: -
--
CREATE UNLOGGED TABLE public.micro_shares (
    share_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    worker_id character varying(255) NOT NULL,
    difficulty_weight double precision NOT NULL,
    kas_value_delta double precision NOT NULL,
    network_diff double precision NOT NULL,
    is_settled boolean DEFAULT false NOT NULL,
    recorded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: network_blocks; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.network_blocks (
    block_hash character varying(64) NOT NULL,
    worker_id character varying(255) NOT NULL,
    nonce bigint NOT NULL,
    network_diff double precision NOT NULL,
    is_orphaned boolean DEFAULT false,
    discovered_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    reward_sompi bigint DEFAULT 0 NOT NULL,
    reward_kas double precision DEFAULT 0.0 NOT NULL,
    daa_score bigint DEFAULT 0 NOT NULL
);
--
-- Name: p2p_orders; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.p2p_orders (
    id character varying(50) NOT NULL,
    seller character varying(255),
    sell_token character varying(20),
    sell_amount double precision,
    buy_token character varying(20),
    buy_amount double precision,
    rate character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'open'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    seller_psbt text,
    buyer text,
    tx_id text,
    filled_at timestamp with time zone,
    order_id text,
    maker_wallet text,
    offer_asset text,
    offer_amount double precision DEFAULT 0,
    ask_asset text,
    ask_amount double precision DEFAULT 0,
    psbt_hex text,
    taker_wallet text,
    tx_hash text,
    updated_at timestamp with time zone DEFAULT now()
);
--
-- Name: pending_transactions; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.pending_transactions (
    tx_id character varying(64) NOT NULL,
    wallet_address character varying(255) NOT NULL,
    amount_kas double precision NOT NULL,
    action_type character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'PENDING'::character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    block_daa bigint
);
--
-- Name: rwa_oracle_feeds; Type: TABLE; Schema: public; Owner: -
--
CREATE UNLOGGED TABLE public.rwa_oracle_feeds (
    ticker character varying(16) NOT NULL,
    asset_class character varying(16) NOT NULL,
    price_usd numeric(18,8) NOT NULL,
    oracle_source character varying(32) DEFAULT 'PYTH_HERMES'::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    change_24h_pct double precision DEFAULT 0.0 NOT NULL
);
--
-- Name: security_firewall_blacklist; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.security_firewall_blacklist (
    entry_id uuid DEFAULT gen_random_uuid() NOT NULL,
    entity_type character varying(32) DEFAULT 'WALLET'::character varying NOT NULL,
    target_value character varying(255) NOT NULL,
    reason text DEFAULT 'Director Firewall Block'::text NOT NULL,
    active boolean DEFAULT true NOT NULL,
    added_by character varying(255) DEFAULT 'DIRECTOR'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: silo_staking_positions; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.silo_staking_positions (
    stake_id uuid DEFAULT gen_random_uuid() NOT NULL,
    wallet_address character varying(255) NOT NULL,
    token_ticker character varying(32) DEFAULT 'SILO'::character varying NOT NULL,
    amount_staked double precision DEFAULT 0.0 NOT NULL,
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    tx_hash character varying(255),
    cooldown_initiated_at timestamp with time zone,
    cooldown_ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: system_treasury_config; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.system_treasury_config (
    config_id character varying(64) DEFAULT 'PRIMARY'::character varying NOT NULL,
    hot_ceiling_kas double precision DEFAULT 5000.0 NOT NULL,
    min_runway_kas double precision DEFAULT 250.0 NOT NULL,
    fpps_max_float_kas double precision DEFAULT 50.0 NOT NULL,
    pool_fee_rate double precision DEFAULT 0.01 NOT NULL,
    outflow_breaker_tripped boolean DEFAULT false NOT NULL,
    cold_kas_address character varying(255) DEFAULT ''::character varying NOT NULL,
    cold_btc_address character varying(255) DEFAULT ''::character varying NOT NULL,
    cold_eth_address character varying(255) DEFAULT ''::character varying NOT NULL,
    cold_sol_address character varying(255) DEFAULT ''::character varying NOT NULL,
    updated_by character varying(255) DEFAULT 'SYSTEM_BOOT'::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: tax_ledger_events; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.tax_ledger_events (
    event_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    wallet_address character varying(255) NOT NULL,
    asset_ticker character varying(20) NOT NULL,
    event_type character varying(50) NOT NULL,
    gross_proceeds_usd double precision NOT NULL,
    amount_tokens double precision NOT NULL,
    spot_price_at_execution double precision NOT NULL,
    recorded_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    epoch_id uuid,
    tx_hash character varying(255),
    payout_address character varying(255),
    cost_basis_usd double precision DEFAULT 0.0 NOT NULL,
    realized_gain_loss_usd double precision DEFAULT 0.0 NOT NULL,
    holding_period character varying(32) DEFAULT 'SHORT_TERM'::character varying NOT NULL
);
--
-- Name: token_steering_matrix; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.token_steering_matrix (
    ticker character varying(32) NOT NULL,
    asset_name character varying(128) DEFAULT ''::character varying NOT NULL,
    network character varying(32) DEFAULT 'KAS'::character varying NOT NULL,
    contract_address character varying(255) DEFAULT ''::character varying NOT NULL,
    steering_state character varying(32) DEFAULT 'AUTO_BALANCE'::character varying NOT NULL,
    is_whitelisted boolean DEFAULT true NOT NULL,
    target_weight_pct double precision DEFAULT 10.0 NOT NULL,
    actual_weight_pct double precision DEFAULT 0.0 NOT NULL,
    accumulated_fee_tokens double precision DEFAULT 0.0 NOT NULL,
    accumulated_fee_usd double precision DEFAULT 0.0 NOT NULL,
    updated_by character varying(255) DEFAULT 'SYSTEM_BOOT'::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: treasury_airlock_sweeps; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.treasury_airlock_sweeps (
    sweep_id uuid DEFAULT gen_random_uuid() NOT NULL,
    hot_wallet_address character varying(255) NOT NULL,
    cold_vault_address character varying(255) NOT NULL,
    swept_kas double precision DEFAULT 0.0 NOT NULL,
    hot_balance_before_kas double precision DEFAULT 0.0 NOT NULL,
    hot_balance_after_kas double precision DEFAULT 0.0 NOT NULL,
    runway_hours_remaining double precision DEFAULT 24.0 NOT NULL,
    tx_id character varying(128),
    status character varying(48) DEFAULT 'SWEPT_TO_COLD'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: user_cold_vault_rules; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.user_cold_vault_rules (
    wallet_address character varying(255) NOT NULL,
    asset_ticker character varying(32) NOT NULL,
    network character varying(32) DEFAULT 'KAS'::character varying NOT NULL,
    cold_destination_address character varying(255) NOT NULL,
    vault_label character varying(128) DEFAULT 'Perennia Cold Vault'::character varying NOT NULL,
    overflow_ceiling double precision DEFAULT 500.0 NOT NULL,
    auto_sweep_enabled boolean DEFAULT false NOT NULL,
    last_sweep_txid character varying(128),
    last_sweep_amount double precision DEFAULT 0.0 NOT NULL,
    last_sweep_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: user_command_centers; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.user_command_centers (
    wallet_address character varying(255) NOT NULL,
    layout_state jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_updated timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: user_treasury_preferences; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.user_treasury_preferences (
    wallet_address character varying(255) NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    last_updated timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: whitelisted_wallets; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.whitelisted_wallets (
    wallet_address character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: worker_profiles; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.worker_profiles (
    worker_id character varying(255) NOT NULL,
    wallet_address character varying(255) NOT NULL,
    device_profile character varying(100) DEFAULT 'unknown'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    worker_name character varying(128) DEFAULT 'Rig'::character varying NOT NULL,
    hashrate_ths double precision DEFAULT 0.0 NOT NULL,
    valid_shares bigint DEFAULT 0 NOT NULL,
    rejected_shares bigint DEFAULT 0 NOT NULL,
    acceptance_pct double precision DEFAULT 100.0 NOT NULL,
    blocks_found bigint DEFAULT 0 NOT NULL,
    last_share_ts bigint DEFAULT 0 NOT NULL,
    status character varying(32) DEFAULT 'online'::character varying NOT NULL,
    updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    streak_started_ts bigint DEFAULT 0 NOT NULL,
    effective_fee_rate double precision DEFAULT 0.01 NOT NULL,
    worker_identity character varying(255),
    hardware_model character varying(128) DEFAULT 'IceRiver KS'::character varying NOT NULL,
    current_hashrate double precision DEFAULT 0.0 NOT NULL,
    stratum_port integer DEFAULT 3332 NOT NULL,
    last_seen timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: yield_distributions; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.yield_distributions (
    distribution_id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    pool_pair character varying(120) NOT NULL,
    total_fees_distributed_usd double precision NOT NULL,
    distributed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);
--
-- Name: yield_reservoirs; Type: TABLE; Schema: public; Owner: -
--
CREATE TABLE public.yield_reservoirs (
    wallet_address character varying(255) NOT NULL,
    streaming_balance_kas double precision DEFAULT 0.0 NOT NULL,
    total_yield_kas double precision DEFAULT 0.0 NOT NULL,
    last_updated timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    lp_tokens jsonb DEFAULT '{}'::jsonb,
    streaming_balance_zkas double precision DEFAULT 0.0 NOT NULL,
    total_yield_zkas double precision DEFAULT 0.0 NOT NULL,
    verified_onchain_credits_kas double precision DEFAULT 0.0 NOT NULL,
    row_hmac_sig character varying(128) DEFAULT ''::character varying NOT NULL,
    quarantined boolean DEFAULT false NOT NULL,
    quarantine_reason text,
    quarantined_at timestamp with time zone
);
--
-- Name: director_audit_log audit_id; Type: DEFAULT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.director_audit_log ALTER COLUMN audit_id SET DEFAULT nextval('public.director_audit_log_audit_id_seq'::regclass);
--
-- Name: client_cold_vault_registry client_cold_vault_registry_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.client_cold_vault_registry
    ADD CONSTRAINT client_cold_vault_registry_pkey PRIMARY KEY (wallet_address);
--
-- Name: corporate_expense_vouchers corporate_expense_vouchers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.corporate_expense_vouchers
    ADD CONSTRAINT corporate_expense_vouchers_pkey PRIMARY KEY (voucher_id);
--
-- Name: corporate_outflow_ledger corporate_outflow_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.corporate_outflow_ledger
    ADD CONSTRAINT corporate_outflow_ledger_pkey PRIMARY KEY (outflow_id);
--
-- Name: corporate_owner_draws corporate_owner_draws_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.corporate_owner_draws
    ADD CONSTRAINT corporate_owner_draws_pkey PRIMARY KEY (draw_id);
--
-- Name: director_audit_log director_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.director_audit_log
    ADD CONSTRAINT director_audit_log_pkey PRIMARY KEY (audit_id);
--
-- Name: entity_kyc entity_kyc_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.entity_kyc
    ADD CONSTRAINT entity_kyc_pkey PRIMARY KEY (wallet_address);
--
-- Name: epoch_staging_buffers epoch_staging_buffers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.epoch_staging_buffers
    ADD CONSTRAINT epoch_staging_buffers_pkey PRIMARY KEY (buffer_id);
--
-- Name: fba_epoch_clearing_history fba_epoch_clearing_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.fba_epoch_clearing_history
    ADD CONSTRAINT fba_epoch_clearing_history_pkey PRIMARY KEY (epoch_id);
--
-- Name: fiat_bank_rails fiat_bank_rails_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.fiat_bank_rails
    ADD CONSTRAINT fiat_bank_rails_pkey PRIMARY KEY (wallet_address);
--
-- Name: fiat_float_ledger fiat_float_ledger_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.fiat_float_ledger
    ADD CONSTRAINT fiat_float_ledger_pkey PRIMARY KEY (ledger_id);
--
-- Name: fiat_onramp_orders fiat_onramp_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.fiat_onramp_orders
    ADD CONSTRAINT fiat_onramp_orders_pkey PRIMARY KEY (order_id);
--
-- Name: fiat_payout_queue fiat_payout_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.fiat_payout_queue
    ADD CONSTRAINT fiat_payout_queue_pkey PRIMARY KEY (payout_id);
--
-- Name: fiat_post_trade_sweeps fiat_post_trade_sweeps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.fiat_post_trade_sweeps
    ADD CONSTRAINT fiat_post_trade_sweeps_pkey PRIMARY KEY (sweep_id);
--
-- Name: forge_mineable_vaults forge_mineable_vaults_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.forge_mineable_vaults
    ADD CONSTRAINT forge_mineable_vaults_pkey PRIMARY KEY (vault_id);
--
-- Name: forge_mineable_vaults forge_mineable_vaults_token_ticker_key; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.forge_mineable_vaults
    ADD CONSTRAINT forge_mineable_vaults_token_ticker_key UNIQUE (token_ticker);
--
-- Name: forge_monetary_policies forge_monetary_policies_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.forge_monetary_policies
    ADD CONSTRAINT forge_monetary_policies_pkey PRIMARY KEY (policy_id);
--
-- Name: forge_monetary_policies forge_monetary_policies_token_ticker_key; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.forge_monetary_policies
    ADD CONSTRAINT forge_monetary_policies_token_ticker_key UNIQUE (token_ticker);
--
-- Name: forge_vesting_schedules forge_vesting_schedules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.forge_vesting_schedules
    ADD CONSTRAINT forge_vesting_schedules_pkey PRIMARY KEY (vesting_id);
--
-- Name: hifo_disposal_matches hifo_disposal_matches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.hifo_disposal_matches
    ADD CONSTRAINT hifo_disposal_matches_pkey PRIMARY KEY (match_id);
--
-- Name: hifo_tax_lots hifo_tax_lots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.hifo_tax_lots
    ADD CONSTRAINT hifo_tax_lots_pkey PRIMARY KEY (lot_id);
--
-- Name: idempotent_payout_batches idempotent_payout_batches_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.idempotent_payout_batches
    ADD CONSTRAINT idempotent_payout_batches_idempotency_key_key UNIQUE (idempotency_key);
--
-- Name: idempotent_payout_batches idempotent_payout_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.idempotent_payout_batches
    ADD CONSTRAINT idempotent_payout_batches_pkey PRIMARY KEY (batch_id);
--
-- Name: invite_codes invite_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.invite_codes
    ADD CONSTRAINT invite_codes_pkey PRIMARY KEY (code);
--
-- Name: l1_payout_queue l1_payout_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.l1_payout_queue
    ADD CONSTRAINT l1_payout_queue_pkey PRIMARY KEY (payout_id);
--
-- Name: liquidity_providers liquidity_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.liquidity_providers
    ADD CONSTRAINT liquidity_providers_pkey PRIMARY KEY (lp_id);
--
-- Name: micro_shares micro_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.micro_shares
    ADD CONSTRAINT micro_shares_pkey PRIMARY KEY (share_id);
--
-- Name: network_blocks network_blocks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.network_blocks
    ADD CONSTRAINT network_blocks_pkey PRIMARY KEY (block_hash);
--
-- Name: p2p_orders p2p_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.p2p_orders
    ADD CONSTRAINT p2p_orders_pkey PRIMARY KEY (id);
--
-- Name: pending_transactions pending_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.pending_transactions
    ADD CONSTRAINT pending_transactions_pkey PRIMARY KEY (tx_id);
--
-- Name: rwa_oracle_feeds rwa_oracle_feeds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.rwa_oracle_feeds
    ADD CONSTRAINT rwa_oracle_feeds_pkey PRIMARY KEY (ticker, updated_at);
--
-- Name: security_firewall_blacklist security_firewall_blacklist_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.security_firewall_blacklist
    ADD CONSTRAINT security_firewall_blacklist_pkey PRIMARY KEY (entry_id);
--
-- Name: security_firewall_blacklist security_firewall_blacklist_target_value_key; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.security_firewall_blacklist
    ADD CONSTRAINT security_firewall_blacklist_target_value_key UNIQUE (target_value);
--
-- Name: silo_staking_positions silo_staking_positions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.silo_staking_positions
    ADD CONSTRAINT silo_staking_positions_pkey PRIMARY KEY (stake_id);
--
-- Name: system_treasury_config system_treasury_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.system_treasury_config
    ADD CONSTRAINT system_treasury_config_pkey PRIMARY KEY (config_id);
--
-- Name: tax_ledger_events tax_ledger_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.tax_ledger_events
    ADD CONSTRAINT tax_ledger_events_pkey PRIMARY KEY (event_id);
--
-- Name: token_steering_matrix token_steering_matrix_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.token_steering_matrix
    ADD CONSTRAINT token_steering_matrix_pkey PRIMARY KEY (ticker);
--
-- Name: treasury_airlock_sweeps treasury_airlock_sweeps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.treasury_airlock_sweeps
    ADD CONSTRAINT treasury_airlock_sweeps_pkey PRIMARY KEY (sweep_id);
--
-- Name: user_cold_vault_rules user_cold_vault_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.user_cold_vault_rules
    ADD CONSTRAINT user_cold_vault_rules_pkey PRIMARY KEY (wallet_address, asset_ticker);
--
-- Name: user_command_centers user_command_centers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.user_command_centers
    ADD CONSTRAINT user_command_centers_pkey PRIMARY KEY (wallet_address);
--
-- Name: user_treasury_preferences user_treasury_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.user_treasury_preferences
    ADD CONSTRAINT user_treasury_preferences_pkey PRIMARY KEY (wallet_address);
--
-- Name: whitelisted_wallets whitelisted_wallets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.whitelisted_wallets
    ADD CONSTRAINT whitelisted_wallets_pkey PRIMARY KEY (wallet_address);
--
-- Name: worker_profiles worker_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.worker_profiles
    ADD CONSTRAINT worker_profiles_pkey PRIMARY KEY (worker_id);
--
-- Name: yield_distributions yield_distributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.yield_distributions
    ADD CONSTRAINT yield_distributions_pkey PRIMARY KEY (distribution_id);
--
-- Name: yield_reservoirs yield_reservoirs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.yield_reservoirs
    ADD CONSTRAINT yield_reservoirs_pkey PRIMARY KEY (wallet_address);
--
-- Name: idx_corp_outflow_category_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_corp_outflow_category_created ON public.corporate_outflow_ledger USING btree (outflow_category, created_at DESC);
--
-- Name: idx_director_audit_created; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_director_audit_created ON public.director_audit_log USING btree (created_at DESC);
--
-- Name: idx_fiat_onramp_wallet; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_fiat_onramp_wallet ON public.fiat_onramp_orders USING btree (wallet_address, created_at DESC);
--
-- Name: idx_fiat_payout_wallet; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_fiat_payout_wallet ON public.fiat_payout_queue USING btree (wallet_address, created_at DESC);
--
-- Name: idx_forge_vesting_ticker; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_forge_vesting_ticker ON public.forge_vesting_schedules USING btree (token_ticker, status);
--
-- Name: idx_hifo_disposals_wallet; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_hifo_disposals_wallet ON public.hifo_disposal_matches USING btree (wallet_address, disposed_at DESC);
--
-- Name: idx_hifo_lots_wallet_asset; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_hifo_lots_wallet_asset ON public.hifo_tax_lots USING btree (wallet_address, asset_ticker, status, fmv_usd_per_token DESC);
--
-- Name: idx_idempotent_payout_state; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_idempotent_payout_state ON public.idempotent_payout_batches USING btree (state, updated_at);
--
-- Name: idx_idempotent_payout_txid; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_idempotent_payout_txid ON public.idempotent_payout_batches USING btree (deterministic_txid);
--
-- Name: idx_l1_payout_wallet; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_l1_payout_wallet ON public.l1_payout_queue USING btree (wallet_address, created_at DESC);
--
-- Name: idx_lp_wallet_pair; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_lp_wallet_pair ON public.liquidity_providers USING btree (wallet_address, pool_pair);
--
-- Name: idx_lp_wallet_pool; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_lp_wallet_pool ON public.liquidity_providers USING btree (wallet_address, pool_pair);
--
-- Name: idx_micro_shares_recorded_brin; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_micro_shares_recorded_brin ON public.micro_shares USING brin (recorded_at) WITH (pages_per_range='128');
--
-- Name: idx_micro_shares_settlement; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_micro_shares_settlement ON public.micro_shares USING btree (is_settled);
--
-- Name: idx_micro_shares_worker; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_micro_shares_worker ON public.micro_shares USING btree (worker_id);
--
-- Name: idx_network_blocks_time; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_network_blocks_time ON public.network_blocks USING btree (discovered_at DESC);
--
-- Name: idx_network_blocks_worker; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_network_blocks_worker ON public.network_blocks USING btree (worker_id);
--
-- Name: idx_p2p_orders_order_id_uniq; Type: INDEX; Schema: public; Owner: -
--
CREATE UNIQUE INDEX idx_p2p_orders_order_id_uniq ON public.p2p_orders USING btree (order_id);
--
-- Name: idx_pending_txs_status; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_pending_txs_status ON public.pending_transactions USING btree (status);
--
-- Name: idx_rwa_oracle_feeds_ticker_unique; Type: INDEX; Schema: public; Owner: -
--
CREATE UNIQUE INDEX idx_rwa_oracle_feeds_ticker_unique ON public.rwa_oracle_feeds USING btree (ticker);
--
-- Name: idx_rwa_oracle_ticker_time; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_rwa_oracle_ticker_time ON public.rwa_oracle_feeds USING btree (ticker, updated_at DESC);
--
-- Name: idx_rwa_oracle_ticker_updated; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_rwa_oracle_ticker_updated ON public.rwa_oracle_feeds USING btree (ticker, updated_at DESC);
--
-- Name: idx_security_firewall_active; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_security_firewall_active ON public.security_firewall_blacklist USING btree (active, entity_type);
--
-- Name: idx_silo_staking_wallet; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_silo_staking_wallet ON public.silo_staking_positions USING btree (wallet_address, status);
--
-- Name: idx_staging_wallet_active; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_staging_wallet_active ON public.epoch_staging_buffers USING btree (wallet_address, is_staged_for_clearing);
--
-- Name: idx_tax_ledger_wallet; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_tax_ledger_wallet ON public.tax_ledger_events USING btree (wallet_address, recorded_at DESC);
--
-- Name: idx_tax_ledger_wallet_recorded; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_tax_ledger_wallet_recorded ON public.tax_ledger_events USING btree (wallet_address, recorded_at DESC);
--
-- Name: idx_user_cold_vault_rules_auto; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_user_cold_vault_rules_auto ON public.user_cold_vault_rules USING btree (auto_sweep_enabled, asset_ticker);
--
-- Name: idx_user_command_centers_updated; Type: INDEX; Schema: public; Owner: -
--
CREATE INDEX idx_user_command_centers_updated ON public.user_command_centers USING btree (last_updated DESC);
--
-- Name: idx_worker_profiles_identity_uniq; Type: INDEX; Schema: public; Owner: -
--
CREATE UNIQUE INDEX idx_worker_profiles_identity_uniq ON public.worker_profiles USING btree (worker_identity);
--
-- Name: uq_staging_active_buffer; Type: INDEX; Schema: public; Owner: -
--
CREATE UNIQUE INDEX uq_staging_active_buffer ON public.epoch_staging_buffers USING btree (wallet_address, target_asset) WHERE (is_staged_for_clearing = false);
--
-- Name: tax_ledger_events tax_ledger_events_epoch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--
ALTER TABLE ONLY public.tax_ledger_events
    ADD CONSTRAINT tax_ledger_events_epoch_id_fkey FOREIGN KEY (epoch_id) REFERENCES public.fba_epoch_clearing_history(epoch_id) ON DELETE SET NULL;
--
-- PostgreSQL database dump complete
--
\unrestrict 8YVUE0WcyxgFhabxGMcToQD5zUOIBRjQGfwuv0MyqeBR9aeUjLUIOmF3HoqH0GF
```

## File: src/chronos/daemons.rs
```rust
use serde_json::Value;
use sqlx::{PgPool, Row};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::sync::broadcast;
use crate::kaspad_client::protowire::UtxosChangedNotificationMessage;
pub async fn start_mempool_watcher_daemon(
    pool: PgPool,
    mut daa_rx: broadcast::Receiver<u64>,
    mut utxo_rx: broadcast::Receiver<UtxosChangedNotificationMessage>,
) {
    tracing::info!("👁️ [CHRONOS WATCHER] DAG DAA Score & UTXO Confirmation Watcher Armed.");
    loop {
        tokio::select! {
            Ok(daa_score) = daa_rx.recv() => {
                let _ = sqlx::query(
                    r#"
                    UPDATE pending_transactions
                    SET status = 'CONFIRMED',
                        block_daa = COALESCE(block_daa, $1)
                    WHERE status = 'PENDING'
                    "#,
                )
                .bind(daa_score as i64)
                .execute(&pool)
                .await;
            }
            Ok(_utxo_msg) = utxo_rx.recv() => {
            }
            else => {
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
    }
}
pub async fn start_utxo_consolidation_daemon(
    mut utxo_rx: broadcast::Receiver<UtxosChangedNotificationMessage>,
) {
    tracing::info!("🧱 [CHRONOS COMPACTOR] Treasury Dust UTXO Compaction Daemon Armed.");
    loop {
        match utxo_rx.recv().await {
            Ok(_msg) => {}
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(broadcast::error::RecvError::Closed) => {
                tokio::time::sleep(Duration::from_secs(10)).await;
            }
        }
    }
}
fn minimum_sweep_quantum_for_asset(ticker: &str) -> f64 {
    match ticker.trim().to_uppercase().as_str() {
        "BTC" => 0.0005,
        "ETH" | "XAU" => 0.005,
        "SOL" => 0.05,
        _ => 1.0,
    }
}
pub async fn start_hot_cold_airlock_daemon(pool: PgPool) {
    tracing::info!(
        "🛡️ [CHRONOS AIRLOCK] Multi-Chain Per-Token Cold Vault & Node Ceiling Sweep Daemon Armed."
    );
    let mut interval = tokio::time::interval(Duration::from_secs(60));
    loop {
        interval.tick().await;
        let sys_cfg = crate::chronos::load_system_treasury_config(&pool).await;
        if sys_cfg.outflow_breaker_tripped {
            continue;
        }
        if let Some(hot_addr) = crate::chronos::resolve_hot_dispatcher_address() {
            let cold_kas_dest = sys_cfg.cold_kas_address.trim().to_lowercase();
            if !cold_kas_dest.is_empty()
                && cold_kas_dest.starts_with("kaspa:")
                && hot_addr.to_lowercase() != cold_kas_dest
                && sys_cfg.hot_ceiling_kas > 0.0
            {
                if let Ok(hot_sompi) =
                    crate::kaspad_client::get_balance_by_address_grpc(&hot_addr).await
                {
                    let hot_kas = (hot_sompi as f64) / 100_000_000.0;
                    if hot_kas > sys_cfg.hot_ceiling_kas + 10.0 {
                        let sweep_kas = (hot_kas - sys_cfg.hot_ceiling_kas).max(0.0);
                        let sweep_sompi = (sweep_kas * 100_000_000.0).round() as u64;
                        let minute_bucket = SystemTime::now()
                            .duration_since(UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_secs()
                            / 60;
                        let idemp_key = format!(
                            "NODE-HOT-OVERFLOW-{}-{}",
                            minute_bucket, sweep_sompi
                        );
                        if let Ok(tx_id) = crate::state_api::sign_and_broadcast_kaspa_payout_batch(
                            &pool,
                            &idemp_key,
                            &[(cold_kas_dest.clone(), sweep_sompi)],
                            "",
                        )
                        .await
                        {
                            let _ = sqlx::query(
                                r#"
                                INSERT INTO treasury_airlock_sweeps (
                                    hot_wallet_address, cold_vault_address, swept_kas,
                                    hot_balance_before_kas, hot_balance_after_kas, tx_id, status
                                ) VALUES ($1, $2, $3, $4, $5, $6, 'NODE_CEILING_SWEPT_TO_COLD')
                                "#,
                            )
                            .bind(&hot_addr)
                            .bind(&cold_kas_dest)
                            .bind(sweep_kas)
                            .bind(hot_kas)
                            .bind(hot_kas - sweep_kas)
                            .bind(&tx_id)
                            .execute(&pool)
                            .await;
                        }
                    }
                }
            }
        }
        let rule_rows = sqlx::query(
            r#"
            SELECT r.wallet_address, r.asset_ticker, r.network,
                   r.cold_destination_address, r.overflow_ceiling,
                   y.streaming_balance_kas,
                   COALESCE(y.lp_tokens, '{}'::jsonb) AS lp_tokens
            FROM user_cold_vault_rules r
            JOIN yield_reservoirs y
              ON (y.wallet_address = r.wallet_address
                  OR REPLACE(LOWER(y.wallet_address), 'kaspa:', '') = REPLACE(LOWER(r.wallet_address), 'kaspa:', ''))
            WHERE r.auto_sweep_enabled = TRUE
              AND COALESCE(y.quarantined, FALSE) = FALSE
            "#,
        )
        .fetch_all(&pool)
        .await
        .unwrap_or_default();
        for row in rule_rows {
            let wallet: String = row.try_get("wallet_address").unwrap_or_default();
            let clean_wallet = wallet
                .trim()
                .to_lowercase()
                .replace("kaspa:", "")
                .trim()
                .to_string();
            let prefixed_wallet = format!("kaspa:{}", clean_wallet);
            let ticker: String = row
                .try_get::<String, _>("asset_ticker")
                .unwrap_or_else(|_| "KAS".to_string())
                .trim()
                .to_uppercase();
            let network: String = row
                .try_get::<String, _>("network")
                .unwrap_or_else(|_| ticker.clone())
                .trim()
                .to_uppercase();
            let cold_addr: String = row
                .try_get::<String, _>("cold_destination_address")
                .unwrap_or_default()
                .trim()
                .to_string();
            let ceiling: f64 = row.try_get("overflow_ceiling").unwrap_or(500.0);
            if cold_addr.is_empty() {
                continue;
            }
            let current_bal = if ticker == "KAS" {
                row.try_get::<f64, _>("streaming_balance_kas").unwrap_or(0.0)
            } else {
                let lp_tokens: Value = row
                    .try_get("lp_tokens")
                    .unwrap_or_else(|_| serde_json::json!({}));
                lp_tokens
                    .get(&ticker)
                    .and_then(|v| {
                        v.as_f64()
                            .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
                    })
                    .unwrap_or(0.0)
            };
            let sweep_amount = (current_bal - ceiling).max(0.0);
            if sweep_amount < minimum_sweep_quantum_for_asset(&ticker) {
                continue;
            }
            let Ok(spot_price) =
                crate::state_api::resolve_strict_spot_price(&pool, &ticker).await
            else {
                tracing::warn!(
                    "⚠️ [CHRONOS AIRLOCK] Skipping auto-sweep for {} ({}): live oracle offline.",
                    prefixed_wallet,
                    ticker
                );
                continue;
            };
            if crate::state_api::debit_user_token_balance(
                &pool,
                &clean_wallet,
                &prefixed_wallet,
                &ticker,
                sweep_amount,
            )
            .await
            .is_err()
            {
                continue;
            }
            match crate::state_api::dispatch_or_queue_l1_payout(
                &pool,
                &prefixed_wallet,
                &cold_addr,
                &ticker,
                Some(&network),
                sweep_amount,
                spot_price,
                "cold_airlock_sweep",
            )
            .await
            {
                Ok(receipt) => {
                    let tx_id = receipt
                        .get("txHash")
                        .and_then(|v| v.as_str())
                        .unwrap_or("");
                    let _ = sqlx::query(
                        r#"
                        UPDATE user_cold_vault_rules
                        SET last_sweep_txid = $3,
                            last_sweep_amount = $4,
                            last_sweep_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE (wallet_address = $1 OR wallet_address = $2)
                          AND asset_ticker = $5
                        "#,
                    )
                    .bind(&prefixed_wallet)
                    .bind(&clean_wallet)
                    .bind(tx_id)
                    .bind(sweep_amount)
                    .bind(&ticker)
                    .execute(&pool)
                    .await;
                    let _ = sqlx::query(
                        r#"
                        INSERT INTO treasury_airlock_sweeps (
                            hot_wallet_address, cold_vault_address, swept_kas,
                            hot_balance_before_kas, hot_balance_after_kas, tx_id, status
                        ) VALUES ($1, $2, $3, $4, $5, $6, 'SWEPT_TO_COLD')
                        "#,
                    )
                    .bind(&prefixed_wallet)
                    .bind(&cold_addr)
                    .bind(sweep_amount)
                    .bind(current_bal)
                    .bind((current_bal - sweep_amount).max(0.0))
                    .bind(tx_id)
                    .execute(&pool)
                    .await;
                }
                Err(e) => {
                    tracing::error!(
                        "❌ [CHRONOS AIRLOCK] Auto-sweep dispatch failed for {} ({}): {}. Re-crediting reservoir.",
                        prefixed_wallet,
                        ticker,
                        e
                    );
                    let _ = crate::state_api::credit_user_token_balance(
                        &pool,
                        &clean_wallet,
                        &prefixed_wallet,
                        &ticker,
                        sweep_amount,
                        false,
                    )
                    .await;
                }
            }
        }
    }
}
pub async fn start_idempotent_payout_recovery_daemon(pool: PgPool) {
    tracing::info!("♻️ [CHRONOS RECOVERY] Idempotent IN_FLIGHT Payout Batch Recovery Daemon Armed.");
    let mut interval = tokio::time::interval(Duration::from_secs(45));
    loop {
        interval.tick().await;
        let stalled_batches = sqlx::query(
            r#"
            SELECT batch_id, idempotency_key, signed_tx_json, retry_count
            FROM idempotent_payout_batches
            WHERE state IN ('IN_FLIGHT', 'BROADCASTING')
              AND updated_at < CURRENT_TIMESTAMP - INTERVAL '90 seconds'
              AND retry_count < 5
            ORDER BY updated_at ASC
            LIMIT 25
            "#,
        )
        .fetch_all(&pool)
        .await
        .unwrap_or_default();
        for row in stalled_batches {
            let batch_id: String = row.try_get("batch_id").unwrap_or_default();
            let signed_tx_opt: Option<Value> = row.try_get("signed_tx_json").ok().flatten();
            let Some(signed_tx) = signed_tx_opt else {
                let _ = sqlx::query(
                    r#"
                    UPDATE idempotent_payout_batches
                    SET state = 'FAILED_MISSING_PAYLOAD',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE batch_id = $1
                    "#,
                )
                .bind(&batch_id)
                .execute(&pool)
                .await;
                continue;
            };
            match crate::kaspad_client::submit_transaction_grpc(&signed_tx, false).await {
                Ok(txid) => {
                    let _ = sqlx::query(
                        r#"
                        UPDATE idempotent_payout_batches
                        SET deterministic_txid = $2,
                            state = 'CONFIRMED',
                            updated_at = CURRENT_TIMESTAMP
                        WHERE batch_id = $1
                        "#,
                    )
                    .bind(&batch_id)
                    .bind(&txid)
                    .execute(&pool)
                    .await;
                }
                Err(err_msg) => {
                    let lower = err_msg.to_lowercase();
                    if lower.contains("already")
                        || lower.contains("duplicate")
                        || lower.contains("spent")
                    {
                        let _ = sqlx::query(
                            r#"
                            UPDATE idempotent_payout_batches
                            SET state = 'CONFIRMED',
                                updated_at = CURRENT_TIMESTAMP
                            WHERE batch_id = $1
                            "#,
                        )
                        .bind(&batch_id)
                        .execute(&pool)
                        .await;
                    } else {
                        let _ = sqlx::query(
                            r#"
                            UPDATE idempotent_payout_batches
                            SET retry_count = retry_count + 1,
                                last_error = $2,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE batch_id = $1
                            "#,
                        )
                        .bind(&batch_id)
                        .bind(&err_msg)
                        .execute(&pool)
                        .await;
                    }
                }
            }
        }
    }
}
```

## File: src/chronos/forge_bell.rs
```rust
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
pub async fn execute_2200_utc_forge_bell_settlement(pool: &PgPool) -> anyhow::Result<Value> {
    let vesting_updated = sqlx::query(
        r#"
        UPDATE forge_vesting_schedules
        SET unlocked_amount = LEAST(
                total_allocated,
                unlocked_amount + GREATEST(0.0, daily_unlock_rate)
            ),
            status = CASE
                WHEN unlocked_amount + GREATEST(0.0, daily_unlock_rate) >= total_allocated THEN 'UNLOCKED'
                ELSE 'VESTING'
            END,
            last_bell_unlocked_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE status != 'UNLOCKED'
          AND CURRENT_TIMESTAMP >= cliff_unlock_at
        "#,
    )
    .execute(pool)
    .await?
    .rows_affected();
    let policy_updated = sqlx::query(
        r#"
        UPDATE forge_monetary_policies
        SET reserve_emitted_tokens = LEAST(
                reserve_locked_tokens,
                reserve_emitted_tokens + GREATEST(0.0, daily_emission_rate)
            ),
            total_burned_tokens = total_burned_tokens + (GREATEST(0.0, daily_emission_rate) * (burn_rate_bps::float8 / 10000.0)),
            last_bell_processed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .execute(pool)
    .await?
    .rows_affected();
    let vault_rows = sqlx::query(
        r#"
        SELECT vault_id::text AS vault_id, token_ticker, remaining_vault_tokens, daily_emission_tokens
        FROM forge_mineable_vaults
        WHERE status = 'ACTIVE' AND remaining_vault_tokens > 0
        "#,
    )
    .fetch_all(pool)
    .await?;
    let worker_rows = sqlx::query(
        r#"
        SELECT wallet_address, SUM(GREATEST(0.0, hashrate_ths)) AS total_ths
        FROM worker_profiles
        WHERE status = 'online' AND wallet_address != ''
        GROUP BY wallet_address
        "#,
    )
    .fetch_all(pool)
    .await?;
    let total_pool_ths: f64 = worker_rows
        .iter()
        .map(|w| w.try_get::<f64, _>("total_ths").unwrap_or(0.0))
        .sum();
    let mut vaults_distributed = 0usize;
    for v in vault_rows {
        let vault_id: String = v.try_get("vault_id").unwrap_or_default();
        let ticker: String = v.try_get("token_ticker").unwrap_or_else(|_| "SILO".to_string());
        let rem: f64 = v.try_get("remaining_vault_tokens").unwrap_or(0.0);
        let daily: f64 = v.try_get("daily_emission_tokens").unwrap_or(0.0);
        let emit_today = rem.min(daily).max(0.0);
        if emit_today <= 0.0 {
            continue;
        }
        if total_pool_ths > 0.0 {
            for w in &worker_rows {
                let miner_wallet: String = w.try_get("wallet_address").unwrap_or_default();
                let miner_ths: f64 = w.try_get("total_ths").unwrap_or(0.0);
                let share = (miner_ths / total_pool_ths) * emit_today;
                if share > 0.0 {
                    let _ = sqlx::query(
                        r#"
                        INSERT INTO yield_reservoirs (wallet_address, lp_tokens)
                        VALUES ($1, jsonb_build_object($2::text, $3::float8))
                        ON CONFLICT (wallet_address) DO UPDATE SET
                            lp_tokens = jsonb_set(
                                COALESCE(yield_reservoirs.lp_tokens, '{}'::jsonb),
                                ARRAY[$2::text],
                                to_jsonb(COALESCE((yield_reservoirs.lp_tokens->>$2)::float8, 0.0) + $3::float8),
                                true
                            ),
                            last_updated = CURRENT_TIMESTAMP
                        "#,
                    )
                    .bind(&miner_wallet)
                    .bind(&ticker)
                    .bind(share)
                    .execute(pool)
                    .await;
                }
            }
        }
        let _ = sqlx::query(
            r#"
            UPDATE forge_mineable_vaults
            SET remaining_vault_tokens = GREATEST(0.0, remaining_vault_tokens - $2),
                distributed_tokens = distributed_tokens + $2,
                last_bell_distributed_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE vault_id::text = $1
            "#,
        )
        .bind(&vault_id)
        .bind(emit_today)
        .execute(pool)
        .await;
        vaults_distributed += 1;
    }
    Ok(json!({
        "vestingTranchesUnlocked": vesting_updated,
        "monetaryPoliciesProcessed": policy_updated,
        "mineableVaultsDistributed": vaults_distributed
    }))
}
```

## File: src/job_manager/mod.rs
```rust
// src/job_manager/mod.rs
use std::sync::{Arc, RwLock};
use tokio::sync::broadcast;
use tokio::sync::mpsc;
use bytes::Bytes;
use crate::kaspad_client::protowire::RpcBlock;
use serde_json::json;
use dashmap::{DashMap, DashSet};
use kaspa_hashes::Hash;
use kaspa_consensus_core::header::Header;
use kaspa_math::Uint192; 
use std::str::FromStr;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Instant, Duration};
use std::fmt::Write;
static JOB_COUNTER: AtomicU64 = AtomicU64::new(1);
#[allow(dead_code)]
#[derive(Clone, Debug)]
pub struct StratumJob {
    pub job_id: String,
    pub payload: Arc<Bytes>,
}
#[derive(Clone, Debug)]
pub struct ActiveJob {
    pub header: Header,
    pub block: RpcBlock,
    pub network_diff: f64,
    pub reward_sompi: u64,
}
#[derive(Clone, Debug)]
pub struct PendingBlockSubmission {
    pub block: RpcBlock,
    pub block_hash: String,
    pub worker: String,
    pub nonce: u64,
    pub network_diff: f64,
    pub reward_sompi: u64,
}
/// Computes the exact Kaspa consensus difficulty from the block header's compact `bits` field
/// matching kaspad's `get_difficulty_ratio` against maximum target `0x207fffff`.
pub fn difficulty_from_bits(bits: u32) -> f64 {
    let exponent = (bits >> 24) as i32;
    let mantissa = (bits & 0x00ff_ffff) as f64;
    if mantissa <= 0.0 {
        return 0.0;
    }
    (0x007f_ffff as f64 / mantissa) * 2.0_f64.powi(8 * (0x20 - exponent))
}
/// Extracts the consensus block reward in sompi from a block's coinbase transaction.
/// Uses the exact 8-byte little-endian chromatic subsidy encoded in bytes [8..16] of the
/// Kaspa coinbase payload, or the single-block coinbase output when fees are included.
pub fn extract_coinbase_reward_sompi(block: &RpcBlock) -> u64 {
    if let Some(coinbase_tx) = block.transactions.first() {
        let mut payload_subsidy_sompi = 0u64;
        if !coinbase_tx.payload.is_empty() {
            if let Ok(payload_bytes) = hex::decode(&coinbase_tx.payload) {
                if payload_bytes.len() >= 16 {
                    let mut subsidy_bytes = [0u8; 8];
                    subsidy_bytes.copy_from_slice(&payload_bytes[8..16]);
                    payload_subsidy_sompi = u64::from_le_bytes(subsidy_bytes);
                }
            }
        }
        if coinbase_tx.outputs.len() == 1 {
            let single_output = coinbase_tx.outputs[0].amount;
            if payload_subsidy_sompi > 0 {
                // If the single output represents a single block's subsidy + tx fees (not a multi-block mergeset sum)
                if single_output >= payload_subsidy_sompi && single_output < payload_subsidy_sompi.saturating_mul(2) {
                    return single_output;
                }
                return payload_subsidy_sompi;
            }
            return single_output;
        }
        if payload_subsidy_sompi > 0 {
            return payload_subsidy_sompi;
        }
    }
    0
}
pub struct JobManager {
    pub job_tx: broadcast::Sender<StratumJob>,
    pub active_jobs: DashMap<String, ActiveJob>,
    pub submitted_nonces: DashMap<String, DashSet<u64>>,
    pub submitted_blocks: DashMap<String, Instant>,
    pub block_submit_tx: mpsc::Sender<PendingBlockSubmission>,
    pub job_timestamps: DashMap<String, Instant>,
    pub cached_job: RwLock<Option<Arc<Bytes>>>,
    pub latest_network_diff_bits: AtomicU64,
    pub latest_reward_sompi: AtomicU64,
}
impl JobManager {
    pub fn new() -> (Arc<Self>, broadcast::Receiver<StratumJob>, mpsc::Receiver<PendingBlockSubmission>) {
        let (job_tx, job_rx) = broadcast::channel(1024);
        let (block_submit_tx, block_submit_rx) = mpsc::channel(100);
        let manager = Arc::new(Self { 
            job_tx,
            active_jobs: DashMap::new(),
            submitted_nonces: DashMap::new(),
            submitted_blocks: DashMap::new(),
            job_timestamps: DashMap::new(),
            block_submit_tx,
            cached_job: RwLock::new(None),
            latest_network_diff_bits: AtomicU64::new(0.0_f64.to_bits()),
            latest_reward_sompi: AtomicU64::new(0),
        });
        let gc_manager = manager.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(Duration::from_secs(15));
            loop {
                interval.tick().await;
                let now = Instant::now();
                let mut stale_keys = Vec::new();
                for entry in gc_manager.job_timestamps.iter() {
                    if now.duration_since(*entry.value()) > Duration::from_secs(300) {
                        stale_keys.push(entry.key().clone());
                    }
                }
                let active_count = gc_manager.active_jobs.len();
                if stale_keys.len() >= active_count && active_count > 0 {
                    stale_keys.sort_by_key(|k| gc_manager.job_timestamps.get(k).map(|v| *v).unwrap_or(now));
                    stale_keys.pop(); 
                }
                for key in stale_keys {
                    gc_manager.active_jobs.remove(&key);
                    gc_manager.submitted_nonces.remove(&key);
                    gc_manager.job_timestamps.remove(&key);
                }
                let mut stale_blocks = Vec::new();
                for entry in gc_manager.submitted_blocks.iter() {
                    if now.duration_since(*entry.value()) > Duration::from_secs(600) {
                        stale_blocks.push(entry.key().clone());
                    }
                }
                for bh in stale_blocks {
                    gc_manager.submitted_blocks.remove(&bh);
                }
            }
        });
        (manager, job_rx, block_submit_rx)
    }
    pub fn update_latest_network_diff(&self, diff: f64) {
        if diff > 0.0 {
            self.latest_network_diff_bits.store(diff.to_bits(), Ordering::Relaxed);
        }
    }
    pub fn get_latest_network_diff(&self) -> f64 {
        f64::from_bits(self.latest_network_diff_bits.load(Ordering::Relaxed))
    }
    pub fn update_latest_reward_sompi(&self, reward_sompi: u64) {
        if reward_sompi > 0 {
            self.latest_reward_sompi.store(reward_sompi, Ordering::Relaxed);
        }
    }
    pub fn get_latest_reward_sompi(&self) -> u64 {
        self.latest_reward_sompi.load(Ordering::Relaxed)
    }
    /// Atomically records a `(job_id, nonce)` submission. Returns `true` if the submission is new,
    /// or `false` if this exact `(job_id, nonce)` was already processed.
    pub fn register_submission(&self, job_id: &str, nonce: u64) -> bool {
        let set = self.submitted_nonces.entry(job_id.to_string()).or_insert_with(DashSet::new);
        set.insert(nonce)
    }
    /// Atomically records a candidate `block_hash`. Returns `true` if this block hash has not yet
    /// been submitted to the node.
    pub fn register_block_hash(&self, block_hash: &str) -> bool {
        if self.submitted_blocks.contains_key(block_hash) {
            return false;
        }
        self.submitted_blocks.insert(block_hash.to_string(), Instant::now()).is_none()
    }
    pub fn process_new_block(&self, block: RpcBlock) -> (f64, u64) {
        if let Some(rpc_header) = &block.header {
            let unique_id = JOB_COUNTER.fetch_add(1, Ordering::SeqCst);
            // Strictly numerical job ID to prevent IceRiver parser panics
            let job_id = format!("{:04}", unique_id % 10000); 
            let hash_merkle_root = Hash::from_str(&rpc_header.hash_merkle_root).expect("Invalid hash_merkle_root");
            let accepted_id_merkle_root = Hash::from_str(&rpc_header.accepted_id_merkle_root).expect("Invalid accepted_id_merkle_root");
            let utxo_commitment = Hash::from_str(&rpc_header.utxo_commitment).expect("Invalid utxo_commitment");
            let pruning_point = Hash::from_str(&rpc_header.pruning_point).expect("Invalid pruning_point");
            let blue_work = Uint192::from_hex(&rpc_header.blue_work).expect("Invalid blue_work string");
            let mut parents_by_level = vec![];
            for level in &rpc_header.parents {
                let level_hashes: Vec<Hash> = level.parent_hashes.iter()
                    .map(|h| Hash::from_str(h).expect("Invalid parent hash from node"))
                    .collect();
                parents_by_level.push(level_hashes);
            }
            let consensus_header = Header::new_finalized(
                rpc_header.version as u16,
                parents_by_level.try_into().expect("DAG Parent Compression Failed"),
                hash_merkle_root,
                accepted_id_merkle_root,
                utxo_commitment,
                rpc_header.timestamp as u64,
                rpc_header.bits,
                rpc_header.nonce,
                rpc_header.daa_score,
                blue_work,                
                rpc_header.blue_score,   
                pruning_point,
            );
            // Resolve per-block Kaspa network difficulty from template verbose_data or header.bits
            let template_diff = block
                .verbose_data
                .as_ref()
                .map(|v| v.difficulty)
                .filter(|&d| d > 0.0)
                .unwrap_or_else(|| difficulty_from_bits(rpc_header.bits));
            let network_diff = if template_diff > 0.0 {
                self.update_latest_network_diff(template_diff);
                template_diff
            } else {
                self.get_latest_network_diff()
            };
            let coinbase_reward_sompi = extract_coinbase_reward_sompi(&block);
            let reward_sompi = if self.get_latest_reward_sompi() > 0 {
                self.get_latest_reward_sompi()
            } else {
                coinbase_reward_sompi
            };
            // Reset nonce deduplication set for this recycled job_id slot before inserting the new job
            self.submitted_nonces.insert(job_id.clone(), DashSet::new());
            self.active_jobs.insert(
                job_id.clone(),
                ActiveJob {
                    header: consensus_header.clone(),
                    block: block.clone(),
                    network_diff,
                    reward_sompi,
                },
            );
            self.job_timestamps.insert(job_id.clone(), Instant::now()); 
            let pre_pow_hash = kaspa_consensus_core::hashing::header::hash_override_nonce_time(
                &consensus_header, 
                0, 
                0
            );
            let hb = pre_pow_hash.as_bytes();
            let mut large_job_param = String::with_capacity(80);
            for b in hb {
                write!(&mut large_job_param, "{:02x}", b).unwrap();
            }
            let ts = rpc_header.timestamp as u64;
            let ts_bytes = ts.to_le_bytes();
            for b in &ts_bytes {
                write!(&mut large_job_param, "{:02x}", b).unwrap();
            }
            let notify_payload = json!({
                "id": null,
                "method": "mining.notify",
                "params": [
                    job_id,
                    large_job_param,
                    true // Required flag for IceRiver ASICs
                ]
            });
            let mut json_payload = notify_payload.to_string();
            json_payload.push('\n');
            let bytes_payload = Arc::new(Bytes::from(json_payload));
            if let Ok(mut cache) = self.cached_job.write() {
                *cache = Some(Arc::clone(&bytes_payload));
            }
            let stratum_job = StratumJob {
                job_id: job_id.clone(),
                payload: bytes_payload,
            };
            let _ = self.job_tx.send(stratum_job);
            return (network_diff, coinbase_reward_sompi);
        }
        (self.get_latest_network_diff(), self.get_latest_reward_sompi())
    }
}
```

## File: src/config.rs
```rust
// src/config.rs
use serde::Deserialize;
use std::fs;
use anyhow::{Context, Result};
#[allow(dead_code)]
#[derive(Debug, Deserialize, Clone)]
pub struct StratumConfig {
    pub stratum_port: String,
    pub kaspad_addresses: Vec<String>,
    pub mining_address: String,
    pub starting_diff: f64,
    pub min_share_diff: f64,
    pub var_diff: bool,
    pub shares_per_min: u32,
    pub extranonce_size: usize,
    pub prom_port: String,
    pub print_stats: bool,
}
impl StratumConfig {
    pub fn load(path: &str) -> Result<Self> {
        let content = fs::read_to_string(path)
            .with_context(|| format!("Failed to read config file at {}", path))?;
        let config: StratumConfig = serde_yaml::from_str(&content)
            .context("Failed to parse YAML configuration")?;
        if config.extranonce_size != 2 {
            anyhow::bail!("FATAL ARCHITECTURE RULE: extranonce_size MUST be exactly 2.");
        }
        Ok(config)
    }
}
```

## File: src/forge_queries.rs
```rust
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use crate::state_api::{compile_silverscript_proof_of_lock_vault, KASPA_ADDR_VERSION_P2PK_SCHNORR};
pub async fn query_forge_tokenomics_bundle(
    pool: &PgPool,
    ticker_opt: Option<&str>,
    include_all_vaults: bool,
) -> Result<Value, String> {
    let clean_ticker = ticker_opt
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "SILO".to_string());
    let policy_row = sqlx::query(
        r#"
        SELECT token_ticker, creator_address, max_supply, burn_rate_bps,
               burn_address, total_burned_tokens, emission_schedule_type,
               daily_emission_rate, halving_interval_days, reserve_locked_tokens,
               reserve_emitted_tokens, zero_rug_lp_pct, zero_rug_lock_days,
               is_retroactive_upgrade, charter_sha256, anchor_tx_hash
        FROM forge_monetary_policies
        WHERE token_ticker = $1
        "#,
    )
    .bind(&clean_ticker)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Policy query failed: {}", e))?;
    let policy_json = if let Some(r) = policy_row {
        json!({
            "tokenTicker": r.try_get::<String, _>("token_ticker").unwrap_or_default(),
            "creatorAddress": r.try_get::<String, _>("creator_address").unwrap_or_default(),
            "maxSupply": r.try_get::<f64, _>("max_supply").unwrap_or(21_000_000.0),
            "burnRateBps": r.try_get::<i32, _>("burn_rate_bps").unwrap_or(100),
            "burnAddress": r.try_get::<String, _>("burn_address").unwrap_or_default(),
            "totalBurnedTokens": r.try_get::<f64, _>("total_burned_tokens").unwrap_or(0.0),
            "emissionScheduleType": r.try_get::<String, _>("emission_schedule_type").unwrap_or_else(|_| "CHROMATIC_HALVING".to_string()),
            "dailyEmissionRate": r.try_get::<f64, _>("daily_emission_rate").unwrap_or(0.0),
            "halvingIntervalDays": r.try_get::<i32, _>("halving_interval_days").unwrap_or(365),
            "reserveLockedTokens": r.try_get::<f64, _>("reserve_locked_tokens").unwrap_or(0.0),
            "reserveEmittedTokens": r.try_get::<f64, _>("reserve_emitted_tokens").unwrap_or(0.0),
            "zeroRugLpPct": r.try_get::<f64, _>("zero_rug_lp_pct").unwrap_or(50.0),
            "zeroRugLockDays": r.try_get::<i32, _>("zero_rug_lock_days").unwrap_or(365),
            "isRetroactiveUpgrade": r.try_get::<bool, _>("is_retroactive_upgrade").unwrap_or(false),
            "charterSha256": r.try_get::<String, _>("charter_sha256").unwrap_or_default(),
            "anchorTxHash": r.try_get::<Option<String>, _>("anchor_tx_hash").ok().flatten()
        })
    } else {
        Value::Null
    };
    let vault_row = sqlx::query(
        r#"
        SELECT vault_id::text AS vault_id, token_ticker, creator_address, vault_label,
               total_funded_tokens, remaining_vault_tokens, daily_emission_tokens,
               distributed_tokens, min_hashrate_ths, syndicate_sector_enabled,
               active_miners_count, status, funding_tx_hash
        FROM forge_mineable_vaults
        WHERE token_ticker = $1
        "#,
    )
    .bind(&clean_ticker)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Mineable vault query failed: {}", e))?;
    let mineable_vault_json = if let Some(v) = vault_row {
        json!({
            "vaultId": v.try_get::<String, _>("vault_id").unwrap_or_default(),
            "tokenTicker": v.try_get::<String, _>("token_ticker").unwrap_or_default(),
            "creatorAddress": v.try_get::<String, _>("creator_address").unwrap_or_default(),
            "vaultLabel": v.try_get::<String, _>("vault_label").unwrap_or_default(),
            "totalFundedTokens": v.try_get::<f64, _>("total_funded_tokens").unwrap_or(0.0),
            "remainingVaultTokens": v.try_get::<f64, _>("remaining_vault_tokens").unwrap_or(0.0),
            "dailyEmissionTokens": v.try_get::<f64, _>("daily_emission_tokens").unwrap_or(0.0),
            "distributedTokens": v.try_get::<f64, _>("distributed_tokens").unwrap_or(0.0),
            "minHashrateThs": v.try_get::<f64, _>("min_hashrate_ths").unwrap_or(0.1),
            "syndicateSectorEnabled": v.try_get::<bool, _>("syndicate_sector_enabled").unwrap_or(true),
            "activeMinersCount": v.try_get::<i32, _>("active_miners_count").unwrap_or(1),
            "status": v.try_get::<String, _>("status").unwrap_or_else(|_| "ACTIVE".to_string()),
            "fundingTxHash": v.try_get::<Option<String>, _>("funding_tx_hash").ok().flatten()
        })
    } else {
        Value::Null
    };
    let vesting_rows = sqlx::query(
        r#"
        SELECT vesting_id::text AS vesting_id, token_ticker, beneficiary_address,
               creator_address, label, total_allocated, unlocked_amount,
               claimed_amount, cliff_days, linear_days, daily_unlock_rate,
               covenant_rule, vprog_state_root, lock_tx_hash, status
        FROM forge_vesting_schedules
        WHERE token_ticker = $1
        ORDER BY created_at ASC
        "#,
    )
    .bind(&clean_ticker)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Vesting query failed: {}", e))?;
    let vesting_schedules: Vec<Value> = vesting_rows
        .into_iter()
        .map(|row| {
            let ben_addr = row
                .try_get::<String, _>("beneficiary_address")
                .unwrap_or_default();
            let total_alloc = row.try_get::<f64, _>("total_allocated").unwrap_or(0.0);
            let cliff_d = row.try_get::<i32, _>("cliff_days").unwrap_or(0) as i64;
            let linear_d = row.try_get::<i32, _>("linear_days").unwrap_or(365) as i64;
            let label = row
                .try_get::<String, _>("label")
                .unwrap_or_else(|_| "Genesis Tranche".to_string());
            let compiled = compile_silverscript_proof_of_lock_vault(
                &clean_ticker,
                "KRC-20",
                &label,
                &ben_addr,
                total_alloc,
                cliff_d,
                linear_d,
                None,
            );
            json!({
                "vestingId": row.try_get::<String, _>("vesting_id").unwrap_or_default(),
                "tokenTicker": row.try_get::<String, _>("token_ticker").unwrap_or_default(),
                "beneficiaryAddress": ben_addr,
                "creatorAddress": row.try_get::<String, _>("creator_address").unwrap_or_default(),
                "label": label,
                "totalAllocated": total_alloc,
                "unlockedAmount": row.try_get::<f64, _>("unlocked_amount").unwrap_or(0.0),
                "claimedAmount": row.try_get::<f64, _>("claimed_amount").unwrap_or(0.0),
                "cliffDays": cliff_d,
                "linearDays": linear_d,
                "dailyUnlockRate": row.try_get::<f64, _>("daily_unlock_rate").unwrap_or(0.0),
                "covenantRule": row.try_get::<String, _>("covenant_rule").unwrap_or_default(),
                "vprogStateRoot": row.try_get::<String, _>("vprog_state_root").unwrap_or(compiled.kcc20_state.state_root_hex),
                "covenantAddress": compiled.covenant_address,
                "silverscriptSource": compiled.silverscript_source,
                "redeemScriptHex": compiled.redeem_script_hex,
                "lockTxHash": row.try_get::<Option<String>, _>("lock_tx_hash").ok().flatten(),
                "status": row.try_get::<String, _>("status").unwrap_or_else(|_| "LOCKED".to_string())
            })
        })
        .collect();
    let mut all_mineable_vaults = Vec::new();
    if include_all_vaults {
        if let Ok(rows) = sqlx::query(
            r#"
            SELECT vault_id::text AS vault_id, token_ticker, vault_label,
                   total_funded_tokens, remaining_vault_tokens, daily_emission_tokens,
                   distributed_tokens, min_hashrate_ths, syndicate_sector_enabled,
                   active_miners_count, status
            FROM forge_mineable_vaults
            WHERE status = 'ACTIVE'
            ORDER BY created_at ASC
            "#,
        )
        .fetch_all(pool)
        .await
        {
            for v in rows {
                all_mineable_vaults.push(json!({
                    "vaultId": v.try_get::<String, _>("vault_id").unwrap_or_default(),
                    "tokenTicker": v.try_get::<String, _>("token_ticker").unwrap_or_default(),
                    "vaultLabel": v.try_get::<String, _>("vault_label").unwrap_or_default(),
                    "totalFundedTokens": v.try_get::<f64, _>("total_funded_tokens").unwrap_or(0.0),
                    "remainingVaultTokens": v.try_get::<f64, _>("remaining_vault_tokens").unwrap_or(0.0),
                    "dailyEmissionTokens": v.try_get::<f64, _>("daily_emission_tokens").unwrap_or(0.0),
                    "distributedTokens": v.try_get::<f64, _>("distributed_tokens").unwrap_or(0.0),
                    "minHashrateThs": v.try_get::<f64, _>("min_hashrate_ths").unwrap_or(0.1),
                    "syndicateSectorEnabled": v.try_get::<bool, _>("syndicate_sector_enabled").unwrap_or(true),
                    "activeMinersCount": v.try_get::<i32, _>("active_miners_count").unwrap_or(1),
                    "status": v.try_get::<String, _>("status").unwrap_or_else(|_| "ACTIVE".to_string())
                }));
            }
        }
    }
    let _ = KASPA_ADDR_VERSION_P2PK_SCHNORR;
    Ok(json!({
        "ticker": clean_ticker,
        "monetaryPolicy": policy_json,
        "mineableVault": mineable_vault_json,
        "vestingSchedules": vesting_schedules,
        "allMineableVaults": all_mineable_vaults
    }))
}
pub async fn deploy_forge_tokenomics_bundle(
    pool: &PgPool,
    creator_wallet: &str,
    payload: &Value,
) -> Result<Value, String> {
    let ticker = payload
        .get("ticker")
        .and_then(|v| v.as_str())
        .unwrap_or("SILO")
        .trim()
        .to_uppercase();
    let max_supply = payload
        .get("maxSupply")
        .and_then(|v| v.as_f64())
        .unwrap_or(21_000_000.0);
    let burn_rate_bps = payload
        .get("burnRateBps")
        .and_then(|v| v.as_i64())
        .unwrap_or(100) as i32;
    let emission_schedule_type = payload
        .get("emissionScheduleType")
        .and_then(|v| v.as_str())
        .unwrap_or("CHROMATIC_HALVING");
    let daily_emission_rate = payload
        .get("dailyEmissionRate")
        .and_then(|v| v.as_f64())
        .unwrap_or(13_698.0);
    let halving_interval_days = payload
        .get("halvingIntervalDays")
        .and_then(|v| v.as_i64())
        .unwrap_or(365) as i32;
    let reserve_locked_tokens = payload
        .get("reserveLockedTokens")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    let zero_rug_lp_pct = payload
        .get("zeroRugLpPct")
        .and_then(|v| v.as_f64())
        .unwrap_or(50.0);
    let zero_rug_lock_days = payload
        .get("zeroRugLockDays")
        .and_then(|v| v.as_i64())
        .unwrap_or(365) as i32;
    let is_retroactive = payload
        .get("isRetroactiveUpgrade")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    let charter_sha256 = payload
        .get("charterSha256")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let anchor_tx_hash = payload.get("anchorTxHash").and_then(|v| v.as_str());
    sqlx::query(
        r#"
        INSERT INTO forge_monetary_policies (
            token_ticker, creator_address, max_supply, burn_rate_bps,
            emission_schedule_type, daily_emission_rate, halving_interval_days,
            reserve_locked_tokens, zero_rug_lp_pct, zero_rug_lock_days,
            is_retroactive_upgrade, charter_sha256, anchor_tx_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (token_ticker) DO UPDATE SET
            max_supply = EXCLUDED.max_supply,
            burn_rate_bps = EXCLUDED.burn_rate_bps,
            emission_schedule_type = EXCLUDED.emission_schedule_type,
            daily_emission_rate = EXCLUDED.daily_emission_rate,
            halving_interval_days = EXCLUDED.halving_interval_days,
            reserve_locked_tokens = EXCLUDED.reserve_locked_tokens,
            zero_rug_lp_pct = EXCLUDED.zero_rug_lp_pct,
            zero_rug_lock_days = EXCLUDED.zero_rug_lock_days,
            is_retroactive_upgrade = EXCLUDED.is_retroactive_upgrade,
            charter_sha256 = EXCLUDED.charter_sha256,
            anchor_tx_hash = COALESCE(EXCLUDED.anchor_tx_hash, forge_monetary_policies.anchor_tx_hash),
            updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(&ticker)
    .bind(creator_wallet)
    .bind(max_supply)
    .bind(burn_rate_bps)
    .bind(emission_schedule_type)
    .bind(daily_emission_rate)
    .bind(halving_interval_days)
    .bind(reserve_locked_tokens)
    .bind(zero_rug_lp_pct)
    .bind(zero_rug_lock_days)
    .bind(is_retroactive)
    .bind(charter_sha256)
    .bind(anchor_tx_hash)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to upsert forge_monetary_policies: {}", e))?;
    if let Some(vault_obj) = payload.get("mineableVault").and_then(|v| v.as_object()) {
        let total_funded = vault_obj
            .get("totalFundedTokens")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        if total_funded > 0.0 {
            let daily_emit = vault_obj
                .get("dailyEmissionTokens")
                .and_then(|v| v.as_f64())
                .unwrap_or(1000.0);
            let vault_label = vault_obj
                .get("vaultLabel")
                .and_then(|v| v.as_str())
                .unwrap_or("Proof-of-Hashrate Mining Vault");
            let min_hash = vault_obj
                .get("minHashrateThs")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.1);
            let syndicate_enabled = vault_obj
                .get("syndicateSectorEnabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let _ = sqlx::query(
                r#"
                INSERT INTO forge_mineable_vaults (
                    token_ticker, creator_address, vault_label, total_funded_tokens,
                    remaining_vault_tokens, daily_emission_tokens, min_hashrate_ths,
                    syndicate_sector_enabled, funding_tx_hash
                ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8)
                ON CONFLICT (token_ticker) DO UPDATE SET
                    vault_label = EXCLUDED.vault_label,
                    total_funded_tokens = EXCLUDED.total_funded_tokens,
                    remaining_vault_tokens = EXCLUDED.remaining_vault_tokens,
                    daily_emission_tokens = EXCLUDED.daily_emission_tokens,
                    min_hashrate_ths = EXCLUDED.min_hashrate_ths,
                    syndicate_sector_enabled = EXCLUDED.syndicate_sector_enabled,
                    updated_at = CURRENT_TIMESTAMP
                "#,
            )
            .bind(&ticker)
            .bind(creator_wallet)
            .bind(vault_label)
            .bind(total_funded)
            .bind(daily_emit)
            .bind(min_hash)
            .bind(syndicate_enabled)
            .bind(anchor_tx_hash)
            .execute(pool)
            .await;
        }
    }
    if let Some(cap_table) = payload.get("capTable").and_then(|v| v.as_array()) {
        for entry in cap_table {
            let ben_addr = entry
                .get("address")
                .and_then(|v| v.as_str())
                .unwrap_or(creator_wallet);
            let label = entry
                .get("label")
                .and_then(|v| v.as_str())
                .unwrap_or("Genesis Tranche");
            let amount = entry.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
            if amount <= 0.0 {
                continue;
            }
            let cliff_d = entry.get("cliffDays").and_then(|v| v.as_i64()).unwrap_or(0) as i32;
            let linear_d = entry
                .get("linearDays")
                .and_then(|v| v.as_i64())
                .unwrap_or(365) as i32;
            let daily_rate = if linear_d > 0 {
                amount / (linear_d as f64)
            } else {
                amount
            };
            let unlocked_init = if cliff_d == 0 && linear_d == 0 {
                amount
            } else {
                0.0
            };
            let status_init = if cliff_d == 0 && linear_d == 0 {
                "UNLOCKED"
            } else {
                "LOCKED"
            };
            let compiled = compile_silverscript_proof_of_lock_vault(
                &ticker,
                "KRC-20",
                label,
                ben_addr,
                amount,
                cliff_d as i64,
                linear_d as i64,
                Some(charter_sha256),
            );
            let _ = sqlx::query(
                r#"
                INSERT INTO forge_vesting_schedules (
                    token_ticker, beneficiary_address, creator_address, label,
                    total_allocated, unlocked_amount, cliff_days, linear_days,
                    daily_unlock_rate, vprog_state_root, lock_tx_hash, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                "#,
            )
            .bind(&ticker)
            .bind(ben_addr)
            .bind(creator_wallet)
            .bind(label)
            .bind(amount)
            .bind(unlocked_init)
            .bind(cliff_d)
            .bind(linear_d)
            .bind(daily_rate)
            .bind(&compiled.kcc20_state.state_root_hex)
            .bind(anchor_tx_hash)
            .bind(status_init)
            .execute(pool)
            .await;
        }
    }
    query_forge_tokenomics_bundle(pool, Some(&ticker), true).await
}
pub async fn claim_vested_forge_tranche(
    pool: &PgPool,
    wallet: &str,
    payload: &Value,
) -> Result<Value, String> {
    let vesting_id = payload
        .get("vestingId")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "Missing vestingId".to_string())?;
    let row_opt = sqlx::query(
        r#"
        SELECT token_ticker, beneficiary_address, unlocked_amount, claimed_amount
        FROM forge_vesting_schedules
        WHERE vesting_id::text = $1
        "#,
    )
    .bind(vesting_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Vesting lookup failed: {}", e))?;
    let Some(row) = row_opt else {
        return Err("Vesting tranche not found".to_string());
    };
    let ticker: String = row.try_get("token_ticker").unwrap_or_else(|_| "SILO".to_string());
    let beneficiary: String = row
        .try_get("beneficiary_address")
        .unwrap_or_else(|_| wallet.to_string());
    let unlocked: f64 = row.try_get("unlocked_amount").unwrap_or(0.0);
    let claimed: f64 = row.try_get("claimed_amount").unwrap_or(0.0);
    let claimable = (unlocked - claimed).max(0.0);
    if claimable <= 0.0 {
        return Err("No unlocked tokens currently available to claim.".to_string());
    }
    sqlx::query(
        r#"
        UPDATE forge_vesting_schedules
        SET claimed_amount = unlocked_amount,
            updated_at = CURRENT_TIMESTAMP
        WHERE vesting_id::text = $1
        "#,
    )
    .bind(vesting_id)
    .execute(pool)
    .await
    .map_err(|e| format!("Claim update failed: {}", e))?;
    let _ = sqlx::query(
        r#"
        INSERT INTO yield_reservoirs (wallet_address, lp_tokens)
        VALUES ($1, jsonb_build_object($2::text, $3::float8))
        ON CONFLICT (wallet_address) DO UPDATE SET
            lp_tokens = jsonb_set(
                COALESCE(yield_reservoirs.lp_tokens, '{}'::jsonb),
                ARRAY[$2::text],
                to_jsonb(COALESCE((yield_reservoirs.lp_tokens->>$2)::float8, 0.0) + $3::float8),
                true
            ),
            last_updated = CURRENT_TIMESTAMP
        "#,
    )
    .bind(&beneficiary)
    .bind(&ticker)
    .bind(claimable)
    .execute(pool)
    .await;
    Ok(json!({
        "vestingId": vesting_id,
        "tokenTicker": ticker,
        "claimedAmount": claimable,
        "beneficiary": beneficiary
    }))
}
```

## File: src/hifo.rs
```rust
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sqlx::{PgPool, Row};
use uuid::Uuid;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HifoDisposalSummary {
    pub disposed_tokens: f64,
    pub gross_proceeds_usd: f64,
    pub matched_cost_basis_usd: f64,
    pub realized_gain_loss_usd: f64,
    pub holding_period: String,
    pub lots_consumed: usize,
}
pub async fn record_hifo_acquisition_lot(
    pool: &PgPool,
    wallet_address: &str,
    asset_ticker: &str,
    amount_tokens: f64,
    fmv_usd_per_token: f64,
    source_event_type: &str,
    source_tx_hash: Option<&str>,
) -> anyhow::Result<Uuid> {
    let clean_ticker = asset_ticker.trim().to_uppercase();
    let sompi = (amount_tokens.max(0.0) * 100_000_000.0).round() as i64;
    let total_basis = (amount_tokens * fmv_usd_per_token).max(0.0);
    let row = sqlx::query(
        r#"
        INSERT INTO hifo_tax_lots (
            wallet_address, asset_ticker, kas_sompi, initial_tokens,
            remaining_sompi, remaining_tokens, fmv_usd_per_token,
            total_cost_basis_usd, source_event_type, source_tx_hash, status
        ) VALUES ($1, $2, $3, $4, $3, $4, $5, $6, $7, $8, 'OPEN')
        RETURNING lot_id
        "#,
    )
    .bind(wallet_address)
    .bind(&clean_ticker)
    .bind(sompi)
    .bind(amount_tokens)
    .bind(fmv_usd_per_token)
    .bind(total_basis)
    .bind(source_event_type)
    .bind(source_tx_hash)
    .fetch_one(pool)
    .await?;
    let lot_id: Uuid = row.try_get("lot_id")?;
    Ok(lot_id)
}
pub async fn match_and_consume_hifo_lots(
    pool: &PgPool,
    wallet_address: &str,
    asset_ticker: &str,
    dispose_tokens: f64,
    execution_spot_usd: f64,
    disposal_tx_hash: Option<&str>,
) -> anyhow::Result<HifoDisposalSummary> {
    let clean_ticker = asset_ticker.trim().to_uppercase();
    let mut remaining_to_dispose = dispose_tokens.max(0.0);
    let gross_proceeds_total = remaining_to_dispose * execution_spot_usd;
    let open_lots = sqlx::query(
        r#"
        SELECT lot_id, acquired_at, remaining_tokens, fmv_usd_per_token
        FROM hifo_tax_lots
        WHERE wallet_address = $1
          AND asset_ticker = $2
          AND status = 'OPEN'
          AND remaining_tokens > 0
        ORDER BY fmv_usd_per_token DESC, acquired_at ASC
        "#,
    )
    .bind(wallet_address)
    .bind(&clean_ticker)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    let mut matched_cost_basis_usd = 0.0_f64;
    let mut lots_consumed = 0usize;
    let mut any_long_term = false;
    let now = Utc::now();
    for lot in open_lots {
        if remaining_to_dispose <= 1e-9 {
            break;
        }
        let lot_id: Uuid = match lot.try_get("lot_id") {
            Ok(id) => id,
            Err(_) => continue,
        };
        let acquired_at: chrono::DateTime<Utc> = lot.try_get("acquired_at").unwrap_or(now);
        let lot_rem: f64 = lot.try_get("remaining_tokens").unwrap_or(0.0);
        let fmv_per_tok: f64 = lot.try_get("fmv_usd_per_token").unwrap_or(execution_spot_usd);
        let consumed = remaining_to_dispose.min(lot_rem);
        if consumed <= 0.0 {
            continue;
        }
        let new_rem = (lot_rem - consumed).max(0.0);
        let new_sompi = (new_rem * 100_000_000.0).round() as i64;
        let new_status = if new_rem <= 1e-8 { "CLOSED" } else { "OPEN" };
        let _ = sqlx::query(
            r#"
            UPDATE hifo_tax_lots
            SET remaining_tokens = $2,
                remaining_sompi = $3,
                status = $4
            WHERE lot_id = $1
            "#,
        )
        .bind(lot_id)
        .bind(new_rem)
        .bind(new_sompi)
        .bind(new_status)
        .execute(pool)
        .await;
        let leg_cost_basis = consumed * fmv_per_tok;
        let leg_proceeds = consumed * execution_spot_usd;
        let leg_gain = leg_proceeds - leg_cost_basis;
        let holding_days = (now - acquired_at).num_days().max(0) as i32;
        let is_long_term = holding_days > 365;
        if is_long_term {
            any_long_term = true;
        }
        let disposed_sompi = (consumed * 100_000_000.0).round() as i64;
        let _ = sqlx::query(
            r#"
            INSERT INTO hifo_disposal_matches (
                lot_id, wallet_address, asset_ticker, disposed_sompi,
                disposed_tokens, acquired_at, holding_period_days,
                is_long_term, cost_basis_usd, gross_proceeds_usd,
                realized_gain_loss_usd, disposal_tx_hash
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            "#,
        )
        .bind(lot_id)
        .bind(wallet_address)
        .bind(&clean_ticker)
        .bind(disposed_sompi)
        .bind(consumed)
        .bind(acquired_at)
        .bind(holding_days)
        .bind(is_long_term)
        .bind(leg_cost_basis)
        .bind(leg_proceeds)
        .bind(leg_gain)
        .bind(disposal_tx_hash)
        .execute(pool)
        .await;
        matched_cost_basis_usd += leg_cost_basis;
        remaining_to_dispose -= consumed;
        lots_consumed += 1;
    }
    if remaining_to_dispose > 1e-8 {
        matched_cost_basis_usd += remaining_to_dispose * execution_spot_usd;
    }
    let realized_gain_loss_usd = gross_proceeds_total - matched_cost_basis_usd;
    let holding_period = if any_long_term {
        "LONG_TERM".to_string()
    } else {
        "SHORT_TERM".to_string()
    };
    Ok(HifoDisposalSummary {
        disposed_tokens: dispose_tokens,
        gross_proceeds_usd: gross_proceeds_total,
        matched_cost_basis_usd,
        realized_gain_loss_usd,
        holding_period,
        lots_consumed,
    })
}
```

## File: src/kaspa_tx.rs
```rust
use serde_json::{json, Value};
use crate::state_api::{decode_kaspa_address_payload, KASPA_ADDR_VERSION_P2SH};
pub const BASE_COMPUTE_MASS: u64 = 200;
pub const MASS_PER_INPUT: u64 = 1200;
pub const MASS_PER_OUTPUT: u64 = 450;
pub const STORAGE_MASS_PARAMETER: u64 = 1_000_000_000_000;
pub const FEE_PER_GRAM: u64 = 110;
pub fn calculate_compute_mass(num_inputs: usize, num_outputs: usize, payload_len: usize) -> u64 {
    BASE_COMPUTE_MASS
        + (num_inputs as u64) * MASS_PER_INPUT
        + (num_outputs as u64) * MASS_PER_OUTPUT
        + (payload_len as u64)
}
pub fn calculate_storage_mass(input_amounts: &[u64], output_amounts: &[u64]) -> u64 {
    if input_amounts.is_empty() || output_amounts.is_empty() {
        return 0;
    }
    let harmonic_outs: u64 = output_amounts
        .iter()
        .map(|&v| {
            if v > 0 {
                STORAGE_MASS_PARAMETER / v
            } else {
                STORAGE_MASS_PARAMETER
            }
        })
        .sum();
    let sum_ins: u64 = input_amounts.iter().sum();
    let mean_ins = sum_ins / (input_amounts.len() as u64).max(1);
    if mean_ins == 0 {
        return harmonic_outs;
    }
    let arithmetic_ins = (input_amounts.len() as u64) * (STORAGE_MASS_PARAMETER / mean_ins);
    harmonic_outs.saturating_sub(arithmetic_ins)
}
pub fn decode_kaspa_address_to_spk_hex(address: &str) -> String {
    if let Some((version, hash32)) = decode_kaspa_address_payload(address) {
        let hex_hash = hex::encode(hash32);
        if version == KASPA_ADDR_VERSION_P2SH {
            return format!("a9{}87", hex_hash);
        }
        return format!("20{}ac", hex_hash);
    }
    let fallback = crate::state_api::blake2b_256(address.trim().as_bytes());
    format!("20{}ac", hex::encode(fallback))
}
pub fn assemble_unsigned_kaspa_psbt(
    sender_address: &str,
    recipient_address: &str,
    amount_sompi: u64,
    utxo_entries: &[Value],
) -> Option<(Value, Vec<Value>)> {
    if utxo_entries.is_empty() || amount_sompi == 0 {
        return None;
    }
    let sender_spk = decode_kaspa_address_to_spk_hex(sender_address);
    let recipient_spk = decode_kaspa_address_to_spk_hex(recipient_address);
    let mut gathered: u64 = 0;
    let mut inputs = Vec::new();
    let mut formatted_utxos = Vec::new();
    let mut input_amounts = Vec::new();
    for u in utxo_entries {
        let tx_id = u
            .get("transactionId")
            .or_else(|| u.get("outpoint").and_then(|o| o.get("transactionId")))
            .and_then(|v| v.as_str())?;
        let index = u
            .get("index")
            .or_else(|| u.get("outpoint").and_then(|o| o.get("index")))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let amt = u
            .get("amount")
            .or_else(|| u.get("utxoEntry").and_then(|e| e.get("amount")))
            .and_then(|v| {
                v.as_u64()
                    .or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok()))
            })
            .unwrap_or(0);
        if amt == 0 {
            continue;
        }
        let spk = u
            .get("scriptPublicKey")
            .and_then(|v| {
                v.as_str().or_else(|| {
                    v.get("scriptPublicKey").and_then(|s| s.as_str())
                })
            })
            .unwrap_or(&sender_spk)
            .to_string();
        inputs.push(json!({
            "previousOutpoint": {
                "transactionId": tx_id,
                "index": index
            },
            "signatureScript": "",
            "sequence": 0,
            "sigOpCount": 1
        }));
        formatted_utxos.push(json!({
            "transactionId": tx_id,
            "index": index,
            "amount": amt,
            "scriptPublicKey": spk
        }));
        input_amounts.push(amt);
        gathered += amt;
        let compute_mass = calculate_compute_mass(inputs.len(), 2, 0);
        let fee = compute_mass * FEE_PER_GRAM;
        if gathered >= amount_sompi + fee {
            break;
        }
    }
    let compute_mass = calculate_compute_mass(inputs.len(), 2, 0);
    let fee = compute_mass * FEE_PER_GRAM;
    if gathered < amount_sompi + fee {
        return None;
    }
    let change = gathered - amount_sompi - fee;
    let mut outputs = vec![json!({
        "amount": amount_sompi,
        "scriptPublicKey": recipient_spk
    })];
    if change >= 10_000_000 {
        outputs.push(json!({
            "amount": change,
            "scriptPublicKey": sender_spk
        }));
    }
    let psbt = json!({
        "version": 0,
        "inputs": inputs,
        "outputs": outputs,
        "lockTime": 0,
        "subnetworkId": "0000000000000000000000000000000000000000",
        "gas": 0,
        "payload": ""
    });
    Some((psbt, formatted_utxos))
}
```

## File: src/l1_dispatcher.rs
```rust
use secp256k1::{Keypair, Message, SecretKey, SECP256K1};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::env;
use uuid::Uuid;
use crate::state_api::{
    blake2b_256, blake2b_256_keyed, decode_kaspa_address_payload, encode_kaspa_bech32m_address,
    KASPA_ADDR_VERSION_P2PK_SCHNORR, KASPA_ADDR_VERSION_P2SH,
};
const TX_SIGNING_KEY: &[u8] = b"TransactionSigningHash";
const SIGHASH_ALL: u8 = 0x01;
const FEE_PER_GRAM: u64 = 110;
const MIN_CHANGE_SOMPI: u64 = 10_000_000;
#[derive(Clone, Debug)]
struct SpendableKaspaUtxo {
    transaction_id: String,
    index: u32,
    amount_sompi: u64,
    script_public_key_hex: String,
}
pub fn resolve_network_for_asset(asset_ticker: &str) -> String {
    match asset_ticker.trim().to_uppercase().as_str() {
        "KAS" | "SILO" | "BEDRCK" | "NACHO" | "PERX" => "KAS".to_string(),
        "BTC" => "BTC".to_string(),
        "ETH" | "USDC" | "USDT" | "XAU" | "XAG" | "USTB" => "ETH".to_string(),
        "SOL" => "SOL".to_string(),
        "DOGE" => "DOGE".to_string(),
        "XRP" => "XRP".to_string(),
        "POL" => "POL".to_string(),
        "AVAX" => "AVAX".to_string(),
        "SUI" => "SUI".to_string(),
        "TRX" => "TRX".to_string(),
        "ZEC" => "ZEC".to_string(),
        "ARB" => "ARB".to_string(),
        "BASE" | "NVDA" | "SPY" | "QQQ" | "AAPL" | "TSLA" | "AMD" | "TSM" | "AVGO" | "XLE" => {
            "BASE".to_string()
        }
        other => other.to_string(),
    }
}
pub fn explorer_tx_url_for_asset(asset: &str, network: &str, tx_hash: &str) -> String {
    let clean_tx = tx_hash.trim();
    if clean_tx.is_empty() || clean_tx.starts_with("PER-L1-") {
        return "#".to_string();
    }
    let net = if !network.trim().is_empty() {
        network.trim().to_uppercase()
    } else {
        resolve_network_for_asset(asset)
    };
    match net.as_str() {
        "KAS" => format!("https://kas.fyi/transaction/{}", clean_tx),
        "BTC" => format!("https://mempool.space/tx/{}", clean_tx),
        "ETH" => format!("https://etherscan.io/tx/{}", clean_tx),
        "SOL" => format!("https://solscan.io/tx/{}", clean_tx),
        "XRP" => format!("https://xrpscan.com/tx/{}", clean_tx),
        "DOGE" => format!("https://blockchair.com/dogecoin/transaction/{}", clean_tx),
        "POL" => format!("https://polygonscan.com/tx/{}", clean_tx),
        "AVAX" => format!("https://snowtrace.io/tx/{}", clean_tx),
        "ARB" => format!("https://arbiscan.io/tx/{}", clean_tx),
        "BASE" => format!("https://basescan.org/tx/{}", clean_tx),
        "SUI" => format!("https://suiscan.xyz/mainnet/tx/{}", clean_tx),
        "TRX" => format!("https://tronscan.org/#/transaction/{}", clean_tx),
        "ZEC" => format!("https://blockchair.com/zcash/transaction/{}", clean_tx),
        _ => format!("https://kas.fyi/transaction/{}", clean_tx),
    }
}
pub fn build_explorer_tx_url(asset: &str, tx_hash: &str) -> String {
    explorer_tx_url_for_asset(asset, "", tx_hash)
}
fn address_to_spk_hex(address: &str) -> Result<String, String> {
    let (version, hash32) = decode_kaspa_address_payload(address)
        .ok_or_else(|| format!("Invalid Kaspa Bech32m address: {}", address))?;
    let hex_hash = hex::encode(hash32);
    if version == KASPA_ADDR_VERSION_P2SH {
        Ok(format!("a9{}87", hex_hash))
    } else {
        Ok(format!("20{}ac", hex_hash))
    }
}
fn resolve_hot_kaspa_keypair() -> Result<(Keypair, String, String), String> {
    let raw_hex = env::var("PERENNIA_HOT_KAS_PRIVATE_KEY")
        .or_else(|_| env::var("PERENNIA_TREASURY_PRIVATE_KEY"))
        .map_err(|_| {
            "HOT_WALLET_KEY_MISSING: Set PERENNIA_HOT_KAS_PRIVATE_KEY in .env for automated L1 signing."
                .to_string()
        })?;
    let clean_hex = raw_hex.trim().trim_start_matches("0x");
    let mut priv_bytes =
        hex::decode(clean_hex).map_err(|_| "Invalid hex in PERENNIA_HOT_KAS_PRIVATE_KEY".to_string())?;
    if priv_bytes.len() != 32 {
        priv_bytes.fill(0);
        return Err("PERENNIA_HOT_KAS_PRIVATE_KEY must be exactly 32 bytes (64 hex chars).".to_string());
    }
    let secret_key = SecretKey::from_slice(&priv_bytes)
        .map_err(|e| format!("Invalid secp256k1 secret key: {}", e))?;
    priv_bytes.fill(0);
    let keypair = Keypair::from_secret_key(SECP256K1, &secret_key);
    let (xonly_pub, _) = keypair.x_only_public_key();
    let pub_bytes: [u8; 32] = xonly_pub.serialize();
    let derived_address = encode_kaspa_bech32m_address(KASPA_ADDR_VERSION_P2PK_SCHNORR, &pub_bytes);
    let configured_address = env::var("PERENNIA_HOT_KAS_ADDRESS")
        .or_else(|_| env::var("PERENNIA_TREASURY_KAS_ADDRESS"))
        .ok()
        .map(|s| s.trim().to_lowercase())
        .filter(|s| s.starts_with("kaspa:") && s.len() >= 60)
        .unwrap_or(derived_address);
    let source_spk_hex = format!("20{}ac", hex::encode(pub_bytes));
    Ok((keypair, configured_address, source_spk_hex))
}
async fn fetch_hot_wallet_utxos(
    source_address: &str,
    default_spk_hex: &str,
) -> Result<Vec<SpendableKaspaUtxo>, String> {
    let raw_entries = match crate::kaspad_client::get_utxos_by_address_grpc(source_address).await {
        Ok(entries) if !entries.is_empty() => entries,
        _ => {
            let rest_url = env::var("KASPA_REST_URL")
                .map(|s| s.trim().trim_end_matches('/').to_string())
                .unwrap_or_else(|_| "https://api.kaspa.org".to_string());
            let endpoint = format!("{}/addresses/{}/utxos", rest_url, source_address);
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(6))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new());
            let resp = client
                .get(&endpoint)
                .send()
                .await
                .map_err(|e| format!("Failed to fetch hot wallet UTXOs: {}", e))?;
            if !resp.status().is_success() {
                return Err(format!(
                    "UTXO lookup rejected by node with HTTP {}",
                    resp.status()
                ));
            }
            resp.json::<Vec<Value>>()
                .await
                .map_err(|e| format!("Invalid UTXO JSON response: {}", e))?
        }
    };
    let mut utxos = Vec::with_capacity(raw_entries.len());
    for u in raw_entries {
        let tx_id = u
            .get("outpoint")
            .and_then(|o| o.get("transactionId"))
            .or_else(|| u.get("transactionId"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        if tx_id.len() != 64 {
            continue;
        }
        let index = u
            .get("outpoint")
            .and_then(|o| o.get("index"))
            .or_else(|| u.get("index"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
        let amount_sompi = u
            .get("utxoEntry")
            .and_then(|e| e.get("amount"))
            .or_else(|| u.get("amount"))
            .and_then(|v| {
                v.as_u64()
                    .or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok()))
            })
            .unwrap_or(0);
        if amount_sompi == 0 {
            continue;
        }
        let spk_hex = u
            .get("utxoEntry")
            .and_then(|e| e.get("scriptPublicKey"))
            .and_then(|s| s.get("scriptPublicKey").or(Some(s)))
            .or_else(|| u.get("scriptPublicKey"))
            .and_then(|v| {
                v.as_str()
                    .or_else(|| v.get("scriptPublicKey").and_then(|s| s.as_str()))
            })
            .filter(|s| !s.trim().is_empty())
            .unwrap_or(default_spk_hex)
            .to_string();
        utxos.push(SpendableKaspaUtxo {
            transaction_id: tx_id,
            index,
            amount_sompi,
            script_public_key_hex: spk_hex,
        });
    }
    utxos.sort_by(|a, b| b.amount_sompi.cmp(&a.amount_sompi));
    if utxos.is_empty() {
        return Err(format!(
            "Hot dispatcher wallet ({}) has 0 spendable UTXOs.",
            source_address
        ));
    }
    Ok(utxos)
}
pub async fn sign_and_broadcast_kaspa_payout_batch(
    pool: &PgPool,
    idempotency_key: &str,
    recipients: &[(String, u64)],
    payload_hex: &str,
) -> Result<String, String> {
    let sys_cfg = crate::chronos::load_system_treasury_config(pool).await;
    if sys_cfg.outflow_breaker_tripped {
        return Err(
            "CIRCUIT_BREAKER_TRIPPED: Director has paused automated L1 outflows.".to_string(),
        );
    }
    if let Ok(Some(existing)) = sqlx::query(
        r#"
        SELECT deterministic_txid, state
        FROM idempotent_payout_batches
        WHERE idempotency_key = $1
        LIMIT 1
        "#,
    )
    .bind(idempotency_key)
    .fetch_optional(pool)
    .await
    {
        let st: String = existing.try_get("state").unwrap_or_default();
        let txid_opt: Option<String> = existing.try_get("deterministic_txid").ok().flatten();
        if (st == "CONFIRMED" || st == "IN_FLIGHT") && txid_opt.is_some() {
            return Ok(txid_opt.unwrap());
        }
    }
    let valid_recipients: Vec<(String, u64, String)> = recipients
        .iter()
        .filter(|(addr, sompi)| !addr.trim().is_empty() && *sompi > 0)
        .map(|(addr, sompi)| {
            let spk = address_to_spk_hex(addr)?;
            Ok((addr.clone(), *sompi, spk))
        })
        .collect::<Result<Vec<_>, String>>()?;
    if valid_recipients.is_empty() {
        return Err("No valid recipients with positive sompi in payout batch.".to_string());
    }
    let (keypair, source_address, source_spk_hex) = resolve_hot_kaspa_keypair()?;
    let available_utxos = fetch_hot_wallet_utxos(&source_address, &source_spk_hex).await?;
    let target_total_sompi: u64 = valid_recipients.iter().map(|(_, s, _)| *s).sum();
    let payload_bytes = if payload_hex.trim().is_empty() {
        Vec::new()
    } else {
        hex::decode(payload_hex.trim())
            .map_err(|_| "Invalid payload_hex in Kaspa transaction".to_string())?
    };
    let mut selected_utxos = Vec::new();
    let mut gathered_sompi: u64 = 0;
    let mut fee_sompi: u64 = 0;
    let num_outputs_est = (valid_recipients.len() + 1) as u64;
    for u in available_utxos {
        gathered_sompi = gathered_sompi.saturating_add(u.amount_sompi);
        selected_utxos.push(u);
        let compute_mass = 200u64
            + (selected_utxos.len() as u64) * 1200u64
            + num_outputs_est * 450u64
            + (payload_bytes.len() as u64);
        fee_sompi = compute_mass * FEE_PER_GRAM;
        if gathered_sompi >= target_total_sompi.saturating_add(fee_sompi) {
            break;
        }
    }
    if gathered_sompi < target_total_sompi.saturating_add(fee_sompi) {
        return Err(format!(
            "INSUFFICIENT_HOT_WALLET_UTXO_MASS: Required {} sompi, available {} sompi on {}.",
            target_total_sompi.saturating_add(fee_sompi),
            gathered_sompi,
            source_address
        ));
    }
    let change_sompi = gathered_sompi.saturating_sub(target_total_sompi.saturating_add(fee_sompi));
    let mut tx_outputs: Vec<(u64, String)> = valid_recipients
        .iter()
        .map(|(_, sompi, spk)| (*sompi, spk.clone()))
        .collect();
    if change_sompi >= MIN_CHANGE_SOMPI {
        tx_outputs.push((change_sompi, source_spk_hex.clone()));
    }
    let mut prev_outs_buf = Vec::with_capacity(selected_utxos.len() * 36);
    let mut sequences_buf = Vec::with_capacity(selected_utxos.len() * 8);
    let mut sig_op_counts_buf = Vec::with_capacity(selected_utxos.len());
    for u in &selected_utxos {
        let txid_bytes = hex::decode(&u.transaction_id)
            .map_err(|_| format!("Malformed UTXO transactionId: {}", u.transaction_id))?;
        prev_outs_buf.extend_from_slice(&txid_bytes);
        prev_outs_buf.extend_from_slice(&u.index.to_le_bytes());
        sequences_buf.extend_from_slice(&0u64.to_le_bytes());
        sig_op_counts_buf.push(1u8);
    }
    let prev_outs_hash = blake2b_256_keyed(TX_SIGNING_KEY, &prev_outs_buf);
    let sequences_hash = blake2b_256_keyed(TX_SIGNING_KEY, &sequences_buf);
    let sig_op_counts_hash = blake2b_256_keyed(TX_SIGNING_KEY, &sig_op_counts_buf);
    let mut outputs_buf = Vec::new();
    for (amt, spk_hex) in &tx_outputs {
        let spk_bytes =
            hex::decode(spk_hex).map_err(|_| format!("Invalid output SPK hex: {}", spk_hex))?;
        outputs_buf.extend_from_slice(&amt.to_le_bytes());
        outputs_buf.extend_from_slice(&0u16.to_le_bytes());
        outputs_buf.extend_from_slice(&(spk_bytes.len() as u64).to_le_bytes());
        outputs_buf.extend_from_slice(&spk_bytes);
    }
    let outputs_hash = blake2b_256_keyed(TX_SIGNING_KEY, &outputs_buf);
    let payload_hash = if payload_bytes.is_empty() {
        [0u8; 32]
    } else {
        let mut p_buf = Vec::with_capacity(8 + payload_bytes.len());
        p_buf.extend_from_slice(&(payload_bytes.len() as u64).to_le_bytes());
        p_buf.extend_from_slice(&payload_bytes);
        blake2b_256_keyed(TX_SIGNING_KEY, &p_buf)
    };
    let mut signed_inputs_json = Vec::with_capacity(selected_utxos.len());
    for u in &selected_utxos {
        let txid_bytes = hex::decode(&u.transaction_id).unwrap_or_default();
        let spk_bytes = hex::decode(&u.script_public_key_hex).unwrap_or_default();
        let mut preimage = Vec::with_capacity(220 + spk_bytes.len());
        preimage.extend_from_slice(&0u16.to_le_bytes());
        preimage.extend_from_slice(&prev_outs_hash);
        preimage.extend_from_slice(&sequences_hash);
        preimage.extend_from_slice(&sig_op_counts_hash);
        preimage.extend_from_slice(&txid_bytes);
        preimage.extend_from_slice(&u.index.to_le_bytes());
        preimage.extend_from_slice(&0u16.to_le_bytes());
        preimage.extend_from_slice(&(spk_bytes.len() as u64).to_le_bytes());
        preimage.extend_from_slice(&spk_bytes);
        preimage.extend_from_slice(&u.amount_sompi.to_le_bytes());
        preimage.extend_from_slice(&0u64.to_le_bytes());
        preimage.push(1u8);
        preimage.extend_from_slice(&outputs_hash);
        preimage.extend_from_slice(&0u64.to_le_bytes());
        preimage.extend_from_slice(&[0u8; 20]);
        preimage.extend_from_slice(&0u64.to_le_bytes());
        preimage.extend_from_slice(&payload_hash);
        preimage.push(SIGHASH_ALL);
        let sighash = blake2b_256_keyed(TX_SIGNING_KEY, &preimage);
        let msg = Message::from_digest(sighash);
        let sig = SECP256K1.sign_schnorr_no_aux_rand(&msg, &keypair);
        let sig_script = format!("41{}01", hex::encode(sig.as_ref()));
        signed_inputs_json.push(json!({
            "previousOutpoint": {
                "transactionId": u.transaction_id,
                "index": u.index
            },
            "signatureScript": sig_script,
            "sequence": 0,
            "sigOpCount": 1
        }));
    }
    let outputs_json: Vec<Value> = tx_outputs
        .iter()
        .map(|(amt, spk)| {
            json!({
                "amount": *amt,
                "scriptPublicKey": {
                    "version": 0,
                    "scriptPublicKey": spk
                }
            })
        })
        .collect();
    let signed_tx_envelope = json!({
        "transaction": {
            "version": 0,
            "inputs": signed_inputs_json,
            "outputs": outputs_json,
            "lockTime": 0,
            "subnetworkId": "0000000000000000000000000000000000000000",
            "gas": 0,
            "payload": payload_hex.trim()
        }
    });
    let pre_broadcast_digest = blake2b_256(
        format!(
            "IN_FLIGHT:{}:{}:{}",
            idempotency_key,
            prev_outs_hash
                .iter()
                .map(|b| format!("{:02x}", b))
                .collect::<String>(),
            hex::encode(outputs_hash)
        )
        .as_bytes(),
    );
    let provisional_lock_id = hex::encode(pre_broadcast_digest);
    let batch_id = format!("BATCH-{}", &provisional_lock_id[..16].to_uppercase());
    let manifest_json: Vec<Value> = valid_recipients
        .iter()
        .map(|(addr, sompi, _)| {
            json!({
                "address": addr,
                "sompi": *sompi,
                "amountKas": (*sompi as f64) / 100_000_000.0
            })
        })
        .collect();
    sqlx::query(
        r#"
        INSERT INTO idempotent_payout_batches (
            batch_id, idempotency_key, deterministic_txid, signed_tx_json,
            total_sompi, recipient_manifest, state, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, 'IN_FLIGHT', CURRENT_TIMESTAMP)
        ON CONFLICT (idempotency_key) DO UPDATE SET
            signed_tx_json = EXCLUDED.signed_tx_json,
            state = 'IN_FLIGHT',
            updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(&batch_id)
    .bind(idempotency_key)
    .bind(&provisional_lock_id)
    .bind(&signed_tx_envelope)
    .bind(target_total_sompi as i64)
    .bind(Value::Array(manifest_json))
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to persist IN_FLIGHT idempotency lock: {}", e))?;
    let broadcast_txid = match crate::kaspad_client::submit_transaction_grpc(
        &signed_tx_envelope,
        false,
    )
    .await
    {
        Ok(txid) => txid,
        Err(grpc_err) => {
            tracing::warn!(
                "⚠️ [L1 DISPATCHER] gRPC broadcast failed ({}), attempting REST broadcast...",
                grpc_err
            );
            let rest_url = env::var("KASPA_REST_URL")
                .map(|s| s.trim().trim_end_matches('/').to_string())
                .unwrap_or_else(|_| "https://api.kaspa.org".to_string());
            let endpoint = format!("{}/transactions", rest_url);
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(10))
                .build()
                .unwrap_or_else(|_| reqwest::Client::new());
            let resp = client
                .post(&endpoint)
                .json(&signed_tx_envelope)
                .send()
                .await
                .map_err(|e| {
                    format!(
                        "Both kaspad gRPC ({}) and REST ({}) failed",
                        grpc_err, e
                    )
                })?;
            if !resp.status().is_success() {
                let err_text = resp.text().await.unwrap_or_default();
                let _ = sqlx::query(
                    r#"
                    UPDATE idempotent_payout_batches
                    SET state = 'FAILED_BROADCAST',
                        retry_count = retry_count + 1,
                        last_error = $2,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE idempotency_key = $1
                    "#,
                )
                .bind(idempotency_key)
                .bind(&err_text)
                .execute(pool)
                .await;
                return Err(format!("Kaspa node rejected L1 broadcast: {}", err_text));
            }
            let body_json: Value = resp
                .json()
                .await
                .map_err(|e| format!("Invalid broadcast JSON response: {}", e))?;
            body_json
                .get("transactionId")
                .or_else(|| body_json.get("id"))
                .and_then(|v| v.as_str())
                .ok_or_else(|| "Kaspa REST broadcast returned no transactionId".to_string())?
                .to_string()
        }
    };
    let _ = sqlx::query(
        r#"
        UPDATE idempotent_payout_batches
        SET deterministic_txid = $2,
            state = 'CONFIRMED',
            updated_at = CURRENT_TIMESTAMP
        WHERE idempotency_key = $1
        "#,
    )
    .bind(idempotency_key)
    .bind(&broadcast_txid)
    .execute(pool)
    .await;
    Ok(broadcast_txid)
}
pub async fn dispatch_or_queue_l1_payout(
    pool: &PgPool,
    wallet_address: &str,
    destination_address: &str,
    asset_ticker: &str,
    network_override: Option<&str>,
    amount_tokens: f64,
    spot_price: f64,
    source_type: &str,
) -> Result<Value, String> {
    if amount_tokens <= 0.0 {
        return Err("L1 payout amount_tokens must be greater than 0.".to_string());
    }
    let clean_asset = asset_ticker.trim().to_uppercase();
    let network = network_override
        .map(|s| s.trim().to_uppercase())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| resolve_network_for_asset(&clean_asset));
    let is_system_otc = source_type.eq_ignore_ascii_case("otc_settlement")
        || wallet_address.contains("treasury_master");
    if !is_system_otc && clean_asset == "KAS" {
        let debit_check = if source_type.eq_ignore_ascii_case("cold_airlock_sweep")
            || source_type.eq_ignore_ascii_case("ledger_withdrawal")
        {
            amount_tokens
        } else {
            0.0
        };
        crate::chronos::verify_wallet_ledger_invariant_or_quarantine(
            pool,
            wallet_address,
            debit_check,
        )
        .await?;
    }
    let gross_usd = (amount_tokens * spot_price.max(0.0)).max(0.0);
    let payout_id = format!(
        "PER-L1-{}",
        Uuid::new_v4()
            .to_string()
            .replace('-', "")
            .chars()
            .take(12)
            .collect::<String>()
            .to_uppercase()
    );
    let mut dispatched_tx_hash = String::new();
    let mut queue_reason_opt: Option<String> = None;
    if network == "KAS" {
        let (sompi_to_send, payload_hex) = if clean_asset == "KAS" {
            let sompi = (amount_tokens * 100_000_000.0).round() as u64;
            (sompi, String::new())
        } else {
            let formatted_dest = if destination_address.trim().to_lowercase().starts_with("kaspa:") {
                destination_address.trim().to_lowercase()
            } else {
                format!("kaspa:{}", destination_address.trim().to_lowercase())
            };
            let base_units = ((amount_tokens * 100_000_000.0).round() as u128).to_string();
            let krc20_json = json!({
                "p": "krc-20",
                "op": "transfer",
                "tick": clean_asset,
                "amt": base_units,
                "to": formatted_dest
            });
            (30_000_000u64, hex::encode(krc20_json.to_string().as_bytes()))
        };
        let idemp_key = format!("L1-DISPATCH-{}", payout_id);
        match sign_and_broadcast_kaspa_payout_batch(
            pool,
            &idemp_key,
            &[(destination_address.to_string(), sompi_to_send)],
            &payload_hex,
        )
        .await
        {
            Ok(real_txid) => {
                dispatched_tx_hash = real_txid;
            }
            Err(err) => {
                queue_reason_opt = Some(err);
            }
        }
    } else {
        queue_reason_opt = Some(format!(
            "Queued {} ({}) payout for multi-chain L1 dispatcher.",
            clean_asset, network
        ));
    }
    let status = if !dispatched_tx_hash.is_empty() {
        "DISPATCHED_ONCHAIN"
    } else {
        "QUEUED_FOR_L1_DISPATCH"
    };
    let final_tx_ref = if !dispatched_tx_hash.is_empty() {
        dispatched_tx_hash.clone()
    } else {
        payout_id.clone()
    };
    let explorer_url = explorer_tx_url_for_asset(&clean_asset, &network, &final_tx_ref);
    sqlx::query(
        r#"
        INSERT INTO l1_payout_queue (
            payout_id, wallet_address, destination_address, asset_ticker,
            network, amount_tokens, gross_usd, spot_price, source_type,
            tx_hash, explorer_url, queue_reason, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (payout_id) DO UPDATE SET
            tx_hash = EXCLUDED.tx_hash,
            explorer_url = EXCLUDED.explorer_url,
            queue_reason = EXCLUDED.queue_reason,
            status = EXCLUDED.status,
            updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(&payout_id)
    .bind(wallet_address)
    .bind(destination_address)
    .bind(&clean_asset)
    .bind(&network)
    .bind(amount_tokens)
    .bind(gross_usd)
    .bind(spot_price)
    .bind(source_type)
    .bind(&final_tx_ref)
    .bind(&explorer_url)
    .bind(queue_reason_opt.as_deref())
    .bind(status)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to persist L1 payout record: {}", e))?;
    let _ = sqlx::query(
        r#"
        INSERT INTO tax_ledger_events (
            wallet_address, asset_ticker, event_type, gross_proceeds_usd,
            amount_tokens, spot_price_at_execution, tx_hash, payout_address,
            cost_basis_usd, realized_gain_loss_usd, holding_period
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $4, 0.0, 'SHORT_TERM')
        "#,
    )
    .bind(wallet_address)
    .bind(&clean_asset)
    .bind(source_type.to_uppercase())
    .bind(gross_usd)
    .bind(amount_tokens)
    .bind(spot_price)
    .bind(&final_tx_ref)
    .bind(destination_address)
    .execute(pool)
    .await;
    Ok(json!({
        "payoutId": payout_id,
        "walletAddress": wallet_address,
        "destinationAddress": destination_address,
        "assetTicker": clean_asset,
        "network": network,
        "amountTokens": amount_tokens,
        "grossUsd": gross_usd,
        "spotPrice": spot_price,
        "txHash": final_tx_ref,
        "explorerUrl": explorer_url,
        "queueReason": queue_reason_opt,
        "status": status
    }))
}
pub async fn retry_queued_l1_payout(pool: &PgPool, payout_id: &str) -> Result<Value, String> {
    let row_opt = sqlx::query(
        r#"
        SELECT wallet_address, destination_address, asset_ticker, network, amount_tokens
        FROM l1_payout_queue
        WHERE payout_id = $1
        "#,
    )
    .bind(payout_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("DB lookup failed: {}", e))?;
    let Some(row) = row_opt else {
        return Err(format!("Payout ID {} not found in l1_payout_queue", payout_id));
    };
    let wallet: String = row.try_get("wallet_address").unwrap_or_default();
    let dest: String = row.try_get("destination_address").unwrap_or_default();
    let ticker: String = row
        .try_get("asset_ticker")
        .unwrap_or_else(|_| "KAS".to_string());
    let network: String = row
        .try_get("network")
        .unwrap_or_else(|_| "KAS".to_string());
    let amt: f64 = row.try_get("amount_tokens").unwrap_or(0.0);
    if network.trim().to_uppercase() != "KAS" {
        return Err(format!(
            "Retry on Rust node only supports KAS/KRC-20 L1 payouts (found {}). Use the multi-chain L1 dispatcher.",
            network
        ));
    }
    crate::chronos::verify_wallet_ledger_invariant_or_quarantine(pool, &wallet, 0.0).await?;
    let (sompi, payload_hex) = if ticker.trim().eq_ignore_ascii_case("KAS") {
        ((amt * 100_000_000.0).round() as u64, String::new())
    } else {
        let base_units = ((amt * 100_000_000.0).round() as u128).to_string();
        let krc20_json = json!({
            "p": "krc-20",
            "op": "transfer",
            "tick": ticker.trim().to_uppercase(),
            "amt": base_units,
            "to": dest.trim().to_lowercase()
        });
        (30_000_000u64, hex::encode(krc20_json.to_string().as_bytes()))
    };
    let idemp_key = format!("RETRY-L1-{}", payout_id);
    let tx_hash =
        sign_and_broadcast_kaspa_payout_batch(pool, &idemp_key, &[(dest.clone(), sompi)], &payload_hex)
            .await?;
    let explorer_url = explorer_tx_url_for_asset(&ticker, &network, &tx_hash);
    sqlx::query(
        r#"
        UPDATE l1_payout_queue
        SET tx_hash = $2,
            explorer_url = $3,
            queue_reason = NULL,
            status = 'DISPATCHED_ONCHAIN',
            updated_at = CURRENT_TIMESTAMP
        WHERE payout_id = $1
        "#,
    )
    .bind(payout_id)
    .bind(&tx_hash)
    .bind(&explorer_url)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update retried L1 payout: {}", e))?;
    Ok(json!({
        "payoutId": payout_id,
        "txHash": tx_hash,
        "explorerUrl": explorer_url,
        "status": "DISPATCHED_ONCHAIN"
    }))
}
```

## File: src/silverscript.rs
```rust
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
pub const KASPA_CHARSET: &[u8; 32] = b"qpzry9x8gf2tvdw0s3jn54khce6mua7l";
pub const KASPA_ADDR_VERSION_P2PK_SCHNORR: u8 = 0x00;
pub const KASPA_ADDR_VERSION_P2SH: u8 = 0x08;
pub const CANONICAL_GENESIS_ANCHOR_EPOCH_SEC: i64 = 1_767_225_600;
const BLAKE2B_IV: [u64; 8] = [
    0x6a09e667f3bcc908,
    0xbb67ae8584caa73b,
    0x3c6ef372fe94f82b,
    0xa54ff53a5f1d36f1,
    0x510e527fade682d1,
    0x9b05688c2b3e6c1f,
    0x1f83d9abfb41bd6b,
    0x5be0cd19137e2179,
];
const BLAKE2B_SIGMA: [[usize; 16]; 12] = [
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
    [11, 8, 12, 0, 5, 2, 15, 13, 10, 14, 3, 6, 7, 1, 9, 4],
    [7, 9, 3, 1, 13, 12, 11, 14, 2, 6, 5, 10, 4, 0, 15, 8],
    [9, 0, 5, 7, 2, 4, 10, 15, 14, 1, 11, 12, 6, 8, 3, 13],
    [2, 12, 6, 10, 0, 11, 8, 3, 4, 13, 7, 5, 15, 14, 1, 9],
    [12, 5, 1, 15, 14, 13, 4, 10, 0, 7, 6, 3, 9, 2, 8, 11],
    [13, 11, 7, 14, 12, 1, 3, 9, 5, 0, 15, 4, 8, 6, 2, 10],
    [6, 15, 14, 9, 11, 3, 0, 8, 12, 2, 13, 7, 1, 4, 10, 5],
    [10, 2, 8, 4, 7, 6, 1, 5, 15, 11, 9, 14, 3, 12, 13, 0],
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    [14, 10, 4, 8, 9, 15, 13, 6, 1, 12, 0, 2, 11, 7, 5, 3],
];
#[inline]
fn blake2b_g(v: &mut [u64; 16], a: usize, b: usize, c: usize, d: usize, x: u64, y: u64) {
    v[a] = v[a].wrapping_add(v[b]).wrapping_add(x);
    v[d] = (v[d] ^ v[a]).rotate_right(32);
    v[c] = v[c].wrapping_add(v[d]);
    v[b] = (v[b] ^ v[c]).rotate_right(24);
    v[a] = v[a].wrapping_add(v[b]).wrapping_add(y);
    v[d] = (v[d] ^ v[a]).rotate_right(16);
    v[c] = v[c].wrapping_add(v[d]);
    v[b] = (v[b] ^ v[c]).rotate_right(63);
}
fn blake2b_compress(h: &mut [u64; 8], block: &[u8; 128], t: u128, last: bool) {
    let mut m = [0u64; 16];
    for i in 0..16 {
        let start = i * 8;
        let mut bytes = [0u8; 8];
        bytes.copy_from_slice(&block[start..start + 8]);
        m[i] = u64::from_le_bytes(bytes);
    }
    let mut v = [0u64; 16];
    v[..8].copy_from_slice(h);
    v[8..16].copy_from_slice(&BLAKE2B_IV);
    v[12] ^= t as u64;
    v[13] ^= (t >> 64) as u64;
    if last {
        v[14] = !v[14];
    }
    for s in &BLAKE2B_SIGMA {
        blake2b_g(&mut v, 0, 4, 8, 12, m[s[0]], m[s[1]]);
        blake2b_g(&mut v, 1, 5, 9, 13, m[s[2]], m[s[3]]);
        blake2b_g(&mut v, 2, 6, 10, 14, m[s[4]], m[s[5]]);
        blake2b_g(&mut v, 3, 7, 11, 15, m[s[6]], m[s[7]]);
        blake2b_g(&mut v, 0, 5, 10, 15, m[s[8]], m[s[9]]);
        blake2b_g(&mut v, 1, 6, 11, 12, m[s[10]], m[s[11]]);
        blake2b_g(&mut v, 2, 7, 8, 13, m[s[12]], m[s[13]]);
        blake2b_g(&mut v, 3, 4, 9, 14, m[s[14]], m[s[15]]);
    }
    for i in 0..8 {
        h[i] ^= v[i] ^ v[i + 8];
    }
}
fn blake2b_hash(key: &[u8], data: &[u8]) -> [u8; 32] {
    let mut h = BLAKE2B_IV;
    let key_len = key.len().min(64);
    h[0] ^= 0x01010000 ^ ((key_len as u64) << 8) ^ 32;
    let mut buffer = Vec::with_capacity(if key_len > 0 { 128 + data.len() } else { data.len() });
    if key_len > 0 {
        let mut key_block = [0u8; 128];
        key_block[..key_len].copy_from_slice(&key[..key_len]);
        buffer.extend_from_slice(&key_block);
    }
    buffer.extend_from_slice(data);
    let mut t: u128 = 0;
    if buffer.is_empty() {
        let empty_block = [0u8; 128];
        blake2b_compress(&mut h, &empty_block, 0, true);
    } else {
        let chunks = buffer.chunks(128);
        let num_chunks = chunks.len();
        for (idx, chunk) in chunks.enumerate() {
            t += chunk.len() as u128;
            let mut block = [0u8; 128];
            block[..chunk.len()].copy_from_slice(chunk);
            blake2b_compress(&mut h, &block, t, idx + 1 == num_chunks);
        }
    }
    let mut out = [0u8; 32];
    for i in 0..4 {
        out[i * 8..(i + 1) * 8].copy_from_slice(&h[i].to_le_bytes());
    }
    out
}
pub fn blake2b_256(data: &[u8]) -> [u8; 32] {
    blake2b_hash(&[], data)
}
pub fn blake2b_256_keyed(key: &[u8], data: &[u8]) -> [u8; 32] {
    blake2b_hash(key, data)
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KCC20State {
    pub amount: u64,
    pub owner_hex: String,
    pub owner_scheme: u8,
    pub borrow_scheme: u8,
    pub borrow_guard_hex: String,
    pub extension_commitment_hex: String,
    pub packed_state_hex: String,
    pub state_root_hex: String,
    pub covenant_id_hex: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SilverScriptCompilation {
    pub contract_name: String,
    pub ticker: String,
    pub token_standard: String,
    pub label: String,
    pub beneficiary_address: String,
    pub beneficiary_pubkey_hex: String,
    pub cliff_days: i64,
    pub cliff_timestamp: i64,
    pub linear_days: i64,
    pub total_allocation: f64,
    pub silverscript_source: String,
    pub redeem_script_hex: String,
    pub script_hash_hex: String,
    pub covenant_address: String,
    pub covenant_spk_hex: String,
    pub kcc20_state: KCC20State,
}
pub fn kaspa_polymod(values: &[u8]) -> u64 {
    let mut c: u64 = 1;
    for &v in values {
        let c0 = c >> 35;
        c = ((c & 0x07ffffffff) << 5) ^ (v as u64);
        if (c0 & 1) != 0 {
            c ^= 0x98f2bc8e61;
        }
        if (c0 & 2) != 0 {
            c ^= 0x79b76d99e2;
        }
        if (c0 & 4) != 0 {
            c ^= 0xf33e5fb3c4;
        }
        if (c0 & 8) != 0 {
            c ^= 0xae2eabe2a8;
        }
        if (c0 & 16) != 0 {
            c ^= 0x1e4f43e470;
        }
    }
    c ^ 1
}
pub fn encode_kaspa_bech32m_address(version: u8, hash32: &[u8; 32]) -> String {
    let prefix = b"kaspa";
    let mut prefix_values: Vec<u8> = prefix.iter().map(|b| b & 31).collect();
    prefix_values.push(0);
    let mut raw_payload = Vec::with_capacity(33);
    raw_payload.push(version);
    raw_payload.extend_from_slice(hash32);
    let mut payload5: Vec<u8> = Vec::with_capacity(54);
    let mut acc: u32 = 0;
    let mut bits: u32 = 0;
    for byte in raw_payload {
        acc = (acc << 8) | (byte as u32);
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            payload5.push(((acc >> bits) & 31) as u8);
        }
    }
    if bits > 0 {
        payload5.push(((acc << (5 - bits)) & 31) as u8);
    }
    let mut mod_input = Vec::with_capacity(prefix_values.len() + payload5.len() + 8);
    mod_input.extend_from_slice(&prefix_values);
    mod_input.extend_from_slice(&payload5);
    mod_input.extend_from_slice(&[0u8; 8]);
    let polymod = kaspa_polymod(&mod_input);
    let mut out = String::with_capacity(68);
    out.push_str("kaspa:");
    for &idx in &payload5 {
        out.push(KASPA_CHARSET[idx as usize] as char);
    }
    for i in 0..8 {
        let idx = ((polymod >> (5 * (7 - i))) & 31) as usize;
        out.push(KASPA_CHARSET[idx] as char);
    }
    out
}
pub fn decode_kaspa_address_payload(address: &str) -> Option<(u8, [u8; 32])> {
    let trimmed = address.trim().to_lowercase();
    let payload_str = trimmed.strip_prefix("kaspa:").unwrap_or(&trimmed);
    if payload_str.len() < 10 {
        return None;
    }
    let data_part = &payload_str[..payload_str.len().saturating_sub(8)];
    let mut words = Vec::with_capacity(data_part.len());
    for ch in data_part.bytes() {
        let pos = KASPA_CHARSET.iter().position(|&c| c == ch)?;
        words.push(pos as u8);
    }
    let mut decoded = Vec::with_capacity(34);
    let mut acc: u32 = 0;
    let mut bits: u32 = 0;
    for w in words {
        acc = (acc << 5) | (w as u32);
        bits += 5;
        while bits >= 8 {
            bits -= 8;
            decoded.push(((acc >> bits) & 0xff) as u8);
        }
    }
    if decoded.len() < 33 {
        return None;
    }
    let version = decoded[0];
    let mut hash32 = [0u8; 32];
    hash32.copy_from_slice(&decoded[1..33]);
    Some((version, hash32))
}
pub fn build_kcc20_state_commitment(
    ticker: &str,
    amount_base_units: u64,
    owner_bytes: &[u8; 32],
    owner_scheme: u8,
    borrow_scheme: u8,
    borrow_guard_bytes: &[u8; 32],
    charter_sha256_hex: Option<&str>,
) -> KCC20State {
    let clean_ticker = ticker.trim().to_uppercase();
    let ext_seed = format!(
        "{}:{}",
        clean_ticker,
        charter_sha256_hex.unwrap_or("PERENNIA_KCC20_CHARTER_V1")
    );
    let extension32 = blake2b_256(ext_seed.as_bytes());
    let mut packed = Vec::with_capacity(106);
    packed.extend_from_slice(&amount_base_units.to_le_bytes());
    packed.extend_from_slice(owner_bytes);
    packed.push(owner_scheme);
    packed.push(borrow_scheme);
    packed.extend_from_slice(borrow_guard_bytes);
    packed.extend_from_slice(&extension32);
    let state_root = blake2b_256_keyed(b"KCC20StateCommitment", &packed);
    let mut cov_preimage = Vec::with_capacity(16 + state_root.len());
    cov_preimage.extend_from_slice(format!("KCC-20:{}:", clean_ticker).as_bytes());
    cov_preimage.extend_from_slice(&state_root);
    let covenant_id = blake2b_256(&cov_preimage);
    KCC20State {
        amount: amount_base_units,
        owner_hex: hex::encode(owner_bytes),
        owner_scheme,
        borrow_scheme,
        borrow_guard_hex: hex::encode(borrow_guard_bytes),
        extension_commitment_hex: hex::encode(extension32),
        packed_state_hex: hex::encode(&packed),
        state_root_hex: hex::encode(state_root),
        covenant_id_hex: hex::encode(covenant_id),
    }
}
pub fn compile_silverscript_proof_of_lock_vault(
    ticker: &str,
    token_standard: &str,
    label: &str,
    beneficiary_address: &str,
    total_allocation: f64,
    cliff_days: i64,
    linear_days: i64,
    charter_sha256_hex: Option<&str>,
) -> SilverScriptCompilation {
    let clean_ticker = ticker.trim().to_uppercase();
    let clean_standard = if token_standard.trim().eq_ignore_ascii_case("KCC-20") {
        "KCC-20".to_string()
    } else {
        "KRC-20".to_string()
    };
    let clean_label = if label.trim().is_empty() {
        "Genesis Tranche".to_string()
    } else {
        label.trim().to_string()
    };
    let clamped_cliff = cliff_days.max(0);
    let clamped_linear = linear_days.max(0);
    let cliff_timestamp = CANONICAL_GENESIS_ANCHOR_EPOCH_SEC + clamped_cliff * 86_400;
    let (owner_scheme, beneficiary_pubkey) =
        if let Some((ver, hash)) = decode_kaspa_address_payload(beneficiary_address) {
            (ver, hash)
        } else {
            let fallback = blake2b_256(
                format!("PERENNIA_BENEFICIARY:{}", beneficiary_address.trim()).as_bytes(),
            );
            (KASPA_ADDR_VERSION_P2PK_SCHNORR, fallback)
        };
    let normalized_beneficiary =
        encode_kaspa_bech32m_address(owner_scheme, &beneficiary_pubkey);
    let beneficiary_pubkey_hex = hex::encode(beneficiary_pubkey);
    let alloc_int = total_allocation.max(0.0).round() as u64;
    let silverscript_source = format!(
        "pragma silverscript ^1.0.0;\n\n\
         // Perennia Sovereign Forge — L1 UTXO Proof-of-Lock & {} Covenant\n\
         // Ticker: {} | Tranche: {} | 22:00 UTC Daily Release\n\
         contract ProofOfLockVault(\n\
             pubkey beneficiary,\n\
             int cliffTimestamp,\n\
             int linearDays,\n\
             int totalAllocation\n\
         ) {{\n\
             // beneficiary     = 0x{}\n\
             // cliffTimestamp  = {} ({}d cliff)\n\
             // linearDays      = {} ({}d linear vesting)\n\
             // totalAllocation = {} {}\n\
             entrypoint function unlockTranche(sig beneficiarySig, int currentEpochTs, int claimAmount) {{\n\
                 require(checkSig(beneficiarySig, beneficiary));\n\
                 require(tx.time >= cliffTimestamp);\n\
                 require(currentEpochTs >= cliffTimestamp);\n\
                 int elapsedSeconds = currentEpochTs - cliffTimestamp;\n\
                 int linearDurationSeconds = linearDays * 86400;\n\
                 int maxVested = totalAllocation;\n\
                 if (linearDurationSeconds > 0 && elapsedSeconds < linearDurationSeconds) {{\n\
                     maxVested = (totalAllocation * elapsedSeconds) / linearDurationSeconds;\n\
                 }}\n\
                 require(claimAmount > 0 && claimAmount <= maxVested);\n\
                 bytes32 expectedSpk = new ScriptPublicKeyP2PK(beneficiary);\n\
                 require(tx.outputs[0].scriptPublicKey == expectedSpk);\n\
             }}\n\
         }}",
        clean_standard,
        clean_ticker,
        clean_label,
        beneficiary_pubkey_hex,
        cliff_timestamp,
        clamped_cliff,
        clamped_linear,
        clamped_linear,
        alloc_int,
        clean_ticker
    );
    let ast_digest = blake2b_256(silverscript_source.as_bytes());
    let mut redeem_script = Vec::with_capacity(98);
    redeem_script.push(0x20);
    redeem_script.extend_from_slice(&beneficiary_pubkey);
    redeem_script.extend_from_slice(&[0xac, 0x08]);
    redeem_script.extend_from_slice(&(cliff_timestamp as u64).to_le_bytes());
    redeem_script.extend_from_slice(&[0xb1, 0x75, 0x08]);
    redeem_script.extend_from_slice(&(clamped_linear as u64).to_le_bytes());
    redeem_script.extend_from_slice(&[0x75, 0x08]);
    redeem_script.extend_from_slice(&alloc_int.to_le_bytes());
    redeem_script.extend_from_slice(&[0x75, 0x20]);
    redeem_script.extend_from_slice(&ast_digest);
    redeem_script.extend_from_slice(&[0x75, 0x51]);
    let script_hash = blake2b_256(&redeem_script);
    let script_hash_hex = hex::encode(script_hash);
    let covenant_address =
        encode_kaspa_bech32m_address(KASPA_ADDR_VERSION_P2SH, &script_hash);
    let covenant_spk_hex = format!("a9{}87", script_hash_hex);
    let is_timelocked = clamped_cliff > 0 || clamped_linear > 0;
    let base_units = alloc_int.saturating_mul(100_000_000);
    let kcc20_state = build_kcc20_state_commitment(
        &clean_ticker,
        base_units,
        &beneficiary_pubkey,
        owner_scheme,
        if is_timelocked { 0x01 } else { 0x00 },
        &script_hash,
        charter_sha256_hex,
    );
    SilverScriptCompilation {
        contract_name: "ProofOfLockVault".to_string(),
        ticker: clean_ticker,
        token_standard: clean_standard,
        label: clean_label,
        beneficiary_address: normalized_beneficiary,
        beneficiary_pubkey_hex,
        cliff_days: clamped_cliff,
        cliff_timestamp,
        linear_days: clamped_linear,
        total_allocation,
        silverscript_source,
        redeem_script_hex: hex::encode(redeem_script),
        script_hash_hex,
        covenant_address,
        covenant_spk_hex,
        kcc20_state,
    }
}
pub fn silverscript_compilation_to_json(comp: &SilverScriptCompilation) -> Value {
    serde_json::to_value(comp).unwrap_or_else(|_| json!({}))
}
```

## File: .repomixignore
```
# Environment & Secret Configs
.env
.env.*
*.env
!.env.example

# Cryptographic Keys, Wallets & Seeds
*.pem
*.key
*.crt
*.p12
*.pfx
*.wallet
*.seed
*.mnemonic
*.kdbx
*secret*
*credentials*
id_rsa*
id_ed25519*

# Database Dumps & Local State
*.sql.gz
*.dump
*.db
*.sqlite
*.sqlite3
*.rdb

# Build Artifacts, Locks & Repomix Outputs
target/
Cargo.lock
node_modules/
*.log
repomix*
```

## File: build.rs
```rust
fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Tell Cargo to re-run this script if the proto files change
    println!("cargo:rerun-if-changed=proto/rpc.proto");
    println!("cargo:rerun-if-changed=proto/messages.proto");
    // Compile the Kaspa gRPC protobuf files into native Rust code
    tonic_build::configure()
        .build_server(false)
        .compile(
            &["proto/messages.proto", "proto/rpc.proto"],
            &["proto/"],
        )?;
    Ok(())
}
```

## File: Cargo.toml
```toml
# Cargo.toml



[package]

name = "perennia-stratum-rs"

version = "0.2.0"

edition = "2021"

description = "High-Performance Zero-Allocation Stratum Server for Kaspa Toccata (Streaming Oracle Edition)"

default-run = "perennia-stratum-rs"



[dependencies]

tokio = { version = "1.36", features = ["full"] }

tokio-util = { version = "0.7", features = ["codec"] }

bytes = "1.5" 

tokio-stream = "0.1"

tonic = "0.11"

prost = "0.12"

serde = { version = "1.0", features = ["derive"] }

serde_json = { version = "1.0", features = ["raw_value"] }

serde_yaml = "0.9" 

itoa = "1.0" 

prometheus = "0.13"

lazy_static = "1.4"

redis = { version = "0.25", features = ["tokio-comp"] }

anyhow = "1.0"

tracing = "0.1"

tracing-subscriber = { version = "0.3", features = ["env-filter"] }

dashmap = "6.0"

urlencoding = "2.1"

dotenvy = "0.15"



# 🛡️ SOVEREIGN WEBSOCKET ORACLE

tokio-tungstenite = { version = "0.21", features = ["rustls-tls-native-roots"] }

futures-util = "0.3"



# 🛡️ BRIDGE API ORCHESTRATION & SOR ROUTING MATRIX

axum = "0.7"

reqwest = { version = "0.12", features = ["json", "rustls-tls"] }

hex = "0.4"

sha2 = "0.10"

hmac = "0.12"

base64 = "0.21"



# 🛡️ SOVEREIGN INFRASTRUCTURE: PostgreSQL Yield Streaming WAL

sqlx = { version = "0.7", features = ["runtime-tokio-rustls", "postgres", "chrono", "uuid", "json"] }

chrono = { version = "0.4", features = ["serde"] }

uuid = { version = "1.8", features = ["v4", "serde"] }



# 🛡️ Enterprise Path A: Official Kaspa Consensus Core Cryptography

kaspa-consensus-core = { git = "https://github.com/kaspanet/rusty-kaspa", branch = "master" }

kaspa-hashes = { git = "https://github.com/kaspanet/rusty-kaspa", branch = "master" }

kaspa-math = { git = "https://github.com/kaspanet/rusty-kaspa", branch = "master" }

kaspa-pow = { git = "https://github.com/kaspanet/rusty-kaspa", branch = "master" } 

secp256k1 = { version = "0.29.0", features = ["global-context", "rand-std"] }



[build-dependencies]

tonic-build = "0.11" 



# ⚡ EXPLICIT TEST BINARY DECLARATION

[[bin]]

name = "dark_pool_stress"

path = "tests/dark_pool_stress.rs"

test = false



# ⚡ PRIMARY SERVER BINARY DECLARATION

[[bin]]

name = "perennia-stratum-rs"

path = "src/main.rs"



[profile.release]

opt-level = 3

lto = "fat"

codegen-units = 1

panic = "abort"
```

## File: docker-compose.yml
```yaml
version: '3.8'
services:
  haproxy:
    image: haproxy:2.8
    container_name: perennia-perimeter
    volumes:
      - ./haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro
    ports:
      - "3331:3331"
      - "3332:3332"
      - "3333:3333"
    network_mode: "host"
    restart: unless-stopped
```

## File: haproxy.cfg
```ini
# haproxy.cfg

# ==============================================================================

# PERENNIA ENTERPRISE STRATUM PERIMETER - DDOS SHIELD & TCP LOAD BALANCER

# ==============================================================================



global

    log /dev/log local0

    log /dev/log local1 notice

    stats timeout 30s

    daemon

    maxconn 100000



defaults

    log     global

    mode    tcp

    option  tcplog

    option  dontlognull

    timeout connect 5s

    timeout client  10m

    timeout server  10m

    # ⚡ DDoS Protection Defaults

    timeout client-fin 30s

    timeout server-fin 30s

    timeout http-request 10s



# ==============================================================================

# STRATUM TIER 1: GPU MINERS (Public: 3331 -> Rust: 6551)

# ==============================================================================

frontend stratum_t1_front

    bind *:3331

    mode tcp

    

    # Track IPs and reject if they exceed 150 connections per 10s or 1000 concurrent

    stick-table type ip size 1m expire 5m store conn_rate(10s),conn_cur

    tcp-request connection track-sc0 src

    tcp-request connection reject if { src_conn_rate ge 150 }

    tcp-request connection reject if { src_conn_cur ge 1000 }



    default_backend stratum_t1_back



backend stratum_t1_back

    mode tcp

    balance leastconn

    # send-proxy-v2 enforces the cryptographic envelope Rust demands

    server rust_node_1 127.0.0.1:6551 check maxconn 5000 send-proxy-v2



# ==============================================================================

# STRATUM TIER 2: HOME ASICS (Public: 3332 -> Rust: 6552)

# ==============================================================================

frontend stratum_t2_front

    bind *:3332

    mode tcp

    

    stick-table type ip size 1m expire 5m store conn_rate(10s),conn_cur

    tcp-request connection track-sc0 src

    tcp-request connection reject if { src_conn_rate ge 150 }

    tcp-request connection reject if { src_conn_cur ge 1000 }



    default_backend stratum_t2_back



backend stratum_t2_back

    mode tcp

    balance leastconn

    server rust_node_2 127.0.0.1:6552 check maxconn 5000 send-proxy-v2



# ==============================================================================

# STRATUM TIER 3: INDUSTRIAL WHALES (Public: 3333 -> Rust: 6553)

# ==============================================================================

frontend stratum_t3_front

    bind *:3333

    mode tcp

    

    stick-table type ip size 1m expire 5m store conn_rate(10s),conn_cur

    tcp-request connection track-sc0 src

    tcp-request connection reject if { src_conn_rate ge 150 }

    tcp-request connection reject if { src_conn_cur ge 1000 }



    default_backend stratum_t3_back



backend stratum_t3_back

    mode tcp

    balance leastconn

    server rust_node_3 127.0.0.1:6553 check maxconn 5000 send-proxy-v2
```

## File: src/diff_engine/mod.rs
```rust
use kaspa_consensus_core::header::Header;
use kaspa_math::Uint256;
use kaspa_pow::State;
const STRATUM_DIFF1_DIVISOR: u64 = 4_294_967_296;
pub fn verify_share(header: &Header, nonce: u64, min_share_diff: f64) -> (bool, bool) {
    let mut testing_header = header.clone();
    testing_header.nonce = nonce;
    let state = State::new(&testing_header);
    let (is_network_block, pow_hash) = state.check_pow(nonce);
    let clamped = if min_share_diff.is_finite() && min_share_diff > 0.0 { min_share_diff } else { 1.0 };
    let pool_target = if clamped >= 1.0 {
        let diff1 = Uint256::MAX / Uint256::from(STRATUM_DIFF1_DIVISOR);
        diff1 / Uint256::from(clamped.round().max(1.0) as u64)
    } else {
        let scaled = ((STRATUM_DIFF1_DIVISOR as f64) * clamped).round().max(1.0) as u64;
        Uint256::MAX / Uint256::from(scaled)
    };
    (pow_hash <= pool_target, is_network_block)
}
```

## File: src/kaspad_client/mod.rs
```rust
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::sync::{mpsc, RwLock};
use tokio_stream::wrappers::ReceiverStream;
use redis::AsyncCommands;
use dashmap::DashMap;
use serde_json::{json, Value};
use crate::config::StratumConfig;
use crate::job_manager::{JobManager, PendingBlockSubmission};
use std::env;
use std::time::Duration;
pub mod protowire {
    tonic::include_proto!("protowire");
}
use protowire::rpc_client::RpcClient;
use protowire::{
    KaspadRequest, GetBlockTemplateRequestMessage, NotifyBlockAddedRequestMessage,
    SubmitBlockRequestMessage, NotifyNewBlockTemplateRequestMessage,
    GetBlockDagInfoRequestMessage, GetBlockRewardInfoRequestMessage,
    GetBalanceByAddressRequestMessage, GetUtxosByAddressesRequestMessage,
    SubmitTransactionRequestMessage, RpcTransaction, RpcTransactionInput,
    RpcTransactionOutput, RpcOutpoint, RpcScriptPublicKey,
};
use protowire::kaspad_request::Payload as RequestPayload;
use protowire::kaspad_response::Payload as ResponsePayload;
static SUBMIT_REQ_COUNTER: AtomicU64 = AtomicU64::new(1_000_000);
static REWARD_REQ_COUNTER: AtomicU64 = AtomicU64::new(2_000_000);
static DIRECT_RPC_REQ_COUNTER: AtomicU64 = AtomicU64::new(5_000_000);
fn is_local_or_lan_endpoint(addr: &str) -> bool {
    let clean = addr
        .trim()
        .to_lowercase()
        .trim_start_matches("http://")
        .trim_start_matches("https://")
        .to_string();
    clean.starts_with("127.")
        || clean.starts_with("localhost")
        || clean.starts_with("192.168.")
        || clean.starts_with("10.")
        || clean.starts_with("172.16.")
        || clean.starts_with("172.17.")
        || clean.starts_with("172.18.")
        || clean.starts_with("172.19.")
        || clean.starts_with("172.2")
        || clean.starts_with("172.30.")
        || clean.starts_with("172.31.")
}
pub fn resolve_local_first_grpc_endpoints() -> Vec<String> {
    let mut raw_endpoints: Vec<String> = Vec::new();
    if let Ok(env_grpc) = env::var("KASPAD_GRPC_URL") {
        let trimmed = env_grpc.trim().to_string();
        if !trimmed.is_empty() {
            raw_endpoints.push(trimmed);
        }
    }
    if let Ok(env_ip) = env::var("KASPA_NODE_IP") {
        let trimmed = env_ip.trim().to_string();
        if !trimmed.is_empty() {
            let candidate = if trimmed.contains(':') {
                trimmed
            } else {
                format!("{}:16110", trimmed)
            };
            if !raw_endpoints.contains(&candidate) {
                raw_endpoints.push(candidate);
            }
        }
    }
    if let Ok(cfg) = StratumConfig::load("config.yaml") {
        for addr in cfg.kaspad_addresses {
            let trimmed = addr.trim().to_string();
            if !trimmed.is_empty() && !raw_endpoints.contains(&trimmed) {
                raw_endpoints.push(trimmed);
            }
        }
    }
    if raw_endpoints.is_empty() {
        raw_endpoints.push("127.0.0.1:16110".to_string());
    }
    let mut local_endpoints = Vec::new();
    let mut remote_endpoints = Vec::new();
    for ep in raw_endpoints {
        let formatted = if ep.starts_with("http://") || ep.starts_with("https://") {
            ep
        } else {
            format!("http://{}", ep)
        };
        if is_local_or_lan_endpoint(&formatted) {
            local_endpoints.push(formatted);
        } else {
            remote_endpoints.push(formatted);
        }
    }
    local_endpoints.extend(remote_endpoints);
    local_endpoints
}
async fn execute_single_grpc_request(payload: RequestPayload) -> Result<ResponsePayload, String> {
    let endpoints = resolve_local_first_grpc_endpoints();
    let mut last_err = String::from("No kaspad gRPC endpoints configured");
    for endpoint in endpoints {
        let connect_res = tokio::time::timeout(
            Duration::from_millis(2500),
            RpcClient::connect(endpoint.clone()),
        )
        .await;
        let mut client = match connect_res {
            Ok(Ok(c)) => c,
            Ok(Err(e)) => {
                last_err = format!("{} connect error: {}", endpoint, e);
                continue;
            }
            Err(_) => {
                last_err = format!("{} connect timeout", endpoint);
                continue;
            }
        };
        let (tx, rx) = mpsc::channel::<KaspadRequest>(2);
        let req_id = DIRECT_RPC_REQ_COUNTER.fetch_add(1, Ordering::Relaxed);
        let _ = tx
            .send(KaspadRequest {
                id: req_id,
                payload: Some(payload.clone()),
            })
            .await;
        let stream_res = tokio::time::timeout(
            Duration::from_millis(3500),
            client.message_stream(ReceiverStream::new(rx)),
        )
        .await;
        let mut response_stream = match stream_res {
            Ok(Ok(resp)) => resp.into_inner(),
            Ok(Err(e)) => {
                last_err = format!("{} stream error: {}", endpoint, e);
                continue;
            }
            Err(_) => {
                last_err = format!("{} stream timeout", endpoint);
                continue;
            }
        };
        match tokio::time::timeout(Duration::from_millis(3500), response_stream.message()).await {
            Ok(Ok(Some(msg))) => {
                if let Some(resp_payload) = msg.payload {
                    return Ok(resp_payload);
                }
                last_err = format!("{} returned empty gRPC payload", endpoint);
            }
            Ok(Ok(None)) => {
                last_err = format!("{} closed gRPC stream without response", endpoint);
            }
            Ok(Err(e)) => {
                last_err = format!("{} message error: {}", endpoint, e);
            }
            Err(_) => {
                last_err = format!("{} response timeout", endpoint);
            }
        }
    }
    Err(last_err)
}
pub async fn get_balance_by_address_grpc(address: &str) -> Result<u64, String> {
    let clean = address.trim().to_lowercase().replace("kaspa:", "");
    let formatted = format!("kaspa:{}", clean);
    let req = RequestPayload::GetBalanceByAddressRequest(GetBalanceByAddressRequestMessage {
        address: formatted,
    });
    match execute_single_grpc_request(req).await? {
        ResponsePayload::GetBalanceByAddressResponse(res) => {
            if let Some(err) = res.error {
                return Err(format!("kaspad gRPC GetBalanceByAddress error: {}", err.message));
            }
            Ok(res.balance)
        }
        _ => Err("Unexpected gRPC response variant for GetBalanceByAddress".to_string()),
    }
}
pub async fn get_utxos_by_address_grpc(address: &str) -> Result<Vec<Value>, String> {
    let clean = address.trim().to_lowercase().replace("kaspa:", "");
    let formatted = format!("kaspa:{}", clean);
    let req = RequestPayload::GetUtxosByAddressesRequest(GetUtxosByAddressesRequestMessage {
        addresses: vec![formatted],
    });
    match execute_single_grpc_request(req).await? {
        ResponsePayload::GetUtxosByAddressesResponse(res) => {
            if let Some(err) = res.error {
                return Err(format!("kaspad gRPC GetUtxosByAddresses error: {}", err.message));
            }
            let mut entries = Vec::with_capacity(res.entries.len());
            for entry in res.entries {
                let (Some(outpoint), Some(utxo_entry)) = (entry.outpoint, entry.utxo_entry) else {
                    continue;
                };
                let (spk_version, spk_hex) = match utxo_entry.script_public_key {
                    Some(spk) => (spk.version, spk.script_public_key),
                    None => (0, String::new()),
                };
                entries.push(json!({
                    "address": entry.address,
                    "outpoint": {
                        "transactionId": outpoint.transaction_id,
                        "index": outpoint.index
                    },
                    "utxoEntry": {
                        "amount": utxo_entry.amount.to_string(),
                        "scriptPublicKey": {
                            "version": spk_version,
                            "scriptPublicKey": spk_hex
                        },
                        "blockDaaScore": utxo_entry.block_daa_score.to_string(),
                        "isCoinbase": utxo_entry.is_coinbase
                    }
                }));
            }
            Ok(entries)
        }
        _ => Err("Unexpected gRPC response variant for GetUtxosByAddresses".to_string()),
    }
}
fn parse_json_to_rpc_transaction(tx_payload: &Value) -> Result<RpcTransaction, String> {
    let tx_obj = tx_payload.get("transaction").unwrap_or(tx_payload);
    let version = tx_obj
        .get("version")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    let lock_time = tx_obj
        .get("lockTime")
        .or_else(|| tx_obj.get("lock_time"))
        .and_then(|v| v.as_u64())
        .unwrap_or(0);
    let subnetwork_id = tx_obj
        .get("subnetworkId")
        .or_else(|| tx_obj.get("subnetwork_id"))
        .and_then(|v| v.as_str())
        .unwrap_or("0000000000000000000000000000000000000000")
        .to_string();
    let gas = tx_obj.get("gas").and_then(|v| v.as_u64()).unwrap_or(0);
    let payload = tx_obj
        .get("payload")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let raw_inputs = tx_obj
        .get("inputs")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Transaction JSON missing inputs array".to_string())?;
    let mut inputs = Vec::with_capacity(raw_inputs.len());
    for inp in raw_inputs {
        let prev = inp.get("previousOutpoint").unwrap_or(inp);
        let tx_id = prev
            .get("transactionId")
            .or_else(|| prev.get("transaction_id"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Input missing previousOutpoint.transactionId".to_string())?
            .to_string();
        let index = prev
            .get("index")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
        let signature_script = inp
            .get("signatureScript")
            .or_else(|| inp.get("signature_script"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        let sequence = inp.get("sequence").and_then(|v| v.as_u64()).unwrap_or(0);
        let sig_op_count = inp
            .get("sigOpCount")
            .or_else(|| inp.get("sig_op_count"))
            .and_then(|v| v.as_u64())
            .unwrap_or(1) as u32;
        inputs.push(RpcTransactionInput {
            previous_outpoint: Some(RpcOutpoint {
                transaction_id: tx_id,
                index,
            }),
            signature_script,
            sequence,
            sig_op_count,
            ..Default::default()
        });
    }
    let raw_outputs = tx_obj
        .get("outputs")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Transaction JSON missing outputs array".to_string())?;
    let mut outputs = Vec::with_capacity(raw_outputs.len());
    for out in raw_outputs {
        let amount = out
            .get("amount")
            .or_else(|| out.get("value"))
            .and_then(|v| {
                v.as_u64()
                    .or_else(|| v.as_f64().map(|f| f.round() as u64))
                    .or_else(|| v.as_str().and_then(|s| s.parse::<u64>().ok()))
            })
            .ok_or_else(|| "Output missing amount".to_string())?;
        let spk_field = out.get("scriptPublicKey").or_else(|| out.get("script_public_key"));
        let (spk_version, spk_hex) = match spk_field {
            Some(Value::String(s)) => (0u32, s.clone()),
            Some(Value::Object(map)) => {
                let ver = map
                    .get("version")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0) as u32;
                let hex_str = map
                    .get("scriptPublicKey")
                    .or_else(|| map.get("script_public_key"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .to_string();
                (ver, hex_str)
            }
            _ => return Err("Output missing scriptPublicKey".to_string()),
        };
        outputs.push(RpcTransactionOutput {
            amount,
            script_public_key: Some(RpcScriptPublicKey {
                version: spk_version,
                script_public_key: spk_hex,
            }),
            ..Default::default()
        });
    }
    Ok(RpcTransaction {
        version,
        inputs,
        outputs,
        lock_time,
        subnetwork_id,
        gas,
        payload,
        ..Default::default()
    })
}
pub async fn submit_transaction_grpc(tx_payload: &Value, allow_orphan: bool) -> Result<String, String> {
    let rpc_tx = parse_json_to_rpc_transaction(tx_payload)?;
    let req = RequestPayload::SubmitTransactionRequest(SubmitTransactionRequestMessage {
        transaction: Some(rpc_tx),
        allow_orphan,
    });
    match execute_single_grpc_request(req).await? {
        ResponsePayload::SubmitTransactionResponse(res) => {
            if let Some(err) = res.error {
                return Err(format!("kaspad gRPC SubmitTransaction rejected: {}", err.message));
            }
            if res.transaction_id.trim().is_empty() {
                return Err("kaspad gRPC SubmitTransaction returned empty transaction_id".to_string());
            }
            Ok(res.transaction_id)
        }
        _ => Err("Unexpected gRPC response variant for SubmitTransaction".to_string()),
    }
}
pub async fn start_kaspad_client(
    config: Arc<StratumConfig>,
    job_manager: Arc<JobManager>,
    mut block_submit_rx: mpsc::Receiver<PendingBlockSubmission>,
    valid_share_tx: mpsc::Sender<(String, f64, bool)>,
    daa_tx: tokio::sync::broadcast::Sender<u64>,
    utxo_tx: tokio::sync::broadcast::Sender<protowire::UtxosChangedNotificationMessage>
) -> anyhow::Result<()> {
    tracing::info!("🔌 Connecting to Distributed Redis Cluster for Frontend UI...");
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());
    let redis_client = redis::Client::open(redis_url)?;
    let mut redis_conn = redis_client.get_multiplexed_async_connection().await?;
    let active_node_tx = Arc::new(RwLock::new(None::<mpsc::Sender<KaspadRequest>>));
    let active_tx_clone = active_node_tx.clone();
    let pending_submissions: Arc<DashMap<u64, PendingBlockSubmission>> = Arc::new(DashMap::new());
    let pending_submissions_writer = pending_submissions.clone();
    tokio::spawn(async move {
        while let Some(submission) = block_submit_rx.recv().await {
            tracing::info!(
                "🚀🚀🚀 DISPATCHING BLOCK {} (Diff: {:.2}) TO MAINNET CONVERGENCE LAYER 🚀🚀🚀",
                submission.block_hash,
                submission.network_diff
            );
            let req_id = SUBMIT_REQ_COUNTER.fetch_add(1, Ordering::SeqCst);
            let winning_block = submission.block.clone();
            pending_submissions_writer.insert(req_id, submission);
            let req = KaspadRequest {
                id: req_id,
                payload: Some(RequestPayload::SubmitBlockRequest(SubmitBlockRequestMessage {
                    block: Some(winning_block),
                    allow_non_daa_blocks: false,
                })),
            };
            if let Some(tx) = &*active_tx_clone.read().await {
                if tx.send(req).await.is_err() {
                    pending_submissions_writer.remove(&req_id);
                    tracing::error!("❌ FAILED TO DISPATCH BLOCK: Node request stream closed!");
                }
            } else {
                pending_submissions_writer.remove(&req_id);
                tracing::error!("❌ FAILED TO DISPATCH BLOCK: No active node connected!");
            }
        }
    });
    let mut current_node_idx = 0;
    let node_array = if config.kaspad_addresses.is_empty() {
        vec!["127.0.0.1:16110".to_string()]
    } else {
        config.kaspad_addresses.clone()
    };
    let mut watched_addresses = vec![config.mining_address.clone()];
    if let Ok(env_treasury) = env::var("PERENNIA_TREASURY_KAS_ADDRESS") {
        let formatted = format!("kaspa:{}", env_treasury.trim().replace("kaspa:", ""));
        if !watched_addresses.contains(&formatted) {
            watched_addresses.push(formatted);
        }
    }
    // ROUND-ROBIN FAILOVER LOOP
    loop {
        let mut url = node_array[current_node_idx].clone();
        if !url.starts_with("http") {
            url = format!("http://{}", url);
        }
        tracing::info!("🔗 Booting gRPC Uplink to Upstream Node: {}", url);
        match RpcClient::connect(url.clone()).await {
            Ok(mut client) => {
                tracing::info!("✅ Uplink Established to {}. Subscribing to DAG consensus...", url);
                let (tx, rx) = mpsc::channel::<KaspadRequest>(256);
                let request_stream = ReceiverStream::new(rx);
                *active_node_tx.write().await = Some(tx.clone());
                match client.message_stream(request_stream).await {
                    Ok(response) => {
                        let mut response_stream = response.into_inner();
                        let _ = tx.send(KaspadRequest {
                            id: 1,
                            payload: Some(RequestPayload::NotifyBlockAddedRequest(NotifyBlockAddedRequestMessage { command: 0 })),
                        }).await;
                        let _ = tx.send(KaspadRequest {
                            id: 2,
                            payload: Some(RequestPayload::NotifyNewBlockTemplateRequest(NotifyNewBlockTemplateRequestMessage { command: 0 })),
                        }).await;
                        let _ = tx.send(KaspadRequest {
                            id: 3,
                            payload: Some(RequestPayload::GetBlockTemplateRequest(GetBlockTemplateRequestMessage {
                                pay_address: config.mining_address.clone(),
                                extra_data: "Perennia-Zero-Allocation".to_string(),
                            })),
                        }).await;
                        let _ = tx.send(KaspadRequest {
                            id: 4,
                            payload: Some(RequestPayload::NotifyVirtualDaaScoreChangedRequest(
                                protowire::NotifyVirtualDaaScoreChangedRequestMessage { command: 0 }
                            )),
                        }).await;
                        let _ = tx.send(KaspadRequest {
                            id: 5,
                            payload: Some(RequestPayload::NotifyUtxosChangedRequest(
                                protowire::NotifyUtxosChangedRequestMessage {
                                    addresses: watched_addresses.clone(),
                                    command: 0,
                                }
                            )),
                        }).await;
                        let _ = tx.send(KaspadRequest {
                            id: 6,
                            payload: Some(RequestPayload::GetBlockDagInfoRequest(GetBlockDagInfoRequestMessage {})),
                        }).await;
                        let tx_poll = tx.clone();
                        let mining_address_poll = config.mining_address.clone();
                        let poll_task = tokio::spawn(async move {
                            let mut interval = tokio::time::interval(tokio::time::Duration::from_millis(1000));
                            let mut req_id = 50000;
                            loop {
                                interval.tick().await;
                                req_id += 1;
                                let req_template = KaspadRequest {
                                    id: req_id,
                                    payload: Some(RequestPayload::GetBlockTemplateRequest(GetBlockTemplateRequestMessage {
                                        pay_address: mining_address_poll.clone(),
                                        extra_data: "Perennia-Zero-Allocation".to_string(),
                                    })),
                                };
                                if tx_poll.send(req_template).await.is_err() { break; }
                                req_id += 1;
                                let req_dag = KaspadRequest {
                                    id: req_id,
                                    payload: Some(RequestPayload::GetBlockDagInfoRequest(GetBlockDagInfoRequestMessage {})),
                                };
                                if tx_poll.send(req_dag).await.is_err() { break; }
                            }
                        });
                        let mining_address = config.mining_address.clone();
                        let tx_clone = tx.clone();
                        let mut req_id = 10;
                        let mut sync_warned = false;
                        let mut last_queried_reward_hash = String::new();
                        let mut has_live_grpc_reward = false;
                        while let Ok(Some(response)) = response_stream.message().await {
                            match response.payload {
                                Some(ResponsePayload::GetBlockTemplateResponse(res)) => {
                                    if let Some(err) = res.error {
                                        tracing::error!("❌ GET_BLOCK_TEMPLATE REJECTED BY NODE: {}", err.message);
                                    } else if !res.is_synced {
                                        if !sync_warned {
                                            tracing::warn!("⏳ Kaspa Node is currently syncing (IBD). Awaiting network convergence...");
                                            sync_warned = true;
                                        }
                                    } else if let Some(block) = res.block {
                                        sync_warned = false;
                                        let parent_hash_opt = block
                                            .header
                                            .as_ref()
                                            .and_then(|h| h.parents.first())
                                            .and_then(|lvl| lvl.parent_hashes.first())
                                            .cloned();
                                        if let Some(header) = &block.header {
                                            tracing::debug!("🧊 Toccata Block Template Acquired! Blue Score: {}", header.blue_score);
                                            let set_res: redis::RedisResult<()> = redis_conn.set("perennia:node:sync_status", "Online").await;
                                            if set_res.is_err() {
                                                if let Ok(new_conn) = redis_client.get_multiplexed_async_connection().await {
                                                    redis_conn = new_conn;
                                                }
                                            }
                                            if header.daa_score > 0 {
                                                let _: redis::RedisResult<()> = redis_conn.set("pool:virtual_daa_score", header.daa_score).await;
                                            }
                                        }
                                        let (template_net_diff, coinbase_reward_sompi) = job_manager.process_new_block(block);
                                        if template_net_diff > 0.0 {
                                            let _: redis::RedisResult<()> = redis_conn.set("pool:network_diff", template_net_diff).await;
                                        }
                                        if coinbase_reward_sompi > 0 && !has_live_grpc_reward {
                                            job_manager.update_latest_reward_sompi(coinbase_reward_sompi);
                                            let reward_kas = coinbase_reward_sompi as f64 / 100_000_000.0;
                                            let _: redis::RedisResult<()> = redis_conn.set("pool:block_reward", reward_kas).await;
                                            let _: redis::RedisResult<()> = redis_conn.set("pool:block_reward_sompi", coinbase_reward_sompi).await;
                                            tracing::debug!("🎯 [CONSENSUS COINBASE] Block Reward: {:.8} KAS ({} sompi)", reward_kas, coinbase_reward_sompi);
                                        }
                                        if let Some(parent_hash) = parent_hash_opt {
                                            if !parent_hash.is_empty() && parent_hash != last_queried_reward_hash {
                                                last_queried_reward_hash = parent_hash.clone();
                                                let reward_req_id = REWARD_REQ_COUNTER.fetch_add(1, Ordering::SeqCst);
                                                let _ = tx_clone.send(KaspadRequest {
                                                    id: reward_req_id,
                                                    payload: Some(RequestPayload::GetBlockRewardInfoRequest(
                                                        GetBlockRewardInfoRequestMessage { hash: parent_hash }
                                                    )),
                                                }).await;
                                            }
                                        }
                                    }
                                }
                                Some(ResponsePayload::GetBlockDagInfoResponse(res)) => {
                                    if let Some(err) = res.error {
                                        tracing::error!("❌ GET_BLOCK_DAG_INFO REJECTED: {}", err.message);
                                    } else {
                                        if res.difficulty > 0.0 {
                                            job_manager.update_latest_network_diff(res.difficulty);
                                            let _: redis::RedisResult<()> = redis_conn.set("pool:network_diff", res.difficulty).await;
                                        }
                                        if res.virtual_daa_score > 0 {
                                            let _: redis::RedisResult<()> = redis_conn.set("pool:virtual_daa_score", res.virtual_daa_score).await;
                                        }
                                        if !res.sink.is_empty() && res.sink != last_queried_reward_hash {
                                            last_queried_reward_hash = res.sink.clone();
                                            let reward_req_id = REWARD_REQ_COUNTER.fetch_add(1, Ordering::SeqCst);
                                            let _ = tx_clone.send(KaspadRequest {
                                                id: reward_req_id,
                                                payload: Some(RequestPayload::GetBlockRewardInfoRequest(
                                                    GetBlockRewardInfoRequestMessage { hash: res.sink }
                                                )),
                                            }).await;
                                        }
                                    }
                                }
                                Some(ResponsePayload::GetBlockRewardInfoResponse(res)) => {
                                    if res.error.is_none() {
                                        if let Some(reward_sompi) = res.reward_amount {
                                            if reward_sompi > 0 {
                                                has_live_grpc_reward = true;
                                                job_manager.update_latest_reward_sompi(reward_sompi);
                                                let reward_kas = reward_sompi as f64 / 100_000_000.0;
                                                let _: redis::RedisResult<()> = redis_conn.set("pool:block_reward", reward_kas).await;
                                                let _: redis::RedisResult<()> = redis_conn.set("pool:block_reward_sompi", reward_sompi).await;
                                                tracing::debug!(
                                                    "🎯 [GRPC REWARD ORACLE] Exact Block Reward (Base + TX Fees): {:.8} KAS ({} sompi)",
                                                    reward_kas,
                                                    reward_sompi
                                                );
                                            }
                                        } else if let Some(header) = res.header {
                                            if let Some(parent_hash) = header.parents.first().and_then(|p| p.parent_hashes.first()) {
                                                if !parent_hash.is_empty() && *parent_hash != last_queried_reward_hash {
                                                    last_queried_reward_hash = parent_hash.clone();
                                                    let reward_req_id = REWARD_REQ_COUNTER.fetch_add(1, Ordering::SeqCst);
                                                    let _ = tx_clone.send(KaspadRequest {
                                                        id: reward_req_id,
                                                        payload: Some(RequestPayload::GetBlockRewardInfoRequest(
                                                            GetBlockRewardInfoRequestMessage { hash: parent_hash.clone() }
                                                        )),
                                                    }).await;
                                                }
                                            }
                                        }
                                    }
                                }
                                Some(ResponsePayload::BlockAddedNotification(_)) |
                                Some(ResponsePayload::NewBlockTemplateNotification(_)) => {
                                    req_id += 1;
                                    let _ = tx_clone.send(KaspadRequest {
                                        id: req_id,
                                        payload: Some(RequestPayload::GetBlockTemplateRequest(GetBlockTemplateRequestMessage {
                                            pay_address: mining_address.clone(),
                                            extra_data: "Perennia-Zero-Allocation".to_string(),
                                        })),
                                    }).await;
                                }
                                Some(ResponsePayload::SubmitBlockResponse(res)) => {
                                    let submission_opt = pending_submissions
                                        .remove(&response.id)
                                        .map(|(_, v)| v)
                                        .or_else(|| {
                                            let oldest_key = pending_submissions.iter().next().map(|entry| *entry.key());
                                            oldest_key.and_then(|k| pending_submissions.remove(&k).map(|(_, v)| v))
                                        });
                                    if let Some(err) = res.error {
                                        tracing::error!("❌ BLOCK VALIDATION ERROR (RejectReason {}): {}", res.reject_reason, err.message);
                                    } else if res.reject_reason != 0 {
                                        tracing::error!("❌ BLOCK REJECTED BY CONSENSUS (RejectReason {})", res.reject_reason);
                                    } else {
                                        tracing::info!("💰💰💰 BLOCK ACCEPTED! CONVERGENCE SETTLED. REWARD LOCKED. 💰💰💰");
                                        if let Some(sub) = submission_opt {
                                            let resolved_reward_sompi = if sub.reward_sompi > 0 {
                                                sub.reward_sompi
                                            } else {
                                                job_manager.get_latest_reward_sompi()
                                            };
                                            let resolved_reward_kas = resolved_reward_sompi as f64 / 100_000_000.0;
                                            let block_daa_score = sub
                                                .block
                                                .header
                                                .as_ref()
                                                .map(|h| h.daa_score)
                                                .unwrap_or(0);
                                            let _ = valid_share_tx.send((sub.worker.clone(), 0.0, true)).await;
                                            let block_event = serde_json::json!({
                                                "worker": sub.worker,
                                                "block_hash": sub.block_hash,
                                                "nonce": sub.nonce,
                                                "network_diff": sub.network_diff,
                                                "reward_sompi": resolved_reward_sompi,
                                                "reward_kas": resolved_reward_kas,
                                                "daa_score": block_daa_score
                                            });
                                            let _: redis::RedisResult<()> = redis::cmd("RPUSH")
                                                .arg("perennia:oracle:block_buffer")
                                                .arg(block_event.to_string())
                                                .query_async(&mut redis_conn)
                                                .await;
                                            let reward_req_id = REWARD_REQ_COUNTER.fetch_add(1, Ordering::SeqCst);
                                            let _ = tx_clone.send(KaspadRequest {
                                                id: reward_req_id,
                                                payload: Some(RequestPayload::GetBlockRewardInfoRequest(
                                                    GetBlockRewardInfoRequestMessage { hash: sub.block_hash }
                                                )),
                                            }).await;
                                        }
                                    }
                                }
                                Some(ResponsePayload::VirtualDaaScoreChangedNotification(msg)) => {
                                    if msg.virtual_daa_score > 0 {
                                        let _: redis::RedisResult<()> = redis_conn.set("pool:virtual_daa_score", msg.virtual_daa_score).await;
                                    }
                                    let _ = daa_tx.send(msg.virtual_daa_score);
                                }
                                Some(ResponsePayload::UtxosChangedNotification(msg)) => {
                                    let _ = utxo_tx.send(msg);
                                }
                                _ => {}
                            }
                        }
                        poll_task.abort();
                        *active_node_tx.write().await = None;
                        pending_submissions.clear();
                        tracing::error!("🚨 Node {} dropped the gRPC connection.", url);
                    }
                    Err(e) => {
                        *active_node_tx.write().await = None;
                        pending_submissions.clear();
                        tracing::error!("⚠️ Failed to establish gRPC stream to {}: {}", url, e);
                    }
                }
            }
            Err(e) => {
                tracing::warn!("⚠️ Node {} is unreachable: {}. Moving to failover...", url, e);
            }
        }
        let _: redis::RedisResult<()> = redis_conn.set("perennia:node:sync_status", "Failover Reconnecting").await;
        current_node_idx = (current_node_idx + 1) % node_array.len();
        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
    }
}
```

## File: src/chronos.rs
```rust
#[path = "chronos/netting.rs"]
pub mod netting;
#[path = "chronos/forge_bell.rs"]
pub mod forge_bell;
#[path = "chronos/daemons.rs"]
pub mod daemons;
pub use daemons::*;
pub use forge_bell::*;
pub use netting::*;
use chrono::{Timelike, Utc};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::Sha256;
use sqlx::{PgPool, Row};
use std::env;
use std::time::Duration;
type HmacSha256 = Hmac<Sha256>;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemTreasuryConfig {
    pub config_id: String,
    pub hot_ceiling_kas: f64,
    pub min_runway_kas: f64,
    pub fpps_max_float_kas: f64,
    pub pool_fee_rate: f64,
    pub outflow_breaker_tripped: bool,
    pub cold_kas_address: String,
    pub cold_btc_address: String,
    pub cold_eth_address: String,
    pub cold_sol_address: String,
    pub updated_by: String,
    pub updated_at: String,
}
pub fn resolve_master_treasury_address() -> String {
    env::var("PERENNIA_MASTER_TREASURY_KAS")
        .or_else(|_| env::var("MASTER_ADMIN_ADDRESS"))
        .or_else(|_| env::var("MASTER_TREASURY_ADDRESS"))
        .ok()
        .map(|s| s.trim().to_lowercase().replace("kaspa:", "").trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_default()
}
pub fn resolve_master_treasury_prefixed() -> Result<String, String> {
    let clean = resolve_master_treasury_address();
    if clean.len() < 55 {
        return Err(
            "CONFIG_HALT: PERENNIA_MASTER_TREASURY_KAS is not configured in .env.".to_string(),
        );
    }
    Ok(format!("kaspa:{}", clean))
}
pub fn resolve_hot_dispatcher_address() -> Option<String> {
    env::var("PERENNIA_HOT_KAS_ADDRESS")
        .or_else(|_| env::var("PERENNIA_TREASURY_KAS_ADDRESS"))
        .ok()
        .map(|s| s.trim().to_lowercase().replace("kaspa:", "").trim().to_string())
        .filter(|s| s.len() >= 55)
        .map(|clean| format!("kaspa:{}", clean))
}
fn resolve_ledger_hmac_secret() -> Result<Vec<u8>, String> {
    let raw = env::var("LEDGER_HMAC_SECRET")
        .or_else(|_| env::var("KYC_MASTER_KEY"))
        .map(|s| s.trim().to_string())
        .unwrap_or_default();
    if raw.len() < 32 {
        return Err(
            "CRITICAL_SECURITY_LOCKDOWN: LEDGER_HMAC_SECRET or KYC_MASTER_KEY (min 32 chars) must be set in .env."
                .to_string(),
        );
    }
    Ok(raw.into_bytes())
}
pub fn canonicalize_lp_tokens_for_hmac(lp_tokens: &Value) -> String {
    let Some(obj) = lp_tokens.as_object() else {
        return "{}".to_string();
    };
    let mut pairs: Vec<(String, f64)> = obj
        .iter()
        .map(|(k, v)| {
            let amt = v
                .as_f64()
                .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
                .unwrap_or(0.0);
            (k.trim().to_uppercase(), (amt * 1e8).round() / 1e8)
        })
        .filter(|(_, amt)| *amt > 1e-8)
        .collect();
    pairs.sort_by(|a, b| a.0.cmp(&b.0));
    let formatted: Vec<String> = pairs
        .into_iter()
        .map(|(k, v)| format!("{}:{:.8}", k, v))
        .collect();
    format!("{{{}}}", formatted.join(","))
}
pub fn compute_reservoir_hmac(
    wallet_address: &str,
    streaming_balance_kas: f64,
    total_yield_kas: f64,
    lp_tokens: &Value,
) -> Result<String, String> {
    let secret = resolve_ledger_hmac_secret()?;
    let clean_wallet = wallet_address
        .trim()
        .to_lowercase()
        .replace("kaspa:", "")
        .trim()
        .to_string();
    let canonical_lp = canonicalize_lp_tokens_for_hmac(lp_tokens);
    let preimage = format!(
        "PERENNIA_RESERVOIR_V1|kaspa:{}|{:.8}|{:.8}|{}",
        clean_wallet,
        (streaming_balance_kas.max(0.0) * 1e8).round() / 1e8,
        (total_yield_kas.max(0.0) * 1e8).round() / 1e8,
        canonical_lp
    );
    let mut mac = HmacSha256::new_from_slice(&secret)
        .map_err(|e| format!("HMAC initialization failed: {}", e))?;
    mac.update(preimage.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}
fn constant_time_hex_eq(a: &str, b: &str) -> bool {
    let a_bytes = a.trim().as_bytes();
    let b_bytes = b.trim().as_bytes();
    if a_bytes.len() != b_bytes.len() || a_bytes.is_empty() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in a_bytes.iter().zip(b_bytes.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
pub async fn quarantine_single_wallet(
    pool: &PgPool,
    wallet_address: &str,
    reason: &str,
) {
    let clean = wallet_address
        .trim()
        .to_lowercase()
        .replace("kaspa:", "")
        .trim()
        .to_string();
    let prefixed = format!("kaspa:{}", clean);
    tracing::error!(
        "🚨 [LEDGER INVARIANT QUARANTINE] Quarantining single wallet {} | Reason: {}",
        prefixed,
        reason
    );
    let _ = sqlx::query(
        r#"
        UPDATE yield_reservoirs
        SET quarantined = TRUE,
            quarantine_reason = $3,
            quarantined_at = CURRENT_TIMESTAMP,
            last_updated = CURRENT_TIMESTAMP
        WHERE wallet_address = $1 OR wallet_address = $2
        "#,
    )
    .bind(&prefixed)
    .bind(&clean)
    .bind(reason)
    .execute(pool)
    .await;
}
pub async fn verify_wallet_ledger_invariant_or_quarantine(
    pool: &PgPool,
    wallet_address: &str,
    requested_kas_debit: f64,
) -> Result<(), String> {
    let clean = wallet_address
        .trim()
        .to_lowercase()
        .replace("kaspa:", "")
        .trim()
        .to_string();
    let prefixed = format!("kaspa:{}", clean);
    let sys_cfg = load_system_treasury_config(pool).await;
    if sys_cfg.outflow_breaker_tripped {
        return Err(
            "CIRCUIT_BREAKER_TRIPPED: Director has paused automated L1 outflows.".to_string(),
        );
    }
    let row_opt = sqlx::query(
        r#"
        SELECT wallet_address, streaming_balance_kas, total_yield_kas,
               COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens,
               COALESCE(verified_onchain_credits_kas, 0.0) AS verified_onchain_credits_kas,
               COALESCE(row_hmac_sig, '') AS row_hmac_sig,
               COALESCE(quarantined, FALSE) AS quarantined,
               quarantine_reason
        FROM yield_reservoirs
        WHERE wallet_address = $1 OR wallet_address = $2
        ORDER BY streaming_balance_kas DESC
        LIMIT 1
        "#,
    )
    .bind(&prefixed)
    .bind(&clean)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to query yield_reservoirs invariant: {}", e))?;
    let Some(row) = row_opt else {
        if requested_kas_debit > 0.0 {
            return Err(format!(
                "INSUFFICIENT_VERIFIED_RESERVOIR: No yield_reservoirs record found for {}.",
                prefixed
            ));
        }
        return Ok(());
    };
    let is_quarantined: bool = row.try_get("quarantined").unwrap_or(false);
    if is_quarantined {
        let q_reason: Option<String> = row.try_get("quarantine_reason").ok().flatten();
        return Err(format!(
            "WALLET_QUARANTINED: Automated L1 payouts are suspended for {} ({}).",
            prefixed,
            q_reason.unwrap_or_else(|| "Ledger invariant mismatch".to_string())
        ));
    }
    let streaming_kas: f64 = row.try_get("streaming_balance_kas").unwrap_or(0.0);
    let total_yield_kas: f64 = row.try_get("total_yield_kas").unwrap_or(0.0);
    let verified_credits_kas: f64 = row.try_get("verified_onchain_credits_kas").unwrap_or(0.0);
    let lp_tokens: Value = row.try_get("lp_tokens").unwrap_or_else(|_| json!({}));
    let stored_hmac: String = row.try_get("row_hmac_sig").unwrap_or_default();
    let expected_hmac = compute_reservoir_hmac(&prefixed, streaming_kas, total_yield_kas, &lp_tokens)?;
    if stored_hmac.trim().is_empty() {
        let _ = sqlx::query(
            r#"
            UPDATE yield_reservoirs
            SET row_hmac_sig = $3,
                verified_onchain_credits_kas = GREATEST(verified_onchain_credits_kas, total_yield_kas, streaming_balance_kas)
            WHERE wallet_address = $1 OR wallet_address = $2
            "#,
        )
        .bind(&prefixed)
        .bind(&clean)
        .bind(&expected_hmac)
        .execute(pool)
        .await;
    } else if !constant_time_hex_eq(&stored_hmac, &expected_hmac) {
        let reason = format!(
            "HMAC row signature mismatch on yield_reservoirs (stored {}..., expected {}...)",
            &stored_hmac.chars().take(12).collect::<String>(),
            &expected_hmac.chars().take(12).collect::<String>()
        );
        quarantine_single_wallet(pool, &prefixed, &reason).await;
        return Err(format!("LEDGER_HMAC_VIOLATION: {}", reason));
    }
    let settled_onramp_kas: f64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(delivered_kas), 0.0)
        FROM fiat_onramp_orders
        WHERE (wallet_address = $1 OR wallet_address = $2)
          AND status = 'COMPLETED'
        "#,
    )
    .bind(&prefixed)
    .bind(&clean)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);
    let max_verified_ceiling =
        total_yield_kas.max(verified_credits_kas) + settled_onramp_kas + 1.0;
    if streaming_kas > max_verified_ceiling {
        let reason = format!(
            "Balance drift detected: streaming_balance_kas ({:.4} KAS) exceeds verified credits ceiling ({:.4} KAS)",
            streaming_kas, max_verified_ceiling
        );
        quarantine_single_wallet(pool, &prefixed, &reason).await;
        return Err(format!("SOLVENCY_INVARIANT_VIOLATION: {}", reason));
    }
    if requested_kas_debit > 0.0 && streaming_kas + 1e-6 < requested_kas_debit {
        return Err(format!(
            "INSUFFICIENT_RESERVOIR_BALANCE: Requested {:.4} KAS, available {:.4} KAS.",
            requested_kas_debit, streaming_kas
        ));
    }
    Ok(())
}
pub async fn upsert_signed_yield_reservoir_kas(
    pool: &PgPool,
    wallet_address: &str,
    delta_streaming_kas: f64,
    delta_total_yield_kas: f64,
    delta_verified_credits_kas: f64,
) -> Result<f64, String> {
    let clean = wallet_address
        .trim()
        .to_lowercase()
        .replace("kaspa:", "")
        .trim()
        .to_string();
    let prefixed = format!("kaspa:{}", clean);
    let existing_opt = sqlx::query(
        r#"
        SELECT wallet_address, streaming_balance_kas, total_yield_kas,
               COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens,
               COALESCE(verified_onchain_credits_kas, 0.0) AS verified_onchain_credits_kas,
               COALESCE(quarantined, FALSE) AS quarantined
        FROM yield_reservoirs
        WHERE wallet_address = $1 OR wallet_address = $2
        ORDER BY streaming_balance_kas DESC
        LIMIT 1
        "#,
    )
    .bind(&prefixed)
    .bind(&clean)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("DB read failed in upsert_signed_yield_reservoir_kas: {}", e))?;
    let (cur_streaming, cur_total_yield, cur_verified, lp_tokens, target_pk) =
        if let Some(r) = existing_opt {
            if r.try_get::<bool, _>("quarantined").unwrap_or(false) {
                return Err(format!("Wallet {} is quarantined.", prefixed));
            }
            (
                r.try_get::<f64, _>("streaming_balance_kas").unwrap_or(0.0),
                r.try_get::<f64, _>("total_yield_kas").unwrap_or(0.0),
                r.try_get::<f64, _>("verified_onchain_credits_kas")
                    .unwrap_or(0.0),
                r.try_get::<Value, _>("lp_tokens")
                    .unwrap_or_else(|_| json!({})),
                r.try_get::<String, _>("wallet_address")
                    .unwrap_or_else(|_| prefixed.clone()),
            )
        } else {
            (0.0, 0.0, 0.0, json!({}), prefixed.clone())
        };
    if delta_streaming_kas < 0.0 && cur_streaming + delta_streaming_kas < -1e-6 {
        return Err(format!(
            "INSUFFICIENT_BALANCE: Cannot debit {:.6} KAS from {:.6} KAS.",
            delta_streaming_kas.abs(),
            cur_streaming
        ));
    }
    let next_streaming = (cur_streaming + delta_streaming_kas).max(0.0);
    let next_total_yield = (cur_total_yield + delta_total_yield_kas.max(0.0)).max(0.0);
    let next_verified = (cur_verified + delta_verified_credits_kas.max(0.0)).max(next_total_yield);
    let new_hmac = compute_reservoir_hmac(&prefixed, next_streaming, next_total_yield, &lp_tokens)?;
    sqlx::query(
        r#"
        INSERT INTO yield_reservoirs (
            wallet_address, streaming_balance_kas, total_yield_kas,
            lp_tokens, verified_onchain_credits_kas, row_hmac_sig, last_updated
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        ON CONFLICT (wallet_address) DO UPDATE SET
            streaming_balance_kas = EXCLUDED.streaming_balance_kas,
            total_yield_kas = EXCLUDED.total_yield_kas,
            verified_onchain_credits_kas = EXCLUDED.verified_onchain_credits_kas,
            row_hmac_sig = EXCLUDED.row_hmac_sig,
            last_updated = CURRENT_TIMESTAMP
        "#,
    )
    .bind(&target_pk)
    .bind(next_streaming)
    .bind(next_total_yield)
    .bind(&lp_tokens)
    .bind(next_verified)
    .bind(&new_hmac)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to persist signed yield_reservoirs row: {}", e))?;
    Ok(next_streaming)
}
pub async fn load_system_treasury_config(pool: &PgPool) -> SystemTreasuryConfig {
    let default_cold_kas = resolve_master_treasury_prefixed().unwrap_or_default();
    let row_opt = sqlx::query(
        r#"
        SELECT config_id, hot_ceiling_kas, min_runway_kas, fpps_max_float_kas,
               pool_fee_rate, outflow_breaker_tripped, cold_kas_address,
               cold_btc_address, cold_eth_address, cold_sol_address,
               updated_by, updated_at
        FROM system_treasury_config
        WHERE config_id = 'PRIMARY'
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    if let Some(r) = row_opt {
        let db_cold_kas: String = r.try_get("cold_kas_address").unwrap_or_default();
        return SystemTreasuryConfig {
            config_id: r
                .try_get("config_id")
                .unwrap_or_else(|_| "PRIMARY".to_string()),
            hot_ceiling_kas: r.try_get("hot_ceiling_kas").unwrap_or(5000.0),
            min_runway_kas: r.try_get("min_runway_kas").unwrap_or(250.0),
            fpps_max_float_kas: r.try_get("fpps_max_float_kas").unwrap_or(50.0),
            pool_fee_rate: r.try_get("pool_fee_rate").unwrap_or(0.01),
            outflow_breaker_tripped: r.try_get("outflow_breaker_tripped").unwrap_or(false),
            cold_kas_address: if db_cold_kas.trim().is_empty() {
                default_cold_kas
            } else {
                db_cold_kas
            },
            cold_btc_address: r
                .try_get("cold_btc_address")
                .unwrap_or_else(|_| env::var("PERENNIA_COLD_BTC_ADDRESS").unwrap_or_default()),
            cold_eth_address: r
                .try_get("cold_eth_address")
                .unwrap_or_else(|_| env::var("PERENNIA_COLD_ETH_ADDRESS").unwrap_or_default()),
            cold_sol_address: r
                .try_get("cold_sol_address")
                .unwrap_or_else(|_| env::var("PERENNIA_COLD_SOL_ADDRESS").unwrap_or_default()),
            updated_by: r
                .try_get("updated_by")
                .unwrap_or_else(|_| "SYSTEM".to_string()),
            updated_at: r
                .try_get::<chrono::DateTime<Utc>, _>("updated_at")
                .map(|d| d.to_rfc3339())
                .unwrap_or_else(|_| Utc::now().to_rfc3339()),
        };
    }
    SystemTreasuryConfig {
        config_id: "PRIMARY".to_string(),
        hot_ceiling_kas: 5000.0,
        min_runway_kas: 250.0,
        fpps_max_float_kas: 50.0,
        pool_fee_rate: 0.01,
        outflow_breaker_tripped: false,
        cold_kas_address: default_cold_kas,
        cold_btc_address: env::var("PERENNIA_COLD_BTC_ADDRESS").unwrap_or_default(),
        cold_eth_address: env::var("PERENNIA_COLD_ETH_ADDRESS").unwrap_or_default(),
        cold_sol_address: env::var("PERENNIA_COLD_SOL_ADDRESS").unwrap_or_default(),
        updated_by: "DEFAULT".to_string(),
        updated_at: Utc::now().to_rfc3339(),
    }
}
pub async fn update_system_treasury_config(
    pool: &PgPool,
    payload: &Value,
    updated_by: &str,
) -> Result<SystemTreasuryConfig, String> {
    let current = load_system_treasury_config(pool).await;
    let hot_ceiling_kas = payload
        .get("hotCeilingKas")
        .and_then(|v| v.as_f64())
        .unwrap_or(current.hot_ceiling_kas)
        .max(50.0);
    let min_runway_kas = payload
        .get("minRunwayKas")
        .and_then(|v| v.as_f64())
        .unwrap_or(current.min_runway_kas)
        .max(0.0);
    let fpps_max_float_kas = payload
        .get("fppsMaxFloatKas")
        .and_then(|v| v.as_f64())
        .unwrap_or(current.fpps_max_float_kas)
        .max(1.0);
    let pool_fee_rate = payload
        .get("poolFeeRate")
        .and_then(|v| v.as_f64())
        .or_else(|| {
            payload
                .get("poolFeeRatePct")
                .and_then(|v| v.as_f64())
                .map(|pct| pct / 100.0)
        })
        .unwrap_or(current.pool_fee_rate)
        .clamp(0.0, 0.25);
    let outflow_breaker_tripped = payload
        .get("outflowBreakerTripped")
        .or_else(|| payload.get("lowRunwayBreakerTripped"))
        .and_then(|v| v.as_bool())
        .unwrap_or(current.outflow_breaker_tripped);
    let cold_kas_address = payload
        .get("coldKasAddress")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .unwrap_or(current.cold_kas_address);
    let cold_btc_address = payload
        .get("coldBtcAddress")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .unwrap_or(current.cold_btc_address);
    let cold_eth_address = payload
        .get("coldEthAddress")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .unwrap_or(current.cold_eth_address);
    let cold_sol_address = payload
        .get("coldSolAddress")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .unwrap_or(current.cold_sol_address);
    sqlx::query(
        r#"
        INSERT INTO system_treasury_config (
            config_id, hot_ceiling_kas, min_runway_kas, fpps_max_float_kas,
            pool_fee_rate, outflow_breaker_tripped, cold_kas_address,
            cold_btc_address, cold_eth_address, cold_sol_address,
            updated_by, updated_at
        ) VALUES ('PRIMARY', $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
        ON CONFLICT (config_id) DO UPDATE SET
            hot_ceiling_kas = EXCLUDED.hot_ceiling_kas,
            min_runway_kas = EXCLUDED.min_runway_kas,
            fpps_max_float_kas = EXCLUDED.fpps_max_float_kas,
            pool_fee_rate = EXCLUDED.pool_fee_rate,
            outflow_breaker_tripped = EXCLUDED.outflow_breaker_tripped,
            cold_kas_address = EXCLUDED.cold_kas_address,
            cold_btc_address = EXCLUDED.cold_btc_address,
            cold_eth_address = EXCLUDED.cold_eth_address,
            cold_sol_address = EXCLUDED.cold_sol_address,
            updated_by = EXCLUDED.updated_by,
            updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(hot_ceiling_kas)
    .bind(min_runway_kas)
    .bind(fpps_max_float_kas)
    .bind(pool_fee_rate)
    .bind(outflow_breaker_tripped)
    .bind(&cold_kas_address)
    .bind(&cold_btc_address)
    .bind(&cold_eth_address)
    .bind(&cold_sol_address)
    .bind(updated_by)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update system_treasury_config: {}", e))?;
    let updated = load_system_treasury_config(pool).await;
    if let Ok(redis_url) = env::var("REDIS_URL") {
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                if let Ok(serialized) = serde_json::to_string(&updated) {
                    let _: redis::RedisResult<()> = redis::cmd("SET")
                        .arg("perennia:treasury:system_config")
                        .arg(serialized)
                        .query_async(&mut conn)
                        .await;
                }
            }
        }
    }
    Ok(updated)
}
pub fn compute_jerusalem_epoch_window(now_secs: u64) -> (u64, u64, u64) {
    let day_secs: u64 = 86_400;
    let bell_offset_secs: u64 = 22 * 3_600;
    let current_day_start = (now_secs / day_secs) * day_secs;
    let today_bell = current_day_start + bell_offset_secs;
    let (epoch_start_ts, next_bell_ts) = if now_secs < today_bell {
        (today_bell.saturating_sub(day_secs), today_bell)
    } else {
        (today_bell, today_bell + day_secs)
    };
    let secs_until_bell = next_bell_ts.saturating_sub(now_secs);
    (epoch_start_ts, next_bell_ts, secs_until_bell)
}
pub async fn execute_full_2200_utc_settlement_bell(pool: &PgPool) -> anyhow::Result<Value> {
    tracing::info!("🔔 [22:00 UTC BELL] Executing Global Epoch Netting & Forge Settlement...");
    let netting_res = execute_epoch_delta_netting_and_lp_compounding(pool).await?;
    let forge_res = execute_2200_utc_forge_bell_settlement(pool).await?;
    Ok(json!({
        "netting": netting_res,
        "forge": forge_res,
        "bellTimestampUtc": Utc::now().to_rfc3339()
    }))
}
pub async fn trigger_immediate_epoch_bell_sweep(pool: &PgPool) -> Result<Value, String> {
    execute_full_2200_utc_settlement_bell(pool)
        .await
        .map_err(|e| format!("Epoch bell sweep failed: {}", e))
}
pub async fn start_chronos_daemon(pool: PgPool) {
    tracing::info!("🕰️ [CHRONOS ENGINE] 22:00 UTC Settlement Bell Scheduler Armed.");
    let mut interval = tokio::time::interval(Duration::from_secs(30));
    let mut last_bell_day: Option<u32> = None;
    loop {
        interval.tick().await;
        let now = Utc::now();
        let ordinal_day = now.format("%j").to_string().parse::<u32>().unwrap_or(0);
        if now.hour() == 22 && now.minute() == 0 && last_bell_day != Some(ordinal_day) {
            last_bell_day = Some(ordinal_day);
            if let Err(e) = execute_full_2200_utc_settlement_bell(&pool).await {
                tracing::error!("❌ [22:00 UTC BELL] Execution error: {}", e);
            }
        }
    }
}
```

## File: src/main.rs
```rust
mod config;
mod schema;
mod stratum_tcp;
mod telemetry;
mod kaspad_client;
mod job_manager;
mod diff_engine;
mod oracle;
mod sor;
mod chronos;
mod state_api;
mod admin_api;
mod fiat_rails;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::mpsc;
use tracing::Level;
use tracing_subscriber::FmtSubscriber;
use axum::{
    extract::{Query, Request},
    http::{StatusCode, HeaderMap},
    middleware::{self, Next},
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde_json::{json, Value};
use sqlx::postgres::PgPoolOptions;
use job_manager::JobManager;
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
async fn internal_auth_guard(
    headers: HeaderMap,
    request: Request,
    next: Next,
) -> Result<impl IntoResponse, (StatusCode, Json<serde_json::Value>)> {
    let internal_token = std::env::var("INTERNAL_ADMIN_TOKEN")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let admin_key = std::env::var("PERENNIA_ADMIN_KEY")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let has_configured_secret = internal_token.is_some() || admin_key.is_some();
    let enforce_strict = std::env::var("ENFORCE_INTERNAL_AUTH")
        .ok()
        .map(|v| !v.trim().eq_ignore_ascii_case("false"))
        .unwrap_or(true);
    if enforce_strict {
        if !has_configured_secret {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "error": "CRITICAL_SECURITY_LOCKDOWN: INTERNAL_ADMIN_TOKEN or PERENNIA_ADMIN_KEY must be configured in .env."
                })),
            ));
        }
        let provided = headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let mut authorized = false;
        if let Some(ref tok) = internal_token {
            let expected = format!("Bearer {}", tok);
            if constant_time_eq(provided.as_bytes(), expected.as_bytes()) {
                authorized = true;
            }
        }
        if !authorized {
            if let Some(ref key) = admin_key {
                let expected = format!("Bearer {}", key);
                if constant_time_eq(provided.as_bytes(), expected.as_bytes()) {
                    authorized = true;
                }
            }
        }
        if !authorized {
            return Err((
                StatusCode::UNAUTHORIZED,
                Json(json!({ "error": "UNAUTHORIZED_INTERNAL_RPC" })),
            ));
        }
    }
    Ok(next.run(request).await)
}
async fn handle_get_balance(
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let raw_address = params
        .get("address")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Missing address query parameter." })),
            )
        })?;
    let clean_addr = raw_address.to_lowercase().replace("kaspa:", "");
    let formatted_addr = format!("kaspa:{}", clean_addr);
    if let Ok(sompi) = kaspad_client::get_balance_by_address_grpc(&formatted_addr).await {
        let balance_kas = (sompi as f64) / 100_000_000.0;
        return Ok(Json(json!({
            "balance": balance_kas,
            "balanceKas": balance_kas,
            "source": "kaspad_grpc"
        })));
    }
    let rest_url = std::env::var("KASPA_REST_URL")
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .unwrap_or_else(|_| "https://api.kaspa.org".to_string());
    let endpoint = format!("{}/addresses/{}/balance", rest_url, formatted_addr);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let response = client.get(&endpoint).send().await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("Upstream node balance query failed: {}", e) })),
        )
    })?;
    if !response.status().is_success() {
        let err_body = response.text().await.unwrap_or_default();
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("Node rejected balance lookup: {}", err_body) })),
        ));
    }
    let data: Value = response.json().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Invalid JSON from upstream node: {}", e) })),
        )
    })?;
    let sompi = data
        .get("balance")
        .and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_u64().map(|u| u as f64))
                .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
        })
        .ok_or_else(|| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Malformed balance payload from node." })),
            )
        })?;
    let balance_kas = sompi / 100_000_000.0;
    Ok(Json(json!({
        "balance": balance_kas,
        "balanceKas": balance_kas,
        "source": "rest_fallback"
    })))
}
async fn handle_get_utxos(
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let raw_address = params
        .get("address")
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "Missing address query parameter." })),
            )
        })?;
    let clean_addr = raw_address.to_lowercase().replace("kaspa:", "");
    let formatted_addr = format!("kaspa:{}", clean_addr);
    if let Ok(entries) = kaspad_client::get_utxos_by_address_grpc(&formatted_addr).await {
        return Ok(Json(json!({
            "entries": entries,
            "source": "kaspad_grpc"
        })));
    }
    let rest_url = std::env::var("KASPA_REST_URL")
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .unwrap_or_else(|_| "https://api.kaspa.org".to_string());
    let endpoint = format!("{}/addresses/{}/utxos", rest_url, formatted_addr);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let response = client.get(&endpoint).send().await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("Upstream node UTXO query failed: {}", e) })),
        )
    })?;
    if !response.status().is_success() {
        let err_body = response.text().await.unwrap_or_default();
        return Err((
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("Node rejected UTXO lookup: {}", err_body) })),
        ));
    }
    let entries: Value = response.json().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Invalid UTXO JSON from upstream node: {}", e) })),
        )
    })?;
    Ok(Json(json!({
        "entries": entries,
        "source": "rest_fallback"
    })))
}
async fn handle_post_broadcast(
    Json(payload): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    match kaspad_client::submit_transaction_grpc(&payload, false).await {
        Ok(tx_id) => {
            return Ok(Json(json!({
                "success": true,
                "transactionId": tx_id,
                "source": "kaspad_grpc"
            })));
        }
        Err(grpc_err) => {
            tracing::warn!(
                "⚠️ [LOCAL GRPC BROADCAST] /v1/broadcast gRPC attempt failed ({}); falling back to REST...",
                grpc_err
            );
        }
    }
    let rest_url = std::env::var("KASPA_REST_URL")
        .map(|s| s.trim().trim_end_matches('/').to_string())
        .unwrap_or_else(|_| "https://api.kaspa.org".to_string());
    let endpoint = format!("{}/transactions", rest_url);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let rest_payload = if payload.get("transaction").is_some() {
        payload
    } else {
        json!({ "transaction": payload })
    };
    let response = client.post(&endpoint).json(&rest_payload).send().await.map_err(|e| {
        (
            StatusCode::BAD_GATEWAY,
            Json(json!({ "error": format!("Broadcast network error: {}", e) })),
        )
    })?;
    if !response.status().is_success() {
        let err_body = response.text().await.unwrap_or_default();
        return Err((
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({ "error": format!("Node rejected transaction broadcast: {}", err_body) })),
        ));
    }
    let data: Value = response.json().await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({ "error": format!("Invalid broadcast JSON response: {}", e) })),
        )
    })?;
    let tx_id = data
        .get("transactionId")
        .or_else(|| data.get("id"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({ "error": "Node returned no transactionId." })),
            )
        })?;
    Ok(Json(json!({
        "success": true,
        "transactionId": tx_id,
        "source": "rest_fallback"
    })))
}
#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    let subscriber = FmtSubscriber::builder()
        .with_max_level(Level::INFO)
        .finish();
    tracing::subscriber::set_global_default(subscriber).expect("Failed to init tracing");
    tracing::info!("Booting Perennia Core Engine (Hybrid Mainnet + Stratum)...");
    let mut raw_config = config::StratumConfig::load("config.yaml")?;
    if let Some(env_mining_addr) = chronos::resolve_hot_dispatcher_address()
        .or_else(|| chronos::resolve_master_treasury_prefixed().ok())
    {
        raw_config.mining_address = env_mining_addr;
    }
    let config = Arc::new(raw_config);
    tracing::info!("Targeted Treasury / Stratum Coinbase Wallet: {}", config.mining_address);
    let db_url = std::env::var("DATABASE_URL")
        .expect("CRITICAL: DATABASE_URL environment variable is required.");
    let redis_url = std::env::var("REDIS_URL")
        .expect("CRITICAL: REDIS_URL environment variable is required.");
    let pool = PgPoolOptions::new()
        .max_connections(50)
        .connect(&db_url)
        .await
        .unwrap_or_else(|e| {
            tracing::warn!("Failed to connect to PostgreSQL (Ensure DB is running): {}", e);
            panic!("Database connection required for routing dependencies: {}", e);
        });
    schema::ensure_database_schema(&pool).await?;
    let (daa_tx, _) = tokio::sync::broadcast::channel::<u64>(100);
    let (utxo_tx, _) =
        tokio::sync::broadcast::channel::<kaspad_client::protowire::UtxosChangedNotificationMessage>(
            1000,
        );
    let pool_chronos = pool.clone();
    tokio::spawn(async move {
        chronos::start_chronos_daemon(pool_chronos).await;
    });
    let pool_watcher = pool.clone();
    let daa_rx = daa_tx.subscribe();
    let utxo_rx = utxo_tx.subscribe();
    tokio::spawn(async move {
        chronos::start_mempool_watcher_daemon(pool_watcher, daa_rx, utxo_rx).await;
    });
    let utxo_rx_cons = utxo_tx.subscribe();
    tokio::spawn(async move {
        chronos::start_utxo_consolidation_daemon(utxo_rx_cons).await;
    });
    let pool_airlock = pool.clone();
    tokio::spawn(async move {
        chronos::start_hot_cold_airlock_daemon(pool_airlock).await;
    });
    let pool_recovery = pool.clone();
    tokio::spawn(async move {
        chronos::start_idempotent_payout_recovery_daemon(pool_recovery).await;
    });
    if let Ok(redis_client_netting) = redis::Client::open(redis_url.clone()) {
        let pool_netting = pool.clone();
        tokio::spawn(async move {
            chronos::start_delta_netting_engine(redis_client_netting, pool_netting).await;
        });
    }
    telemetry::init_telemetry();
    let prom_port = config.prom_port.clone();
    tokio::spawn(async move {
        telemetry::start_prometheus_exporter(prom_port).await;
    });
    let (valid_share_tx, valid_share_rx) = mpsc::channel::<(String, f64, bool)>(10000);
    tokio::spawn(async move {
        telemetry::start_accounting_engine(valid_share_rx).await;
    });
    tokio::spawn(async move {
        oracle::start_oracle_daemon().await;
    });
    tokio::spawn(async move {
        oracle::start_spot_pricing_daemon().await;
    });
    let pool_pyth = pool.clone();
    tokio::spawn(async move {
        oracle::start_pyth_rwa_oracle_daemon(pool_pyth).await;
    });
    let (job_manager_arc, _job_rx, block_submit_rx) = JobManager::new();
    let config_clone = config.clone();
    let jm_clone = job_manager_arc.clone();
    let daa_tx_clone = daa_tx.clone();
    let utxo_tx_clone = utxo_tx.clone();
    let share_tx_kaspad = valid_share_tx.clone();
    tokio::spawn(async move {
        if let Err(e) = kaspad_client::start_kaspad_client(
            config_clone,
            jm_clone,
            block_submit_rx,
            share_tx_kaspad,
            daa_tx_clone,
            utxo_tx_clone,
        )
        .await
        {
            tracing::error!("Kaspa gRPC Connection Fatal Error: {}", e);
        }
    });
    let protected_routes = Router::new()
        .route("/v1/sor/execute", post(sor::handle_sor_execute))
        .route("/v1/state/action", post(state_api::handle_state_action))
        .route_layer(middleware::from_fn(internal_auth_guard));
    let app = Router::new()
        .route("/v1/balance", get(handle_get_balance))
        .route("/v1/utxos", get(handle_get_utxos))
        .route("/v1/broadcast", post(handle_post_broadcast))
        .merge(protected_routes)
        .merge(admin_api::admin_routes())
        .merge(fiat_rails::fiat_routes())
        .with_state(pool.clone());
    let bind_host =
        std::env::var("RUST_BIND_ADDRESS").unwrap_or_else(|_| "0.0.0.0:8002".to_string());
    let listener = tokio::net::TcpListener::bind(&bind_host).await?;
    tokio::spawn(async move {
        tracing::info!(
            "🚀 Axum HTTP Server bound on {} (SOR, State, Fiat, Balance, UTXOs, Broadcast & Admin API Armed)",
            bind_host
        );
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!("Axum Server Error: {}", e);
        }
    });
    let cfg_t1 = config.clone();
    let jm_t1 = job_manager_arc.clone();
    let tx_t1 = valid_share_tx.clone();
    let pool_t1 = pool.clone();
    tokio::spawn(async move {
        if let Err(e) =
            stratum_tcp::start_stratum_server(cfg_t1, jm_t1, tx_t1, pool_t1, 6551, 1.0, 0).await
        {
            tracing::error!("Tier 1 (GPU) failed: {}", e);
        }
    });
    let cfg_t2 = config.clone();
    let jm_t2 = job_manager_arc.clone();
    let tx_t2 = valid_share_tx.clone();
    let pool_t2 = pool.clone();
    tokio::spawn(async move {
        if let Err(e) =
            stratum_tcp::start_stratum_server(cfg_t2, jm_t2, tx_t2, pool_t2, 6552, 256.0, 2500)
                .await
        {
            tracing::error!("Tier 2 (Home ASICs) failed: {}", e);
        }
    });
    let cfg_t3 = config.clone();
    let jm_t3 = job_manager_arc.clone();
    let tx_t3 = valid_share_tx.clone();
    let pool_t3 = pool.clone();
    stratum_tcp::start_stratum_server(cfg_t3, jm_t3, tx_t3, pool_t3, 6553, 1024.0, 3000).await?;
    Ok(())
}
```

## File: config.yaml
```yaml
# Core Network Parameters (RPC Node Array for Automatic Failover)
stratum_port: ":5555"
kaspad_addresses:
  - "127.0.0.1:16110"
  - "192.168.50.100:16110"
  - "api.kaspa.org:16110"
# Central Pool Wallet (Matched to Master Admin Treasury)
mining_address: "kaspa:qpra0t9ul8hd7m7pw4td6ax3unlf2vyc2fzit9p9yulhsnk7quakmpj4lpw7"
# Public Pool Mechanics
starting_diff: 64
min_share_diff: 2.0
var_diff: true
shares_per_min: 20
extranonce_size: 2
# Telemetry System
prom_port: ":9091"
print_stats: true
# Settlement Invariants
default_unassigned_settlement_threshold: 50.0
coinbase_maturity_daa_confirmations: 5000
```

## File: src/chronos/netting.rs
```rust
use chrono::Utc;
use serde_json::{json, Map, Value};
use sqlx::{PgPool, Row};
use std::collections::{HashMap, HashSet};
use std::env;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
const CORE_POOL_BUCKET_ASSETS: &[&str] = &[
    "USDC", "USDT", "USD", "BTC", "ETH", "SOL", "SILO", "XRP", "DOGE", "POL", "AVAX", "SUI",
    "TRX", "ZEC", "ARB", "BASE", "NVDA", "SPY", "XAU",
];
fn lock_multiplier_for_days(days: i32) -> f64 {
    if days >= 365 {
        2.5
    } else if days >= 90 {
        1.5
    } else if days >= 30 {
        1.2
    } else {
        1.0
    }
}
pub async fn start_delta_netting_engine(redis_client: redis::Client, pool: PgPool) {
    tracing::info!("⚡ [CHRONOS NETTING] Delta Netting, Live ChangeNOW Bucket Telemetry & 50%-KAS LP Invariant Engine Armed.");
    let mut interval = tokio::time::interval(Duration::from_secs(10));
    loop {
        interval.tick().await;
        if let Err(e) = run_delta_netting_cycle(&redis_client, &pool).await {
            tracing::warn!("⚠️ [CHRONOS NETTING] Cycle warning: {}", e);
        }
    }
}
pub async fn publish_live_epoch_bucket_telemetry(
    pool: &PgPool,
    kas_spot_usd: f64,
) -> anyhow::Result<Value> {
    let safe_kas_spot = if kas_spot_usd.is_finite() && kas_spot_usd > 0.0 {
        kas_spot_usd
    } else {
        crate::fiat_rails::resolve_live_spot_price(pool, "KAS")
            .await
            .unwrap_or(0.15)
            .max(0.01)
    };
    let cc_rows = sqlx::query(
        r#"
        SELECT wallet_address, layout_state
        FROM user_command_centers
        "#,
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    let mut pending_kas_by_asset: HashMap<String, f64> = HashMap::new();
    let mut participants_by_asset: HashMap<String, HashSet<String>> = HashMap::new();
    let mut discovered_tickers: HashSet<String> = CORE_POOL_BUCKET_ASSETS
        .iter()
        .map(|s| (*s).to_string())
        .collect();
    for row in &cc_rows {
        let wallet: String = row.try_get("wallet_address").unwrap_or_default();
        let layout: Value = row
            .try_get("layout_state")
            .unwrap_or_else(|_| json!({ "sectors": [] }));
        if let Some(sectors) = layout.get("sectors").and_then(|v| v.as_array()) {
            for sec in sectors {
                let alloc_pct = sec
                    .get("allocationPercentage")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0);
                let sec_pending_kas = sec
                    .get("pendingKaspa")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0)
                    .max(0.0);
                if alloc_pct <= 0.0 && sec_pending_kas <= 0.0 {
                    continue;
                }
                if let Some(target_assets) = sec
                    .get("settlementConfig")
                    .and_then(|c| c.get("targetAssets"))
                    .and_then(|v| v.as_array())
                {
                    if target_assets.len() >= 2 {
                        for leg in target_assets {
                            let tick = leg
                                .get("ticker")
                                .and_then(|v| v.as_str())
                                .unwrap_or("")
                                .trim()
                                .to_uppercase();
                            if tick.is_empty() || tick == "KAS" {
                                continue;
                            }
                            discovered_tickers.insert(tick.clone());
                            let leg_weight_ratio = (leg
                                .get("weightPct")
                                .and_then(|v| v.as_f64())
                                .unwrap_or(50.0)
                                .max(0.0))
                                / 100.0;
                            let leg_kas = sec_pending_kas * leg_weight_ratio;
                            *pending_kas_by_asset.entry(tick.clone()).or_insert(0.0) += leg_kas;
                            if !wallet.is_empty() {
                                participants_by_asset
                                    .entry(tick)
                                    .or_default()
                                    .insert(wallet.clone());
                            }
                        }
                        continue;
                    }
                }
                let primary_tick = sec
                    .get("settlementConfig")
                    .and_then(|c| c.get("targetAsset"))
                    .and_then(|t| t.get("ticker"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_uppercase();
                if !primary_tick.is_empty() && primary_tick != "KAS" {
                    discovered_tickers.insert(primary_tick.clone());
                    *pending_kas_by_asset
                        .entry(primary_tick.clone())
                        .or_insert(0.0) += sec_pending_kas;
                    if !wallet.is_empty() {
                        participants_by_asset
                            .entry(primary_tick)
                            .or_default()
                            .insert(wallet.clone());
                    }
                }
            }
        }
    }
    let lp_rows = sqlx::query(
        r#"
        SELECT pool_pair, COALESCE(SUM(staked_asset_a), 0.0) AS total_kas_a
        FROM liquidity_providers
        GROUP BY pool_pair
        "#,
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    let mut lp_kas_by_asset: HashMap<String, f64> = HashMap::new();
    for r in lp_rows {
        let pair: String = r.try_get("pool_pair").unwrap_or_default();
        let kas_a: f64 = r.try_get::<f64, _>("total_kas_a").unwrap_or(0.0_f64).max(0.0_f64);
        for part in pair.split('/') {
            let clean = part.trim().to_uppercase();
            if !clean.is_empty() && clean != "KAS" {
                *lp_kas_by_asset.entry(clean).or_insert(0.0) += kas_a;
            }
        }
    }
    let now_secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let (current_epoch_bell_ts, next_epoch_bell_ts, seconds_remaining) =
        crate::chronos::compute_jerusalem_epoch_window(now_secs);
    let mut buckets_map = Map::new();
    for ticker in discovered_tickers {
        let pending_kas = pending_kas_by_asset.get(&ticker).copied().unwrap_or(0.0);
        let pending_usd = ((pending_kas * safe_kas_spot) * 100.0).round() / 100.0;
        let (min_profitable_kas, min_profitable_usd) =
            crate::fiat_rails::resolve_live_profitable_bucket_threshold(
                pool,
                &ticker,
                safe_kas_spot,
            )
            .await;
        let weight_pct = if min_profitable_kas > 0.0 {
            ((pending_kas / min_profitable_kas) * 100.0).clamp(0.0, 100.0)
        } else {
            0.0
        };
        let participant_count = participants_by_asset
            .get(&ticker)
            .map(|s| s.len())
            .unwrap_or(0);
        let lp_avail_kas = lp_kas_by_asset
            .get(&ticker)
            .copied()
            .filter(|&v| v > 0.0)
            .unwrap_or(5_000.0);
        let lp_coverage_pct = if pending_kas > 0.0 {
            ((lp_avail_kas / pending_kas) * 100.0).clamp(0.0, 100.0)
        } else {
            100.0
        };
        let status = if weight_pct >= 100.0 {
            "READY_FOR_BELL"
        } else if pending_kas > 0.0 {
            "FILLING"
        } else {
            "IDLE"
        };
        let rail_cost_usd = if ticker == "USD" { 0.25 } else { 0.0 };
        buckets_map.insert(
            ticker.clone(),
            json!({
                "asset": ticker,
                "pendingKas": (pending_kas * 10000.0).round() / 10000.0,
                "pendingUsd": pending_usd,
                "minProfitableKas": min_profitable_kas,
                "minProfitableUsd": min_profitable_usd,
                "weightPct": (weight_pct * 100.0).round() / 100.0,
                "participantCount": participant_count,
                "lpAvailableKasCapacity": lp_avail_kas,
                "lpCoveragePct": (lp_coverage_pct * 10.0).round() / 10.0,
                "effectiveSpreadFloorPct": 0.10,
                "railCostUsd": rail_cost_usd,
                "status": status,
                "lastClearedAt": current_epoch_bell_ts,
                "lastClearType": "ANCHOR_OR_EPOCH"
            }),
        );
    }
    let epoch_state = json!({
        "anchorUtcHour": 22,
        "anchorLabel": "22:00 UTC Global Settlement",
        "currentEpochBellTs": current_epoch_bell_ts,
        "nextEpochBellTs": next_epoch_bell_ts,
        "secondsRemaining": seconds_remaining,
        "volatilitySweepThresholdPct": 450,
        "updatedAt": now_secs,
        "buckets": Value::Object(buckets_map)
    });
    if let Ok(redis_url) = env::var("REDIS_URL") {
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                let serialized = epoch_state.to_string();
                let _: redis::RedisResult<()> = redis::cmd("SET")
                    .arg("perennia:settlement:epoch_telemetry")
                    .arg(&serialized)
                    .query_async(&mut conn)
                    .await;
                let sse_msg = json!({
                    "epoch_telemetry_update": true,
                    "epoch": epoch_state
                });
                let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
                    .arg("telemetry:updates")
                    .arg(sse_msg.to_string())
                    .query_async(&mut conn)
                    .await;
            }
        }
    }
    Ok(epoch_state)
}
pub async fn sweep_layered_buckets_on_anchor_order(
    pool: &PgPool,
    target_asset: &str,
    anchor_kas_volume: f64,
    kas_spot_usd: f64,
    target_spot_usd: f64,
) -> anyhow::Result<Value> {
    let clean_target = target_asset.trim().to_uppercase();
    if clean_target.is_empty()
        || clean_target == "KAS"
        || clean_target == "USD"
        || kas_spot_usd <= 0.0
        || target_spot_usd <= 0.0
    {
        return Ok(json!({
            "layeredBucketsCleared": 0,
            "layeredKasSwept": 0.0,
            "layeredTokensDispatched": 0.0
        }));
    }
    let (min_profitable_kas, _) =
        crate::fiat_rails::resolve_live_profitable_bucket_threshold(pool, &clean_target, kas_spot_usd)
            .await;
    let rows = sqlx::query(
        r#"
        SELECT wallet_address, layout_state
        FROM user_command_centers
        "#,
    )
    .fetch_all(pool)
    .await?;
    let mut total_pending_bucket_kas = 0.0_f64;
    for r in &rows {
        let layout: Value = r
            .try_get("layout_state")
            .unwrap_or_else(|_| json!({ "sectors": [] }));
        if let Some(sectors) = layout.get("sectors").and_then(|v| v.as_array()) {
            for sec in sectors {
                let pending = sec
                    .get("pendingKaspa")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0)
                    .max(0.0);
                if pending <= 0.0 {
                    continue;
                }
                let route_mode = sec
                    .get("routeMode")
                    .and_then(|v| v.as_str())
                    .unwrap_or("hold")
                    .to_lowercase();
                if route_mode == "auto-lp" {
                    continue;
                }
                let sec_ticker = sec
                    .get("settlementConfig")
                    .and_then(|c| c.get("targetAsset"))
                    .and_then(|t| t.get("ticker"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_uppercase();
                if sec_ticker == clean_target {
                    total_pending_bucket_kas += pending;
                }
            }
        }
    }
    // Combined Anchor + Layer volume must clear the live ChangeNOW profitable minimum
    if total_pending_bucket_kas <= 1e-6
        || (anchor_kas_volume + total_pending_bucket_kas) + 1e-6 < min_profitable_kas
    {
        return Ok(json!({
            "layeredBucketsCleared": 0,
            "layeredKasSwept": 0.0,
            "layeredTokensDispatched": 0.0,
            "minProfitableKas": min_profitable_kas
        }));
    }
    let mut cleared_count = 0usize;
    let mut swept_kas_total = 0.0_f64;
    let mut dispatched_tokens_total = 0.0_f64;
    let mut total_protocol_fees_usd = 0.0_f64;
    for row in rows {
        let raw_wallet: String = row.try_get("wallet_address").unwrap_or_default();
        let clean_wallet = raw_wallet
            .trim()
            .to_lowercase()
            .replace("kaspa:", "")
            .trim()
            .to_string();
        if clean_wallet.is_empty() {
            continue;
        }
        let prefixed_wallet = format!("kaspa:{}", clean_wallet);
        let mut layout: Value = row
            .try_get("layout_state")
            .unwrap_or_else(|_| json!({ "sectors": [] }));
        let mut user_swept_kas = 0.0_f64;
        let mut mutated = false;
        if let Some(sectors) = layout.get_mut("sectors").and_then(|v| v.as_array_mut()) {
            for sec in sectors.iter_mut() {
                let pending = sec
                    .get("pendingKaspa")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0)
                    .max(0.0);
                if pending <= 0.0 {
                    continue;
                }
                let route_mode = sec
                    .get("routeMode")
                    .and_then(|v| v.as_str())
                    .unwrap_or("hold")
                    .to_lowercase();
                if route_mode == "auto-lp" {
                    continue;
                }
                let sec_ticker = sec
                    .get("settlementConfig")
                    .and_then(|c| c.get("targetAsset"))
                    .and_then(|t| t.get("ticker"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_uppercase();
                if sec_ticker == clean_target {
                    user_swept_kas += pending;
                    sec["pendingKaspa"] = json!(0.0);
                    mutated = true;
                    cleared_count += 1;
                }
            }
        }
        if mutated && user_swept_kas > 0.0 {
            let (user_fee_floor_rate, _, _) =
                crate::fiat_rails::resolve_wallet_swap_fee_floor_pct(pool, &prefixed_wallet).await;
            let effective_fee_rate = user_fee_floor_rate.max(crate::fiat_rails::HARD_PROFIT_FLOOR_PCT);
            let gross_usd = user_swept_kas * kas_spot_usd;
            let fee_usd = (gross_usd * effective_fee_rate).max(0.01);
            let net_usd = (gross_usd - fee_usd).max(0.0);
            if net_usd <= 0.0 {
                continue;
            }
            let out_tokens = ((net_usd / target_spot_usd) * 100_000_000.0).round() / 100_000_000.0;
            if out_tokens <= 0.0 {
                continue;
            }
            if crate::state_api::credit_user_token_balance(
                pool,
                &clean_wallet,
                &prefixed_wallet,
                &clean_target,
                out_tokens,
                false,
            )
            .await
            .is_ok()
            {
                let _ = sqlx::query(
                    r#"
                    UPDATE user_command_centers
                    SET layout_state = $2,
                        last_updated = CURRENT_TIMESTAMP
                    WHERE wallet_address = $1
                    "#,
                )
                .bind(&raw_wallet)
                .bind(&layout)
                .execute(pool)
                .await;
                let tx_ref = format!(
                    "ANCHOR-LAYER-{}-{}",
                    clean_target,
                    &uuid::Uuid::new_v4().simple().to_string().to_uppercase()[..8]
                );
                let _ = crate::sor::record_hifo_acquisition_lot(
                    pool,
                    &clean_wallet,
                    &clean_target,
                    out_tokens,
                    target_spot_usd,
                    "ANCHOR_LAYER_BUCKET_SWEEP",
                    Some(&tx_ref),
                )
                .await;
                let _ = sqlx::query(
                    r#"
                    INSERT INTO tax_ledger_events (
                        wallet_address, asset_ticker, event_type, gross_proceeds_usd,
                        amount_tokens, spot_price_at_execution, tx_hash, cost_basis_usd,
                        realized_gain_loss_usd, holding_period
                    ) VALUES ($1, $2, 'ANCHOR_LAYER_BUCKET_SWEEP', $3, $4, $5, $6, $3, 0.0, 'SHORT_TERM')
                    "#,
                )
                .bind(&clean_wallet)
                .bind(&clean_target)
                .bind(net_usd)
                .bind(out_tokens)
                .bind(target_spot_usd)
                .bind(&tx_ref)
                .execute(pool)
                .await;
                swept_kas_total += user_swept_kas;
                dispatched_tokens_total += out_tokens;
                total_protocol_fees_usd += fee_usd;
                if let Ok(redis_url) = env::var("REDIS_URL") {
                    if let Ok(client) = redis::Client::open(redis_url) {
                        if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                            if let Some(sectors_val) = layout.get("sectors") {
                                let yield_evt = json!({
                                    "wallet": clean_wallet,
                                    "yield_update": true,
                                    "sectors": sectors_val
                                });
                                let _: redis::RedisResult<()> = redis::cmd("PUBLISH")
                                    .arg("telemetry:updates")
                                    .arg(yield_evt.to_string())
                                    .query_async(&mut conn)
                                    .await;
                            }
                        }
                    }
                }
            }
        }
    }
    if total_protocol_fees_usd > 0.0 {
        if let Ok(redis_url) = env::var("REDIS_URL") {
            if let Ok(client) = redis::Client::open(redis_url) {
                if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                    let _: redis::RedisResult<()> = redis::cmd("INCRBYFLOAT")
                        .arg("perennia:treasury:netting_profit_usd")
                        .arg(total_protocol_fees_usd)
                        .query_async(&mut conn)
                        .await;
                    let _: redis::RedisResult<()> = redis::cmd("INCRBYFLOAT")
                        .arg("perennia:fees:batch_accumulated:USDC")
                        .arg(total_protocol_fees_usd)
                        .query_async(&mut conn)
                        .await;
                }
            }
        }
    }
    let _ = publish_live_epoch_bucket_telemetry(pool, kas_spot_usd).await;
    Ok(json!({
        "targetAsset": clean_target,
        "layeredBucketsCleared": cleared_count,
        "layeredKasSwept": (swept_kas_total * 10000.0).round() / 10000.0,
        "layeredTokensDispatched": (dispatched_tokens_total * 100_000_000.0).round() / 100_000_000.0,
        "protocolFeesCapturedUsd": (total_protocol_fees_usd * 10000.0).round() / 10000.0,
        "minProfitableKas": min_profitable_kas
    }))
}
pub async fn run_delta_netting_cycle(
    redis_client: &redis::Client,
    pool: &PgPool,
) -> anyhow::Result<Value> {
    let Ok(mut redis_conn) = redis_client.get_multiplexed_async_connection().await else {
        return Ok(json!({ "ordersPopped": 0, "skipped": "redis_unavailable" }));
    };
    let Ok(kas_spot_usd) = crate::fiat_rails::resolve_live_spot_price(pool, "KAS").await else {
        return Ok(json!({ "ordersPopped": 0, "skipped": "oracle_offline" }));
    };
    if !kas_spot_usd.is_finite() || kas_spot_usd <= 0.0_f64 {
        return Ok(json!({ "ordersPopped": 0, "skipped": "invalid_kas_spot" }));
    }
    let _ = publish_live_epoch_bucket_telemetry(pool, kas_spot_usd).await;
    let mut queued_orders: Vec<Value> = Vec::new();
    for _ in 0..2000 {
        let item_opt: Option<String> = redis::cmd("LPOP")
            .arg("perennia:sor:netting_queue")
            .query_async(&mut redis_conn).await.unwrap_or(None);
        let Some(raw_str) = item_opt else { break; };
        if let Ok(parsed) = serde_json::from_str::<Value>(&raw_str) {
            queued_orders.push(parsed);
        }
    }
    let min_dark_pool_usd: f64 = env::var("MIN_DARK_POOL_POSITION_USD")
        .ok().and_then(|v| v.trim().parse::<f64>().ok()).filter(|&v| v >= 1.0_f64).unwrap_or(5.0_f64);
    let batch_id = format!("NET-10S-{}", &uuid::Uuid::new_v4().simple().to_string().to_uppercase()[..10]);
    let mut batch_receipt = json!({
        "batchId": batch_id,
        "ordersPopped": queued_orders.len(),
        "kasSpotUsd": kas_spot_usd,
        "completedAtMs": Utc::now().timestamp_millis()
    });
    if !queued_orders.is_empty() {
        let mut inflow_usd: HashMap<String, f64> = HashMap::new();
        let mut outflow_usd: HashMap<String, f64> = HashMap::new();
        let mut total_gross_usd: f64 = 0.0_f64;
        let mut total_net_principal_usd: f64 = 0.0_f64;
        let mut total_buy_kas: f64 = 0.0_f64;
        let mut total_sell_kas: f64 = 0.0_f64;
        for ord in &queued_orders {
            let dir = ord.get("direction").and_then(|v| v.as_str()).unwrap_or("SELL_KAS");
            let pay_a = ord.get("pay_asset").and_then(|v| v.as_str())
                .unwrap_or(if dir.eq_ignore_ascii_case("BUY_KAS") { "USDC" } else { "KAS" })
                .trim().to_uppercase();
            let rec_a = ord.get("receive_asset").and_then(|v| v.as_str())
                .unwrap_or(if dir.eq_ignore_ascii_case("BUY_KAS") { "KAS" } else { "USDC" })
                .trim().to_uppercase();
            let amt_kas: f64 = ord.get("amount_kas").and_then(|v| v.as_f64()).unwrap_or(0.0_f64).max(0.0_f64);
            let gross_u: f64 = ord.get("gross_usd").and_then(|v| v.as_f64()).unwrap_or(amt_kas * kas_spot_usd).max(0.0_f64);
            let net_u: f64 = ord.get("net_usd").and_then(|v| v.as_f64()).unwrap_or(gross_u).max(0.0_f64);
            total_gross_usd += gross_u;
            total_net_principal_usd += net_u;
            if dir.eq_ignore_ascii_case("BUY_KAS") {
                total_buy_kas += amt_kas;
            } else if dir.eq_ignore_ascii_case("SELL_KAS") {
                total_sell_kas += amt_kas;
            }
            *inflow_usd.entry(pay_a).or_insert(0.0_f64) += net_u;
            *outflow_usd.entry(rec_a).or_insert(0.0_f64) += net_u;
        }
        let mut all_assets: HashSet<String> = inflow_usd.keys().cloned().collect();
        all_assets.extend(outflow_usd.keys().cloned());
        let mut net_delta_usd: HashMap<String, f64> = HashMap::new();
        let mut user_crossed_usd: f64 = 0.0_f64;
        for asset in &all_assets {
            let inf: f64 = inflow_usd.get(asset).copied().unwrap_or(0.0_f64);
            let outf: f64 = outflow_usd.get(asset).copied().unwrap_or(0.0_f64);
            user_crossed_usd += inf.min(outf);
            net_delta_usd.insert(asset.clone(), inf - outf);
        }
        let mut miner_silos_crossed_count: usize = 0;
        let mut miner_silo_crossed_kas: f64 = 0.0_f64;
        let mut miner_silo_crossed_usd: f64 = 0.0_f64;
        let mut silo_fees_captured_usd: f64 = 0.0_f64;
        if net_delta_usd.get("KAS").copied().unwrap_or(0.0_f64) < -0.05_f64 {
            let cc_rows = sqlx::query("SELECT wallet_address, layout_state FROM user_command_centers")
                .fetch_all(pool).await.unwrap_or_default();
            for row in cc_rows {
                if net_delta_usd.get("KAS").copied().unwrap_or(0.0_f64) >= -0.05_f64 { break; }
                let raw_wallet: String = row.try_get("wallet_address").unwrap_or_default();
                let clean_wallet = raw_wallet.trim().to_lowercase().replace("kaspa:", "").trim().to_string();
                if clean_wallet.is_empty() { continue; }
                let prefixed_wallet = format!("kaspa:{}", clean_wallet);
                let mut layout: Value = row.try_get("layout_state").unwrap_or_else(|_| json!({ "sectors": [] }));
                let mut row_mutated = false;
                if let Some(sectors) = layout.get_mut("sectors").and_then(|v| v.as_array_mut()) {
                    for sec in sectors.iter_mut() {
                        let pending: f64 = sec.get("pendingKaspa").and_then(|v| v.as_f64()).unwrap_or(0.0_f64).max(0.0_f64);
                        if pending <= 1e-6_f64 { continue; }
                        let route_mode = sec.get("routeMode").and_then(|v| v.as_str()).unwrap_or("hold").to_lowercase();
                        if route_mode != "swap" && route_mode != "convert" { continue; }
                        let sec_ticker = sec.get("settlementConfig").and_then(|c| c.get("targetAsset"))
                            .and_then(|t| t.get("ticker")).and_then(|v| v.as_str()).unwrap_or("").trim().to_uppercase();
                        if sec_ticker.is_empty() || sec_ticker == "KAS" { continue; }
                        let short_kas_usd: f64 = (-net_delta_usd.get("KAS").copied().unwrap_or(0.0_f64)).max(0.0_f64);
                        let surplus_tok_usd: f64 = net_delta_usd.get(&sec_ticker).copied().unwrap_or(0.0_f64).max(0.0_f64);
                        let matchable_usd: f64 = short_kas_usd.min(surplus_tok_usd);
                        if matchable_usd <= 0.05_f64 { continue; }
                        let target_spot: f64 = if sec_ticker == "USD" {
                            1.0_f64
                        } else {
                            match crate::fiat_rails::resolve_live_spot_price(pool, &sec_ticker).await {
                                Ok(p) if p > 0.0_f64 => p,
                                _ => continue,
                            }
                        };
                        let take_kas: f64 = pending.min(matchable_usd / kas_spot_usd);
                        if take_kas <= 1e-6_f64 { continue; }
                        let (u_floor, _, _) = crate::fiat_rails::resolve_wallet_swap_fee_floor_pct(pool, &prefixed_wallet).await;
                        let eff_rate: f64 = u_floor.max(crate::fiat_rails::HARD_PROFIT_FLOOR_PCT);
                        let gross_silo_usd: f64 = take_kas * kas_spot_usd;
                        let fee_silo_usd: f64 = (gross_silo_usd * eff_rate).max(0.01_f64);
                        let net_silo_usd: f64 = (gross_silo_usd - fee_silo_usd).max(0.0_f64);
                        if net_silo_usd <= 0.0_f64 { continue; }
                        let credit_ticker = if sec_ticker == "USD" { "USDC" } else { sec_ticker.as_str() };
                        let out_tokens: f64 = ((net_silo_usd / target_spot) * 1e8_f64).round() / 1e8_f64;
                        if out_tokens <= 0.0_f64 { continue; }
                        if crate::state_api::credit_user_token_balance(
                            pool, &clean_wallet, &prefixed_wallet, credit_ticker, out_tokens, false,
                        ).await.is_ok() {
                            sec["pendingKaspa"] = json!(((pending - take_kas).max(0.0_f64) * 1e8_f64).round() / 1e8_f64);
                            row_mutated = true;
                            miner_silos_crossed_count += 1;
                            miner_silo_crossed_kas += take_kas;
                            miner_silo_crossed_usd += net_silo_usd;
                            silo_fees_captured_usd += fee_silo_usd;
                            *net_delta_usd.entry("KAS".to_string()).or_insert(0.0_f64) += net_silo_usd;
                            *net_delta_usd.entry(sec_ticker.clone()).or_insert(0.0_f64) -= net_silo_usd;
                            let tx_ref = format!("{}-SILO-{}", batch_id, miner_silos_crossed_count);
                            let _ = crate::sor::record_hifo_acquisition_lot(
                                pool, &clean_wallet, credit_ticker, out_tokens, target_spot, "DARK_POOL_SILO_CROSS", Some(&tx_ref),
                            ).await;
                            let _ = sqlx::query(
                                "INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash, cost_basis_usd, realized_gain_loss_usd, holding_period) VALUES ($1, $2, 'DARK_POOL_SILO_CROSS', $3, $4, $5, $6, $3, 0.0, 'SHORT_TERM')",
                            ).bind(&clean_wallet).bind(credit_ticker).bind(net_silo_usd).bind(out_tokens).bind(target_spot).bind(&tx_ref).execute(pool).await;
                        }
                    }
                }
                if row_mutated {
                    let _ = sqlx::query(
                        "UPDATE user_command_centers SET layout_state = $2, last_updated = CURRENT_TIMESTAMP WHERE wallet_address = $1",
                    ).bind(&raw_wallet).bind(&layout).execute(pool).await;
                }
            }
        }
        let final_residual_usd: f64 = 0.5_f64 * net_delta_usd.values().map(|v| v.abs()).sum::<f64>();
        let combined_principal_usd: f64 = total_net_principal_usd + miner_silo_crossed_usd;
        let internal_offset_usd: f64 = (combined_principal_usd - final_residual_usd).max(0.0_f64);
        let offset_efficiency_pct: f64 = if combined_principal_usd > 0.0_f64 {
            ((internal_offset_usd / combined_principal_usd) * 100.0_f64).clamp(0.0_f64, 100.0_f64)
        } else { 100.0_f64 };
        let spread_saved_usd: f64 = internal_offset_usd * 0.005_f64;
        let incremental_profit_usd: f64 = spread_saved_usd + silo_fees_captured_usd;
        if incremental_profit_usd > 0.0_f64 {
            let _: redis::RedisResult<()> = redis::cmd("INCRBYFLOAT")
                .arg("perennia:treasury:netting_profit_usd").arg(incremental_profit_usd)
                .query_async(&mut redis_conn).await;
        }
        if silo_fees_captured_usd > 0.0_f64 {
            let _: redis::RedisResult<()> = redis::cmd("INCRBYFLOAT")
                .arg("perennia:fees:batch_accumulated:USDC").arg(silo_fees_captured_usd * 0.60_f64)
                .query_async(&mut redis_conn).await;
        }
        let residual_kas_delta: f64 = net_delta_usd.get("KAS").copied().unwrap_or(0.0_f64) / kas_spot_usd;
        if residual_kas_delta.abs() > 1e-8_f64 {
            let _: redis::RedisResult<()> = redis::cmd("INCRBYFLOAT")
                .arg("perennia:treasury:unhedged_delta_kas").arg(residual_kas_delta)
                .query_async(&mut redis_conn).await;
        }
        let mut external_tickets_staged: usize = 0;
        let mut sorted_assets: Vec<String> = net_delta_usd.keys().cloned().collect();
        sorted_assets.sort();
        for asset in sorted_assets {
            if asset == "KAS" { continue; }
            let delta_u: f64 = net_delta_usd.get(&asset).copied().unwrap_or(0.0_f64);
            if delta_u.abs() >= min_dark_pool_usd {
                let ticket = json!({
                    "batch_id": batch_id,
                    "type": "NET_RESIDUAL_AUTOBALANCE",
                    "target_asset": asset,
                    "rebalance_action": if delta_u > 0.0_f64 { "SELL_SURPLUS_FOR_KAS" } else { "BUY_DEFICIT_WITH_KAS" },
                    "residual_usd": (delta_u.abs() * 10000.0_f64).round() / 10000.0_f64,
                    "kas_equiv": ((delta_u.abs() / kas_spot_usd) * 10000.0_f64).round() / 10000.0_f64,
                    "orders_consolidated": queued_orders.len(),
                    "offset_efficiency_pct": (offset_efficiency_pct * 100.0_f64).round() / 100.0_f64,
                    "created_at": Utc::now().to_rfc3339()
                });
                let _: redis::RedisResult<()> = redis::cmd("LPUSH")
                    .arg("perennia:sor:third_party_passthrough_queue").arg(ticket.to_string())
                    .query_async(&mut redis_conn).await;
                let _: redis::RedisResult<()> = redis::cmd("LTRIM")
                    .arg("perennia:sor:third_party_passthrough_queue").arg(0).arg(199)
                    .query_async(&mut redis_conn).await;
                external_tickets_staged += 1;
            }
        }
        batch_receipt = json!({
            "batchId": batch_id,
            "ordersPopped": queued_orders.len(),
            "totalGrossUsd": (total_gross_usd * 10000.0_f64).round() / 10000.0_f64,
            "totalNetPrincipalUsd": (total_net_principal_usd * 10000.0_f64).round() / 10000.0_f64,
            "totalBuyKas": (total_buy_kas * 10000.0_f64).round() / 10000.0_f64,
            "totalSellKas": (total_sell_kas * 10000.0_f64).round() / 10000.0_f64,
            "userToUserCrossedUsd": (user_crossed_usd * 10000.0_f64).round() / 10000.0_f64,
            "minerSilosCrossedCount": miner_silos_crossed_count,
            "minerSiloCrossedKas": (miner_silo_crossed_kas * 10000.0_f64).round() / 10000.0_f64,
            "minerSiloCrossedUsd": (miner_silo_crossed_usd * 10000.0_f64).round() / 10000.0_f64,
            "internalDarkPoolOffsetUsd": (internal_offset_usd * 10000.0_f64).round() / 10000.0_f64,
            "finalResidualUsd": (final_residual_usd * 10000.0_f64).round() / 10000.0_f64,
            "offsetEfficiencyPct": (offset_efficiency_pct * 100.0_f64).round() / 100.0_f64,
            "spreadSavedUsd": (spread_saved_usd * 10000.0_f64).round() / 10000.0_f64,
            "siloFeesCapturedUsd": (silo_fees_captured_usd * 10000.0_f64).round() / 10000.0_f64,
            "externalTicketsStaged": external_tickets_staged,
            "netDeltaUsdByAsset": net_delta_usd,
            "kasSpotUsd": kas_spot_usd,
            "completedAtMs": Utc::now().timestamp_millis()
        });
        let serialized_receipt = batch_receipt.to_string();
        let _: redis::RedisResult<()> = redis::cmd("SET")
            .arg("perennia:settlement:last_netting_batch").arg(&serialized_receipt)
            .query_async(&mut redis_conn).await;
        let _: redis::RedisResult<()> = redis::cmd("SET")
            .arg("perennia:treasury:hedge_status").arg(&serialized_receipt)
            .query_async(&mut redis_conn).await;
        if miner_silos_crossed_count > 0 {
            let _ = publish_live_epoch_bucket_telemetry(pool, kas_spot_usd).await;
        }
    }
    let house_usdc_fees: f64 = redis::cmd("GET")
        .arg("perennia:fees:batch_accumulated:USDC")
        .query_async::<_, Option<String>>(&mut redis_conn).await
        .ok().flatten().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0_f64);
    if house_usdc_fees >= min_dark_pool_usd {
        if let Ok(master_wallet) = crate::chronos::resolve_master_treasury_prefixed() {
            let half_usd: f64 = house_usdc_fees * 0.5_f64;
            let kas_leg: f64 = half_usd / kas_spot_usd;
            let usdc_leg: f64 = half_usd;
            let existing_house_lp = sqlx::query(
                "SELECT lp_id::text AS lp_id, staked_asset_a, staked_asset_b FROM liquidity_providers WHERE wallet_address = $1 AND pool_pair = 'KAS/USDC' AND lock_duration_days = 365 ORDER BY created_at ASC LIMIT 1",
            ).bind(&master_wallet).fetch_optional(pool).await?;
            if let Some(row) = existing_house_lp {
                let lp_id: String = row.try_get("lp_id").unwrap_or_default();
                let next_a: f64 = row.try_get::<f64, _>("staked_asset_a").unwrap_or(0.0_f64) + kas_leg;
                let next_b: f64 = row.try_get::<f64, _>("staked_asset_b").unwrap_or(0.0_f64) + usdc_leg;
                let reserves_json = json!({ "KAS": next_a, "USDC": next_b });
                let _ = sqlx::query(
                    "UPDATE liquidity_providers SET staked_asset_a = $2, staked_asset_b = $3, reserves_json = $4, last_yield_distribution = CURRENT_TIMESTAMP WHERE lp_id::text = $1",
                ).bind(&lp_id).bind(next_a).bind(next_b).bind(&reserves_json).execute(pool).await;
            } else {
                let weights_json = json!({ "KAS": 0.5, "USDC": 0.5 });
                let reserves_json = json!({ "KAS": kas_leg, "USDC": usdc_leg });
                let _ = sqlx::query(
                    "INSERT INTO liquidity_providers (wallet_address, pool_pair, staked_asset_a, staked_asset_b, weights_json, reserves_json, lock_duration_days, unlock_date) VALUES ($1, 'KAS/USDC', $2, $3, $4, $5, 365, CURRENT_TIMESTAMP + INTERVAL '365 days')",
                ).bind(&master_wallet).bind(kas_leg).bind(usdc_leg).bind(&weights_json).bind(&reserves_json).execute(pool).await;
            }
            let _: redis::RedisResult<()> = redis::cmd("SET")
                .arg("perennia:fees:batch_accumulated:USDC").arg("0")
                .query_async(&mut redis_conn).await;
        }
    }
    let lp_rows = sqlx::query(
        "SELECT lp_id::text AS lp_id, wallet_address, pool_pair, staked_asset_a, staked_asset_b, lock_duration_days FROM liquidity_providers",
    ).fetch_all(pool).await?;
    if lp_rows.is_empty() { return Ok(batch_receipt); }
    let mut pair_weights: HashMap<String, f64> = HashMap::new();
    let mut lp_entries: Vec<(String, String, String, f64)> = Vec::with_capacity(lp_rows.len());
    for r in &lp_rows {
        let lp_id: String = r.try_get("lp_id").unwrap_or_default();
        let wallet: String = r.try_get("wallet_address").unwrap_or_default();
        let pair: String = r.try_get("pool_pair").unwrap_or_else(|_| "KAS/USDC".to_string());
        let amt_a: f64 = r.try_get("staked_asset_a").unwrap_or(0.0_f64).max(0.0_f64);
        let days: i32 = r.try_get("lock_duration_days").unwrap_or(0);
        let weighted_kas: f64 = amt_a * lock_multiplier_for_days(days);
        if weighted_kas > 0.0_f64 && !wallet.trim().is_empty() {
            *pair_weights.entry(pair.clone()).or_insert(0.0_f64) += weighted_kas;
            lp_entries.push((lp_id, wallet, pair, weighted_kas));
        }
    }
    for (pair, total_pair_weight) in pair_weights {
        if total_pair_weight <= 0.0_f64 { continue; }
        let pending_key = format!("perennia:lp:pending_yield_usd:{}", pair);
        let pending_usd: f64 = redis::cmd("GET").arg(&pending_key)
            .query_async::<_, Option<String>>(&mut redis_conn).await
            .ok().flatten().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0_f64);
        if pending_usd < 0.05_f64 { continue; }
        let _: redis::RedisResult<()> = redis::cmd("SET").arg(&pending_key).arg("0").query_async(&mut redis_conn).await;
        let total_yield_kas: f64 = pending_usd / kas_spot_usd;
        for (lp_id, wallet, lp_pair, weight) in &lp_entries {
            if *lp_pair != pair { continue; }
            let share_kas: f64 = total_yield_kas * (*weight / total_pair_weight);
            if share_kas <= 1e-6_f64 { continue; }
            let clean_w = wallet.trim().to_lowercase().replace("kaspa:", "").trim().to_string();
            let pref_w = format!("kaspa:{}", clean_w);
            if crate::state_api::credit_user_token_balance(pool, &clean_w, &pref_w, "KAS", share_kas, true).await.is_ok() {
                let _ = sqlx::query("UPDATE liquidity_providers SET last_yield_distribution = CURRENT_TIMESTAMP WHERE lp_id::text = $1")
                    .bind(lp_id).execute(pool).await;
            }
        }
    }
    Ok(batch_receipt)
}
pub async fn execute_epoch_delta_netting_and_lp_compounding(
    pool: &PgPool,
) -> anyhow::Result<Value> {
    let kas_spot_usd: f64 = crate::fiat_rails::resolve_live_spot_price(pool, "KAS")
        .await.map_err(|e| anyhow::anyhow!("Epoch netting aborted (fail-closed): {}", e))?;
    let rows = sqlx::query("SELECT wallet_address, layout_state FROM user_command_centers").fetch_all(pool).await?;
    let mut pooled_swap_kas: HashMap<String, f64> = HashMap::new();
    for r in &rows {
        let layout: Value = r.try_get("layout_state").unwrap_or_else(|_| json!({ "sectors": [] }));
        if let Some(sectors) = layout.get("sectors").and_then(|v| v.as_array()) {
            for sec in sectors {
                let pending: f64 = sec.get("pendingKaspa").and_then(|v| v.as_f64()).unwrap_or(0.0_f64);
                if pending <= 0.0_f64 { continue; }
                let route_mode = sec.get("routeMode").and_then(|v| v.as_str()).unwrap_or("hold").to_lowercase();
                if route_mode != "swap" && route_mode != "convert" { continue; }
                let tick = sec.get("settlementConfig").and_then(|c| c.get("targetAsset"))
                    .and_then(|t| t.get("ticker")).and_then(|v| v.as_str()).unwrap_or("KAS").trim().to_uppercase();
                if !tick.is_empty() && tick != "KAS" {
                    *pooled_swap_kas.entry(tick).or_insert(0.0_f64) += pending;
                }
            }
        }
    }
    let mut eligible_bucket_spot: HashMap<String, f64> = HashMap::new();
    for (tick, total_bucket_kas) in &pooled_swap_kas {
        let (min_prof_kas, _) = crate::fiat_rails::resolve_live_profitable_bucket_threshold(pool, tick, kas_spot_usd).await;
        if *total_bucket_kas + 1e-6_f64 < min_prof_kas { continue; }
        let spot_opt: Option<f64> = if tick == "USD" {
            Some(1.0_f64)
        } else {
            crate::fiat_rails::resolve_live_spot_price(pool, tick).await.ok().filter(|&p| p > 0.0_f64)
        };
        if let Some(sp) = spot_opt {
            eligible_bucket_spot.insert(tick.clone(), sp);
        }
    }
    let mut settled_sectors_count: usize = 0;
    let mut total_swept_kas: f64 = 0.0_f64;
    let mut total_epoch_fees_usd: f64 = 0.0_f64;
    for row in rows {
        let raw_wallet: String = row.try_get("wallet_address").unwrap_or_default();
        let clean_wallet = raw_wallet.trim().to_lowercase().replace("kaspa:", "").trim().to_string();
        if clean_wallet.is_empty() { continue; }
        let prefixed_wallet = format!("kaspa:{}", clean_wallet);
        let (user_fee_floor_rate, _, _) = crate::fiat_rails::resolve_wallet_swap_fee_floor_pct(pool, &prefixed_wallet).await;
        let effective_swap_fee_rate: f64 = user_fee_floor_rate.max(crate::fiat_rails::HARD_PROFIT_FLOOR_PCT);
        let mut layout: Value = row.try_get("layout_state").unwrap_or_else(|_| json!({ "workers": [], "sectors": [] }));
        let mut wallet_credited_kas: f64 = 0.0_f64;
        let mut layout_mutated = false;
        if let Some(sectors) = layout.get_mut("sectors").and_then(|v| v.as_array_mut()) {
            for sec in sectors.iter_mut() {
                let pending: f64 = sec.get("pendingKaspa").and_then(|v| v.as_f64()).unwrap_or(0.0_f64);
                if pending <= 0.0_f64 { continue; }
                let route_mode = sec.get("routeMode").and_then(|v| v.as_str()).unwrap_or("hold").to_lowercase();
                let target_ticker = sec.get("settlementConfig").and_then(|c| c.get("targetAsset"))
                    .and_then(|t| t.get("ticker")).and_then(|v| v.as_str()).unwrap_or("KAS").trim().to_uppercase();
                if route_mode == "auto-lp" {
                    let secondary_ticker = if target_ticker == "KAS" || target_ticker.is_empty() || target_ticker == "USD" {
                        "USDC".to_string()
                    } else { target_ticker.clone() };
                    let Ok(secondary_spot_usd) = crate::fiat_rails::resolve_live_spot_price(pool, &secondary_ticker).await else { continue; };
                    if secondary_spot_usd <= 0.0_f64 { continue; }
                    let kas_leg: f64 = pending * 0.5_f64;
                    let converted_leg_gross_usd: f64 = kas_leg * kas_spot_usd;
                    let protocol_fee_usd: f64 = (converted_leg_gross_usd * effective_swap_fee_rate).max(0.01_f64);
                    let secondary_leg: f64 = (converted_leg_gross_usd - protocol_fee_usd).max(0.0_f64) / secondary_spot_usd;
                    if secondary_leg <= 0.0_f64 { continue; }
                    let pair_name = format!("KAS/{}", secondary_ticker);
                    let weights_json = json!({ "KAS": 0.5, secondary_ticker.clone(): 0.5 });
                    let reserves_json = json!({ "KAS": kas_leg, secondary_ticker.clone(): secondary_leg });
                    let _ = sqlx::query(
                        "INSERT INTO liquidity_providers (wallet_address, pool_pair, staked_asset_a, staked_asset_b, weights_json, reserves_json, lock_duration_days, unlock_date) VALUES ($1, $2, $3, $4, $5, $6, 30, CURRENT_TIMESTAMP + INTERVAL '30 days')",
                    ).bind(&prefixed_wallet).bind(&pair_name).bind(kas_leg).bind(secondary_leg).bind(&weights_json).bind(&reserves_json).execute(pool).await;
                    total_epoch_fees_usd += protocol_fee_usd;
                } else if (route_mode == "swap" || route_mode == "convert") && target_ticker != "KAS" && !target_ticker.is_empty() {
                    let Some(&target_spot_usd) = eligible_bucket_spot.get(&target_ticker) else { continue; };
                    let gross_usd: f64 = pending * kas_spot_usd;
                    let fee_usd: f64 = (gross_usd * effective_swap_fee_rate).max(0.01_f64);
                    let net_usd: f64 = (gross_usd - fee_usd).max(0.0_f64);
                    if net_usd <= 0.0_f64 { continue; }
                    let credit_ticker = if target_ticker == "USD" { "USDC" } else { target_ticker.as_str() };
                    let out_tokens: f64 = ((net_usd / target_spot_usd) * 1e8_f64).round() / 1e8_f64;
                    if out_tokens <= 0.0_f64 { continue; }
                    if crate::state_api::credit_user_token_balance(pool, &clean_wallet, &prefixed_wallet, credit_ticker, out_tokens, false).await.is_err() {
                        continue;
                    }
                    total_epoch_fees_usd += fee_usd;
                    let _ = crate::sor::record_hifo_acquisition_lot(pool, &clean_wallet, credit_ticker, out_tokens, target_spot_usd, "EPOCH_BELL_SWAP", None).await;
                    let _ = sqlx::query(
                        "INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, cost_basis_usd, realized_gain_loss_usd, holding_period) VALUES ($1, $2, 'EPOCH_BELL_SWAP', $3, $4, $5, $3, 0.0, 'SHORT_TERM')",
                    ).bind(&clean_wallet).bind(credit_ticker).bind(net_usd).bind(out_tokens).bind(target_spot_usd).execute(pool).await;
                } else {
                    wallet_credited_kas += pending;
                }
                sec["pendingKaspa"] = json!(0.0);
                layout_mutated = true;
                settled_sectors_count += 1;
                total_swept_kas += pending;
            }
        }
        if wallet_credited_kas > 0.0_f64 {
            if crate::state_api::credit_user_token_balance(pool, &clean_wallet, &prefixed_wallet, "KAS", wallet_credited_kas, true).await.is_err() {
                continue;
            }
            let _ = crate::sor::record_hifo_acquisition_lot(pool, &clean_wallet, "KAS", wallet_credited_kas, kas_spot_usd, "EPOCH_BELL_YIELD", None).await;
            let gross_usd: f64 = wallet_credited_kas * kas_spot_usd;
            let _ = sqlx::query(
                "INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, cost_basis_usd, realized_gain_loss_usd, holding_period) VALUES ($1, 'KAS', 'YIELD', $2, $3, $4, $2, 0.0, 'SHORT_TERM')",
            ).bind(&clean_wallet).bind(gross_usd).bind(wallet_credited_kas).bind(kas_spot_usd).execute(pool).await;
        }
        if layout_mutated {
            let _ = sqlx::query("UPDATE user_command_centers SET layout_state = $2, last_updated = CURRENT_TIMESTAMP WHERE wallet_address = $1")
                .bind(&raw_wallet).bind(&layout).execute(pool).await;
        }
    }
    if total_epoch_fees_usd > 0.0_f64 {
        if let Ok(redis_url) = env::var("REDIS_URL") {
            if let Ok(client) = redis::Client::open(redis_url) {
                if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                    let _: redis::RedisResult<()> = redis::cmd("INCRBYFLOAT")
                        .arg("perennia:treasury:netting_profit_usd").arg(total_epoch_fees_usd).query_async(&mut conn).await;
                    let _: redis::RedisResult<()> = redis::cmd("INCRBYFLOAT")
                        .arg("perennia:fees:batch_accumulated:USDC").arg(total_epoch_fees_usd * 0.60_f64).query_async(&mut conn).await;
                }
            }
        }
    }
    let epoch_telemetry = publish_live_epoch_bucket_telemetry(pool, kas_spot_usd).await.unwrap_or_else(|_| json!({}));
    Ok(json!({
        "pooledBucketsCleared": eligible_bucket_spot.keys().cloned().collect::<Vec<String>>(),
        "settledSectorsCount": settled_sectors_count,
        "totalSweptKas": (total_swept_kas * 10000.0_f64).round() / 10000.0_f64,
        "totalProtocolFeesUsd": (total_epoch_fees_usd * 10000.0_f64).round() / 10000.0_f64,
        "executionKasSpotUsd": kas_spot_usd,
        "epochTelemetry": epoch_telemetry,
        "settledAt": Utc::now().to_rfc3339()
    }))
}
```

## File: src/fiat_rails.rs
```rust
use axum::{
    extract::{Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
    routing::{get, post},
    Router,
};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::env;
use std::time::{SystemTime, UNIX_EPOCH};
use uuid::Uuid;
pub const INITIAL_LOCAL_KAS_FLOAT_USD: f64 = 500.0;
pub const INITIAL_WHOLESALE_API_USD_FLOAT: f64 = 400.0;
pub const TARGET_RATCHET_FLOAT_CAP_USD: f64 = 5_000.0;
pub const HARD_PROFIT_FLOOR_PCT: f64 = 0.001;
pub const BUY_KAS_INBOUND_FEE_PCT: f64 = 0.002;
pub const WHOLESALE_VOLUME_SWAP_FEE_PCT: f64 = 0.0025;
pub const SILO_SHIELD_SWAP_FEE_PCT: f64 = 0.0035;
pub const STANDARD_PUBLIC_SWAP_FEE_PCT: f64 = 0.005;
pub const PASS_THROUGH_SWAP_FEE_PCT: f64 = 0.0085;
pub const RETAIL_ONRAMP_FEE_BPS: u64 = 85;
pub const PRO_MINER_ONRAMP_FEE_BPS: u64 = 35;
pub const INSTITUTIONAL_WIRE_ONRAMP_FEE_BPS: u64 = 20;
pub const MIN_ONRAMP_FEE_FLOOR_CENTS: i64 = 250;
pub const ACH_AUTO_DEFAULT_THRESHOLD_CENTS: i64 = 62_500;
pub const PRO_TIER_THRESHOLD_CENTS: i64 = 1_000_000;
pub const INSTITUTIONAL_WIRE_THRESHOLD_CENTS: i64 = 10_000_000;
pub const MERCURY_COLUMN_ABA_ROUTING: &str = "121145433";
pub const MERCURY_COLUMN_ACCOUNT_NUMBER: &str = "580798008849901";
pub const MERCURY_COLUMN_BANK_NAME: &str = "Column N.A. (Mercury)";
const MIN_DISCOVERY_CEX_VOLUME_USD: f64 = 25_000.0;
const MAX_DISCOVERY_CEX_SPREAD_RATIO: f64 = 0.05;
const MAX_CANONICAL_DEVIATION_RATIO: f64 = 0.08;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GatewayGrossUpBreakdown {
    pub tier_name: String,
    pub tier_bps: u64,
    pub payment_method: String,
    pub principal_cents: i64,
    pub perennia_fee_cents: i64,
    pub target_net_cents: i64,
    pub stripe_gateway_fee_cents: i64,
    pub gross_charge_cents: i64,
    pub requires_institutional_wire: bool,
    pub auto_defaulted_to_ach: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CostPlusQuoteBreakdown {
    pub direction: String,
    pub asset_ticker: String,
    pub gross_usd: f64,
    pub hard_execution_and_repar_cost_usd: f64,
    pub guaranteed_net_profit_usd: f64,
    pub quoted_guest_fee_usd: f64,
    pub effective_fee_pct: f64,
    pub protocol_fee_floor_pct: f64,
    pub miner_or_pass_discount_active: bool,
    pub guest_net_usd: f64,
    pub estimated_tokens: f64,
    pub spot_price_usd: f64,
    pub competitor_fee_usd: f64,
    pub competitor_net_usd: f64,
    pub guest_savings_vs_competitor_usd: f64,
    pub routing_topology: String,
    pub bank_rail: String,
    pub whale_wire_fee_waived: bool,
    pub bundled_usdc_fee_waived: bool,
    pub circuit_breaker_tripped: bool,
    pub circuit_breaker_reason: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PostTradeUsdAllocation {
    pub gross_inbound_usd: f64,
    pub wholesale_api_float_sweep_usd: f64,
    pub chronos_miner_settlement_usd: f64,
    pub llc_tax_and_rail_reserve_usd: f64,
    pub net_profit_and_ratchet_usd: f64,
    pub float_ratchet_reinvest_usd: f64,
    pub dark_pool_lp_and_owner_draw_usd: f64,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BootstrapFloatState {
    pub local_kas_reserve_usd: f64,
    pub local_kas_target_cap_usd: f64,
    pub wholesale_api_working_usd: f64,
    pub wholesale_api_target_cap_usd: f64,
    pub combined_float_usd: f64,
    pub ratchet_target_cap_usd: f64,
    pub commercial_checking_cleared_usd: f64,
    pub llc_tax_escrow_reserve_usd: f64,
    pub dark_pool_lp_vault_usd: f64,
    pub master_treasury_wallet: String,
    pub updated_at: String,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuoteQueryParams {
    pub direction: Option<String>,
    pub asset: Option<String>,
    pub amount_usd: Option<f64>,
    pub amount_tokens: Option<f64>,
    pub payment_rail: Option<String>,
    pub payment_method: Option<String>,
    pub settlement_target: Option<String>,
    pub auto_stake_silo: Option<bool>,
    pub bundled_kas_or_silo: Option<bool>,
    pub wallet: Option<String>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OnrampOrderRequest {
    pub wallet_address: String,
    pub fiat_amount_usd: f64,
    pub target_asset: Option<String>,
    pub payment_rail: Option<String>,
    pub payment_method: Option<String>,
    pub settlement_target: Option<String>,
    pub destination_wallet_address: Option<String>,
    pub auto_stake_silo: Option<bool>,
    pub bundled_kas_or_silo: Option<bool>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OfframpOrderRequest {
    pub wallet_address: String,
    pub source_asset: String,
    pub amount_crypto: Option<f64>,
    pub gross_usd: Option<f64>,
    pub payout_method: Option<String>,
    pub bank_label: Option<String>,
    pub account_type: Option<String>,
    pub bank_last4: Option<String>,
    pub routing_number: Option<String>,
    pub tx_id: Option<String>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LiveWebhookRequest {
    pub event_type: String,
    pub order_id: Option<String>,
    pub payout_id: Option<String>,
    pub confirmations: Option<i32>,
    pub trace_id: Option<String>,
    pub tx_hash: Option<String>,
    pub settled_net_cents: Option<i64>,
    pub quarantine_on_shortfall: Option<bool>,
}
fn round_cents(val: f64) -> f64 {
    (val * 100.0).round() / 100.0
}
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
fn verify_director_or_webhook_headers(headers: &HeaderMap) -> Result<(), (StatusCode, Json<Value>)> {
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let internal_token = env::var("INTERNAL_ADMIN_TOKEN")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let admin_key = env::var("PERENNIA_ADMIN_KEY")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let mut authorized = false;
    if let Some(tok) = internal_token {
        let expected = format!("Bearer {}", tok);
        if constant_time_eq(auth_header.as_bytes(), expected.as_bytes()) {
            authorized = true;
        }
    }
    if !authorized {
        if let Some(key) = admin_key {
            let expected = format!("Bearer {}", key);
            if constant_time_eq(auth_header.as_bytes(), expected.as_bytes()) {
                authorized = true;
            }
        }
    }
    if !authorized {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({
                "error": "UNAUTHORIZED: Valid Director or internal webhook bearer token required."
            })),
        ));
    }
    Ok(())
}
pub fn calculate_gateway_gross_up_cents(
    principal_cents: i64,
    loyal_miner_or_subscriber: bool,
    payment_method: &str,
) -> GatewayGrossUpBreakdown {
    let safe_principal = principal_cents.max(0);
    if safe_principal >= INSTITUTIONAL_WIRE_THRESHOLD_CENTS {
        let pct_fee = ((safe_principal as f64)
            * (INSTITUTIONAL_WIRE_ONRAMP_FEE_BPS as f64)
            / 10_000.0)
            .ceil() as i64;
        let perennia_fee = pct_fee.max(MIN_ONRAMP_FEE_FLOOR_CENTS);
        let target_net = safe_principal + perennia_fee;
        return GatewayGrossUpBreakdown {
            tier_name: "INSTITUTIONAL_WIRE".to_string(),
            tier_bps: INSTITUTIONAL_WIRE_ONRAMP_FEE_BPS,
            payment_method: "wire".to_string(),
            principal_cents: safe_principal,
            perennia_fee_cents: perennia_fee,
            target_net_cents: target_net,
            stripe_gateway_fee_cents: 0,
            gross_charge_cents: target_net,
            requires_institutional_wire: true,
            auto_defaulted_to_ach: false,
        };
    }
    let is_pro_or_miner =
        safe_principal >= PRO_TIER_THRESHOLD_CENTS || loyal_miner_or_subscriber;
    let (tier_name, tier_bps) = if is_pro_or_miner {
        ("PRO_MINER".to_string(), PRO_MINER_ONRAMP_FEE_BPS)
    } else {
        ("RETAIL".to_string(), RETAIL_ONRAMP_FEE_BPS)
    };
    let perennia_fee = if safe_principal > 0 {
        let pct_fee =
            ((safe_principal as f64) * (tier_bps as f64) / 10_000.0).ceil() as i64;
        pct_fee.max(MIN_ONRAMP_FEE_FLOOR_CENTS)
    } else {
        0
    };
    let target_net = safe_principal + perennia_fee;
    let method_lower = payment_method.trim().to_lowercase();
    let auto_defaulted_to_ach =
        safe_principal >= ACH_AUTO_DEFAULT_THRESHOLD_CENTS && method_lower != "card";
    let resolved_method = if method_lower == "card" {
        "card"
    } else if method_lower == "wire" {
        "wire"
    } else {
        "ach"
    };
    let gross_charge = if safe_principal <= 0 || resolved_method == "wire" {
        target_net
    } else if resolved_method == "card" {
        (((target_net + 30) as f64) / 0.971).ceil() as i64
    } else if safe_principal >= ACH_AUTO_DEFAULT_THRESHOLD_CENTS {
        target_net + 500
    } else {
        let grossed_below_cap = ((target_net as f64) / 0.992).ceil() as i64;
        if (grossed_below_cap - target_net) > 500 {
            target_net + 500
        } else {
            grossed_below_cap
        }
    };
    let stripe_gateway_fee = (gross_charge - target_net).max(0);
    GatewayGrossUpBreakdown {
        tier_name,
        tier_bps,
        payment_method: resolved_method.to_string(),
        principal_cents: safe_principal,
        perennia_fee_cents: perennia_fee,
        target_net_cents: target_net,
        stripe_gateway_fee_cents: stripe_gateway_fee,
        gross_charge_cents: gross_charge,
        requires_institutional_wire: false,
        auto_defaulted_to_ach,
    }
}
pub async fn resolve_wallet_swap_fee_floor_pct(
    pool: &PgPool,
    wallet_address: &str,
) -> (f64, &'static str, bool) {
    let promo_cohort_active = env::var("KICKOFF_PROMO_COHORT_ACTIVE")
        .ok()
        .map(|v| matches!(v.trim().to_ascii_lowercase().as_str(), "1" | "true" | "yes"))
        .unwrap_or(false);
    let clean_wallet = wallet_address
        .trim()
        .to_lowercase()
        .replace("kaspa:", "")
        .trim()
        .to_string();
    if clean_wallet.is_empty() {
        return if promo_cohort_active {
            (HARD_PROFIT_FLOOR_PCT, "0.10% Kickoff Promo Floor", true)
        } else {
            (
                STANDARD_PUBLIC_SWAP_FEE_PCT,
                "0.50% Dark Pool Major Swap Tier",
                false,
            )
        };
    }
    let prefixed_wallet = format!("kaspa:{}", clean_wallet);
    let mut maintenance_grace_shield = false;
    // 1. Check Redis for active Stratum miner loyalty streak, monthly pass, or maintenance grace shield
    if let Ok(redis_url) = env::var("REDIS_URL") {
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                let loyalty_raw: Option<String> = redis::cmd("GET")
                    .arg(format!("perennia:miner:loyalty:{}", clean_wallet))
                    .query_async(&mut conn)
                    .await
                    .ok()
                    .flatten();
                if loyalty_raw.is_some() {
                    return (
                        HARD_PROFIT_FLOOR_PCT,
                        "0.10% Active Stratum Miner Wholesale Floor",
                        true,
                    );
                }
                let pass_raw: Option<String> = redis::cmd("GET")
                    .arg(format!("perennia:subscription:pass:{}", clean_wallet))
                    .query_async(&mut conn)
                    .await
                    .ok()
                    .flatten();
                if pass_raw.is_some() {
                    return (
                        HARD_PROFIT_FLOOR_PCT,
                        "0.10% Monthly Routing Pass Wholesale Floor",
                        true,
                    );
                }
                let shield_raw: Option<String> = redis::cmd("GET")
                    .arg("perennia:stratum:maintenance_grace_shield")
                    .query_async(&mut conn)
                    .await
                    .ok()
                    .flatten();
                if let Some(s) = shield_raw {
                    if s.trim() == "1" || s.trim().eq_ignore_ascii_case("true") {
                        maintenance_grace_shield = true;
                    }
                }
            }
        }
    }
    // 2. Check PostgreSQL worker_profiles within the 2-hour disconnect grace window (or 24h when Maintenance Grace Shield is armed)
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    let window_ms: i64 = if maintenance_grace_shield {
        86_400_000
    } else {
        7_200_000
    };
    let grace_cutoff_ms = now_ms - window_ms;
    let grace_cutoff_secs = (now_ms / 1000) - (window_ms / 1000);
    let has_active_miner: Option<i32> = sqlx::query_scalar(
        r#"
        SELECT 1
        FROM worker_profiles
        WHERE (LOWER(REPLACE(TRIM(wallet_address), 'kaspa:', '')) = $1 OR wallet_address = $2)
          AND (
              status IN ('online', 'grace_period')
              OR (last_share_ts > 10000000000 AND last_share_ts >= $3)
              OR (last_share_ts > 0 AND last_share_ts <= 10000000000 AND last_share_ts >= $4)
          )
        LIMIT 1
        "#,
    )
    .bind(&clean_wallet)
    .bind(&prefixed_wallet)
    .bind(grace_cutoff_ms)
    .bind(grace_cutoff_secs)
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    if has_active_miner.is_some() {
        return (
            HARD_PROFIT_FLOOR_PCT,
            "0.10% Active Stratum Miner Wholesale Floor",
            true,
        );
    }
    if promo_cohort_active {
        (
            HARD_PROFIT_FLOOR_PCT,
            "0.10% Kickoff Promo Wholesale Floor",
            true,
        )
    } else {
        (
            STANDARD_PUBLIC_SWAP_FEE_PCT,
            "0.50% Dark Pool Major Swap Tier",
            false,
        )
    }
}
async fn check_fiat_killswitch_and_firewall(
    clean_wallet: &str,
    prefixed_wallet: &str,
    asset_ticker: &str,
) -> Result<(), (StatusCode, Json<Value>)> {
    let clean_asset = asset_ticker.trim().to_uppercase();
    if let Ok(redis_url) = env::var("REDIS_URL") {
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                let ks_flag: Option<String> = redis::cmd("GET")
                    .arg("perennia:killswitch:fiat_onramp")
                    .query_async(&mut conn)
                    .await
                    .ok()
                    .flatten();
                if let Some(f) = ks_flag {
                    if f.trim() == "1" || f.trim().eq_ignore_ascii_case("true") {
                        return Err((
                            StatusCode::SERVICE_UNAVAILABLE,
                            Json(json!({
                                "error": "SUBSYSTEM_PAUSED: Fiat On-Ramp is currently paused by Director kill-switch."
                            })),
                        ));
                    }
                }
                if !clean_wallet.is_empty() {
                    let blk_w1: i32 = redis::cmd("SISMEMBER")
                        .arg("perennia:firewall:blacklisted_wallets")
                        .arg(clean_wallet)
                        .query_async(&mut conn)
                        .await
                        .unwrap_or(0);
                    let blk_w2: i32 = redis::cmd("SISMEMBER")
                        .arg("perennia:firewall:blacklisted_wallets")
                        .arg(prefixed_wallet)
                        .query_async(&mut conn)
                        .await
                        .unwrap_or(0);
                    if blk_w1 == 1 || blk_w2 == 1 {
                        return Err((
                            StatusCode::FORBIDDEN,
                            Json(json!({
                                "error": "FIREWALL_REJECTED: Wallet address is blacklisted by the Perennia Security Firewall."
                            })),
                        ));
                    }
                }
                let blk_tok: i32 = redis::cmd("SISMEMBER")
                    .arg("perennia:firewall:blacklisted_tokens")
                    .arg(&clean_asset)
                    .query_async(&mut conn)
                    .await
                    .unwrap_or(0);
                if blk_tok == 1 {
                    return Err((
                        StatusCode::FORBIDDEN,
                        Json(json!({
                            "error": format!("FIREWALL_REJECTED: Asset {} is blacklisted by the Perennia Reserve Firewall.", clean_asset)
                        })),
                    ));
                }
            }
        }
    }
    Ok(())
}
async fn discover_and_cache_canonical_spot_price(
    pool: &PgPool,
    asset_ticker: &str,
) -> Result<f64, String> {
    let clean: String = asset_ticker
        .trim()
        .to_uppercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(14)
        .collect();
    if clean.len() < 2 {
        return Err(format!("ORACLE_HALT: Invalid asset ticker '{}'.", asset_ticker));
    }
    crate::oracle::register_dynamic_oracle_ticker(&clean);
    let client = reqwest::Client::builder()
        .user_agent("Perennia-Fiat-Rails-Oracle/2.0")
        .timeout(std::time::Duration::from_secs(4))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let mut canonical_price = 0.0_f64;
    let mut canonical_change = 0.0_f64;
    let mut cg_coin_id = String::new();
    let search_url = format!(
        "https://api.coingecko.com/api/v3/search?query={}",
        urlencoding::encode(&clean)
    );
    if let Ok(resp) = client.get(&search_url).send().await {
        if resp.status().is_success() {
            if let Ok(search_json) = resp.json::<Value>().await {
                if let Some(coins) = search_json.get("coins").and_then(|v| v.as_array()) {
                    let mut exact: Vec<&Value> = coins
                        .iter()
                        .filter(|c| {
                            c.get("symbol")
                                .and_then(|s| s.as_str())
                                .map(|s| s.trim().eq_ignore_ascii_case(&clean))
                                .unwrap_or(false)
                        })
                        .collect();
                    if exact.is_empty() {
                        exact = coins.iter().collect();
                    }
                    exact.sort_by_key(|c| {
                        c.get("market_cap_rank")
                            .and_then(|r| r.as_u64())
                            .filter(|&r| r > 0)
                            .unwrap_or(999_999)
                    });
                    if let Some(best) = exact.first() {
                        if let Some(id_str) = best.get("id").and_then(|v| v.as_str()) {
                            cg_coin_id = id_str.trim().to_string();
                        }
                    }
                }
            }
        }
    }
    if !cg_coin_id.is_empty() {
        let price_url = format!(
            "https://api.coingecko.com/api/v3/simple/price?ids={}&vs_currencies=usd&include_24hr_change=true",
            urlencoding::encode(&cg_coin_id)
        );
        if let Ok(resp) = client.get(&price_url).send().await {
            if resp.status().is_success() {
                if let Ok(price_json) = resp.json::<Value>().await {
                    if let Some(obj) = price_json.get(&cg_coin_id) {
                        let usd = obj.get("usd").and_then(|v| v.as_f64()).unwrap_or(0.0);
                        if usd > 0.0 && usd.is_finite() {
                            canonical_price = usd;
                            canonical_change = obj
                                .get("usd_24h_change")
                                .and_then(|v| v.as_f64())
                                .unwrap_or(0.0);
                        }
                    }
                }
            }
        }
    }
    let mut valid_quotes: Vec<f64> = Vec::new();
    if canonical_price > 0.0 {
        valid_quotes.push(canonical_price);
    }
    let mexc_url = format!(
        "https://api.mexc.com/api/v3/ticker/24hr?symbol={}USDT",
        clean
    );
    let gate_url = format!(
        "https://api.gateio.ws/api/v4/spot/tickers?currency_pair={}_USDT",
        clean
    );
    let kucoin_url = format!(
        "https://api.kucoin.com/api/v1/market/stats?symbol={}-USDT",
        clean
    );
    let (mexc_res, gate_res, kucoin_res) = tokio::join!(
        client.get(&mexc_url).send(),
        client.get(&gate_url).send(),
        client.get(&kucoin_url).send()
    );
    if let Ok(resp) = mexc_res {
        if resp.status().is_success() {
            if let Ok(d) = resp.json::<Value>().await {
                let last = d
                    .get("lastPrice")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                let vol = d
                    .get("quoteVolume")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                let bid = d
                    .get("bidPrice")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                let ask = d
                    .get("askPrice")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                let spread_ok = bid <= 0.0
                    || ask < bid
                    || ((ask - bid) / ask) <= MAX_DISCOVERY_CEX_SPREAD_RATIO;
                let canon_ok = canonical_price <= 0.0
                    || ((last - canonical_price).abs() / canonical_price)
                        <= MAX_CANONICAL_DEVIATION_RATIO;
                if last > 0.0 && vol >= MIN_DISCOVERY_CEX_VOLUME_USD && spread_ok && canon_ok {
                    valid_quotes.push(last);
                }
            }
        }
    }
    if let Ok(resp) = gate_res {
        if resp.status().is_success() {
            if let Ok(raw) = resp.json::<Value>().await {
                let d = if let Some(arr) = raw.as_array() {
                    arr.first().cloned().unwrap_or(Value::Null)
                } else {
                    raw
                };
                let last = d
                    .get("last")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                let vol = d
                    .get("quote_volume")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                let bid = d
                    .get("highest_bid")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                let ask = d
                    .get("lowest_ask")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                let spread_ok = bid <= 0.0
                    || ask < bid
                    || ((ask - bid) / ask) <= MAX_DISCOVERY_CEX_SPREAD_RATIO;
                let canon_ok = canonical_price <= 0.0
                    || ((last - canonical_price).abs() / canonical_price)
                        <= MAX_CANONICAL_DEVIATION_RATIO;
                if last > 0.0 && vol >= MIN_DISCOVERY_CEX_VOLUME_USD && spread_ok && canon_ok {
                    valid_quotes.push(last);
                }
            }
        }
    }
    if let Ok(resp) = kucoin_res {
        if resp.status().is_success() {
            if let Ok(raw) = resp.json::<Value>().await {
                let last = raw
                    .pointer("/data/last")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                let vol = raw
                    .pointer("/data/volValue")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                let bid = raw
                    .pointer("/data/buy")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                let ask = raw
                    .pointer("/data/sell")
                    .and_then(|v| v.as_str())
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0);
                let spread_ok = bid <= 0.0
                    || ask < bid
                    || ((ask - bid) / ask) <= MAX_DISCOVERY_CEX_SPREAD_RATIO;
                let canon_ok = canonical_price <= 0.0
                    || ((last - canonical_price).abs() / canonical_price)
                        <= MAX_CANONICAL_DEVIATION_RATIO;
                if last > 0.0 && vol >= MIN_DISCOVERY_CEX_VOLUME_USD && spread_ok && canon_ok {
                    valid_quotes.push(last);
                }
            }
        }
    }
    if valid_quotes.is_empty() {
        return Err(format!(
            "ORACLE_HALT: Live oracle spot price for {} is offline. Failing closed (503).",
            clean
        ));
    }
    valid_quotes.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mid = valid_quotes.len() / 2;
    let resolved_spot = if valid_quotes.len() % 2 == 0 {
        (valid_quotes[mid - 1] + valid_quotes[mid]) / 2.0
    } else {
        valid_quotes[mid]
    };
    if !resolved_spot.is_finite() || resolved_spot <= 0.0 {
        return Err(format!(
            "ORACLE_HALT: Live oracle spot price for {} is offline. Failing closed (503).",
            clean
        ));
    }
    if let Ok(redis_url) = env::var("REDIS_URL") {
        if let Ok(r_client) = redis::Client::open(redis_url) {
            if let Ok(mut conn) = r_client.get_multiplexed_async_connection().await {
                let _: redis::RedisResult<()> = redis::cmd("SADD")
                    .arg("oracle:dynamic_tickers")
                    .arg(&clean)
                    .query_async(&mut conn)
                    .await;
                let _: redis::RedisResult<()> = redis::cmd("SETEX")
                    .arg(format!("oracle:spot:{}_USDC", clean))
                    .arg(30u64)
                    .arg(resolved_spot.to_string())
                    .query_async(&mut conn)
                    .await;
                if !cg_coin_id.is_empty() {
                    let _: redis::RedisResult<()> = redis::cmd("SETEX")
                        .arg(format!("oracle:cg_id:{}", clean))
                        .arg(86_400u64)
                        .arg(&cg_coin_id)
                        .query_async(&mut conn)
                        .await;
                }
            }
        }
    }
    let _ = sqlx::query(
        r#"
        INSERT INTO rwa_oracle_feeds (ticker, asset_class, price_usd, change_24h_pct, oracle_source, updated_at)
        VALUES ($1, 'DYNAMIC_TOKEN', $2, $3, 'COINGECKO_CEX_QUORUM', CURRENT_TIMESTAMP)
        ON CONFLICT (ticker) DO UPDATE SET
            price_usd = EXCLUDED.price_usd,
            change_24h_pct = EXCLUDED.change_24h_pct,
            oracle_source = EXCLUDED.oracle_source,
            updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(&clean)
    .bind(resolved_spot)
    .bind(canonical_change)
    .execute(pool)
    .await;
    Ok(resolved_spot)
}
pub async fn resolve_live_spot_price(pool: &PgPool, asset_ticker: &str) -> Result<f64, String> {
    match crate::state_api::resolve_strict_spot_price(pool, asset_ticker).await {
        Ok(p) if p.is_finite() && p > 0.0 => Ok(p),
        _ => discover_and_cache_canonical_spot_price(pool, asset_ticker).await,
    }
}
fn resolve_changenow_currency_and_network(ticker: &str) -> (String, &'static str, i32) {
    let clean = ticker.trim().to_uppercase();
    match clean.as_str() {
        "KAS" => ("kas".to_string(), "kas", 10),
        "BTC" => ("btc".to_string(), "btc", 2),
        "ETH" => ("eth".to_string(), "eth", 6),
        "SOL" => ("sol".to_string(), "sol", 12),
        "USDC" => ("usdc".to_string(), "eth", 6),
        "USDT" => ("usdt".to_string(), "eth", 6),
        "XRP" => ("xrp".to_string(), "xrp", 4),
        "DOGE" => ("doge".to_string(), "doge", 6),
        "POL" => ("pol".to_string(), "matic", 12),
        "AVAX" => ("avax".to_string(), "cchain", 12),
        "SUI" => ("sui".to_string(), "sui", 12),
        "TRX" => ("trx".to_string(), "trx", 12),
        "ZEC" => ("zec".to_string(), "zec", 6),
        "ARB" => ("arb".to_string(), "arbitrum", 12),
        "BASE" => ("eth".to_string(), "base", 12),
        "TON" => ("ton".to_string(), "ton", 6),
        "ADA" => ("ada".to_string(), "ada", 6),
        "LINK" => ("link".to_string(), "eth", 6),
        "LTC" => ("ltc".to_string(), "ltc", 4),
        "HYPE" => ("hype".to_string(), "hyperliquid", 6),
        "XAU" => ("paxg".to_string(), "eth", 6),
        other => (other.to_lowercase(), "eth", 6),
    }
}
pub async fn fetch_changenow_min_amount(
    from_ticker: &str,
    to_ticker: &str,
) -> Result<f64, String> {
    let api_key = env::var("CHANGENOW_API_KEY")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            "CHANGENOW_API_KEY_MISSING: Configure CHANGENOW_API_KEY in .env for live min-amount queries."
                .to_string()
        })?;
    let (from_cur, from_net, _) = resolve_changenow_currency_and_network(from_ticker);
    let (to_cur, to_net, _) = resolve_changenow_currency_and_network(to_ticker);
    if from_cur == to_cur && from_net == to_net {
        return Ok(1.0);
    }
    let url = format!(
        "https://api.changenow.io/v2/exchange/min-amount?fromCurrency={}&toCurrency={}&fromNetwork={}&toNetwork={}&flow=standard",
        from_cur, to_cur, from_net, to_net
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let res = client
        .get(&url)
        .header("x-changenow-api-key", api_key)
        .send()
        .await
        .map_err(|e| format!("ChangeNOW v2 min-amount request failed: {}", e))?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!(
            "ChangeNOW v2 min-amount rejected ({}): {}",
            status, body
        ));
    }
    let data: Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid ChangeNOW v2 min-amount JSON: {}", e))?;
    let min_amount = data
        .get("minAmount")
        .and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
        })
        .filter(|&v| v > 0.0)
        .ok_or_else(|| "ChangeNOW v2 returned 0 minAmount.".to_string())?;
    Ok(min_amount)
}
pub async fn resolve_live_profitable_bucket_threshold(
    pool: &PgPool,
    target_ticker: &str,
    kas_spot_usd: f64,
) -> (f64, f64) {
    let clean = target_ticker.trim().to_uppercase();
    let safe_kas_spot = if kas_spot_usd.is_finite() && kas_spot_usd > 0.0 {
        kas_spot_usd
    } else {
        resolve_live_spot_price(pool, "KAS")
            .await
            .unwrap_or(0.15)
            .max(0.01)
    };
    if clean == "USD" {
        let min_usd = 25.28;
        let min_kas = ((min_usd / safe_kas_spot) * 10.0).ceil() / 10.0;
        return (min_kas, round_cents(min_kas * safe_kas_spot));
    }
    if clean == "SILO" || clean == "NACHO" || clean == "BEDRCK" || clean == "PERX" {
        let min_usd = 3.50;
        let min_kas = ((min_usd / safe_kas_spot) * 10.0).ceil() / 10.0;
        return (min_kas, round_cents(min_kas * safe_kas_spot));
    }
    let cache_key = format!("perennia:changenow:min_kas:{}", clean);
    if let Ok(redis_url) = env::var("REDIS_URL") {
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                if let Ok(Some(cached_str)) = redis::cmd("GET")
                    .arg(&cache_key)
                    .query_async::<_, Option<String>>(&mut conn)
                    .await
                {
                    if let Ok(cached_kas) = cached_str.parse::<f64>() {
                        if cached_kas.is_finite() && cached_kas > 0.0 {
                            let min_usd = round_cents(cached_kas * safe_kas_spot);
                            return (cached_kas, min_usd);
                        }
                    }
                }
            }
        }
    }
    let base_bridge_min_kas = match fetch_changenow_min_amount("KAS", &clean).await {
        Ok(live_min_kas) if live_min_kas.is_finite() && live_min_kas > 0.0 => live_min_kas,
        _ => {
            let min_bridge_usd = match clean.as_str() {
                "BTC" => 22.0,
                "ETH" | "XAU" | "XAG" | "USTB" | "USDT" => 14.0,
                "USDC" | "SOL" | "ARB" | "BASE" | "POL" | "AVAX" => 6.5,
                "SPY" | "QQQ" | "NVDA" | "AAPL" | "TSLA" | "AMD" | "TSM" | "AVGO" | "XLE" => 8.5,
                _ => 5.5,
            };
            min_bridge_usd / safe_kas_spot
        }
    };
    let margin_kas = 0.50 / safe_kas_spot;
    let profitable_min_kas = (((base_bridge_min_kas * 1.015) + margin_kas) * 10.0).ceil() / 10.0;
    let profitable_min_usd = round_cents(profitable_min_kas * safe_kas_spot);
    if let Ok(redis_url) = env::var("REDIS_URL") {
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                let _: redis::RedisResult<()> = redis::cmd("SETEX")
                    .arg(&cache_key)
                    .arg(180u64)
                    .arg(format!("{:.4}", profitable_min_kas))
                    .query_async(&mut conn)
                    .await;
            }
        }
    }
    (profitable_min_kas, profitable_min_usd)
}
pub async fn fetch_changenow_estimated_amount(
    from_ticker: &str,
    to_ticker: &str,
    from_amount: f64,
) -> Result<f64, String> {
    let api_key = env::var("CHANGENOW_API_KEY")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            "CHANGENOW_API_KEY_MISSING: Configure CHANGENOW_API_KEY in .env for live exchange quotes."
                .to_string()
        })?;
    let (from_cur, from_net, _) = resolve_changenow_currency_and_network(from_ticker);
    let (to_cur, to_net, _) = resolve_changenow_currency_and_network(to_ticker);
    if from_cur == to_cur && from_net == to_net {
        return Ok(from_amount);
    }
    let url = format!(
        "https://api.changenow.io/v2/exchange/estimated-amount?fromCurrency={}&toCurrency={}&fromAmount={:.8}&fromNetwork={}&toNetwork={}&flow=standard",
        from_cur, to_cur, from_amount, from_net, to_net
    );
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(6))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let res = client
        .get(&url)
        .header("x-changenow-api-key", api_key)
        .send()
        .await
        .map_err(|e| format!("ChangeNOW v2 quote request failed: {}", e))?;
    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!(
            "ChangeNOW v2 quote rejected ({}): {}",
            status, body
        ));
    }
    let data: Value = res
        .json()
        .await
        .map_err(|e| format!("Invalid ChangeNOW v2 quote JSON: {}", e))?;
    let raw_to_amount = data
        .get("toAmount")
        .and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
        })
        .filter(|&v| v > 0.0)
        .ok_or_else(|| "ChangeNOW v2 returned 0 toAmount.".to_string())?;
    let withdrawal_fee = data
        .get("withdrawalFee")
        .and_then(|v| {
            v.as_f64()
                .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
        })
        .unwrap_or(0.0)
        .max(0.0);
    let _ = withdrawal_fee;
    Ok(raw_to_amount)
}
pub async fn create_changenow_exchange_order(
    from_ticker: &str,
    to_ticker: &str,
    from_amount: f64,
    payout_address: &str,
    refund_address: Option<&str>,
) -> Result<(String, String, String, i32), String> {
    let api_key = env::var("CHANGENOW_API_KEY")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            "CHANGENOW_API_KEY_MISSING: Configure CHANGENOW_API_KEY in .env to generate live deposit addresses."
                .to_string()
        })?;
    let (from_cur, from_net, confs_req) = resolve_changenow_currency_and_network(from_ticker);
    let (to_cur, to_net, _) = resolve_changenow_currency_and_network(to_ticker);
    let mut payload = json!({
        "fromCurrency": from_cur,
        "toCurrency": to_cur,
        "fromNetwork": from_net,
        "toNetwork": to_net,
        "fromAmount": format!("{:.8}", from_amount),
        "address": payout_address.trim(),
        "flow": "standard"
    });
    if let Some(refund) = refund_address.filter(|r| !r.trim().is_empty()) {
        payload["refundAddress"] = json!(refund.trim());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let res = client
        .post("https://api.changenow.io/v2/exchange")
        .header("x-changenow-api-key", api_key)
        .header("content-type", "application/json")
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("ChangeNOW v2 exchange creation failed: {}", e))?;
    if !res.status().is_success() {
        let status = res.status();
        let err_body = res.text().await.unwrap_or_default();
        return Err(format!(
            "ChangeNOW v2 exchange creation rejected ({}): {}",
            status, err_body
        ));
    }
    let data: Value = res
        .json()
        .await
        .map_err(|e| format!("Malformed ChangeNOW v2 exchange response: {}", e))?;
    let exchange_id = data
        .get("id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "ChangeNOW v2 response missing exchange id.".to_string())?
        .to_string();
    let payin_address = data
        .get("payinAddress")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "ChangeNOW v2 response missing payinAddress.".to_string())?
        .to_string();
    let route_label = format!(
        "CHANGENOW_V2_LIVE_{}_TO_{}",
        from_cur.to_uppercase(),
        to_cur.to_uppercase()
    );
    Ok((exchange_id, payin_address, route_label, confs_req))
}
pub fn compute_post_trade_usd_allocation(gross_usd: f64) -> PostTradeUsdAllocation {
    let safe_gross = gross_usd.max(0.0);
    let wholesale_api_float_sweep_usd = round_cents(safe_gross * 0.485);
    let chronos_miner_settlement_usd = round_cents(safe_gross * 0.490);
    let llc_tax_and_rail_reserve_usd = round_cents(safe_gross * 0.007);
    let net_profit_and_ratchet_usd = round_cents(
        (safe_gross
            - wholesale_api_float_sweep_usd
            - chronos_miner_settlement_usd
            - llc_tax_and_rail_reserve_usd)
            .max(safe_gross * 0.018),
    );
    // Internal Treasury 60/40 Reserve Split:
    // 60% into Perennia-owned LP positions to compound (`float_ratchet_reinvest_usd`),
    // 40% into liquid USD/stablecoin clearing reserve (`dark_pool_lp_and_owner_draw_usd`)
    let float_ratchet_reinvest_usd = round_cents(net_profit_and_ratchet_usd * 0.60);
    let dark_pool_lp_and_owner_draw_usd =
        round_cents((net_profit_and_ratchet_usd - float_ratchet_reinvest_usd).max(0.0));
    PostTradeUsdAllocation {
        gross_inbound_usd: round_cents(safe_gross),
        wholesale_api_float_sweep_usd,
        chronos_miner_settlement_usd,
        llc_tax_and_rail_reserve_usd,
        net_profit_and_ratchet_usd,
        float_ratchet_reinvest_usd,
        dark_pool_lp_and_owner_draw_usd,
    }
}
pub fn calculate_onramp_cost_plus_quote(
    asset_ticker: &str,
    gross_usd: f64,
    spot_price_usd: f64,
    payment_rail: &str,
    settlement_target: &str,
    auto_stake_silo: bool,
    bundled_kas_or_silo: bool,
) -> CostPlusQuoteBreakdown {
    let ticker = asset_ticker.trim().to_uppercase();
    let gross = gross_usd.max(10.0);
    let is_whale_wire = gross >= 2_500.0;
    let is_mid_tier = gross >= 1_000.0 && gross < 2_500.0;
    let is_silo_or_kas_bundle = auto_stake_silo
        || bundled_kas_or_silo
        || settlement_target.eq_ignore_ascii_case("AUTO_STAKE_SILO");
    let bundled_usdc_fee_waived = ticker == "USDC" && is_silo_or_kas_bundle;
    let hard_profit_floor_usd = round_cents((gross * HARD_PROFIT_FLOOR_PCT).max(0.01));
    let (base_hard_cost, raw_base_profit, competitor_fee, routing_topology) =
        if bundled_usdc_fee_waived {
            let comp = round_cents((gross * 0.035).max(5.0));
            (
                0.0,
                hard_profit_floor_usd,
                comp,
                "WHOLESALE_0_10_PCT_FLOOR_USDC_BUNDLE_TO_KAS_SILO_VAULT".to_string(),
            )
        } else if is_whale_wire {
            let scale = gross / 2_500.0;
            let hard_cost = round_cents(4.0 * scale);
            let net_profit = round_cents((gross * 0.015).max(22.0 * scale));
            let comp = round_cents(gross * 0.035 + 15.0);
            (
                hard_cost,
                net_profit,
                comp,
                if ticker == "KAS" || ticker == "SILO" {
                    "LOCAL_CHRONOS_MINER_REPAR_WHALE_WIRE".to_string()
                } else {
                    "CHANGENOW_V2_SINGLE_HOP_DROPSHIP".to_string()
                },
            )
        } else if is_mid_tier {
            if ticker == "USDC" {
                let hard_cost = round_cents(gross * 0.0005);
                let net_profit = round_cents(gross * 0.0040);
                let comp = round_cents(gross * 0.025);
                (
                    hard_cost,
                    net_profit,
                    comp,
                    "CHANGENOW_V2_L2_BASE_USDC_DROPSHIP".to_string(),
                )
            } else {
                let hard_cost = if ticker == "KAS" || ticker == "SILO" {
                    round_cents(gross * 0.002)
                } else if ticker == "BTC" {
                    round_cents(4.0 * (gross / 1_000.0).max(1.0))
                } else {
                    round_cents(3.0 * (gross / 1_000.0).max(1.0))
                };
                let net_profit = round_cents(gross * 0.015);
                let comp = round_cents(gross * 0.034);
                (
                    hard_cost,
                    net_profit,
                    comp,
                    if ticker == "KAS" || ticker == "SILO" {
                        "LOCAL_CHRONOS_MINER_REPAR_NETTING".to_string()
                    } else {
                        "CHANGENOW_V2_SINGLE_HOP_DROPSHIP".to_string()
                    },
                )
            }
        } else {
            match ticker.as_str() {
                "KAS" | "SILO" => {
                    let hard_cost = round_cents(gross * 0.002);
                    let net_profit = round_cents(gross * 0.018);
                    let comp = round_cents(gross * 0.034);
                    (
                        hard_cost,
                        net_profit,
                        comp,
                        "LOCAL_CHRONOS_MINER_REPAR_0_PCT_EXCHANGE_FEE".to_string(),
                    )
                }
                "BTC" => {
                    let scale = (gross / 100.0).max(1.0);
                    let hard_cost = round_cents(4.0 + (scale - 1.0) * 1.25);
                    let net_profit = round_cents(3.0 * scale);
                    let comp = round_cents(9.0 * scale);
                    (
                        hard_cost,
                        net_profit,
                        comp,
                        "CHANGENOW_V2_SINGLE_HOP_BTC_DROPSHIP".to_string(),
                    )
                }
                "ETH" | "SOL" => {
                    let scale = gross / 100.0;
                    let hard_cost = round_cents(1.50 * scale);
                    let net_profit = round_cents(1.50 * scale);
                    let comp = round_cents(6.00 * scale);
                    (
                        hard_cost,
                        net_profit,
                        comp,
                        format!("CHANGENOW_V2_SINGLE_HOP_{}_DROPSHIP", ticker),
                    )
                }
                "USDC" | "USDT" => {
                    let scale = (gross / 100.0).max(1.0);
                    let hard_cost = round_cents(0.35 * scale);
                    let net_profit = round_cents(1.65 * scale);
                    let comp = round_cents(5.00 * scale);
                    (
                        hard_cost,
                        net_profit,
                        comp,
                        "CHANGENOW_V2_USDC_DROPSHIP".to_string(),
                    )
                }
                _ => {
                    let scale = gross / 100.0;
                    let hard_cost = round_cents(1.50 * scale);
                    let net_profit = round_cents(1.50 * scale);
                    let comp = round_cents(6.00 * scale);
                    (
                        hard_cost,
                        net_profit,
                        comp,
                        format!("CHANGENOW_V2_SINGLE_HOP_{}_DROPSHIP", ticker),
                    )
                }
            }
        };
    let base_profit = raw_base_profit.max(hard_profit_floor_usd);
    let quoted_guest_fee_usd = round_cents(base_hard_cost + base_profit);
    let effective_fee_pct = if gross > 0.0 {
        round_cents((quoted_guest_fee_usd / gross) * 100.0)
    } else {
        0.0
    };
    let guest_net_usd = round_cents((gross - quoted_guest_fee_usd).max(0.0));
    let competitor_net_usd = round_cents((gross - competitor_fee).max(0.0));
    let guest_savings_vs_competitor_usd =
        round_cents((competitor_fee - quoted_guest_fee_usd).max(0.0));
    let (circuit_breaker_tripped, circuit_breaker_reason) = if !spot_price_usd.is_finite()
        || spot_price_usd <= 0.0
    {
        (
            true,
            Some(format!(
                "CIRCUIT_BREAKER_TRIPPED: Live oracle spot price for {} is offline; failing closed.",
                ticker
            )),
        )
    } else if base_profit < hard_profit_floor_usd {
        (
            true,
            Some(format!(
                "CIRCUIT_BREAKER_TRIPPED: Guaranteed net profit (${:.2}) fell below the 0.10% hard floor (${:.2}); failing closed.",
                base_profit, hard_profit_floor_usd
            )),
        )
    } else if quoted_guest_fee_usd > competitor_fee && competitor_fee > 0.0 {
        (
            true,
            Some(format!(
                "CIRCUIT_BREAKER_TRIPPED: Quoted_Guest_Fee (${:.2}) exceeded Competitor Ceiling (${:.2}); failing closed.",
                quoted_guest_fee_usd, competitor_fee
            )),
        )
    } else {
        (false, None)
    };
    let estimated_tokens = if spot_price_usd > 0.0 {
        ((guest_net_usd / spot_price_usd) * 100_000_000.0).round() / 100_000_000.0
    } else {
        0.0
    };
    let resolved_rail = if is_whale_wire {
        "SOVEREIGN_WHALE_FEDWIRE_WAIVED".to_string()
    } else if payment_rail.trim().is_empty() {
        "FREE_ACH_CLEARING".to_string()
    } else {
        payment_rail.trim().to_uppercase()
    };
    CostPlusQuoteBreakdown {
        direction: "ONRAMP".to_string(),
        asset_ticker: ticker,
        gross_usd: round_cents(gross),
        hard_execution_and_repar_cost_usd: base_hard_cost,
        guaranteed_net_profit_usd: base_profit,
        quoted_guest_fee_usd,
        effective_fee_pct,
        protocol_fee_floor_pct: 0.10,
        miner_or_pass_discount_active: true,
        guest_net_usd,
        estimated_tokens,
        spot_price_usd,
        competitor_fee_usd: competitor_fee,
        competitor_net_usd,
        guest_savings_vs_competitor_usd,
        routing_topology,
        bank_rail: resolved_rail,
        whale_wire_fee_waived: is_whale_wire,
        bundled_usdc_fee_waived,
        circuit_breaker_tripped,
        circuit_breaker_reason,
    }
}
pub fn calculate_offramp_cost_plus_quote(
    asset_ticker: &str,
    gross_usd: f64,
    spot_price_usd: f64,
    payout_method: &str,
) -> CostPlusQuoteBreakdown {
    let ticker = asset_ticker.trim().to_uppercase();
    let gross = gross_usd.max(10.0);
    let is_whale_wire = gross >= 2_500.0 || payout_method.eq_ignore_ascii_case("WIRE");
    let hard_profit_floor_usd = round_cents((gross * HARD_PROFIT_FLOOR_PCT).max(0.01));
    let (base_hard_cost, raw_base_profit, competitor_fee, routing_topology) = if is_whale_wire
        && gross >= 2_500.0
    {
        let scale = gross / 2_500.0;
        let hard_cost = round_cents(6.0 * scale);
        let net_profit = round_cents(24.0 * scale);
        let comp = round_cents(63.0 * scale);
        (
            hard_cost,
            net_profit,
            comp,
            if ticker == "KAS" || ticker == "SILO" {
                "LOCAL_MASTER_TREASURY_VAULT_REFILL_PLUS_FEDWIRE".to_string()
            } else {
                "CHANGENOW_V2_PAYIN_ADDRESS_PLUS_FEDWIRE".to_string()
            },
        )
    } else {
        match ticker.as_str() {
            "KAS" | "SILO" => {
                let scale = gross / 500.0;
                let hard_cost = round_cents((0.25 * scale).max(0.25));
                let total_target_fee = round_cents(9.0 * scale);
                let net_profit = round_cents((total_target_fee - hard_cost).max(1.0));
                let comp = round_cents(15.0 * scale);
                (
                    hard_cost,
                    net_profit,
                    comp,
                    "LOCAL_MASTER_TREASURY_VAULT_REFILL_0_PCT_EXCHANGE_FEE".to_string(),
                )
            }
            "BTC" => {
                let scale = gross / 100.0;
                let hard_cost = round_cents(1.0 * scale);
                let net_profit = round_cents(2.0 * scale);
                let comp = round_cents(4.0 * scale);
                (
                    hard_cost,
                    net_profit,
                    comp,
                    "CHANGENOW_V2_BTC_PAYIN_ADDRESS".to_string(),
                )
            }
            "ETH" | "SOL" => {
                let scale = gross / 200.0;
                let hard_cost = round_cents(2.0 * scale);
                let net_profit = round_cents(3.0 * scale);
                let comp = round_cents(7.0 * scale);
                (
                    hard_cost,
                    net_profit,
                    comp,
                    format!("CHANGENOW_V2_{}_PAYIN_ADDRESS", ticker),
                )
            }
            "USDC" | "USDT" => {
                let hard_cost = round_cents(gross * 0.0005);
                let net_profit = round_cents(gross * 0.0045);
                let comp = round_cents(gross * 0.015);
                (
                    hard_cost,
                    net_profit,
                    comp,
                    "CHANGENOW_V2_USDC_PAYIN_ADDRESS".to_string(),
                )
            }
            _ => {
                let scale = gross / 200.0;
                let hard_cost = round_cents(2.0 * scale);
                let net_profit = round_cents(3.0 * scale);
                let comp = round_cents(7.0 * scale);
                (
                    hard_cost,
                    net_profit,
                    comp,
                    format!("CHANGENOW_V2_{}_PAYIN_ADDRESS", ticker),
                )
            }
        }
    };
    let base_profit = raw_base_profit.max(hard_profit_floor_usd);
    let quoted_guest_fee_usd = round_cents(base_hard_cost + base_profit);
    let effective_fee_pct = if gross > 0.0 {
        round_cents((quoted_guest_fee_usd / gross) * 100.0)
    } else {
        0.0
    };
    let guest_net_usd = round_cents((gross - quoted_guest_fee_usd).max(0.0));
    let competitor_net_usd = round_cents((gross - competitor_fee).max(0.0));
    let guest_savings_vs_competitor_usd =
        round_cents((competitor_fee - quoted_guest_fee_usd).max(0.0));
    let (circuit_breaker_tripped, circuit_breaker_reason) = if !spot_price_usd.is_finite()
        || spot_price_usd <= 0.0
    {
        (
            true,
            Some(format!(
                "CIRCUIT_BREAKER_TRIPPED: Live oracle spot price for {} is offline; failing closed.",
                ticker
            )),
        )
    } else if base_profit < hard_profit_floor_usd {
        (
            true,
            Some(format!(
                "CIRCUIT_BREAKER_TRIPPED: Off-ramp guaranteed net profit (${:.2}) fell below the 0.10% hard floor (${:.2}); failing closed.",
                base_profit, hard_profit_floor_usd
            )),
        )
    } else if quoted_guest_fee_usd > competitor_fee && competitor_fee > 0.0 {
        (
            true,
            Some(format!(
                "CIRCUIT_BREAKER_TRIPPED: Off-ramp Quoted_Guest_Fee (${:.2}) exceeded Competitor Ceiling (${:.2}); failing closed.",
                quoted_guest_fee_usd, competitor_fee
            )),
        )
    } else {
        (false, None)
    };
    let estimated_tokens = if spot_price_usd > 0.0 {
        ((gross / spot_price_usd) * 100_000_000.0).round() / 100_000_000.0
    } else {
        0.0
    };
    let resolved_rail = if is_whale_wire && gross >= 2_500.0 {
        "SAME_DAY_WHALE_FEDWIRE".to_string()
    } else {
        "FREE_COMMERCIAL_ACH".to_string()
    };
    CostPlusQuoteBreakdown {
        direction: "OFFRAMP".to_string(),
        asset_ticker: ticker,
        gross_usd: round_cents(gross),
        hard_execution_and_repar_cost_usd: base_hard_cost,
        guaranteed_net_profit_usd: base_profit,
        quoted_guest_fee_usd,
        effective_fee_pct,
        protocol_fee_floor_pct: 0.10,
        miner_or_pass_discount_active: true,
        guest_net_usd,
        estimated_tokens,
        spot_price_usd,
        competitor_fee_usd: competitor_fee,
        competitor_net_usd,
        guest_savings_vs_competitor_usd,
        routing_topology,
        bank_rail: resolved_rail,
        whale_wire_fee_waived: is_whale_wire && gross >= 2_500.0,
        bundled_usdc_fee_waived: false,
        circuit_breaker_tripped,
        circuit_breaker_reason,
    }
}
pub async fn resolve_live_offramp_deposit_coordinates(
    pool: &PgPool,
    asset_ticker: &str,
    amount_crypto: f64,
    refund_wallet: &str,
) -> Result<(String, String, i32, Option<String>), String> {
    let clean = asset_ticker.trim().to_uppercase();
    let sys_cfg = crate::chronos::load_system_treasury_config(pool).await;
    let master_kas = if !sys_cfg.cold_kas_address.trim().is_empty() {
        sys_cfg.cold_kas_address.trim().to_string()
    } else {
        crate::chronos::resolve_master_treasury_prefixed()?
    };
    if clean == "KAS" || clean == "SILO" {
        return Ok((
            master_kas,
            "LOCAL_PERENNIA_NODE_MASTER_TREASURY".to_string(),
            10,
            None,
        ));
    }
    let (exchange_id, payin_address, route_label, confs_req) = create_changenow_exchange_order(
        &clean,
        "KAS",
        amount_crypto,
        &master_kas,
        Some(refund_wallet),
    )
    .await?;
    Ok((payin_address, route_label, confs_req, Some(exchange_id)))
}
pub async fn load_or_init_bootstrap_float(pool: &PgPool) -> BootstrapFloatState {
    let master_treasury_wallet =
        crate::chronos::resolve_master_treasury_prefixed().unwrap_or_default();
    let row_opt = sqlx::query(
        r#"
        SELECT local_kas_reserve_usd, local_kas_target_cap_usd,
               wholesale_api_working_usd, wholesale_api_target_cap_usd,
               ratchet_target_cap_usd, commercial_checking_cleared_usd,
               llc_tax_escrow_reserve_usd, dark_pool_lp_vault_usd
        FROM fiat_float_ledger
        WHERE ledger_id IN ('BOOTSTRAP_PRIMARY', 'PRIMARY_FLOAT')
        ORDER BY updated_at DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    if let Some(r) = row_opt {
        let local_kas: f64 = r
            .try_get("local_kas_reserve_usd")
            .unwrap_or(INITIAL_LOCAL_KAS_FLOAT_USD);
        let local_cap: f64 = r
            .try_get("local_kas_target_cap_usd")
            .unwrap_or(INITIAL_LOCAL_KAS_FLOAT_USD);
        let api_usd: f64 = r
            .try_get("wholesale_api_working_usd")
            .unwrap_or(INITIAL_WHOLESALE_API_USD_FLOAT);
        let api_cap: f64 = r
            .try_get("wholesale_api_target_cap_usd")
            .unwrap_or(INITIAL_WHOLESALE_API_USD_FLOAT);
        let ratchet_cap: f64 = r
            .try_get("ratchet_target_cap_usd")
            .unwrap_or(TARGET_RATCHET_FLOAT_CAP_USD);
        let checking_usd: f64 = r
            .try_get("commercial_checking_cleared_usd")
            .unwrap_or(1_500.0);
        let tax_usd: f64 = r.try_get("llc_tax_escrow_reserve_usd").unwrap_or(0.0);
        let lp_usd: f64 = r.try_get("dark_pool_lp_vault_usd").unwrap_or(0.0);
        return BootstrapFloatState {
            local_kas_reserve_usd: round_cents(local_kas),
            local_kas_target_cap_usd: round_cents(local_cap),
            wholesale_api_working_usd: round_cents(api_usd),
            wholesale_api_target_cap_usd: round_cents(api_cap),
            combined_float_usd: round_cents(local_kas + api_usd),
            ratchet_target_cap_usd: round_cents(ratchet_cap),
            commercial_checking_cleared_usd: round_cents(checking_usd),
            llc_tax_escrow_reserve_usd: round_cents(tax_usd),
            dark_pool_lp_vault_usd: round_cents(lp_usd),
            master_treasury_wallet,
            updated_at: Utc::now().to_rfc3339(),
        };
    }
    let _ = sqlx::query(
        r#"
        INSERT INTO fiat_float_ledger (
            ledger_id, local_kas_reserve_usd, local_kas_target_cap_usd,
            wholesale_api_working_usd, wholesale_api_target_cap_usd,
            ratchet_target_cap_usd, commercial_checking_cleared_usd,
            llc_tax_escrow_reserve_usd, dark_pool_lp_vault_usd
        ) VALUES ('BOOTSTRAP_PRIMARY', $1, $1, $2, $2, $3, 1500.0, 0.0, 0.0)
        ON CONFLICT (ledger_id) DO NOTHING
        "#,
    )
    .bind(INITIAL_LOCAL_KAS_FLOAT_USD)
    .bind(INITIAL_WHOLESALE_API_USD_FLOAT)
    .bind(TARGET_RATCHET_FLOAT_CAP_USD)
    .execute(pool)
    .await;
    BootstrapFloatState {
        local_kas_reserve_usd: INITIAL_LOCAL_KAS_FLOAT_USD,
        local_kas_target_cap_usd: INITIAL_LOCAL_KAS_FLOAT_USD,
        wholesale_api_working_usd: INITIAL_WHOLESALE_API_USD_FLOAT,
        wholesale_api_target_cap_usd: INITIAL_WHOLESALE_API_USD_FLOAT,
        combined_float_usd: INITIAL_LOCAL_KAS_FLOAT_USD + INITIAL_WHOLESALE_API_USD_FLOAT,
        ratchet_target_cap_usd: TARGET_RATCHET_FLOAT_CAP_USD,
        commercial_checking_cleared_usd: 1_500.0,
        llc_tax_escrow_reserve_usd: 0.0,
        dark_pool_lp_vault_usd: 0.0,
        master_treasury_wallet,
        updated_at: Utc::now().to_rfc3339(),
    }
}
pub async fn update_bootstrap_float_caps(
    pool: &PgPool,
    payload: &Value,
) -> Result<BootstrapFloatState, String> {
    let current = load_or_init_bootstrap_float(pool).await;
    let local_kas_target_cap_usd = payload
        .get("localKasTargetCapUsd")
        .and_then(|v| v.as_f64())
        .unwrap_or(current.local_kas_target_cap_usd)
        .max(50.0);
    let wholesale_api_target_cap_usd = payload
        .get("wholesaleApiTargetCapUsd")
        .and_then(|v| v.as_f64())
        .unwrap_or(current.wholesale_api_target_cap_usd)
        .max(50.0);
    let ratchet_target_cap_usd = payload
        .get("ratchetTargetCapUsd")
        .and_then(|v| v.as_f64())
        .unwrap_or(current.ratchet_target_cap_usd)
        .max(local_kas_target_cap_usd + wholesale_api_target_cap_usd);
    let local_kas_reserve_usd = payload
        .get("localKasReserveUsd")
        .and_then(|v| v.as_f64())
        .unwrap_or(current.local_kas_reserve_usd)
        .max(0.0);
    let wholesale_api_working_usd = payload
        .get("wholesaleApiWorkingUsd")
        .and_then(|v| v.as_f64())
        .unwrap_or(current.wholesale_api_working_usd)
        .max(0.0);
    let commercial_checking_cleared_usd = payload
        .get("commercialCheckingClearedUsd")
        .and_then(|v| v.as_f64())
        .unwrap_or(current.commercial_checking_cleared_usd)
        .max(0.0);
    sqlx::query(
        r#"
        UPDATE fiat_float_ledger
        SET local_kas_reserve_usd = $1,
            local_kas_target_cap_usd = $2,
            wholesale_api_working_usd = $3,
            wholesale_api_target_cap_usd = $4,
            ratchet_target_cap_usd = $5,
            commercial_checking_cleared_usd = $6,
            updated_at = CURRENT_TIMESTAMP
        WHERE ledger_id IN ('BOOTSTRAP_PRIMARY', 'PRIMARY_FLOAT')
        "#,
    )
    .bind(round_cents(local_kas_reserve_usd))
    .bind(round_cents(local_kas_target_cap_usd))
    .bind(round_cents(wholesale_api_working_usd))
    .bind(round_cents(wholesale_api_target_cap_usd))
    .bind(round_cents(ratchet_target_cap_usd))
    .bind(round_cents(commercial_checking_cleared_usd))
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update fiat_float_ledger caps: {}", e))?;
    Ok(load_or_init_bootstrap_float(pool).await)
}
pub async fn apply_onramp_post_trade_sweep(
    pool: &PgPool,
    order_id: &str,
    asset_ticker: &str,
    gross_usd: f64,
) -> BootstrapFloatState {
    let sweep = compute_post_trade_usd_allocation(gross_usd);
    let current = load_or_init_bootstrap_float(pool).await;
    let combined_cap = current.local_kas_target_cap_usd + current.wholesale_api_target_cap_usd;
    let ratchet_headroom = (current.ratchet_target_cap_usd - combined_cap).max(0.0);
    let applied_ratchet = sweep.float_ratchet_reinvest_usd.min(ratchet_headroom);
    let next_local_cap = round_cents(current.local_kas_target_cap_usd + applied_ratchet * 0.55);
    let next_api_cap = round_cents(current.wholesale_api_target_cap_usd + applied_ratchet * 0.45);
    let next_local_kas = if asset_ticker.eq_ignore_ascii_case("KAS")
        || asset_ticker.eq_ignore_ascii_case("SILO")
    {
        round_cents(
            (current.local_kas_reserve_usd + sweep.chronos_miner_settlement_usd * 0.05)
                .min(next_local_cap),
        )
    } else {
        current.local_kas_reserve_usd
    };
    let next_api_usd =
        round_cents((current.wholesale_api_working_usd + applied_ratchet * 0.45).min(next_api_cap));
    // 60% into Perennia-owned LP positions to compound (`float_ratchet_reinvest_usd`),
    // 40% into liquid USD/stablecoin clearing reserve (`dark_pool_lp_and_owner_draw_usd`)
    let next_checking_usd = round_cents(
        current.commercial_checking_cleared_usd + sweep.dark_pool_lp_and_owner_draw_usd,
    );
    let next_tax_usd =
        round_cents(current.llc_tax_escrow_reserve_usd + sweep.llc_tax_and_rail_reserve_usd);
    let next_lp_usd =
        round_cents(current.dark_pool_lp_vault_usd + sweep.float_ratchet_reinvest_usd);
    let _ = sqlx::query(
        r#"
        UPDATE fiat_float_ledger
        SET local_kas_reserve_usd = $1,
            local_kas_target_cap_usd = $2,
            wholesale_api_working_usd = $3,
            wholesale_api_target_cap_usd = $4,
            commercial_checking_cleared_usd = $5,
            llc_tax_escrow_reserve_usd = $6,
            dark_pool_lp_vault_usd = $7,
            master_treasury_usdc_reserve = COALESCE(master_treasury_usdc_reserve, 0.0) + $8,
            updated_at = CURRENT_TIMESTAMP
        WHERE ledger_id IN ('BOOTSTRAP_PRIMARY', 'PRIMARY_FLOAT')
        "#,
    )
    .bind(next_local_kas)
    .bind(next_local_cap)
    .bind(next_api_usd)
    .bind(next_api_cap)
    .bind(next_checking_usd)
    .bind(next_tax_usd)
    .bind(next_lp_usd)
    .bind(sweep.dark_pool_lp_and_owner_draw_usd)
    .execute(pool)
    .await;
    let _ = sqlx::query(
        r#"
        INSERT INTO fiat_post_trade_sweeps (
            order_id, direction, asset_ticker, gross_usd,
            wholesale_api_float_sweep_usd, chronos_miner_settlement_usd,
            llc_tax_and_rail_reserve_usd, net_profit_and_ratchet_usd,
            float_ratchet_reinvest_usd, dark_pool_lp_and_owner_draw_usd
        ) VALUES ($1, 'ONRAMP', $2, $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(order_id)
    .bind(asset_ticker.trim().to_uppercase())
    .bind(sweep.gross_inbound_usd)
    .bind(sweep.wholesale_api_float_sweep_usd)
    .bind(sweep.chronos_miner_settlement_usd)
    .bind(sweep.llc_tax_and_rail_reserve_usd)
    .bind(sweep.net_profit_and_ratchet_usd)
    .bind(sweep.float_ratchet_reinvest_usd)
    .bind(sweep.dark_pool_lp_and_owner_draw_usd)
    .execute(pool)
    .await;
    load_or_init_bootstrap_float(pool).await
}
pub async fn apply_offramp_two_way_rebalance(
    pool: &PgPool,
    payout_id: &str,
    asset_ticker: &str,
    gross_usd: f64,
    net_fiat_usd: f64,
    net_profit_usd: f64,
) -> (BootstrapFloatState, String) {
    let current = load_or_init_bootstrap_float(pool).await;
    let clean = asset_ticker.trim().to_uppercase();
    let (next_local_kas, next_api_usd, rebalance_action) = if clean == "KAS" || clean == "SILO" {
        let room_in_local_vault =
            (current.local_kas_target_cap_usd - current.local_kas_reserve_usd).max(0.0);
        let retained_locally = gross_usd.min(room_in_local_vault);
        let overflow_to_exchange = (gross_usd - retained_locally).max(0.0);
        let action_desc = if overflow_to_exchange > 0.0 {
            format!(
                "LOCAL_VAULT_REFILLED_${:.2}_OVERFLOW_${:.2}_FORWARDED_TO_WHOLESALE_API",
                retained_locally, overflow_to_exchange
            )
        } else {
            format!(
                "RETAINED_100_PCT_${:.2}_IN_LOCAL_MASTER_TREASURY_0_PCT_EXCHANGE_FEE",
                retained_locally
            )
        };
        (
            round_cents(current.local_kas_reserve_usd + retained_locally),
            round_cents(current.wholesale_api_working_usd + overflow_to_exchange),
            action_desc,
        )
    } else {
        (
            current.local_kas_reserve_usd,
            round_cents(current.wholesale_api_working_usd + gross_usd),
            format!(
                "WHOLESALE_API_USD_FLOAT_AUTO_REFILLED_BY_${:.2}_{}_LIQUIDATION",
                gross_usd, clean
            ),
        )
    };
    let lp_compound_60 = round_cents(net_profit_usd.max(0.0) * 0.60);
    let liquid_reserve_40 = round_cents(net_profit_usd.max(0.0) * 0.40);
    let next_checking = round_cents(
        (current.commercial_checking_cleared_usd - net_fiat_usd + liquid_reserve_40).max(250.0),
    );
    let _ = sqlx::query(
        r#"
        UPDATE fiat_float_ledger
        SET local_kas_reserve_usd = $1,
            wholesale_api_working_usd = $2,
            wholesale_api_target_cap_usd = LEAST(ratchet_target_cap_usd, wholesale_api_target_cap_usd + $3),
            commercial_checking_cleared_usd = $4,
            dark_pool_lp_vault_usd = dark_pool_lp_vault_usd + $3,
            master_treasury_usdc_reserve = COALESCE(master_treasury_usdc_reserve, 0.0) + $5,
            updated_at = CURRENT_TIMESTAMP
        WHERE ledger_id IN ('BOOTSTRAP_PRIMARY', 'PRIMARY_FLOAT')
        "#,
    )
    .bind(next_local_kas)
    .bind(next_api_usd)
    .bind(lp_compound_60)
    .bind(next_checking)
    .bind(liquid_reserve_40)
    .execute(pool)
    .await;
    let _ = sqlx::query(
        r#"
        INSERT INTO fiat_post_trade_sweeps (
            order_id, direction, asset_ticker, gross_usd,
            wholesale_api_float_sweep_usd, chronos_miner_settlement_usd,
            llc_tax_and_rail_reserve_usd, net_profit_and_ratchet_usd,
            float_ratchet_reinvest_usd, dark_pool_lp_and_owner_draw_usd
        ) VALUES ($1, 'OFFRAMP', $2, $3, $4, 0.0, 0.0, $5, $6, $7)
        "#,
    )
    .bind(payout_id)
    .bind(&clean)
    .bind(round_cents(gross_usd))
    .bind(round_cents(gross_usd))
    .bind(round_cents(net_profit_usd))
    .bind(lp_compound_60)
    .bind(liquid_reserve_40)
    .execute(pool)
    .await;
    (load_or_init_bootstrap_float(pool).await, rebalance_action)
}
pub fn fiat_routes() -> Router<PgPool> {
    Router::new()
        .route(
            "/v1/fiat/quote",
            get(handle_get_fiat_quote).post(handle_post_fiat_quote),
        )
        .route("/v1/fiat/onramp", post(handle_create_onramp_order))
        .route("/v1/fiat/offramp", post(handle_create_offramp_order))
        .route(
            "/v1/fiat/float",
            get(handle_get_bootstrap_float).post(handle_update_bootstrap_float),
        )
        .route("/v1/fiat/webhook", post(handle_authenticated_webhook))
}
async fn handle_get_fiat_quote(
    State(pool): State<PgPool>,
    Query(params): Query<QuoteQueryParams>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let direction = params
        .direction
        .as_deref()
        .unwrap_or("ONRAMP")
        .trim()
        .to_uppercase();
    let asset = params
        .asset
        .as_deref()
        .unwrap_or("KAS")
        .trim()
        .to_uppercase();
    let spot = match resolve_live_spot_price(&pool, &asset).await {
        Ok(p) => p,
        Err(err) => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({
                    "success": false,
                    "circuitBreakerTripped": true,
                    "error": err
                })),
            ));
        }
    };
    let gross_usd = params
        .amount_usd
        .or_else(|| params.amount_tokens.map(|t| t * spot))
        .unwrap_or(500.0)
        .max(10.0);
    let rail = params
        .payment_rail
        .as_deref()
        .unwrap_or("SOVEREIGN_WIRE_ACH");
    let method = params.payment_method.as_deref().unwrap_or("ach");
    let target = params
        .settlement_target
        .as_deref()
        .unwrap_or("SELF_CUSTODY_WALLET");
    let auto_stake = params.auto_stake_silo.unwrap_or(false);
    let bundled = params.bundled_kas_or_silo.unwrap_or(false);
    let (floor_rate, tier_label, discount_active) =
        resolve_wallet_swap_fee_floor_pct(&pool, params.wallet.as_deref().unwrap_or("")).await;
    let mut quote = if direction == "OFFRAMP" || direction == "SELL" {
        calculate_offramp_cost_plus_quote(&asset, gross_usd, spot, rail)
    } else {
        calculate_onramp_cost_plus_quote(
            &asset, gross_usd, spot, rail, target, auto_stake, bundled,
        )
    };
    quote.protocol_fee_floor_pct = (floor_rate * 10000.0).round() / 100.0;
    quote.miner_or_pass_discount_active = discount_active;
    if !quote.circuit_breaker_tripped && asset != "KAS" && asset != "SILO" && asset != "USDC" {
        if direction != "OFFRAMP" && direction != "SELL" {
            if let Ok(cn_est) =
                fetch_changenow_estimated_amount("USDC", &asset, quote.guest_net_usd).await
            {
                if cn_est > 0.0 {
                    let capped_out = cn_est.min(quote.estimated_tokens);
                    quote.estimated_tokens =
                        (capped_out * 100_000_000.0).round() / 100_000_000.0;
                }
            }
        }
    }
    if quote.circuit_breaker_tripped {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "success": false,
                "circuitBreakerTripped": true,
                "error": quote.circuit_breaker_reason,
                "quote": quote
            })),
        ));
    }
    let gross_up = calculate_gateway_gross_up_cents(
        (gross_usd * 100.0).round() as i64,
        discount_active,
        method,
    );
    let post_trade_allocation = compute_post_trade_usd_allocation(gross_usd);
    Ok(Json(json!({
        "success": true,
        "feeTierLabel": tier_label,
        "quote": quote,
        "gatewayGrossUp": gross_up,
        "mercuryWireCoordinates": {
            "beneficiaryName": "Perennia, LLC",
            "bankName": MERCURY_COLUMN_BANK_NAME,
            "routingNumber": MERCURY_COLUMN_ABA_ROUTING,
            "accountNumber": MERCURY_COLUMN_ACCOUNT_NUMBER
        },
        "postTradeAllocation": post_trade_allocation
    })))
}
async fn handle_post_fiat_quote(
    State(pool): State<PgPool>,
    Json(params): Json<QuoteQueryParams>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    handle_get_fiat_quote(State(pool), Query(params)).await
}
async fn handle_get_bootstrap_float(
    State(pool): State<PgPool>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let float_state = load_or_init_bootstrap_float(&pool).await;
    Ok(Json(json!({
        "success": true,
        "float": float_state
    })))
}
async fn handle_update_bootstrap_float(
    headers: HeaderMap,
    State(pool): State<PgPool>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    verify_director_or_webhook_headers(&headers)?;
    match update_bootstrap_float_caps(&pool, &payload).await {
        Ok(updated) => Ok(Json(json!({
            "success": true,
            "float": updated
        }))),
        Err(e) => Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "success": false, "error": e })),
        )),
    }
}
async fn handle_create_onramp_order(
    State(pool): State<PgPool>,
    Json(req): Json<OnrampOrderRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let clean_wallet = req
        .wallet_address
        .trim()
        .to_lowercase()
        .replace("kaspa:", "")
        .trim()
        .to_string();
    if clean_wallet.len() < 55 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({ "error": "INVALID_KASPA_ADDRESS: Valid Kaspa wallet required." })),
        ));
    }
    let prefixed_wallet = format!("kaspa:{}", clean_wallet);
    let target_asset = req
        .target_asset
        .as_deref()
        .unwrap_or("KAS")
        .trim()
        .to_uppercase();
    check_fiat_killswitch_and_firewall(&clean_wallet, &prefixed_wallet, &target_asset).await?;
    let payment_rail = req
        .payment_rail
        .as_deref()
        .unwrap_or("SOVEREIGN_WIRE_ACH")
        .trim()
        .to_uppercase();
    let payment_method = req
        .payment_method
        .as_deref()
        .unwrap_or(if req.fiat_amount_usd >= 100_000.0 {
            "wire"
        } else {
            "ach"
        })
        .trim()
        .to_lowercase();
    let auto_stake_silo = req.auto_stake_silo.unwrap_or(false) && target_asset == "SILO";
    let bundled_kas_or_silo = req.bundled_kas_or_silo.unwrap_or(false) || auto_stake_silo;
    let settlement_target = if auto_stake_silo {
        "AUTO_STAKE_SILO".to_string()
    } else {
        req.settlement_target
            .as_deref()
            .unwrap_or("L1_SELF_CUSTODY")
            .trim()
            .to_uppercase()
    };
    let kas_spot = match resolve_live_spot_price(&pool, "KAS").await {
        Ok(p) => p,
        Err(e) => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "success": false, "circuitBreakerTripped": true, "error": e })),
            ));
        }
    };
    let target_spot = match resolve_live_spot_price(&pool, &target_asset).await {
        Ok(p) => p,
        Err(e) => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "success": false, "circuitBreakerTripped": true, "error": e })),
            ));
        }
    };
    let (floor_rate, tier_label, discount_active) =
        resolve_wallet_swap_fee_floor_pct(&pool, &prefixed_wallet).await;
    let mut quote = calculate_onramp_cost_plus_quote(
        &target_asset,
        req.fiat_amount_usd,
        target_spot,
        &payment_rail,
        &settlement_target,
        auto_stake_silo,
        bundled_kas_or_silo,
    );
    quote.protocol_fee_floor_pct = (floor_rate * 10000.0).round() / 100.0;
    quote.miner_or_pass_discount_active = discount_active;
    if quote.circuit_breaker_tripped {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "success": false,
                "circuitBreakerTripped": true,
                "error": quote.circuit_breaker_reason,
                "quote": quote
            })),
        ));
    }
    if target_asset != "KAS" && target_asset != "SILO" && target_asset != "USDC" {
        match fetch_changenow_estimated_amount("USDC", &target_asset, quote.guest_net_usd).await {
            Ok(cn_est) if cn_est > 0.0 => {
                let capped_out = cn_est.min(quote.estimated_tokens);
                quote.estimated_tokens = (capped_out * 100_000_000.0).round() / 100_000_000.0;
            }
            Err(cn_err) => {
                return Err((
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(json!({
                        "success": false,
                        "circuitBreakerTripped": true,
                        "error": cn_err
                    })),
                ));
            }
            _ => {}
        }
    }
    let gross_up = calculate_gateway_gross_up_cents(
        (req.fiat_amount_usd * 100.0).round() as i64,
        discount_active,
        &payment_method,
    );
    let order_id = format!(
        "PER-ONRAMP-{}",
        &Uuid::new_v4().simple().to_string().to_uppercase()[..6]
    );
    let estimated_kas = if kas_spot > 0.0 {
        ((quote.guest_net_usd / kas_spot) * 10_000.0).round() / 10_000.0
    } else {
        0.0
    };
    let post_trade_sweep = compute_post_trade_usd_allocation(quote.gross_usd);
    let destination_wallet = req
        .destination_wallet_address
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(&prefixed_wallet)
        .to_string();
    let wholesale_order_id = if target_asset == "KAS" || target_asset == "SILO" {
        format!("CHRONOS-REPAR-{}", &order_id[11..])
    } else {
        format!("CHANGENOW-V2-{}", &order_id[11..])
    };
    let wholesale_withdraw_id = if target_asset == "KAS" || target_asset == "SILO" {
        format!("LOCAL-VAULT-UTXO-{}", &order_id[11..])
    } else {
        format!("DROPSHIP-WD-{}", &order_id[11..])
    };
    let status = if gross_up.requires_institutional_wire {
        "AWAITING_INSTITUTIONAL_WIRE"
    } else {
        "AWAITING_WIRE_RECEIPT"
    };
    let sweep_json = serde_json::to_value(&post_trade_sweep).unwrap_or_else(|_| json!({}));
    let _ = sqlx::query(
        r#"
        INSERT INTO fiat_onramp_orders (
            order_id, wallet_address, payment_rail, payment_method, tier_name, tier_bps,
            settlement_target, target_asset, target_spot_price, estimated_tokens, auto_stake_silo,
            quoted_principal_cents, perennia_fee_cents, stripe_gateway_fee_cents, gross_charge_cents,
            fiat_amount_usd, fee_usd, hard_cost_usd, guaranteed_profit_usd,
            competitor_fee_usd, guest_savings_usd, net_usd_converted,
            locked_spot_price, estimated_kas, delivered_kas, wire_memo,
            routing_topology, wholesale_order_id, wholesale_withdraw_id,
            bridge_wire_routing, bridge_wire_account,
            master_treasury_fee_usdc, post_trade_sweep_json, status
        ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, $14, $15,
            $16, $17, $18, $19,
            $20, $21, $22,
            $23, $24, 0.0, $1,
            $25, $26, $27,
            $28, $29,
            $17, $30, $31
        )
        "#,
    )
    .bind(&order_id)
    .bind(&prefixed_wallet)
    .bind(&quote.bank_rail)
    .bind(&gross_up.payment_method)
    .bind(&gross_up.tier_name)
    .bind(gross_up.tier_bps as i32)
    .bind(&settlement_target)
    .bind(&target_asset)
    .bind(target_spot)
    .bind(quote.estimated_tokens)
    .bind(auto_stake_silo)
    .bind(gross_up.principal_cents)
    .bind(gross_up.perennia_fee_cents)
    .bind(gross_up.stripe_gateway_fee_cents)
    .bind(gross_up.gross_charge_cents)
    .bind(quote.gross_usd)
    .bind(quote.quoted_guest_fee_usd)
    .bind(quote.hard_execution_and_repar_cost_usd)
    .bind(quote.guaranteed_net_profit_usd)
    .bind(quote.competitor_fee_usd)
    .bind(quote.guest_savings_vs_competitor_usd)
    .bind(quote.guest_net_usd)
    .bind(kas_spot)
    .bind(estimated_kas)
    .bind(&quote.routing_topology)
    .bind(&wholesale_order_id)
    .bind(&wholesale_withdraw_id)
    .bind(MERCURY_COLUMN_ABA_ROUTING)
    .bind(MERCURY_COLUMN_ACCOUNT_NUMBER)
    .bind(&sweep_json)
    .bind(status)
    .execute(&pool)
    .await;
    let updated_float = load_or_init_bootstrap_float(&pool).await;
    Ok(Json(json!({
        "success": true,
        "sessionId": order_id,
        "orderId": order_id,
        "walletAddress": prefixed_wallet,
        "destinationWalletAddress": destination_wallet,
        "targetAsset": target_asset,
        "targetSpotPrice": target_spot,
        "spotPrice": kas_spot,
        "fiatAmountUsd": quote.gross_usd,
        "feeUsd": quote.quoted_guest_fee_usd,
        "hardCostUsd": quote.hard_execution_and_repar_cost_usd,
        "guaranteedProfitUsd": quote.guaranteed_net_profit_usd,
        "protocolFeeFloorPct": quote.protocol_fee_floor_pct,
        "feeTierLabel": tier_label,
        "minerOrPassDiscountActive": discount_active,
        "competitorFeeUsd": quote.competitor_fee_usd,
        "guestSavingsUsd": quote.guest_savings_vs_competitor_usd,
        "netUsdConverted": quote.guest_net_usd,
        "estimatedKas": estimated_kas,
        "estimatedTokens": quote.estimated_tokens,
        "autoStakeSilo": auto_stake_silo,
        "whaleWireFeeWaived": quote.whale_wire_fee_waived,
        "bundledUsdcFeeWaived": quote.bundled_usdc_fee_waived,
        "paymentRail": quote.bank_rail,
        "settlementTarget": settlement_target,
        "routingTopology": quote.routing_topology,
        "wholesaleOrderId": wholesale_order_id,
        "wholesaleWithdrawId": wholesale_withdraw_id,
        "wireMemo": order_id,
        "gatewayGrossUp": gross_up,
        "wireInstructions": {
            "beneficiaryName": "Perennia, LLC",
            "bankName": MERCURY_COLUMN_BANK_NAME,
            "routingNumber": MERCURY_COLUMN_ABA_ROUTING,
            "accountNumber": MERCURY_COLUMN_ACCOUNT_NUMBER,
            "wireMemo": order_id
        },
        "stageIndex": 1,
        "status": status,
        "txHash": Value::Null,
        "postTradeAllocation": post_trade_sweep,
        "bootstrapFloat": updated_float
    })))
}
async fn handle_create_offramp_order(
    State(pool): State<PgPool>,
    Json(req): Json<OfframpOrderRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    let clean_wallet = req
        .wallet_address
        .trim()
        .to_lowercase()
        .replace("kaspa:", "")
        .trim()
        .to_string();
    let prefixed_wallet = format!("kaspa:{}", clean_wallet);
    let source_asset = req.source_asset.trim().to_uppercase();
    let spot = match resolve_live_spot_price(&pool, &source_asset).await {
        Ok(p) => p,
        Err(e) => {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "success": false, "circuitBreakerTripped": true, "error": e })),
            ));
        }
    };
    let gross_usd = req
        .gross_usd
        .or_else(|| req.amount_crypto.map(|amt| amt * spot))
        .unwrap_or(500.0)
        .max(10.0);
    let amount_crypto = req
        .amount_crypto
        .unwrap_or_else(|| if spot > 0.0 { gross_usd / spot } else { 0.0 });
    let payout_method = req
        .payout_method
        .as_deref()
        .unwrap_or(if gross_usd >= 2_500.0 { "WIRE" } else { "ACH" })
        .trim()
        .to_uppercase();
    let quote = calculate_offramp_cost_plus_quote(&source_asset, gross_usd, spot, &payout_method);
    if quote.circuit_breaker_tripped {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "success": false,
                "circuitBreakerTripped": true,
                "error": quote.circuit_breaker_reason,
                "quote": quote
            })),
        ));
    }
    let (deposit_address, deposit_route_type, confirmations_required, changenow_exchange_id) =
        match resolve_live_offramp_deposit_coordinates(
            &pool,
            &source_asset,
            amount_crypto,
            &prefixed_wallet,
        )
        .await
        {
            Ok(coords) => coords,
            Err(err) => {
                return Err((
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(json!({
                        "success": false,
                        "circuitBreakerTripped": true,
                        "error": err
                    })),
                ));
            }
        };
    let payout_id = format!(
        "PER-OFFRAMP-{}",
        &Uuid::new_v4().simple().to_string().to_uppercase()[..6]
    );
    let bank_last4 = req
        .bank_last4
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "error": "BANK_RAIL_REQUIRED: Link your bank account before generating an Off-Ramp Settlement Pass."
                })),
            )
        })?
        .to_string();
    let status = "AWAITING_ONCHAIN_CONFIRMATIONS";
    let _ = sqlx::query(
        r#"
        INSERT INTO fiat_payout_queue (
            payout_id, wallet_address, source_type, source_asset,
            amount_crypto, gross_usd, fee_usd, hard_cost_usd,
            guaranteed_profit_usd, competitor_fee_usd, guest_savings_usd,
            net_fiat_usd, payout_method, bank_last4, deposit_address,
            changenow_exchange_id, routing_topology, confirmations_required,
            confirmations_current, tx_id, status
        ) VALUES (
            $1, $2, $3, $4,
            $5, $6, $7, $8,
            $9, $10, $11,
            $12, $13, $14, $15,
            $16, $17, $18,
            0, $19, $20
        )
        "#,
    )
    .bind(&payout_id)
    .bind(&prefixed_wallet)
    .bind(&deposit_route_type)
    .bind(&source_asset)
    .bind(amount_crypto)
    .bind(quote.gross_usd)
    .bind(quote.quoted_guest_fee_usd)
    .bind(quote.hard_execution_and_repar_cost_usd)
    .bind(quote.guaranteed_net_profit_usd)
    .bind(quote.competitor_fee_usd)
    .bind(quote.guest_savings_vs_competitor_usd)
    .bind(quote.guest_net_usd)
    .bind(&payout_method)
    .bind(&bank_last4)
    .bind(&deposit_address)
    .bind(changenow_exchange_id.as_deref())
    .bind(&quote.routing_topology)
    .bind(confirmations_required)
    .bind(req.tx_id.as_deref())
    .bind(status)
    .execute(&pool)
    .await;
    let float_state = load_or_init_bootstrap_float(&pool).await;
    Ok(Json(json!({
        "success": true,
        "payoutId": payout_id,
        "wireReferenceId": payout_id,
        "walletAddress": prefixed_wallet,
        "sourceAsset": source_asset,
        "amountCrypto": amount_crypto,
        "spotPrice": spot,
        "grossUsd": quote.gross_usd,
        "feeUsd": quote.quoted_guest_fee_usd,
        "hardCostUsd": quote.hard_execution_and_repar_cost_usd,
        "guaranteedProfitUsd": quote.guaranteed_net_profit_usd,
        "competitorFeeUsd": quote.competitor_fee_usd,
        "guestSavingsUsd": quote.guest_savings_vs_competitor_usd,
        "netFiatPayout": quote.guest_net_usd,
        "payoutMethod": payout_method,
        "bankAccountLast4": bank_last4,
        "depositAddress": deposit_address,
        "changenowExchangeId": changenow_exchange_id,
        "depositRouteType": deposit_route_type,
        "routingTopology": quote.routing_topology,
        "confirmationsRequired": confirmations_required,
        "confirmationsCurrent": 0,
        "confirmationLockActive": true,
        "stageIndex": 1,
        "status": status,
        "bootstrapFloat": float_state
    })))
}
async fn handle_authenticated_webhook(
    headers: HeaderMap,
    State(pool): State<PgPool>,
    Json(req): Json<LiveWebhookRequest>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    verify_director_or_webhook_headers(&headers)?;
    let evt = req.event_type.trim().to_uppercase();
    // STRICT ACH PROCESSING HOLD: Never release crypto on payment_intent.processing!
    if evt == "PAYMENT_INTENT_PROCESSING" || evt == "ACH_PROCESSING" {
        let order_id = req.order_id.as_deref().unwrap_or("").trim().to_string();
        if !order_id.is_empty() {
            let _ = sqlx::query(
                r#"
                UPDATE fiat_onramp_orders
                SET status = 'ACH_PROCESSING_HOLD',
                    updated_at = CURRENT_TIMESTAMP
                WHERE order_id = $1 AND status != 'COMPLETED'
                "#,
            )
            .bind(&order_id)
            .execute(&pool)
            .await;
        }
        return Ok(Json(json!({
            "success": true,
            "eventType": evt,
            "orderId": order_id,
            "heldForAchClearing": true,
            "status": "ACH_PROCESSING_HOLD"
        })));
    }
    if evt == "ACH_CLEARED"
        || evt == "WIRE_CLEARED"
        || evt == "CONFIRM_WIRE_RECEIPT"
        || evt == "PAYMENT_INTENT_SUCCEEDED"
    {
        let order_id = req.order_id.as_deref().unwrap_or("").trim().to_string();
        if order_id.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "orderId is required for ACH_CLEARED webhook" })),
            ));
        }
        let row_opt = sqlx::query(
            r#"
            SELECT wallet_address, target_asset, settlement_target, auto_stake_silo,
                   fiat_amount_usd, fee_usd, guaranteed_profit_usd, net_usd_converted,
                   estimated_tokens, estimated_kas,
                   COALESCE(quoted_principal_cents, 0) AS quoted_principal_cents,
                   COALESCE(perennia_fee_cents, 250) AS perennia_fee_cents
            FROM fiat_onramp_orders
            WHERE order_id = $1
            LIMIT 1
            "#,
        )
        .bind(&order_id)
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();
        let Some(row) = row_opt else {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({ "error": format!("On-ramp order {} not found", order_id) })),
            ));
        };
        let wallet_address: String = row.try_get("wallet_address").unwrap_or_default();
        let clean_wallet = wallet_address.trim().to_lowercase().replace("kaspa:", "");
        let prefixed_wallet = format!("kaspa:{}", clean_wallet);
        let target_asset: String = row
            .try_get("target_asset")
            .unwrap_or_else(|_| "KAS".to_string())
            .to_uppercase();
        let settlement_target: String = row
            .try_get("settlement_target")
            .unwrap_or_else(|_| "LEDGER_KAS".to_string())
            .to_uppercase();
        let auto_stake_silo: bool = row.try_get("auto_stake_silo").unwrap_or(false);
        let fiat_usd: f64 = row.try_get("fiat_amount_usd").unwrap_or(0.0);
        let fee_usd: f64 = row.try_get("fee_usd").unwrap_or(0.0);
        let guaranteed_profit_usd: f64 = row.try_get("guaranteed_profit_usd").unwrap_or(0.0);
        let raw_net_usd: f64 = row.try_get("net_usd_converted").unwrap_or(0.0);
        let prequoted_tokens: f64 = row.try_get("estimated_tokens").unwrap_or(0.0);
        let db_quoted_principal_cents: i64 = row.try_get("quoted_principal_cents").unwrap_or(0);
        let db_perennia_fee_cents: i64 = row.try_get("perennia_fee_cents").unwrap_or(250).max(250);
        let min_profit_floor = round_cents((fiat_usd * HARD_PROFIT_FLOOR_PCT).max(0.01));
        if guaranteed_profit_usd + 1e-6 < min_profit_floor
            && settlement_target != "AUTO_STAKE_SILO"
        {
            return Err((
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({
                    "error": "ZERO_LOSS_INVARIANT_VIOLATION: Order net profit margin is below the 0.10% hard floor; failing closed."
                })),
            ));
        }
        // Zero-Loss Principal Cap when settled_net_cents is provided
        let mut net_usd = raw_net_usd;
        let quoted_principal_cents = if db_quoted_principal_cents > 0 {
            db_quoted_principal_cents
        } else {
            (raw_net_usd * 100.0).round() as i64
        };
        let mut settled_net_cents = quoted_principal_cents + db_perennia_fee_cents;
        let mut fulfilled_principal_cents = quoted_principal_cents;
        if let Some(provided_net_cents) = req.settled_net_cents {
            settled_net_cents = provided_net_cents;
            let capped_principal_cents =
                quoted_principal_cents.min((provided_net_cents - db_perennia_fee_cents).max(0));
            fulfilled_principal_cents = capped_principal_cents;
            if provided_net_cents < quoted_principal_cents + db_perennia_fee_cents
                && (capped_principal_cents <= 0 || req.quarantine_on_shortfall.unwrap_or(false))
            {
                let q_reason = format!(
                    "Shortfall detected: settled_net_cents ({}) < target_net_cents ({})",
                    provided_net_cents,
                    quoted_principal_cents + db_perennia_fee_cents
                );
                let _ = sqlx::query(
                    r#"
                    UPDATE fiat_onramp_orders
                    SET status = 'QUARANTINED_SHORTFALL',
                        settled_net_cents = $2,
                        fulfilled_principal_cents = $3,
                        quarantine_reason = $4,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE order_id = $1
                    "#,
                )
                .bind(&order_id)
                .bind(settled_net_cents)
                .bind(fulfilled_principal_cents)
                .bind(&q_reason)
                .execute(&pool)
                .await;
                return Ok(Json(json!({
                    "success": true,
                    "quarantined": true,
                    "orderId": order_id,
                    "status": "QUARANTINED_SHORTFALL",
                    "settledNetCents": settled_net_cents,
                    "fulfilledPrincipalCents": fulfilled_principal_cents,
                    "quarantineReason": q_reason
                })));
            }
            net_usd = round_cents((capped_principal_cents as f64) / 100.0);
        }
        let live_spot = resolve_live_spot_price(&pool, &target_asset)
            .await
            .map_err(|e| (StatusCode::SERVICE_UNAVAILABLE, Json(json!({ "error": e }))))?;
        let kas_spot = resolve_live_spot_price(&pool, "KAS")
            .await
            .map_err(|e| (StatusCode::SERVICE_UNAVAILABLE, Json(json!({ "error": e }))))?;
        let mut delivered_tokens =
            ((net_usd / live_spot) * 100_000_000.0).round() / 100_000_000.0;
        if target_asset != "KAS" && target_asset != "SILO" && target_asset != "USDC" {
            if let Ok(cn_net) =
                fetch_changenow_estimated_amount("USDC", &target_asset, net_usd).await
            {
                if cn_net > 0.0 {
                    delivered_tokens = delivered_tokens.min(cn_net);
                }
            }
            if prequoted_tokens > 0.0 && fulfilled_principal_cents == quoted_principal_cents {
                delivered_tokens = delivered_tokens.min(prequoted_tokens);
            }
            delivered_tokens = (delivered_tokens * 100_000_000.0).round() / 100_000_000.0;
        }
        let delivered_kas = ((net_usd / kas_spot) * 10_000.0).round() / 10_000.0;
        let tx_hash = req.tx_hash.unwrap_or_else(|| {
            format!(
                "DROPSHIP-{}-{}",
                target_asset,
                &Uuid::new_v4().simple().to_string().to_uppercase()[..8]
            )
        });
        if auto_stake_silo && target_asset == "SILO" {
            let _ = sqlx::query(
                r#"
                INSERT INTO silo_staking_positions (wallet_address, token_ticker, amount_staked, status, tx_hash)
                VALUES ($1, 'SILO', $2, 'ACTIVE', $3)
                "#,
            )
            .bind(&prefixed_wallet)
            .bind(delivered_tokens)
            .bind(&tx_hash)
            .execute(&pool)
            .await;
        } else {
            let _ = crate::state_api::credit_user_token_balance(
                &pool,
                &clean_wallet,
                &prefixed_wallet,
                &target_asset,
                delivered_tokens,
                false,
            )
            .await;
        }
        let _ = sqlx::query(
            r#"
            UPDATE fiat_onramp_orders
            SET status = 'COMPLETED',
                delivered_kas = $2,
                estimated_tokens = $3,
                target_spot_price = $4,
                tx_hash = $5,
                master_treasury_fee_usdc = $6,
                settled_net_cents = $7,
                fulfilled_principal_cents = $8,
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = $1
            "#,
        )
        .bind(&order_id)
        .bind(delivered_kas)
        .bind(delivered_tokens)
        .bind(live_spot)
        .bind(&tx_hash)
        .bind(fee_usd.max(0.0))
        .bind(settled_net_cents)
        .bind(fulfilled_principal_cents)
        .execute(&pool)
        .await;
        let unit_basis = if delivered_tokens > 0.0 {
            fiat_usd / delivered_tokens
        } else {
            live_spot
        };
        let _ = crate::sor::record_hifo_acquisition_lot(
            &pool,
            &clean_wallet,
            &target_asset,
            delivered_tokens,
            unit_basis,
            "FIAT_ONRAMP",
            Some(&tx_hash),
        )
        .await;
        let updated_float =
            apply_onramp_post_trade_sweep(&pool, &order_id, &target_asset, fiat_usd).await;
        let sweep_allocation = compute_post_trade_usd_allocation(fiat_usd);
        return Ok(Json(json!({
            "success": true,
            "eventType": evt,
            "orderId": order_id,
            "status": "COMPLETED",
            "stageIndex": 4,
            "executionLockedOnClearing": true,
            "targetAsset": target_asset,
            "deliveredTokens": delivered_tokens,
            "deliveredKas": delivered_kas,
            "settledNetCents": settled_net_cents,
            "fulfilledPrincipalCents": fulfilled_principal_cents,
            "executionSpotUsd": live_spot,
            "txHash": tx_hash,
            "postTradeAllocation": sweep_allocation,
            "bootstrapFloat": updated_float
        })));
    }
    if evt == "DEPOSIT_CONFIRMED" || evt == "FEDWIRE_DISPATCHED" || evt == "MARK_PAYOUT_DISPATCHED"
    {
        let payout_id = req.payout_id.as_deref().unwrap_or("").trim().to_string();
        if payout_id.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({ "error": "payoutId is required for DEPOSIT_CONFIRMED webhook" })),
            ));
        }
        let row_opt = sqlx::query(
            r#"
            SELECT wallet_address, source_asset, amount_crypto, gross_usd,
                   fee_usd, guaranteed_profit_usd, net_fiat_usd,
                   confirmations_required
            FROM fiat_payout_queue
            WHERE payout_id = $1
            LIMIT 1
            "#,
        )
        .bind(&payout_id)
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();
        let Some(row) = row_opt else {
            return Err((
                StatusCode::NOT_FOUND,
                Json(json!({ "error": format!("Off-ramp payout {} not found", payout_id) })),
            ));
        };
        let req_confs: i32 = row.try_get("confirmations_required").unwrap_or(6);
        let provided_confs = req.confirmations.unwrap_or(req_confs);
        if provided_confs < req_confs {
            let _ = sqlx::query(
                r#"
                UPDATE fiat_payout_queue
                SET confirmations_current = $2,
                    status = 'CONFIRMING_ONCHAIN_DEPOSIT',
                    updated_at = CURRENT_TIMESTAMP
                WHERE payout_id = $1
                "#,
            )
            .bind(&payout_id)
            .bind(provided_confs)
            .execute(&pool)
            .await;
            return Ok(Json(json!({
                "success": true,
                "payoutId": payout_id,
                "status": "CONFIRMING_ONCHAIN_DEPOSIT",
                "stageIndex": 2,
                "confirmationsCurrent": provided_confs,
                "confirmationsRequired": req_confs,
                "usdRateLocked": false
            })));
        }
        let source_asset: String = row
            .try_get("source_asset")
            .unwrap_or_else(|_| "KAS".to_string());
        let gross_usd: f64 = row.try_get("gross_usd").unwrap_or(0.0);
        let net_fiat_usd: f64 = row.try_get("net_fiat_usd").unwrap_or(0.0);
        let profit_usd: f64 = row.try_get("guaranteed_profit_usd").unwrap_or(2.0);
        let trace_id = req.trace_id.unwrap_or_else(|| {
            format!(
                "FED-ACH-{}",
                &Uuid::new_v4().simple().to_string().to_uppercase()[..8]
            )
        });
        let _ = sqlx::query(
            r#"
            UPDATE fiat_payout_queue
            SET confirmations_current = $2,
                trace_id = $3,
                status = 'DISPATCHED_BY_DIRECTOR',
                updated_at = CURRENT_TIMESTAMP
            WHERE payout_id = $1
            "#,
        )
        .bind(&payout_id)
        .bind(provided_confs)
        .bind(&trace_id)
        .execute(&pool)
        .await;
        let (updated_float, rebalance_action) = apply_offramp_two_way_rebalance(
            &pool,
            &payout_id,
            &source_asset,
            gross_usd,
            net_fiat_usd,
            profit_usd,
        )
        .await;
        return Ok(Json(json!({
            "success": true,
            "payoutId": payout_id,
            "status": "DISPATCHED_BY_DIRECTOR",
            "stageIndex": 4,
            "confirmationsCurrent": provided_confs,
            "confirmationsRequired": req_confs,
            "usdRateLocked": true,
            "traceId": trace_id,
            "rebalanceAction": rebalance_action,
            "bootstrapFloat": updated_float
        })));
    }
    Err((
        StatusCode::BAD_REQUEST,
        Json(json!({ "error": format!("Unsupported webhook eventType: {}", evt) })),
    ))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn verify_onramp_900_instant_basket_cost_plus_math() {
        let kas_500 = calculate_onramp_cost_plus_quote(
            "KAS",
            500.0,
            0.15,
            "SOVEREIGN_WIRE_ACH",
            "L1_SELF_CUSTODY",
            false,
            false,
        );
        assert_eq!(kas_500.quoted_guest_fee_usd, 10.0);
        assert_eq!(kas_500.hard_execution_and_repar_cost_usd, 1.0);
        assert_eq!(kas_500.guaranteed_net_profit_usd, 9.0);
        assert_eq!(kas_500.guest_net_usd, 490.0);
        assert_eq!(kas_500.competitor_fee_usd, 17.0);
        let btc_100 = calculate_onramp_cost_plus_quote(
            "BTC",
            100.0,
            90_000.0,
            "SOVEREIGN_WIRE_ACH",
            "L1_SELF_CUSTODY",
            false,
            false,
        );
        assert_eq!(btc_100.quoted_guest_fee_usd, 7.0);
        assert_eq!(btc_100.hard_execution_and_repar_cost_usd, 4.0);
        assert_eq!(btc_100.guaranteed_net_profit_usd, 3.0);
        assert_eq!(btc_100.guest_net_usd, 93.0);
        assert_eq!(btc_100.competitor_fee_usd, 9.0);
    }
    #[test]
    fn verify_offramp_3300_volume_and_oracle_halt_breaker() {
        let kas_500 = calculate_offramp_cost_plus_quote("KAS", 500.0, 0.15, "ACH");
        let btc_100 = calculate_offramp_cost_plus_quote("BTC", 100.0, 90_000.0, "ACH");
        let eth_200 = calculate_offramp_cost_plus_quote("ETH", 200.0, 3_000.0, "ACH");
        let whale_2500 = calculate_offramp_cost_plus_quote("BTC", 2500.0, 90_000.0, "WIRE");
        assert_eq!(kas_500.quoted_guest_fee_usd, 9.0);
        assert_eq!(btc_100.quoted_guest_fee_usd, 3.0);
        assert_eq!(eth_200.quoted_guest_fee_usd, 5.0);
        assert_eq!(whale_2500.quoted_guest_fee_usd, 30.0);
        let split = compute_post_trade_usd_allocation(1_000.0);
        assert_eq!(split.wholesale_api_float_sweep_usd, 485.0);
        assert_eq!(split.chronos_miner_settlement_usd, 490.0);
        assert_eq!(split.llc_tax_and_rail_reserve_usd, 7.0);
        assert_eq!(split.net_profit_and_ratchet_usd, 18.0);
        let tripped = calculate_onramp_cost_plus_quote(
            "BTC",
            100.0,
            0.0,
            "SOVEREIGN_WIRE_ACH",
            "L1_SELF_CUSTODY",
            false,
            false,
        );
        assert!(tripped.circuit_breaker_tripped);
    }
    #[test]
    fn verify_gateway_gross_up_cents_math() {
        let ach_650 = calculate_gateway_gross_up_cents(65_000, false, "ach");
        assert_eq!(ach_650.tier_name, "RETAIL");
        assert_eq!(ach_650.perennia_fee_cents, 553);
        assert_eq!(ach_650.stripe_gateway_fee_cents, 500);
        assert_eq!(ach_650.gross_charge_cents, 66_053);
        let pro_miner_1000 = calculate_gateway_gross_up_cents(100_000, true, "ach");
        assert_eq!(pro_miner_1000.tier_name, "PRO_MINER");
        assert_eq!(pro_miner_1000.perennia_fee_cents, 350);
        assert_eq!(pro_miner_1000.stripe_gateway_fee_cents, 500);
        let wire_100k = calculate_gateway_gross_up_cents(10_000_000, false, "wire");
        assert_eq!(wire_100k.tier_name, "INSTITUTIONAL_WIRE");
        assert_eq!(wire_100k.perennia_fee_cents, 20_000);
        assert_eq!(wire_100k.stripe_gateway_fee_cents, 0);
        assert!(wire_100k.requires_institutional_wire);
    }
}
```

## File: src/oracle.rs
```rust
// UBUNTU (BACKEND): ~/perennia-v5-backend/src/oracle.rs
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::{connect_async, tungstenite::protocol::Message};
use tokio_stream::wrappers::ReceiverStream;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};
use serde_json::{json, Value};
use std::time::{Duration, Instant};
use std::env;
use sqlx::{PgPool, Row};
use dashmap::DashSet;
use lazy_static::lazy_static;
use crate::kaspad_client::protowire::rpc_client::RpcClient;
use crate::kaspad_client::protowire::{
    KaspadRequest, GetBlockRewardInfoRequestMessage, GetBlockRequestMessage, BlockColor
};
use crate::kaspad_client::protowire::kaspad_request::Payload as RequestPayload;
use crate::kaspad_client::protowire::kaspad_response::Payload as ResponsePayload;
use crate::job_manager::{difficulty_from_bits, extract_coinbase_reward_sompi};
const DEFAULT_MIN_ORACLE_QUORUM: usize = 2;
const MAX_OUTLIER_DEVIATION_RATIO: f64 = 0.12;
const MAX_CANONICAL_DEVIATION_RATIO: f64 = 0.08;
const MIN_CEX_24H_VOLUME_USD: f64 = 25_000.0;
const MAX_CEX_SPREAD_RATIO: f64 = 0.05;
const SPOT_ORACLE_TTL_SECS: u64 = 30;
const CHANGE_24H_TTL_SECS: u64 = 300;
const RWA_ORACLE_TTL_SECS: u64 = 120;
const KNOWN_KRC20_ECOSYSTEM_TICKERS: &[&str] = &[
    "SILO", "NACHO", "BEDRCK", "PERX", "KASPY", "KASPER", "KANGO", "GHOAD", "KEKE"
];
pub const ORACLE_SUPPORTED_ASSETS: &[&str] = &[
    "KAS", "USDC", "USDT", "USD", "BTC", "ETH", "SOL", "XRP", "DOGE",
    "TON", "SUI", "ADA", "AVAX", "LINK", "LTC", "POL", "TRX", "ZEC", "ARB", "BASE",
    "SPY", "QQQ", "NVDA", "AAPL", "TSLA", "AMD", "TSM", "AVGO", "XLE",
    "XAU", "XAG", "USTB"
];
pub const ORACLE_VOLATILE_ASSETS: &[&str] = &[
    "KAS", "BTC", "ETH", "SOL", "XRP", "DOGE",
    "TON", "SUI", "ADA", "AVAX", "LINK", "LTC", "POL", "TRX", "ZEC", "ARB"
];
pub const PYTH_RWA_FEEDS: &[(&str, &str, &str)] = &[
    ("SPY", "0x19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5", "EQUITY"),
    ("QQQ", "0x9695e2b96ea7b38596fb62eefb1e5f2b670b6c0f8236d9b1b12c38f0a4b2a9d2", "EQUITY"),
    ("NVDA", "0xb1073854ed24cbc755dc527418f52b7d271f6cc967bbf8d8129112b18860a593", "EQUITY"),
    ("AAPL", "0x49f6b65cb1de6b10eaf75e7c03ca029c306d0357e91b5311b175084a5ad55688", "EQUITY"),
    ("TSLA", "0x16dad506d7db8da01c87581c87ca897a012a153557d4d578c3b9c9e1bc0632f1", "EQUITY"),
    ("AMD", "0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f", "EQUITY"),
    ("TSM", "0x69145a36d62e91113b86b2e5b88f68f7f781c08d22d55848a0a0c4b113867223", "EQUITY"),
    ("AVGO", "0x72b021217ca3fe68922a19aaf990109cb9d84e9ad004b4d2025ad6f529314419", "EQUITY"),
    ("XLE", "0x277b69923f8886d886c920d3616c2182f9d59c9c4397015a78529e3b5c4f1d2c", "EQUITY"),
    ("XAU", "0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2", "COMMODITY"),
    ("XAG", "0xf2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e", "COMMODITY"),
    ("USTB", "0xe393449f6aff8a4b6d3e1165a7c9ebec103685f3b41e60db4277b5b6d10e7326", "TREASURY"),
];
lazy_static! {
    pub static ref DYNAMIC_ORACLE_TICKERS: DashSet<String> = DashSet::new();
}
pub fn register_dynamic_oracle_ticker(ticker: &str) {
    let clean: String = ticker
        .trim()
        .to_uppercase()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric())
        .take(12)
        .collect();
    if clean.len() >= 2 && !ORACLE_SUPPORTED_ASSETS.iter().any(|&a| a == clean) {
        DYNAMIC_ORACLE_TICKERS.insert(clean);
    }
}
pub fn is_oracle_supported_asset(ticker: &str) -> bool {
    let clean = ticker.trim().to_uppercase();
    ORACLE_SUPPORTED_ASSETS.iter().any(|&a| a == clean)
        || DYNAMIC_ORACLE_TICKERS.contains(&clean)
}
pub fn is_pyth_rwa_asset(ticker: &str) -> bool {
    let clean = ticker.trim().to_uppercase();
    PYTH_RWA_FEEDS.iter().any(|&(t, _, _)| t == clean)
}
fn normalize_hex_feed_id(id: &str) -> String {
    id.trim().to_lowercase().trim_start_matches("0x").to_string()
}
type PriceQuote = (f64, Option<f64>, Instant);
type PriceMap = Arc<RwLock<HashMap<String, HashMap<String, PriceQuote>>>>;
fn record_exchange_quote(
    ex_map: &mut HashMap<String, PriceQuote>,
    exchange: &str,
    spot_price: f64,
    change_24h_pct: Option<f64>,
) {
    let prev_change = ex_map.get(exchange).and_then(|(_, chg, _)| *chg);
    let resolved_change = change_24h_pct
        .filter(|v| v.is_finite())
        .or(prev_change);
    ex_map.insert(
        exchange.to_string(),
        (spot_price, resolved_change, Instant::now()),
    );
}
fn compute_sorted_median(sorted: &[f64]) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    let mid = sorted.len() / 2;
    if sorted.len() % 2 == 0 {
        (sorted[mid - 1] + sorted[mid]) / 2.0
    } else {
        sorted[mid]
    }
}
async fn resolve_canonical_coingecko_anchor(
    client: &reqwest::Client,
    redis_conn: &mut redis::aio::MultiplexedConnection,
    ticker: &str,
) -> Option<(String, Option<u64>, f64, Option<f64>)> {
    let clean_ticker = ticker.trim().to_uppercase();
    if clean_ticker.len() < 2 {
        return None;
    }
    let cg_id_key = format!("oracle:cg_id:{}", clean_ticker);
    let cached_id: Option<String> = redis::cmd("GET")
        .arg(&cg_id_key)
        .query_async(redis_conn)
        .await
        .ok()
        .flatten();
    let mut resolved_id = cached_id.unwrap_or_default();
    let mut resolved_rank: Option<u64> = None;
    if resolved_id.is_empty() {
        let search_url = format!(
            "https://api.coingecko.com/api/v3/search?query={}",
            urlencoding::encode(&clean_ticker)
        );
        if let Ok(resp) = client.get(&search_url).send().await {
            if resp.status().is_success() {
                if let Ok(search_json) = resp.json::<Value>().await {
                    if let Some(coins) = search_json.get("coins").and_then(|v| v.as_array()) {
                        let mut exact: Vec<&Value> = coins
                            .iter()
                            .filter(|c| {
                                c.get("symbol")
                                    .and_then(|s| s.as_str())
                                    .map(|s| s.trim().eq_ignore_ascii_case(&clean_ticker))
                                    .unwrap_or(false)
                            })
                            .collect();
                        if exact.is_empty() {
                            exact = coins.iter().collect();
                        }
                        exact.sort_by_key(|c| {
                            c.get("market_cap_rank")
                                .and_then(|r| r.as_u64())
                                .filter(|&r| r > 0)
                                .unwrap_or(999_999)
                        });
                        if let Some(best) = exact.first() {
                            if let Some(id_str) = best.get("id").and_then(|v| v.as_str()) {
                                resolved_id = id_str.trim().to_string();
                                resolved_rank = best
                                    .get("market_cap_rank")
                                    .and_then(|r| r.as_u64())
                                    .filter(|&r| r > 0);
                                if !resolved_id.is_empty() {
     let _: redis::RedisResult<()> = redis::cmd("SETEX")
                                        .arg(&cg_id_key)
                                        .arg(86_400u64)
                                        .arg(&resolved_id)
                                        .query_async(redis_conn)
                                        .await;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    if resolved_id.is_empty() {
        return None;
    }
    let price_url = format!(
        "https://api.coingecko.com/api/v3/simple/price?ids={}&vs_currencies=usd&include_24hr_change=true",
        urlencoding::encode(&resolved_id)
    );
    if let Ok(resp) = client.get(&price_url).send().await {
        if resp.status().is_success() {
            if let Ok(price_json) = resp.json::<Value>().await {
                if let Some(obj) = price_json.get(&resolved_id) {
                    let usd = obj.get("usd").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    if usd > 0.0 && usd.is_finite() {
                        let chg = obj.get("usd_24h_change").and_then(|v| v.as_f64());
                        return Some((resolved_id, resolved_rank, usd, chg));
                    }
                }
            }
        }
    }
    None
}
fn yahoo_symbol_for_rwa_ticker(ticker: &str) -> &'static str {
    match ticker.trim().to_uppercase().as_str() {
        "SPY" => "SPY",
        "QQQ" => "QQQ",
        "NVDA" => "NVDA",
        "AAPL" => "AAPL",
        "TSLA" => "TSLA",
        "AMD" => "AMD",
        "TSM" => "TSM",
        "AVGO" => "AVGO",
        "XLE" => "XLE",
        "XAU" => "GC=F",
        "XAG" => "SI=F",
        "USTB" => "SGOV",
        _ => "SPY",
    }
}
async fn fetch_yahoo_finance_rwa_quote(
    client: &reqwest::Client,
    ticker: &str,
) -> Option<(f64, f64, i64)> {
    let yahoo_sym = yahoo_symbol_for_rwa_ticker(ticker);
    let url = format!(
        "https://query1.finance.yahoo.com/v8/finance/chart/{}?interval=1d&range=5d",
        urlencoding::encode(yahoo_sym)
    );
    let resp = client.get(&url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let data: Value = resp.json().await.ok()?;
    let meta = data.pointer("/chart/result/0/meta")?;
    let regular_price = meta
        .get("regularMarketPrice")
        .and_then(|v| v.as_f64())
        .unwrap_or(0.0);
    if !regular_price.is_finite() || regular_price <= 0.0 {
        return None;
    }
    let prev_close = meta
        .get("chartPreviousClose")
        .or_else(|| meta.get("previousClose"))
        .and_then(|v| v.as_f64())
        .unwrap_or(regular_price);
    let delta_pct = if prev_close > 0.0 && (regular_price - prev_close).abs() > 1e-9 {
        (((regular_price - prev_close) / prev_close) * 100.0).clamp(-35.0, 35.0)
    } else {
        0.0
    };
    let pub_ts = meta
        .get("regularMarketTime")
        .and_then(|v| v.as_i64())
        .filter(|&t| t > 0)
        .unwrap_or_else(|| chrono::Utc::now().timestamp());
    Some((regular_price, delta_pct, pub_ts))
}
async fn resolve_dynamic_pyth_feed_ids(client: &reqwest::Client) -> HashMap<String, String> {
    let mut feed_map: HashMap<String, String> = HashMap::new();
    for &(ticker, _, _) in PYTH_RWA_FEEDS {
        let query_symbol = match ticker {
            "USTB" => "SHY",
            other => other,
        };
        let url = format!(
            "https://hermes.pyth.network/v2/price_feeds?query={}",
            query_symbol
        );
        if let Ok(res) = client.get(&url).send().await {
            if res.status().is_success() {
                if let Ok(arr) = res.json::<Vec<Value>>().await {
                    for entry in arr {
                        let base = entry
                            .pointer("/attributes/base")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .trim()
                            .to_uppercase();
                        let sym = entry
                            .pointer("/attributes/symbol")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .trim()
                            .to_uppercase();
                        let quote = entry
                            .pointer("/attributes/quote_currency")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .trim()
                            .to_uppercase();
                        let id_str = entry.get("id").and_then(|v| v.as_str()).unwrap_or("");
                        let base_matches = base == ticker
                            || sym.ends_with(&format!(".{}/USD", ticker))
                            || (ticker == "USTB"
                                && (base == "USTB" || base == "SHY" || base == "SGOV"));
                        if !id_str.is_empty() && quote == "USD" && base_matches {
                            feed_map.insert(
                                ticker.to_string(),
                                format!("0x{}", normalize_hex_feed_id(id_str)),
                            );
                            break;
                        }
                    }
                }
            }
        }
    }
    feed_map
}
async fn ensure_rwa_oracle_upsert_constraint(pool: &PgPool) {
    let _ = sqlx::query(
        r#"
        DELETE FROM rwa_oracle_feeds a
        USING rwa_oracle_feeds b
        WHERE a.id < b.id AND a.ticker = b.ticker
        "#,
    )
    .execute(pool)
    .await;
    let _ = sqlx::query(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_rwa_oracle_feeds_ticker_unique ON rwa_oracle_feeds (ticker)",
    )
    .execute(pool)
    .await;
}
pub async fn start_pyth_rwa_oracle_daemon(pool: PgPool) {
    tracing::info!("🏛️ Booting Pyth Hermes + Yahoo Finance Institutional RWA & Equity Oracle Daemon (SPY, QQQ, NVDA, AAPL, TSLA, AMD, TSM, AVGO, XLE, XAU, XAG, USTB)...");
    ensure_rwa_oracle_upsert_constraint(&pool).await;
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());
    let redis_client = match redis::Client::open(redis_url) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Pyth RWA Oracle Redis client init failed: {}", e);
            return;
        }
    };
    let mut redis_conn = match redis_client.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Pyth RWA Oracle Redis connection failed: {}", e);
            return;
        }
    };
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Perennia-RWA-Oracle/5.0")
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let resolved_feed_ids = resolve_dynamic_pyth_feed_ids(&client).await;
    tracing::info!(
        "🏛️ [RWA ORACLE] Verified {} live Pyth Hermes v2 feed IDs; Yahoo Finance v8 active for all 12 RWA & Equity feeds.",
        resolved_feed_ids.len()
    );
    let mut interval = tokio::time::interval(Duration::from_secs(12));
    loop {
        interval.tick().await;
        let mut latest_quotes: HashMap<String, (f64, f64, i64, &'static str)> = HashMap::new();
        if !resolved_feed_ids.is_empty() {
            let mut query_parts: Vec<String> = Vec::new();
            for feed_id in resolved_feed_ids.values() {
                query_parts.push(format!("ids[]={}", feed_id));
            }
            query_parts.push("ignore_invalid_price_ids=true".to_string());
            let url = format!(
                "https://hermes.pyth.network/v2/updates/price/latest?{}",
                query_parts.join("&")
            );
            if let Ok(res) = client.get(&url).send().await {
                if res.status().is_success() {
                    if let Ok(data) = res.json::<Value>().await {
                        if let Some(parsed_arr) = data.get("parsed").and_then(|v| v.as_array()) {
                            for item in parsed_arr {
                                let feed_id_norm = item
                                    .get("id")
                                    .and_then(|v| v.as_str())
                                    .map(normalize_hex_feed_id)
                                    .unwrap_or_default();
                                if feed_id_norm.is_empty() {
                                    continue;
                                }
                                let matched_ticker =
                                    resolved_feed_ids.iter().find_map(|(t, fid)| {
                                        if normalize_hex_feed_id(fid) == feed_id_norm {
                                            Some(t.clone())
                                        } else {
                                            None
                                        }
                                    });
                                let Some(ticker) = matched_ticker else {
                                    continue;
                                };
                                let raw_spot = item
                                    .pointer("/price/price")
                                    .and_then(|v| {
                                        v.as_str()
                                            .and_then(|s| s.parse::<f64>().ok())
                                            .or_else(|| v.as_f64())
                                    })
                                    .unwrap_or(0.0);
                                let spot_expo = item
                                    .pointer("/price/expo")
                                    .and_then(|v| v.as_i64())
                                    .unwrap_or(0)
                                    as i32;
                                let raw_ema = item
                                    .pointer("/ema_price/price")
                                    .and_then(|v| {
                                        v.as_str()
                                            .and_then(|s| s.parse::<f64>().ok())
                                            .or_else(|| v.as_f64())
                                    })
                                    .unwrap_or(0.0);
                                let ema_expo = item
                                    .pointer("/ema_price/expo")
                                    .and_then(|v| v.as_i64())
                                    .unwrap_or(0)
                                    as i32;
                                let spot_usd = if raw_spot > 0.0 {
                                    raw_spot * 10.0_f64.powi(spot_expo)
                                } else if raw_ema > 0.0 {
                                    raw_ema * 10.0_f64.powi(ema_expo)
                                } else {
                                    0.0
                                };
                                let ema_usd = if raw_ema > 0.0 {
                                    raw_ema * 10.0_f64.powi(ema_expo)
                                } else {
                                    spot_usd
                                };
                                let delta_pct = if ema_usd > 0.0 && spot_usd > 0.0 {
                                    (((spot_usd - ema_usd) / ema_usd) * 100.0).clamp(-25.0, 25.0)
                                } else {
                                    0.0
                                };
                                let pub_ts = item
                                    .pointer("/price/publish_time")
                                    .or_else(|| item.pointer("/ema_price/publish_time"))
                                    .and_then(|v| v.as_i64())
                                    .unwrap_or_else(|| chrono::Utc::now().timestamp());
                                if spot_usd > 0.0 && spot_usd.is_finite() {
                                    latest_quotes.insert(
                                        ticker,
                                        (spot_usd, delta_pct, pub_ts, "PYTH_HERMES"),
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
        // For any RWA / Public Equity ticker not returned by Pyth (or when equity markets are closed / 0), fetch live quote from Yahoo Finance v8
        for &(ticker, _, _) in PYTH_RWA_FEEDS {
            let needs_yahoo = match latest_quotes.get(ticker) {
                Some((spot, chg, _, _)) => *spot <= 0.0 || (*chg == 0.0 && ticker != "USTB"),
                None => true,
            };
            if needs_yahoo {
                if let Some((yf_spot, yf_chg, yf_ts)) =
                    fetch_yahoo_finance_rwa_quote(&client, ticker).await
                {
                    if let Some((existing_spot, _, existing_ts, _)) = latest_quotes.get(ticker) {
                        let merged_spot = if *existing_spot > 0.0 {
                            *existing_spot
                        } else {
                            yf_spot
                        };
                        latest_quotes.insert(
                            ticker.to_string(),
                            (merged_spot, yf_chg, *existing_ts.max(&yf_ts), "PYTH_HERMES"),
                        );
                    } else {
                        latest_quotes.insert(
                            ticker.to_string(),
                            (yf_spot, yf_chg, yf_ts, "YAHOO_FINANCE_V8"),
                        );
                    }
                }
            }
        }
        let mut pipe = redis::pipe();
        let mut rwa_assets_json = Vec::new();
        for &(ticker, _, asset_class) in PYTH_RWA_FEEDS {
            let resolved_entry =
                if let Some(&(spot_usd, delta_pct, pub_ts, source_label)) = latest_quotes.get(ticker)
                {
                    let _ = sqlx::query(
                        r#"
                        INSERT INTO rwa_oracle_feeds (ticker, asset_class, price_usd, change_24h_pct, oracle_source, updated_at)
                        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                        ON CONFLICT (ticker) DO UPDATE SET
                            asset_class = EXCLUDED.asset_class,
                            price_usd = EXCLUDED.price_usd,
                            change_24h_pct = EXCLUDED.change_24h_pct,
                            oracle_source = EXCLUDED.oracle_source,
                            updated_at = CURRENT_TIMESTAMP
                        "#,
                    )
                    .bind(ticker)
                    .bind(asset_class)
                    .bind(spot_usd)
                    .bind(delta_pct)
                    .bind(source_label)
                    .execute(&pool)
                    .await;
                    Some((spot_usd, delta_pct, pub_ts))
                } else {
                    sqlx::query(
                        r#"
                        SELECT price_usd, change_24h_pct, EXTRACT(EPOCH FROM updated_at)::BIGINT AS pub_ts
                        FROM rwa_oracle_feeds
                        WHERE ticker = $1
                          AND price_usd > 0
                        ORDER BY updated_at DESC
                        LIMIT 1
                        "#,
                    )
                    .bind(ticker)
                    .fetch_optional(&pool)
                    .await
                    .ok()
                    .flatten()
                    .and_then(|row| {
                        let p = row.try_get::<f64, _>("price_usd").unwrap_or(0.0);
                        let d = row.try_get::<f64, _>("change_24h_pct").unwrap_or(0.0);
                        let ts = row.try_get::<i64, _>("pub_ts").unwrap_or(0);
                        if p > 0.0 {
                            Some((p, d, ts))
                        } else {
                            None
                        }
                    })
                };
            if let Some((spot_usd, delta_pct, pub_ts)) = resolved_entry {
                pipe.cmd("SETEX")
                    .arg(format!("oracle:spot:{}_USDC", ticker))
                    .arg(RWA_ORACLE_TTL_SECS)
                    .arg(spot_usd.to_string())
                    .ignore();
                pipe.cmd("SETEX")
                    .arg(format!("oracle:change24h:{}_USDC", ticker))
                    .arg(CHANGE_24H_TTL_SECS)
                    .arg(delta_pct.to_string())
                    .ignore();
                rwa_assets_json.push(json!({
                    "ticker": ticker,
                    "assetClass": asset_class,
                    "price": format!("{:.2}", spot_usd),
                    "spotPrice": spot_usd,
                    "change24h": delta_pct,
                    "publishTime": chrono::DateTime::from_timestamp(pub_ts, 0)
                        .unwrap_or_else(chrono::Utc::now)
                        .to_rfc3339()
                }));
            }
        }
        if !rwa_assets_json.is_empty() {
            pipe.cmd("SETEX")
                .arg("oracle:spot:rwa_prices_json")
                .arg(RWA_ORACLE_TTL_SECS)
                .arg(serde_json::to_string(&rwa_assets_json).unwrap_or_else(|_| "[]".to_string()))
                .ignore();
        }
        if let Err(e) = pipe.query_async::<_, ()>(&mut redis_conn).await {
            tracing::warn!("Pyth RWA Redis pipeline warning: {}", e);
        }
    }
}
pub async fn start_spot_pricing_daemon() {
    tracing::info!("🌐 Global 7-Node Multi-Asset Sovereign Oracle Daemon Booting (Multi-Node Quorum + Outlier Rejection + Dynamic Ticker Discovery Armed)...");
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());
    let redis_client = match redis::Client::open(redis_url) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Spot Oracle Redis connection failed: {}", e);
            return;
        }
    };
    let mut redis_conn = match redis_client.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Spot Oracle Redis multiplexer failed: {}", e);
            return;
        }
    };
    let min_quorum: usize = env::var("ORACLE_MIN_QUORUM")
        .ok()
        .and_then(|v| v.trim().parse::<usize>().ok())
        .filter(|&q| (1..=7).contains(&q))
        .unwrap_or(DEFAULT_MIN_ORACLE_QUORUM);
    let prices: PriceMap = Arc::new(RwLock::new(HashMap::new()));
    let mut last_circuit_breaker_state: HashMap<String, bool> = HashMap::new();
    {
        let mut w_lock = prices.write().await;
        for &asset in ORACLE_VOLATILE_ASSETS {
            w_lock.insert(asset.to_string(), HashMap::new());
            last_circuit_breaker_state.insert(asset.to_string(), false);
        }
    }
    tokio::spawn(bybit_ws(prices.clone()));
    tokio::spawn(gate_ws(prices.clone()));
    tokio::spawn(mexc_ws(prices.clone()));
    tokio::spawn(bitget_ws(prices.clone()));
    tokio::spawn(coinex_ws(prices.clone()));
    tokio::spawn(kucoin_ws(prices.clone()));
    tokio::spawn(kraken_ws(prices.clone()));
    tokio::spawn(coingecko_rest_fallback(prices.clone()));
    tokio::spawn(dynamic_tickers_rest_poller(
        prices.clone(),
        redis_client.clone(),
    ));
    let mut interval = tokio::time::interval(Duration::from_secs(1));
    loop {
        interval.tick().await;
        let mut active_medians: HashMap<String, f64> = HashMap::new();
        let mut active_changes_24h: HashMap<String, f64> = HashMap::new();
        active_medians.insert("USDC".to_string(), 1.0);
        active_medians.insert("USDT".to_string(), 1.0);
        active_medians.insert("USD".to_string(), 1.0);
        active_changes_24h.insert("USDC".to_string(), 0.0);
        active_changes_24h.insert("USDT".to_string(), 0.0);
        active_changes_24h.insert("USD".to_string(), 0.0);
        let now = Instant::now();
        let dynamic_list: Vec<String> = DYNAMIC_ORACLE_TICKERS
            .iter()
            .map(|r| r.key().clone())
            .collect();
        {
            let p_lock = prices.read().await;
            for &asset in ORACLE_VOLATILE_ASSETS {
                if let Some(exchanges) = p_lock.get(asset) {
                    let mut raw_vals: Vec<f64> = exchanges
                        .values()
                        .filter(|(v, _, ts)| *v > 0.0 && v.is_finite() && now.duration_since(*ts).as_secs() < 60)
                        .map(|(v, _, _)| *v)
                        .collect();
                    let mut chg_vals: Vec<f64> = exchanges
                        .values()
                        .filter(|(v, _, ts)| *v > 0.0 && now.duration_since(*ts).as_secs() < 300)
                        .filter_map(|(_, chg, _)| *chg)
                        .filter(|c| c.is_finite())
                        .collect();
                    if raw_vals.len() >= min_quorum {
                        raw_vals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                        let raw_median = compute_sorted_median(&raw_vals);
                        let filtered_vals: Vec<f64> = if raw_median > 0.0 {
                            raw_vals
                                .into_iter()
                                .filter(|&v| ((v - raw_median).abs() / raw_median) <= MAX_OUTLIER_DEVIATION_RATIO)
                                .collect()
                        } else {
                            Vec::new()
                        };
                        let active_count = filtered_vals.len();
                        if active_count >= min_quorum {
                            let median = compute_sorted_median(&filtered_vals);
                            active_medians.insert(asset.to_string(), median);
                            let median_chg = if !chg_vals.is_empty() {
                                chg_vals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                                compute_sorted_median(&chg_vals)
                            } else {
                                0.0
                            };
                            active_changes_24h.insert(asset.to_string(), median_chg);
                            if last_circuit_breaker_state.get(asset) == Some(&true) {
                                tracing::info!(
                                    "🟢 [CIRCUIT BREAKER RESOLVED] {} Oracle consensus restored ({} quorum nodes within outlier bounds).",
                                    asset,
                                    active_count
                                );
                                last_circuit_breaker_state.insert(asset.to_string(), false);
                            }
                        } else if last_circuit_breaker_state.get(asset) == Some(&false) {
                            tracing::warn!(
                                "⚠️ [ORACLE OUTLIER BREAKER] {} failed outlier-filtered quorum ({}/{} valid nodes). Expiring cached quote...",
                                asset,
                                active_count,
                                min_quorum
                            );
                            last_circuit_breaker_state.insert(asset.to_string(), true);
                        }
                    } else if last_circuit_breaker_state.get(asset) == Some(&false) {
                        tracing::debug!(
                            "⏳ [ORACLE QUORUM PENDING] Awaiting {}-node quorum for {} (currently {} active)...",
                            min_quorum,
                            asset,
                            raw_vals.len()
                        );
                        last_circuit_breaker_state.insert(asset.to_string(), true);
                    }
                }
            }
            for dyn_asset in &dynamic_list {
                if active_medians.contains_key(dyn_asset) {
                    continue;
                }
                if let Some(exchanges) = p_lock.get(dyn_asset) {
                    let canonical_cg_opt = exchanges
                        .get("coingecko")
                        .filter(|(v, _, ts)| *v > 0.0 && v.is_finite() && now.duration_since(*ts).as_secs() < 60)
                        .map(|(v, _, _)| *v);
                    let mut raw_vals: Vec<f64> = exchanges
                        .values()
                        .filter(|(v, _, ts)| *v > 0.0 && v.is_finite() && now.duration_since(*ts).as_secs() < 60)
                        .map(|(v, _, _)| *v)
                        .filter(|&v| {
                            if let Some(cg_anchor) = canonical_cg_opt {
                                ((v - cg_anchor).abs() / cg_anchor) <= MAX_CANONICAL_DEVIATION_RATIO
                            } else {
                                true
                            }
                        })
                        .collect();
                    let mut chg_vals: Vec<f64> = exchanges
                        .values()
                        .filter(|(v, _, ts)| *v > 0.0 && now.duration_since(*ts).as_secs() < 300)
                        .filter_map(|(_, chg, _)| *chg)
                        .filter(|c| c.is_finite())
                        .collect();
                    if !raw_vals.is_empty() {
                        raw_vals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                        let raw_median = canonical_cg_opt.unwrap_or_else(|| compute_sorted_median(&raw_vals));
                        let deviation_bound = if canonical_cg_opt.is_some() {
                            MAX_CANONICAL_DEVIATION_RATIO
                        } else {
                            MAX_OUTLIER_DEVIATION_RATIO
                        };
                        let filtered_vals: Vec<f64> = if raw_median > 0.0 {
                            raw_vals
                                .into_iter()
                                .filter(|&v| ((v - raw_median).abs() / raw_median) <= deviation_bound)
                                .collect()
                        } else {
                            Vec::new()
                        };
                        let resolved = if !filtered_vals.is_empty() {
                            compute_sorted_median(&filtered_vals)
                        } else {
                            raw_median
                        };
                        if resolved > 0.0 {
                            active_medians.insert(dyn_asset.clone(), resolved);
                            let median_chg = if !chg_vals.is_empty() {
                                chg_vals.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                                compute_sorted_median(&chg_vals)
                            } else {
                                0.0
                            };
                            active_changes_24h.insert(dyn_asset.clone(), median_chg);
                        }
                    }
                }
            }
        }
        if let Some(&eth_med) = active_medians.get("ETH") {
            active_medians.insert("BASE".to_string(), eth_med);
            active_changes_24h.insert(
                "BASE".to_string(),
                active_changes_24h.get("ETH").copied().unwrap_or(0.0),
            );
        }
        // Also include cached RWA / Public Equity feeds in prices_json so any consumer reading oracle:spot:prices_json sees all 12 RWA tickers
        if let Ok(Some(rwa_raw)) = redis::cmd("GET")
            .arg("oracle:spot:rwa_prices_json")
            .query_async::<_, Option<String>>(&mut redis_conn)
            .await
        {
            if let Ok(rwa_arr) = serde_json::from_str::<Vec<Value>>(&rwa_raw) {
                for item in rwa_arr {
                    let t = item
                        .get("ticker")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .trim()
                        .to_uppercase();
                    let p = item
                        .get("spotPrice")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.0);
                    let c = item
                        .get("change24h")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(0.0);
                    if !t.is_empty() && p > 0.0 {
                        active_medians.insert(t.clone(), p);
                        active_changes_24h.insert(t, c);
                    }
                }
            }
        }
        if !active_medians.is_empty() {
            let mut pipeline = redis::pipe();
            let mut json_data = json!({});
            let mut supported_vec: Vec<String> = ORACLE_SUPPORTED_ASSETS
                .iter()
                .map(|s| (*s).to_string())
                .collect();
            for dt in &dynamic_list {
                if !supported_vec.contains(dt) {
                    supported_vec.push(dt.clone());
                }
            }
            pipeline
                .cmd("SETEX")
                .arg("oracle:spot:supported_assets")
                .arg(CHANGE_24H_TTL_SECS)
                .arg(serde_json::to_string(&supported_vec).unwrap_or_else(|_| "[]".to_string()))
                .ignore();
            for (asset, median) in &active_medians {
                let pair_id = format!("{}_USDC", asset);
                let change_24h = active_changes_24h.get(asset).copied().unwrap_or(0.0);
                pipeline
                    .cmd("SETEX")
                    .arg(format!("oracle:spot:{}", pair_id))
                    .arg(SPOT_ORACLE_TTL_SECS)
                    .arg(median.to_string())
                    .ignore();
                pipeline
                    .cmd("SETEX")
                    .arg(format!("oracle:change24h:{}", pair_id))
                    .arg(CHANGE_24H_TTL_SECS)
                    .arg(change_24h.to_string())
                    .ignore();
                let asset_key = match asset.as_str() {
                    "KAS" => "kaspa".to_string(),
                    "BTC" => "bitcoin".to_string(),
                    "ETH" => "ethereum".to_string(),
                    "SOL" => "solana".to_string(),
                    "XRP" => "ripple".to_string(),
                    "DOGE" => "dogecoin".to_string(),
                    "TON" => "the-open-network".to_string(),
                    "SUI" => "sui".to_string(),
                    "ADA" => "cardano".to_string(),
                    "AVAX" => "avalanche-2".to_string(),
                    "LINK" => "chainlink".to_string(),
                    "LTC" => "litecoin".to_string(),
                    "POL" => "polygon-ecosystem-token".to_string(),
                    "TRX" => "tron".to_string(),
                    "ZEC" => "zcash".to_string(),
                    "ARB" => "arbitrum".to_string(),
                    "USDC" => "usd-coin".to_string(),
                    "USDT" => "tether".to_string(),
                    "USD" => "usd".to_string(),
                    other => other.to_lowercase(),
                };
                json_data[asset_key] = json!({
                    "usd": median,
                    "usd_24h_change": change_24h
                });
            }
            if active_medians.contains_key("KAS")
                && active_medians.contains_key("BTC")
                && active_medians.contains_key("ETH")
                && active_medians.contains_key("SOL")
            {
                pipeline
                    .cmd("SETEX")
                    .arg("oracle:spot:prices_json")
                    .arg(SPOT_ORACLE_TTL_SECS)
                    .arg(json_data.to_string())
                    .ignore();
            }
            if let Err(e) = pipeline.query_async::<_, ()>(&mut redis_conn).await {
                tracing::error!("Spot Oracle Redis Pipeline Failed: {}", e);
            }
        }
    }
}
async fn dynamic_tickers_rest_poller(prices: PriceMap, redis_client: redis::Client) {
    let client = reqwest::Client::builder()
        .user_agent("Perennia-Dynamic-Oracle/2.0")
        .timeout(Duration::from_secs(4))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let pg_pool_opt = match env::var("DATABASE_URL") {
        Ok(db_url) if !db_url.trim().is_empty() => PgPool::connect(&db_url).await.ok(),
        _ => None,
    };
    let mut interval = tokio::time::interval(Duration::from_secs(6));
    loop {
        interval.tick().await;
        let Ok(mut conn) = redis_client.get_multiplexed_async_connection().await else {
            continue;
        };
        let raw_members: Vec<String> = redis::cmd("SMEMBERS")
            .arg("oracle:dynamic_tickers")
            .query_async(&mut conn)
            .await
            .unwrap_or_default();
        if raw_members.is_empty() && DYNAMIC_ORACLE_TICKERS.is_empty() {
            continue;
        }
        let mut active_dynamic = Vec::new();
        {
            let mut lock = prices.write().await;
            for raw in raw_members.into_iter().take(40) {
                let clean: String = raw
                    .trim()
                    .to_uppercase()
                    .chars()
                    .filter(|c| c.is_ascii_alphanumeric())
                    .take(12)
                    .collect();
                if clean.len() < 2 || ORACLE_SUPPORTED_ASSETS.iter().any(|&a| a == clean) {
                    continue;
                }
                DYNAMIC_ORACLE_TICKERS.insert(clean.clone());
                lock.entry(clean.clone()).or_insert_with(HashMap::new);
                if !active_dynamic.contains(&clean) {
                    active_dynamic.push(clean);
                }
            }
            for item in DYNAMIC_ORACLE_TICKERS.iter() {
                let clean = item.key().clone();
                if !active_dynamic.contains(&clean) && active_dynamic.len() < 40 {
                    lock.entry(clean.clone()).or_insert_with(HashMap::new);
                    active_dynamic.push(clean);
                }
            }
        }
        let kas_usd = {
            let r_lock = prices.read().await;
            r_lock
                .get("KAS")
                .and_then(|m| m.values().next().map(|(p, _, _)| *p))
                .unwrap_or(0.0)
        };
        for ticker in active_dynamic {
            let cg_anchor =
                resolve_canonical_coingecko_anchor(&client, &mut conn, &ticker).await;
            let canonical_price_usd = cg_anchor.as_ref().map(|(_, _, p, _)| *p).unwrap_or(0.0);
            let is_top_canonical_rank = cg_anchor
                .as_ref()
                .and_then(|(_, rank, _, _)| *rank)
                .map(|r| r <= 500)
                .unwrap_or(false);
            let mexc_url = format!(
                "https://api.mexc.com/api/v3/ticker/24hr?symbol={}USDT",
                ticker
            );
            let gate_url = format!(
                "https://api.gateio.ws/api/v4/spot/tickers?currency_pair={}_USDT",
                ticker
            );
            let kucoin_url = format!(
                "https://api.kucoin.com/api/v1/market/stats?symbol={}-USDT",
                ticker
            );
            let bitget_url = format!(
                "https://api.bitget.com/api/v2/spot/market/tickers?symbol={}USDT",
                ticker
            );
            let coinex_url = format!(
                "https://api.coinex.com/v2/spot/ticker?market={}USDT",
                ticker
            );
            let kasfyi_url = format!(
                "https://api.kas.fyi/v1/tokens/krc20/{}/market",
                ticker
            );
            let (mexc_res, gate_res, kucoin_res, bitget_res, coinex_res, kasfyi_res) = tokio::join!(
                client.get(&mexc_url).send(),
                client.get(&gate_url).send(),
                client.get(&kucoin_url).send(),
                client.get(&bitget_url).send(),
                client.get(&coinex_url).send(),
                client.get(&kasfyi_url).send(),
            );
            let mut discovered_quotes: Vec<(&str, f64, Option<f64>)> = Vec::new();
            if let Some((_, _, cg_usd, cg_chg)) = cg_anchor.as_ref() {
                if *cg_usd > 0.0 {
                    discovered_quotes.push(("coingecko", *cg_usd, *cg_chg));
                }
            }
            if let Ok(resp) = mexc_res {
                if resp.status().is_success() {
                    if let Ok(data) = resp.json::<Value>().await {
                        let quote_vol = data
                            .get("quoteVolume")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse::<f64>().ok())
                            .unwrap_or(0.0);
                        let bid_pr = data
                            .get("bidPrice")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse::<f64>().ok())
                            .unwrap_or(0.0);
                        let ask_pr = data
                            .get("askPrice")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse::<f64>().ok())
                            .unwrap_or(0.0);
                        let spread_ok = if bid_pr > 0.0 && ask_pr >= bid_pr {
                            ((ask_pr - bid_pr) / ask_pr) <= MAX_CEX_SPREAD_RATIO
                        } else {
                            true
                        };
                        if quote_vol >= MIN_CEX_24H_VOLUME_USD && spread_ok {
                            if let Some(p) = data
                                .get("lastPrice")
                                .and_then(|v| v.as_str())
                                .and_then(|s| s.parse::<f64>().ok())
                            {
                                let canonical_ok = canonical_price_usd <= 0.0
                                    || ((p - canonical_price_usd).abs() / canonical_price_usd)
                                        <= MAX_CANONICAL_DEVIATION_RATIO;
                                if p > 0.0 && canonical_ok {
                                    let chg = data
                                        .get("priceChangePercent")
                                        .and_then(|v| v.as_str())
                                        .and_then(|s| s.parse::<f64>().ok())
                                        .map(|r| if r.abs() <= 1.5 { r * 100.0 } else { r });
                                    discovered_quotes.push(("mexc", p, chg));
                                }
                            }
                        }
                    }
                }
            }
            if let Ok(resp) = gate_res {
                if resp.status().is_success() {
                    if let Ok(data) = resp.json::<Value>().await {
                        let item = if let Some(arr) = data.as_array() {
                            arr.first().cloned().unwrap_or(Value::Null)
                        } else {
                            data
                        };
                        let quote_vol = item
                            .get("quote_volume")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse::<f64>().ok())
                            .unwrap_or(0.0);
                        let bid_pr = item
                            .get("highest_bid")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse::<f64>().ok())
                            .unwrap_or(0.0);
                        let ask_pr = item
                            .get("lowest_ask")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse::<f64>().ok())
                            .unwrap_or(0.0);
                        let spread_ok = if bid_pr > 0.0 && ask_pr >= bid_pr {
                            ((ask_pr - bid_pr) / ask_pr) <= MAX_CEX_SPREAD_RATIO
                        } else {
                            true
                        };
                        if quote_vol >= MIN_CEX_24H_VOLUME_USD && spread_ok {
                            if let Some(p) = item
                                .get("last")
                                .and_then(|v| v.as_str())
                                .and_then(|s| s.parse::<f64>().ok())
                            {
                                let canonical_ok = canonical_price_usd <= 0.0
                                    || ((p - canonical_price_usd).abs() / canonical_price_usd)
                                        <= MAX_CANONICAL_DEVIATION_RATIO;
                                if p > 0.0 && canonical_ok {
                                    let chg = item
                                        .get("change_percentage")
                                        .and_then(|v| v.as_str())
                                        .and_then(|s| s.parse::<f64>().ok());
                                    discovered_quotes.push(("gate", p, chg));
                                }
                            }
                        }
                    }
                }
            }
            if let Ok(resp) = kucoin_res {
                if resp.status().is_success() {
                    if let Ok(data) = resp.json::<Value>().await {
                        let vol_value = data
                            .pointer("/data/volValue")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse::<f64>().ok())
                            .unwrap_or(0.0);
                        let buy_bid = data
                            .pointer("/data/buy")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse::<f64>().ok())
                            .unwrap_or(0.0);
                        let sell_ask = data
                            .pointer("/data/sell")
                            .and_then(|v| v.as_str())
                            .and_then(|s| s.parse::<f64>().ok())
                            .unwrap_or(0.0);
                        let spread_ok = if buy_bid > 0.0 && sell_ask >= buy_bid {
                            ((sell_ask - buy_bid) / sell_ask) <= MAX_CEX_SPREAD_RATIO
                        } else {
                            true
                        };
                        if vol_value >= MIN_CEX_24H_VOLUME_USD && spread_ok {
                            if let Some(p) = data
                                .pointer("/data/last")
                                .and_then(|v| v.as_str())
                                .and_then(|s| s.parse::<f64>().ok())
                            {
                                let canonical_ok = canonical_price_usd <= 0.0
                                    || ((p - canonical_price_usd).abs() / canonical_price_usd)
                                        <= MAX_CANONICAL_DEVIATION_RATIO;
                                if p > 0.0 && canonical_ok {
                                    let chg = data
                                        .pointer("/data/changeRate")
                                        .and_then(|v| v.as_str())
                                        .and_then(|s| s.parse::<f64>().ok())
                                        .map(|r| r * 100.0);
                                    discovered_quotes.push(("kucoin", p, chg));
                                }
                            }
                        }
                    }
                }
            }
            if let Ok(resp) = bitget_res {
                if resp.status().is_success() {
                    if let Ok(data) = resp.json::<Value>().await {
                        if let Some(item) = data
                            .get("data")
                            .and_then(|d| d.as_array())
                            .and_then(|a| a.first())
                        {
                            let usdt_vol = item
                                .get("usdtVolume")
                                .or_else(|| item.get("quoteVolume"))
                                .and_then(|v| v.as_str())
                                .and_then(|s| s.parse::<f64>().ok())
                                .unwrap_or(0.0);
                            let bid_pr = item
                                .get("bidPr")
                                .and_then(|v| v.as_str())
                                .and_then(|s| s.parse::<f64>().ok())
                                .unwrap_or(0.0);
                            let ask_pr = item
                                .get("askPr")
                                .and_then(|v| v.as_str())
                                .and_then(|s| s.parse::<f64>().ok())
                                .unwrap_or(0.0);
                            let spread_ok = if bid_pr > 0.0 && ask_pr >= bid_pr {
                                ((ask_pr - bid_pr) / ask_pr) <= MAX_CEX_SPREAD_RATIO
                            } else {
                                true
                            };
                            if usdt_vol >= MIN_CEX_24H_VOLUME_USD && spread_ok {
                                if let Some(p) = item
                                    .get("lastPr")
                                    .and_then(|v| v.as_str())
                                    .and_then(|s| s.parse::<f64>().ok())
                                {
                                    let canonical_ok = canonical_price_usd <= 0.0
                                        || ((p - canonical_price_usd).abs() / canonical_price_usd)
                                            <= MAX_CANONICAL_DEVIATION_RATIO;
                                    if p > 0.0 && canonical_ok {
                                        let chg = item
                                            .get("change24h")
                                            .and_then(|v| v.as_str())
                                            .and_then(|s| s.parse::<f64>().ok())
                                            .map(|r| r * 100.0);
                                        discovered_quotes.push(("bitget", p, chg));
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if let Ok(resp) = coinex_res {
                if resp.status().is_success() {
                    if let Ok(data) = resp.json::<Value>().await {
                        if let Some(item) = data
                            .get("data")
                            .and_then(|d| d.as_array())
                            .and_then(|a| a.first())
                        {
                            let quote_val = item
                                .get("value")
                                .and_then(|v| v.as_str())
                                .and_then(|s| s.parse::<f64>().ok())
                                .unwrap_or(0.0);
                            if quote_val >= MIN_CEX_24H_VOLUME_USD {
                                if let Some(p) = item
                                    .get("last")
                                    .and_then(|v| v.as_str())
                                    .and_then(|s| s.parse::<f64>().ok())
                                {
                                    let canonical_ok = canonical_price_usd <= 0.0
                                        || ((p - canonical_price_usd).abs() / canonical_price_usd)
                                            <= MAX_CANONICAL_DEVIATION_RATIO;
                                    if p > 0.0 && canonical_ok {
                                        let open_v = item
                                            .get("open")
                                            .and_then(|v| v.as_str())
                                            .and_then(|s| s.parse::<f64>().ok())
                                            .unwrap_or(0.0);
                                        let chg = if open_v > 0.0 {
                                            Some(((p - open_v) / open_v) * 100.0)
                                        } else {
                                            None
                                        };
                                        discovered_quotes.push(("coinex", p, chg));
                                    }
                                }
                            }
                        }
                    }
                }
            }
            let is_known_krc20 = KNOWN_KRC20_ECOSYSTEM_TICKERS.iter().any(|&k| k == ticker);
            if !is_top_canonical_rank || is_known_krc20 {
                if let Ok(resp) = kasfyi_res {
                    if resp.status().is_success() {
                        if let Ok(data) = resp.json::<Value>().await {
                            let usd_p = data
                                .pointer("/price/usd")
                                .or_else(|| data.get("priceUsd"))
                                .or_else(|| data.get("price"))
                                .and_then(|v| {
                                    v.as_f64()
                                        .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
                                })
                                .unwrap_or(0.0);
                            let kas_p = data
                                .pointer("/price/kas")
                                .and_then(|v| {
                                    v.as_f64()
                                        .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
                                })
                                .unwrap_or(0.0);
                            let resolved_usd = if usd_p > 0.0 {
                                usd_p
                            } else if kas_p > 0.0 && kas_usd > 0.0 {
                                kas_p * kas_usd
                            } else {
                                0.0
                            };
                            let canonical_ok = canonical_price_usd <= 0.0
                                || ((resolved_usd - canonical_price_usd).abs()
                                    / canonical_price_usd)
                                    <= MAX_CANONICAL_DEVIATION_RATIO;
                            if resolved_usd > 0.0 && canonical_ok {
                                let chg = data.get("change24h").and_then(|v| v.as_f64());
                                discovered_quotes.push(("kasfyi", resolved_usd, chg));
                            }
                        }
                    }
                }
            }
            if discovered_quotes.is_empty() {
                if let Some((yf_spot, yf_chg, _)) =
                    fetch_yahoo_finance_rwa_quote(&client, &ticker).await
                {
                    if yf_spot > 0.0 {
                        discovered_quotes.push(("yahoo", yf_spot, Some(yf_chg)));
                    }
                }
            }
            if !discovered_quotes.is_empty() {
                let mut valid_spots: Vec<f64> =
                    discovered_quotes.iter().map(|(_, p, _)| *p).collect();
                valid_spots
                    .sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
                let median_spot = compute_sorted_median(&valid_spots);
                let median_chg = discovered_quotes
                    .iter()
                    .find_map(|(_, _, c)| *c)
                    .unwrap_or(0.0);
                {
                    let mut lock = prices.write().await;
                    if let Some(ex_map) = lock.get_mut(&ticker) {
                        for (ex_name, spot_val, chg_val) in discovered_quotes {
                            record_exchange_quote(ex_map, ex_name, spot_val, chg_val);
                        }
                    }
                }
                if median_spot > 0.0 {
                    let _: redis::RedisResult<()> = redis::cmd("SETEX")
                        .arg(format!("oracle:spot:{}_USDC", ticker))
                        .arg(SPOT_ORACLE_TTL_SECS)
                        .arg(median_spot.to_string())
                        .query_async(&mut conn)
                        .await;
                    let _: redis::RedisResult<()> = redis::cmd("SETEX")
                        .arg(format!("oracle:change24h:{}_USDC", ticker))
                        .arg(CHANGE_24H_TTL_SECS)
                        .arg(median_chg.to_string())
                        .query_async(&mut conn)
                        .await;
                    if let Some(ref pg_pool) = pg_pool_opt {
                        let _ = sqlx::query(
                            r#"
                            INSERT INTO rwa_oracle_feeds (ticker, asset_class, price_usd, change_24h_pct, oracle_source, updated_at)
                            VALUES ($1, 'DYNAMIC_TOKEN', $2, $3, 'COINGECKO_CEX_QUORUM', CURRENT_TIMESTAMP)
                            ON CONFLICT (ticker) DO UPDATE SET
                                price_usd = EXCLUDED.price_usd,
                                change_24h_pct = EXCLUDED.change_24h_pct,
                                oracle_source = EXCLUDED.oracle_source,
                                updated_at = CURRENT_TIMESTAMP
                            "#,
                        )
                        .bind(&ticker)
                        .bind(median_spot)
                        .bind(median_chg)
                        .execute(pg_pool)
                        .await;
                    }
                }
            }
        }
    }
}
async fn coingecko_rest_fallback(prices: PriceMap) {
    let client = reqwest::Client::builder()
        .user_agent("Perennia-Sovereign-Oracle/1.0")
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new());
    let mut interval = tokio::time::interval(Duration::from_secs(20));
    let mapping = [
        ("KAS", "kaspa"),
        ("BTC", "bitcoin"),
        ("ETH", "ethereum"),
        ("SOL", "solana"),
        ("XRP", "ripple"),
        ("DOGE", "dogecoin"),
        ("TON", "the-open-network"),
        ("SUI", "sui"),
        ("ADA", "cardano"),
        ("AVAX", "avalanche-2"),
        ("LINK", "chainlink"),
        ("LTC", "litecoin"),
        ("POL", "polygon-ecosystem-token"),
        ("TRX", "tron"),
        ("ZEC", "zcash"),
        ("ARB", "arbitrum"),
    ];
    let ids_param: String = mapping.iter().map(|(_, cg)| *cg).collect::<Vec<_>>().join(",");
    let url = format!(
        "https://api.coingecko.com/api/v3/simple/price?ids={}&vs_currencies=usd&include_24hr_change=true",
        ids_param
    );
    loop {
        interval.tick().await;
        if let Ok(res) = client.get(&url).send().await {
            if let Ok(data) = res.json::<Value>().await {
                let mut lock = prices.write().await;
                for (ticker, cg_id) in mapping {
                    if let Some(usd) = data.pointer(&format!("/{}/usd", cg_id)).and_then(|v| v.as_f64()) {
                        let chg_24h = data
                            .pointer(&format!("/{}/usd_24h_change", cg_id))
                            .and_then(|v| v.as_f64());
                        if usd > 0.0 {
                            if let Some(ex_map) = lock.get_mut(ticker) {
                                record_exchange_quote(ex_map, "coingecko", usd, chg_24h);
                            }
                        }
                    }
                }
            }
        }
    }
}
async fn bybit_ws(prices: PriceMap) {
    let args: Vec<String> = ORACLE_VOLATILE_ASSETS
        .iter()
        .map(|a| format!("tickers.{}USDT", a))
        .collect();
    loop {
        if let Ok((ws_stream, _)) = connect_async("wss://stream.bybit.com/v5/public/spot").await {
            tracing::info!("📡 [Oracle Array] Node 1 Online: Bybit");
            let (mut write, mut read) = ws_stream.split();
            for chunk in args.chunks(10) {
                let sub = json!({"op": "subscribe", "args": chunk});
                let _ = write.send(Message::Text(sub.to_string())).await;
            }
            while let Some(msg) = read.next().await {
                if let Ok(Message::Text(text)) = msg {
                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                        if let Some(topic) = json.get("topic").and_then(|t| t.as_str()) {
                            if let Some(data_obj) = json.get("data") {
                                if let Some(last_price) = data_obj.get("lastPrice").and_then(|p| p.as_str()) {
                                    if let Ok(val) = last_price.parse::<f64>() {
                                        let chg_pct = data_obj
                                            .get("price24hPcnt")
                                            .and_then(|c| c.as_str())
                                            .and_then(|s| s.parse::<f64>().ok())
                                            .map(|r| r * 100.0);
                                        let asset = topic.replace("tickers.", "").replace("USDT", "");
                                        if let Some(ex_map) = prices.write().await.get_mut(&asset) {
                                            record_exchange_quote(ex_map, "bybit", val, chg_pct);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}
async fn kucoin_ws(prices: PriceMap) {
    let client = reqwest::Client::new();
    let pairs_csv: String = ORACLE_VOLATILE_ASSETS
        .iter()
        .map(|a| format!("{}-USDT", a))
        .collect::<Vec<_>>()
        .join(",");
    let topic_str = format!("/market/ticker:{}", pairs_csv);
    loop {
        if let Ok(res) = client.post("https://api.kucoin.com/api/v1/bullet-public").send().await {
            if let Ok(data) = res.json::<Value>().await {
                if let Some(token) = data.pointer("/data/token").and_then(|t| t.as_str()) {
                    let ws_url = format!("wss://ws-api-spot.kucoin.com/?token={}", token);
                    if let Ok((ws_stream, _)) = connect_async(&ws_url).await {
                        tracing::info!("📡 [Oracle Array] Node 2 Online: KuCoin");
                        let (mut write, mut read) = ws_stream.split();
                        let sub = json!({
                            "id": 1,
                            "type": "subscribe",
                            "topic": topic_str,
                            "privateChannel": false,
                            "response": true
                        });
                        let _ = write.send(Message::Text(sub.to_string())).await;
                        while let Some(msg) = read.next().await {
                            if let Ok(Message::Text(text)) = msg {
                                if let Ok(json) = serde_json::from_str::<Value>(&text) {
                                    if json.get("type").and_then(|t| t.as_str()) == Some("message") {
                                        if let Some(topic) = json.get("topic").and_then(|t| t.as_str()) {
                                            if let Some(price_str) = json.pointer("/data/price").and_then(|p| p.as_str()) {
                                                if let Ok(val) = price_str.parse::<f64>() {
                                                    let chg_pct = json
                                                        .pointer("/data/changeRate")
                                                        .and_then(|c| c.as_str())
                                                        .and_then(|s| s.parse::<f64>().ok())
                                                        .map(|r| r * 100.0);
                                                    let asset = topic.replace("/market/ticker:", "").replace("-USDT", "");
                                                    if let Some(ex_map) = prices.write().await.get_mut(&asset) {
                                                        record_exchange_quote(ex_map, "kucoin", val, chg_pct);
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}
async fn kraken_ws(prices: PriceMap) {
    let symbols: Vec<String> = ORACLE_VOLATILE_ASSETS
        .iter()
        .map(|a| format!("{}/USD", a))
        .collect();
    loop {
        if let Ok((ws_stream, _)) = connect_async("wss://ws.kraken.com/v2").await {
            tracing::info!("📡 [Oracle Array] Node 3 Online: Kraken");
            let (mut write, mut read) = ws_stream.split();
            let sub = json!({
                "method": "subscribe",
                "params": {
                    "channel": "ticker",
                    "symbol": symbols
                }
            });
            let _ = write.send(Message::Text(sub.to_string())).await;
            while let Some(msg) = read.next().await {
                if let Ok(Message::Text(text)) = msg {
                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                        if json.get("channel").and_then(|c| c.as_str()) == Some("ticker") {
                            if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
                                for item in data {
                                    if let (Some(sym), Some(last)) = (
                                        item.get("symbol").and_then(|s| s.as_str()),
                                        item.get("last").and_then(|l| l.as_f64()),
                                    ) {
                                        let chg_pct = item.get("change_pct").and_then(|c| c.as_f64());
                                        let asset = sym.replace("/USD", "");
                                        if let Some(ex_map) = prices.write().await.get_mut(&asset) {
                                            record_exchange_quote(ex_map, "kraken", last, chg_pct);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}
async fn gate_ws(prices: PriceMap) {
    let payload: Vec<String> = ORACLE_VOLATILE_ASSETS
        .iter()
        .map(|a| format!("{}_USDT", a))
        .collect();
    loop {
        if let Ok((ws_stream, _)) = connect_async("wss://api.gateio.ws/ws/v4/").await {
            tracing::info!("📡 [Oracle Array] Node 4 Online: Gate.io");
            let (mut write, mut read) = ws_stream.split();
            let sub = json!({
                "time": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
                "channel": "spot.tickers",
                "event": "subscribe",
                "payload": payload
            });
            let _ = write.send(Message::Text(sub.to_string())).await;
            while let Some(msg) = read.next().await {
                if let Ok(Message::Text(text)) = msg {
                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                        if json.get("event").and_then(|e| e.as_str()) == Some("update") {
                            if let Some(result) = json.get("result") {
                                let items = if result.is_array() {
                                    result.as_array().unwrap().clone()
                                } else {
                                    vec![result.clone()]
                                };
                                for item in items {
                                    if let (Some(pair), Some(last)) = (
                                        item.get("currency_pair").and_then(|p| p.as_str()),
                                        item.get("last").and_then(|l| l.as_str()),
                                    ) {
                                        if let Ok(val) = last.parse::<f64>() {
                                            let chg_pct = item
                                                .get("change_percentage")
                                                .and_then(|c| c.as_str())
                                                .and_then(|s| s.parse::<f64>().ok());
                                            let asset = pair.replace("_USDT", "");
                                            if let Some(ex_map) = prices.write().await.get_mut(&asset) {
                                                record_exchange_quote(ex_map, "gate", val, chg_pct);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}
async fn mexc_ws(prices: PriceMap) {
    let params: Vec<String> = ORACLE_VOLATILE_ASSETS
        .iter()
        .map(|a| format!("spot@public.miniTicker.v3.api@{}USDT", a))
        .collect();
    loop {
        if let Ok((ws_stream, _)) = connect_async("wss://wbs.mexc.com/ws").await {
            tracing::info!("📡 [Oracle Array] Node 5 Online: MEXC");
            let (mut write, mut read) = ws_stream.split();
            let sub = json!({
                "method": "SUBSCRIPTION",
                "params": params
            });
            let _ = write.send(Message::Text(sub.to_string())).await;
            while let Some(msg) = read.next().await {
                if let Ok(Message::Text(text)) = msg {
                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                        if let Some(c) = json.get("c").and_then(|c| c.as_str()) {
                            if let Some(d_obj) = json.get("d") {
                                if let Some(p) = d_obj.get("p").and_then(|p| p.as_str()) {
                                    if let Ok(val) = p.parse::<f64>() {
                                        let chg_pct = d_obj
                                            .get("r")
                                            .and_then(|r| r.as_str())
                                            .and_then(|s| s.parse::<f64>().ok())
                                            .map(|r| r * 100.0);
                                        let asset = c.split('@').last().unwrap_or("").replace("USDT", "");
                                        if let Some(ex_map) = prices.write().await.get_mut(&asset) {
                                            record_exchange_quote(ex_map, "mexc", val, chg_pct);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}
async fn bitget_ws(prices: PriceMap) {
    let args: Vec<Value> = ORACLE_VOLATILE_ASSETS
        .iter()
        .map(|a| json!({"instType": "SPOT", "channel": "ticker", "instId": format!("{}USDT", a)}))
        .collect();
    loop {
        if let Ok((ws_stream, _)) = connect_async("wss://ws.bitget.com/v2/ws/public").await {
            tracing::info!("📡 [Oracle Array] Node 6 Online: Bitget");
            let (mut write, mut read) = ws_stream.split();
            let sub = json!({
                "op": "subscribe",
                "args": args
            });
            let _ = write.send(Message::Text(sub.to_string())).await;
            while let Some(msg) = read.next().await {
                if let Ok(Message::Text(text)) = msg {
                    if text == "pong" { continue; }
                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                        if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
                            for item in data {
                                if let (Some(inst), Some(last)) = (
                                    item.get("instId").and_then(|i| i.as_str()),
                                    item.get("lastPr").and_then(|l| l.as_str()),
                                ) {
                                    if let Ok(val) = last.parse::<f64>() {
                                        let chg_pct = item
                                            .get("change24h")
                                            .and_then(|c| c.as_str())
                                            .and_then(|s| s.parse::<f64>().ok())
                                            .map(|r| r * 100.0);
                                        let asset = inst.replace("USDT", "");
                                        if let Some(ex_map) = prices.write().await.get_mut(&asset) {
                                            record_exchange_quote(ex_map, "bitget", val, chg_pct);
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}
async fn coinex_ws(prices: PriceMap) {
    let market_list: Vec<String> = ORACLE_VOLATILE_ASSETS
        .iter()
        .map(|a| format!("{}USDT", a))
        .collect();
    loop {
        if let Ok((ws_stream, _)) = connect_async("wss://socket.coinex.com/v2/spot").await {
            tracing::info!("📡 [Oracle Array] Node 7 Online: CoinEx");
            let (mut write, mut read) = ws_stream.split();
            let sub = json!({
                "method": "state.subscribe",
                "params": {"market_list": market_list},
                "id": 1
            });
            let _ = write.send(Message::Text(sub.to_string())).await;
            while let Some(msg) = read.next().await {
                if let Ok(Message::Text(text)) = msg {
                    if let Ok(json) = serde_json::from_str::<Value>(&text) {
                        if json.get("method").and_then(|m| m.as_str()) == Some("state.update") {
                            if let Some(state_list) = json
                                .get("data")
                                .and_then(|d| d.get("state_list"))
                                .and_then(|l| l.as_array())
                            {
                                for item in state_list {
                                    if let (Some(market), Some(last)) = (
                                        item.get("market").and_then(|m| m.as_str()),
                                        item.get("last").and_then(|l| l.as_str()),
                                    ) {
                                        if let Ok(val) = last.parse::<f64>() {
                                            let open_val = item
                                                .get("open")
                                                .and_then(|o| o.as_str())
                                                .and_then(|s| s.parse::<f64>().ok())
                                                .unwrap_or(0.0);
                                            let chg_pct = if open_val > 0.0 {
                                                Some(((val - open_val) / open_val) * 100.0)
                                            } else {
                                                None
                                            };
                                            let asset = market.replace("USDT", "");
                                            if let Some(ex_map) = prices.write().await.get_mut(&asset) {
                                                record_exchange_quote(ex_map, "coinex", val, chg_pct);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        tokio::time::sleep(Duration::from_secs(3)).await;
    }
}
async fn query_kaspad_block_consensus(
    block_hash: &str,
) -> Option<(u64, f64, u64, Option<bool>)> {
    let endpoints = crate::kaspad_client::resolve_local_first_grpc_endpoints();
    for endpoint in endpoints {
        let Ok(Ok(mut client)) = tokio::time::timeout(
            Duration::from_secs(3),
            RpcClient::connect(endpoint),
        )
        .await
        else {
            continue;
        };
        let (tx, rx) = mpsc::channel::<KaspadRequest>(4);
        let Ok(Ok(response)) = tokio::time::timeout(
            Duration::from_secs(3),
            client.message_stream(ReceiverStream::new(rx)),
        )
        .await
        else {
            continue;
        };
        let mut stream = response.into_inner();
        let _ = tx.send(KaspadRequest {
            id: 1,
            payload: Some(RequestPayload::GetBlockRewardInfoRequest(GetBlockRewardInfoRequestMessage {
                hash: block_hash.to_string(),
            })),
        }).await;
        let _ = tx.send(KaspadRequest {
            id: 2,
            payload: Some(RequestPayload::GetBlockRequest(GetBlockRequestMessage {
                hash: block_hash.to_string(),
                include_transactions: true,
            })),
        }).await;
        let mut resolved_reward_sompi = 0u64;
        let mut resolved_diff = 0.0f64;
        let mut resolved_daa_score = 0u64;
        let mut is_orphaned_opt: Option<bool> = None;
        for _ in 0..2 {
            if let Ok(Ok(Some(msg))) = tokio::time::timeout(Duration::from_secs(2), stream.message()).await {
                match msg.payload {
                    Some(ResponsePayload::GetBlockRewardInfoResponse(res)) => {
                        if res.error.is_none() {
                            if let Some(amt) = res.reward_amount {
                                if amt > 0 {
                                    resolved_reward_sompi = amt;
                                }
                            }
                            if let Some(hdr) = res.header {
                                if resolved_diff <= 0.0 {
                                    resolved_diff = difficulty_from_bits(hdr.bits);
                                }
                                if hdr.daa_score > 0 {
                                    resolved_daa_score = hdr.daa_score;
                                }
                            }
                            if res.block_color == (BlockColor::Red as i32) {
                                is_orphaned_opt = Some(true);
                            } else if res.block_color == (BlockColor::Blue as i32) {
                                is_orphaned_opt = Some(false);
                            }
                        }
                    }
                    Some(ResponsePayload::GetBlockResponse(res)) => {
                        if res.error.is_none() {
                            if let Some(block) = res.block {
                                if let Some(vd) = &block.verbose_data {
                                    if vd.difficulty > 0.0 {
                                        resolved_diff = vd.difficulty;
                                    }
                                }
                                if let Some(hdr) = &block.header {
                                    if resolved_diff <= 0.0 {
                                        resolved_diff = difficulty_from_bits(hdr.bits);
                                    }
                                    if resolved_daa_score == 0 && hdr.daa_score > 0 {
                                        resolved_daa_score = hdr.daa_score;
                                    }
                                }
                                if resolved_reward_sompi == 0 {
                                    resolved_reward_sompi = extract_coinbase_reward_sompi(&block);
                                }
                            }
                        }
                    }
                    _ => {}
                }
            }
        }
        if resolved_reward_sompi > 0 || resolved_diff > 0.0 || resolved_daa_score > 0 || is_orphaned_opt.is_some() {
            return Some((resolved_reward_sompi, resolved_diff, resolved_daa_score, is_orphaned_opt));
        }
    }
    None
}
pub async fn start_oracle_daemon() {
    tracing::info!("🔮 Yield Oracle & Block Maturity Daemon Booting...");
    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://postgres:password@127.0.0.1:5432/perennia".to_string());
    let pool = match sqlx::PgPool::connect(&db_url).await {
        Ok(p) => p,
        Err(e) => {
            tracing::error!("Oracle DB connection failed: {}", e);
            return;
        }
    };
    let _ = sqlx::query("ALTER TABLE network_blocks ADD COLUMN IF NOT EXISTS reward_sompi BIGINT NOT NULL DEFAULT 0")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE network_blocks ADD COLUMN IF NOT EXISTS reward_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0")
        .execute(&pool)
        .await;
    let _ = sqlx::query("ALTER TABLE network_blocks ADD COLUMN IF NOT EXISTS daa_score BIGINT NOT NULL DEFAULT 0")
        .execute(&pool)
        .await;
    let redis_url = std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());
    let redis_client = match redis::Client::open(redis_url) {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Oracle Redis connection failed: {}", e);
            return;
        }
    };
    let mut redis_conn = match redis_client.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("Oracle Redis multiplexer failed: {}", e);
            return;
        }
    };
    let mut interval = tokio::time::interval(Duration::from_secs(5));
    loop {
        interval.tick().await;
        let mut block_events = Vec::new();
        loop {
            let result: redis::RedisResult<Option<String>> = redis::cmd("LPOP")
                .arg("perennia:oracle:block_buffer")
                .query_async(&mut redis_conn)
                .await;
            match result {
                Ok(Some(event_str)) => {
                    if let Ok(parsed) = serde_json::from_str::<Value>(&event_str) {
                        block_events.push(parsed);
                    }
                }
                Ok(None) => break,
                Err(_) => break,
            }
        }
        if !block_events.is_empty() {
            let fallback_net_diff: f64 = redis::cmd("GET")
                .arg("pool:network_diff")
                .query_async::<_, Option<String>>(&mut redis_conn)
                .await
                .ok()
                .flatten()
                .and_then(|s| s.parse::<f64>().ok())
                .unwrap_or(0.0);
            let fallback_reward_sompi: u64 = redis::cmd("GET")
                .arg("pool:block_reward_sompi")
                .query_async::<_, Option<String>>(&mut redis_conn)
                .await
                .ok()
                .flatten()
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0);
            let fallback_virtual_daa: u64 = redis::cmd("GET")
                .arg("pool:virtual_daa_score")
                .query_async::<_, Option<String>>(&mut redis_conn)
                .await
                .ok()
                .flatten()
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0);
            let mut hashes = Vec::with_capacity(block_events.len());
            let mut workers = Vec::with_capacity(block_events.len());
            let mut nonces = Vec::with_capacity(block_events.len());
            let mut diffs = Vec::with_capacity(block_events.len());
            let mut rewards_sompi = Vec::with_capacity(block_events.len());
            let mut rewards_kas = Vec::with_capacity(block_events.len());
            let mut daa_scores = Vec::with_capacity(block_events.len());
            for evt in &block_events {
                if let (Some(hash), Some(worker), Some(nonce)) = (
                    evt["block_hash"].as_str(),
                    evt["worker"].as_str(),
                    evt["nonce"].as_u64(),
                ) {
                    let mut diff = evt["network_diff"].as_f64().filter(|&d| d > 0.0).unwrap_or(fallback_net_diff);
                    let mut reward_sompi = evt["reward_sompi"].as_u64().filter(|&r| r > 0).unwrap_or(fallback_reward_sompi);
                    let mut daa_score = evt["daa_score"].as_u64().filter(|&d| d > 0).unwrap_or(fallback_virtual_daa);
                    if let Some((node_sompi, node_diff, node_daa, _)) = query_kaspad_block_consensus(hash).await {
                        if node_sompi > 0 {
                            reward_sompi = node_sompi;
                        }
                        if node_diff > 0.0 {
                            diff = node_diff;
                        }
                        if node_daa > 0 {
                            daa_score = node_daa;
                        }
                    }
                    let reward_kas = (reward_sompi as f64) / 100_000_000.0;
                    hashes.push(hash.to_string());
                    workers.push(worker.to_string());
                    nonces.push(nonce as i64);
                    diffs.push(diff);
                    rewards_sompi.push(reward_sompi as i64);
                    rewards_kas.push(reward_kas);
                    daa_scores.push(daa_score as i64);
                }
            }
            if !hashes.is_empty() {
                let mut tx_blocks = match pool.begin().await {
                    Ok(t) => t,
                    Err(e) => {
                        tracing::error!("Oracle failed to start DB transaction for blocks: {}", e);
                        continue;
                    }
                };
                let insert_res = sqlx::query(
                    r#"
                    INSERT INTO network_blocks (block_hash, worker_id, nonce, network_diff, reward_sompi, reward_kas, daa_score)
                    SELECT * FROM UNNEST($1::text[], $2::text[], $3::bigint[], $4::float8[], $5::bigint[], $6::float8[], $7::bigint[])
                    ON CONFLICT (block_hash) DO UPDATE SET
                        network_diff = CASE WHEN EXCLUDED.network_diff > 0 THEN EXCLUDED.network_diff ELSE network_blocks.network_diff END,
                        reward_sompi = CASE WHEN EXCLUDED.reward_sompi > 0 THEN EXCLUDED.reward_sompi ELSE network_blocks.reward_sompi END,
                        reward_kas = CASE WHEN EXCLUDED.reward_kas > 0 THEN EXCLUDED.reward_kas ELSE network_blocks.reward_kas END,
                        daa_score = CASE WHEN EXCLUDED.daa_score > 0 THEN EXCLUDED.daa_score ELSE network_blocks.daa_score END
                    "#
                )
                .bind(&hashes)
                .bind(&workers)
                .bind(&nonces)
                .bind(&diffs)
                .bind(&rewards_sompi)
                .bind(&rewards_kas)
                .bind(&daa_scores)
                .execute(&mut *tx_blocks)
                .await;
                if let Err(e) = insert_res {
                    tracing::error!("Failed to insert network blocks: {}", e);
                    let _ = tx_blocks.rollback().await;
                } else {
                    let _ = tx_blocks.commit().await;
                    tracing::info!("🧱 [ORACLE] Settled {} L1 network blocks into Postgres.", hashes.len());
                }
            }
        }
        if let Ok(pending_rows) = sqlx::query(
            "SELECT block_hash, reward_sompi, network_diff, COALESCE(daa_score, 0) AS daa_score FROM network_blocks WHERE (reward_sompi = 0 OR daa_score = 0 OR discovered_at > CURRENT_TIMESTAMP - INTERVAL '10 minutes') ORDER BY discovered_at DESC LIMIT 20"
        )
        .fetch_all(&pool)
        .await
        {
            for row in pending_rows {
                let block_hash: String = row.try_get("block_hash").unwrap_or_default();
                if block_hash.is_empty() {
                    continue;
                }
                if let Some((node_sompi, node_diff, node_daa, is_orphaned_opt)) = query_kaspad_block_consensus(&block_hash).await {
                    let current_sompi: i64 = row.try_get("reward_sompi").unwrap_or(0);
                    let current_diff: f64 = row.try_get("network_diff").unwrap_or(0.0);
                    let current_daa: i64 = row.try_get("daa_score").unwrap_or(0);
                    let final_sompi = if node_sompi > 0 { node_sompi as i64 } else { current_sompi };
                    let final_kas = (final_sompi as f64) / 100_000_000.0;
                    let final_diff = if node_diff > 0.0 { node_diff } else { current_diff };
                    let final_daa = if node_daa > 0 { node_daa as i64 } else { current_daa };
                    if let Some(is_orphaned) = is_orphaned_opt {
                        let _ = sqlx::query(
                            "UPDATE network_blocks SET reward_sompi = $1, reward_kas = $2, network_diff = $3, daa_score = $4, is_orphaned = $5 WHERE block_hash = $6"
                        )
                        .bind(final_sompi)
                        .bind(final_kas)
                        .bind(final_diff)
                        .bind(final_daa)
                        .bind(is_orphaned)
                        .bind(&block_hash)
                        .execute(&pool)
                        .await;
                    } else if final_sompi != current_sompi || (final_diff - current_diff).abs() > 1.0 || final_daa != current_daa {
                        let _ = sqlx::query(
                            "UPDATE network_blocks SET reward_sompi = $1, reward_kas = $2, network_diff = $3, daa_score = $4 WHERE block_hash = $5"
                        )
                        .bind(final_sompi)
                        .bind(final_kas)
                        .bind(final_diff)
                        .bind(final_daa)
                        .bind(&block_hash)
                        .execute(&pool)
                        .await;
                    }
                }
            }
        }
    }
}
```

## File: src/schema.rs
```rust
use sqlx::PgPool;
use std::env;
pub async fn ensure_database_schema(pool: &PgPool) -> anyhow::Result<()> {
    tracing::info!("🛡️ Running Idempotent PostgreSQL Schema Bootstrapper...");
    let ddl_statements = [
        r#"
        CREATE TABLE IF NOT EXISTS system_treasury_config (
            config_id VARCHAR(64) PRIMARY KEY DEFAULT 'PRIMARY',
            hot_ceiling_kas DOUBLE PRECISION NOT NULL DEFAULT 5000.0,
            min_runway_kas DOUBLE PRECISION NOT NULL DEFAULT 250.0,
            fpps_max_float_kas DOUBLE PRECISION NOT NULL DEFAULT 50.0,
            pool_fee_rate DOUBLE PRECISION NOT NULL DEFAULT 0.01,
            outflow_breaker_tripped BOOLEAN NOT NULL DEFAULT FALSE,
            cold_kas_address VARCHAR(255) NOT NULL DEFAULT '',
            cold_btc_address VARCHAR(255) NOT NULL DEFAULT '',
            cold_eth_address VARCHAR(255) NOT NULL DEFAULT '',
            cold_sol_address VARCHAR(255) NOT NULL DEFAULT '',
            updated_by VARCHAR(255) NOT NULL DEFAULT 'SYSTEM_BOOT',
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE system_treasury_config ADD COLUMN IF NOT EXISTS hot_ceiling_kas DOUBLE PRECISION NOT NULL DEFAULT 5000.0",
        "ALTER TABLE system_treasury_config ADD COLUMN IF NOT EXISTS min_runway_kas DOUBLE PRECISION NOT NULL DEFAULT 250.0",
        "ALTER TABLE system_treasury_config ADD COLUMN IF NOT EXISTS fpps_max_float_kas DOUBLE PRECISION NOT NULL DEFAULT 50.0",
        "ALTER TABLE system_treasury_config ADD COLUMN IF NOT EXISTS pool_fee_rate DOUBLE PRECISION NOT NULL DEFAULT 0.01",
        "ALTER TABLE system_treasury_config ADD COLUMN IF NOT EXISTS outflow_breaker_tripped BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE system_treasury_config ADD COLUMN IF NOT EXISTS cold_kas_address VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE system_treasury_config ADD COLUMN IF NOT EXISTS cold_btc_address VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE system_treasury_config ADD COLUMN IF NOT EXISTS cold_eth_address VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE system_treasury_config ADD COLUMN IF NOT EXISTS cold_sol_address VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE system_treasury_config ADD COLUMN IF NOT EXISTS updated_by VARCHAR(255) NOT NULL DEFAULT 'SYSTEM_BOOT'",
        "ALTER TABLE system_treasury_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",
        r#"
        CREATE TABLE IF NOT EXISTS user_cold_vault_rules (
            wallet_address VARCHAR(255) NOT NULL,
            asset_ticker VARCHAR(32) NOT NULL,
            network VARCHAR(32) NOT NULL DEFAULT 'KAS',
            cold_destination_address VARCHAR(255) NOT NULL,
            vault_label VARCHAR(128) NOT NULL DEFAULT 'Perennia Cold Vault',
            overflow_ceiling DOUBLE PRECISION NOT NULL DEFAULT 500.0,
            auto_sweep_enabled BOOLEAN NOT NULL DEFAULT FALSE,
            last_sweep_txid VARCHAR(128),
            last_sweep_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            last_sweep_at TIMESTAMP WITH TIME ZONE,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (wallet_address, asset_ticker)
        )
        "#,
        "CREATE INDEX IF NOT EXISTS idx_user_cold_vault_rules_auto ON user_cold_vault_rules (auto_sweep_enabled, asset_ticker)",
        r#"
        CREATE TABLE IF NOT EXISTS user_command_centers (
            wallet_address VARCHAR(255) PRIMARY KEY,
            layout_state JSONB NOT NULL DEFAULT '{}'::jsonb,
            last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS yield_reservoirs (
            wallet_address VARCHAR(255) PRIMARY KEY,
            streaming_balance_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            total_yield_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            lp_tokens JSONB DEFAULT '{}'::jsonb,
            verified_onchain_credits_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            row_hmac_sig VARCHAR(128) NOT NULL DEFAULT '',
            quarantined BOOLEAN NOT NULL DEFAULT FALSE,
            quarantine_reason TEXT,
            quarantined_at TIMESTAMP WITH TIME ZONE,
            last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE yield_reservoirs ADD COLUMN IF NOT EXISTS lp_tokens JSONB DEFAULT '{}'::jsonb",
        "ALTER TABLE yield_reservoirs ADD COLUMN IF NOT EXISTS verified_onchain_credits_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE yield_reservoirs ADD COLUMN IF NOT EXISTS row_hmac_sig VARCHAR(128) NOT NULL DEFAULT ''",
        "ALTER TABLE yield_reservoirs ADD COLUMN IF NOT EXISTS quarantined BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE yield_reservoirs ADD COLUMN IF NOT EXISTS quarantine_reason TEXT",
        "ALTER TABLE yield_reservoirs ADD COLUMN IF NOT EXISTS quarantined_at TIMESTAMP WITH TIME ZONE",
        r#"
        CREATE TABLE IF NOT EXISTS network_blocks (
            block_hash VARCHAR(255) PRIMARY KEY,
            worker_id VARCHAR(255) NOT NULL,
            nonce BIGINT NOT NULL,
            network_diff DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            reward_sompi BIGINT NOT NULL DEFAULT 0,
            reward_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            daa_score BIGINT NOT NULL DEFAULT 0,
            is_orphaned BOOLEAN DEFAULT FALSE,
            discovered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE network_blocks ADD COLUMN IF NOT EXISTS reward_sompi BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE network_blocks ADD COLUMN IF NOT EXISTS reward_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE network_blocks ADD COLUMN IF NOT EXISTS daa_score BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE network_blocks ADD COLUMN IF NOT EXISTS is_orphaned BOOLEAN DEFAULT FALSE",
        r#"
        CREATE TABLE IF NOT EXISTS liquidity_providers (
            lp_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wallet_address VARCHAR(255) NOT NULL,
            pool_pair VARCHAR(120) NOT NULL,
            staked_asset_a DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            staked_asset_b DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            weights_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            reserves_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            lock_duration_days INTEGER NOT NULL DEFAULT 0,
            unlock_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            last_yield_distribution TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE liquidity_providers ALTER COLUMN pool_pair TYPE VARCHAR(120)",
        "ALTER TABLE liquidity_providers ADD COLUMN IF NOT EXISTS weights_json JSONB NOT NULL DEFAULT '{}'::jsonb",
        "ALTER TABLE liquidity_providers ADD COLUMN IF NOT EXISTS reserves_json JSONB NOT NULL DEFAULT '{}'::jsonb",
        "CREATE INDEX IF NOT EXISTS idx_lp_wallet_pair ON liquidity_providers (wallet_address, pool_pair)",
        r#"
        CREATE TABLE IF NOT EXISTS silo_staking_positions (
            stake_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wallet_address VARCHAR(255) NOT NULL,
            token_ticker VARCHAR(32) NOT NULL DEFAULT 'SILO',
            amount_staked DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
            tx_hash VARCHAR(255),
            cooldown_initiated_at TIMESTAMP WITH TIME ZONE,
            cooldown_ends_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "CREATE INDEX IF NOT EXISTS idx_silo_staking_wallet ON silo_staking_positions (wallet_address, status)",
        r#"
        CREATE TABLE IF NOT EXISTS yield_distributions (
            distribution_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            pool_pair VARCHAR(120) NOT NULL,
            total_fees_distributed_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            distributed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE yield_distributions ALTER COLUMN pool_pair TYPE VARCHAR(120)",
        r#"
        CREATE TABLE IF NOT EXISTS pending_transactions (
            tx_id VARCHAR(255) PRIMARY KEY,
            wallet_address VARCHAR(255) NOT NULL,
            amount_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            action_type VARCHAR(80) NOT NULL DEFAULT 'SOVEREIGN_TRANSFER',
            status VARCHAR(40) NOT NULL DEFAULT 'PENDING',
            block_daa BIGINT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE pending_transactions ADD COLUMN IF NOT EXISTS block_daa BIGINT",
        "ALTER TABLE pending_transactions ADD COLUMN IF NOT EXISTS status VARCHAR(40) NOT NULL DEFAULT 'PENDING'",
        r#"
        CREATE TABLE IF NOT EXISTS tax_ledger_events (
            event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wallet_address VARCHAR(255) NOT NULL,
            asset_ticker VARCHAR(32) NOT NULL,
            event_type VARCHAR(64) NOT NULL,
            gross_proceeds_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            amount_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            spot_price_at_execution DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            tx_hash VARCHAR(255),
            payout_address VARCHAR(255),
            cost_basis_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            realized_gain_loss_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            holding_period VARCHAR(32) NOT NULL DEFAULT 'SHORT_TERM',
            recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS tx_hash VARCHAR(255)",
        "ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS payout_address VARCHAR(255)",
        "ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS cost_basis_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS realized_gain_loss_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE tax_ledger_events ADD COLUMN IF NOT EXISTS holding_period VARCHAR(32) NOT NULL DEFAULT 'SHORT_TERM'",
        "CREATE INDEX IF NOT EXISTS idx_tax_ledger_wallet_recorded ON tax_ledger_events (wallet_address, recorded_at DESC)",
        r#"
        CREATE TABLE IF NOT EXISTS l1_payout_queue (
            payout_id VARCHAR(80) PRIMARY KEY,
            wallet_address VARCHAR(255) NOT NULL,
            destination_address VARCHAR(255) NOT NULL,
            asset_ticker VARCHAR(32) NOT NULL,
            network VARCHAR(32) NOT NULL,
            amount_tokens DOUBLE PRECISION NOT NULL,
            gross_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            spot_price DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            source_type VARCHAR(40) NOT NULL DEFAULT 'ledger_withdrawal',
            tx_hash VARCHAR(255),
            explorer_url TEXT,
            queue_reason TEXT,
            status VARCHAR(40) NOT NULL DEFAULT 'QUEUED_FOR_L1_DISPATCH',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "CREATE INDEX IF NOT EXISTS idx_l1_payout_wallet ON l1_payout_queue (wallet_address, created_at DESC)",
        r#"
        CREATE TABLE IF NOT EXISTS p2p_orders (
            id VARCHAR(50) PRIMARY KEY,
            seller VARCHAR(255) NOT NULL,
            sell_token VARCHAR(20) NOT NULL,
            sell_amount DOUBLE PRECISION NOT NULL,
            buy_token VARCHAR(20) NOT NULL,
            buy_amount DOUBLE PRECISION NOT NULL,
            rate VARCHAR(50) NOT NULL,
            seller_psbt TEXT,
            status VARCHAR(20) DEFAULT 'open',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS whitelisted_wallets (
            wallet_address VARCHAR(255) PRIMARY KEY,
            label VARCHAR(255) DEFAULT 'Sovereign Miner',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS invite_codes (
            code VARCHAR(64) PRIMARY KEY,
            is_used BOOLEAN NOT NULL DEFAULT FALSE,
            used_by VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS fiat_payout_queue (
            payout_id VARCHAR(80) PRIMARY KEY,
            wallet_address VARCHAR(255) NOT NULL,
            source_type VARCHAR(64) NOT NULL,
            source_asset VARCHAR(20) NOT NULL,
            amount_crypto DOUBLE PRECISION NOT NULL,
            gross_usd DOUBLE PRECISION NOT NULL,
            fee_usd DOUBLE PRECISION NOT NULL,
            hard_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            guaranteed_profit_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            competitor_fee_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            guest_savings_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            net_fiat_usd DOUBLE PRECISION NOT NULL,
            payout_method VARCHAR(20) NOT NULL,
            bank_last4 VARCHAR(10) NOT NULL,
            deposit_address VARCHAR(255),
            changenow_exchange_id VARCHAR(128),
            routing_topology VARCHAR(128),
            confirmations_required INTEGER NOT NULL DEFAULT 6,
            confirmations_current INTEGER NOT NULL DEFAULT 0,
            tx_id VARCHAR(255),
            trace_id VARCHAR(128),
            status VARCHAR(40) DEFAULT 'QUEUED_FOR_TREASURY_DISPATCH',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE fiat_payout_queue ALTER COLUMN source_type TYPE VARCHAR(64)",
        "ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS hard_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS guaranteed_profit_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS competitor_fee_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS guest_savings_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS deposit_address VARCHAR(255)",
        "ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS changenow_exchange_id VARCHAR(128)",
        "ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS routing_topology VARCHAR(128)",
        "ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS confirmations_required INTEGER NOT NULL DEFAULT 6",
        "ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS confirmations_current INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS trace_id VARCHAR(128)",
        "ALTER TABLE fiat_payout_queue ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",
        "CREATE INDEX IF NOT EXISTS idx_fiat_payout_wallet ON fiat_payout_queue (wallet_address, created_at DESC)",
        r#"
        CREATE TABLE IF NOT EXISTS fiat_bank_rails (
            wallet_address VARCHAR(255) PRIMARY KEY,
            bank_label VARCHAR(128) NOT NULL DEFAULT 'Primary Operating Account',
            account_type VARCHAR(32) NOT NULL DEFAULT 'CHECKING',
            payout_method VARCHAR(20) NOT NULL DEFAULT 'ACH',
            bank_last4 VARCHAR(10) NOT NULL,
            encrypted_rail_payload TEXT NOT NULL,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS fiat_onramp_orders (
            order_id VARCHAR(80) PRIMARY KEY,
            wallet_address VARCHAR(255) NOT NULL,
            payment_rail VARCHAR(64) NOT NULL DEFAULT 'STRIPE_ACH_DIRECT_DEBIT',
            payment_method VARCHAR(32) NOT NULL DEFAULT 'ach',
            tier_name VARCHAR(32) NOT NULL DEFAULT 'RETAIL',
            tier_bps INTEGER NOT NULL DEFAULT 85,
            settlement_target VARCHAR(64) NOT NULL DEFAULT 'LEDGER_KAS',
            target_asset VARCHAR(32) NOT NULL DEFAULT 'KAS',
            target_spot_price DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            estimated_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            auto_stake_silo BOOLEAN NOT NULL DEFAULT FALSE,
            quoted_principal_cents BIGINT NOT NULL DEFAULT 0,
            perennia_fee_cents BIGINT NOT NULL DEFAULT 250,
            stripe_gateway_fee_cents BIGINT NOT NULL DEFAULT 0,
            gross_charge_cents BIGINT NOT NULL DEFAULT 0,
            settled_net_cents BIGINT,
            fulfilled_principal_cents BIGINT,
            quarantine_reason TEXT,
            fiat_amount_usd DOUBLE PRECISION NOT NULL,
            fee_usd DOUBLE PRECISION NOT NULL,
            hard_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            guaranteed_profit_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            competitor_fee_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            guest_savings_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            net_usd_converted DOUBLE PRECISION NOT NULL,
            locked_spot_price DOUBLE PRECISION NOT NULL,
            estimated_kas DOUBLE PRECISION NOT NULL,
            delivered_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            wire_memo VARCHAR(80) NOT NULL,
            routing_topology VARCHAR(128),
            wholesale_order_id VARCHAR(96),
            wholesale_withdraw_id VARCHAR(96),
            changenow_exchange_id VARCHAR(128),
            payin_address VARCHAR(255),
            stripe_payment_intent_id VARCHAR(128),
            stripe_onramp_session_id VARCHAR(128),
            bridge_virtual_account_id VARCHAR(128),
            bridge_wire_routing VARCHAR(64),
            bridge_wire_account VARCHAR(64),
            bank_last4 VARCHAR(10),
            master_treasury_fee_usdc DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            post_trade_sweep_json JSONB DEFAULT '{}'::jsonb,
            tx_hash VARCHAR(255),
            status VARCHAR(64) NOT NULL DEFAULT 'AWAITING_WIRE_RECEIPT',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE fiat_onramp_orders ALTER COLUMN payment_rail TYPE VARCHAR(64)",
        "ALTER TABLE fiat_onramp_orders ALTER COLUMN settlement_target TYPE VARCHAR(64)",
        "ALTER TABLE fiat_onramp_orders ALTER COLUMN status TYPE VARCHAR(64)",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(32) NOT NULL DEFAULT 'ach'",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS tier_name VARCHAR(32) NOT NULL DEFAULT 'RETAIL'",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS tier_bps INTEGER NOT NULL DEFAULT 85",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS target_asset VARCHAR(32) NOT NULL DEFAULT 'KAS'",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS target_spot_price DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS estimated_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS auto_stake_silo BOOLEAN NOT NULL DEFAULT FALSE",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS quoted_principal_cents BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS perennia_fee_cents BIGINT NOT NULL DEFAULT 250",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS stripe_gateway_fee_cents BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS gross_charge_cents BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS settled_net_cents BIGINT",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS fulfilled_principal_cents BIGINT",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS quarantine_reason TEXT",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS hard_cost_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS guaranteed_profit_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS competitor_fee_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS guest_savings_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS routing_topology VARCHAR(128)",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS wholesale_order_id VARCHAR(96)",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS wholesale_withdraw_id VARCHAR(96)",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS changenow_exchange_id VARCHAR(128)",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS payin_address VARCHAR(255)",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(128)",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS stripe_onramp_session_id VARCHAR(128)",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS bridge_virtual_account_id VARCHAR(128)",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS bridge_wire_routing VARCHAR(64)",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS bridge_wire_account VARCHAR(64)",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS bank_last4 VARCHAR(10)",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS master_treasury_fee_usdc DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE fiat_onramp_orders ADD COLUMN IF NOT EXISTS post_trade_sweep_json JSONB DEFAULT '{}'::jsonb",
        "CREATE INDEX IF NOT EXISTS idx_fiat_onramp_wallet ON fiat_onramp_orders (wallet_address, created_at DESC)",
        r#"
        CREATE TABLE IF NOT EXISTS fiat_float_ledger (
            ledger_id VARCHAR(64) PRIMARY KEY,
            local_kas_reserve_usd DOUBLE PRECISION NOT NULL DEFAULT 500.0,
            local_kas_target_cap_usd DOUBLE PRECISION NOT NULL DEFAULT 500.0,
            wholesale_api_working_usd DOUBLE PRECISION NOT NULL DEFAULT 400.0,
            wholesale_api_target_cap_usd DOUBLE PRECISION NOT NULL DEFAULT 400.0,
            ratchet_target_cap_usd DOUBLE PRECISION NOT NULL DEFAULT 5000.0,
            commercial_checking_cleared_usd DOUBLE PRECISION NOT NULL DEFAULT 1500.0,
            llc_tax_escrow_reserve_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            dark_pool_lp_vault_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            master_treasury_usdc_reserve DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            phase2_ach_target_usd DOUBLE PRECISION NOT NULL DEFAULT 250000.0,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE fiat_float_ledger ADD COLUMN IF NOT EXISTS master_treasury_usdc_reserve DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE fiat_float_ledger ADD COLUMN IF NOT EXISTS phase2_ach_target_usd DOUBLE PRECISION NOT NULL DEFAULT 250000.0",
        r#"
        CREATE TABLE IF NOT EXISTS fiat_post_trade_sweeps (
            sweep_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            order_id VARCHAR(80) NOT NULL,
            direction VARCHAR(24) NOT NULL DEFAULT 'ONRAMP',
            asset_ticker VARCHAR(32) NOT NULL DEFAULT 'KAS',
            gross_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            wholesale_api_float_sweep_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            chronos_miner_settlement_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            llc_tax_and_rail_reserve_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            net_profit_and_ratchet_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            float_ratchet_reinvest_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            dark_pool_lp_and_owner_draw_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS rwa_oracle_feeds (
            id SERIAL PRIMARY KEY,
            ticker VARCHAR(32) NOT NULL,
            asset_class VARCHAR(40) NOT NULL DEFAULT 'RWA',
            price_usd DOUBLE PRECISION NOT NULL,
            change_24h_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            oracle_source VARCHAR(40) NOT NULL DEFAULT 'PYTH_HERMES',
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE rwa_oracle_feeds ADD COLUMN IF NOT EXISTS change_24h_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "DELETE FROM rwa_oracle_feeds a USING rwa_oracle_feeds b WHERE a.id < b.id AND a.ticker = b.ticker",
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_rwa_oracle_feeds_ticker_unique ON rwa_oracle_feeds (ticker)",
        "CREATE INDEX IF NOT EXISTS idx_rwa_oracle_ticker_updated ON rwa_oracle_feeds (ticker, updated_at DESC)",
        r#"
        CREATE TABLE IF NOT EXISTS worker_profiles (
            worker_identity VARCHAR(255) PRIMARY KEY,
            wallet_address VARCHAR(255) NOT NULL,
            worker_name VARCHAR(128) NOT NULL DEFAULT 'Rig',
            hashrate_ths DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            valid_shares BIGINT NOT NULL DEFAULT 0,
            rejected_shares BIGINT NOT NULL DEFAULT 0,
            acceptance_pct DOUBLE PRECISION NOT NULL DEFAULT 100.0,
            blocks_found BIGINT NOT NULL DEFAULT 0,
            last_share_ts BIGINT NOT NULL DEFAULT 0,
            streak_started_ts BIGINT NOT NULL DEFAULT 0,
            effective_fee_rate DOUBLE PRECISION NOT NULL DEFAULT 0.01,
            status VARCHAR(32) NOT NULL DEFAULT 'online',
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS worker_name VARCHAR(128) NOT NULL DEFAULT 'Rig'",
        "ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS hashrate_ths DOUBLE PRECISION NOT NULL DEFAULT 0.0",
        "ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS valid_shares BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS rejected_shares BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS acceptance_pct DOUBLE PRECISION NOT NULL DEFAULT 100.0",
        "ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS blocks_found BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS last_share_ts BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS streak_started_ts BIGINT NOT NULL DEFAULT 0",
        "ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS effective_fee_rate DOUBLE PRECISION NOT NULL DEFAULT 0.01",
        "ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'online'",
        "ALTER TABLE worker_profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP",
        r#"
        CREATE TABLE IF NOT EXISTS entity_kyc (
            wallet_address VARCHAR(255) PRIMARY KEY,
            legal_name VARCHAR(255) NOT NULL DEFAULT 'ZERO_PII_SOVEREIGN',
            entity_type VARCHAR(64) NOT NULL DEFAULT 'LLC',
            tax_id_hash TEXT NOT NULL DEFAULT 'ZERO_PII_LOCAL_ONLY',
            bank_data_hash TEXT,
            business_address TEXT NOT NULL DEFAULT 'ZERO_PII_LOCAL_ONLY',
            country_code VARCHAR(16) NOT NULL DEFAULT 'US',
            state_region VARCHAR(64) NOT NULL DEFAULT 'TX',
            filing_status VARCHAR(64) NOT NULL DEFAULT 'SINGLE',
            effective_tax_rate DOUBLE PRECISION NOT NULL DEFAULT 15.0,
            verification_status VARCHAR(40) DEFAULT 'verified',
            verified_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS country_code VARCHAR(16) NOT NULL DEFAULT 'US'",
        "ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS state_region VARCHAR(64) NOT NULL DEFAULT 'TX'",
        "ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS filing_status VARCHAR(64) NOT NULL DEFAULT 'SINGLE'",
        "ALTER TABLE entity_kyc ADD COLUMN IF NOT EXISTS effective_tax_rate DOUBLE PRECISION NOT NULL DEFAULT 15.0",
        r#"
        CREATE UNLOGGED TABLE IF NOT EXISTS micro_shares (
            share_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            worker_id VARCHAR(255) NOT NULL,
            difficulty_weight DOUBLE PRECISION NOT NULL,
            kas_value_delta DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            network_diff DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            is_settled BOOLEAN NOT NULL DEFAULT FALSE,
            recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "UPDATE worker_profiles SET worker_identity = worker_id WHERE worker_identity IS NULL OR worker_identity = ''",
        "DELETE FROM worker_profiles a USING worker_profiles b WHERE a.ctid < b.ctid AND a.worker_identity = b.worker_identity",
        "UPDATE worker_profiles SET worker_id = worker_identity WHERE worker_identity IS NOT NULL AND worker_identity != '' AND worker_id != worker_identity",
        r#"
        CREATE TABLE IF NOT EXISTS forge_vesting_schedules (
            vesting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_ticker VARCHAR(32) NOT NULL,
            beneficiary_address VARCHAR(255) NOT NULL,
            creator_address VARCHAR(255) NOT NULL,
            label VARCHAR(128) NOT NULL DEFAULT 'Genesis Tranche',
            total_allocated DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            unlocked_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            claimed_amount DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            cliff_days INTEGER NOT NULL DEFAULT 0,
            linear_days INTEGER NOT NULL DEFAULT 365,
            cliff_unlock_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            full_unlock_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            daily_unlock_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            covenant_rule VARCHAR(64) NOT NULL DEFAULT 'TIMELOCK_ESCROW_COVENANT',
            vprog_state_root VARCHAR(128) NOT NULL DEFAULT '',
            covenant_address VARCHAR(255) NOT NULL DEFAULT '',
            silverscript_source TEXT NOT NULL DEFAULT '',
            redeem_script_hex TEXT NOT NULL DEFAULT '',
            kcc20_state_commitment VARCHAR(128) NOT NULL DEFAULT '',
            token_standard VARCHAR(32) NOT NULL DEFAULT 'KRC-20',
            lock_tx_hash VARCHAR(255),
            status VARCHAR(32) NOT NULL DEFAULT 'LOCKED',
            last_bell_unlocked_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE forge_vesting_schedules ADD COLUMN IF NOT EXISTS covenant_address VARCHAR(255) NOT NULL DEFAULT ''",
        "ALTER TABLE forge_vesting_schedules ADD COLUMN IF NOT EXISTS silverscript_source TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE forge_vesting_schedules ADD COLUMN IF NOT EXISTS redeem_script_hex TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE forge_vesting_schedules ADD COLUMN IF NOT EXISTS kcc20_state_commitment VARCHAR(128) NOT NULL DEFAULT ''",
        "ALTER TABLE forge_vesting_schedules ADD COLUMN IF NOT EXISTS token_standard VARCHAR(32) NOT NULL DEFAULT 'KRC-20'",
        "CREATE INDEX IF NOT EXISTS idx_forge_vesting_ticker ON forge_vesting_schedules (token_ticker, status)",
        r#"
        CREATE TABLE IF NOT EXISTS forge_monetary_policies (
            policy_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_ticker VARCHAR(32) UNIQUE NOT NULL,
            creator_address VARCHAR(255) NOT NULL,
            max_supply DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            burn_rate_bps INTEGER NOT NULL DEFAULT 0,
            burn_address VARCHAR(255) NOT NULL DEFAULT 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
            total_burned_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            emission_schedule_type VARCHAR(48) NOT NULL DEFAULT 'CHROMATIC_HALVING',
            daily_emission_rate DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            halving_interval_days INTEGER NOT NULL DEFAULT 365,
            reserve_locked_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            reserve_emitted_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            zero_rug_lp_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            zero_rug_lock_days INTEGER NOT NULL DEFAULT 365,
            is_retroactive_upgrade BOOLEAN NOT NULL DEFAULT FALSE,
            charter_sha256 VARCHAR(128) NOT NULL DEFAULT '',
            token_standard VARCHAR(32) NOT NULL DEFAULT 'KRC-20',
            kcc20_covenant_id VARCHAR(128) NOT NULL DEFAULT '',
            kcc20_state_root VARCHAR(128) NOT NULL DEFAULT '',
            silverscript_charter_source TEXT NOT NULL DEFAULT '',
            covenant_vault_address VARCHAR(255) NOT NULL DEFAULT '',
            anchor_tx_hash VARCHAR(255),
            last_bell_processed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "ALTER TABLE forge_monetary_policies ADD COLUMN IF NOT EXISTS token_standard VARCHAR(32) NOT NULL DEFAULT 'KRC-20'",
        "ALTER TABLE forge_monetary_policies ADD COLUMN IF NOT EXISTS kcc20_covenant_id VARCHAR(128) NOT NULL DEFAULT ''",
        "ALTER TABLE forge_monetary_policies ADD COLUMN IF NOT EXISTS kcc20_state_root VARCHAR(128) NOT NULL DEFAULT ''",
        "ALTER TABLE forge_monetary_policies ADD COLUMN IF NOT EXISTS silverscript_charter_source TEXT NOT NULL DEFAULT ''",
        "ALTER TABLE forge_monetary_policies ADD COLUMN IF NOT EXISTS covenant_vault_address VARCHAR(255) NOT NULL DEFAULT ''",
        r#"
        CREATE TABLE IF NOT EXISTS forge_mineable_vaults (
            vault_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            token_ticker VARCHAR(32) UNIQUE NOT NULL,
            creator_address VARCHAR(255) NOT NULL,
            vault_label VARCHAR(128) NOT NULL DEFAULT 'Proof-of-Hashrate Mining Vault',
            total_funded_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            remaining_vault_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            daily_emission_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            distributed_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            min_hashrate_ths DOUBLE PRECISION NOT NULL DEFAULT 0.1,
            syndicate_sector_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            active_miners_count INTEGER NOT NULL DEFAULT 0,
            status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
            funding_tx_hash VARCHAR(255),
            last_bell_distributed_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS idempotent_payout_batches (
            batch_id VARCHAR(96) PRIMARY KEY,
            idempotency_key VARCHAR(128) UNIQUE NOT NULL,
            deterministic_txid VARCHAR(128),
            signed_tx_json JSONB,
            total_sompi BIGINT NOT NULL DEFAULT 0,
            recipient_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
            state VARCHAR(48) NOT NULL DEFAULT 'QUEUED',
            daa_score BIGINT,
            retry_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "CREATE INDEX IF NOT EXISTS idx_idempotent_payout_state ON idempotent_payout_batches (state, updated_at ASC)",
        "CREATE INDEX IF NOT EXISTS idx_idempotent_payout_txid ON idempotent_payout_batches (deterministic_txid)",
        r#"
        CREATE TABLE IF NOT EXISTS client_cold_vault_registry (
            wallet_address VARCHAR(255) PRIMARY KEY,
            cold_kaspa_address VARCHAR(255) NOT NULL,
            card_public_key_hex VARCHAR(128) NOT NULL DEFAULT '',
            card_label VARCHAR(128) NOT NULL DEFAULT 'Air-Gapped Hardware Vault',
            signer_mode VARCHAR(40) NOT NULL DEFAULT 'WEB_QR_AIRLOCK',
            overflow_threshold_kas DOUBLE PRECISION NOT NULL DEFAULT 500.0,
            auto_sweep_enabled BOOLEAN NOT NULL DEFAULT TRUE,
            last_sweep_txid VARCHAR(128),
            last_sweep_at TIMESTAMP WITH TIME ZONE,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS treasury_airlock_sweeps (
            sweep_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            hot_wallet_address VARCHAR(255) NOT NULL,
            cold_vault_address VARCHAR(255) NOT NULL,
            swept_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            hot_balance_before_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            hot_balance_after_kas DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            runway_hours_remaining DOUBLE PRECISION NOT NULL DEFAULT 24.0,
            tx_id VARCHAR(128),
            status VARCHAR(48) NOT NULL DEFAULT 'SWEPT_TO_COLD',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS hifo_tax_lots (
            lot_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            wallet_address VARCHAR(255) NOT NULL,
            asset_ticker VARCHAR(32) NOT NULL DEFAULT 'KAS',
            acquired_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            kas_sompi BIGINT NOT NULL DEFAULT 0,
            initial_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            remaining_sompi BIGINT NOT NULL DEFAULT 0,
            remaining_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            fmv_usd_per_token DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            total_cost_basis_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            source_event_type VARCHAR(64) NOT NULL DEFAULT 'YIELD',
            source_tx_hash VARCHAR(255),
            status VARCHAR(32) NOT NULL DEFAULT 'OPEN',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "CREATE INDEX IF NOT EXISTS idx_hifo_lots_wallet_asset ON hifo_tax_lots (wallet_address, asset_ticker, status, fmv_usd_per_token DESC)",
        r#"
        CREATE TABLE IF NOT EXISTS hifo_disposal_matches (
            match_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            disposal_event_id UUID,
            lot_id UUID NOT NULL,
            wallet_address VARCHAR(255) NOT NULL,
            asset_ticker VARCHAR(32) NOT NULL DEFAULT 'KAS',
            disposed_sompi BIGINT NOT NULL DEFAULT 0,
            disposed_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            acquired_at TIMESTAMP WITH TIME ZONE NOT NULL,
            disposed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
            holding_period_days INTEGER NOT NULL DEFAULT 0,
            is_long_term BOOLEAN NOT NULL DEFAULT FALSE,
            cost_basis_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            gross_proceeds_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            realized_gain_loss_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            disposal_tx_hash VARCHAR(255)
        )
        "#,
        "CREATE INDEX IF NOT EXISTS idx_hifo_disposals_wallet ON hifo_disposal_matches (wallet_address, disposed_at DESC)",
        r#"
        CREATE TABLE IF NOT EXISTS token_steering_matrix (
            ticker VARCHAR(32) PRIMARY KEY,
            asset_name VARCHAR(128) NOT NULL DEFAULT '',
            network VARCHAR(32) NOT NULL DEFAULT 'KAS',
            contract_address VARCHAR(255) NOT NULL DEFAULT '',
            steering_state VARCHAR(32) NOT NULL DEFAULT 'AUTO_BALANCE',
            is_whitelisted BOOLEAN NOT NULL DEFAULT TRUE,
            target_weight_pct DOUBLE PRECISION NOT NULL DEFAULT 10.0,
            actual_weight_pct DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            accumulated_fee_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            accumulated_fee_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            updated_by VARCHAR(255) NOT NULL DEFAULT 'SYSTEM_BOOT',
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS security_firewall_blacklist (
            entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            entity_type VARCHAR(32) NOT NULL DEFAULT 'WALLET',
            target_value VARCHAR(255) UNIQUE NOT NULL,
            reason TEXT NOT NULL DEFAULT 'Director Firewall Block',
            active BOOLEAN NOT NULL DEFAULT TRUE,
            added_by VARCHAR(255) NOT NULL DEFAULT 'DIRECTOR',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "CREATE INDEX IF NOT EXISTS idx_security_firewall_active ON security_firewall_blacklist (active, entity_type)",
        r#"
        CREATE TABLE IF NOT EXISTS director_audit_log (
            audit_id BIGSERIAL PRIMARY KEY,
            director_wallet VARCHAR(255) NOT NULL,
            zone VARCHAR(64) NOT NULL DEFAULT 'ZONE_5',
            action_type VARCHAR(96) NOT NULL,
            target_entity VARCHAR(255) NOT NULL DEFAULT '',
            details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        "CREATE INDEX IF NOT EXISTS idx_director_audit_created ON director_audit_log (created_at DESC)",
        r#"
        CREATE TABLE IF NOT EXISTS corporate_expense_vouchers (
            voucher_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            category VARCHAR(64) NOT NULL DEFAULT 'INFRASTRUCTURE',
            vendor_label VARCHAR(128) NOT NULL DEFAULT '',
            amount_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            payment_source VARCHAR(64) NOT NULL DEFAULT 'MERCURY_9901',
            tx_reference VARCHAR(128),
            recorded_by VARCHAR(255) NOT NULL DEFAULT 'DIRECTOR',
            recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
        r#"
        CREATE TABLE IF NOT EXISTS corporate_owner_draws (
            draw_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            director_wallet VARCHAR(255) NOT NULL,
            asset_ticker VARCHAR(32) NOT NULL DEFAULT 'USD',
            amount_tokens DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            amount_usd DOUBLE PRECISION NOT NULL DEFAULT 0.0,
            destination_rail VARCHAR(128) NOT NULL DEFAULT 'MERCURY_9901',
            tx_hash VARCHAR(255),
            recorded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
        "#,
    ];
    for stmt in ddl_statements {
        if let Err(e) = sqlx::query(stmt).execute(pool).await {
            tracing::warn!("Schema bootstrapper statement notice: {}", e);
        }
    }
    let default_whitelist_rows: &[(&str, &str, &str, f64)] = &[
        ("KAS", "Kaspa Native L1", "KAS", 35.0),
        ("USDC", "USD Coin Reserve", "ETH", 20.0),
        ("USDT", "Tether USD Reserve", "ETH", 10.0),
        ("BTC", "Bitcoin L1 Reserve", "BTC", 15.0),
        ("ETH", "Ethereum L1 Reserve", "ETH", 10.0),
        ("SOL", "Solana L1 Reserve", "SOL", 5.0),
        ("SILO", "Perennia Silo Utility (KRC-20)", "KAS", 5.0),
    ];
    for &(ticker, name, net, weight) in default_whitelist_rows {
        let _ = sqlx::query(
            r#"
            INSERT INTO token_steering_matrix (
                ticker, asset_name, network, steering_state, is_whitelisted, target_weight_pct
            ) VALUES ($1, $2, $3, 'AUTO_BALANCE', TRUE, $4)
            ON CONFLICT (ticker) DO NOTHING
            "#,
        )
        .bind(ticker)
        .bind(name)
        .bind(net)
        .bind(weight)
        .execute(pool)
        .await;
    }
    let default_cold_kas = env::var("PERENNIA_MASTER_TREASURY_KAS")
        .or_else(|_| env::var("MASTER_ADMIN_ADDRESS"))
        .or_else(|_| env::var("PERENNIA_COLD_KAS_ADDRESS"))
        .unwrap_or_default();
    let default_hot_ceiling = env::var("PERENNIA_HOT_CEILING_KAS")
        .ok()
        .and_then(|v| v.trim().parse::<f64>().ok())
        .filter(|&v| v > 0.0)
        .unwrap_or(5000.0);
    let default_min_runway = env::var("PERENNIA_MIN_RUNWAY_KAS")
        .ok()
        .and_then(|v| v.trim().parse::<f64>().ok())
        .filter(|&v| v >= 0.0)
        .unwrap_or(250.0);
    let default_fpps_float = env::var("FPPS_MAX_FLOAT_KAS")
        .ok()
        .and_then(|v| v.trim().parse::<f64>().ok())
        .filter(|&v| v > 0.0)
        .unwrap_or(50.0);
    let default_pool_fee = env::var("POOL_FEE_RATE")
        .ok()
        .and_then(|v| v.trim().parse::<f64>().ok())
        .filter(|&v| v >= 0.0 && v < 1.0)
        .unwrap_or(0.01);
    let _ = sqlx::query(
        r#"
        INSERT INTO system_treasury_config (
            config_id, hot_ceiling_kas, min_runway_kas, fpps_max_float_kas,
            pool_fee_rate, outflow_breaker_tripped, cold_kas_address
        ) VALUES ('PRIMARY', $1, $2, $3, $4, FALSE, $5)
        ON CONFLICT (config_id) DO UPDATE SET
            cold_kas_address = CASE
                WHEN system_treasury_config.cold_kas_address = '' THEN EXCLUDED.cold_kas_address
                ELSE system_treasury_config.cold_kas_address
            END
        "#,
    )
    .bind(default_hot_ceiling)
    .bind(default_min_runway)
    .bind(default_fpps_float)
    .bind(default_pool_fee)
    .bind(default_cold_kas.trim())
    .execute(pool)
    .await;
    let _ = sqlx::query(
        r#"
        INSERT INTO fiat_float_ledger (ledger_id)
        VALUES ('BOOTSTRAP_PRIMARY'), ('PRIMARY_FLOAT')
        ON CONFLICT (ledger_id) DO NOTHING
        "#,
    )
    .execute(pool)
    .await;
    if let Ok(seed_invite_code) = env::var("MASTER_BETA_INVITE_CODE") {
        let clean_code = seed_invite_code.trim();
        if !clean_code.is_empty() {
            let _ = sqlx::query(
                r#"
                INSERT INTO invite_codes (code, is_used)
                VALUES ($1, FALSE)
                ON CONFLICT (code) DO NOTHING
                "#,
            )
            .bind(clean_code)
            .execute(pool)
            .await;
        }
    }
    tracing::info!(
        "✅ PostgreSQL Schema Bootstrapper Verified (System Config, 5-State Token Steering Matrix, Security Firewall, Gross-Up Fiat Columns, HMAC Invariants & HIFO Tables Ready)."
    );
    Ok(())
}
```

## File: .gitignore
```
/target/
.env
.env.*
repomix*
*.log
*.pem
*.key
node_modules/
kaspa-keygen/
db/
setup.js
test-wrpc.js

.env*
*.log
*.pem
*.key
kaspa-keygen/
repomix*.xml
```

## File: src/stratum_tcp/mod.rs
```rust
use tokio::net::{TcpListener, TcpStream};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio_util::codec::{FramedRead, LinesCodec, LinesCodecError};
use tokio_stream::StreamExt;
use serde::Deserialize;
use serde_json::json;
use std::sync::Arc;
use tokio::sync::{mpsc, Semaphore};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{Instant, Duration};
use crate::config::StratumConfig;
use crate::job_manager::{JobManager, PendingBlockSubmission, StratumJob, difficulty_from_bits};
use std::net::{Ipv4Addr, Ipv6Addr};
use lazy_static::lazy_static;
use dashmap::{DashMap, DashSet};
use sqlx::PgPool;
pub const MAX_CONSECUTIVE_STRIKES: u32 = 10;
pub const BAN_DURATION_SECS: u64 = 600;
const SOCKET_WINDOW_SECS: u64 = 10;
const MAX_MESSAGES_PER_WINDOW: u32 = 250;
const VARDIFF_GRACE_WINDOW_SECS: u64 = 30;
const ASIC_WARMUP_GRACE_SECS: u64 = 180;
const CLIENT_IDLE_TIMEOUT_SECS: u64 = 540;
const HAPROXY_HEALTHCHECK_SENTINEL: &str = "haproxy-healthcheck";
lazy_static! {
    pub static ref BANNED_IPS: DashMap<String, Instant> = DashMap::new();
    pub static ref STRIKE_COUNTERS: DashMap<String, u32> = DashMap::new();
    pub static ref ACTIVE_EXTRANONCES: DashSet<u16> = DashSet::new();
    pub static ref WORKER_STRATUM_PORTS: DashMap<String, i32> = DashMap::new();
}
pub fn public_stratum_port_for_tier(p: u16) -> i32 { match p { 6551 => 3331, 6552 => 3332, 6553 => 3333, x => x as i32 } }
pub fn resolve_worker_public_port(id: &str) -> i32 { WORKER_STRATUM_PORTS.get(id).map(|v| *v).unwrap_or(3332) }
static WORKER_ID_COUNTER: AtomicU64 = AtomicU64::new(1);
struct ExtranonceGuard {
    slot: u16,
}
impl ExtranonceGuard {
    fn allocate() -> anyhow::Result<Self> {
        for _ in 0..u16::MAX {
            let raw = WORKER_ID_COUNTER.fetch_add(1, Ordering::Relaxed);
            let candidate = ((raw % (u16::MAX as u64)) as u16).max(1);
            if ACTIVE_EXTRANONCES.insert(candidate) {
                return Ok(Self { slot: candidate });
            }
        }
        anyhow::bail!("All 65,535 16-bit extranonce1 slots are currently in use")
    }
    fn to_hex(&self) -> String {
        format!("{:04x}", self.slot)
    }
}
impl Drop for ExtranonceGuard {
    fn drop(&mut self) {
        ACTIVE_EXTRANONCES.remove(&self.slot);
    }
}
#[derive(Deserialize, Debug)]
pub struct RpcRequest {
    pub id: Option<serde_json::Value>,
    pub method: Option<String>,
    pub params: Option<Vec<serde_json::Value>>,
}
fn clamp_to_power_of_2(diff: f64) -> u64 {
    if diff <= 1.0 {
        return 1;
    }
    let next_pow = diff.log2().round() as u32;
    2u64.pow(next_pow)
}
fn is_valid_kaspa_wallet(clean_wallet: &str) -> bool {
    if clean_wallet.len() < 55 || clean_wallet.len() > 75 {
        return false;
    }
    const CHARSET: &str = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
    clean_wallet.chars().all(|c| CHARSET.contains(c))
}
fn is_exempt_local_or_lan_ip(ip: &str) -> bool {
    let clean = ip.trim().to_lowercase();
    clean == "127.0.0.1"
        || clean == "::1"
        || clean == "localhost"
        || clean == HAPROXY_HEALTHCHECK_SENTINEL
        || clean.starts_with("127.")
        || clean.starts_with("192.168.")
        || clean.starts_with("10.")
        || clean.starts_with("172.16.")
        || clean.starts_with("172.17.")
        || clean.starts_with("172.18.")
        || clean.starts_with("172.19.")
        || clean.starts_with("172.2")
        || clean.starts_with("172.30.")
        || clean.starts_with("172.31.")
        || clean.starts_with("::ffff:127.")
        || clean.starts_with("::ffff:192.168.")
        || clean.starts_with("::ffff:10.")
}
fn is_benign_disconnect_io_error(err: &std::io::Error) -> bool {
    matches!(
        err.kind(),
        std::io::ErrorKind::ConnectionReset
            | std::io::ErrorKind::ConnectionAborted
            | std::io::ErrorKind::BrokenPipe
            | std::io::ErrorKind::UnexpectedEof
            | std::io::ErrorKind::TimedOut
    )
}
fn record_socket_strike(peer_ip: &str, worker_identity: &str, reason: &str) -> (u32, bool) {
    let is_local_exempt = is_exempt_local_or_lan_ip(peer_ip);
    let current_ip_strikes = if is_local_exempt {
        0
    } else {
        let mut ip_entry = STRIKE_COUNTERS.entry(peer_ip.to_string()).or_insert(0);
        *ip_entry = ip_entry.saturating_add(1);
        *ip_entry
    };
    let mut worker_strikes = 0u32;
    if !worker_identity.is_empty() {
        let worker_key = format!("worker:{}", worker_identity);
        let mut w_entry = STRIKE_COUNTERS.entry(worker_key).or_insert(0);
        *w_entry = w_entry.saturating_add(1);
        worker_strikes = *w_entry;
    }
    let effective_strikes = current_ip_strikes.max(worker_strikes);
    tracing::warn!(
        "⚠️ [STRATUM SHIELD STRIKE {}/{}] IP: {} | Worker: {} | Reason: {}",
        effective_strikes,
        MAX_CONSECUTIVE_STRIKES,
        peer_ip,
        if worker_identity.is_empty() { "unauthenticated" } else { worker_identity },
        reason
    );
    if effective_strikes >= MAX_CONSECUTIVE_STRIKES {
        STRIKE_COUNTERS.remove(peer_ip);
        if !worker_identity.is_empty() {
            STRIKE_COUNTERS.remove(&format!("worker:{}", worker_identity));
        }
        if is_local_exempt {
            tracing::warn!(
                "🛡️ [STRATUM SHIELD] Worker {} on local/LAN endpoint {} hit {} strikes ({}). Resetting worker connection without banning local proxy IP.",
                if worker_identity.is_empty() { "unauthenticated" } else { worker_identity },
                peer_ip,
                effective_strikes,
                reason
            );
            return (effective_strikes, true);
        }
        BANNED_IPS.insert(peer_ip.to_string(), Instant::now());
        tracing::error!(
            "🔨 [10-STRIKE BAN HAMMER] IP {} (Worker: {}) banned in memory for {}s ({}). Zero DB queries executed.",
            peer_ip,
            if worker_identity.is_empty() { "unauthenticated" } else { worker_identity },
            BAN_DURATION_SECS,
            reason
        );
        return (effective_strikes, true);
    }
    (effective_strikes, false)
}
fn reset_socket_strikes(peer_ip: &str, worker_identity: &str) {
    STRIKE_COUNTERS.remove(peer_ip);
    if !worker_identity.is_empty() {
        STRIKE_COUNTERS.remove(&format!("worker:{}", worker_identity));
    }
}
async fn read_proxy_v2_or_direct(socket: &mut TcpStream, fallback_ip: &str) -> anyhow::Result<String> {
    let mut peek_buf = [0u8; 12];
    const V2_SIG: &[u8; 12] = b"\r\n\r\n\0\r\nQUIT\n";
    let is_proxy_v2 = match tokio::time::timeout(Duration::from_secs(3), socket.peek(&mut peek_buf)).await {
        Ok(Ok(n)) if n >= 12 && &peek_buf == V2_SIG => true,
        Ok(Ok(n)) if n > 0 && n < 12 && &peek_buf[..n] == &V2_SIG[..n] => {
            tokio::time::sleep(Duration::from_millis(25)).await;
            matches!(
                tokio::time::timeout(Duration::from_secs(1), socket.peek(&mut peek_buf)).await,
                Ok(Ok(n2)) if n2 >= 12 && &peek_buf == V2_SIG
            )
        }
        Ok(Ok(n)) if n > 0 => false,
        _ => anyhow::bail!("Timeout or EOF reading initial Stratum stream"),
    };
    if !is_proxy_v2 {
        let strict_proxy = std::env::var("STRICT_PROXY_V2")
            .map(|v| v.trim().eq_ignore_ascii_case("true"))
            .unwrap_or(false);
        if strict_proxy {
            anyhow::bail!("Invalid PROXY protocol v2 signature. Direct connections are forbidden.");
        }
        return Ok(fallback_ip.to_string());
    }
    let mut sig_buf = [0u8; 16];
    tokio::time::timeout(Duration::from_secs(3), socket.read_exact(&mut sig_buf)).await??;
    let ver_cmd = sig_buf[12];
    let fam = sig_buf[13];
    let len = u16::from_be_bytes([sig_buf[14], sig_buf[15]]) as usize;
    if len > 536 {
        anyhow::bail!("PROXY v2 header too large");
    }
    let mut addr_buf = vec![0u8; len];
    if len > 0 {
        tokio::time::timeout(Duration::from_secs(3), socket.read_exact(&mut addr_buf)).await??;
    }
    if (ver_cmd & 0x0F) == 0x00 && fam == 0x00 {
        return Ok(HAPROXY_HEALTHCHECK_SENTINEL.to_string());
    }
    let peer_ip = match fam {
        0x11 | 0x12 if len >= 12 => {
            let ip = Ipv4Addr::new(addr_buf[0], addr_buf[1], addr_buf[2], addr_buf[3]);
            ip.to_string()
        }
        0x21 | 0x22 if len >= 36 => {
            let mut ip_bytes = [0u8; 16];
            ip_bytes.copy_from_slice(&addr_buf[0..16]);
            let ip = Ipv6Addr::from(ip_bytes);
            if let Some(v4) = ip.to_ipv4_mapped() {
                v4.to_string()
            } else {
                ip.to_string()
            }
        }
        _ => fallback_ip.to_string(),
    };
    Ok(peer_ip)
}
pub async fn start_stratum_server(
    config: Arc<StratumConfig>,
    job_manager: Arc<JobManager>,
    valid_share_tx: mpsc::Sender<(String, f64, bool)>,
    pg_pool: PgPool,
    port: u16,
    difficulty: f64,
    throttle_ms: u64,
) -> anyhow::Result<()> {
    let bind_addr = format!("0.0.0.0:{}", port);
    let listener = TcpListener::bind(&bind_addr).await?;
    let connection_limit = Arc::new(Semaphore::new(5000));
    tracing::info!(
        "🛡️ STRATUM TIER ACTIVE ON {} (Diff: {}, Throttle: {}ms, 10-Strike Shield + Security Firewall Armed)",
        bind_addr,
        difficulty,
        throttle_ms
    );
    loop {
        let permit = connection_limit.clone().acquire_owned().await?;
        let (socket, addr) = listener.accept().await?;
        tracing::debug!("🔌 [{}] Hardware connection established to Tier Port {}", addr.ip(), port);
        let config_clone = config.clone();
        let job_manager_clone = job_manager.clone();
        let share_tx_clone = valid_share_tx.clone();
        let pool_clone = pg_pool.clone();
        let haproxy_ip = addr.ip().to_string();
        tokio::spawn(async move {
            let _permit = permit;
            if let Err(e) = handle_worker_connection(
                socket,
                haproxy_ip.clone(),
                config_clone,
                job_manager_clone,
                share_tx_clone,
                pool_clone, port, difficulty, throttle_ms,
            ).await {
                let err_str = e.to_string();
                if err_str.contains("Timeout or EOF reading initial Stratum stream") {
                    tracing::debug!("Probe closed from {}: {}", haproxy_ip, err_str);
                } else {
                    tracing::warn!("🔌 [STRATUM DISCONNECT | :{}] {}", public_stratum_port_for_tier(port), err_str);
                }
            }
        });
    }
}
async fn handle_worker_connection(
    mut socket: TcpStream,
    haproxy_ip: String,
    config: Arc<StratumConfig>,
    job_manager: Arc<JobManager>,
    valid_share_tx: mpsc::Sender<(String, f64, bool)>,
    pg_pool: PgPool,
    port: u16,
    difficulty: f64,
    throttle_ms: u64,
) -> anyhow::Result<()> {
    socket.set_nodelay(true)?;
    let mut peer_addr = read_proxy_v2_or_direct(&mut socket, &haproxy_ip).await?;
    if peer_addr == HAPROXY_HEALTHCHECK_SENTINEL {
        return Ok(());
    }
    if is_exempt_local_or_lan_ip(&peer_addr) {
        BANNED_IPS.remove(&peer_addr);
        STRIKE_COUNTERS.remove(&peer_addr);
    } else if let Some(banned_time) = BANNED_IPS.get(&peer_addr) {
        if banned_time.elapsed() < Duration::from_secs(BAN_DURATION_SECS) {
            tracing::warn!("🛡️ [DDoS SHIELD] Dropping connection from BANNED IP: {}", peer_addr);
            anyhow::bail!("IP is temporarily banned due to 10 consecutive invalid payloads or shares.");
        } else {
            drop(banned_time);
            BANNED_IPS.remove(&peer_addr);
            STRIKE_COUNTERS.remove(&peer_addr);
        }
    }
    let mut job_rx = job_manager.job_tx.subscribe();
    let _extranonce_guard = ExtranonceGuard::allocate()?;
    let extranonce1 = _extranonce_guard.to_hex();
    let initial_tier_diff = clamp_to_power_of_2(difficulty);
    let tier_floor_diff = (initial_tier_diff / 4).max(clamp_to_power_of_2(config.min_share_diff));
    let mut current_diff = initial_tier_diff;
    let mut prev_diff = current_diff;
    let mut last_diff_change_time = Instant::now();
    let connected_at = Instant::now();
    let mut has_submitted_first_share = false;
    let (read_half, mut write_half) = socket.into_split();
    let mut reader = FramedRead::new(read_half, LinesCodec::new_with_max_length(4096));
    let mut handshake_state = 0;
    let mut current_worker_name = String::new();
    let mut share_count = 0;
    let mut last_vardiff_retarget = Instant::now();
    let target_shares_per_min = config.shares_per_min as f64;
    let closed_beta_mode = std::env::var("CLOSED_BETA_MODE")
        .map(|v| v.trim().eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let mut window_start = Instant::now();
    let mut window_msg_count: u32 = 0;
    while handshake_state < 2 {
        let line_timeout = tokio::time::timeout(Duration::from_secs(15), reader.next()).await;
        let line_res = match line_timeout {
            Ok(res) => res,
            Err(_) => anyhow::bail!("EOF - Handshake timeout (Slowloris / Inactive Client Mitigation)"),
        };
        if line_res.is_none() {
            anyhow::bail!("EOF - Client closed connection during handshake");
        }
        let payload_str = match line_res.unwrap() {
            Ok(s) => s,
            Err(LinesCodecError::Io(io_err)) if is_benign_disconnect_io_error(&io_err) => {
                anyhow::bail!("Connection reset by peer during handshake: {}", io_err);
            }
            Err(e) => {
                let (_, banned) = record_socket_strike(
                    &peer_addr,
                    &current_worker_name,
                    &format!("Oversized or non-UTF8 line during handshake ({})", e),
                );
                if banned {
                    anyhow::bail!("10-Strike Ban Hammer triggered during handshake: {}", e);
                }
                anyhow::bail!("Client Payload Violation: {}", e);
            }
        };
        if window_start.elapsed() >= Duration::from_secs(SOCKET_WINDOW_SECS) {
            window_start = Instant::now();
            window_msg_count = 0;
        }
        window_msg_count += 1;
        if window_msg_count > MAX_MESSAGES_PER_WINDOW {
            let (_, banned) = record_socket_strike(&peer_addr, &current_worker_name, "Handshake socket rate-limit exceeded");
            if banned {
                anyhow::bail!("10-Strike Ban Hammer: Socket flood during handshake.");
            }
            continue;
        }
        let trimmed = payload_str.trim_matches('\0').trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with("PROXY ") {
            let parts: Vec<&str> = trimmed.split_whitespace().collect();
            if parts.len() >= 3 && parts[1] != "UNKNOWN" {
                peer_addr = parts[2].to_string();
            }
            continue;
        }
        tracing::debug!("⬇️ [RX | {}] {}", peer_addr, trimmed);
        match serde_json::from_str::<RpcRequest>(trimmed) {
            Ok(req) => {
                let method = req.method.unwrap_or_else(|| "unknown".to_string());
                let req_id = req.id.clone().unwrap_or(serde_json::Value::Null);
                if method == "mining.subscribe" {
                    let sub_json = json!({
                        "id": req_id,
                        "result": [true, "EthereumStratum/1.0.0"],
                        "error": null
                    });
                    let mut response = sub_json.to_string();
                    response.push('\n');
                    write_half.write_all(response.as_bytes()).await?;
                    let en_json = json!({
                        "id": null,
                        "method": "mining.set_extranonce",
                        "params": [extranonce1.clone(), 6]
                    });
                    let mut en_resp = en_json.to_string();
                    en_resp.push('\n');
                    write_half.write_all(en_resp.as_bytes()).await?;
                    if handshake_state < 1 {
                        handshake_state = 1;
                    }
                } else if method == "mining.extranonce.subscribe" {
                    let en_sub_json = json!({
                        "id": req_id,
                        "result": true,
                        "error": null
                    });
                    let mut response = en_sub_json.to_string();
                    response.push('\n');
                    write_half.write_all(response.as_bytes()).await?;
                } else if method == "mining.configure" || method == "mining.multi_version" {
                    let cfg_json = json!({
                        "id": req_id,
                        "result": {},
                        "error": null
                    });
                    let mut response = cfg_json.to_string();
                    response.push('\n');
                    write_half.write_all(response.as_bytes()).await?;
                } else if method == "mining.authorize" {
                    if handshake_state == 0 {
                        let en_json = json!({
                            "id": null,
                            "method": "mining.set_extranonce",
                            "params": [extranonce1.clone(), 6]
                        });
                        let mut en_resp = en_json.to_string();
                        en_resp.push('\n');
                        write_half.write_all(en_resp.as_bytes()).await?;
                    }
                    let mut authorized_ok = false;
                    if let Some(ref params) = req.params {
                        if !params.is_empty() {
                            let mut auth_name = match &params[0] {
                                serde_json::Value::String(s) => s.clone(),
                                v => v.to_string(),
                            }
                            .replace('"', "")
                            .replace('\0', "")
                            .trim()
                            .to_string();
                            if !auth_name.is_empty() {
                                if !auth_name.starts_with("kaspa:") {
                                    auth_name = format!("kaspa:{}", auth_name);
                                }
                                let parts: Vec<&str> = auth_name.split('.').collect();
                                let wallet = if !parts.is_empty() { parts[0] } else { auth_name.as_str() };
                                let clean_wallet = wallet.to_lowercase().replace("kaspa:", "").trim().to_string();
                                let prefixed_wallet = format!("kaspa:{}", clean_wallet);
                                if !is_valid_kaspa_wallet(&clean_wallet) {
                                    let _ = record_socket_strike(&peer_addr, &auth_name, "Malformed Kaspa Bech32m wallet address in mining.authorize");
                                    tracing::warn!(
                                        "🔒 [AUTH REJECTED] Malformed Kaspa wallet address from {}: {}",
                                        peer_addr,
                                        auth_name
                                    );
                                    anyhow::bail!("Invalid Kaspa wallet address format.");
                                }
                                // Check Director Zone 5 Security Firewall Blacklist
                                let is_blacklisted: Option<i32> = sqlx::query_scalar(
                                    r#"
                                    SELECT 1
                                    FROM security_firewall_blacklist
                                    WHERE active = TRUE
                                      AND (
                                          LOWER(target_value) = $1
                                          OR LOWER(target_value) = $2
                                          OR LOWER(target_value) = $3
                                          OR LOWER(target_value) = $4
                                      )
                                    LIMIT 1
                                    "#,
                                )
                                .bind(&clean_wallet)
                                .bind(&prefixed_wallet)
                                .bind(auth_name.to_lowercase())
                                .bind(peer_addr.to_lowercase())
                                .fetch_optional(&pg_pool)
                                .await
                                .ok()
                                .flatten();
                                if is_blacklisted.is_some() {
                                    if !is_exempt_local_or_lan_ip(&peer_addr) {
                                        BANNED_IPS.insert(peer_addr.clone(), Instant::now());
                                    }
                                    tracing::warn!(
                                        "🔨 [FIREWALL BLACKLIST] Dropping Stratum connection from {} ({})",
                                        peer_addr,
                                        auth_name
                                    );
                                    anyhow::bail!("Miner wallet, worker, or IP is blocked by the Perennia Security Firewall.");
                                }
                                if closed_beta_mode {
                                    let is_authorized: Option<i32> = sqlx::query_scalar(
                                        r#"
                                        SELECT 1 FROM whitelisted_wallets WHERE wallet_address = $1 OR wallet_address = $2
                                        UNION
                                        SELECT 1 FROM user_command_centers WHERE wallet_address = $1 OR wallet_address = $2
                                        LIMIT 1
                                        "#,
                                    )
                                    .bind(&clean_wallet)
                                    .bind(&prefixed_wallet)
                                    .fetch_optional(&pg_pool)
                                    .await?;
                                    if is_authorized.is_none() {
                                        let _ = record_socket_strike(&peer_addr, &auth_name, "Unauthorized wallet in Closed Beta");
                                        tracing::warn!(
                                            "🔒 [AUTH REJECTED] Unregistered wallet attempt in Closed Beta from {}: {}",
                                            peer_addr,
                                            auth_name
                                        );
                                        anyhow::bail!("Unregistered wallet. Connection dropped immediately.");
                                    }
                                }
                                current_worker_name = auth_name.clone();
                                authorized_ok = true;
                                WORKER_STRATUM_PORTS.insert(current_worker_name.clone(), public_stratum_port_for_tier(port));
                                reset_socket_strikes(&peer_addr, &current_worker_name);
                                tracing::info!(
                                    "🔑 [{}] Authorized Worker Identity: {} (Extranonce1: {}, Diff: {})",
                                    peer_addr,
                                    current_worker_name,
                                    extranonce1,
                                    current_diff
                                );
                                let pool_bg = pg_pool.clone();
                                let prefixed_bg = prefixed_wallet.clone();
                                tokio::spawn(async move {
                                    let default_state = serde_json::json!({
                                        "workers": [],
                                        "sectors": [{
                                            "id": "DEFAULT-SILO",
                                            "name": "Native L1 Silo",
                                            "allocationPercentage": 100.0,
                                            "routeMode": "hold",
                                            "settlementConfig": {
                                                "targetAsset": {
                                                    "ticker": "KAS",
                                                    "name": "Kaspa",
                                                    "assetClass": "Native L1",
                                                    "spotPrice": 0.0,
                                                    "theme": { "hex": "#18C6A5", "pastel": "#99f6e4" }
                                                },
                                                "payoutAddress": prefixed_bg,
                                                "autoPayout": true,
                                                "mode": "threshold",
                                                "threshold": 50.0,
                                                "appointmentDate": "",
                                                "appointmentTime": "17:00"
                                            },
                                            "pendingKaspa": 0.0,
                                            "width": 12
                                        }],
                                        "manualLps": [],
                                        "systemMode": "base"
                                    });
                                    let _ = sqlx::query("INSERT INTO user_command_centers (wallet_address, layout_state, last_updated) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING")
                                        .bind(prefixed_bg)
                                        .bind(default_state)
                                        .execute(&pool_bg)
                                        .await;
                                });
                            }
                        }
                    }
                    if !authorized_ok {
                        let (_, banned) = record_socket_strike(&peer_addr, &current_worker_name, "Empty params in mining.authorize");
                        if banned {
                            anyhow::bail!("10-Strike Ban Hammer: Empty mining.authorize params.");
                        }
                    } else {
                        let auth_json = json!({
                            "id": req_id,
                            "result": true,
                            "error": null
                        });
                        let mut response = auth_json.to_string();
                        response.push('\n');
                        write_half.write_all(response.as_bytes()).await?;
                        handshake_state = 2;
                    }
                } else {
                    let ack_json = json!({
                        "id": req_id,
                        "result": true,
                        "error": null
                    });
                    let mut response = ack_json.to_string();
                    response.push('\n');
                    write_half.write_all(response.as_bytes()).await?;
                }
            }
            Err(_) => {
                let (_, banned) = record_socket_strike(
                    &peer_addr,
                    &current_worker_name,
                    "Malformed JSON-RPC payload during handshake",
                );
                if banned {
                    anyhow::bail!("10-Strike Ban Hammer: Malformed JSON-RPC flood during handshake.");
                }
            }
        }
    }
    let initial_job = loop {
        if let Ok(cache) = job_manager.cached_job.read() {
            if let Some(job) = &*cache {
                break job.clone();
            }
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    };
    let diff_json = json!({
        "id": null,
        "method": "mining.set_difficulty",
        "params": [current_diff]
    });
    let mut diff_msg = diff_json.to_string();
    diff_msg.push('\n');
    write_half.write_all(diff_msg.as_bytes()).await?;
    write_half.write_all(&initial_job[..]).await?;
    if !initial_job.ends_with(b"\n") {
        write_half.write_all(b"\n").await?;
    }
    let safe_throttle = if throttle_ms == 0 { 10 } else { throttle_ms };
    let mut throttle_interval = tokio::time::interval(Duration::from_millis(safe_throttle));
    throttle_interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut vardiff_interval = tokio::time::interval(Duration::from_secs(30));
    let mut pending_job: Option<StratumJob> = None;
    let mut last_dispatched_job_id = String::new();
    let mut last_client_rx = Instant::now();
    loop {
        tokio::select! {
            job_res = job_rx.recv() => {
                match job_res {
                    Ok(job) => {
                        pending_job = Some(job);
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => {
                        tracing::warn!("⚠️ [{}] Job receiver lagged, gracefully skipping block...", peer_addr);
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => {
                        tracing::error!("❌ [{}] Internal channel closed.", peer_addr);
                        return Ok(());
                    }
                }
            }
            _ = throttle_interval.tick() => {
                if let Some(job) = pending_job.take() {
                    if job.job_id != last_dispatched_job_id {
                        last_dispatched_job_id = job.job_id.clone();
                        let payload = job.payload;
                        if write_half.write_all(&payload[..]).await.is_err() {
                            anyhow::bail!("Write failed - Client disconnected");
                        }
                        if !payload.ends_with(b"\n") {
                            if write_half.write_all(b"\n").await.is_err() {
                                anyhow::bail!("Write failed - Client disconnected");
                            }
                        }
                    }
                }
            }
            _ = vardiff_interval.tick() => {
                if last_client_rx.elapsed() >= Duration::from_secs(CLIENT_IDLE_TIMEOUT_SECS) { anyhow::bail!("[IP: {} | Worker: {} | Diff: {} | Up: {}s] Idle timeout ({}s)", peer_addr, current_worker_name, current_diff, connected_at.elapsed().as_secs(), CLIENT_IDLE_TIMEOUT_SECS); }
                if config.var_diff && last_vardiff_retarget.elapsed().as_secs() >= 60 {
                    if !has_submitted_first_share && connected_at.elapsed().as_secs() < ASIC_WARMUP_GRACE_SECS {
                        last_vardiff_retarget = Instant::now();
                        continue;
                    }
                    let elapsed_mins = last_vardiff_retarget.elapsed().as_secs_f64() / 60.0;
                    let shares_per_min = share_count as f64 / elapsed_mins;
                    let mut new_diff = current_diff;
                    if shares_per_min < target_shares_per_min * 0.5 {
                        new_diff = (current_diff / 2).max(tier_floor_diff);
                    } else if shares_per_min > target_shares_per_min * 2.0 {
                        new_diff = current_diff * 2;
                    }
                    if new_diff != current_diff {
                        prev_diff = current_diff;
                        current_diff = new_diff;
                        last_diff_change_time = Instant::now();
                        let retarget_json = json!({
                            "id": null,
                            "method": "mining.set_difficulty",
                            "params": [current_diff]
                        });
                        let mut retarget_msg = retarget_json.to_string();
                        retarget_msg.push('\n');
                        if write_half.write_all(retarget_msg.as_bytes()).await.is_err() {
                            anyhow::bail!("Write failed - Client disconnected");
                        }
                        if let Some(nb) = job_manager.cached_job.read().ok().and_then(|c| c.clone()) { let _ = write_half.write_all(&nb[..]).await; }
                        tracing::info!("🔄 Auto-Diff Adjusted for {} ({}) -> New Diff: {}", current_worker_name, peer_addr, current_diff);
                    }
                    share_count = 0;
                    last_vardiff_retarget = Instant::now();
                }
            }
            line_res = reader.next() => {
                if line_res.is_none() { anyhow::bail!("[IP: {} | Worker: {} | Diff: {} | Up: {}s] EOF socket closed", peer_addr, current_worker_name, current_diff, connected_at.elapsed().as_secs()); }
                last_client_rx = Instant::now();
                let payload_str = match line_res.unwrap() {
                    Ok(s) => s,
                    Err(LinesCodecError::Io(io_err)) if is_benign_disconnect_io_error(&io_err) => { anyhow::bail!("[IP: {} | Worker: {} | Diff: {} | Up: {}s] Reset: {}", peer_addr, current_worker_name, current_diff, connected_at.elapsed().as_secs(), io_err); }
                    Err(e) => {
                        let (_, banned) = record_socket_strike(&peer_addr, &current_worker_name, "Line codec max length violation");
                        if banned {
                            anyhow::bail!("10-Strike Ban Hammer: Oversized payload flood ({})", e);
                        }
                        anyhow::bail!("Client Payload Violation: {}", e);
                    }
                };
                if window_start.elapsed() >= Duration::from_secs(SOCKET_WINDOW_SECS) {
                    window_start = Instant::now();
                    window_msg_count = 0;
                }
                window_msg_count += 1;
                if window_msg_count > MAX_MESSAGES_PER_WINDOW {
                    let (_, banned) = record_socket_strike(&peer_addr, &current_worker_name, "Socket RPC rate-limit exceeded (>250 msgs/10s)");
                    if banned {
                        anyhow::bail!("10-Strike Ban Hammer: Socket rate-limit exceeded.");
                    }
                    continue;
                }
                let trimmed = payload_str.trim_matches('\0').trim();
                if trimmed.is_empty() {
                    continue;
                }
                match serde_json::from_str::<RpcRequest>(trimmed) {
                    Ok(req) => {
                        let method = req.method.unwrap_or_else(|| "unknown".to_string());
                        let req_id = req.id.clone().unwrap_or(serde_json::Value::Null);
                        if method == "mining.submit" {
                            let Some(ref params) = req.params else {
                                let (_, banned) = record_socket_strike(&peer_addr, &current_worker_name, "Missing params in mining.submit");
                                if banned {
                                    anyhow::bail!("10-Strike Ban Hammer: Missing params in mining.submit.");
                                }
                                continue;
                            };
                            if params.len() < 3 {
                                let (_, banned) = record_socket_strike(&peer_addr, &current_worker_name, "Insufficient params in mining.submit");
                                if banned {
                                    anyhow::bail!("10-Strike Ban Hammer: Malformed mining.submit parameter array.");
                                }
                                continue;
                            }
                            let mut req_worker = match &params[0] {
                                serde_json::Value::String(s) => s.clone(),
                                v => v.to_string(),
                            }
                            .replace('"', "")
                            .replace('\0', "")
                            .trim()
                            .to_string();
                            if !req_worker.is_empty() && !req_worker.starts_with("kaspa:") {
                                req_worker = format!("kaspa:{}", req_worker);
                            }
                            let active_identity = if !req_worker.is_empty() {
                                req_worker.clone()
                            } else if !current_worker_name.is_empty() {
                                current_worker_name.clone()
                            } else {
                                "kaspa:unknown".to_string()
                            };
                            let job_id = match &params[1] {
                                serde_json::Value::String(s) => s.clone(),
                                v => v.to_string(),
                            }
                            .replace('"', "")
                            .replace('\0', "")
                            .trim()
                            .to_lowercase();
                            let nonce_str = match &params[2] {
                                serde_json::Value::String(s) => s.clone(),
                                v => v.to_string(),
                            }
                            .replace('"', "")
                            .replace('\0', "")
                            .trim()
                            .to_string();
                            let clean_nonce = nonce_str.trim_start_matches("0x");
                            let Ok(parsed_base_nonce) = u64::from_str_radix(clean_nonce, 16) else {
                                let (_, banned) = record_socket_strike(&peer_addr, &active_identity, "Non-hexadecimal nonce in mining.submit");
                                let err_reply = json!({
                                    "id": req_id,
                                    "result": false,
                                    "error": [20, "Malformed hex nonce", null]
                                });
                                let mut resp = err_reply.to_string();
                                resp.push('\n');
                                let _ = write_half.write_all(resp.as_bytes()).await;
                                if banned {
                                    anyhow::bail!("10-Strike Ban Hammer: Malformed hex nonce spam.");
                                }
                                continue;
                            };
                            let mut nonce: u64 = parsed_base_nonce;
                            if clean_nonce.len() <= 12 {
                                let full_nonce_hex = format!("{}{:0>12}", extranonce1, clean_nonce);
                                nonce = u64::from_str_radix(&full_nonce_hex, 16).unwrap_or(nonce);
                            }
                            let mut is_accepted = false;
                            let mut err_msg = serde_json::Value::Null;
                            let mut should_ban_disconnect = false;
                            WORKER_STRATUM_PORTS.insert(active_identity.clone(), public_stratum_port_for_tier(port));
                            let resolved_job = job_manager.active_jobs.get(&job_id).map(|e| e.value().clone()).or_else(|| job_manager.active_jobs.get(job_id.trim_start_matches('0')).map(|e| e.value().clone()));
                            if let Some(active_job) = resolved_job {
                                if !job_manager.register_submission(&job_id, nonce) {
                                    tracing::debug!(
                                        "⚠ [{}] Duplicate share packet ignored | Worker: {} | Job: {} | Nonce: {:016x}",
                                        peer_addr,
                                        active_identity,
                                        job_id,
                                        nonce
                                    );
                                    let _ = valid_share_tx.try_send((active_identity.clone(), -1.0, false));
                                    err_msg = json!([22, "Duplicate share", null]);
                                } else {
                                    let consensus_header = active_job.header;
                                    let mut rpc_block = active_job.block;
                                    let actual_network_diff = if active_job.network_diff > 0.0 {
                                        active_job.network_diff
                                    } else {
                                        difficulty_from_bits(consensus_header.bits)
                                    };
                                    let reward_sompi = if active_job.reward_sompi > 0 {
                                        active_job.reward_sompi
                                    } else {
                                        job_manager.get_latest_reward_sompi()
                                    };
                                    let (mut is_valid_share, is_network_block) = crate::diff_engine::verify_share(
                                        &consensus_header,
                                        nonce,
                                        current_diff as f64,
                                    );
                                    let mut credited_diff = current_diff as f64;
                                    if !is_valid_share
                                        && prev_diff < current_diff
                                        && last_diff_change_time.elapsed() < Duration::from_secs(VARDIFF_GRACE_WINDOW_SECS)
                                    {
                                        let (valid_at_prev, _) = crate::diff_engine::verify_share(
                                            &consensus_header,
                                            nonce,
                                            prev_diff as f64,
                                        );
                                        if valid_at_prev {
                                            is_valid_share = true;
                                            credited_diff = prev_diff as f64;
                                        }
                                    }
                                    if is_network_block {
                                        let mut final_header = consensus_header.clone();
                                        final_header.nonce = nonce;
                                        let block_hash = kaspa_consensus_core::hashing::header::hash(&final_header).to_string();
                                        has_submitted_first_share = true;
                                        share_count += 1;
                                        let _ = valid_share_tx.try_send((active_identity.clone(), credited_diff, false));
                                        is_accepted = true;
                                        reset_socket_strikes(&peer_addr, &active_identity);
                                        if job_manager.register_block_hash(&block_hash) {
                                            tracing::info!(
                                                "💎💎💎 [{}] CANDIDATE NETWORK BLOCK ACQUIRED! Hash: {} | Nonce: {:016x} | NetDiff: {:.2}",
                                                peer_addr,
                                                block_hash,
                                                nonce,
                                                actual_network_diff
                                            );
                                            if let Some(ref mut rpc_header) = rpc_block.header {
                                                rpc_header.nonce = nonce;
                                            }
                                            let submission = PendingBlockSubmission {
                                                block: rpc_block,
                                                block_hash,
                                                worker: active_identity.clone(),
                                                nonce,
                                                network_diff: actual_network_diff,
                                                reward_sompi,
                                            };
                                            let _ = job_manager.block_submit_tx.try_send(submission);
                                        } else {
                                            tracing::warn!(
                                                "⚠ [{}] Duplicate candidate block hash {} suppressed.",
                                                peer_addr,
                                                block_hash
                                            );
                                        }
                                    } else if is_valid_share {
                                        tracing::debug!(
                                            "✅ [{}] TIER SHARE ACCEPTED | Worker: {} | Job: {} | Diff: {}",
                                            peer_addr,
                                            active_identity,
                                            job_id,
                                            credited_diff
                                        );
                                        has_submitted_first_share = true;
                                        share_count += 1;
                                        let _ = valid_share_tx.try_send((active_identity.clone(), credited_diff, false));
                                        is_accepted = true;
                                        reset_socket_strikes(&peer_addr, &active_identity);
                                    } else {
                                        tracing::warn!("🚫 [{}] INVALID SHARE | Worker: {}", peer_addr, active_identity);
                                        let _ = valid_share_tx.try_send((active_identity.clone(), -1.0, false));
                                        err_msg = json!([20, "Invalid share", null]);
                                        let (_, banned) = record_socket_strike(&peer_addr, &active_identity, "Invalid PoW share");
                                        should_ban_disconnect = banned;
                                    }
                                }
                            } else {
                                tracing::debug!("⏳ [{}] Stale job share ignored (10 BPS rotation): {}", peer_addr, job_id);
                                let _ = valid_share_tx.try_send((active_identity.clone(), -1.0, false));
                                err_msg = json!([21, "Stale job", null]);
                            }
                            let submit_reply = if is_accepted {
                                json!({
                                    "id": req_id,
                                    "result": true,
                                    "error": null
                                })
                            } else {
                                json!({
                                    "id": req_id,
                                    "result": false,
                                    "error": err_msg
                                })
                            };
                            let mut response = submit_reply.to_string();
                            response.push('\n');
                            if write_half.write_all(response.as_bytes()).await.is_err() {
                                anyhow::bail!("Write failed - Client disconnected");
                            }
                            if should_ban_disconnect {
                                anyhow::bail!(
                                    "Disconnecting worker {} ({}): 10 consecutive invalid shares.",
                                    active_identity,
                                    peer_addr
                                );
                            }
                        } else {
                            let catch_json = json!({
                                "id": req_id,
                                "result": true,
                                "error": null
                            });
                            let mut response = catch_json.to_string();
                            response.push('\n');
                            if write_half.write_all(response.as_bytes()).await.is_err() {
                                anyhow::bail!("Write failed - Client disconnected");
                            }
                        }
                    }
                    Err(_) => {
                        let (_, banned) = record_socket_strike(
                            &peer_addr,
                            &current_worker_name,
                            "Malformed JSON-RPC payload on Stratum socket",
                        );
                        if banned {
                            anyhow::bail!("10-Strike Ban Hammer: Malformed JSON-RPC flood.");
                        }
                    }
                }
            }
        }
    }
}
```

## File: src/telemetry/mod.rs
```rust
use prometheus::{GaugeVec, IntCounterVec, Opts, Registry, TextEncoder, Encoder};
use lazy_static::lazy_static;
use tokio::net::TcpListener;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::sync::mpsc;
use std::collections::{HashMap, HashSet, VecDeque};
use serde_json::{json, Value};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use std::env;
use sqlx::Row;
const KASPA_DIFF_CONSTANT: f64 = 4_294_967_296.0;
const DEFAULT_FPPS_MAX_HOUSE_FLOAT_KAS: f64 = 50.0;
const DEFAULT_COINBASE_MATURITY_DAA: i64 = 1_000;
const LAYOUT_CACHE_TTL: Duration = Duration::from_secs(5);
pub const BASE_POOL_FEE_RATE: f64 = 0.01;
pub const MIN_POOL_FEE_RATE: f64 = 0.005;
pub const WEEKLY_FEE_DECAY_RATE: f64 = 0.0005;
pub const SECONDS_PER_WEEK: u64 = 604_800;
pub const DISCONNECT_GRACE_WINDOW_SECS: u64 = 7_200;
pub const DISCONNECT_GRACE_WINDOW_MS: u64 = 7_200_000;
pub const MAINTENANCE_SHIELD_GRACE_WINDOW_SECS: u64 = 86_400;
pub const MAINTENANCE_SHIELD_GRACE_WINDOW_MS: u64 = 86_400_000;
pub const MINER_PERK_SWAP_FEE_FLOOR_RATE: f64 = 0.001;
lazy_static! {
    pub static ref REGISTRY: Registry = Registry::new();
    pub static ref WORKER_HASHRATE: GaugeVec = GaugeVec::new(
        Opts::new("ks_worker_hashrate", "Strictly verified unsimulated hashrate per worker in TH/s"),
        &["worker"]
    ).expect("Metric setup failed");
    pub static ref WORKER_SHARES: IntCounterVec = IntCounterVec::new(
        Opts::new("ks_worker_shares", "Cryptographically validated shares per worker"),
        &["worker", "type"]
    ).expect("Metric setup failed");
}
pub fn init_telemetry() {
    REGISTRY.register(Box::new(WORKER_HASHRATE.clone())).unwrap();
    REGISTRY.register(Box::new(WORKER_SHARES.clone())).unwrap();
}
pub fn compute_miner_loyalty_fee_rate(
    streak_started_ms: u64,
    now_ms: u64,
    configured_base_fee_rate: f64,
) -> (u64, f64) {
    let base_rate = configured_base_fee_rate.clamp(MIN_POOL_FEE_RATE, 0.05);
    if streak_started_ms == 0 || now_ms <= streak_started_ms {
        return (0, base_rate);
    }
    let elapsed_secs = now_ms.saturating_sub(streak_started_ms) / 1000;
    let consecutive_weeks = elapsed_secs / SECONDS_PER_WEEK;
    let discount = (consecutive_weeks as f64) * WEEKLY_FEE_DECAY_RATE;
    let effective_rate = (base_rate - discount).max(MIN_POOL_FEE_RATE);
    let rounded_rate = (effective_rate * 100_000.0).round() / 100_000.0;
    (consecutive_weeks, rounded_rate)
}
pub async fn start_prometheus_exporter(_bind_addr: String) {
    let addr = "0.0.0.0:8081";
    let listener = TcpListener::bind(addr).await.expect("Failed to bind Prometheus port");
    tracing::info!("📊 Zero-Simulation Telemetry exporter natively active on http://{}/metrics", addr);
    loop {
        if let Ok((mut socket, _)) = listener.accept().await {
            tokio::spawn(async move {
                let mut buf = [0; 1024];
                let _ = socket.read(&mut buf).await;
                let mut buffer = vec![];
                let encoder = TextEncoder::new();
                let metric_families = REGISTRY.gather();
                encoder.encode(&metric_families, &mut buffer).unwrap();
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/plain; version=0.0.4\r\nContent-Length: {}\r\n\r\n{}",
                    buffer.len(),
                    String::from_utf8_lossy(&buffer)
                );
                let _ = socket.write_all(response.as_bytes()).await;
            });
        }
    }
}
struct WorkerState {
    last_share_ts: u64,
    streak_started_ts: u64,
    effective_fee_rate: f64,
    share_history: VecDeque<(u64, f64)>,
    shares_contributed: f64,
    valid_share_count: u64,
    rejected_share_count: u64,
    blocks_found: u64,
    unflushed_difficulty: f64,
    unflushed_blocks: u64,
}
#[derive(Clone)]
struct WorkerDbSnapshot {
    full_identity: String,
    wallet_address: String,
    worker_name: String,
    hashrate_ths: f64,
    valid_shares: i64,
    rejected_shares: i64,
    acceptance_pct: f64,
    blocks_found: i64,
    last_share_ts: i64,
    streak_started_ts: i64,
    effective_fee_rate: f64,
    status: String,
}
struct CachedSectorLayout {
    layout_state: Value,
    fetched_at: Instant,
}
fn normalize_timestamp_ms(raw_ts: i64, fallback_ms: u64) -> u64 {
    if raw_ts <= 0 {
        return fallback_ms;
    }
    let val = raw_ts as u64;
    if val < 10_000_000_000 {
        val.saturating_mul(1000)
    } else {
        val
    }
}
pub async fn start_accounting_engine(mut valid_share_rx: mpsc::Receiver<(String, f64, bool)>) {
    tracing::info!("🏦 Institutional Accounting, Miner Loyalty Decay (1.0% -> 0.5%, 2h Grace + Maintenance Shield) & Elastic Solvency-Gated FPPS Engine Booted...");
    let redis_url = env::var("REDIS_URL")
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "redis://127.0.0.1/".to_string());
    let redis_client = redis::Client::open(redis_url).expect("Redis connection failed");
    let mut redis_conn = match redis_client.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(e) => {
            tracing::error!("❌ CRITICAL: Could not connect to Redis for Accounting! {}", e);
            return;
        }
    };
    let pg_url = env::var("DATABASE_URL")
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|_| "postgres://postgres:password@127.0.0.1:5432/perennia".to_string());
    let pg_pool = match sqlx::postgres::PgPoolOptions::new()
        .max_connections(5)
        .connect(&pg_url)
        .await
    {
        Ok(pool) => pool,
        Err(e) => {
            tracing::error!("❌ CRITICAL: Failed to connect to Postgres! Yield splitting will fail. {}", e);
            return;
        }
    };
    let pool_fee_rate: f64 = env::var("POOL_FEE_RATE")
        .ok()
        .and_then(|v| v.trim().parse::<f64>().ok())
        .filter(|&v| v >= MIN_POOL_FEE_RATE && v < 1.0)
        .unwrap_or(BASE_POOL_FEE_RATE);
    let max_house_float_kas: f64 = env::var("FPPS_MAX_FLOAT_KAS")
        .ok()
        .and_then(|v| v.trim().parse::<f64>().ok())
        .filter(|&v| v > 0.0)
        .unwrap_or(DEFAULT_FPPS_MAX_HOUSE_FLOAT_KAS);
    let coinbase_maturity_daa: i64 = env::var("COINBASE_MATURITY_DAA")
        .ok()
        .and_then(|v| v.trim().parse::<i64>().ok())
        .filter(|&v| v >= 100)
        .unwrap_or(DEFAULT_COINBASE_MATURITY_DAA);
    let corp_kas_clean = crate::chronos::resolve_master_treasury_address();
    let mut flush_interval = tokio::time::interval(Duration::from_millis(1000));
    let mut worker_states: HashMap<String, WorkerState> = HashMap::new();
    let mut sector_layout_cache: HashMap<String, CachedSectorLayout> = HashMap::new();
    let mut maintenance_grace_shield_active = false;
    let mut blacklisted_wallets_cache: HashSet<String> = HashSet::new();
    let mut blacklisted_workers_cache: HashSet<String> = HashSet::new();
    let boot_now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    if let Ok(existing_workers) = sqlx::query(
        r#"
        SELECT COALESCE(NULLIF(worker_identity, ''), worker_id) AS worker_identity, valid_shares, rejected_shares, blocks_found,
               last_share_ts, COALESCE(streak_started_ts, 0) AS streak_started_ts,
               COALESCE(effective_fee_rate, 0.01) AS effective_fee_rate
        FROM worker_profiles
        WHERE last_share_ts > 0
        "#,
    )
    .fetch_all(&pg_pool)
    .await
    {
        for r in existing_workers {
            let id: String = r.try_get("worker_identity").unwrap_or_default();
            if id.is_empty() {
                continue;
            }
            let raw_last_ts: i64 = r.try_get("last_share_ts").unwrap_or(0);
            let last_ms = normalize_timestamp_ms(raw_last_ts, boot_now_ms);
            if boot_now_ms.saturating_sub(last_ms) <= MAINTENANCE_SHIELD_GRACE_WINDOW_MS {
                let raw_streak_ts: i64 = r.try_get("streak_started_ts").unwrap_or(raw_last_ts);
                let streak_ms = normalize_timestamp_ms(raw_streak_ts, last_ms);
                let (_, eff_fee) =
                    compute_miner_loyalty_fee_rate(streak_ms, boot_now_ms, pool_fee_rate);
                let valid_sh = r.try_get::<i64, _>("valid_shares").unwrap_or(0).max(0) as u64;
                let rej_sh = r.try_get::<i64, _>("rejected_shares").unwrap_or(0).max(0) as u64;
                let blks = r.try_get::<i64, _>("blocks_found").unwrap_or(0).max(0) as u64;
                worker_states.insert(
                    id,
                    WorkerState {
                        last_share_ts: last_ms,
                        streak_started_ts: streak_ms,
                        effective_fee_rate: eff_fee,
                        share_history: VecDeque::new(),
                        shares_contributed: valid_sh as f64,
                        valid_share_count: valid_sh,
                        rejected_share_count: rej_sh,
                        blocks_found: blks,
                        unflushed_difficulty: 0.0,
                        unflushed_blocks: 0,
                    },
                );
            }
        }
    }
    let mut cached_l1_blocks_won_kas: f64 = 0.0;
    let mut cached_immature_blocks_kas: f64 = 0.0;
    let mut cached_total_blocks_count: i64 = 0;
    let mut tick_counter: u64 = 0;
    let mut pending_micro_shares: Vec<(String, f64, f64)> = Vec::new();
    loop {
        tokio::select! {
            Some((full_worker_name, difficulty, is_network_block)) = valid_share_rx.recv() => {
                let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
                let active_grace_ms = if maintenance_grace_shield_active {
                    MAINTENANCE_SHIELD_GRACE_WINDOW_MS
                } else {
                    DISCONNECT_GRACE_WINDOW_MS
                };
                let state = worker_states.entry(full_worker_name.clone()).or_insert_with(|| WorkerState {
                    last_share_ts: now,
                    streak_started_ts: now,
                    effective_fee_rate: pool_fee_rate,
                    share_history: VecDeque::new(),
                    shares_contributed: 0.0,
                    valid_share_count: 0,
                    rejected_share_count: 0,
                    blocks_found: 0,
                    unflushed_difficulty: 0.0,
                    unflushed_blocks: 0,
                });
                if difficulty > 0.0 {
                    if !maintenance_grace_shield_active
                        && (now.saturating_sub(state.last_share_ts) > active_grace_ms
                            || state.streak_started_ts == 0)
                    {
                        state.streak_started_ts = now;
                    } else if state.streak_started_ts == 0 {
                        state.streak_started_ts = now;
                    }
                    let (_, eff_rate) = compute_miner_loyalty_fee_rate(
                        state.streak_started_ts,
                        now,
                        pool_fee_rate,
                    );
                    state.effective_fee_rate = eff_rate;
                    state.share_history.push_back((now, difficulty));
                    state.last_share_ts = now;
                    state.shares_contributed += difficulty;
                    state.valid_share_count += 1;
                    state.unflushed_difficulty += difficulty;
                    pending_micro_shares.push((full_worker_name.clone(), difficulty, eff_rate));
                    WORKER_SHARES.with_label_values(&[&full_worker_name, "valid"]).inc_by(difficulty as u64);
                } else if difficulty < 0.0 {
                    state.rejected_share_count += 1;
                    WORKER_SHARES.with_label_values(&[&full_worker_name, "rejected"]).inc();
                }
                if is_network_block {
                    state.blocks_found += 1;
                    state.unflushed_blocks += 1;
                    WORKER_SHARES.with_label_values(&[&full_worker_name, "block"]).inc();
                }
            }
            _ = flush_interval.tick() => {
                tick_counter = tick_counter.wrapping_add(1);
                let now = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis() as u64;
                let now_secs = now / 1000;
                if tick_counter % 5 == 1 {
                    let shield_str: Option<String> = redis::cmd("GET")
                        .arg("perennia:stratum:maintenance_grace_shield")
                        .query_async(&mut redis_conn)
                        .await
                        .unwrap_or(None);
                    maintenance_grace_shield_active = shield_str
                        .map(|s| s.trim() == "1" || s.trim().eq_ignore_ascii_case("true"))
                        .unwrap_or(false);
                    if let Ok(blk_wallets) = redis::cmd("SMEMBERS")
                        .arg("perennia:firewall:blacklisted_wallets")
                        .query_async::<_, Vec<String>>(&mut redis_conn)
                        .await
                    {
                        blacklisted_wallets_cache = blk_wallets
                            .into_iter()
                            .map(|w| w.trim().to_lowercase().replace("kaspa:", ""))
                            .collect();
                    }
                    if let Ok(blk_workers) = redis::cmd("SMEMBERS")
                        .arg("perennia:firewall:blacklisted_workers")
                        .query_async::<_, Vec<String>>(&mut redis_conn)
                        .await
                    {
                        blacklisted_workers_cache = blk_workers
                            .into_iter()
                            .map(|w| w.trim().to_lowercase())
                            .collect();
                    }
                }
                let active_grace_window_ms = if maintenance_grace_shield_active {
                    MAINTENANCE_SHIELD_GRACE_WINDOW_MS
                } else {
                    DISCONNECT_GRACE_WINDOW_MS
                };
                let active_grace_window_secs = if maintenance_grace_shield_active {
                    MAINTENANCE_SHIELD_GRACE_WINDOW_SECS
                } else {
                    DISCONNECT_GRACE_WINDOW_SECS
                };
                let net_diff_str: Option<String> = redis::cmd("GET")
                    .arg("pool:network_diff")
                    .query_async(&mut redis_conn)
                    .await
                    .unwrap_or(None);
                let net_diff = net_diff_str
                    .and_then(|s| s.parse::<f64>().ok())
                    .filter(|&v| v > 0.0)
                    .unwrap_or(0.0);
                let reward_str: Option<String> = redis::cmd("GET")
                    .arg("pool:block_reward")
                    .query_async(&mut redis_conn)
                    .await
                    .unwrap_or(None);
                let block_reward = reward_str
                    .and_then(|s| s.parse::<f64>().ok())
                    .filter(|&v| v > 0.0)
                    .unwrap_or(0.0);
                let virtual_daa_str: Option<String> = redis::cmd("GET")
                    .arg("pool:virtual_daa_score")
                    .query_async(&mut redis_conn)
                    .await
                    .unwrap_or(None);
                let current_virtual_daa = virtual_daa_str
                    .and_then(|s| s.parse::<i64>().ok())
                    .unwrap_or(0);
                if tick_counter % 5 == 1 {
                    if let Ok(row) = sqlx::query(
                        r#"
                        SELECT
                            COUNT(*)::BIGINT AS total_blocks_count,
                            COALESCE(SUM(CASE
                                WHEN (
                                    ($1 > $2 AND COALESCE(daa_score, 0) > 0 AND ($1 - COALESCE(daa_score, 0)) >= $2)
                                    OR (COALESCE(daa_score, 0) = 0 AND discovered_at <= CURRENT_TIMESTAMP - INTERVAL '120 seconds')
                                    OR ($1 <= $2 AND discovered_at <= CURRENT_TIMESTAMP - INTERVAL '120 seconds')
                                ) THEN reward_kas
                                ELSE 0.0
                            END), 0.0) AS matured_blocks_kas,
                            COALESCE(SUM(CASE
                                WHEN NOT (
                                    ($1 > $2 AND COALESCE(daa_score, 0) > 0 AND ($1 - COALESCE(daa_score, 0)) >= $2)
                                    OR (COALESCE(daa_score, 0) = 0 AND discovered_at <= CURRENT_TIMESTAMP - INTERVAL '120 seconds')
                                    OR ($1 <= $2 AND discovered_at <= CURRENT_TIMESTAMP - INTERVAL '120 seconds')
                                ) THEN reward_kas
                                ELSE 0.0
                            END), 0.0) AS immature_blocks_kas
                        FROM network_blocks
                        WHERE COALESCE(is_orphaned, false) = false
                        "#
                    )
                    .bind(current_virtual_daa)
                    .bind(coinbase_maturity_daa)
                    .fetch_one(&pg_pool)
                    .await
                    {
                        cached_total_blocks_count = row.try_get::<i64, _>("total_blocks_count").unwrap_or(0);
                        cached_l1_blocks_won_kas = row.try_get::<f64, _>("matured_blocks_kas").unwrap_or(0.0).max(0.0);
                        cached_immature_blocks_kas = row.try_get::<f64, _>("immature_blocks_kas").unwrap_or(0.0).max(0.0);
                    }
                }
                if tick_counter % 60 == 0 {
                    sector_layout_cache.retain(|_, entry| entry.fetched_at.elapsed() < Duration::from_secs(60));
                }
                let ext_streamed_str: Option<String> = redis::cmd("GET")
                    .arg("perennia:pool:external_streamed_kas")
                    .query_async(&mut redis_conn)
                    .await
                    .unwrap_or(None);
                let mut total_external_streamed_kas = ext_streamed_str
                    .and_then(|s| s.parse::<f64>().ok())
                    .unwrap_or(0.0)
                    .max(0.0);
                let total_solvency_ceiling_kas = cached_l1_blocks_won_kas + max_house_float_kas;
                let mut available_headroom_kas = (total_solvency_ceiling_kas - total_external_streamed_kas).max(0.0);
                let soft_knee_kas = (max_house_float_kas * 0.50).max(1.0);
                let elastic_streaming_factor = if available_headroom_kas >= soft_knee_kas {
                    1.0
                } else {
                    (available_headroom_kas / soft_knee_kas).clamp(0.0, 1.0)
                };
                let epoch_telemetry_raw: Option<String> = redis::cmd("GET")
                    .arg("perennia:settlement:epoch_telemetry")
                    .query_async(&mut redis_conn)
                    .await
                    .unwrap_or(None);
                let mut epoch_telemetry_val: Value = epoch_telemetry_raw
                    .and_then(|s| serde_json::from_str::<Value>(&s).ok())
                    .unwrap_or_else(|| json!({}));
                let (current_epoch_bell_ts, next_epoch_bell_ts, seconds_remaining) =
                    crate::chronos::compute_jerusalem_epoch_window(now_secs);
                if let Some(obj) = epoch_telemetry_val.as_object_mut() {
                    obj.insert("anchorUtcHour".to_string(), json!(22));
                    obj.insert("anchorLabel".to_string(), json!("22:00 UTC Global Settlement"));
                    obj.insert("currentEpochBellTs".to_string(), json!(current_epoch_bell_ts));
                    obj.insert("nextEpochBellTs".to_string(), json!(next_epoch_bell_ts));
                    obj.insert("secondsRemaining".to_string(), json!(seconds_remaining));
                }
                let can_calculate_yields = net_diff > 0.0 && block_reward > 0.0;
                let mut pipeline = redis::pipe();
                let mut total_hashrate = 0.0;
                let mut workers_array = Vec::new();
                let mut keys_to_remove = Vec::new();
                let mut yield_updates_to_publish = Vec::new();
                let mut streamed_kas_by_wallet: HashMap<String, f64> = HashMap::new();
                let mut wallet_hashrate_ths_map: HashMap<String, f64> = HashMap::new();
                let mut wallet_best_loyalty_map: HashMap<String, (u64, u64, f64, bool, u64)> = HashMap::new();
                let mut db_worker_snapshots: Vec<WorkerDbSnapshot> = Vec::new();
                let cutoff_300s = now.saturating_sub(300_000);
                let cutoff_60s = now.saturating_sub(60_000);
                if !worker_states.is_empty() {
                    for (full_worker, state) in worker_states.iter_mut() {
                        let dt_idle_ms = now.saturating_sub(state.last_share_ts);
                        let dt_idle = (dt_idle_ms as f64) / 1000.0;
                        while let Some(&(ts, _)) = state.share_history.front() {
                            if ts < cutoff_300s {
                                state.share_history.pop_front();
                            } else {
                                break;
                            }
                        }
                        let mut work_60s = 0.0;
                        let mut work_300s = 0.0;
                        let mut oldest_ts = now;
                        for &(ts, diff) in state.share_history.iter() {
                            let work = diff * KASPA_DIFF_CONSTANT;
                            work_300s += work;
                            if ts >= cutoff_60s {
                                work_60s += work;
                            }
                            if ts < oldest_ts {
                                oldest_ts = ts;
                            }
                        }
                        let mut elapsed_total = ((now - oldest_ts) as f64) / 1000.0;
                        if elapsed_total < 1.0 {
                            elapsed_total = 1.0;
                        }
                        let mut elapsed_60s = elapsed_total.min(60.0);
                        if elapsed_60s < 1.0 {
                            elapsed_60s = 1.0;
                        }
                        let hr_300s = work_300s / elapsed_total;
                        let hr_60s = work_60s / elapsed_60s;
                        let current_hashrate = if state.share_history.is_empty() {
                            0.0
                        } else {
                            (hr_60s * 0.4) + (hr_300s * 0.6)
                        };
                        let is_online = current_hashrate > 0.0 || dt_idle < 60.0;
                        let within_grace_window =
                            maintenance_grace_shield_active || dt_idle_ms <= active_grace_window_ms;
                        let total_attempts = state.valid_share_count + state.rejected_share_count;
                        let acceptance_pct = if total_attempts > 0 {
                            ((state.valid_share_count as f64 / total_attempts as f64) * 100.0).clamp(0.0, 100.0)
                        } else {
                            100.0
                        };
                        let parts: Vec<&str> = full_worker.split('.').collect();
                        let wallet_address = if !parts.is_empty() { parts[0] } else { full_worker.as_str() };
                        let worker_name = if parts.len() > 1 {
                            parts[1..].join(".")
                        } else {
                            full_worker.to_string()
                        };
                        let clean_wallet = wallet_address
                            .to_lowercase()
                            .replace("kaspa:", "")
                            .trim()
                            .to_string();
                        let is_blacklisted = blacklisted_wallets_cache.contains(&clean_wallet)
                            || blacklisted_workers_cache.contains(&full_worker.to_lowercase())
                            || blacklisted_workers_cache.contains(&worker_name.to_lowercase());
                        if is_blacklisted {
                            state.unflushed_difficulty = 0.0;
                            continue;
                        }
                        if !is_online && !within_grace_window {
                            // 2-hour disconnect grace window expired -> reset streak & evict
                            keys_to_remove.push(full_worker.clone());
                            state.streak_started_ts = 0;
                            state.effective_fee_rate = pool_fee_rate;
                            WORKER_HASHRATE.with_label_values(&[full_worker]).set(0.0);
                            pipeline
                                .cmd("SET")
                                .arg(format!("worker:{}:hashrate", full_worker))
                                .arg(0.0)
                                .ignore();
                            pipeline
                                .cmd("SREM")
                                .arg("pool:workers")
                                .arg(full_worker.clone())
                                .ignore();
                            db_worker_snapshots.push(WorkerDbSnapshot {
                                full_identity: full_worker.clone(),
                                wallet_address: wallet_address.to_string(),
                                worker_name,
                                hashrate_ths: 0.0,
                                valid_shares: state.valid_share_count as i64,
                                rejected_shares: state.rejected_share_count as i64,
                                acceptance_pct,
                                blocks_found: state.blocks_found as i64,
                                last_share_ts: state.last_share_ts as i64,
                                streak_started_ts: 0,
                                effective_fee_rate: pool_fee_rate,
                                status: "offline".to_string(),
                            });
                        } else if !is_online && within_grace_window {
                            let (consecutive_weeks, eff_fee_rate) = compute_miner_loyalty_fee_rate(
                                state.streak_started_ts,
                                now,
                                pool_fee_rate,
                            );
                            state.effective_fee_rate = eff_fee_rate;
                            let grace_remaining_secs = if maintenance_grace_shield_active {
                                active_grace_window_secs
                            } else {
                                active_grace_window_secs.saturating_sub(dt_idle_ms / 1000)
                            };
                            WORKER_HASHRATE.with_label_values(&[full_worker]).set(0.0);
                            pipeline
                                .cmd("SET")
                                .arg(format!("worker:{}:hashrate", full_worker))
                                .arg(0.0)
                                .ignore();
                            pipeline
                                .cmd("SET")
                                .arg(format!("worker:{}:effective_fee_rate", full_worker))
                                .arg(eff_fee_rate)
                                .ignore();
                            pipeline
                                .cmd("SET")
                                .arg(format!("worker:{}:streak_started_ts", full_worker))
                                .arg(state.streak_started_ts)
                                .ignore();
                            let entry = wallet_best_loyalty_map.entry(clean_wallet.clone()).or_insert((
                                state.streak_started_ts,
                                consecutive_weeks,
                                eff_fee_rate,
                                false,
                                grace_remaining_secs,
                            ));
                            if eff_fee_rate < entry.2 || (state.streak_started_ts > 0 && state.streak_started_ts < entry.0) {
                                *entry = (
                                    state.streak_started_ts,
                                    consecutive_weeks,
                                    eff_fee_rate,
                                    entry.3,
                                    grace_remaining_secs.max(entry.4),
                                );
                            }
                            db_worker_snapshots.push(WorkerDbSnapshot {
                                full_identity: full_worker.clone(),
                                wallet_address: wallet_address.to_string(),
                                worker_name,
                                hashrate_ths: 0.0,
                                valid_shares: state.valid_share_count as i64,
                                rejected_shares: state.rejected_share_count as i64,
                                acceptance_pct,
                                blocks_found: state.blocks_found as i64,
                                last_share_ts: state.last_share_ts as i64,
                                streak_started_ts: state.streak_started_ts as i64,
                                effective_fee_rate: eff_fee_rate,
                                status: "grace_period".to_string(),
                            });
                        } else {
                            if state.streak_started_ts == 0 {
                                state.streak_started_ts = now;
                            }
                            let (consecutive_weeks, eff_fee_rate) = compute_miner_loyalty_fee_rate(
                                state.streak_started_ts,
                                now,
                                pool_fee_rate,
                            );
                            state.effective_fee_rate = eff_fee_rate;
                            let grace_remaining_secs = active_grace_window_secs;
                            let entry = wallet_best_loyalty_map.entry(clean_wallet.clone()).or_insert((
                                state.streak_started_ts,
                                consecutive_weeks,
                                eff_fee_rate,
                                true,
                                grace_remaining_secs,
                            ));
                            entry.3 = true;
                            entry.4 = active_grace_window_secs;
                            if eff_fee_rate <= entry.2 {
                                entry.0 = state.streak_started_ts;
                                entry.1 = consecutive_weeks;
                                entry.2 = eff_fee_rate;
                            }
                            total_hashrate += current_hashrate;
                            *wallet_hashrate_ths_map.entry(clean_wallet.clone()).or_insert(0.0) += current_hashrate / 1e12;
                            WORKER_HASHRATE.with_label_values(&[full_worker]).set(current_hashrate / 1e12);
                            pipeline
                                .cmd("SET")
                                .arg(format!("worker:{}:hashrate", full_worker))
                                .arg(current_hashrate)
                                .ignore();
                            pipeline
                                .cmd("SET")
                                .arg(format!("worker:{}:blocks", full_worker))
                                .arg(state.blocks_found)
                                .ignore();
                            pipeline
                                .cmd("SET")
                                .arg(format!("worker:{}:shares", full_worker))
                                .arg(state.shares_contributed as u64)
                                .ignore();
                            pipeline
                                .cmd("SET")
                                .arg(format!("worker:{}:valid_shares", full_worker))
                                .arg(state.valid_share_count)
                                .ignore();
                            pipeline
                                .cmd("SET")
                                .arg(format!("worker:{}:rejected_shares", full_worker))
                                .arg(state.rejected_share_count)
                                .ignore();
                            pipeline
                                .cmd("SET")
                                .arg(format!("worker:{}:acceptance_pct", full_worker))
                                .arg(acceptance_pct)
                                .ignore();
                            pipeline
                                .cmd("SET")
                                .arg(format!("worker:{}:last_share_ts", full_worker))
                                .arg(state.last_share_ts)
                                .ignore();
                            pipeline
                                .cmd("SET")
                                .arg(format!("worker:{}:streak_started_ts", full_worker))
                                .arg(state.streak_started_ts)
                                .ignore();
                            pipeline
                                .cmd("SET")
                                .arg(format!("worker:{}:effective_fee_rate", full_worker))
                                .arg(eff_fee_rate)
                                .ignore();
                            pipeline
                                .cmd("SADD")
                                .arg("pool:workers")
                                .arg(full_worker.clone())
                                .ignore();
                            if can_calculate_yields && state.unflushed_difficulty > 0.0 {
                                let is_house_anchor = !corp_kas_clean.is_empty() && clean_wallet == corp_kas_clean;
                                let work_hashes = state.unflushed_difficulty * KASPA_DIFF_CONSTANT;
                                let expected_block_hashes = net_diff * 2.0;
                                let gross_kas_yield = (work_hashes * block_reward) / expected_block_hashes;
                                let pool_fee_kas = if is_house_anchor {
                                    0.0
                                } else {
                                    gross_kas_yield * eff_fee_rate
                                };
                                let theoretical_net_kas_yield = (gross_kas_yield - pool_fee_kas).max(0.0);
                                let streamed_kas_now = if is_house_anchor {
                                    theoretical_net_kas_yield
                                } else {
                                    let deferred_key = format!("worker:{}:deferred_yield_kas", full_worker);
                                    let deferred_str: Option<String> = redis::cmd("GET")
                                        .arg(&deferred_key)
                                        .query_async(&mut redis_conn)
                                        .await
                                        .unwrap_or(None);
                                    let existing_deferred = deferred_str
                                        .and_then(|s| s.parse::<f64>().ok())
                                        .unwrap_or(0.0)
                                        .max(0.0);
                                    let deferred_release = if elastic_streaming_factor >= 0.99 && existing_deferred > 0.0 {
                                        (existing_deferred * 0.10).min(available_headroom_kas * 0.25)
                                    } else {
                                        0.0
                                    };
                                    let target_stream = (theoretical_net_kas_yield * elastic_streaming_factor) + deferred_release;
                                    let actual_stream = target_stream.min(available_headroom_kas * 0.50).max(0.0);
                                    let newly_deferred = (theoretical_net_kas_yield - (actual_stream - deferred_release)).max(0.0);
                                    let next_deferred = (existing_deferred - deferred_release + newly_deferred).max(0.0);
                                    pipeline.cmd("SET").arg(&deferred_key).arg(next_deferred).ignore();
                                    if actual_stream > 0.0 {
                                        available_headroom_kas = (available_headroom_kas - actual_stream).max(0.0);
                                        total_external_streamed_kas += actual_stream;
                                        pipeline
                                            .cmd("INCRBYFLOAT")
                                            .arg("perennia:pool:external_streamed_kas")
                                            .arg(actual_stream)
                                            .ignore();
                                    }
                                    actual_stream
                                };
                                if streamed_kas_now > 0.0 {
                                    pipeline
                                        .cmd("INCRBYFLOAT")
                                        .arg(format!("worker:{}:unpaid_yield", full_worker))
                                        .arg(streamed_kas_now)
                                        .ignore();
                                    *streamed_kas_by_wallet.entry(clean_wallet).or_insert(0.0) += streamed_kas_now;
                                }
                                state.unflushed_difficulty = 0.0;
                            }
                            if state.unflushed_blocks > 0 {
                                state.unflushed_blocks = 0;
                            }
                            db_worker_snapshots.push(WorkerDbSnapshot {
                                full_identity: full_worker.clone(),
                                wallet_address: wallet_address.to_string(),
                                worker_name: worker_name.clone(),
                                hashrate_ths: current_hashrate / 1e12,
                                valid_shares: state.valid_share_count as i64,
                                rejected_shares: state.rejected_share_count as i64,
                                acceptance_pct,
                                blocks_found: state.blocks_found as i64,
                                last_share_ts: state.last_share_ts as i64,
                                streak_started_ts: state.streak_started_ts as i64,
                                effective_fee_rate: eff_fee_rate,
                                status: "online".to_string(),
                            });
                            workers_array.push(json!({
                                "fullIdentity": full_worker,
                                "walletAddress": wallet_address,
                                "name": worker_name,
                                "trackingRate": current_hashrate,
                                "sharesContributed": state.shares_contributed,
                                "validShares": state.valid_share_count,
                                "rejectedShares": state.rejected_share_count,
                                "acceptancePct": acceptance_pct,
                                "lastShareTimestamp": state.last_share_ts,
                                "streakStartedTs": state.streak_started_ts,
                                "consecutiveWeeks": consecutive_weeks,
                                "effectiveFeeRate": eff_fee_rate,
                                "effectiveFeePct": (eff_fee_rate * 10000.0).round() / 100.0,
                                "graceWindowSecsRemaining": grace_remaining_secs,
                                "maintenanceGraceShieldActive": maintenance_grace_shield_active,
                                "swapFeeFloorPct": 0.10,
                                "blocksFound": state.blocks_found,
                                "status": "online"
                            }));
                        }
                    }
                    for key in keys_to_remove {
                        worker_states.remove(&key);
                    }
                }
                for (clean_w, (streak_ms, weeks, eff_fee_rate, is_actively_online, grace_rem_secs)) in &wallet_best_loyalty_map {
                    if clean_w.is_empty() {
                        continue;
                    }
                    let ttl_secs = (*grace_rem_secs).max(60);
                    let loyalty_payload = json!({
                        "wallet": format!("kaspa:{}", clean_w),
                        "activeMiner": true,
                        "isOnline": *is_actively_online,
                        "inGraceWindow": !*is_actively_online,
                        "maintenanceGraceShieldActive": maintenance_grace_shield_active,
                        "streakStartedTs": *streak_ms,
                        "consecutiveWeeks": *weeks,
                        "effectivePoolFeeRate": *eff_fee_rate,
                        "effectivePoolFeePct": (*eff_fee_rate * 10000.0).round() / 100.0,
                        "unlockedSwapFeeFloorRate": MINER_PERK_SWAP_FEE_FLOOR_RATE,
                        "unlockedSwapFeeFloorPct": 0.10,
                        "graceWindowSecsRemaining": *grace_rem_secs,
                        "updatedAt": now_secs
                    });
                    pipeline
                        .cmd("SETEX")
                        .arg(format!("perennia:miner:loyalty:{}", clean_w))
                        .arg(ttl_secs)
                        .arg(loyalty_payload.to_string())
                        .ignore();
                }
                for (clean_wallet, wallet_streamed_kas) in streamed_kas_by_wallet {
                    if wallet_streamed_kas <= 0.0 {
                        continue;
                    }
                    let prefixed_wallet = format!("kaspa:{}", clean_wallet);
                    let needs_db_refresh = match sector_layout_cache.get(&clean_wallet) {
                        Some(cached) => cached.fetched_at.elapsed() >= LAYOUT_CACHE_TTL,
                        None => true,
                    };
                    if needs_db_refresh {
                        if let Ok(Some(row)) = sqlx::query(
                            "SELECT layout_state FROM user_command_centers WHERE wallet_address = $1 OR wallet_address = $2 LIMIT 1"
                        )
                        .bind(&prefixed_wallet)
                        .bind(&clean_wallet)
                        .fetch_optional(&pg_pool)
                        .await
                        {
                            if let Ok(layout_state) = row.try_get::<Value, _>("layout_state") {
                                sector_layout_cache.insert(
                                    clean_wallet.clone(),
                                    CachedSectorLayout {
                                        layout_state,
                                        fetched_at: Instant::now(),
                                    },
                                );
                            }
                        }
                    }
                    let mut allocated_pct_sum = 0.0_f64;
                    if let Some(cached) = sector_layout_cache.get_mut(&clean_wallet) {
                        if let Some(sectors_array) = cached
                            .layout_state
                            .get_mut("sectors")
                            .and_then(|s| s.as_array_mut())
                        {
                            for sector in sectors_array.iter_mut() {
                                if let Some(pct) = sector.get("allocationPercentage").and_then(|v| v.as_f64()) {
                                    let clamped_pct = pct.clamp(0.0, 100.0);
                                    allocated_pct_sum += clamped_pct;
                                    let projected_micro_yield = wallet_streamed_kas * (clamped_pct / 100.0);
                                    let current_pending = sector.get("pendingKaspa").and_then(|v| v.as_f64()).unwrap_or(0.0);
                                    sector["pendingKaspa"] = json!(current_pending + projected_micro_yield);
                                }
                            }
                            if let Some(sectors_val) = cached.layout_state.get("sectors") {
                                yield_updates_to_publish.push(json!({
                                    "wallet": clean_wallet,
                                    "yield_update": true,
                                    "sectors": sectors_val
                                }));
                            }
                        }
                        let layout_to_save = cached.layout_state.clone();
                        let pool_layout = pg_pool.clone();
                        let pref_w = prefixed_wallet.clone();
                        tokio::spawn(async move {
                            let _ = sqlx::query(
                                "UPDATE user_command_centers SET layout_state = $2, last_updated = CURRENT_TIMESTAMP WHERE wallet_address = $1"
                            )
                            .bind(&pref_w)
                            .bind(&layout_to_save)
                            .execute(&pool_layout)
                            .await;
                        });
                    }
                    let unallocated_ratio = ((100.0 - allocated_pct_sum).max(0.0) / 100.0).clamp(0.0, 1.0);
                    let unassigned_kas_delta = wallet_streamed_kas * unallocated_ratio;
                    if unassigned_kas_delta > 0.0 {
                        let _ = crate::chronos::upsert_signed_yield_reservoir_kas(
                            &pg_pool,
                            &prefixed_wallet,
                            unassigned_kas_delta,
                            unassigned_kas_delta,
                            unassigned_kas_delta,
                        )
                        .await;
                        pipeline
                            .cmd("HINCRBYFLOAT")
                            .arg(format!("dev:sor:treasury:balances:{}", clean_wallet))
                            .arg("Unassigned KAS")
                            .arg(unassigned_kas_delta)
                            .ignore();
                    }
                }
                if tick_counter % 15 == 0 {
                    let global_point = json!({
                        "ts": now_secs,
                        "hashrateThs": total_hashrate / 1e12
                    });
                    pipeline
                        .cmd("RPUSH")
                        .arg("perennia:hashrate:history:global")
                        .arg(global_point.to_string())
                        .ignore();
                    pipeline
                        .cmd("LTRIM")
                        .arg("perennia:hashrate:history:global")
                        .arg(-2880)
                        .arg(-1)
                        .ignore();
                    for (w_clean, w_ths) in &wallet_hashrate_ths_map {
                        let w_point = json!({
                            "ts": now_secs,
                            "hashrateThs": *w_ths
                        });
                        let w_key = format!("perennia:hashrate:history:{}", w_clean);
                        pipeline.cmd("RPUSH").arg(&w_key).arg(w_point.to_string()).ignore();
                        pipeline.cmd("LTRIM").arg(&w_key).arg(-2880).arg(-1).ignore();
                    }
                }
                if !pending_micro_shares.is_empty() {
                    let batch = std::mem::take(&mut pending_micro_shares);
                    let (mut w_ids, mut diffs, mut deltas, mut ndiffs, mut settled) = (Vec::new(), Vec::new(), Vec::new(), Vec::new(), Vec::new());
                    for (w_id, diff_w, eff_fee) in batch {
                        let cw = w_id.split('.').next().unwrap_or("").to_lowercase().replace("kaspa:", "");
                        let is_house = !corp_kas_clean.is_empty() && cw == corp_kas_clean;
                        let kd = if can_calculate_yields {
                            let g = (diff_w * KASPA_DIFF_CONSTANT * block_reward) / (net_diff * 2.0);
                            if is_house { g.max(0.0) } else { (g * (1.0 - eff_fee) * elastic_streaming_factor).max(0.0) }
                        } else { 0.0 };
                        w_ids.push(w_id); diffs.push(diff_w); deltas.push(kd); ndiffs.push(net_diff); settled.push(kd > 0.0);
                    }
                    let pool_ms = pg_pool.clone();
                    let prune = tick_counter % 300 == 0;
                    tokio::spawn(async move {
                        if let Err(e) = sqlx::query("INSERT INTO micro_shares (worker_id, difficulty_weight, kas_value_delta, network_diff, is_settled) SELECT * FROM UNNEST($1::text[], $2::float8[], $3::float8[], $4::float8[], $5::bool[])")
                            .bind(&w_ids).bind(&diffs).bind(&deltas).bind(&ndiffs).bind(&settled).execute(&pool_ms).await {
                            tracing::error!("micro_shares insert failed: {}", e);
                        }
                        if prune { let _ = sqlx::query("DELETE FROM micro_shares WHERE recorded_at < CURRENT_TIMESTAMP - INTERVAL '24 hours'").execute(&pool_ms).await; }
                    });
                }
                if tick_counter % 5 == 0 && !db_worker_snapshots.is_empty() {
                    let pool_bg = pg_pool.clone();
                    tokio::spawn(async move {
                        for snap in db_worker_snapshots {
                            let port_pub = crate::stratum_tcp::resolve_worker_public_port(&snap.full_identity);
                            let dev_prof = match port_pub { 3331 => "GPU_TIER_1", 3333 => "INDUSTRIAL_ASIC_TIER_3", _ => "HOME_ASIC_TIER_2" };
                            let wn = snap.worker_name.to_lowercase();
                            let hw = if wn.contains("ks7") { "IceRiver KS7 Lite" } else if wn.contains("ultra") { "IceRiver KS0 Ultra" } else if wn.contains("pro") { "IceRiver KS0 Pro" } else if wn.contains("ks0") { "IceRiver KS0" } else { "IceRiver KS" };
                            let raw_hr = snap.hashrate_ths * 1e12;
                            if let Err(e) = sqlx::query("INSERT INTO worker_profiles (worker_id, worker_identity, wallet_address, device_profile, hardware_model, worker_name, hashrate_ths, current_hashrate, stratum_port, valid_shares, rejected_shares, acceptance_pct, blocks_found, last_share_ts, streak_started_ts, effective_fee_rate, status, updated_at, last_seen) VALUES ($1, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT (worker_id) DO UPDATE SET worker_identity = EXCLUDED.worker_identity, wallet_address = EXCLUDED.wallet_address, device_profile = EXCLUDED.device_profile, hardware_model = EXCLUDED.hardware_model, worker_name = EXCLUDED.worker_name, hashrate_ths = EXCLUDED.hashrate_ths, current_hashrate = EXCLUDED.current_hashrate, stratum_port = EXCLUDED.stratum_port, valid_shares = EXCLUDED.valid_shares, rejected_shares = EXCLUDED.rejected_shares, acceptance_pct = EXCLUDED.acceptance_pct, blocks_found = EXCLUDED.blocks_found, last_share_ts = EXCLUDED.last_share_ts, streak_started_ts = EXCLUDED.streak_started_ts, effective_fee_rate = EXCLUDED.effective_fee_rate, status = EXCLUDED.status, updated_at = CURRENT_TIMESTAMP, last_seen = CASE WHEN EXCLUDED.status = 'online' THEN CURRENT_TIMESTAMP ELSE worker_profiles.last_seen END")
                                .bind(&snap.full_identity).bind(&snap.wallet_address).bind(dev_prof).bind(hw).bind(&snap.worker_name).bind(snap.hashrate_ths).bind(raw_hr).bind(port_pub).bind(snap.valid_shares).bind(snap.rejected_shares).bind(snap.acceptance_pct).bind(snap.blocks_found).bind(snap.last_share_ts).bind(snap.streak_started_ts).bind(snap.effective_fee_rate).bind(&snap.status)
                                .execute(&pool_bg).await {
                                tracing::error!("worker_profiles upsert failed: {}", e);
                            }
                        }
                    });
                }
                let total_blocks_kas = cached_l1_blocks_won_kas + cached_immature_blocks_kas;
                let earned_pool_fee_kas = total_blocks_kas * pool_fee_rate;
                let custodial_miner_blocks_kas = total_blocks_kas * (1.0 - pool_fee_rate);
                pipeline
                    .cmd("SET")
                    .arg("perennia:fees:batch_accumulated:KAS")
                    .arg(earned_pool_fee_kas)
                    .ignore();
                let solvency_telemetry = json!({
                    "maxHouseFloatKas": max_house_float_kas,
                    "totalBlocksWonCount": cached_total_blocks_count,
                    "l1BlocksWonKas": cached_l1_blocks_won_kas,
                    "immatureBlocksKas": cached_immature_blocks_kas,
                    "totalBlocksRewardKas": total_blocks_kas,
                    "earnedPoolFeeKas": earned_pool_fee_kas,
                    "custodialMinerObligationKas": custodial_miner_blocks_kas,
                    "coinbaseMaturityDaa": coinbase_maturity_daa,
                    "solvencyCeilingKas": total_solvency_ceiling_kas,
                    "externalStreamedKas": total_external_streamed_kas,
                    "availableHeadroomKas": available_headroom_kas,
                    "elasticStreamingFactor": elastic_streaming_factor,
                    "maintenanceGraceShieldActive": maintenance_grace_shield_active,
                    "updatedAt": now_secs
                });
                pipeline
                    .cmd("SET")
                    .arg("perennia:pool:fpps_solvency")
                    .arg(solvency_telemetry.to_string())
                    .ignore();
                pipeline
                    .cmd("SET")
                    .arg("pool:hashrate")
                    .arg(total_hashrate)
                    .ignore();
                let telemetry_payload = json!({
                    "totalHashrate": total_hashrate,
                    "networkDifficulty": net_diff,
                    "blockRewardKas": block_reward,
                    "workers": workers_array,
                    "epoch": epoch_telemetry_val,
                    "fppsSolvency": solvency_telemetry
                });
                pipeline
                    .cmd("SET")
                    .arg("perennia:telemetry")
                    .arg(telemetry_payload.to_string())
                    .ignore();
                pipeline
                    .cmd("XADD")
                    .arg("telemetry:stream")
                    .arg("MAXLEN")
                    .arg("~")
                    .arg(100)
                    .arg("*")
                    .arg("payload")
                    .arg(telemetry_payload.to_string())
                    .ignore();
                pipeline
                    .cmd("PUBLISH")
                    .arg("telemetry:updates")
                    .arg(telemetry_payload.to_string())
                    .ignore();
                for update in yield_updates_to_publish {
                    pipeline
                        .cmd("PUBLISH")
                        .arg("telemetry:updates")
                        .arg(update.to_string())
                        .ignore();
                }
                if let Err(e) = pipeline.query_async::<_, ()>(&mut redis_conn).await {
                    tracing::error!("🚨 CRITICAL LEDGER FAILURE: {}", e);
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    if let Ok(new_conn) = redis_client.get_multiplexed_async_connection().await {
                        redis_conn = new_conn;
                    }
                }
            }
        }
    }
}
```

## File: src/admin_api.rs
```rust
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::Json,
    routing::{get, post},
    Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::env;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
#[derive(Deserialize)]
struct ShieldActionReq {
    ip: String,
    action: Option<String>,
}
#[derive(Deserialize)]
struct WhitelistReq {
    wallet: String,
    label: Option<String>,
}
#[derive(Deserialize)]
#[allow(non_snake_case)]
struct PassthroughAdminReq {
    action: String,
    orderIndex: Option<usize>,
    wallet: Option<String>,
    targetAsset: Option<String>,
    grossKas: Option<f64>,
    upfrontFeeKas: Option<f64>,
    estimatedOutput: Option<f64>,
    spotPrice: Option<f64>,
    txHash: Option<String>,
}
#[derive(Deserialize)]
#[allow(non_snake_case)]
struct FiatAdminReq {
    action: String,
    payoutId: Option<String>,
    orderId: Option<String>,
    traceId: Option<String>,
    batchTracePrefix: Option<String>,
    settlementTarget: Option<String>,
    txHash: Option<String>,
    ticker: Option<String>,
    steeringState: Option<String>,
    targetWeightPct: Option<f64>,
    subsystem: Option<String>,
    paused: Option<bool>,
    enabled: Option<bool>,
}
#[derive(Deserialize)]
#[allow(non_snake_case)]
struct L1PayoutAdminReq {
    action: String,
    payoutId: String,
    txHash: Option<String>,
}
const LUA_CLAMPED_FEE_REVERSAL: &str = r#"
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
local rev = tonumber(ARGV[1] or '0')
local next_val = math.max(0, cur - rev)
redis.call('SET', KEYS[1], tostring(next_val))
return tostring(next_val)
"#;
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (&x, &y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}
fn verify_internal_admin_headers(headers: &HeaderMap) -> Result<(), (StatusCode, Json<Value>)> {
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    let internal_token = env::var("INTERNAL_ADMIN_TOKEN")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let admin_key = env::var("PERENNIA_ADMIN_KEY")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let mut authorized = false;
    if let Some(tok) = internal_token {
        let expected = format!("Bearer {}", tok);
        if constant_time_eq(auth_header.as_bytes(), expected.as_bytes()) {
            authorized = true;
        }
    }
    if !authorized {
        if let Some(key) = admin_key {
            let expected = format!("Bearer {}", key);
            if constant_time_eq(auth_header.as_bytes(), expected.as_bytes()) {
                authorized = true;
            }
        }
    }
    if !authorized {
        return Err((
            StatusCode::UNAUTHORIZED,
            Json(json!({"error": "Unauthorized Access: Internal token mismatch."})),
        ));
    }
    Ok(())
}
pub fn admin_routes() -> Router<PgPool> {
    Router::new()
        .route("/v1/admin/db/:table", get(get_table_data))
        .route("/v1/admin/shield", get(get_shield_status).post(modify_shield_ip))
        .route(
            "/v1/admin/whitelist",
            get(get_whitelisted_wallets)
                .post(add_whitelisted_wallet)
                .delete(remove_whitelisted_wallet),
        )
        .route("/v1/admin/passthrough", post(handle_passthrough_action))
        .route("/v1/admin/fiat", post(handle_fiat_action))
        .route("/v1/admin/l1-payout", post(handle_l1_payout_action))
        .route("/v1/admin/epoch-bell", post(handle_force_epoch_bell))
        .route("/v1/admin/netting-cycle", post(handle_force_netting_cycle))
        .route("/v1/admin/netting-lab", post(handle_netting_lab))
}
async fn handle_force_netting_cycle(
    headers: HeaderMap,
    State(pool): State<PgPool>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    verify_internal_admin_headers(&headers)?;
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let client = redis::Client::open(redis_url).map_err(|e| {
        (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("Redis client error: {}", e)})))
    })?;
    match crate::chronos::run_delta_netting_cycle(&client, &pool).await {
        Ok(receipt) => Ok(Json(json!({ "success": true, "action": "FORCE_NETTING_CYCLE", "batchReceipt": receipt }))),
        Err(e) => Err((StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": format!("Netting cycle failed: {}", e)})))),
    }
}
async fn handle_netting_lab(
    headers: HeaderMap,
    State(pool): State<PgPool>,
    Json(payload): Json<Value>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    verify_internal_admin_headers(&headers)?;
    if payload.get("labCohortTag").and_then(|v| v.as_str()).unwrap_or("") != "PERENNIA_NETTING_MATH_V5" {
        return Err((StatusCode::BAD_REQUEST, Json(json!({"error": "Invalid labCohortTag."}))));
    }
    let action = payload.get("action").and_then(|v| v.as_str()).unwrap_or("");
    let master_clean = crate::chronos::resolve_master_treasury_address();
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let r_client = redis::Client::open(redis_url).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;
    let mut r_conn = r_client.get_multiplexed_async_connection().await.map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, Json(json!({"error": e.to_string()}))))?;
    if action == "SEED_COHORT" {
        let profit_before: Option<String> = redis::cmd("GET").arg("perennia:treasury:netting_profit_usd").query_async(&mut r_conn).await.unwrap_or(None);
        let delta_before: Option<String> = redis::cmd("GET").arg("perennia:treasury:unhedged_delta_kas").query_async(&mut r_conn).await.unwrap_or(None);
        let fees_before: Option<String> = redis::cmd("GET").arg("perennia:fees:batch_accumulated:USDC").query_async(&mut r_conn).await.unwrap_or(None);
        let _: redis::RedisResult<()> = redis::cmd("DEL").arg("perennia:sor:netting_queue").query_async(&mut r_conn).await;
        if let Some(lp_w) = payload.get("lpAnchorWallet").and_then(|v| v.as_str()) {
            let lp_clean = lp_w.trim().to_lowercase().replace("kaspa:", "").trim().to_string();
            if !lp_clean.is_empty() && lp_clean != master_clean {
                let lp_pref = format!("kaspa:{}", lp_clean);
                let _ = sqlx::query("DELETE FROM liquidity_providers WHERE wallet_address = $1 OR wallet_address = $2").bind(&lp_pref).bind(&lp_clean).execute(&pool).await;
                for (pair, b_tick, b_amt) in [("KAS/USDC", "USDC", 250_000.0_f64), ("KAS/BTC", "BTC", 5.0_f64), ("KAS/ETH", "ETH", 80.0_f64), ("KAS/SOL", "SOL", 1_500.0_f64)] {
                    let wj = json!({"KAS": 0.5, b_tick: 0.5});
                    let rj = json!({"KAS": 1_500_000.0_f64, b_tick: b_amt});
                    let _ = sqlx::query(
                        "INSERT INTO liquidity_providers (wallet_address, pool_pair, staked_asset_a, staked_asset_b, weights_json, reserves_json, lock_duration_days, unlock_date) VALUES ($1, $2, 1500000.0, $3, $4, $5, 90, CURRENT_TIMESTAMP + INTERVAL '90 days')"
                    ).bind(&lp_pref).bind(pair).bind(b_amt).bind(&wj).bind(&rj).execute(&pool).await;
                }
            }
        }
        let empty_s = vec![];
        let seats = payload.get("seats").and_then(|v| v.as_array()).unwrap_or(&empty_s);
        let mut seeded_count: usize = 0;
        for s in seats {
            let clean = s.get("wallet").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase().replace("kaspa:", "").trim().to_string();
            if clean.is_empty() || clean == master_clean { continue; }
            let pref = format!("kaspa:{}", clean);
            let _ = sqlx::query("DELETE FROM yield_reservoirs WHERE wallet_address = $1 OR wallet_address = $2").bind(&pref).bind(&clean).execute(&pool).await;
            let _ = sqlx::query("DELETE FROM user_command_centers WHERE wallet_address = $1 OR wallet_address = $2").bind(&pref).bind(&clean).execute(&pool).await;
            let _: redis::RedisResult<()> = redis::cmd("DEL").arg(format!("dev:sor:treasury:balances:{}", clean)).query_async(&mut r_conn).await;
            if let Some(bals) = s.get("balances").and_then(|v| v.as_object()) {
                for (tick, val) in bals {
                    let amt: f64 = val.as_f64().unwrap_or(0.0_f64);
                    if amt > 0.0_f64 {
                        let _ = crate::state_api::credit_user_token_balance(&pool, &clean, &pref, tick, amt, tick.eq_ignore_ascii_case("KAS")).await;
                    }
                }
            }
            if let Some(sectors) = s.get("sectors") {
                let layout = json!({ "workers": [], "sectors": sectors, "systemMode": "base" });
                let _ = sqlx::query(
                    "INSERT INTO user_command_centers (wallet_address, layout_state, last_updated) VALUES ($1, $2, CURRENT_TIMESTAMP) ON CONFLICT (wallet_address) DO UPDATE SET layout_state = EXCLUDED.layout_state, last_updated = CURRENT_TIMESTAMP"
                ).bind(&pref).bind(&layout).execute(&pool).await;
            }
            seeded_count += 1;
        }
        let kas_spot: f64 = crate::fiat_rails::resolve_live_spot_price(&pool, "KAS").await.unwrap_or(0.15_f64);
        let _ = crate::chronos::publish_live_epoch_bucket_telemetry(&pool, kas_spot).await;
        return Ok(Json(json!({
            "success": true,
            "seededCount": seeded_count,
            "kasSpotUsd": kas_spot,
            "baseline": { "nettingProfitUsd": profit_before, "unhedgedDeltaKas": delta_before, "feesUsdc": fees_before }
        })));
    }
    if action == "INSPECT_COHORT" {
        let empty_w = vec![];
        let wallets = payload.get("wallets").and_then(|v| v.as_array()).unwrap_or(&empty_w);
        let mut pref_list: Vec<String> = Vec::new();
        let mut clean_list: Vec<String> = Vec::new();
        for w in wallets {
            if let Some(ws) = w.as_str() {
                let c = ws.trim().to_lowercase().replace("kaspa:", "").trim().to_string();
                if !c.is_empty() { pref_list.push(format!("kaspa:{}", c)); clean_list.push(c); }
            }
        }
        let res_rows = sqlx::query(
            "SELECT wallet_address, streaming_balance_kas, total_yield_kas, COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens, COALESCE(row_hmac_sig, '') AS row_hmac_sig, COALESCE(quarantined, FALSE) AS quarantined FROM yield_reservoirs WHERE wallet_address = ANY($1) OR wallet_address = ANY($2)"
        ).bind(&pref_list).bind(&clean_list).fetch_all(&pool).await.unwrap_or_default();
        let mut reservoirs = serde_json::Map::new();
        for r in res_rows {
            let c = r.try_get::<String, _>("wallet_address").unwrap_or_default().trim().to_lowercase().replace("kaspa:", "").trim().to_string();
            let pref = format!("kaspa:{}", c);
            let sk: f64 = r.try_get("streaming_balance_kas").unwrap_or(0.0_f64);
            let ty: f64 = r.try_get("total_yield_kas").unwrap_or(0.0_f64);
            let lpt: Value = r.try_get("lp_tokens").unwrap_or_else(|_| json!({}));
            let sig: String = r.try_get("row_hmac_sig").unwrap_or_default();
            let exp_sig = crate::chronos::compute_reservoir_hmac(&pref, sk, ty, &lpt).unwrap_or_default();
            reservoirs.insert(pref, json!({
                "streamingKas": sk, "totalYieldKas": ty, "lpTokens": lpt,
                "hmacValid": !sig.is_empty() && sig == exp_sig,
                "quarantined": r.try_get::<bool, _>("quarantined").unwrap_or(false)
            }));
        }
        let cc_rows = sqlx::query("SELECT wallet_address, layout_state FROM user_command_centers WHERE wallet_address = ANY($1) OR wallet_address = ANY($2)")
            .bind(&pref_list).bind(&clean_list).fetch_all(&pool).await.unwrap_or_default();
        let mut sectors_map = serde_json::Map::new();
        for r in cc_rows {
            let c = r.try_get::<String, _>("wallet_address").unwrap_or_default().trim().to_lowercase().replace("kaspa:", "").trim().to_string();
            let ls: Value = r.try_get("layout_state").unwrap_or_else(|_| json!({}));
            sectors_map.insert(format!("kaspa:{}", c), ls.get("sectors").cloned().unwrap_or_else(|| json!([])));
        }
        let hifo_cnt: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM hifo_tax_lots WHERE wallet_address = ANY($1) OR wallet_address = ANY($2)")
            .bind(&pref_list).bind(&clean_list).fetch_one(&pool).await.unwrap_or(0);
        let lp_cnt: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM liquidity_providers WHERE wallet_address = ANY($1) OR wallet_address = ANY($2)")
            .bind(&pref_list).bind(&clean_list).fetch_one(&pool).await.unwrap_or(0);
        let q_len: usize = redis::cmd("LLEN").arg("perennia:sor:netting_queue").query_async(&mut r_conn).await.unwrap_or(0);
        let last_batch_raw: Option<String> = redis::cmd("GET").arg("perennia:settlement:last_netting_batch").query_async(&mut r_conn).await.unwrap_or(None);
        let profit_str: Option<String> = redis::cmd("GET").arg("perennia:treasury:netting_profit_usd").query_async(&mut r_conn).await.unwrap_or(None);
        let delta_str: Option<String> = redis::cmd("GET").arg("perennia:treasury:unhedged_delta_kas").query_async(&mut r_conn).await.unwrap_or(None);
        let pt_raw: Vec<String> = redis::cmd("LRANGE").arg("perennia:sor:third_party_passthrough_queue").arg(0).arg(25).query_async(&mut r_conn).await.unwrap_or_default();
        let pt_parsed: Vec<Value> = pt_raw.iter().filter_map(|s| serde_json::from_str::<Value>(s).ok()).collect();
        return Ok(Json(json!({
            "success": true, "reservoirs": reservoirs, "sectorsByWallet": sectors_map,
            "hifoLotCount": hifo_cnt, "lpPositionsCount": lp_cnt,
            "redis": {
                "nettingQueueLen": q_len,
                "lastNettingBatch": last_batch_raw.and_then(|s| serde_json::from_str::<Value>(&s).ok()),
                "nettingProfitUsd": profit_str.and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0_f64),
                "unhedgedDeltaKas": delta_str.and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0_f64),
                "passthroughQueue": pt_parsed
            }
        })));
    }
    if action == "TEARDOWN_COHORT" {
        let empty_w = vec![];
        let wallets = payload.get("wallets").and_then(|v| v.as_array()).unwrap_or(&empty_w);
        let mut pref_list: Vec<String> = Vec::new();
        let mut clean_list: Vec<String> = Vec::new();
        for w in wallets {
            if let Some(ws) = w.as_str() {
                let c = ws.trim().to_lowercase().replace("kaspa:", "").trim().to_string();
                if !c.is_empty() && c != master_clean {
                    pref_list.push(format!("kaspa:{}", c));
                    clean_list.push(c.clone());
                    let _: redis::RedisResult<()> = redis::cmd("DEL").arg(format!("dev:sor:treasury:balances:{}", c)).query_async(&mut r_conn).await;
                }
            }
        }
        for tbl in ["hifo_disposal_matches", "hifo_tax_lots", "tax_ledger_events", "liquidity_providers", "silo_staking_positions", "user_command_centers", "yield_reservoirs"] {
            let q = format!("DELETE FROM {} WHERE wallet_address = ANY($1) OR wallet_address = ANY($2)", tbl);
            let _ = sqlx::query(&q).bind(&pref_list).bind(&clean_list).execute(&pool).await;
        }
        if let Some(base) = payload.get("restoreBaseline").and_then(|v| v.as_object()) {
            for (field, r_key) in [("nettingProfitUsd", "perennia:treasury:netting_profit_usd"), ("unhedgedDeltaKas", "perennia:treasury:unhedged_delta_kas"), ("feesUsdc", "perennia:fees:batch_accumulated:USDC")] {
                if let Some(val) = base.get(field) {
                    if let Some(s) = val.as_str() {
                        let _: redis::RedisResult<()> = redis::cmd("SET").arg(r_key).arg(s).query_async(&mut r_conn).await;
                    } else if val.is_null() {
                        let _: redis::RedisResult<()> = redis::cmd("DEL").arg(r_key).query_async(&mut r_conn).await;
                    }
                }
            }
        }
        let pt_all: Vec<String> = redis::cmd("LRANGE").arg("perennia:sor:third_party_passthrough_queue").arg(0).arg(-1).query_async(&mut r_conn).await.unwrap_or_default();
        let _: redis::RedisResult<()> = redis::cmd("DEL").arg("perennia:sor:third_party_passthrough_queue").query_async(&mut r_conn).await;
        for raw_item in pt_all.into_iter().rev() {
            let is_lab = serde_json::from_str::<Value>(&raw_item).ok()
                .and_then(|v| v.get("type").and_then(|t| t.as_str()).map(|s| s == "NET_RESIDUAL_AUTOBALANCE"))
                .unwrap_or(false);
            if !is_lab {
                let _: redis::RedisResult<()> = redis::cmd("LPUSH").arg("perennia:sor:third_party_passthrough_queue").arg(raw_item).query_async(&mut r_conn).await;
            }
        }
        let kas_spot: f64 = crate::fiat_rails::resolve_live_spot_price(&pool, "KAS").await.unwrap_or(0.15_f64);
        let _ = crate::chronos::publish_live_epoch_bucket_telemetry(&pool, kas_spot).await;
        return Ok(Json(json!({ "success": true, "purgedWallets": pref_list.len() })));
    }
    Err((StatusCode::BAD_REQUEST, Json(json!({"error": "Unsupported netting-lab action."}))))
}
async fn handle_force_epoch_bell(
    headers: HeaderMap,
    State(pool): State<PgPool>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    verify_internal_admin_headers(&headers)?;
    match crate::chronos::trigger_immediate_epoch_bell_sweep(&pool).await {
        Ok(epoch_telemetry) => Ok(Json(json!({
            "success": true,
            "action": "FORCE_EPOCH_BELL",
            "epochTelemetry": epoch_telemetry
        }))),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Failed to trigger 22:00 UTC Bell sweep: {}", e)})),
        )),
    }
}
async fn get_table_data(
    headers: HeaderMap,
    Path(table): Path<String>,
    State(pool): State<PgPool>,
) -> Result<Json<Vec<Value>>, (StatusCode, Json<Value>)> {
    verify_internal_admin_headers(&headers)?;
    let allowed_tables = vec![
        "system_treasury_config",
        "user_cold_vault_rules",
        "worker_profiles",
        "yield_reservoirs",
        "micro_shares",
        "network_blocks",
        "user_command_centers",
        "entity_kyc",
        "tax_ledger_events",
        "liquidity_providers",
        "silo_staking_positions",
        "yield_distributions",
        "pending_transactions",
        "whitelisted_wallets",
        "p2p_orders",
        "fiat_payout_queue",
        "fiat_bank_rails",
        "fiat_onramp_orders",
        "fiat_float_ledger",
        "fiat_post_trade_sweeps",
        "l1_payout_queue",
        "rwa_oracle_feeds",
        "forge_vesting_schedules",
        "forge_monetary_policies",
        "forge_mineable_vaults",
        "idempotent_payout_batches",
        "client_cold_vault_registry",
        "treasury_airlock_sweeps",
        "hifo_tax_lots",
        "hifo_disposal_matches",
        "token_steering_matrix",
        "security_firewall_blacklist",
        "director_audit_log",
        "corporate_expense_vouchers",
        "corporate_owner_draws",
    ];
    if !allowed_tables.contains(&table.as_str()) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Table not authorized in internal matrix."})),
        ));
    }
    let query = format!(
        "SELECT row_to_json(t) AS data FROM (SELECT * FROM {} ORDER BY 1 DESC LIMIT 5000) t",
        table
    );
    let rows = sqlx::query(&query).fetch_all(&pool).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Database Error: {}", e)})),
        )
    })?;
    let mut results = Vec::new();
    for row in rows {
        if let Ok(val) = row.try_get::<Value, _>("data") {
            results.push(val);
        }
    }
    Ok(Json(results))
}
async fn get_shield_status(
    headers: HeaderMap,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    verify_internal_admin_headers(&headers)?;
    let mut banned = Vec::new();
    let mut expired = Vec::new();
    for entry in crate::stratum_tcp::BANNED_IPS.iter() {
        let ip = entry.key().clone();
        let banned_at = *entry.value();
        let elapsed = banned_at.elapsed();
        if elapsed < Duration::from_secs(crate::stratum_tcp::BAN_DURATION_SECS) {
            let remaining_secs =
                crate::stratum_tcp::BAN_DURATION_SECS.saturating_sub(elapsed.as_secs());
            banned.push(json!({
                "ip": ip,
                "elapsedSeconds": elapsed.as_secs(),
                "remainingSeconds": remaining_secs
            }));
        } else {
            expired.push(ip);
        }
    }
    for ip in expired {
        crate::stratum_tcp::BANNED_IPS.remove(&ip);
        crate::stratum_tcp::STRIKE_COUNTERS.remove(&ip);
    }
    let mut active_strikes = Vec::new();
    for entry in crate::stratum_tcp::STRIKE_COUNTERS.iter() {
        active_strikes.push(json!({
            "key": entry.key(),
            "strikes": *entry.value(),
            "maxStrikes": crate::stratum_tcp::MAX_CONSECUTIVE_STRIKES
        }));
    }
    Ok(Json(json!({
        "bannedIps": banned,
        "count": banned.len(),
        "activeStrikeCounters": active_strikes,
        "maxConsecutiveStrikes": crate::stratum_tcp::MAX_CONSECUTIVE_STRIKES
    })))
}
async fn modify_shield_ip(
    headers: HeaderMap,
    State(pool): State<PgPool>,
    Json(req): Json<ShieldActionReq>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    verify_internal_admin_headers(&headers)?;
    let clean_ip = req.ip.trim().to_string();
    if clean_ip.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "IP address required"})),
        ));
    }
    let action = req.action.unwrap_or_else(|| "BAN".to_string()).to_uppercase();
    if action == "UNBAN" || action == "REMOVE" {
        crate::stratum_tcp::BANNED_IPS.remove(&clean_ip);
        crate::stratum_tcp::STRIKE_COUNTERS.remove(&clean_ip);
        let _ = sqlx::query(
            "UPDATE security_firewall_blacklist SET active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE LOWER(target_value) = LOWER($1)",
        )
        .bind(&clean_ip)
        .execute(&pool)
        .await;
        Ok(Json(json!({
            "success": true,
            "action": "UNBANNED",
            "ip": clean_ip
        })))
    } else {
        crate::stratum_tcp::BANNED_IPS.insert(clean_ip.clone(), Instant::now());
        crate::stratum_tcp::STRIKE_COUNTERS.remove(&clean_ip);
        let _ = sqlx::query(
            r#"
            INSERT INTO security_firewall_blacklist (entity_type, target_value, reason, active, added_by)
            VALUES ('IP', $1, 'Director Stratum Shield Ban', TRUE, 'DIRECTOR')
            ON CONFLICT (target_value) DO UPDATE SET active = TRUE, updated_at = CURRENT_TIMESTAMP
            "#,
        )
        .bind(&clean_ip)
        .execute(&pool)
        .await;
        Ok(Json(json!({
            "success": true,
            "action": "BANNED",
            "ip": clean_ip
        })))
    }
}
async fn get_whitelisted_wallets(
    headers: HeaderMap,
    State(pool): State<PgPool>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    verify_internal_admin_headers(&headers)?;
    let rows = sqlx::query(
        "SELECT row_to_json(t) AS data FROM (SELECT * FROM whitelisted_wallets ORDER BY created_at DESC LIMIT 1000) t",
    )
    .fetch_all(&pool)
    .await
    .unwrap_or_default();
    let mut list = Vec::new();
    for r in rows {
        if let Ok(v) = r.try_get::<Value, _>("data") {
            list.push(v);
        }
    }
    Ok(Json(json!({ "wallets": list })))
}
async fn add_whitelisted_wallet(
    headers: HeaderMap,
    State(pool): State<PgPool>,
    Json(req): Json<WhitelistReq>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    verify_internal_admin_headers(&headers)?;
    let clean = req.wallet.trim().to_lowercase().replace("kaspa:", "");
    if clean.len() < 55 {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "Invalid Kaspa wallet address"})),
        ));
    }
    let prefixed = format!("kaspa:{}", clean);
    let label = req.label.unwrap_or_else(|| "Director Whitelisted".to_string());
    sqlx::query(
        "INSERT INTO whitelisted_wallets (wallet_address, label) VALUES ($1, $2)
         ON CONFLICT (wallet_address) DO UPDATE SET label = EXCLUDED.label",
    )
    .bind(&prefixed)
    .bind(&label)
    .execute(&pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;
    Ok(Json(json!({ "success": true, "wallet": prefixed })))
}
async fn remove_whitelisted_wallet(
    headers: HeaderMap,
    State(pool): State<PgPool>,
    Json(req): Json<WhitelistReq>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    verify_internal_admin_headers(&headers)?;
    let clean = req.wallet.trim().to_lowercase().replace("kaspa:", "");
    let prefixed = format!("kaspa:{}", clean);
    let _ = sqlx::query(
        "DELETE FROM whitelisted_wallets WHERE wallet_address = $1 OR wallet_address = $2",
    )
    .bind(&prefixed)
    .bind(&clean)
    .execute(&pool)
    .await;
    Ok(Json(json!({ "success": true, "removed": prefixed })))
}
async fn handle_l1_payout_action(
    headers: HeaderMap,
    State(pool): State<PgPool>,
    Json(req): Json<L1PayoutAdminReq>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    verify_internal_admin_headers(&headers)?;
    let mode = req.action.trim().to_uppercase();
    let payout_id = req.payoutId.trim().to_string();
    if payout_id.is_empty() {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"error": "payoutId is required"})),
        ));
    }
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());
    let redis_client = redis::Client::open(redis_url).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;
    let mut redis_conn = redis_client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;
    let row_opt = sqlx::query(
        "SELECT wallet_address, destination_address, asset_ticker, amount_tokens, gross_usd, spot_price, status FROM l1_payout_queue WHERE payout_id = $1 LIMIT 1",
    )
    .bind(&payout_id)
    .fetch_optional(&pool)
    .await
    .map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("DB lookup failed: {}", e)})),
        )
    })?;
    let row = row_opt.ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            Json(json!({"error": "L1 payout record not found."})),
        )
    })?;
    let wallet_address: String = row.try_get("wallet_address").unwrap_or_default();
    let clean_wallet = wallet_address.trim().to_lowercase().replace("kaspa:", "");
    let prefixed_wallet = format!("kaspa:{}", clean_wallet);
    let asset_ticker: String = row
        .try_get::<String, _>("asset_ticker")
        .unwrap_or_else(|_| "KAS".to_string())
        .to_uppercase();
    let amount_tokens: f64 = row.try_get("amount_tokens").unwrap_or(0.0);
    let gross_usd: f64 = row.try_get("gross_usd").unwrap_or(0.0);
    let spot_price: f64 = row.try_get("spot_price").unwrap_or(0.0);
    if mode == "CONFIRM_L1_PAYOUT" {
        let resolved_tx_hash = req
            .txHash
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("0x{}", uuid::Uuid::new_v4().simple()));
        let explorer_url =
            crate::state_api::build_explorer_tx_url(&asset_ticker, &resolved_tx_hash);
        let _ = sqlx::query(
            "UPDATE l1_payout_queue SET status = 'DISPATCHED_ONCHAIN', tx_hash = $2, explorer_url = $3, updated_at = CURRENT_TIMESTAMP WHERE payout_id = $1",
        )
        .bind(&payout_id)
        .bind(&resolved_tx_hash)
        .bind(&explorer_url)
        .execute(&pool)
        .await;
        let _ = sqlx::query("UPDATE tax_ledger_events SET tx_hash = $2 WHERE tx_hash = $1")
            .bind(&payout_id)
            .bind(&resolved_tx_hash)
            .execute(&pool)
            .await;
        let _ = sqlx::query(
            "INSERT INTO pending_transactions (tx_id, wallet_address, amount_kas, action_type, status) VALUES ($1, $2, $3, 'L1_MULTI_CHAIN_PAYOUT', 'SETTLED') ON CONFLICT (tx_id) DO UPDATE SET status = 'SETTLED'",
        )
        .bind(&resolved_tx_hash)
        .bind(&prefixed_wallet)
        .bind(amount_tokens)
        .execute(&pool)
        .await;
        let sse_evt = json!({
            "l1_event": true,
            "fiat_event": true,
            "eventType": "L1_DISPATCHED",
            "wallet": clean_wallet,
            "payoutId": payout_id,
            "assetTicker": asset_ticker,
            "amountTokens": amount_tokens,
            "txHash": resolved_tx_hash,
            "explorerUrl": explorer_url
        });
        let _: () = redis::cmd("PUBLISH")
            .arg("telemetry:updates")
            .arg(sse_evt.to_string())
            .query_async(&mut redis_conn)
            .await
            .unwrap_or(());
        return Ok(Json(json!({
            "success": true,
            "action": "CONFIRM_L1_PAYOUT",
            "payoutId": payout_id,
            "txHash": resolved_tx_hash,
            "explorerUrl": explorer_url,
            "status": "DISPATCHED_ONCHAIN"
        })));
    } else if mode == "REFUND_L1_PAYOUT" {
        let user_ledger_key = format!("dev:sor:treasury:balances:{}", clean_wallet);
        let _: () = redis::cmd("HINCRBYFLOAT")
            .arg(&user_ledger_key)
            .arg(&asset_ticker)
            .arg(amount_tokens)
            .query_async(&mut redis_conn)
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("Failed to refund ledger: {}", e)})),
                )
            })?;
        let _ = sqlx::query(
            "UPDATE l1_payout_queue SET status = 'REFUNDED_TO_LEDGER', updated_at = CURRENT_TIMESTAMP WHERE payout_id = $1",
        )
        .bind(&payout_id)
        .execute(&pool)
        .await;
        let _ = sqlx::query(
            "INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash) VALUES ($1, $2, 'L1_REFUND', $3, $4, $5, $6)",
        )
        .bind(&clean_wallet)
        .bind(&asset_ticker)
        .bind(gross_usd)
        .bind(amount_tokens)
        .bind(spot_price)
        .bind(&payout_id)
        .execute(&pool)
        .await;
        let sse_evt = json!({
            "l1_event": true,
            "fiat_event": true,
            "eventType": "L1_REFUND",
            "wallet": clean_wallet,
            "payoutId": payout_id,
            "assetTicker": asset_ticker,
            "amountTokens": amount_tokens
        });
        let _: () = redis::cmd("PUBLISH")
            .arg("telemetry:updates")
            .arg(sse_evt.to_string())
            .query_async(&mut redis_conn)
            .await
            .unwrap_or(());
        return Ok(Json(json!({
            "success": true,
            "action": "REFUND_L1_PAYOUT",
            "payoutId": payout_id,
            "refundedAsset": asset_ticker,
            "refundedAmount": amount_tokens,
            "status": "REFUNDED_TO_LEDGER"
        })));
    }
    Err((
        StatusCode::BAD_REQUEST,
        Json(json!({"error": format!("Unsupported L1 payout action: {}", mode)})),
    ))
}
async fn handle_passthrough_action(
    headers: HeaderMap,
    State(pool): State<PgPool>,
    Json(req): Json<PassthroughAdminReq>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    verify_internal_admin_headers(&headers)?;
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());
    let redis_client = redis::Client::open(redis_url).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": format!("Redis init error: {}", e)})),
        )
    })?;
    let mut redis_conn = redis_client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Redis conn error: {}", e)})),
            )
        })?;
    let queue_key = "perennia:sor:third_party_passthrough_queue";
    let raw_items: Vec<String> = redis::cmd("LRANGE")
        .arg(queue_key)
        .arg(0)
        .arg(199)
        .query_async(&mut redis_conn)
        .await
        .unwrap_or_default();
    let mut matched_raw: Option<String> = None;
    let mut matched_json: Option<Value> = None;
    if let Some(idx) = req.orderIndex {
        if let Some(item_str) = raw_items.get(idx) {
            matched_raw = Some(item_str.clone());
            matched_json = serde_json::from_str::<Value>(item_str).ok();
        }
    }
    if matched_json.is_none() {
        let req_wallet_clean = req
            .wallet
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_lowercase()
            .replace("kaspa:", "");
        let req_target = req
            .targetAsset
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_uppercase();
        for item_str in &raw_items {
            if let Ok(parsed) = serde_json::from_str::<Value>(item_str) {
                let w_clean = parsed
                    .get("wallet")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_lowercase()
                    .replace("kaspa:", "");
                let t_asset = parsed
                    .get("target_asset")
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_uppercase();
                if (!req_wallet_clean.is_empty() && w_clean == req_wallet_clean)
                    && (req_target.is_empty() || t_asset == req_target)
                {
                    matched_raw = Some(item_str.clone());
                    matched_json = Some(parsed);
                    break;
                }
            }
        }
    }
    let order_val = matched_json.unwrap_or_else(|| {
        json!({
            "wallet": req.wallet.clone().unwrap_or_default(),
            "target_asset": req.targetAsset.clone().unwrap_or_else(|| "CUSTOM".to_string()),
            "gross_kas": req.grossKas.unwrap_or(0.0),
            "upfront_fee_kas": req.upfrontFeeKas.unwrap_or(0.0),
            "estimated_output": req.estimatedOutput.unwrap_or(0.0),
            "spot_price": req.spotPrice.unwrap_or(0.0)
        })
    });
    if let Some(raw_to_remove) = matched_raw {
        let _: () = redis::cmd("LREM")
            .arg(queue_key)
            .arg(1)
            .arg(raw_to_remove)
            .query_async(&mut redis_conn)
            .await
            .unwrap_or(());
    }
    let wallet_str = order_val
        .get("wallet")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let clean_wallet = wallet_str
        .trim()
        .to_lowercase()
        .replace("kaspa:", "");
    let prefixed_wallet = format!("kaspa:{}", clean_wallet);
    let target_asset = order_val
        .get("target_asset")
        .and_then(|v| v.as_str())
        .unwrap_or("CUSTOM")
        .to_uppercase();
    let gross_kas = order_val
        .get("gross_kas")
        .and_then(|v| v.as_f64())
        .or(req.grossKas)
        .unwrap_or(0.0)
        .max(0.0);
    let upfront_fee_kas = order_val
        .get("upfront_fee_kas")
        .and_then(|v| v.as_f64())
        .or(req.upfrontFeeKas)
        .unwrap_or(0.0)
        .max(0.0);
    let estimated_output = order_val
        .get("estimated_output")
        .and_then(|v| v.as_f64())
        .or(req.estimatedOutput)
        .unwrap_or(0.0)
        .max(0.0);
    let spot_price = order_val
        .get("spot_price")
        .and_then(|v| v.as_f64())
        .or(req.spotPrice)
        .unwrap_or(0.0)
        .max(0.0);
    let kas_spot_str: Option<String> = redis::cmd("GET")
        .arg("oracle:spot:KAS_USDC")
        .query_async(&mut redis_conn)
        .await
        .unwrap_or(None);
    let live_kas_spot = kas_spot_str
        .and_then(|s| s.parse::<f64>().ok())
        .filter(|&v| v > 0.0)
        .unwrap_or(0.0);
    let mode = req.action.trim().to_uppercase();
    if mode == "CONFIRM_PASSTHROUGH_FILL" {
        if spot_price <= 0.0 && live_kas_spot <= 0.0 {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": "ORACLE_HALT: Live KAS/USDC spot price is unavailable and no execution spot price was provided."})),
            ));
        }
        let resolved_tx = req
            .txHash
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| format!("PT-FILL-{}", uuid::Uuid::new_v4().simple()));
        let _ = sqlx::query(
            "INSERT INTO pending_transactions (tx_id, wallet_address, amount_kas, action_type, status)
             VALUES ($1, $2, $3, 'PASSTHROUGH_L1_FILL', 'SETTLED')
             ON CONFLICT (tx_id) DO UPDATE SET status = 'SETTLED'",
        )
        .bind(&resolved_tx)
        .bind(&prefixed_wallet)
        .bind(gross_kas)
        .execute(&pool)
        .await;
        let gross_usd = if spot_price > 0.0 && estimated_output > 0.0 {
            estimated_output * spot_price
        } else {
            gross_kas * live_kas_spot
        };
        let resolved_unit_spot = if spot_price > 0.0 {
            spot_price
        } else if estimated_output > 0.0 {
            gross_usd / estimated_output
        } else {
            live_kas_spot
        };
        let _ = crate::sor::record_hifo_acquisition_lot(
            &pool,
            &clean_wallet,
            &target_asset,
            estimated_output,
            resolved_unit_spot,
            "PASSTHROUGH_SETTLED",
            Some(&resolved_tx),
        )
        .await;
        let _ = sqlx::query(
            "INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash, cost_basis_usd, realized_gain_loss_usd, holding_period)
             VALUES ($1, $2, 'PASSTHROUGH_SETTLED', $3, $4, $5, $6, $3, 0.0, 'SHORT_TERM')",
        )
        .bind(&clean_wallet)
        .bind(&target_asset)
        .bind(gross_usd)
        .bind(estimated_output)
        .bind(resolved_unit_spot)
        .bind(&resolved_tx)
        .execute(&pool)
        .await;
        let sse_event = json!({
            "fiat_event": true,
            "eventType": "PASSTHROUGH_SETTLED",
            "wallet": clean_wallet,
            "assetTicker": target_asset,
            "amountTokens": estimated_output,
            "txHash": resolved_tx
        });
        let _: () = redis::cmd("PUBLISH")
            .arg("telemetry:updates")
            .arg(sse_event.to_string())
            .query_async(&mut redis_conn)
            .await
            .unwrap_or(());
        return Ok(Json(json!({
            "success": true,
            "action": "CONFIRM_PASSTHROUGH_FILL",
            "wallet": prefixed_wallet,
            "targetAsset": target_asset,
            "txHash": resolved_tx
        })));
    } else if mode == "REFUND_PASSTHROUGH_ORDER" {
        if clean_wallet.is_empty() || gross_kas <= 0.0 {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Invalid pass-through wallet or gross_kas amount to refund."})),
            ));
        }
        let user_ledger_key = format!("dev:sor:treasury:balances:{}", clean_wallet);
        let _: () = redis::cmd("HINCRBYFLOAT")
            .arg(&user_ledger_key)
            .arg("KAS")
            .arg(gross_kas)
            .query_async(&mut redis_conn)
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("Failed to credit miner ledger: {}", e)})),
                )
            })?;
        if upfront_fee_kas > 0.0 {
            let _: Result<String, _> = redis::cmd("EVAL")
                .arg(LUA_CLAMPED_FEE_REVERSAL)
                .arg(1)
                .arg("perennia:fees:batch_accumulated:KAS")
                .arg(upfront_fee_kas)
                .query_async(&mut redis_conn)
                .await;
        }
        let refund_kas_spot = if live_kas_spot > 0.0 {
            live_kas_spot
        } else {
            spot_price
        };
        let _ = sqlx::query(
            "INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution)
             VALUES ($1, 'KAS', 'PASSTHROUGH_REFUND', $2, $3, $4)",
        )
        .bind(&clean_wallet)
        .bind(gross_kas * refund_kas_spot)
        .bind(gross_kas)
        .bind(refund_kas_spot)
        .execute(&pool)
        .await;
        let sse_event = json!({
            "fiat_event": true,
            "eventType": "PASSTHROUGH_REFUND",
            "wallet": clean_wallet,
            "assetTicker": "KAS",
            "amountTokens": gross_kas
        });
        let _: () = redis::cmd("PUBLISH")
            .arg("telemetry:updates")
            .arg(sse_event.to_string())
            .query_async(&mut redis_conn)
            .await
            .unwrap_or(());
        return Ok(Json(json!({
            "success": true,
            "action": "REFUND_PASSTHROUGH_ORDER",
            "wallet": prefixed_wallet,
            "refundedKas": gross_kas,
            "reversedFeeKas": upfront_fee_kas
        })));
    }
    Err((
        StatusCode::BAD_REQUEST,
        Json(json!({"error": format!("Unsupported pass-through action: {}", mode)})),
    ))
}
async fn handle_fiat_action(
    headers: HeaderMap,
    State(pool): State<PgPool>,
    Json(req): Json<FiatAdminReq>,
) -> Result<Json<Value>, (StatusCode, Json<Value>)> {
    verify_internal_admin_headers(&headers)?;
    let mode = req.action.trim().to_uppercase();
    if mode == "FORCE_EPOCH_BELL" {
        return handle_force_epoch_bell(headers, State(pool)).await;
    }
    let redis_url = env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1/".to_string());
    let redis_client = redis::Client::open(redis_url).map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error": e.to_string()})),
        )
    })?;
    let mut redis_conn = redis_client
        .get_multiplexed_async_connection()
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": e.to_string()})),
            )
        })?;
    if mode == "SET_TOKEN_STEERING_STATE" || mode == "UPSERT_STEERING_TOKEN" {
        let ticker = req
            .ticker
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_uppercase();
        let next_state = req
            .steeringState
            .as_deref()
            .unwrap_or("AUTO_BALANCE")
            .trim()
            .to_uppercase();
        if ticker.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "ticker is required for SET_TOKEN_STEERING_STATE"})),
            ));
        }
        let is_whitelisted = next_state == "AUTO_BALANCE"
            || next_state == "ACCUMULATE"
            || next_state == "FREEZE";
        let target_weight = req.targetWeightPct.unwrap_or(5.0).clamp(0.0, 100.0);
        let _ = sqlx::query(
            r#"
            INSERT INTO token_steering_matrix (ticker, asset_name, steering_state, is_whitelisted, target_weight_pct, updated_at)
            VALUES ($1, $1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (ticker) DO UPDATE SET
                steering_state = EXCLUDED.steering_state,
                is_whitelisted = EXCLUDED.is_whitelisted,
                target_weight_pct = EXCLUDED.target_weight_pct,
                updated_at = CURRENT_TIMESTAMP
            "#,
        )
        .bind(&ticker)
        .bind(&next_state)
        .bind(is_whitelisted)
        .bind(target_weight)
        .execute(&pool)
        .await;
        let _: redis::RedisResult<()> = redis::cmd("HSET")
            .arg("perennia:steering:token_states")
            .arg(&ticker)
            .arg(&next_state)
            .query_async(&mut redis_conn)
            .await;
        return Ok(Json(json!({
            "success": true,
            "action": "SET_TOKEN_STEERING_STATE",
            "ticker": ticker,
            "steeringState": next_state,
            "isWhitelisted": is_whitelisted
        })));
    }
    if mode == "TOGGLE_MAINTENANCE_GRACE_SHIELD" {
        let next_enabled = req.enabled.unwrap_or(true);
        let _: redis::RedisResult<()> = redis::cmd("SET")
            .arg("perennia:stratum:maintenance_grace_shield")
            .arg(if next_enabled { "1" } else { "0" })
            .query_async(&mut redis_conn)
            .await;
        return Ok(Json(json!({
            "success": true,
            "action": "TOGGLE_MAINTENANCE_GRACE_SHIELD",
            "maintenanceGraceShield": next_enabled
        })));
    }
    if mode == "TOGGLE_SUBSYSTEM_KILLSWITCH" {
        let sub = req
            .subsystem
            .as_deref()
            .unwrap_or("fiat_onramp")
            .trim()
            .to_lowercase();
        let paused = req.paused.unwrap_or(true);
        let key = format!("perennia:killswitch:{}", sub);
        let _: redis::RedisResult<()> = redis::cmd("SET")
            .arg(&key)
            .arg(if paused { "1" } else { "0" })
            .query_async(&mut redis_conn)
            .await;
        return Ok(Json(json!({
            "success": true,
            "action": "TOGGLE_SUBSYSTEM_KILLSWITCH",
            "subsystem": sub,
            "paused": paused
        })));
    }
    if mode == "BULK_SETTLE_FIAT_PAYOUTS" {
        let prefix = req
            .batchTracePrefix
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                let date_str = chrono::Utc::now().format("%Y%m%d").to_string();
                let short_hex = &uuid::Uuid::new_v4().simple().to_string().to_uppercase()[..4];
                format!("ACH-BATCH-{}-{}", date_str, short_hex)
            });
        let pending_rows = sqlx::query(
            "SELECT payout_id, wallet_address, net_fiat_usd FROM fiat_payout_queue WHERE status = 'QUEUED_FOR_TREASURY_DISPATCH' ORDER BY created_at ASC",
        )
        .fetch_all(&pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Failed to fetch pending payouts: {}", e)})),
            )
        })?;
        let mut settled_count = 0usize;
        let mut total_usd = 0.0f64;
        for (idx, r) in pending_rows.iter().enumerate() {
            let pid: String = r.try_get("payout_id").unwrap_or_default();
            let w_addr: String = r.try_get("wallet_address").unwrap_or_default();
            let net_usd: f64 = r.try_get("net_fiat_usd").unwrap_or(0.0);
            let trace_id = format!("{}-{:03}", prefix, idx + 1);
            let res = sqlx::query(
                "UPDATE fiat_payout_queue SET status = 'DISPATCHED_BY_DIRECTOR', trace_id = $2, updated_at = CURRENT_TIMESTAMP WHERE payout_id = $1 AND status = 'QUEUED_FOR_TREASURY_DISPATCH'",
            )
            .bind(&pid)
            .bind(&trace_id)
            .execute(&pool)
            .await;
            if res.is_ok() {
                settled_count += 1;
                total_usd += net_usd;
                let clean_wallet = w_addr.trim().to_lowercase().replace("kaspa:", "");
                let sse_event = json!({
                    "fiat_event": true,
                    "eventType": "FIAT_DISPATCHED",
                    "wallet": clean_wallet,
                    "payoutId": pid,
                    "traceId": trace_id,
                    "netFiatUsd": net_usd
                });
                let _: () = redis::cmd("PUBLISH")
                    .arg("telemetry:updates")
                    .arg(sse_event.to_string())
                    .query_async(&mut redis_conn)
                    .await
                    .unwrap_or(());
            }
        }
        return Ok(Json(json!({
            "success": true,
            "action": "BULK_SETTLE_FIAT_PAYOUTS",
            "settledCount": settled_count,
            "totalDispatchedUsd": (total_usd * 100.0).round() / 100.0,
            "batchTracePrefix": prefix
        })));
    }
    if mode == "SETTLE_FIAT_PAYOUT" {
        let payout_id = req.payoutId.as_deref().unwrap_or("").trim().to_string();
        if payout_id.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "payoutId is required"})),
            ));
        }
        let resolved_trace_id = req
            .traceId
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_else(|| {
                let hex_str = uuid::Uuid::new_v4().simple().to_string().to_uppercase();
                format!("ACH-TRACE-{}", &hex_str[..10])
            });
        let updated = sqlx::query(
            "UPDATE fiat_payout_queue
             SET status = 'DISPATCHED_BY_DIRECTOR', trace_id = $2, updated_at = CURRENT_TIMESTAMP
             WHERE payout_id = $1 AND status = 'QUEUED_FOR_TREASURY_DISPATCH'
             RETURNING wallet_address, net_fiat_usd",
        )
        .bind(&payout_id)
        .bind(&resolved_trace_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Failed to update payout status: {}", e)})),
            )
        })?;
        let Some(row) = updated else {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "Fiat payout not found or already finalized."})),
            ));
        };
        let wallet_address: String = row.try_get("wallet_address").unwrap_or_default();
        let clean_wallet = wallet_address.trim().to_lowercase().replace("kaspa:", "");
        let net_fiat_usd: f64 = row.try_get("net_fiat_usd").unwrap_or(0.0);
        let sse_event = json!({
            "fiat_event": true,
            "eventType": "FIAT_DISPATCHED",
            "wallet": clean_wallet,
            "payoutId": payout_id,
            "traceId": resolved_trace_id,
            "netFiatUsd": net_fiat_usd
        });
        let _: () = redis::cmd("PUBLISH")
            .arg("telemetry:updates")
            .arg(sse_event.to_string())
            .query_async(&mut redis_conn)
            .await
            .unwrap_or(());
        return Ok(Json(json!({
            "success": true,
            "payoutId": payout_id,
            "traceId": resolved_trace_id,
            "status": "DISPATCHED_BY_DIRECTOR"
        })));
    }
    if mode == "REFUND_FIAT_PAYOUT" {
        let payout_id = req.payoutId.as_deref().unwrap_or("").trim().to_string();
        if payout_id.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "payoutId is required"})),
            ));
        }
        let row_opt = sqlx::query(
            "SELECT wallet_address, source_asset, amount_crypto, gross_usd, fee_usd, status FROM fiat_payout_queue WHERE payout_id = $1 LIMIT 1",
        )
        .bind(&payout_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("DB lookup failed: {}", e)})),
            )
        })?;
        let row = row_opt.ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Fiat payout record not found."})),
            )
        })?;
        let current_status: String = row.try_get("status").unwrap_or_default();
        if current_status != "QUEUED_FOR_TREASURY_DISPATCH" {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": format!("Payout {} cannot be refunded from status {}.", payout_id, current_status)})),
            ));
        }
        let wallet_address: String = row.try_get("wallet_address").unwrap_or_default();
        let source_asset: String = row
            .try_get::<String, _>("source_asset")
            .unwrap_or_else(|_| "KAS".to_string())
            .to_uppercase();
        let amount_crypto: f64 = row.try_get("amount_crypto").unwrap_or(0.0);
        let gross_usd: f64 = row.try_get("gross_usd").unwrap_or(0.0);
        let fee_usd: f64 = row.try_get("fee_usd").unwrap_or(0.0);
        let clean_wallet = wallet_address
            .trim()
            .to_lowercase()
            .replace("kaspa:", "");
        let user_ledger_key = format!("dev:sor:treasury:balances:{}", clean_wallet);
        let _: () = redis::cmd("HINCRBYFLOAT")
            .arg(&user_ledger_key)
            .arg(&source_asset)
            .arg(amount_crypto)
            .query_async(&mut redis_conn)
            .await
            .map_err(|e| {
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({"error": format!("Failed to refund ledger: {}", e)})),
                )
            })?;
        if fee_usd > 0.0 {
            let _: Result<String, _> = redis::cmd("EVAL")
                .arg(LUA_CLAMPED_FEE_REVERSAL)
                .arg(1)
                .arg("perennia:treasury:netting_profit_usd")
                .arg(fee_usd)
                .query_async(&mut redis_conn)
                .await;
        }
        sqlx::query(
            "UPDATE fiat_payout_queue SET status = 'REFUNDED_TO_LEDGER', updated_at = CURRENT_TIMESTAMP WHERE payout_id = $1",
        )
        .bind(&payout_id)
        .execute(&pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Failed to update payout status: {}", e)})),
            )
        })?;
        let spot = if amount_crypto > 0.0 {
            gross_usd / amount_crypto
        } else {
            1.0
        };
        let _ = sqlx::query(
            "INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash)
             VALUES ($1, $2, 'FIAT_REFUND', $3, $4, $5, $6)",
        )
        .bind(&clean_wallet)
        .bind(&source_asset)
        .bind(gross_usd)
        .bind(amount_crypto)
        .bind(spot)
        .bind(&payout_id)
        .execute(&pool)
        .await;
        let sse_event = json!({
            "fiat_event": true,
            "eventType": "FIAT_REFUND",
            "wallet": clean_wallet,
            "payoutId": payout_id,
            "assetTicker": source_asset,
            "amountTokens": amount_crypto
        });
        let _: () = redis::cmd("PUBLISH")
            .arg("telemetry:updates")
            .arg(sse_event.to_string())
            .query_async(&mut redis_conn)
            .await
            .unwrap_or(());
        return Ok(Json(json!({
            "success": true,
            "payoutId": payout_id,
            "status": "REFUNDED_TO_LEDGER",
            "refundedAsset": source_asset,
            "refundedAmount": amount_crypto
        })));
    }
    if mode == "FULFILL_FIAT_ONRAMP"
        || mode == "CONFIRM_INSTITUTIONAL_WIRE"
        || mode == "RELEASE_QUARANTINED_STRIPE_ORDER"
        || mode == "REFUND_QUARANTINED_STRIPE_ORDER"
        || mode == "CANCEL_FIAT_ONRAMP"
    {
        let order_id = req.orderId.as_deref().unwrap_or("").trim().to_string();
        if order_id.is_empty() {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": "orderId is required"})),
            ));
        }
        let row_opt = sqlx::query(
            r#"
            SELECT wallet_address, settlement_target, COALESCE(target_asset, 'KAS') AS target_asset,
                   fiat_amount_usd, fee_usd, net_usd_converted, locked_spot_price, estimated_kas,
                   COALESCE(quoted_principal_cents, 0) AS quoted_principal_cents,
                   COALESCE(perennia_fee_cents, 250) AS perennia_fee_cents,
                   settled_net_cents, status
            FROM fiat_onramp_orders
            WHERE order_id = $1
            LIMIT 1
            "#,
        )
        .bind(&order_id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("DB lookup failed: {}", e)})),
            )
        })?;
        let row = row_opt.ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                Json(json!({"error": "Fiat on-ramp order not found."})),
            )
        })?;
        let current_status: String = row.try_get("status").unwrap_or_default();
        if current_status == "COMPLETED" || current_status == "CANCELLED" {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"error": format!("On-ramp order {} is already {}.", order_id, current_status)})),
            ));
        }
        let wallet_address: String = row.try_get("wallet_address").unwrap_or_default();
        let clean_wallet = wallet_address.trim().to_lowercase().replace("kaspa:", "");
        let prefixed_wallet = format!("kaspa:{}", clean_wallet);
        if mode == "CANCEL_FIAT_ONRAMP" || mode == "REFUND_QUARANTINED_STRIPE_ORDER" {
            let new_st = if mode == "REFUND_QUARANTINED_STRIPE_ORDER" {
                "REFUNDED_BY_DIRECTOR"
            } else {
                "CANCELLED"
            };
            let _ = sqlx::query(
                "UPDATE fiat_onramp_orders SET status = $2, updated_at = CURRENT_TIMESTAMP WHERE order_id = $1",
            )
            .bind(&order_id)
            .bind(new_st)
            .execute(&pool)
            .await;
            return Ok(Json(json!({
                "success": true,
                "orderId": order_id,
                "status": new_st
            })));
        }
        let target_asset: String = row
            .try_get("target_asset")
            .unwrap_or_else(|_| "KAS".to_string())
            .to_uppercase();
        let fiat_amount_usd: f64 = row.try_get("fiat_amount_usd").unwrap_or(0.0);
        let fee_usd: f64 = row.try_get("fee_usd").unwrap_or(0.0);
        let raw_net_usd: f64 = row.try_get("net_usd_converted").unwrap_or(0.0);
        let locked_spot_price: f64 = row.try_get("locked_spot_price").unwrap_or(0.0);
        let quoted_principal_cents: i64 = row.try_get("quoted_principal_cents").unwrap_or(0);
        let perennia_fee_cents: i64 = row.try_get("perennia_fee_cents").unwrap_or(250).max(250);
        let settled_net_cents_opt: Option<i64> = row.try_get("settled_net_cents").ok().flatten();
        let net_usd_converted = if let Some(settled_net) = settled_net_cents_opt {
            let qp = if quoted_principal_cents > 0 {
                quoted_principal_cents
            } else {
                (raw_net_usd * 100.0).round() as i64
            };
            let capped = qp.min((settled_net - perennia_fee_cents).max(0));
            (capped as f64) / 100.0
        } else {
            raw_net_usd
        };
        if net_usd_converted <= 0.0 {
            return Err((
                StatusCode::UNPROCESSABLE_ENTITY,
                Json(json!({"error": "ZERO_LOSS_LOCK: Safe fulfilled principal after locking Perennia fee is $0.00."})),
            ));
        }
        let live_spot_str: Option<String> = redis::cmd("GET")
            .arg(format!("oracle:spot:{}_USDC", target_asset))
            .query_async(&mut redis_conn)
            .await
            .unwrap_or(None);
        let execution_spot = if target_asset == "USDC" || target_asset == "USDT" {
            1.0
        } else {
            live_spot_str
                .and_then(|s| s.parse::<f64>().ok())
                .filter(|&v| v > 0.0)
                .unwrap_or(locked_spot_price)
        };
        if execution_spot <= 0.0 {
            return Err((
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({"error": format!("ORACLE_HALT: Live {}/USDC spot price is unavailable and order has no valid locked spot price.", target_asset)})),
            ));
        }
        let delivered_tokens =
            ((net_usd_converted / execution_spot) * 10000.0).round() / 10000.0;
        let settlement_target = req
            .settlementTarget
            .clone()
            .or_else(|| row.try_get::<String, _>("settlement_target").ok())
            .unwrap_or_else(|| "LEDGER_KAS".to_string())
            .to_uppercase();
        let mut resolved_tx_hash = req
            .txHash
            .as_deref()
            .map(|s| s.trim())
            .filter(|s| !s.is_empty())
            .map(|s| s.to_string())
            .unwrap_or_default();
        if settlement_target == "L1_KAS" && target_asset == "KAS" {
            let idemp_key = format!(
                "FIAT-ONRAMP-L1-{}-{}",
                order_id,
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs()
                    / 60
            );
            let payouts_vec = vec![(prefixed_wallet.clone(), delivered_tokens)];
            match crate::sor::execute_idempotent_mass_physical_settlement(
                &pool,
                &idemp_key,
                &payouts_vec,
            )
            .await
            {
                Ok(tx_id) => {
                    resolved_tx_hash = tx_id;
                }
                Err(e) => {
                    return Err((
                        StatusCode::BAD_GATEWAY,
                        Json(json!({"error": format!("L1 KAS dispatch failed: {}", e)})),
                    ));
                }
            }
        } else {
            let _ = crate::state_api::credit_user_token_balance(
                &pool,
                &clean_wallet,
                &prefixed_wallet,
                &target_asset,
                delivered_tokens,
                false,
            )
            .await;
            if resolved_tx_hash.is_empty() {
                let hex_str = uuid::Uuid::new_v4().simple().to_string().to_uppercase();
                resolved_tx_hash = format!("LEDGER-ONRAMP-{}", &hex_str[..10]);
            }
        }
        sqlx::query(
            "UPDATE fiat_onramp_orders
             SET status = 'COMPLETED', delivered_kas = $2, estimated_tokens = $2, tx_hash = $3, settlement_target = $4, updated_at = CURRENT_TIMESTAMP
             WHERE order_id = $1",
        )
        .bind(&order_id)
        .bind(delivered_tokens)
        .bind(&resolved_tx_hash)
        .bind(&settlement_target)
        .execute(&pool)
        .await
        .map_err(|e| {
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(json!({"error": format!("Failed to finalize on-ramp order: {}", e)})),
            )
        })?;
        let effective_unit_basis = if delivered_tokens > 0.0 {
            fiat_amount_usd / delivered_tokens
        } else {
            execution_spot
        };
        let _ = crate::sor::record_hifo_acquisition_lot(
            &pool,
            &clean_wallet,
            &target_asset,
            delivered_tokens,
            effective_unit_basis,
            "FIAT_ONRAMP",
            Some(&resolved_tx_hash),
        )
        .await;
        let _ = sqlx::query(
            "INSERT INTO tax_ledger_events (wallet_address, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, tx_hash, cost_basis_usd, realized_gain_loss_usd, holding_period)
             VALUES ($1, $2, 'FIAT_ONRAMP', $3, $4, $5, $6, $3, 0.0, 'SHORT_TERM')",
        )
        .bind(&clean_wallet)
        .bind(&target_asset)
        .bind(fiat_amount_usd)
        .bind(delivered_tokens)
        .bind(execution_spot)
        .bind(&resolved_tx_hash)
        .execute(&pool)
        .await;
        let netting_order = json!({
            "wallet": "kaspa:treasury_onramp_credit",
            "direction": "BUY_KAS",
            "amount_kas": delivered_tokens,
            "spot_price": execution_spot,
            "fee_captured_usd": fee_usd,
            "target_asset": "USD",
            "estimated_output": delivered_tokens
        });
        let _: () = redis::cmd("RPUSH")
            .arg("perennia:sor:netting_queue")
            .arg(netting_order.to_string())
            .query_async(&mut redis_conn)
            .await
            .unwrap_or(());
        let sse_event = json!({
            "fiat_event": true,
            "eventType": "FIAT_ONRAMP",
            "status": "COMPLETED",
            "wallet": clean_wallet,
            "sessionId": order_id,
            "assetTicker": target_asset,
            "amountTokens": delivered_tokens,
            "fiatAmountUsd": fiat_amount_usd,
            "spotPrice": execution_spot,
            "txHash": resolved_tx_hash
        });
        let _: () = redis::cmd("PUBLISH")
            .arg("telemetry:updates")
            .arg(sse_event.to_string())
            .query_async(&mut redis_conn)
            .await
            .unwrap_or(());
        return Ok(Json(json!({
            "success": true,
            "orderId": order_id,
            "status": "COMPLETED",
            "deliveredKas": delivered_tokens,
            "deliveredTokens": delivered_tokens,
            "targetAsset": target_asset,
            "txHash": resolved_tx_hash
        })));
    }
    Err((
        StatusCode::BAD_REQUEST,
        Json(json!({"error": format!("Unsupported fiat action: {}", mode)})),
    ))
}
```

## File: src/state_api.rs
```rust
#[path = "silverscript.rs"]
pub mod silverscript;
#[path = "l1_dispatcher.rs"]
pub mod l1_dispatcher;
#[path = "forge_queries.rs"]
pub mod forge_queries;
pub use forge_queries::*;
pub use l1_dispatcher::*;
pub use silverscript::*;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde::Deserialize;
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::env;
use std::time::{SystemTime, UNIX_EPOCH};
#[derive(Debug, Deserialize)]
pub struct StateActionRequest {
    pub wallet: Option<String>,
    pub action: String,
    #[serde(default)]
    pub payload: Value,
}
fn normalize_wallet_pair(raw: &str) -> (String, String) {
    let clean = raw
        .trim()
        .to_lowercase()
        .replace("kaspa:", "")
        .trim()
        .to_string();
    let prefixed = format!("kaspa:{}", clean);
    (clean, prefixed)
}
fn compute_silo_fee_tier(staked: f64) -> (f64, &'static str) {
    if staked >= 1_000_000.0 {
        (0.001, "SILO Whale Tier (0.10% Wholesale Floor)")
    } else if staked >= 100_000.0 {
        (0.0025, "SILO Sovereign Tier (0.25% Fee)")
    } else if staked >= 10_000.0 {
        (0.0075, "SILO Staker Tier (0.75% Fee)")
    } else {
        (0.0015, "0.15% Standard Public Tier")
    }
}
async fn query_wallet_miner_loyalty_telemetry(
    pool: &PgPool,
    clean_wallet: &str,
    prefixed_wallet: &str,
) -> Value {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let grace_cutoff_ms = now_ms.saturating_sub(crate::telemetry::DISCONNECT_GRACE_WINDOW_MS) as i64;
    let grace_cutoff_secs = (now_ms / 1000)
        .saturating_sub(crate::telemetry::DISCONNECT_GRACE_WINDOW_SECS) as i64;
    if let Ok(redis_url) = env::var("REDIS_URL") {
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                if let Ok(Some(cached_json)) = redis::cmd("GET")
                    .arg(format!("perennia:miner:loyalty:{}", clean_wallet))
                    .query_async::<_, Option<String>>(&mut conn)
                    .await
                {
                    if let Ok(parsed) = serde_json::from_str::<Value>(&cached_json) {
                        return parsed;
                    }
                }
            }
        }
    }
    let rows = sqlx::query(
        r#"
        SELECT status, last_share_ts,
               COALESCE(streak_started_ts, 0) AS streak_started_ts,
               COALESCE(effective_fee_rate, 0.01) AS effective_fee_rate
        FROM worker_profiles
        WHERE (LOWER(REPLACE(TRIM(wallet_address), 'kaspa:', '')) = $1 OR wallet_address = $2)
          AND (
              status IN ('online', 'grace_period')
              OR (last_share_ts > 10000000000 AND last_share_ts >= $3)
              OR (last_share_ts > 0 AND last_share_ts <= 10000000000 AND last_share_ts >= $4)
          )
        ORDER BY effective_fee_rate ASC, streak_started_ts ASC
        "#,
    )
    .bind(clean_wallet)
    .bind(prefixed_wallet)
    .bind(grace_cutoff_ms)
    .bind(grace_cutoff_secs)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    if rows.is_empty() {
        return json!({
            "wallet": prefixed_wallet,
            "activeMiner": false,
            "isOnline": false,
            "inGraceWindow": false,
            "streakStartedTs": 0,
            "consecutiveWeeks": 0,
            "effectivePoolFeeRate": crate::telemetry::BASE_POOL_FEE_RATE,
            "effectivePoolFeePct": 1.0,
            "unlockedSwapFeeFloorRate": crate::fiat_rails::STANDARD_PUBLIC_SWAP_FEE_PCT,
            "unlockedSwapFeeFloorPct": 0.15,
            "graceWindowSecsRemaining": 0
        });
    }
    let best = &rows[0];
    let status: String = best.try_get("status").unwrap_or_else(|_| "online".to_string());
    let raw_last_ts: i64 = best.try_get("last_share_ts").unwrap_or(0);
    let last_ms = if raw_last_ts > 0 && (raw_last_ts as u64) < 10_000_000_000 {
        (raw_last_ts as u64) * 1000
    } else {
        raw_last_ts.max(0) as u64
    };
    let raw_streak_ts: i64 = best.try_get("streak_started_ts").unwrap_or(raw_last_ts);
    let streak_ms = if raw_streak_ts > 0 && (raw_streak_ts as u64) < 10_000_000_000 {
        (raw_streak_ts as u64) * 1000
    } else if raw_streak_ts > 0 {
        raw_streak_ts as u64
    } else {
        last_ms
    };
    let (consecutive_weeks, eff_pool_fee_rate) = crate::telemetry::compute_miner_loyalty_fee_rate(
        streak_ms,
        now_ms,
        crate::telemetry::BASE_POOL_FEE_RATE,
    );
    let idle_secs = now_ms.saturating_sub(last_ms) / 1000;
    let grace_rem = crate::telemetry::DISCONNECT_GRACE_WINDOW_SECS.saturating_sub(idle_secs);
    let is_online = status == "online" && idle_secs < 60;
    json!({
        "wallet": prefixed_wallet,
        "activeMiner": true,
        "isOnline": is_online,
        "inGraceWindow": !is_online && grace_rem > 0,
        "streakStartedTs": streak_ms,
        "consecutiveWeeks": consecutive_weeks,
        "effectivePoolFeeRate": eff_pool_fee_rate,
        "effectivePoolFeePct": (eff_pool_fee_rate * 10000.0).round() / 100.0,
        "unlockedSwapFeeFloorRate": crate::telemetry::MINER_PERK_SWAP_FEE_FLOOR_RATE,
        "unlockedSwapFeeFloorPct": 0.10,
        "graceWindowSecsRemaining": grace_rem
    })
}
fn lock_multiplier_for_days(days: i32) -> f64 {
    if days >= 365 {
        2.5
    } else if days >= 90 {
        1.5
    } else if days >= 30 {
        1.2
    } else {
        1.0
    }
}
pub async fn resolve_strict_spot_price(pool: &PgPool, asset_ticker: &str) -> Result<f64, String> {
    let clean = asset_ticker.trim().to_uppercase();
    if clean == "USD" || clean == "USDC" || clean == "USDT" {
        return Ok(1.0);
    }
    if let Ok(redis_url) = env::var("REDIS_URL") {
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                if let Ok(Some(spot_str)) = redis::cmd("GET")
                    .arg(format!("oracle:spot:{}_USDC", clean))
                    .query_async::<_, Option<String>>(&mut conn)
                    .await
                {
                    if let Ok(parsed) = spot_str.parse::<f64>() {
                        if parsed.is_finite() && parsed > 0.0 {
                            return Ok(parsed);
                        }
                    }
                }
            }
        }
    }
    if let Ok(Some(row)) = sqlx::query(
        r#"
        SELECT price_usd
        FROM rwa_oracle_feeds
        WHERE ticker = $1
          AND price_usd > 0
          AND updated_at >= CURRENT_TIMESTAMP - INTERVAL '15 minutes'
        ORDER BY updated_at DESC
        LIMIT 1
        "#,
    )
    .bind(&clean)
    .fetch_optional(pool)
    .await
    {
        if let Ok(price) = row.try_get::<f64, _>("price_usd") {
            if price.is_finite() && price > 0.0 {
                return Ok(price);
            }
        }
    }
    if clean == "SILO" {
        if let Ok(kas_spot) = Box::pin(resolve_strict_spot_price(pool, "KAS")).await {
            if kas_spot > 0.0 {
                return Ok(((kas_spot / 23.809524) * 1_000_000.0).round() / 1_000_000.0);
            }
        }
    }
    Err(format!(
        "ORACLE_HALT: Live oracle spot price for {} is offline. Failing closed (503).",
        clean
    ))
}
pub async fn debit_user_token_balance(
    pool: &PgPool,
    clean_wallet: &str,
    prefixed_wallet: &str,
    ticker: &str,
    amount: f64,
) -> Result<(), String> {
    if amount <= 0.0_f64 {
        return Err("Debit amount must be greater than 0.".to_string());
    }
    let clean_ticker = ticker.trim().to_uppercase();
    if clean_ticker == "KAS" {
        if crate::chronos::upsert_signed_yield_reservoir_kas(
            pool, prefixed_wallet, -amount, 0.0_f64, 0.0_f64,
        ).await.is_ok() {
            if let Ok(redis_url) = env::var("REDIS_URL") {
                if let Ok(client) = redis::Client::open(redis_url) {
                    if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                        let key = format!("dev:sor:treasury:balances:{}", clean_wallet);
                        let cur: f64 = redis::cmd("HGET").arg(&key).arg("KAS")
                            .query_async::<_, Option<String>>(&mut conn).await
                            .ok().flatten().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0_f64);
                        let _: redis::RedisResult<()> = redis::cmd("HSET").arg(&key).arg("KAS")
                            .arg((cur - amount).max(0.0_f64).to_string()).query_async(&mut conn).await;
                    }
                }
            }
            return Ok(());
        }
    }
    let row_opt = sqlx::query(
        r#"
        SELECT wallet_address, streaming_balance_kas, total_yield_kas,
               COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens,
               COALESCE(quarantined, FALSE) AS quarantined
        FROM yield_reservoirs
        WHERE wallet_address = $1 OR wallet_address = $2
        LIMIT 1
        "#,
    ).bind(prefixed_wallet).bind(clean_wallet).fetch_optional(pool).await
    .map_err(|e| format!("DB lookup failed: {}", e))?;
    let mut db_avail: f64 = 0.0_f64;
    if let Some(ref row) = row_opt {
        if row.try_get::<bool, _>("quarantined").unwrap_or(false) {
            return Err(format!("Wallet {} is quarantined.", prefixed_wallet));
        }
        if clean_ticker != "KAS" {
            let streaming_kas: f64 = row.try_get("streaming_balance_kas").unwrap_or(0.0_f64);
            let total_yield_kas: f64 = row.try_get("total_yield_kas").unwrap_or(0.0_f64);
            let mut lp_tokens: Value = row.try_get("lp_tokens").unwrap_or_else(|_| json!({}));
            let target_pk: String = row.try_get("wallet_address").unwrap_or_else(|_| prefixed_wallet.to_string());
            let cur_tok: f64 = lp_tokens.get(&clean_ticker)
                .and_then(|v| v.as_f64().or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok())))
                .unwrap_or(0.0_f64);
            db_avail = cur_tok;
            if cur_tok + 1e-8_f64 >= amount {
                let next_tok: f64 = ((cur_tok - amount).max(0.0_f64) * 1e8_f64).round() / 1e8_f64;
                if let Some(obj) = lp_tokens.as_object_mut() {
                    obj.insert(clean_ticker.clone(), json!(next_tok));
                }
                let new_hmac = crate::chronos::compute_reservoir_hmac(
                    prefixed_wallet, streaming_kas, total_yield_kas, &lp_tokens,
                )?;
                sqlx::query(
                    "UPDATE yield_reservoirs SET lp_tokens = $2, row_hmac_sig = $3, last_updated = CURRENT_TIMESTAMP WHERE wallet_address = $1",
                ).bind(&target_pk).bind(&lp_tokens).bind(&new_hmac).execute(pool).await
                .map_err(|e| format!("Failed to update token reservoir balance: {}", e))?;
                if let Ok(redis_url) = env::var("REDIS_URL") {
                    if let Ok(client) = redis::Client::open(redis_url) {
                        if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                            let key = format!("dev:sor:treasury:balances:{}", clean_wallet);
                            let _: redis::RedisResult<()> = redis::cmd("HSET")
                                .arg(&key).arg(&clean_ticker).arg(next_tok.to_string())
                                .query_async(&mut conn).await;
                        }
                    }
                }
                return Ok(());
            }
        } else {
            db_avail = row.try_get("streaming_balance_kas").unwrap_or(0.0_f64);
        }
    }
    if db_avail <= 1e-8_f64 {
        if let Ok(redis_url) = env::var("REDIS_URL") {
            if let Ok(client) = redis::Client::open(redis_url) {
                if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                    let key = format!("dev:sor:treasury:balances:{}", clean_wallet);
                    let cur: f64 = redis::cmd("HGET").arg(&key).arg(&clean_ticker)
                        .query_async::<_, Option<String>>(&mut conn).await
                        .ok().flatten().and_then(|s| s.parse::<f64>().ok()).unwrap_or(0.0_f64);
                    if cur + 1e-8_f64 >= amount {
                        let _: redis::RedisResult<()> = redis::cmd("HSET")
                            .arg(&key).arg(&clean_ticker).arg((cur - amount).max(0.0_f64).to_string())
                            .query_async(&mut conn).await;
                        return Ok(());
                    }
                }
            }
        }
    }
    Err(format!(
        "INSUFFICIENT_BALANCE: Requested {:.4} {}, available {:.4} {}.",
        amount, clean_ticker, db_avail, clean_ticker
    ))
}
pub async fn credit_user_token_balance(
    pool: &PgPool,
    clean_wallet: &str,
    prefixed_wallet: &str,
    ticker: &str,
    amount: f64,
    is_verified_yield: bool,
) -> Result<(), String> {
    if amount <= 0.0 {
        return Ok(());
    }
    let clean_ticker = ticker.trim().to_uppercase();
    if clean_ticker == "KAS" {
        let yield_add = if is_verified_yield { amount } else { 0.0 };
        crate::chronos::upsert_signed_yield_reservoir_kas(
            pool,
            prefixed_wallet,
            amount,
            yield_add,
            amount,
        )
        .await?;
    } else {
        let existing_opt = sqlx::query(
            r#"
            SELECT wallet_address, streaming_balance_kas, total_yield_kas,
                   COALESCE(lp_tokens, '{}'::jsonb) AS lp_tokens
            FROM yield_reservoirs
            WHERE wallet_address = $1 OR wallet_address = $2
            LIMIT 1
            "#,
        )
        .bind(prefixed_wallet)
        .bind(clean_wallet)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("DB lookup failed: {}", e))?;
        let (streaming_kas, total_yield_kas, mut lp_tokens, target_pk) =
            if let Some(r) = existing_opt {
                (
                    r.try_get::<f64, _>("streaming_balance_kas").unwrap_or(0.0),
                    r.try_get::<f64, _>("total_yield_kas").unwrap_or(0.0),
                    r.try_get::<Value, _>("lp_tokens")
                        .unwrap_or_else(|_| json!({})),
                    r.try_get::<String, _>("wallet_address")
                        .unwrap_or_else(|_| prefixed_wallet.to_string()),
                )
            } else {
                (0.0, 0.0, json!({}), prefixed_wallet.to_string())
            };
        let cur_tok = lp_tokens
            .get(&clean_ticker)
            .and_then(|v| {
                v.as_f64()
                    .or_else(|| v.as_str().and_then(|s| s.parse::<f64>().ok()))
            })
            .unwrap_or(0.0);
        if let Some(obj) = lp_tokens.as_object_mut() {
            obj.insert(clean_ticker.clone(), json!(cur_tok + amount));
        } else {
            lp_tokens = json!({ clean_ticker.clone(): cur_tok + amount });
        }
        let new_hmac = crate::chronos::compute_reservoir_hmac(
            prefixed_wallet,
            streaming_kas,
            total_yield_kas,
            &lp_tokens,
        )?;
        sqlx::query(
            r#"
            INSERT INTO yield_reservoirs (
                wallet_address, streaming_balance_kas, total_yield_kas,
                lp_tokens, row_hmac_sig, last_updated
            ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
            ON CONFLICT (wallet_address) DO UPDATE SET
                lp_tokens = EXCLUDED.lp_tokens,
                row_hmac_sig = EXCLUDED.row_hmac_sig,
                last_updated = CURRENT_TIMESTAMP
            "#,
        )
        .bind(&target_pk)
        .bind(streaming_kas)
        .bind(total_yield_kas)
        .bind(&lp_tokens)
        .bind(&new_hmac)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to credit token reservoir: {}", e))?;
    }
    if let Ok(redis_url) = env::var("REDIS_URL") {
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                let key = format!("dev:sor:treasury:balances:{}", clean_wallet);
                let _: redis::RedisResult<()> = redis::cmd("HINCRBYFLOAT")
                    .arg(&key)
                    .arg(&clean_ticker)
                    .arg(amount)
                    .query_async(&mut conn)
                    .await;
            }
        }
    }
    Ok(())
}
pub async fn build_live_node_airlock_telemetry(pool: &PgPool) -> Value {
    let sys_cfg = crate::chronos::load_system_treasury_config(pool).await;
    let hot_signer_address = crate::chronos::resolve_hot_dispatcher_address()
        .unwrap_or_else(|| sys_cfg.cold_kas_address.clone());
    let hot_balance_kas = if !hot_signer_address.trim().is_empty() {
        match crate::kaspad_client::get_balance_by_address_grpc(&hot_signer_address).await {
            Ok(sompi) => (sompi as f64) / 100_000_000.0,
            Err(_) => 0.0,
        }
    } else {
        0.0
    };
    let trailing_24h_outflow_kas: f64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(amount_tokens), 0.0)
        FROM l1_payout_queue
        WHERE asset_ticker = 'KAS'
          AND status = 'DISPATCHED_ONCHAIN'
          AND created_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        "#,
    )
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);
    let hourly_burn_kas = (trailing_24h_outflow_kas / 24.0).max(0.0);
    let runway_hours_remaining = if hourly_burn_kas > 0.01 {
        ((hot_balance_kas / hourly_burn_kas) * 10.0).round() / 10.0
    } else if hot_balance_kas > 0.0 {
        ((hot_balance_kas / (sys_cfg.min_runway_kas.max(10.0) / 24.0)) * 10.0).round() / 10.0
    } else {
        0.0
    };
    let low_runway_tripped = sys_cfg.outflow_breaker_tripped
        || (sys_cfg.min_runway_kas > 0.0
            && hot_balance_kas > 0.0
            && hot_balance_kas < sys_cfg.min_runway_kas);
    let last_sweep_txid: Option<String> = sqlx::query_scalar(
        r#"
        SELECT tx_id
        FROM treasury_airlock_sweeps
        ORDER BY created_at DESC
        LIMIT 1
        "#,
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten();
    let status = if sys_cfg.outflow_breaker_tripped {
        "PAUSED_BY_DIRECTOR"
    } else if low_runway_tripped {
        "LOW_RUNWAY_ALERT"
    } else {
        "ARMED_NOMINAL"
    };
    json!({
        "hotSignerAddress": hot_signer_address,
        "coldVaultAddress": sys_cfg.cold_kas_address,
        "coldBtcAddress": sys_cfg.cold_btc_address,
        "coldEthAddress": sys_cfg.cold_eth_address,
        "coldSolAddress": sys_cfg.cold_sol_address,
        "hotBalanceKas": (hot_balance_kas * 10000.0).round() / 10000.0,
        "hotCeilingKas": sys_cfg.hot_ceiling_kas,
        "minRunwayKas": sys_cfg.min_runway_kas,
        "fppsMaxFloatKas": sys_cfg.fpps_max_float_kas,
        "poolFeeRate": sys_cfg.pool_fee_rate,
        "poolFeeRatePct": (sys_cfg.pool_fee_rate * 10000.0).round() / 100.0,
        "runwayHoursRemaining": runway_hours_remaining,
        "trailing24hOutflowKas": trailing_24h_outflow_kas,
        "lowRunwayBreakerTripped": low_runway_tripped,
        "outflowBreakerTripped": sys_cfg.outflow_breaker_tripped,
        "lastSweepTxid": last_sweep_txid,
        "status": status,
        "updatedAt": sys_cfg.updated_at
    })
}
pub async fn handle_state_action(
    State(pool): State<PgPool>,
    Json(req): Json<StateActionRequest>,
) -> impl IntoResponse {
    let raw_wallet = req.wallet.as_deref().unwrap_or("");
    let (clean_wallet, wallet) = normalize_wallet_pair(raw_wallet);
    let action = req.action.trim().to_uppercase();
    let payload = &req.payload;
    match action.as_str() {
        "GET_STATE" => {
            let row_opt = sqlx::query(
                "SELECT layout_state FROM user_command_centers WHERE wallet_address = $1 OR wallet_address = $2 LIMIT 1",
            )
            .bind(&wallet)
            .bind(&clean_wallet)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten();
            let state_json = row_opt
                .and_then(|r| r.try_get::<Value, _>("layout_state").ok())
                .unwrap_or_else(|| json!({ "workers": [], "sectors": [] }));
            (
                StatusCode::OK,
                Json(json!({ "success": true, "data": state_json })),
            )
        }
        "GET_MINER_LOYALTY" => {
            let loyalty =
                query_wallet_miner_loyalty_telemetry(&pool, &clean_wallet, &wallet).await;
            (
                StatusCode::OK,
                Json(json!({ "success": true, "data": loyalty })),
            )
        }
        "GET_LIVE_BUCKET_THRESHOLDS" => {
            let kas_spot = crate::fiat_rails::resolve_live_spot_price(&pool, "KAS")
                .await
                .unwrap_or(0.15);
            let epoch_state =
                crate::chronos::publish_live_epoch_bucket_telemetry(&pool, kas_spot)
                    .await
                    .unwrap_or_else(|_| json!({}));
            (
                StatusCode::OK,
                Json(json!({ "success": true, "data": epoch_state })),
            )
        }
        "SYNC_LAYOUT"
        | "ADD_WORKER"
        | "DELETE_WORKER"
        | "RENAME_WORKER"
        | "ADD_SECTOR"
        | "DELETE_SECTOR"
        | "RENAME_SECTOR"
        | "REORDER_SECTORS"
        | "UPDATE_SECTOR_ALLOCATION"
        | "UPDATE_SETTLEMENT"
        | "ADD_CUSTOM_TOKEN"
        | "REMOVE_CUSTOM_TOKEN" => {
            let existing_opt = sqlx::query(
                "SELECT layout_state FROM user_command_centers WHERE wallet_address = $1 OR wallet_address = $2 LIMIT 1",
            )
            .bind(&wallet)
            .bind(&clean_wallet)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten();
            let mut layout = existing_opt
                .and_then(|r| r.try_get::<Value, _>("layout_state").ok())
                .unwrap_or_else(|| json!({ "workers": [], "sectors": [], "customTokens": [] }));
            if action == "SYNC_LAYOUT" {
                layout = payload.clone();
            } else if action == "ADD_WORKER" {
                if let Some(arr) = layout.get_mut("workers").and_then(|v| v.as_array_mut()) {
                    arr.push(payload.clone());
                } else {
                    layout["workers"] = json!([payload.clone()]);
                }
            } else if action == "DELETE_WORKER" {
                let target_id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(arr) = layout.get_mut("workers").and_then(|v| v.as_array_mut()) {
                    arr.retain(|w| w.get("id").and_then(|v| v.as_str()) != Some(target_id));
                }
            } else if action == "RENAME_WORKER" {
                let target_id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let new_name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(arr) = layout.get_mut("workers").and_then(|v| v.as_array_mut()) {
                    for w in arr.iter_mut() {
                        if w.get("id").and_then(|v| v.as_str()) == Some(target_id) {
                            w["name"] = json!(new_name);
                            if let Some(ww) = payload.get("walletWorker") {
                                w["walletWorker"] = ww.clone();
                            }
                        }
                    }
                }
            } else if action == "ADD_SECTOR" {
                if let Some(arr) = layout.get_mut("sectors").and_then(|v| v.as_array_mut()) {
                    arr.push(payload.clone());
                } else {
                    layout["sectors"] = json!([payload.clone()]);
                }
            } else if action == "DELETE_SECTOR" {
                let target_id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(arr) = layout.get_mut("sectors").and_then(|v| v.as_array_mut()) {
                    arr.retain(|s| s.get("id").and_then(|v| v.as_str()) != Some(target_id));
                }
            } else if action == "RENAME_SECTOR" {
                let target_id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let new_name = payload.get("name").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(arr) = layout.get_mut("sectors").and_then(|v| v.as_array_mut()) {
                    for s in arr.iter_mut() {
                        if s.get("id").and_then(|v| v.as_str()) == Some(target_id) {
                            s["name"] = json!(new_name);
                        }
                    }
                }
            } else if action == "REORDER_SECTORS" {
                if payload.is_array() {
                    layout["sectors"] = payload.clone();
                }
            } else if action == "UPDATE_SECTOR_ALLOCATION" {
                let target_id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
                let pct = payload
                    .get("allocationPercentage")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0);
                if let Some(arr) = layout.get_mut("sectors").and_then(|v| v.as_array_mut()) {
                    for s in arr.iter_mut() {
                        if s.get("id").and_then(|v| v.as_str()) == Some(target_id) {
                            s["allocationPercentage"] = json!(pct);
                        }
                    }
                }
            } else if action == "UPDATE_SETTLEMENT" {
                let target_id = payload.get("id").and_then(|v| v.as_str()).unwrap_or("");
                if let Some(cfg) = payload.get("config") {
                    if let Some(arr) = layout.get_mut("sectors").and_then(|v| v.as_array_mut()) {
                        for s in arr.iter_mut() {
                            if s.get("id").and_then(|v| v.as_str()) == Some(target_id) {
                                s["settlementConfig"] = cfg.clone();
                            }
                        }
                    }
                }
            } else if action == "ADD_CUSTOM_TOKEN" {
                let tick = payload
                    .get("ticker")
                    .or_else(|| payload.get("symbol"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_uppercase();
                if !tick.is_empty() {
                    crate::oracle::register_dynamic_oracle_ticker(&tick);
                }
                if let Some(arr) = layout
                    .get_mut("customTokens")
                    .and_then(|v| v.as_array_mut())
                {
                    arr.retain(|t| {
                        t.get("ticker")
                            .or_else(|| t.get("symbol"))
                            .and_then(|v| v.as_str())
                            .map(|s| !s.eq_ignore_ascii_case(&tick))
                            .unwrap_or(true)
                    });
                    arr.push(payload.clone());
                } else {
                    layout["customTokens"] = json!([payload.clone()]);
                }
            } else if action == "REMOVE_CUSTOM_TOKEN" {
                let tick = payload
                    .get("ticker")
                    .or_else(|| payload.get("symbol"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_uppercase();
                if let Some(arr) = layout
                    .get_mut("customTokens")
                    .and_then(|v| v.as_array_mut())
                {
                    arr.retain(|t| {
                        t.get("ticker")
                            .or_else(|| t.get("symbol"))
                            .and_then(|v| v.as_str())
                            .map(|s| !s.eq_ignore_ascii_case(&tick))
                            .unwrap_or(true)
                    });
                }
            }
            let _ = sqlx::query(
                r#"
                INSERT INTO user_command_centers (wallet_address, layout_state, last_updated)
                VALUES ($1, $2, CURRENT_TIMESTAMP)
                ON CONFLICT (wallet_address) DO UPDATE SET
                    layout_state = EXCLUDED.layout_state,
                    last_updated = CURRENT_TIMESTAMP
                "#,
            )
            .bind(&wallet)
            .bind(&layout)
            .execute(&pool)
            .await;
            if action.contains("SECTOR") || action == "UPDATE_SETTLEMENT" {
                let pool_bg = pool.clone();
                tokio::spawn(async move {
                    let _ = crate::chronos::publish_live_epoch_bucket_telemetry(&pool_bg, 0.0).await;
                });
            }
            (
                StatusCode::OK,
                Json(json!({ "success": true, "data": layout })),
            )
        }
        "CLAIM_PENDING_SECTOR_KAS" => {
            let target_sector_id = payload
                .get("sectorId")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim();
            let target_asset = payload
                .get("targetAsset")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_uppercase();
            let row_opt = sqlx::query(
                "SELECT wallet_address, layout_state FROM user_command_centers WHERE wallet_address = $1 OR wallet_address = $2 LIMIT 1",
            )
            .bind(&wallet)
            .bind(&clean_wallet)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten();
            let mut verified_claimed_kas = 0.0_f64;
            if let Some(row) = row_opt {
                let db_pk: String = row
                    .try_get("wallet_address")
                    .unwrap_or_else(|_| wallet.clone());
                let mut layout: Value = row
                    .try_get("layout_state")
                    .unwrap_or_else(|_| json!({ "workers": [], "sectors": [] }));
                if let Some(sectors) = layout.get_mut("sectors").and_then(|v| v.as_array_mut()) {
                    for sec in sectors.iter_mut() {
                        let pending = sec
                            .get("pendingKaspa")
                            .and_then(|v| v.as_f64())
                            .unwrap_or(0.0)
                            .max(0.0);
                        if pending <= 0.0 {
                            continue;
                        }
                        let sec_id = sec.get("id").and_then(|v| v.as_str()).unwrap_or("");
                        let sec_ticker = sec
                            .get("settlementConfig")
                            .and_then(|c| c.get("targetAsset"))
                            .and_then(|t| t.get("ticker"))
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .to_uppercase();
                        let matched = (!target_sector_id.is_empty() && sec_id == target_sector_id)
                            || (!target_asset.is_empty() && sec_ticker == target_asset);
                        if matched {
                            verified_claimed_kas += pending;
                            sec["pendingKaspa"] = json!(0.0);
                        }
                    }
                }
                if verified_claimed_kas > 0.0 {
                    let _ = sqlx::query(
                        "UPDATE user_command_centers SET layout_state = $2, last_updated = CURRENT_TIMESTAMP WHERE wallet_address = $1",
                    )
                    .bind(&db_pk)
                    .bind(&layout)
                    .execute(&pool)
                    .await;
                    if let Err(e) = credit_user_token_balance(
                        &pool,
                        &clean_wallet,
                        &wallet,
                        "KAS",
                        verified_claimed_kas,
                        true,
                    )
                    .await
                    {
                        return (
                            StatusCode::INTERNAL_SERVER_ERROR,
                            Json(json!({ "success": false, "error": e })),
                        );
                    }
                    let pool_bg = pool.clone();
                    tokio::spawn(async move {
                        let _ =
                            crate::chronos::publish_live_epoch_bucket_telemetry(&pool_bg, 0.0).await;
                    });
                }
            }
            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "data": { "claimedKas": verified_claimed_kas }
                })),
            )
        }
        "STAKE_LP" => {
            let pool_pair = payload
                .get("poolPair")
                .and_then(|v| v.as_str())
                .unwrap_or("KAS/USDC");
            let amount_a = payload
                .get("amountA")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let amount_b = payload
                .get("amountB")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let lock_days = payload
                .get("lockDurationDays")
                .and_then(|v| v.as_i64())
                .unwrap_or(0) as i32;
            if amount_a <= 0.0 || amount_b <= 0.0 {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "success": false, "error": "LP stake amounts must be > 0." })),
                );
            }
            if let Err(e) =
                debit_user_token_balance(&pool, &clean_wallet, &wallet, "KAS", amount_a).await
            {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "success": false, "error": e })),
                );
            }
            let weights_json = payload
                .get("weights")
                .cloned()
                .unwrap_or_else(|| json!({ "KAS": 0.5, "USDC": 0.5 }));
            let reserves_json = payload
                .get("reserves")
                .cloned()
                .unwrap_or_else(|| json!({ "KAS": amount_a, "USDC": amount_b }));
            let res = sqlx::query(
                r#"
                INSERT INTO liquidity_providers (
                    wallet_address, pool_pair, staked_asset_a, staked_asset_b,
                    weights_json, reserves_json, lock_duration_days,
                    unlock_date
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7,
                    CURRENT_TIMESTAMP + ($7::text || ' days')::interval
                )
                RETURNING lp_id::text AS lp_id
                "#,
            )
            .bind(&wallet)
            .bind(pool_pair)
            .bind(amount_a)
            .bind(amount_b)
            .bind(&weights_json)
            .bind(&reserves_json)
            .bind(lock_days)
            .fetch_one(&pool)
            .await;
            match res {
                Ok(row) => {
                    let lp_id: String = row.try_get("lp_id").unwrap_or_default();
                    (
                        StatusCode::OK,
                        Json(json!({
                            "success": true,
                            "data": {
                                "lpId": lp_id,
                                "poolPair": pool_pair,
                                "stakedAssetA": amount_a,
                                "stakedAssetB": amount_b,
                                "lockDurationDays": lock_days
                            }
                        })),
                    )
                }
                Err(e) => {
                    let _ = credit_user_token_balance(
                        &pool,
                        &clean_wallet,
                        &wallet,
                        "KAS",
                        amount_a,
                        false,
                    )
                    .await;
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "success": false, "error": e.to_string() })),
                    )
                }
            }
        }
        "GET_LP_POSITIONS" => {
            let rows = sqlx::query(
                r#"
                SELECT lp_id::text AS lp_id, pool_pair, staked_asset_a, staked_asset_b,
                       weights_json, reserves_json, lock_duration_days,
                       unlock_date, created_at,
                       (CURRENT_TIMESTAMP >= unlock_date OR lock_duration_days <= 0) AS is_unlocked
                FROM liquidity_providers
                WHERE wallet_address = $1 OR wallet_address = $2
                ORDER BY created_at DESC
                "#,
            )
            .bind(&wallet)
            .bind(&clean_wallet)
            .fetch_all(&pool)
            .await
            .unwrap_or_default();
            let list: Vec<Value> = rows
                .into_iter()
                .map(|r| {
                    let days = r.try_get::<i32, _>("lock_duration_days").unwrap_or(0);
                    let mult = lock_multiplier_for_days(days);
                    let amt_a = r.try_get::<f64, _>("staked_asset_a").unwrap_or(0.0);
                    let amt_b = r.try_get::<f64, _>("staked_asset_b").unwrap_or(0.0);
                    let pair = r
                        .try_get::<String, _>("pool_pair")
                        .unwrap_or_else(|_| "KAS/USDC".to_string());
                    let leg_count = pair.split('/').count();
                    let internal_pairs = if leg_count >= 2 {
                        (leg_count * (leg_count - 1)) / 2
                    } else {
                        1
                    };
                    json!({
                        "lpId": r.try_get::<String, _>("lp_id").unwrap_or_default(),
                        "poolPair": pair,
                        "stakedAssetA": amt_a,
                        "stakedAssetB": amt_b,
                        "weights": r.try_get::<Value, _>("weights_json").unwrap_or_else(|_| json!({})),
                        "reserves": r.try_get::<Value, _>("reserves_json").unwrap_or_else(|_| json!({})),
                        "internalPairsCount": internal_pairs,
                        "isMultiAssetPlant": leg_count > 2,
                        "lockDurationDays": days,
                        "unlockDate": r.try_get::<chrono::DateTime<chrono::Utc>, _>("unlock_date").ok().map(|d| d.to_rfc3339()),
                        "createdAt": r.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").ok().map(|d| d.to_rfc3339()),
                        "isUnlocked": r.try_get::<bool, _>("is_unlocked").unwrap_or(true),
                        "multiplier": mult,
                        "weightedTvl": amt_a * mult
                    })
                })
                .collect();
            (
                StatusCode::OK,
                Json(json!({ "success": true, "data": list })),
            )
        }
        "WITHDRAW_LP" => {
            let lp_id = payload.get("lpId").and_then(|v| v.as_str()).unwrap_or("");
            let row_opt = sqlx::query(
                r#"
                SELECT staked_asset_a, staked_asset_b, pool_pair,
                       (CURRENT_TIMESTAMP >= unlock_date OR lock_duration_days <= 0) AS is_unlocked
                FROM liquidity_providers
                WHERE lp_id::text = $1 AND (wallet_address = $2 OR wallet_address = $3)
                LIMIT 1
                "#,
            )
            .bind(lp_id)
            .bind(&wallet)
            .bind(&clean_wallet)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten();
            let Some(row) = row_opt else {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "success": false, "error": "LP position not found." })),
                );
            };
            let is_unlocked: bool = row.try_get("is_unlocked").unwrap_or(false);
            if !is_unlocked {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "success": false, "error": "LP position timelock is still active." })),
                );
            }
            let amt_a: f64 = row.try_get("staked_asset_a").unwrap_or(0.0);
            let amt_b: f64 = row.try_get("staked_asset_b").unwrap_or(0.0);
            let pair: String = row
                .try_get("pool_pair")
                .unwrap_or_else(|_| "KAS/USDC".to_string());
            let parts: Vec<&str> = pair.split('/').collect();
            let token_b = parts.get(1).copied().unwrap_or("USDC");
            let _ = sqlx::query(
                "DELETE FROM liquidity_providers WHERE lp_id::text = $1 AND (wallet_address = $2 OR wallet_address = $3)",
            )
            .bind(lp_id)
            .bind(&wallet)
            .bind(&clean_wallet)
            .execute(&pool)
            .await;
            if amt_a > 0.0 {
                let _ =
                    credit_user_token_balance(&pool, &clean_wallet, &wallet, "KAS", amt_a, false)
                        .await;
            }
            if amt_b > 0.0 {
                let _ = credit_user_token_balance(
                    &pool,
                    &clean_wallet,
                    &wallet,
                    token_b,
                    amt_b,
                    false,
                )
                .await;
            }
            (
                StatusCode::OK,
                Json(json!({ "success": true, "data": { "withdrawnLpId": lp_id } })),
            )
        }
        "STAKE_SILO" => {
            let amount = payload
                .get("amount")
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let ticker = payload
                .get("ticker")
                .and_then(|v| v.as_str())
                .unwrap_or("SILO")
                .trim()
                .to_uppercase();
            if amount <= 0.0 {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "success": false, "error": "Stake amount must be > 0" })),
                );
            }
            if let Err(e) =
                debit_user_token_balance(&pool, &clean_wallet, &wallet, &ticker, amount).await
            {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "success": false, "error": e })),
                );
            }
            let row_res = sqlx::query(
                r#"
                INSERT INTO silo_staking_positions (wallet_address, token_ticker, amount_staked, status)
                VALUES ($1, $2, $3, 'ACTIVE')
                RETURNING stake_id::text AS stake_id
                "#,
            )
            .bind(&wallet)
            .bind(&ticker)
            .bind(amount)
            .fetch_one(&pool)
            .await;
            match row_res {
                Ok(r) => {
                    let stake_id: String = r.try_get("stake_id").unwrap_or_default();
                    let total_staked: f64 = sqlx::query_scalar(
                        "SELECT COALESCE(SUM(amount_staked), 0.0) FROM silo_staking_positions WHERE (wallet_address = $1 OR wallet_address = $2) AND status = 'ACTIVE'",
                    )
                    .bind(&wallet)
                    .bind(&clean_wallet)
                    .fetch_one(&pool)
                    .await
                    .unwrap_or(amount);
                    let (fee_cap, tier_label) = compute_silo_fee_tier(total_staked);
                    (
                        StatusCode::OK,
                        Json(json!({
                            "success": true,
                            "data": {
                                "stakeId": stake_id,
                                "ticker": ticker,
                                "stakedAmount": amount,
                                "totalActiveStaked": total_staked,
                                "feeRateCap": fee_cap,
                                "tierLabel": tier_label
                            }
                        })),
                    )
                }
                Err(e) => {
                    let _ = credit_user_token_balance(
                        &pool,
                        &clean_wallet,
                        &wallet,
                        &ticker,
                        amount,
                        false,
                    )
                    .await;
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "success": false, "error": e.to_string() })),
                    )
                }
            }
        }
        "INITIATE_SILO_COOLDOWN" => {
            let stake_id = payload
                .get("stakeId")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let _ = sqlx::query(
                r#"
                UPDATE silo_staking_positions
                SET status = 'COOLDOWN',
                    cooldown_initiated_at = CURRENT_TIMESTAMP,
                    cooldown_ends_at = CURRENT_TIMESTAMP + INTERVAL '7 days'
                WHERE stake_id::text = $1 AND (wallet_address = $2 OR wallet_address = $3)
                "#,
            )
            .bind(stake_id)
            .bind(&wallet)
            .bind(&clean_wallet)
            .execute(&pool)
            .await;
            (
                StatusCode::OK,
                Json(json!({ "success": true, "data": { "stakeId": stake_id, "status": "COOLDOWN" } })),
            )
        }
        "CLAIM_UNSTAKED_SILO" => {
            let stake_id = payload
                .get("stakeId")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let row_opt = sqlx::query(
                r#"
                SELECT token_ticker, amount_staked,
                       (cooldown_ends_at IS NOT NULL AND CURRENT_TIMESTAMP >= cooldown_ends_at) AS is_matured
                FROM silo_staking_positions
                WHERE stake_id::text = $1 AND (wallet_address = $2 OR wallet_address = $3)
                LIMIT 1
                "#,
            )
            .bind(stake_id)
            .bind(&wallet)
            .bind(&clean_wallet)
            .fetch_optional(&pool)
            .await
            .ok()
            .flatten();
            let Some(row) = row_opt else {
                return (
                    StatusCode::NOT_FOUND,
                    Json(json!({ "success": false, "error": "Staking position not found." })),
                );
            };
            let is_matured: bool = row.try_get("is_matured").unwrap_or(false);
            if !is_matured {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "success": false, "error": "7-day unbonding cooldown is still active." })),
                );
            }
            let ticker: String = row
                .try_get("token_ticker")
                .unwrap_or_else(|_| "SILO".to_string());
            let amt: f64 = row.try_get("amount_staked").unwrap_or(0.0);
            let _ = sqlx::query(
                "DELETE FROM silo_staking_positions WHERE stake_id::text = $1 AND (wallet_address = $2 OR wallet_address = $3)",
            )
            .bind(stake_id)
            .bind(&wallet)
            .bind(&clean_wallet)
            .execute(&pool)
            .await;
            if amt > 0.0 {
                let _ = credit_user_token_balance(
                    &pool,
                    &clean_wallet,
                    &wallet,
                    &ticker,
                    amt,
                    false,
                )
                .await;
            }
            (
                StatusCode::OK,
                Json(json!({ "success": true, "data": { "claimedStakeId": stake_id, "claimedAmount": amt } })),
            )
        }
        "GET_SILO_STAKING" => {
            let rows = sqlx::query(
                r#"
                SELECT stake_id::text AS stake_id, token_ticker, amount_staked, status,
                       cooldown_initiated_at, cooldown_ends_at, created_at,
                       (cooldown_ends_at IS NOT NULL AND CURRENT_TIMESTAMP >= cooldown_ends_at) AS is_matured
                FROM silo_staking_positions
                WHERE wallet_address = $1 OR wallet_address = $2
                ORDER BY created_at DESC
                "#,
            )
            .bind(&wallet)
            .bind(&clean_wallet)
            .fetch_all(&pool)
            .await
            .unwrap_or_default();
            let mut active_staked = 0.0;
            let mut cooldown_staked = 0.0;
            let mut positions = Vec::new();
            for r in rows {
                let amt = r.try_get::<f64, _>("amount_staked").unwrap_or(0.0);
                let st = r
                    .try_get::<String, _>("status")
                    .unwrap_or_else(|_| "ACTIVE".to_string());
                if st == "ACTIVE" {
                    active_staked += amt;
                } else {
                    cooldown_staked += amt;
                }
                positions.push(json!({
                    "stakeId": r.try_get::<String, _>("stake_id").unwrap_or_default(),
                    "ticker": r.try_get::<String, _>("token_ticker").unwrap_or_else(|_| "SILO".to_string()),
                    "amountStaked": amt,
                    "status": st,
                    "cooldownInitiatedAt": r.try_get::<chrono::DateTime<chrono::Utc>, _>("cooldown_initiated_at").ok().map(|d| d.to_rfc3339()),
                    "cooldownEndsAt": r.try_get::<chrono::DateTime<chrono::Utc>, _>("cooldown_ends_at").ok().map(|d| d.to_rfc3339()),
                    "createdAt": r.try_get::<chrono::DateTime<chrono::Utc>, _>("created_at").ok().map(|d| d.to_rfc3339()),
                    "isMatured": r.try_get::<bool, _>("is_matured").unwrap_or(false)
                }));
            }
            let (silo_fee_cap, silo_tier_label) = compute_silo_fee_tier(active_staked);
            let miner_loyalty =
                query_wallet_miner_loyalty_telemetry(&pool, &clean_wallet, &wallet).await;
            let is_active_miner = miner_loyalty
                .get("activeMiner")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            let (wallet_floor_rate, wallet_floor_label, has_wholesale_perk) =
                crate::fiat_rails::resolve_wallet_swap_fee_floor_pct(&pool, &wallet).await;
            let (effective_fee_cap, effective_tier_label) =
                if is_active_miner || has_wholesale_perk {
                    (
                        wallet_floor_rate.min(silo_fee_cap),
                        if is_active_miner {
                            "0.10% Active Stratum Miner Wholesale Floor"
                        } else {
                            wallet_floor_label
                        },
                    )
                } else {
                    (silo_fee_cap, silo_tier_label)
                };
            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "data": {
                        "ecosystemTicker": "SILO",
                        "activeStaked": active_staked,
                        "cooldownStaked": cooldown_staked,
                        "combinedEligibleStaked": active_staked,
                        "feeRateCap": effective_fee_cap,
                        "tierLabel": effective_tier_label,
                        "minerLoyalty": miner_loyalty,
                        "positions": positions
                    }
                })),
            )
        }
        "GET_SYSTEM_TREASURY_CONFIG" => {
            let sys_cfg = crate::chronos::load_system_treasury_config(&pool).await;
            let node_airlock = build_live_node_airlock_telemetry(&pool).await;
            let float_state = crate::fiat_rails::load_or_init_bootstrap_float(&pool).await;
            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "data": {
                        "systemConfig": sys_cfg,
                        "nodeAirlock": node_airlock,
                        "fiatFloat": float_state
                    }
                })),
            )
        }
        "UPDATE_SYSTEM_TREASURY_CONFIG" => {
            let master_clean = crate::chronos::resolve_master_treasury_address();
            if !master_clean.is_empty() && clean_wallet != master_clean && !clean_wallet.contains("treasury_master") {
                return (
                    StatusCode::FORBIDDEN,
                    Json(json!({
                        "success": false,
                        "error": "FORBIDDEN: Only the Master Treasury Director may modulate system treasury ceilings."
                    })),
                );
            }
            match crate::chronos::update_system_treasury_config(&pool, payload, &wallet).await {
                Ok(updated_cfg) => {
                    let node_airlock = build_live_node_airlock_telemetry(&pool).await;
                    (
                        StatusCode::OK,
                        Json(json!({
                            "success": true,
                            "data": {
                                "systemConfig": updated_cfg,
                                "nodeAirlock": node_airlock
                            }
                        })),
                    )
                }
                Err(e) => (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "success": false, "error": e })),
                ),
            }
        }
        "GET_USER_COLD_VAULT_RULES" | "GET_COLD_VAULT_AIRLOCK" => {
            let rows = sqlx::query(
                r#"
                SELECT asset_ticker, network, cold_destination_address, vault_label,
                       overflow_ceiling, auto_sweep_enabled, last_sweep_txid,
                       last_sweep_amount, last_sweep_at, updated_at
                FROM user_cold_vault_rules
                WHERE wallet_address = $1 OR wallet_address = $2
                ORDER BY asset_ticker ASC
                "#,
            )
            .bind(&wallet)
            .bind(&clean_wallet)
            .fetch_all(&pool)
            .await
            .unwrap_or_default();
            let mut rules_map = serde_json::Map::new();
            let mut rules_list = Vec::with_capacity(rows.len());
            for r in rows {
                let ticker: String = r
                    .try_get("asset_ticker")
                    .unwrap_or_else(|_| "KAS".to_string())
                    .to_uppercase();
                let entry = json!({
                    "assetTicker": ticker,
                    "network": r.try_get::<String, _>("network").unwrap_or_else(|_| ticker.clone()),
                    "coldDestinationAddress": r.try_get::<String, _>("cold_destination_address").unwrap_or_default(),
                    "vaultLabel": r.try_get::<String, _>("vault_label").unwrap_or_else(|_| "Perennia Cold Vault".to_string()),
                    "overflowCeiling": r.try_get::<f64, _>("overflow_ceiling").unwrap_or(500.0),
                    "autoSweepEnabled": r.try_get::<bool, _>("auto_sweep_enabled").unwrap_or(false),
                    "lastSweepTxid": r.try_get::<Option<String>, _>("last_sweep_txid").ok().flatten(),
                    "lastSweepAmount": r.try_get::<f64, _>("last_sweep_amount").unwrap_or(0.0),
                    "lastSweepAt": r.try_get::<chrono::DateTime<chrono::Utc>, _>("last_sweep_at").ok().map(|d| d.to_rfc3339()),
                    "updatedAt": r.try_get::<chrono::DateTime<chrono::Utc>, _>("updated_at").ok().map(|d| d.to_rfc3339())
                });
                rules_map.insert(ticker, entry.clone());
                rules_list.push(entry);
            }
            let kas_rule = rules_map.get("KAS").cloned().unwrap_or(Value::Null);
            let node_airlock = build_live_node_airlock_telemetry(&pool).await;
            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "data": {
                        "rulesByAsset": Value::Object(rules_map),
                        "rules": rules_list,
                        "clientVault": kas_rule,
                        "nodeAirlock": node_airlock
                    }
                })),
            )
        }
        "SAVE_USER_COLD_VAULT_RULE"
        | "REGISTER_COLD_VAULT_AIRLOCK"
        | "SAVE_COLD_VAULT_AIRLOCK" => {
            let ticker = payload
                .get("assetTicker")
                .or_else(|| payload.get("ticker"))
                .and_then(|v| v.as_str())
                .unwrap_or("KAS")
                .trim()
                .to_uppercase();
            let network = payload
                .get("network")
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_uppercase())
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| resolve_network_for_asset(&ticker));
            let cold_dest = payload
                .get("coldDestinationAddress")
                .or_else(|| payload.get("coldKaspaAddress"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if cold_dest.len() < 12 {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "success": false,
                        "error": format!("Invalid cold destination address for {}.", ticker)
                    })),
                );
            }
            if network == "KAS" && decode_kaspa_address_payload(&cold_dest).is_none() {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "success": false,
                        "error": "Cold destination address failed Kaspa Bech32m checksum validation."
                    })),
                );
            }
            let vault_label = payload
                .get("vaultLabel")
                .or_else(|| payload.get("cardLabel"))
                .and_then(|v| v.as_str())
                .unwrap_or("Perennia Cold Vault")
                .trim()
                .to_string();
            let overflow_ceiling = payload
                .get("overflowCeiling")
                .or_else(|| payload.get("overflowThresholdKas"))
                .and_then(|v| v.as_f64())
                .unwrap_or(500.0)
                .max(0.0001);
            let auto_sweep_enabled = payload
                .get("autoSweepEnabled")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            let res = sqlx::query(
                r#"
                INSERT INTO user_cold_vault_rules (
                    wallet_address, asset_ticker, network, cold_destination_address,
                    vault_label, overflow_ceiling, auto_sweep_enabled, updated_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)
                ON CONFLICT (wallet_address, asset_ticker) DO UPDATE SET
                    network = EXCLUDED.network,
                    cold_destination_address = EXCLUDED.cold_destination_address,
                    vault_label = EXCLUDED.vault_label,
                    overflow_ceiling = EXCLUDED.overflow_ceiling,
                    auto_sweep_enabled = EXCLUDED.auto_sweep_enabled,
                    updated_at = CURRENT_TIMESTAMP
                "#,
            )
            .bind(&wallet)
            .bind(&ticker)
            .bind(&network)
            .bind(&cold_dest)
            .bind(&vault_label)
            .bind(overflow_ceiling)
            .bind(auto_sweep_enabled)
            .execute(&pool)
            .await;
            if ticker == "KAS" {
                let _ = sqlx::query(
                    r#"
                    INSERT INTO client_cold_vault_registry (
                        wallet_address, cold_kaspa_address, card_label,
                        overflow_threshold_kas, auto_sweep_enabled, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
                    ON CONFLICT (wallet_address) DO UPDATE SET
                        cold_kaspa_address = EXCLUDED.cold_kaspa_address,
                        card_label = EXCLUDED.card_label,
                        overflow_threshold_kas = EXCLUDED.overflow_threshold_kas,
                        auto_sweep_enabled = EXCLUDED.auto_sweep_enabled,
                        updated_at = CURRENT_TIMESTAMP
                    "#,
                )
                .bind(&wallet)
                .bind(&cold_dest)
                .bind(&vault_label)
                .bind(overflow_ceiling)
                .bind(auto_sweep_enabled)
                .execute(&pool)
                .await;
            }
            match res {
                Ok(_) => (
                    StatusCode::OK,
                    Json(json!({
                        "success": true,
                        "data": {
                            "assetTicker": ticker,
                            "network": network,
                            "coldDestinationAddress": cold_dest,
                            "vaultLabel": vault_label,
                            "overflowCeiling": overflow_ceiling,
                            "autoSweepEnabled": auto_sweep_enabled
                        }
                    })),
                ),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": e.to_string() })),
                ),
            }
        }
        "DELETE_USER_COLD_VAULT_RULE" => {
            let ticker = payload
                .get("assetTicker")
                .or_else(|| payload.get("ticker"))
                .and_then(|v| v.as_str())
                .unwrap_or("KAS")
                .trim()
                .to_uppercase();
            let _ = sqlx::query(
                "DELETE FROM user_cold_vault_rules WHERE (wallet_address = $1 OR wallet_address = $2) AND asset_ticker = $3",
            )
            .bind(&wallet)
            .bind(&clean_wallet)
            .bind(&ticker)
            .execute(&pool)
            .await;
            (
                StatusCode::OK,
                Json(json!({ "success": true, "data": { "deletedAssetTicker": ticker } })),
            )
        }
        "SWEEP_TOKEN_TO_COLD_VAULT_NOW" | "SWEEP_TO_COLD_VAULT_NOW" => {
            let ticker = payload
                .get("assetTicker")
                .or_else(|| payload.get("ticker"))
                .and_then(|v| v.as_str())
                .unwrap_or("KAS")
                .trim()
                .to_uppercase();
            let amount = payload
                .get("amount")
                .or_else(|| payload.get("amountTokens"))
                .or_else(|| payload.get("amountKas"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            if amount <= 0.0 {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "success": false, "error": "Sweep amount must be greater than 0." })),
                );
            }
            let mut cold_dest = payload
                .get("coldDestinationAddress")
                .or_else(|| payload.get("coldKaspaAddress"))
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .trim()
                .to_string();
            if cold_dest.is_empty() {
                cold_dest = sqlx::query_scalar(
                    "SELECT cold_destination_address FROM user_cold_vault_rules WHERE (wallet_address = $1 OR wallet_address = $2) AND asset_ticker = $3 LIMIT 1",
                )
                .bind(&wallet)
                .bind(&clean_wallet)
                .bind(&ticker)
                .fetch_optional(&pool)
                .await
                .ok()
                .flatten()
                .unwrap_or_default();
            }
            if cold_dest.is_empty() {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({
                        "success": false,
                        "error": format!("Save a Cold Storage destination address for {} before sweeping.", ticker)
                    })),
                );
            }
            let spot_price = match resolve_strict_spot_price(&pool, &ticker).await {
                Ok(p) => p,
                Err(e) => {
                    return (
                        StatusCode::SERVICE_UNAVAILABLE,
                        Json(json!({ "success": false, "error": e })),
                    );
                }
            };
            if let Err(e) =
                debit_user_token_balance(&pool, &clean_wallet, &wallet, &ticker, amount).await
            {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "success": false, "error": e })),
                );
            }
            let network = resolve_network_for_asset(&ticker);
            match dispatch_or_queue_l1_payout(
                &pool,
                &wallet,
                &cold_dest,
                &ticker,
                Some(&network),
                amount,
                spot_price,
                "cold_airlock_sweep",
            )
            .await
            {
                Ok(receipt) => {
                    let tx_hash = receipt
                        .get("txHash")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let _ = sqlx::query(
                        r#"
                        UPDATE user_cold_vault_rules
                        SET last_sweep_txid = $3,
                            last_sweep_amount = $4,
                            last_sweep_at = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE (wallet_address = $1 OR wallet_address = $2) AND asset_ticker = $5
                        "#,
                    )
                    .bind(&wallet)
                    .bind(&clean_wallet)
                    .bind(&tx_hash)
                    .bind(amount)
                    .bind(&ticker)
                    .execute(&pool)
                    .await;
                    let _ = sqlx::query(
                        r#"
                        INSERT INTO treasury_airlock_sweeps (
                            hot_wallet_address, cold_vault_address, swept_kas,
                            hot_balance_before_kas, hot_balance_after_kas, tx_id, status
                        ) VALUES ($1, $2, $3, $3, 0.0, $4, 'SWEPT_TO_COLD')
                        "#,
                    )
                    .bind(&wallet)
                    .bind(&cold_dest)
                    .bind(amount)
                    .bind(&tx_hash)
                    .execute(&pool)
                    .await;
                    (
                        StatusCode::OK,
                        Json(json!({
                            "success": true,
                            "transaction_id": tx_hash,
                            "data": receipt
                        })),
                    )
                }
                Err(e) => {
                    let _ = credit_user_token_balance(
                        &pool,
                        &clean_wallet,
                        &wallet,
                        &ticker,
                        amount,
                        false,
                    )
                    .await;
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "success": false, "error": e })),
                    )
                }
            }
        }
        "WITHDRAW_SYNTHETIC_ASSET" | "DISPATCH_L1_PAYOUT" => {
            let dest = payload
                .get("destination")
                .or_else(|| payload.get("destinationAddress"))
                .and_then(|v| v.as_str())
                .unwrap_or(&wallet);
            let ticker = payload
                .get("asset")
                .or_else(|| payload.get("assetTicker"))
                .and_then(|v| v.as_str())
                .unwrap_or("KAS")
                .trim()
                .to_uppercase();
            let net = payload.get("network").and_then(|v| v.as_str());
            let amt = payload
                .get("amount")
                .or_else(|| payload.get("amountTokens"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            if amt <= 0.0 {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "success": false, "error": "Withdrawal amount must be > 0." })),
                );
            }
            let spot = match resolve_strict_spot_price(&pool, &ticker).await {
                Ok(p) => p,
                Err(e) => {
                    return (
                        StatusCode::SERVICE_UNAVAILABLE,
                        Json(json!({ "success": false, "error": e })),
                    );
                }
            };
            if let Err(e) =
                debit_user_token_balance(&pool, &clean_wallet, &wallet, &ticker, amt).await
            {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "success": false, "error": e })),
                );
            }
            match dispatch_or_queue_l1_payout(
                &pool,
                &wallet,
                dest,
                &ticker,
                net,
                amt,
                spot,
                "ledger_withdrawal",
            )
            .await
            {
                Ok(receipt) => {
                    let tx_hash = receipt
                        .get("txHash")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    (
                        StatusCode::OK,
                        Json(json!({
                            "success": true,
                            "transaction_id": tx_hash,
                            "data": receipt
                        })),
                    )
                }
                Err(e) => {
                    let _ = credit_user_token_balance(
                        &pool,
                        &clean_wallet,
                        &wallet,
                        &ticker,
                        amt,
                        false,
                    )
                    .await;
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        Json(json!({ "success": false, "error": e })),
                    )
                }
            }
        }
        "DISPATCH_OTC_UTXOS" => {
            let dest = payload
                .get("destination")
                .or_else(|| payload.get("destinationAddress"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let ticker = payload
                .get("asset")
                .or_else(|| payload.get("assetTicker"))
                .and_then(|v| v.as_str())
                .unwrap_or("KAS")
                .trim()
                .to_uppercase();
            let amt = payload
                .get("amount")
                .or_else(|| payload.get("amountTokens"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            if dest.is_empty() || amt <= 0.0 {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "success": false, "error": "Invalid destination or amount for DISPATCH_OTC_UTXOS." })),
                );
            }
            let spot = match resolve_strict_spot_price(&pool, &ticker).await {
                Ok(p) => p,
                Err(e) => {
                    return (
                        StatusCode::SERVICE_UNAVAILABLE,
                        Json(json!({ "success": false, "error": e })),
                    );
                }
            };
            match dispatch_or_queue_l1_payout(
                &pool,
                "kaspa:treasury_master",
                dest,
                &ticker,
                None,
                amt,
                spot,
                "otc_settlement",
            )
            .await
            {
                Ok(receipt) => {
                    let tx_hash = receipt
                        .get("txHash")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    (
                        StatusCode::OK,
                        Json(json!({
                            "success": true,
                            "transaction_id": tx_hash,
                            "data": receipt
                        })),
                    )
                }
                Err(e) => (
                    StatusCode::BAD_GATEWAY,
                    Json(json!({ "success": false, "error": e })),
                ),
            }
        }
        "TRIGGER_EPOCH_BELL" | "FORCE_EPOCH_BELL" => {
            match crate::chronos::trigger_immediate_epoch_bell_sweep(&pool).await {
                Ok(epoch_telemetry) => (
                    StatusCode::OK,
                    Json(json!({
                        "success": true,
                        "data": epoch_telemetry
                    })),
                ),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": e })),
                ),
            }
        }
        "GET_HIFO_TAX_LOTS" => {
            let lot_rows = sqlx::query(
                r#"
                SELECT lot_id::text AS lot_id, asset_ticker, acquired_at,
                       kas_sompi, initial_tokens, remaining_sompi, remaining_tokens,
                       fmv_usd_per_token, total_cost_basis_usd, source_event_type,
                       source_tx_hash, status
                FROM hifo_tax_lots
                WHERE wallet_address = $1 OR wallet_address = $2
                ORDER BY fmv_usd_per_token DESC, acquired_at ASC
                "#,
            )
            .bind(&wallet)
            .bind(&clean_wallet)
            .fetch_all(&pool)
            .await
            .unwrap_or_default();
            let mut open_basis_usd = 0.0;
            let mut open_kas_tokens = 0.0;
            let now = chrono::Utc::now();
            let lots: Vec<Value> = lot_rows
                .into_iter()
                .map(|r| {
                    let acq = r
                        .try_get::<chrono::DateTime<chrono::Utc>, _>("acquired_at")
                        .unwrap_or(now);
                    let days = (now - acq).num_days().max(0);
                    let rem_tokens = r.try_get::<f64, _>("remaining_tokens").unwrap_or(0.0);
                    let fmv = r.try_get::<f64, _>("fmv_usd_per_token").unwrap_or(0.0);
                    let rem_basis = rem_tokens * fmv;
                    open_basis_usd += rem_basis;
                    open_kas_tokens += rem_tokens;
                    json!({
                        "lotId": r.try_get::<String, _>("lot_id").unwrap_or_default(),
                        "assetTicker": r.try_get::<String, _>("asset_ticker").unwrap_or_else(|_| "KAS".to_string()),
                        "acquiredAt": acq.to_rfc3339(),
                        "kasSompi": r.try_get::<i64, _>("kas_sompi").unwrap_or(0),
                        "initialTokens": r.try_get::<f64, _>("initial_tokens").unwrap_or(0.0),
                        "remainingSompi": r.try_get::<i64, _>("remaining_sompi").unwrap_or(0),
                        "remainingTokens": rem_tokens,
                        "fmvUsdPerToken": fmv,
                        "totalCostBasisUsd": r.try_get::<f64, _>("total_cost_basis_usd").unwrap_or(0.0),
                        "remainingCostBasisUsd": rem_basis,
                        "sourceEventType": r.try_get::<String, _>("source_event_type").unwrap_or_else(|_| "YIELD".to_string()),
                        "sourceTxHash": r.try_get::<Option<String>, _>("source_tx_hash").ok().flatten(),
                        "status": r.try_get::<String, _>("status").unwrap_or_else(|_| "OPEN".to_string()),
                        "holdingDays": days,
                        "isLongTerm": days > 365
                    })
                })
                .collect();
            let match_rows = sqlx::query(
                r#"
                SELECT match_id::text AS match_id, lot_id::text AS lot_id,
                       asset_ticker, disposed_sompi, disposed_tokens,
                       acquired_at, disposed_at, holding_period_days,
                       is_long_term, cost_basis_usd, gross_proceeds_usd,
                       realized_gain_loss_usd, disposal_tx_hash
                FROM hifo_disposal_matches
                WHERE wallet_address = $1 OR wallet_address = $2
                ORDER BY disposed_at DESC
                "#,
            )
            .bind(&wallet)
            .bind(&clean_wallet)
            .fetch_all(&pool)
            .await
            .unwrap_or_default();
            let mut matched_basis = 0.0;
            let mut matched_proceeds = 0.0;
            let mut st_gain = 0.0;
            let mut lt_gain = 0.0;
            let matches: Vec<Value> = match_rows
                .into_iter()
                .map(|m| {
                    let cb = m.try_get::<f64, _>("cost_basis_usd").unwrap_or(0.0);
                    let gp = m.try_get::<f64, _>("gross_proceeds_usd").unwrap_or(0.0);
                    let gl = m.try_get::<f64, _>("realized_gain_loss_usd").unwrap_or(0.0);
                    let is_lt = m.try_get::<bool, _>("is_long_term").unwrap_or(false);
                    matched_basis += cb;
                    matched_proceeds += gp;
                    if is_lt {
                        lt_gain += gl;
                    } else {
                        st_gain += gl;
                    }
                    json!({
                        "matchId": m.try_get::<String, _>("match_id").unwrap_or_default(),
                        "lotId": m.try_get::<String, _>("lot_id").unwrap_or_default(),
                        "assetTicker": m.try_get::<String, _>("asset_ticker").unwrap_or_else(|_| "KAS".to_string()),
                        "disposedSompi": m.try_get::<i64, _>("disposed_sompi").unwrap_or(0),
                        "disposedTokens": m.try_get::<f64, _>("disposed_tokens").unwrap_or(0.0),
                        "acquiredAt": m.try_get::<chrono::DateTime<chrono::Utc>, _>("acquired_at").unwrap_or(now).to_rfc3339(),
                        "disposedAt": m.try_get::<chrono::DateTime<chrono::Utc>, _>("disposed_at").unwrap_or(now).to_rfc3339(),
                        "holdingPeriodDays": m.try_get::<i32, _>("holding_period_days").unwrap_or(0),
                        "isLongTerm": is_lt,
                        "costBasisUsd": cb,
                        "grossProceedsUsd": gp,
                        "realizedGainLossUsd": gl,
                        "disposalTxHash": m.try_get::<Option<String>, _>("disposal_tx_hash").ok().flatten()
                    })
                })
                .collect();
            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "data": {
                        "accountingMethod": "PASSIVE_HIFO_NO_WASH",
                        "lots": lots,
                        "disposalMatches": matches,
                        "summary": {
                            "openCostBasisUsd": open_basis_usd,
                            "openKasTokens": open_kas_tokens,
                            "totalMatchedCostBasisUsd": matched_basis,
                            "totalMatchedProceedsUsd": matched_proceeds,
                            "shortTermGainLossUsd": st_gain,
                            "longTermGainLossUsd": lt_gain,
                            "netRealizedGainLossUsd": st_gain + lt_gain
                        }
                    }
                })),
            )
        }
        "GET_FORGE_TOKENOMICS" => {
            let ticker = payload.get("ticker").and_then(|v| v.as_str());
            let include_all = payload
                .get("includeAllMineableVaults")
                .and_then(|v| v.as_bool())
                .unwrap_or(true);
            match query_forge_tokenomics_bundle(&pool, ticker, include_all).await {
                Ok(bundle) => (
                    StatusCode::OK,
                    Json(json!({ "success": true, "data": bundle })),
                ),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": e })),
                ),
            }
        }
        "DEPLOY_FORGE_TOKENOMICS" | "REGISTER_FORGE_TOKENOMICS" | "RETROACTIVE_FORGE_UPGRADE" => {
            match deploy_forge_tokenomics_bundle(&pool, &wallet, payload).await {
                Ok(bundle) => (
                    StatusCode::OK,
                    Json(json!({ "success": true, "data": bundle })),
                ),
                Err(e) => (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "success": false, "error": e })),
                ),
            }
        }
        "CLAIM_VESTED_TRANCHE" => {
            match claim_vested_forge_tranche(&pool, &wallet, payload).await {
                Ok(res) => (
                    StatusCode::OK,
                    Json(json!({ "success": true, "data": res })),
                ),
                Err(e) => (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "success": false, "error": e })),
                ),
            }
        }
        "COMPILE_SILVERSCRIPT_VAULT" | "COMPILE_SILVERSCRIPT_COVENANT" => {
            let ticker = payload
                .get("ticker")
                .and_then(|v| v.as_str())
                .unwrap_or("SILO");
            let standard = payload
                .get("tokenStandard")
                .and_then(|v| v.as_str())
                .unwrap_or("KRC-20");
            let label = payload
                .get("label")
                .and_then(|v| v.as_str())
                .unwrap_or("Genesis Tranche");
            let beneficiary = payload
                .get("beneficiaryAddress")
                .or_else(|| payload.get("address"))
                .and_then(|v| v.as_str())
                .unwrap_or(&wallet);
            let alloc = payload
                .get("totalAllocation")
                .or_else(|| payload.get("amount"))
                .and_then(|v| v.as_f64())
                .unwrap_or(0.0);
            let cliff_d = payload.get("cliffDays").and_then(|v| v.as_i64()).unwrap_or(0);
            let linear_d = payload
                .get("linearDays")
                .and_then(|v| v.as_i64())
                .unwrap_or(365);
            let comp = compile_silverscript_proof_of_lock_vault(
                ticker,
                standard,
                label,
                beneficiary,
                alloc,
                cliff_d,
                linear_d,
                payload.get("charterSha256").and_then(|v| v.as_str()),
            );
            (
                StatusCode::OK,
                Json(json!({
                    "success": true,
                    "data": silverscript_compilation_to_json(&comp)
                })),
            )
        }
        "RETRY_L1_PAYOUT" => {
            let payout_id = payload
                .get("payoutId")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            match retry_queued_l1_payout(&pool, payout_id).await {
                Ok(res) => (
                    StatusCode::OK,
                    Json(json!({ "success": true, "data": res })),
                ),
                Err(e) => (
                    StatusCode::BAD_REQUEST,
                    Json(json!({ "success": false, "error": e })),
                ),
            }
        }
        "WHITELIST_WALLET" => {
            let target_wallet = payload
                .get("walletAddress")
                .and_then(|v| v.as_str())
                .unwrap_or(&wallet);
            let label = payload
                .get("label")
                .and_then(|v| v.as_str())
                .unwrap_or("Sovereign Miner");
            let _ = sqlx::query(
                r#"
                INSERT INTO whitelisted_wallets (wallet_address, label)
                VALUES ($1, $2)
                ON CONFLICT (wallet_address) DO UPDATE SET label = EXCLUDED.label
                "#,
            )
            .bind(target_wallet)
            .bind(label)
            .execute(&pool)
            .await;
            (
                StatusCode::OK,
                Json(json!({ "success": true, "data": { "walletAddress": target_wallet, "label": label } })),
            )
        }
        _ => (
            StatusCode::OK,
            Json(json!({
                "success": true,
                "action": action,
                "status": "ACKNOWLEDGED"
            })),
        ),
    }
}
```

## File: src/sor.rs
```rust
#[path = "hifo.rs"]
pub mod hifo;
#[path = "kaspa_tx.rs"]
pub mod kaspa_tx;
pub use hifo::*;
pub use kaspa_tx::*;
use axum::{
    extract::State,
    http::StatusCode,
    response::{IntoResponse, Json},
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{PgPool, Row};
use std::collections::HashSet;
use std::env;
use uuid::Uuid;
const DEFAULT_RESERVE_WHITELIST: &[&str] = &["KAS", "BTC", "ETH", "SOL", "USDC", "USDT", "SILO"];
const LP_BASE_HURDLE_MIN_APR_PCT: f64 = 14.2;
const LP_BASE_HURDLE_TARGET_APR_PCT: f64 = 14.6;
const COMPETITOR_STANDARD_AMM_APR_PCT: f64 = 9.1;
pub trait PayoutBatchEntry {
    fn recipient_address(&self) -> String;
    fn amount_sompi(&self) -> u64;
}
impl PayoutBatchEntry for (String, u64) {
    fn recipient_address(&self) -> String {
        self.0.clone()
    }
    fn amount_sompi(&self) -> u64 {
        self.1
    }
}
impl PayoutBatchEntry for (String, f64) {
    fn recipient_address(&self) -> String {
        self.0.clone()
    }
    fn amount_sompi(&self) -> u64 {
        (self.1.max(0.0) * 100_000_000.0).round() as u64
    }
}
impl PayoutBatchEntry for Value {
    fn recipient_address(&self) -> String {
        self.get("address")
            .or_else(|| self.get("wallet"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string()
    }
    fn amount_sompi(&self) -> u64 {
        if let Some(s) = self.get("sompi").and_then(|v| v.as_u64()) {
            return s;
        }
        let kas = self
            .get("amountKas")
            .or_else(|| self.get("amount"))
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        (kas.max(0.0) * 100_000_000.0).round() as u64
    }
}
pub async fn execute_idempotent_mass_physical_settlement<T: PayoutBatchEntry>(
    pool: &PgPool,
    idempotency_key: &str,
    payouts: &[T],
) -> Result<String, String> {
    let mut recipients: Vec<(String, u64)> = Vec::with_capacity(payouts.len());
    for item in payouts {
        let addr = item.recipient_address().trim().to_string();
        let sompi = item.amount_sompi();
        if !addr.is_empty() && sompi > 0 {
            recipients.push((addr, sompi));
        }
    }
    if recipients.is_empty() {
        return Err("No valid recipients in payout batch.".to_string());
    }
    crate::state_api::sign_and_broadcast_kaspa_payout_batch(pool, idempotency_key, &recipients, "")
        .await
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SorExecuteRequest {
    pub wallet: String,
    pub pay_asset: String,
    pub receive_asset: String,
    pub amount: f64,
    #[serde(default)]
    pub slippage_tolerance: Option<f64>,
    #[serde(default)]
    pub utxos: Option<Vec<Value>>,
    #[serde(default)]
    pub system_mode: Option<String>,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteeringFeeLeg {
    pub asset: String,
    pub share_ratio: f64,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenSteeringDecision {
    pub allowed: bool,
    pub reject_reason: Option<String>,
    pub pay_state: String,
    pub receive_state: String,
    pub allow_dark_pool_internal_clearing: bool,
    pub fee_legs: Vec<SteeringFeeLeg>,
    pub explanation: String,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicHurdleWaterfall {
    pub hard_floor_perennia_usd: f64,
    pub lp_allocated_fee_usd: f64,
    pub perennia_total_cut_usd: f64,
    pub perennia_lp_compound_60_usd: f64,
    pub perennia_liquid_reserve_40_usd: f64,
    pub projected_base_lp_apr_pct: f64,
    pub projected_max_multiplier_apr_pct: f64,
    pub competitor_amm_apr_pct: f64,
    pub surplus_volume_sweep_active: bool,
}
async fn resolve_token_steering_and_firewall(
    pool: &PgPool,
    clean_wallet: &str,
    prefixed_wallet: &str,
    pay_asset: &str,
    receive_asset: &str,
) -> Result<(TokenSteeringDecision, bool, bool), (StatusCode, Json<Value>)> {
    let p_tick = pay_asset.trim().to_uppercase();
    let r_tick = receive_asset.trim().to_uppercase();
    let mut dark_pool_paused = false;
    let mut external_dex_paused = false;
    if let Ok(redis_url) = env::var("REDIS_URL") {
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                let dp_flag: Option<String> = redis::cmd("GET")
                    .arg("perennia:killswitch:dark_pool")
                    .query_async(&mut conn)
                    .await
                    .ok()
                    .flatten();
                if let Some(f) = dp_flag {
                    if f.trim() == "1" || f.trim().eq_ignore_ascii_case("true") {
                        dark_pool_paused = true;
                    }
                }
                let ext_flag: Option<String> = redis::cmd("GET")
                    .arg("perennia:killswitch:external_dex")
                    .query_async(&mut conn)
                    .await
                    .ok()
                    .flatten();
                if let Some(f) = ext_flag {
                    if f.trim() == "1" || f.trim().eq_ignore_ascii_case("true") {
                        external_dex_paused = true;
                    }
                }
                let blk_w1: i32 = redis::cmd("SISMEMBER")
                    .arg("perennia:firewall:blacklisted_wallets")
                    .arg(clean_wallet)
                    .query_async(&mut conn)
                    .await
                    .unwrap_or(0);
                let blk_w2: i32 = redis::cmd("SISMEMBER")
                    .arg("perennia:firewall:blacklisted_wallets")
                    .arg(prefixed_wallet)
                    .query_async(&mut conn)
                    .await
                    .unwrap_or(0);
                if blk_w1 == 1 || blk_w2 == 1 {
                    return Err((
                        StatusCode::FORBIDDEN,
                        Json(json!({
                            "error": "FIREWALL_BLACKLISTED_WALLET: Wallet address is blocked by the Perennia Security Firewall."
                        })),
                    ));
                }
                let blk_p: i32 = redis::cmd("SISMEMBER")
                    .arg("perennia:firewall:blacklisted_tokens")
                    .arg(&p_tick)
                    .query_async(&mut conn)
                    .await
                    .unwrap_or(0);
                let blk_r: i32 = redis::cmd("SISMEMBER")
                    .arg("perennia:firewall:blacklisted_tokens")
                    .arg(&r_tick)
                    .query_async(&mut conn)
                    .await
                    .unwrap_or(0);
                if blk_p == 1 || blk_r == 1 {
                    let bad = if blk_p == 1 { &p_tick } else { &r_tick };
                    return Err((
                        StatusCode::FORBIDDEN,
                        Json(json!({
                            "error": format!("FIREWALL_BLACKLISTED_TOKEN: {} is flagged as a blacklisted contract and rejected at the API edge.", bad)
                        })),
                    ));
                }
            }
        }
    }
    let whitelist_set: HashSet<String> = DEFAULT_RESERVE_WHITELIST
        .iter()
        .map(|s| (*s).to_string())
        .collect();
    let rows = sqlx::query(
        r#"
        SELECT ticker, steering_state, is_whitelisted, target_weight_pct, actual_weight_pct
        FROM token_steering_matrix
        WHERE ticker = $1 OR ticker = $2
        "#,
    )
    .bind(&p_tick)
    .bind(&r_tick)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    let mut pay_state = if whitelist_set.contains(&p_tick) {
        "AUTO_BALANCE".to_string()
    } else {
        "PASS_THROUGH".to_string()
    };
    let mut receive_state = if whitelist_set.contains(&r_tick) {
        "AUTO_BALANCE".to_string()
    } else {
        "PASS_THROUGH".to_string()
    };
    let mut pay_whitelisted = whitelist_set.contains(&p_tick);
    let mut receive_whitelisted = whitelist_set.contains(&r_tick);
    let mut p_deficit = 0.0_f64;
    let mut r_deficit = 0.0_f64;
    for row in rows {
        let tick: String = row
            .try_get::<String, _>("ticker")
            .unwrap_or_default()
            .trim()
            .to_uppercase();
        let st: String = row
            .try_get::<String, _>("steering_state")
            .unwrap_or_else(|_| "AUTO_BALANCE".to_string())
            .trim()
            .to_uppercase();
        let wl: bool = row.try_get("is_whitelisted").unwrap_or(false);
        let target_w: f64 = row.try_get("target_weight_pct").unwrap_or(10.0);
        let actual_w: f64 = row.try_get("actual_weight_pct").unwrap_or(10.0);
        if tick == p_tick {
            pay_state = st.clone();
            pay_whitelisted = wl && st != "PASS_THROUGH" && st != "BLACKLISTED";
            p_deficit = target_w - actual_w;
        } else if tick == r_tick {
            receive_state = st.clone();
            receive_whitelisted = wl && st != "PASS_THROUGH" && st != "BLACKLISTED";
            r_deficit = target_w - actual_w;
        }
    }
    if pay_state == "BLACKLISTED" || receive_state == "BLACKLISTED" {
        let bad = if pay_state == "BLACKLISTED" {
            &p_tick
        } else {
            &r_tick
        };
        return Err((
            StatusCode::FORBIDDEN,
            Json(json!({
                "error": format!("FIREWALL_BLACKLISTED_TOKEN: {} is blacklisted by the Token Steering Matrix.", bad)
            })),
        ));
    }
    let allow_dark_pool = pay_state != "PASS_THROUGH" && receive_state != "PASS_THROUGH";
    if !allow_dark_pool && external_dex_paused {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "error": "SUBSYSTEM_PAUSED: External DEX pass-through routing is currently paused by Director kill-switch."
            })),
        ));
    }
    if allow_dark_pool && dark_pool_paused && external_dex_paused {
        return Err((
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({
                "error": "SUBSYSTEM_PAUSED: Both Dark Pool Internal Clearing and External DEX Routing are paused by Director kill-switches."
            })),
        ));
    }
    let (fee_legs, explanation) = if pay_state == "ACCUMULATE" && pay_whitelisted {
        (
            vec![SteeringFeeLeg {
                asset: p_tick.clone(),
                share_ratio: 1.0,
            }],
            format!("ACCUMULATE override: 100% fee skimmed in {}", p_tick),
        )
    } else if receive_state == "ACCUMULATE" && receive_whitelisted {
        (
            vec![SteeringFeeLeg {
                asset: r_tick.clone(),
                share_ratio: 1.0,
            }],
            format!("ACCUMULATE override: 100% fee skimmed in {}", r_tick),
        )
    } else {
        let p_elig = pay_whitelisted && pay_state != "FREEZE";
        let r_elig = receive_whitelisted && receive_state != "FREEZE";
        if p_elig && r_elig {
            if (p_deficit - r_deficit).abs() <= 0.5 {
                (
                    vec![
                        SteeringFeeLeg {
                            asset: p_tick.clone(),
                            share_ratio: 0.5,
                        },
                        SteeringFeeLeg {
                            asset: r_tick.clone(),
                            share_ratio: 0.5,
                        },
                    ],
                    format!(
                        "AUTO_BALANCE (Balanced Master Buckets): 50/50 fee split in {} & {}",
                        p_tick, r_tick
                    ),
                )
            } else {
                let under = if p_deficit > r_deficit {
                    &p_tick
                } else {
                    &r_tick
                };
                (
                    vec![SteeringFeeLeg {
                        asset: under.clone(),
                        share_ratio: 1.0,
                    }],
                    format!(
                        "AUTO_BALANCE (Underweight Bucket): 100% fee skimmed in {}",
                        under
                    ),
                )
            }
        } else if p_elig {
            (
                vec![SteeringFeeLeg {
                    asset: p_tick.clone(),
                    share_ratio: 1.0,
                }],
                format!(
                    "Reserve Whitelist Firewall: 100% fee skimmed in verified {}",
                    p_tick
                ),
            )
        } else if r_elig {
            (
                vec![SteeringFeeLeg {
                    asset: r_tick.clone(),
                    share_ratio: 1.0,
                }],
                format!(
                    "Reserve Whitelist Firewall: 100% fee skimmed in verified {}",
                    r_tick
                ),
            )
        } else {
            let hop_asset = if p_tick == "KAS" || r_tick == "KAS" {
                "KAS".to_string()
            } else {
                "USDC".to_string()
            };
            (
                vec![SteeringFeeLeg {
                    asset: hop_asset.clone(),
                    share_ratio: 1.0,
                }],
                format!(
                    "PASS_THROUGH / Anti-Poisoning Hop: 100% fee skimmed in {}",
                    hop_asset
                ),
            )
        }
    };
    Ok((
        TokenSteeringDecision {
            allowed: true,
            reject_reason: None,
            pay_state,
            receive_state,
            allow_dark_pool_internal_clearing: allow_dark_pool,
            fee_legs,
            explanation,
        },
        dark_pool_paused,
        external_dex_paused,
    ))
}
async fn compute_dynamic_hurdle_waterfall(
    pool: &PgPool,
    pool_pair: &str,
    gross_usd: f64,
    total_protocol_fee_usd: f64,
    kas_spot_usd: f64,
) -> DynamicHurdleWaterfall {
    let safe_gross = gross_usd.max(0.0);
    let total_fee = total_protocol_fee_usd.max(0.0);
    // Step 1: Lock Perennia's 0.10% hard cost-plus protocol floor above gas first
    let hard_floor_perennia_usd = total_fee.min((safe_gross * crate::fiat_rails::HARD_PROFIT_FLOOR_PCT).max(0.01));
    let remaining_distributable_usd = (total_fee - hard_floor_perennia_usd).max(0.0);
    let staked_kas: f64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(staked_asset_a), 0.0)
        FROM liquidity_providers
        WHERE pool_pair = $1
        "#,
    )
    .bind(pool_pair)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);
    let rolling_24h_lp_fees_usd: f64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(total_fees_distributed_usd), 0.0)
        FROM yield_distributions
        WHERE pool_pair = $1
          AND distributed_at >= CURRENT_TIMESTAMP - INTERVAL '24 hours'
        "#,
    )
    .bind(pool_pair)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);
    let pair_tvl_usd = if staked_kas > 0.0 && kas_spot_usd > 0.0 {
        (staked_kas * kas_spot_usd * 2.0).max(1_000.0)
    } else {
        25_000.0
    };
    let daily_hurdle_target_usd =
        (pair_tvl_usd * (LP_BASE_HURDLE_TARGET_APR_PCT / 100.0)) / 365.0;
    let daily_hurdle_min_usd =
        (pair_tvl_usd * (LP_BASE_HURDLE_MIN_APR_PCT / 100.0)) / 365.0;
    let (lp_share_of_remaining, surplus_volume_sweep_active) =
        if rolling_24h_lp_fees_usd >= daily_hurdle_target_usd {
            (0.20, true)
        } else if rolling_24h_lp_fees_usd < daily_hurdle_min_usd {
            (0.45, false)
        } else {
            (0.4444, false)
        };
    let lp_allocated_fee_usd =
        ((remaining_distributable_usd * lp_share_of_remaining) * 1_000_000.0).round() / 1_000_000.0;
    let perennia_total_cut_usd = ((total_fee - lp_allocated_fee_usd)
        .max(hard_floor_perennia_usd)
        * 1_000_000.0)
        .round()
        / 1_000_000.0;
    // Internal Treasury 60/40 Reserve Split:
    // 60% into Perennia-owned LP positions to compound, 40% in liquid USD/stablecoin clearing reserve
    let perennia_lp_compound_60_usd =
        ((perennia_total_cut_usd * 0.60) * 1_000_000.0).round() / 1_000_000.0;
    let perennia_liquid_reserve_40_usd = ((perennia_total_cut_usd - perennia_lp_compound_60_usd)
        .max(0.0)
        * 1_000_000.0)
        .round()
        / 1_000_000.0;
    let new_rolling_24h_lp_usd = rolling_24h_lp_fees_usd + lp_allocated_fee_usd;
    let raw_apr = if pair_tvl_usd > 0.0 {
        ((new_rolling_24h_lp_usd * 365.0) / pair_tvl_usd) * 100.0
    } else {
        14.4
    };
    let projected_base_lp_apr_pct =
        ((raw_apr.clamp(LP_BASE_HURDLE_MIN_APR_PCT, 24.0)) * 100.0).round() / 100.0;
    let projected_max_multiplier_apr_pct =
        ((projected_base_lp_apr_pct * 2.5) * 100.0).round() / 100.0;
    DynamicHurdleWaterfall {
        hard_floor_perennia_usd,
        lp_allocated_fee_usd,
        perennia_total_cut_usd,
        perennia_lp_compound_60_usd,
        perennia_liquid_reserve_40_usd,
        projected_base_lp_apr_pct,
        projected_max_multiplier_apr_pct,
        competitor_amm_apr_pct: COMPETITOR_STANDARD_AMM_APR_PCT,
        surplus_volume_sweep_active,
    }
}
fn estimate_modeled_gas_and_slippage_usd(
    pay_asset: &str,
    receive_asset: &str,
    gross_usd: f64,
    is_external_pass_through: bool,
) -> (f64, f64) {
    let gas_for_asset = |ticker: &str| -> f64 {
        match ticker.trim().to_uppercase().as_str() {
            "KAS" | "SILO" | "NACHO" | "BEDRCK" | "PERX" => 0.002,
            "BTC" => 0.65,
            "ETH" | "USDC" | "USDT" | "XAU" => 0.25,
            "SOL" | "ARB" | "BASE" | "POL" | "AVAX" | "SUI" | "XRP" | "DOGE" | "TRX" => 0.02,
            _ => 0.15,
        }
    };
    let raw_gas_usd = gas_for_asset(pay_asset) + gas_for_asset(receive_asset);
    let network_gas_usd = if !is_external_pass_through && gross_usd > 0.0 && gross_usd < 25.0 {
        raw_gas_usd.min((gross_usd * 0.01).max(0.002))
    } else {
        raw_gas_usd
    };
    let external_slip_usd = if is_external_pass_through {
        gross_usd * 0.0015
    } else {
        0.0
    };
    (
        (network_gas_usd * 10_000.0).round() / 10_000.0,
        (external_slip_usd * 10_000.0).round() / 10_000.0,
    )
}
async fn resolve_user_fee_rate(
    pool: &PgPool,
    prefixed_wallet: &str,
    clean_wallet: &str,
    usd_volume: f64,
    pay_asset: &str,
    receive_asset: &str,
    allow_dark_pool_internal_clearing: bool,
) -> (f64, &'static str) {
    let (wallet_floor_rate, tier_label, has_wholesale_perk) =
        crate::fiat_rails::resolve_wallet_swap_fee_floor_pct(pool, prefixed_wallet).await;
    if has_wholesale_perk {
        return (
            wallet_floor_rate.max(crate::fiat_rails::HARD_PROFIT_FLOOR_PCT),
            tier_label,
        );
    }
    let pay_up = pay_asset.trim().to_uppercase();
    let rec_up = receive_asset.trim().to_uppercase();
    let is_buy_kas = rec_up == "KAS" && pay_up != "USD";
    let staked_silo: f64 = sqlx::query_scalar(
        r#"
        SELECT COALESCE(SUM(amount_staked), 0.0)
        FROM silo_staking_positions
        WHERE (wallet_address = $1 OR wallet_address = $2)
          AND status IN ('ACTIVE', 'COOLDOWN')
        "#,
    )
    .bind(prefixed_wallet)
    .bind(clean_wallet)
    .fetch_one(pool)
    .await
    .unwrap_or(0.0);
    if staked_silo >= 1_000_000.0 {
        return (
            crate::fiat_rails::HARD_PROFIT_FLOOR_PCT,
            "0.10% SILO Sovereign Staker Wholesale Floor",
        );
    } else if staked_silo >= 100_000.0 {
        if is_buy_kas {
            return (
                crate::fiat_rails::BUY_KAS_INBOUND_FEE_PCT,
                "0.20% Buy-KAS Inbound Tier",
            );
        }
        return (
            crate::fiat_rails::WHOLESALE_VOLUME_SWAP_FEE_PCT,
            "0.25% SILO Vanguard Staker Tier",
        );
    } else if staked_silo >= 10_000.0 {
        if is_buy_kas {
            return (
                crate::fiat_rails::BUY_KAS_INBOUND_FEE_PCT,
                "0.20% Buy-KAS Inbound Tier",
            );
        }
        return (
            crate::fiat_rails::SILO_SHIELD_SWAP_FEE_PCT,
            "0.35% SILO Shield Staker Tier",
        );
    }
    if is_buy_kas {
        return (
            crate::fiat_rails::BUY_KAS_INBOUND_FEE_PCT,
            "0.20% Buy-KAS Inbound Tier",
        );
    }
    if usd_volume >= 2_500.0 {
        return (
            crate::fiat_rails::WHOLESALE_VOLUME_SWAP_FEE_PCT,
            "0.25% Volume Wholesale Tier ($2,500+)",
        );
    }
    let is_dark_pool_major = allow_dark_pool_internal_clearing
        && DEFAULT_RESERVE_WHITELIST.iter().any(|&t| t == pay_up)
        && DEFAULT_RESERVE_WHITELIST.iter().any(|&t| t == rec_up);
    if is_dark_pool_major {
        (
            crate::fiat_rails::STANDARD_PUBLIC_SWAP_FEE_PCT,
            "0.50% Dark Pool Major Swap Tier",
        )
    } else {
        (
            crate::fiat_rails::PASS_THROUGH_SWAP_FEE_PCT,
            "0.85% External Pass-Through Swap Tier",
        )
    }
}
async fn has_sufficient_local_lp_depth(
    pool: &PgPool,
    pay_asset: &str,
    receive_asset: &str,
    required_receive_tokens: f64,
) -> (bool, String) {
    let direct_pair = format!("{}/{}", pay_asset, receive_asset);
    let reverse_pair = format!("{}/{}", receive_asset, pay_asset);
    let kas_pair = format!("KAS/{}", receive_asset);
    let rows = sqlx::query(
        r#"
        SELECT pool_pair, staked_asset_a, staked_asset_b, COALESCE(reserves_json, '{}'::jsonb) AS reserves_json
        FROM liquidity_providers
        WHERE pool_pair = $1 OR pool_pair = $2 OR pool_pair = $3 OR pool_pair LIKE '%' || $4 || '%'
        "#,
    )
    .bind(&direct_pair)
    .bind(&reverse_pair)
    .bind(&kas_pair)
    .bind(receive_asset)
    .fetch_all(pool)
    .await
    .unwrap_or_default();
    let mut available_receive_reserve = 0.0_f64;
    let mut matched_pair_label = format!("KAS/{}", receive_asset);
    for r in rows {
        let pair: String = r.try_get("pool_pair").unwrap_or_default();
        let reserves: Value = r.try_get("reserves_json").unwrap_or_else(|_| json!({}));
        if let Some(res_amt) = reserves.get(receive_asset).and_then(|v| v.as_f64()) {
            available_receive_reserve += res_amt.max(0.0);
            matched_pair_label = pair;
            continue;
        }
        let parts: Vec<&str> = pair.split('/').collect();
        if parts.first().copied() == Some(receive_asset) {
            available_receive_reserve += r
                .try_get::<f64, _>("staked_asset_a")
                .unwrap_or(0.0)
                .max(0.0);
            matched_pair_label = pair;
        } else if parts.get(1).copied() == Some(receive_asset) {
            available_receive_reserve += r
                .try_get::<f64, _>("staked_asset_b")
                .unwrap_or(0.0)
                .max(0.0);
            matched_pair_label = pair;
        }
    }
    let has_depth = available_receive_reserve >= (required_receive_tokens * 2.0).max(1e-6);
    (has_depth, matched_pair_label)
}
pub async fn handle_sor_execute(
    State(pool): State<PgPool>,
    Json(req): Json<SorExecuteRequest>,
) -> impl IntoResponse {
    let clean_wallet = req
        .wallet
        .trim()
        .to_lowercase()
        .replace("kaspa:", "")
        .trim()
        .to_string();
    let prefixed_wallet = format!("kaspa:{}", clean_wallet);
    let pay_asset = req.pay_asset.trim().to_uppercase();
    let receive_asset = req.receive_asset.trim().to_uppercase();
    let amount = req.amount;
    if clean_wallet.is_empty() || amount <= 0.0 || pay_asset == receive_asset {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": "Invalid swap parameters: amount must be > 0 and assets must differ."
            })),
        );
    }
    let (steering, dark_pool_paused, _external_dex_paused) =
        match resolve_token_steering_and_firewall(
            &pool,
            &clean_wallet,
            &prefixed_wallet,
            &pay_asset,
            &receive_asset,
        )
        .await
        {
            Ok(res) => res,
            Err(err_resp) => return err_resp,
        };
    let pay_spot = match crate::fiat_rails::resolve_live_spot_price(&pool, &pay_asset).await {
        Ok(p) => p,
        Err(e) => {
            return (
                StatusCode::SERVICE_UNAVAILABLE,
                Json(json!({ "error": e })),
            );
        }
    };
    let receive_spot =
        match crate::fiat_rails::resolve_live_spot_price(&pool, &receive_asset).await {
            Ok(p) => p,
            Err(e) => {
                return (
                    StatusCode::SERVICE_UNAVAILABLE,
                    Json(json!({ "error": e })),
                );
            }
        };
    let kas_spot = if pay_asset == "KAS" {
        pay_spot
    } else if receive_asset == "KAS" {
        receive_spot
    } else {
        crate::fiat_rails::resolve_live_spot_price(&pool, "KAS")
            .await
            .unwrap_or(0.15)
            .max(0.01)
    };
    let gross_usd = amount * pay_spot;
    if gross_usd < 1.0 {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({
                "error": format!(
                    "ANTI_DUST_FLOOR: Minimum swap value is $1.00 USD (submitted ${:.2} USD).",
                    gross_usd
                )
            })),
        );
    }
    let allow_dp_pair = steering.allow_dark_pool_internal_clearing
        && !dark_pool_paused
        && DEFAULT_RESERVE_WHITELIST.iter().any(|&t| t == pay_asset)
        && DEFAULT_RESERVE_WHITELIST.iter().any(|&t| t == receive_asset);
    let (fee_rate, fee_tier_label) = resolve_user_fee_rate(
        &pool,
        &prefixed_wallet,
        &clean_wallet,
        gross_usd,
        &pay_asset,
        &receive_asset,
        allow_dp_pair,
    )
    .await;
    let (network_gas_usd, external_slip_usd) =
        estimate_modeled_gas_and_slippage_usd(&pay_asset, &receive_asset, gross_usd, !allow_dp_pair);
    let hard_floor_usd = (gross_usd * crate::fiat_rails::HARD_PROFIT_FLOOR_PCT).max(0.01);
    let protocol_fee_usd = (gross_usd * fee_rate).max(hard_floor_usd);
    let fee_usd = (protocol_fee_usd + network_gas_usd + external_slip_usd).min(gross_usd);
    let net_usd = (gross_usd - fee_usd).max(0.0);
    if net_usd <= 0.0 {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({
                "error": "ZERO_LOSS_INVARIANT_VIOLATION: Net swap value after protocol fee must be > $0.00."
            })),
        );
    }
    let mut estimated_output = if receive_spot > 0.0 {
        net_usd / receive_spot
    } else {
        0.0
    };
    let (raw_has_local_lp, matched_pool_pair) =
        has_sufficient_local_lp_depth(&pool, &pay_asset, &receive_asset, estimated_output).await;
    let has_local_lp =
        raw_has_local_lp && steering.allow_dark_pool_internal_clearing && !dark_pool_paused;
    let provider_label = if has_local_lp {
        "Perennia 50%-KAS Liquidity Pool"
    } else if receive_asset != "KAS" && receive_asset != "SILO" && receive_asset != "USDC" {
        if let Ok(cn_net_out) =
            crate::fiat_rails::fetch_changenow_estimated_amount("USDC", &receive_asset, net_usd)
                .await
        {
            if cn_net_out > 0.0 {
                estimated_output = estimated_output.min(cn_net_out);
            }
        }
        "Perennia Hybrid SOR + Wholesale Pass-Through"
    } else {
        "Perennia 50%-KAS Liquidity Pool"
    };
    estimated_output = (estimated_output * 100_000_000.0).round() / 100_000_000.0;
    let unified_rate = if amount > 0.0 {
        estimated_output / amount
    } else {
        0.0
    };
    let tx_uuid = format!(
        "PER-SOR-{}",
        Uuid::new_v4()
            .to_string()
            .replace('-', "")
            .chars()
            .take(12)
            .collect::<String>()
            .to_uppercase()
    );
    let anchor_kas_volume = if pay_asset == "KAS" {
        amount
    } else if kas_spot > 0.0 {
        gross_usd / kas_spot
    } else {
        0.0
    };
    let target_distribution_pair = if has_local_lp {
        matched_pool_pair
    } else if pay_asset == "KAS" {
        format!("KAS/{}", receive_asset)
    } else if receive_asset == "KAS" {
        format!("KAS/{}", pay_asset)
    } else {
        format!("{}/{}", pay_asset, receive_asset)
    };
    let waterfall = compute_dynamic_hurdle_waterfall(
        &pool,
        &target_distribution_pair,
        gross_usd,
        fee_usd,
        kas_spot,
    )
    .await;
    if let Err(ledger_debit_err) = crate::state_api::debit_user_token_balance(
        &pool,
        &clean_wallet,
        &prefixed_wallet,
        &pay_asset,
        amount,
    )
    .await
    {
        if pay_asset == "KAS" {
            if let Some(ref utxo_list) = req.utxos {
                if !utxo_list.is_empty() {
                    let sys_cfg = crate::chronos::load_system_treasury_config(&pool).await;
                    let treasury_dest = crate::chronos::resolve_hot_dispatcher_address()
                        .filter(|s| !s.trim().is_empty())
                        .unwrap_or(sys_cfg.cold_kas_address);
                    if !treasury_dest.trim().is_empty() {
                        let amount_sompi = (amount * 100_000_000.0).round() as u64;
                        if let Some((psbt, formatted_utxos)) = assemble_unsigned_kaspa_psbt(
                            &prefixed_wallet,
                            &treasury_dest,
                            amount_sompi,
                            utxo_list,
                        ) {
                            if let Ok(redis_url) = env::var("REDIS_URL") {
                                if let Ok(client) = redis::Client::open(redis_url) {
                                    if let Ok(mut conn) =
                                        client.get_multiplexed_async_connection().await
                                    {
                                        let pending_order = json!({
                                            "wallet": prefixed_wallet,
                                            "direction": "SELL_KAS",
                                            "amount_kas": amount,
                                            "spot_price": pay_spot,
                                            "fee_captured_usd": fee_usd,
                                            "target_asset": receive_asset,
                                            "estimated_output": estimated_output,
                                            "transaction_uuid": tx_uuid
                                        });
                                        let _: redis::RedisResult<()> = redis::cmd("SETEX")
                                            .arg(format!("perennia:pending_swap:{}", clean_wallet))
                                            .arg(900u64)
                                            .arg(pending_order.to_string())
                                            .query_async(&mut conn)
                                            .await;
                                    }
                                }
                            }
                            let anchor_layer_sweep =
                                crate::chronos::sweep_layered_buckets_on_anchor_order(
                                    &pool,
                                    &receive_asset,
                                    anchor_kas_volume,
                                    kas_spot,
                                    receive_spot,
                                )
                                .await
                                .unwrap_or_else(|_| json!({ "layeredBucketsCleared": 0 }));
                            return (
                                StatusCode::OK,
                                Json(json!({
                                    "success": true,
                                    "transaction_uuid": tx_uuid,
                                    "unifiedRate": unified_rate,
                                    "unified_rate": unified_rate,
                                    "estimatedOutput": estimated_output,
                                    "estimated_output": estimated_output,
                                    "feeRate": fee_rate,
                                    "fee_rate": fee_rate,
                                    "feeTierLabel": fee_tier_label,
                                    "feeUsd": fee_usd,
                                    "fee_usd": fee_usd,
                                    "tokenSteering": steering,
                                    "dynamicHurdleWaterfall": waterfall,
                                    "anchorLayerSweep": anchor_layer_sweep,
                                    "legs": [
                                        {
                                            "tier": 1,
                                            "provider": "Perennia L1 Atomic Settlement Router",
                                            "filledAmount": amount,
                                            "executionRate": unified_rate,
                                            "marginCaptured": fee_usd
                                        }
                                    ],
                                    "psbt": psbt,
                                    "formattedUtxos": formatted_utxos
                                })),
                            );
                        }
                    }
                }
            }
        }
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(json!({
                "error": ledger_debit_err
            })),
        );
    }
    if let Err(credit_err) = crate::state_api::credit_user_token_balance(
        &pool,
        &clean_wallet,
        &prefixed_wallet,
        &receive_asset,
        estimated_output,
        false,
    )
    .await
    {
        let _ = crate::state_api::credit_user_token_balance(
            &pool,
            &clean_wallet,
            &prefixed_wallet,
            &pay_asset,
            amount,
            false,
        )
        .await;
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({
                "error": format!("Failed to credit {} output after debit: {}", receive_asset, credit_err)
            })),
        );
    }
    let anchor_layer_sweep = if !has_local_lp {
        crate::chronos::sweep_layered_buckets_on_anchor_order(
            &pool, &receive_asset, anchor_kas_volume, kas_spot, receive_spot,
        ).await.unwrap_or_else(|_| json!({ "layeredBucketsCleared": 0 }))
    } else {
        json!({ "layeredBucketsCleared": 0, "deferredTo10sDarkPoolBatch": true })
    };
    let hifo_summary = match_and_consume_hifo_lots(
        &pool,
        &clean_wallet,
        &pay_asset,
        amount,
        pay_spot,
        Some(&tx_uuid),
    )
    .await
    .ok();
    let _ = record_hifo_acquisition_lot(
        &pool,
        &clean_wallet,
        &receive_asset,
        estimated_output,
        receive_spot,
        "DEX_SWAP",
        Some(&tx_uuid),
    )
    .await;
    let cost_basis_usd = hifo_summary
        .as_ref()
        .map(|s| s.matched_cost_basis_usd)
        .unwrap_or(gross_usd);
    let realized_gain_usd = hifo_summary
        .as_ref()
        .map(|s| s.realized_gain_loss_usd)
        .unwrap_or(0.0);
    let holding_period = hifo_summary
        .as_ref()
        .map(|s| s.holding_period.as_str())
        .unwrap_or("SHORT_TERM");
    let _ = sqlx::query(
        r#"
        INSERT INTO tax_ledger_events (
            wallet_address, asset_ticker, event_type, gross_proceeds_usd,
            amount_tokens, spot_price_at_execution, tx_hash,
            cost_basis_usd, realized_gain_loss_usd, holding_period
        ) VALUES ($1, $2, 'DEX_SWAP', $3, $4, $5, $6, $7, $8, $9)
        "#,
    )
    .bind(&clean_wallet)
    .bind(&pay_asset)
    .bind(gross_usd)
    .bind(amount)
    .bind(pay_spot)
    .bind(&tx_uuid)
    .bind(cost_basis_usd)
    .bind(realized_gain_usd)
    .bind(holding_period)
    .execute(&pool)
    .await;
    let _ = sqlx::query(
        r#"
        INSERT INTO yield_distributions (pool_pair, total_fees_distributed_usd)
        VALUES ($1, $2)
        "#,
    )
    .bind(&target_distribution_pair)
    .bind(waterfall.lp_allocated_fee_usd)
    .execute(&pool)
    .await;
    let _ = sqlx::query(
        r#"
        UPDATE fiat_float_ledger
        SET dark_pool_lp_vault_usd = dark_pool_lp_vault_usd + $1,
            master_treasury_usdc_reserve = COALESCE(master_treasury_usdc_reserve, 0.0) + $2,
            updated_at = CURRENT_TIMESTAMP
        WHERE ledger_id IN ('BOOTSTRAP_PRIMARY', 'PRIMARY_FLOAT')
        "#,
    )
    .bind(waterfall.perennia_lp_compound_60_usd)
    .bind(waterfall.perennia_liquid_reserve_40_usd)
    .execute(&pool)
    .await;
    if let Ok(redis_url) = env::var("REDIS_URL") {
        if let Ok(client) = redis::Client::open(redis_url) {
            if let Ok(mut conn) = client.get_multiplexed_async_connection().await {
                let _: redis::RedisResult<()> = redis::cmd("INCRBYFLOAT")
                    .arg("perennia:treasury:netting_profit_usd")
                    .arg(waterfall.perennia_total_cut_usd)
                    .query_async(&mut conn)
                    .await;
                let _: redis::RedisResult<()> = redis::cmd("INCRBYFLOAT")
                    .arg("perennia:fees:batch_accumulated:USDC")
                    .arg(waterfall.perennia_lp_compound_60_usd)
                    .query_async(&mut conn)
                    .await;
                for leg in &steering.fee_legs {
                    let leg_usd = waterfall.perennia_total_cut_usd * leg.share_ratio;
                    let leg_spot = if leg.asset == pay_asset {
                        pay_spot
                    } else if leg.asset == receive_asset {
                        receive_spot
                    } else if leg.asset == "KAS" {
                        kas_spot
                    } else {
                        1.0
                    };
                    let leg_tokens = if leg_spot > 0.0 {
                        leg_usd / leg_spot
                    } else {
                        leg_usd
                    };
                    if leg.asset != "USDC" {
                        let _: redis::RedisResult<()> = redis::cmd("INCRBYFLOAT")
                            .arg(format!("perennia:fees:batch_accumulated:{}", leg.asset))
                            .arg(leg_tokens)
                            .query_async(&mut conn)
                            .await;
                    }
                }
                let _: redis::RedisResult<()> = redis::cmd("INCRBYFLOAT")
                    .arg(format!("perennia:lp:pending_yield_usd:{}", target_distribution_pair))
                    .arg(waterfall.lp_allocated_fee_usd)
                    .query_async(&mut conn)
                    .await;
                let direction = if pay_asset == "KAS" {
                    "SELL_KAS"
                } else if receive_asset == "KAS" {
                    "BUY_KAS"
                } else {
                    "CROSS_ASSET"
                };
                let kas_equiv: f64 = if pay_asset == "KAS" {
                    amount
                } else if kas_spot > 0.0_f64 {
                    gross_usd / kas_spot
                } else {
                    estimated_output
                };
                let queued_at_ms = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_millis() as i64;
                let netting_order = json!({
                    "tx_uuid": tx_uuid,
                    "wallet": prefixed_wallet,
                    "direction": direction,
                    "pay_asset": pay_asset,
                    "receive_asset": receive_asset,
                    "pay_amount": amount,
                    "receive_amount": estimated_output,
                    "amount_kas": kas_equiv,
                    "gross_usd": gross_usd,
                    "net_usd": net_usd,
                    "fee_captured_usd": waterfall.perennia_total_cut_usd,
                    "total_fee_usd": fee_usd,
                    "queued_at_ms": queued_at_ms
                });
                let _: redis::RedisResult<()> = redis::cmd("RPUSH")
                    .arg("perennia:sor:netting_queue")
                    .arg(netting_order.to_string())
                    .query_async(&mut conn)
                    .await;
            }
        }
    }
    let _ = (&req.slippage_tolerance, &req.system_mode);
    (
        StatusCode::OK,
        Json(json!({
            "success": true,
            "transaction_uuid": tx_uuid,
            "unifiedRate": unified_rate,
            "unified_rate": unified_rate,
            "estimatedOutput": estimated_output,
            "estimated_output": estimated_output,
            "feeRate": fee_rate,
            "fee_rate": fee_rate,
            "feeTierLabel": fee_tier_label,
            "feeUsd": fee_usd,
            "fee_usd": fee_usd,
            "tokenSteering": steering,
            "dynamicHurdleWaterfall": waterfall,
            "anchorLayerSweep": anchor_layer_sweep,
            "legs": [
                {
                    "tier": 1,
                    "provider": provider_label,
                    "filledAmount": amount,
                    "executionRate": unified_rate,
                    "marginCaptured": fee_usd
                }
            ],
            "psbt": Value::Null,
            "formattedUtxos": []
        })),
    )
}
```
