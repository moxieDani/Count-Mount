<script lang="ts">
	import { signIn, signOut } from '@auth/sveltekit/client'
	import { page } from '$app/stores'

	let session = $derived($page.data.session);

	async function handleSignIn() {
		await signIn('google')
	}

	async function handleSignOut() {
		await signOut()
	}
</script>

<div class="auth-container">
	{#if session}
		<div class="user-info">
			{#if session.user?.image}
				<img src={session.user.image} alt={session.user.name || 'User'} class="avatar" />
			{/if}
			<div class="user-details">
				<p class="user-name">안녕하세요, {session.user?.name || 'User'}님!</p>
				<p class="user-email">{session.user?.email}</p>
			</div>
		</div>
		<button onclick={handleSignOut} class="sign-out-button">
			로그아웃
		</button>
	{:else}
		<div class="login-container">
			<h2>Count-Mount에 오신 것을 환영합니다</h2>
			<p>Google 계정으로 로그인해주세요.</p>
			<button onclick={handleSignIn} class="google-login-button">
				<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path fill-rule="evenodd" clip-rule="evenodd" d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.8445H13.8436C13.635 11.9699 13.0009 12.9231 12.0477 13.5613V15.8195H14.9563C16.6581 14.2527 17.64 11.9454 17.64 9.20454Z" fill="#4285F4"/>
					<path fill-rule="evenodd" clip-rule="evenodd" d="M8.99996 18C11.43 18 13.467 17.1941 14.9563 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 8.99996 14.4204C6.65632 14.4204 4.67225 12.8372 3.96405 10.71H0.957031V13.0418C2.43819 15.9831 5.48183 18 8.99996 18Z" fill="#34A853"/>
					<path fill-rule="evenodd" clip-rule="evenodd" d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54772 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z" fill="#FBBC05"/>
					<path fill-rule="evenodd" clip-rule="evenodd" d="M8.99996 3.57955C10.3218 3.57955 11.5077 4.03364 12.4404 4.92545L15.0218 2.34409C13.4631 0.891818 11.426 0 8.99996 0C5.48183 0 2.43819 2.01682 0.957031 4.95818L3.96405 7.29C4.67225 5.16273 6.65632 3.57955 8.99996 3.57955Z" fill="#EA4335"/>
				</svg>
				Google로 로그인
			</button>
		</div>
	{/if}
</div>

<style>
	.auth-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 2rem;
		font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
	}

	.login-container {
		text-align: center;
		max-width: 400px;
		padding: 2rem;
		border-radius: 12px;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		background: white;
	}

	.login-container h2 {
		margin-bottom: 1rem;
		color: #333;
		font-size: 1.5rem;
	}

	.login-container p {
		margin-bottom: 2rem;
		color: #666;
		line-height: 1.5;
	}

	.google-login-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 0.75rem 1.5rem;
		border: 1px solid #dadce0;
		border-radius: 6px;
		background: white;
		color: #3c4043;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		width: 100%;
		font-family: inherit;
	}

	.google-login-button:hover {
		box-shadow: 0 1px 2px 0 rgba(60, 64, 67, .30), 0 1px 3px 1px rgba(60, 64, 67, .15);
		background: #f8f9fa;
	}

	.user-info {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		border-radius: 12px;
		background: white;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		margin-bottom: 1rem;
	}

	.avatar {
		width: 60px;
		height: 60px;
		border-radius: 50%;
		object-fit: cover;
	}

	.user-details {
		flex: 1;
	}

	.user-name {
		margin: 0 0 0.25rem 0;
		font-weight: 600;
		color: #333;
	}

	.user-email {
		margin: 0;
		color: #666;
		font-size: 0.9rem;
	}

	.sign-out-button {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 6px;
		background: #dc3545;
		color: white;
		cursor: pointer;
		font-family: inherit;
		font-size: 14px;
		transition: background 0.2s ease;
	}

	.sign-out-button:hover {
		background: #c82333;
	}
</style>