import { json, type RequestHandler, type RequestEvent } from '@sveltejs/kit';
import { Buffer } from 'node:buffer';
import { dbPool } from '$lib/server/db';
import { redis } from '$lib/server/redis';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

function normalizeKaspaWallet(raw: string): { clean: string; prefixed: string } {
    const clean = String(raw || '')
        .trim()
        .toLowerCase()
        .replace(/^kaspa:/i, '')
        .trim();
    return {
        clean,
        prefixed: `kaspa:${clean}`
    };
}

export const POST: RequestHandler = async ({ request, cookies }: RequestEvent) => {
    let client;
    try {
        const sessionId = cookies.get('perennia_session');
        let sessionWallet = '';
        if (sessionId) {
            sessionWallet = (await redis.get(`session:${sessionId}`)) || '';
        }

        const body = await request.json().catch(() => ({}));
        const rawWallet = body.walletAddress || sessionWallet;
        if (!rawWallet) {
            return json({ error: 'Wallet Address Required' }, { status: 400 });
        }

        const taxYear = Number(body.taxYear || new Date().getFullYear());
        const { clean: cleanWallet, prefixed: formattedWallet } =
            normalizeKaspaWallet(rawWallet);

        // Ephemeral client-supplied recipient metadata (never stored in PostgreSQL)
        const recipientName = String(
            body.legalName || 'Self-Assessed Sovereign Taxpayer (Local Vault)'
        ).slice(0, 120);
        const recipientTin = String(body.tin || 'LOCAL-BROWSER-ONLY').slice(0, 40);
        const recipientAddress = String(
            body.address || 'Zero-PII Local Browser Jurisdiction Profile'
        ).slice(0, 140);
        const jurisdictionCode = String(
            body.jurisdictionCode || 'US-TX (0.0% State)'
        ).slice(0, 64);
        const entityType = String(body.entityType || 'LLC').slice(0, 40);
        const effectiveTaxRate = Number(body.effectiveTaxRate ?? 15.0);

        client = await dbPool.connect();
        const eventsRes = await client.query(
            `SELECT event_id, asset_ticker, event_type, gross_proceeds_usd, amount_tokens, spot_price_at_execution, recorded_at
             FROM tax_ledger_events
             WHERE (wallet_address = $1 OR wallet_address = $2)
               AND EXTRACT(YEAR FROM recorded_at) = $3
             ORDER BY recorded_at DESC
             LIMIT 250`,
            [cleanWallet, formattedWallet, taxYear]
        );

        let totalYieldProceedsUsd = 0;
        let totalDispositionProceedsUsd = 0;
        let totalCostBasisUsd = 0;
        let totalEscrowLockedUsd = 0;

        for (const r of eventsRes.rows) {
            const evType = String(r.event_type || '').toUpperCase();
            const usd = Number(r.gross_proceeds_usd || 0);
            if (evType === 'YIELD') {
                totalYieldProceedsUsd += usd;
            } else if (
                evType === 'FIAT_OFFRAMP' ||
                evType === 'DEX_SWAP' ||
                evType === 'PASSTHROUGH_SETTLED' ||
                evType === 'OTC_SETTLEMENT'
            ) {
                totalDispositionProceedsUsd += usd;
            } else if (evType === 'FIAT_ONRAMP') {
                totalCostBasisUsd += usd;
            } else if (evType === 'TAX_ESCROW_LP') {
                totalEscrowLockedUsd += usd;
            }
        }

        const totalGrossProceeds = totalYieldProceedsUsd + totalDispositionProceedsUsd;
        const netTaxableGain = Math.max(0, totalGrossProceeds - totalCostBasisUsd);
        const estTaxLiability = netTaxableGain * (effectiveTaxRate / 100.0);

        const pdfDoc = await PDFDocument.create();
        const page = pdfDoc.addPage([612, 792]);
        const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);

        const tealAccent = rgb(0.094, 0.776, 0.647);
        const slateDark = rgb(0.08, 0.1, 0.14);
        const mutedGray = rgb(0.38, 0.42, 0.48);

        page.drawRectangle({
            x: 0,
            y: 710,
            width: 612,
            height: 82,
            color: slateDark
        });

        page.drawText('SELF-ASSESSED FORM 1099-DA & FORM 8949 WORKSHEET', {
            x: 40,
            y: 752,
            size: 15,
            font: fontBold,
            color: tealAccent
        });
        page.drawText(
            `TAX YEAR ${taxYear} • ZERO-PII NON-CUSTODIAL PROTOCOL LEDGER`,
            {
                x: 40,
                y: 730,
                size: 9,
                font: fontMono,
                color: rgb(0.85, 0.88, 0.92)
            }
        );

        page.drawText('PROTOCOL TELEMETRY SOURCE', {
            x: 40,
            y: 678,
            size: 10,
            font: fontBold,
            color: slateDark
        });
        page.drawText('Perennia Sovereign Mining Pool & Settlement Engine', {
            x: 40,
            y: 662,
            size: 9,
            font: fontReg,
            color: mutedGray
        });
        page.drawText(`Wallet: ${formattedWallet.slice(0, 38)}...`, {
            x: 40,
            y: 648,
            size: 8,
            font: fontMono,
            color: mutedGray
        });

        page.drawText('TAXPAYER LOCAL PROFILE (ZERO SERVER PII)', {
            x: 320,
            y: 678,
            size: 10,
            font: fontBold,
            color: slateDark
        });
        page.drawText(`${recipientName} (${entityType})`, {
            x: 320,
            y: 662,
            size: 9,
            font: fontReg,
            color: slateDark
        });
        page.drawText(`${recipientAddress}`, {
            x: 320,
            y: 648,
            size: 8,
            font: fontReg,
            color: mutedGray
        });
        page.drawText(
            `Jurisdiction: ${jurisdictionCode} | TIN: ${recipientTin} | Rate: ${effectiveTaxRate.toFixed(2)}%`,
            {
                x: 320,
                y: 634,
                size: 8,
                font: fontMono,
                color: mutedGray
            }
        );

        page.drawText('SUMMARY OF DIGITAL ASSET PROCEEDS & ESCROW (USD)', {
            x: 40,
            y: 598,
            size: 11,
            font: fontBold,
            color: slateDark
        });

        const summaryBoxes = [
            {
                label: 'Box 1f: Gross Proceeds (Yield + Dispositions)',
                val: `$${totalGrossProceeds.toFixed(2)}`,
                x: 40,
                y: 545
            },
            {
                label: 'Box 1g: Fiat On-Ramp Cost Basis',
                val: `$${totalCostBasisUsd.toFixed(2)}`,
                x: 310,
                y: 545
            },
            {
                label: `Est. Tax Liability (${effectiveTaxRate.toFixed(2)}%)`,
                val: `$${estTaxLiability.toFixed(2)}`,
                x: 40,
                y: 485
            },
            {
                label: 'Tax Escrow Auto-LP Locked (KAS/USDC)',
                val: `$${totalEscrowLockedUsd.toFixed(2)}`,
                x: 310,
                y: 485
            }
        ];

        for (const box of summaryBoxes) {
            page.drawRectangle({
                x: box.x,
                y: box.y,
                width: 260,
                height: 46,
                borderColor: rgb(0.82, 0.85, 0.88),
                borderWidth: 1
            });
            page.drawText(box.label, {
                x: box.x + 10,
                y: box.y + 30,
                size: 8,
                font: fontBold,
                color: mutedGray
            });
            page.drawText(box.val, {
                x: box.x + 10,
                y: box.y + 10,
                size: 13,
                font: fontMono,
                color: slateDark
            });
        }

        page.drawText('SCHEDULE D / FORM 8949 LEDGER EVENTS (LATEST EXECUTIONS)', {
            x: 40,
            y: 450,
            size: 10,
            font: fontBold,
            color: slateDark
        });

        let rowY = 430;
        page.drawText('DATE / TIME', { x: 40, y: rowY, size: 8, font: fontBold, color: mutedGray });
        page.drawText('EVENT TYPE', { x: 165, y: rowY, size: 8, font: fontBold, color: mutedGray });
        page.drawText('ASSET', { x: 285, y: rowY, size: 8, font: fontBold, color: mutedGray });
        page.drawText('QUANTITY', { x: 350, y: rowY, size: 8, font: fontBold, color: mutedGray });
        page.drawText('USD VALUE', { x: 465, y: rowY, size: 8, font: fontBold, color: mutedGray });

        rowY -= 14;
        for (const ev of eventsRes.rows.slice(0, 22)) {
            if (rowY < 60) break;
            const dt = new Date(ev.recorded_at).toISOString().slice(0, 16).replace('T', ' ');
            const evType = String(ev.event_type || '');
            const ticker = String(ev.asset_ticker || 'KAS');
            const qty = Number(ev.amount_tokens || 0).toFixed(4);
            const usd = `$${Number(ev.gross_proceeds_usd || 0).toFixed(2)}`;

            page.drawText(dt, { x: 40, y: rowY, size: 7.5, font: fontMono, color: slateDark });
            page.drawText(evType, { x: 165, y: rowY, size: 7.5, font: fontMono, color: slateDark });
            page.drawText(ticker, { x: 285, y: rowY, size: 7.5, font: fontMono, color: slateDark });
            page.drawText(qty, { x: 350, y: rowY, size: 7.5, font: fontMono, color: slateDark });
            page.drawText(usd, { x: 465, y: rowY, size: 7.5, font: fontMono, color: slateDark });
            rowY -= 14;
        }

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
        console.error('1099-DA Compilation Fault:', error);
        return json(
            { error: 'COMPILATION_FAULT', message: error.message },
            { status: 500 }
        );
    } finally {
        if (client) client.release();
    }
};