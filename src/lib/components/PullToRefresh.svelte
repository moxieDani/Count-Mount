<script lang="ts">
	import type { Snippet } from 'svelte';
	import { PULL_THRESHOLD, REFRESHING_HEIGHT, pullDistance } from '$lib/pull-to-refresh';

	// 상단 바 아래의 스크롤 영역. 맨 위에서 아래로 길게 당겼다 놓으면 onrefresh 를 부른다.
	interface Props {
		onrefresh: () => unknown;
		children: Snippet;
	}
	let { onrefresh, children }: Props = $props();

	let scroller: HTMLDivElement;
	let pull = $state(0);
	let dragging = $state(false);
	let refreshing = $state(false);
	let startY = 0;

	let ready = $derived(pull >= PULL_THRESHOLD);

	// 떠 있는 창(모달) 안이거나 이미 스크롤된 안쪽 영역에서 시작한 손가락은 당겨 새로고침으로 보지 않는다
	function canStart(target: EventTarget | null) {
		if (refreshing || scroller.scrollTop > 0) return false;
		for (let el = target as HTMLElement | null; el && el !== scroller; el = el.parentElement) {
			if (el.scrollTop > 0 || getComputedStyle(el).position === 'fixed') return false;
		}
		return true;
	}

	function onstart(e: TouchEvent) {
		dragging = e.touches.length === 1 && canStart(e.target);
		if (dragging) startY = e.touches[0].clientY;
	}

	function onmove(e: TouchEvent) {
		if (!dragging) return;
		if (scroller.scrollTop > 0) {
			dragging = false;
			pull = 0;
			return;
		}
		pull = pullDistance(e.touches[0].clientY - startY);
		// 당기는 중에는 브라우저의 튕김·자체 새로고침 대신 이 표시줄이 움직인다
		if (pull > 0 && e.cancelable) e.preventDefault();
	}

	async function onend() {
		if (!dragging) return;
		dragging = false;
		if (!ready) {
			pull = 0;
			return;
		}
		refreshing = true;
		pull = REFRESHING_HEIGHT;
		try {
			// 너무 빨리 끝나도 새로고침된 것이 보이도록 잠깐은 표시해 둔다
			await Promise.all([onrefresh(), new Promise((r) => setTimeout(r, 400))]);
		} finally {
			refreshing = false;
			pull = 0;
		}
	}

	// touchmove 에서 preventDefault 하려면 passive 가 아닌 리스너가 필요하다
	$effect(() => {
		const opts = { passive: false } as const;
		scroller.addEventListener('touchstart', onstart, { passive: true });
		scroller.addEventListener('touchmove', onmove, opts);
		scroller.addEventListener('touchend', onend);
		scroller.addEventListener('touchcancel', onend);
		return () => {
			scroller.removeEventListener('touchstart', onstart);
			scroller.removeEventListener('touchmove', onmove);
			scroller.removeEventListener('touchend', onend);
			scroller.removeEventListener('touchcancel', onend);
		};
	});
</script>

<div class="scroller" bind:this={scroller}>
	<div class="ptr" class:settling={!dragging} style:height="{pull}px" aria-live="polite">
		{#if refreshing}
			<span class="spinner" aria-hidden="true"></span>
			<span>새로고침 중...</span>
		{:else if pull > 0}
			<span class="arrow" class:ready aria-hidden="true">↓</span>
			<span>{ready ? '놓으면 새로고침' : '당겨서 새로고침'}</span>
		{/if}
	</div>
	<div class="inner">
		{@render children()}
	</div>
</div>

<style>
	.scroller {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior-y: contain;
		-webkit-overflow-scrolling: touch;
	}
	.inner {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 100%;
	}
	.ptr {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		overflow: hidden;
		color: #416fe0;
		font-size: 13px;
		font-weight: 700;
	}
	.ptr.settling {
		transition: height 0.2s ease;
	}
	.arrow {
		font-size: 16px;
		transition: transform 0.15s ease;
	}
	.arrow.ready {
		transform: rotate(180deg);
	}
	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid #d6e1fa;
		border-top-color: #416fe0;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}
	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>
