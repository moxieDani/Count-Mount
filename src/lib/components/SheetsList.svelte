<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import SpreadsheetTable from './SpreadsheetTable.svelte';

	let { spreadsheetId = '', spreadsheetName = '' } = $props();

	// 스프레드시트 제목에서 연도 추출
	function extractYearFromSpreadsheetName(name: string): number | null {
		const yearMatch = name.match(/\b(20\d{2})\b/); // 2000년대 연도 찾기
		return yearMatch ? parseInt(yearMatch[1]) : null;
	}

	// 현재 연도의 스프레드시트를 찾는 함수
	async function findCurrentYearSpreadsheet(): Promise<{id: string, name: string, url: string, mimeType: string} | null> {
		if (!session?.accessToken) return null;
		
		const currentYear = new Date().getFullYear();
		const currentYearPattern = `${currentYear}`;
		
		try {
			// Google Picker API를 사용하지 않고 Drive API로 검색
			// 여기서는 간단히 현재 연도가 포함된 스프레드시트 이름을 가정
			// 실제로는 Drive API 호출이 필요하지만, UI 먼저 구현
			return null; // 실제 구현 시 Drive API 결과 반환
		} catch (error) {
			console.error('Error finding current year spreadsheet:', error);
			return null;
		}
	}

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

	let session = $derived(page.data.session);

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

	function getCurrentMonthSheet() {
		const currentDate = new Date();
		const currentMonth = currentDate.getMonth() + 1; // 0-indexed이므로 +1
		const currentYear = currentDate.getFullYear();
		
		// 스프레드시트 제목에서 연도 추출
		const spreadsheetYear = extractYearFromSpreadsheetName(spreadsheetName);
		
		// 스프레드시트의 연도와 현재 연도가 다르면 null 반환
		if (spreadsheetYear && spreadsheetYear !== currentYear) {
			return null;
		}
		
		const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
		const currentMonthName = monthNames[currentMonth - 1];
		
		// 다양한 월 표기 형식 지원
		const possibleFormats = [
			currentMonthName,
			`${currentMonth}월`,
			`${String(currentMonth).padStart(2, '0')}월`,
			currentMonth.toString(),
			String(currentMonth).padStart(2, '0'),
			`월${currentMonth}`,
		];
		
		// 시트 목록에서 현재 월과 일치하는 시트 찾기
		for (const format of possibleFormats) {
			const foundSheet = sheets.find(sheet => 
				sheet.title.includes(format) || 
				sheet.title === format ||
				sheet.title.toLowerCase().includes(format.toLowerCase())
			);
			if (foundSheet) {
				return foundSheet;
			}
		}
		
		return null;
	}

	let currentMonthSheet = $derived(getCurrentMonthSheet());
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
		<!-- 현재 월 시트 바로가기 -->
		{#if currentMonthSheet}
			<div class="current-month-section">
				<div class="current-month-header">
					<h4>📅 이번 달 시트 바로가기</h4>
					<span class="current-month-info">
						{new Date().getMonth() + 1}월 ({currentMonthSheet.title})
					</span>
				</div>
				<div class="current-month-actions">
					<a 
						href={generateSheetUrl(currentMonthSheet.title, currentMonthSheet.sheetId)}
						target="_blank"
						rel="noopener noreferrer"
						class="current-month-btn primary"
						title="이번 달 시트 열기"
					>
						🚀 {currentMonthSheet.title} 시트 열기
					</a>
					<button 
						onclick={() => copySheetUrl(currentMonthSheet.title, currentMonthSheet.sheetId)}
						class="current-month-btn secondary"
						title="이번 달 시트 링크 복사"
					>
						📋 링크 복사
					</button>
				</div>
			</div>

			<!-- 월별 시트 데이터 표 -->
			<SpreadsheetTable 
				{spreadsheetId} 
				range="Y27:AD126"
				{...{ spreadsheetName, headerRange: "Y26:AD26" }}
			/>
		{/if}
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

	/* 현재 월 시트 바로가기 스타일 */
	.current-month-section {
		background: linear-gradient(135deg, #fff3cd 0%, #ffeeba 100%);
		border-bottom: 1px solid #e0e0e0;
		padding: 1.5rem;
		margin: 0;
	}

	.current-month-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.current-month-header h4 {
		margin: 0;
		color: #856404;
		font-size: 1.125rem;
		font-weight: 600;
	}

	.current-month-info {
		background: rgba(255, 255, 255, 0.7);
		padding: 0.25rem 0.75rem;
		border-radius: 20px;
		font-size: 0.875rem;
		color: #856404;
		font-weight: 500;
	}

	.current-month-actions {
		display: flex;
		gap: 0.75rem;
	}

	.current-month-btn {
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		font-size: 0.925rem;
		font-weight: 500;
		text-decoration: none;
		cursor: pointer;
		transition: all 0.3s ease;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		min-width: 140px;
	}

	.current-month-btn.primary {
		background: #ffc107;
		color: #212529;
		border: 2px solid #ffc107;
		box-shadow: 0 2px 4px rgba(255, 193, 7, 0.3);
	}

	.current-month-btn.primary:hover {
		background: #e0a800;
		border-color: #e0a800;
		transform: translateY(-2px);
		box-shadow: 0 4px 8px rgba(255, 193, 7, 0.4);
	}

	.current-month-btn.secondary {
		background: rgba(255, 255, 255, 0.8);
		color: #856404;
		border: 2px solid rgba(133, 100, 4, 0.3);
	}

	.current-month-btn.secondary:hover {
		background: white;
		border-color: #856404;
		color: #695232;
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

		.current-month-section {
			padding: 1rem;
		}

		.current-month-header {
			flex-direction: column;
			gap: 0.5rem;
			text-align: center;
		}

		.current-month-actions {
			flex-direction: column;
			gap: 0.5rem;
		}

		.current-month-btn {
			min-width: auto;
			padding: 0.625rem 1rem;
		}

	}
</style>