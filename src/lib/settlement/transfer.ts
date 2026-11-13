// 정산 금액 배지를 폰에서 두 번 탭하면 토스 송금 화면을 연다.
// 받는 계좌는 코드에 두지 않고 서버 환경변수("은행이름 계좌번호")에서 읽는다.

export interface TransferAccount {
	bank: string; // 토스 앱에 보이는 은행 이름
	number: string; // 설정에 적힌 그대로(하이픈 포함 가능)
}

// "테스트은행 000-0000-0000-00" → { bank: '테스트은행', number: '000-0000-0000-00' }
export function parseAccount(value: string | null | undefined): TransferAccount | null {
	const m = value?.trim().match(/^(.+?)\s+(\d[\d-]*\d|\d)$/);
	return m ? { bank: m[1].trim(), number: m[2] } : null;
}

// 은행·계좌번호·금액이 채워진 토스 송금 화면. 실제 송금은 토스 앱에서 인증해야 끝난다.
// 토스가 공식 문서로 내놓은 주소가 아니라서 토스 앱이 바뀌면 안 열릴 수 있다.
export function tossSendUrl(account: TransferAccount, amount: number): string {
	const params: [string, string][] = [
		['amount', String(Math.round(amount))],
		['bank', account.bank],
		['accountNo', account.number.replace(/\D/g, '')],
		['origin', 'qr']
	];
	return `supertoss://send?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

// windowMs 안에 두 번 탭하면 true. 세 번째 탭이 또 열지 않도록 성공하면 처음부터 센다.
export function doubleTapDetector(windowMs = 350) {
	let last = -Infinity;
	return (now: number) => {
		if (now - last <= windowMs) {
			last = -Infinity;
			return true;
		}
		last = now;
		return false;
	};
}
