import { describe, expect, it } from 'vitest';
import { isEmptySlot, parseSettings } from './read';
import {
	LOCKED, LOCKED_ROW, addCard, addCategory, changedOnly, clearCardAlert, clearTransferRow, describe as describeWrites, locked, parseAmount,
	setBudget, setBudgets, setCardAlert, setStopDate, setTransferIncome, setTransferMemo, setTransferRow, updateCard, validateName
} from './changes';

function rowsAt(first: number, entries: Record<number, unknown[]>): unknown[][] {
	const keys = Object.keys(entries).map(Number);
	if (!keys.length) return [];
	return Array.from({ length: Math.max(...keys) - first + 1 }, (_, i) => entries[first + i] ?? []);
}

/** 비고정 59·60줄, 카드 1·2·13 자리(명의 기순), 알림 3줄, 예산 49줄, 서은 구역 2줄이 찬 설정 */
function settings(over: { account?: Record<number, unknown[]>; cards?: Record<number, unknown[]> } = {}) {
	return parseSettings([
		rowsAt(4, over.account ?? { 59: ['식비', '외식', 46096], 60: ['식비', '배달'] }),
		rowsAt(4, over.cards ?? { 4: ['기순_롯데', '기순', '기순'], 5: ['기순_삼성', '기순'], 16: ['기순_현대', '기순'] }),
		rowsAt(3, { 3: ['기순_롯데', '롯데', '', '0871', ''] }),
		[],
		rowsAt(1, { 49: ['', '', 400000] }),
		rowsAt(1, { 1: ['* 서은'], 2: ['1. 용돈', 100000] }),
		[]
	], 2026);
}

