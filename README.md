# Count-Mount

Google OAuth2를 사용한 SvelteKit 애플리케이션입니다.

## 설정 방법

### 1. Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 새 프로젝트를 생성하거나 기존 프로젝트 선택
3. **APIs & Services** > **Credentials**로 이동
4. **Create Credentials** > **OAuth client ID** 클릭
5. Application type을 **Web application**으로 선택
6. **Authorized JavaScript origins**에 추가:
   - `http://localhost:5173` (개발환경)
   - 배포 도메인 (운영환경)
7. **Authorized redirect URIs**에 추가:
   - `http://localhost:5173/auth/callback/google` (개발환경)
   - `https://yourdomain.com/auth/callback/google` (운영환경)
8. **Create** 클릭 후 Client ID와 Client Secret 복사

### 2. Google APIs 활성화

Google Cloud Console에서 다음 API들을 활성화해야 합니다:

1. **Google Picker API** (또는 Drive API)
2. **Google Sheets API**
3. **Google+ API** (OAuth용)

**APIs & Services** → **Library**에서 각 API를 검색하여 활성화하세요.

### 3. API 키 생성

1. **APIs & Services** → **Credentials** 이동
2. **Create Credentials** → **API key** 클릭
3. 생성된 API 키를 `.env` 파일에 추가

### 4. 환경 변수 설정

1. `.env` 파일을 생성하고 다음 값들을 설정:

```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_actual_google_client_id
GOOGLE_CLIENT_SECRET=your_actual_google_client_secret

# Google API Key (Picker API용)
GOOGLE_API_KEY=your_actual_google_api_key

# Auth.js Secret - 랜덤한 문자열 생성 필요
AUTH_SECRET=your_random_secret_string_here

# Trusted Host
AUTH_TRUST_HOST=true

# 로그인을 허용할 Google 계정 이메일 (쉼표로 구분). 비어 있으면 아무도 로그인할 수 없음
ALLOWED_EMAILS=you@gmail.com,spouse@gmail.com
```

### 5. AUTH_SECRET 생성 방법

터미널에서 다음 명령어를 실행하여 랜덤 시크릿 생성:

```bash
openssl rand -base64 33
```

또는 Node.js를 사용:

```bash
node -e "console.log(require('crypto').randomBytes(33).toString('base64'))"
```

## 개발

의존성을 설치하고 개발 서버를 시작:

```sh
npm install
npm run dev

# 또는 브라우저에서 자동으로 열기
npm run dev -- --open
```

브라우저에서 `http://localhost:5173`으로 접속하면 Google 로그인 페이지가 표시됩니다.

## 사용법

### 1. 로그인
- Google 계정으로 로그인

### 2. 스프레드시트 선택
- "스프레드시트 선택하기" 버튼 클릭
- Google Drive에서 편집할 스프레드시트 선택

### 3. 편집
- 셀을 클릭하여 직접 편집
- Enter: 저장, Esc: 취소
- "행 추가" / "열 추가" 버튼으로 확장
- 화면 맨 위에서 아래로 길게 당겼다 놓으면 지금 보는 탭(지출 기록·지출 분석·카드 실적)을 다시 불러옴 (PC에서는 브라우저 새로고침)

### 4. 권한
앱이 다음 권한을 요청합니다:
- **Drive 파일 접근**: 스프레드시트 선택을 위해
- **Sheets 편집**: 스프레드시트 읽기/쓰기를 위해

## 테스트

카드 결제 문자 파싱 테스트 실행:

```sh
npm test
```

테스트에는 실제 결제 문자를 넣지 않습니다. 공개 자료의 예시 문구와 가짜 값만 사용하세요.

## 빌드

프로덕션 버전을 생성:

```sh
npm run build
```

프로덕션 빌드를 미리보기:

```sh
npm run preview
```

## 기능

