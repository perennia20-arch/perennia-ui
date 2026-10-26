import { POST as onrampPost, GET as onrampGet } from '../onramp/+server';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = onrampGet;
export const POST: RequestHandler = onrampPost;