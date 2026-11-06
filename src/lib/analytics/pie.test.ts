import { describe, expect, it } from 'vitest';
import { pieSlicePath } from './pie';

describe('파이 차트 조각', () => {
 it('각 조각의 실제 영역을 닫힌 경로로 만든다', () => {
  expect(pieSlicePath(0, 25)).toBe('M 21 21 L 21 1 A 20 20 0 0 1 41 21 Z');
  expect(pieSlicePath(25, 25)).toBe('M 21 21 L 41 21 A 20 20 0 0 1 21 41 Z');
 });
 it('전체 원도 두 개의 호로 표시한다', () => {
  expect(pieSlicePath(0, 100).match(/ A /g)).toHaveLength(2);
 });
});
