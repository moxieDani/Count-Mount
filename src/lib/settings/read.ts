/** 한 번 읽은 시트 값 → 해마다 설정 (설정 설계 4·7장). 순수 함수. */
import {
	ALERT_ROWS, BUDGET_ROWS, CARD_GROUPS, FIXED_ROWS, SECTIONS, TRANSFER_ROWS, TRANSFER_SECTIONS,
	slotRow, type GroupKey, type SectionKey
} from './layout';

export type Category = { section: SectionKey; row: number; group: string; name: string; stop: string | null };
export type Card = {
	group: GroupKey; slot: number; row: number; name: string; settle: string; perf: string; account: string;
	status: string; start: string | null; expiry: string | null; cancel: string | null;
};
export type CardAlert = { row: number; method: string; company: string; front: string; back: string; smsAmount: number | null };
export type FixedRule = { row: number; label: string; text: string };
export type Budget = { row: number; label: string; amount: number | null };
export type TransferSection = { name: string; start: number; rows: { row: number; cells: string[] }[]; income: number | null; memo: string };
export type LogEntry = { when: string; who: string; where: string; before: string; after: string };
export type YearSettings = {
	year: number; categories: Category[]; cards: Card[]; alerts: CardAlert[]; fixedRules: FixedRule[];
	budgets: Budget[]; transfers: TransferSection[]; logs: LogEntry[];
};

const EPOCH = Date.UTC(1899, 11, 30);
const DAY = 86_400_000;

/** 시트 날짜 일련번호 → YYYY-MM-DD */
export function serialToDate(serial: number): string {
	return new Date(EPOCH + Math.floor(serial) * DAY).toISOString().slice(0, 10);
}

/** YYYY-MM-DD → 시트 날짜 일련번호 */
export function dateToSerial(date: string): number {
	const [y, m, d] = date.split('-').map(Number);
	return Math.round((Date.UTC(y, m - 1, d) - EPOCH) / DAY);
}

const at = (rows: unknown[][] | undefined, i: number, c: number): unknown => rows?.[i]?.[c] ?? '';
const text = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
/** 날짜 칸: 일련번호면 날짜 글, 글이면 그 글(점검 프로그램이 알린다), 빈칸이면 null */
const dateOf = (v: unknown): string | null => (isNumber(v) ? serialToDate(v) : text(v) || null);
/** 번호 칸: 숫자로 적힌 것은 정수 글로, 글은 그대로 */
const digits = (v: unknown): string => (isNumber(v) ? String(Math.trunc(v)) : text(v));

export function parseSettings(valueRanges: unknown[][][], year: number): YearSettings {
	const [account, cardRows, alertRows, fixedRows, budgetRows, transferRows, logRows] = valueRanges;

	const categories: Category[] = SECTIONS.flatMap(sec =>
		Array.from({ length: sec.last - sec.first + 1 }, (_, k) => {
			const row = sec.first + k, i = row - 4;
			return { section: sec.key, row, group: text(at(account, i, 0)), name: text(at(account, i, 1)), stop: dateOf(at(account, i, 2)) };
		}));

	const cards: Card[] = CARD_GROUPS.flatMap(group => group.slots.map(slot => {
		const i = slot - 1;
		return {
			group: group.key, slot, row: slotRow(slot), name: text(at(cardRows, i, 0)), settle: text(at(cardRows, i, 1)),
			perf: text(at(cardRows, i, 2)), account: text(at(cardRows, i, 3)), status: text(at(cardRows, i, 6)),
			start: dateOf(at(cardRows, i, 7)), expiry: dateOf(at(cardRows, i, 8)), cancel: dateOf(at(cardRows, i, 9))
		};
	}));

	const alerts: CardAlert[] = [];
	for (let row = ALERT_ROWS.first; row <= ALERT_ROWS.last; row++) {
		const i = row - ALERT_ROWS.first;
		const cells = [0, 1, 2, 3, 4].map(c => at(alertRows, i, c));
		if (cells.every(v => text(v) === '')) continue;
		alerts.push({ row, method: text(cells[0]), company: text(cells[1]), front: digits(cells[2]), back: digits(cells[3]),
			smsAmount: isNumber(cells[4]) ? cells[4] : null });
	}

	const fixedRules: FixedRule[] = [];
	for (let row = FIXED_ROWS.first; row <= FIXED_ROWS.last; row++) {
		const i = row - FIXED_ROWS.first;
		const label = text(at(fixedRows, i, 0)), ruleText = text(at(fixedRows, i, 1));
		if (label || ruleText) fixedRules.push({ row, label, text: ruleText });
	}

	const nameAt = (accountRow: number) => text(at(account, accountRow - 4, 1));
	const budgets: Budget[] = BUDGET_ROWS.flatMap(part =>
		Array.from({ length: part.size }, (_, k) => {
			const row = part.budgetFirst + k, amount = at(budgetRows, row - 1, 2);
			return { row, label: nameAt(part.accountFirst + k), amount: isNumber(amount) ? amount : null };
		})).filter(b => b.label);

	const transfers: TransferSection[] = TRANSFER_SECTIONS.map(sec => {
		const rows: { row: number; cells: string[] }[] = [];
		for (let row = sec.start + 1; row <= sec.start + TRANSFER_ROWS; row++) {
			const cells = Array.from({ length: 10 }, (_, c) => text(at(transferRows, row - 1, c)));
			if (cells.some(Boolean)) rows.push({ row, cells });
		}
		const income = at(transferRows, sec.start + 21 - 1, 1);
		return { name: sec.name, start: sec.start, rows, income: isNumber(income) ? income : null,
			memo: text(at(transferRows, sec.start + 24 - 1, 1)) };
	});

	const logs: LogEntry[] = (logRows ?? []).filter(r => r?.some(v => text(v))).map(r => ({
		when: text(r[0]), who: text(r[1]), where: text(r[2]), before: text(r[3]), after: text(r[4])
	}));

	return { year, categories, cards, alerts, fixedRules, budgets, transfers, logs };
}
