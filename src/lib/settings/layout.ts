/**
 * 가계부 설정이 사는 시트 자리 (jarvis-core 정답표 agents/ledger/sheets/schema.py와 같은 값, 2026-11-17 재조정).
 * 설정 화면은 이 상수로만 시트를 읽고 쓴다.
 */

export type SectionKey = 'income' | 'saving' | 'fixed' | 'variable';
export type GroupKey = 'kisoon' | 'seoeun' | 'shared';

/** 계정 탭 분류 구간 (줄): C 구분, D 이름, E 그만 쓴 날 */
export const SECTIONS: { key: SectionKey; name: string; first: number; last: number }[] = [
	{ key: 'income', name: '수입', first: 4, last: 13 },
	{ key: 'saving', name: '비소비', first: 14, last: 33 },
	{ key: 'fixed', name: '고정 소비지출', first: 34, last: 58 },
	{ key: 'variable', name: '비고정 소비지출', first: 59, last: 88 }
];

/** 카드 명의(계정 H열 값). 묶음은 줄 자리 대신 명의로 정한다, 구분선 줄은 없다 (2026-11-18).
 *  결제방식 자리 n(1~30) → 계정 줄 n+3, 30자리는 명의와 상관없이 함께 쓴다. */
export const CARD_OWNERS: { key: GroupKey; name: string }[] = [
	{ key: 'kisoon', name: '기순' }, { key: 'seoeun', name: '서은' }, { key: 'shared', name: '기순, 서은' }
];
export const CARD_SLOTS = 30;
const squash = (s: string) => s.replace(/\s+/g, '');
/** 명의 글 → 묶음 (띄어쓰기는 빼고 견준다). 모르는 글·빈칸은 null */
export const ownerGroup = (owner: string): GroupKey | null => CARD_OWNERS.find(o => squash(o.name) === squash(owner))?.key ?? null;
export const ownerName = (key: GroupKey): string => CARD_OWNERS.find(o => o.key === key)?.name ?? key;
export const slotRow = (slot: number) => slot + 3;

/** 카드 줄 칸 (계정 G~Q): G 이름, H 명의, I 정산, J 실적, K 연결된 계좌, L·M 메모, N 상태, O 시작일, P 만료일, Q 해지일.
 *  F는 가계부 계정 표(B~E, E 그만 쓴 날)와 띄우는 빈 열 (2026-11-18) */
export const CARD_COLUMNS = { name: 'G', owner: 'H', settle: 'I', perf: 'J', account: 'K', status: 'N', start: 'O', expiry: 'P', cancel: 'Q' } as const;
export const CARD_STATUSES = ['사용 중', '해지', '만료'];
export const CARD_COMPANIES = ['KB국민', '롯데', '삼성', '우리', '현대', '신한', '하나', 'NH농협', '씨티', 'IBK', 'BC'];

export const ACCOUNT_TAB = '계정';
export const AUTO_TAB = '자동 기록 설정';
export const ALERT_ROWS = { first: 3, last: 42 };   // A 결제방식 | B 카드사 | C 번호 앞자리 | D 번호 끝자리 | E 문자 오는 금액
export const FIXED_ROWS = { first: 3, last: 22 };   // G 분류 | H 명세서에서 찾을 글
export const LOG_TAB = '설정 기록';                   // A 때 | B 누가 | C 고친 곳 | D 바뀌기 전 | E 바뀐 뒤
export const TRANSFER_TAB = '자동이체 내역';
/** 자동이체 구역: 시작 줄 s(머리글), 줄 s+1~s+20(A~J), 월 수입 B(s+21), 합계 s+22, 남는 돈 s+23, 메모 B(s+24) */
export const TRANSFER_SECTIONS = [
	{ name: '서은', start: 1 }, { name: '기순', start: 27 }, { name: '생활비 통장', start: 53 }
];
export const TRANSFER_ROWS = 20;

export const budgetTab = (year: number) => `${year}년 예산`;
/** 예산 탭 분류 줄 ← 계정 탭 분류 줄 (금액은 F) */
export const BUDGET_ROWS: { budgetFirst: number; accountFirst: number; size: number }[] = [
	{ budgetFirst: 10, accountFirst: 4, size: 10 },    // 수입
	{ budgetFirst: 22, accountFirst: 34, size: 25 },   // 고정 소비지출
	{ budgetFirst: 49, accountFirst: 59, size: 30 },   // 비고정 소비지출
	{ budgetFirst: 81, accountFirst: 14, size: 20 }    // 비소비
];

/** 열 번호(0부터) → 열 글자 (0 → A, 26 → AA) */
export const colName = (i: number): string =>
	(i >= 26 ? colName(Math.floor(i / 26) - 1) : '') + String.fromCharCode(65 + (i % 26));
const colIndex = (letters: string) => [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/** 범위 글('탭'!C4:E88, 계정!F4) → 탭 글(따옴표 그대로)·탭 이름·첫 칸(열 번호 0부터, 줄). 모양이 아니면 null */
export function parseRange(range: string): { tabPart: string; tab: string; col: number; row: number } | null {
	const m = /^(.+)!([A-Z]+)(\d+)(?::[A-Z]+\d*)?$/.exec(range);
	if (!m) return null;
	const tab = /^'.*'$/.test(m[1]) ? m[1].slice(1, -1).replaceAll("''", "'") : m[1];
	return { tabPart: m[1], tab, col: colIndex(m[2]), row: Number(m[3]) };
}

/** 칸 이름표 (다른 칸을 따라가는 칸 목록의 열쇠): '자동이체 내역!B41' */
export const cellKey = (tab: string, col: string, row: number) => `${tab}!${col}${row}`;

/** 수식을 읽는 범위 수: settingsRanges 앞의 여섯(설정 기록은 빼고) */
export const FORMULA_RANGES = 6;

/** 한 번의 batchGet에 넣을 범위 (parseSettings가 이 차례로 받는다). */
export function settingsRanges(year: number): string[] {
	return [
		`${ACCOUNT_TAB}!C4:E88`,
		`${ACCOUNT_TAB}!G4:Q33`,
		`'${AUTO_TAB}'!A${ALERT_ROWS.first}:E${ALERT_ROWS.last}`,
		`'${AUTO_TAB}'!G${FIXED_ROWS.first}:H${FIXED_ROWS.last}`,
		`'${budgetTab(year)}'!D1:F100`,
		`'${TRANSFER_TAB}'!A1:J77`,
		`'${LOG_TAB}'!A2:E`
	];
}
