import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
    // This allows the frontend to verify the HTTP-only cookie is still alive upon refresh
    const session = cookies.get('perennia_session');
    
    if (!session) {
        return json({ authenticated: false }, { status: 401 });
    }
    
    return json({ authenticated: true, address: session });
};