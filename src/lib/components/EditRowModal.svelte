<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	
	const dispatch = createEventDispatcher();
	
	let {
		isOpen = false,
		headers = [],
		rowData = [],
		rowIndex = null,
		isLoading = false
	} = $props<{
		isOpen: boolean;
		headers: string[];
		rowData: string[];
		rowIndex: number | null;
		isLoading?: boolean;
	}>();

	let editedData = $state<string[]>([]);

	// 모달이 열릴 때 데이터 초기화
	$effect(() => {
		if (isOpen && rowData) {
			editedData = [...rowData];
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
		}
	}
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
								<input
									id="field-{index}"
									type="text"
									bind:value={editedData[index]}
									class="field-input"
									placeholder={header ? `${header} 값을 입력하세요` : `값을 입력하세요`}
									disabled={isLoading}
								/>
								{#if editedData[index] && editedData[index].trim()}
									<button
										class="clear-button"
										onclick={() => editedData[index] = ''}
										aria-label="입력값 지우기"
										disabled={isLoading}
									>
										<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
											<path d="M18 6L6 18M6 6l12 12"/>
										</svg>
									</button>
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