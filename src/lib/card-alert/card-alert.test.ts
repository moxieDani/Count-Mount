import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { PARSER_CASES } from './parser.cases';
import { extractPayments, normalizeOcr, GAP_MARK } from './extract';
import { classifyMerchant } from './classify';
import { toLedgerFields } from './toRow';

// 실제 결제 정보는 넣지 않는다: 가맹점·카드 끝자리·계좌는 모두 가짜 값
const BANK_OUT = '[출금] 테스트식당 12,300원 1111-222-333***계좌 잔액 100,000원 01/03 12:00:09';
const TOSS = '12,300원 결제 지금\n비씨체크 | 테스트식당(일시불)';
const WOORI_APP = '승인내역 지금\n[일시불체크.승인(5678)]01/03 12:00\n12,300원\n테스트식당';
const LOCK_SCREEN = `우리WON뱅킹 입출금알림 지금\n${BANK_OUT}\n${TOSS}\n${WOORI_APP}`;

describe('parse', () => {
	it.each(PARSER_CASES)('$label', ({ text, expected }) => {
		expect(parse(text)).toMatchObject(expected);
	});

	it('우리카드 앱 알림의 [일시불체크.승인(...)] 형식', () => {
		expect(parse('[일시불체크.승인(5678)]01/03 12:00\n12,300원\n테스트식당')).toMatchObject({
			card: '우리',
			card_suffix: '5678',
			amount: 12300,
			datetime: '01/03 12:00',
			merchant: '테스트식당',
			installment: '일시불',
			is_check: true
		});
	});
});

describe('extractPayments: 붙여넣은 텍스트', () => {
	it.each(PARSER_CASES)('$label 은 후보 한 건', ({ text, expected }) => {
		const got = extractPayments(text);
		expect(got).toHaveLength(1);
		expect(got[0].parsed).toMatchObject(expected);
	});

	it('여러 문자를 한꺼번에 붙여넣으면 건별로 나뉜다', () => {
		const text = PARSER_CASES.slice(0, 3).map((c) => c.text).join('\n\n');
		expect(extractPayments(text)).toHaveLength(3);
	});

	it('은행 입출금 알림은 후보가 아니다', () => {
		expect(extractPayments(BANK_OUT)).toHaveLength(0);
		expect(extractPayments('[입금] 홍길동 500,000원 1111-222-333***계좌 잔액 600,000원 01/03 12:00:09')).toHaveLength(0);
	});

	it('토스 알림만 있으면 토스 형식으로 읽는다', () => {
		const [toss] = extractPayments(TOSS);
		expect(toss.sources).toEqual(['토스']);
		expect(toss.parsed).toMatchObject({ amount: 12300, merchant: '테스트식당', card: 'BC', is_check: true, months: 0 });
	});

	it('토스 알림과 카드사 앱 알림이 같은 결제면 하나로 합치고, 은행 알림은 뺀다', () => {
		const got = extractPayments(LOCK_SCREEN);
		expect(got).toHaveLength(1);
		expect(got[0].sources.sort()).toEqual(['카드사 알림', '토스']);
		expect(got[0].parsed).toMatchObject({
			amount: 12300,
			datetime: '01/03 12:00',
			merchant: '테스트식당',
			card: '우리',
			card_suffix: '5678',
			is_check: true
		});
	});

	it('금액이 같아도 가맹점이 다르면 다른 결제', () => {
		const other = '12,300원 결제 지금\n비씨체크 | 다른가게(일시불)';
		expect(extractPayments(`${TOSS}\n${other}`)).toHaveLength(2);
	});
});

describe('extractPayments: OCR 텍스트', () => {
	it('깨진 [Web발신], KB 오인식, 빠진 쉼표, 상태바를 보정한다', () => {
		const ocr = '9:41      5G 87%\n15881688 >\n[\\/66발신]\n<8국민카드1234승인\n김*형님\n65000원 일시불\n01/02 10:48\n테스트마트 하남점\n누적 1234,000원';
		const [m] = extractPayments(ocr);
		expect(m.parsed).toMatchObject({ card: 'KB국민', card_suffix: '1234', amount: 65000, datetime: '01/02 10:48', merchant: '테스트마트 하남점' });
	});

	it('금액 뒤 원을 숫자로 읽은 것을 되돌린다', () => {
		expect(normalizeOcr('12,3009 결제')).toBe('12300원 결제');
	});

	it('줄 간격 표시(말풍선 경계)에서 메시지를 나눈다', () => {
		const ocr = ['[일시불.승인(1111)]01/02 10:00', '5,000원', '가게하나', GAP_MARK, '[일시불.승인(1111)]01/02 11:00', '7,000원', '가게둘'].join('\n');
		expect(extractPayments(ocr).map((m) => m.parsed.amount)).toEqual([5000, 7000]);
	});
});

describe('classifyMerchant', () => {
	it.each([
		['이마트에브리데이 성수점', '생필품'],
		['이마트 성수점', '장보기(식재료)'],
		['대신주유소', '주유'],
		['스타벅스 강남점', '외식'],
		['쿠팡', null]
	])('%s → %s', (name, category) => {
		expect(classifyMerchant(name)).toBe(category);
	});
});

describe('toLedgerFields', () => {
	const now = new Date(2026, 0, 5); // 2026년 1월 5일

	it('지난해 12월 문자는 작년 날짜로, 보고 있는 달과 다르면 알려 준다', () => {
		const f = toLedgerFields(parse('[일시불.승인(1111)]12/31 23:50\n5,000원\n스타벅스'), { now, viewYear: 2026, viewMonth: 1 });
		expect(f.date).toBe('2025. 12. 31');
		expect(f.account).toBe('외식');
		expect(f.warnings.some((w) => w.includes('12월 결제'))).toBe(true);
	});

	it('해외 결제는 금액을 비우고 외화 금액을 비고에 적는다', () => {
		const f = toLedgerFields(parse('[Web발신]\n우리(1111)해외승인\n홍*동님\nUSD 17.99\n01/02 14:41\nGOOGLE *Yo'), { now });
		expect(f.amount).toBe('');
		expect(f.note).toBe('해외 USD 17.99');
	});

	it('결제방식은 카드 끝자리, 없으면 카드사 이름이 하나만 맞을 때 고른다', () => {
		const p = parse('[일시불체크.승인(5678)]01/03 12:00\n12,300원\n테스트식당');
		expect(toLedgerFields(p, { now, paymentOptions: ['우리체크(5678)', '우리카드', '현대카드'] }).payment).toBe('우리체크(5678)');
		expect(toLedgerFields(p, { now, paymentOptions: ['우리카드', '현대카드'] }).payment).toBe('우리카드');
		expect(toLedgerFields(p, { now, paymentOptions: ['우리카드', '우리체크'] }).payment).toBe('');
	});

	it('시트 계정 목록에 없는 분류는 채우지 않는다', () => {
		const p = parse('[일시불.승인(1111)]01/02 10:00\n5,000원\n스타벅스');
		expect(toLedgerFields(p, { now, accountOptions: ['식비'] }).account).toBe('');
	});
});
