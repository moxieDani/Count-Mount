<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { CARD_COMPANIES, CARD_GROUPS, CARD_STATUSES, SECTIONS, type GroupKey, type SectionKey } from '$lib/settings/layout';
	import type { Card, CardAlert, YearSettings } from '$lib/settings/read';
	import {
		addCard, addCategory, clearCardAlert, clearFixedRule, clearTransferRow, describe, setBudget, setCardAlert,
		setFixedRule, setStopDate, setTransferIncome, setTransferMemo, setTransferRow, updateCard,
		type CellWrite, type Result
	} from '$lib/settings/changes';

	// 해마다 가계부 설정 (jarvis-core ledger-settings-design 7장). 바꾸기 하나마다: 미리 보기 → 확인 → 저장.
	// 저장 직전 서버가 다시 읽어 화면을 연 뒤 바뀌었으면(409) 쓰지 않고 다시 불러올지 묻는다.

	const TRANSFER_HEADS = ['항목', '금액', '변경 금액', '자동이체 예약', '카드', '결제(지출) 방법', '은행', '자동이체', '실제 지출', '메모'];
	const auth = () => ({ Authorization: `Bearer ${page.data.session?.accessToken}` });

	let years = $state<{ year: number; spreadsheetId: string }[]>([]);
	let year = $state<number | null>(null);
	let settings = $state<YearSettings | null>(null);
	let loading = $state(true);
	let error = $state('');
	let notice = $state('');
	let pending = $state<{ writes: CellWrite[]; lines: string[] } | null>(null);
	let conflict = $state(false);
	let saving = $state(false);
	let open = $state<Record<string, boolean>>({ categories: true });

	const spreadsheetId = $derived(years.find(y => y.year === year)?.spreadsheetId ?? null);

	let latest = 0;
	async function loadYears() {
		loading = true;
		error = '';
		try {
			const res = await fetch('/api/settings', { headers: auth() });
			const data = await res.json();
			if (!res.ok) throw new Error(data.error);
			years = data.years;
			const thisYear = new Date().getFullYear();
			year = years.some(y => y.year === thisYear) ? thisYear : years.at(-1)?.year ?? null;
			if (year !== null) await loadSettings();
			else loading = false;
		} catch (e) {
			error = e instanceof Error ? e.message : '해 목록을 불러오지 못했습니다.';
			loading = false;
		}
	}

	async function loadSettings(quiet = false) {
		if (!spreadsheetId || year === null) return;
		const id = ++latest;
		if (!quiet) loading = true;
		error = '';
		try {
			const res = await fetch(`/api/settings/${spreadsheetId}?year=${year}`, { headers: auth() });
			const data = await res.json();
			if (id !== latest) return;
			if (!res.ok) throw new Error(data.error);
			settings = data;
			resetForms();
		} catch (e) {
			if (id === latest) error = e instanceof Error ? e.message : '설정을 불러오지 못했습니다.';
		} finally {
			if (id === latest) loading = false;
		}
	}

	export function refresh() {
		return year === null ? loadYears() : loadSettings(true);
	}

	onMount(() => {
		loadYears();
	});

	/** 바꾸기 결과를 미리 보기로 띄운다(오류면 오류 글). */
	function propose(result: Result) {
		notice = '';
		if ('error' in result) {
			notice = result.error;
			return;
		}
		if (result.length === 0) {
			notice = '바뀐 것이 없습니다.';
			return;
		}
		pending = { writes: result, lines: describe(result) };
	}

	async function confirmSave() {
		if (!pending || !spreadsheetId || year === null) return;
		saving = true;
		try {
			const res = await fetch(`/api/settings/${spreadsheetId}`, {
				method: 'POST',
				headers: { ...auth(), 'Content-Type': 'application/json' },
				body: JSON.stringify({ year, writes: pending.writes })
			});
			const data = await res.json();
			pending = null;
			if (res.status === 409) {
				conflict = true;
				return;
			}
			if (!res.ok) throw new Error(data.error);
			notice = data.logged === false ? '저장했습니다. (설정 기록은 남기지 못했습니다)' : '저장했습니다.';
			await loadSettings(true);
		} catch (e) {
			notice = e instanceof Error ? e.message : '저장하지 못했습니다.';
		} finally {
			saving = false;
		}
	}

	async function reloadAfterConflict() {
		conflict = false;
		await loadSettings();
	}

	// ── 지출 분류 ──
	let newCategory = $state<Record<string, { group: string; newGroup: string; name: string }>>({});
	let stopDraft = $state<Record<number, string>>({});
	const groupsOf = (key: SectionKey) => [...new Set((settings?.categories ?? []).filter(c => c.section === key && c.group).map(c => c.group))];
	const freeCount = (key: SectionKey) => (settings?.categories ?? []).filter(c => c.section === key && !c.name).length;

	function submitCategory(key: SectionKey) {
		if (!settings) return;
		const f = newCategory[key];
		const group = f.group === '__new' ? f.newGroup.trim() : f.group;
		if (!group) {
			notice = '구분을 고르거나 적어 주세요';
			return;
		}
		propose(addCategory(settings, key, group, f.name));
	}

	// ── 카드 ──
	type CardDraft = { settle: string; perf: string; account: string; status: string; start: string; expiry: string; cancel: string };
	let cardDraft = $state<Record<number, CardDraft>>({});
	let newCard = $state<Record<string, CardDraft & { name: string }>>({});
	let newAlert = $state<Record<string, { company: string; front: string; back: string; sms: string }>>({});
	const cardsOf = (key: GroupKey) => (settings?.cards ?? []).filter(c => c.group === key);
	const alertsOf = (name: string) => (settings?.alerts ?? []).filter(a => a.method === name);
	const orphanAlerts = () => (settings?.alerts ?? []).filter(a => !(settings?.cards ?? []).some(c => c.name && c.name === a.method));
	const emptyCard = (): CardDraft => ({ settle: '', perf: '', account: '', status: '사용 중', start: '', expiry: '', cancel: '' });

	function submitCardUpdate(card: Card) {
		if (!settings) return;
		const d = cardDraft[card.slot];
		propose(updateCard(settings, card.slot, {
			settle: d.settle, perf: d.perf, account: d.account, status: d.status,
			start: d.start || null, expiry: d.expiry || null, cancel: d.cancel || null
		}));
	}

	function submitNewCard(key: GroupKey) {
		if (!settings) return;
		const d = newCard[key];
		propose(addCard(settings, key, { ...d, start: d.start || null, expiry: d.expiry || null, cancel: d.cancel || null }));
	}

	function submitAlert(method: string, row: number | null) {
		if (!settings) return;
		const d = newAlert[row === null ? `new:${method}` : `row:${row}`];
		const sms = d.sms.trim() ? Number(d.sms.replace(/[^\d]/g, '')) : null;
		propose(setCardAlert(settings, row, { method, company: d.company, front: d.front.trim(), back: d.back.trim(), smsAmount: sms }));
	}

	// ── 예산 ──
	let budgetDraft = $state<Record<number, string>>({});
	function submitBudgets() {
		if (!settings) return;
		const writes: CellWrite[] = [];
		for (const b of settings.budgets) {
			const text = (budgetDraft[b.row] ?? '').replace(/[^\d-]/g, '');
			const amount = text === '' ? null : Number(text);
			if (amount === b.amount) continue;
			const r = setBudget(settings, b.row, amount);
			if ('error' in r) return propose(r);
			writes.push(...r);
		}
		propose(writes);
	}

	// ── 자동이체 내역 ──
	let transferDraft = $state<Record<string, string[]>>({});
	let incomeDraft = $state<Record<string, string>>({});
	let memoDraft = $state<Record<string, string>>({});

	// ── 고정비 자동 채우기 ──
	let fixedDraft = $state<Record<string, { label: string; text: string }>>({});
	const fixedLabels = () => (settings?.categories ?? []).filter(c => c.section === 'fixed' && c.name).map(c => c.name);

	/** 불러올 때마다 입력 칸을 지금 값으로 채운다. */
	function resetForms() {
		if (!settings) return;
		newCategory = Object.fromEntries(SECTIONS.map(s => [s.key, { group: groupsOf(s.key)[0] ?? '__new', newGroup: '', name: '' }]));
		stopDraft = Object.fromEntries(settings.categories.filter(c => c.name).map(c => [c.row, c.stop ?? '']));
		cardDraft = Object.fromEntries(settings.cards.filter(c => c.name).map(c => [c.slot, {
			settle: c.settle, perf: c.perf, account: c.account, status: c.status || '사용 중',
			start: c.start ?? '', expiry: c.expiry ?? '', cancel: c.cancel ?? ''
		}]));
		newCard = Object.fromEntries(CARD_GROUPS.map(g => [g.key, { ...emptyCard(), name: '' }]));
		const alertForms: Record<string, { company: string; front: string; back: string; sms: string }> = {};
		for (const a of settings.alerts) alertForms[`row:${a.row}`] = { company: a.company, front: a.front, back: a.back, sms: a.smsAmount === null ? '' : String(a.smsAmount) };
		for (const c of settings.cards.filter(c => c.name)) alertForms[`new:${c.name}`] = { company: CARD_COMPANIES[0], front: '', back: '', sms: '' };
		newAlert = alertForms;
		budgetDraft = Object.fromEntries(settings.budgets.map(b => [b.row, b.amount === null ? '' : String(b.amount)]));
		const tDraft: Record<string, string[]> = {};
		for (const t of settings.transfers) {
			for (const r of t.rows) tDraft[`${t.name}:${r.row}`] = [...r.cells];
			tDraft[`${t.name}:new`] = Array.from({ length: 10 }, () => '');
		}
		transferDraft = tDraft;
		incomeDraft = Object.fromEntries(settings.transfers.map(t => [t.name, t.income === null ? '' : String(t.income)]));
		memoDraft = Object.fromEntries(settings.transfers.map(t => [t.name, t.memo]));
		const fDraft: Record<string, { label: string; text: string }> = { new: { label: '', text: '' } };
		for (const r of settings.fixedRules) fDraft[`row:${r.row}`] = { label: r.label, text: r.text };
		fixedDraft = fDraft;
	}

	const toggle = (key: string) => (open = { ...open, [key]: !open[key] });
	const won = (n: number | null) => (n === null ? '' : `${n.toLocaleString('ko-KR')}원`);
	const alertText = (a: CardAlert) => [a.company, a.front && `앞 ${a.front}`, a.back && `끝 ${a.back}`, a.smsAmount !== null && `문자 ${won(a.smsAmount)}`].filter(Boolean).join(' · ');