- ✅ Google OAuth2 로그인/로그아웃
- ✅ 사용자 세션 관리
- ✅ 로그인된 사용자만 메인 앱 접근 가능
- ✅ **Google Picker API**: Drive에서 스프레드시트 선택
- ✅ **Google Sheets API**: 스프레드시트 실시간 편집
- ✅ **인라인 편집**: 브라우저에서 바로 셀 편집 가능
- ✅ 행/열 추가 기능
- ✅ **입력 정보 붙여넣기**: 카드 결제 문자나 알림 스크린샷을 붙여넣으면 지출 추가 항목을 채움 (규칙 기반, 스크린샷은 브라우저 안에서 OCR)
- ✅ **카드 실적**: Drive의 `{올해} 카드사용내역` 문서에서 월별 시트의 `I1:J102`를 읽어 카드별 남은 실적·혜택 한도·건수를 보여 줌 (문서가 없으면 "문서 없음")
- ✅ **토스 송금**: 폰에서 정산 금액 배지를 두 번 탭하면 확인 창이 뜨고, 받는 계좌·금액이 채워진 토스 송금 화면을 엶 (송금은 토스 앱에서 인증해야 끝남)
- ✅ 반응형 디자인

## 기술 스택

- **Frontend**: SvelteKit, TypeScript
- **Authentication**: Auth.js (formerly NextAuth.js)
- **OAuth Provider**: Google
- **APIs**: Google Picker API, Google Sheets API
- **Backend**: Node.js with googleapis
- **Build Tool**: Vite

## 배포

배포 시 환경 변수를 설정하고 Authorized redirect URIs에 실제 도메인을 추가해야 합니다.

`CARD_USAGE_DOC_NAME`(선택): 카드 실적 탭이 읽을 문서 이름. `{year}`는 올해로 바뀌며, 비우면 `{year} 카드사용내역`을 찾습니다. 테스트 문서로 확인할 때만 로컬 `.env`에 넣고 운영에는 두지 않습니다.

`SETTLEMENT_ACCOUNT_SEOEUN`, `SETTLEMENT_ACCOUNT_KISOON`(선택): 각 정산 금액 배지에서 토스로 보낼 받는 계좌. `은행이름 계좌번호` 형식이며 은행 이름은 토스 앱에 보이는 이름으로 적습니다. 저장소가 공개라서 계좌번호는 코드에 넣지 않고 Vercel 환경 변수에만 두며, 허용된 계정으로 로그인했을 때만 앱이 받아 갑니다. 비우면 확인 창에 "송금 계좌가 설정되지 않았어요"가 뜹니다.

### OAuth 앱 게시 상태

OAuth 동의 화면이 **테스트** 상태이면 Google이 refresh token을 7일 후 만료시켜 매주 다시 로그인해야 합니다. 로그인 제한은 `ALLOWED_EMAILS`가 담당하므로 앱을 **프로덕션**으로 게시해도 됩니다.

1. `ALLOWED_EMAILS`를 설정하고 배포 (게시 전에 먼저 해야 함)
2. Google Auth Platform → **Branding**: 홈페이지(`https://<도메인>`), 개인정보처리방침(`https://<도메인>/privacy.html`), Authorized domains(`<도메인>`) 입력. 앱 로고는 올리지 않음 (올리면 인증 심사 대상)
3. Google Auth Platform → **Audience** → **Publish app**
4. 모든 사용자가 로그아웃 후 다시 로그인 (테스트 상태에서 받은 토큰은 계속 7일 후 만료됨)

인증 심사를 받지 않은 앱이므로 로그인 시 "Google에서 확인하지 않은 앱" 경고가 나오며, **고급 → 이동**을 누르면 됩니다.

## 보안 주의사항

- `.env` 파일은 절대 Git에 커밋하지 마세요
- `AUTH_SECRET`은 충분히 복잡한 랜덤 문자열을 사용하세요
- 운영환경에서는 HTTPS를 사용하세요
