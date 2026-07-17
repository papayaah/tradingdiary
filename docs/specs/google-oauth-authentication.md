# Google OAuth Authentication

## Status

Draft

## Summary

Add Google sign-in to Trading Diary using Better Auth and PostgreSQL. Authentication establishes a stable user identity for private, user-owned journal data and future multi-device synchronization.

The current application has no working authentication. Its Docker configuration already reserves `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and PostgreSQL settings, so this specification adopts that intended stack.

Authentication and data synchronization are separate concerns. Signing in must not silently upload existing IndexedDB data.

## Goals

- Let a user sign in securely with Google.
- Maintain a server-side session using secure cookies.
- Protect private application pages and user-owned server resources.
- Provide a clear sign-out flow.
- Preserve local browser data during authentication changes.
- Establish a stable user ID for future journal and media synchronization.

## Non-goals

- Email/password authentication in the first release.
- Supporting additional OAuth providers in the first release.
- Automatically moving browser data to PostgreSQL.
- Public profiles or social features.
- Sharing journal entries with other users.
- Implementing complete journal synchronization as part of authentication.

## Current state

- No login or sign-up page exists.
- No authentication package is installed.
- No auth API route or session helper exists.
- No route-protection middleware/proxy exists.
- Journal, account, transaction, note, and media metadata primarily live in browser IndexedDB.
- Docker Compose includes PostgreSQL and placeholders for Better Auth and Google OAuth environment variables.

## User experience

### Sign-in page

```text
Trading Diary
Your private, AI-assisted trading journal.

┌──────────────────────────────────────────┐
│  G   Continue with Google                │
└──────────────────────────────────────────┘

Your journal is private and is not posted to Google.
By continuing, you agree to the Terms and Privacy Policy.
```

### First sign-in

1. The user selects **Continue with Google**.
2. The app redirects to Google's OAuth consent flow.
3. Google redirects to the application's auth callback.
4. Better Auth creates or locates the user and creates a session.
5. The user is redirected to the originally requested page, or `/dashboard` by default.
6. If local diary data exists, the app leaves it unchanged and may show a separate, dismissible sync prompt when synchronization is available.

### Signed-in application

The sidebar or account menu displays:

- Google profile image when available.
- Display name and email.
- **Account settings**.
- **Sign out**.

### Sign-out

1. The user selects **Sign out**.
2. The server session is invalidated.
3. The user returns to `/login`.
4. Local IndexedDB data is not deleted.

## Route behavior

Public routes:

- `/login`
- Auth API and OAuth callback routes
- Terms and privacy pages
- Static assets

Authenticated routes:

- `/dashboard`
- `/journal`
- `/portfolio`
- `/replay`
- `/import`
- `/media`
- `/settings`
- User-owned server API routes

When an unauthenticated user requests a protected page, redirect to `/login` and preserve a validated relative return URL. An authenticated user visiting `/login` should be redirected to `/dashboard`.

## Proposed technical design

### Authentication library

Use Better Auth with its Google social provider and PostgreSQL persistence.

Proposed server modules:

```text
lib/auth.ts                         Better Auth server configuration
lib/auth-client.ts                  Browser auth client
app/api/auth/[...all]/route.ts      Better Auth route handler
app/(auth)/login/page.tsx           Sign-in page
proxy.ts                            Protected-route checks for Next.js 16
```

Use the installed Better Auth version's official Next.js integration when implementing; exact APIs should not be copied from an outdated example.

### Environment variables

```text
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Requirements:

- Secrets are server-only and never exposed through `NEXT_PUBLIC_*` variables.
- Production secrets must be generated independently from development values.
- The application must fail clearly at startup when required production auth configuration is absent.
- OAuth redirect URIs must be configured separately for local, staging, and production environments.

### Google configuration

Configure the Google Cloud OAuth consent screen and web application client with authorized origins and redirect URIs for each environment.

Only request the minimum identity scopes required for sign-in:

- `openid`
- `email`
- `profile`

Do not request Gmail, Drive, Calendar, contacts, or trading-related permissions.

