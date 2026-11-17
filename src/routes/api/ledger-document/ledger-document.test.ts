import { beforeEach, describe, expect, it, vi } from 'vitest';

const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));

const { GET } = await import('./+server');

function stubDrive(files: { id: string; name: string }[], status = 200) {
	const queries: string[] = [];
	vi.stubGlobal('fetch', async (input: string) => {
		queries.push(new URL(input).searchParams.get('q') ?? '');
		if (status !== 200) return new Response('{}', { status });
		return Response.json({ files });
	});
	return queries;
}

const call = (year = '2026', token = 'Bearer t') =>
	GET({
		url: new URL(`http://x/api/ledger-document?year=${year}`),
		request: new Request('http://x', { headers: token ? { authorization: token } : {} })
	} as never);

describe('GET /api/ledger-document', () => {
	beforeEach(() => {
		delete env.HOUSEHOLD_DOC_NAME;
	});

	it('기본은 이름이 정확히 "2026 가계부"인 문서만 찾는다(휴지통 빼고)', async () => {
		const queries = stubDrive([{ id: 'H', name: '2026 가계부' }]);
		const res = await call();
		expect(await res.json()).toEqual({ spreadsheetId: 'H', name: '2026 가계부' });
		expect(queries[0]).toContain("name = '2026 가계부'");
		expect(queries[0]).toContain('trashed = false');
		expect(queries[0]).not.toContain('contains');
	});

	it('HOUSEHOLD_DOC_NAME으로 작업본을 가리킬 수 있다', async () => {
		env.HOUSEHOLD_DOC_NAME = '[작업본] {yy}년 가계부';
		const queries = stubDrive([{ id: 'W', name: '[작업본] 26년 가계부' }]);
		expect(await (await call()).json()).toEqual({ spreadsheetId: 'W', name: '[작업본] 26년 가계부' });
		expect(queries[0]).toContain("name = '[작업본] 26년 가계부'");
	});

	it('정확한 이름이 아니면 고르지 않는다', async () => {
		stubDrive([{ id: 'X', name: '2026 테스트 가계부' }]);
		expect((await call()).status).toBe(404);
	});

	it('찾지 못하면 404', async () => {
		stubDrive([]);
		expect((await call()).status).toBe(404);
	});

	it('로그인 토큰이 없으면 401, 만료면 401', async () => {
		stubDrive([]);
		expect((await call('2026', '')).status).toBe(401);
		stubDrive([], 401);
		expect((await call()).status).toBe(401);
	});

	it('해가 네 자리 숫자가 아니면 400', async () => {
		stubDrive([]);
		expect((await call('26')).status).toBe(400);
	});
});
