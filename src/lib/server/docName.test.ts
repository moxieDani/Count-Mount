import { describe, expect, it } from 'vitest';
import { fillDocName } from './docName';

describe('문서 이름 틀', () => {
	it('{year}는 네 자리, {yy}는 두 자리 해로 채운다', () => {
		expect(fillDocName('{year} 가계부', '2026')).toBe('2026 가계부');
		expect(fillDocName('[작업본] {yy}년 가계부', '2026')).toBe('[작업본] 26년 가계부');
	});
});
