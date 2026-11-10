import { describe, expect, it } from 'vitest';
import { cardBadges, parseCardUsage } from './parse';

// 카드사용내역 월 시트의 I1:J102 를 Sheets API 로 읽은 모양.
// 카드 이름 줄은 I:J 가 병합돼 J 값이 없다. 카드 이름·값은 가짜.
const ROWS = [
	[],
	['테스트카드A'],
	['채울 실적금액', '270,000'],
	['테스트 체크카드B'],
	['채울 실적금액', '0'],
	['남은 실적혜택 한도', '7,000'],
	['남은 온라인쇼핑 결제 건(테스트몰, 다른몰)', '3'],
	['남은 편의점(가게1, 가게2) 결제 건', '2'],
	['', ''],
	['테스트카드C'],
	['남은 배달 실적 결제금액', '40000'],
	['남은 배달 실적혜택 한도', '4000']
];

describe('parseCardUsage', () => {
	const cards = parseCardUsage(ROWS);

	it('J 가 빈 줄은 카드 이름, 아래 줄들은 그 카드의 항목', () => {
		expect(cards.map((c) => [c.name, c.items.length])).toEqual([
			['테스트카드A', 1],
			['테스트 체크카드B', 4],
			['테스트카드C', 2]
		]);
	});

	it('값은 숫자로 읽고, 항목 이름이 "건"으로 끝나면(괄호 제외) 건, 아니면 원', () => {
		expect(cards[1].items.map((i) => [i.value, i.unit])).toEqual([
			[0, '원'],
			[7000, '원'],
			[3, '건'],
			[2, '건']
		]);
	});

	it('카드마다 배지를 만든다: 실적 금액·기본 한도·보너스 한도를 각각 합쳐서', () => {
		const text = (rows: unknown[][]) => parseCardUsage(rows).map((c) => c.badges.map((b) => b.text));
		expect(text(ROWS)).toEqual([['실적까지 270,000원'], ['한도 7,000원 남음'], ['실적까지 40,000원']]);
		expect(
			text([
				['테스트 체크카드B'],
				['채울 실적금액', '0'],
				['남은 실적혜택 한도', '0'],
				['남은 보너스 실적혜택 한도', '1,500'],
				['남은 영화 결제 건(가게1)', '1'] // 남은 건수는 배지와 무관
			])
		).toEqual([['실적 달성', '보너스 한도 1,500원 남음']]);
		expect(
			text([['테스트카드C'], ['채울 실적금액', '0'], ['남은 실적혜택 한도', '3,000'], ['남은 배달 실적혜택 한도', '1,500']])
		).toEqual([['한도 4,500원 남음']]);
	});

	it('항목 줄 색: 남은 기본 실적은 주황, 남은 보너스(한도·건수)는 연보라, 0 이면 무엇이든 완료(초록)', () => {
		const [card] = parseCardUsage([
			['테스트 체크카드B'],
			['채울 실적금액', '0'],
			['남은 실적혜택 한도', '7,000'],
			['남은 보너스 실적혜택 한도', '1,500'],
			['남은 보너스 결제(페이1) 건', '0'],
			['남은 보너스 결제(페이2) 건', '1'],
			['남은 영화 결제 건(가게1)', '2'],
			['메모', '확인 필요']
		]);
		expect(card.items.map((i) => i.tone)).toEqual(['done', 'limit', 'bonus', 'done', 'bonus', null, null]);
		const [later] = parseCardUsage([['테스트카드A'], ['채울 실적금액', '1,000'], ['남은 보너스 실적혜택 한도', '0']]);
		expect(later.items.map((i) => i.tone)).toEqual(['spend', 'done']);
	});

	it('실적 금액도 실적 한도도 없으면 배지 없음', () => {
		const [card] = parseCardUsage([['테스트카드D'], ['남은 카페 결제 건', '4']]);
		expect(card.badges).toEqual([]);
	});

	it('숫자가 아닌 값은 글자 그대로 두고, 항목 없는 제목 줄은 버린다', () => {
		const got = parseCardUsage([['11월 카드 실적'], ['테스트카드E'], ['채울 실적금액', '₩-4,200'], ['메모', '확인 필요']]);
		expect(got).toHaveLength(1);
		expect(got[0].items.map((i) => [i.value, i.text])).toEqual([
			[-4200, '₩-4,200'],
			[null, '확인 필요']
		]);
	});

	it('Sheets API 가 숫자로 줘도 읽는다', () => {
		const [card] = parseCardUsage([['테스트카드F'], ['채울 실적금액', 120000]]);
		expect(card.items[0]).toMatchObject({ value: 120000, unit: '원' });
	});
});

describe('cardBadges', () => {
	const st = (spend: number | null, limit: number | null, bonus: number | null) => ({ spend, limit, bonus });
	const DONE = { kind: 'done', text: '실적 달성' };
	const BONUS_DONE = { kind: 'done', text: '보너스 달성' }; // 완료는 모두 같은 색

	it('기본 실적 배지: 실적 금액 → 기본 한도 → 달성 순으로 보여 준다', () => {
		expect(cardBadges(null)).toEqual([]);
		expect(cardBadges(st(120000, 7000, null))).toEqual([{ kind: 'spend', text: '실적까지 120,000원' }]);
		expect(cardBadges(st(0, 4000, null))).toEqual([{ kind: 'limit', text: '한도 4,000원 남음' }]);
		expect(cardBadges(st(0, null, null))).toEqual([DONE]);
		expect(cardBadges(st(0, 0, null))).toEqual([DONE]);
	});

	it('보너스 한도가 있는 카드는 보너스 배지를 항상 함께 보여 준다', () => {
		const bonusLeft = { kind: 'bonus', text: '보너스 한도 1,500원 남음' };
		expect(cardBadges(st(120000, 7000, 1500))).toEqual([{ kind: 'spend', text: '실적까지 120,000원' }, bonusLeft]);
		expect(cardBadges(st(0, 7000, 1500))).toEqual([{ kind: 'limit', text: '한도 7,000원 남음' }, bonusLeft]);
		expect(cardBadges(st(0, 0, 1500))).toEqual([DONE, bonusLeft]);
		expect(cardBadges(st(0, 0, 0))).toEqual([DONE, BONUS_DONE]);
		expect(cardBadges(st(120000, 0, 0))).toEqual([{ kind: 'spend', text: '실적까지 120,000원' }, BONUS_DONE]);
	});
});
