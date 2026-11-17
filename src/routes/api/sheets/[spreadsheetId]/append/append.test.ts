import { describe, expect, it, vi } from 'vitest';

const { POST } = await import('./+server');

function stubSheets(dataRows: unknown[][]) {
	const writes: { range: string; values: unknown[][] }[] = [];
	const sorts: unknown[] = [];
	vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
		const url = new URL(input);
		if (url.pathname.endsWith(':batchUpdate')) {
			sorts.push(JSON.parse(String(init?.body)));
			return Response.json({});
		}
		if (url.pathname.includes('/values/')) {
			const range = decodeURIComponent(url.pathname.split('/values/')[1]);
			if (init?.method === 'PUT') {
				writes.push({ range, values: JSON.parse(String(init.body)).values });
				return Response.json({});
			}
			return Response.json({ values: range.endsWith('Y27:AD126') ? dataRows : [['x']] });
		}
		return Response.json({ sheets: [{ properties: { title: '5월', sheetId: 7 } }] });
	});
	return { writes, sorts };
}

const call = (values: string[]) =>
	POST({
		params: { spreadsheetId: 'S' },
		request: new Request('http://x', {
			method: 'POST',
			headers: { authorization: 'Bearer t' },
			body: JSON.stringify({ sheetName: '5월', values })
		})
	} as never);

describe('POST /api/sheets/:id/append', () => {
	it('새 줄은 Y~AE 일곱 칸, 일곱째는 가계쀼, 정렬은 Y~AE', async () => {
		const { writes, sorts } = stubSheets([['2026. 5. 1', '가게'], ['', '', '', '', '', '', 'Jarvis']]);
		const res = await call(['2026. 5. 2', '새가게', '5000', '카드', '식비', '']);
		expect(res.status).toBe(200);
		expect(writes).toEqual([{ range: '5월!Y28:AE28', values: [['2026. 5. 2', '새가게', '5000', '카드', '식비', '', '가계쀼']] }]);
		const range = (sorts[0] as { requests: { sortRange: { range: Record<string, number> } }[] }).requests[0].sortRange.range;
		expect(range.endColumnIndex).toBe(31);
		expect(range.sheetId).toBe(7);
	});
});
