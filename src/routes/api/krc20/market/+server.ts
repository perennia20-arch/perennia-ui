import { json, type RequestHandler } from '@sveltejs/kit';
import { redis } from '$lib/server/redis';
import { ORACLE_E8_DECIMALS, safeDecimalToAtomic } from '$lib/crypto/atomicMath';

async function resolveKasSpotUsd(): Promise<number> {
for (const key of ['oracle:spot:KAS_USDC', 'oracle:spot:KAS_USD']) {
const raw = await redis.get(key).catch(() => null);
const val = raw ? parseFloat(raw) : 0;
if (Number.isFinite(val) && val > 0) return val;
}
try {
const res = await fetch('https://api.kaspa.org/info/price?stringOnly=false', {
headers: { accept: 'application/json' }, signal: AbortSignal.timeout(2500)
});
if (res.ok) {
const data = await res.json();
const p = Number(data?.price ?? 0);
if (Number.isFinite(p) && p > 0) return p;
}
} catch {}
return 0;
}

export const GET: RequestHandler = async ({ url }) => {
const rawTicker = url.searchParams.get('ticker');
if (!rawTicker) return json({ error: 'Missing ticker parameter' }, { status: 400 });
const ticker = rawTicker.trim().toUpperCase();
if (!/^[A-Z0-9]{2,12}$/.test(ticker)) {
return json({ price: 0, error: 'Invalid KRC-20 ticker format' }, { status: 400 });
}
try {
const kasUsd = await resolveKasSpotUsd();
const [kcFloorRes, kcStatsRes, kpRes, fyiRes] = await Promise.allSettled([
fetch(`https://api.kaspa.com/api/floor-price?ticker=${encodeURIComponent(ticker)}`, {
headers: { accept: 'application/json' }, signal: AbortSignal.timeout(3500)
}),
fetch(`https://api.kaspa.com/api/trade-stats?ticker=${encodeURIComponent(ticker)}&timeFrame=24h`, {
headers: { accept: 'application/json' }, signal: AbortSignal.timeout(3500)
}),
fetch(`https://api.kasplex.org/v1/krc20/token/${encodeURIComponent(ticker)}`, {
headers: { accept: 'application/json' }, signal: AbortSignal.timeout(3500)
}),
fetch(`https://api.kas.fyi/v1/tokens/krc20/${encodeURIComponent(ticker)}/market`, {
headers: { accept: 'application/json' }, signal: AbortSignal.timeout(3000)
})
]);

let priceUsd = 0, priceKas = 0, change24h = 0, volume24hKas = 0, volume24hUsd = 0;
let trades24h = 0, holders = 0, maxSupply = 0, mintedSupply = 0;
let state = 'unknown', existsOnKasplex = false, source = 'NONE';

if (kpRes.status === 'fulfilled' && kpRes.value.ok) {
const kp = await kpRes.value.json().catch(() => null);
const entry = Array.isArray(kp?.result) ? kp.result[0] : kp?.result;
const rawState = String(entry?.state || '').toLowerCase();
if (entry?.tick && rawState !== 'unused' && rawState !== 'not_found') {
existsOnKasplex = true;
const dec = Number(entry.dec ?? 8);
maxSupply = Number(entry.max || 0) / Math.pow(10, dec);
mintedSupply = Number(entry.minted || 0) / Math.pow(10, dec);
holders = Number(entry.holderTotal ?? entry.holders ?? 0);
state = String(entry.state || 'deployed');
}
}
if (fyiRes.status === 'fulfilled' && fyiRes.value.ok) {
const mkt = await fyiRes.value.json().catch(() => null);
const fyiUsd = Number(mkt?.price?.usd ?? mkt?.priceUsd ?? mkt?.price ?? 0);
const fyiKas = Number(mkt?.price?.kas ?? mkt?.priceKas ?? 0);
if (Number.isFinite(fyiKas) && fyiKas > 0) priceKas = fyiKas;
if (Number.isFinite(fyiUsd) && fyiUsd > 0) { priceUsd = fyiUsd; source = 'KAS_FYI'; }
else if (priceKas > 0 && kasUsd > 0) { priceUsd = Number((priceKas * kasUsd).toPrecision(8)); source = 'KAS_FYI_KAS'; }
const chg = Number(mkt?.change24h ?? mkt?.priceChange24h ?? mkt?.change_24h ?? 0);
if (Number.isFinite(chg)) change24h = chg;
}
if (kcFloorRes.status === 'fulfilled' && kcFloorRes.value.ok) {
const floorJson = await kcFloorRes.value.json().catch(() => null);
const item = Array.isArray(floorJson) ? floorJson[0] : floorJson;
const floorKas = Number(item?.floor_price ?? item?.floorPrice ?? 0);
if (Number.isFinite(floorKas) && floorKas > 0) {
if (priceKas <= 0) priceKas = floorKas;
if (priceUsd <= 0 && kasUsd > 0) {
priceUsd = Number((floorKas * kasUsd).toPrecision(8));
source = 'KASPACOM_L1_FLOOR';
}
}
}
if (kcStatsRes.status === 'fulfilled' && kcStatsRes.value.ok) {
const stats = await kcStatsRes.value.json().catch(() => null);
const tok = Array.isArray(stats?.tokens) ? stats.tokens[0] : null;
volume24hKas = Number(tok?.totalVolumeKAS ?? stats?.totalVolumeKasKaspiano ?? 0) || 0;
volume24hUsd = Number(tok?.totalVolumeUsd ?? stats?.totalVolumeUsdKaspiano ?? 0) || 0;
trades24h = Number(tok?.totalTrades ?? stats?.totalTradesKaspiano ?? 0) || 0;
}
if (priceUsd > 0) {
const priceE8 = safeDecimalToAtomic(priceUsd.toFixed(8), ORACLE_E8_DECIMALS, 0n, 'floor').toString();
const pipe = redis.pipeline();
pipe.set(`krc20:spot:${ticker}_USD`, String(priceUsd), 'EX', 90);
pipe.set(`oracle:spot:${ticker}_USDC`, String(priceUsd), 'EX', 90);
pipe.set(`oracle:spot:${ticker}_E8`, priceE8, 'EX', 90);
await pipe.exec().catch(() => {});
return json({
success: true, ticker, price: priceUsd, priceUsd, priceE8, priceKas, change24h,
volume24hKas, volume24hUsd, trades24h, holders, maxSupply, mintedSupply,
existsOnKasplex, state, source
});
}
return json({
price: 0,
priceE8: '0',
ticker,
existsOnKasplex,
state,
livePricingUnavailable: true
}, { status: existsOnKasplex ? 503 : 404 });
} catch {
return json({ price: 0 }, { status: 500 });
}
};
