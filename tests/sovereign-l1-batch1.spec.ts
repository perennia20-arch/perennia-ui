import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { blake2b } from '@noble/hashes/blake2.js';
import { schnorr } from '@noble/curves/secp256k1.js';
import {
    BroadcastValidationError,
    KAS_DECIMALS,
    LIVE_PRICING_UNAVAILABLE_MESSAGE,
    ORACLE_E8_DECIMALS,
    POST_TOCCATA_TX_VERSION,
    RELAY_FEE_PER_GRAM_SOMPI,
    SOMPI_PER_KAS,
    U128_MAX,
    USD_MICROS_DECIMALS,
    atomicToUsdMicrosCeil,
    atomicToUsdMicrosFloor,
    ceilDivBigInt,
    computeKaspaTxV1InputSighash,
    computePostToccataMassAndFee,
    countRedeemScriptSigOps,
    encodeTxScriptPushData,
    formatAtomicToDecimal,
    mulBpsCeil,
    normalizeAllocationBps,
    normalizeStateActionPayload,
    parseDecimalToAtomic,
    parseKasDecimalToSompi,
    parseSompiU64,
    parseU128Str,
    signSorPskt,
    signVaultCancelPskt,
    toU128Str,
    validateAndSanitizePostToccataBroadcastTx,
    type PsktPayload
} from '../src/lib/crypto/atomicMath';
import { bytesToHex, concatBytes, hexToBytes } from '../src/lib/crypto/kaspaAddress';

