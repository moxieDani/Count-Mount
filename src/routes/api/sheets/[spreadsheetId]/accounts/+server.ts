import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { FULL_ACCOUNT_RANGE, monthAccountRange } from '$lib/ledger/paymentMethods';
import { readMonthOrFull } from '$lib/server/monthList';

// Simple in-memory cache for account options (문서·탭마다 따로)
let accountsCache: { [key: string]: { data: string[], timestamp: number } } = {};
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export const GET: RequestHandler = async ({ params, request, url }) => {
	const { spreadsheetId } = params;
	const authHeader = request.headers.get('authorization');
	
	if (!authHeader || !authHeader.startsWith('Bearer ')) {
		return json({ error: 'Authorization header required' }, { status: 401 });
	}
	
	const accessToken = authHeader.substring(7);
	const sheet = url.searchParams.get('sheet');
	const cacheKey = `${spreadsheetId}_${sheet ?? ''}_accounts`;
	const now = Date.now();
	
	// Check cache first
	if (accountsCache[cacheKey] && (now - accountsCache[cacheKey].timestamp) < CACHE_DURATION) {
		return json({
			accounts: accountsCache[cacheKey].data,
			cached: true
		});
	}
	
	try {
		// 그 달 탭의 '이달 쓸 계정'. 비었거나 읽지 못하면 이름 붙인 범위 '계정항목' 전체 (2026-11-17)
		const monthRange = sheet ? monthAccountRange(sheet) : null;
		const got = await readMonthOrFull(spreadsheetId, accessToken, monthRange, FULL_ACCOUNT_RANGE);
		if (!got.ok) {
			const errorText = await got.response.text();
			console.error('Google Sheets API error:', {
				status: got.response.status,
				statusText: got.response.statusText,
				error: errorText
			});
			return json({
				error: `Failed to fetch accounts: ${got.response.statusText}`,
				details: errorText
			}, { status: got.response.status });
		}
		
		// Cache the results
		accountsCache[cacheKey] = {
			data: got.values,
			timestamp: now
		};
		
		return json({
			accounts: got.values,
			cached: false,
			range: got.range
		});
		
	} catch (error) {
		console.error('Error fetching account options:', error);
		return json({
			error: 'Internal server error while fetching account options',
			details: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};
