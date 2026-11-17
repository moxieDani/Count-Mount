import { describe, expect, it } from 'vitest';
import {
	FULL_LIST_RANGE, monthListRange, paymentMethodsUrl, pickPaymentMethods, withCurrentValue
} from './paymentMethods';

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


describe('화면이 쓰는 도우미', () => {
	it('보고 있는 달 탭 이름을 넘긴다', () => {
		expect(paymentMethodsUrl('S', '5월')).toBe(`/api/sheets/S/payment-methods?sheet=${encodeURIComponent('5월')}`);
		expect(paymentMethodsUrl('S', null)).toBe('/api/sheets/S/payment-methods');
	});

	it('지금 값이 목록에 없으면 맨 앞', () => {
		expect(withCurrentValue(['A', 'B'], ' 옛카드 ')).toEqual(['옛카드', 'A', 'B']);
	});

	it('지금 값이 목록에 있거나 비었으면 그대로', () => {
		expect(withCurrentValue(['A', 'B'], 'B')).toEqual(['A', 'B']);
		expect(withCurrentValue(['A'], '')).toEqual(['A']);
		expect(withCurrentValue(['A'], null)).toEqual(['A']);
		expect(withCurrentValue(['A'], undefined)).toEqual(['A']);
	});
});