describe('바꾸기 계산', () => {
	it('분류 더하기는 그 구간 첫 빈 자리', () => {
		const writes = addCategory(settings(), 'variable', '식비', '카페');
		expect(writes).toEqual([{ range: '계정!C61:E61', before: [['', '', '']], after: [['식비', '카페', '']], label: '지출 분류 · 비고정 소비지출 · 카페', dates: [2] }]);
	});

	it('자리가 없으면 오류', () => {
		const full = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [4 + i, ['월급', `수입${i}`]]));
		expect(addCategory(settings({ account: full }), 'income', '월급', '새수입')).toEqual({ error: '자리가 다 찼습니다' });
		const cards = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [4 + i, [`카드${i}`, '서은']]));
		expect(addCard(settings({ cards }), 'kisoon', { name: '새카드' })).toEqual({ error: '자리가 다 찼습니다' });   // 30자리를 함께 쓴다
	});

	it('새 카드 자리: 같은 명의 첫 카드부터 아래로 첫 빈 줄, 그 명의 카드가 없으면 맨 위 첫 빈 줄', () => {
		const cards = { 4: ['기순A', '기순'], 5: ['기순B', '기순'], 18: ['서은A', '서은'], 19: ['서은B', '서은'], 32: ['현금', '기순, 서은'] };
		const at = (group: 'kisoon' | 'seoeun' | 'shared', s = settings({ cards })) => {
			const w = addCard(s, group, { name: '새' }); return Array.isArray(w) ? w[0].range : w.error;
		};
		expect(at('kisoon')).toBe('계정!G6:K6');
		expect(at('seoeun')).toBe('계정!G20:K20');
		expect(at('shared')).toBe('계정!G33:K33');
		expect(at('seoeun', settings())).toBe('계정!G6:K6');            // 서은 카드가 없으면 맨 위 첫 빈 줄
		const old = settings({ cards: { 4: ['기순A', '기순'], 17: ['------'] } });
		expect(at('kisoon', old)).toBe('계정!G5:K5');                     // 옛 구분선 줄은 빈 줄이 아니다
	});

	it('새 카드는 이름·명의·정산·실적·계좌와 상태·날짜, 상태 기본은 사용 중', () => {
		const writes = addCard(settings(), 'kisoon', { name: '기순_우리', settle: '기순', start: '2026-03-15' });
		expect(writes).toEqual([
			{ range: '계정!G6:K6', before: [['', '', '', '', '']], after: [['기순_우리', '기순', '기순', '', '']], label: '카드 · 기순 · 기순_우리' },
			{ range: '계정!N6:Q6', before: [['', '', '', '']], after: [['사용 중', 46096, '', '']], label: '카드 · 기순 · 기순_우리 · 상태·날짜', dates: [1, 2, 3] }
		]);
		const shared = addCard(settings(), 'shared', { name: '공용카드' });
		expect(Array.isArray(shared) && shared[0].after[0].slice(0, 2)).toEqual(['공용카드', '기순, 서은']);
	});

	it('카드 이름은 고칠 수 없음', () => {
		const writes = updateCard(settings(), 1, { name: '바꾼이름', status: '해지', cancel: '2026-03-15' } as never);
		expect(Array.isArray(writes) && writes.map(w => w.range)).toEqual(['계정!H4:K4', '계정!N4:Q4']);
		expect(JSON.stringify(writes)).not.toContain('바꾼이름');
	});

	it('이름이 없어도 다른 카드 칸(계좌 등)에 글이 있는 줄은 빈 자리가 아니다 (옛 구분선 줄의 메모를 지킨다)', () => {
		const cards: Record<number, unknown[]> = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [4 + i, [`기순${i}`, '기순']]));
		cards[17] = ['', '', '', '', '국민'];
		const w = addCard(settings({ cards }), 'kisoon', { name: '새' });
		expect(Array.isArray(w) && w[0].range).toBe('계정!G18:K18');
		expect(parseSettings([[], rowsAt(4, cards), [], [], [], [], []], 2026).cards.filter(isEmptySlot)).toHaveLength(16);
	});

	it('카드 명의는 고칠 수 있다', () => {
		const writes = updateCard(settings(), 1, { group: 'seoeun' });
		expect(Array.isArray(writes) && writes[0]).toMatchObject({ range: '계정!H4:K4', before: [['기순', '기순', '', '']], after: [['서은', '기순', '', '']] });
	});

	it('이름 검사', () => {
		expect(validateName('', ['A'])).toBe('이름을 적어 주세요');
		expect(validateName(' A', [])).toBe('이름 앞뒤 띄어쓰기를 지워 주세요');
		expect(validateName('---', [])).toBe('-만으로 된 이름은 쓸 수 없습니다');
		expect(validateName('A', ['A'])).toBe('같은 이름이 이미 있습니다');
		expect(validateName('B', ['A'])).toBeNull();
		expect(addCategory(settings(), 'variable', '식비', '외식')).toEqual({ error: '같은 이름이 이미 있습니다' });
	});

	it('번호는 글자로 씀', () => {
		const writes = setCardAlert(settings(), null, { method: '기순_삼성', company: '삼성', front: '0123', back: '', smsAmount: null });
		expect(writes).toEqual([{ range: "'자동 기록 설정'!A4:E4", before: [['', '', '', '', '']],
			after: [['기순_삼성', '삼성', '0123', '', '']], label: '카드 알림 연결 · 기순_삼성' }]);
	});

	it('알림 줄 지우기는 그 줄만 비움', () => {
		expect(clearCardAlert(settings(), 3)).toEqual([{ range: "'자동 기록 설정'!A3:E3", before: [['기순_롯데', '롯데', '', '0871', '']],
			after: [['', '', '', '', '']], label: '카드 알림 연결 · 기순_롯데 · 지움' }]);
	});

	it('그만 쓴 날·예산·자동이체 줄', () => {
		expect(setStopDate(settings(), 59, null)).toEqual([{ range: '계정!E59', before: [[46096]], after: [['']], label: '지출 분류 · 외식 · 그만 쓴 날', dates: [0] }]);
		expect(setBudget(settings(), 49, 450000)).toEqual([{ range: "'2026년 예산'!F49", before: [[400000]], after: [[450000]], label: '예산 · 외식' }]);
		const t = setTransferRow(settings(), '서은', null, ['2. 청약', '20,000원', '18000', '신한 -> 국민 2만원']);
		// 금액·변경 금액은 숫자로 써야 시트 합계 수식이 더한다 (글자 '20000'은 SUM이 건너뜀)
		expect(Array.isArray(t) && t[0]).toMatchObject({ range: "'자동이체 내역'!A3:J3", after: [['2. 청약', 20000, 18000, '신한 -> 국민 2만원', '', '', '', '', '', '']] });
	});

	it('미리 보기 글', () => {
		const writes = setBudget(settings(), 49, 450000);
		expect(Array.isArray(writes) && describeWrites(writes)).toEqual(['예산 · 외식: 400000 → 450000']);
		const add = addCategory(settings(), 'variable', '식비', '카페');
		expect(Array.isArray(add) && describeWrites(add)).toEqual(['지출 분류 · 비고정 소비지출 · 카페: (빈칸) → 식비 · 카페']);
	});

	it('미리 보기의 날짜는 날짜로, 가운데 빈칸은 빈칸으로', () => {
		const stop = setStopDate(settings(), 60, '2027-03-01');
		expect(Array.isArray(stop) && describeWrites(stop)).toEqual(['지출 분류 · 배달 · 그만 쓴 날: (빈칸) → 2027-03-01']);
		const card = updateCard(settings(), 1, { expiry: '2029-01-31' });
		expect(Array.isArray(card) && describeWrites(card)[1]).toBe('카드 · 기순 · 기순_롯데 · 상태·날짜: (빈칸) → (빈칸) · (빈칸) · 2029-01-31');
	});

	it('금액 글 읽기: 쉼표·원·소수, 빈칸은 null, 숫자가 아니면 undefined', () => {
		expect(parseAmount('450,000원')).toBe(450000);
		expect(parseAmount(' 83333.5 ')).toBe(83333.5);
		expect(parseAmount('-1200')).toBe(-1200);
		expect(parseAmount('')).toBeNull();
		expect(parseAmount('-')).toBeUndefined();
		expect(parseAmount('12a')).toBeUndefined();
	});

	it('예산 저장은 고친 줄만 쓴다', () => {
		const s = parseSettings([rowsAt(4, { 59: ['식비', '외식'], 60: ['식비', '배달'] }), [], [], [], rowsAt(1, { 49: ['', '', 83333.33], 50: ['', '', 5000] }), [], []], 2026);
		expect(setBudgets(s, { 49: '83333.33', 50: '5000' })).toEqual([]);   // 그대로면 쓰지 않는다 (소수도 그대로)
		expect(setBudgets(s, { 49: '83333.33', 50: '6,000원' })).toEqual(setBudget(s, 50, 6000));
		expect(setBudgets(s, { 49: '83333.33', 50: '' })).toEqual(setBudget(s, 50, null));
		expect(setBudgets(s, { 49: '-', 50: '5000' })).toEqual({ error: '금액은 숫자로 적어 주세요' });
	});

	it('자동이체 줄을 고쳐도 손대지 않은 칸은 원래 값 그대로', () => {
		const raw = ['1. 용돈', 100000, '', 46096, '', '', '', true, 5000, ''];
		const s = parseSettings([[], [], [], [], [], rowsAt(1, { 1: ['* 서은'], 2: raw }), []], 2026);
		const cells = [...s.transfers[0].rows[0].cells];
		cells[0] = '1. 용돈(고침)';
		const t = setTransferRow(s, '서은', 2, cells);
		expect(Array.isArray(t) && t[0].before).toEqual([raw]);
		expect(Array.isArray(t) && t[0].after).toEqual([['1. 용돈(고침)', ...raw.slice(1)]]);
	});
});

