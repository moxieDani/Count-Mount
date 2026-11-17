import { describe, expect, it } from 'vitest';
import { budgetTab, settingsRanges } from './layout';
import { dateToSerial, parseSettings, serialToDate } from './read';

/** settingsRanges 차례대로: 계정 C4:E88, 계정 F4:O33, 알림 A3:E42, 고정비 G3:H22, 예산 D1:F100, 자동이체 A1:J77, 설정 기록 A2:E */
function ranges(over: Partial<Record<number, unknown[][]>> = {}): unknown[][][] {
	return Array.from({ length: 7 }, (_, i) => over[i] ?? []);
}

function rowsAt(first: number, entries: Record<number, unknown[]>): unknown[][] {
	const last = Math.max(...Object.keys(entries).map(Number));
	return Array.from({ length: last - first + 1 }, (_, i) => entries[first + i] ?? []);
}

describe('설정 읽기', () => {
	it('범위는 한 번의 묶음 요청으로', () => {
		expect(settingsRanges(2026)).toEqual([
			'계정!C4:E88', '계정!F4:O33', "'자동 기록 설정'!A3:E42", "'자동 기록 설정'!G3:H22",
			"'2026년 예산'!D1:F100", "'자동이체 내역'!A1:J77", "'설정 기록'!A2:E"
		]);
		expect(budgetTab(2026)).toBe('2026년 예산');
	});

	it('구간별 분류와 그만 쓴 날', () => {
		const s = parseSettings(ranges({ 0: rowsAt(4, { 4: ['월급', '기순 월급'], 59: ['식비', '외식', 46096], 60: ['식비', '배달', ''] }) }), 2026);
		const variable = s.categories.filter(c => c.section === 'variable');
		expect(variable).toHaveLength(30);
		expect(variable[0]).toEqual({ section: 'variable', row: 59, group: '식비', name: '외식', stop: '2026-03-15' });
		expect(variable[1].stop).toBeNull();
		expect(s.categories.find(c => c.row === 4)).toMatchObject({ section: 'income', group: '월급', name: '기순 월급' });
		expect(s.categories.filter(c => c.section === 'saving')).toHaveLength(20);
	});

	it('카드 묶음과 구분선 자리 빼기', () => {
		const cards = rowsAt(4, {
			4: ['기순_롯데', '기순', '30만', '우리', '', '', '사용 중', 45000, 47000, ''],
			17: ['------'], 18: ['서은_국민'], 32: ['현금/이체']
		});
		const s = parseSettings(ranges({ 1: cards }), 2026);
		expect(s.cards.map(c => c.slot)).not.toContain(14);
		expect(s.cards.map(c => c.slot)).not.toContain(28);
		expect(s.cards.filter(c => c.group === 'kisoon')).toHaveLength(13);
		expect(s.cards.filter(c => c.group === 'shared').map(c => c.slot)).toEqual([29, 30]);
		expect(s.cards[0]).toEqual({ group: 'kisoon', slot: 1, row: 4, name: '기순_롯데', settle: '기순', perf: '30만', account: '우리',
			status: '사용 중', start: serialToDate(45000), expiry: serialToDate(47000), cancel: null });
		expect(s.cards.find(c => c.slot === 15)).toMatchObject({ group: 'seoeun', row: 18, name: '서은_국민' });
	});

	it('카드 알림과 고정비 줄(빈 줄 건너뜀)', () => {
		const s = parseSettings(ranges({
			2: rowsAt(3, { 3: ['기순_롯데', '롯데', '', '0871', ''], 5: ['기순_삼성', '삼성', 5123, '', 30000] }),
			3: rowsAt(3, { 4: ['인터넷', '유선요금'] })
		}), 2026);
		expect(s.alerts).toEqual([
			{ row: 3, method: '기순_롯데', company: '롯데', front: '', back: '0871', smsAmount: null },
			{ row: 5, method: '기순_삼성', company: '삼성', front: '5123', back: '', smsAmount: 30000 }
		]);
		expect(s.fixedRules).toEqual([{ row: 4, label: '인터넷', text: '유선요금' }]);
	});

	it('예산은 분류 이름과 짝', () => {
		const s = parseSettings(ranges({
			0: rowsAt(4, { 34: ['주거', '관리비'], 59: ['식비', '외식'] }),
			4: rowsAt(1, { 22: ['', '', 250000], 49: ['', '', 400000] })
		}), 2026);
		expect(s.budgets).toEqual([{ row: 22, accountRow: 34, label: '관리비', amount: 250000 }, { row: 49, accountRow: 59, label: '외식', amount: 400000 }]);
	});

	it('자동이체 구역 셋', () => {
		const s = parseSettings(ranges({
			5: rowsAt(1, { 1: ['* 서은'], 2: ['1. 용돈', 100000, '', '', '', '현금이체'], 22: ['월 수입', 3000000], 25: ['메모', '월급 메모'],
				27: ['* 기순'], 28: ['1. 용돈', 50000], 53: ['* 생활비 통장'] })
		}), 2026);
		expect(s.transfers.map(t => [t.name, t.start])).toEqual([['서은', 1], ['기순', 27], ['생활비 통장', 53]]);
		expect(s.transfers[0].rows).toEqual([{ row: 2, cells: ['1. 용돈', '100000', '', '', '', '현금이체', '', '', '', ''],
			raw: ['1. 용돈', 100000, '', '', '', '현금이체', '', '', '', ''] }]);   // raw: 읽은 값 그대로(숫자는 숫자)
		expect([s.transfers[0].income, s.transfers[0].memo]).toEqual([3000000, '월급 메모']);
		expect(s.transfers[1].rows.map(r => r.row)).toEqual([28]);
		expect(s.transfers[2].rows).toEqual([]);
	});

	it('날짜 일련번호 오가기', () => {
		expect(serialToDate(46096)).toBe('2026-03-15');
		expect(dateToSerial('2026-03-15')).toBe(46096);
	});
});
