// 결제 후보 → 지출 추가 화면의 입력값(날짜·지출내용·금액·계정·결제방식·비고)
import { classifyMerchant } from './classify';
import type { CardAlert } from './parser';

export interface LedgerFields {
	date: string; // "YYYY. M. D", 알 수 없으면 ''
	merchant: string;
	amount: string;
	account: string;
	payment: string;
	note: string;
	warnings: string[];
}

interface Options {
	now?: Date;
	viewYear?: number;
	viewMonth?: number;
	paymentOptions?: string[];
	accountOptions?: string[];
}

const ISSUER_KEYWORDS: Record<string, string[]> = {
	KB국민: ['KB', '국민'],
	NH농협: ['NH', '농협'],
	BC: ['BC', '비씨'],
	'BC(농협)': ['농협', 'BC', '비씨'],
	'BC(씨티)': ['씨티', 'BC', '비씨']
};

// 시트의 결제방식 목록에서 고른다: 카드 끝자리가 들어간 항목 → 카드사 이름이 들어간 항목이 하나뿐일 때
function pickPayment(p: CardAlert, options: string[]): string {
	if (p.card_suffix && /^\d{4}$/.test(p.card_suffix)) {
		const bySuffix = options.filter((o) => o.includes(p.card_suffix!));
		if (bySuffix.length === 1) return bySuffix[0];
	}
	if (!p.card) return '';
	const keys = ISSUER_KEYWORDS[p.card] ?? [p.card];
	const byIssuer = options.filter((o) => keys.some((k) => o.includes(k)));
	return byIssuer.length === 1 ? byIssuer[0] : '';
}

export function toLedgerFields(p: CardAlert, opts: Options = {}): LedgerFields {
	const now = opts.now ?? new Date();
	const warnings: string[] = [];

	let date = '';
	if (p.datetime) {
		const [month, day] = p.datetime.split(' ')[0].split('/').map(Number);
		// 1월에 받은 12월 문자처럼, 문자 속 월이 지금보다 뒤면 작년 거래
		const year = month > now.getMonth() + 1 ? now.getFullYear() - 1 : now.getFullYear();
		date = `${year}. ${month}. ${day}`;
		if (opts.viewMonth && (month !== opts.viewMonth || (opts.viewYear && year !== opts.viewYear))) {
			warnings.push(`${month}월 결제입니다. 지금 보고 있는 ${opts.viewMonth}월 시트에 추가됩니다.`);
		}
	} else {
		warnings.push('결제 일시가 없어 날짜는 그대로 둡니다.');
	}

	let amount = p.amount != null ? String(p.amount) : '';
	let note = '';
	if (p.overseas && p.foreign) {
		amount = '';
		note = `해외 ${p.foreign}`;
		warnings.push('해외 결제입니다. 원화 금액을 직접 입력하세요.');
	}
	if (!p.merchant) warnings.push('가맹점을 찾지 못했습니다.');
	if (p.cancel) warnings.push('취소 알림입니다. 새 지출로 추가하지 마세요.');

	const category = classifyMerchant(p.merchant);
	const accountOptions = opts.accountOptions ?? [];
	const account = category && (!accountOptions.length || accountOptions.includes(category)) ? category : '';
	const payment = pickPayment(p, opts.paymentOptions ?? []);

	return { date, merchant: p.merchant ?? '', amount, account, payment, note, warnings };
}
