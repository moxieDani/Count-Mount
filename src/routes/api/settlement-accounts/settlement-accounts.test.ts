import { beforeEach, describe, expect, it, vi } from 'vitest';

const env: Record<string, string | undefined> = {};
vi.mock('$env/dynamic/private', () => ({ env }));

const { GET } = await import('./+server');

// 이메일·계좌는 모두 가짜
const call = (email?: string | null) =>
	GET({ locals: { auth: async () => (email === undefined ? null : { user: { email } }) } } as never);

describe('GET /api/settlement-accounts', () => {
	beforeEach(() => {
		env.ALLOWED_EMAILS = 'a@example.com, B@example.com';
		env.SETTLEMENT_ACCOUNT_SEOEUN = '테스트은행 000-0000-0000-00';
		delete env.SETTLEMENT_ACCOUNT_KISOON;
	});

	it('로그인 세션이 없으면 401 (토큰 헤더만으로는 못 받는다)', async () => {
		const res = await call();
		expect(res.status).toBe(401);
		expect(JSON.stringify(await res.json())).not.toContain('0000');
	});

	it('허용 목록에 없는 계정이면 401', async () => {
		expect((await call('c@example.com')).status).toBe(401);
		expect((await call(null)).status).toBe(401);
	});

	it('허용 계정이면 정산 배지별 받는 계좌를 준다 (설정 안 된 쪽은 null)', async () => {
		const res = await call('b@example.com');
		expect(res.status).toBe(200);
		expect(res.headers.get('cache-control')).toContain('no-store');
		expect(await res.json()).toEqual({
			seoEun: { bank: '테스트은행', number: '000-0000-0000-00' },
			kiSoon: null
		});
	});
});
