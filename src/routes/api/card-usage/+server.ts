import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { parseCardUsage } from '$lib/card-usage/parse';

// 문서 이름. 테스트 중에는 .env 에 CARD_USAGE_DOC_NAME="{year} 테스트 카드사용내역" 을 둔다.
const DEFAULT_DOC_NAME = '{year} 카드사용내역';
const RANGE = 'I1:J102';

const quoteName = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`; // Drive 검색어
const quoteSheet = (s: string) => `'${s.replace(/'/g, "''")}'`; // A1 표기

export const GET: RequestHandler = async ({ url, request }) => {
	const authorization = request.headers.get('authorization');
	if (!authorization?.startsWith('Bearer ')) return json({ error: '로그인이 필요합니다.' }, { status: 401 });
	const year = url.searchParams.get('year') ?? '';
	if (!/^\d{4}$/.test(year)) return json({ error: '년도가 올바르지 않습니다.' }, { status: 400 });

	const docName = (env.CARD_USAGE_DOC_NAME || DEFAULT_DOC_NAME).replaceAll('{year}', year);
	const compact = docName.replace(/^(\d{4})\s+/, '$1'); // "2026카드사용내역" 도 찾는다
	const names = [...new Set([docName, compact])].map((n) => `name = ${quoteName(n)}`).join(' or ');
	const headers = { authorization };

	try {
		const search = new URLSearchParams({
			q: `(${names}) and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
			fields: 'files(id,name)',
			orderBy: 'modifiedTime desc',
			supportsAllDrives: 'true',
			includeItemsFromAllDrives: 'true',
			corpora: 'allDrives'
		});
		const found = await fetch(`https://www.googleapis.com/drive/v3/files?${search}`, { headers });
		if (found.status === 401) return json({ error: '로그인이 만료되었습니다. 페이지를 새로 고치거나 다시 로그인해 주세요.' }, { status: 401 });
		if (!found.ok) return json({ error: 'Google Drive에서 카드사용내역 문서를 검색하지 못했습니다.' }, { status: found.status });
		const file = ((await found.json()).files ?? [])[0];
		if (!file) return json({ found: false, docName });

		const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(file.id)}`;
		const meta = await fetch(`${base}?fields=sheets.properties.title`, { headers });
		if (!meta.ok) return json({ error: '시트 목록을 불러오지 못했습니다.' }, { status: meta.status });
		const titles: string[] = ((await meta.json()).sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title);
		const sheetOf = Array.from({ length: 12 }, (_, i) => titles.find((t) => new RegExp(`^0?${i + 1}월$`).test(t.trim())) ?? null);

		const present = sheetOf.filter((t): t is string => t !== null);
		let values: unknown[][][] = [];
		if (present.length) {
			const query = new URLSearchParams();
			present.forEach((t) => query.append('ranges', `${quoteSheet(t)}!${RANGE}`));
			const res = await fetch(`${base}/values:batchGet?${query}`, { headers });
			if (!res.ok) return json({ error: '월별 카드 실적을 불러오지 못했습니다.' }, { status: res.status });
			values = ((await res.json()).valueRanges ?? []).map((r: { values?: unknown[][] }) => r.values ?? []);
		}

		let cursor = 0;
		const months = sheetOf.map((t) => (t === null ? null : parseCardUsage(values[cursor++] ?? [])));
		return json({ found: true, docName, months });
	} catch {
		return json({ error: '카드 실적을 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
	}
};
