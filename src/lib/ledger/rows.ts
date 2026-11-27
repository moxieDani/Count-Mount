/**
 * 가계부 달 탭 거래 표(Y27:AD126)의 줄과 기록한 곳 칸 AE (jarvis-core apps-sheet-format-design 6장, 2026-11-17).
 * 새 줄도, 고쳐서 저장하는 줄도 Y~AE 일곱 칸을 쓴다(AE에 가계쀼, 원래 값은 빈칸·Jarvis여도 덮어쓴다 — 2026-11-27 사용자 결정).
 * 지우기도 일곱 칸.
 * 빈 줄 찾기·같은 줄 견주기는 Y~AD 여섯 칸만 본다(AE만 남은 줄은 빈 줄).
 */

export const SOURCE_LABEL = '가계쀼';
export const FIRST_ROW = 27;
const LAST_ROW = 126;
const WIDTH = 6;

/** 새 줄과 고치는 줄이 함께 쓰는 Y~AE 일곱 칸 범위. */
export function rowRange(sheet: string, row: number): string {
	return `${sheet}!Y${row}:AE${row}`;
}

/** 여섯 칸(모자라면 빈칸으로 채우고 넘치면 자름) 뒤에 기록한 곳 가계쀼. */
export function rowValues(cells: string[]): string[] {
	const six = Array.from({ length: WIDTH }, (_, i) => cells[i] ?? '');
	return [...six, SOURCE_LABEL];
}

export function clearRowRange(sheet: string, row: number): string {
	return `${sheet}!Y${row}:AE${row}`;
}

export const CLEARED_ROW: string[] = Array.from({ length: WIDTH + 1 }, () => '');

/** 날짜 순 정렬 범위 Y27:AE126 (기록한 곳이 줄과 함께 움직인다). */
export function sortRange(sheetId: number) {
	return { sheetId, startRowIndex: FIRST_ROW - 1, endRowIndex: LAST_ROW, startColumnIndex: 24, endColumnIndex: 31 };
}

function empty(cell: unknown): boolean {
	return cell === undefined || cell === null || String(cell).trim() === '';
}

/** Y27:AD126 값에서 여섯 칸이 모두 빈 첫 줄 번호(27부터). 없으면 null. */
export function firstEmptyRow(values: unknown[][]): number | null {
	for (let i = 0; i <= LAST_ROW - FIRST_ROW; i++) {
		const row = values[i] ?? [];
		if (Array.from({ length: WIDTH }, (_, c) => row[c]).every(empty)) return FIRST_ROW + i;
	}
	return null;
}
