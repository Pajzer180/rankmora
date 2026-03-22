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
- `/api/gsc/connect`
- `/api/gsc/sites`
- `/api/gsc/select-site`
- `/api/search-console/connect`
- `/api/search-console/select-property`

Google callback routes:
- `/api/gsc/callback`
- `/api/search-console/callback`

Internal routes:
- `/api/cron/gsc-sync` secured by `CRON_SECRET`

Shared helpers used by protected routes:
- `requireAuthenticatedUid()` for bearer-token auth checks
- `toRouteErrorResponse()` and `jsonErrorResponse()` for consistent JSON failures
- `enforceRateLimit()` for per-route throttling
- `normalizeRemoteHttpUrl()`, `assertSafeRemoteUrl()`, `safeRemoteFetch()`, and `readResponseTextWithinLimit()` for remote URL hardening

Env vars used by this backend:
- `NEXT_PUBLIC_FIREBASE_API_KEY` for the frontend Firebase web SDK config
- `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, and `FIREBASE_ADMIN_PRIVATE_KEY` for the server-only Firebase Admin layer in `src/lib/server/firebaseAdmin.ts`
- `GOOGLE_SEARCH_CONSOLE_CLIENT_ID`, `GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET`, and `GOOGLE_SEARCH_CONSOLE_REDIRECT_URI` for the Google Search Console OAuth flow
- `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` for model-backed routes
- `WORDPRESS_CREDENTIALS_SECRET` for encrypting stored WordPress credentials
- `GSC_TOKENS_SECRET` for encrypting stored Google Search Console refresh tokens
- `CRON_SECRET` for authorizing internal cron routes like `/api/cron/gsc-sync`
- `RATE_LIMIT_*` variables from `.env.example` to override per-route limits and windows

Firebase Admin layer:
- The Admin module is server-only, initializes lazily, and reuses the existing default Admin app when it already exists.
- Credentials are read from env vars instead of a checked-in service-account JSON file.
- Server-side bearer-token verification uses `getFirebaseAdminAuth().verifyIdToken(...)`.

Search Console OAuth flow:
- `/api/gsc/connect` starts the Google OAuth flow for an authenticated project owner and returns a Google authorization URL.
- `/api/gsc/callback` validates the server-stored OAuth state, exchanges the code, stores the encrypted refresh token server-side, refreshes the project Search Console summary, and redirects back to onboarding or analytics.
- `/api/gsc/sites` lists the currently available Search Console properties for the connected account using a refreshed access token.
- `/api/gsc/select-site` lets the project owner choose which connected Search Console property is mapped to the project.
- Legacy `/api/search-console/*` routes remain as compatibility wrappers around the same backend service.
- The flow requests the minimal Search Console read scope: `https://www.googleapis.com/auth/webmasters.readonly`.

Search Console storage:
- Encrypted refresh tokens live in the server-only `search_console_connections` collection and use `GSC_TOKENS_SECRET`.
- Short-lived OAuth state records live in `search_console_oauth_states` and are consumed on callback.
- Non-sensitive Search Console summary data is mirrored onto `projects.{searchConsole}` for UI reads.
- Daily cache documents are stored in `search_console_daily` with deterministic ids shaped like `{projectId}_{YYYY-MM-DD}`.
- Page rollup cache documents are stored in `search_console_pages_28d` with deterministic ids shaped like `{projectId}_{pageHash}`.
- Sync observability documents are stored in `search_console_sync_runs`.
- Refresh tokens never reach the client.

Search Console ingest:
- `/api/cron/gsc-sync` iterates over connected Search Console connections, filters to projects with a selected property on the project record, refreshes access tokens, and syncs cached Search Analytics data.
- Daily summary ingest writes one document per day for the recent 28-day window with clicks, impressions, ctr, position, and `syncedAt`.
- Page rollup ingest writes top page rows for the same recent 28-day window and removes stale page cache docs for the project so repeated syncs stay clean.
- Sync writes overwrite deterministic cache docs instead of duplicating raw Google responses.
- The cron route expects `Authorization: Bearer <CRON_SECRET>` and also accepts `x-cron-secret` for manual testing.

Rate limiting behavior:
- Rate limiting is in-memory and per application instance.
- Current protected rate-limited routes are chat, generate, WordPress connect/test/fetch/preview/apply, and GSC connect/callback/sites/select-site.
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
- Verify `/api/gsc/connect` returns a Google authorization URL only for an authenticated owner of the requested project.
- Verify the Google callback redirects back to `/dashboard/analityka?gsc=connected` or `/onboarding?gsc=connected` after consent.
- Verify invalid or expired callback state returns structured `400` JSON.
- Verify the callback writes only the non-sensitive Search Console summary to the project and does not expose refresh tokens to the client.
- Verify `/api/gsc/sites` returns the connected account properties and refreshes the project summary.
- Verify property selection persists to the project and rejects properties that are not in the connected Google account list.
- Verify `/api/cron/gsc-sync` rejects missing or invalid `CRON_SECRET`.
- Verify `/api/cron/gsc-sync` writes `search_console_daily` documents for the recent 28-day window.
- Verify `/api/cron/gsc-sync` writes `search_console_pages_28d` documents and removes stale page cache docs for the same project.
- Verify `search_console_sync_runs` captures both successful and failed project syncs.
- Verify no plaintext refresh token appears in any cache collection.
- Verify repeated syncs overwrite the same cache docs instead of creating duplicate garbage.
- Verify chat, WordPress, and GSC rate-limited routes return `429` with `details.code = "RATE_LIMITED"` and `Retry-After`.
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

This repo includes a `vercel.json` cron entry for `/api/cron/gsc-sync` scheduled daily.

Check out [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.