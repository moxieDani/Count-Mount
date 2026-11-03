// 붙여넣은 텍스트나 OCR 텍스트에서 카드 결제 후보들을 뽑아 파싱한다.
// 1) OCR 오인식 보정  2) 화면 UI 줄 제거  3) 메시지 단위로 나누기  4) 각각 파싱  5) 같은 결제 합치기
import { parse, type CardAlert } from './parser';
import { mergeDuplicates } from './dedupe';

export type AlertSource = '토스' | '카드 문자' | '카드사 알림';

export interface PaymentCandidate {
	text: string;
	parsed: CardAlert;
	sources: AlertSource[];
}

// OCR 단계에서 줄 사이가 크게 벌어진 곳(다른 말풍선·알림)에 넣는 구분 표시
export const GAP_MARK = '␞';

// "[Web발신]" 이 OCR에서 "[\/66발신]", "[4/66발신]", "[Webgtal]" 처럼 깨진다
const RE_HEADER = /^\s*\[[^\]\n]{0,10}?(?:발신|Web|eb|66|gtal)[^\]\n]{0,6}\]?\s*/i;

// 메시지가 아닌 화면 요소: 버리기만 한다
const UI_LINES = [
	/^\s*(?:오전|오후)?\s?\d{1,2}:\d{2}\s{2,}/, // 상태바 "9:41      5G 87%"
	/\d{1,3}%\s*$/, // 배터리
	/^\s*\d{1,2}:\d{2}\s*$/, // 잠금화면 큰 시계
	/^\s*[<‹]\s/, // 내비 "< 1588-8100"
	/[>›]\s*$/, // 내비 "15881688 >"
	/문자\s?메시지|iMessage/,
	/^\s*\+\s*[|(]?\s*$/, // 입력창 + 버튼
	/^\s*메시지\s*$/, // 알림 머리줄의 앱 이름
	/^\s*(?:승인|사용|결제|이용)\s?(?:내역|알림|안내)\s*$/, // 알림 제목 "승인내역"
	/^[^가-힣A-Za-z0-9]*$/ // 자모·기호뿐인 OCR 잡음 "= ㅠㅜ"
];

// 메시지 사이의 구분선: 여기서 메시지를 끊는다
const BOUNDARIES = [
	/^\s*(?:오늘|어제|그저께|\d{1,2}월\s?\d{1,2}일|20\d{2}년)/, // "오늘 오후 1:14", "8월 19일 (화)", 잠금화면 날짜
	/^\s*(?:오전|오후)\s?\d{1,2}:?\d{2}\s*$/, // 말풍선 옆·아래 시각
	/알림톡\s?도착/,
	new RegExp(`^\\s*${GAP_MARK}\\s*$`)
];

// 은행 입출금 알림은 카드 결제가 아니므로 후보에서 뺀다.
// 제목 "OO뱅킹 입출금알림" 이 보이면 그 알림 전체를, 본문에 "[출금]"·"[입금]"·"…계좌" 가 있으면 그 덩어리를 버린다.
const RE_BANK_TITLE = /입출금\s?알림|뱅킹\s/;
const RE_BANK_BODY = /\[\s*(?:출금|입금|이체|송금)\s*\]|[\d*]{3,}[-\d*\s]*계좌/;

// 결제 실패 알림은 금액이 있어도 실제 지출이 아니므로 기록 후보에서 제외한다.
const RE_FAILED_PAYMENT = /결제\s*(?:실패|거절)|결제되지\s*않|승인\s*(?:실패|거절)|승인되지\s*않|payment\s+failed|card\s+(?:was\s+)?declined/i;

// 알림 제목 줄 끝의 "지금", "3분 전"
const RE_NOTI_TITLE = /^(.*?)\s+(?:지금|\d+\s?분\s?전|\d+\s?시간\s?전)\s*$/gm;

const RE_AMOUNT_LINE = /\d\s?원/;
const RE_DATETIME_LINE = /\d{1,2}\/\d{1,2}\s+\d{1,2}:\d{2}/;

// 토스 결제 알림: 제목 "12,300원 결제", 본문 "비씨체크 | 테스트식당(일시불)"
const RE_TOSS_TITLE = /(\d\s?원)\s*결제\s*$/;
const RE_TOSS_SEP = /\s+[|Il]\s+/;

export function normalizeOcr(text: string): string {
	return (
		text
			.replace(/\r/g, '')
			// 알림 제목 끝의 시각은 새 알림의 시작: 구분 표시로 바꾸고 떼어낸다
			.replace(RE_NOTI_TITLE, `${GAP_MARK}\n$1`)
			.replace(/ /g, ' ')
			// "KB국민카드" 의 KB 가 "<8", "1<8" 로 읽힘
			.replace(/[^\s가-힣]{1,3}(?=국민카드)/g, 'KB')
			// 금액 뒤 '원'을 숫자로 읽음: "12,3009 결제" → "12,300원 결제"
			.replace(/(\d{1,3}(?:,\d{3})+)\d(?=\s|$)/gm, '$1원')
			// 원화 금액의 쉼표가 빠지거나 점으로 읽힘: "1329,900원", "65.000원" → 숫자만
			.replace(/(\d[\d,.]*\d)(?=\s?원)/g, (m) => m.replace(/[,.]/g, ''))
	);
}

interface Chunk {
	lines: string[];
	bank: boolean;
	sms: boolean;
}

function splitMessages(text: string): Chunk[] {
	const chunks: Chunk[] = [];
	let cur: string[] = [];
	let bank = false;
	let sms = false;
	const flush = () => {
		if (cur.length) chunks.push({ lines: cur, bank, sms });
		cur = [];
		bank = false;
		sms = false;
	};
	for (const line of text.split('\n')) {
		if (!line.trim()) continue;
		if (BOUNDARIES.some((re) => re.test(line))) {
			flush();
			continue;
		}
		if (RE_BANK_TITLE.test(line)) {
			flush();
			bank = true;
			continue;
		}
		if (UI_LINES.some((re) => re.test(line))) continue;
		const h = RE_HEADER.exec(line);
		if (h) {
			flush();
			sms = true;
			const rest = line.slice(h[0].length).trim();
			if (rest) cur.push(rest);
			continue;
		}
		cur.push(line.trim());
	}
	flush();
	return chunks;
}

// 한 줄짜리 문자가 말풍선 폭 때문에 여러 줄로 접힌 경우 다시 한 줄로 붙인다.
// 금액과 일시가 같은 줄에 있으면 한 줄 형식으로 본다.
function joinIfOneLine(lines: string[]): string {
	const oneLine = lines.some((l) => RE_AMOUNT_LINE.test(l) && RE_DATETIME_LINE.test(l));
	if (!oneLine) return lines.join('\n');
	return lines.reduce((acc, l) => (/[가-힣]$/.test(acc) && /^[가-힣]/.test(l) ? acc + l : `${acc} ${l}`));
}

// 토스 알림이면 "12,300원" / "비씨체크" / "테스트식당(일시불)" 줄로 바꿔 카드 문자 파서가 읽게 한다
function tossLines(lines: string[]): string[] | null {
	if (!lines.some((l) => RE_TOSS_TITLE.test(l)) || !lines.some((l) => RE_TOSS_SEP.test(l))) return null;
	return lines.flatMap((l) => l.replace(RE_TOSS_TITLE, '$1').split(RE_TOSS_SEP));
}

export function extractPayments(text: string): PaymentCandidate[] {
	const messages = splitMessages(normalizeOcr(text))
		.filter((c) => !c.bank && !RE_FAILED_PAYMENT.test(c.lines.join('\n')))
		.map(({ lines, sms }) => {
			const toss = tossLines(lines);
			const chunk = toss ? toss.join('\n') : joinIfOneLine(lines);
			const parsed = parse(chunk);
			if (parsed.merchant) parsed.merchant = parsed.merchant.replace(/\s+/g, ' ');
			const source: AlertSource = toss ? '토스' : sms ? '카드 문자' : '카드사 알림';
			return { text: chunk, parsed, sources: [source] };
		})
		.filter((m) => !RE_BANK_BODY.test(m.text))
		.filter((m) => m.parsed.amount != null || m.parsed.foreign != null);
	return mergeDuplicates(messages);
}

// 후보가 확실한지: 금액·일시가 있고, 가맹점이 한글 2글자 이상이거나 영문 3글자 이상 연속이어야 한다.
// 확실한 후보가 하나도 없으면 다른 전처리로 다시 읽는다.
export function isConfident(m: PaymentCandidate): boolean {
	const p = m.parsed;
	if (p.amount == null && p.foreign == null) return false;
	if (!p.datetime) return false;
	const name = p.merchant ?? '';
	return (name.match(/[가-힣]/g) ?? []).length >= 2 || /[A-Za-z]{3,}/.test(name);
}
