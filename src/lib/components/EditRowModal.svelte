<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import DatePicker from './DatePicker.svelte';
	
	const dispatch = createEventDispatcher();
	
	let {
		isOpen = false,
		headers = [],
		rowData = [],
		rowIndex = null,
		isLoading = false,
		currentYear = new Date().getFullYear(),
		currentMonth = new Date().getMonth() + 1,
		spreadsheetId = null,
		accessToken = null
	} = $props<{
		isOpen: boolean;
		headers: string[];
		rowData: string[];
		rowIndex: number | null;
		isLoading?: boolean;
		currentYear?: number;
		currentMonth?: number;
		spreadsheetId?: string | null;
		accessToken?: string | null;
	}>();

	let editedData = $state<string[]>([]);
	let showDatePicker = $state<number | null>(null); // 어떤 필드의 날짜 선택기를 보여줄지
	let paymentMethodOptions = $state<string[]>([]); // 결제방식 옵션들
	let isLoadingPaymentMethods = $state(false); // 결제방식 로딩 상태
	let accountOptions = $state<string[]>([]); // 계정 옵션들
	let isLoadingAccounts = $state(false); // 계정 로딩 상태
	
	// DatePicker에서 사용할 날짜 정보
	let selectedYear = $state(currentYear || new Date().getFullYear());
	let selectedMonth = $state(currentMonth || new Date().getMonth() + 1);
	let selectedDay = $state(1);

	// 날짜 형식 정규화 함수
	function normalizeDateFormat(dateStr: string): string {
		if (!dateStr || dateStr.trim() === '') {
			return `${currentYear}. ${currentMonth}. 1`;
		}
		
		const trimmed = dateStr.trim();
		
		// 이미 연도가 포함된 형식인지 확인 (4자리 숫자로 시작)
		if (/^\d{4}\./.test(trimmed)) {
			return trimmed; // 이미 올바른 형식
		}
		
		// 'M. D' 형식인 경우 연도 추가
		if (/^\d{1,2}\.\s*\d{1,2}$/.test(trimmed)) {
			return `${currentYear}. ${trimmed}`;
		}
		
		// 기타 경우 기본값 반환
		return `${currentYear}. ${currentMonth}. 1`;
	}

	// 초기 데이터 설정 함수
	function initializeData() {
		if (isOpen && rowData) {
			const newData = [...rowData];
			// 날짜, 금액, 계정 필드의 형식을 정규화
			headers.forEach((header, index) => {
				if (isDateField(header)) {
					newData[index] = normalizeDateFormat(newData[index] || '');
				} else if (isAmountField(header)) {
					newData[index] = parseAmount(newData[index] || '');
				} else if (isPaymentMethodField(header)) {
					// 결제방식 필드는 기존 값을 그대로 유지 (드롭다운에서 선택되도록)
					newData[index] = (newData[index] || '').toString().trim();
				} else if (isAccountField(header)) {
					// 계정 필드는 기존 값을 그대로 유지 (드롭다운에서 선택되도록)
					newData[index] = (newData[index] || '').toString().trim();
				}
			});
			editedData = newData;
		}
	}

	// 모달이 열릴 때만 초기화 (안전한 방식)
	let lastRowIndex = $state<number | null>(null);
	
	$effect(() => {
		// 모달이 새로 열리거나 다른 행을 편집할 때만 초기화
		if (isOpen && (rowIndex !== lastRowIndex)) {
			console.log('Initializing data for row:', rowIndex);
			initializeData();
			lastRowIndex = rowIndex;
		} else if (!isOpen) {
			lastRowIndex = null;
		}
	});

	function handleClose() {
		dispatch('close');
	}

	function handleSave() {
		dispatch('save', { data: editedData, rowIndex });
	}

	function handleDelete() {
		if (confirm('이 행의 데이터를 삭제하시겠습니까?')) {
			dispatch('delete', { rowIndex });
		}
	}

	// ESC 키로 모달 닫기
	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			handleClose();
			closeDatePicker();
		}
	}

	// 날짜 필드인지 확인하는 함수
	function isDateField(header: string): boolean {
		return header === '날짜' || header.toLowerCase().includes('date');
	}

	// 금액 필드인지 확인하는 함수
	function isAmountField(header: string): boolean {
		return header === '금액';
	}

	// 결제방식 필드인지 확인하는 함수
	function isPaymentMethodField(header: string): boolean {
		return header === '결제방식';
	}

	// 계정 필드인지 확인하는 함수
	function isAccountField(header: string): boolean {
		return header === '계정';
	}

	// 금액 파싱 함수
	function parseAmount(value: string): string {
		if (!value) return '';
		// 숫자와 소수점 외의 모든 문자 제거
		return value.replace(/[^0-9.]/g, '');
	}

	// 현재 입력된 날짜에서 연도, 월, 일 파싱
	function parseCurrentDate(dateStr: string) {
		if (!dateStr || dateStr.trim() === '') {
			return { year: currentYear, month: currentMonth, day: 1 };
		}
		
		const trimmed = dateStr.trim();
		const parts = trimmed.split('.').map(part => part.trim());
		
		if (parts.length >= 3) {
			// YYYY. M. D 형식
			const year = parseInt(parts[0]) || currentYear;
			const month = parseInt(parts[1]) || currentMonth;
			const day = parseInt(parts[2]) || 1;
			return { year, month, day };
		} else if (parts.length === 2) {
			// M. D 형식 (연도 없음)
			const month = parseInt(parts[0]) || currentMonth;
			const day = parseInt(parts[1]) || 1;
			return { year: currentYear, month, day };
		}
		
		return { year: currentYear, month: currentMonth, day: 1 };
	}

	// 날짜 선택기 열기 (기존 입력값 유지)
	function openDatePicker(fieldIndex: number) {
		// 현재 입력된 날짜 파싱하여 DatePicker에 반영할 수 있도록 준비
		const currentInput = editedData[fieldIndex] || '';
		console.log('Opening date picker with current input:', currentInput);
		const parsedDate = parseCurrentDate(currentInput);
		
		// 파싱된 날짜 정보를 상태로 저장 (DatePicker에서 사용)
		selectedYear = parsedDate.year;
		selectedMonth = parsedDate.month;
		selectedDay = parsedDate.day;
		
		// 마지막으로 showDatePicker 설정 (다른 상태 변경 후에)
		showDatePicker = fieldIndex;
		
		console.log('Date picker opened with:', { selectedYear, selectedMonth, selectedDay });
	}

	// 날짜 선택기 닫기
	function closeDatePicker() {
		showDatePicker = null;
	}

	// 날짜 선택 핸들러
	function handleDateSelect(day: number) {
		if (showDatePicker !== null) {
			const formattedDate = `${selectedYear}. ${selectedMonth}. ${day}`;
			editedData[showDatePicker] = formattedDate;
			closeDatePicker();
		}
	}

	// 결제방식 옵션 가져오기
	async function fetchPaymentMethodOptions() {
		if (!spreadsheetId || !accessToken || isLoadingPaymentMethods || paymentMethodOptions.length > 0) {
			return; // 이미 로드됐거나 로딩 중이거나 필요한 정보가 없으면 스킵
		}
		
		isLoadingPaymentMethods = true;
		
		try {
			const response = await fetch(`/api/sheets/${spreadsheetId}/payment-methods`, {
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json'
				}
			});
			
			if (response.ok) {
				const data = await response.json();
				let fetchedAccounts = data.accounts || [];
				
				// 현재 행의 결제방식 값이 옵션에 없으면 추가
				const paymentMethodFieldIndex = headers.findIndex(header => isPaymentMethodField(header));
				if (paymentMethodFieldIndex !== -1 && editedData[paymentMethodFieldIndex]) {
					const currentPaymentMethodValue = editedData[paymentMethodFieldIndex].toString().trim();
					if (currentPaymentMethodValue && !fetchedAccounts.includes(currentPaymentMethodValue)) {
						fetchedAccounts = [currentPaymentMethodValue, ...fetchedAccounts];
					}
				}
				
				paymentMethodOptions = fetchedAccounts;
				console.log('Payment method options loaded:', $state.snapshot(paymentMethodOptions));
			} else {
				console.error('Failed to fetch account options:', response.statusText);
			}
		} catch (error) {
			console.error('Error fetching account options:', error);
		} finally {
			isLoadingPaymentMethods = false;
		}
	}

	// 계정 옵션 가져오기
	async function fetchAccountOptions() {
		if (!spreadsheetId || !accessToken || isLoadingAccounts || accountOptions.length > 0) {
			return; // 이미 로드됐거나 로딩 중이거나 필요한 정보가 없으면 스킵
		}
		
		isLoadingAccounts = true;
		
		try {
			const response = await fetch(`/api/sheets/${spreadsheetId}/accounts`, {
				headers: {
					'Authorization': `Bearer ${accessToken}`,
					'Content-Type': 'application/json'
				}
			});
			
			if (response.ok) {
				const data = await response.json();
				let fetchedAccounts = data.accounts || [];
				
				// 현재 행의 계정 값이 옵션에 없으면 추가
				const accountFieldIndex = headers.findIndex(header => isAccountField(header));
				if (accountFieldIndex !== -1 && editedData[accountFieldIndex]) {
					const currentAccountValue = editedData[accountFieldIndex].toString().trim();
					if (currentAccountValue && !fetchedAccounts.includes(currentAccountValue)) {
						fetchedAccounts = [currentAccountValue, ...fetchedAccounts];
					}
				}
				
				accountOptions = fetchedAccounts;
				console.log('Account options loaded:', $state.snapshot(accountOptions));
			} else {
				console.error('Failed to fetch account options:', response.statusText);
			}
		} catch (error) {
			console.error('Error fetching account options:', error);
		} finally {
			isLoadingAccounts = false;
		}
	}

	// 모달이 열릴 때 결제방식 옵션 로드
	$effect(() => {
		if (isOpen && headers.some((header: string) => isPaymentMethodField(header))) {
			// 데이터 초기화가 완료된 후 결제방식 옵션 로드
			if (editedData && editedData.length > 0) {
				fetchPaymentMethodOptions();
			}
		}
	});

	// 모달이 열릴 때 계정 옵션 로드
	$effect(() => {
		if (isOpen && headers.some((header: string) => isAccountField(header))) {
			// 데이터 초기화가 완료된 후 계정 옵션 로드
			if (editedData && editedData.length > 0) {
				setTimeout(() => {
					fetchAccountOptions();
				}, 300); // 300ms 지연 (결제방식 로딩 후)
			}
		}
	});
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
	<div class="modal-overlay" onclick={handleClose} role="dialog" aria-modal="true">
		<div class="modal-container" onclick={(e) => e.stopPropagation()}>
			<!-- 모달 헤더 -->
			<div class="modal-header">
				<div class="modal-title">
					<h2>행 데이터 편집</h2>
					<div class="row-indicator">
						행 #{rowIndex !== null ? rowIndex + 1 : '?'}
					</div>
				</div>
				<button class="close-button" onclick={handleClose} aria-label="모달 닫기">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
						<path d="M18 6L6 18M6 6l12 12"/>
					</svg>
				</button>
			</div>

			<!-- 모달 콘텐츠 -->
			<div class="modal-content">
				<div class="form-container">
					{#each headers as header, index}
						<div class="form-field">
							<label for="field-{index}" class="field-label">
								{header || `컬럼 ${index + 1}`}
							</label>
							<div class="input-container">
								{#if isDateField(header)}
									<!-- 날짜 필드용 특별 입력 -->
									<div class="date-input-wrapper" onclick={() => openDatePicker(index)}>
										<div class="date-display field-input date-input" class:placeholder={!editedData[index]}>
											{editedData[index] || 'YYYY. M. D 형식으로 입력하세요'}
										</div>
										<button
											type="button"
											class="date-picker-button"
											onclick={(e) => {
												e.stopPropagation();
												openDatePicker(index);
											}}
											disabled={isLoading}
											aria-label="날짜 선택"
										>
											<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
												<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
												<line x1="16" y1="2" x2="16" y2="6"/>
												<line x1="8" y1="2" x2="8" y2="6"/>
												<line x1="3" y1="10" x2="21" y2="10"/>
											</svg>
										</button>
									</div>
								{:else if isAmountField(header)}
									<input
										id="field-{index}"
										type="number"
										bind:value={editedData[index]}
										class="field-input"
										placeholder="숫자만 입력하세요"
										disabled={isLoading}
									/>
								{:else if isPaymentMethodField(header)}
									<!-- 결제방식 드롭다운 -->
									<div class="select-container">
										<select
											id="field-{index}"
											bind:value={editedData[index]}
											class="field-input select-input"
											disabled={isLoading || isLoadingPaymentMethods}
										>
											<option value="">결제방식을 선택하세요</option>
											{#each paymentMethodOptions as paymentMethod}
												<option value={paymentMethod}>{paymentMethod}</option>
											{/each}
										</select>
										{#if isLoadingPaymentMethods}
											<div class="loading-indicator">
												<div class="spinner"></div>
											</div>
										{/if}
									</div>
								{:else if isAccountField(header)}
									<!-- 계정 드롭다운 -->
									<div class="select-container">
										<select
											id="field-{index}"
											bind:value={editedData[index]}
											class="field-input select-input"
											disabled={isLoading || isLoadingAccounts}
										>
											<option value="">계정을 선택하세요</option>
											{#each accountOptions as account}
												<option value={account}>{account}</option>
											{/each}
										</select>
										{#if isLoadingAccounts}
											<div class="loading-indicator">
												<div class="spinner"></div>
											</div>
										{/if}
									</div>
								{:else}
									<!-- 일반 텍스트 필드 -->
									<input
										id="field-{index}"
										type="text"
										bind:value={editedData[index]}
										class="field-input"
										placeholder={header ? `${header} 값을 입력하세요` : `값을 입력하세요`}
										disabled={isLoading}
									/>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- 모달 푸터 -->
			<div class="modal-footer">
				<div class="button-group">
					<button class="btn btn-secondary" onclick={handleClose} disabled={isLoading}>
						취소
					</button>
					<button class="btn btn-danger" onclick={handleDelete} disabled={isLoading}>
						{#if isLoading}
							<div class="spinner"></div>
						{:else}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
								<path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
							</svg>
						{/if}
						삭제
					</button>
					<button class="btn btn-primary" onclick={handleSave} disabled={isLoading}>
						{#if isLoading}
							<div class="spinner"></div>
						{:else}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
								<path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z"/>
								<path d="M17 21v-8H7v8M7 3v5h8"/>
							</svg>
						{/if}
						저장
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- 날짜 선택기 모달 -->
{#if showDatePicker !== null}
	<DatePicker 
		currentYear={selectedYear} 
		currentMonth={selectedMonth}
		onDateSelect={handleDateSelect}
		onClose={closeDatePicker}
	/>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		padding: 1rem;
		animation: fadeIn 0.2s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal-container {
		background: white;
		border-radius: 12px;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
		max-width: 600px;
		width: 100%;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		animation: slideIn 0.3s ease-out;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-20px) scale(0.95);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 1.5rem 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.modal-title {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.modal-title h2 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: #111827;
	}

	.row-indicator {
		font-size: 0.875rem;
		color: #6b7280;
		background: #f3f4f6;
		padding: 0.25rem 0.5rem;
		border-radius: 0.375rem;
		width: fit-content;
	}

	.close-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border: none;
		background: transparent;
		color: #6b7280;
		border-radius: 0.5rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.close-button:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.modal-content {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.5rem;
	}

	.form-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.field-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: #374151;
		margin-bottom: 0.25rem;
	}

	.input-container {
		position: relative;
	}

	.field-input {
		width: 100%;
		padding: 0.75rem 1rem;
		border: 1.5px solid #d1d5db;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		background: white;
		transition: all 0.2s;
		box-sizing: border-box;
	}

	.field-input:focus {
		outline: none;
		border-color: #3b82f6;
		box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
	}

	.field-input:disabled {
		background: #f9fafb;
		color: #6b7280;
		cursor: not-allowed;
	}

	.clear-button {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		width: 1.5rem;
		height: 1.5rem;
		border: none;
		background: transparent;
		color: #9ca3af;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.clear-button:hover {
		background: #f3f4f6;
		color: #6b7280;
	}

	.modal-footer {
		padding: 1rem 1.5rem 1.5rem;
		border-top: 1px solid #e5e7eb;
		background: #f9fafb;
		border-radius: 0 0 12px 12px;
	}

	.button-group {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
	}

	.btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1rem;
		border: 1px solid transparent;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		min-width: 80px;
		justify-content: center;
	}

	.btn:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: white;
		color: #374151;
		border-color: #d1d5db;
	}

	.btn-secondary:hover:not(:disabled) {
		background: #f9fafb;
		border-color: #9ca3af;
	}

	.btn-danger {
		background: #ef4444;
		color: white;
	}

	.btn-danger:hover:not(:disabled) {
		background: #dc2626;
	}

	.btn-primary {
		background: #3b82f6;
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: #2563eb;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid transparent;
		border-top-color: currentColor;
		border-radius: 50%;
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* 날짜 입력 필드 스타일 */
	.date-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		cursor: pointer;
		transition: all 0.2s;
		border-radius: 0.5rem;
	}

	.date-input-wrapper:hover {
		background: rgba(59, 130, 246, 0.05);
	}

	.date-input {
		padding-right: 3rem;
	}

	.date-display {
		color: #374151;
		min-height: 1.5rem;
		display: flex;
		align-items: center;
		user-select: none;
	}

	.date-display.placeholder {
		color: #9ca3af;
		font-style: italic;
	}

	.date-input-wrapper:hover .date-display {
		background: transparent;
	}

	.date-picker-button {
		position: absolute;
		right: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		width: 2rem;
		height: 2rem;
		border: none;
		background: transparent;
		color: #6b7280;
		border-radius: 0.25rem;
		cursor: pointer;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.date-picker-button:hover {
		background: #f3f4f6;
		color: #374151;
	}

	.date-picker-button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	/* 드롭다운 관련 스타일 */
	.select-container {
		position: relative;
	}

	.select-input {
		appearance: none;
		background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e");
		background-position: right 0.5rem center;
		background-repeat: no-repeat;
		background-size: 1.5em 1.5em;
		padding-right: 2.5rem;
		cursor: pointer;
	}

	.select-input:disabled {
		cursor: not-allowed;
		background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%9ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e");
	}

	.loading-indicator {
		position: absolute;
		right: 2.5rem;
		top: 50%;
		transform: translateY(-50%);
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1rem;
		height: 1rem;
	}

	.loading-indicator .spinner {
		width: 1rem;
		height: 1rem;
		border-width: 1px;
	}

	/* 모바일 반응형 */
	@media (max-width: 640px) {
		.modal-overlay {
			padding: 0.5rem;
		}

		.modal-container {
			max-height: 90vh;
		}

		.modal-header {
			padding: 1rem 1rem 0.75rem;
		}

		.modal-title h2 {
			font-size: 1.125rem;
		}

		.modal-content {
			padding: 0.75rem 1rem;
		}

		.modal-footer {
			padding: 0.75rem 1rem 1rem;
		}

		.button-group {
			flex-direction: column-reverse;
			gap: 0.5rem;
		}

		.btn {
			width: 100%;
		}
	}
</style>