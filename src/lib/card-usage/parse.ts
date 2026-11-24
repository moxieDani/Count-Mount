// 카드사용내역 월 시트의 J1:L102 (실적 표: J 항목, K 사용, L 기준) 를 카드별로 묶는다 (2026-11-24).
// 시트 모양: 카드 이름 줄은 K·L 에 "사용"·"기준" 머리글, 그 아래 [항목 이름, 사용, 기준] 줄들.
// 사용·기준은 시트가 계산해 두므로 여기서는 읽기만 하고, 게이지 비율과 색만 정한다.

// 배지와 게이지가 같은 색을 쓴다
export type Tone = 'spend' | 'limit' | 'bonus' | 'done';

export interface CardItem {
	label: string; // 시트에 적힌 항목 이름 그대로
	name: string; // 괄호 앞 이름 ("온라인쇼핑 건")
	note: string; // 괄호 안 가게 목록 ("가게1, 가게2"), 없으면 ''
	text: string; // 사용 칸에 보이는 값 그대로 (숫자가 아닐 때 보여 준다)
	used: number | null; // 숫자로 읽을 수 없으면 null
	total: number | null;
	unit: '원' | '건';
	ratio: number | null; // 게이지 채움 0~1. 사용·기준 중 하나라도 숫자가 아니면 null (게이지 없음)
	tone: Tone | null; // 게이지 색. 다 채우면 done, 그 밖에는 항목 종류 색, 기타 건수는 null
}

export interface CardBadge {
	kind: Tone;
	text: string;
}

export interface CardBlock {
	name: string;
	items: CardItem[];
	badges: CardBadge[]; // 실적·보너스 배지. 해당 항목이 없으면 빈 배열
}

const cell = (v: unknown) => (v == null ? '' : String(v).trim());

function toNumber(text: string): number | null {
	if (!/\d/.test(text) || /[^\d,.\s₩원건+-]/.test(text)) return null;
	const n = Number(text.replace(/[^\d.-]/g, ''));
	return Number.isFinite(n) ? n : null;
}

// "온라인쇼핑 건(가게1, 가게2)" → 이름 "온라인쇼핑 건", 가게 목록 "가게1, 가게2"
function splitLabel(label: string) {
	const m = label.match(/^(.*?)\s*\(([^()]*)\)\s*$/);
	return m ? { name: m[1], note: m[2].trim() } : { name: label, note: '' };
}

// 항목 종류 (이름으로 정한다)
// 실적 금액: "실적", "배달 실적"   혜택: "실적혜택", "배달 혜택"   보너스: "보너스 혜택", "보너스 결제 건"
type Kind = 'spend' | 'limit' | 'bonus' | 'count';
const isBonus = (name: string) => /보너스/.test(name);
function kindOf(name: string, unit: CardItem['unit']): Kind {
	if (isBonus(name)) return 'bonus';
	if (unit === '건') return 'count';
	if (/혜택|한도/.test(name)) return 'limit';
	return /실적/.test(name) ? 'spend' : 'count';
}
const isBonusLimit = (i: CardItem) => isBonus(i.name) && /혜택|한도/.test(i.name);
const isFull = (i: CardItem) => i.ratio !== null && i.ratio >= 1;

function toItem(label: string, usedCell: unknown, totalCell: unknown): CardItem & { kind: Kind } {
	const { name, note } = splitLabel(label);
	const text = cell(usedCell);
	const used = typeof usedCell === 'number' ? usedCell : toNumber(text);
	const total = typeof totalCell === 'number' ? totalCell : toNumber(cell(totalCell));
	const unit: CardItem['unit'] = /건$/.test(name) ? '건' : '원';
	const ratio = used === null || total === null ? null : total <= 0 ? 1 : Math.min(1, Math.max(0, used / total));
	const kind = kindOf(name, unit);
	const tone: Tone | null = ratio === 1 ? 'done' : kind === 'count' ? null : kind;
	return { label, name, note, text, used, total, unit, ratio, tone, kind };
}

// 혜택 한도를 다 채우면 그 혜택을 받는 건수 줄도 더 채울 필요가 없다 (예전 시트의 "한도 0 이면 남은 건수 0" 과 같다).
// 보너스 건수는 보너스 혜택을, 그 밖의 건수는 기본 혜택(들)을 따른다.
function settleCounts(items: (CardItem & { kind: Kind })[]): CardItem[] {
	const limits = items.filter((i) => i.kind === 'limit');
	const bonusLimits = items.filter(isBonusLimit);
	const limitFull = limits.length > 0 && limits.every(isFull);
	const bonusFull = bonusLimits.length > 0 && bonusLimits.every(isFull);
	return items.map(({ kind, ...item }) => {
		const followsFull = item.unit === '건' && (kind === 'bonus' ? bonusFull : kind === 'count' && limitFull);
		return followsFull ? { ...item, tone: 'done' } : item;
	});
}

const percent = (i: CardItem) => `${Math.floor((i.ratio ?? 0) * 100)}%`;

// 카드 이름 옆 배지: 실적(실적 줄, 없으면 첫 실적 금액 줄)과 보너스 혜택. 다 채우면 "달성".
export function cardBadges(items: CardItem[]): CardBadge[] {
	const gauged = items.filter((i) => i.ratio !== null);
	const spend =
		gauged.find((i) => i.name.replace(/\s+/g, '') === '실적') ??
		gauged.find((i) => i.unit === '원' && kindOf(i.name, i.unit) === 'spend');
	const bonus = gauged.find(isBonusLimit);
	const badges: CardBadge[] = [];
	if (spend) badges.push(isFull(spend) ? { kind: 'done', text: '실적 달성' } : { kind: 'spend', text: `실적 ${percent(spend)}` });
	if (bonus) badges.push(isFull(bonus) ? { kind: 'done', text: '보너스 달성' } : { kind: 'bonus', text: `보너스 ${percent(bonus)}` });
	return badges;
}

// 카드 이름 줄: 사용 칸이 "사용" 머리글이거나 비어 있다
const isHeader = (usedCell: string) => usedCell === '' || usedCell === '사용';

export function parseCardUsage(rows: unknown[][]): CardBlock[] {
	const cards: { name: string; items: (CardItem & { kind: Kind })[] }[] = [];
	for (const row of rows) {
		const label = cell(row?.[0]);
		if (!label) continue;
		if (isHeader(cell(row?.[1]))) {
			cards.push({ name: label, items: [] });
			continue;
		}
		if (!cards.length) cards.push({ name: '', items: [] });
		cards[cards.length - 1].items.push(toItem(label, row?.[1], row?.[2]));
	}
	return cards
		.filter((c) => c.items.length)
		.map((c) => {
			const items = settleCounts(c.items);
			return { name: c.name, items, badges: cardBadges(items) };
		});
}
