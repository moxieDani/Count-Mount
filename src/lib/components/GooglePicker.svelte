<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { browser } from '$app/environment';

	let { onFileSelected = () => {} } = $props();

	let isPickerLoaded = $state(false);
	let isGapiLoaded = $state(false);
	let accessToken = $state('');
	let apiKey = $state('');

	let session = $derived(page.data.session);

	onMount(async () => {
		if (!browser) return;

		// Load API key
		await loadConfig();
		// Load Google API and Picker API
		await loadGoogleAPIs();
	});

	async function loadConfig() {
		try {
			const response = await fetch('/api/config');
			const config = await response.json();
			apiKey = config.googleApiKey;
		} catch (error) {
			console.error('Failed to load config:', error);
		}
	}

	async function loadGoogleAPIs() {
		return new Promise<void>((resolve) => {
			// Load Google API Script
			const gapiScript = document.createElement('script');
			gapiScript.src = 'https://apis.google.com/js/api.js';
			gapiScript.onload = () => {
				gapi.load('auth2:picker', () => {
					isGapiLoaded = true;
					initializeGapi();
					resolve();
				});
			};
			document.head.appendChild(gapiScript);
		});
	}

	async function initializeGapi() {
		await gapi.load('picker', () => {
			isPickerLoaded = true;
		});
	}

	async function getAccessToken() {
		if (!session?.accessToken) {
			// OAuth2 세션에서 액세스 토큰 가져오기
			const response = await fetch('/api/auth/token');
			const data = await response.json();
			accessToken = data.accessToken;
		} else {
			accessToken = session.accessToken;
		}
	}

	async function openPicker() {
		if (!isPickerLoaded || !isGapiLoaded) {
			alert('Google Picker API가 아직 로드되지 않았습니다. 잠시 후 다시 시도해주세요.');
			return;
		}

		await getAccessToken();

		const picker = new google.picker.PickerBuilder()
			.addView(google.picker.ViewId.SPREADSHEETS)
			.setOAuthToken(accessToken)
			.setDeveloperKey(apiKey)
			.setCallback(pickerCallback)
			.build();

		picker.setVisible(true);
	}

	function pickerCallback(data: any) {
		if (data.action === google.picker.Action.PICKED) {
			const file = data.docs[0];
			console.log('Selected file:', file);
			
			const fileInfo = {
				id: file.id,
				name: file.name,
				url: file.url,
				mimeType: file.mimeType
			};
			
			onFileSelected(fileInfo);
		}
	}
</script>

<div class="picker-container">
	<h3>스프레드시트 선택</h3>
	<p>Google Drive에서 수정할 스프레드시트를 선택하세요.</p>
	
	<button 
		onclick={openPicker}
		disabled={!isPickerLoaded || !session}
		class="picker-button"
	>
		{#if !session}
			먼저 로그인이 필요합니다
		{:else if !isPickerLoaded}
			Google Picker 로드 중...
		{:else}
			📊 스프레드시트 선택하기
		{/if}
	</button>
</div>

<style>
	.picker-container {
		padding: 2rem;
		border: 2px dashed #e0e0e0;
		border-radius: 12px;
		text-align: center;
		background: #f9f9f9;
	}

	.picker-container h3 {
		margin: 0 0 1rem 0;
		color: #333;
		font-size: 1.25rem;
	}

	.picker-container p {
		margin: 0 0 2rem 0;
		color: #666;
		line-height: 1.6;
	}

	.picker-button {
		padding: 1rem 2rem;
		border: none;
		border-radius: 8px;
		background: #4285f4;
		color: white;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.3s ease;
		min-width: 200px;
	}

	.picker-button:hover:not(:disabled) {
		background: #3367d6;
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(66, 133, 244, 0.3);
	}

	.picker-button:disabled {
		background: #cccccc;
		cursor: not-allowed;
		transform: none;
		box-shadow: none;
	}

	.picker-button:active:not(:disabled) {
		transform: translateY(0);
	}
</style>