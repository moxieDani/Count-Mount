import { pickListValues } from '$lib/ledger/paymentMethods';

/** 그 달 목록 → 비었거나 읽지 못하면 전체 목록 (결제방식·계정 목록 경로가 함께 쓴다, 2026-11-17).
 *  전체 목록도 읽지 못하면 그 응답을 돌려준다(부르는 쪽이 오류로 알린다). */
export async function readMonthOrFull(
	spreadsheetId: string, accessToken: string, monthRange: string | null, fullRange: string
): Promise<{ ok: true; values: string[]; range: string } | { ok: false; response: Response }> {
	const read = (range: string) =>
		fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}`, {
			headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
		});
	if (monthRange) {
		const month = await read(monthRange);
		if (month.ok) {
			const values = pickListValues((await month.json()).values);
			if (values.length > 0) return { ok: true, values, range: monthRange };
		}
	}
	const full = await read(fullRange);
	if (!full.ok) return { ok: false, response: full };
	return { ok: true, values: pickListValues((await full.json()).values), range: fullRange };
}
