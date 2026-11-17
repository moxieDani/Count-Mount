import { beforeEach, describe, expect, it, vi } from 'vitest';

const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));

const { POST } = await import('./+server');

type Step = { kind: string; url: URL; body: any };

function stubGoogle(opts: { files: Record<string, { id: string; name: string; parents?: string[] }[]>; fail?: string }) {
	const steps: Step[] = [];
	vi.stubGlobal('fetch', async (input: string, init?: RequestInit) => {
		const url = new URL(input);
		const body = init?.body ? JSON.parse(String(init.body)) : undefined;
		const method = init?.method ?? 'GET';
		const kind =
			url.pathname.endsWith('/copy') ? 'copy'
			: url.hostname === 'www.googleapis.com' && url.pathname.startsWith('/drive/') ? (method === 'DELETE' ? 'delete' : 'find')
			: url.pathname.includes('userinfo') ? 'who'
			: url.pathname.endsWith(':batchUpdate') && !url.pathname.includes('/values') ? 'rename'
			: url.pathname.endsWith('/values:batchGet') ? 'read'
			: url.pathname.endsWith('/values:batchUpdate') ? 'write'
			: url.pathname.includes(':append') ? 'log'
			: url.pathname.includes('/values/') ? 'year'
			: 'meta';
		steps.push({ kind, url, body });
		if (opts.fail === kind) return new Response('{}', { status: 500 });
		switch (kind) {
			case 'find': {
				const name = /name = '([^']*)'/.exec(url.searchParams.get('q') ?? '')?.[1] ?? '';
				return Response.json({ files: opts.files[name] ?? [] });
			}
			case 'copy': return Response.json({ id: 'NEW', name: body.name });
			case 'meta': return Response.json({ sheets: [
				{ properties: { title: '계정', sheetId: 1 } }, { properties: { title: 'YYYY년 예산', sheetId: 2 } },
				{ properties: { title: 'YYYY년 연간 지출', sheetId: 3 } }] });
			case 'read': return Response.json({ valueRanges: [] });
			case 'who': return Response.json({ name: '권기순' });
			default: return Response.json({});
		}
	});
	return steps;
}

const call = (year: unknown) => POST({
	request: new Request('http://x/api/settings/new-year', { method: 'POST', headers: { authorization: 'Bearer t' }, body: JSON.stringify({ year }) })
} as never);

const READY = {
	'YYYY 가계부': [{ id: 'TPL', name: 'YYYY 가계부', parents: ['TPLDIR'] }],
	'2026 가계부': [{ id: 'LAST', name: '2026 가계부', parents: ['DIR'] }]
};

describe('POST /api/settings/new-year', () => {
	beforeEach(() => {
		delete env.HOUSEHOLD_DOC_NAME;
		delete env.HOUSEHOLD_TEMPLATE_NAME;
	});

	it('이미 있으면 409', async () => {
		stubGoogle({ files: { ...READY, '2027 가계부': [{ id: 'X', name: '2027 가계부' }] } });
		expect((await call(2027)).status).toBe(409);
	});

	it('빈 틀이 없으면 404', async () => {
		const steps = stubGoogle({ files: { '2026 가계부': READY['2026 가계부'] } });
		const res = await call(2027);
		expect(res.status).toBe(404);
		expect((await res.json()).error).toContain('YYYY 가계부');
		expect(steps.some(s => s.kind === 'copy')).toBe(false);
	});

	it('복사·탭 이름·연도·설정 쓰기 순서', async () => {
		const steps = stubGoogle({ files: READY });
		const res = await call(2027);
		expect(await res.json()).toEqual({ ok: true, spreadsheetId: 'NEW', url: 'https://docs.google.com/spreadsheets/d/NEW' });
		const order = steps.map(s => s.kind).filter(k => !['find', 'who'].includes(k));
		expect(order).toEqual(['copy', 'meta', 'rename', 'year', 'read', 'write', 'log']);
		const copy = steps.find(s => s.kind === 'copy')!;
		expect(copy.url.pathname).toContain('/files/TPL/copy');
		expect(copy.body).toEqual({ name: '2027 가계부', parents: ['DIR'] });   // 지난해 문서와 같은 폴더
		const rename = steps.find(s => s.kind === 'rename')!.body.requests.map((r: any) => r.updateSheetProperties.properties);
		expect(rename).toEqual([{ sheetId: 2, title: '2027년 예산' }, { sheetId: 3, title: '2027년 연간 지출' }]);
		const year = steps.find(s => s.kind === 'year')!;
		expect(decodeURIComponent(year.url.pathname)).toContain('계정!C1');
		expect(year.body.values).toEqual([[2027]]);
		expect(steps.find(s => s.kind === 'read')!.url.pathname).toContain('/LAST/');
		const write = steps.find(s => s.kind === 'write')!;
		expect(write.url.pathname).toContain('/NEW/');
		expect(write.body.valueInputOption).toBe('RAW');
		expect(steps.find(s => s.kind === 'log')!.body.values[0][2]).toBe('지난해 설정을 가져옴');
	});

	it('중간 실패는 단계와 문서 링크를 알림', async () => {
		const steps = stubGoogle({ files: READY, fail: 'write' });
		const res = await call(2027);
		expect(res.status).toBe(502);
		expect(await res.json()).toEqual({ ok: false, step: 'write', spreadsheetId: 'NEW', url: 'https://docs.google.com/spreadsheets/d/NEW' });
		expect(steps.some(s => s.kind === 'delete')).toBe(false);   // 만든 문서는 지우지 않는다
	});
});
