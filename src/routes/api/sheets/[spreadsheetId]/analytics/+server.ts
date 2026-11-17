import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, fetch }) => {
 const authorization = request.headers.get('authorization');
 if (!authorization?.startsWith('Bearer ')) return json({ error: '로그인이 필요합니다.' }, { status: 401 });
 const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(params.spreadsheetId)}`;
 try {
  const metadata = await fetch(`${base}?fields=sheets.properties.title`, { headers: { authorization } });
  if (!metadata.ok) return json({ error: '시트 목록을 불러오지 못했습니다.' }, { status: metadata.status });
  const info = await metadata.json();
  const sheets = (info.sheets ?? []).map((s: { properties: { title: string } }) => s.properties.title as string);
  const months = Array.from({ length: 12 }, (_, i) => sheets.find((title: string) => new RegExp(`^0?${i + 1}월$`).test(title)) ?? null);
  const quote = (name: string) => `'${name.replace(/'/g, "''")}'`;
  // 분류 이름은 이름 붙인 범위 '계정항목'(비고정 30칸), 달마다 분류 표·예산은 A27:S81 (2026-11-17 재조정)
  const ranges = ['계정항목', ...months.flatMap((name: string | null) => name ? [`${quote(name)}!Y26:AD126`, `${quote(name)}!A27:S81`] : [])];
  const query = new URLSearchParams();
  ranges.forEach(range => query.append('ranges', range));
  const response = await fetch(`${base}/values:batchGet?${query}`, { headers: { authorization } });
  if (!response.ok) return json({ error: '월별 데이터를 불러오지 못했습니다.' }, { status: response.status });
  const data = await response.json();
  const values = data.valueRanges ?? [];
  const accountNames = (values[0]?.values ?? []).flat().map((v: unknown) => String(v).trim()).filter(Boolean);
  let cursor = 1;
  const result = months.map((name: string | null) => {
   if (!name) return null;
   const ledger = values[cursor++]?.values ?? [];
   const budgets = (values[cursor++]?.values ?? []).map((row: string[]) => Array.from({ length: 19 }, (_, i) => row[i] ?? ''));
   return { headers: ledger[0] ?? [], rows: ledger.slice(1), budgets };
  });
  return json({ accountNames, months: result });
 } catch {
  return json({ error: '월별 데이터를 불러오는 중 오류가 발생했습니다.' }, { status: 500 });
 }
};
