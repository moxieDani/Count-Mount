// 맨 위에서 아래로 당겨 새로고침. 표시줄 높이(px)를 정한다.
export const PULL_THRESHOLD = 70; // 이만큼 내려온 뒤 손을 떼면 새로고침
export const PULL_MAX = 110;
export const REFRESHING_HEIGHT = 52; // 새로고침하는 동안 남겨 두는 높이

// 고무줄처럼 손가락 이동의 절반만 따라온다. 그래서 길게 당겨야 새로고침된다.
export function pullDistance(dy: number): number {
	return dy <= 0 ? 0 : Math.min(PULL_MAX, Math.round(dy * 0.5));
}