</script>

<section class="settings">
	<div class="year-bar">
		<label>해
			<select bind:value={year} onchange={() => loadSettings()} disabled={loading || years.length === 0}>
				{#each years as y}<option value={y.year}>{y.year}</option>{/each}
			</select>
		</label>
		{#if notice}<p class="notice" role="status">{notice}</p>{/if}
	</div>

	{#if loading}
		<p class="muted">설정을 불러오는 중...</p>
	{:else if error}
		<p class="error">{error}</p>
		<button class="btn" onclick={() => (year === null ? loadYears() : loadSettings())}>다시 시도</button>
	{:else if years.length === 0}
		<p class="muted">가계부 문서를 찾지 못했습니다.</p>
	{:else if settings}
		<!-- 지출 분류 -->
		<div class="block">
			<button class="block-head" onclick={() => toggle('categories')}>지출 분류 <span>{open.categories ? '접기' : '펼치기'}</span></button>
			{#if open.categories}
				{#each SECTIONS as sec}
					<h3>{sec.name} <small>빈 자리 {freeCount(sec.key)}개</small></h3>
					<ul class="rows">
						{#each settings.categories.filter(c => c.section === sec.key && c.name) as c (c.row)}
							<li class="row">
								<span class="name">{c.group ? `${c.group} · ` : ''}{c.name}</span>
								<span class="inline">
									<label class="small">그만 쓴 날 <input type="date" bind:value={stopDraft[c.row]} /></label>
									<button class="btn small" onclick={() => settings && propose(setStopDate(settings, c.row, stopDraft[c.row] || null))}>적기</button>
								</span>
							</li>
						{/each}
					</ul>
					{#if freeCount(sec.key) === 0}
						<p class="muted">자리가 다 찼습니다</p>
					{:else if newCategory[sec.key]}
						<div class="form">
							<select bind:value={newCategory[sec.key].group}>
								{#each groupsOf(sec.key) as g}<option value={g}>{g}</option>{/each}
								<option value="__new">새 구분</option>
							</select>
							{#if newCategory[sec.key].group === '__new'}<input placeholder="새 구분 이름" bind:value={newCategory[sec.key].newGroup} />{/if}
							<input placeholder="분류 이름" bind:value={newCategory[sec.key].name} />
							<button class="btn" onclick={() => submitCategory(sec.key)}>더하기</button>
						</div>
					{/if}
				{/each}
			{/if}
		</div>

		<!-- 카드 -->
		<div class="block">
			<button class="block-head" onclick={() => toggle('cards')}>카드 <span>{open.cards ? '접기' : '펼치기'}</span></button>
			{#if open.cards}
				{#each CARD_GROUPS as g}
					<h3>{g.name} <small>빈 자리 {cardsOf(g.key).filter(c => !c.name).length}개</small></h3>
					{#each cardsOf(g.key).filter(c => c.name) as c (c.slot)}
						{#if cardDraft[c.slot]}
							<div class="card">
								<strong>{c.name}</strong>
								<div class="grid">
									<label>정산 <input bind:value={cardDraft[c.slot].settle} /></label>
									<label>실적 <input bind:value={cardDraft[c.slot].perf} /></label>
									<label>연결된 계좌 <input bind:value={cardDraft[c.slot].account} /></label>
									<label>상태 <select bind:value={cardDraft[c.slot].status}>{#each CARD_STATUSES as st}<option>{st}</option>{/each}</select></label>
									<label>시작일 <input type="date" bind:value={cardDraft[c.slot].start} /></label>
									<label>만료일 <input type="date" bind:value={cardDraft[c.slot].expiry} /></label>
									<label>해지일 <input type="date" bind:value={cardDraft[c.slot].cancel} /></label>
								</div>
								<button class="btn small" onclick={() => submitCardUpdate(c)}>고치기</button>
								<div class="alerts">
									<span class="muted">알림 연결</span>
									{#each alertsOf(c.name) as a (a.row)}
										{#if newAlert[`row:${a.row}`]}
											<div class="form">
												<span class="muted">{alertText(a)}</span>
												<select bind:value={newAlert[`row:${a.row}`].company}>{#each CARD_COMPANIES as co}<option>{co}</option>{/each}</select>
												<input placeholder="앞자리" bind:value={newAlert[`row:${a.row}`].front} />
												<input placeholder="끝자리" bind:value={newAlert[`row:${a.row}`].back} />
												<input placeholder="문자 오는 금액" inputmode="numeric" bind:value={newAlert[`row:${a.row}`].sms} />
												<button class="btn small" onclick={() => submitAlert(c.name, a.row)}>고치기</button>
												<button class="btn small danger" onclick={() => settings && propose(clearCardAlert(settings, a.row))}>지우기</button>
											</div>
										{/if}
									{/each}
									{#if newAlert[`new:${c.name}`]}
										<div class="form">
											<select bind:value={newAlert[`new:${c.name}`].company}>{#each CARD_COMPANIES as co}<option>{co}</option>{/each}</select>
											<input placeholder="앞자리 (숫자와 *)" bind:value={newAlert[`new:${c.name}`].front} />
											<input placeholder="끝자리 (숫자와 *)" bind:value={newAlert[`new:${c.name}`].back} />
											<input placeholder="문자 오는 금액 (비우면 50,000)" inputmode="numeric" bind:value={newAlert[`new:${c.name}`].sms} />
											<button class="btn small" onclick={() => submitAlert(c.name, null)}>알림 연결 더하기</button>
										</div>
									{/if}
								</div>
							</div>
						{/if}
					{/each}
					{#if cardsOf(g.key).every(c => c.name)}
						<p class="muted">자리가 다 찼습니다</p>
					{:else if newCard[g.key]}
						<div class="card new">
							<strong>새 카드</strong>
							<div class="grid">
								<label>이름 <input bind:value={newCard[g.key].name} /></label>
								<label>정산 <input bind:value={newCard[g.key].settle} /></label>
								<label>실적 <input bind:value={newCard[g.key].perf} /></label>
								<label>연결된 계좌 <input bind:value={newCard[g.key].account} /></label>
								<label>상태 <select bind:value={newCard[g.key].status}>{#each CARD_STATUSES as st}<option>{st}</option>{/each}</select></label>
								<label>시작일 <input type="date" bind:value={newCard[g.key].start} /></label>
								<label>만료일 <input type="date" bind:value={newCard[g.key].expiry} /></label>
							</div>
							<button class="btn" onclick={() => submitNewCard(g.key)}>더하기</button>
						</div>
					{/if}
				{/each}
				{#if orphanAlerts().length}
					<h3>카드 이름과 맞지 않는 알림 연결</h3>
					{#each orphanAlerts() as a (a.row)}
						<div class="row"><span>{a.method} · {alertText(a)}</span>
							<button class="btn small danger" onclick={() => settings && propose(clearCardAlert(settings, a.row))}>지우기</button></div>
					{/each}
				{/if}
			{/if}
		</div>

		<!-- 예산 -->
		<div class="block">
			<button class="block-head" onclick={() => toggle('budgets')}>예산 <span>{open.budgets ? '접기' : '펼치기'}</span></button>
			{#if open.budgets}
				<ul class="rows">
					{#each settings.budgets as b (b.row)}
						<li class="row"><span class="name">{b.label}</span><input class="amount" inputmode="numeric" bind:value={budgetDraft[b.row]} /></li>
					{/each}
				</ul>
				<button class="btn" onclick={submitBudgets}>저장</button>
			{/if}
		</div>

		<!-- 자동이체 내역 -->
		<div class="block">
			<button class="block-head" onclick={() => toggle('transfers')}>자동이체 내역 <span>{open.transfers ? '접기' : '펼치기'}</span></button>
			{#if open.transfers}
				{#each settings.transfers as t}
					<h3>{t.name} <small>빈 줄 {20 - t.rows.length}개</small></h3>
					{#each [...t.rows.map(r => ({ key: `${t.name}:${r.row}`, row: r.row })), { key: `${t.name}:new`, row: null }] as item (item.key)}
						{#if transferDraft[item.key] && (item.row !== null || t.rows.length < 20)}
							<details class="card">
								<summary>{item.row === null ? '새 줄 더하기' : transferDraft[item.key][0] || `${item.row}줄`}</summary>
								<div class="grid">
									{#each TRANSFER_HEADS as head, i}<label>{head} <input bind:value={transferDraft[item.key][i]} /></label>{/each}
								</div>
								<button class="btn small" onclick={() => settings && propose(setTransferRow(settings, t.name, item.row, transferDraft[item.key]))}>{item.row === null ? '더하기' : '고치기'}</button>
								{#if item.row !== null}
									<button class="btn small danger" onclick={() => settings && item.row !== null && propose(clearTransferRow(settings, t.name, item.row))}>지우기</button>
								{/if}
							</details>
						{/if}
					{/each}
					<div class="form">
						<label>월 수입 <input inputmode="numeric" bind:value={incomeDraft[t.name]} /></label>
						<button class="btn small" onclick={() => settings && propose(setTransferIncome(settings, t.name, incomeDraft[t.name].trim() ? Number(incomeDraft[t.name].replace(/[^\d-]/g, '')) : null))}>적기</button>
					</div>
					<div class="form">
						<label>메모 <input bind:value={memoDraft[t.name]} /></label>
						<button class="btn small" onclick={() => settings && propose(setTransferMemo(settings, t.name, memoDraft[t.name]))}>적기</button>
					</div>
				{/each}
			{/if}
		</div>

		<!-- 고정비 자동 채우기 -->
		<div class="block">
			<button class="block-head" onclick={() => toggle('fixed')}>고정비 자동 채우기 <span>{open.fixed ? '접기' : '펼치기'}</span></button>
			{#if open.fixed}
				<datalist id="fixed-labels">{#each fixedLabels() as l}<option value={l}></option>{/each}</datalist>
				{#each settings.fixedRules as r (r.row)}
					{#if fixedDraft[`row:${r.row}`]}
						<div class="form">
							<input list="fixed-labels" placeholder="분류" bind:value={fixedDraft[`row:${r.row}`].label} />
							<input placeholder="명세서에서 찾을 글" bind:value={fixedDraft[`row:${r.row}`].text} />
							<button class="btn small" onclick={() => settings && propose(setFixedRule(settings, r.row, fixedDraft[`row:${r.row}`]))}>고치기</button>
							<button class="btn small danger" onclick={() => settings && propose(clearFixedRule(settings, r.row))}>지우기</button>
						</div>
					{/if}
				{/each}
				{#if settings.fixedRules.length >= 20}
					<p class="muted">자리가 다 찼습니다</p>
				{:else if fixedDraft.new}
					<div class="form">
						<input list="fixed-labels" placeholder="분류 (고정비)" bind:value={fixedDraft.new.label} />
						<input placeholder="명세서에서 찾을 글" bind:value={fixedDraft.new.text} />
						<button class="btn small" onclick={() => settings && propose(setFixedRule(settings, null, fixedDraft.new))}>더하기</button>
					</div>
				{/if}
			{/if}
		</div>

		<!-- 설정 기록 -->
		<div class="block">
			<button class="block-head" onclick={() => toggle('logs')}>설정 기록 <span>{open.logs ? '접기' : '펼치기'}</span></button>
			{#if open.logs}
				{#if settings.logs.length === 0}<p class="muted">아직 기록이 없습니다.</p>{/if}
				<ul class="rows">
					{#each settings.logs.slice(-30).reverse() as log}
						<li class="log"><span class="muted">{log.when} {log.who}</span><span>{log.where}: {log.before} → {log.after}</span></li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</section>

{#if pending}
	<div class="overlay" role="dialog" aria-modal="true">
		<div class="dialog">
			<h3>이렇게 바꿀까요?</h3>
			<ul>{#each pending.lines as line}<li>{line}</li>{/each}</ul>
			<div class="actions">
				<button class="btn" onclick={() => (pending = null)} disabled={saving}>그만두기</button>
				<button class="btn primary" onclick={confirmSave} disabled={saving}>{saving ? '저장하는 중...' : '저장'}</button>
			</div>
		</div>
	</div>
{/if}

{#if conflict}
	<div class="overlay" role="dialog" aria-modal="true">
		<div class="dialog">
			<h3>다른 곳에서 바뀌었습니다.</h3>
			<p>화면을 연 뒤 시트나 다른 앱에서 같은 칸이 바뀌어 저장하지 않았습니다. 다시 불러올까요?</p>
			<div class="actions">
				<button class="btn" onclick={() => (conflict = false)}>닫기</button>
				<button class="btn primary" onclick={reloadAfterConflict}>다시 불러오기</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.settings { padding: 12px 16px 48px; max-width: 900px; margin: 0 auto; }
	.year-bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 12px; }
	.notice { margin: 0; color: #315fda; font-weight: 600; }
	.error { color: #c0392b; }
	.muted { color: #78859a; }
	.block { background: white; border: 1px solid #e8edf5; border-radius: 12px; margin-bottom: 12px; padding: 8px 12px; }
	.block-head { width: 100%; display: flex; justify-content: space-between; border: 0; background: none; font-size: 1.05rem; font-weight: 700; padding: 8px 0; cursor: pointer; }
	.block-head span { color: #78859a; font-weight: 500; font-size: 0.85rem; }
	h3 { font-size: 0.95rem; margin: 14px 0 6px; }
	h3 small { color: #78859a; font-weight: 500; }
	.rows { list-style: none; margin: 0; padding: 0; }
	.row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #f1f4f9; }
	.row .name { font-weight: 600; }
	.inline { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
	.small { font-size: 0.85rem; }
	.form { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 8px 0; }
	.card { border: 1px solid #eef1f6; border-radius: 10px; padding: 8px; margin: 8px 0; }
	.card.new { background: #fafcff; }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 6px; margin: 6px 0; }
	.grid label { display: flex; flex-direction: column; font-size: 0.8rem; color: #5a6578; }
	.alerts { margin-top: 6px; }
	input, select { padding: 6px 8px; border: 1px solid #d6dde8; border-radius: 8px; font-size: 0.9rem; min-width: 0; }
	.amount { width: 140px; text-align: right; }
	.btn { border: 1px solid #d6dde8; background: white; border-radius: 8px; padding: 6px 12px; cursor: pointer; }
	.btn.small { padding: 4px 8px; font-size: 0.85rem; }
	.btn.primary { background: #315fda; color: white; border-color: #315fda; }
	.btn.danger { color: #c0392b; }
	.log { display: flex; flex-direction: column; padding: 6px 0; border-bottom: 1px solid #f1f4f9; font-size: 0.85rem; }
	.overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
	.dialog { background: white; border-radius: 12px; padding: 16px; max-width: 520px; width: 100%; max-height: 80vh; overflow: auto; }
	.dialog ul { padding-left: 18px; }
	.actions { display: flex; justify-content: flex-end; gap: 8px; }
	@media (max-width: 600px) {
		.settings { padding: 8px 12px 40px; }
		.amount { width: 110px; }
	}
</style>
