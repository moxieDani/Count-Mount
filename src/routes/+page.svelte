<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state'
	import { browser } from '$app/environment';
	import LoginButton from '$lib/components/LoginButton.svelte'
	import HeaderAuth from '$lib/components/HeaderAuth.svelte'
	import GooglePicker from '$lib/components/GooglePicker.svelte'
	import SheetsList from '$lib/components/SheetsList.svelte'

	let session = $derived(page.data.session);

	let selectedFile = $state<{id: string, name: string, url: string, mimeType: string} | null>(null);

	const STORAGE_KEY = 'count-mount-selected-spreadsheet';

	onMount(() => {
		// 페이지 로드 시 localStorage에서 선택된 파일 정보 복원
		loadSelectedFile();
	});

	function loadSelectedFile() {
		if (!browser) return;
		
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (stored) {
				const fileInfo = JSON.parse(stored);
				selectedFile = fileInfo;
				console.log('Restored selected spreadsheet from storage:', fileInfo);
			}
		} catch (error) {
			console.error('Failed to load selected file from storage:', error);
			// 저장된 데이터가 손상된 경우 제거
			localStorage.removeItem(STORAGE_KEY);
		}
	}

	function saveSelectedFile(fileInfo: {id: string, name: string, url: string, mimeType: string} | null) {
		if (!browser) return;
		
		try {
			if (fileInfo) {
				localStorage.setItem(STORAGE_KEY, JSON.stringify(fileInfo));
			} else {
				localStorage.removeItem(STORAGE_KEY);
			}
		} catch (error) {
			console.error('Failed to save selected file to storage:', error);
		}
	}

	function handleFileSelected(fileInfo: {id: string, name: string, url: string, mimeType: string}) {
		selectedFile = fileInfo;
		saveSelectedFile(fileInfo);
		console.log('Selected spreadsheet:', fileInfo);
	}

	function clearSelection() {
		selectedFile = null;
		saveSelectedFile(null);
		console.log('Cleared spreadsheet selection');
	}
</script>

