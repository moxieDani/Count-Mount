import { describe, expect, it } from 'vitest';
import { FULL_LIST_RANGE, monthListRange, pickPaymentMethods } from './paymentMethods';

describe('결제방식 목록 다듬기', () => {
	it('구분선과 빈칸을 뺀다', () => {
		expect(pickPaymentMethods([['A'], ['------'], [''], [' B '], ['A']])).toEqual(['A', 'B']);
	});

	it('값이 없으면 빈 목록', () => {
		expect(pickPaymentMethods(undefined)).toEqual([]);
	});

	it('그 달 탭의 이달 쓸 카드 범위, 전체 목록 범위', () => {
		expect(monthListRange('5월')).toBe("'5월'!AH27:AH56");
		expect(monthListRange("a'b")).toBe("'a''b'!AH27:AH56");
		expect(FULL_LIST_RANGE).toBe('계정!F4:F33');
	});
});
