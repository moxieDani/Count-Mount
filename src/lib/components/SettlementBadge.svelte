<script lang="ts">
	import { onMount } from 'svelte';
	import TransferModal from './TransferModal.svelte';
	import { doubleTapDetector } from '$lib/settlement/transfer';

	interface Props {
		person: 'seoEun' | 'kiSoon';
		label: string;
		amount: number;
		formattedAmount: string;
	}
	let { person, label, amount, formattedAmount }: Props = $props();

	// 송금은 폰에서만: 마우스 없는 터치 화면일 때만 두 번 탭을 받는다 (PC 더블클릭은 무시)
	let touchOnly = $state(false);
	onMount(() => {
		touchOnly = matchMedia('(hover: none) and (pointer: coarse)').matches;
	});

	// pointerup 에서 열면 같은 탭의 click 이 방금 뜬 창 배경에 떨어져 바로 닫힌다.
	// 그래서 손가락 탭인지는 pointerdown 에서 기억해 두고, 창은 click 에서 연다.
	let open = $state(false);
	let lastPointer = '';
	const isDoubleTap = doubleTapDetector();
	function tap(e: MouseEvent) {
		if (touchOnly && lastPointer === 'touch' && isDoubleTap(e.timeStamp)) open = true;
	}
</script>

<!-- 폰 전용 두 번 탭 제스처라 키보드 조작은 일부러 두지 않는다 -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<span
	class="settlement-badge {person}"
	class:tappable={touchOnly}
	onpointerdown={(e) => (lastPointer = e.pointerType)}
	onclick={tap}
>
	{label}: {formattedAmount}원
</span>

{#if open}
	<TransferModal {person} {label} {amount} onclose={() => (open = false)} />
{/if}

<style>
	.settlement-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem 0.8rem;
		border-radius: 4px;
		font-size: 0.8rem;
		font-weight: 600;
		text-align: center;
		line-height: 1.2;
	}
	/* 두 번 탭이 화면 확대가 되지 않게 하고, 길게 눌러 글자 선택되는 것도 막는다 */
	.settlement-badge.tappable {
		touch-action: manipulation;
		user-select: none;
		-webkit-user-select: none;
		-webkit-touch-callout: none;
		cursor: pointer;
	}
	.settlement-badge.seoEun {
		background: rgba(255, 152, 0, 0.1);
		border: 1px solid rgba(255, 152, 0, 0.3);
		color: #e65100;
		margin-bottom: 0.5rem;
	}
	.settlement-badge.kiSoon {
		background: rgba(33, 150, 243, 0.1);
		border: 1px solid rgba(33, 150, 243, 0.3);
		color: #1976d2;
	}
	@media (max-width: 768px) {
		.settlement-badge {
			font-size: 0.75rem;
			padding: 0.2rem 0.6rem;
		}
	}
</style>
