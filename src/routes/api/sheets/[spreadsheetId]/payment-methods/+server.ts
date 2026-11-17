import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FULL_LIST_RANGE, monthListRange, pickPaymentMethods } from '$lib/ledger/paymentMethods';

// Simple in-memory cache for payment method options (문서·탭마다 따로)
let paymentMethodsCache: { [key: string]: { data: string[], timestamp: number } } = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

async function readRange(spreadsheetId: string, range: string, accessToken: string): Promise<Response> {
	const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`;
	return fetch(url, {
		headers: {
			'Authorization': `Bearer ${accessToken}`,
			'Content-Type': 'application/json'
		}
	});
}

export const GET: RequestHandler = async ({ params, request, url }) => {
	const { spreadsheetId } = params;
	const authHeader = request.headers.get('authorization');
	
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return json({ error: 'Authorization header required' }, { status: 401 });
	}
	
	const accessToken = authHeader.substring(7);
	const sheet = url.searchParams.get('sheet');
	const cacheKey = `${spreadsheetId}_${sheet ?? ''}_payment_methods`;
	const now = Date.now();
	
	// Check cache first
	if (paymentMethodsCache[cacheKey] && (now - paymentMethodsCache[cacheKey].timestamp) < CACHE_DURATION) {
		return json({
			accounts: paymentMethodsCache[cacheKey].data,
			cached: true
		});
	}
	
	try {
		// 그 달 탭의 '이달 쓸 카드'. 비었거나 읽지 못하면(AH열이 없는 옛 문서 등) 계정 탭 전체 목록
		let accounts: string[] = [];
		if (sheet) {
			const monthResponse = await readRange(spreadsheetId, monthListRange(sheet), accessToken);
			if (monthResponse.ok) {
				accounts = pickPaymentMethods((await monthResponse.json()).values);
			}
		}
		if (accounts.length === 0) {
			const response = await readRange(spreadsheetId, FULL_LIST_RANGE, accessToken);
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
			accounts = pickPaymentMethods((await response.json()).values);
		}
		
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
