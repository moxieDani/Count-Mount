import { describe, expect, it } from 'vitest';
import { cardBadges, parseCardUsage } from './parse';

// 카드사용내역 월 시트의 J1:L102 (J 항목, K 사용, L 기준) 를 Sheets API 로 읽은 모양.
// 카드 이름 줄은 K·L 이 "사용"·"기준" 머리글이다. 카드 이름·가게·금액은 가짜.
const ROWS = [
	['테스트카드A', '사용', '기준'],
	['실적', '10,000', '100,000'],
	['테스트 체크카드B', '사용', '기준'],
	['실적', '150,000', '150,000'],
	['실적혜택', '1,000', '6,000'],
	['보너스 혜택', '1,500', '3,000'],
	['보너스 결제 건(페이1, 페이2)', '1', '2'],
	['온라인쇼핑 건(테스트몰, 다른몰)', '1', '3'],
	['', '', ''],
	['테스트카드C', '사용', '기준'],
	['실적', '480,000', '400,000'],
	['배달 실적', '12000', '30000'],
	['배달 혜택', '1200', '3000']
];

describe('parseCardUsage', () => {
	const cards = parseCardUsage(ROWS);

	it('K 가 "사용"(또는 빈) 줄은 카드 이름, 아래 줄들은 그 카드의 항목', () => {
		expect(cards.map((c) => [c.name, c.items.length])).toEqual([
			['테스트카드A', 1],
			['테스트 체크카드B', 5],
			['테스트카드C', 3]
		]);
	});

	it('사용·기준을 숫자로 읽고, 항목 이름이 "건"으로 끝나면(괄호 제외) 건, 아니면 원', () => {
		expect(cards[1].items.map((i) => [i.used, i.total, i.unit])).toEqual([
			[150000, 150000, '원'],
			[1000, 6000, '원'],
			[1500, 3000, '원'],
			[1, 2, '건'],
			[1, 3, '건']
		]);
	});

	it('괄호 안 가게 목록은 이름과 따로 둔다', () => {
		expect(cards[1].items.slice(3).map((i) => [i.name, i.note])).toEqual([
			['보너스 결제 건', '페이1, 페이2'],
			['온라인쇼핑 건', '테스트몰, 다른몰']
		]);
		expect(cards[0].items[0]).toMatchObject({ name: '실적', note: '' });
	});

	it('게이지 비율은 사용 ÷ 기준, 기준을 넘으면 1 에서 멈춘다', () => {
		expect(cards[0].items[0].ratio).toBeCloseTo(0.1);
		expect(cards[2].items[0].ratio).toBe(1);
		expect(cards[2].items[0].used).toBe(480000); // 숫자는 실제 값 그대로
	});

	it('게이지 색: 실적은 주황(spend), 혜택은 주황(limit), 보너스는 연보라, 그 밖의 건수는 색 없음, 다 채우면 완료(초록)', () => {
		const [card] = parseCardUsage([
			['테스트 체크카드B', '사용', '기준'],
			['실적', '10,000', '150,000'],
			['실적혜택', '1,000', '6,000'],
			['보너스 혜택', '0', '3,000'],
			['보너스 결제 건(페이1)', '0', '2'],
			['영화 건(가게1)', '1', '1'],
			['카페 건(가게2)', '0', '4']
		]);
		expect(card.items.map((i) => i.tone)).toEqual(['spend', 'limit', 'bonus', 'bonus', 'done', null]);
	});

	it('혜택 한도를 다 채우면 그 혜택을 받는 건수 줄도 완료 (보너스 건수는 보너스 혜택을 따른다)', () => {
		const [card] = parseCardUsage([
			['테스트 체크카드B', '사용', '기준'],
			['실적혜택', '6,000', '6,000'],
			['보너스 혜택', '1,500', '3,000'],
			['보너스 결제 건(페이1)', '1', '2'],
			['온라인쇼핑 건(테스트몰)', '1', '3']
		]);
		expect(card.items.map((i) => [i.name, i.tone, i.ratio])).toEqual([
			['실적혜택', 'done', 1],
			['보너스 혜택', 'bonus', 0.5],
			['보너스 결제 건', 'bonus', 0.5],
			['온라인쇼핑 건', 'done', 1 / 3] // 비율은 실제 건수 그대로
		]);
	});

	it('숫자가 아닌 값은 게이지 없이 글자 그대로 두고, 항목 없는 제목 줄은 버린다', () => {
		const got = parseCardUsage([
			['11월 카드 실적'],
			['테스트카드E', '사용', '기준'],
			['실적', '₩-4,200', '전월 기준'],
			['메모', '확인 필요']
		]);
		expect(got).toHaveLength(1);
		expect(got[0].items.map((i) => [i.used, i.total, i.text, i.ratio])).toEqual([
			[-4200, null, '₩-4,200', null],
			[null, null, '확인 필요', null]
		]);
	});

	it('Sheets API 가 숫자로 줘도 읽는다', () => {
		const [card] = parseCardUsage([['테스트카드F', '사용', '기준'], ['실적', 120000, 400000]]);
		expect(card.items[0]).toMatchObject({ used: 120000, total: 400000, unit: '원', ratio: 0.3 });
	});

	it('기준이 0 이면 채울 것이 없으니 완료', () => {
		const [card] = parseCardUsage([['테스트카드G', '사용', '기준'], ['실적', '0', '0']]);
		expect(card.items[0]).toMatchObject({ ratio: 1, tone: 'done' });
	});
});

describe('cardBadges', () => {
	const item = (name: string, used: number, total: number) => parseCardUsage([['카드', '사용', '기준'], [name, used, total]])[0].items[0];

	it('실적 배지: 진행률(%)을 내림으로, 다 채우면 실적 달성', () => {
		expect(cardBadges([item('실적', 149999, 150000)])).toEqual([{ kind: 'spend', text: '실적 99%' }]);
		expect(cardBadges([item('실적', 0, 100000)])).toEqual([{ kind: 'spend', text: '실적 0%' }]);
		expect(cardBadges([item('실적', 480000, 400000)])).toEqual([{ kind: 'done', text: '실적 달성' }]);
	});

	it('"실적" 줄이 없으면 첫 실적 금액 줄(배달 실적 등)로 정한다', () => {
		expect(cardBadges([item('배달 실적', 15000, 30000), item('배달 혜택', 1500, 3000)])).toEqual([
			{ kind: 'spend', text: '실적 50%' }
		]);
	});

	it('보너스 혜택 줄이 있으면 보너스 배지를 함께 보여 준다', () => {
		expect(cardBadges([item('실적', 150000, 150000), item('보너스 혜택', 1500, 3000)])).toEqual([
			{ kind: 'done', text: '실적 달성' },
			{ kind: 'bonus', text: '보너스 50%' }
		]);
		expect(cardBadges([item('실적', 0, 150000), item('보너스 혜택', 3000, 3000)])).toEqual([
			{ kind: 'spend', text: '실적 0%' },
			{ kind: 'done', text: '보너스 달성' }
		]);
	});

	it('실적 금액 줄도 보너스 혜택 줄도 없으면 배지 없음', () => {
		expect(cardBadges([item('카페 건', 1, 4)])).toEqual([]);
		expect(cardBadges([])).toEqual([]);
	});
});
