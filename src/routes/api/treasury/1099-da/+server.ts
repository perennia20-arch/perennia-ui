import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Buffer } from 'node:buffer';
import { dbPool } from '$lib/server/db';
import { env } from '$env/dynamic/private';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export const POST: RequestHandler = async ({ request }) => {
    let client;
    try {
        const { walletAddress, taxYear = new Date().getFullYear() } = await request.json();

        if (!walletAddress) {
            return json({ error: 'Wallet Address Required' }, { status: 400 });
        }

        // ⚡ THE FIX: Ensure the PDF compiler pulls from the exact same formatted wallet standard
        const formattedWallet = walletAddress.toLowerCase().startsWith('kaspa:') ? walletAddress.toLowerCase() : `kaspa:${walletAddress.toLowerCase()}`;

        client = await dbPool.connect();

        const kycRes = await client.query(
            `SELECT * FROM entity_kyc WHERE wallet_address = $1 AND verification_status = 'verified'`,
            [formattedWallet]
        );

        if (kycRes.rows.length === 0) {
            return json({ 
                error: 'KYC_NOT_VERIFIED', 
                message: 'Entity has not cleared the 1099-DA KYC pipeline.' 
            }, { status: 403 });
        }

        const kycProfile = kycRes.rows[0];

        const proceedsRes = await client.query(
            `SELECT 
                COALESCE(SUM(CASE WHEN event_type = 'YIELD' THEN gross_proceeds_usd ELSE 0 END), 0) as total_gross_proceeds,
                COALESCE(SUM(CASE WHEN event_type = 'YIELD' THEN amount_tokens ELSE 0 END), 0) as total_kas_yielded,
                COALESCE(SUM(CASE WHEN event_type = 'FIAT_ONRAMP' THEN gross_proceeds_usd ELSE 0 END), 0) as total_cost_basis
             FROM tax_ledger_events 
             WHERE wallet_address = $1 
             AND EXTRACT(YEAR FROM recorded_at) = $2`,
            [formattedWallet, taxYear]
        );

        const totals = proceedsRes.rows[0];
        const totalGross = parseFloat(totals.total_gross_proceeds || '0');
        const totalCostBasis = parseFloat(totals.total_cost_basis || '0');

        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([600, 800]);
        
        const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

        const primaryColor = rgb(0.094, 0.776, 0.647);
        const darkGray = rgb(0.2, 0.2, 0.2);

        page.drawText('FORM 1099-DA (Digital Asset Proceeds)', { x: 50, y: 740, size: 22, font: fontBold, color: primaryColor });
        page.drawText(`Tax Year: ${taxYear}`, { x: 50, y: 710, size: 12, font: fontBold, color: darkGray });
        
        page.drawText('PAYER INFORMATION', { x: 50, y: 640, size: 14, font: fontBold, color: darkGray });
        page.drawText('Perennia Holdings, LLC', { x: 50, y: 620, size: 12, font: fontReg });

        page.drawText('RECIPIENT INFORMATION', { x: 300, y: 640, size: 14, font: fontBold, color: darkGray });
        page.drawText(kycProfile.legal_name, { x: 300, y: 620, size: 12, font: fontReg });
        page.drawText(kycProfile.business_address, { x: 300, y: 600, size: 12, font: fontReg });
        
        page.drawText('TIN HASH (AES-256-GCM Secured):', { x: 300, y: 575, size: 10, font: fontBold, color: darkGray });
        page.drawText(kycProfile.tax_id_hash.substring(0, 32) + '...', { x: 300, y: 560, size: 9, font: fontMono });

        page.drawText('FINANCIAL PROCEEDS (IRS FORM 1099-DA)', { x: 50, y: 510, size: 14, font: fontBold, color: darkGray });
        page.drawText('Box 1d: Proceeds (USD)', { x: 50, y: 430, size: 12, font: fontBold, color: darkGray });
        page.drawText(`$${totalGross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { x: 50, y: 410, size: 16, font: fontBold, color: rgb(0, 0, 0) });

        page.drawText('Box 1e: Cost Basis', { x: 250, y: 430, size: 12, font: fontBold, color: darkGray });
        page.drawText(`$${totalCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, { x: 250, y: 410, size: 16, font: fontBold, color: rgb(0, 0, 0) });

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