import { test, expect } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

// ============================================================================
// SIMULATED TEST DATA
// ============================================================================
const TEST_WALLET = 'kaspa:qtestprototypewalletforash00000000000000000000000000000000000';
const ADMIN_KEY = process.env.PERENNIA_ADMIN_KEY || 'perennia_test_key';

test.describe.serial('Tax Fortress Compliance Pipeline & 1099-DA Generation', () => {

    test('Phase 1: AES-256-GCM KYC Encryption Loop', async ({ request }) => {
        const kycPayload = {
            walletAddress: TEST_WALLET,
            legalName: 'Perennia Prototype Testing LLC',
            entityType: 'LLC',
            tin: '12-3456789',
            address: '100 Energy Way, Richardson, TX 75082'
        };

        const postKycRes = await request.post('/api/treasury/kyc', { data: kycPayload });
        const postData = await postKycRes.json().catch(() => ({}));
        
        expect(postKycRes.ok(), `API ERROR: ${JSON.stringify(postData)}`).toBeTruthy();
        expect(postData.success).toBe(true);

        const getKycRes = await request.get('/api/treasury/kyc', {
            headers: { Cookie: `perennia_session=${encodeURIComponent(TEST_WALLET)}` }
        });

        const getData = await getKycRes.json().catch(() => ({}));
        expect(getKycRes.ok(), `API ERROR: ${JSON.stringify(getData)}`).toBeTruthy();
        
        expect(getData.status).toBe('verified');
        expect(getData.entity.legalName).toBe(kycPayload.legalName);
        expect(getData.entity.tinLast4).toBe('6789'); 
    });

    test('Phase 2: Internal Sovereign OTC Settlement Ingestion', async ({ request }) => {
        const otcPayload = {
            walletAddress: TEST_WALLET,
            fiatAmount: 5000.00,
            cryptoCurrency: 'KAS',
            cryptoAmount: 31250.00
        };

        const settlementRes = await request.post('/api/otc/settle', {
            data: otcPayload,
            headers: {
                'Authorization': `Bearer ${ADMIN_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        const settlementData = await settlementRes.json().catch(() => ({}));
        expect(settlementRes.ok(), `OTC SETTLEMENT ERROR: ${JSON.stringify(settlementData)}`).toBeTruthy();
        expect(settlementData.success).toBe(true);
    });

    test('Phase 3: 1099-DA PDF Compilation & Verification', async ({ request }) => {
        const pdfRes = await request.post('/api/treasury/1099-da', {
            data: { walletAddress: TEST_WALLET, taxYear: new Date().getFullYear() }
        });

        if (!pdfRes.ok()) {
            const errData = await pdfRes.json().catch(() => ({}));
            throw new Error(`PDF GENERATION FAILED: ${JSON.stringify(errData)}`);
        }

        expect(pdfRes.ok()).toBeTruthy();
        const headers = pdfRes.headers();
        expect(headers['content-type']).toBe('application/pdf');
        
        const pdfBuffer = await pdfRes.body();
        expect(pdfBuffer.length).toBeGreaterThan(0);
        
        const magicNumber = pdfBuffer.slice(0, 5).toString('utf-8');
        expect(magicNumber).toBe('%PDF-');
    });

    test('Security Guardrail: Reject Unauthorized OTC Settlement', async ({ request }) => {
        const otcPayload = {
            walletAddress: TEST_WALLET,
            fiatAmount: 1000000.00,
            cryptoCurrency: 'KAS',
            cryptoAmount: 5000000.00
        };

        const settlementRes = await request.post('/api/otc/settle', {
            data: otcPayload,
            headers: {
                'Authorization': `Bearer FORGED_API_KEY`,
                'Content-Type': 'application/json'
            }
        });

        const settlementData = await settlementRes.json().catch(() => ({}));
        expect(settlementRes.status(), `EXPECTED 401, GOT ${settlementRes.status()} - ${JSON.stringify(settlementData)}`).toBe(401);
        expect(settlementData.error).toContain('Unauthorized');
    });
});