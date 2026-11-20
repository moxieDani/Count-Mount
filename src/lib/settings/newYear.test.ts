import { describe, expect, it } from 'vitest';
import { dateToSerial, parseSettings } from './read';
import { planNewYear } from './newYear';

function rowsAt(first: number, entries: Record<number, unknown[]>): unknown[][] {
	const keys = Object.keys(entries).map(Number);
	if (!keys.length) return [];
	return Array.from({ length: Math.max(...keys) - first + 1 }, (_, i) => entries[first + i] ?? []);
}

const d = (s: string) => dateToSerial(s);

/** 2026 설정: 비고정 59 외식, 60 옛분류(2026-11 그만), 61 카페(2027-03 그만), 고정 34 관리비, 35 옛관리(2026-05 그만)
 *  카드(명의) 1 기순A(사용 중), 2 기순B(2026-06 해지), 3 서은A, 4 기순C(만료 2027-02), 29 현금(기순, 서은) */
const VALUES: unknown[][][] = [
	rowsAt(4, {
		34: ['주거', '관리비'], 35: ['주거', '옛관리', d('2026-05-01')],
		59: ['식비', '외식'], 60: ['식비', '옛분류', d('2026-11-30')], 61: ['식비', '카페', d('2027-03-15')]
	}),
	rowsAt(4, {
		4: ['기순A', 'A카드', '기순', '기순', '30만', '우리', '', '', '사용 중', d('2025-01-01'), d('2029-01-01'), ''],
		5: ['기순B', '', '기순', '', '', '', '', '', '해지', '', d('2029-01-01'), d('2026-06-30')],
		6: ['서은A', '', '서은'],
		7: ['기순C', '', '기순', '', '', '', '', '', '사용 중', '', d('2027-02-28'), ''],
		32: ['현금', '', '기순, 서은']
	}),
	rowsAt(3, { 3: ['기순A', '롯데', '', '8871', ''], 4: ['기순B', '삼성', '', '1234', ''], 5: ['서은A', '국민', '5123', '', 30000] }),
	rowsAt(3, { 3: ['관리비', '관리비'], 4: ['옛관리', '옛관리사무소'] }),
	rowsAt(1, { 22: ['', '', 250000], 23: ['', '', 10000], 49: ['', '', 400000], 50: ['', '', 5000], 51: ['', '', 60000] }),
	rowsAt(1, { 1: ['* 서은'], 2: ['1. 용돈', 100000], 22: ['월 수입', 3000000], 25: ['메모', '메모글'], 27: ['* 기순'], 53: ['* 생활비 통장'] }),
	[]
];
const last = parseSettings(VALUES, 2026);

const at = (writes: ReturnType<typeof planNewYear>, range: string) => writes.find(w => w.range === range)?.after;

