import { describe, expect, it } from 'vitest';
import { parseSettings } from './read';
import {
	addCard, addCategory, clearCardAlert, describe as describeWrites, setBudget, setCardAlert, setStopDate,
	setTransferRow, updateCard, validateName
} from './changes';

function rowsAt(first: number, entries: Record<number, unknown[]>): unknown[][] {
	const keys = Object.keys(entries).map(Number);
	if (!keys.length) return [];
	return Array.from({ length: Math.max(...keys) - first + 1 }, (_, i) => entries[first + i] ?? []);
}

/** 비고정 59·60줄, 카드 1·2·13 자리, 알림 3줄, 예산 49줄, 서은 구역 2줄이 찬 설정 */
function settings(over: { account?: Record<number, unknown[]>; cards?: Record<number, unknown[]> } = {}) {
	return parseSettings([
		rowsAt(4, over.account ?? { 59: ['식비', '외식', 46096], 60: ['식비', '배달'] }),
		rowsAt(4, over.cards ?? { 4: ['기순_롯데', '기순'], 5: ['기순_삼성'], 16: ['기순_현대'], 17: ['------'] }),
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
		expect(writes).toEqual([{ range: '계정!C61:E61', before: [['', '', '']], after: [['식비', '카페', '']], label: '지출 분류 · 비고정 소비지출 · 카페' }]);
	});

	it('자리가 없으면 오류', () => {
		const full = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [4 + i, ['월급', `수입${i}`]]));
		expect(addCategory(settings({ account: full }), 'income', '월급', '새수입')).toEqual({ error: '자리가 다 찼습니다' });
		const cards = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [4 + i, [`카드${i}`]]));
		expect(addCard(settings({ cards }), 'kisoon', { name: '새카드' })).toEqual({ error: '자리가 다 찼습니다' });
	});

	it('구분선 자리는 건너뜀', () => {
		const cards = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [4 + i, [`기순${i}`]]));
		const writes = addCard(settings({ cards: { ...cards, 17: ['------'] } }), 'seoeun', { name: '서은_새카드', settle: '서은' });
		expect(Array.isArray(writes) && writes[0].range).toBe('계정!F18:I18');   // 15번 자리(18줄), 14번 구분선 자리(17줄)는 건너뜀
		const shared = addCard(settings(), 'shared', { name: '현금' });
		expect(Array.isArray(shared) && shared[0].range).toBe('계정!F32:I32');
	});

	it('새 카드는 이름·정산·실적·계좌와 상태·날짜, 상태 기본은 사용 중', () => {
		const writes = addCard(settings(), 'kisoon', { name: '기순_우리', settle: '기순', start: '2026-03-15' });
		expect(writes).toEqual([
			{ range: '계정!F6:I6', before: [['', '', '', '']], after: [['기순_우리', '기순', '', '']], label: '카드 · 기순 · 기순_우리' },
			{ range: '계정!L6:O6', before: [['', '', '', '']], after: [['사용 중', 46096, '', '']], label: '카드 · 기순 · 기순_우리 · 상태·날짜' }
		]);
	});

	it('카드 이름은 고칠 수 없음', () => {
		const writes = updateCard(settings(), 1, { name: '바꾼이름', status: '해지', cancel: '2026-03-15' } as never);
		expect(Array.isArray(writes) && writes.map(w => w.range)).toEqual(['계정!G4:I4', '계정!L4:O4']);
		expect(JSON.stringify(writes)).not.toContain('바꾼이름');
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
		expect(setStopDate(settings(), 59, null)).toEqual([{ range: '계정!E59', before: [[46096]], after: [['']], label: '지출 분류 · 외식 · 그만 쓴 날' }]);
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
});
