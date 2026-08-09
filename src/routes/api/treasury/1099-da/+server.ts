import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import pg from 'pg';
import { env } from '$env/dynamic/private';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const { Pool } = pg;
const nodeIp = env.UBUNTU_NODE_IP || '192.168.0.12';

// BARE-METAL POSTGRES CONNECTION
const pool = new Pool({
    user: 'postgres',
    host: nodeIp,
    database: 'perennia',
    password: 'password', // Adjust to match bare-metal prod configuration
    port: 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 3000,
});

export const POST: RequestHandler = async ({ request }) => {
    let client;
    try {
        const { walletAddress, taxYear = new Date().getFullYear() } = await request.json();

        if (!walletAddress) {
            return json({ error: 'Wallet Address Required' }, { status: 400 });
        }

        client = await pool.connect();

        // 1. Verify KYC & Entity Resolution Status
        const kycRes = await client.query(
            `SELECT * FROM entity_kyc WHERE wallet_address = $1 AND verification_status = 'verified'`,
            [walletAddress]
        );

        if (kycRes.rows.length === 0) {
            return json({ 
                error: 'KYC_NOT_VERIFIED', 
                message: 'Entity has not cleared the 1099-DA KYC pipeline.' 
            }, { status: 403 });
        }

        const kycProfile = kycRes.rows[0];

        // 2. Aggregate Gross Proceeds for the target Tax Year
        const proceedsRes = await client.query(
            `SELECT 
                SUM(gross_proceeds_usd) as total_gross_proceeds,
                SUM(amount_tokens) as total_kas_yielded
             FROM tax_ledger_events 
             WHERE wallet_address = $1 
             AND event_type = 'YIELD' 
             AND EXTRACT(YEAR FROM recorded_at) = $2`,
            [walletAddress, taxYear]
        );

        const totals = proceedsRes.rows[0];
        const totalGross = parseFloat(totals.total_gross_proceeds || '0');
        const totalKas = parseFloat(totals.total_kas_yielded || '0');

        // 3. Generate Official IRS 1099-DA PDF Server-Side
        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([600, 800]);
        
        const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

        const primaryColor = rgb(0.094, 0.776, 0.647); // Teal (#18C6A5)
        const darkGray = rgb(0.2, 0.2, 0.2);

        // Header
        page.drawText('FORM 1099-DA (Digital Asset Proceeds)', { x: 50, y: 740, size: 22, font: fontBold, color: primaryColor });
        page.drawText(`Tax Year: ${taxYear}`, { x: 50, y: 710, size: 12, font: fontBold, color: darkGray });
        page.drawText(`Generated on: ${new Date().toUTCString()}`, { x: 50, y: 690, size: 10, font: fontReg, color: darkGray });

        page.drawLine({ start: { x: 50, y: 670 }, end: { x: 550, y: 670 }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });

        // Payer Info
        page.drawText('PAYER INFORMATION', { x: 50, y: 640, size: 14, font: fontBold, color: darkGray });
        page.drawText('Perennia Holdings, LLC', { x: 50, y: 620, size: 12, font: fontReg });
        page.drawText('Secure On-Chain Facility', { x: 50, y: 600, size: 12, font: fontReg });

        // Recipient Info
        page.drawText('RECIPIENT INFORMATION', { x: 300, y: 640, size: 14, font: fontBold, color: darkGray });
        page.drawText(kycProfile.legal_name, { x: 300, y: 620, size: 12, font: fontReg });
        page.drawText(kycProfile.business_address, { x: 300, y: 600, size: 12, font: fontReg });
        
        page.drawText('TIN HASH:', { x: 300, y: 575, size: 10, font: fontBold, color: darkGray });
        page.drawText(kycProfile.tax_id_hash.substring(0, 32) + '...', { x: 365, y: 575, size: 9, font: fontMono });

        page.drawLine({ start: { x: 50, y: 540 }, end: { x: 550, y: 540 }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });

        // Financials
        page.drawText('FINANCIAL PROCEEDS', { x: 50, y: 510, size: 14, font: fontBold, color: darkGray });
        
        page.drawText('Asset Class:', { x: 50, y: 480, size: 12, font: fontBold, color: darkGray });
        page.drawText('Kaspa (KAS) Native Layer 1', { x: 150, y: 480, size: 12, font: fontReg });

        page.drawText('Total Volume Yielded:', { x: 50, y: 455, size: 12, font: fontBold, color: darkGray });
        page.drawText(`${totalKas.toFixed(6)} KAS`, { x: 180, y: 455, size: 12, font: fontReg });

        page.drawText('Gross Proceeds (USD):', { x: 50, y: 420, size: 14, font: fontBold, color: darkGray });
        page.drawText(`$${totalGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { x: 215, y: 420, size: 16, font: fontBold, color: rgb(0, 0, 0) });

        page.drawText('Cost Basis:', { x: 50, y: 390, size: 12, font: fontBold, color: darkGray });
        page.drawText('Voluntary Tracking Pending', { x: 150, y: 390, size: 12, font: fontReg, color: rgb(0.5, 0.5, 0.5) });

        // Serialize to Buffer for SvelteKit/Node Response compatibility
        const pdfBytes = await pdfDoc.save();
        const pdfBuffer = Buffer.from(pdfBytes);

        return new Response(pdfBuffer, {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="Perennia_1099_DA_${taxYear}.pdf"`
            }
        });

    } catch (error: any) {
        console.error("1099-DA Compilation Fault:", error);
        return json({ error: 'COMPILATION_FAULT', message: error.message }, { status: 500 });
    } finally {
        if (client) client.release();
    }
};