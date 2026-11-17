import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ update: [] as Record<string, unknown>[], batch: [] as Record<string, unknown>[] }));

vi.mock('googleapis', () => {
	const sheets = {
		spreadsheets: {
			values: {
				update: async (args: Record<string, unknown>) => {
					calls.update.push(args);
					return { status: 200, data: { updatedRange: args.range, updatedCells: 6 } };
				}
			},
			get: async () => ({ data: { sheets: [{ properties: { title: '5월', sheetId: 7 } }] } }),
			batchUpdate: async (args: Record<string, unknown>) => {
				calls.batch.push(args);
				return { status: 200 };
			}
		}
	};
	return { google: { sheets: () => sheets, auth: { OAuth2: class { setCredentials() {} } } } };
});

const { POST } = await import('./+server');

const call = (body: Record<string, unknown>) =>
	POST({
		params: { spreadsheetId: 'S' },
		request: new Request('http://x', { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify(body) })
	} as never);

describe('POST /api/sheets/:id/update', () => {
	beforeEach(() => {
		calls.update.length = 0;
		calls.batch.length = 0;
	});

	it('update 경로는 받은 정렬 범위와 상관없이 Y~AE로 정렬', async () => {
		await call({ range: '5월!Y30:AD30', values: [['a']], sheetName: '5월', dataRange: 'Y27:AD126' });
		const sort = (calls.batch[0].requestBody as { requests: { sortRange: { range: Record<string, number> } }[] }).requests[0].sortRange;
		expect(sort.range).toEqual({ sheetId: 7, startRowIndex: 26, endRowIndex: 126, startColumnIndex: 24, endColumnIndex: 31 });
	});

	it('고치기 범위는 받은 그대로', async () => {
		await call({ range: '5월!Y30:AD30', values: [['a', 'b']], sheetName: '5월', dataRange: 'Y27:AD126' });
		expect(calls.update[0].range).toBe('5월!Y30:AD30');
		await call({ range: '5월!Y30:AE30', values: [['', '', '', '', '', '', '']] });
		expect(calls.update[1].range).toBe('5월!Y30:AE30');
		expect(calls.batch).toHaveLength(1);                     // 정렬 표시(dataRange)가 없으면 정렬하지 않는다
	});
});
