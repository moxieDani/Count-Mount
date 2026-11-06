import { describe, it, expect } from 'vitest';
import { summarizeMonth } from './summary';

describe('월별 지출 분석', () => {
 it('계정별 합계와 높은 금액 순 내역 및 예산 차이를 계산한다', () => {
  const result = summarizeMonth(['날짜','지출 내용','결제방식','계정','금액','비고'], [
   ['1일','점심','카드','식비','12,000'], ['2일','저녁','카드','식비','25,000'], ['3일','택시','카드','교통','5,000']
  ], [['식비','','30,000'], ['교통','','10,000']], ['식비','교통']);
  expect(result.total).toBe(42000);
  expect(result.accounts[0]).toMatchObject({ name: '식비', total: 37000, budget: 30000, difference: 7000 });
  expect(result.accounts[0].transactions.map(t => t.amount)).toEqual([25000, 12000]);
  expect(result.accounts[1].difference).toBe(-5000);
 });
 it('예산이 없는 계정은 미설정으로 표시한다', () => {
  expect(summarizeMonth(['계정','금액'], [['기타','100']], [], []).accounts[0].budget).toBeNull();
 });
});
