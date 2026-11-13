import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { isAllowedEmail } from '$lib/server/allowed-email';
import { parseAccount } from '$lib/settlement/transfer';
import type { RequestHandler } from './$types';

// 정산 배지별 받는 계좌. 다른 API 처럼 토큰 헤더 확인을 Google 에 맡길 수 없으니
// (계좌번호는 Google 을 거치지 않는다) 로그인 세션의 계정을 직접 허용 목록과 대조한다.
export const GET: RequestHandler = async ({ locals }) => {
	const session = await locals.auth();
	if (!isAllowedEmail(session?.user?.email)) {
		return json({ error: '로그인이 필요합니다. 페이지를 새로 고치거나 다시 로그인해 주세요.' }, { status: 401 });
	}
	return json(
		{
			seoEun: parseAccount(env.SETTLEMENT_ACCOUNT_SEOEUN),
			kiSoon: parseAccount(env.SETTLEMENT_ACCOUNT_KISOON)
		},
		{ headers: { 'cache-control': 'private, no-store' } }
	);
};
