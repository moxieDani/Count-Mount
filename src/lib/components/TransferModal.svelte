<script lang="ts">
	import { onMount } from 'svelte';
	import { tossSendUrl, type TransferAccount } from '$lib/settlement/transfer';

	interface Props {
		person: 'seoEun' | 'kiSoon';
		label: string;
		amount: number;
		onclose: () => void;
	}
	let { person, label, amount, onclose }: Props = $props();

	let account = $state<TransferAccount | null>(null);
	let loading = $state(true);
	let error = $state('');

	let ready = $derived(!loading && !error && account !== null && amount > 0);

	onMount(async () => {
		try {
			const res = await fetch('/api/settlement-accounts');
			const data = await res.json();
			if (!res.ok) throw new Error(data.error);
			account = data[person];
		} catch (e) {
			error = e instanceof Error && e.message ? e.message : '송금 계좌를 불러오지 못했습니다.';
		} finally {
			loading = false;
		}
	});
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onclose()} />

<div class="overlay">
	<button class="backdrop" aria-label="닫기" onclick={onclose}></button>
	<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="transfer-title">
		<h2 id="transfer-title">{label} 송금</h2>

		{#if loading}
			<p class="note">받는 계좌를 불러오고 있어요...</p>
		{:else if error}
			<p class="note">{error}</p>
		{:else if amount <= 0}
			<p class="note">보낼 금액이 없어요.</p>
		{:else if !account}
			<p class="note">송금 계좌가 설정되지 않았어요.</p>
		{:else}
			<p class="question">토스로 송금할까요?</p>
			<dl>
				<div>
					<dt>금액</dt>
					<dd class="amount">{amount.toLocaleString('ko-KR')}원</dd>
				</div>
				<div>
					<dt>받는 계좌</dt>
					<dd>{account.bank} <span class="nowrap">{account.number}</span></dd>
				</div>
			</dl>
			<p class="note">토스 앱에서 내용을 확인하고 인증해야 송금돼요.</p>
		{/if}

		<div class="actions">
			<button class="cancel" onclick={onclose}>{ready ? '취소' : '닫기'}</button>
			{#if ready && account}
				<a class="toss" href={tossSendUrl(account, amount)}>토스로 송금</a>
			{/if}
		</div>
	</div>
</div>

<style>
	.overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
	}
	.backdrop {
		position: absolute;
		inset: 0;
		border: 0;
		padding: 0;
		background: rgba(0, 0, 0, 0.5);
		cursor: default;
	}
	.sheet {
		position: relative;
		box-sizing: border-box;
		width: 100%;
		max-width: 360px;
		background: white;
		border-radius: 16px;
		padding: 24px 20px 20px;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
		color: #18243a;
		font-family: system-ui, sans-serif;
	}
	h2 {
		margin: 0 0 12px;
		font-size: 18px;
		letter-spacing: -0.03em;
	}
	.question {
		margin: 0 0 14px;
		font-weight: 700;
	}
	dl {
		display: grid;
		gap: 10px;
		margin: 0 0 14px;
		padding: 14px;
		border-radius: 12px;
		background: #f5f7fb;
	}
	dl div {
		display: flex;
		justify-content: space-between;
		gap: 12px;
	}
	dt {
		flex-shrink: 0;
		color: #79859a;
		font-size: 14px;
	}
	dd {
		margin: 0;
		font-weight: 700;
		text-align: right;
		word-break: keep-all;
		overflow-wrap: anywhere;
	}
	/* 계좌번호는 중간에서 줄이 바뀌지 않게 */
	.nowrap {
		white-space: nowrap;
	}
	dd.amount {
		font-size: 18px;
		color: #3182f6;
	}
	.note {
		margin: 0 0 16px;
		color: #79859a;
		font-size: 13px;
		word-break: keep-all;
	}
	.actions {
		display: flex;
		gap: 8px;
	}
	.actions > * {
		flex: 1;
		box-sizing: border-box;
		padding: 13px 0;
		border-radius: 12px;
		font-size: 15px;
		font-weight: 700;
		text-align: center;
		text-decoration: none;
		cursor: pointer;
	}
	.cancel {
		border: 0;
		background: #eef1f6;
		color: #4b5b73;
	}
	.toss {
		background: #3182f6;
		color: white;
	}
</style>
