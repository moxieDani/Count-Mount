import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// Simple in-memory cache for payment method options
let paymentMethodsCache: { [key: string]: { data: string[], timestamp: number } } = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const GET: RequestHandler = async ({ params, request }) => {
	const { spreadsheetId } = params;
	const authHeader = request.headers.get('authorization');
	
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return json({ error: 'Authorization header required' }, { status: 401 });
	}
	
	const accessToken = authHeader.substring(7);
	const cacheKey = `${spreadsheetId}_payment_methods`;
	const now = Date.now();
	
	// Check cache first
	if (paymentMethodsCache[cacheKey] && (now - paymentMethodsCache[cacheKey].timestamp) < CACHE_DURATION) {
		return json({
			accounts: paymentMethodsCache[cacheKey].data,
			cached: true
		});
	}
	
	try {
		// Fetch payment method options from '계정' sheet F4:F21
		const range = '계정!F4:F21';
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
				error: `Failed to fetch payment methods: ${response.statusText}`,
				details: errorText
			}, { status: response.status });
		}
		
		const data = await response.json();
		const values = data.values || [];
		
		// Extract non-empty payment method options
		const accounts = values
			.flat()
			.filter((value: any) => value && value.toString().trim() !== '')
			.map((value: any) => value.toString().trim());
		
		// Cache the results
		paymentMethodsCache[cacheKey] = {
			data: accounts,
			timestamp: now
		};
		
		return json({
			accounts,
			cached: false
		});
		
	} catch (error) {
		console.error('Error fetching payment method options:', error);
		return json({
			error: 'Internal server error while fetching payment method options',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};