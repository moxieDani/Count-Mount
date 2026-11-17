import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { findExactSpreadsheet, householdDocName, kstNow } from '$lib/server/householdDoc';
import { ACCOUNT_TAB, LOG_TAB, settingsRanges } from '$lib/settings/layout';
import { planNewYear } from '$lib/settings/newYear';
import { parseSettings } from '$lib/settings/read';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const TEMPLATE_DEFAULT = 'YYYY 가계부';
/** 빈 틀에서 그 해 이름으로 바꾸는 탭 (설정 설계 8장). */
const YEAR_TABS = (year: number) => [
	{ from: 'YYYY년 예산', to: `${year}년 예산` },
	{ from: 'YYYY년 연간 지출', to: `${year}년 연간 지출` }
];

const docUrl = (id: string) => `https://docs.google.com/spreadsheets/d/${id}`;
const yearOf = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 2000 && v <= 2999 ? v : typeof v === 'string' && /^\d{4}$/.test(v) ? Number(v) : null);

async function who(authorization: string): Promise<string> {
	try {
		const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization } });
		if (!res.ok) return '';
		const info = await res.json();
		return String(info.name || info.email || '');
	} catch {
		return '';
	}
}

/** 복사한 뒤 단계가 실패했다: 만든 문서는 지우지 않고 어느 단계인지와 문서 링크를 알린다 (Review Focus 4). */
class StepFailed extends Error {
	constructor(readonly step: string) {
		super(step);
	}
}

const must = async (step: string, res: Response) => {
	if (!res.ok) throw new StepFailed(step);
	return res;
};

// 새해 가계부: 빈 틀을 지난해 문서 폴더에 복사하고, 탭 이름·연도를 그 해로, 지난해 설정을 정리해 옮겨 적는다 (설정 설계 8장)
export const POST: RequestHandler = async ({ request }) => {
	const authorization = request.headers.get('authorization');
	if (!authorization?.startsWith('Bearer ')) return json({ error: '로그인이 필요합니다.' }, { status: 401 });
	let body: { year?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: '요청이 올바르지 않습니다.' }, { status: 400 });
	}
	const year = yearOf(body.year);
	if (year === null) return json({ error: '년도가 올바르지 않습니다.' }, { status: 400 });

	const name = householdDocName(year);
	const lastName = householdDocName(year - 1);
	const templateName = env.HOUSEHOLD_TEMPLATE_NAME || TEMPLATE_DEFAULT;
	const searchFailed = (status: number) =>
		json({ error: 'Google Drive에서 가계부 문서를 검색하지 못했습니다.' }, { status: status === 401 ? 401 : 502 });

	let newId: string | null = null;
	try {
		const exists = await findExactSpreadsheet(authorization, name);
		if (!exists.ok) return searchFailed(exists.status);
		if (exists.file) return json({ error: `'${name}' 문서가 이미 있습니다.`, spreadsheetId: exists.file.id }, { status: 409 });
		const template = await findExactSpreadsheet(authorization, templateName);
		if (!template.ok) return searchFailed(template.status);
		if (!template.file) return json({ error: `빈 틀 '${templateName}' 문서를 찾지 못했습니다.` }, { status: 404 });
		const last = await findExactSpreadsheet(authorization, lastName);
		if (!last.ok) return searchFailed(last.status);
		if (!last.file) return json({ error: `지난해 '${lastName}' 문서를 찾지 못했습니다.` }, { status: 404 });

		// 3. 복사: 지난해 문서와 같은 폴더에
		const copy = await fetch(`${DRIVE}/${encodeURIComponent(template.file.id)}/copy?supportsAllDrives=true&fields=id,name`, {
			method: 'POST',
			headers: { authorization, 'Content-Type': 'application/json' },
			body: JSON.stringify({ name, ...(last.file.parents?.length ? { parents: last.file.parents } : {}) })
		});
		if (!copy.ok) return json({ error: '빈 틀을 복사하지 못했습니다.' }, { status: copy.status === 401 ? 401 : 502 });
		newId = String((await copy.json()).id);
		const id = encodeURIComponent(newId);

		// 4. 탭 이름과 계정 C1(연도)
		const meta = await (await must('tabs', await fetch(`${SHEETS}/${id}?fields=sheets.properties(sheetId,title)`, { headers: { authorization } }))).json();
		const tabs: { sheetId: number; title: string }[] = (meta.sheets ?? []).map((s: { properties: { sheetId: number; title: string } }) => s.properties);
		const renames = YEAR_TABS(year).map(t => {
			const tab = tabs.find(x => x.title === t.from);
			if (!tab) throw new StepFailed('tabs');
			return { updateSheetProperties: { properties: { sheetId: tab.sheetId, title: t.to }, fields: 'title' } };
		});
		await must('tabs', await fetch(`${SHEETS}/${id}:batchUpdate`, {
			method: 'POST', headers: { authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ requests: renames })
		}));
		await must('year', await fetch(`${SHEETS}/${id}/values/${encodeURIComponent(`${ACCOUNT_TAB}!C1`)}?valueInputOption=RAW`, {
			method: 'PUT', headers: { authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [[year]] })
		}));

		// 5. 지난해 설정을 읽어 정리해 옮겨 적는다
		const query = new URLSearchParams({ valueRenderOption: 'UNFORMATTED_VALUE' });
		settingsRanges(year - 1).forEach(r => query.append('ranges', r));
		const read = await must('read', await fetch(`${SHEETS}/${encodeURIComponent(last.file.id)}/values:batchGet?${query}`, { headers: { authorization } }));
		const values = ((await read.json()).valueRanges ?? []).map((v: { values?: unknown[][] }) => v.values ?? []);
		const writes = planNewYear(parseSettings(values, year - 1), year);
		await must('write', await fetch(`${SHEETS}/${id}/values:batchUpdate`, {
			method: 'POST', headers: { authorization, 'Content-Type': 'application/json' },
			body: JSON.stringify({ valueInputOption: 'RAW', data: writes.map(w => ({ range: w.range, values: w.after })) })
		}));

		const row = [kstNow(), await who(authorization), '지난해 설정을 가져옴', lastName, name];
		const log = await fetch(
			`${SHEETS}/${id}/values/${encodeURIComponent(`'${LOG_TAB}'!A:E`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
			{ method: 'POST', headers: { authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: [row] }) }
		);
		return json({ ok: true, spreadsheetId: newId, url: docUrl(newId), ...(log.ok ? {} : { logged: false }) });
	} catch (e) {
		if (newId !== null) {
			const step = e instanceof StepFailed ? e.step : 'unknown';
			return json({ ok: false, step, spreadsheetId: newId, url: docUrl(newId) }, { status: 502 });
		}
		return json({ error: '새해 가계부를 만드는 중 오류가 발생했습니다.' }, { status: 500 });
	}
};
