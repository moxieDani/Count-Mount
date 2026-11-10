import { beforeEach, describe, expect, it, vi } from 'vitest';

const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));

const { GET } = await import('./+server');

type Fake = { files?: { id: string; name: string }[]; titles?: string[]; ranges?: Record<string, unknown[][]> };

function stubGoogle({ files = [], titles = [], ranges = {} }: Fake) {
	const calls: string[] = [];
	vi.stubGlobal('fetch', async (input: string) => {
		const url = decodeURIComponent(input);
		calls.push(new URL(input).searchParams.get('q') ?? url);
		if (url.includes('/drive/v3/files')) return Response.json({ files });
		if (url.includes('values:batchGet')) {
			const asked = new URL(input).searchParams.getAll('ranges');
			return Response.json({ valueRanges: asked.map((r) => ({ range: r, values: ranges[r] ?? [] })) });
		}
		return Response.json({ sheets: titles.map((title) => ({ properties: { title } })) });
	});
	return calls;
}

const call = (year = '2026', token = 'Bearer t') =>
	GET({
		url: new URL(`http://x/api/card-usage?year=${year}`),
		request: new Request('http://x', { headers: token ? { authorization: token } : {} })
	} as never);

describe('GET /api/card-usage', () => {
	beforeEach(() => {
		delete env.CARD_USAGE_DOC_NAME;
	});

	it('로그인 토큰이 없으면 401', async () => {
		stubGoogle({});
		expect((await call('2026', '')).status).toBe(401);
	});

	it('문서가 없으면 found:false 와 찾은 이름', async () => {
		stubGoogle({});
		const res = await call();
		expect(await res.json()).toEqual({ found: false, docName: '2026 카드사용내역' });
	});

	it('기본은 "{년} 카드사용내역", 환경변수로 테스트 문서 이름을 쓴다', async () => {
		let calls = stubGoogle({});
		await call();
		expect(calls[0]).toContain("name = '2026 카드사용내역'");
		expect(calls[0]).toContain('trashed = false');

		env.CARD_USAGE_DOC_NAME = '{year} 테스트 카드사용내역';
		calls = stubGoogle({});
		const res = await call('2027');
		expect(calls[0]).toContain("name = '2027 테스트 카드사용내역'");
		expect((await res.json()).docName).toBe('2027 테스트 카드사용내역');
	});

	it('있으면 N월 시트의 I1:J102 를 카드별로 묶어 12달로 돌려준다 (없는 달은 null)', async () => {
		const calls = stubGoogle({
			files: [{ id: 'doc1', name: '2026 카드사용내역' }],
			titles: ['요약', '10월', '11월'],
			ranges: {
				"'10월'!I1:J102": [['테스트카드A'], ['채울 실적금액', '0']],
				"'11월'!I1:J102": [['테스트카드A'], ['채울 실적금액', '120,000']]
			}
		});
		const body = await (await call()).json();
		expect(body.found).toBe(true);
		expect(body.months).toHaveLength(12);
		expect(body.months[0]).toBeNull();
		expect(body.months[9][0]).toMatchObject({ name: '테스트카드A', badges: [{ kind: 'done', text: '실적 달성' }] });
		expect(body.months[10][0]).toMatchObject({ name: '테스트카드A', badges: [{ kind: 'spend', text: '실적까지 120,000원' }] });
		expect(calls.some((u) => u.includes('/spreadsheets/doc1/values:batchGet'))).toBe(true);
	});

	it('N월 시트가 하나도 없으면 batchGet 없이 12달 모두 null', async () => {
		const calls = stubGoogle({ files: [{ id: 'doc1', name: '2026 카드사용내역' }], titles: ['요약'] });
		const body = await (await call()).json();
		expect(body.months).toEqual(Array(12).fill(null));
		expect(calls.some((u) => u.includes('batchGet'))).toBe(false);
	});

	it('Google 이 토큰을 거절하면 "문서 없음"이 아니라 로그인 만료로 401', async () => {
		vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
		const res = await call();
		expect(res.status).toBe(401);
		expect((await res.json()).error).toContain('로그인');
	});

	it('년도가 이상하면 400', async () => {
		stubGoogle({});
		expect((await call('20x6')).status).toBe(400);
	});
});
