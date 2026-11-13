<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import type { CardBlock, CardItem } from '$lib/card-usage/parse';

	type Result = { found: false; docName: string } | { found: true; docName: string; months: (CardBlock[] | null)[] };

	const year = new Date().getFullYear();
	let selectedMonth = $state(new Date().getMonth());
	let result = $state<Result | null>(null);
	let loading = $state(true);
	let error = $state('');

	let cards = $derived(result?.found ? result.months[selectedMonth] : null);

	const valueText = (i: CardItem) => (i.value === null ? i.text : `${i.value.toLocaleString('ko-KR')}${i.unit}`);

	// 새로고침을 연달아 하면 늦게 온 이전 응답이 새 결과를 덮지 않도록 마지막 요청만 반영한다.
	// quiet: 당겨서 새로고침할 때는 보던 화면을 그대로 두고 데이터만 바꾼다
	let latest = 0;
	async function load(quiet = false) {
		const id = ++latest;
		if (!quiet) loading = true;
		error = '';
		try {
			const res = await fetch(`/api/card-usage?year=${year}`, {
				headers: { Authorization: `Bearer ${page.data.session?.accessToken}` }
			});
			const data = await res.json();
			if (id !== latest) return;
			if (!res.ok) throw new Error(data.error);
			result = data;
		} catch (e) {
			if (id === latest) error = e instanceof Error ? e.message : '카드 실적을 불러오지 못했습니다.';
		} finally {
			if (id === latest) loading = false;
		}
	}
	onMount(() => load());
	export function refresh() {
		return load(true);
	}
</script>