/** 서은 2줄 금액(B2)이 다른 칸을 따라가고, 예산 49줄과 서은 월 수입(B22)은 수식 */
function lockedSettings() {
	return parseSettings([
		rowsAt(4, { 59: ['식비', '외식'] }), [], [], [],
		rowsAt(1, { 49: ['', '', 400000] }),
		rowsAt(1, { 1: ['* 서은'], 2: ['1. 용돈', 100000, '', '', '', '', '', '', '', '메모'], 3: ['2. 통신', 50000], 22: ['', 3000000] }),
		[]
	], 2026, [[], [], [], [], rowsAt(1, { 49: ['', '', '=200000*2'] }), rowsAt(1, { 2: ['', '=B74'], 22: ['', '=1000000*3'] })]);
}

describe('다른 칸을 따라가는 칸', () => {
	it('화면에서 고칠 수 없다', () => {
		const s = lockedSettings();
		expect(locked(s, '자동이체 내역', 'B', 2)).toBe(true);
		expect(locked(s, '자동이체 내역', 'C', 2)).toBe(false);
		expect(setBudget(s, 49, 500000)).toEqual({ error: LOCKED });
		expect(setBudgets(s, { 49: '500000' })).toEqual({ error: LOCKED });
		expect(setTransferIncome(s, '서은', 4000000)).toEqual({ error: LOCKED });
		expect(setTransferRow(s, '서은', 2, ['1. 용돈', '200000', '', '', '', '', '', '', '', '메모'])).toEqual({ error: LOCKED });
		expect(clearTransferRow(s, '서은', 2)).toEqual({ error: LOCKED_ROW });
	});

	it('같은 줄의 다른 칸은 고칠 수 있고, 따라가는 칸은 읽은 값 그대로', () => {
		const s = lockedSettings();
		const w = setTransferRow(s, '서은', 2, ['1. 용돈', '100000', '', '', '', '', '', '', '', '새 메모']);
		expect(Array.isArray(w) && w[0].after[0]).toEqual(['1. 용돈', 100000, '', '', '', '', '', '', '', '새 메모']);
		expect(Array.isArray(clearTransferRow(s, '서은', 3))).toBe(true);
		expect(Array.isArray(setTransferMemo(s, '서은', '새 메모'))).toBe(true);
	});

	it('바뀐 칸이 없는 쓰기는 뺀다 (카드 해지만 바꾸면 상태·날짜 한 줄)', () => {
		const w = updateCard(settings(), 1, { status: '해지', cancel: '2026-11-18' });
		expect(Array.isArray(w) && changedOnly(w).map(x => x.label)).toEqual(['카드 · 기순 · 기순_롯데 · 상태·날짜']);
		expect(changedOnly([{ range: '계정!G4:H4', before: [[1000, '']], after: [['1000', ' ']], label: 'x' }])).toEqual([]);
	});
});

