<script lang="ts">
	import { page } from '$app/stores'
	import LoginButton from '$lib/components/LoginButton.svelte'

	$: session = $page.data.session
</script>

{#if session}
	<main class="app-main">
		<div class="header">
			<h1>Count-Mount</h1>
			<LoginButton />
		</div>
		<div class="content">
			<h2>환영합니다!</h2>
			<p>Count-Mount 애플리케이션을 사용할 수 있습니다.</p>
			<!-- 여기에 메인 애플리케이션 콘텐츠 추가 -->
		</div>
	</main>
{:else}
	<LoginButton />
{/if}

<style>
	.app-main {
		min-height: 100vh;
		background: #f5f5f5;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 2rem;
		background: white;
		border-bottom: 1px solid #e0e0e0;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.header h1 {
		margin: 0;
		color: #333;
		font-size: 1.5rem;
	}

	.content {
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	.content h2 {
		color: #333;
		margin-bottom: 1rem;
	}

	.content p {
		color: #666;
		line-height: 1.6;
	}
</style>