<div class="dashboard">
	<div class="intro">
		<div>
			<p class="eyebrow">CARD PERFORMANCE</p>
			<h2>카드 실적</h2>
			<p>{result?.docName ?? `${year} 카드사용내역`}</p>
		</div>
	</div>

	{#if loading}
		<div class="state">카드 실적을 불러오고 있어요...</div>
	{:else if error}
		<div class="state">{error} <button onclick={() => load()}>다시 시도</button></div>
	{:else if result && !result.found}
		<div class="state panel missing">
			<strong>문서 없음</strong>
			<span>Google Drive에서 '{result.docName}' 문서를 찾지 못했어요.</span>
		</div>
	{:else if result?.found}
		<nav class="months" aria-label="월 선택">
			{#each result.months as month, i}
				<button
					class:active={selectedMonth === i}
					class:empty={!month}
					aria-pressed={selectedMonth === i}
					onclick={() => (selectedMonth = i)}>{i + 1}월</button
				>
			{/each}
		</nav>

		{#if !cards}
			<div class="state panel">{selectedMonth + 1}월 시트가 없어요.</div>
		{:else if !cards.length}
			<div class="state panel">{selectedMonth + 1}월 시트에 카드 실적 내용이 없어요.</div>
		{:else}
			<div class="grid">
				{#each cards as card}
					<section class="panel card">
						<div class="card-head">
							<h3>{card.name || '카드 이름 없음'}</h3>
							{#if card.badges.length}
								<div class="badges">
									{#each card.badges as badge}
										<span class="badge {badge.kind}">{badge.text}</span>
									{/each}
								</div>
							{/if}
						</div>
						<ul>
							{#each card.items as item}
								<li class="tone-{item.tone ?? 'none'}">
									<span class="label">{item.label}</span>
									<b>{valueText(item)}{#if item.tone === 'done'}<small>완료</small>{/if}</b>
								</li>
							{/each}
						</ul>
					</section>
				{/each}
			</div>
		{/if}
	{/if}
</div>

<style>
	.dashboard {
		box-sizing: border-box;
		width: 100%;
		min-width: 0;
		max-width: 1200px;
		margin: 0 auto;
		padding: 36px 28px 70px;
		color: #18243a;
		font-family: system-ui, sans-serif;
	}
	.intro,
	.card-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 16px;
	}
	.intro {
		margin-bottom: 24px;
	}
	.intro > div {
		min-width: 0;
	}
	.intro h2 {
		font-size: 30px;
		margin: 4px 0 8px;
		letter-spacing: -0.05em;
	}
	.intro p:not(.eyebrow) {
		color: #79859a;
		margin: 0;
		font-size: 14px;
	}
	.eyebrow {
		font-size: 10px;
		letter-spacing: 0.14em;
		font-weight: 800;
		color: #5b7fd5;
		margin: 0 0 8px;
	}
	.panel {
		box-sizing: border-box;
		min-width: 0;
		background: white;
		border: 1px solid #e8edf5;
		border-radius: 20px;
		padding: 24px;
		box-shadow: 0 8px 28px #273f6908;
	}
	.months {
		display: grid;
		grid-template-columns: repeat(12, minmax(0, 1fr));
		gap: 6px;
		margin-bottom: 20px;
	}
	.months button {
		border: 0;
		background: white;
		color: #4b5b73;
		padding: 10px 0;
		border-radius: 10px;
		font-weight: 700;
		font-size: 13px;
		cursor: pointer;
		box-shadow: inset 0 0 0 1px #e8edf5;
	}
	.months button.empty {
		color: #b8c0cc;
	}
	.months button.active {
		background: #416fe0;
		color: white;
		box-shadow: none;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		align-items: start;
		gap: 16px;
	}
	.card-head {
		flex-wrap: wrap;
		align-items: flex-start;
		gap: 8px;
		margin-bottom: 12px;
	}
	/* 이름과 배지가 한 줄에 안 들어가면 배지가 아랫줄 오른쪽으로 내려간다 */
	.card-head h3 {
		flex: 1 0 auto;
		max-width: 100%;
		font-size: 18px;
		letter-spacing: -0.04em;
		margin: 0;
		word-break: keep-all;
	}
	.badge {
		flex-shrink: 0;
		font-size: 12px;
		font-weight: 800;
		padding: 6px 10px;
		border-radius: 999px;
		white-space: nowrap;
	}
	.badges {
		margin-left: auto;
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 6px;
	}
	.badge.done {
		background: #e3f6f2;
		color: #168a78;
	}
	.badge.spend,
	.badge.limit {
		background: #fff3e2;
		color: #c46f12;
	}
	.badge.bonus {
		background: #f1ebfd;
		color: #7a4fd0;
	}
	ul {
		display: grid;
		gap: 4px;
		padding: 0;
		margin: 0;
		list-style: none;
	}
	li {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 12px;
		padding: 11px 12px;
		border-radius: 10px;
		font-size: 14px;
	}
	/* 배지와 같은 색: 왼쪽 띠 + 옅은 바탕 + 값 색 */
	li.tone-spend,
	li.tone-limit {
		background: #fff8ee;
		box-shadow: inset 3px 0 #f0a43b;
	}
	li.tone-spend b,
	li.tone-limit b {
		color: #c46f12;
	}
	li.tone-done {
		background: #effaf7;
		box-shadow: inset 3px 0 #14a58e;
	}
	li.tone-done b {
		color: #168a78;
	}
	li.tone-bonus {
		background: #f7f3fe;
		box-shadow: inset 3px 0 #b59bec;
	}
	li.tone-bonus b {
		color: #7a4fd0;
	}
	.label {
		min-width: 0;
		color: #4b5b73;
		word-break: keep-all;
		overflow-wrap: anywhere;
	}
	li b {
		white-space: nowrap;
		color: #253550;
	}
	li small {
		margin-left: 6px;
		font-size: 11px;
		color: inherit;
	}
	.state {
		text-align: center;
		padding: 70px 20px;
		color: #8591a3;
	}
	.state button {
		cursor: pointer;
	}
	.missing {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.missing span {
		word-break: keep-all;
	}
	.missing strong {
		font-size: 20px;
		color: #253550;
	}
	@media (max-width: 800px) {
		.dashboard {
			padding: 24px 16px 50px;
		}
		.intro h2 {
			font-size: 25px;
		}
		.months {
			grid-template-columns: repeat(6, minmax(0, 1fr));
		}
		.grid {
			grid-template-columns: minmax(0, 1fr);
		}
		.panel {
			padding: 20px;
		}
	}
</style>
