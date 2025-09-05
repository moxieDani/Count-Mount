<script lang="ts">
	interface Props {
		currentYear: number;
		currentMonth: number;
		onSelect: (year: number, month: number) => void;
		onClose: () => void;
	}
	
	let { currentYear, currentMonth, onSelect, onClose }: Props = $props();
	
	let selectedYear = $state(currentYear);
	let selectedMonth = $state(currentMonth);
	
	// 월 이름 배열
	const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];
	
	// 년도 변경 함수
	function changeYear(delta: number) {
		selectedYear += delta;
	}
	
	// 월 선택 함수
	function selectMonth(month: number) {
		onSelect(selectedYear, month);
	}
	
	// 오버레이 클릭 시 닫기
	function handleOverlayClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}
</script>

<div class="month-picker-overlay" onclick={handleOverlayClick}>
	<div class="month-picker-modal" onclick={(e) => e.stopPropagation()}>
		<div class="month-picker-header">
			<h3>년도/월 선택</h3>
			<button class="month-picker-close" onclick={onClose}>×</button>
		</div>
		
		<div class="month-picker-content">
			<!-- 년도 선택 -->
			<div class="year-selector">
				<button class="year-nav-btn" onclick={() => changeYear(-1)}>◀</button>
				<span class="current-year">{selectedYear}년</span>
				<button class="year-nav-btn" onclick={() => changeYear(1)}>▶</button>
			</div>
			
			<!-- 월 그리드 -->
			<div class="months-container">
				{#each monthNames as monthName, index}
					<button 
						class="month-btn" 
						class:active={currentYear === selectedYear && currentMonth === index + 1}
						onclick={() => selectMonth(index + 1)}
					>
						{monthName}
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
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