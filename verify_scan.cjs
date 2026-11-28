'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const SRC_ROOT = path.join(ROOT, 'src');

function walkFiles(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walkFiles(full));
        } else if (entry.isFile()) {
            out.push(full);
        }
    }
    return out;
}

const retiredActionPattern =
    /\b(CLAIM_PENDING_SECTOR_KAS|STAKE_LP|WITHDRAW_LP|STAKE_SILO|CLAIM_UNSTAKED_SILO|SWEEP_TOKEN_TO_COLD_VAULT_NOW|SWEEP_TO_COLD_VAULT_NOW|WITHDRAW_SYNTHETIC_ASSET|DISPATCH_L1_PAYOUT|DISPATCH_OTC_UTXOS)\b/;

const hardcodedDarkHexPattern =
    /#(?:06080b|070b0e|080b10|0a0d12|0a1815|0b0e14|0c1017|0d1117|11161f|141923|161b22|161d29|1a080a)\b|\bbg-(?:black|slate-950|zinc-950|neutral-950|gray-950|red-950|amber-950|teal-950)(?:\/[0-9]+)?\b|rgba\((?:0,\s*0,\s*0,\s*0\.(?:7|8|9)|5,\s*7,\s*11|6,\s*8,\s*11|10,\s*13,\s*18)/i;

const lfCheckedFiles = [
    'src/routes/api/state/+server.ts',
    'src/routes/+layout.svelte',
    'src/lib/components/operations/operationsHelpers.ts',
    'src/lib/components/operations/SectorCard.svelte',
    'src/lib/views/OperationsView.svelte',
    'tests/sovereign-l1-batch1.spec.ts',
    'tests/sovereign-l1-batch2.spec.ts',
    'tests/sovereign-l1-batch3.spec.ts',
    'tests/sovereign-l1-batch4-6.spec.ts',
    'verify_scan.cjs'
];

const violations = [];
const srcFiles = walkFiles(SRC_ROOT).filter((f) => /\.(ts|svelte|css)$/.test(f));

for (const abs of srcFiles) {
    const rel = path.relative(ROOT, abs).replace(/\\/g, '/');
    const src = fs.readFileSync(abs, 'utf8');

    if (/(?<![0-9.])0\.15(?![0-9])/.test(src)) {
        violations.push(`${rel}: contains 0.15 fallback`);
    }
    if (/yield_reservoirs/i.test(src)) {
        violations.push(`${rel}: contains yield_reservoirs`);
    }
    if (src.includes('computeReservoirHmac')) {
        violations.push(`${rel}: contains computeReservoirHmac`);
    }
    if (src.includes('dev:sor:treasury:balances')) {
        violations.push(`${rel}: contains dev:sor:treasury:balances`);
    }
    if (/backdrop-blur|backdrop-filter/i.test(src)) {
        violations.push(`${rel}: contains backdrop-blur or backdrop-filter`);
    }
    if (/[*/]\s*1e8\b/i.test(src)) {
        violations.push(`${rel}: contains * 1e8 or / 1e8 float math`);
    }
    if (rel !== 'src/lib/crypto/atomicMath.ts' && retiredActionPattern.test(src)) {
        violations.push(`${rel}: references retired custodial 422 action`);
    }
    if (rel !== 'src/app.css' && hardcodedDarkHexPattern.test(src)) {
        violations.push(`${rel}: contains hardcoded dark hex or dark surface class (Light Mode ban)`);
    }
}

for (const rel of lfCheckedFiles) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
        violations.push(`${rel}: missing expected file`);
        continue;
    }
    const raw = fs.readFileSync(abs, 'utf8');
    if (raw.includes('\r')) {
        violations.push(`${rel}: contains CR/CRLF line endings`);
    }
}

if (violations.length > 0) {
    console.error(`verify_scan.cjs: ${violations.length} violation(s) found:`);
    for (const v of violations) {
        console.error(`  - ${v}`);
    }
    process.exit(1);
}

console.log(`verify_scan.cjs: 0 violations (${srcFiles.length} src files scanned)`);
