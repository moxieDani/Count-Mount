<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	let { 
		spreadsheetId = '', 
		range = 'Y27:AD126',
		headerRange = 'Y26:AD26'
	} = $props<{
		spreadsheetId: string;
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
	let currentMonth = $state(new Date().getMonth() + 1);
	let currentYear = $state(new Date().getFullYear());

	// 총 지출 금액을 계산하는 함수
	function calculateTotalExpense(): number {
		if (!tableData?.values || tableData.values.length === 0) {
			return 0;
		}

		let total = 0;
		
		// AC 열은 테이블의 마지막에서 두 번째 열 (AD가 마지막)
		// Y~AD 범위에서 AC는 4번째 열 (Y=0, Z=1, AA=2, AB=3, AC=4)
		const expenseColumnIndex = 4; 
		
		for (const row of tableData.values) {
			if (row.length > expenseColumnIndex) {
				const cellValue = row[expenseColumnIndex];
				if (cellValue && typeof cellValue === 'string') {
					// 숫자가 아닌 문자 제거하고 숫자만 추출
					const numericValue = parseFloat(cellValue.replace(/[^\d.-]/g, ''));
					if (!isNaN(numericValue)) {
						total += numericValue;
					}
				}
			}
		}
		
		return total;
	}

	// 숫자를 천단위 콤마로 포맷하는 함수
	function formatNumber(num: number): string {
		return num.toLocaleString('ko-KR');
	}

	// 월 이름 배열
	const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

	// 스프레드시트에서 월별 시트 찾기
	async function findSheetByMonth(month: number): Promise<string | null> {
		if (!spreadsheetId || !session?.accessToken) return null;

		try {
			const response = await fetch(`/api/sheets/${spreadsheetId}/info`, {
				headers: {
					'Authorization': `Bearer ${session.accessToken}`
				}
			});

			if (!response.ok) return null;

			const data = await response.json();
			const sheets = data.sheets || [];

			const possibleFormats = [
				`${month}월`,
				monthNames[month - 1],
				`${String(month).padStart(2, '0')}월`,
				month.toString(),
				String(month).padStart(2, '0'),
			];

			for (const format of possibleFormats) {
				const foundSheet = sheets.find((sheet: any) => 
					sheet.title.includes(format) || 
					sheet.title === format ||
					sheet.title.toLowerCase().includes(format.toLowerCase())
				);
				if (foundSheet) {
					return foundSheet.title;
				}
			}

			return null;
		} catch (err) {
			console.error('Error finding sheet by month:', err);
			return null;
		}
	}

	async function fetchTableData(targetMonth?: number) {
		if (!spreadsheetId || !session?.accessToken) return;

		isLoading = true;
		error = '';

		try {
			const monthToFetch = targetMonth || currentMonth;
			const sheetName = await findSheetByMonth(monthToFetch);
			
			if (!sheetName) {
				throw new Error(`${monthToFetch}월에 해당하는 시트를 찾을 수 없습니다.`);
			}

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

	// 이전달로 이동
	function goToPreviousMonth() {
		if (currentMonth === 1) {
			currentMonth = 12;
			currentYear = currentYear - 1;
		} else {
			currentMonth = currentMonth - 1;
		}
		fetchTableData(currentMonth);
	}

	// 다음달로 이동
	function goToNextMonth() {
		if (currentMonth === 12) {
			currentMonth = 1;
			currentYear = currentYear + 1;
		} else {
			currentMonth = currentMonth + 1;
		}
		fetchTableData(currentMonth);
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

	// 컴포넌트 마운트 시 데이터 로드
	onMount(() => {
		fetchTableData();
	});

	// 월 네비게이션 버튼 활성화 여부
	let canGoPrevious = $derived(() => {
		return !(currentMonth === 1 && currentYear <= 2020);
	});

	let canGoNext = $derived(() => {
		const now = new Date();
		const currentDate = now.getFullYear() * 12 + now.getMonth() + 1;
		const selectedDate = currentYear * 12 + currentMonth;
		return selectedDate < currentDate;
	});
</script>

<div class="table-container">
	<div class="table-header">
		<div class="header-info">
			<h3>📊 {currentYear}년 {monthNames[currentMonth - 1]} 가계부 데이터</h3>
			<div class="expense-info">
				<span class="expense-badge">총 지출: {formatNumber(calculateTotalExpense())}원</span>
			</div>
		</div>
		<div class="month-navigation">
			<button 
				onclick={goToPreviousMonth} 
				class="nav-btn prev-btn"
				disabled={isLoading || !canGoPrevious}
				title="이전 달"
			>
				◀ 이전달
			</button>
			<div class="current-month-indicator">
				{currentYear}년 {monthNames[currentMonth - 1]}
			</div>
			<button 
				onclick={goToNextMonth} 
				class="nav-btn next-btn"
				disabled={isLoading || !canGoNext}
				title="다음 달"
			>
				다음달 ▶
			</button>
		</div>
	</div>


	{#if error}
		<div class="error-message">
			❌ {error}
			<button onclick={fetchTableData} class="retry-btn">다시 시도</button>
		</div>
	{/if}

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
		{:else}
			<div class="no-data-message">
				<div class="no-data-icon">📋</div>
				<h4>데이터를 불러오지 못했습니다</h4>
				<p>선택한 월의 시트를 확인해주세요.</p>
			</div>
		{/if}
	</div>
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

	.expense-info {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.expense-badge {
		display: inline-block;
		padding: 0.25rem 0.8rem;
		background: rgba(76, 175, 80, 0.1);
		border: 1px solid rgba(76, 175, 80, 0.3);
		border-radius: 4px;
		font-size: 0.8rem;
		color: #388e3c;
		font-weight: 600;
	}

	.month-navigation {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.nav-btn {
		padding: 0.5rem 0.9rem;
		border: 1px solid #2196f3;
		border-radius: 6px;
		background: white;
		color: #2196f3;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
		white-space: nowrap;
		font-size: 0.8rem;
	}

	.nav-btn:hover:not(:disabled) {
		background: #2196f3;
		color: white;
		transform: translateY(-1px);
		box-shadow: 0 2px 4px rgba(33, 150, 243, 0.3);
	}

	.nav-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		background: #f5f5f5;
		color: #999;
		border-color: #ddd;
	}

	.current-month-indicator {
		padding: 0.5rem 0.8rem;
		background: rgba(33, 150, 243, 0.1);
		border: 1px solid rgba(33, 150, 243, 0.2);
		border-radius: 6px;
		color: #2196f3;
		font-weight: 600;
		font-size: 0.8rem;
		min-width: 120px;
		text-align: center;
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

	.empty-data, .no-data-message {
		text-align: center;
		padding: 3rem 1rem;
		color: #666;
	}

	.empty-icon, .no-data-icon {
		font-size: 3rem;
		margin-bottom: 1rem;
	}

	.empty-data h4, .no-data-message h4 {
		margin: 0 0 0.5rem 0;
		color: #333;
		font-size: 1.25rem;
	}

	.empty-data p, .no-data-message p {
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

		.month-navigation {
			justify-content: center;
			flex-wrap: wrap;
			gap: 0.5rem;
		}

		.nav-btn {
			padding: 0.4rem 0.7rem;
			font-size: 0.75rem;
		}

		.current-month-indicator {
			padding: 0.4rem 0.6rem;
			font-size: 0.75rem;
			min-width: 100px;
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