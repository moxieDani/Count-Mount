/**
 * 새해 가계부: 지난해 설정을 정리해 빈 틀에 옮겨 적는다 (설정 설계 8장). 순수 함수.
 * 빼는 것: 그만 쓴 날이 새해 1월 1일 전인 분류, 끝 날짜(해지면 해지일, 아니면 만료일)가 그 전인 카드와 그 알림 줄,
 * 뺀 분류의 고정비 줄. 남은 분류는 구간마다, 카드는 묶음마다 앞자리부터(구분선 자리 14·28은 '------').
 * 예산은 남은 분류 이름으로 따라가고, 자동이체 내역(월 수입·메모 포함)은 그대로. before는 빈 틀(빈칸).
 * 다른 칸을 따라가는 칸(수식)은 값으로 한 번 쓴 뒤 수식 그대로 덧쓴다(formula 쓰기, 맨 뒤에): 자동이체는 자리가 그대로라
 * 언제나, 예산은 분류 자리가 당겨지지 않았을 때만(당겨지면 가리키는 칸이 어긋날 수 있어 값만 옮긴다).
 */
import { type Cell, type CellWrite, transferCells } from './changes';
import {
	ACCOUNT_TAB, ALERT_ROWS, AUTO_TAB, BUDGET_ROWS, CARD_GROUPS, FIXED_ROWS, SECTIONS, SEPARATOR, SEPARATOR_SLOTS,
	TRANSFER_ROWS, TRANSFER_TAB, budgetTab, cellKey, colName
} from './layout';
import { dateToSerial, type Card, type Category, type YearSettings } from './read';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateCell = (d: string | null): Cell => (!d ? '' : DATE.test(d) ? dateToSerial(d) : d);
/** 날짜 글이 cutoff 전인가 (날짜가 아닌 글·빈칸은 '끝 없음'). */
const before = (d: string | null, cutoff: string) => !!d && DATE.test(d) && d < cutoff;
const blankRows = (rows: Cell[][]) => rows.map(r => r.map(() => '' as Cell));
const write = (range: string, after: Cell[][], label: string, dates?: number[]): CellWrite =>
	({ range, before: blankRows(after), after, label, ...(dates ? { dates } : {}) });
const pad = (rows: Cell[][], size: number, width: number) =>
	Array.from({ length: size }, (_, i) => rows[i] ?? Array.from({ length: width }, () => '' as Cell));

const cardEnd = (c: Card) => (c.status === '해지' && c.cancel ? c.cancel : c.expiry);

