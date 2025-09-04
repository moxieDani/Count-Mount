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

### 2. 환경 변수 설정

1. `.env` 파일을 생성하고 다음 값들을 설정:

```bash
# Google OAuth Configuration
GOOGLE_CLIENT_ID=your_actual_google_client_id
GOOGLE_CLIENT_SECRET=your_actual_google_client_secret

# Auth.js Secret - 랜덤한 문자열 생성 필요
AUTH_SECRET=your_random_secret_string_here

# Trusted Host
AUTH_TRUST_HOST=true
```

### 3. AUTH_SECRET 생성 방법

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
- ✅ 반응형 디자인

## 기술 스택

- **Frontend**: SvelteKit, TypeScript
- **Authentication**: Auth.js (formerly NextAuth.js)
- **OAuth Provider**: Google
- **Build Tool**: Vite

## 배포

배포 시 환경 변수를 설정하고 Authorized redirect URIs에 실제 도메인을 추가해야 합니다.

## 보안 주의사항

- `.env` 파일은 절대 Git에 커밋하지 마세요
- `AUTH_SECRET`은 충분히 복잡한 랜덤 문자열을 사용하세요
- 운영환경에서는 HTTPS를 사용하세요
