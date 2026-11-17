import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { kstNow } from '$lib/server/householdDoc';
import { LOCKED, cellsText, type CellWrite } from '$lib/settings/changes';
import { ACCOUNT_TAB, AUTO_TAB, FORMULA_RANGES, LOG_TAB, TRANSFER_TAB, budgetTab, colName, parseRange, settingsRanges } from '$lib/settings/layout';
import { parseSettings } from '$lib/settings/read';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

async function batchGet(spreadsheetId: string, authorization: string, ranges: string[], render: 'UNFORMATTED_VALUE' | 'FORMULA' = 'UNFORMATTED_VALUE') {
	const query = new URLSearchParams({ valueRenderOption: render });
	ranges.forEach(r => query.append('ranges', r));
	return fetch(`${SHEETS}/${encodeURIComponent(spreadsheetId)}/values:batchGet?${query}`, { headers: { authorization } });
}

const yearOf = (v: unknown) => (typeof v === 'number' || (typeof v === 'string' && /^\d{4}$/.test(v)) ? Number(v) : null);

const valuesOf = async (res: Response) =>
	((await res.json()).valueRanges ?? []).map((v: { values?: unknown[][] }) => v.values ?? []) as unknown[][][];

// 설정 읽기: 값 한 번, 수식 한 번(다른 칸을 따라가는 칸 자리)을 함께 보낸다 (설정 설계 7.1)
export const GET: RequestHandler = async ({ params, url, request }) => {
	const authorization = request.headers.get('authorization');
	if (!authorization?.startsWith('Bearer ')) return json({ error: '로그인이 필요합니다.' }, { status: 401 });
	const year = yearOf(url.searchParams.get('year'));
	if (year === null) return json({ error: '년도가 올바르지 않습니다.' }, { status: 400 });
	try {
		const ranges = settingsRanges(year);
		const [res, formulaRes] = await Promise.all([
			batchGet(params.spreadsheetId, authorization, ranges),
			batchGet(params.spreadsheetId, authorization, ranges.slice(0, FORMULA_RANGES), 'FORMULA')
		]);
		if (!res.ok || !formulaRes.ok) {
			return json({ error: '설정을 읽지 못했습니다.' }, { status: res.status === 401 || formulaRes.status === 401 ? 401 : 502 });
		}
		return json(parseSettings(await valuesOf(res), year, await valuesOf(formulaRes)));
	} catch {
		return json({ error: '설정을 읽는 중 오류가 발생했습니다.' }, { status: 500 });
	}
};

/** 쓸 수 있는 탭: 계정, 자동 기록 설정, 그 해 예산, 자동이체 내역 (달 탭 등에는 쓰지 않는다). */
function tabOf(range: string): string {
	const m = /^'((?:[^']|'')*)'!/.exec(range) ?? /^([^!']+)!/.exec(range);
	return m ? m[1].replaceAll("''", "'") : '';
}

const norm = (v: unknown) => (v === undefined || v === null ? '' : String(v).trim());

/** 다시 읽은 값이 before와 같은가 (글자로 견준다: 숫자 5123과 글 '5123'은 같다, 없는 칸은 빈칸). */
function same(before: unknown[][], now: unknown[][]): boolean {
	return before.every((row, r) => row.every((cell, c) => norm(cell) === norm(now[r]?.[c])));
}

const isFormula = (v: unknown) => typeof v === 'string' && v.startsWith('=');

/**
 * 한 쓰기에서 실제로 쓸 칸: 지금 값과 글자가 다른 칸만, 줄마다 붙어 있는 칸끼리 묶는다(손대지 않은 칸은 쓰지 않아
 * 따라가는 칸·날짜·숫자 모양이 그대로 남는다). 모든 칸이 바뀌면 받은 범위 그대로. 바뀌는 칸이 수식이면 locked.
 */
function changedParts(w: CellWrite, now: unknown[][], formulas: unknown[][]) {
	const at = parseRange(w.range)!;
	const data: { range: string; values: unknown[][] }[] = [];
	let locked = false, all = true;
	w.after.forEach((row, r) => {
		let start = -1;
		const flush = (end: number) => {
			if (start < 0) return;
			const first = `${colName(at.col + start)}${at.row + r}`, lastCell = `${colName(at.col + end - 1)}${at.row + r}`;
			data.push({ range: `${at.tabPart}!${first}${end - 1 > start ? `:${lastCell}` : ''}`, values: [row.slice(start, end)] });
			start = -1;
		};
		row.forEach((cell, c) => {
			if (norm(cell) === norm(now[r]?.[c])) {
				all = false;
				flush(c);
				return;
			}
			if (isFormula(formulas[r]?.[c])) locked = true;
			if (start < 0) start = c;
		});
		flush(row.length);
	});
	return { data: all && data.length ? [{ range: w.range, values: w.after }] : data, locked };
}

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

