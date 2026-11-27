import { describe, expect, it } from 'vitest';
import {
	CLEARED_ROW, SOURCE_LABEL, clearRowRange, firstEmptyRow, rowRange, rowValues, sortRange
} from './rows';

describe('가계부 거래 표 줄 (기록한 곳 AE)', () => {
	it('새 줄은 일곱째 칸에 가계쀼', () => {
		expect(SOURCE_LABEL).toBe('가계쀼');
		expect(rowRange('5월', 30)).toBe('5월!Y30:AE30');
		expect(rowValues(['2026. 5. 1', '가게', '1000', '카드', '식비', ''])).toEqual(
			['2026. 5. 1', '가게', '1000', '카드', '식비', '', '가계쀼']);
		expect(rowValues(['2026. 5. 1', '가게'])).toEqual(['2026. 5. 1', '가게', '', '', '', '', '가계쀼']);
	});

	it('고쳐서 저장한 줄도 같은 일곱 칸을 써서, 원래 기록한 곳(빈칸·Jarvis)을 가계쀼로 덮어쓴다 (2026-11-27)', () => {
		// 고치기와 새 줄이 같은 도우미를 쓴다: 범위는 Y~AE, 값은 여섯 칸 뒤에 가계쀼
		const edited = ['2026. 5. 2', '고친 가게', '2000', '카드', '식비', '메모'];
		const range = rowRange('5월', 41);
		const values = rowValues(edited);
		expect(range).toBe('5월!Y41:AE41');
		expect(values).toHaveLength(7);
		expect(values.slice(0, 6)).toEqual(edited);
		expect(values[6]).toBe(SOURCE_LABEL);
	});

	it('받은 값이 여섯 칸보다 길어도 일곱째 칸은 항상 가계쀼', () => {
		expect(rowValues(['a', 'b', 'c', 'd', 'e', 'f', 'Jarvis'])[6]).toBe('가계쀼');
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
