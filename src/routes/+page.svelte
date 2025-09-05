<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state'
	import LoginButton from '$lib/components/LoginButton.svelte'
	import HeaderAuth from '$lib/components/HeaderAuth.svelte'
	import SpreadsheetTable from '$lib/components/SpreadsheetTable.svelte'

	let session = $derived(page.data.session);
	let currentSpreadsheetId = $state<string>('');
	let isLoading = $state(false);
	let error = $state('');

	// 자동 스프레드시트 찾기 함수
	async function findCurrentYearSpreadsheet(): Promise<string | null> {
		if (!session?.accessToken) return null;

		try {
			const currentYear = new Date().getFullYear();
			console.log(`Searching for ${currentYear} spreadsheet...`);
			
			// 여러 가지 패턴으로 검색
			const searchPatterns = [
				`name contains '${currentYear} 가계부'`,
				`name contains '${currentYear}가계부'`,
				`name contains '가계부 ${currentYear}'`,
				`name:'${currentYear} 가계부'`,
				`name:'${currentYear}가계부'`,
				`name contains '${currentYear}'`
			];
			
			// 각 패턴으로 검색 (공유 드라이브 포함)
			for (const pattern of searchPatterns) {
				const searchQuery = `${pattern} and mimeType='application/vnd.google-apps.spreadsheet'`;
				
				// 공유 드라이브 포함 검색
				const searchUrl = `https://www.googleapis.com/drive/v3/files?` + 
					`q=${encodeURIComponent(searchQuery)}&` +
					`supportsAllDrives=true&` +
					`includeItemsFromAllDrives=true&` +
					`corpora=allDrives&` +
					`orderBy=modifiedTime desc`;

				const response = await fetch(searchUrl, {
					headers: {
						'Authorization': `Bearer ${session.accessToken}`
					}
				});

				if (response.ok) {
					const data = await response.json();
					const files = data.files || [];
					
					// 검색 결과에서 가장 적합한 파일 찾기
					for (const file of files) {
						console.log(`Checking file: ${file.name} (ID: ${file.id})`);
						if (file.name && (
							file.name.includes(`${currentYear} 가계부`) ||
							file.name.includes(`${currentYear}가계부`) ||
							file.name.includes(`가계부 ${currentYear}`) ||
							(file.name.includes(currentYear.toString()) && file.name.includes('가계부'))
						)) {
							console.log(`Found matching spreadsheet: ${file.name}`);
							return file.id;
						}
					}
				}
			}

			return null;
		} catch (err) {
			console.error('Error searching for current year spreadsheet:', err);
			return null;
		}
	}

	async function loadCurrentYearSpreadsheet() {
		isLoading = true;
		error = '';

		try {
			const spreadsheetId = await findCurrentYearSpreadsheet();
			if (spreadsheetId) {
				currentSpreadsheetId = spreadsheetId;
				console.log(`Automatically loaded spreadsheet: ${spreadsheetId}`);
			} else {
				error = `${new Date().getFullYear()}년 가계부 스프레드시트를 찾을 수 없습니다.`;
			}
		} catch (err) {
			error = '스프레드시트 로드 중 오류가 발생했습니다.';
			console.error('Error loading spreadsheet:', err);
		} finally {
			isLoading = false;
		}
	}

	// 세션이 변경될 때마다 자동으로 스프레드시트 로드
	$effect(async () => {
		if (session?.accessToken && !currentSpreadsheetId) {
			await loadCurrentYearSpreadsheet();
		}
	});
</script>

{#if session}
	<main class="app-main">
		<div class="header">
			<h1>Count-Mount</h1>
			<div class="header-actions">
				<HeaderAuth />
			</div>
		</div>
		<div class="content">
			{#if isLoading}
				<div class="loading-section">
					<div class="loading-spinner"></div>
					<p>가계부 데이터를 불러오는 중...</p>
				</div>
			{:else if error}
				<div class="error-section">
					<div class="error-icon">⚠️</div>
					<h3>오류 발생</h3>
					<p>{error}</p>
					<button onclick={loadCurrentYearSpreadsheet} class="retry-btn">
						다시 시도
					</button>
				</div>
			{:else if currentSpreadsheetId}
				<SpreadsheetTable 
					spreadsheetId={currentSpreadsheetId}
					range="Y27:AD126"
					headerRange="Y26:AD26"
				/>
			{/if}
		</div>
	</main>
{:else}
	<LoginButton />
{/if}

<style>
	.app-main {
		min-height: 100vh;
		background: #f5f5f5;
		display: flex;
		flex-direction: column;
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 2rem;
		background: #e0e0e0;
		border-bottom: 1px solid #e0e0e0;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		position: sticky;
		top: 0;
		z-index: 100;
	}

	.header h1 {
		margin: 0;
		color: black;
		font-size: 1.5rem;
		font-weight: 600;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.header-actions button {
		padding: 0.75rem 1.5rem;
		background: #2196f3;
		color: white;
		border: none;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.header-actions button:hover {
		background: #1976d2;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.content {
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		padding: 0;
	}

	.loading-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
		color: #666;
	}

	.loading-spinner {
		width: 50px;
		height: 50px;
		border: 4px solid #f3f3f3;
		border-top: 4px solid #2196f3;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1.5rem;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.error-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		text-align: center;
		color: #666;
	}

	.error-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.error-section h3 {
		margin: 0 0 1rem 0;
		color: #d32f2f;
		font-size: 1.5rem;
	}

	.error-section p {
		margin: 0 0 2rem 0;
		line-height: 1.6;
		max-width: 500px;
	}

	.retry-btn {
		padding: 0.75rem 1.5rem;
		background: #2196f3;
		color: white;
		border: none;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.retry-btn:hover {
		background: #1976d2;
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
	}

	/* 모바일 반응형 */
	@media (max-width: 768px) {
		.header {
			padding: 0.75rem 1rem;
		}

		.header h1 {
			font-size: 1.25rem;
		}

		.header-actions {
			gap: 0.5rem;
		}

		.header-actions button {
			padding: 0.6rem 1rem;
			font-size: 0.9rem;
		}

		.content {
			padding: 0;
		}

		.loading-section, .error-section {
			padding: 2rem 1rem;
		}

		.loading-spinner {
			width: 40px;
			height: 40px;
		}

		.error-section h3 {
			font-size: 1.25rem;
		}

		.retry-btn {
			padding: 0.6rem 1.2rem;
			font-size: 0.9rem;
		}
	}
</style>