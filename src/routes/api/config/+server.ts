import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	return json({
		googleApiKey: env.GOOGLE_API_KEY,
		googleClientId: env.GOOGLE_CLIENT_ID
	});
};