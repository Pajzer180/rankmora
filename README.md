This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Backend Security Notes

Protected routes:
- `/api/chat`
- `/api/generate`
- `/api/history`
- `/api/wordpress/connect`
- `/api/wordpress/test`
- `/api/wordpress/fetch`
- `/api/wordpress/preview`
- `/api/wordpress/apply`
- `/api/wordpress/disconnect`

Shared helpers used by protected routes:
- `requireAuthenticatedUid()` for bearer-token auth checks
- `toRouteErrorResponse()` and `jsonErrorResponse()` for consistent JSON failures
- `enforceRateLimit()` for per-route throttling
- `normalizeRemoteHttpUrl()`, `assertSafeRemoteUrl()`, `safeRemoteFetch()`, and `readResponseTextWithinLimit()` for remote URL hardening

Env vars used by this backend:
- `NEXT_PUBLIC_FIREBASE_API_KEY` for the frontend Firebase web SDK config
- `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, and `FIREBASE_ADMIN_PRIVATE_KEY` for the new server-only Firebase Admin layer in `src/lib/server/firebaseAdmin.ts`
- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` for model-backed routes
- `WORDPRESS_CREDENTIALS_SECRET` for encrypting stored WordPress credentials
- `RATE_LIMIT_*` variables from `.env.example` to override per-route limits and windows

Firebase Admin layer:
- The Admin module is server-only, initializes lazily, and reuses the existing default Admin app when it already exists.
- Credentials are read from env vars instead of a checked-in service-account JSON file.
- Server-side bearer-token verification now uses `getFirebaseAdminAuth().verifyIdToken(...)`; some server Firestore reads still use the client SDK and can migrate later.

Rate limiting behavior:
- Rate limiting is in-memory and per application instance.
- Current protected rate-limited routes are chat, generate, and WordPress connect/test/fetch/preview/apply.
- Rate limit responses use HTTP `429` with `details.code = "RATE_LIMITED"` and a `Retry-After` header.
- Misconfigured rate-limit env vars fail closed with HTTP `503` and `details.code = "RATE_LIMIT_UNAVAILABLE"`.

SSRF protections:
- Only `http` and `https` URLs are allowed for server-side remote fetches.
- User-controlled chat URLs and WordPress site URLs are validated before any network request.
- Localhost, loopback, private, link-local, and obvious internal hostnames are blocked.
- DNS resolution is checked before each request and before each redirect hop.
- Redirects are capped at 3 hops.
- Cross-origin redirects that would carry `authorization`, `proxy-authorization`, or `cookie` headers are blocked.
- Remote fetches are bounded by per-call timeout and response-size caps.

Manual test plan:
- Verify authenticated protected routes return `401` with `details.code = "AUTH_UNAUTHORIZED"` when the bearer token is missing or invalid.
- Verify chat and WordPress rate-limited routes return `429` with `details.code = "RATE_LIMITED"` and `Retry-After`.
- Verify `/api/chat` blocks `http://localhost`, `http://127.0.0.1`, `http://10.0.0.1`, and `http://169.254.169.254`.
- Verify WordPress connect/test/fetch/preview/apply block private or internal site URLs with the shared blocked-or-invalid JSON response.
- Verify a public redirect to a blocked destination is denied.
- Verify a same-origin redirect with `Authorization` still works.
- Verify a cross-origin redirect with `Authorization` fails with `details.code = "REMOTE_URL_REDIRECT_BLOCKED"`.
- Verify oversized or slow remote responses fail safely.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app) from the creators of Next.js.

Check out [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
