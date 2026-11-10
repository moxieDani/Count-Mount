// 카드사용내역 월 시트의 I1:J102 를 카드별로 묶는다.
// 시트 모양: I:J 병합 줄(J 값 없음) = 카드 이름, 그 아래 [항목 이름, 남은 값] 줄들.
// 남은 값은 시트가 이미 계산해 두므로(0 아래로 내려가지 않음) 여기서는 읽기만 한다.

// 배지와 항목 줄이 같은 색을 쓴다
export type Tone = 'spend' | 'limit' | 'bonus' | 'done';

export interface CardItem {
	label: string;
	text: string; // 시트에 보이는 값 그대로
	value: number | null; // 숫자로 읽을 수 없으면 null
	unit: '원' | '건';
	tone: Tone | null; // 줄 색. 0 이면 무엇이든 완료, 남은 실적 금액·한도·보너스는 배지 색, 그 밖에는 null
}

// 배지를 정하는 남은 값 합계. 그런 항목이 카드에 없으면 null
export interface CardStatus {
	spend: number | null; // 실적을 채우려면 더 써야 하는 금액
	limit: number | null; // 남은 기본 실적(혜택) 한도
	bonus: number | null; // 남은 보너스 실적(혜택) 한도
}

export interface CardBadge {
	kind: Tone;
	text: string;
}

export interface CardBlock {
	name: string;
	items: CardItem[];
	badges: CardBadge[]; // 기본 실적·보너스 실적 배지. 실적 금액·실적 한도 항목이 없으면 빈 배열
}

const cell = (v: unknown) => (v == null ? '' : String(v).trim());

function toNumber(text: string): number | null {
	if (!/\d/.test(text) || /[^\d,.\s₩원+-]/.test(text)) return null;
	const n = Number(text.replace(/[^\d.-]/g, ''));
	return Number.isFinite(n) ? n : null;
}

// "남은 영화 결제 건(극장1, ...)" 처럼 괄호 설명을 빼고 "건"으로 끝나면 건수
const unitOf = (label: string): CardItem['unit'] =>
	/건$/.test(label.replace(/\([^)]*\)/g, '').trim()) ? '건' : '원';

// 실적 금액: "채울 실적금액", "남은 배달 실적 결제금액"
// 기본 한도: "남은 실적혜택 한도", "남은 배달 실적혜택 한도"
// 보너스 한도: "남은 보너스 실적혜택 한도"
type Role = 'spend' | 'limit' | 'bonus';
const isBonus = (label: string) => /보너스/.test(label);
function roleOf(label: string): Role | null {
	if (!/실적/.test(label)) return null;
	if (/한도/.test(label)) return isBonus(label) ? 'bonus' : 'limit';
	return /금액/.test(label) ? 'spend' : null;
}

// 남은 값이 0 이면 무엇이든 완료(같은 색). 남아 있으면 기본 실적은 주황, 보너스(한도·건수)는 연보라,
// 그 밖의 남은 건수는 색 없음
function toneOf(label: string, value: number | null): Tone | null {
	if (value === null) return null;
	if (value <= 0) return 'done';
	return isBonus(label) ? 'bonus' : roleOf(label);
}

function statusOf(items: CardItem[]): CardStatus | null {
	const roles = items.map((i) => roleOf(i.label));
	const sum = (role: Role) => {
		const values = items.filter((_, k) => roles[k] === role).map((i) => Math.max(0, i.value ?? 0));
		return values.length ? values.reduce((a, b) => a + b, 0) : null;
	};
	const status = { spend: sum('spend'), limit: sum('limit'), bonus: sum('bonus') };
	return status.spend === null && status.limit === null && status.bonus === null ? null : status;
}

const won = (n: number) => `${n.toLocaleString('ko-KR')}원`;

// 카드 이름 옆 배지 2개: 기본 실적(실적 금액 → 기본 한도 → 달성)과 보너스 실적. 해당 항목이 있는 것만.
export function cardBadges(status: CardStatus | null): CardBadge[] {
	if (!status) return [];
	const badges: CardBadge[] = [];
	if (status.spend !== null || status.limit !== null) {
		if ((status.spend ?? 0) > 0) badges.push({ kind: 'spend', text: `실적까지 ${won(status.spend!)}` });
		else if ((status.limit ?? 0) > 0) badges.push({ kind: 'limit', text: `한도 ${won(status.limit!)} 남음` });
		else badges.push({ kind: 'done', text: '실적 달성' });
	}
	if (status.bonus !== null)
		badges.push(
			status.bonus > 0
				? { kind: 'bonus', text: `보너스 한도 ${won(status.bonus)} 남음` }
				: { kind: 'done', text: '보너스 달성' }
		);
	return badges;
}

export function parseCardUsage(rows: unknown[][]): CardBlock[] {
	const cards: CardBlock[] = [];
	for (const row of rows) {
		const label = cell(row?.[0]);
		const text = cell(row?.[1]);
		if (!label) continue;
		if (!text) {
			cards.push({ name: label, items: [], badges: [] });
			continue;
		}
		if (!cards.length) cards.push({ name: '', items: [], badges: [] });
		const value = toNumber(text);
		cards[cards.length - 1].items.push({ label, text, value, unit: unitOf(label), tone: toneOf(label, value) });
	}
	return cards.filter((c) => c.items.length).map((c) => ({ ...c, badges: cardBadges(statusOf(c.items)) }));
}