// 설정 저장: 다시 읽어 바뀌었으면 409로 쓰지 않고, 같으면 RAW로 쓰고 '설정 기록'에 줄마다 남긴다 (설정 설계 7.2)
export const POST: RequestHandler = async ({ params, request }) => {
	const authorization = request.headers.get('authorization');
	if (!authorization?.startsWith('Bearer ')) return json({ error: '로그인이 필요합니다.' }, { status: 401 });
	let body: { year?: unknown; writes?: CellWrite[] };
	try {
		body = await request.json();
	} catch {
		return json({ error: '요청이 올바르지 않습니다.' }, { status: 400 });
	}
	const year = yearOf(body.year);
	const writes = Array.isArray(body.writes) ? body.writes : [];
	if (year === null || writes.length === 0) return json({ error: '요청이 올바르지 않습니다.' }, { status: 400 });
	const allowed = new Set([ACCOUNT_TAB, AUTO_TAB, budgetTab(year), TRANSFER_TAB]);
	if (writes.some(w => !w || typeof w.range !== 'string' || !allowed.has(tabOf(w.range)) || !parseRange(w.range)
		|| !Array.isArray(w.before) || !Array.isArray(w.after) || !w.after.every(Array.isArray))) {
		return json({ error: '설정 탭 밖의 칸은 고칠 수 없습니다.' }, { status: 400 });
	}
	const id = encodeURIComponent(params.spreadsheetId);
	try {
		const ranges = writes.map(w => w.range);
		const [read, formulaRead] = await Promise.all([
			batchGet(params.spreadsheetId, authorization, ranges),
			batchGet(params.spreadsheetId, authorization, ranges, 'FORMULA')
		]);
		if (!read.ok || !formulaRead.ok) {
			return json({ error: '저장 전 확인 읽기를 하지 못했습니다.' }, { status: read.status === 401 || formulaRead.status === 401 ? 401 : 502 });
		}
		const current = await valuesOf(read);
		const formulas = await valuesOf(formulaRead);
		if (writes.some((w, i) => !same(w.before, current[i] ?? []))) return json({ conflict: true }, { status: 409 });

		// 바뀐 칸만 쓴다. 다른 칸을 따라가는 칸(수식)을 바꾸려 하면 아무것도 쓰지 않는다 (화면을 거치지 않은 요청도)
		const parts = writes.map((w, i) => changedParts(w, current[i] ?? [], formulas[i] ?? []));
		const blocked = writes.find((_, i) => parts[i].locked);
		if (blocked) return json({ error: `'${blocked.label}': ${LOCKED}` }, { status: 400 });
		const changed = writes.filter((_, i) => parts[i].data.length);
		if (changed.length === 0) return json({ ok: true, unchanged: true });

		const write = await fetch(`${SHEETS}/${id}/values:batchUpdate`, {
			method: 'POST',
			headers: { authorization, 'Content-Type': 'application/json' },
			body: JSON.stringify({ valueInputOption: 'RAW', data: parts.flatMap(p => p.data) })
		});
		if (!write.ok) return json({ error: '시트에 쓰지 못했습니다. 기록은 남기지 않았습니다.' }, { status: 502 });

		const by = await who(authorization);
		const when = kstNow();
		const dates = (w: CellWrite) => (Array.isArray(w.dates) ? w.dates.filter(n => Number.isInteger(n)) : []);
		const rows = changed.map(w => [when, by, w.label, cellsText(w.before, dates(w)), cellsText(w.after, dates(w))]);
		const log = await fetch(
			`${SHEETS}/${id}/values/${encodeURIComponent(`'${LOG_TAB}'!A:E`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
			{ method: 'POST', headers: { authorization, 'Content-Type': 'application/json' }, body: JSON.stringify({ values: rows }) }
		);
		return log.ok ? json({ ok: true }) : json({ ok: true, logged: false });
	} catch {
		return json({ error: '설정을 저장하는 중 오류가 발생했습니다.' }, { status: 500 });
	}
};
