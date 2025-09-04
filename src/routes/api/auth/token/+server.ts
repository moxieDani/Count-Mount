import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const session = await locals.auth();
	
	if (!session?.accessToken) {
		return json({ error: 'No access token available' }, { status: 401 });
	}
	
	return json({
		accessToken: session.accessToken
	});
};