// 카드 승인 문자/알림 파서. card_sms_parser.py(v2)를 옮긴 것으로, 필드 이름도 원본과 같게 둔다.
// 필드별 정규식으로 찾고 지운 뒤 남은 줄을 가맹점으로 보는 소거법.
//
// 지원 배치
//   A. 머리말형  : [카드사+끝자리+승인] → 이름 → 금액 할부 → 일시 → 가맹점 → 누적 (한 줄로 뭉쳐 와도 동작)
//   B. 롯데형    : 가맹점 → 금액 승인 → 이름 카드명 끝자리 → 할부 일시 → 누적
//   C. 괄호머리형: [일시불.승인(0157)]일시 → 금액 / 누적 → 가맹점 (우리카드)
//
// 원본과 다른 점
//   - JS의 \w, \W 는 한글을 글자로 보지 않으므로 \p{L}\p{N} + u 플래그로 바꿈
//   - 우리카드 앱 알림 "[일시불체크.승인(1234)]" 처럼 할부 뒤 '체크'가 붙는 형태를 받고, C형의 카드사는 '우리'로 둠
//   - 토스 알림의 카드명 "비씨체크" 처럼 '체크'가 붙으면 체크카드로 봄

export interface CardAlert {
	card: string | null;
	card_suffix: string | null;
	name: string | null;
	amount: number | null;
	foreign: string | null;
	installment: string | null;
	months: number | null;
	datetime: string | null; // "MM/DD HH:MM" (연도 없음)
	merchant: string | null;
	cancel: boolean;
	is_check: boolean;
	overseas: boolean;
	layout: 'A' | 'B' | 'C' | null;
}

const ISSUERS = 'KB국민|국민|롯데|삼성|우리|현대|신한|하나|NH농협|농협|씨티|IBK|BC|비씨';
const CURRENCY = 'USD|EUR|JPY|CNY|GBP|HKD|SGD|AUD|CAD|CHF|VND|THB|PHP|TWD';

const RE_NOISE = /\[(?:Web발신|웹발신|국제발신|국외발신)\]|[⁦-⁩\r]/g;
const RE_PHONE = /^\s*1[0-9]{3}-?[0-9]{4}\s*$/gm;
const RE_DECOR = /^\s*[-•·]\s+/gm;
const RE_DATETIME = /(?<!\d)(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?!\d)/;
const RE_OLDHEAD = /\[(일시불|\d{1,2}개월|체크|할부\d*)(체크)?\.(승인|취소)\(([\d*]{4})\)\]/;
const RE_TOTAL = /(?:누적(?:금액)?|잔액|잔여한도|출금가능액)\s*[:\-]?\s*-?[\d,]+\s?원?\.?/g;
const RE_FOREIGN = new RegExp(`(${CURRENCY})\\s?([\\d,]+(?:\\.\\d+)?)`);
const RE_AMOUNT = /(-?)(\d{1,3}(?:,\d{3})+|\d+)\s?원/;
const RE_LOTTE = /(-?)(\d{1,3}(?:,\d{3})+|\d+)원[ \t]*(승인취소|승인|취소)[ \t]*$/m;
const RE_INSTALL = /\(?(일시불|무이자\s*\d{1,2}개월|할부\s*\d{1,2}(?:개월)?|\d{1,2}개월(?:할부)?)\)?,?/;
const RE_HEAD = /^(?<head>[^\n]*?)(?<kind>해외승인|체크승인|승인취소|부분취소|승인|취소)/m;
const RE_SUFFIX = /\(([\d*]{4})\)|([\d*]{4})(?=\s*(?:체크|해외)?(?:승인|취소))|(?<=[가-힣A-Za-z])\s?([\d*]{4})\s*$|승인(\d{4})/;
const RE_NAME = /(?:고객명\s*)?([가-힣*]{2,4})\s?님|(?<![\p{L}\p{N}_*])([가-힣]{1,2}\*[가-힣*]{0,2}|\*{2,3})(?![\p{L}\p{N}_*])/u;
const RE_LABELS = /^[ \t]*(?:승인시각|승인일시|이용일시|가맹점명?|이용처|고객명)(?:[ \t]*:[ \t]*|[ \t]+)(?=\S)/gm;
const RE_JUNK = /^.*(?:채널 추가|카카오톡으로 받기|이용\s?안내).*$/gm;
const RE_TAIL = /\s+(?:사용|승인|취소)$/;
const RE_ISSUER = new RegExp(`([가-힣]{2,4})BC|${ISSUERS}`);
const RE_HEADLESS_CARD = new RegExp(
	`^\\s*(?:[가-힣]{2,4}BC|${ISSUERS})(?:카드|체크|법인|가족(?:카드)?)?[A-Za-z]*(?:[ ]?\\(?[\\d*]{2,4}\\)?)?`,
	'm'
);
const RE_JUNK_LINE = /^(?:[^\p{L}\p{N}]+|체크|승인|취소)$/u;
const ISSUER_ALIAS: Record<string, string> = { 국민: 'KB국민', 비씨: 'BC', 농협: 'NH농협' };

function issuer(s: string | null | undefined): string | null {
	const m = RE_ISSUER.exec(s ?? '');
	if (!m) return null;
	if (m[1]) return `BC(${m[1]})`;
	return ISSUER_ALIAS[m[0]] ?? m[0];
}

const cut = (s: string, m: RegExpExecArray) => s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);

function stripChars(s: string, chars: string) {
	let a = 0;
	let b = s.length;
	while (a < b && chars.includes(s[a])) a++;
	while (b > a && chars.includes(s[b - 1])) b--;
	return s.slice(a, b);
}

