import { SvelteKitAuth } from "@auth/sveltekit"
import Google from "@auth/sveltekit/providers/google"
import { env } from '$env/dynamic/private'

// ALLOWED_EMAILS(쉼표 구분)에 등록된 계정만 사용 가능. 비어 있으면 모두 거부한다.
function isAllowedEmail(email: string | null | undefined) {
  if (!email) return false;
  const allowedEmails = (env.ALLOWED_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowedEmails.includes(email.toLowerCase());
}

async function refreshAccessToken(token: any) {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.VITE_GOOGLE_CLIENT_ID,
        client_secret: env.VITE_GOOGLE_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const newTokens = await response.json();

    if (!response.ok) {
      // refresh token이 만료/철회됨: 세션을 지워 다시 로그인하도록 한다
      if (newTokens.error === "invalid_grant") {
        console.error("Refresh token expired or revoked", newTokens);
        return null;
      }
      throw newTokens;
    }

    return {
      ...token,
      accessToken: newTokens.access_token,
      expiresAt: Date.now() + newTokens.expires_in * 1000,
      refreshToken: newTokens.refresh_token ?? token.refreshToken, // Fall back to old refresh token
      error: undefined,
    };
  } catch (error) {
    console.error("Error refreshing access token", error);
    return {
      ...token,
      error: "RefreshAccessTokenError",
    };
  }
}

export const { handle } = SvelteKitAuth({
  providers: [
    Google({
      clientId: env.VITE_GOOGLE_CLIENT_ID,
      clientSecret: env.VITE_GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/spreadsheets',
          access_type: "offline",
          prompt: "consent",
        }
      }
    }),
  ],
  secret: env.AUTH_SECRET,
  trustHost: env.AUTH_TRUST_HOST === 'true',
  callbacks: {
    async signIn({ profile }) {
      return profile?.email_verified === true && isAllowedEmail(profile.email);
    },
    async jwt({ token, account }) {
      // 허용 목록에서 빠진 계정의 기존 세션도 끊는다
      if (!isAllowedEmail(token.email)) {
        return null;
      }

      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.expiresAt = (account.expires_at ?? 0) * 1000;
        return token;
      }

      if (Date.now() < (token.expiresAt as number)) {
        return token;
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string;
      session.error = token.error as string;
      return session;
    },
  },
})