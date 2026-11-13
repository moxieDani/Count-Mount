import { describe, expect, it } from 'vitest';
import { PULL_MAX, PULL_THRESHOLD, pullDistance } from './pull-to-refresh';

describe('pullDistance', () => {
	it('위로 밀거나 안 움직이면 0', () => {
		expect(pullDistance(0)).toBe(0);
		expect(pullDistance(-40)).toBe(0);
	});

	it('손가락보다 덜 따라와서 길게 당겨야 새로고침 지점에 닿는다', () => {
		expect(pullDistance(100)).toBe(50);
		expect(pullDistance(100)).toBeLessThan(PULL_THRESHOLD);
		expect(pullDistance(PULL_THRESHOLD * 2)).toBeGreaterThanOrEqual(PULL_THRESHOLD);
	});

	it('아무리 당겨도 최대 높이까지만', () => {
		expect(pullDistance(2000)).toBe(PULL_MAX);
	});
});
