/**
 * 가계부 달 탭 거래 표(Y27:AD126)의 줄과 기록한 곳 칸 AE (jarvis-core apps-sheet-format-design 6장, 2026-11-17).
 * 새 줄은 Y~AE 일곱 칸(AE에 가계쀼), 지우기도 일곱 칸, 고치기는 Y~AD 여섯 칸(AE는 처음 기록한 곳 그대로).
 * 빈 줄 찾기·같은 줄 견주기는 Y~AD 여섯 칸만 본다(AE만 남은 줄은 빈 줄).
 */

export const SOURCE_LABEL = '가계쀼';
export const FIRST_ROW = 27;
const LAST_ROW = 126;
const WIDTH = 6;

export function newRowRange(sheet: string, row: number): string {
	return `${sheet}!Y${row}:AE${row}`;
}

/** 여섯 칸(모자라면 빈칸으로 채움) 뒤에 기록한 곳. */
export function newRowValues(cells: string[]): string[] {
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