describe('새해 설정 가져오기', () => {
	const writes = planNewYear(last, 2027);

	it('그만 쓴 분류와 끝난 카드는 뺀다', () => {
		const variable = at(writes, '계정!C59:E88')!;
		expect(variable.slice(0, 3)).toEqual([['식비', '외식', ''], ['식비', '카페', d('2027-03-15')], ['', '', '']]);
		expect(at(writes, '계정!C34:E58')!.slice(0, 2)).toEqual([['주거', '관리비', ''], ['', '', '']]);
		const names = at(writes, '계정!G4:L33')!.map(r => r[0]);
		expect(names.slice(0, 4)).toEqual(['기순A', '기순C', '서은A', '현금']);
		const alerts = at(writes, "'자동 기록 설정'!A3:E42")!;
		expect(alerts.slice(0, 3)).toEqual([['기순A', '롯데', '', '8871', ''], ['서은A', '국민', '5123', '', 30000], ['', '', '', '', '']]);
		expect(at(writes, "'자동 기록 설정'!G3:H22")!.slice(0, 2)).toEqual([['관리비', '관리비'], ['', '']]);
	});

	it('명의 차례(기순, 서은, 기순·서은)로 맨 위부터 채우고 구분선 줄은 없다', () => {
		const rows = at(writes, '계정!G4:L33')!;
		expect(rows).toHaveLength(30);
		expect(rows.slice(0, 4)).toEqual([['기순A', 'A카드', '기순', '기순', '30만', '우리'], ['기순C', '', '기순', '', '', ''],
			['서은A', '', '서은', '', '', ''], ['현금', '', '기순, 서은', '', '', '']]);
		expect(rows.some(r => /^-+$/.test(String(r[0])))).toBe(false);
		expect(at(writes, '계정!O4:R33')![0]).toEqual(['사용 중', d('2025-01-01'), d('2029-01-01'), '']);
	});

	it('해 안에 그만 쓰는 분류는 날짜와 함께 남긴다', () => {
		expect(at(writes, '계정!C59:E88')![1]).toEqual(['식비', '카페', d('2027-03-15')]);
	});

	it('예산은 이름으로 따라간다', () => {
		expect(at(writes, "'2027년 예산'!F22:F46")!.slice(0, 2)).toEqual([[250000], ['']]);   // 관리비만 남음
		expect(at(writes, "'2027년 예산'!F49:F78")!.slice(0, 3)).toEqual([[400000], [60000], ['']]);   // 외식, 카페
	});

	it('자동이체 내역·월 수입·메모는 그대로', () => {
		expect(at(writes, "'자동이체 내역'!A2:J21")![0]).toEqual(['1. 용돈', 100000, '', '', '', '', '', '', '', '']);   // 금액은 숫자로
		expect(at(writes, "'자동이체 내역'!B22")).toEqual([[3000000]]);
		expect(at(writes, "'자동이체 내역'!B25")).toEqual([['메모글']]);
		expect(writes.every(w => w.before.flat().every(v => v === ''))).toBe(true);   // 빈 틀에 쓴다
	});

	it('같은 이름이 고정·비고정 두 구간에 있어도 예산·고정비 줄은 자리로 따라간다', () => {
		const s = parseSettings([
			rowsAt(4, { 34: ['주거', '관리비'], 59: ['주거', '관리비', d('2026-05-01')] }),
			[], [], rowsAt(3, { 3: ['관리비', '관리비'] }),
			rowsAt(1, { 22: ['', '', 250000], 49: ['', '', 9000] }), [], []
		], 2026);
		const w = planNewYear(s, 2027);
		expect(at(w, "'2027년 예산'!F22:F46")![0]).toEqual([250000]);
		expect(at(w, "'자동 기록 설정'!G3:H22")![0]).toEqual(['관리비', '관리비']);
	});

	it('자동이체 줄의 날짜·체크 칸은 값 그대로', () => {
		const raw = ['1. 용돈', 100000, '', 46096, '', '', '', true, 5000, ''];
		const s = parseSettings([[], [], [], [], [], rowsAt(1, { 1: ['* 서은'], 2: raw }), []], 2026);
		expect(at(planNewYear(s, 2027), "'자동이체 내역'!A2:J21")![0]).toEqual(raw);
	});

	it('다른 칸을 따라가는 칸은 따라가는 그대로 옮긴다 (예산은 자리가 그대로일 때만)', () => {
		// 예산 49(외식, 자리 그대로)·51(카페, 옛분류가 빠져 50으로 당겨짐), 서은 2줄 금액·월 수입·합계
		const withF = parseSettings(VALUES, 2026, [[], [], [], [],
			rowsAt(1, { 49: ['', '', '=200000*2'], 51: ['', '', '=30000*2'] }),
			rowsAt(1, { 2: ['', '=B74'], 22: ['', '=1000000*3'], 23: ['', '=SUM(B2:B21)'] })]);
		const formulas = planNewYear(withF, 2027).filter(w => w.formula);
		expect(formulas.map(w => [w.range, w.after])).toEqual([
			["'2027년 예산'!F49", [['=200000*2']]],
			["'자동이체 내역'!B2", [['=B74']]],
			["'자동이체 내역'!B22", [['=1000000*3']]]
		]);
		expect(planNewYear(last, 2027).some(w => w.formula)).toBe(false);
	});
});

