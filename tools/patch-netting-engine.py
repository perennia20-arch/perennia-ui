import pathlib, shutil

ROOT = pathlib.Path.home() / "perennia-v5-backend" / "src"

def load_from_backup(rel: str) -> tuple[pathlib.Path, str]:
    target = ROOT / rel
    bak = target.with_suffix(target.suffix + ".bak_v5_netting")
    if not bak.exists():
        shutil.copy2(target, bak)
    return target, bak.read_text(encoding="utf-8")

# 1. state_api.rs: atomic DB + Redis sync on non-KAS token debits
p_state, s_state = load_from_backup("state_api.rs")
i_deb = s_state.index("pub async fn debit_user_token_balance(")
i_cred = s_state.index("\npub async fn credit_user_token_balance(")
NEW_DEBIT = """pub async fn debit_user_token_balance(
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
"""
p_state.write_text(s_state[:i_deb] + NEW_DEBIT + s_state[i_cred:], encoding="utf-8")

# 2. sor.rs: defer Dark Pool silo sweeps to 10s batch & enqueue every swap leg into netting_queue
p_sor, s_sor = load_from_backup("sor.rs")
OLD_ANCHOR = """    let anchor_layer_sweep = crate::chronos::sweep_layered_buckets_on_anchor_order(
        &pool,
        &receive_asset,
        anchor_kas_volume,
        kas_spot,
        receive_spot,
    )
    .await
    .unwrap_or_else(|_| json!({ "layeredBucketsCleared": 0 }));

    let hifo_summary = match_and_consume_hifo_lots("""
NEW_ANCHOR = """    let anchor_layer_sweep = if !has_local_lp {
        crate::chronos::sweep_layered_buckets_on_anchor_order(
            &pool, &receive_asset, anchor_kas_volume, kas_spot, receive_spot,
        ).await.unwrap_or_else(|_| json!({ "layeredBucketsCleared": 0 }))
    } else {
        json!({ "layeredBucketsCleared": 0, "deferredTo10sDarkPoolBatch": true })
    };

    let hifo_summary = match_and_consume_hifo_lots("""
assert OLD_ANCHOR in s_sor, "OLD_ANCHOR missing in sor.rs"
s_sor = s_sor.replace(OLD_ANCHOR, NEW_ANCHOR, 1)

OLD_SOR_TAIL = """                let _: redis::RedisResult<()> = redis::cmd("INCRBYFLOAT")
                    .arg(format!(
                        "perennia:lp:pending_yield_usd:{}",
                        target_distribution_pair
                    ))
                    .arg(waterfall.lp_allocated_fee_usd)
                    .query_async(&mut conn)
                    .await;
            }
        }
    }
    let _ = (&req.slippage_tolerance, &req.system_mode);"""
NEW_SOR_TAIL = """                let _: redis::RedisResult<()> = redis::cmd("INCRBYFLOAT")
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
    let _ = (&req.slippage_tolerance, &req.system_mode);"""
assert OLD_SOR_TAIL in s_sor, "OLD_SOR_TAIL missing in sor.rs"
p_sor.write_text(s_sor.replace(OLD_SOR_TAIL, NEW_SOR_TAIL, 1), encoding="utf-8")

# 3. chronos/netting.rs: 10s sweep + 3-layer Dark Pool crossing + pooled 22:00 UTC buckets
p_net, s_net = load_from_backup("chronos/netting.rs")
assert "Duration::from_secs(30)" in s_net, "30s timer missing in netting.rs"
s_net = s_net.replace("Duration::from_secs(30)", "Duration::from_secs(10)", 1)
i_run = s_net.index("pub async fn run_delta_netting_cycle(")

NEW_NETTING = """pub async fn run_delta_netting_cycle(
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
"""
p_net.write_text(s_net[:i_run] + NEW_NETTING, encoding="utf-8")

# 4. admin_api.rs: internal-token-gated /v1/admin/netting-cycle & /v1/admin/netting-lab
p_adm, s_adm = load_from_backup("admin_api.rs")
OLD_ROUTES = """        .route("/v1/admin/epoch-bell", post(handle_force_epoch_bell))
}"""
NEW_ROUTES = """        .route("/v1/admin/epoch-bell", post(handle_force_epoch_bell))
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
}"""
assert OLD_ROUTES in s_adm, "OLD_ROUTES missing in admin_api.rs"
p_adm.write_text(s_adm.replace(OLD_ROUTES, NEW_ROUTES, 1), encoding="utf-8")
print("PATCH_APPLIED_OK: state_api.rs, sor.rs, chronos/netting.rs, admin_api.rs")