function months(s: string | null): number | null {
	if (!s) return null;
	if (s === '일시불') return 0;
	const d = /\d+/.exec(s);
	return d ? parseInt(d[0], 10) : null;
}

export function parse(text: string): CardAlert {
	let t = text.replace(RE_NOISE, '').replace(/　/g, ' ');
	t = t.replace(RE_PHONE, '');
	t = t.replace(RE_DECOR, '');
	const r: CardAlert = {
		card: null, card_suffix: null, name: null, amount: null, foreign: null,
		installment: null, months: null, datetime: null, merchant: null,
		cancel: false, is_check: false, overseas: false, layout: null
	};
	let m: RegExpExecArray | null;

	// 일시
	if ((m = RE_DATETIME.exec(t))) {
		const p = (v: string) => String(parseInt(v, 10)).padStart(2, '0');
		r.datetime = `${p(m[1])}/${p(m[2])} ${p(m[3])}:${m[4]}`;
		t = cut(t, m);
	}

	// C. 괄호머리형 [일시불.승인(0157)], [일시불체크.승인(1234)]
	if ((m = RE_OLDHEAD.exec(t))) {
		r.layout = 'C';
		r.card = '우리';
		r.installment = m[1];
		r.is_check = m[1] === '체크' || m[2] === '체크';
		r.cancel = m[3] === '취소';
		r.card_suffix = m[4];
		t = cut(t, m);
	}

	t = t.replace(RE_TOTAL, ' ');
	t = t.replace(/\s*\/\s*$/gm, ''); // "5,080원 / " 꼬리

	// B. 롯데형: "금액원 승인" 이 한 줄
	const lotte = RE_LOTTE.exec(t);
	if (lotte && r.layout === null) {
		r.layout = 'B';
		r.amount = parseInt(lotte[2].replace(/,/g, ''), 10);
		r.cancel = lotte[3].includes('취소');
		const before = t.slice(0, lotte.index);
		let after = t.slice(lotte.index + lotte[0].length);
		const merchantLines = before.split('\n').map((l) => l.trim()).filter(Boolean);
		r.merchant = merchantLines.length ? merchantLines[merchantLines.length - 1] : null;
		// "심*현 롯데8*7*" / "김*준 디지로카 런던 6*7*"
		const n = /^\s*([가-힣]{1,2}\*[가-힣*]{0,2})\s+(.+?)\s*([\d*]{4})\s*$/m.exec(after);
		if (n) {
			r.name = n[1];
			r.card_suffix = n[3];
			r.card = n[2].includes('롯데') || issuer(n[2]) === null ? '롯데' : issuer(n[2]);
			after = cut(after, n);
		} else {
			r.card = '롯데';
		}
		const i = RE_INSTALL.exec(after);
		if (i) r.installment = i[1].replace(/\s/g, '');
		r.months = months(r.installment);
		return r;
	}

	// 해외(외화) 금액
	if ((m = RE_FOREIGN.exec(t))) {
		r.foreign = `${m[1]} ${m[2]}`;
		r.overseas = true;
		t = cut(t, m);
	}

	// 금액
	if ((m = RE_AMOUNT.exec(t))) {
		r.amount = parseInt(m[2].replace(/,/g, ''), 10);
		if (m[1] === '-') r.cancel = true;
		t = cut(t, m);
	}

	// 할부
	if (r.installment === null && (m = RE_INSTALL.exec(t))) {
		r.installment = m[1].replace(/\s/g, '');
		t = cut(t, m);
	}
	r.months = months(r.installment);

	// A. 머리말형: 첫 '승인/취소' 앞쪽이 카드명
	if (r.layout === null) {
		r.layout = 'A';
		if ((m = RE_HEAD.exec(t))) {
			const { head, kind } = m.groups!;
			r.cancel = r.cancel || kind.includes('취소');
			r.is_check = kind.includes('체크') || head.includes('체크');
			r.overseas = r.overseas || kind.includes('해외');
			r.card = issuer(head);
			const s = RE_SUFFIX.exec(head + kind);
			if (s) r.card_suffix = s.slice(1).find((g) => g) ?? null;
			t = t.slice(0, m.index) + t.slice(m.index + m[0].length);
		}
		// 머리말에 카드사명이 없는 경우
		if (r.card === null && (m = RE_HEADLESS_CARD.exec(t))) {
			r.card = issuer(m[0]);
			r.is_check = r.is_check || m[0].includes('체크');
			const s = /([\d*]{4})/.exec(m[0]);
			if (s) r.card_suffix = r.card_suffix || s[1];
			t = cut(t, m);
		}
	}

	// 법인 "9427 김*환님"
	if (r.card_suffix === null && (m = /^\s*(\d{4})\s+(?=[가-힣*]{2,4}\s?님)/m.exec(t))) {
		r.card_suffix = m[1];
		t = cut(t, m);
	}

	// 이름
	t = t.replace(RE_LABELS, '');
	if ((m = RE_NAME.exec(t))) {
		r.name = m[1] || m[2];
		t = cut(t, m);
	}

	// 가맹점 = 남은 첫 줄
	t = t.replace(RE_JUNK, '');
	const lines = t
		.split('\n')
		.map((l) => stripChars(l, ' .,\t').replace(RE_TAIL, '').trim())
		.filter((l) => l && !RE_JUNK_LINE.test(l));
	r.merchant = lines.length ? lines[0] : null;
	return r;
}
