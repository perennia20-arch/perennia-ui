// PERENNIA HOLDINGS LLC - SPA ENTRY CONFIGURATION
// This completely disables Server-Side Rendering (SSR) and forces the application
// to run entirely client-side, making it a pure static asset for Nginx to serve.

export const prerender = true;
export const ssr = false;
export const trailingSlash = 'always';
