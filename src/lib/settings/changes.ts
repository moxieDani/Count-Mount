/**
 * 설정 화면의 바꾸기 → 시트에 쓸 칸 목록 (설정 설계 7.1·7.2). 순수 함수.
 * before는 화면을 열 때 읽은 값(서버가 저장 직전 다시 읽어 견준다), after는 쓸 값(RAW로 쓴다:
 * 날짜는 일련번호, 카드 번호는 글자 그대로라 0으로 시작해도 0이 남는다).
 * 이름 바꾸기·순서 바꾸기·분류와 카드 지우기는 없다.
 */
import {
	ACCOUNT_TAB, ALERT_ROWS, AUTO_TAB, CARD_GROUPS, FIXED_ROWS, SECTIONS, TRANSFER_ROWS, TRANSFER_TAB,
	budgetTab, type GroupKey, type SectionKey
} from './layout';
import { dateToSerial, serialToDate, type CardAlert, type YearSettings } from './read';

export type Cell = string | number | boolean;
/** dates: 날짜 일련번호가 든 열 자리(미리 보기·설정 기록에 날짜로 보인다). */
export type CellWrite = { range: string; before: Cell[][]; after: Cell[][]; label: string; dates?: number[] };
export type Result = CellWrite[] | { error: string };
export type CardFields = {
	name?: string; settle?: string; perf?: string; account?: string;
	status?: string; start?: string | null; expiry?: string | null; cancel?: string | null;
};

const FULL = '자리가 다 찼습니다';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const auto = (cells: string) => `'${AUTO_TAB}'!${cells}`;
const transfer = (cells: string) => `'${TRANSFER_TAB}'!${cells}`;
/** 날짜 글 → 일련번호(시트에 그대로 있던 글이면 그 글), 없으면 빈칸 */
const dateCell = (d: string | null | undefined): Cell => (!d ? '' : DATE.test(d) ? dateToSerial(d) : d);
const blanks = (n: number): Cell[] => Array.from({ length: n }, () => '');

/** 새 이름 확인: 비지 않음, 앞뒤 띄어쓰기 없음, -만으로 된 글 아님, 같은 목록에 같은 이름 없음. 문제없으면 null. */
export function validateName(name: string, existing: string[]): string | null {
	if (!name.trim()) return '이름을 적어 주세요';
	if (name !== name.trim()) return '이름 앞뒤 띄어쓰기를 지워 주세요';
	if (/^-+$/.test(name)) return '-만으로 된 이름은 쓸 수 없습니다';
	if (existing.includes(name)) return '같은 이름이 이미 있습니다';
	return null;
}

const sectionName = (key: SectionKey) => SECTIONS.find(s => s.key === key)?.name ?? key;
const groupName = (key: GroupKey) => CARD_GROUPS.find(g => g.key === key)?.name ?? key;

export function addCategory(s: YearSettings, section: SectionKey, group: string, name: string): Result {
	const problem = validateName(name, s.categories.map(c => c.name).filter(Boolean));
	if (problem) return { error: problem };
	const slot = s.categories.find(c => c.section === section && !c.name);
	if (!slot) return { error: FULL };
	return [{
		range: `${ACCOUNT_TAB}!C${slot.row}:E${slot.row}`,
		before: [[slot.group, slot.name, dateCell(slot.stop)]],
		after: [[group.trim(), name, '']],
		label: `지출 분류 · ${sectionName(section)} · ${name}`,
		dates: [2]
	}];
}

export function setStopDate(s: YearSettings, row: number, date: string | null): Result {
	const c = s.categories.find(x => x.row === row && x.name);
	if (!c) return { error: '분류가 없습니다' };
	return [{ range: `${ACCOUNT_TAB}!E${row}`, before: [[dateCell(c.stop)]], after: [[dateCell(date)]], label: `지출 분류 · ${c.name} · 그만 쓴 날`, dates: [0] }];
}

function cardWrites(row: number, label: string, before: { main: Cell[]; state: Cell[] }, f: Required<Omit<CardFields, 'name'>> & { name: string }, withName: boolean): CellWrite[] {
	const main: CellWrite = withName
		? { range: `${ACCOUNT_TAB}!F${row}:I${row}`, before: [before.main], after: [[f.name, f.settle, f.perf, f.account]], label }
		: { range: `${ACCOUNT_TAB}!G${row}:I${row}`, before: [before.main.slice(1)], after: [[f.settle, f.perf, f.account]], label };
	return [main, {
		range: `${ACCOUNT_TAB}!L${row}:O${row}`, before: [before.state],
		after: [[f.status, dateCell(f.start), dateCell(f.expiry), dateCell(f.cancel)]], label: `${label} · 상태·날짜`, dates: [1, 2, 3]
	}];
}

