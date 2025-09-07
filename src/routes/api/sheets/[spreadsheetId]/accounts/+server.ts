import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Simple in-memory cache for account options
let accountsCache: { [key: string]: { data: string[], timestamp: number } } = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const GET: RequestHandler = async ({ params, request }) => {
	const { spreadsheetId } = params;
	const authHeader = request.headers.get('authorization');
	
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return json({ error: 'Authorization header required' }, { status: 401 });
	}
	
	const accessToken = authHeader.substring(7);
	const cacheKey = `${spreadsheetId}_accounts`;
	const now = Date.now();
	
	// Check cache first
	if (accountsCache[cacheKey] && (now - accountsCache[cacheKey].timestamp) < CACHE_DURATION) {
		return json({
			accounts: accountsCache[cacheKey].data,
			cached: true
		});
	}
	
	try {
		// Fetch account options from '계정' sheet D41:D59
		const range = '계정!D41:D59';
		const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
		
		const response = await fetch(url, {
			headers: {
				'Authorization': `Bearer ${accessToken}`,
				'Content-Type': 'application/json'
			}
		});
		
		if (!response.ok) {
			const errorText = await response.text();
			console.error('Google Sheets API error:', {
				status: response.status,
				statusText: response.statusText,
				error: errorText
			});
			
			return json({
				error: `Failed to fetch accounts: ${response.statusText}`,
				details: errorText
			}, { status: response.status });
		}
		
		const data = await response.json();
		const values = data.values || [];
		
		// Extract non-empty account options
		const accounts = values
			.flat()
			.filter((value: any) => value && value.toString().trim() !== '')
			.map((value: any) => value.toString().trim());
		
		// Cache the results
		accountsCache[cacheKey] = {
			data: accounts,
			timestamp: now
		};
		
		return json({
			accounts,
			cached: false,
			range: range
		});
		
	} catch (error) {
		console.error('Error fetching account options:', error);
		return json({
			error: 'Internal server error while fetching account options',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};