import { env } from '$env/dynamic/private';

// ALLOWED_EMAILS(쉼표 구분)에 등록된 계정만 사용 가능. 비어 있으면 모두 거부한다.
export function isAllowedEmail(email: string | null | undefined) {
	if (!email) return false;
	const allowedEmails = (env.ALLOWED_EMAILS ?? '')
		.split(',')
		.map((e) => e.trim().toLowerCase())
		.filter(Boolean);
	return allowedEmails.includes(email.toLowerCase());
}
