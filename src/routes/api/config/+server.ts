import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json({
		googleApiKey: env.VITE_GOOGLE_API_KEY,
		googleClientId: env.VITE_GOOGLE_CLIENT_ID
	});
};