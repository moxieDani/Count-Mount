/**
 * 결제방식 목록 (jarvis-core apps-sheet-format-design 4.1, 2026-11-17).
 * 그 달 탭의 '이달 쓸 카드'(AH27:AH56)가 시트 수식으로 그 달에 쓸 수 있는 것만 남기므로 앱은 날짜 판단을 하지 않는다.
 * 비었거나 읽지 못하면 계정 탭 결제방식 30칸 전체.
 */

export const FULL_LIST_RANGE = '계정!F4:F33';

const SEPARATOR = /^-+$/;

/** 그 달 탭의 '이달 쓸 카드' 범위. 탭 이름의 작은따옴표는 두 번 써서 감싼다. */
export function monthListRange(sheet: string): string {
	return `'${sheet.replaceAll("'", "''")}'!AH27:AH56`;
}

/** 읽은 값을 목록으로: 글로 바꿔 앞뒤 띄어쓰기를 지우고, 빈칸과 구분선(-만 있는 글)을 뺀다. 차례 유지, 같은 이름은 첫 번째만.
 *  결제방식·계정 목록이 함께 쓴다. */
export function pickListValues(values: unknown[][] | undefined): string[] {
	const out: string[] = [];
	for (const cell of (values ?? []).flat()) {
		const text = cell == null ? '' : String(cell).trim();
		if (text && !SEPARATOR.test(text) && !out.includes(text)) out.push(text);
	}
	return out;
}

/** 지출 추가·고치기 화면이 부르는 주소. 보고 있는 달 탭 이름이 있으면 그 달 목록을 받는다. */
export function paymentMethodsUrl(spreadsheetId: string, sheet: string | null | undefined): string {
	const base = `/api/sheets/${spreadsheetId}/payment-methods`;
	return sheet ? `${base}?sheet=${encodeURIComponent(sheet)}` : base;
}

/** 지금 값(앞뒤 띄어쓰기 지움)이 있고 목록에 없으면 맨 앞에 넣는다(이미 적힌 값은 그 달 목록에 없어도 그대로 둔다). */
export function withCurrentValue(options: string[], current: string | null | undefined): string[] {
	const value = (current ?? '').toString().trim();
	return value && !options.includes(value) ? [value, ...options] : options;
}

export const pickPaymentMethods = pickListValues;

/** 계정 전체 목록: 이름 붙인 범위 '계정항목'(비고정 소비지출 30칸). */
export const FULL_ACCOUNT_RANGE = '계정항목';

/** 그 달 탭의 '이달 쓸 계정' 범위 (그만 쓴 분류는 시트 수식이 뺀다). */
export function monthAccountRange(sheet: string): string {
	return `'${sheet.replaceAll("'", "''")}'!AI27:AI56`;
}

/** 지출 추가·고치기 화면이 부르는 계정 목록 주소. */
export function accountsUrl(spreadsheetId: string, sheet: string | null | undefined): string {
	const base = `/api/sheets/${spreadsheetId}/accounts`;
	return sheet ? `${base}?sheet=${encodeURIComponent(sheet)}` : base;
}

/** 목록을 읽은 열쇠: 문서와 달 탭을 함께 본다(해가 다르면 같은 '5월'이라도 다른 목록, 2026-11-18 최종 검토). */
export function listKey(spreadsheetId: string | null | undefined, sheet: string | null | undefined): string {
	return `${spreadsheetId ?? ''}|${sheet ?? ''}`;
}
