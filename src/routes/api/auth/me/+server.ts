
import { json } from '@sveltejs/kit';

import type { RequestHandler } from './$types';

import { redis } from '$lib/server/redis';



export const GET: RequestHandler = async ({ cookies }) => {

    const sessionId = cookies.get('perennia_session');

    

    if (!sessionId) {

        return json({ authenticated: false }, { status: 401 });

    }



    try {

        const address = await redis.get(`session:${sessionId}`);

        

        if (!address) {

            return json({ authenticated: false }, { status: 401 });

        }

        

        return json({ authenticated: true, address });

    } catch (e) {

        console.error("Redis Session Verification Fault:", e);

        return json({ authenticated: false, error: "Matrix Sync Pending" }, { status: 500 });

    }

};