export function addCard(s: YearSettings, group: GroupKey, fields: CardFields): Result {
	const name = fields.name ?? '';
	const problem = validateName(name, s.cards.map(c => c.name).filter(Boolean));
	if (problem) return { error: problem };
	const slot = s.cards.find(c => c.group === group && !c.name);   // 구분선 자리(14·28)는 YearSettings에 없다
	if (!slot) return { error: FULL };
	const before = { main: [slot.name, slot.settle, slot.perf, slot.account],
		state: [slot.status, dateCell(slot.start), dateCell(slot.expiry), dateCell(slot.cancel)] };
	return cardWrites(slot.row, `카드 · ${groupName(group)} · ${name}`, before, {
		name, settle: fields.settle ?? '', perf: fields.perf ?? '', account: fields.account ?? '',
		status: fields.status || '사용 중', start: fields.start ?? null, expiry: fields.expiry ?? null, cancel: fields.cancel ?? null
	}, true);
}

/** 카드 고치기: 이름(F) 말고 정산·실적·계좌·상태·날짜. */
export function updateCard(s: YearSettings, slot: number, fields: Omit<CardFields, 'name'>): Result {
	const card = s.cards.find(c => c.slot === slot && c.name);
	if (!card) return { error: '카드가 없습니다' };
	const before = { main: [card.name, card.settle, card.perf, card.account],
		state: [card.status, dateCell(card.start), dateCell(card.expiry), dateCell(card.cancel)] };
	const pick = <T>(v: T | undefined, cur: T) => (v === undefined ? cur : v);
	return cardWrites(card.row, `카드 · ${groupName(card.group)} · ${card.name}`, before, {
		name: card.name, settle: pick(fields.settle, card.settle), perf: pick(fields.perf, card.perf), account: pick(fields.account, card.account),
		status: pick(fields.status, card.status), start: pick(fields.start, card.start), expiry: pick(fields.expiry, card.expiry),
		cancel: pick(fields.cancel, card.cancel)
	}, false);
}

function freeRow(used: number[], first: number, last: number): number | null {
	for (let row = first; row <= last; row++) if (!used.includes(row)) return row;
	return null;
}

const alertCells = (a: CardAlert | undefined): Cell[] =>
	a ? [a.method, a.company, a.front, a.back, a.smsAmount ?? ''] : blanks(5);

export function setCardAlert(s: YearSettings, row: number | null, alert: Omit<CardAlert, 'row'>): Result {
	const target = row ?? freeRow(s.alerts.map(a => a.row), ALERT_ROWS.first, ALERT_ROWS.last);
	if (target === null) return { error: FULL };
	return [{
		range: auto(`A${target}:E${target}`), before: [alertCells(s.alerts.find(a => a.row === target))],
		after: [[alert.method, alert.company, String(alert.front ?? ''), String(alert.back ?? ''), alert.smsAmount ?? '']],
		label: `카드 알림 연결 · ${alert.method}`
	}];
}

export function clearCardAlert(s: YearSettings, row: number): Result {
	const a = s.alerts.find(x => x.row === row);
	if (!a) return { error: '알림 연결 줄이 없습니다' };
	return [{ range: auto(`A${row}:E${row}`), before: [alertCells(a)], after: [blanks(5)], label: `카드 알림 연결 · ${a.method} · 지움` }];
}

export function setFixedRule(s: YearSettings, row: number | null, rule: { label: string; text: string }): Result {
	const target = row ?? freeRow(s.fixedRules.map(r => r.row), FIXED_ROWS.first, FIXED_ROWS.last);
	if (target === null) return { error: FULL };
	const cur = s.fixedRules.find(r => r.row === target);
	return [{ range: auto(`G${target}:H${target}`), before: [cur ? [cur.label, cur.text] : blanks(2)],
		after: [[rule.label, rule.text]], label: `고정비 자동 채우기 · ${rule.label}` }];
}

export function clearFixedRule(s: YearSettings, row: number): Result {
	const cur = s.fixedRules.find(r => r.row === row);
	if (!cur) return { error: '고정비 줄이 없습니다' };
	return [{ range: auto(`G${row}:H${row}`), before: [[cur.label, cur.text]], after: [blanks(2)], label: `고정비 자동 채우기 · ${cur.label} · 지움` }];
}

/** 예산 저장: 입력 글이 처음 보인 글과 다른 줄만 쓴다 (손대지 않은 소수 금액·수식은 그대로). */
export function setBudgets(s: YearSettings, drafts: Record<number, string>): Result {
	const writes: CellWrite[] = [];
	for (const b of s.budgets) {
		const draft = drafts[b.row];
		if (draft === undefined || draft.trim() === amountText(b.amount)) continue;
		const amount = parseAmount(draft);
		if (amount === undefined) return { error: '금액은 숫자로 적어 주세요' };
		if (amount === b.amount) continue;
		const r = setBudget(s, b.row, amount);
		if ('error' in r) return r;
		writes.push(...r);
	}
	return writes;
}

