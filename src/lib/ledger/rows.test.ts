import { describe, expect, it } from 'vitest';
import {
	CLEARED_ROW, SOURCE_LABEL, clearRowRange, firstEmptyRow, newRowRange, newRowValues, sortRange
} from './rows';

describe('가계부 거래 표 줄 (기록한 곳 AE)', () => {
	it('새 줄은 일곱째 칸에 가계쀼', () => {
		expect(SOURCE_LABEL).toBe('가계쀼');
		expect(newRowRange('5월', 30)).toBe('5월!Y30:AE30');
		expect(newRowValues(['2026. 5. 1', '가게', '1000', '카드', '식비', ''])).toEqual(
			['2026. 5. 1', '가게', '1000', '카드', '식비', '', '가계쀼']);
		expect(newRowValues(['2026. 5. 1', '가게'])).toEqual(['2026. 5. 1', '가게', '', '', '', '', '가계쀼']);
	});

	it('지우기는 일곱 칸 빈칸', () => {
		expect(clearRowRange('5월', 31)).toBe('5월!Y31:AE31');
		expect(CLEARED_ROW).toEqual(['', '', '', '', '', '', '']);
	});

	it('정렬 범위는 Y~AE', () => {
		expect(sortRange(7)).toEqual({ sheetId: 7, startRowIndex: 26, endRowIndex: 126, startColumnIndex: 24, endColumnIndex: 31 });
	});

	it('AE만 남은 줄도 빈 줄 (Y~AD 여섯 칸만 본다)', () => {
		expect(firstEmptyRow([['2026. 5. 1', '가게'], ['', '', '', '', '', '', '가계쀼']])).toBe(28);
		expect(firstEmptyRow([['2026. 5. 1'], []])).toBe(28);
		expect(firstEmptyRow([])).toBe(27);
	});

	it('날짜만 빈 줄은 빈 줄이 아니다(사람이 적던 줄을 덮어쓰지 않는다)', () => {
		expect(firstEmptyRow([['', '가게', 1000]])).toBe(28);
	});

	it('빈 줄이 없으면 null', () => {
		expect(firstEmptyRow(Array.from({ length: 100 }, () => ['2026. 5. 1']))).toBeNull();
	});
});
