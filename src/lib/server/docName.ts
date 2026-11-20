// 문서 이름 틀. {year}는 2026, {yy}는 26 (작업본 "[작업본] 26년 가계부"로 시험할 때, 2026-11-17)
export function fillDocName(template: string, year: string): string {
	return template.replaceAll('{year}', year).replaceAll('{yy}', year.slice(-2));
}

export const HOUSEHOLD_DOC_DEFAULT = '{year} 가계부';
