import { beforeEach, describe, expect, it, vi } from 'vitest';

const { GET } = await import('./+server');

type Sheet = Record<string, unknown[][] | number>;   // 범위 → 값, 숫자면 그 상태 코드로 실패

function stubSheets(sheet: Sheet) {
	const reads: string[] = [];
	vi.stubGlobal('fetch', async (input: string) => {
		const range = decodeURIComponent(new URL(input).pathname.split('/values/')[1] ?? '');
		reads.push(range);
		const got = sheet[range];
		if (typeof got === 'number') return new Response('{}', { status: got });
		return Response.json({ values: got ?? [] });
	});
	return reads;
}

let n = 0;
const call = (sheet: string | null, token = 'Bearer t', id = `A${n}`) =>
	GET({
		params: { spreadsheetId: id },
		url: new URL(`http://x/api/sheets/${id}/accounts${sheet ? `?sheet=${encodeURIComponent(sheet)}` : ''}`),
		request: new Request('http://x', { headers: token ? { authorization: token } : {} })
	} as never);

describe('GET /api/sheets/:id/accounts', () => {
	beforeEach(() => {
		n += 1;
	});

	it('탭 이름이 있으면 그 달 목록(이달 쓸 계정)', async () => {
		const reads = stubSheets({ "'5월'!AI27:AI56": [['외식'], [''], ['배달']], '계정항목': [['X']] });
		const body = await (await call('5월')).json();
		expect([body.accounts, body.cached]).toEqual([['외식', '배달'], false]);
		expect(reads).toEqual(["'5월'!AI27:AI56"]);
	});

	it('비면 전체 목록(계정항목)', async () => {
		stubSheets({ "'5월'!AI27:AI56": [], '계정항목': [['외식'], ['옛분류']] });
		expect((await (await call('5월')).json()).accounts).toEqual(['외식', '옛분류']);
	});

	it('실패하면 전체 목록', async () => {
		stubSheets({ "'5월'!AI27:AI56": 400, '계정항목': [['외식']] });
		expect((await (await call('5월')).json()).accounts).toEqual(['외식']);
	});

	it('탭 이름이 없으면 전체 목록', async () => {
		const reads = stubSheets({ '계정항목': [['외식']] });
		expect((await (await call(null)).json()).accounts).toEqual(['외식']);
		expect(reads).toEqual(['계정항목']);
	});

	it('캐시는 탭마다 따로', async () => {
		const reads = stubSheets({ "'5월'!AI27:AI56": [['외식']], "'6월'!AI27:AI56": [['배달']] });
		const id = `A${n}`;
		expect((await (await call('5월', 'Bearer t', id)).json()).accounts).toEqual(['외식']);
		expect((await (await call('6월', 'Bearer t', id)).json()).accounts).toEqual(['배달']);
		expect((await (await call('5월', 'Bearer t', id)).json()).cached).toBe(true);
		expect(reads).toEqual(["'5월'!AI27:AI56", "'6월'!AI27:AI56"]);
	});

	it('토큰 없으면 401', async () => {
		stubSheets({});
		expect((await call('5월', '')).status).toBe(401);
	});
});
