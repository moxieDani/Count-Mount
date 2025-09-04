<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	let { 
		spreadsheetId = '', 
		sheetName = '',
		range = 'Y27:AD126',
		headerRange = 'Y26:AD26'
	} = $props<{
		spreadsheetId: string;
		sheetName: string;
		range?: string;
		headerRange?: string;
	}>();

	let session = $derived(page.data.session);
	
	let tableData = $state<{
		values: string[][];
		headers: string[];
		cellFormats: any[][];
		headerFormats: any[];
		metadata: {
			spreadsheetId: string;
			sheetName: string;
			requestedDataRange: string;
			requestedHeaderRange: string;
			actualRange: string;
			hasData: boolean;
			hasHeaders: boolean;
		};
	} | null>(null);
	
	let isLoading = $state(false);
	let error = $state('');
	let showTable = $state(false);

	// 현재 날짜의 연도와 월 가져오기
	function getCurrentYearMonth() {
		const now = new Date();
		return {
			year: now.getFullYear(),
			month: now.getMonth() + 1
		};
	}

	async function fetchTableData() {
		if (!spreadsheetId || !sheetName || !session?.accessToken) return;

		isLoading = true;
		error = '';

		try {
			const queryParams = new URLSearchParams({
				range,
				headerRange,
				sheetName
			});

			const response = await fetch(`/api/sheets/${spreadsheetId}/range?${queryParams}`, {
				headers: {
					'Authorization': `Bearer ${session.accessToken}`
				}
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();
			tableData = data;

		} catch (err) {
			error = err instanceof Error ? err.message : '데이터를 불러오는데 실패했습니다.';
			console.error('Error fetching table data:', err);
		} finally {
			isLoading = false;
		}
	}

	function toggleTable() {
		if (!showTable && !tableData) {
			fetchTableData();
		}
		showTable = !showTable;
	}

	// 셀 값이 비어있는지 확인하는 함수
	function isCellEmpty(value: string | undefined | null): boolean {
		return value === undefined || value === null || value.toString().trim() === '';
	}

	// 행이 완전히 비어있는지 확인하는 함수
	function isRowEmpty(row: string[]): boolean {
		return row.every(cell => isCellEmpty(cell));
	}

	// 숫자인지 확인하고 포맷팅하는 함수
	function formatCellValue(value: string | undefined | null): string {
		if (isCellEmpty(value)) return '';
		
		const strValue = value!.toString().trim();
		
		// 숫자인지 확인 (콤마가 포함된 숫자도 처리)
		const numericValue = strValue.replace(/,/g, '');
		if (!isNaN(Number(numericValue)) && numericValue !== '') {
			// 숫자라면 천단위 콤마 추가
			return Number(numericValue).toLocaleString();
		}
		
		return strValue;
	}

	// 셀 스타일을 생성하는 함수
	function getCellStyle(formatInfo: any): string {
		if (!formatInfo) return '';
		
		const styles: string[] = [];
		
		if (formatInfo.textColor) {
			styles.push(`color: ${formatInfo.textColor}`);
		}
		
		if (formatInfo.backgroundColor) {
			styles.push(`background-color: ${formatInfo.backgroundColor}`);
		}
		
		return styles.join('; ');
	}

	// AC 컬럼(인덱스 4)인지 확인하는 함수 - Y(0), Z(1), AA(2), AB(3), AC(4)
	function isACColumn(colIndex: number): boolean {
		return colIndex === 4;
	}

	// 현재 연월 정보
	let currentInfo = $derived(() => {
		const { year, month } = getCurrentYearMonth();
		return {
			year,
			month,
			monthName: `${month}월`
		};
	});
</script>

<div class="table-container">
	<div class="table-header">
		<div class="header-info">
			<h3>📊 {currentInfo.year}년 {currentInfo.monthName} 가계부 데이터</h3>
			<div class="range-info">
				<span class="range-badge">범위: {range}</span>
				<span class="sheet-badge">시트: {sheetName}</span>
			</div>
		</div>
		<button 
			onclick={toggleTable} 
			class="toggle-btn"
			disabled={isLoading}
		>
			{#if isLoading}
				⏳ 로드 중...
			{:else if showTable}
				📤 표 접기
			{:else}
				📥 표 보기
			{/if}
		</button>
	</div>

	{#if error}
		<div class="error-message">
			❌ {error}
			<button onclick={fetchTableData} class="retry-btn">다시 시도</button>
		</div>
	{/if}

	{#if showTable}
		<div class="table-content">
			{#if isLoading}
				<div class="loading-state">
					<div class="spinner"></div>
					<p>데이터를 불러오는 중...</p>
				</div>
			{:else if tableData}

				{#if tableData.values.length > 0}
					<div class="table-wrapper">
						<table class="data-table">
							<thead>
								<tr>
									{#each tableData.headers as header, colIndex}
										<th 
											class="col-header"
											style={tableData.headerFormats && tableData.headerFormats[colIndex] ? getCellStyle(tableData.headerFormats[colIndex]) : ''}
										>
											{header}
										</th>
									{/each}
								</tr>
							</thead>
							<tbody>
								{#each tableData.values as row, rowIndex}
									{#if !isRowEmpty(row)}
										<tr class="data-row">
											{#each tableData.headers as _, colIndex}
												{@const cellFormat = tableData.cellFormats && tableData.cellFormats[rowIndex] && tableData.cellFormats[rowIndex][colIndex]}
												{@const cellStyle = getCellStyle(cellFormat)}
												<td 
													class="data-cell" 
													class:empty-cell={isCellEmpty(row[colIndex])}
													class:ac-column={isACColumn(colIndex)}
													style={cellStyle}
												>
													{formatCellValue(row[colIndex])}
												</td>
											{/each}
										</tr>
									{/if}
								{/each}
							</tbody>
						</table>
					</div>
				{:else}
					<div class="empty-data">
						<div class="empty-icon">📋</div>
						<h4>데이터가 없습니다</h4>
						<p>선택한 범위 ({range})에 데이터가 없거나 비어있습니다.</p>
						<div class="empty-actions">
							<button onclick={fetchTableData} class="refresh-data-btn">
								🔄 다시 확인
							</button>
						</div>
					</div>
				{/if}

				<div class="table-footer">
					<div class="metadata-info">
						<small>
							실제 범위: {tableData.metadata.actualRange} | 
							업데이트: {new Date().toLocaleString('ko-KR')}
						</small>
					</div>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.table-container {
		margin-top: 1.5rem;
		background: white;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		overflow: hidden;
	}

	.table-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		padding: 1.5rem;
		background: linear-gradient(135deg, #e3f2fd 0%, #f8f9ff 100%);
		border-bottom: 1px solid #e0e0e0;
	}

	.header-info h3 {
		margin: 0 0 0.5rem 0;
		color: #333;
		font-size: 1.25rem;
		font-weight: 600;
	}

	.range-info {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.range-badge, .sheet-badge {
		display: inline-block;
		padding: 0.25rem 0.5rem;
		background: rgba(255, 255, 255, 0.8);
		border: 1px solid rgba(0, 0, 0, 0.1);
		border-radius: 4px;
		font-size: 0.75rem;
		color: #555;
		font-family: monospace;
	}

	.toggle-btn {
		padding: 0.75rem 1.5rem;
		border: 1px solid #2196f3;
		border-radius: 8px;
		background: white;
		color: #2196f3;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
	}

	.toggle-btn:hover:not(:disabled) {
		background: #2196f3;
		color: white;
		transform: translateY(-1px);
		box-shadow: 0 2px 4px rgba(33, 150, 243, 0.3);
	}

	.toggle-btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.error-message {
		padding: 1rem 1.5rem;
		background: #fee;
		color: #c33;
		border-bottom: 1px solid #fcc;
		display: flex;
		justify-content: space-between;
		align-items: center;
	}

	.retry-btn, .refresh-data-btn {
		padding: 0.5rem 1rem;
		border: 1px solid #ff6b6b;
		border-radius: 4px;
		background: white;
		color: #ff6b6b;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.retry-btn:hover, .refresh-data-btn:hover {
		background: #ff6b6b;
		color: white;
	}

	.table-content {
		padding: 1.5rem;
	}

	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 3rem;
		text-align: center;
		color: #666;
	}

	.spinner {
		width: 40px;
		height: 40px;
		border: 3px solid #f3f3f3;
		border-top: 3px solid #2196f3;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin-bottom: 1rem;
	}

	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}

	.data-summary {
		margin-bottom: 1rem;
		padding: 1rem;
		background: #f8f9fa;
		border-radius: 8px;
	}

	.summary-stats {
		display: flex;
		gap: 2rem;
		flex-wrap: wrap;
	}

	.stat-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.stat-label {
		color: #666;
		font-size: 0.875rem;
		font-weight: 500;
	}

	.stat-value {
		color: #333;
		font-weight: 600;
		background: white;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		border: 1px solid #e0e0e0;
	}

	.table-wrapper {
		overflow-x: auto;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		margin: 1rem 0;
	}

	.data-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.875rem;
	}

	.data-table th,
	.data-table td {
		padding: 0.75rem 0.5rem;
		text-align: center;
		border: 1px solid #e0e0e0;
	}

	.col-header {
		background: #f5f5f5;
		font-weight: 600;
		color: #333;
		position: sticky;
		top: 0;
		z-index: 10;
	}

	.data-cell {
		background: white;
		min-width: 80px;
		max-width: 150px;
		word-break: break-word;
	}

	.data-cell.empty-cell {
		background: #fafafa;
		color: #ccc;
	}

	.data-row:nth-child(even) .data-cell {
		background: #fafafa;
	}

	.data-row:hover .data-cell {
		background: #e3f2fd;
	}

	/* AC 컬럼 특별 스타일링 */
	.ac-column {
		font-weight: 500;
		border-left: 2px solid #e0e0e0;
		border-right: 2px solid #e0e0e0;
	}

	.ac-column.empty-cell {
		background: #f8f8f8;
	}

	/* 색상이 적용된 셀에 대한 추가 스타일링 */
	.data-cell[style*="color"] {
		font-weight: 500;
	}

	.empty-data {
		text-align: center;
		padding: 3rem 1rem;
		color: #666;
	}

	.empty-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.empty-data h4 {
		margin: 0 0 0.5rem 0;
		color: #333;
		font-size: 1.25rem;
	}

	.empty-data p {
		margin: 0 0 1.5rem 0;
		line-height: 1.5;
	}

	.empty-actions {
		margin-top: 1rem;
	}

	.table-footer {
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid #e0e0e0;
		text-align: center;
	}

	.metadata-info {
		color: #666;
		font-size: 0.75rem;
	}

	/* 모바일 반응형 */
	@media (max-width: 768px) {
		.table-header {
			flex-direction: column;
			gap: 1rem;
			align-items: stretch;
		}

		.toggle-btn {
			width: 100%;
			text-align: center;
		}

		.table-content {
			padding: 1rem;
		}

		.summary-stats {
			flex-direction: column;
			gap: 0.5rem;
		}

		.data-table {
			font-size: 0.75rem;
		}

		.data-table th,
		.data-table td {
			padding: 0.5rem 0.25rem;
			min-width: 60px;
		}

		.range-info {
			justify-content: center;
		}
	}

	@media (max-width: 480px) {
		.data-table th,
		.data-table td {
			padding: 0.375rem 0.1875rem;
			font-size: 0.6875rem;
		}
		
		.data-cell {
			min-width: 50px;
			max-width: 100px;
		}
	}
</style>