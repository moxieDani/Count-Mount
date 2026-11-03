import { describe, expect, it } from 'vitest';
import { parse } from './parser';
import { PARSER_CASES } from './parser.cases';
import { extractPayments, normalizeOcr, noticeDate, GAP_MARK } from './extract';
import { classifyMerchant } from './classify';
import { ledgerFieldOf, toLedgerFields } from './toRow';
import { findDuplicateRow } from '../ledger/duplicate';

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

describe('ledgerFieldOf', () => {
	it.each([
		['날짜', 'date'],
		['금액', 'amount'],
		['결제방식', 'payment'],
		['계정', 'account'],
		['지출내용', 'merchant'],
		['지출 내용', 'merchant'],
		['지출내용 ', 'merchant'],
		['사용처', 'merchant'],
		['비고', 'note'],
		['정산', null]
	])('"%s" → %s', (header, kind) => {
		expect(ledgerFieldOf(header)).toBe(kind);
	});
});

describe('findDuplicateRow', () => {
	const headers = ['날짜', '지출 내용', '결제방식', '계정', '금액', '비고'];
	// 시트에서 읽은 값은 표시 형식 그대로 온다
	const rows = [
		['10. 30', '다른가게', '우리카드', '외식', '₩5,000', ''],
		['10. 31', '테스트 와인', '삼성카드', '', '₩126,000', '']
	];

	it('날짜·금액·지출내용이 같으면 같은 내역 (표시 형식·띄어쓰기 무시)', () => {
		expect(findDuplicateRow(headers, rows, ['2026. 10. 31', '테스트와인', '', '', '126000', ''])).toBe(1);
	});

	it('하나라도 다르면 새 내역', () => {
		expect(findDuplicateRow(headers, rows, ['2026. 10. 31', '테스트와인', '', '', '12600', ''])).toBe(-1);
		expect(findDuplicateRow(headers, rows, ['2026. 10. 30', '테스트와인', '', '', '126000', ''])).toBe(-1);
		expect(findDuplicateRow(headers, rows, ['2026. 10. 31', '다른가게', '', '', '126000', ''])).toBe(-1);
	});

	it('비교할 칸이 비어 있거나 헤더에 없으면 검사하지 않는다', () => {
		expect(findDuplicateRow(headers, rows, ['2026. 10. 31', '', '', '', '126000', ''])).toBe(-1);
		expect(findDuplicateRow(['날짜', '금액'], [['10. 31', '126000']], ['2026. 10. 31', '126000'])).toBe(-1);
	});
});

describe('알림센터 목록 (알림 제목 옆에 시각이 붙은 토스 알림들)', () => {
	const now = new Date(2026, 10, 3, 10, 33); // 2026년 11월 3일 화요일
	// 아이폰 알림센터 캡처의 OCR 결과 형태. 금액·가맹점은 가짜 값
	const OCR = [
		'10:33                              al = ©»',
		'7,100원 결제              어제 오후 12:20',
		'비씨체크 | 테스트이츠(일시불)',
		'21,9009 결제                   (일) 오전 10:12',
		'비씨체크 | 테스트마켓(일시불)                            |',
		'ㅡ',
		'현금영수증                         (일) 오전 9:33',
		'3개가 나왔어요 (토스인컴 알림)',
		'53,000원 결제 실패               (도) 오후 12:17',
		'카드 문제로 결제되지 않았어요. 카드 상태를',
		'확인하고 다시 시도해주세요.',
		'35,0002 결제                     (2) 23 8:00',
		'비씨체크 | 테스트감자국(일시불)'
	].join('\n');

	it('알림마다 나누고, 시각은 가맹점에서 떼어 내 날짜로 바꾼다 (결제 실패는 제외)', () => {
		const got = extractPayments(OCR, { now });
		expect(got.map((m) => [m.parsed.amount, m.parsed.merchant, m.notice?.date ?? null])).toEqual([
			[7100, '테스트이츠', '11/02'],
			[21900, '테스트마켓', '11/01'],
			[35000, '테스트감자국', null] // 요일이 "(2)" 로 깨져 날짜를 알 수 없음
		]);
		expect(got.every((m) => m.sources[0] === '토스')).toBe(true);
	});

	it('입력값에는 알림 시각으로 계산한 날짜가 들어가고 확인 안내가 붙는다', () => {
		const [first] = extractPayments(OCR, { now });
		const f = toLedgerFields(first.parsed, { now, notice: first.notice });
		expect(f.date).toBe('2026. 11. 2');
		expect(f.warnings.some((w) => w.includes('어제 오후 12:20'))).toBe(true);
	});

	it.each([
		['지금', '11/03'],
		['3분 전', '11/03'],
		['어제 오후 12:20', '11/02'],
		['그저께 오전 9:00', '11/01'],
		['(일) 오전 10:12', '11/01'],
		['(금) 오후 8:00', '10/30'],
		['(화) 오후 1:00', '10/27'],
		['오후 12:20', '11/03'],
		['10월 30일', '10/30'],
		['(2) 23 8:00', null]
	])('알림 시각 "%s" → %s', (label, date) => {
		expect(noticeDate(label, now)).toBe(date);
	});

	it('자정 넘어 "2시간 전"은 전날', () => {
		expect(noticeDate('2시간 전', new Date(2026, 10, 3, 1, 0))).toBe('11/02');
	});
});
