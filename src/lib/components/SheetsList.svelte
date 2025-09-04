<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	let { spreadsheetId = '', spreadsheetName = '' } = $props();

	let sheets = $state<Array<{
		sheetId: number;
		title: string;
		index: number;
		sheetType: string;
		gridProperties: {
			rowCount: number;
			columnCount: number;
		};
	}>>([]);
	
	let isLoading = $state(false);
	let error = $state('');

	let session = $derived($page.data.session);

	onMount(async () => {
		if (spreadsheetId) {
			await loadSheetsInfo();
		}
	});

	async function loadSheetsInfo() {
		if (!spreadsheetId || !session?.accessToken) return;

		isLoading = true;
		error = '';

		try {
			const response = await fetch(`/api/sheets/${spreadsheetId}/info`, {
				headers: {
					'Authorization': `Bearer ${session.accessToken}`
				}
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();
			sheets = data.sheets || [];
		} catch (err) {
			error = err instanceof Error ? err.message : '시트 정보를 로드하는데 실패했습니다.';
			console.error('Error loading sheets info:', err);
		} finally {
			isLoading = false;
		}
	}

	function generateSheetUrl(sheetTitle: string, sheetId: number) {
		// Google Sheets의 특정 시트로 직접 이동하는 URL 생성
		const baseUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;
		return `${baseUrl}/edit#gid=${sheetId}`;
	}

	function copySheetUrl(sheetTitle: string, sheetId: number) {
		const url = generateSheetUrl(sheetTitle, sheetId);
		navigator.clipboard.writeText(url);
		// 간단한 피드백 (실제로는 토스트나 스낵바를 사용하면 더 좋음)
		alert(`${sheetTitle} 시트 링크가 복사되었습니다!`);
	}
</script>

<div class="sheets-container">
	<div class="sheets-header">
		<h3>📋 시트 목록</h3>
		<button onclick={loadSheetsInfo} disabled={isLoading} class="refresh-btn">
			{isLoading ? '로드 중...' : '🔄 새로고침'}
		</button>
	</div>

	{#if error}
		<div class="error-message">
			❌ {error}
		</div>
	{/if}

	{#if isLoading}
		<div class="loading">📊 시트 정보 로드 중...</div>
	{:else if sheets.length > 0}
		<div class="sheets-grid">
			{#each sheets as sheet}
				<div class="sheet-card">
					<div class="sheet-header">
						<div class="sheet-icon">📄</div>
						<div class="sheet-info">
							<h4 class="sheet-title">{sheet.title}</h4>
							<p class="sheet-details">
								{sheet.gridProperties.rowCount}행 × {sheet.gridProperties.columnCount}열
							</p>
						</div>
					</div>
					
					<div class="sheet-actions">
						<a 
							href={generateSheetUrl(sheet.title, sheet.sheetId)} 
							target="_blank" 
							rel="noopener noreferrer"
							class="open-sheet-btn"
							title="새 탭에서 시트 열기"
						>
							🔗 시트 열기
						</a>
						
						<button 
							onclick={() => copySheetUrl(sheet.title, sheet.sheetId)}
							class="copy-link-btn"
							title="시트 링크 복사"
						>
							📋 링크 복사
						</button>
					</div>

					<div class="sheet-metadata">
						<div class="metadata-row">
							<span class="label">시트 ID:</span>
							<code class="sheet-id">{sheet.sheetId}</code>
						</div>
						<div class="metadata-row">
							<span class="label">인덱스:</span>
							<span class="value">{sheet.index}</span>
						</div>
						<div class="metadata-row">
							<span class="label">타입:</span>
							<span class="value">{sheet.sheetType}</span>
						</div>
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class="empty-state">
			<p>시트 정보를 찾을 수 없습니다.</p>
			<button onclick={loadSheetsInfo} class="retry-btn">다시 시도</button>
		</div>
	{/if}
</div>

<style>
	.sheets-container {
		margin-top: 1.5rem;
		background: white;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		overflow: hidden;
	}

	.sheets-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		background: linear-gradient(135deg, #e8f5e8 0%, #f0f8f0 100%);
		border-bottom: 1px solid #e0e0e0;
	}

	.sheets-header h3 {
		margin: 0;
		color: #333;
		font-size: 1.25rem;
	}

	.refresh-btn {
		padding: 0.5rem 1rem;
		border: 1px solid #4caf50;
		border-radius: 6px;
		background: white;
		color: #4caf50;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.refresh-btn:hover:not(:disabled) {
		background: #4caf50;
		color: white;
	}

	.refresh-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error-message {
		padding: 1rem 1.5rem;
		background: #fee;
		color: #c33;
		border-bottom: 1px solid #fcc;
	}

	.loading, .empty-state {
		padding: 2rem;
		text-align: center;
		color: #666;
	}

	.retry-btn {
		margin-top: 1rem;
		padding: 0.5rem 1rem;
		border: 1px solid #007bff;
		border-radius: 6px;
		background: white;
		color: #007bff;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.retry-btn:hover {
		background: #007bff;
		color: white;
	}

	.sheets-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 1rem;
		padding: 1.5rem;
	}

	.sheet-card {
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		background: #fafafa;
		overflow: hidden;
		transition: all 0.2s ease;
	}

	.sheet-card:hover {
		border-color: #ccc;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
	}

	.sheet-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		background: white;
		border-bottom: 1px solid #e0e0e0;
	}

	.sheet-icon {
		font-size: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 40px;
		height: 40px;
		background: #f0f0f0;
		border-radius: 8px;
	}

	.sheet-info {
		flex: 1;
		min-width: 0;
	}

	.sheet-title {
		margin: 0 0 0.25rem 0;
		font-size: 1rem;
		font-weight: 600;
		color: #333;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.sheet-details {
		margin: 0;
		font-size: 0.8rem;
		color: #666;
	}

	.sheet-actions {
		display: flex;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: #f8f9fa;
		border-bottom: 1px solid #e0e0e0;
	}

	.open-sheet-btn, .copy-link-btn {
		flex: 1;
		padding: 0.5rem 0.75rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		background: white;
		color: #555;
		text-decoration: none;
		font-size: 0.8rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.open-sheet-btn:hover {
		background: #007bff;
		color: white;
		border-color: #007bff;
	}

	.copy-link-btn:hover {
		background: #28a745;
		color: white;
		border-color: #28a745;
	}

	.sheet-metadata {
		padding: 0.75rem 1rem;
		background: white;
	}

	.metadata-row {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
		font-size: 0.8rem;
	}

	.metadata-row:last-child {
		margin-bottom: 0;
	}

	.label {
		color: #666;
		font-weight: 500;
	}

	.value {
		color: #333;
	}

	.sheet-id {
		background: rgba(0, 0, 0, 0.05);
		padding: 0.1rem 0.3rem;
		border-radius: 3px;
		font-size: 0.75rem;
		color: #333;
		font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
	}

	/* 모바일 반응형 */
	@media (max-width: 768px) {
		.sheets-grid {
			grid-template-columns: 1fr;
			padding: 1rem;
		}

		.sheet-actions {
			flex-direction: column;
			gap: 0.5rem;
		}

		.sheets-header {
			padding: 1rem;
			flex-direction: column;
			gap: 1rem;
			text-align: center;
		}
	}
</style>