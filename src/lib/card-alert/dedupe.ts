// 같은 결제를 알린 여러 알림(토스 + 카드사 앱 등)을 하나로 합친다.
// 같은 결제: 금액 같음, 승인/취소 같음, 일시가 둘 다 있으면 같음, 가맹점이 비슷함.
import type { CardAlert } from './parser';
import type { PaymentCandidate } from './extract';

const norm = (s: string | null) => (s ?? '').replace(/\([^)]*\)/g, '').replace(/[\s.,·]/g, '');

function editDistance(a: string, b: string): number {
	const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
	for (let j = 1; j <= b.length; j++) dp[0][j] = j;
	for (let i = 1; i <= a.length; i++)
		for (let j = 1; j <= b.length; j++)
			dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
	return dp[a.length][b.length];
}

function similarMerchant(a: string | null, b: string | null): boolean {
	const x = norm(a);
	const y = norm(b);
	if (!x || !y) return false;
	if (x.includes(y) || y.includes(x)) return true;
	return 1 - editDistance(x, y) / Math.max(x.length, y.length) >= 0.6; // OCR 오타 정도는 허용
}

export function samePayment(a: PaymentCandidate, b: PaymentCandidate): boolean {
	const p = a.parsed;
	const q = b.parsed;
	if ((p.amount ?? p.foreign) !== (q.amount ?? q.foreign)) return false;
	if (p.cancel !== q.cancel) return false;
	if (p.datetime && q.datetime && p.datetime !== q.datetime) return false;
	return similarMerchant(p.merchant, q.merchant);
}

// 정보가 많은 쪽(카드 끝자리·일시 우선)을 기준으로, 빈 항목은 다른 쪽에서 채운다
const score = (m: PaymentCandidate) =>
	Object.values(m.parsed).filter((v) => v != null && v !== false).length +
	(m.parsed.card_suffix ? 3 : 0) +
	(m.parsed.datetime ? 3 : 0);

function merge(group: PaymentCandidate[]): PaymentCandidate {
	const [base, ...rest] = [...group].sort((a, b) => score(b) - score(a));
	const parsed: CardAlert = { ...base.parsed };
	const filled = parsed as unknown as Record<string, unknown>;
	for (const m of rest)
		for (const [k, v] of Object.entries(m.parsed)) if (filled[k] == null && v != null) filled[k] = v;
	parsed.is_check = group.some((m) => m.parsed.is_check);
	return {
		text: group.map((m) => m.text).join('\n---\n'),
		parsed,
		sources: [...new Set(group.flatMap((m) => m.sources))]
	};
}

export function mergeDuplicates(messages: PaymentCandidate[]): PaymentCandidate[] {
	const groups: PaymentCandidate[][] = [];
	for (const m of messages) {
		const g = groups.find((grp) => grp.some((x) => samePayment(x, m)));
		if (g) g.push(m);
		else groups.push([m]);
	}
	return groups.map((g) => (g.length === 1 ? g[0] : merge(g)));
}