{#if session}
	<main class="app-main">
		<div class="header">
			<h1>Count-Mount</h1>
			<div class="header-actions">
				{#if selectedFile}
					<button onclick={clearSelection} class="btn-secondary">
						새 스프레드시트 선택
					</button>
				{/if}
				<HeaderAuth />
			</div>
		</div>
		<div class="content">
			{#if !selectedFile}
				<GooglePicker onFileSelected={handleFileSelected} />
			{:else}
				<div class="selected-file-section">
					<h2>선택된 스프레드시트</h2>
					<div class="file-info-card">
						<div class="file-header">
							<div class="file-icon">📊</div>
							<div class="file-details">
								<h3 class="file-name">{selectedFile.name}</h3>
								<p class="file-path">파일 ID: <code>{selectedFile.id}</code></p>
								<p class="file-url">
									<a href={selectedFile.url} target="_blank" rel="noopener noreferrer">
										Google Sheets에서 열기 ↗
									</a>
								</p>
							</div>
						</div>
						
						<div class="file-metadata">
							<div class="metadata-item">
								<strong>파일 형식:</strong> {selectedFile.mimeType}
							</div>
							<div class="metadata-item">
								<strong>파일 URL:</strong> 
								<div class="url-container">
									<input 
										type="text" 
										readonly 
										value={selectedFile.url} 
										class="url-input"
									/>
									<button 
										onclick={() => navigator.clipboard.writeText(selectedFile.url)}
										class="copy-btn"
										title="URL 복사"
									>
										📋
									</button>
								</div>
							</div>
						</div>

						<div class="next-steps">
							<h4>다음 단계</h4>
							<p>이제 이 스프레드시트의 특정 셀 영역에 값을 입력할 수 있는 기능을 구현할 예정입니다.</p>
							<ul>
								<li>시트 이름 선택</li>
								<li>셀 범위 지정 (예: A1:C10)</li>
								<li>데이터 입력 및 업데이트</li>
							</ul>
						</div>
					</div>

					<!-- 시트 목록 컴포넌트 추가 -->
					<SheetsList 
						spreadsheetId={selectedFile.id} 
						spreadsheetName={selectedFile.name}
					/>
				</div>
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

	.btn-secondary {
		padding: 0.5rem 1rem;
		border: 1px solid rgba(255, 255, 255, 0.3);
		border-radius: 6px;
		background: rgb(78, 193, 116);
		color: white;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		backdrop-filter: blur(10px);
	}

	.btn-secondary:hover {
		background: rgba(255, 255, 255, 0.3);
		border-color: rgba(255, 255, 255, 0.5);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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

	.welcome-section {
		text-align: center;
		margin-bottom: 3rem;
	}

	.welcome-section h2 {
		color: #333;
		font-size: 2rem;
		margin-bottom: 1rem;
	}

	.welcome-section p {
		font-size: 1.1rem;
		max-width: 600px;
		margin: 0 auto 2rem auto;
	}

	.selected-file-section {
		max-width: 800px;
		margin: 0 auto;
	}

	.selected-file-section h2 {
		color: #333;
		font-size: 1.75rem;
		margin-bottom: 1.5rem;
		text-align: center;
	}

	.file-info-card {
		background: white;
		border-radius: 16px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
		overflow: hidden;
	}

	.file-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 2rem;
		background: linear-gradient(135deg, #f8f9ff 0%, #e3f2fd 100%);
		border-bottom: 1px solid #e0e0e0;
	}

	.file-icon {
		font-size: 3rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 80px;
		height: 80px;
		background: white;
		border-radius: 16px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.file-details {
		flex: 1;
	}

	.file-name {
		margin: 0 0 0.5rem 0;
		color: #333;
		font-size: 1.5rem;
		font-weight: 600;
	}

	.file-path {
		margin: 0 0 0.5rem 0;
		color: #666;
		font-size: 0.9rem;
	}

	.file-path code {
		background: rgba(0, 0, 0, 0.05);
		padding: 0.2rem 0.4rem;
		border-radius: 4px;
		font-size: 0.8rem;
		color: #333;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
	}

	.file-url {
		margin: 0;
		color: #666;
	}

	.file-url a {
		color: #007bff;
		text-decoration: none;
		font-weight: 500;
	}

	.file-url a:hover {
		text-decoration: underline;
	}

	.file-metadata {
		padding: 1.5rem 2rem;
		background: white;
		border-bottom: 1px solid #f0f0f0;
	}

	.metadata-item {
		margin-bottom: 1rem;
		color: #555;
	}

	.metadata-item:last-child {
		margin-bottom: 0;
	}

	.metadata-item strong {
		display: inline-block;
		min-width: 100px;
		color: #333;
	}

	.url-container {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.5rem;
		align-items: center;
	}

	.url-input {
		flex: 1;
		padding: 0.5rem;
		border: 1px solid #ddd;
		border-radius: 6px;
		background: #f8f9fa;
		font-size: 0.875rem;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
		color: #555;
	}

	.copy-btn {
		padding: 0.5rem;
		border: 1px solid #ddd;
		border-radius: 6px;
		background: white;
		cursor: pointer;
		transition: all 0.2s ease;
		font-size: 1rem;
	}

	.copy-btn:hover {
		background: #f0f0f0;
		border-color: #bbb;
	}

	.next-steps {
		padding: 2rem;
		background: #f8f9ff;
	}

	.next-steps h4 {
		margin: 0 0 1rem 0;
		color: #333;
		font-size: 1.25rem;
	}

	.next-steps p {
		margin: 0 0 1rem 0;
		color: #666;
		line-height: 1.6;
	}

	.next-steps ul {
		margin: 0;
		padding-left: 1.5rem;
		color: #666;
	}

	.next-steps li {
		margin-bottom: 0.5rem;
		line-height: 1.5;
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

		.btn-secondary {
			padding: 0.375rem 0.75rem;
			font-size: 0.8125rem;
		}

		.content {
			padding: 1rem;
		}

		.welcome-section h2 {
			font-size: 1.5rem;
		}

		.welcome-section p {
			font-size: 1rem;
		}

		.file-info {
			padding: 1rem;
		}

		.selected-file-section {
			margin: 1rem;
		}

		.file-header {
			padding: 1.5rem;
			flex-direction: column;
			text-align: center;
			gap: 1.5rem;
		}

		.file-icon {
			width: 60px;
			height: 60px;
			font-size: 2rem;
		}

		.file-name {
			font-size: 1.25rem;
		}

		.file-metadata {
			padding: 1rem 1.5rem;
		}

		.url-container {
			flex-direction: column;
			gap: 0.75rem;
			align-items: stretch;
		}

		.next-steps {
			padding: 1.5rem;
		}
	}

	@media (max-width: 480px) {
		.header {
			flex-direction: column;
			gap: 0.75rem;
			padding: 1rem;
		}

		.header-actions {
			width: 100%;
			justify-content: center;
		}
	}
</style>
