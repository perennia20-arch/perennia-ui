import { json, type RequestEvent } from '@sveltejs/kit';
import Stripe from 'stripe';
import { env } from '$env/dynamic/private';

export const POST = async ({ request }: RequestEvent) => {
    try {
        if (!env.STRIPE_SECRET_KEY) {
            return json({ error: 'STRIPE_SECRET_KEY is missing in .env file.' }, { status: 500 });
        }

        // Initialize Stripe safely inside the function execution
        const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
            apiVersion: '2023-10-16' as any,
        });

        const { walletAddress } = await request.json();

        if (!walletAddress) {
            return json({ error: 'Missing destination wallet address' }, { status: 400 });
        }

        const cleanWallet = walletAddress.replace('kaspa:', '').trim().toLowerCase();

        // ⚡ Bypass TypeScript strict typing for the Crypto Onramp beta endpoints
        const onrampSession = await (stripe as any).crypto.onrampSessions.create({
            transaction_details: {
                destination_currency: 'kas',
                destination_network: 'kaspa',
                supported_destination_networks: ['kaspa', 'ethereum', 'bitcoin', 'solana'],
                wallet_addresses: {
                    kaspa: cleanWallet,
                },
            },
            customer_information: {
                // Pre-filling data if the user has already passed our internal 1099-DA KYC pipeline
                // can be mapped here in the future.
            }
        });

        // The client secret is passed safely to the Svelte frontend to render the DOM elements
        return json({ clientSecret: onrampSession.client_secret });

    } catch (error: any) {
        console.error("Stripe Session Fault:", error);
        return json({ error: error.message || 'Failed to initialize fiat bridge' }, { status: 500 });
    }
};