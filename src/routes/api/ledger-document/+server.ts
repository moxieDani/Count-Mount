import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { HOUSEHOLD_DOC_DEFAULT, fillDocName } from '$lib/server/docName';

// 그 해 가계부 문서를 이름이 정확히 같은 것으로만 찾는다(휴지통 제외). 이름은 HOUSEHOLD_DOC_NAME(기본 "{year} 가계부").
// 예전에는 이름에 해와 '가계부'가 들어간 문서를 모두 후보로 봐서 작업본·테스트 문서가 잡힐 수 있었다(2026-11-17).
const quoteName = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export const GET: RequestHandler = async ({ url, request }) => {
	const authorization = request.headers.get('authorization');
	if (!authorization?.startsWith('Bearer ')) return json({ error: '로그인이 필요합니다.' }, { status: 401 });
	const year = url.searchParams.get('year') ?? '';
	if (!/^\d{4}$/.test(year)) return json({ error: '년도가 올바르지 않습니다.' }, { status: 400 });
	const name = fillDocName(env.HOUSEHOLD_DOC_NAME || HOUSEHOLD_DOC_DEFAULT, year);
	const search = new URLSearchParams({
		q: `name = ${quoteName(name)} and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
		fields: 'files(id,name)',
		orderBy: 'modifiedTime desc',
		supportsAllDrives: 'true',
		includeItemsFromAllDrives: 'true',
		corpora: 'allDrives'
	});
	try {
		const found = await fetch(`https://www.googleapis.com/drive/v3/files?${search}`, { headers: { authorization } });
		if (found.status === 401) return json({ error: '로그인이 만료되었습니다.' }, { status: 401 });
		if (!found.ok) return json({ error: 'Google Drive에서 가계부 문서를 검색하지 못했습니다.' }, { status: found.status });
		const files: { id: string; name: string }[] = (await found.json()).files ?? [];
		const file = files.find((f) => f.name === name);
		if (!file) return json({ error: `${name} 문서를 찾을 수 없습니다.`, name }, { status: 404 });
		return json({ spreadsheetId: file.id, name: file.name });
	} catch {
		return json({ error: '가계부 문서를 찾는 중 오류가 발생했습니다.' }, { status: 500 });
	}
};
