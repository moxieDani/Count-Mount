import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { findExactSpreadsheet, householdDocName, kstYear } from '$lib/server/householdDoc';

// 설정 화면의 해 목록: 올해 기준 3년 전 ~ 1년 뒤 중, 이름이 정확히 그 해 가계부인 문서가 있는 해 (설정 설계 7.1)
export const GET: RequestHandler = async ({ request }) => {
	const authorization = request.headers.get('authorization');
	if (!authorization?.startsWith('Bearer ')) return json({ error: '로그인이 필요합니다.' }, { status: 401 });
	const thisYear = kstYear();
	const years: { year: number; spreadsheetId: string }[] = [];
	try {
		for (let year = thisYear - 3; year <= thisYear + 1; year++) {
			const found = await findExactSpreadsheet(authorization, householdDocName(year));
			if (!found.ok) {
				return json({ error: 'Google Drive에서 가계부 문서를 검색하지 못했습니다.' }, { status: found.status === 401 ? 401 : 502 });
			}
			if (found.file) years.push({ year, spreadsheetId: found.file.id });
		}
		return json({ years });
	} catch {
		return json({ error: '가계부 문서를 찾는 중 오류가 발생했습니다.' }, { status: 500 });
	}
};