export function setBudget(s: YearSettings, row: number, amount: number | null): Result {
	const b = s.budgets.find(x => x.row === row);
	if (!b) return { error: '예산 줄이 없습니다' };
	return [{ range: `'${budgetTab(s.year)}'!F${row}`, before: [[b.amount ?? '']], after: [[amount ?? '']], label: `예산 · ${b.label}` }];
}

/** 금액 글 → 숫자 (쉼표·띄어쓰기·'원'은 뺀다, 소수 됨). 빈칸이면 null, 숫자가 아니면 undefined. */
export function parseAmount(text: string): number | null | undefined {
	const t = text.replace(/[,\s원]/g, '');
	if (t === '') return null;
	return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : undefined;
}

/** 화면 입력 칸에 보이는 금액 글. */
export const amountText = (n: number | null) => (n === null ? '' : String(n));

/**
 * 자동이체 줄 열 칸(A~J). 화면 글이 읽은 값의 글과 같으면(손대지 않은 칸) 읽은 값 그대로(날짜·체크·숫자 유지).
 * 금액(B)·변경 금액(C)은 숫자로 써야 시트 합계 수식이 더한다('20,000원' → 20000).
 */
export function transferCells(cells: (string | number)[], raw: Cell[] = []): Cell[] {
	return Array.from({ length: 10 }, (_, i) => {
		const v = cells[i] ?? '';
		const old = raw[i];
		const out: Cell = old !== undefined && String(v).trim() === String(old).trim() ? old : v;
		if ((i === 1 || i === 2) && typeof out === 'string') {
			const n = parseAmount(out);
			if (typeof n === 'number') return n;
		}
		return out;
	});
}

function section(s: YearSettings, name: string) {
	return s.transfers.find(t => t.name === name);
}

export function setTransferRow(s: YearSettings, sectionName: string, row: number | null, cells: string[]): Result {
	const sec = section(s, sectionName);
	if (!sec) return { error: '구역이 없습니다' };
	const target = row ?? freeRow(sec.rows.map(r => r.row), sec.start + 1, sec.start + TRANSFER_ROWS);
	if (target === null) return { error: FULL };
	const cur = sec.rows.find(r => r.row === target);
	const after = transferCells(cells, cur?.raw);
	return [{ range: transfer(`A${target}:J${target}`), before: [cur ? cur.raw : blanks(10)], after: [after],
		label: `자동이체 내역 · ${sec.name} · ${after[0] || `${target}줄`}` }];
}

export function clearTransferRow(s: YearSettings, sectionName: string, row: number): Result {
	const sec = section(s, sectionName);
	const cur = sec?.rows.find(r => r.row === row);
	if (!sec || !cur) return { error: '자동이체 줄이 없습니다' };
	return [{ range: transfer(`A${row}:J${row}`), before: [cur.raw], after: [blanks(10)],
		label: `자동이체 내역 · ${sec.name} · ${cur.cells[0] || `${row}줄`} · 지움` }];
}

export function setTransferIncome(s: YearSettings, sectionName: string, amount: number | null): Result {
	const sec = section(s, sectionName);
	if (!sec) return { error: '구역이 없습니다' };
	const row = sec.start + 21;
	return [{ range: transfer(`B${row}`), before: [[sec.income ?? '']], after: [[amount ?? '']], label: `자동이체 내역 · ${sec.name} · 월 수입` }];
}

export function setTransferMemo(s: YearSettings, sectionName: string, memo: string): Result {
	const sec = section(s, sectionName);
	if (!sec) return { error: '구역이 없습니다' };
	const row = sec.start + 24;
	return [{ range: transfer(`B${row}`), before: [[sec.memo]], after: [[memo]], label: `자동이체 내역 · ${sec.name} · 메모` }];
}

/**
 * 칸 값을 한 줄 글로 (미리 보기·설정 기록): 칸은 ' · ', 줄은 ' / '로 잇는다. 끝의 빈칸은 빼고 가운데 빈칸은 '(빈칸)',
 * dates 자리의 일련번호는 YYYY-MM-DD. 모두 비면 '(빈칸)'.
 */
export const cellsText = (rows: Cell[][], dates: number[] = []) => {
	const lines = rows.map(row => {
		const cells = row.map((v, c) => (dates.includes(c) && typeof v === 'number' ? serialToDate(v) : String(v ?? '').trim()));
		while (cells.length && !cells.at(-1)) cells.pop();
		return cells.map(c => c || '(빈칸)').join(' · ');
	}).filter(Boolean);
	return lines.length ? lines.join(' / ') : '(빈칸)';
};

/** 화면 미리 보기 줄: '고친 곳: 바뀌기 전 → 바뀐 뒤'. */
export function describe(writes: CellWrite[]): string[] {
	return writes.map(w => `${w.label}: ${cellsText(w.before, w.dates)} → ${cellsText(w.after, w.dates)}`);
}
