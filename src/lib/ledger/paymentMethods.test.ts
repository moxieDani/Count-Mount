import { describe, expect, it } from 'vitest';
import {
	FULL_ACCOUNT_RANGE, FULL_LIST_RANGE, accountsUrl, monthAccountRange, monthListRange, paymentMethodsUrl,
	pickListValues, pickPaymentMethods, withCurrentValue
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


describe('계정 목록 (이달 쓸 계정)', () => {
	it('그 달 탭의 AI27:AI56, 전체는 계정항목', () => {
		expect(monthAccountRange('5월')).toBe("'5월'!AI27:AI56");
		expect(FULL_ACCOUNT_RANGE).toBe('계정항목');
		expect(accountsUrl('S', '5월')).toBe(`/api/sheets/S/accounts?sheet=${encodeURIComponent('5월')}`);
		expect(accountsUrl('S', null)).toBe('/api/sheets/S/accounts');
	});

	it('목록 다듬기는 결제방식과 같은 함수', () => {
		expect(pickListValues([['외식'], [''], [' 배달 ']])).toEqual(['외식', '배달']);
		expect(pickPaymentMethods).toBe(pickListValues);
	});
});
