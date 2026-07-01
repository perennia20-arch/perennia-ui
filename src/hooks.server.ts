import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
    // Check the incoming request for the Authorization header
    const auth = event.request.headers.get('Authorization');

    // Define your username and password here
    const USERNAME = 'admin';
    const PASSWORD = 'sanctuary'; 
    
    // Encode the credentials
    const expectedAuth = `Basic ${btoa(`${USERNAME}:${PASSWORD}`)}`;

    // If no auth or wrong password, reject the request and prompt for login
    if (auth !== expectedAuth) {
        return new Response('Unauthorized Access', {
            status: 401,
            headers: {
                'WWW-Authenticate': 'Basic realm="Sanctuary Command Center", charset="UTF-8"'
            }
        });
    }

    // If the password matches, allow the site to load
    return resolve(event);
};