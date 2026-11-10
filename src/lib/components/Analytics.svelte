<script lang="ts">
 import { onMount } from 'svelte';
 import { page } from '$app/state';
 import { summarizeMonth, type AccountSummary } from '$lib/analytics/summary';
 import { pieSlicePath } from '$lib/analytics/pie';
 let { spreadsheetId }: { spreadsheetId: string } = $props();
 type MonthData = { headers: string[]; rows: string[][]; budgets: string[][] } | null;
 let months = $state<MonthData[]>([]);
 let accountNames = $state<string[]>([]);
 let selectedMonth = $state(new Date().getMonth());
 let selectedAccount = $state('');
 let showAll = $state(false);
 let loading = $state(true);
 let error = $state('');
 const colors = ['#315fda','#14a58e','#f0a43b','#e46c75','#9274d5','#49a9cc','#dc8653','#789b60','#a46b87','#718096'];
 let summaries = $derived(months.map(m => m ? summarizeMonth(m.headers, m.rows, m.budgets, accountNames) : null));
 let current = $derived(summaries[selectedMonth]);
 let selected = $derived(current?.accounts.find(a => a.name === selectedAccount) ?? current?.accounts[0]);
 let maxTotal = $derived(Math.max(1, ...summaries.map(m => Math.max(0, m?.total ?? 0))));
 let positiveTotal = $derived(current?.accounts.reduce((sum, a) => sum + Math.max(0, a.total), 0) ?? 0);
 let segments = $derived.by(() => {
  let position = 0;
  return (current?.accounts ?? []).map((account, i) => {
   const size = positiveTotal ? Math.max(0, account.total) / positiveTotal * 100 : 0;
   const offset = position; position += size;
   return { account, size, offset, color: colors[i % colors.length] };
  });
 });
 const money = (n: number) => `${n.toLocaleString('ko-KR')}원`;
 function selectAccount(a: AccountSummary) { selectedAccount = a.name; showAll = false; }
 async function load() {
  loading = true; error = '';
  try {
   const res = await fetch(`/api/sheets/${spreadsheetId}/analytics`, { headers: { Authorization: `Bearer ${page.data.session?.accessToken}` } });
   const data = await res.json();
   if (!res.ok) throw new Error(data.error);
   months = data.months; accountNames = data.accountNames;
  } catch (e) { error = e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.'; }
  finally { loading = false; }
 }
 onMount(load);
</script>

<div class="dashboard">
 <div class="intro"><div><p class="eyebrow">SPENDING INSIGHTS</p><h2>지출 한눈에 보기</h2><p>월별 흐름과 계정별 지출을 살펴보세요.</p></div><button class="refresh" onclick={load}>↻ 새로고침</button></div>
 {#if loading}<div class="state">가계부 데이터를 분석하고 있어요...</div>
 {:else if error}<div class="state">{error} <button onclick={load}>다시 시도</button></div>
 {:else}
 <section class="panel trend"><div class="section-head"><div><p class="eyebrow">MONTHLY OVERVIEW</p><h3>{new Date().getFullYear()}년 월별 지출</h3></div><span>월을 선택해 자세히 보기</span></div>
  <div class="bars">{#each summaries as summary, i}<button class:active={selectedMonth === i} class="bar-button" onclick={() => { selectedMonth = i; selectedAccount = ''; showAll = false; }} aria-label={`${i + 1}월 ${summary ? money(summary.total) : '시트 없음'}`}><span class="bar-value">{summary && summary.total ? `${Math.round(summary.total / 10000).toLocaleString()}만` : '—'}</span><span class="bar-track"><span class="bar" style={`height:${summary && summary.total > 0 ? Math.max(4, summary.total / maxTotal * 100) : 0}%`}></span></span><span class="bar-label">{i + 1}월</span></button>{/each}</div>
 </section>
 <div class="detail-heading"><div><p class="eyebrow">MONTHLY DETAILS</p><h3>{selectedMonth + 1}월 지출 분석</h3></div>{#if current}<strong>{money(current.total)}</strong>{/if}</div>
 {#if !current}<div class="state panel">이 달의 시트를 찾을 수 없습니다.</div>
 {:else if !current.accounts.length}<div class="state panel">이 달에 기록된 지출이 없습니다.</div>
 {:else}<div class="grid"><section class="panel breakdown"><div class="section-head"><div><p class="eyebrow">BY ACCOUNT</p><h3>계정별 지출</h3></div></div><div class="chart-layout"><div class="donut"><svg viewBox="0 0 42 42" aria-label="계정별 지출 비중"><circle cx="21" cy="21" r="20" fill="#e8edf5" />{#each segments as segment}{#if segment.size > 0}<path d={pieSlicePath(segment.offset, segment.size)} fill={segment.color} role="button" tabindex="0" aria-label={`${segment.account.name} ${money(segment.account.total)}`} onclick={() => selectAccount(segment.account)} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectAccount(segment.account); } }} />{/if}{/each}</svg><div><span>총 지출</span><strong>{money(current.total)}</strong></div></div><div class="legend">{#each current.accounts as account, i}<button class:selected={selected?.name === account.name} onclick={() => selectAccount(account)}><span class="dot" style={`background:${colors[i % colors.length]}`}></span><span class="legend-name">{account.name}</span><strong>{money(account.total)}</strong></button>{/each}</div></div><p class="hint">계정을 선택하면 상세 내역을 볼 수 있어요.</p></section>
 <section class="panel transactions"><div class="section-head"><div><p class="eyebrow">ACCOUNT DETAILS</p><h3>{selected?.name} 지출 내역</h3></div><span>{selected?.transactions.length ?? 0}건</span></div>
 {#if selected}<div class="budget"><span>예상 지출 대비</span>{#if selected.difference !== null}<strong class:over={selected.difference > 0}>{selected.difference > 0 ? '+' : ''}{money(selected.difference)}</strong>{:else}<strong>예산 미설정</strong>{/if}<dl class="compare"><div><dt>지출 합계</dt><dd class:over={selected.difference !== null && selected.difference > 0} class:under={selected.difference !== null && selected.difference <= 0}>{money(selected.total)}</dd></div><div><dt>예상 지출</dt><dd>{selected.budget !== null ? money(selected.budget) : '—'}</dd></div></dl>{#if selected.difference === null}<small>시트에서 일치하는 계정 예산을 찾지 못했어요</small>{/if}</div><div class="list-title"><strong>{showAll ? '전체 내역' : '금액이 큰 내역 TOP 5'}</strong><button onclick={() => showAll = !showAll}>{showAll ? '접기' : '전체보기'} →</button></div><ul>{#each (showAll ? selected.transactions : selected.transactions.slice(0, 5)) as item}<li><div><strong>{item.description}</strong><small>{item.date}{item.payment ? ` · ${item.payment}` : ''}</small>{#if item.note}<small class="note">{item.note}</small>{/if}</div><b>{money(item.amount)}</b></li>{/each}</ul>{/if}</section></div>{/if}
 {/if}
</div>
<style>
 .dashboard{box-sizing:border-box;width:100%;min-width:0;max-width:1200px;margin:auto;padding:36px 28px 70px;color:#18243a;font-family:system-ui,sans-serif}.intro,.section-head,.detail-heading,.list-title{display:flex;justify-content:space-between;align-items:center;gap:16px}.intro{margin-bottom:28px}.intro h2{font-size:30px;margin:4px 0 8px;letter-spacing:-.05em}.intro p:not(.eyebrow){color:#79859a;margin:0;font-size:14px}.eyebrow{font-size:10px;letter-spacing:.14em;font-weight:800;color:#5b7fd5;margin:0 0 8px}.refresh,.list-title button{border:0;background:#eef3ff;color:#315fda;padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer}.panel{box-sizing:border-box;min-width:0;background:white;border:1px solid #e8edf5;border-radius:20px;padding:24px;box-shadow:0 8px 28px #273f6908}.section-head h3,.detail-heading h3{font-size:19px;letter-spacing:-.04em;margin:0}.section-head>span{font-size:12px;color:#96a1b2}.trend{margin-bottom:32px}.bars{height:190px;display:flex;gap:8px;align-items:stretch;margin-top:22px}.bar-button{min-width:0;flex:1;padding:0;border:0;background:none;display:flex;flex-direction:column;align-items:center;gap:7px;cursor:pointer;color:#94a0b2;font-size:11px}.bar-value{height:14px;white-space:nowrap}.bar-track{height:130px;width:100%;display:flex;align-items:end;justify-content:center;border-bottom:1px solid #edf1f6}.bar{width:min(28px,75%);background:#dce6fa;border-radius:6px 6px 0 0}.active .bar{background:#416fe0}.active .bar-label{color:#315fda;font-weight:800}.detail-heading{margin:0 0 16px}.detail-heading>strong{font-size:22px}.grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px}.chart-layout{display:flex;align-items:center;gap:25px;margin-top:24px}.donut{width:190px;height:190px;border-radius:50%;flex:none;display:grid;place-items:center}.donut{position:relative}.donut svg{position:absolute;inset:0;width:100%;height:100%}.donut svg path[role=button]{cursor:pointer;outline:none}.donut svg path[role=button]:focus-visible{filter:brightness(.8)}.donut>div{position:relative;pointer-events:none;width:66%;height:66%;background:white;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:5px}.donut span,.hint{font-size:12px;color:#96a1b2}.donut strong{font-size:16px}.legend{flex:1;min-width:0;max-height:210px;overflow:auto}.legend button{display:flex;width:100%;align-items:center;gap:8px;border:0;background:transparent;padding:9px 8px;border-radius:8px;text-align:left;color:#4b5b73;cursor:pointer;font-size:13px}.legend button.selected{background:#f1f5ff}.legend-name{flex:1;overflow:hidden;text-overflow:ellipsis}.legend strong{white-space:nowrap;color:#253550}.dot{width:9px;height:9px;border-radius:50%;flex:none}.hint{margin:18px 0 0}.budget{display:grid;grid-template-columns:1fr auto;gap:5px;background:#f5f8fd;border-radius:12px;padding:15px;margin:22px 0;color:#718097;font-size:13px}.budget strong{color:#168a78;font-size:16px}.budget strong.over{color:#d45f61}.budget small{grid-column:1/-1;color:#98a3b2}.compare{grid-column:1/-1;display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0 0}.compare div{background:white;border-radius:10px;padding:10px 12px;min-width:0}.compare dt{font-size:12px;color:#8a96a8}.compare dd{margin:4px 0 0;font-size:16px;font-weight:800;color:#253550;white-space:nowrap}.compare dd.under{color:#168a78}.compare dd.over{color:#d45f61}.list-title{margin:20px 0 5px;font-size:13px}.list-title button{padding:7px 10px;font-size:12px}ul{padding:0;margin:0;list-style:none}li{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:15px 0;border-bottom:1px solid #f0f3f7;font-size:14px}li:last-child{border:0}li div{min-width:0}li strong{display:block;overflow-wrap:anywhere}li small{display:block;color:#99a4b3;margin-top:5px}li .note{color:#66758c;overflow-wrap:anywhere;white-space:pre-wrap}li b{white-space:nowrap}.state{text-align:center;padding:70px 20px;color:#8591a3}.state button{cursor:pointer}
 @media(max-width:800px){.bar-value{visibility:hidden}.bar-button.active .bar-value{visibility:visible;position:relative;z-index:1}.dashboard{padding:24px 16px 50px}.intro h2{font-size:25px}.intro>div{min-width:0}.refresh{flex-shrink:0}.grid{grid-template-columns:minmax(0,1fr)}.panel{padding:20px}.bars{gap:2px}.bar-value{font-size:9px}.section-head>span{font-size:11px}.chart-layout{gap:15px}.donut{width:150px;height:150px}.donut strong{font-size:14px}.legend button{font-size:12px;padding:8px 4px}.detail-heading>strong{font-size:18px}}@media(max-width:390px){.chart-layout{flex-direction:column}.legend{width:100%;max-height:none}.bars{height:160px}.bar-track{height:100px}.bar-value{font-size:8px}.section-head>span{display:none}}
</style>
