import { describe, expect, it } from 'vitest';

const { GET } = await import('./+server');

describe('GET /api/sheets/:id/analytics', () => {
	it('분석은 계정항목과 A27:S81을 읽는다 (분류 표 27~81줄, 2026-11-17)', async () => {
		const asked: string[][] = [];
		const fetch = async (input: string) => {
			const url = new URL(input);
			if (url.pathname.endsWith(':batchGet')) {
				asked.push(url.searchParams.getAll('ranges'));
				return Response.json({ valueRanges: [{ values: [['외식']] }, { values: [['날짜']] }, { values: [] }] });
			}
			return Response.json({ sheets: [{ properties: { title: '5월' } }] });
		};
		const res = await GET({
			params: { spreadsheetId: 'S' },
			request: new Request('http://x', { headers: { authorization: 'Bearer t' } }),
			fetch
		} as never);
		expect(res.status).toBe(200);
		expect(asked).toEqual([['계정항목', "'5월'!Y26:AD126", "'5월'!A27:S81"]]);
	});
});
