<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import {
		CARD_COMPANIES, CARD_OWNERS, CARD_STATUSES, SECTIONS, TRANSFER_TAB, budgetTab, colName, type GroupKey, type SectionKey
	} from '$lib/settings/layout';
	import { isEmptySlot, type Card, type CardAlert, type YearSettings } from '$lib/settings/read';
	import {
		addCard, addCategory, amountText, changedOnly, clearCardAlert, clearFixedRule, clearTransferRow, describe, locked, parseAmount,
		setBudgets, setCardAlert, setFixedRule, setStopDate, setTransferIncome, setTransferMemo, setTransferRow, updateCard,
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
	// 항목은 탭으로 하나씩 보이고, 고치는 칸은 누른 것 하나만 연다(2026-11-18 화면 정리).
	const TABS = [
		{ key: 'categories', name: '지출 분류' }, { key: 'cards', name: '카드' }, { key: 'budgets', name: '예산' },
		{ key: 'transfers', name: '자동이체' }, { key: 'fixed', name: '고정비 채우기' }, { key: 'logs', name: '설정 기록' }
	] as const;
	type TabKey = (typeof TABS)[number]['key'];
	let tab = $state<TabKey>('categories');
	/** 지금 펼친 칸(예: 'cat:12', 'card:5', 'newcard:kisoon'). 하나만 연다 */
	let editing = $state<string | null>(null);
	/** 펼친 카드 안에서 연 알림 연결 칸('alert:행' 또는 'alert:new') */
	let subEditing = $state<string | null>(null);
	const toggleEdit = (key: string) => {
		editing = editing === key ? null : key;
		subEditing = null;
	};
	const toggleSub = (key: string) => (subEditing = subEditing === key ? null : key);
	function showTab(key: TabKey) {
		tab = key;
		editing = null;
		subEditing = null;
	}

	const spreadsheetId = $derived(years.find(y => y.year === year)?.spreadsheetId ?? null);
	/** 다른 칸을 따라가는 칸(시트 수식): 화면에서는 잠근다 */
	const isLocked = (tab: string, col: string, row: number | null) => !!settings && row !== null && locked(settings, tab, col, row);
	const LOCK_TITLE = '다른 칸을 따라가는 칸이라 시트에서 고칩니다';

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

	// 새해 가계부: 가장 늦은 해의 다음 해가 내년까지이면 만들 수 있다 (설정 설계 8장)
	const STEP_TEXT: Record<string, string> = { tabs: '탭 이름 바꾸기', year: '연도 적기', read: '지난해 설정 읽기', write: '설정 옮겨 적기' };
	const nextYear = $derived.by(() => {
		const last = years.at(-1)?.year;
		return last !== undefined && last + 1 <= new Date().getFullYear() + 1 ? last + 1 : null;
	});
	let creating = $state(false);
	let created = $state<{ text: string; url: string } | null>(null);

	async function createYear() {
		const target = nextYear;
		if (target === null || creating) return;
		if (!confirm(`${target} 가계부를 새로 만들까요?\n빈 틀을 복사하고 ${target - 1}년 설정(분류·카드·예산·자동이체)을 정리해 가져옵니다.`)) return;
		creating = true;
		created = null;
		try {
			const res = await fetch('/api/settings/new-year', {
				method: 'POST',
				headers: { ...auth(), 'Content-Type': 'application/json' },
				body: JSON.stringify({ year: target })
			});
			const data = await res.json();
			if (data.ok) {
				created = { text: `${target} 가계부를 만들었습니다.`, url: data.url };
				await loadYears();
				year = target;
				await loadSettings();
			} else if (data.spreadsheetId) {
				created = { text: `${target} 가계부는 만들었지만 '${STEP_TEXT[data.step] ?? data.step}' 단계에서 멈췄습니다. 문서를 열어 확인해 주세요.`, url: data.url };
				await loadYears();
			} else {
				notice = data.error ?? '새해 가계부를 만들지 못했습니다.';
			}
		} catch {
			notice = '새해 가계부를 만들지 못했습니다.';
		} finally {
			creating = false;
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
		const writes = changedOnly(result);   // 바뀐 칸이 없는 쓰기(예: 카드 상태만 바꿀 때 정산·실적·계좌)는 빼고 묻는다
		if (writes.length === 0) {
			notice = '바뀐 것이 없습니다.';
			return;
		}
		pending = { writes, lines: describe(writes) };
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
			notice = data.unchanged ? '바뀐 것이 없어 저장하지 않았습니다.'
				: data.logged === false ? '저장했습니다. (설정 기록은 남기지 못했습니다)' : '저장했습니다.';
			if (!data.unchanged) {
				editing = null;
				subEditing = null;
			}
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
	type CardDraft = { title: string; group: GroupKey | ''; settle: string; perf: string; account: string; status: string; start: string; expiry: string; cancel: string };
	let cardDraft = $state<Record<number, CardDraft>>({});
	let newCard = $state<Record<string, CardDraft & { name: string }>>({});
	let newAlert = $state<Record<string, { company: string; front: string; back: string; sms: string }>>({});
	/** 명의별 카드 (null이면 명의가 비었거나 모르는 글인 카드). 옛 구분선 줄(-만)은 카드가 아니다 */
	const cardsOf = (key: GroupKey | null) => (settings?.cards ?? []).filter(c => c.name && !/^-+$/.test(c.name) && c.group === key);
	const emptySlots = () => (settings?.cards ?? []).filter(isEmptySlot).length;
	const OWNER_SECTIONS: { key: GroupKey | null; name: string }[] = [...CARD_OWNERS, { key: null, name: '명의 없음' }];
	const alertsOf = (name: string) => (settings?.alerts ?? []).filter(a => a.method === name);
	const orphanAlerts = () => (settings?.alerts ?? []).filter(a => !(settings?.cards ?? []).some(c => c.name && c.name === a.method));
	const emptyCard = (): CardDraft => ({ title: '', group: '', settle: '', perf: '', account: '', status: '사용 중', start: '', expiry: '', cancel: '' });

	function submitCardUpdate(card: Card) {
		if (!settings) return;
		const d = cardDraft[card.slot];
		propose(updateCard(settings, card.slot, {
			title: d.title, group: d.group || undefined, settle: d.settle, perf: d.perf, account: d.account, status: d.status,
			start: d.start || null, expiry: d.expiry || null, cancel: d.cancel || null
		}));
	}

	function submitNewCard(key: GroupKey) {
		if (!settings) return;
		const { group: _unused, ...d } = newCard[key];   // 명의는 고른 묶음(key)으로 정한다
		propose(addCard(settings, key, { ...d, start: d.start || null, expiry: d.expiry || null, cancel: d.cancel || null }));
	}

	function submitAlert(method: string, row: number | null) {
		if (!settings) return;
		const d = newAlert[row === null ? `new:${method}` : `row:${row}`];
		const sms = parseAmount(d.sms);
		if (sms === undefined) return propose({ error: '문자 오는 금액은 숫자로 적어 주세요' });
		propose(setCardAlert(settings, row, { method, company: d.company, front: d.front.trim(), back: d.back.trim(), smsAmount: sms }));
	}

	// ── 예산 ──
	let budgetDraft = $state<Record<number, string>>({});
	function submitBudgets() {
		if (settings) propose(setBudgets(settings, budgetDraft));
	}

	function submitIncome(name: string) {
		if (!settings) return;
		const amount = parseAmount(incomeDraft[name] ?? '');
		propose(amount === undefined ? { error: '월 수입은 숫자로 적어 주세요' } : setTransferIncome(settings, name, amount));
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
			title: c.title, group: c.group ?? '', settle: c.settle, perf: c.perf, account: c.account, status: c.status || '사용 중',
			start: c.start ?? '', expiry: c.expiry ?? '', cancel: c.cancel ?? ''
		}]));
		newCard = Object.fromEntries(CARD_OWNERS.map(g => [g.key, { ...emptyCard(), name: '' }]));
		const alertForms: Record<string, { company: string; front: string; back: string; sms: string }> = {};
		for (const a of settings.alerts) alertForms[`row:${a.row}`] = { company: a.company, front: a.front, back: a.back, sms: a.smsAmount === null ? '' : String(a.smsAmount) };
		for (const c of settings.cards.filter(c => c.name)) alertForms[`new:${c.name}`] = { company: CARD_COMPANIES[0], front: '', back: '', sms: '' };
		newAlert = alertForms;
		budgetDraft = Object.fromEntries(settings.budgets.map(b => [b.row, amountText(b.amount)]));
		const tDraft: Record<string, string[]> = {};
		for (const t of settings.transfers) {
			for (const r of t.rows) tDraft[`${t.name}:${r.row}`] = [...r.cells];
			tDraft[`${t.name}:new`] = Array.from({ length: 10 }, () => '');
		}
		transferDraft = tDraft;
		incomeDraft = Object.fromEntries(settings.transfers.map(t => [t.name, amountText(t.income)]));
		memoDraft = Object.fromEntries(settings.transfers.map(t => [t.name, t.memo]));
		const fDraft: Record<string, { label: string; text: string }> = { new: { label: '', text: '' } };
		for (const r of settings.fixedRules) fDraft[`row:${r.row}`] = { label: r.label, text: r.text };
		fixedDraft = fDraft;
	}

	const won = (n: number | null) => (n === null ? '' : `${n.toLocaleString('ko-KR')}원`);
	/** 구분별로 묶은 분류(구분이 나오는 차례대로) */
	function categoryGroups(key: SectionKey) {
		const out: { group: string; items: NonNullable<typeof settings>['categories'] }[] = [];
		for (const c of (settings?.categories ?? []).filter(c => c.section === key && c.name)) {
			const g = out.find(o => o.group === c.group) ?? out[out.push({ group: c.group, items: [] }) - 1];
			g.items.push(c);
		}
		return out;
	}
	const editingCategory = (key: SectionKey) =>
		(settings?.categories ?? []).find(c => c.section === key && c.name && editing === `cat:${c.row}`) ?? null;
	/** 실적 칸: 숫자면 '300,000원', 아니면 적힌 글 그대로 */
	const perfText = (v: string) => (/^[\d,\s]+$/.test(v) && /\d/.test(v) ? won(Number(v.replace(/[,\s]/g, ''))) : v);
	const cardPeriod = (c: Card) =>
		c.cancel ? `해지 ${c.cancel}` : c.start || c.expiry ? `${c.start ?? ''} ~ ${c.expiry ?? ''}` : '';
	const cardSummary = (c: Card) => [
		c.settle && `정산 ${c.settle}`, c.perf && `실적 ${perfText(c.perf)}`, c.account && `계좌 ${c.account}`, cardPeriod(c),
		alertsOf(c.name).length ? `알림 ${alertsOf(c.name).length}개` : '알림 없음'
	].filter(Boolean).join(' · ');
	const alertText = (a: CardAlert) => [a.company, a.front && `앞 ${a.front}`, a.back && `끝 ${a.back}`, a.smsAmount !== null && `문자 ${won(a.smsAmount)}`].filter(Boolean).join(' · ');
