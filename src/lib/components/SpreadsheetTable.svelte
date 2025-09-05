<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import MonthYearPicker from './MonthYearPicker.svelte';

	// Google Picker API 타입 정의
	const googlePicker: any = typeof window !== 'undefined' ? (window as any).google : null;

	let { 
		spreadsheetId: initialSpreadsheetId = '', 
		range = 'Y27:AD126',
		headerRange = 'Y26:AD26'
	} = $props<{
		spreadsheetId: string;
		range?: string;
		headerRange?: string;
	}>();

	let session = $derived(page.data.session);
	
	// 동적으로 변경 가능한 스프레드시트 ID
	let spreadsheetId = $state(initialSpreadsheetId);
	
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
	
	// 년도/월 선택 모달 상태
	let showDatePicker = $state(false);

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

	// 연도별 스프레드시트를 찾는 함수 (공유 드라이브 포함)
	async function findSpreadsheetByYear(targetYear: number): Promise<string | null> {
		if (!session?.accessToken) return null;

		try {
			console.log(`Searching for ${targetYear} spreadsheet in shared drives...`);
			
			// 정확한 패턴만 검색 - '연도 가계부' 형태만
			const searchPatterns = [
				`name:'${targetYear} 가계부'`,
				`name:'${targetYear}가계부'`
			];
			
			// 각 패턴으로 검색 (공유 드라이브 포함)
			for (const pattern of searchPatterns) {
				const searchQuery = `${pattern} and mimeType='application/vnd.google-apps.spreadsheet'`;
				console.log(`Trying search pattern: ${searchQuery}`);
				
				// 공유 드라이브 포함 검색
				const searchUrl = `https://www.googleapis.com/drive/v3/files?` + 
					`q=${encodeURIComponent(searchQuery)}&` +
					`supportsAllDrives=true&` +           // 공유 드라이브 지원 여부 명시
					`includeItemsFromAllDrives=true&` +   // 검색 결과에 공유 드라이브 항목 포함
					`corpora=allDrives&` +               // 모든 공유 드라이브 검색
					`orderBy=modifiedTime desc`;          // 최근 수정순으로 정렬

				const response = await fetch(searchUrl, {
					headers: {
						'Authorization': `Bearer ${session.accessToken}`
					}
				});

				if (!response.ok) {
					console.error(`Shared drive search failed with status: ${response.status}`);
					const errorText = await response.text();
					console.error('Error details:', errorText);
					
					// 공유 드라이브 검색이 실패하면 개인 드라이브에서 검색 시도
					const fallbackUrl = `https://www.googleapis.com/drive/v3/files?` + 
						`q=${encodeURIComponent(searchQuery)}&` +
						`orderBy=modifiedTime desc`;

					const fallbackResponse = await fetch(fallbackUrl, {
						headers: {
							'Authorization': `Bearer ${session.accessToken}`
						}
					});

					if (fallbackResponse.ok) {
						const fallbackData = await fallbackResponse.json();
						const fallbackFiles = fallbackData.files || [];
						console.log(`Found ${fallbackFiles.length} files in personal drive with pattern: ${pattern}`);
						
						for (const file of fallbackFiles) {
							console.log(`Checking personal drive file: ${file.name} (ID: ${file.id})`);
							// 정확한 패턴 매칭만 허용
							if (file.name && (
								file.name === `${targetYear} 가계부` ||
								file.name === `${targetYear}가계부`
							)) {
								console.log(`Found matching spreadsheet in personal drive: ${file.name}`);
								return file.id;
							}
						}
					}
					continue;
				}

				const data = await response.json();
				const files = data.files || [];
				
				console.log(`Found ${files.length} files with pattern: ${pattern}`);
				
				// 검색 결과에서 정확한 이름 매칭만 허용
				for (const file of files) {
					console.log(`Checking file: ${file.name} (ID: ${file.id})`);
					if (file.name && (
						file.name === `${targetYear} 가계부` ||
						file.name === `${targetYear}가계부`
					)) {
						console.log(`Found matching spreadsheet in shared drive: ${file.name}`);
						return file.id;
					}
				}
			}

			console.log(`No spreadsheet found for year ${targetYear} in any drive`);
			return null;
		} catch (err) {
			console.error('Error searching for spreadsheet by year:', err);
			return null;
		}
	}

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

	async function fetchTableData() {
		if (!session?.accessToken) return;

		isLoading = true;
		error = '';

		try {
			// 1. 먼저 해당 년도의 스프레드시트가 존재하는지 확인
			const yearSpreadsheetId = await findSpreadsheetByYear(currentYear);
			if (!yearSpreadsheetId) {
				error = `${currentYear}년 스프레드시트를 찾을 수 없습니다.`;
				return;
			}

			// 2. 스프레드시트 ID 업데이트 (찾은 스프레드시트가 현재와 다를 수 있음)
			if (spreadsheetId !== yearSpreadsheetId) {
				spreadsheetId = yearSpreadsheetId;
			}

			// 3. 해당 월의 시트가 존재하는지 확인
			const sheetName = await findSheetByMonth(currentMonth);
			if (!sheetName) {
				error = `${currentYear}년 스프레드시트에서 ${currentMonth}월에 해당하는 시트를 찾을 수 없습니다.`;
				return;
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
				const errorData = await response.json().catch(() => ({}));
				
				// 토큰 만료 시 페이지 새로고침으로 자동 재인증
				if (response.status === 401 && errorData.needsRefresh) {
					alert('세션이 만료되었습니다. 페이지를 새로고침합니다.');
					window.location.reload();
					return;
				}
				
				error = errorData.error || `HTTP ${response.status}: ${response.statusText}`;
				return;
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

	// Google Picker를 통한 수동 스프레드시트 선택
	function showSpreadsheetPicker(targetYear: number) {
		// Google Picker API를 통해 스프레드시트 선택창 띄우기
		if (googlePicker && googlePicker.picker) {
			const picker = new googlePicker.picker.PickerBuilder()
				.addView(new googlePicker.picker.DocsView(googlePicker.picker.ViewId.SPREADSHEETS))
				.setOAuthToken(session?.accessToken)
				.setCallback((data: any) => {
					if (data.action === googlePicker.picker.Action.PICKED) {
						const file = data.docs[0];
						if (file.name.includes(targetYear.toString()) && file.name.includes('가계부')) {
							spreadsheetId = file.id;
							console.log(`Selected spreadsheet: ${file.name} (ID: ${file.id})`);
							
							// 월과 연도 업데이트 후 데이터 로드
							if (targetYear < currentYear) {
								currentMonth = 12;
							} else {
								currentMonth = 1;
							}
							currentYear = targetYear;
							fetchTableData();
						} else {
							alert(`'${targetYear}년 가계부' 파일이 없습니다.`);
						}
					}
				})
				.build();
			picker.setVisible(true);
		} else {
			alert('Google Picker를 사용할 수 없습니다.');
		}
	}

	// 이전달로 이동
	async function goToPreviousMonth() {
		if (currentMonth === 1) {
			// 연도 변경 시 새로운 스프레드시트 찾기
			const previousYear = currentYear - 1;
			const newSpreadsheetId = await findSpreadsheetByYear(previousYear);
			
			if (newSpreadsheetId) {
				// 새로운 스프레드시트로 변경
				spreadsheetId = newSpreadsheetId;
				currentMonth = 12;
				currentYear = previousYear;
			} else {
				// 자동 검색 실패 시 사용자에게 표시
				error = `'${previousYear}년 가계부' 파일이 없습니다.`;
				return;
			}
		} else {
			currentMonth = currentMonth - 1;
		}
		await fetchTableData();
	}

	// 다음달로 이동
	async function goToNextMonth() {
		if (currentMonth === 12) {
			// 연도 변경 시 새로운 스프레드시트 찾기
			const nextYear = currentYear + 1;
			const newSpreadsheetId = await findSpreadsheetByYear(nextYear);
			
			if (newSpreadsheetId) {
				// 새로운 스프레드시트로 변경
				spreadsheetId = newSpreadsheetId;
				currentMonth = 1;
				currentYear = nextYear;
			} else {
				// 자동 검색 실패 시 사용자에게 표시
				error = `'${nextYear}년 가계부' 파일이 없습니다.`;
				return;
			}
		} else {
			currentMonth = currentMonth + 1;
		}
		await fetchTableData();
	}

	// 년도/월 선택 모달 열기
	function openDatePicker() {
		showDatePicker = true;
	}

	// 년도/월 선택 모달 닫기
	function closeDatePicker() {
		showDatePicker = false;
	}

	// 년도/월 선택 처리 함수
	async function handleMonthYearSelect(selectedYear: number, selectedMonth: number) {
		showDatePicker = false;
		
		// 선택된 년도가 현재 년도와 다르면 스프레드시트를 변경해야 함
		if (selectedYear !== currentYear) {
			const foundSpreadsheetId = await findSpreadsheetByYear(selectedYear);
			if (foundSpreadsheetId) {
				spreadsheetId = foundSpreadsheetId;
				currentYear = selectedYear;
				currentMonth = selectedMonth;
				// 데이터 갱신
				await fetchTableData();
			} else {
				// 스프레드시트를 찾을 수 없는 경우 에러 메시지 표시
				error = `'${selectedYear}년 가계부' 파일이 없습니다.`;
				// 년도/월 상태는 변경하지 않고 기존 상태 유지
				return;
			}
		} else {
			// 같은 년도면 월만 변경
			currentMonth = selectedMonth;
			// 데이터 갱신
			await fetchTableData();
		}
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
			<h3>📊 {currentYear}년 {monthNames[currentMonth - 1]} 가계부</h3>
			<div class="expense-info">
				<span class="expense-badge">총 지출: {formatNumber(calculateTotalExpense())}원</span>
				<button 
					onclick={() => fetchTableData()} 
					class="nav-btn refresh-btn"
					disabled={isLoading}
					title="새로고침"
				>
					🔄 새로고침
				</button>
			</div>
		</div>
	</div>


	{#if error}
		<div class="error-message">
			❌ {error}
			<button onclick={() => error = ''} class="close-error-btn">닫기</button>
		</div>
	{/if}

	<div class="table-content">
		{#if isLoading}
			<div class="loading-state">
				<div class="spinner"></div>
				<p>데이터를 불러오는 중...</p>
			</div>
		{:else if tableData}
			<div class="month-navigation">
				<button 
					onclick={() => goToPreviousMonth()} 
					class="nav-btn prev-btn"
					disabled={isLoading || !canGoPrevious}
					title="이전 달"
				>
					◀ 이전 달
				</button>
				<button class="current-month-indicator" onclick={openDatePicker} title="년도/월 선택">
					{currentYear}년 {monthNames[currentMonth - 1]}
				</button>
				<button 
					onclick={() => goToNextMonth()} 
					class="nav-btn next-btn"
					disabled={isLoading || !canGoNext}
					title="다음 달"
				>
					다음 달 ▶
				</button>
			</div>
			
			<div class="table-wrapper">
				<table class="data-table">
					<thead>
						<tr>
							{#each tableData.headers as header, colIndex}
								<th 
									class="col-header"
									class:date-column={header === '날짜'}
									style={tableData.headerFormats && tableData.headerFormats[colIndex] ? getCellStyle(tableData.headerFormats[colIndex]) : ''}
								>
									{header}
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#if tableData.values.length > 0}
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
												class:date-column={tableData.headers[colIndex] === '날짜'}
												style={cellStyle}
											>
												{formatCellValue(row[colIndex])}
											</td>
										{/each}
									</tr>
								{/if}
							{/each}
						{:else}
							<!-- 데이터가 비어있을 때 빈 행들을 표시 -->
							{#each Array(10) as _, rowIndex}
								<tr class="data-row empty-row">
									{#each tableData.headers as _, colIndex}
										<td 
											class="data-cell empty-cell"
											class:ac-column={isACColumn(colIndex)}
											class:date-column={tableData.headers[colIndex] === '날짜'}
										>
											-
										</td>
									{/each}
								</tr>
							{/each}
						{/if}
					</tbody>
				</table>
			</div>

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

<!-- 년도/월 선택 모달 -->
{#if showDatePicker}
	<MonthYearPicker 
		currentYear={currentYear}
		currentMonth={currentMonth}
		onSelect={handleMonthYearSelect}
		onClose={closeDatePicker}
	/>
{/if}

<style>
	.table-container {
		background: white;
		overflow: hidden;
		width: 100%;
		flex-grow: 1; /* Changed from height: 100% */
		display: flex;
		flex-direction: column;
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
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem 0.8rem;
		background: rgba(76, 175, 80, 0.1);
		border: 1px solid rgba(76, 175, 80, 0.3);
		border-radius: 4px;
		font-size: 0.8rem;
		color: #388e3c;
		font-weight: 600;
		text-align: center;
		line-height: 1.2;
	}

	.month-navigation {
		display: flex;
		justify-content: center;
		flex-wrap: wrap;
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

	.refresh-btn {
		background: #4CAF50;
		color: white;
		border-color: #4CAF50;
	}

	.refresh-btn:hover:not(:disabled) {
		background: #45a049;
		border-color: #45a049;
		color: white;
		transform: translateY(-1px);
		box-shadow: 0 2px 4px rgba(76, 175, 80, 0.3);
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
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.current-month-indicator:hover {
		background: rgba(33, 150, 243, 0.15);
		border-color: rgba(33, 150, 243, 0.3);
		transform: translateY(-1px);
		box-shadow: 0 2px 4px rgba(33, 150, 243, 0.2);
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

	.close-error-btn {
		padding: 0.5rem 1rem;
		border: 1px solid #666;
		border-radius: 4px;
		background: white;
		color: #666;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.close-error-btn:hover {
		background: #666;
		color: white;
	}

	.table-content {
		padding: 1.5rem 0rem;
		flex-grow: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
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
		overflow: auto;
		border: 1px solid #e0e0e0;
		border-radius: 8px;
		margin: 1rem 0;
		flex-grow: 1;
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

	.date-column {
		width: 20px;
		min-width: 20px;
		white-space: nowrap;
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

	/* 빈 행 스타일 */
	.empty-row .data-cell {
		background: #fafafa !important;
		color: #ccc;
		font-style: italic;
	}

	.empty-row:nth-child(even) .data-cell {
		background: #f5f5f5 !important;
	}

	.empty-row:hover .data-cell {
		background: #f0f0f0 !important;
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

	/* 모달 스타일 */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.date-picker-modal {
		background: white;
		border-radius: 12px;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
		width: 400px;
		max-width: 90vw;
		overflow: hidden;
		animation: modalSlideIn 0.3s ease-out;
	}

	@keyframes modalSlideIn {
		from {
			opacity: 0;
			transform: scale(0.9) translateY(-20px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 1px solid #e0e0e0;
		background: #f8f9fa;
	}

	.modal-header h3 {
		margin: 0;
		color: #333;
		font-size: 1.2rem;
		font-weight: 600;
	}

	.close-btn {
		background: none;
		border: none;
		font-size: 1.2rem;
		color: #666;
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 4px;
		transition: all 0.2s ease;
	}

	.close-btn:hover {
		background: rgba(0, 0, 0, 0.1);
		color: #333;
	}

	.modal-content {
		padding: 0;
	}

	.month-picker-container {
		margin-bottom: 1.5rem;
	}

	.month-picker-container label {
		display: block;
		margin-bottom: 0.75rem;
		color: #555;
		font-weight: 500;
		font-size: 0.95rem;
		text-align: center;
	}

	.month-picker-input {
		width: 100%;
		padding: 1rem;
		border: 2px solid #ddd;
		border-radius: 8px;
		background: white;
		font-size: 1.1rem;
		color: #333;
		cursor: pointer;
		text-align: center;
		font-weight: 500;
		transition: all 0.2s ease;
	}

	.month-picker-input:focus {
		outline: none;
		border-color: #2196f3;
		box-shadow: 0 0 0 3px rgba(33, 150, 243, 0.2);
		background: #f8f9ff;
	}

	.month-picker-input:hover {
		border-color: #2196f3;
		background: #fafbff;
	}

	.selected-preview {
		padding: 1rem;
		background: #f0f8ff;
		border: 1px solid rgba(33, 150, 243, 0.2);
		border-radius: 6px;
		text-align: center;
		color: #555;
		font-size: 0.9rem;
	}

	.selected-preview strong {
		color: #2196f3;
		font-weight: 600;
	}

	.modal-footer {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		padding: 1.5rem;
		border-top: 1px solid #e0e0e0;
		background: #f8f9fa;
	}

	.btn-primary {
		padding: 0.75rem 1.5rem;
		background: #2196f3;
		color: white;
		border: none;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-primary:hover {
		background: #1976d2;
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(33, 150, 243, 0.3);
	}

	.btn-secondary {
		padding: 0.75rem 1.5rem;
		background: white;
		color: #666;
		border: 1px solid #ddd;
		border-radius: 6px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-secondary:hover {
		background: #f5f5f5;
		border-color: #bbb;
		color: #333;
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
			padding: 1rem 0rem;
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

		.date-column {
			width: 20px;
			min-width: 20px !important;
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

		.date-column {
			width: 20px;
			min-width: 20px !important;
		}

		.date-picker-modal {
			width: 320px;
		}

		.modal-header,
		.modal-content,
		.modal-footer {
			padding: 1rem;
		}

		.month-picker-input {
			font-size: 1rem;
			padding: 0.875rem;
		}
	}

	/* Custom Month Picker Styles */
	.custom-month-picker {
		width: 100%;
		padding: 20px 0;
		background-color: #ffffff;
		border-radius: 10px;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.year-controls {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 0;
		font-size: 1.2em;
		font-weight: bold;
		color: #333;
		margin-bottom: 20px;
		width: 100%;
	}

	.year-btn {
		background: none;
		border: none;
		font-size: 1.5em;
		cursor: pointer;
		padding: 8px 12px;
		border-radius: 5px;
		color: #333;
		transition: background-color 0.2s;
		min-width: 44px;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.year-btn:hover {
		background-color: #e2eaf1;
	}

	.year-btn:active {
		background-color: #d1d9e0;
	}

	.year-display {
		font-size: 1.2em;
		font-weight: bold;
	}

	.months-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
		width: 100%;
	}

	.month-item {
		padding: 12px 4px;
		text-align: center;
		cursor: pointer;
		border: none;
		border-radius: 8px;
		background: none;
		font-size: 0.9rem;
		transition: background-color 0.2s, color 0.2s;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.month-item:hover {
		background-color: #e2eaf1;
	}

	.month-item:active {
		background-color: #d1d9e0;
	}

	.month-item.selected {
		background-color: #4CAF50;
		color: #fff;
		font-weight: bold;
	}

	/* 모바일 반응형 스타일 */
	@media (max-width: 768px) {
		.modal-overlay {
			padding: 20px 10px;
			display: flex;
			align-items: center;
			justify-content: center;
		}

		.modal-content {
			margin: 0;
			width: 100%;
			max-width: 350px;
			max-height: calc(100vh - 40px);
			overflow-y: auto;
		}

		.custom-month-picker {
			padding: 20px 16px;
			max-width: none;
		}

		.year-controls {
			padding: 12px 0;
			margin-bottom: 20px;
		}

		.year-btn {
			font-size: 1.4em;
			padding: 12px 16px;
			min-width: 50px;
			min-height: 50px;
		}

		.year-display {
			font-size: 1.2em;
		}

		.months-grid {
			gap: 8px;
		}

		.month-item {
			padding: 12px 6px;
			font-size: 0.9rem;
			min-height: 50px;
		}
	}

	/* 작은 모바일 화면 (430×932 등) */
	@media (max-width: 480px) {
		.modal-overlay {
			padding: 20px 15px;
		}

		.modal-content {
			width: 100%;
			max-width: calc(100vw - 30px);
			max-height: none;
		}

		.custom-month-picker {
			padding: 16px 0;
			width: 100%;
			display: flex;
			flex-direction: column;
			align-items: center;
		}

		.year-controls {
			padding: 8px 0;
			margin-bottom: 12px;
		}

		.year-btn {
			font-size: 1.2em;
			padding: 8px 12px;
			min-width: 40px;
			min-height: 40px;
		}

		.year-display {
			font-size: 1em;
		}

		.months-grid {
			gap: 4px;
		}

		.month-item {
			padding: 8px 2px;
			font-size: 0.75rem;
			min-height: 40px;
			border-radius: 6px;
		}
	}

	/* 매우 작은 화면 대응 */
	@media (max-width: 360px) {
		.modal-overlay {
			padding: 15px 10px;
		}

		.modal-content {
			width: 100%;
			max-width: calc(100vw - 20px);
			max-height: none;
		}

		.custom-month-picker {
			padding: 16px 0;
			width: 100%;
			display: flex;
			flex-direction: column;
			align-items: center;
		}

		.year-controls {
			padding: 6px 0;
			margin-bottom: 10px;
		}

		.year-btn {
			font-size: 1.1em;
			padding: 6px 10px;
			min-width: 36px;
			min-height: 36px;
		}

		.year-display {
			font-size: 0.9em;
		}

		.months-grid {
			gap: 3px;
		}

		.month-item {
			padding: 6px 1px;
			font-size: 0.7rem;
			min-height: 36px;
			border-radius: 4px;
		}
	}

	/* Month Picker Modal Styles */
	.month-picker-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 20px;
	}

	.month-picker-modal {
		background: white;
		border-radius: 12px;
		width: 100%;
		max-width: 320px;
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
		overflow: hidden;
	}

	.month-picker-header {
		padding: 16px 20px;
		border-bottom: 1px solid #e5e5e5;
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: #f8f9fa;
	}

	.month-picker-header h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: #333;
	}

	.month-picker-close {
		background: none;
		border: none;
		font-size: 1.5rem;
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		color: #666;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.month-picker-close:hover {
		background: #e9ecef;
		color: #333;
	}

	.month-picker-content {
		padding: 20px;
	}

	.year-selector {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
		padding: 8px 0;
	}

	.year-nav-btn {
		background: #f1f3f4;
		border: none;
		border-radius: 8px;
		width: 40px;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		font-size: 1.2rem;
		color: #333;
		transition: all 0.2s ease;
	}

	.year-nav-btn:hover {
		background: #e8eaed;
		transform: scale(1.05);
	}

	.year-nav-btn:active {
		transform: scale(0.95);
	}

	.current-year {
		font-size: 1.2rem;
		font-weight: 600;
		color: #333;
	}

	.months-container {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 8px;
	}

	.month-btn {
		background: #f8f9fa;
		border: none;
		border-radius: 8px;
		padding: 12px 4px;
		font-size: 0.9rem;
		cursor: pointer;
		transition: all 0.2s ease;
		color: #333;
		font-weight: 500;
		min-height: 44px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.month-btn:hover {
		background: #e9ecef;
		transform: translateY(-1px);
	}

	.month-btn:active {
		transform: translateY(0);
	}

	.month-btn.active {
		background: #007bff;
		color: white;
		font-weight: 600;
		box-shadow: 0 2px 8px rgba(0, 123, 255, 0.3);
	}

	.month-btn.active:hover {
		background: #0056b3;
		transform: translateY(-1px);
	}

	/* 모바일 반응형 */
	@media (max-width: 480px) {
		.month-picker-overlay {
			padding: 15px;
		}

		.month-picker-modal {
			max-width: 100%;
		}

		.month-picker-header {
			padding: 12px 16px;
		}

		.month-picker-header h3 {
			font-size: 1rem;
		}

		.month-picker-content {
			padding: 16px;
		}

		.year-selector {
			margin-bottom: 16px;
		}

		.year-nav-btn {
			width: 36px;
			height: 36px;
			font-size: 1.1rem;
		}

		.current-year {
			font-size: 1.1rem;
		}

		.months-container {
			gap: 6px;
		}

		.month-btn {
			padding: 10px 2px;
			font-size: 0.8rem;
			min-height: 40px;
		}
	}

	/* 매우 작은 화면 */
	@media (max-width: 360px) {
		.month-picker-overlay {
			padding: 10px;
		}

		.month-picker-content {
			padding: 12px;
		}

		.year-nav-btn {
			width: 32px;
			height: 32px;
			font-size: 1rem;
		}

		.current-year {
			font-size: 1rem;
		}

		.months-container {
			gap: 4px;
		}

		.month-btn {
			padding: 8px 2px;
			font-size: 0.75rem;
			min-height: 36px;
		}
	}
</style>