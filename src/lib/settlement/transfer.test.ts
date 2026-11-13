import { describe, expect, it } from 'vitest';
import { doubleTapDetector, parseAccount, tossSendUrl } from './transfer';

// 은행 이름·계좌번호는 모두 가짜
describe('parseAccount', () => {
	it('"은행이름 계좌번호" 를 나눈다', () => {
		expect(parseAccount('테스트은행 000-0000-0000-00')).toEqual({ bank: '테스트은행', number: '000-0000-0000-00' });
		expect(parseAccount('  가짜 저축은행   12345678 ')).toEqual({ bank: '가짜 저축은행', number: '12345678' });
	});

	it('비었거나 계좌번호가 없으면 null', () => {
		expect(parseAccount(undefined)).toBeNull();
		expect(parseAccount('')).toBeNull();
		expect(parseAccount('테스트은행')).toBeNull();
		expect(parseAccount('000-0000-0000-00')).toBeNull();
	});
});

describe('tossSendUrl', () => {
	it('은행·계좌번호(숫자만)·금액이 채워진 토스 송금 화면 주소', () => {
		expect(tossSendUrl({ bank: '테스트은행', number: '000-0000-0000-00' }, 12345)).toBe(
			`supertoss://send?amount=12345&bank=${encodeURIComponent('테스트은행')}&accountNo=0000000000000&origin=qr`
		);
	});

	it('금액은 원 단위 정수로', () => {
		expect(tossSendUrl({ bank: '테스트은행', number: '1' }, 999.6)).toContain('amount=1000&');
	});
});

describe('doubleTapDetector', () => {
	it('정한 시간 안에 두 번 탭하면 true', () => {
		const tap = doubleTapDetector(350);
		expect(tap(1000)).toBe(false);
		expect(tap(1300)).toBe(true);
	});

	it('간격이 길면 새 첫 탭으로 센다', () => {
		const tap = doubleTapDetector(350);
		expect(tap(1000)).toBe(false);
		expect(tap(1400)).toBe(false);
		expect(tap(1600)).toBe(true);
	});

	it('세 번째 탭이 또 열지 않도록 성공하면 처음부터 센다', () => {
		const tap = doubleTapDetector(350);
		tap(1000);
		expect(tap(1100)).toBe(true);
		expect(tap(1200)).toBe(false);
	});
});