</script>

<section class="settings">
	<div class="top-bar">
		<label class="year">해
			<select bind:value={year} onchange={() => loadSettings()} disabled={loading || years.length === 0}>
				{#each years as y}<option value={y.year}>{y.year}</option>{/each}
			</select>
		</label>
		{#if nextYear !== null}
			<button class="btn" onclick={createYear} disabled={creating || loading}>{creating ? '만드는 중...' : `${nextYear} 가계부 만들기`}</button>
		{/if}
	</div>
	{#if created}<p class="notice" role="status">{created.text} <a href={created.url} target="_blank" rel="noopener">문서 열기</a></p>{/if}

	{#if loading}
		<p class="muted">설정을 불러오는 중...</p>
	{:else if error}
		<p class="error">{error}</p>
		<button class="btn" onclick={() => (year === null ? loadYears() : loadSettings())}>다시 시도</button>
	{:else if years.length === 0}
		<p class="muted">가계부 문서를 찾지 못했습니다.</p>
	{:else if settings}
		<nav class="tabs" aria-label="설정 항목">
			{#each TABS as t}<button class:active={tab === t.key} onclick={() => showTab(t.key)}>{t.name}</button>{/each}
		</nav>
		{#if notice}
			<p class="notice bar" role="status"><span>{notice}</span><button class="close" aria-label="알림 닫기" onclick={() => (notice = '')}>×</button></p>
		{/if}

		{#if tab === 'categories'}
			<p class="hint">분류를 누르면 그만 쓴 날을 적을 수 있습니다.</p>
			{#each SECTIONS as sec}
				{@const free = freeCount(sec.key)}
				{@const current = editingCategory(sec.key)}
				<div class="block">
					<div class="block-title">
						<h3>{sec.name}</h3>
						<small>빈 자리 {free}개</small>
						{#if free > 0}<button class="btn small add" onclick={() => toggleEdit(`newcat:${sec.key}`)}>+ 분류 더하기</button>{/if}
					</div>
					{#if editing === `newcat:${sec.key}` && newCategory[sec.key]}
						<div class="panel">
							<div class="form">
								<select bind:value={newCategory[sec.key].group}>
									{#each groupsOf(sec.key) as g}<option value={g}>{g}</option>{/each}
									<option value="__new">새 구분</option>
								</select>
								{#if newCategory[sec.key].group === '__new'}<input placeholder="새 구분 이름" bind:value={newCategory[sec.key].newGroup} />{/if}
								<input placeholder="분류 이름" bind:value={newCategory[sec.key].name} />
							</div>
							<div class="panel-actions">
								<button class="btn" onclick={() => (editing = null)}>닫기</button>
								<button class="btn primary" onclick={() => submitCategory(sec.key)}>더하기</button>
							</div>
						</div>
					{/if}
					{#each categoryGroups(sec.key) as g}
						<div class="cat-group">
							{#if g.group}<span class="group-name">{g.group}</span>{/if}
							<div class="chips">
								{#each g.items as c (c.row)}
									<button class="chip" class:active={editing === `cat:${c.row}`} class:stopped={!!c.stop} onclick={() => toggleEdit(`cat:${c.row}`)}>
										{c.name}{#if c.stop}<small>~{c.stop}</small>{/if}
									</button>
								{/each}
							</div>
						</div>
					{/each}
					{#if current}
						<div class="panel">
							<div class="form">
								<strong>{current.name}</strong>
								<label class="small">그만 쓴 날 <input type="date" bind:value={stopDraft[current.row]} /></label>
							</div>
							<div class="panel-actions">
								<button class="btn" onclick={() => (editing = null)}>닫기</button>
								<button class="btn primary" onclick={() => settings && propose(setStopDate(settings, current.row, stopDraft[current.row] || null))}>적기</button>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		{:else if tab === 'cards'}
			<p class="hint">빈 자리 {emptySlots()}개 · 30자리를 명의와 상관없이 함께 씁니다. 카드를 누르면 고칠 수 있습니다.</p>
			{#each OWNER_SECTIONS as g}
				{#if g.key !== null || cardsOf(null).length}
					<div class="block">
						<div class="block-title">
							<h3>{g.name}</h3>
							<small>{cardsOf(g.key).length}장</small>
							{#if g.key !== null && emptySlots() > 0}<button class="btn small add" onclick={() => toggleEdit(`newcard:${g.key}`)}>+ 새 카드</button>{/if}
						</div>
						{#if g.key === null}<p class="hint">명의를 골라 고치면 그 명의로 옮겨집니다.</p>{/if}
						{#if g.key !== null && editing === `newcard:${g.key}` && newCard[g.key]}
							{@const key = g.key}
							<div class="panel">
								<div class="grid">
									<label>결제방식 이름 <input placeholder="예: 기순_우리SKT" bind:value={newCard[key].name} /></label>
									<label>카드 이름 <input placeholder="예: SKT우리카드" bind:value={newCard[key].title} /></label>
									<label>정산 <input bind:value={newCard[key].settle} /></label>
									<label>실적 <input placeholder="예: 300000" bind:value={newCard[key].perf} /></label>
									<label>연결된 계좌 <input bind:value={newCard[key].account} /></label>
									<label>상태 <select bind:value={newCard[key].status}>{#each CARD_STATUSES as st}<option>{st}</option>{/each}</select></label>
									<label>시작일 <input type="date" bind:value={newCard[key].start} /></label>
									<label>만료일 <input type="date" bind:value={newCard[key].expiry} /></label>
								</div>
								<div class="panel-actions">
									<button class="btn" onclick={() => (editing = null)}>닫기</button>
									<button class="btn primary" onclick={() => submitNewCard(key)}>더하기</button>
								</div>
							</div>
						{/if}
						<ul class="list">
							{#each cardsOf(g.key) as c (c.slot)}
								{@const isOpen = editing === `card:${c.slot}`}
								<li class="item" class:open={isOpen}>
									<button class="item-head" onclick={() => toggleEdit(`card:${c.slot}`)} aria-expanded={isOpen}>
										<span class="item-name"><strong>{c.title || c.name}</strong>{#if c.title}<span class="muted">{c.name}</span>{/if}</span>
										<span class="badge" class:off={!!c.status && c.status !== '사용 중'}>{c.status || '사용 중'}</span>
									</button>
									<p class="item-sub">{cardSummary(c)}</p>
									{#if isOpen && cardDraft[c.slot]}
										<div class="panel">
											<div class="grid">
												<label>카드 이름 <input placeholder="예: SKT우리카드" bind:value={cardDraft[c.slot].title} /></label>
												<label>명의 <select bind:value={cardDraft[c.slot].group}>
													{#if !c.group}<option value="">고르세요</option>{/if}
													{#each CARD_OWNERS as o}<option value={o.key}>{o.name}</option>{/each}
												</select></label>
												<label>정산 <input bind:value={cardDraft[c.slot].settle} /></label>
												<label>실적 <input placeholder="예: 300000" bind:value={cardDraft[c.slot].perf} /></label>
												<label>연결된 계좌 <input bind:value={cardDraft[c.slot].account} /></label>
												<label>상태 <select bind:value={cardDraft[c.slot].status}>{#each CARD_STATUSES as st}<option>{st}</option>{/each}</select></label>
												<label>시작일 <input type="date" bind:value={cardDraft[c.slot].start} /></label>
												<label>만료일 <input type="date" bind:value={cardDraft[c.slot].expiry} /></label>
												<label>해지일 <input type="date" bind:value={cardDraft[c.slot].cancel} /></label>
											</div>
											<div class="panel-actions">
												<button class="btn" onclick={() => (editing = null)}>닫기</button>
												<button class="btn primary" onclick={() => submitCardUpdate(c)}>고치기</button>
											</div>
											<div class="alerts">
												<div class="block-title">
													<h4>알림 연결</h4>
													<button class="btn small add" onclick={() => toggleSub('alert:new')}>+ 알림 연결 더하기</button>
												</div>
												{#if subEditing === 'alert:new' && newAlert[`new:${c.name}`]}
													<div class="form">
														<select bind:value={newAlert[`new:${c.name}`].company}>{#each CARD_COMPANIES as co}<option>{co}</option>{/each}</select>
														<input placeholder="앞자리 (숫자와 *)" bind:value={newAlert[`new:${c.name}`].front} />
														<input placeholder="끝자리 (숫자와 *)" bind:value={newAlert[`new:${c.name}`].back} />
														<input placeholder="문자 오는 금액 (비우면 50,000)" inputmode="numeric" bind:value={newAlert[`new:${c.name}`].sms} />
														<button class="btn small primary" onclick={() => submitAlert(c.name, null)}>더하기</button>
													</div>
												{/if}
												{#each alertsOf(c.name) as a (a.row)}
													<div class="row">
														<span>{alertText(a)}</span>
														<span class="inline">
															<button class="btn small" onclick={() => toggleSub(`alert:${a.row}`)}>{subEditing === `alert:${a.row}` ? '닫기' : '고치기'}</button>
															<button class="btn small danger" onclick={() => settings && propose(clearCardAlert(settings, a.row))}>지우기</button>
														</span>
													</div>
													{#if subEditing === `alert:${a.row}` && newAlert[`row:${a.row}`]}
														<div class="form">
															<select bind:value={newAlert[`row:${a.row}`].company}>{#each CARD_COMPANIES as co}<option>{co}</option>{/each}</select>
															<input placeholder="앞자리" bind:value={newAlert[`row:${a.row}`].front} />
															<input placeholder="끝자리" bind:value={newAlert[`row:${a.row}`].back} />
															<input placeholder="문자 오는 금액" inputmode="numeric" bind:value={newAlert[`row:${a.row}`].sms} />
															<button class="btn small primary" onclick={() => submitAlert(c.name, a.row)}>고치기</button>
														</div>
													{/if}
												{:else}
													<p class="hint">연결된 알림이 없습니다.</p>
												{/each}
											</div>
										</div>
									{/if}
								</li>
							{/each}
						</ul>
						{#if g.key !== null && cardsOf(g.key).length === 0}<p class="hint">아직 카드가 없습니다.</p>{/if}
					</div>
				{/if}
			{/each}
			{#if orphanAlerts().length}
				<div class="block orphans">
					<div class="block-title"><h3>카드 이름과 맞지 않는 알림 연결</h3></div>
					{#each orphanAlerts() as a (a.row)}
						<div class="row"><span>{a.method} · {alertText(a)}</span>
							<button class="btn small danger" onclick={() => settings && propose(clearCardAlert(settings, a.row))}>지우기</button></div>
					{/each}
				</div>
			{/if}
		{:else if tab === 'budgets'}
			<div class="block">
				<ul class="rows budgets">
					{#each settings.budgets as b (b.row)}
						{@const fixed = isLocked(budgetTab(settings.year), 'F', b.row)}
						<li class="row">
							<span class="name">{b.label}{#if fixed} <small class="lock">시트에서 고침</small>{/if}</span>
							<input class="amount" inputmode="numeric" bind:value={budgetDraft[b.row]} disabled={fixed} title={fixed ? LOCK_TITLE : undefined} />
						</li>
					{/each}
				</ul>
				<div class="panel-actions"><button class="btn primary" onclick={submitBudgets}>예산 저장</button></div>
			</div>
		{:else if tab === 'transfers'}
			{#each settings.transfers as t}
				{@const incomeFixed = isLocked(TRANSFER_TAB, 'B', t.start + 21)}
				{@const memoFixed = isLocked(TRANSFER_TAB, 'B', t.start + 24)}
				<div class="block">
					<div class="block-title">
						<h3>{t.name}</h3>
						<small>빈 줄 {20 - t.rows.length}개</small>
						{#if t.rows.length < 20}<button class="btn small add" onclick={() => toggleEdit(`tr:${t.name}:new`)}>+ 새 줄</button>{/if}
					</div>
					<div class="form">
						<label class="small">월 수입 <input class="amount" inputmode="numeric" bind:value={incomeDraft[t.name]} disabled={incomeFixed} title={incomeFixed ? LOCK_TITLE : undefined} /></label>
						{#if incomeFixed}<small class="lock">시트에서 고침</small>{:else}<button class="btn small" onclick={() => submitIncome(t.name)}>적기</button>{/if}
						<label class="small grow">메모 <input bind:value={memoDraft[t.name]} disabled={memoFixed} title={memoFixed ? LOCK_TITLE : undefined} /></label>
						{#if memoFixed}<small class="lock">시트에서 고침</small>{:else}<button class="btn small" onclick={() => settings && propose(setTransferMemo(settings, t.name, memoDraft[t.name]))}>적기</button>{/if}
					</div>
					<ul class="list">
						{#each [...t.rows.map(r => ({ key: `${t.name}:${r.row}`, row: r.row })), { key: `${t.name}:new`, row: null }] as item (item.key)}
							{@const isOpen = editing === `tr:${item.key}`}
							{#if transferDraft[item.key] && (item.row !== null || isOpen)}
								<li class="item" class:open={isOpen}>
									{#if item.row !== null}
										<button class="item-head" onclick={() => toggleEdit(`tr:${item.key}`)} aria-expanded={isOpen}>
											<span class="item-name"><strong>{transferDraft[item.key][0] || `${item.row}줄`}</strong></span>
											<span class="muted">{transferDraft[item.key][1]}</span>
										</button>
									{:else}
										<strong>새 줄</strong>
									{/if}
									{#if isOpen}
										<div class="panel">
											<div class="grid">
												{#each TRANSFER_HEADS as head, i}
													{@const fixed = isLocked(TRANSFER_TAB, colName(i), item.row)}
													<label>{head}{#if fixed} <small class="lock">시트에서 고침</small>{/if}
														<input bind:value={transferDraft[item.key][i]} disabled={fixed} title={fixed ? LOCK_TITLE : undefined} /></label>
												{/each}
											</div>
											<div class="panel-actions">
												{#if item.row !== null && TRANSFER_HEADS.some((_, i) => isLocked(TRANSFER_TAB, colName(i), item.row))}
													<small class="lock">시트에서 고치는 칸이 있어 이 줄은 시트에서 지웁니다</small>
												{:else if item.row !== null}
													<button class="btn danger" onclick={() => settings && item.row !== null && propose(clearTransferRow(settings, t.name, item.row))}>지우기</button>
												{/if}
												<button class="btn" onclick={() => (editing = null)}>닫기</button>
												<button class="btn primary" onclick={() => settings && propose(setTransferRow(settings, t.name, item.row, transferDraft[item.key]))}>{item.row === null ? '더하기' : '고치기'}</button>
											</div>
										</div>
									{/if}
								</li>
							{/if}
						{/each}
					</ul>
				</div>
			{/each}
		{:else if tab === 'fixed'}
			<div class="block">
				<div class="block-title">
					<h3>고정비 자동 채우기</h3>
					<small>{settings.fixedRules.length} / 20줄</small>
					{#if settings.fixedRules.length < 20}<button class="btn small add" onclick={() => toggleEdit('fixed:new')}>+ 새 줄</button>{/if}
				</div>
				<p class="hint">명세서에 이 글이 있으면 그 분류로 채웁니다.</p>
				<datalist id="fixed-labels">{#each fixedLabels() as l}<option value={l}></option>{/each}</datalist>
				{#if editing === 'fixed:new' && fixedDraft.new}
					<div class="panel">
						<div class="form">
							<input list="fixed-labels" placeholder="분류 (고정비)" bind:value={fixedDraft.new.label} />
							<input placeholder="명세서에서 찾을 글" bind:value={fixedDraft.new.text} />
						</div>
						<div class="panel-actions">
							<button class="btn" onclick={() => (editing = null)}>닫기</button>
							<button class="btn primary" onclick={() => settings && propose(setFixedRule(settings, null, fixedDraft.new))}>더하기</button>
						</div>
					</div>
				{/if}
				<ul class="list">
					{#each settings.fixedRules as r (r.row)}
						{@const isOpen = editing === `fixed:${r.row}`}
						<li class="item" class:open={isOpen}>
							<button class="item-head" onclick={() => toggleEdit(`fixed:${r.row}`)} aria-expanded={isOpen}>
								<span class="item-name"><strong>{r.label}</strong><span class="muted">← {r.text}</span></span>
							</button>
							{#if isOpen && fixedDraft[`row:${r.row}`]}
								<div class="panel">
									<div class="form">
										<input list="fixed-labels" placeholder="분류" bind:value={fixedDraft[`row:${r.row}`].label} />
										<input placeholder="명세서에서 찾을 글" bind:value={fixedDraft[`row:${r.row}`].text} />
									</div>
									<div class="panel-actions">
										<button class="btn danger" onclick={() => settings && propose(clearFixedRule(settings, r.row))}>지우기</button>
										<button class="btn" onclick={() => (editing = null)}>닫기</button>
										<button class="btn primary" onclick={() => settings && propose(setFixedRule(settings, r.row, fixedDraft[`row:${r.row}`]))}>고치기</button>
									</div>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			</div>
		{:else if tab === 'logs'}
			<div class="block">
				{#if settings.logs.length === 0}<p class="muted">아직 기록이 없습니다.</p>{/if}
				<ul class="rows">
					{#each settings.logs.slice(-30).reverse() as log}
						<li class="log"><span class="muted">{log.when} {log.who}</span><span>{log.where}: {log.before} → {log.after}</span></li>
					{/each}
				</ul>
			</div>
		{/if}
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
	.top-bar { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-bottom: 10px; }
	.year { display: flex; gap: 8px; align-items: center; font-weight: 700; color: #3a4558; }
	.tabs { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; margin-bottom: 12px; background: white; border: 1px solid #e8edf5; border-radius: 12px; }
	.tabs button { flex: none; border: 0; background: transparent; color: #78859a; padding: 8px 14px; border-radius: 9px; font-weight: 700; cursor: pointer; white-space: nowrap; }
	.tabs button.active { background: #eef3ff; color: #315fda; }
	.notice { margin: 0 0 10px; color: #315fda; font-weight: 600; }
	.notice.bar { display: flex; justify-content: space-between; align-items: center; gap: 8px; background: #eef3ff; border-radius: 10px; padding: 8px 12px; }
	.close { border: 0; background: none; color: #315fda; font-size: 1.1rem; cursor: pointer; line-height: 1; }
	.error { color: #c0392b; }
	.muted { color: #78859a; }
	.hint { color: #78859a; font-size: 0.85rem; margin: 0 0 10px; }
	.block { background: white; border: 1px solid #e8edf5; border-radius: 12px; margin-bottom: 12px; padding: 12px 14px; }
	.block-title { display: flex; align-items: baseline; gap: 8px; margin-bottom: 8px; }
	.block-title h3, .block-title h4 { margin: 0; font-size: 1rem; }
	.block-title h4 { font-size: 0.9rem; }
	.block-title small { color: #78859a; }
	.block-title .add { margin-left: auto; }
	.cat-group { display: flex; gap: 10px; align-items: flex-start; padding: 6px 0; border-top: 1px solid #f1f4f9; }
	.cat-group:first-of-type { border-top: 0; }
	.group-name { flex: none; width: 72px; padding-top: 5px; font-size: 0.8rem; font-weight: 700; color: #5a6578; word-break: keep-all; }
	.chips { display: flex; flex-wrap: wrap; gap: 6px; }
	.chip { border: 1px solid #dfe5ef; background: #f8fafd; border-radius: 999px; padding: 4px 10px; font-size: 0.85rem; cursor: pointer; color: #2b3445; }
	.chip small { margin-left: 4px; color: #78859a; }
	.chip.stopped { color: #9aa5b6; text-decoration: line-through; text-decoration-color: #c2cad6; }
	.chip.stopped small { text-decoration: none; display: inline-block; }
	.chip.active { border-color: #315fda; background: #eef3ff; color: #315fda; }
	.list { list-style: none; margin: 0; padding: 0; }
	.item { border-top: 1px solid #f1f4f9; padding: 8px 0; }
	.item:first-child { border-top: 0; }
	.item.open { background: #fbfcff; margin: 0 -14px; padding: 8px 14px; }
	.item-head { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 8px; border: 0; background: none; padding: 0; cursor: pointer; text-align: left; color: inherit; font: inherit; }
	.item-name { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; min-width: 0; }
	.item-name .muted { font-size: 0.85rem; }
	.item-sub { margin: 2px 0 0; color: #78859a; font-size: 0.82rem; }
	.badge { flex: none; font-size: 0.75rem; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: #e3f6f2; color: #168a78; }
	.badge.off { background: #f1f3f6; color: #78859a; }
	.panel { margin-top: 8px; padding: 10px; border: 1px solid #e8edf5; border-radius: 10px; background: white; }
	.panel-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; align-items: center; gap: 6px; margin-top: 8px; }
	.rows { list-style: none; margin: 0; padding: 0; }
	.row { display: flex; flex-wrap: wrap; gap: 8px; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid #f1f4f9; }
	.row .name { font-weight: 600; }
	.alerts .row, .orphans .row { font-size: 0.88rem; }
	.budgets { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); column-gap: 20px; }
	.inline { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
	.small { font-size: 0.85rem; }
	.form { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 6px 0; }
	.form label { display: flex; gap: 6px; align-items: center; }
	.form .grow { flex: 1 1 200px; }
	.panel .form input { flex: 1 1 180px; }
	.form .grow input { flex: 1; }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
	.grid label { display: flex; flex-direction: column; gap: 2px; font-size: 0.8rem; color: #5a6578; }
	.alerts { margin-top: 12px; padding-top: 10px; border-top: 1px dashed #e1e6ef; }
	input, select { padding: 6px 8px; border: 1px solid #d6dde8; border-radius: 8px; font-size: 0.9rem; min-width: 0; }
	.amount { width: 140px; text-align: right; }
	.lock { color: #78859a; font-weight: 500; font-size: 0.75rem; }
	input:disabled { background: #f4f6fa; color: #5a6578; }
	.btn { border: 1px solid #d6dde8; background: white; border-radius: 8px; padding: 6px 12px; cursor: pointer; }
	.btn.small { padding: 4px 8px; font-size: 0.85rem; }
	.btn.primary { background: #315fda; color: white; border-color: #315fda; }
	.btn.danger { color: #c0392b; }
	.panel-actions .btn.danger { margin-right: auto; }
	.log { display: flex; flex-direction: column; padding: 6px 0; border-bottom: 1px solid #f1f4f9; font-size: 0.85rem; }
	.overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.35); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 16px; }
	.dialog { background: white; border-radius: 12px; padding: 16px; max-width: 520px; width: 100%; max-height: 80vh; overflow: auto; }
	.dialog ul { padding-left: 18px; }
	.actions { display: flex; justify-content: flex-end; gap: 8px; }
	@media (max-width: 600px) {
		.settings { padding: 8px 12px 40px; }
		.amount { width: 110px; }
		.group-name { width: 56px; }
		.item.open { margin: 0 -14px; }
	}
</style>