### Database ownership

Better Auth owns its required user, account, session, and verification tables. Application server records introduced later must use the stable Better Auth user ID as their owner key.

Every user-owned server query must derive the user ID from the validated server session. A client-supplied `userId` must never determine authorization.

## Local data and account boundaries

The current diary is stored locally in IndexedDB. Authentication must follow these rules:

- Signing in does not erase local data.
- Signing out does not erase local data.
- Signing in does not automatically upload local data.
- A future sync/import flow must show what will be uploaded and require confirmation.
- Data associated locally with one signed-in user must not be shown automatically to a different user on the same browser.

Until full synchronization is implemented, the app must choose and clearly communicate one of these behaviors:

1. **Device-local diary:** authentication protects access, while diary data remains on that browser.
2. **Explicit local profiles:** locally stored records are partitioned by authenticated user ID.

For a shared-device-safe production release, local records should be partitioned by authenticated user ID before authentication becomes mandatory.

## Privacy and security requirements

- Use secure, HTTP-only, same-site session cookies in production.
- Validate OAuth state and callback handling through the auth library.
- Regenerate or rotate sessions as recommended by Better Auth.
- Never log OAuth tokens, authorization codes, session cookies, or client secrets.
- Protect state-changing routes against cross-site request forgery.
- Apply rate limiting to auth-related endpoints where appropriate.
- Validate return URLs to prevent open redirects.
- Apply authorization checks inside API handlers, not only at page routing boundaries.
- Display a privacy policy explaining what Google profile information is stored.
- Provide an account-deletion path before production launch.

## Account deletion

Account deletion requires a separate confirmation step and must eventually remove:

- Auth account and sessions.
- Server-synchronized journal records.
- Server-stored screenshots and media.
- Other user-owned server data.

Local device data must be handled explicitly: offer the user a separate choice to retain or erase it. This operation must not be implied by ordinary sign-out.

## Error states

- OAuth cancelled: return to login with a calm, retryable message.
- Provider error: show **Google sign-in is temporarily unavailable** and allow retry.
- Email unavailable: reject sign-in with an actionable explanation.
- Database unavailable: fail without creating a partial authenticated state.
- Invalid or expired session: clear local session state and redirect to login.
- Existing local data: preserve it and explain its device-local status.

## Acceptance criteria

- A user can select **Continue with Google** and complete the OAuth flow.
- A successful callback creates or reuses one user and creates a valid session.
- Repeated sign-in with the same Google account does not create duplicate users.
- An unauthenticated request to a protected route redirects to `/login`.
- The original relative destination is restored after successful login.
- Authenticated users can access protected routes and view their account identity.
- Signing out invalidates the server session and redirects to `/login`.
- Refreshing the page preserves a valid session.
- Server APIs reject unauthenticated access to user-owned resources.
- No OAuth token, secret, or session cookie is exposed to client JavaScript or logs.
- Existing IndexedDB diary data survives sign-in and sign-out.
- One user's local data is not automatically exposed to a different signed-in user on the same browser.
- Tests cover protected-route redirects, callback failure, sign-out, and authorization boundaries.

## Suggested implementation sequence

1. Install Better Auth and the required PostgreSQL adapter/driver.
2. Add auth configuration, schema migration, and environment validation.
3. Configure the Google OAuth application for development.
4. Add the auth route, browser client, and login page.
5. Add server-side session helpers and protected-route behavior.
6. Add the signed-in account menu and sign-out.
7. Partition local IndexedDB data by authenticated user or explicitly retain device-local mode.
8. Protect all user-owned server endpoints and media routes.
9. Add integration tests, security checks, privacy copy, and production OAuth configuration.

## Open product decisions

- Whether browsing the app without signing in remains supported.
- Whether authentication is required immediately or only when enabling cloud sync.
- Whether existing local data belongs to the first user who signs in or requires an explicit import action.
- Whether multiple Google accounts may be switched on the same device.
- When cloud synchronization and account deletion will be specified and implemented.
