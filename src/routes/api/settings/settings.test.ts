import { beforeEach, describe, expect, it, vi } from 'vitest';

const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));

const years = await import('./+server');
const one = await import('./[spreadsheetId]/+server');

type Call = { url: URL; method: string; body: any };

/** 가짜 Google: Drive 찾기, values:batchGet, values:batchUpdate, values:append, userinfo */
function stubGoogle(opts: { files?: Record<string, { id: string; name: string }[]>; read?: unknown[][][]; writeStatus?: number } = {}) {
	const calls: Call[] = [];
	vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
		const url = new URL(input);
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		calls.push({ url, method: init?.method ?? 'GET', body });
		if (url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/drive/')) {
			const q = url.searchParams.get('q') ?? '';
			const name = /name = '([^']*)'/.exec(q)?.[1] ?? '';
			return Response.json({ files: opts.files?.[name] ?? [] });
		}
		if (url.pathname.includes('userinfo')) return Response.json({ name: '권기순', email: 'x@example.com' });
		if (url.pathname.endsWith('/values:batchGet')) {
			return Response.json({ valueRanges: (opts.read ?? []).map(values => ({ values })) });
		}
		if (url.pathname.endsWith('/values:batchUpdate')) {
			return opts.writeStatus ? new Response('{}', { status: opts.writeStatus }) : Response.json({});
		}
		if (url.pathname.includes(':append')) return Response.json({});
		return new Response('{}', { status: 404 });
	});
	return calls;
}

const req = (url: string, token = 'Bearer t', body?: unknown) => ({
	url: new URL(url),
	params: { spreadsheetId: 'S' },
	request: new Request(url, { method: body ? 'POST' : 'GET', headers: token ? { authorization: token } : {}, body: body ? JSON.stringify(body) : undefined })
}) as never;

const WRITE = { range: "'2026년 예산'!F49", before: [[400000]], after: [[450000]], label: '예산 · 외식' };
const ALERT = { range: "'자동 기록 설정'!A4:E4", before: [['', '', '', '', '']], after: [['기순_삼성', '삼성', '0123', '', '']], label: '카드 알림 연결 · 기순_삼성' };

describe('설정 경로', () => {
	beforeEach(() => {
		delete env.HOUSEHOLD_DOC_NAME;
	});

	it('해 목록은 정확한 이름만', async () => {
		env.HOUSEHOLD_DOC_NAME = '[작업본] {yy}년 가계부';
		const thisYear = new Date().getFullYear();
		stubGoogle({ files: {
			[`[작업본] ${String(thisYear).slice(-2)}년 가계부`]: [{ id: 'W', name: `[작업본] ${String(thisYear).slice(-2)}년 가계부` }],
			[`[작업본] ${String(thisYear - 1).slice(-2)}년 가계부`]: [{ id: 'X', name: `${thisYear - 1} 테스트 가계부` }]
		} });
		const body = await (await years.GET(req('http://x/api/settings'))).json();
		expect(body.years).toEqual([{ year: thisYear, spreadsheetId: 'W' }]);
	});

	it('읽기는 한 번의 요청', async () => {
		const calls = stubGoogle({ read: [[], [['기순_롯데']], [], [], [], [], []] });
		const res = await one.GET(req('http://x/api/settings/S?year=2026'));
		const body = await res.json();
		const reads = calls.filter(c => c.url.pathname.endsWith('/values:batchGet'));
		expect(reads).toHaveLength(1);
		expect(reads[0].url.searchParams.getAll('ranges')).toHaveLength(7);
		expect(reads[0].url.searchParams.get('valueRenderOption')).toBe('UNFORMATTED_VALUE');
		expect(body.cards[0].name).toBe('기순_롯데');
	});

	it('저장 전 값이 다르면 409, 쓰지 않음', async () => {
		const calls = stubGoogle({ read: [[[410000]]] });
		const res = await one.POST(req('http://x/api/settings/S', 'Bearer t', { year: 2026, writes: [WRITE] }));
		expect(res.status).toBe(409);
		expect(await res.json()).toEqual({ conflict: true });
		expect(calls.some(c => c.url.pathname.endsWith('/values:batchUpdate'))).toBe(false);
	});

	it('저장은 RAW로 쓰고 설정 기록을 덧붙임', async () => {
		const calls = stubGoogle({ read: [[['400000']], []] });   // 글자로 견준다(숫자·글 차이는 같은 값), 빈 줄은 빈칸
		const res = await one.POST(req('http://x/api/settings/S', 'Bearer t', { year: 2026, writes: [WRITE, ALERT] }));
		expect(await res.json()).toEqual({ ok: true });
		const write = calls.find(c => c.url.pathname.endsWith('/values:batchUpdate'))!;
		expect(write.body).toEqual({ valueInputOption: 'RAW', data: [
			{ range: WRITE.range, values: WRITE.after }, { range: ALERT.range, values: [['기순_삼성', '삼성', '0123', '', '']] }] });
		const log = calls.find(c => c.url.pathname.includes(':append'))!;
		expect(decodeURIComponent(log.url.pathname)).toContain("'설정 기록'!A:E");
		expect(log.url.searchParams.get('valueInputOption')).toBe('RAW');
		expect(log.body.values).toHaveLength(2);
		expect(log.body.values[0]).toEqual([expect.stringMatching(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/), '권기순', '예산 · 외식', '400000', '450000']);
		expect(log.body.values[1].slice(2)).toEqual(['카드 알림 연결 · 기순_삼성', '(빈칸)', '기순_삼성 · 삼성 · 0123']);
	});

	it('쓰기 실패면 기록 없음', async () => {
		const calls = stubGoogle({ read: [[[400000]]], writeStatus: 500 });
		const res = await one.POST(req('http://x/api/settings/S', 'Bearer t', { year: 2026, writes: [WRITE] }));
		expect(res.status).toBe(502);
		expect(calls.some(c => c.url.pathname.includes(':append'))).toBe(false);
	});

	it('설정 탭 밖 칸은 쓰지 않는다', async () => {
		stubGoogle({ read: [[['']]] });
		const res = await one.POST(req('http://x/api/settings/S', 'Bearer t', { year: 2026,
			writes: [{ range: "'5월'!Y27:AD27", before: [['']], after: [['x']], label: 'x' }] }));
		expect(res.status).toBe(400);
	});

	it('토큰 없으면 401', async () => {
		stubGoogle();
		expect((await years.GET(req('http://x/api/settings', ''))).status).toBe(401);
		expect((await one.GET(req('http://x/api/settings/S?year=2026', ''))).status).toBe(401);
		expect((await one.POST(req('http://x/api/settings/S', '', { year: 2026, writes: [WRITE] }))).status).toBe(401);
	});
});
