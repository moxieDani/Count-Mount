// 새 지출이 시트에 이미 있는지 찾는다: 날짜(월/일)·금액·지출내용이 모두 같으면 같은 내역.
// 시트에서 읽은 값은 표시 형식("₩126,000", "10. 31")이라 비교 전에 맞춘다.
import { ledgerFieldOf } from '../card-alert/toRow';

// "2026. 10. 31", "10. 31", "10/31", "2026-10-31", "10월 31일" → "10/31"
function dayKey(value: string): string | null {
	const nums = (value.match(/\d+/g) ?? []).map(Number);
	if (nums.length >= 3 && nums[0] > 31) return `${nums[1]}/${nums[2]}`;
	if (nums.length >= 2) return `${nums[0]}/${nums[1]}`;
	return null;
}

function amountKey(value: string): number | null {
	const n = parseFloat(value.replace(/[^\d.-]/g, ''));
	return Number.isNaN(n) ? null : n;
}

function textKey(value: string): string | null {
	return value.replace(/\s/g, '').toLowerCase() || null;
}

// 칸 값은 문자열만 오지 않는다: 직접 입력한 금액은 숫자(type="number"), 빈 칸은 null
type Cell = string | number | null | undefined;
const cell = (r: Cell[], i: number) => (r[i] == null ? '' : String(r[i]));

// 같은 내역이 있으면 rows 안의 위치를, 없거나 비교할 칸(날짜·금액·지출내용)이 없으면 -1
export function findDuplicateRow(headers: string[], rows: Cell[][], row: Cell[]): number {
	const col = (kind: string) => headers.findIndex((h) => ledgerFieldOf(h) === kind);
	const date = col('date');
	const amount = col('amount');
	const merchant = col('merchant');
	if (date < 0 || amount < 0 || merchant < 0) return -1;

	const key = (r: Cell[]) => {
		const d = dayKey(cell(r, date));
		const a = amountKey(cell(r, amount));
		const m = textKey(cell(r, merchant));
		return d && a !== null && m ? `${d}|${a}|${m}` : null;
	};
	const target = key(row);
	if (!target) return -1;
	return rows.findIndex((r) => key(r) === target);
}
