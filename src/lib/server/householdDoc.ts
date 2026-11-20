import { env } from '$env/dynamic/private';
import { HOUSEHOLD_DOC_DEFAULT, fillDocName } from './docName';

/** 그 해 가계부 문서 이름 (HOUSEHOLD_DOC_NAME, 기본 "{year} 가계부"). */
export function householdDocName(year: number | string): string {
	return fillDocName(env.HOUSEHOLD_DOC_NAME || HOUSEHOLD_DOC_DEFAULT, String(year));
}

const quoteName = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

export type DriveSheet = { id: string; name: string; parents?: string[] };

/** 이름이 정확히 같은 스프레드시트(휴지통 제외, 최근에 고친 것 먼저). 찾지 못하면 file 없음. */
export async function findExactSpreadsheet(
	authorization: string, name: string
): Promise<{ ok: true; file: DriveSheet | null } | { ok: false; status: number }> {
	const search = new URLSearchParams({
		q: `name = ${quoteName(name)} and mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false`,
		fields: 'files(id,name,parents)',
		orderBy: 'modifiedTime desc',
		supportsAllDrives: 'true',
		includeItemsFromAllDrives: 'true',
		corpora: 'allDrives'
	});
	const found = await fetch(`https://www.googleapis.com/drive/v3/files?${search}`, { headers: { authorization } });
	if (!found.ok) return { ok: false, status: found.status };
	const files: DriveSheet[] = (await found.json()).files ?? [];
	return { ok: true, file: files.find(f => f.name === name) ?? null };
}

/** 지금 한국 시각 'YYYY-MM-DD HH:mm' (설정 기록의 때). */
export function kstNow(now = Date.now()): string {
	return new Date(now + 9 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
}

export const kstYear = (now = Date.now()) => Number(kstNow(now).slice(0, 4));