export function planNewYear(last: YearSettings, year: number): CellWrite[] {
	const cutoff = `${year}-01-01`;
	const out: CellWrite[] = [];
	const formulas: CellWrite[] = [];
	const follow = (fromTab: string, toTab: string, col: string, fromRow: number, toRow: number = fromRow) => {
		const f = last.formulas?.[cellKey(fromTab, col, fromRow)];
		if (f) formulas.push({ ...write(`'${toTab}'!${col}${toRow}`, [[f]], `새해 · 따라가는 칸 · ${toTab}!${col}${toRow}`), formula: true });
	};

	// 분류: 구간마다 남은 분류를 앞자리부터
	const kept: Record<string, Category[]> = {};
	const droppedFixed = new Set<string>();   // 고정비 줄의 분류는 고정 소비지출 구간 이름(고정비항목)
	for (const sec of SECTIONS) {
		const all = last.categories.filter(c => c.section === sec.key && c.name);
		kept[sec.key] = all.filter(c => !before(c.stop, cutoff));
		if (sec.key === 'fixed') all.filter(c => before(c.stop, cutoff)).forEach(c => droppedFixed.add(c.name));
		const size = sec.last - sec.first + 1;
		out.push(write(`${ACCOUNT_TAB}!C${sec.first}:E${sec.last}`,
			pad(kept[sec.key].map(c => [c.group, c.name, dateCell(c.stop)]), size, 3), `새해 · 지출 분류 · ${sec.name}`, [2]));
	}

	// 카드: 묶음마다 남은 카드를 앞자리부터, 구분선 자리는 '------'
	const main: Cell[][] = Array.from({ length: 30 }, () => ['', '', '', '']);
	const state: Cell[][] = Array.from({ length: 30 }, () => ['', '', '', '']);
	const removedCards = new Set<string>();
	for (const slot of SEPARATOR_SLOTS) main[slot - 1] = [SEPARATOR, '', '', ''];
	for (const group of CARD_GROUPS) {
		const all = last.cards.filter(c => c.group === group.key && c.name);
		all.filter(c => before(cardEnd(c), cutoff)).forEach(c => removedCards.add(c.name));
		all.filter(c => !before(cardEnd(c), cutoff)).forEach((c, i) => {
			const slot = group.slots[i];
			main[slot - 1] = [c.name, c.settle, c.perf, c.account];
			state[slot - 1] = [c.status, dateCell(c.start), dateCell(c.expiry), dateCell(c.cancel)];
		});
	}
	out.push(write(`${ACCOUNT_TAB}!G4:J33`, main, '새해 · 카드'));
	out.push(write(`${ACCOUNT_TAB}!M4:P33`, state, '새해 · 카드 상태·날짜', [1, 2, 3]));

	// 카드 알림 연결: 뺀 카드의 줄은 빼고 앞줄부터
	const alerts = last.alerts.filter(a => !removedCards.has(a.method))
		.map(a => [a.method, a.company, a.front, a.back, a.smsAmount ?? ''] as Cell[]);
	out.push(write(`'${AUTO_TAB}'!A${ALERT_ROWS.first}:E${ALERT_ROWS.last}`, pad(alerts, ALERT_ROWS.last - ALERT_ROWS.first + 1, 5), '새해 · 카드 알림 연결'));

	// 고정비 자동 채우기: 뺀 고정 분류의 줄은 빼고 앞줄부터 (같은 이름이 남은 고정 분류에 있으면 남긴다)
	const keptFixed = new Set(kept.fixed.map(c => c.name));
	const rules = last.fixedRules.filter(r => !droppedFixed.has(r.label) || keptFixed.has(r.label)).map(r => [r.label, r.text] as Cell[]);
	out.push(write(`'${AUTO_TAB}'!G${FIXED_ROWS.first}:H${FIXED_ROWS.last}`, pad(rules, FIXED_ROWS.last - FIXED_ROWS.first + 1, 2), '새해 · 고정비 자동 채우기'));

	// 예산: 남은 분류의 지난해 자리(계정 줄)로 금액을 찾는다 (같은 이름이 두 구간에 있어도 섞이지 않게)
	const amountOf = new Map(last.budgets.map(b => [b.accountRow, b.amount]));
	for (const part of BUDGET_ROWS) {
		const sec = SECTIONS.find(s => s.first === part.accountFirst)!;
		const rows = kept[sec.key].map(c => [amountOf.get(c.row) ?? ''] as Cell[]);
		kept[sec.key].forEach((c, i) => {
			if (c.row - part.accountFirst === i) follow(budgetTab(last.year), budgetTab(year), 'F', part.budgetFirst + i);
		});
		out.push(write(`'${budgetTab(year)}'!F${part.budgetFirst}:F${part.budgetFirst + part.size - 1}`, pad(rows, part.size, 1), `새해 · 예산 · ${sec.name}`));
	}

	// 자동이체 내역: 읽은 값 그대로 (금액 칸의 숫자 글은 숫자로)
	for (const t of last.transfers) {
		const rows: Cell[][] = Array.from({ length: TRANSFER_ROWS }, () => Array.from({ length: 10 }, () => '' as Cell));
		for (const r of t.rows) rows[r.row - t.start - 1] = transferCells(r.cells, r.raw);
		out.push(write(`'${TRANSFER_TAB}'!A${t.start + 1}:J${t.start + TRANSFER_ROWS}`, rows, `새해 · 자동이체 내역 · ${t.name}`));
		if (t.income !== null) out.push(write(`'${TRANSFER_TAB}'!B${t.start + 21}`, [[t.income]], `새해 · 자동이체 내역 · ${t.name} · 월 수입`));
		if (t.memo) out.push(write(`'${TRANSFER_TAB}'!B${t.start + 24}`, [[t.memo]], `새해 · 자동이체 내역 · ${t.name} · 메모`));
		for (let row = t.start + 1; row <= t.start + TRANSFER_ROWS; row++) {
			for (let c = 0; c < 10; c++) follow(TRANSFER_TAB, TRANSFER_TAB, colName(c), row);
		}
		follow(TRANSFER_TAB, TRANSFER_TAB, 'B', t.start + 21);
		follow(TRANSFER_TAB, TRANSFER_TAB, 'B', t.start + 24);
	}
	return [...out, ...formulas];
}
