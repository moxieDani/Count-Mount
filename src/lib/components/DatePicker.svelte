<script lang="ts">
	interface DayInfo {
		day: number;
		isCurrentMonth: boolean;
		isPrevMonth: boolean;
		isNextMonth: boolean;
	}

	interface Props {
		currentYear: number;
		currentMonth: number;
		onDateSelect: (day: number) => void;
		onClose: () => void;
	}

	let { currentYear, currentMonth, onDateSelect, onClose }: Props = $props();

	// 요일 이름 (일요일부터 시작)
	const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
	const monthNames = ['1월', '2월', '3월', '4월', '5월', '6월', '7월', '8월', '9월', '10월', '11월', '12월'];

	// 현재 날짜 정보 (한 번만 계산)
	const today = new Date();
	const todayYear = today.getFullYear();
	const todayMonth = today.getMonth() + 1;
	const todayDate = today.getDate();

	// 순수 함수들 (side effect 없음)
	function getFirstDayOfMonth(year: number, month: number): number {
		return new Date(year, month - 1, 1).getDay();
	}

	function getDaysInMonth(year: number, month: number): number {
		return new Date(year, month, 0).getDate();
	}

	function getPrevMonthDays(year: number, month: number): number {
		return new Date(year, month - 1, 0).getDate();
	}

	function generateCalendarDays(year: number, month: number): DayInfo[] {
		const firstDay = getFirstDayOfMonth(year, month);
		const daysInMonth = getDaysInMonth(year, month);
		const prevMonthDays = getPrevMonthDays(year, month);
		
		const days: DayInfo[] = [];
		
		// 이전 달의 마지막 날들
		for (let i = firstDay - 1; i >= 0; i--) {
			days.push({
				day: prevMonthDays - i,
				isCurrentMonth: false,
				isPrevMonth: true,
				isNextMonth: false
			});
		}
		
		// 현재 달의 모든 날들
		for (let day = 1; day <= daysInMonth; day++) {
			days.push({
				day,
				isCurrentMonth: true,
				isPrevMonth: false,
				isNextMonth: false
			});
		}
		
		// 다음 달의 첫 날들 (42칸 채우기)
		const totalCells = Math.ceil(days.length / 7) * 7;
		let nextDay = 1;
		for (let i = days.length; i < totalCells; i++) {
			days.push({
				day: nextDay++,
				isCurrentMonth: false,
				isPrevMonth: false,
				isNextMonth: true
			});
		}
		
		return days;
	}

	function isToday(day: number, year: number, month: number): boolean {
		return todayYear === year && todayMonth === month && todayDate === day;
	}

	function getDayClass(dayIndex: number, day: DayInfo, year: number, month: number): string {
		let classes = 'day-button';
		
		if (!day.isCurrentMonth) {
			classes += ' other-month';
		}
		
		// 토요일 (파란색)
		if (dayIndex % 7 === 6) {
			classes += ' saturday';
		}
		// 일요일 (빨간색)
		else if (dayIndex % 7 === 0) {
			classes += ' sunday';
		}
		
		// 오늘 날짜
		if (day.isCurrentMonth && isToday(day.day, year, month)) {
			classes += ' today';
		}
		
		return classes;
	}

	function handleDateClick(day: number, isCurrentMonth: boolean) {
		if (isCurrentMonth) {
			onDateSelect(day);
		}
	}

	// 달력 데이터 생성 (매번 새로 계산)
	const calendarDays = generateCalendarDays(currentYear, currentMonth);
</script>

<div class="date-picker-overlay" onclick={onClose}>
	<div class="date-picker-modal" onclick={(e) => e.stopPropagation()}>
		<div class="date-picker-header">
			<h3>{currentYear}년 {monthNames[currentMonth - 1]}</h3>
			<button class="date-picker-close" onclick={onClose}>
				<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor">
					<path d="M18 6L6 18M6 6l12 12"/>
				</svg>
			</button>
		</div>
		
		<div class="date-picker-content">
			<!-- 요일 헤더 -->
			<div class="weekdays-header">
				{#each dayNames as dayName, index}
					<div class="weekday-name" class:sunday={index === 0} class:saturday={index === 6}>
						{dayName}
					</div>
				{/each}
			</div>
			
			<!-- 달력 날짜들 -->
			<div class="calendar-grid">
				{#each calendarDays as day, index}
					<button 
						class={getDayClass(index, day, currentYear, currentMonth)}
						onclick={() => handleDateClick(day.day, day.isCurrentMonth)}
						disabled={!day.isCurrentMonth}
					>
						{day.day}
					</button>
				{/each}
			</div>
		</div>
	</div>
</div>

<style>
	.date-picker-overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 2000;
		animation: fadeIn 0.2s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.date-picker-modal {
		background: white;
		border-radius: 12px;
		box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
		max-width: 350px;
		width: 90%;
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

	.date-picker-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem 1.5rem 1rem;
		border-bottom: 1px solid #e5e7eb;
		background: #f9fafb;
		border-radius: 12px 12px 0 0;
	}

	.date-picker-header h3 {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 600;
		color: #111827;
	}

	.date-picker-close {
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

	.date-picker-close:hover {
		background: #e5e7eb;
		color: #374151;
	}

	.date-picker-content {
		padding: 1.5rem;
	}

	.weekdays-header {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.25rem;
		margin-bottom: 0.75rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid #f3f4f6;
	}

	.weekday-name {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 2.5rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: #4b5563;
	}

	.weekday-name.sunday {
		color: #dc2626;
	}

	.weekday-name.saturday {
		color: #2563eb;
	}

	.calendar-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.25rem;
	}

	.day-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border: 1px solid transparent;
		background: transparent;
		color: #374151;
		border-radius: 0.5rem;
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s;
		position: relative;
	}

	.day-button:hover:not(:disabled) {
		background: #f3f4f6;
		border-color: #d1d5db;
	}

	.day-button:active:not(:disabled) {
		background: #e5e7eb;
		transform: scale(0.95);
	}

	.day-button.other-month {
		color: #d1d5db;
		cursor: not-allowed;
	}

	.day-button.other-month:hover {
		background: transparent;
		border-color: transparent;
	}

	/* 요일별 색상 */
	.day-button.sunday {
		color: #dc2626;
	}

	.day-button.saturday {
		color: #2563eb;
	}

	.day-button.sunday.other-month,
	.day-button.saturday.other-month {
		color: #d1d5db;
	}

	/* 오늘 날짜 스타일 */
	.day-button.today {
		background: #10b981;
		color: white;
		border: 2px solid #059669;
		font-weight: 600;
	}

	.day-button.today::after {
		content: '';
		position: absolute;
		inset: -2px;
		border: 2px solid #10b981;
		border-radius: 0.5rem;
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	.day-button.today:hover {
		background: #059669;
		border-color: #047857;
	}

	/* 모바일 반응형 */
	@media (max-width: 640px) {
		.date-picker-modal {
			max-width: 320px;
		}
		
		.date-picker-content {
			padding: 1rem;
		}
		
		.day-button {
			width: 2.25rem;
			height: 2.25rem;
			font-size: 0.8125rem;
		}
		
		.weekday-name {
			height: 2.25rem;
			font-size: 0.8125rem;
		}
	}
</style>