test.describe('Batch 1 — Sovereign L1 Atomic Math, Post-Toccata v1 & Non-Custodial State Guardrails', () => {
    test('strict BigInt & U128Str parsing rejects floats, scientific notation, and unsafe JS numbers', () => {
        expect(parseU128Str('0')).toBe(0n);
        expect(parseU128Str('100000000')).toBe(SOMPI_PER_KAS);
        expect(parseU128Str(U128_MAX.toString())).toBe(U128_MAX);

        const whaleSompi = 150_000_000_000_000_000n;
        expect(toU128Str(whaleSompi)).toBe('150000000000000000');
        expect(parseSompiU64('150000000000000000')).toBe(whaleSompi);

        for (const bad of [0.15, 1.25, -1, Number.NaN, Number.MAX_SAFE_INTEGER + 1, '1.25', '1e8', '-5', '']) {
            expect(() => parseU128Str(bad)).toThrow();
        }
    });

    test('pure string-splitting decimal conversion & ceil bps math prevent IEEE-754 drift', () => {
        expect(parseDecimalToAtomic('19.99', KAS_DECIMALS)).toBe(1_999_000_000n);
        expect(parseKasDecimalToSompi('0.00000001', 'strict')).toBe(1n);
        expect(parseDecimalToAtomic('0.15000001', ORACLE_E8_DECIMALS)).toBe(15_000_001n);
        expect(() => parseDecimalToAtomic('1.000000001', KAS_DECIMALS, 'strict')).toThrow();
        expect(parseDecimalToAtomic('1.000000001', KAS_DECIMALS, 'ceil')).toBe(100_000_001n);
        expect(parseDecimalToAtomic('1.000000001', KAS_DECIMALS, 'floor')).toBe(100_000_000n);

        expect(formatAtomicToDecimal(1_999_000_000n, KAS_DECIMALS)).toBe('19.99');
        expect(formatAtomicToDecimal('150000000000000000', KAS_DECIMALS)).toBe('1500000000');

        expect(ceilDivBigInt(101n, 100n)).toBe(2n);
        expect(mulBpsCeil(101n, 50)).toBe(1n);
        expect(mulBpsCeil(25_000_000_000n, 50)).toBe(125_000_000n);

        // 250 KAS @ $0.12345678 = $30.864195
        const microsFloor = atomicToUsdMicrosFloor(25_000_000_000n, KAS_DECIMALS, 12_345_678n);
        const microsCeil = atomicToUsdMicrosCeil(25_000_000_000n, KAS_DECIMALS, 12_345_678n);
        expect(microsFloor).toBe(30_864_195n);
        expect(microsCeil).toBe(30_864_195n);
        expect(formatAtomicToDecimal(microsFloor, USD_MICROS_DECIMALS)).toBe('30.864195');

        expect(normalizeAllocationBps({ allocationBps: 2500 })).toBe(2500);
        expect(normalizeAllocationBps({ allocationPercentage: 25 })).toBe(2500);
        expect(() => normalizeAllocationBps({ allocationBps: 10001 })).toThrow();
    });

    test('Post-Toccata v1 broadcast validator enforces version=1, storageMass, integer sompi, and KIP-20 covenant bindings', () => {
        const txId = 'a'.repeat(64);
        const spkHex = `20${'b'.repeat(64)}ac`;
        const covId = 'c'.repeat(64);

        const validPayload = {
            transaction: {
                version: POST_TOCCATA_TX_VERSION,
                inputs: [
                    {
                        previousOutpoint: { transactionId: txId, index: 0 },
                        signatureScript: `41${'d'.repeat(128)}01`,
                        sequence: 0,
                        sigOpCount: 1
                    }
                ],
                outputs: [
                    {
                        amount: '150000000000000000',
                        scriptPublicKey: { version: 0, scriptPublicKey: spkHex },
                        covenant: { authorizingInput: 0, covenantId: covId }
                    }
                ],
                lockTime: 0,
                subnetworkId: '0000000000000000000000000000000000000000',
                gas: 0,
                payload: '',
                storageMass: '1850'
            }
        };

        const validated = validateAndSanitizePostToccataBroadcastTx(validPayload);
        expect(validated.transaction.version).toBe(1);
        expect(validated.transaction.storageMass).toBe('1850');
        expect(validated.transaction.outputs[0].amount).toBe('150000000000000000');
        expect(validated.transaction.outputs[0].covenant).toEqual({
            authorizingInput: 0,
            covenantId: covId
        });
        expect(validated.firstOutputSompi).toBe(150_000_000_000_000_000n);

        // Reject version 0
        expect(() =>
            validateAndSanitizePostToccataBroadcastTx({
                transaction: { ...validPayload.transaction, version: 0 }
            })
        ).toThrow(BroadcastValidationError);

        // Reject missing storageMass
        const { storageMass: _omitted, ...noMass } = validPayload.transaction;
        expect(() => validateAndSanitizePostToccataBroadcastTx({ transaction: noMass })).toThrow(
            /storageMass/
        );

        // Reject float amount
        expect(() =>
            validateAndSanitizePostToccataBroadcastTx({
                transaction: {
                    ...validPayload.transaction,
                    outputs: [{ amount: 12.5, scriptPublicKey: spkHex }]
                }
            })
        ).toThrow(/floating-point/i);

        // Reject malformed KIP-20 covenant binding
        expect(() =>
            validateAndSanitizePostToccataBroadcastTx({
                transaction: {
                    ...validPayload.transaction,
                    outputs: [
                        {
                            amount: '100000000',
                            scriptPublicKey: spkHex,
                            covenant: { authorizingInput: 3, covenantId: covId }
                        }
                    ]
                }
            })
        ).toThrow(/authorizingInput/);
    });

    test('BUILD_VAULT_CANCEL_PSKT Path A P2SH & SOR PSKT local Schnorr signing produce valid Post-Toccata v1 transactions', () => {
        const privKeyBytes = blake2b(new TextEncoder().encode('batch1-vault-owner-key'), {
            dkLen: 32
        });
        const privKeyHex = bytesToHex(privKeyBytes);
        const ownerPubkey = schnorr.getPublicKey(privKeyBytes);
        const triggerPubkey = schnorr.getPublicKey(
            blake2b(new TextEncoder().encode('batch1-chronos-trigger'), { dkLen: 32 })
        );
        const kip17Commitment = blake2b(new TextEncoder().encode('kip17-policy'), { dkLen: 32 });

        // Canonical dual-path Toccata Vault redeemScript (105 bytes, 2 OP_CHECKSIG opcodes)
        const redeemScriptBytes = concatBytes(
            new Uint8Array([0x63, 0x20]),
            ownerPubkey,
            new Uint8Array([0xac, 0x67, 0x20]),
            kip17Commitment,
            new Uint8Array([0x75, 0x20]),
            triggerPubkey,
            new Uint8Array([0xac, 0x68])
        );
        expect(redeemScriptBytes.length).toBe(105);
        expect(countRedeemScriptSigOps(redeemScriptBytes)).toBe(2);

        const scriptHashHex = bytesToHex(blake2b(redeemScriptBytes, { dkLen: 32 }));
        const covenantSpkHex = `a9${scriptHashHex}87`;
        const refundSpkHex = `20${bytesToHex(ownerPubkey)}ac`;

        const inputSompi = 500_000_000n;
        const massInfo = computePostToccataMassAndFee({
            inputSompi: [inputSompi],
            outputSompi: [499_700_000n],
            extraSigScriptBytes: redeemScriptBytes.length,
            feePerGramSompi: RELAY_FEE_PER_GRAM_SOMPI
        });
        const refundSompi = inputSompi - massInfo.networkFeeSompi;

        const cancelPskt: PsktPayload = {
            version: 1,
            subnetworkId: '0000000000000000000000000000000000000000',
            lockTime: 0,
            inputs: [
                {
                    previousOutpoint: { transactionId: '1'.repeat(64), index: 0 },
                    utxoEntry: {
                        amount: inputSompi.toString(),
                        scriptPublicKey: { version: 0, scriptPublicKey: covenantSpkHex }
                    },
                    redeemScriptHex: bytesToHex(redeemScriptBytes),
                    spendPath: 'PATH_A_OWNER_CANCEL',
                    sequence: 0
                }
            ],
            outputs: [
                {
                    value: refundSompi.toString(),
                    scriptPublicKey: { version: 0, scriptPublicKey: refundSpkHex }
                }
            ],
            payload: ''
        };

        const signedCancelTx = signVaultCancelPskt({
            pskt: cancelPskt,
            privateKeyHex: privKeyHex,
            storageMass: massInfo.storageMass
        });
        expect(signedCancelTx.version).toBe(1);
        expect(signedCancelTx.inputs[0].sigOpCount).toBe(2);
        expect(signedCancelTx.storageMass).toBe(massInfo.storageMass.toString());

        // Witness must start with 65-byte sig push (0x41 + 65 bytes), OP_TRUE (0x51), OP_PUSHDATA1 105 (0x4c 0x69)
        const sigScriptBytes = hexToBytes(signedCancelTx.inputs[0].signatureScript);
        expect(sigScriptBytes[0]).toBe(65);
        const sig64 = sigScriptBytes.slice(1, 65);
        expect(sigScriptBytes[65]).toBe(0x01); // SIGHASH_ALL
        expect(sigScriptBytes[66]).toBe(0x51); // OP_TRUE
        expect(sigScriptBytes[67]).toBe(0x4c); // OP_PUSHDATA1
        expect(sigScriptBytes[68]).toBe(105);
        expect(bytesToHex(encodeTxScriptPushData(redeemScriptBytes))).toBe(
            bytesToHex(sigScriptBytes.slice(67))
        );

        const sighash = computeKaspaTxV1InputSighash(
            signedCancelTx,
            0,
            covenantSpkHex,
            inputSompi
        );
        expect(schnorr.verify(sig64, sighash, ownerPubkey)).toBe(true);
        expect(() => validateAndSanitizePostToccataBroadcastTx(signedCancelTx)).not.toThrow();

        // Also test SOR PSKT signing with KIP-20 covenant binding preserved
        const covId = 'e'.repeat(64);
        const sorPskt: PsktPayload = {
            version: 1,
            inputs: [
                {
                    previousOutpoint: { transactionId: '2'.repeat(64), index: 1 },
                    sequence: 0
                }
            ],
            outputs: [
                {
                    amount: '2500000000',
                    scriptPublicKey: { version: 0, scriptPublicKey: refundSpkHex },
                    covenant: { authorizingInput: 0, covenantId: covId }
                }
            ]
        };
        const signedSorTx = signSorPskt({
            pskt: sorPskt,
            privateKeyHex: privKeyHex,
            formattedUtxos: [
                {
                    transactionId: '2'.repeat(64),
                    index: 1,
                    amount: '3000000000',
                    scriptPublicKey: refundSpkHex
                }
            ]
        });
        expect(signedSorTx.outputs[0].covenant).toEqual({
            authorizingInput: 0,
            covenantId: covId
        });
        const sorSigBytes = hexToBytes(signedSorTx.inputs[0].signatureScript);
        const sorSighash = computeKaspaTxV1InputSighash(
            signedSorTx,
            0,
            refundSpkHex,
            3_000_000_000n
        );
        expect(schnorr.verify(sorSigBytes.slice(1, 65), sorSighash, ownerPubkey)).toBe(true);
        expect(() => validateAndSanitizePostToccataBroadcastTx(signedSorTx)).not.toThrow();
    });

    test('state action normalizer rejects all retired custodial actions with 422 and enforces integer allocationBps', () => {
        const retired = [
            'CLAIM_PENDING_SECTOR_KAS',
            'STAKE_LP',
            'WITHDRAW_LP',
            'STAKE_SILO',
            'CLAIM_UNSTAKED_SILO',
            'SWEEP_TOKEN_TO_COLD_VAULT_NOW',
            'SWEEP_TO_COLD_VAULT_NOW',
            'WITHDRAW_SYNTHETIC_ASSET',
            'DISPATCH_L1_PAYOUT',
            'DISPATCH_OTC_UTXOS'
        ];
        for (const action of retired) {
            const res = normalizeStateActionPayload(action, {});
            expect(res.ok).toBe(false);
            if (!res.ok) {
                expect(res.status).toBe(422);
                expect(res.body.error).toBe('NON_CUSTODIAL_L1_ONLY');
                expect(res.body.message).not.toMatch(/PSKT|KIP-20|sompi|ORACLE_HALT|DAA/i);
            }
        }

        const allocOk = normalizeStateActionPayload('UPDATE_SECTOR_ALLOCATION', {
            sectorId: 'sec-1',
            allocationBps: 3333
        });
        expect(allocOk.ok).toBe(true);
        if (allocOk.ok) {
            expect(allocOk.payload.allocationBps).toBe(3333);
        }

        const allocBad = normalizeStateActionPayload('UPDATE_SECTOR_ALLOCATION', {
            sectorId: 'sec-1',
            allocationBps: 12.5
        });
        expect(allocBad.ok).toBe(false);
        if (!allocBad.ok) {
            expect(allocBad.status).toBe(400);
        }

        const valveOk = normalizeStateActionPayload('UPSERT_THERMOSTAT_VALVES', {
            priorityOrder: 1,
            valveType: 'VALVE_1_ELECTRIC_BILL',
            destinationAddress: 'kaspa:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e',
            targetCapSompi: '2500000000',
            targetCapUsdMicros: '150000000'
        });
        expect(valveOk.ok).toBe(true);
        expect(LIVE_PRICING_UNAVAILABLE_MESSAGE).toBe('Live pricing unavailable');
    });

    test('all 5 Batch 1 src/ files contain zero yield_reservoirs, 0.15 fallbacks, * 1e8 / / 1e8 math, or version: 0 literals', () => {
        const batch1Files = [
            'src/lib/crypto/atomicMath.ts',
            'src/routes/api/broadcast/+server.ts',
            'src/lib/stores/transaction.svelte.ts',
            'src/routes/api/state/action/+server.ts',
            'src/routes/api/state/+server.ts'
        ];
        for (const relPath of batch1Files) {
            const absPath = path.resolve(process.cwd(), relPath);
            const content = fs.readFileSync(absPath, 'utf8');
            expect(content, `${relPath} must not reference yield_reservoirs`).not.toMatch(
                /yield_reservoirs/i
            );
            expect(content, `${relPath} must not contain 0.15 fallback`).not.toMatch(
                /(?<![0-9.])0\.15(?![0-9])/
            );
            expect(content, `${relPath} must not use * 1e8 or / 1e8 float math`).not.toMatch(
                /[*/]\s*1e8\b/
            );
            const withoutSpkVersion0 = content.replace(
                /version\s*:\s*0\s*,\s*scriptPublicKey\s*:/g,
                'spkVerZero:'
            );
            expect(
                withoutSpkVersion0,
                `${relPath} must not construct tx version: 0`
            ).not.toMatch(/\bversion\s*:\s*0\b/);
        }
    });
});
