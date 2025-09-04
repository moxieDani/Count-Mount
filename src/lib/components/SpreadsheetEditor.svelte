<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	let { spreadsheetId = '', spreadsheetName = '' } = $props();

	let spreadsheetData = $state<string[][]>([]);
	let isLoading = $state(false);
	let error = $state('');
	let editingCell = $state<{row: number, col: number} | null>(null);
	let tempValue = $state('');

	let session = $derived($page.data.session);

	onMount(async () => {
		if (spreadsheetId) {
			await loadSpreadsheetData();
		}
	});

	async function loadSpreadsheetData() {
		if (!spreadsheetId || !session?.accessToken) return;

		isLoading = true;
		error = '';

		try {
			const response = await fetch(`/api/sheets/${spreadsheetId}`, {
				headers: {
					'Authorization': `Bearer ${session.accessToken}`
				}
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();
			spreadsheetData = data.values || [];
		} catch (err) {
			error = err instanceof Error ? err.message : '스프레드시트를 로드하는데 실패했습니다.';
			console.error('Error loading spreadsheet:', err);
		} finally {
			isLoading = false;
		}
	}

	async function updateCell(row: number, col: number, value: string) {
		if (!spreadsheetId || !session?.accessToken) return;

		try {
			const range = `Sheet1!${getColumnLetter(col)}${row + 1}`;
			const response = await fetch(`/api/sheets/${spreadsheetId}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${session.accessToken}`
				},
				body: JSON.stringify({
					range,
					values: [[value]]
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			// 로컬 데이터 업데이트
			if (!spreadsheetData[row]) {
				spreadsheetData[row] = [];
			}
			spreadsheetData[row][col] = value;
			spreadsheetData = [...spreadsheetData]; // 반응성을 위한 새 배열 생성

		} catch (err) {
			error = err instanceof Error ? err.message : '셀 업데이트에 실패했습니다.';
			console.error('Error updating cell:', err);
		}
	}

	function getColumnLetter(index: number): string {
		let letter = '';
		while (index >= 0) {
			letter = String.fromCharCode(65 + (index % 26)) + letter;
			index = Math.floor(index / 26) - 1;
		}
		return letter;
	}

	function startEdit(row: number, col: number) {
		editingCell = { row, col };
		tempValue = spreadsheetData[row]?.[col] || '';
	}

	function cancelEdit() {
		editingCell = null;
		tempValue = '';
	}

	async function saveEdit() {
		if (editingCell) {
			await updateCell(editingCell.row, editingCell.col, tempValue);
			editingCell = null;
			tempValue = '';
		}
	}

	function handleKeyDown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			saveEdit();
		} else if (event.key === 'Escape') {
			event.preventDefault();
			cancelEdit();
		}
	}

	function addRow() {
		const newRow = new Array(Math.max(10, spreadsheetData[0]?.length || 0)).fill('');
		spreadsheetData = [...spreadsheetData, newRow];
	}

	function addColumn() {
		spreadsheetData = spreadsheetData.map(row => [...row, '']);
	}
</script>

{#if !spreadsheetId}
	<div class="no-selection">
		<p>스프레드시트를 선택해주세요.</p>
	</div>
{:else}
	<div class="editor-container">
		<div class="editor-header">
			<h3>{spreadsheetName || '스프레드시트 편집기'}</h3>
			<div class="controls">
				<button onclick={loadSpreadsheetData} disabled={isLoading} class="btn-secondary">
					{isLoading ? '로드 중...' : '새로고침'}
				</button>
				<button onclick={addRow} class="btn-secondary">행 추가</button>
				<button onclick={addColumn} class="btn-secondary">열 추가</button>
			</div>
		</div>

		{#if error}
			<div class="error-message">
				❌ {error}
			</div>
		{/if}

		{#if isLoading}
			<div class="loading">📊 스프레드시트 로드 중...</div>
		{:else if spreadsheetData.length > 0}
			<div class="table-container">
				<table class="spreadsheet-table">
					<thead>
						<tr>
							<th class="row-header">#</th>
							{#each spreadsheetData[0] || [] as _, colIndex}
								<th class="col-header">{getColumnLetter(colIndex)}</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each spreadsheetData as row, rowIndex}
							<tr>
								<td class="row-header">{rowIndex + 1}</td>
								{#each row as cell, colIndex}
									<td 
										class="cell" 
										class:editing={editingCell?.row === rowIndex && editingCell?.col === colIndex}
										onclick={() => startEdit(rowIndex, colIndex)}
										role="gridcell"
										tabindex="0"
									>
										{#if editingCell?.row === rowIndex && editingCell?.col === colIndex}
											<input
												type="text"
												bind:value={tempValue}
												onkeydown={handleKeyDown}
												onblur={saveEdit}
												class="cell-input"
											/>
										{:else}
											<span class="cell-content">{cell || ''}</span>
										{/if}
									</td>
								{/each}
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{:else}
			<div class="empty-state">
				<p>스프레드시트가 비어있거나 데이터를 로드할 수 없습니다.</p>
				<button onclick={loadSpreadsheetData} class="btn-primary">다시 시도</button>
			</div>
		{/if}
	</div>
{/if}

<style>
	.no-selection {
		padding: 3rem;
		text-align: center;
		color: #666;
		background: #f9f9f9;
		border-radius: 12px;
	}

	.editor-container {
		background: white;
		border-radius: 12px;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
		overflow: hidden;
	}

	.editor-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		background: #f8f9fa;
		border-bottom: 1px solid #e9ecef;
	}

	.editor-header h3 {
		margin: 0;
		color: #333;
		font-size: 1.25rem;
	}

	.controls {
		display: flex;
		gap: 0.5rem;
	}

	.btn-primary, .btn-secondary {
		padding: 0.5rem 1rem;
		border: none;
		border-radius: 6px;
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-primary {
		background: #007bff;
		color: white;
	}

	.btn-primary:hover {
		background: #0056b3;
	}

	.btn-secondary {
		background: #6c757d;
		color: white;
	}

	.btn-secondary:hover {
		background: #545b62;
	}

	.btn-secondary:disabled {
		background: #cccccc;
		cursor: not-allowed;
	}

	.error-message {
		padding: 1rem;
		background: #f8d7da;
		color: #721c24;
		border-bottom: 1px solid #f5c6cb;
	}

	.loading, .empty-state {
		padding: 3rem;
		text-align: center;
		color: #666;
	}

	.table-container {
		overflow: auto;
		max-height: 70vh;
	}

	.spreadsheet-table {
		width: 100%;
		border-collapse: collapse;
		font-family: 'Courier New', monospace;
		font-size: 0.875rem;
	}

	.row-header, .col-header {
		background: #e9ecef;
		font-weight: 600;
		color: #495057;
		text-align: center;
		min-width: 40px;
		padding: 0.5rem;
		border: 1px solid #dee2e6;
		position: sticky;
	}

	.row-header {
		left: 0;
		z-index: 2;
	}

	.col-header {
		top: 0;
		z-index: 1;
	}

	.cell {
		border: 1px solid #dee2e6;
		min-width: 100px;
		min-height: 32px;
		padding: 0;
		cursor: pointer;
		position: relative;
	}

	.cell:hover {
		background: #f8f9fa;
	}

	.cell.editing {
		background: #e3f2fd;
		border-color: #2196f3;
	}

	.cell-content {
		display: block;
		padding: 0.5rem;
		min-height: 20px;
		word-break: break-word;
	}

	.cell-input {
		width: 100%;
		height: 100%;
		border: none;
		background: transparent;
		padding: 0.5rem;
		font-family: inherit;
		font-size: inherit;
		outline: none;
	}
</style>