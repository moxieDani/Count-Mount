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

{#if session}
	<div class="user-info">
		{#if session.user?.image}
			<img src={session.user.image} alt={session.user.name || 'User'} class="avatar" />
		{/if}
		<div class="user-details">
			<span class="user-name">{session.user?.name || 'User'}</span>
			<span class="user-email">{session.user?.email}</span>
		</div>
		<button onclick={handleSignOut} class="sign-out-button">
			로그아웃
		</button>
	</div>
{:else}
	<button onclick={handleSignIn} class="sign-in-button">
		<svg width="16" height="16" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
			<path fill-rule="evenodd" clip-rule="evenodd" d="M17.64 9.20454C17.64 8.56636 17.5827 7.95272 17.4764 7.36363H9V10.8445H13.8436C13.635 11.9699 13.0009 12.9231 12.0477 13.5613V15.8195H14.9563C16.6581 14.2527 17.64 11.9454 17.64 9.20454Z" fill="#4285F4"/>
			<path fill-rule="evenodd" clip-rule="evenodd" d="M8.99996 18C11.43 18 13.467 17.1941 14.9563 15.8195L12.0477 13.5613C11.2418 14.1013 10.2109 14.4204 8.99996 14.4204C6.65632 14.4204 4.67225 12.8372 3.96405 10.71H0.957031V13.0418C2.43819 15.9831 5.48183 18 8.99996 18Z" fill="#34A853"/>
			<path fill-rule="evenodd" clip-rule="evenodd" d="M3.96409 10.71C3.78409 10.17 3.68182 9.59318 3.68182 9C3.68182 8.40682 3.78409 7.83 3.96409 7.29V4.95818H0.957273C0.347727 6.17318 0 7.54772 0 9C0 10.4523 0.347727 11.8268 0.957273 13.0418L3.96409 10.71Z" fill="#FBBC05"/>
			<path fill-rule="evenodd" clip-rule="evenodd" d="M8.99996 3.57955C10.3218 3.57955 11.5077 4.03364 12.4404 4.92545L15.0218 2.34409C13.4631 0.891818 11.426 0 8.99996 0C5.48183 0 2.43819 2.01682 0.957031 4.95818L3.96405 7.29C4.67225 5.16273 6.65632 3.57955 8.99996 3.57955Z" fill="#EA4335"/>
		</svg>
		로그인
	</button>
{/if}

<style>
	.user-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.avatar {
		width: 32px;
		height: 32px;
		border-radius: 50%;
		object-fit: cover;
		border: 2px solid #f0f0f0;
	}

	.user-details {
		display: flex;
		flex-direction: column;
		min-width: 0; /* flexbox overflow fix */
	}

	.user-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: #333;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 150px;
	}

	.user-email {
		font-size: 0.75rem;
		color: #666;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 150px;
	}

	.sign-out-button {
		padding: 0.375rem 0.75rem;
		border: 1px solid #dc3545;
		border-radius: 6px;
		background: white;
		color: #dc3545;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.8125rem;
		font-weight: 500;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.sign-out-button:hover {
		background: #dc3545;
		color: white;
	}

	.sign-in-button {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		border: 1px solid #dadce0;
		border-radius: 6px;
		background: white;
		color: #3c4043;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		font-family: inherit;
		white-space: nowrap;
	}

	.sign-in-button:hover {
		box-shadow: 0 1px 2px 0 rgba(60, 64, 67, .30), 0 1px 3px 1px rgba(60, 64, 67, .15);
		background: #f8f9fa;
	}

	/* 반응형 */
	@media (max-width: 768px) {
		.user-details {
			display: none;
		}
		
		.user-name, .user-email {
			max-width: 100px;
		}
		
		.sign-in-button {
			padding: 0.375rem 0.75rem;
			font-size: 0.8125rem;
		}
	}
</style>