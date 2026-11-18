import { beforeEach, describe, expect, it, vi } from 'vitest';

const mod = await import('./+server');
const { GET } = mod;

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
const call = (sheet: string | null, token = 'Bearer t', id = `S${n}`) =>
	GET({
		params: { spreadsheetId: id },
		url: new URL(`http://x/api/sheets/${id}/payment-methods${sheet ? `?sheet=${encodeURIComponent(sheet)}` : ''}`),
		request: new Request('http://x', { headers: token ? { authorization: token } : {} })
	} as never);

describe('GET /api/sheets/:id/payment-methods', () => {
	beforeEach(() => {
		n += 1;   // 문서 번호를 바꿔 앞 시험의 캐시를 쓰지 않는다
	});

	it('탭 이름이 있으면 그 달 목록(이달 쓸 카드)', async () => {
		const reads = stubSheets({ "'5월'!AI27:AI56": [['A'], [''], ['------'], ['B']], '계정!F4:F33': [['X']] });
		expect(await (await call('5월')).json()).toEqual({ accounts: ['A', 'B'], cached: false });
		expect(reads).toEqual(["'5월'!AI27:AI56"]);
	});

	it('달 목록이 비면 전체 목록', async () => {
		stubSheets({ "'5월'!AI27:AI56": [], '계정!F4:F33': [['X'], ['------'], ['Y']] });
		expect((await (await call('5월')).json()).accounts).toEqual(['X', 'Y']);
	});

	it('달 목록 읽기가 실패하면 전체 목록', async () => {
		stubSheets({ "'5월'!AI27:AI56": 400, '계정!F4:F33': [['X']] });
		expect((await (await call('5월')).json()).accounts).toEqual(['X']);
	});

	it('탭 이름이 없으면 전체 목록', async () => {
		const reads = stubSheets({ '계정!F4:F33': [['X']] });
		expect((await (await call(null)).json()).accounts).toEqual(['X']);
		expect(reads).toEqual(['계정!F4:F33']);
	});

	it('캐시는 탭마다 따로', async () => {
		const reads = stubSheets({ "'5월'!AI27:AI56": [['A']], "'6월'!AI27:AI56": [['B']] });
		const id = `S${n}`;
		expect((await (await call('5월', 'Bearer t', id)).json()).accounts).toEqual(['A']);
		expect((await (await call('6월', 'Bearer t', id)).json()).accounts).toEqual(['B']);
		expect(await (await call('5월', 'Bearer t', id)).json()).toEqual({ accounts: ['A'], cached: true });
		expect(reads).toEqual(["'5월'!AI27:AI56", "'6월'!AI27:AI56"]);
	});

	it('토큰 없으면 401', async () => {
		stubSheets({});
		expect((await call('5월', '')).status).toBe(401);
	});
});
